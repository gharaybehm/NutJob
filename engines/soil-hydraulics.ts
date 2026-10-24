/**
 * Soil water limits from a soil test's texture: field capacity (water held at
 * 33 kPa) and wilting point (1500 kPa), both volumetric %, the units the block
 * settings and the irrigation engine use.
 *
 * Saxton & Rawls 2006, Soil Sci. Soc. Am. J. 70:1569-1578, Table 1, equations
 * 1 and 2. The equations were fitted on soils with up to 8 % organic matter and
 * up to 60 % clay; outside that the estimate is refused, not stretched. Organic
 * matter is required: the paper's tables assume 2.5 %, and nothing is assumed
 * here.
 *
 * Soil physics only, no crop content. The result is a suggestion for a person
 * to accept into the block; it is never written on its own.
 */

export const SAXTON_RAWLS_2006 = 'Saxton & Rawls 2006, Soil Sci. Soc. Am. J. 70:1569 (equations 1 and 2)'

/** The fitted range of the equations. */
export const MAX_FITTED_CLAY_PCT = 60
export const MAX_FITTED_ORGANIC_MATTER_PCT = 8

export interface SoilTexture {
  sandPct: number | null
  clayPct: number | null
  organicMatterPct: number | null
}

export type WaterLimitsRefusal =
  | 'missing_sand'
  | 'missing_clay'
  | 'missing_organic_matter'
  | 'invalid_texture'
  | 'outside_fitted_range'

export type WaterLimitsEstimate =
  | { ok: true; fieldCapacityPct: number; wiltingPointPct: number; source: string }
  | { ok: false; reason: WaterLimitsRefusal }

const round1 = (n: number) => Math.round(n * 10) / 10

export function estimateWaterLimits(t: SoilTexture): WaterLimitsEstimate {
  const { sandPct, clayPct, organicMatterPct: om } = t
  if (sandPct == null) return { ok: false, reason: 'missing_sand' }
  if (clayPct == null) return { ok: false, reason: 'missing_clay' }
  if (om == null) return { ok: false, reason: 'missing_organic_matter' }
  if (![sandPct, clayPct, om].every(Number.isFinite) || sandPct < 0 || clayPct < 0 || om < 0 || sandPct + clayPct > 100) {
    return { ok: false, reason: 'invalid_texture' }
  }
  if (clayPct > MAX_FITTED_CLAY_PCT || om > MAX_FITTED_ORGANIC_MATTER_PCT) return { ok: false, reason: 'outside_fitted_range' }

  // The equations take sand and clay as fractions and organic matter as %.
  const s = sandPct / 100
  const c = clayPct / 100

  const t1500 = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * s * om - 0.013 * c * om + 0.068 * s * c + 0.031
  const theta1500 = t1500 + (0.14 * t1500 - 0.02)

  const t33 = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * s * om - 0.027 * c * om + 0.452 * s * c + 0.299
  const theta33 = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015)

  const fieldCapacityPct = round1(theta33 * 100)
  const wiltingPointPct = round1(theta1500 * 100)
  if (!(wiltingPointPct > 0 && fieldCapacityPct > wiltingPointPct)) return { ok: false, reason: 'outside_fitted_range' }
  return { ok: true, fieldCapacityPct, wiltingPointPct, source: SAXTON_RAWLS_2006 }
}
