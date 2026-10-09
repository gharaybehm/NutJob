import { describe, expect, it } from 'vitest'
import type { FarmPlan } from '../arbitrator/plan'
import type { ProposedAction } from '../framework/types'
import { buildNarratorInput, checkNarration, languageInstruction, numbersIn, ruleBasedNarration, type Narration } from './narration'

const action = (over: Partial<ProposedAction> = {}): ProposedAction => ({
  actionId: 'B1:irrigation:D-3:irrigate:0',
  engineId: 'irrigation',
  ruleId: 'D-3',
  packId: 'demo',
  packVersion: '1.0.0',
  blockId: 'B1',
  actionType: 'irrigate',
  description: 'Apply 22.5 mm',
  quantity: 22.5,
  unit: 'mm',
  earliestDay: 0,
  latestDay: 1,
  expectedLossAvoided: 0,
  delayCostPerDay: 0,
  cost: 0,
  labourHrs: 0,
  waterM3: 450,
  equipment: [],
  confidence: 0.8,
  mandatory: false,
  inputsSnapshot: { Dr: 60, RAW: 50, spray_safeguards: { openDays: [1] } },
  evidence: 'SRC',
  expectedOutcome: 'Depletion back below the threshold',
  flags: ['WEATHER_MODELLED', 'VALUE_NOT_ESTIMATED'],
  requiresEntry: false,
  standing: false,
  ...over,
})

const scouting = action({ actionId: 'B2:phenology:PHEN-STAGE-MISSING:observe:0', engineId: 'phenology', ruleId: 'PHEN-STAGE-MISSING', blockId: 'B2', actionType: 'observe', description: 'Record the current growth stage of the block', quantity: null, unit: null, evidence: null, expectedOutcome: null, flags: [] })
const pruning = action({ actionId: 'B1:canopy_pruning:maintain:seasonal_task:0', engineId: 'canopy_pruning', ruleId: 'maintain', actionType: 'seasonal_task', description: 'Maintenance pruning', quantity: null, unit: null, flags: [] })

const plan: FarmPlan = {
  today: '2026-05-10',
  horizonDays: 7,
  status: 'OPTIMAL',
  plan: [
    { actionId: action().actionId, blockId: 'B1', day: 0, date: '2026-05-10' },
    { actionId: scouting.actionId, blockId: 'B2', day: 0, date: '2026-05-10' },
  ],
  deferred: [{ actionId: pruning.actionId, blockId: 'B1', reason: 'resource_limit', detail: 'Not enough labour on any permitted day once the higher-value actions are placed' }],
  unscheduledMandatory: [],
  safeguardEvents: [{ actionId: pruning.actionId, day: 1, safeguardId: 'SG-SPR-5', reason: 'Re-entry interval in the block runs until 2026-05-11T08:00:00.000Z' }],
  notes: [],
}
const input = buildNarratorInput(plan, [action(), scouting, pruning], { B1: { phase: 'growing' }, B2: { phase: null } })

const good: Narration = {
  action_explanations: [{ action_id: action().actionId, text: 'Rule D-3 fired because depletion (60 mm) reached the readily available water (50 mm). Apply 22.5 mm.' }],
  deferred_explanations: [{ action_id: pruning.actionId, text: 'Deferred: not enough labour.' }],
  conflicts: [{ flag: 'WEATHER_MODELLED', text: 'Weather is modelled.', resolution: 'Connect a station.' }],
  observation_requests: [{ block_id: 'B2', observation: 'Growth stage', why: 'The phase is unknown.' }],
  task_drafts: [{ action_id: action().actionId, text: 'On 2026-05-10 apply 22.5 mm to B1.' }],
}

describe('narrator input', () => {
  it('gives the narrator the plan, the deferred actions, the flags and the safeguard events', () => {
    expect(input.plan.map(p => [p.action_id, p.date, p.rule_id])).toEqual([
      [action().actionId, '2026-05-10', 'D-3'],
      [scouting.actionId, '2026-05-10', 'PHEN-STAGE-MISSING'],
    ])
    expect(input.deferred).toMatchObject([{ action_id: pruning.actionId, reason: 'resource_limit', description: 'Maintenance pruning' }])
    expect(input.flags).toEqual(['VALUE_NOT_ESTIMATED', 'WEATHER_MODELLED'])
    expect(input.safeguard_events).toHaveLength(1)
  })

  it('leaves the safeguard findings out of what the narrator may restate', () => {
    expect(input.plan[0].key_inputs).toEqual({ Dr: 60, RAW: 50 })
  })

  it('lists a mandatory action that could not be placed among the deferred, marked as such', () => {
    const infeasible = buildNarratorInput({ ...plan, plan: [], deferred: [], unscheduledMandatory: [{ actionId: action().actionId, blockId: 'B1', conflicts: ['Not enough water'] }] }, [action()], {})
    expect(infeasible.deferred).toMatchObject([{ reason: 'mandatory_not_scheduled', detail: 'Not enough water' }])
  })
})

