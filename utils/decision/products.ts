/**
 * The farm's product library: validation of a product entered from its
 * label, and which label values are still missing. Plain module (not a "use
 * server" file).
 *
 * The spray safeguards take every limit from the library and assume none,
 * so a value left empty is allowed here: the product is then blocked by the
 * safeguard that needs it, and the form says which.
 */

export const PRODUCT_TYPES = ['insecticide', 'fungicide', 'herbicide', 'acaricide', 'fertiliser', 'other'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export type ProductError = 'name' | 'type' | 'targets' | 'crops' | 'wind' | 'windOrder' | 'rainfast' | 'phi' | 'rei' | 'maxApplications' | 'nutrients'

export interface ProductInput {
  name: string
  productType: ProductType
  activeIngredient: string | null
  modeOfActionGroup: string | null
  targets: string[]
  registeredCrops: string[]
  registrationNumber: string | null
  maxWindMs: number | null
  minWindMs: number | null
  rainfastHours: number | null
  phiDays: number | null
  reiHours: number | null
  maxApplicationsPerSeason: number | null
  beeToxic: boolean | null
  /** Percent of each nutrient, by symbol. */
  nutrientContent: Record<string, number> | null
  notes: string | null
}

export type ProductValidation = { ok: true; value: ProductInput } | { ok: false; error: ProductError }

/** null for empty, NaN for something that is not a number, else the number. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : Number.NaN
  }
  return Number.NaN
}

const textOrNull = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const outside = (v: number | null, min: number, max: number) => Number.isNaN(v) || (v !== null && (v < min || v > max))
const ID = /^[a-z][a-z0-9_]*$/

export function validateProduct(input: unknown): ProductValidation {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const name = textOrNull(raw.name, 120)
  if (name === null) return { ok: false, error: 'name' }
  if (typeof raw.productType !== 'string' || !(PRODUCT_TYPES as readonly string[]).includes(raw.productType)) return { ok: false, error: 'type' }

  const list = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return []
    const items = [...new Set(v.map(x => (typeof x === 'string' ? x.trim() : '')).filter(x => x !== ''))]
    return items.every(x => ID.test(x)) ? items : null
  }
  const targets = list(raw.targets)
  if (targets === null) return { ok: false, error: 'targets' }
  const registeredCrops = list(raw.registeredCrops)
  if (registeredCrops === null) return { ok: false, error: 'crops' }

  const maxWind = toNum(raw.maxWindMs)
  const minWind = toNum(raw.minWindMs)
  if (outside(maxWind, 0, 50) || outside(minWind, 0, 50)) return { ok: false, error: 'wind' }
  if (maxWind !== null && minWind !== null && minWind > maxWind) return { ok: false, error: 'windOrder' }

  const rainfast = toNum(raw.rainfastHours)
  if (outside(rainfast, 0, 720)) return { ok: false, error: 'rainfast' }
  const phi = toNum(raw.phiDays)
  if (outside(phi, 0, 365) || (phi !== null && !Number.isInteger(phi))) return { ok: false, error: 'phi' }
  const rei = toNum(raw.reiHours)
  if (outside(rei, 0, 2000)) return { ok: false, error: 'rei' }
  const maxApplications = toNum(raw.maxApplicationsPerSeason)
  if (outside(maxApplications, 0, 100) || (maxApplications !== null && !Number.isInteger(maxApplications))) return { ok: false, error: 'maxApplications' }

  let nutrientContent: Record<string, number> | null = null
  if (raw.nutrientContent && typeof raw.nutrientContent === 'object' && !Array.isArray(raw.nutrientContent)) {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw.nutrientContent as Record<string, unknown>)) {
      const n = toNum(v)
      if (n === null) continue
      if (Number.isNaN(n) || n < 0 || n > 100 || !/^[A-Za-z][A-Za-z0-9]{0,5}$/.test(k)) return { ok: false, error: 'nutrients' }
      out[k] = n
    }
    if (Object.values(out).reduce((a, b) => a + b, 0) > 100) return { ok: false, error: 'nutrients' }
    nutrientContent = Object.keys(out).length > 0 ? out : null
  }

  return {
    ok: true,
    value: {
      name,
      productType: raw.productType as ProductType,
      activeIngredient: textOrNull(raw.activeIngredient, 200),
      modeOfActionGroup: textOrNull(raw.modeOfActionGroup, 20),
      targets,
      registeredCrops,
      registrationNumber: textOrNull(raw.registrationNumber, 60),
      maxWindMs: maxWind,
      minWindMs: minWind,
      rainfastHours: rainfast,
      phiDays: phi,
      reiHours: rei,
      maxApplicationsPerSeason: maxApplications,
      beeToxic: typeof raw.beeToxic === 'boolean' ? raw.beeToxic : null,
      nutrientContent,
      notes: textOrNull(raw.notes, 1000),
    },
  }
}

/** The label values a spray safeguard needs, each with the safeguard that blocks the product without it. */
export const LABEL_VALUES: { field: keyof ProductInput; safeguardId: string }[] = [
  { field: 'maxWindMs', safeguardId: 'SG-SPR-1' },
  { field: 'minWindMs', safeguardId: 'SG-SPR-2' },
  { field: 'rainfastHours', safeguardId: 'SG-SPR-3' },
  { field: 'phiDays', safeguardId: 'SG-SPR-4' },
  { field: 'reiHours', safeguardId: 'SG-SPR-5' },
  { field: 'maxApplicationsPerSeason', safeguardId: 'SG-SPR-6' },
  { field: 'beeToxic', safeguardId: 'SG-SPR-8' },
]

/** Label values still missing on a product that is sprayed. A fertiliser needs none of them. */
export function missingLabelValues(product: Pick<ProductInput, 'productType'> & Partial<ProductInput>): { field: keyof ProductInput; safeguardId: string }[] {
  if (product.productType === 'fertiliser') return []
  const missing = LABEL_VALUES.filter(l => product[l.field] === null || product[l.field] === undefined)
  // A product registered for no crop is blocked everywhere by SG-SPR-7.
  if (!product.registeredCrops || product.registeredCrops.length === 0) missing.push({ field: 'registeredCrops', safeguardId: 'SG-SPR-7' })
  return missing
}
