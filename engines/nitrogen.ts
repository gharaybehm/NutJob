/**
 * Nitrogen budget (plan §nutrition): how much nitrogen a block is expected to
 * need this year, in kg of N and kg of urea, split across the season, and how
 * much of it the fertigation log already accounts for.
 *
 * Pure. Deliberately simple and advisory:
 *  - The base is the UC Davis sample-cost study figure already used for tree age
 *    (`YOUNG_ORCHARD_SCHEDULE`): 250 lb N/ac at 2,800 lb/ac kernel for a mature
 *    orchard. That is a fertiliser-applied figure, so no efficiency factor is
 *    divided in (it would double count).
 *  - For a mature block it is scaled by the farm's yield target over the UC
 *    yield. Young blocks use the schedule's own N for their leaf year.
 *  - No soil credit and no water-N credit (the user's choice, 2026-09-21).
 * It is a guide for the manager and the agronomist, never an instruction.
 */
import { assessMaturity, YOUNG_ORCHARD_SCHEDULE, type MaturityAssessment } from './maturity'
import { cropSupports } from '@/utils/crops'

const KG_HA_PER_LB_AC = 1.12085
const UREA_N_FRACTION = 0.46

/** The farm's mature-tree kernel target, kg/ha. Editable per farm (farm_policy.n_yield_target_kg_ha). */
export const DEFAULT_KERNEL_TARGET_KG_HA = 2500

/**
 * Starting split of the annual N. NOT from a source: chosen as a sensible
 * spring / pre-hull-split / post-harvest shape, to be confirmed by the agronomist.
 */
export const DEFAULT_N_SPLIT: NitrogenSplitPart[] = [
  { label: 'Spring (Mar-Apr)', share: 0.3 },
  { label: 'Early summer (May-Jun)', share: 0.4 },
  { label: 'Post-harvest (Sep)', share: 0.3 },
]

export interface NitrogenSplitPart { label: string; share: number }

/** Reads a stored farm_policy.n_split; anything malformed means "not set" (undefined), so the default applies. */
export function parseNSplit(json: unknown): NitrogenSplitPart[] | undefined {
  if (!Array.isArray(json)) return undefined
  const parts = json.flatMap((p): NitrogenSplitPart[] => {
    const r = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    const share = Number(r.share)
    return typeof r.label === 'string' && r.label.trim() !== '' && Number.isFinite(share) && share > 0
      ? [{ label: r.label.trim(), share }]
      : []
  })
  return parts.length > 0 ? parts : undefined
}

export interface NitrogenInput {
  cropType: string | null | undefined
  plantingDate?: string | null
  plantingYear?: number | null
  areaHa: number | null
  /** Mature-tree kernel target, kg/ha. */
  yieldTargetKgHa?: number
  split?: NitrogenSplitPart[]
  now?: Date
}

