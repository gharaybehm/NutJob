import { describe, expect, it } from 'vitest'
import { calibrationStates, canPromote, overridesFor, scopeKey, type CalibrationEvent } from './calibration'

let n = 0
const at = () => `2026-0${Math.floor(n / 10) + 1}-${String((n % 10) + 10)}T00:00:00Z`
const ev = (over: Partial<CalibrationEvent>): CalibrationEvent => {
  n++
  return { id: `e${n}`, kind: 'proposed', packId: 'p', paramId: 'k', blockId: null, varietyId: null, value: null, calibrationId: null, method: null, backtest: null, at: at(), ...over }
}
const backtest = { metric: 'm', champion: 4, challenger: 3, n: 12 }

describe('calibrationStates', () => {
  it('puts a promoted value in force and keeps a challenger waiting', () => {
    n = 0
    const a = ev({ value: 1.1, backtest })
    const events = [a, ev({ kind: 'promoted', calibrationId: a.id }), ev({ value: 1.2, backtest })]
    const s = calibrationStates(events).get(scopeKey(a))!
    expect(s.inForce?.value).toBe(1.1)
    expect(s.history.map(c => [c.value, c.status])).toEqual([
      [1.2, 'challenger'],
      [1.1, 'in_force'],
    ])
  })

  it('rolls back in one step to the value promoted before, then to the pack value', () => {
    n = 0
    const a = ev({ value: 1.1 })
    const b = ev({ value: 1.3 })
    const events = [a, ev({ kind: 'promoted', calibrationId: a.id }), b, ev({ kind: 'promoted', calibrationId: b.id })]
    expect(calibrationStates(events).get(scopeKey(a))!.inForce?.value).toBe(1.3)
    const once = [...events, ev({ kind: 'rolled_back', calibrationId: b.id })]
    expect(calibrationStates(once).get(scopeKey(a))!.inForce?.value).toBe(1.1)
    const twice = [...once, ev({ kind: 'rolled_back', calibrationId: a.id })]
    const s = calibrationStates(twice).get(scopeKey(a))!
    expect(s.inForce).toBeNull()
    expect(s.history.map(c => c.status)).toEqual(['rolled_back', 'rolled_back'])
  })

  it('ignores a decision on something already decided, and reads events in any order', () => {
    n = 0
    const a = ev({ value: 1.1 })
    const events = [ev({ kind: 'rejected', calibrationId: a.id }), a, ev({ kind: 'promoted', calibrationId: a.id })]
    // The rejection comes first in time, so the later promotion of a rejected value does nothing.
    const reordered = [events[2], a, events[0]].map((e, i) => ({ ...e, at: ['2026-01-03', '2026-01-01', '2026-01-02'][i] + 'T00:00:00Z' }))
    const s = calibrationStates(reordered).get(scopeKey(a))!
    expect(s.inForce).toBeNull()
    expect(s.history[0].status).toBe('rejected')
  })
})

describe('overridesFor', () => {
  it('takes the block before the variety before the farm', () => {
    n = 0
    const farm = ev({ value: 1 })
    const variety = ev({ value: 2, varietyId: 'v1' })
    const block = ev({ value: 3, blockId: 'b1' })
    const other = ev({ value: 9, paramId: 'j', blockId: 'b2' })
    const promote = (c: CalibrationEvent) => ev({ kind: 'promoted', calibrationId: c.id })
    const states = calibrationStates([farm, variety, block, other, promote(farm), promote(variety), promote(block), promote(other)])
    expect(overridesFor(states, 'p', 'b1', 'v1')).toEqual({ k: 3 })
    expect(overridesFor(states, 'p', 'b3', 'v1')).toEqual({ k: 2 })
    expect(overridesFor(states, 'p', 'b3', 'v2')).toEqual({ k: 1 })
    expect(overridesFor(states, 'other-pack', 'b1', 'v1')).toEqual({})
  })
})

describe('canPromote', () => {
  const challenger = { status: 'challenger' as const, value: 0.5, backtest }
  it('needs a challenger inside bounds that beats the value in force', () => {
    expect(canPromote(challenger, { bounds: [0.3, 0.6] })).toEqual({ ok: true })
    expect(canPromote({ ...challenger, value: 0.7 }, { bounds: [0.3, 0.6] })).toEqual({ ok: false, reason: 'bounds' })
    expect(canPromote({ ...challenger, backtest: { ...backtest, challenger: 4 } }, { bounds: [0.3, 0.6] })).toEqual({ ok: false, reason: 'notBetter' })
    expect(canPromote({ ...challenger, backtest: null }, { bounds: [0.3, 0.6] })).toEqual({ ok: false, reason: 'noBacktest' })
  })
  it('never calibrates a value the pack fixes', () => {
    expect(canPromote(challenger, { bounds: [0.5, 0.5] })).toEqual({ ok: false, reason: 'fixed' })
    expect(canPromote(challenger, {})).toEqual({ ok: false, reason: 'fixed' })
    expect(canPromote(challenger, undefined)).toEqual({ ok: false, reason: 'unknownParameter' })
    expect(canPromote({ ...challenger, status: 'in_force' }, { bounds: [0.3, 0.6] })).toEqual({ ok: false, reason: 'notChallenger' })
  })
})
