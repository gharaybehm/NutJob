/**
 * Leaf-tissue nutrition (plan §3, nutrition domain): judges a leaf sample against
 * a crop's reference bands and says when the bands do not apply.
 *
 * Pure. Reference bands are DATA with a stated source, held per crop; a crop with
 * no bands gets "no reference loaded", never another crop's numbers. Almond bands
 * are the UC July critical values as commonly published, held here as PROVISIONAL:
 * only the nitrogen ceiling is from a document in the knowledge base (UC IPM).
 * Replace them with the lab's own limits when the lab supplies them.
 */
import { cropSupports, findCrop } from '@/utils/crops'
import { expectsCrop, type MaturityAssessment } from './maturity'

export type LeafStatus = 'deficient' | 'marginal' | 'adequate' | 'high'
export type LeafUnit = '%' | 'ppm'

export interface LeafBand {
  key: string
  symbol: string
  label: string
  unit: LeafUnit
  /** Below this the nutrient is deficient. Null when only an excess matters. */
  deficientBelow: number | null
  /** From here it is adequate; between `deficientBelow` and this it is marginal. */
  adequateFrom: number | null
  /** Above this it is high (excess or toxicity risk). Null when no ceiling is established. */
  highAbove: number | null
  /** Where the numbers come from. */
  source: string
  /** True when the figure is not from a document held in the knowledge base. */
  provisional: boolean
  note?: string
}

export interface LeafReference {
  crop: string
  /** Sampling window, [month, day] inclusive: the bands are for leaves taken in it. */
  window: { from: [number, number]; to: [number, number]; label: string }
  bands: LeafBand[]
  /** Nutrients the form can take that have no reference band, with the reason. */
  noBand: { key: string; symbol: string; label: string; unit: LeafUnit; reason: string }[]
}

const UC_PROVISIONAL = 'UC July critical values as commonly published (California); not a document held in the knowledge base'
const UC_IPM = 'UC IPM Almond Pest Management Guidelines (hull rot): July leaf nitrogen should be below 2.6%'

export const ALMOND_LEAF_REFERENCE: LeafReference = {
  crop: 'almond',
  window: { from: [7, 1], to: [8, 15], label: '1 July to 15 August (fully expanded spur leaves)' },
  bands: [
    { key: 'n', symbol: 'N', label: 'Nitrogen', unit: '%', deficientBelow: 2.0, adequateFrom: 2.2, highAbove: 2.6, source: `${UC_PROVISIONAL}; ceiling: ${UC_IPM}`, provisional: true,
      note: 'Above 2.6% favours hull rot (UC IPM).' },
    { key: 'p', symbol: 'P', label: 'Phosphorus', unit: '%', deficientBelow: 0.1, adequateFrom: 0.1, highAbove: null, source: UC_PROVISIONAL, provisional: true },
    { key: 'k', symbol: 'K', label: 'Potassium', unit: '%', deficientBelow: 1.0, adequateFrom: 1.0, highAbove: null, source: UC_PROVISIONAL, provisional: true,
      note: 'The July critical value is 1.0%; some California sources use 1.4% as a target.' },
    { key: 'b', symbol: 'B', label: 'Boron', unit: 'ppm', deficientBelow: 30, adequateFrom: 30, highAbove: 80, source: UC_PROVISIONAL, provisional: true,
      note: 'The range between deficiency and toxicity is narrow.' },
    { key: 'zn', symbol: 'Zn', label: 'Zinc', unit: 'ppm', deficientBelow: 15, adequateFrom: 15, highAbove: null, source: UC_PROVISIONAL, provisional: true },
    { key: 'mn', symbol: 'Mn', label: 'Manganese', unit: 'ppm', deficientBelow: 20, adequateFrom: 20, highAbove: null, source: UC_PROVISIONAL, provisional: true },
    { key: 'cu', symbol: 'Cu', label: 'Copper', unit: 'ppm', deficientBelow: 4, adequateFrom: 4, highAbove: null, source: UC_PROVISIONAL, provisional: true },
    { key: 'na', symbol: 'Na', label: 'Sodium', unit: '%', deficientBelow: null, adequateFrom: null, highAbove: 0.25, source: UC_PROVISIONAL, provisional: true,
      note: 'Toxicity ceiling; matters on saline or sodic wells.' },
    { key: 'cl', symbol: 'Cl', label: 'Chloride', unit: '%', deficientBelow: null, adequateFrom: null, highAbove: 0.3, source: UC_PROVISIONAL, provisional: true,
      note: 'Toxicity ceiling; matters on saline wells.' },
  ],
  noBand: [
    { key: 'ca', symbol: 'Ca', label: 'Calcium', unit: '%', reason: 'no established critical value for almond leaves' },
    { key: 'mg', symbol: 'Mg', label: 'Magnesium', unit: '%', reason: 'no established critical value for almond leaves' },
    { key: 'fe', symbol: 'Fe', label: 'Iron', unit: 'ppm', reason: 'total leaf iron does not separate healthy from chlorotic trees on limy soil' },
  ],
}

const REFERENCES: Record<string, LeafReference> = { almond: ALMOND_LEAF_REFERENCE }

const FIELD_ORDER = ['n', 'p', 'k', 'ca', 'mg', 'b', 'zn', 'mn', 'cu', 'fe', 'na', 'cl']

/** The reference for a crop, or null when the crop has none (or does not declare leaf nutrition). */
export function leafReferenceFor(cropName: string | null | undefined): LeafReference | null {
  if (!cropSupports(cropName, 'leafNutrition')) return null
  const profile = findCrop(cropName)
  return profile ? REFERENCES[profile.id] ?? null : null
}

