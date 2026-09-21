import { describe, expect, it } from 'vitest'
import { buildSnapshot, defaultPolicy, type SnapshotInput } from './snapshot'
import { alertsFromSnapshot, reconcileAlerts, type AlertCandidate } from './watchdog'

const now = new Date('2026-04-12T12:00:00')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const readings = (vals: number[]) => vals.map((value, i) => ({ at: hoursAgo(vals.length - i), value }))
const forecast = (mins: number[]) => mins.map((tMin, i) => ({ date: `2026-04-${12 + i}`, tMax: 18, tMin, rain: 0 }))

const base: SnapshotInput = {
  date: '2026-04-12',
  now,
  latDeg: 38.24,
  block: { id: 'B1', variety: 'Vairo', fieldCapacityPct: 30, wiltingPointPct: 12, rootDepthM: 1.0, areaHa: 2, hasSensor: true },
  dbStage: 'bloom',
  stageSource: 'computed',
  moistureReadings: readings([25.2, 25.1, 25.0, 24.9, 24.8]),
  forecast: forecast([5, 5, 5]),
  forecastFetchedAt: hoursAgo(2),
  policy: defaultPolicy(),
}

const alerts = (over: Partial<SnapshotInput> = {}, hasSensor = true) =>
  alertsFromSnapshot(buildSnapshot({ ...base, ...over }), hasSensor)

describe('alertsFromSnapshot: frost', () => {
  it('raises nothing on a calm forecast', () => {
    expect(alerts()).toEqual([])
  })

  it('raises a critical frost alert with the day, range and threshold', () => {
    const [a] = alerts({ forecast: forecast([5, -4, 5]) })
    expect(a).toMatchObject({ ruleId: 'frost', dedupKey: 'frost:2026-04-13', domain: 'weather', severity: 'critical' })
    expect(a.message).toContain('2026-04-13')
    expect(a.message).toContain('-4')
    expect(a.message).toContain('measured for Vairo')
    expect(a.details).toMatchObject({ lt10: -3.46, basis: 'variety_tested', variety: 'Vairo' })
  })

  it('says when a frost hits a block that is not bearing yet', () => {
    const [a] = alerts({ forecast: forecast([-4]), block: { ...base.block, plantingYear: 2025 }, now: new Date('2026-04-12T12:00:00') })
    expect(a.message).toMatch(/not bearing yet/)
    expect(a.message).toMatch(/little or no crop is at risk/)
    expect(a.details).toMatchObject({ maturity: 'non_bearing' })
    const [m] = alerts({ forecast: forecast([-4]), block: { ...base.block, plantingYear: 2010 } })
    expect(m.message).not.toMatch(/not bearing/)
  })

  it('says when the threshold was not measured for the variety', () => {
    const [a] = alerts({ forecast: forecast([-4]), block: { ...base.block, variety: 'Makako' } })
    expect(a.message).toContain('not measured for this variety')
  })

  it('does not alert on a watch-level forecast, to avoid alert fatigue', () => {
    expect(alerts({ forecast: forecast([0.5, 1]) })).toEqual([])
  })

  it('gives the same dedup key on a rerun so one event is one alert', () => {
    const a = alerts({ forecast: forecast([5, -4, 5]) })[0]
    const b = alerts({ forecast: forecast([5, -4, 5]) })[0]
    expect(a.dedupKey).toBe(b.dedupKey)
  })
})

describe('alertsFromSnapshot: forecast outage', () => {
  it('warns when there is no forecast while the trees are frost-sensitive', () => {
    const [a] = alerts({ forecast: [], forecastFetchedAt: null })
    expect(a).toMatchObject({ ruleId: 'forecast_stale', severity: 'warning', domain: 'weather' })
    expect(a.message).toMatch(/cannot be assessed/)
  })

  it('warns when the forecast is too old, and says how old', () => {
    const [a] = alerts({ forecastFetchedAt: hoursAgo(30) })
    expect(a.ruleId).toBe('forecast_stale')
    expect(a.message).toContain('30 hours old')
  })

  it('stays quiet when frost does not matter at this stage', () => {
    expect(alerts({ dbStage: 'hull-split', forecast: [], forecastFetchedAt: null })).toEqual([])
  })

  it('stays quiet with a fresh forecast', () => {
    expect(alerts({ forecastFetchedAt: hoursAgo(3) })).toEqual([])
  })
})

describe('alertsFromSnapshot: sensor and irrigation', () => {
  it('alerts on a failed sensor only for blocks that have one', () => {
    const old = [{ at: hoursAgo(60), value: 25 }]
    const withSensor = alerts({ moistureReadings: old }, true)
    expect(withSensor.map(a => a.ruleId)).toEqual(['sensor_failed'])
    expect(alerts({ moistureReadings: [], block: { ...base.block, hasSensor: false } }, false)).toEqual([])
  })

  it('advises irrigation once the allowable depletion is reached', () => {
    // depletion 10*(30-20)*1 = 100 mm > RAW 72 mm
    const irr = alerts({ moistureReadings: readings([20.2, 20.1, 20]) }).find(a => a.ruleId === 'irrigate_now')
    expect(irr).toBeDefined()
    expect(irr!.severity).toBe('warning')
    expect(irr!.message).toContain('Consider irrigating')
    expect(irr!.message).not.toMatch(/must|start irrigation/i)
  })

  it('does not alert on irrigate_soon or data_required', () => {
    expect(alerts({ block: { ...base.block, rootDepthM: null } })).toEqual([])
  })
})

describe('reconcileAlerts', () => {
  const cand = (ruleId: AlertCandidate['ruleId'], dedupKey: string): AlertCandidate => ({
    ruleId, dedupKey, domain: 'weather', severity: 'warning', message: 'm', details: {},
  })

  it('creates only events that are not already open', () => {
    const r = reconcileAlerts(
      [cand('frost', 'frost:2026-04-13'), cand('irrigate_now', 'irrigate_now')],
      [{ id: 'a1', ruleId: 'irrigate_now', dedupKey: 'irrigate_now' }],
    )
    expect(r.create.map(c => c.dedupKey)).toEqual(['frost:2026-04-13'])
    expect(r.resolve).toEqual([])
  })

  it('resolves watchdog alerts whose condition has cleared', () => {
    const r = reconcileAlerts([], [{ id: 'a1', ruleId: 'frost', dedupKey: 'frost:2026-04-13' }])
    expect(r.resolve).toEqual(['a1'])
  })

  it('never resolves alerts from other sources', () => {
    const r = reconcileAlerts([], [
      { id: 'sensor-pushed', ruleId: null, dedupKey: null },
      { id: 'other-rule', ruleId: 'something_else', dedupKey: 'x' },
    ])
    expect(r.resolve).toEqual([])
  })

  it('moves a frost alert to the new date by resolving the old and creating the new', () => {
    const r = reconcileAlerts([cand('frost', 'frost:2026-04-14')], [{ id: 'old', ruleId: 'frost', dedupKey: 'frost:2026-04-13' }])
    expect(r.create).toHaveLength(1)
    expect(r.resolve).toEqual(['old'])
  })
})
