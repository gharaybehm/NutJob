/**
 * Salinity and leaching engine (CDSS spec §A6.4): tracks root-zone salinity
 * risk from slow data (soil and water analyses) and sets the leaching
 * fraction the irrigation engine adds. The threshold, the slope and the
 * upper bound on the leaching fraction come from the pack.
 */

import { leachingRequirement, relativeYieldPct } from '../core/salinity'
import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, EnginePublication, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface Assessment {
  thresholdA: number | null
  relativeYield: number | null
  requirement: number | null
  fraction: number | null
  waterTooSaline: boolean
  notes: string[]
}

function assess(state: BlockState, pack: PackContext): Assessment {
  const s = pack.pack.salinity
  const a: Assessment = { thresholdA: null, relativeYield: null, requirement: null, fraction: null, waterTooSaline: false, notes: [] }
  if (!s) return a
  const thresholdA = number(pack.params[s.threshold_ece.slice(1)])
  const slopeB = number(pack.params[s.slope_pct_per_ds_m.slice(1)])
  if (thresholdA === null || slopeB === null) {
    a.notes.push('The salinity threshold or slope is still to be sourced')
    return a
  }
  a.thresholdA = thresholdA

  const ece = number(state.soil_ece)
  if (ece === null) a.notes.push('No soil analysis with an EC value')
  else a.relativeYield = relativeYieldPct(ece, thresholdA, slopeB)

  const ecw = number(state.water_ec)
  if (ecw === null) {
    a.notes.push('No water analysis with an EC value, so no leaching fraction is set')
    return a
  }
  try {
    a.requirement = leachingRequirement(ecw, thresholdA)
  } catch {
    a.waterTooSaline = true
    a.notes.push('The irrigation water is too saline to hold the soil at the threshold by leaching')
    return a
  }

  const maxRef = s.leaching_fraction_max
  const max = maxRef ? number(pack.params[maxRef.slice(1)]) : null
  if (max === null) {
    a.notes.push(`The leaching requirement is ${a.requirement.toFixed(2)}, but it is not added to irrigation: the pack gives no upper bound for the leaching fraction`)
  } else {
    a.fraction = Math.min(a.requirement, max)
    if (a.requirement > max) a.notes.push(`The leaching requirement ${a.requirement.toFixed(2)} is above the pack's upper bound ${max}`)
  }
  return a
}

const RULE_SOIL = 'SAL-SOIL-ABOVE-THRESHOLD'
const RULE_WATER = 'SAL-WATER-TOO-SALINE'

export const salinityEngine: DecisionEngine = {
  engineId: 'salinity',
  engineClass: 'continuous',
  packRequirements: () => ['salinity.threshold_ece', 'salinity.slope_pct_per_ds_m'],
  requiredState: () => ['soil_ece', 'water_ec'],
  safeguards: () => [],

  publish(state, pack): EnginePublication {
    const a = assess(state, pack)
    const values: Record<string, unknown> = { salinity_notes: a.notes }
    if (a.relativeYield !== null) values.salinity_relative_yield_pct = a.relativeYield
    if (a.requirement !== null) values.leaching_requirement = a.requirement
    if (a.fraction === null) return { values }
    return { values: { ...values, leaching_fraction: a.fraction }, removeFlags: ['LEACHING_NOT_ASSESSED'] }
  },

  diagnose(state, pack): EngineDiagnosis {
    const a = assess(state, pack)
    const soilAbove = a.thresholdA !== null && typeof state.soil_ece === 'number' && state.soil_ece > a.thresholdA
    const ruleId = a.waterTooSaline ? RULE_WATER : soilAbove ? RULE_SOIL : null
    const outcome = a.fraction !== null ? 'leaching_fraction_set' : a.relativeYield !== null || a.requirement !== null ? 'assessed' : null
    return { ruleId, outcome, skipped: [], notes: a.notes }
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const a = assess(state, pack)
    const ece = number(state.soil_ece)
    const common = {
      engineId: 'salinity' as const,
      packId: pack.packId,
      packVersion: pack.packVersion,
      blockId,
      evidence: pack.pack.salinity?.evidence ?? null,
      flags: stateFlags(state),
      earliestDay: 0,
    }
    const actions: ProposedAction[] = []
    if (a.thresholdA !== null && ece !== null && ece > a.thresholdA) {
      actions.push(
        proposeAction({
          ...common,
          ruleId: RULE_SOIL,
          actionType: 'soil_sampling',
          description: `Soil salinity ${ece} dS/m is above the threshold ${a.thresholdA} dS/m. Take a new soil sample to confirm, and review leaching.`,
          latestDay: 30,
          inputsSnapshot: { soil_ece: ece, soil_ece_at: state.soil_ece_at ?? null, threshold: a.thresholdA, relative_yield_pct: a.relativeYield },
          expectedOutcome: 'A current soil salinity value for the root zone',
        }),
      )
    }
    if (a.waterTooSaline) {
      actions.push(
        proposeAction({
          ...common,
          ruleId: RULE_WATER,
          actionType: 'water_source_warning',
          description: `Irrigation water at ${String(state.water_ec)} dS/m cannot hold the soil at ${a.thresholdA} dS/m by leaching. Review the water source.`,
          latestDay: 30,
          inputsSnapshot: { water_ec: state.water_ec, water_ec_at: state.water_ec_at ?? null, threshold: a.thresholdA },
        }),
      )
    }
    return actions
  },
}
