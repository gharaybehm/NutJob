/**
 * Irrigation engine (plan §9): FAO-56 root-zone water balance.
 *
 * Pure and deterministic. Reports the block's status against the strategy the
 * manager or agronomist chose; it never changes that strategy.
 */
import { usableForCalculation, type StatefulValue } from '@/utils/value-state'
import type { MaturityClass } from './maturity'

export type IrrigationStatus =
  | 'no_irrigation_needed'
  | 'monitor'
  | 'irrigate_soon'
  | 'irrigate_now'
  | 'data_required'

export type Confidence = 'high' | 'medium' | 'low'

/**
 * Almond crop coefficients by stage. FAO-56 table 12 (almond, no ground
 * cover): initial 0.40, mid 0.90, end 0.65. Stage mapping is provisional and
 * must be calibrated for Vairo/Makako in Central Anatolia.
 */
export const KC_BY_STAGE: Record<string, number> = {
  dormant: 0,
  bloom: 0.4,
  fruit_set: 0.65,
  hull_fill: 0.9,
  hull_split: 0.9,
  harvest: 0.65,
  post_harvest: 0.65,
}
const DEFAULT_KC = 0.65

export interface IrrigationStrategy {
  name: string
  /** Fraction of TAW that may be depleted before irrigating (FAO-56 p). */
  allowableDepletion: number
}

/** FAO-56 suggests p ≈ 0.4 for almond. */
export const FULL_IRRIGATION: IrrigationStrategy = { name: 'full', allowableDepletion: 0.4 }

export interface DayForecast {
  eto: number
  rain: number
}

export interface IrrigationInput {
  /** Percent volumetric, as stored in blocks.field_capacity / wilting_point. */
  fieldCapacityPct: number | null
  wiltingPointPct: number | null
  rootDepthM: number | null
  /** Current root-zone moisture, percent volumetric. */
  moisture: StatefulValue | null
  stage: string | null
  etoToday: number | null
  forecast: DayForecast[]
  strategy?: IrrigationStrategy
  /** Application efficiency, drip ≈ 0.9. */
  efficiency?: number
  areaHa?: number | null
  /** Remaining licensed well volume for the season, m³. */
  remainingAllocationM3?: number | null
  /** Any stem water potential reading available (MPa, more negative = more stress). */
  stemWaterPotentialMpa?: number | null
  canopyCoverKnown?: boolean
  /**
   * Tree maturity. Young trees use far less water than a mature orchard, so
   * their demand is scaled by `waterFraction` (from the UC Davis young-orchard
   * schedule). Left out, the block is treated as mature.
   */
  maturity?: { class: MaturityClass; leafYear: number | null; waterFraction: number; assumed: boolean } | null
  /** True when the rooting depth comes from the farm default, which is set for mature trees. */
  rootDepthIsFarmDefault?: boolean
  /** False when no crop coefficients are loaded for this crop: the engine then refuses rather than borrow another crop's. Default true. */
  cropSupported?: boolean
}

export interface IrrigationResult {
  status: IrrigationStatus
  strategy: string
  tawMm: number | null
  rawMm: number | null
  depletionMm: number | null
  etcMmPerDay: number | null
  daysToThreshold: number | null
  requirementMm: number | null
  requirementM3: number | null
  allocationAfterM3: number | null
  confidence: Confidence
  dataGaps: string[]
}