/** Every nutrient the sample form can take for a crop, in display order. Empty when the crop has no reference. */
export function leafFormFields(cropName: string | null | undefined): { key: string; symbol: string; label: string; unit: LeafUnit }[] {
  const ref = leafReferenceFor(cropName)
  if (!ref) return []
  return [...ref.bands, ...ref.noBand]
    .map(({ key, symbol, label, unit }) => ({ key, symbol, label, unit }))
    .sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key))
}

export interface LeafResult {
  key: string
  symbol: string
  label: string
  unit: LeafUnit
  value: number
  status: LeafStatus
  /** Text of the band, for display. */
  bandText: string
  note?: string
  provisional: boolean
}

export interface LeafAssessment {
  /** False when the crop has no reference bands: nothing below is a judgement. */
  supported: boolean
  crop: string | null
  sampledAt: string | null
  /** True when the sample date falls in the reference sampling window. */
  inWindow: boolean
  windowLabel: string | null
  results: LeafResult[]
  /** Values entered that have no band, with the reason. */
  unjudged: { symbol: string; label: string; value: number; unit: string; reason: string }[]
  /** Things the reader must know before trusting the result. */
  cautions: string[]
  /** Worst status among the results, null when nothing was judged. */
  worst: LeafStatus | null
}

const RANK: Record<LeafStatus, number> = { adequate: 0, marginal: 1, high: 2, deficient: 3 }

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

function bandText(b: LeafBand): string {
  const parts: string[] = []
  if (b.deficientBelow !== null) parts.push(`deficient below ${fmt(b.deficientBelow)}`)
  if (b.adequateFrom !== null && b.adequateFrom !== b.deficientBelow) parts.push(`adequate from ${fmt(b.adequateFrom)}`)
  if (b.highAbove !== null) parts.push(`high above ${fmt(b.highAbove)}`)
  return `${parts.join(', ')} ${b.unit}`
}

export function judgeLeafValue(band: LeafBand, value: number): LeafStatus {
  if (band.highAbove !== null && value > band.highAbove) return 'high'
  if (band.deficientBelow !== null && value < band.deficientBelow) return 'deficient'
  if (band.adequateFrom !== null && value < band.adequateFrom) return 'marginal'
  return 'adequate'
}

function inWindow(ref: LeafReference, date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return false
  const at = Number(date.slice(5, 7)) * 100 + Number(date.slice(8, 10))
  return at >= ref.window.from[0] * 100 + ref.window.from[1] && at <= ref.window.to[0] * 100 + ref.window.to[1]
}

export interface LeafInput {
  cropType: string | null | undefined
  /** YYYY-MM-DD. */
  sampledAt: string
  /** Nutrient key (n, p, k, ...) to value in the form's unit (% or ppm). Non-numbers are ignored. */
  values: Record<string, unknown>
  maturity?: MaturityAssessment | null
}

export function assessLeafSample(input: LeafInput): LeafAssessment {
  const ref = leafReferenceFor(input.cropType)
  if (!ref) {
    return {
      supported: false, crop: null, sampledAt: input.sampledAt, inWindow: false, windowLabel: null,
      results: [], unjudged: [], worst: null,
      cautions: [`No leaf-tissue reference is loaded for ${input.cropType ? `"${input.cropType}"` : 'this crop'}: the values are recorded but not judged, and figures from another crop are not applied.`],
    }
  }

  const results: LeafResult[] = []
  const unjudged: LeafAssessment['unjudged'] = []
  for (const [key, raw] of Object.entries(input.values)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const band = ref.bands.find(b => b.key === key)
    if (band) {
      results.push({
        key, symbol: band.symbol, label: band.label, unit: band.unit, value: raw,
        status: judgeLeafValue(band, raw), bandText: bandText(band), note: band.note, provisional: band.provisional,
      })
      continue
    }
    const nb = ref.noBand.find(b => b.key === key)
    if (nb) unjudged.push({ symbol: nb.symbol, label: nb.label, value: raw, unit: nb.unit, reason: nb.reason })
  }
  results.sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key))

  const windowOk = inWindow(ref, input.sampledAt)
  const cautions: string[] = []
  if (!windowOk) {
    cautions.push(`Sampled outside the reference window (${ref.window.label}). Leaf values change through the season, so these judgements are indicative only.`)
  }
  if (input.maturity && input.maturity.class !== 'unknown' && !expectsCrop(input.maturity)) {
    cautions.push(`The reference bands are for bearing ${ref.crop} trees; this block is "${input.maturity.label}", so read the result as a guide, not a target.`)
  }
  if (results.some(r => r.provisional)) {
    cautions.push('Reference bands are provisional (UC values from general publication) until an agronomist or the lab confirms them.')
  }

  const worst = results.length === 0
    ? null
    : results.reduce<LeafStatus>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'adequate')
  return { supported: true, crop: ref.crop, sampledAt: input.sampledAt, inWindow: windowOk, windowLabel: ref.window.label, results, unjudged, cautions, worst }
}

/** One line per result for the AI context. */
export function describeLeafAssessment(a: LeafAssessment): string[] {
  if (!a.supported) return a.cautions.map(c => `[i] ${c}`)
  const lines = a.results.map(r =>
    `${r.symbol} ${fmt(r.value)} ${r.unit}: ${r.status} (${r.bandText})${r.note && r.status !== 'adequate' ? ` — ${r.note}` : ''}`)
  for (const u of a.unjudged) lines.push(`${u.symbol} ${fmt(u.value)} ${u.unit}: not judged (${u.reason})`)
  for (const c of a.cautions) lines.push(`[!] ${c}`)
  return lines
}
