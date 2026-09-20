import { describe, expect, it } from 'vitest'
import { buildSnapshot, defaultPolicy, type SnapshotInput } from './snapshot'

const now = new Date('2026-04-12T12:00:00')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const readings = (vals: number[]) => vals.map((value, i) => ({ at: hoursAgo(vals.length - i), value }))
const forecast = (mins: number[]) =>
  mins.map((tMin, i) => ({ date: `2026-04-${12 + i}`, tMax: 18, tMin, rain: 0 }))

const base: SnapshotInput = {
  date: '2026-04-12',
  now,
  latDeg: 38.24,
  block: { id: 'B1', variety: 'Vairo', fieldCapacityPct: 30, wiltingPointPct: 12, rootDepthM: 1.0, areaHa: 2, hasSensor: true },
  dbStage: 'bloom',
  stageSource: 'computed',
  moistureReadings: readings([25.2, 25.1, 25.0, 24.9, 24.8]),
  forecast: forecast([4, 5, 6, 5, 4, 5, 6]),
  forecastFetchedAt: hoursAgo(2),
  policy: defaultPolicy(),
}

describe('buildSnapshot', () => {
  it('carries unit, source, time and state on every value', () => {
    const s = buildSnapshot(base)
    expect(s.water.moisture).toMatchObject({ value: 24.8, unit: '% VWC', source: 'sensor', state: 'KNOWN' })
    expect(s.water.etoToday).toMatchObject({ unit: 'mm/day', source: 'computed', state: 'ESTIMATED' })
    expect(s.water.etoToday.value).toBeGreaterThan(2)
    expect(s.water.etoToday.value).toBeLessThan(6)
  })

  it('marks a computed stage ESTIMATED and a person-confirmed stage KNOWN', () => {
    expect(buildSnapshot(base).phenology.stage.state).toBe('ESTIMATED')
    expect(buildSnapshot({ ...base, stageSource: 'manual' }).phenology.stage.state).toBe('KNOWN')
    expect(buildSnapshot({ ...base, dbStage: null }).phenology.stage.state).toBe('UNKNOWN')
  })

  it('runs the irrigation engine on the usable moisture reading', () => {
    // TAW 180, RAW 72, depletion 10*(30-24.8)*1 = 52 mm
    const irr = buildSnapshot(base).water.irrigation
    expect(irr.depletionMm).toBe(52)
    expect(irr.status).not.toBe('data_required')
  })

  it('asks for data when the rooting depth is missing everywhere', () => {
    const s = buildSnapshot({ ...base, block: { ...base.block, rootDepthM: null } })
    expect(s.water.irrigation.status).toBe('data_required')
  })

  it('falls back to the farm default rooting depth', () => {
    const s = buildSnapshot({
      ...base,
      block: { ...base.block, rootDepthM: null },
      policy: { ...base.policy, defaultRootDepthM: 1.0 },
    })
    expect(s.water.irrigation.tawMm).toBe(180)
  })

  it('excludes a failed sensor from the calculation and reports why', () => {
    const old = [{ at: hoursAgo(60), value: 25 }, { at: hoursAgo(59), value: 25.1 }]
    const s = buildSnapshot({ ...base, moistureReadings: old })
    expect(s.water.sensor).toMatchObject({ health: 'failed', excluded: true })
    expect(s.water.moisture.state).toBe('UNKNOWN')
    expect(s.water.irrigation.status).toBe('data_required')
  })

  it('excludes a stuck sensor but keeps a sensor with an isolated jump', () => {
    const stuck = buildSnapshot({ ...base, moistureReadings: readings(Array(14).fill(24.3)) })
    expect(stuck.water.sensor.excluded).toBe(true)
    expect(stuck.water.moisture.value).toBeNull()

    // irrigation raises moisture fast: suspect, but still used
    const jump = buildSnapshot({ ...base, moistureReadings: readings([20, 20.4, 44, 44.5]) })
    expect(jump.water.sensor).toMatchObject({ health: 'suspect', excluded: false })
    expect(jump.water.moisture.value).toBe(44.5)
  })

  it('reports no sensor at all when the block has none', () => {
    const s = buildSnapshot({ ...base, moistureReadings: [], block: { ...base.block, hasSensor: false } })
    expect(s.water.sensor.health).toBe('none')
    expect(s.water.moisture.state).toBe('UNKNOWN')
  })

  it('assesses frost for Vairo at bloom using the measured threshold', () => {
    const s = buildSnapshot({ ...base, forecast: forecast([-2, 3, 4]) })
    expect(s.weather.frost.applicable).toBe(true)
    expect(s.weather.frost.threshold?.basis).toBe('variety_tested')
  })

  it('applies the farm frost margin: the same -2 °C forecast is a warning at 2 °C, a watch at 1 °C', () => {
    // Vairo LT10 is -3.46 °C. Warning when forecast <= LT10 + margin, watch when <= LT10 + 2 x margin.
    const wide = buildSnapshot({ ...base, forecast: forecast([-2]), policy: { ...base.policy, frostMarginC: 2 } })
    const narrow = buildSnapshot({ ...base, forecast: forecast([-2]), policy: { ...base.policy, frostMarginC: 1 } })
    expect(wide.weather.frost.level).toBe('warning')
    expect(narrow.weather.frost.level).toBe('watch')
    expect(narrow.weather.frost.marginC).toBe(1)
  })

  it('does not assess frost outside the frost-sensitive stages and explains bud stages', () => {
    expect(buildSnapshot({ ...base, dbStage: 'hull-split' }).weather.frost.applicable).toBe(false)
    const bud = buildSnapshot({ ...base, dbStage: 'bud-break' })
    expect(bud.weather.frost.applicable).toBe(false)
    expect(bud.phenology.notes[0]).toMatch(/not assessed/)
  })

  it('records the forecast age', () => {
    expect(buildSnapshot(base).weather.forecastAgeHours).toBe(2)
    expect(buildSnapshot({ ...base, forecastFetchedAt: null }).weather.forecastAgeHours).toBeNull()
  })

  it('ignores forecast days before the snapshot date', () => {
    const s = buildSnapshot({ ...base, forecast: [{ date: '2026-04-10', tMax: 30, tMin: -8, rain: 0 }, ...forecast([5])] })
    expect(s.weather.forecastDays).toBe(1)
    expect(s.weather.frost.level).toBe('none')
  })
})
