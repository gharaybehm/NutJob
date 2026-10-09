/**
 * Basal crop coefficient from canopy cover and height (CDSS spec §A4.2;
 * Allen & Pereira 2009, Irrigation Science 28:17-34).
 *
 * Young perennial crops change fast, so Kcb is recomputed whenever ground
 * cover or height is re-measured. The multiplier, the stomatal-control
 * factor and the bare-soil minimum come from the pack; cover and height
 * come from the block.
 */

export interface DensityCoefficientInput {
  /** Effective fraction of ground covered or shaded by the canopy near solar noon, 0-1. */
  fcEff: number
  /** Mean plant height, m. */
  heightM: number
  /** Multiplier on fcEff that limits transpiration per unit ground area. */
  ml: number
}

/** Density coefficient Kd (Allen & Pereira 2009). */
export function densityCoefficient({ fcEff, heightM, ml }: DensityCoefficientInput): number {
  if (fcEff < 0 || fcEff > 1) throw new Error('fcEff must be between 0 and 1')
  if (heightM < 0) throw new Error('height must not be negative')
  return Math.min(1, ml * fcEff, Math.pow(fcEff, 1 / (1 + heightM)))
}

export interface KcbFullInput {
  heightM: number
  /** Stomatal-control adjustment, 0-1 (computed or tabulated for the crop in Allen & Pereira 2009). */
  fr: number
  /** Mean wind speed at 2 m (m/s) and mean minimum relative humidity (%) for the period. */
  wind2m?: number
  rhMin?: number
}

/** Kcb at full cover for a given height and climate (Allen & Pereira 2009). */
export function kcbFull({ heightM, fr, wind2m = 2, rhMin = 45 }: KcbFullInput): number {
  const standard = Math.min(1.0 + 0.1 * heightM, 1.2)
  const climate = (0.04 * (wind2m - 2) - 0.004 * (rhMin - 45)) * Math.pow(heightM / 3, 0.3)
  return fr * (standard + climate)
}

export interface KcbFromCoverInput extends DensityCoefficientInput, Omit<KcbFullInput, 'heightM'> {
  /** Minimum Kc for bare soil. */
  kcMin: number
  /** Kcb of an active ground cover between the plants, when there is one. */
  kcbCover?: number
}

/**
 * Kcb from cover and height (Allen & Pereira 2009), with the variant for a ground cover
 * present between the plants.
 */
export function kcbFromCover(input: KcbFromCoverInput): number {
  const kd = densityCoefficient(input)
  const full = kcbFull(input)
  if (input.kcbCover !== undefined) {
    const gain = full - input.kcbCover
    return input.kcbCover + kd * Math.max(gain, gain / 2)
  }
  return input.kcMin + kd * (full - input.kcMin)
}
