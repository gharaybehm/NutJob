/**
 * Tissue analysis against the pack's bands (CDSS spec §A6.3 step 4).
 *
 * A band gives up to four limits for one nutrient in one tissue. Any limit
 * the pack does not give is simply not judged: a value is never called
 * deficient or excessive without a published limit behind it.
 */

export interface TissueBand {
  deficientBelow: number | null
  adequateFrom: number | null
  adequateTo: number | null
  excessiveAbove: number | null
}

export type TissueStatus = 'deficient' | 'low' | 'adequate' | 'high' | 'excessive' | 'not_judged'

export function classifyTissue(value: number, band: TissueBand): TissueStatus {
  const { deficientBelow, adequateFrom, adequateTo, excessiveAbove } = band
  if (deficientBelow !== null && value < deficientBelow) return 'deficient'
  if (excessiveAbove !== null && value > excessiveAbove) return 'excessive'
  if (adequateFrom !== null && value < adequateFrom) return 'low'
  if (adequateTo !== null && value > adequateTo) return 'high'
  if (adequateFrom === null && adequateTo === null) return 'not_judged'
  return 'adequate'
}
