/**
 * Fertigation and nutrition engine (CDSS spec §A6.3): builds the annual
 * nutrient budget per block from the yield forecast, splits it across the
 * pack's phases, places doses on irrigation events, and reads tissue
 * analyses against the pack's bands.
 *
 *   1. annual demand per nutrient = (yield x removal + growth - credits) / efficiency
 *   2. split by the pack's phase shares
 *   3. a dose only on an irrigation the irrigation engine has proposed,
 *      capped at the pack's maximum single dose
 *   4. tissue analysis against the bands: no dose while a nutrient is excessive
 *
 * Doses are amounts of nutrient per hectare. The product that carries them
 * comes from the farm's product library, which is not built yet.
 */

import { annualNutrientDemandKgHa, splitByPhase } from '../core/nutrient-budget'
import { classifyTissue, type TissueStatus } from '../core/tissue'
import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, EnginePublication, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export interface NutrientBudget {
  /** Null when the budget could not be computed. */
  annualKgHa: number | null
  byPhase: Record<string, number> | null
  missing: string[]
}

export interface TissueSample {
  /** ISO date the sample was taken. */
  sampledAt: string
  tissue: string
  /** Values by nutrient symbol, any letter case. */
  values: Record<string, number>
}

function budgets(state: BlockState, pack: PackContext): Record<string, NutrientBudget> {
  const nutrition = pack.pack.nutrition
  const out: Record<string, NutrientBudget> = {}
  if (!nutrition) return out
  const expectedYield = number(state.expected_yield)
  const efficiency = number(pack.params[nutrition.efficiency.slice(1)])

  for (const n of nutrition.nutrients) {
    const missing: string[] = []
    const param = (ref: string): number | null => {
      const v = number(pack.params[ref.slice(1)])
      if (v === null) missing.push(`${ref} (to be sourced)`)
      return v
    }
    if (expectedYield === null) missing.push('an expected yield for the block')
    if (efficiency === null) missing.push(`${nutrition.efficiency} (to be sourced)`)
    const removal = param(n.removal_kg_per_kg_yield)
    const growth = n.growth_requirement_kg_ha ? param(n.growth_requirement_kg_ha) : 0
    const shares = n.phase_shares ? Object.fromEntries(n.phase_shares.map(s => [s.phase, param(s.share)])) : null

    if (missing.length > 0 || expectedYield === null || efficiency === null || removal === null || growth === null) {
      out[n.id] = { annualKgHa: null, byPhase: null, missing }
      continue
    }
    const annualKgHa = annualNutrientDemandKgHa({ expectedYieldKgHa: expectedYield, removalKgPerKg: removal, growthKgHa: growth, efficiency })
    out[n.id] = { annualKgHa, byPhase: shares ? splitByPhase(annualKgHa, shares as Record<string, number>) : null, missing: [] }
  }
  return out
}

function tissueStatus(state: BlockState, pack: PackContext): Record<string, TissueStatus> {
  const sample = state.tissue_sample as TissueSample | null | undefined
  const out: Record<string, TissueStatus> = {}
  if (!sample) return out
  const values = Object.fromEntries(Object.entries(sample.values).map(([k, v]) => [k.toLowerCase(), v]))
  for (const band of pack.pack.nutrition?.tissue_bands ?? []) {
    // A band applies only to the tissue it was published for.
    if (band.tissue !== sample.tissue) continue
    const value = number(values[band.nutrient.toLowerCase()])
    if (value === null) continue
    out[band.nutrient] = classifyTissue(value, {
      deficientBelow: band.deficient_below,
      adequateFrom: band.adequate_from,
      adequateTo: band.adequate_to,
      excessiveAbove: band.excessive_above,
    })
  }
  return out
}

const RULE_DOSE = 'FERT-PHASE-DOSE'
const RULE_SAMPLE = 'FERT-SAMPLE-DUE'

