/**
 * Yield forecast engine (CDSS spec §A6.11): keeps a current expected-yield
 * estimate per block. Every other engine's expected loss depends on it, and
 * so does the nutrient budget.
 *
 * The prior is the manager's own estimate for the block this season when
 * there is one; otherwise the farm's mature-yield target scaled by the
 * pack's curve of yield by age. Observations (counts and sample weights
 * turned into a yield) update it, and observed damage reduces it.
 */

import { applyDamage, updateYieldEstimate, yieldFractionAtAge, type YieldEstimate } from '../core/yield'
import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, EnginePublication } from '../framework/types'

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface Forecast {
  estimate: YieldEstimate | null
  source: string | null
  missing: string[]
}

function forecast(state: BlockState, pack: PackContext): Forecast {
  const model = pack.pack.yield
  const cvRef = model?.prior_cv
  const cv = cvRef ? number(pack.params[cvRef.slice(1)]) : null

  let prior: YieldEstimate | null = null
  let source: string | null = null
  const missing: string[] = []

  const own = number(state.yield_block_estimate)
  const target = number(state.yield_mature_target)
  const age = number(state.age_years)
  if (own !== null) {
    prior = { mean: own, sd: cv === null ? null : cv * own }
    source = 'block_estimate'
  } else {
    if (target === null) missing.push("the farm's mature-yield target or an estimate for the block")
    if (age === null) missing.push('the planting year of the block')
    const curve = model?.age_curve ?? []
    if (curve.length === 0) missing.push('a curve of yield by age in the pack')
    const points = curve.map(p => ({ ageYears: p.age_years, fraction: number(pack.params[p.fraction.slice(1)]) }))
    for (const [i, p] of points.entries()) if (p.fraction === null) missing.push(`${curve[i].fraction} (to be sourced)`)
    if (missing.length === 0 && target !== null && age !== null) {
      const fraction = yieldFractionAtAge(points as { ageYears: number; fraction: number }[], age)
      if (fraction !== null) {
        const mean = target * fraction
        prior = { mean, sd: cv === null ? null : cv * mean }
        source = 'age_curve'
      }
    }
  }
  if (prior === null) return { estimate: null, source: null, missing }

  let estimate = prior
  const observations = Array.isArray(state.yield_observations) ? (state.yield_observations as YieldEstimate[]) : []
  for (const o of observations) {
    estimate = updateYieldEstimate(estimate, o)
    source = 'observations'
  }
  const damage = Array.isArray(state.yield_damage_fractions) ? (state.yield_damage_fractions as number[]) : []
  if (damage.length > 0) estimate = applyDamage(estimate, damage)
  return { estimate, source, missing: [] }
}

export const yieldForecastEngine: DecisionEngine = {
  engineId: 'yield_forecast',
  engineClass: 'seasonal',
  packRequirements: () => ['yield.components'],
  requiredState: () => ['yield_block_estimate', 'yield_mature_target', 'age_years', 'area_ha', 'price_per_yield_unit'],
  safeguards: () => [],

  publish(state, pack): EnginePublication {
    const f = forecast(state, pack)
    if (f.estimate === null) return { values: { yield_missing: f.missing } }
    const values: Record<string, unknown> = {
      expected_yield: f.estimate.mean,
      expected_yield_sd: f.estimate.sd,
      expected_yield_unit: pack.pack.crop.yield_unit,
      expected_yield_source: f.source,
      yield_missing: [],
    }
    // The money value of the block's crop: the base of every expected-loss figure.
    const area = number(state.area_ha)
    const price = number(state.price_per_yield_unit)
    if (area !== null && price !== null) values.crop_value = f.estimate.mean * area * price
    return { values }
  },

  diagnose(state): EngineDiagnosis {
    const missing = Array.isArray(state.yield_missing) ? (state.yield_missing as string[]) : []
    if (typeof state.expected_yield !== 'number') {
      return { ruleId: null, outcome: null, skipped: [], notes: [`No yield estimate. Missing: ${missing.join('; ')}`] }
    }
    const notes = [`${Math.round(state.expected_yield)} ${String(state.expected_yield_unit)} from ${String(state.expected_yield_source)}`]
    if (state.expected_yield_sd === null) notes.push('The uncertainty of the estimate is not known')
    if (typeof state.crop_value !== 'number') notes.push('No money value: the farm has no price set, or the block has no area')
    return { ruleId: null, outcome: 'estimated', skipped: [], notes }
  },

  // Sampling tasks come from the pack's sampling protocol, which no pack supplies yet.
  evaluate: () => [],
}
