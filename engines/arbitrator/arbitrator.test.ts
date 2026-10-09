import { describe, expect, it } from 'vitest'
import type { ProposedAction } from '../framework/types'
import { buildPlan, vetoes, type FarmLimits, type PlanInput } from './plan'
import { solve, type ArbAction, type ArbLimits } from './solve'

const arb = (id: string, over: Partial<ArbAction> = {}): ArbAction => ({
  id,
  days: [0, 1, 2, 3, 4, 5, 6],
  value: 0,
  delayCostPerDay: 0,
  labourHrs: 0,
  waterM3: 0,
  equipment: [],
  mandatory: false,
  priority: 1,
  ...over,
})

const unlimited: ArbLimits = { horizonDays: 7, labourHrsPerDay: null, waterM3PerDay: null, equipmentPerDay: {}, waterQuotaM3: null }
const dayOf = (r: ReturnType<typeof solve>, id: string) => r.plan.find(p => p.actionId === id)?.day

describe('solver', () => {
  it('schedules everything as early as its window allows when nothing is limited', () => {
    const r = solve([arb('a'), arb('b', { days: [3, 4] })], unlimited)
    expect(r.status).toBe('OPTIMAL')
    expect(r.plan).toEqual([{ actionId: 'a', day: 0 }, { actionId: 'b', day: 3 }])
    expect(r.unscheduled).toEqual([])
  })

  it('respects the daily water limit and gives the water to the higher value', () => {
    const r = solve([arb('low', { waterM3: 600, value: 100, days: [0] }), arb('high', { waterM3: 600, value: 500, days: [0] })], { ...unlimited, waterM3PerDay: 1000 })
    expect(r.plan).toEqual([{ actionId: 'high', day: 0 }])
    expect(r.unscheduled).toEqual(['low'])
  })

  it('moves an action to another day of its window when a day is full', () => {
    const r = solve([arb('a', { waterM3: 600, value: 500, days: [0, 1] }), arb('b', { waterM3: 600, value: 400, days: [0, 1] })], { ...unlimited, waterM3PerDay: 1000 })
    expect(r.plan).toHaveLength(2)
    expect(dayOf(r, 'a')).toBe(0)
    expect(dayOf(r, 'b')).toBe(1)
  })

  it('weighs the delay cost against a later day', () => {
    // Day 0 holds one of the two. Delaying `urgent` costs more than delaying `patient`.
    const r = solve(
      [arb('patient', { labourHrs: 8, value: 300, delayCostPerDay: 10, days: [0, 1] }), arb('urgent', { labourHrs: 8, value: 300, delayCostPerDay: 100, days: [0, 1] })],
      { ...unlimited, labourHrsPerDay: 8 },
    )
    expect(dayOf(r, 'urgent')).toBe(0)
    expect(dayOf(r, 'patient')).toBe(1)
  })

  it('leaves out an optional action whose delay cost exceeds its value on every day', () => {
    const r = solve([arb('late', { value: 50, delayCostPerDay: 100, days: [2, 3] })], unlimited)
    expect(r.plan).toEqual([])
  })

  it('keeps the labour limit and the equipment limit per day', () => {
    const sprays = ['s1', 's2', 's3'].map(id => arb(id, { equipment: ['sprayer'], labourHrs: 4, days: [0, 1] }))
    const r = solve(sprays, { ...unlimited, labourHrsPerDay: 8, equipmentPerDay: { sprayer: 1 } })
    expect(r.plan).toHaveLength(2)
    expect(new Set(r.plan.map(p => p.day))).toEqual(new Set([0, 1]))
    expect(r.unscheduled).toHaveLength(1)
  })

  it('keeps the seasonal water allocation across days', () => {
    const r = solve([arb('a', { waterM3: 700, days: [0] }), arb('b', { waterM3: 700, days: [1] })], { ...unlimited, waterQuotaM3: 1000 })
    expect(r.plan).toHaveLength(1)
  })

  it('places a mandatory action before a more valuable optional one', () => {
    const r = solve([arb('optional', { waterM3: 800, value: 9000, days: [0] }), arb('must', { waterM3: 800, mandatory: true, days: [0] })], { ...unlimited, waterM3PerDay: 1000 })
    expect(r.status).toBe('OPTIMAL')
    expect(r.plan).toEqual([{ actionId: 'must', day: 0 }])
  })

  it('reports INFEASIBLE when a mandatory action cannot fit, and still places the rest', () => {
    const r = solve([arb('must1', { waterM3: 800, mandatory: true, days: [0] }), arb('must2', { waterM3: 800, mandatory: true, days: [0] }), arb('other', { days: [1] })], { ...unlimited, waterM3PerDay: 1000 })
    expect(r.status).toBe('INFEASIBLE')
    expect(r.plan.map(p => p.actionId).sort()).toEqual(['must1', 'other'])
    expect(r.unscheduled).toEqual(['must2'])
  })

  it('reports INFEASIBLE for a mandatory action with no permitted day', () => {
    expect(solve([arb('must', { mandatory: true, days: [] })], unlimited).status).toBe('INFEASIBLE')
  })

  it('places daily-engine actions before seasonal tasks when money does not decide', () => {
    const r = solve([arb('seasonal', { labourHrs: 8, priority: 1, days: [0, 1] }), arb('daily', { labourHrs: 8, priority: 2, days: [0] })], { ...unlimited, labourHrsPerDay: 8 })
    expect(dayOf(r, 'daily')).toBe(0)
    expect(dayOf(r, 'seasonal')).toBe(1)
  })

  it('finds the best combination, not the greedy one', () => {
    // Greedy by value takes `big` (60 of 100 hours) and then nothing else fits; the two smaller ones are worth more together.
    const r = solve(
      [arb('big', { labourHrs: 60, value: 100, days: [0] }), arb('m1', { labourHrs: 50, value: 70, days: [0] }), arb('m2', { labourHrs: 50, value: 70, days: [0] })],
      { ...unlimited, labourHrsPerDay: 100 },
    )
    expect(r.plan.map(p => p.actionId).sort()).toEqual(['m1', 'm2'])
    expect(r.objective.money).toBe(140)
  })

  it('handles a farm-sized problem well inside the search limit', () => {
    const actions = Array.from({ length: 40 }, (_, i) => arb(`a${i}`, { waterM3: 300 + (i % 5) * 100, labourHrs: 2 + (i % 3), value: (i * 37) % 200, days: [i % 4, (i % 4) + 1, (i % 4) + 2] }))
    const r = solve(actions, { ...unlimited, waterM3PerDay: 2500, labourHrsPerDay: 24 })
    expect(['OPTIMAL', 'FEASIBLE']).toContain(r.status)
    expect(r.plan.length).toBeGreaterThan(10)
    for (let d = 0; d < 7; d++) {
      const today = r.plan.filter(p => p.day === d).map(p => actions.find(a => a.id === p.actionId) as ArbAction)
      expect(today.reduce((s, a) => s + a.waterM3, 0)).toBeLessThanOrEqual(2500)
      expect(today.reduce((s, a) => s + a.labourHrs, 0)).toBeLessThanOrEqual(24)
    }
  })
})

