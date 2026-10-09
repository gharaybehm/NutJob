/**
 * Insect pest engine (CDSS spec §A6.6): one engine, any number of pest
 * models. For every pest the pack declares it sets the biofix, accumulates
 * degree-days by the model's own method, and times monitoring and control
 * with the pack's decision table.
 *
 *   biofix (from the table's rule, or observed) -> degree-days since biofix
 *   -> the table, with the observations and the crop state -> monitor,
 *   prepare or treat
 *
 * An observed biofix overrides one set by rule. A treatment proposal carries
 * the farm's products for that pest with their spray-safeguard findings.
 */

import { degreeDaysFromCelsius, type DegreeDayModel } from '../core/degree-days'
import type { PackContext } from '../pack/context'
import type { Pack } from '../pack/schema'
import type { BlockState, DecisionEngine, EngineDiagnosis, EnginePublication, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags, tableOutcome } from './action'
import { carriedModels, carriedModelsValue, derive, fieldData, observationsOf, sprayOptions, type PestCarried } from './field-data'
import { addDays } from './weather'

type PestModel = NonNullable<Pack['pests']>['pests'][number]

export interface PestState {
  biofix: string | null
  biofixSource: 'rule' | 'observed' | null
  /** Degree-days since biofix in the model's units; null when they could not be accumulated. */
  dd: number | null
  ddUnits: string
  ddThrough: string | null
  ruleId: string | null
  /** The table's action word, or null when it could not decide. */
  outcome: string | null
  /** The rule that decided the previous run. */
  previousRuleId: string | null
  then: Record<string, unknown> | null
  inputs: Record<string, unknown>
  params: Record<string, number>
  evidence: string | null
  skipped: { ruleId: string; missing: string[] }[]
  notes: string[]
}

/** Table actions that set the biofix rather than propose work. */
const BIOFIX_ACTION = 'set_biofix'
/** Table actions that propose a treatment. */
const TREAT_ACTIONS = ['spray', 'spray_scheduled']

function assessPest(pest: PestModel, state: BlockState, pack: PackContext, carried: PestCarried | undefined): { pestState: PestState; carried: PestCarried } {
  const data = fieldData(state)
  const today = String(state.date)
  const season = Number(today.slice(0, 4))
  const notes: string[] = []
  const units = pest.degree_days.units

  let c: PestCarried = carried && carried.season === season ? { ...carried } : { season, biofix: null, biofixSource: null, dd: 0, through: null, lastRule: null }
  const previousRuleId = c.lastRule

  // Values the table reads, computed from this season's observations.
  const derivedState: Record<string, unknown> = {}
  const runStart: Record<string, string | null> = {}
  let latestCheck: string | null = null
  for (const d of pest.derived) {
    const r = derive(d, observationsOf(data.observations, d.observation, pest.id, season))
    if (r.value !== null) derivedState[d.key] = r.value
    runStart[d.key] = r.runStartDate
    if (r.latestDate !== null && (latestCheck === null || r.latestDate > latestCheck)) latestCheck = r.latestDate
  }

  // An observed biofix overrides one set by rule.
  const observed = observationsOf(data.observations, 'biofix', pest.id, season).filter(o => o.subject === pest.id).pop()
  if (observed && (c.biofix !== observed.observedOn || c.biofixSource !== 'observed')) {
    c = { ...c, biofix: observed.observedOn, biofixSource: 'observed', dd: 0, through: null }
  }

  const table = pest.decision_table
  const evaluate = () => pack.evaluate(table!.table, { ...state, ...derivedState, biofix_set: c.biofix !== null, ...(c.biofix !== null && c.through !== null ? { [`dd_${units}`]: c.dd } : {}) })

  if (table && c.biofix === null) {
    const trace = evaluate()
    if (trace.then?.action === BIOFIX_ACTION) {
      // The table says which check dates the biofix: the first of the rising checks, or the latest check.
      const rising = Object.values(runStart).find(d => d !== null) ?? null
      const date = trace.then.date === 'first_of_rising_checks' ? rising ?? latestCheck : latestCheck
      if (date !== null) {
        c = { ...c, biofix: date, biofixSource: 'rule', dd: 0, through: null }
        notes.push(`Biofix set to ${date} by rule ${trace.rowId}`)
      }
    }
  }

  // Degree-days from the biofix date on, by the model's declared method.
  if (c.biofix !== null) {
    const model: DegreeDayModel = pest.degree_days
    const from = c.through === null ? c.biofix : addDays(c.through, 1)
    const days = data.daily.filter(d => d.complete && !d.forecast && d.date >= from && d.date < today)
    if (days.length > 0 && days[0].date !== from) {
      notes.push(`Degree-days cannot be accumulated: no weather on hand from ${from}`)
      c = { ...c, through: null, dd: 0 }
    } else if (days.length > 0) {
      c = { ...c, dd: c.dd + days.reduce((s, d) => s + degreeDaysFromCelsius(d.tmin, d.tmax, model), 0), through: days[days.length - 1].date }
    } else if (c.through === null && from < today) {
      notes.push(`Degree-days cannot be accumulated: no weather on hand from ${from}`)
    }
  }

  const base = { biofix: c.biofix, biofixSource: c.biofixSource, dd: c.biofix !== null && c.through !== null ? c.dd : null, ddUnits: units, ddThrough: c.through, previousRuleId }
  if (!table) {
    notes.push('The pack has no decision table for this pest, so nothing is proposed')
    return { pestState: { ...base, ruleId: null, outcome: null, then: null, inputs: {}, params: {}, evidence: null, skipped: [], notes }, carried: c }
  }

  const trace = evaluate()
  const fired = table.rows.find(r => r.id === trace.rowId)
  const outcome = tableOutcome(trace, fired !== undefined && Object.keys(fired.when).length === 0)
  c = { ...c, lastRule: outcome.ruleId }
  return {
    pestState: {
      ...base,
      ruleId: outcome.ruleId,
      outcome: outcome.outcome,
      then: outcome.determined ? trace.then : null,
      inputs: trace.inputs,
      params: trace.params,
      evidence: trace.evidence,
      skipped: outcome.skipped,
      notes: [...notes, ...outcome.notes],
    },
    carried: c,
  }
}