describe('numbers in a text', () => {
  it('reads integers, decimals and decimal commas', () => {
    expect(numbersIn('Apply 22.5 mm on 2026-05-10, or 22,5 mm')).toEqual(['22.5', '2026', '5', '10', '22.5'])
  })

  it('reads Arabic-Indic and Eastern Arabic digits as the same numbers', () => {
    expect(numbersIn('٢٢٫٥ مم')).toEqual(['22.5'])
    expect(numbersIn('۶۰')).toEqual(['60'])
  })
})

describe('check on the narration (R9.1)', () => {
  it('accepts a narration that uses only numbers from the input', () => {
    expect(checkNarration(good, input)).toEqual([])
  })

  it('rejects a number that is not in the input', () => {
    const invented = { ...good, action_explanations: [{ action_id: action().actionId, text: 'Apply 25 mm, about 70 % of the deficit.' }] }
    expect(checkNarration(invented, input)).toEqual(['Contains number(s) that are not in the input: 25, 70'])
  })

  it('rejects a rounded number', () => {
    const rounded = { ...good, task_drafts: [{ action_id: action().actionId, text: 'Apply 23 mm.' }] }
    expect(checkNarration(rounded, input)[0]).toMatch(/not in the input: 23/)
  })

  it('rejects an invented number written in Arabic digits', () => {
    const arabic = { ...good, task_drafts: [{ action_id: action().actionId, text: 'أضف ٣٠ مم' }] }
    expect(checkNarration(arabic, input)[0]).toMatch(/not in the input: 30/)
    const fine = { ...good, task_drafts: [{ action_id: action().actionId, text: 'أضف ٢٢٫٥ مم' }] }
    expect(checkNarration(fine, input)).toEqual([])
  })

  it('rejects an action or a block that is not in the plan', () => {
    const unknown = { ...good, task_drafts: [{ action_id: 'made-up', text: 'Do something.' }] }
    expect(checkNarration(unknown, input)).toEqual(['Names an action that is not in the plan: made-up'])
    const block = { ...good, observation_requests: [{ block_id: 'B9', observation: 'x', why: 'y' }] }
    expect(checkNarration(block, input)).toEqual(['Names a block that is not in the input: B9'])
  })

  it('rejects an answer that is not in the expected form', () => {
    expect(checkNarration('text', input)).toEqual(['The answer is not a JSON object'])
    expect(checkNarration({ ...good, conflicts: undefined }, input)).toEqual(['"conflicts" is missing or not a list'])
    expect(checkNarration({ ...good, task_drafts: [{ action_id: action().actionId }] }, input)[0]).toMatch(/does not have the fields action_id, text/)
  })
})

describe('rule-based narration (R9.2)', () => {
  const narration = ruleBasedNarration(input)

  it('explains every planned action from its rule, source and expected outcome', () => {
    expect(narration.action_explanations[0]).toEqual({ action_id: action().actionId, text: 'Apply 22.5 mm. Rule D-3 (irrigation engine). Source: SRC. Expected: Depletion back below the threshold' })
    expect(narration.task_drafts[0].text).toBe('2026-05-10: Apply 22.5 mm')
  })

  it('explains each deferred action with its reason', () => {
    expect(narration.deferred_explanations[0].text).toBe('Maintenance pruning. Not planned: Not enough labour on any permitted day once the higher-value actions are placed')
  })

  it('turns flags into what they mean and what would clear them', () => {
    expect(narration.conflicts.map(c => c.flag)).toEqual(['VALUE_NOT_ESTIMATED', 'WEATHER_MODELLED'])
    expect(narration.conflicts[1].resolution).toBe('Connect a weather station on the farm.')
  })

  it('lists the observations the team is asked for', () => {
    expect(narration.observation_requests).toEqual([{ block_id: 'B2', observation: 'Record the current growth stage of the block', why: 'Rule PHEN-STAGE-MISSING' }])
  })

  it('passes its own check: it contains no number that is not in the input', () => {
    expect(checkNarration(narration, input)).toEqual([])
  })
})

describe('language', () => {
  it('asks for the language and keeps identifiers and numbers as given', () => {
    expect(languageInstruction('tr')).toMatch(/in Turkish/)
    expect(languageInstruction('ar')).toMatch(/in Arabic.*Western digits/)
  })
})