const TODAY = '2026-05-10'

const action = (id: string, over: Partial<ProposedAction> = {}): ProposedAction => ({
  actionId: id,
  engineId: 'irrigation',
  ruleId: 'R',
  packId: 'demo',
  packVersion: '1.0.0',
  blockId: 'B1',
  actionType: 'irrigate',
  description: id,
  quantity: null,
  unit: null,
  earliestDay: 0,
  latestDay: 1,
  expectedLossAvoided: 0,
  delayCostPerDay: 0,
  cost: 0,
  labourHrs: 0,
  waterM3: 0,
  equipment: [],
  confidence: 1,
  mandatory: false,
  inputsSnapshot: {},
  evidence: null,
  expectedOutcome: null,
  flags: [],
  requiresEntry: false,
  standing: false,
  ...over,
})

const noLimits: FarmLimits = { labourHrsPerDay: null, waterM3PerDay: null, sprayers: null, waterQuotaM3: null, frostProtectionMethod: null }
const planInput = (actions: ProposedAction[], over: Partial<PlanInput> = {}): PlanInput => ({ today: TODAY, actions, continuousEngines: ['irrigation', 'frost', 'insect_pest', 'disease'], reentryBlockedUntil: {}, limits: noLimits, ...over })

/** Spray-safeguard findings as the engines attach them: open on `openDays`, the product blocked for `reason` otherwise. */
const sprayFindings = (openDays: number[], blocked: { safeguardId: string; reason: string }[] = []) => ({
  openDays,
  note: openDays.length === 0 ? 'No listed product passes the spray safeguards on any day ahead' : null,
  products: [{ name: 'Product one', blocked, days: [0, 1, 2, 3].map(dayIndex => ({ dayIndex, vetoes: openDays.includes(dayIndex) ? [] : [{ safeguardId: 'SG-SPR-1', reason: 'Forecast wind above 4 m/s' }] })) }],
})

