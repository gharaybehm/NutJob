/**
 * Yield estimate with uncertainty (CDSS spec §A6.11): a prior from the
 * block's history and age, updated by observations and reduced by damage
 * events. Every engine's expected loss depends on it.
 */

export interface YieldEstimate {
  /** Expected yield in the pack's yield unit per hectare. */
  mean: number
  /** Standard deviation of the estimate; null when the uncertainty is not known. */
  sd: number | null
}

/**
 * Bayesian update of a normal estimate with a normal observation. When
 * either side has no stated uncertainty, weighting is impossible: an
 * observation then replaces the prior, since an observed value overrides a
 * predicted one.
 */
export function updateYieldEstimate(prior: YieldEstimate, observation: YieldEstimate): YieldEstimate {
  if (prior.sd === null || observation.sd === null) return { ...observation }
  if (observation.sd === 0) return { ...observation }
  if (prior.sd === 0) return { ...prior }
  const wPrior = 1 / (prior.sd * prior.sd)
  const wObs = 1 / (observation.sd * observation.sd)
  return {
    mean: (prior.mean * wPrior + observation.mean * wObs) / (wPrior + wObs),
    sd: Math.sqrt(1 / (wPrior + wObs)),
  }
}

/** Reduces an estimate by observed damage fractions (frost, pest, disease), applied one after another. */
export function applyDamage(estimate: YieldEstimate, damageFractions: number[]): YieldEstimate {
  let remaining = 1
  for (const f of damageFractions) {
    if (f < 0 || f > 1) throw new Error('a damage fraction must be between 0 and 1')
    remaining *= 1 - f
  }
  return { mean: estimate.mean * remaining, sd: estimate.sd === null ? null : estimate.sd * remaining }
}

export interface AgeCurvePoint {
  ageYears: number
  /** Fraction of the mature yield at this age, 0-1. */
  fraction: number
}

/**
 * Fraction of the mature yield at an age, read from the pack's curve: the
 * point at or below the age, the last point beyond the curve, and zero
 * before the first point.
 */
export function yieldFractionAtAge(curve: AgeCurvePoint[], ageYears: number): number | null {
  if (curve.length === 0) return null
  const sorted = [...curve].sort((a, b) => a.ageYears - b.ageYears)
  let fraction = 0
  for (const point of sorted) {
    if (point.ageYears <= ageYears) fraction = point.fraction
  }
  return fraction
}

/** Yield from components, such as units per plant x unit weight x plants per hectare. */
export function yieldFromComponents(unitsPerPlant: number, unitWeightKg: number, plantsPerHa: number): number {
  return unitsPerPlant * unitWeightKg * plantsPerHa
}