export const fertigationEngine: DecisionEngine = {
  engineId: 'fertigation',
  engineClass: 'continuous',
  packRequirements: () => ['nutrition.nutrients', 'nutrition.efficiency'],
  requiredState: () => ['expected_yield', 'phase', 'irrigation_actions', 'nutrients_applied', 'tissue_sample'],
  safeguards: () => ['SG-FERT-1', 'SG-FERT-2', 'SG-FERT-3'],

  publish(state, pack): EnginePublication {
    // No nutrient supplied by irrigation water, residual soil or organic inputs is credited yet.
    return { values: { nutrient_budget: budgets(state, pack), nutrient_status: tissueStatus(state, pack) }, addFlags: ['NUTRIENT_CREDITS_NOT_ASSESSED'] }
  },

  diagnose(state, pack): EngineDiagnosis {
    const budget = (state.nutrient_budget ?? {}) as Record<string, NutrientBudget>
    const status = (state.nutrient_status ?? {}) as Record<string, TissueStatus>
    const notes: string[] = []
    for (const [id, b] of Object.entries(budget)) {
      notes.push(b.annualKgHa === null ? `${id}: no budget. Missing: ${b.missing.join('; ')}` : `${id}: ${b.annualKgHa.toFixed(1)} kg/ha for the season`)
    }
    for (const [id, s] of Object.entries(status)) notes.push(`${id} in tissue: ${s}`)
    if (!state.tissue_sample) notes.push('No tissue analysis on record')
    if (state.nutrients_applied === null) notes.push('Fertigation entries exist this season, but the nutrient content of the products is not known, so what remains to apply cannot be computed')
    const maxRef = pack.pack.nutrition?.max_single_dose_kg_ha
    if (maxRef && number(pack.params[maxRef.slice(1)]) === null) notes.push(`No dose can be proposed: ${maxRef} is still to be sourced`)
    const computed = Object.values(budget).some(b => b.annualKgHa !== null)
    return { ruleId: null, outcome: computed ? 'budget_computed' : null, skipped: [], notes }
  },

  evaluate(blockId, state, pack, today): ProposedAction[] {
    const nutrition = pack.pack.nutrition
    if (!nutrition) return []
    const actions: ProposedAction[] = []
    const flags = stateFlags(state)
    const common = { engineId: 'fertigation' as const, packId: pack.packId, packVersion: pack.packVersion, blockId, flags }

    // A tissue sample is due in the pack's sampling months when none was taken this year.
    const sample = state.tissue_sample as TissueSample | null | undefined
    const months = nutrition.sampling?.months ?? []
    const year = today.getUTCFullYear()
    if (months.includes(today.getUTCMonth() + 1) && (!sample || Number(sample.sampledAt.slice(0, 4)) !== year)) {
      actions.push(
        proposeAction({
          ...common,
          ruleId: RULE_SAMPLE,
          actionType: 'tissue_sampling',
          description: `Take the ${nutrition.sampling?.tissue ?? 'tissue'} sample for analysis (${nutrition.sampling?.timing ?? 'in the sampling window'})`,
          earliestDay: 0,
          latestDay: 14,
          inputsSnapshot: { last_sample: sample?.sampledAt ?? null, sampling_months: months },
          evidence: nutrition.sampling?.evidence ?? null,
          expectedOutcome: 'A tissue analysis for this season to check the nutrient budget against',
        }),
      )
    }

    // Doses ride on an irrigation the irrigation engine proposed today.
    const irrigations = Array.isArray(state.irrigation_actions) ? (state.irrigation_actions as { actionId: string; earliestDay: number; latestDay: number }[]) : []
    const phase = typeof state.phase === 'string' ? state.phase : null
    const applied = state.nutrients_applied as Record<string, number> | null | undefined
    const maxRef = nutrition.max_single_dose_kg_ha
    const maxDose = maxRef ? number(pack.params[maxRef.slice(1)]) : null
    if (irrigations.length === 0 || phase === null || !applied || maxDose === null) return actions

    const budget = (state.nutrient_budget ?? {}) as Record<string, NutrientBudget>
    const status = (state.nutrient_status ?? {}) as Record<string, TissueStatus>
    const carrier = irrigations[0]
    for (const n of nutrition.nutrients) {
      const planned = budget[n.id]?.byPhase?.[phase]
      if (planned === undefined || planned <= 0) continue
      if (status[n.id] === 'excessive') continue
      const remaining = planned - (applied[n.id] ?? 0)
      if (remaining <= 0) continue
      const dose = Math.round(Math.min(remaining, maxDose) * 10) / 10
      if (dose <= 0) continue
      actions.push(
        proposeAction({
          ...common,
          ruleId: RULE_DOSE,
          actionType: `fertigate_${n.id}`,
          description: `Inject ${dose} kg ${n.id}/ha with the irrigation`,
          quantity: dose,
          unit: `kg ${n.id}/ha`,
          earliestDay: carrier.earliestDay,
          latestDay: carrier.latestDay,
          inputsSnapshot: {
            phase,
            nutrient: n.id,
            annual_kg_ha: budget[n.id].annualKgHa,
            phase_kg_ha: planned,
            applied_kg_ha: applied[n.id] ?? 0,
            max_single_dose_kg_ha: maxDose,
            tissue_status: status[n.id] ?? null,
            expected_yield: state.expected_yield,
            with_irrigation: carrier.actionId,
          },
          evidence: n.evidence,
          expectedOutcome: 'Tissue analysis in the adequate band at the next sampling',
        }),
      )
    }
    return actions
  },
}
