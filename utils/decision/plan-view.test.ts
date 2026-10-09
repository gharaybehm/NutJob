import { describe, expect, it } from 'vitest'
import { engineTile, keyInputs, liveReadiness, sprayProducts, validateDecision, waitingEngines } from './plan-view'

describe('validateDecision', () => {
  it('accepts an acceptance with no reason', () => {
    expect(validateDecision({ decision: 'accepted' })).toEqual({ ok: true, value: { decision: 'accepted', reason: null, note: null } })
  })

  it('needs a reason for a skip', () => {
    expect(validateDecision({ decision: 'skipped' })).toEqual({ ok: false, error: 'reason' })
    expect(validateDecision({ decision: 'skipped', reason: 'made_up' })).toEqual({ ok: false, error: 'reason' })
    expect(validateDecision({ decision: 'skipped', reason: 'already_done' })).toEqual({ ok: true, value: { decision: 'skipped', reason: 'already_done', note: null } })
  })

  it('needs a reason and what was done instead for an edit', () => {
    expect(validateDecision({ decision: 'edited', reason: 'resource_constraint' })).toEqual({ ok: false, error: 'note' })
    expect(validateDecision({ decision: 'edited', reason: 'resource_constraint', note: ' Half the block today ' })).toEqual({
      ok: true,
      value: { decision: 'edited', reason: 'resource_constraint', note: 'Half the block today' },
    })
  })

  it('needs "other" to be explained', () => {
    expect(validateDecision({ decision: 'skipped', reason: 'other' })).toEqual({ ok: false, error: 'note' })
    expect(validateDecision({ decision: 'skipped', reason: 'other', note: 'Road closed' }).ok).toBe(true)
  })

  it('refuses an unknown decision', () => {
    expect(validateDecision({ decision: 'ignored' })).toEqual({ ok: false, error: 'decision' })
    expect(validateDecision(null)).toEqual({ ok: false, error: 'decision' })
  })
})

describe('the Why panel', () => {
  it('lists the inputs a rule used, with pack values marked, and leaves the spray findings out', () => {
    expect(keyInputs({ inputsSnapshot: { phase: 'growing', Dr: 60.126, done: false, night: null, params: { refill: 1.1 }, spray_safeguards: { openDays: [] } } })).toEqual([
      { key: 'phase', value: 'growing' },
      { key: 'Dr', value: '60.13' },
      { key: 'done', value: 'false' },
      { key: 'night', value: '—' },
      { key: '$refill', value: '1.1' },
    ])
  })

  it('shows each product with its safeguard findings as recorded and the days it may be used', () => {
    const action = {
      inputsSnapshot: {
        spray_safeguards: {
          note: null,
          products: [
            { name: 'One', usable: true, blocked: [], days: [{ dayIndex: 0, allowedHours: [] }, { dayIndex: 1, allowedHours: [9, 10] }] },
            { name: 'Two', usable: false, blocked: [{ safeguardId: 'SG-SPR-7', reason: 'Not registered for this crop in this country' }], days: [] },
          ],
        },
      },
    }
    expect(sprayProducts(action)).toEqual({
      note: null,
      products: [
        { name: 'One', usable: true, blocked: [], openDays: [1] },
        { name: 'Two', usable: false, blocked: [{ safeguardId: 'SG-SPR-7', reason: 'Not registered for this crop in this country' }], openDays: [] },
      ],
    })
    expect(sprayProducts({ inputsSnapshot: {} })).toBeNull()
  })
})

describe('liveReadiness', () => {
  const report = { engines: { frost: { hasContent: true, liveBlockedBy: [] }, irrigation: { hasContent: true, liveBlockedBy: ['kcb_ml', 'kc_min'] }, harvest: { hasContent: false, liveBlockedBy: [] } } }

  it('lets an engine go Live when the pack has content for it and nothing it needs is still to be sourced', () => {
    expect(liveReadiness([report], 'frost')).toEqual({ hasContent: true, canGoLive: true, blockers: [] })
  })

  it('keeps an engine in Shadow while a value it needs is still to be sourced, and names the values', () => {
    expect(liveReadiness([report], 'irrigation')).toEqual({ hasContent: true, canGoLive: false, blockers: ['kcb_ml', 'kc_min'] })
  })

  it('does not let an engine go Live that the pack has no content for', () => {
    expect(liveReadiness([report], 'harvest').canGoLive).toBe(false)
    expect(liveReadiness([report], 'unknown').canGoLive).toBe(false)
    expect(liveReadiness([], 'frost').canGoLive).toBe(false)
  })

  it('needs every pack version the farm uses to be ready', () => {
    const older = { engines: { frost: { hasContent: true, liveBlockedBy: ['frost_loss'] } } }
    expect(liveReadiness([report, older], 'frost')).toEqual({ hasContent: true, canGoLive: false, blockers: ['frost_loss'] })
  })
})

describe('engineTile', () => {
  it('picks the values the dashboard shows from a block state', () => {
    const tile = engineTile(
      { phase: 'post_harvest', Dr: 30, RAW: 60, frost_nights: [{ date: '2026-10-10', minC: 4 }, { date: '2026-10-11', minC: -1.2 }], expected_yield: 0, expected_yield_unit: 'kg/ha', flags: ['WEATHER_MODELLED'] },
      { irrigation: { active: true, reason: null, diagnosis: { outcome: null, notes: [] } }, frost: { active: true, reason: null, diagnosis: { outcome: 'none', notes: [] } } },
    )
    expect(tile).toEqual({ phase: 'post harvest', depletionPct: 50, coldestNight: { date: '2026-10-11', minC: -1.2 }, expectedYield: 0, yieldUnit: 'kg/ha', flags: ['WEATHER_MODELLED'], waiting: 1 })
  })

  it('leaves out what the state does not have', () => {
    expect(engineTile({ phase: null }, null)).toEqual({ phase: null, depletionPct: null, coldestNight: null, expectedYield: null, yieldUnit: null, flags: [], waiting: 0 })
    expect(engineTile(null, null).depletionPct).toBeNull()
  })
})

describe('waitingEngines', () => {
  it('lists the engines that could not decide, with what each is missing', () => {
    expect(
      waitingEngines({
        phenology: { active: true, reason: null, diagnosis: { outcome: 'growing', notes: [] } },
        irrigation: { active: true, reason: null, diagnosis: { outcome: null, notes: ['Cannot decide without: Dr'] } },
        frost: { active: false, reason: 'The pack has no frost section', diagnosis: null },
      }),
    ).toEqual([
      { engineId: 'irrigation', notes: ['Cannot decide without: Dr'] },
      { engineId: 'frost', notes: ['The pack has no frost section'] },
    ])
    expect(waitingEngines(null)).toEqual([])
  })
})
