/**
 * Nutrient budget (CDSS spec §A4.9).
 *
 * Annual demand = (yield x removal + growth requirement - credits) / efficiency,
 * then split across the season by the pack's phase shares. Removal
 * coefficients, growth requirement and shares come from the pack; yield,
 * credits and efficiency come from the farm.
 */

export interface NutrientDemandInput {
  expectedYieldKgHa: number
  /** Nutrient removed per kg of harvested product (kg/kg). */
  removalKgPerKg: number
  /** Structural growth requirement for the crop's age (kg/ha). */
  growthKgHa?: number
  /** Nutrient supplied by irrigation water, residual soil and organic inputs (kg/ha). */
  creditsKgHa?: number
  /** Fertiliser use efficiency, 0-1. */
  efficiency: number
}

export function annualNutrientDemandKgHa(input: NutrientDemandInput): number {
  const { expectedYieldKgHa, removalKgPerKg, growthKgHa = 0, creditsKgHa = 0, efficiency } = input
  if (!(efficiency > 0 && efficiency <= 1)) throw new Error('efficiency must be above 0 and at most 1')
  const need = expectedYieldKgHa * removalKgPerKg + growthKgHa - creditsKgHa
  return Math.max(0, need) / efficiency
}

/** Splits an annual amount by phase. Shares are fractions and must sum to 1. */
export function splitByPhase(annualKgHa: number, phaseShares: Record<string, number>): Record<string, number> {
  const total = Object.values(phaseShares).reduce((a, b) => a + b, 0)
  if (Math.abs(total - 1) > 1e-6) throw new Error('phase shares must sum to 1')
  return Object.fromEntries(Object.entries(phaseShares).map(([phase, share]) => [phase, annualKgHa * share]))
}