export const insectPestEngine: DecisionEngine = {
  engineId: 'insect_pest',
  engineClass: 'continuous',
  packRequirements: () => ['pests.pests'],
  requiredState: () => ['date', 'phase', 'expected_loss_avoided', 'cost'],
  safeguards: () => ['SG-SPR-1', 'SG-SPR-2', 'SG-SPR-3', 'SG-SPR-4', 'SG-SPR-5', 'SG-SPR-6', 'SG-SPR-7'],

  publish(state, pack): EnginePublication {
    const carried = carriedModels(state)
    const pests: Record<string, PestState> = {}
    const next = { ...carried, pests: { ...carried.pests } }
    for (const pest of pack.pack.pests?.pests ?? []) {
      const r = assessPest(pest, state, pack, carried.pests[pest.id])
      pests[pest.id] = r.pestState
      next.pests[pest.id] = r.carried
    }
    return { values: { pests, ...carriedModelsValue(next) } }
  },

  diagnose(state): EngineDiagnosis {
    const pests = (state.pests ?? {}) as Record<string, PestState>
    const notes = Object.entries(pests).map(([id, p]) => {
      const dd = p.dd === null ? 'no degree-days' : `${Math.round(p.dd)} degree-days ${p.ddUnits}`
      return `${id}: ${p.biofix ? `biofix ${p.biofix}, ${dd}` : 'no biofix'}; ${p.outcome ?? 'no decision'}${p.ruleId ? ` (${p.ruleId})` : ''}${p.notes.length ? `. ${p.notes.join('. ')}` : ''}`
    })
    const skipped = Object.values(pests).flatMap(p => p.skipped)
    return { ruleId: null, outcome: Object.keys(pests).length > 0 ? 'assessed' : null, skipped, notes }
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const pests = (state.pests ?? {}) as Record<string, PestState>
    const flags = stateFlags(state)
    const actions: ProposedAction[] = []

    for (const model of pack.pack.pests?.pests ?? []) {
      const p = pests[model.id]
      if (!p || p.ruleId === null || p.outcome === null || p.outcome === BIOFIX_ACTION) continue
      const treat = TREAT_ACTIONS.includes(p.outcome)
      // Monitoring and preparation are standing tasks: proposed when the rule changes, not again every day.
      if (!treat && p.ruleId === p.previousRuleId) continue

      const task = typeof p.then?.task === 'string' ? p.then.task : typeof p.then?.timing === 'string' ? `Timing: ${p.then.timing}` : ''
      const common = {
        engineId: 'insect_pest' as const,
        ruleId: p.ruleId,
        packId: pack.packId,
        packVersion: pack.packVersion,
        blockId,
        evidence: p.evidence ?? model.evidence,
        flags: p.skipped.length > 0 ? [...flags, 'RULES_SKIPPED'] : flags,
      }
      const snapshot = { pest: model.id, biofix: p.biofix, biofix_source: p.biofixSource, degree_days: p.dd, degree_day_units: p.ddUnits, ...p.inputs, params: p.params }

      if (!treat) {
        actions.push(
          proposeAction({
            ...common,
            actionType: `${p.outcome}_${model.id}`,
            description: `${model.name}: ${task || p.outcome}`,
            earliestDay: 0,
            latestDay: 7,
            inputsSnapshot: snapshot,
          }),
        )
        continue
      }

      const options = sprayOptions(state, pack, model.id)
      actions.push(
        proposeAction({
          ...common,
          actionType: `spray_${model.id}`,
          description: `${model.name}: treat. ${task}${options.note ? `. ${options.note}` : ''}`,
          quantity: 1,
          unit: 'spray application',
          earliestDay: options.openDays[0] ?? 0,
          latestDay: options.openDays[options.openDays.length - 1] ?? 7,
          inputsSnapshot: { ...snapshot, spray_safeguards: options },
          expectedOutcome: 'Trap counts fall within 7 days of the treatment',
        }),
      )
    }
    return actions
  },
}
