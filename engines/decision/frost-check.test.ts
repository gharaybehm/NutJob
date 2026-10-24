import { describe, expect, it } from 'vitest'
import { demoContext } from './__fixtures__/demo-pack'
import { frostAlertChanges, levelsByNight, runFrostCheck, withStationReading } from './frost-check'
import type { FrostNight } from './frost'

const TODAY = '2026-03-20'
const pack = demoContext()
// The demo pack: open flowers are damaged at -2 degC. Warning within 2 degC of it, watch within 4.
const stored = { phase: 'flowering', variety: 'soft', frost_warning_margin_c: 2, frost_watch_margin_c: 4, flags: [] }
const nights = (...mins: number[]): FrostNight[] => mins.map((minC, i) => ({ date: `2026-03-${20 + i}`, dayIndex: i, minC }))

describe('withStationReading', () => {
  const reading = (tempC: number, localDate = TODAY) => ({ tempC, at: `${localDate}T03:00:00Z`, localDate })

  it('lowers today to a colder station reading and keeps the forecast beside it', () => {
    const [tonight, tomorrow] = withStationReading(nights(3, 5), TODAY, reading(-1))
    expect(tonight).toMatchObject({ minC: -1, forecastMinC: 3, station: { tempC: -1 } })
    expect(tomorrow.minC).toBe(5)
  })

  it('ignores a reading warmer than the forecast, or from another day', () => {
    expect(withStationReading(nights(3, 5), TODAY, reading(6))).toEqual(nights(3, 5))
    expect(withStationReading(nights(3, 5), TODAY, reading(-4, '2026-03-19'))).toEqual(nights(3, 5))
  })

  it('adds today when the forecast has no hours left for it', () => {
    const out = withStationReading(nights(5).map(n => ({ ...n, date: '2026-03-21', dayIndex: 1 })), TODAY, reading(0))
    expect(out[0]).toMatchObject({ date: TODAY, dayIndex: 0, minC: 0 })
  })
})

describe('runFrostCheck', () => {
  it('says why when frost is not assessed in the phase', () => {
    const r = runFrostCheck('b1', { ...stored, phase: 'growing' }, nights(-5), pack)
    expect(r.inactiveReason).toMatch(/not assessed in the growing phase/)
    expect(r.actions).toEqual([])
  })

  it('raises the level when the station shows the night is colder than forecast', () => {
    expect(runFrostCheck('b1', stored, nights(5, 6), pack).level).toBe('none')
    const r = runFrostCheck('b1', stored, withStationReading(nights(5, 6), TODAY, { tempC: -3, at: `${TODAY}T02:00:00Z`, localDate: TODAY }), pack)
    expect(r.level).toBe('critical')
    const protect = r.actions.find(a => a.actionType === 'frost_protect')
    expect(protect?.inputsSnapshot).toMatchObject({ forecast_min_c: 5, station_c: -3 })
    expect(protect?.description).toMatch(/Station reading -3 degC/)
  })
})

describe('frostAlertChanges', () => {
  const actionsFor = (...mins: number[]) => runFrostCheck('b1', stored, nights(...mins), pack).actions

  it('alerts at warning and critical only, one per night', () => {
    const { create, resolve } = frostAlertChanges(actionsFor(3, -1, -3), [], TODAY)
    expect(create.map(a => [a.night, a.severity])).toEqual([
      ['2026-03-21', 'warning'],
      ['2026-03-22', 'critical'],
    ])
    expect(resolve).toEqual([])
  })

  it('opens a new alert when a night gets worse and closes the old one', () => {
    const open = [{ id: 'a1', dedupKey: 'engine_frost:2026-03-21:warning' }]
    const { create, resolve } = frostAlertChanges(actionsFor(5, -3), open, TODAY)
    expect(create.map(a => a.dedupKey)).toEqual(['engine_frost:2026-03-21:critical'])
    expect(resolve).toEqual(['a1'])
  })

  it('leaves an unchanged alert alone and closes one for a night no longer at risk', () => {
    const open = [
      { id: 'a1', dedupKey: 'engine_frost:2026-03-21:warning' },
      { id: 'a2', dedupKey: 'engine_frost:2026-03-22:critical' },
    ]
    const { create, resolve } = frostAlertChanges(actionsFor(5, -1, 6), open, TODAY)
    expect(create).toEqual([])
    expect(resolve).toEqual(['a2'])
  })

  it('reads the worst level of each night', () => {
    const levels = levelsByNight(actionsFor(1, -3))
    expect(levels.get('2026-03-20')?.level).toBe('watch')
    expect(levels.get('2026-03-21')?.level).toBe('critical')
  })
})
