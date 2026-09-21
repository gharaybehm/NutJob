/**
 * Tree maturity (plan §3, block profile): how old the orchard is and whether it
 * can be expected to bear a crop. A block planted in Q4 2025 is in its first
 * leaf year in 2026 and has no crop, so harvest windows and mature-orchard
 * water demand do not apply to it.
 *
 * Pure. The schedule below is data with a stated source, not a rule of thumb.
 */

import { cropSupports } from '@/utils/crops'

export type MaturityClass = 'unknown' | 'not_planted' | 'non_bearing' | 'young_bearing' | 'mature'

/**
 * UC Davis Agricultural Issues Center, "2024 Sample Costs to Establish an
 * Orchard and Produce Almonds, San Joaquin Valley South" (double-line drip),
 * Table A, "Production Information". Year 1 is the first growing season after
 * planting. The study states almonds "begin bearing an economic crop in the
 * third year after planting".
 */
export const YOUNG_ORCHARD_SCHEDULE = {
  source:
    'UC Davis 2024 Sample Costs to Establish an Orchard and Produce Almonds, San Joaquin Valley South, Table A',
  caveat:
    'This schedule is from UC Davis (California, 130 trees per acre, planted in winter). A denser Anatolian orchard may fill its canopy and bear sooner: treat it as a starting estimate and confirm with your agronomist.',
  /** The "Prod" (full production) row. */
  mature: { waterInchesPerYear: 52, kernelLbPerAcre: 2800, nLbPerAcre: 250 },
  years: [
    { leafYear: 1, waterInches: 5, kernelLb: 0, nLb: 30 },
    { leafYear: 2, waterInches: 16, kernelLb: 0, nLb: 30 },
    { leafYear: 3, waterInches: 26, kernelLb: 600, nLb: 80 },
    { leafYear: 4, waterInches: 47, kernelLb: 1200, nLb: 100 },
    { leafYear: 5, waterInches: 52, kernelLb: 2400, nLb: 200 },
  ],
} as const

/** First leaf year of the "Prod" row. */
export const FULL_PRODUCTION_LEAF_YEAR = 6

export interface MaturityInput {
  /** YYYY-MM-DD, when the trees went into the ground. */
  plantingDate?: string | null
  /** Used only when there is no date. Read as the last quarter (Sep to Dec) of that year. */
  plantingYear?: number | null
  /** The block's crop as typed. Left out, it is read as almond (the crop the schedule below is for). */
  cropType?: string | null
  now?: Date
}

export interface MaturityAssessment {
  class: MaturityClass
  /** Growing seasons since planting: 1 is the first leaf year. Null when unknown. */
  leafYear: number | null
  ageMonths: number | null
  /** True when the date was assumed from a year alone. */
  assumed: boolean
  /** The date used, YYYY-MM-DD. */
  plantingDate: string | null
  /** Water use as a share of a mature orchard (applied-water ratio); 1 when mature or unknown. */
  waterFraction: number
  /** Expected crop as a share of full production. */
  yieldFraction: number
  /** Nitrogen applied as a share of the mature rate. */
  nFraction: number
  label: string
  notes: string[]
  source: string
}

/** A year given alone is read as Q4 (Sep 1 to Dec 31): this is its midpoint. */
export const ASSUMED_PLANTING_MONTH_DAY = '11-01'
/** Planting in August or later leafs out the following spring. */
const LATE_PLANTING_MONTH = 8

const round2 = (n: number) => Math.round(n * 100) / 100

function parseDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function wholeMonths(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) m -= 1
  return Math.max(0, m)
}

const UNKNOWN: MaturityAssessment = {
  class: 'unknown',
  leafYear: null,
  ageMonths: null,
  assumed: false,
  plantingDate: null,
  waterFraction: 1,
  yieldFraction: 1,
  nFraction: 1,
  label: 'Planting date not recorded',
  notes: ['Planting date not recorded, so mature trees are assumed'],
  source: YOUNG_ORCHARD_SCHEDULE.source,
}

export function assessMaturity(input: MaturityInput): MaturityAssessment {
  const now = input.now ?? new Date()
  const crop = input.cropType === undefined ? 'almond' : input.cropType
  if (!cropSupports(crop, 'treeAge')) {
    // The schedule is almond data: never apply it to another crop.
    return {
      ...UNKNOWN,
      label: 'No tree-age schedule for this crop',
      notes: [`No tree-age schedule is loaded for ${crop ? `"${crop}"` : 'this crop'}, so age-based adjustments are not applied`],
    }
  }
  let planted = parseDate(input.plantingDate)
  let assumed = false

  if (!planted && input.plantingYear != null && Number.isInteger(input.plantingYear) && input.plantingYear > 1900) {
    planted = parseDate(`${input.plantingYear}-${ASSUMED_PLANTING_MONTH_DAY}`)
    assumed = true
  }
  if (!planted) return { ...UNKNOWN }

  const plantingDate = planted.toISOString().slice(0, 10)
  const notes: string[] = []
  if (assumed) {
    notes.push(`Only the year was recorded, so planting is assumed to be in the last quarter (Sep to Dec) of ${input.plantingYear}`)
  }

  if (planted.getTime() > now.getTime()) {
    return {
      ...UNKNOWN,
      class: 'not_planted',
      assumed,
      plantingDate,
      waterFraction: 0,
      yieldFraction: 0,
      nFraction: 0,
      label: 'Not planted yet',
      notes: [...notes, 'The planting date is in the future'],
    }
  }

  const firstLeafYear = planted.getUTCMonth() + 1 >= LATE_PLANTING_MONTH ? planted.getUTCFullYear() + 1 : planted.getUTCFullYear()
  const leafYear = now.getUTCFullYear() - firstLeafYear + 1 // 0 in the first winter after a late planting
  const ageMonths = wholeMonths(planted, now)
  const rowYear = Math.min(Math.max(leafYear, 1), FULL_PRODUCTION_LEAF_YEAR)
  const m = YOUNG_ORCHARD_SCHEDULE.mature

  let waterFraction = 1
  let yieldFraction = 1
  let nFraction = 1
  if (rowYear < FULL_PRODUCTION_LEAF_YEAR) {
    const row = YOUNG_ORCHARD_SCHEDULE.years[rowYear - 1]
    waterFraction = round2(row.waterInches / m.waterInchesPerYear)
    yieldFraction = round2(row.kernelLb / m.kernelLbPerAcre)
    nFraction = round2(row.nLb / m.nLbPerAcre)
  }

  const cls: MaturityClass = leafYear <= 2 ? 'non_bearing' : leafYear < FULL_PRODUCTION_LEAF_YEAR ? 'young_bearing' : 'mature'
  if (cls !== 'mature') notes.push(YOUNG_ORCHARD_SCHEDULE.caveat)

  const label =
    cls === 'non_bearing' ? `Leaf year ${Math.max(leafYear, 1)}, not bearing yet` :
    cls === 'young_bearing' ? `Leaf year ${leafYear}, young bearing (${Math.round(yieldFraction * 100)}% of full crop expected)` :
    `Leaf year ${leafYear}, mature`

  return { class: cls, leafYear, ageMonths, assumed, plantingDate, waterFraction, yieldFraction, nFraction, label, notes, source: YOUNG_ORCHARD_SCHEDULE.source }
}

/** True when a harvest window should be shown for this block. */
export function expectsCrop(m: MaturityAssessment): boolean {
  return m.class === 'young_bearing' || m.class === 'mature' || m.class === 'unknown'
}