describe('farm plan', () => {
  it('places each action on a dated day', () => {
    const p = buildPlan(planInput([action('a'), action('b', { blockId: 'B2', earliestDay: 2, latestDay: 4 })]))
    expect(p.status).toBe('OPTIMAL')
    expect(p.plan).toEqual([
      { actionId: 'a', blockId: 'B1', day: 0, date: '2026-05-10' },
      { actionId: 'b', blockId: 'B2', day: 2, date: '2026-05-12' },
    ])
  })

  it('says which limits are not set', () => {
    const p = buildPlan(planInput([action('a')]))
    expect(p.notes).toEqual([
      'No daily labour limit is set for the farm, so labour does not limit the plan',
      'No daily water limit is set for the farm, so water does not limit the plan',
      'The number of sprayers is not set, so sprayers do not limit the plan',
    ])
  })

  it('shares water across the blocks of the farm, and gives the reason for what is deferred', () => {
    const actions = ['B1', 'B2', 'B3'].map((blockId, i) => action(`irr-${blockId}`, { blockId, waterM3: 1100, earliestDay: 0, latestDay: 0, expectedLossAvoided: 100 * (3 - i) }))
    const p = buildPlan(planInput(actions, { limits: { ...noLimits, waterM3PerDay: 2500 } }))
    expect(p.plan.map(x => x.actionId)).toEqual(['irr-B1', 'irr-B2'])
    expect(p.deferred).toEqual([{ actionId: 'irr-B3', blockId: 'B3', reason: 'resource_limit', detail: 'Not enough water on any permitted day once the higher-value actions are placed' }])
  })

  it('weights value by confidence', () => {
    const sure = action('sure', { waterM3: 900, earliestDay: 0, latestDay: 0, expectedLossAvoided: 100, confidence: 1 })
    const unsure = action('unsure', { blockId: 'B2', waterM3: 900, earliestDay: 0, latestDay: 0, expectedLossAvoided: 150, confidence: 0.5 })
    expect(buildPlan(planInput([unsure, sure], { limits: { ...noLimits, waterM3PerDay: 1000 } })).plan.map(x => x.actionId)).toEqual(['sure'])
  })

  // Acceptance test: a spray action with PHI past harvest is vetoed for all days.
  it('vetoes a spray on every day its safeguards close, and defers it with the reason', () => {
    const blocked = [{ safeguardId: 'SG-SPR-4', reason: 'The pre-harvest interval is not recorded' }]
    const spray = action('spray', { engineId: 'disease', actionType: 'spray_x', latestDay: 3, equipment: ['sprayer'], requiresEntry: true, inputsSnapshot: { spray_safeguards: sprayFindings([], blocked) } })
    const p = buildPlan(planInput([spray]))
    expect(p.plan).toEqual([])
    expect(p.deferred[0]).toMatchObject({ actionId: 'spray', reason: 'safeguard' })
    expect(p.deferred[0].detail).toMatch(/No permitted day\. .*SG-SPR-4: Product one: The pre-harvest interval is not recorded/)
    expect(p.safeguardEvents.filter(v => v.safeguardId === 'SG-SPR-4')).toHaveLength(7)
  })

  it('moves a spray to a day its safeguards leave open', () => {
    const spray = action('spray', { engineId: 'disease', actionType: 'spray_x', latestDay: 3, equipment: ['sprayer'], inputsSnapshot: { spray_safeguards: sprayFindings([2, 3]) } })
    const p = buildPlan(planInput([spray]))
    expect(p.plan).toEqual([{ actionId: 'spray', blockId: 'B1', day: 2, date: '2026-05-12' }])
    expect(p.safeguardEvents.some(v => v.day === 0 && v.safeguardId === 'SG-SPR-1')).toBe(true)
  })

  it('gives one sprayer to one block a day', () => {
    const sprays = ['B1', 'B2'].map(blockId => action(`spray-${blockId}`, { blockId, engineId: 'disease', actionType: 'spray_x', latestDay: 3, equipment: ['sprayer'], inputsSnapshot: { spray_safeguards: sprayFindings([0, 1, 2, 3]) } }))
    const p = buildPlan(planInput(sprays, { limits: { ...noLimits, sprayers: 1 } }))
    expect(p.plan.map(x => x.day)).toEqual([0, 1])
  })

  it('SG-SPR-5: keeps work that enters a block out of it during its re-entry interval', () => {
    const scouting = action('scout', { engineId: 'phenology', actionType: 'observe', requiresEntry: true, latestDay: 3 })
    const irrigation = action('irrigate', { latestDay: 3 })
    const p = buildPlan(planInput([scouting, irrigation], { reentryBlockedUntil: { B1: '2026-05-11T08:00:00.000Z' } }))
    expect(p.plan).toEqual([
      { actionId: 'irrigate', blockId: 'B1', day: 0, date: '2026-05-10' },
      { actionId: 'scout', blockId: 'B1', day: 2, date: '2026-05-12' },
    ])
    expect(p.safeguardEvents.filter(v => v.safeguardId === 'SG-SPR-5').map(v => v.day)).toEqual([0, 1])
  })

  it('SG-FRO-1: gives frost protection the water on a frost night when the farm protects with water', () => {
    const frost = action('frost', { engineId: 'frost', actionType: 'frost_protect', earliestDay: 1, latestDay: 1, mandatory: true, waterM3: 500 })
    const irrigation = action('irrigate', { blockId: 'B2', waterM3: 800, earliestDay: 1, latestDay: 2 })
    const withWater = buildPlan(planInput([frost, irrigation], { limits: { ...noLimits, frostProtectionMethod: 'water' } }))
    expect(withWater.plan).toEqual([
      { actionId: 'frost', blockId: 'B1', day: 1, date: '2026-05-11' },
      { actionId: 'irrigate', blockId: 'B2', day: 2, date: '2026-05-12' },
    ])
    expect(withWater.safeguardEvents).toEqual([{ actionId: 'irrigate', day: 1, safeguardId: 'SG-FRO-1', reason: 'Frost-protection water has priority on this night' }])

    const withMachines = buildPlan(planInput([frost, irrigation], { limits: { ...noLimits, frostProtectionMethod: 'wind_machine' } }))
    expect(withMachines.plan.find(x => x.actionId === 'irrigate')?.day).toBe(1)
    expect(vetoes(planInput([frost, irrigation])).notes[0]).toMatch(/SG-FRO-1 \(water priority\) could not be applied/)
  })

  it('R8.1: never drops a mandatory action silently, and names what stops it', () => {
    const frostA = action('frost-B1', { engineId: 'frost', actionType: 'frost_protect', earliestDay: 1, latestDay: 1, mandatory: true, waterM3: 900 })
    const frostB = action('frost-B2', { blockId: 'B2', engineId: 'frost', actionType: 'frost_protect', earliestDay: 1, latestDay: 1, mandatory: true, waterM3: 900 })
    const p = buildPlan(planInput([frostA, frostB], { limits: { ...noLimits, waterM3PerDay: 1000 } }))
    expect(p.status).toBe('INFEASIBLE')
    expect(p.plan).toHaveLength(1)
    expect(p.unscheduledMandatory).toEqual([{ actionId: 'frost-B2', blockId: 'B2', conflicts: ['Not enough water on any permitted day once the higher-value actions are placed'] }])
    expect(p.deferred).toEqual([])
  })

  it('R8.4: pushes a seasonal task back when a daily engine needs the labour', () => {
    const pruning = action('prune', { engineId: 'canopy_pruning', actionType: 'seasonal_task', labourHrs: 8, latestDay: 6 })
    const spray = action('spray', { blockId: 'B2', engineId: 'disease', actionType: 'spray_x', labourHrs: 8, earliestDay: 0, latestDay: 0 })
    const p = buildPlan(planInput([pruning, spray], { limits: { ...noLimits, labourHrsPerDay: 8 } }))
    expect(p.plan).toEqual([
      { actionId: 'spray', blockId: 'B2', day: 0, date: '2026-05-10' },
      { actionId: 'prune', blockId: 'B1', day: 1, date: '2026-05-11' },
    ])
  })

  it('defers an action whose window lies beyond the seven days', () => {
    const p = buildPlan(planInput([action('later', { earliestDay: 9, latestDay: 16 })]))
    expect(p.deferred).toEqual([{ actionId: 'later', blockId: 'B1', reason: 'outside_horizon', detail: 'Its window (day 9 to 16) is outside the 7-day plan' }])
  })

  it('never changes an engine’s numbers', () => {
    const original = action('a', { quantity: 22.5, waterM3: 450, earliestDay: 0, latestDay: 3 })
    const copy = JSON.parse(JSON.stringify(original))
    buildPlan(planInput([original], { limits: { ...noLimits, waterM3PerDay: 100 } }))
    expect(original).toEqual(copy)
  })
})
