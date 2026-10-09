/**
 * Daily root-zone soil water balance, FAO-56 dual crop coefficient method
 * (CDSS spec §A4.2; Allen et al. 1998, chapters 7 and 8).
 *
 * One call advances the balance by one day. The basal coefficient, plant
 * height, ground cover and root depth are inputs for each day: the caller
 * takes them from the pack's Kcb curve or derives Kcb from cover and height
 * (`kcb.ts`). Nothing here is specific to a crop.
 *
 * The step follows pyfao56 1.4 (Thorp 2022) line for line, with its default
 * options, and is checked against its output
 * (`__fixtures__/water-balance-pyfao56.json`).
 */

export interface WaterBalanceSoil {
  /** Volumetric water content at field capacity and wilting point, m3/m3. */
  thetaFC: number
  thetaWP: number
  /** Depth of the surface evaporation layer, m. */
  zeM: number
  /** Readily evaporable water, mm. */
  rewMm: number
  /** Depletion fraction p at ETc = 5 mm/day (from the pack). */
  pBase: number
  /** Keep p constant instead of adjusting it for ETc (FAO-56 p. 162). */
  constantP?: boolean
}

export interface WaterBalanceState {
  /** Root-zone depletion, mm. */
  Dr: number
  /** Cumulative depth of evaporation from the surface layer, mm. */
  De: number
  /** Fraction of the soil surface wetted by the last wetting event. */
  fw: number
}

export interface WaterBalanceDay {
  /** Reference evapotranspiration, mm. */
  et0: number
  /** Rain, mm. */
  rain: number
  /** Gross irrigation depth applied, mm. */
  irrigation: number
  /** Application efficiency, 0-1. */
  efficiency: number
  /** Fraction of the surface wetted by the irrigation system; used on irrigation days. */
  fwIrrigation: number | null
  /** Basal crop coefficient for the day. */
  kcb: number
  /** Plant height, m. */
  heightM: number
  /** Fraction of ground covered by the canopy, 0-0.99. */
  fc: number
  /** Effective root depth, m. */
  rootDepthM: number
  /** Wind speed at 2 m (m/s) and minimum relative humidity (%). */
  wind2m: number
  rhMin: number
}

export interface WaterBalanceResult {
  state: WaterBalanceState
  /** Upper limit on evaporation plus transpiration, FAO-56 Eq. 72. */
  kcMax: number
  /** Exposed and wetted soil fraction, Eq. 75. */
  few: number
  /** Evaporation reduction coefficient, Eq. 74. */
  kr: number
  /** Soil evaporation coefficient, Eq. 71. */
  ke: number
  /** Soil evaporation, mm. */
  evaporation: number
  /** Crop ET without water stress, mm (Eq. 69). */
  etc: number
  /** Total and readily available water, mm (Eqs. 82 and 83), and the depletion fraction used. */
  taw: number
  raw: number
  p: number
  /** Water stress coefficient at the start of the day, Eq. 84. */
  ks: number
  /** Actual crop ET, mm (Eq. 80). */
  eta: number
  /** Deep percolation below the root zone, mm (Eq. 88). */
  deepPercolation: number
}

const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Total evaporable water of the surface layer, mm (FAO-56 Eq. 73). */
export function totalEvaporableWater(soil: Pick<WaterBalanceSoil, 'thetaFC' | 'thetaWP' | 'zeM'>): number {
  return 1000 * (soil.thetaFC - 0.5 * soil.thetaWP) * soil.zeM
}

/** Total available water in the root zone, mm (FAO-56 Eq. 82). */
export function totalAvailableWater(thetaFC: number, thetaWP: number, rootDepthM: number): number {
  return 1000 * (thetaFC - thetaWP) * rootDepthM
}

/** Root-zone depletion implied by a measured water content, mm (FAO-56 Eq. 87). */
export function depletionFromWaterContent(theta: number, thetaFC: number, thetaWP: number, rootDepthM: number): number {
  return clamp(0, 1000 * (thetaFC - theta) * rootDepthM, totalAvailableWater(thetaFC, thetaWP, rootDepthM))
}

