/**
 * Farm and block settings the decision engine reads: validation for the
 * setup forms. Plain module (not a "use server" file). The ranges mirror the
 * CHECK constraints in the decision-engine migrations, so a bad value is
 * refused with a readable message instead of a database error.
 *
 * An error is returned as a key; the form shows its translation
 * (`settings.decision.errors.<key>` in messages/*.json).
 */

export type SetupError =
  | 'canopyCover'
  | 'canopyHeight'
  | 'canopyDate'
  | 'wettedFraction'
  | 'expectedYield'
  | 'price'
  | 'currency'
  | 'labourHours'
  | 'dailyWater'
  | 'sprayers'
  | 'frostMethod'

export type SetupValidation<T> = { ok: true; value: T } | { ok: false; error: SetupError }

export const FROST_METHODS = ['water', 'wind_machine', 'heater'] as const
export type FrostMethod = (typeof FROST_METHODS)[number]

export const MAX_CANOPY_HEIGHT_M = 30
export const MAX_EXPECTED_YIELD_KG_HA = 100_000

/** null for empty, NaN for something that is not a number, else the number. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : Number.NaN
  }
  return Number.NaN
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const bad = (v: number | null, min: number, max: number, minExclusive = false) =>
  Number.isNaN(v) || (v !== null && (minExclusive ? v <= min : v < min)) || (v !== null && v > max)

export interface BlockSetup {
  /** Fraction of ground covered by the canopy, 0-1. */
  canopyCoverFraction: number | null
  canopyHeightM: number | null
  /** ISO date the canopy was measured. */
  canopyMeasuredOn: string | null
  /** Fraction of the surface the irrigation system wets, above 0 and up to 1. */
  wettedFraction: number | null
  expectedYieldKgHa: number | null
  /** The season the yield estimate is for; set with the estimate. */
  expectedYieldSeason: number | null
}

/**
 * `input` holds the form's fields: canopy cover and wetted fraction in
 * percent, as entered. `today` is the farm's date, for the season of a yield
 * estimate and to refuse a measurement dated in the future.
 */
export function validateBlockSetup(input: unknown, today: string): SetupValidation<BlockSetup> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const cover = toNum(raw.canopyCoverPct)
  if (bad(cover, 0, 100)) return { ok: false, error: 'canopyCover' }

  const height = toNum(raw.canopyHeightM)
  if (bad(height, 0, MAX_CANOPY_HEIGHT_M, true)) return { ok: false, error: 'canopyHeight' }

  const dateText = typeof raw.canopyMeasuredOn === 'string' ? raw.canopyMeasuredOn.trim() : ''
  let measuredOn: string | null = null
  if (dateText !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(Date.parse(`${dateText}T00:00:00Z`)) || dateText > today) {
      return { ok: false, error: 'canopyDate' }
    }
    measuredOn = dateText
  }

  const wetted = toNum(raw.wettedFractionPct)
  if (bad(wetted, 0, 100, true)) return { ok: false, error: 'wettedFraction' }

  const expectedYield = toNum(raw.expectedYieldKgHa)
  if (bad(expectedYield, 0, MAX_EXPECTED_YIELD_KG_HA)) return { ok: false, error: 'expectedYield' }

  return {
    ok: true,
    value: {
      canopyCoverFraction: cover === null ? null : round(cover / 100, 2),
      canopyHeightM: height === null ? null : round(height, 1),
      // A measurement entered without a date is dated today.
      canopyMeasuredOn: cover === null && height === null ? null : measuredOn ?? today,
      wettedFraction: wetted === null ? null : round(wetted / 100, 2),
      expectedYieldKgHa: expectedYield === null ? null : round(expectedYield, 1),
      expectedYieldSeason: expectedYield === null ? null : Number(today.slice(0, 4)),
    },
  }
}

export interface FarmSetup {
  pricePerYieldUnit: number | null
  /** ISO 4217 code; set with the price. */
  priceCurrency: string | null
  dailyLabourHours: number | null
  dailyWaterM3: number | null
  sprayerCount: number | null
  frostProtectionMethod: FrostMethod | null
}

export function validateFarmSetup(input: unknown): SetupValidation<FarmSetup> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const price = toNum(raw.pricePerYieldUnit)
  if (bad(price, 0, 1_000_000)) return { ok: false, error: 'price' }

  const currencyText = typeof raw.priceCurrency === 'string' ? raw.priceCurrency.trim().toUpperCase() : ''
  if (currencyText !== '' && !/^[A-Z]{3}$/.test(currencyText)) return { ok: false, error: 'currency' }
  // A price means nothing without its currency.
  if (price !== null && currencyText === '') return { ok: false, error: 'currency' }

  const labour = toNum(raw.dailyLabourHours)
  if (bad(labour, 0, 10_000)) return { ok: false, error: 'labourHours' }

  const water = toNum(raw.dailyWaterM3)
  if (bad(water, 0, 10_000_000)) return { ok: false, error: 'dailyWater' }

  const sprayers = toNum(raw.sprayerCount)
  if (bad(sprayers, 0, 1000) || (sprayers !== null && !Number.isInteger(sprayers))) return { ok: false, error: 'sprayers' }

  const methodText = typeof raw.frostProtectionMethod === 'string' ? raw.frostProtectionMethod.trim() : ''
  if (methodText !== '' && !(FROST_METHODS as readonly string[]).includes(methodText)) return { ok: false, error: 'frostMethod' }

  return {
    ok: true,
    value: {
      pricePerYieldUnit: price === null ? null : round(price, 4),
      priceCurrency: price === null ? null : currencyText,
      dailyLabourHours: labour === null ? null : round(labour, 1),
      dailyWaterM3: water === null ? null : round(water, 1),
      sprayerCount: sprayers,
      frostProtectionMethod: methodText === '' ? null : (methodText as FrostMethod),
    },
  }
}
