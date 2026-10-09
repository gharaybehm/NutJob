/**
 * Salinity and leaching (CDSS spec §A4.8).
 *
 * Relative yield follows Maas & Hoffman (1977); the leaching requirement
 * follows FAO Irrigation & Drainage Paper 29 (Ayers & Westcot 1985). The
 * threshold and slope come from the pack.
 */

/** Relative yield (%) at soil salinity `ece` (dS/m): 100 - b * (ECe - a), held to 0-100. */
export function relativeYieldPct(ece: number, thresholdA: number, slopeB: number): number {
  return Math.max(0, Math.min(100, 100 - slopeB * Math.max(0, ece - thresholdA)))
}

/** Leaching requirement (fraction): ECw / (5 * ECe_target - ECw). */
export function leachingRequirement(ecw: number, eceTarget: number): number {
  if (ecw >= 5 * eceTarget) throw new Error('Water too saline for target ECe')
  return ecw / (5 * eceTarget - ecw)
}
