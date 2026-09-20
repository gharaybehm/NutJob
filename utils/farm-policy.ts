/**
 * Farm policy and block soil settings: defaults and validation. Plain module
 * (not a "use server" file, which may only export async functions). The ranges
 * mirror the CHECK constraints in the farm_policy migration, so a bad value is
 * refused with a readable message instead of a database error.
 */

export interface FarmPolicyInput {
  irrigationStrategyName: string
  allowableDepletion: number
  irrigationEfficiency: number
  defaultRootDepthM: number | null
  wellLicenceVolumeM3: number | null
  wellLicenceSeasonYear: number | null
  frostMarginC: number
  sensorFailedAfterHours: number
}

/** Starting values only. FAO-56 gives p = 0.40 for almond; drip is about 0.90 efficient. */
export const POLICY_DEFAULTS: FarmPolicyInput = {
  irrigationStrategyName: 'full',
  allowableDepletion: 0.4,
  irrigationEfficiency: 0.9,
  defaultRootDepthM: null,
  wellLicenceVolumeM3: null,
  wellLicenceSeasonYear: null,
  frostMarginC: 2,
  sensorFailedAfterHours: 24,
}

export const MAX_ROOT_DEPTH_M = 5

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

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

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export function validateFarmPolicy(input: unknown): Validation<FarmPolicyInput> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const name = typeof raw.irrigationStrategyName === 'string' ? raw.irrigationStrategyName.trim() : ''
  if (name.length === 0 || name.length > 40) return fail('Strategy name must be 1 to 40 characters.')

  const depletion = toNum(raw.allowableDepletion)
  if (depletion === null || Number.isNaN(depletion) || depletion <= 0 || depletion > 1) {
    return fail('Allowable depletion must be a number above 0 and up to 1 (for example 0.40).')
  }

  const efficiency = toNum(raw.irrigationEfficiency)
  if (efficiency === null || Number.isNaN(efficiency) || efficiency <= 0 || efficiency > 1) {
    return fail('Application efficiency must be a number above 0 and up to 1 (for example 0.90).')
  }

  const rootDepth = toNum(raw.defaultRootDepthM)
  if (Number.isNaN(rootDepth) || (rootDepth !== null && (rootDepth <= 0 || rootDepth > MAX_ROOT_DEPTH_M))) {
    return fail(`Root depth must be above 0 and at most ${MAX_ROOT_DEPTH_M} m, or left empty.`)
  }

  const volume = toNum(raw.wellLicenceVolumeM3)
  if (Number.isNaN(volume) || (volume !== null && volume < 0)) {
    return fail('Well licence volume must be zero or more, or left empty.')
  }

  const year = toNum(raw.wellLicenceSeasonYear)
  if (Number.isNaN(year) || (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100))) {
    return fail('Licence season must be a four-digit year, or left empty.')
  }

  const margin = toNum(raw.frostMarginC)
  if (margin === null || Number.isNaN(margin) || margin < 0 || margin > 10) {
    return fail('Frost alert margin must be between 0 and 10 °C.')
  }

  const hours = toNum(raw.sensorFailedAfterHours)
  if (hours === null || Number.isNaN(hours) || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    return fail('Sensor failure time must be a whole number of hours from 1 to 168.')
  }

  return {
    ok: true,
    value: {
      irrigationStrategyName: name,
      allowableDepletion: round(depletion, 2),
      irrigationEfficiency: round(efficiency, 2),
      defaultRootDepthM: rootDepth === null ? null : round(rootDepth, 1),
      wellLicenceVolumeM3: volume === null ? null : Math.round(volume),
      wellLicenceSeasonYear: year,
      frostMarginC: round(margin, 1),
      sensorFailedAfterHours: hours,
    },
  }
}

export interface BlockConfigInput {
  fieldCapacity: number | null
  wiltingPoint: number | null
  rootDepthM: number | null
  notes: string | null
}

export function validateBlockConfig(input: unknown): Validation<BlockConfigInput> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const fc = toNum(raw.fieldCapacity)
  const wp = toNum(raw.wiltingPoint)
  for (const [label, v] of [['Field capacity', fc], ['Wilting point', wp]] as const) {
    if (Number.isNaN(v) || (v !== null && (v < 0 || v > 100))) return fail(`${label} must be between 0 and 100 %, or left empty.`)
  }
  if (fc !== null && wp !== null && wp >= fc) return fail('Wilting point must be lower than field capacity.')

  const depth = toNum(raw.rootDepthM)
  if (Number.isNaN(depth) || (depth !== null && (depth <= 0 || depth > MAX_ROOT_DEPTH_M))) {
    return fail(`Root depth must be above 0 and at most ${MAX_ROOT_DEPTH_M} m, or left empty.`)
  }

  const notes = typeof raw.notes === 'string' && raw.notes.trim() !== '' ? raw.notes.trim() : null
  return { ok: true, value: { fieldCapacity: fc, wiltingPoint: wp, rootDepthM: depth === null ? null : round(depth, 1), notes } }
}