/** Rain below 5 mm is assumed lost to interception and evaporation. */
function effectiveRain(mm: number): number {
  return mm >= 5 ? mm * 0.8 : 0
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Total available water in the root zone (mm): the reserve between field
 * capacity and wilting point over the rooting depth. Percentages are volumetric.
 * Null when a value is missing or the two thresholds are the wrong way round.
 */
export function totalAvailableWaterMm(
  fieldCapacityPct: number | null,
  wiltingPointPct: number | null,
  rootDepthM: number | null,
): number | null {
  if (fieldCapacityPct == null || wiltingPointPct == null || rootDepthM == null) return null
  const taw = 10 * (fieldCapacityPct - wiltingPointPct) * rootDepthM
  return taw > 0 ? taw : null
}

export function evaluateIrrigation(input: IrrigationInput): IrrigationResult {
  const strategy = input.strategy ?? FULL_IRRIGATION
  const efficiency = input.efficiency ?? 0.9
  const dataGaps: string[] = []

  const empty: IrrigationResult = {
    status: 'data_required',
    strategy: strategy.name,
    tawMm: null,
    rawMm: null,
    depletionMm: null,
    etcMmPerDay: null,
    daysToThreshold: null,
    requirementMm: null,
    requirementM3: null,
    allocationAfterM3: null,
    confidence: 'low',
    dataGaps,
  }

  if (input.cropSupported === false) {
    dataGaps.push('No crop coefficients are loaded for this crop, so irrigation advice is not calculated')
    return empty
  }
  if (input.fieldCapacityPct == null || input.wiltingPointPct == null || input.rootDepthM == null) {
    dataGaps.push('Soil field capacity, wilting point and rooting depth are needed')
    return empty
  }
  const mat = input.maturity ?? null
  const young = mat !== null && (mat.class === 'non_bearing' || mat.class === 'young_bearing')
  if (young && input.rootDepthIsFarmDefault) {
    // The farm default depth is meant for mature trees. A first-year tree cannot
    // draw from it, so the reserve would be overstated and irrigation advice wrong.
    dataGaps.push(`Trees are young (leaf year ${mat!.leafYear ?? 1}) and the farm default root depth is for mature trees: set a root depth for this block`)
    return empty
  }
  const taw = 10 * (input.fieldCapacityPct - input.wiltingPointPct) * input.rootDepthM // = totalAvailableWaterMm
  const raw = taw * strategy.allowableDepletion
  if (taw <= 0) {
    dataGaps.push('Field capacity must be above wilting point')
    return empty
  }
  if (!input.moisture || !usableForCalculation(input.moisture) || input.moisture.value == null) {
    dataGaps.push('No usable soil moisture reading (missing, stale or from a failed sensor)')
    return { ...empty, tawMm: round1(taw), rawMm: round1(raw) }
  }

  const depletion = Math.min(
    taw,
    Math.max(0, 10 * (input.fieldCapacityPct - input.moisture.value) * input.rootDepthM),
  )

  const kc = input.stage != null && input.stage in KC_BY_STAGE ? KC_BY_STAGE[input.stage] : DEFAULT_KC
  if (input.stage == null || !(input.stage in KC_BY_STAGE)) dataGaps.push('Growth stage unknown, using a default crop coefficient')
  if (!input.canopyCoverKnown) dataGaps.push('Canopy cover not recorded, Kc assumes a mature canopy')

  // Young trees use a fraction of a mature orchard's water.
  const demandShare = mat?.waterFraction ?? 1
  const kcEff = kc * demandShare
  if (young) {
    dataGaps.push(
      `Young trees (leaf year ${mat!.leafYear ?? 1}): water use is taken as ${Math.round(demandShare * 100)}% of a mature orchard, from a California schedule (UC Davis). Confirm with your agronomist`,
    )
  } else if (mat?.class === 'unknown') {
    dataGaps.push('Planting date not recorded, so mature trees are assumed')
  }

  const eto = input.etoToday ?? input.forecast[0]?.eto ?? null
  if (eto == null) dataGaps.push('No ETo available')
  const etc = eto == null ? null : kcEff * eto

  // Walk the forecast forward to find when depletion reaches the threshold.
  let daysToThreshold: number | null = depletion >= raw ? 0 : null
  if (daysToThreshold === null && etc != null) {
    let d = depletion
    for (let i = 0; i < input.forecast.length; i++) {
      d = Math.max(0, d + kcEff * input.forecast[i].eto - effectiveRain(input.forecast[i].rain))
      if (d >= raw) {
        daysToThreshold = i + 1
        break
      }
    }
    if (daysToThreshold === null && input.forecast.length === 0) {
      dataGaps.push('No forecast available to project depletion')
      daysToThreshold = etc > 0 ? Math.ceil((raw - depletion) / etc) : null
    }
  }

  let status: IrrigationStatus
  if (depletion >= raw) status = 'irrigate_now'
  else if (daysToThreshold !== null && daysToThreshold <= 3) status = 'irrigate_soon'
  else if (depletion >= 0.7 * raw) status = 'monitor'
  else status = 'no_irrigation_needed'

  const requirementMm = status === 'no_irrigation_needed' ? 0 : round1(depletion / efficiency)
  const requirementM3 = input.areaHa != null ? round1(requirementMm * input.areaHa * 10) : null
  const allocationAfterM3 =
    requirementM3 != null && input.remainingAllocationM3 != null
      ? round1(input.remainingAllocationM3 - requirementM3)
      : null
  if (input.remainingAllocationM3 == null) dataGaps.push('Well licence volume not entered, allocation impact unknown')

  if (input.stemWaterPotentialMpa == null) dataGaps.push('No recent stem water potential measurement')

  // Confidence from evidence, not invented (plan §22).
  let score = 0
  if (input.moisture.state === 'KNOWN') score += 2
  else score += 1
  if (input.forecast.length >= 3) score += 1
  if (input.stemWaterPotentialMpa != null) score += 1
  if (input.canopyCoverKnown) score += 1
  // A demand estimated from tree age, not measured, caps confidence at low.
  if (young) score = Math.min(score, 2)
  const confidence: Confidence = score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low'

  return {
    status,
    strategy: strategy.name,
    tawMm: round1(taw),
    rawMm: round1(raw),
    depletionMm: round1(depletion),
    etcMmPerDay: etc == null ? null : round1(etc),
    daysToThreshold,
    requirementMm,
    requirementM3,
    allocationAfterM3,
    confidence,
    dataGaps,
  }
}