/** Advances the balance by one day. */
export function stepWaterBalance(prev: WaterBalanceState, day: WaterBalanceDay, soil: WaterBalanceSoil): WaterBalanceResult {
  if (soil.thetaFC <= soil.thetaWP) throw new Error('field capacity must be above wilting point')
  const tew = totalEvaporableWater(soil)

  const u2 = clamp(1, day.wind2m, 6)
  const rhMin = clamp(20, day.rhMin, 80)
  const kcMax = Math.max(
    1.2 + (0.04 * (u2 - 2) - 0.004 * (rhMin - 45)) * Math.pow(day.heightM / 3, 0.3),
    day.kcb + 0.05,
  )

  const effIrrigation = day.irrigation * day.efficiency
  const effRain = day.rain

  // Fraction of the surface wetted (FAO-56 Table 20): the system's value on an
  // irrigation day, the whole surface after meaningful rain, otherwise unchanged.
  let fw = prev.fw
  if (day.irrigation > 0) {
    if (day.fwIrrigation === null) throw new Error('fwIrrigation is required on an irrigation day')
    fw = day.fwIrrigation
  } else if (day.rain >= 3) {
    fw = 1
  }

  const few = clamp(0.01, Math.min(1 - day.fc, fw), 1)
  const kr = clamp(0, (tew - prev.De) / (tew - soil.rewMm), 1)
  const ke = Math.min(kr * (kcMax - day.kcb), few * kcMax)
  const evaporation = ke * day.et0

  const dpe = Math.max(effRain + effIrrigation / fw - prev.De, 0)
  const De = clamp(0, prev.De - effRain - effIrrigation / fw + evaporation / few + dpe, tew)

  const etc = (ke + day.kcb) * day.et0

  const taw = totalAvailableWater(soil.thetaFC, soil.thetaWP, day.rootDepthM)
  const p = soil.constantP ? soil.pBase : clamp(0.1, soil.pBase + 0.04 * (5 - etc), 0.8)
  const raw = p * taw
  const ks = clamp(0, (taw - prev.Dr) / (taw - raw), 1)
  const eta = (ks * day.kcb + ke) * day.et0

  const deepPercolation = Math.max(effRain + effIrrigation - eta - prev.Dr, 0)
  const Dr = clamp(0, prev.Dr - effRain - effIrrigation + eta + deepPercolation, taw)

  return { state: { Dr, De, fw }, kcMax, few, kr, ke, evaporation, etc, taw, raw, p, ks, eta, deepPercolation }
}

export interface AssimilationResult {
  /** Depletion to carry forward, mm. */
  Dr: number
  /** Measured minus modelled depletion, mm. */
  gapMm: number
  /** True when the measurement replaced the modelled value. */
  corrected: boolean
}

/**
 * Sensor fusion: a validated measurement of root-zone depletion replaces the
 * modelled value. Readings that failed sensor validation must not be passed
 * here. The gap is returned so persistent disagreement can be detected.
 */
export function assimilateMeasuredDepletion(modelledDr: number, measuredDr: number | null, taw: number): AssimilationResult {
  if (measuredDr === null) return { Dr: modelledDr, gapMm: 0, corrected: false }
  return { Dr: clamp(0, measuredDr, taw), gapMm: measuredDr - modelledDr, corrected: true }
}

export const MODEL_SENSOR_DIVERGENCE = 'MODEL_SENSOR_DIVERGENCE'

/**
 * True when the model and the sensors have disagreed by more than
 * `thresholdMm`, in the same direction, on each of the last `minDays` days.
 * The flag goes to the learning loop and the narrator; it never triggers
 * irrigation on its own.
 */
export function modelSensorDivergence(dailyGapsMm: number[], thresholdMm: number, minDays: number): boolean {
  if (minDays < 1 || dailyGapsMm.length < minDays) return false
  const recent = dailyGapsMm.slice(-minDays)
  return recent.every(g => g > thresholdMm) || recent.every(g => g < -thresholdMm)
}