export interface NitrogenBudget {
  supported: boolean
  /** What the reader must know before trusting the figures. */
  cautions: string[]
  maturity: MaturityAssessment | null
  /** Annual N, kg per hectare and for the whole block (null when the area is unknown). */
  nKgHa: number | null
  nKgBlock: number | null
  ureaKgHa: number | null
  ureaKgBlock: number | null
  yieldTargetKgHa: number | null
  split: { label: string; share: number; nKgBlock: number | null; ureaKgBlock: number | null }[]
  source: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function nitrogenBudget(input: NitrogenInput): NitrogenBudget {
  const now = input.now ?? new Date()
  const empty = (cautions: string[]): NitrogenBudget => ({
    supported: false, cautions, maturity: null, nKgHa: null, nKgBlock: null, ureaKgHa: null, ureaKgBlock: null,
    yieldTargetKgHa: null, split: [], source: YOUNG_ORCHARD_SCHEDULE.source,
  })
  if (!cropSupports(input.cropType, 'treeAge')) {
    return empty([`No nitrogen schedule is loaded for ${input.cropType ? `"${input.cropType}"` : 'this crop'}, so no budget is given and figures from another crop are not applied.`])
  }

  const maturity = assessMaturity({ plantingDate: input.plantingDate, plantingYear: input.plantingYear, cropType: input.cropType, now })
  const target = input.yieldTargetKgHa ?? DEFAULT_KERNEL_TARGET_KG_HA
  const ucYieldKgHa = YOUNG_ORCHARD_SCHEDULE.mature.kernelLbPerAcre * KG_HA_PER_LB_AC
  const ucNKgHa = YOUNG_ORCHARD_SCHEDULE.mature.nLbPerAcre * KG_HA_PER_LB_AC

  const cautions: string[] = [
    'Guide only: the UC Davis figure is an applied-nitrogen figure for California, with no credit for soil or irrigation-water nitrogen. Confirm the rate with your agronomist.',
  ]

  let nKgHa: number
  let yieldTargetKgHa: number | null = null
  if (maturity.class === 'mature' || maturity.class === 'unknown') {
    nKgHa = ucNKgHa * (target / ucYieldKgHa) * maturity.nFraction
    yieldTargetKgHa = target
    if (maturity.class === 'unknown') cautions.push('Tree age is not recorded, so the block is treated as mature. Set its planting date for a proper figure.')
  } else {
    // Young or not-yet-planted: the schedule's own N for the leaf year, independent of the mature target.
    nKgHa = ucNKgHa * maturity.nFraction
    cautions.push(`This block is "${maturity.label.toLowerCase()}", so the UC schedule's figure for its age is used, not the mature-tree yield target.`)
  }
  nKgHa = round1(nKgHa)
  const ureaKgHa = round1(nKgHa / UREA_N_FRACTION)

  const areaHa = input.areaHa !== null && input.areaHa > 0 ? input.areaHa : null
  if (areaHa === null) cautions.push('Block area is not recorded, so only per-hectare figures are shown.')
  const nKgBlock = areaHa === null ? null : round1(nKgHa * areaHa)
  const ureaKgBlock = areaHa === null ? null : round1(ureaKgHa * areaHa)

  const parts = input.split ?? DEFAULT_N_SPLIT
  const total = parts.reduce((s, p) => s + p.share, 0)
  const split = parts.map(p => {
    const share = total > 0 ? p.share / total : 0
    return {
      label: p.label,
      share: Math.round(share * 100) / 100,
      nKgBlock: nKgBlock === null ? null : round1(nKgBlock * share),
      ureaKgBlock: ureaKgBlock === null ? null : round1(ureaKgBlock * share),
    }
  })
  if (!input.split) cautions.push('The seasonal split is a starting shape, not from a source: set it in Settings with your agronomist.')

  return {
    supported: true, cautions, maturity, nKgHa, nKgBlock, ureaKgHa, ureaKgBlock, yieldTargetKgHa, split,
    source: YOUNG_ORCHARD_SCHEDULE.source,
  }
}

export interface FertigationLog {
  performedAt: string
  product: string | null
  amountPerTree: number | null
  unit: string | null
}

export interface NitrogenApplied {
  /** kg N from the urea entries counted. */
  nKg: number
  countedLogs: number
  /** Fertigations this year that could not be counted, with the reason. */
  skipped: { performedAt: string; product: string | null; reason: string }[]
}

/**
 * N already applied this calendar year, counting only entries that are clearly
 * urea in kg per tree. Anything else is listed as skipped rather than guessed.
 */
export function nitrogenApplied(logs: FertigationLog[], treeCount: number, year: number): NitrogenApplied {
  const out: NitrogenApplied = { nKg: 0, countedLogs: 0, skipped: [] }
  for (const l of logs) {
    if (!l.performedAt.startsWith(String(year))) continue
    const skip = (reason: string) => out.skipped.push({ performedAt: l.performedAt.slice(0, 10), product: l.product, reason })
    if (!l.product || !/urea|üre/i.test(l.product)) { skip('not recorded as urea, so its nitrogen is unknown'); continue }
    if (l.amountPerTree === null || l.unit !== 'kg') { skip('amount not recorded in kg per tree'); continue }
    if (!(treeCount > 0)) { skip('tree count not recorded'); continue }
    out.nKg += l.amountPerTree * treeCount * UREA_N_FRACTION
    out.countedLogs++
  }
  out.nKg = round1(out.nKg)
  return out
}

/** One line per fact for the AI context. */
export function describeNitrogenBudget(b: NitrogenBudget, applied: NitrogenApplied | null): string[] {
  if (!b.supported) return b.cautions.map(c => `[i] ${c}`)
  const lines = [
    `Nitrogen budget (guide): ${b.nKgHa} kg N/ha per year${b.nKgBlock !== null ? `, ${b.nKgBlock} kg N for the block` : ''} = ${b.ureaKgHa} kg urea/ha` +
      `${b.yieldTargetKgHa ? ` (mature kernel target ${b.yieldTargetKgHa} kg/ha)` : ''}; source ${b.source}`,
    ...b.split.map(s => `  ${s.label}: ${Math.round(s.share * 100)}%${s.nKgBlock !== null ? ` (${s.nKgBlock} kg N)` : ''}`),
  ]
  if (applied) {
    lines.push(`Urea fertigation logged this year: ${applied.nKg} kg N${b.nKgBlock !== null ? ` of ${b.nKgBlock}` : ''}` +
      `${applied.skipped.length ? ` (${applied.skipped.length} entries not counted: product or amount unclear)` : ''}`)
  }
  for (const c of b.cautions) lines.push(`[!] ${c}`)
  return lines
}
