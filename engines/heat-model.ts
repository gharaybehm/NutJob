/**
 * Heat-accumulation model per crop (plan §phenology): the base temperature GDD
 * are counted from, the cumulative-GDD thresholds that map to a growth stage,
 * and the bloom-anchored targets for hull split and harvest.
 *
 * It is data owned by a crop profile, like frost thresholds and crop
 * coefficients. A crop with no model gets no computed stage, no GDD and no
 * harvest prediction (`heatModelFor` returns null), instead of the almond
 * numbers, which are wrong for another crop. Adding a crop = a model here plus
 * `heatStages: true` in its profile (utils/crops.ts).
 *
 * Pure: no database, no clock.
 */
import { cropSupports, findCrop } from '@/utils/crops'
import { DEFAULT_PHENOLOGY_THRESHOLDS, type PhenologyThresholds } from '@/utils/agronomic'

export type GrowthStageKey =
  | 'dormancy'
  | 'bud-swell'
  | 'bud-break'
  | 'bloom'
  | 'petal-fall'
  | 'nut-development'
  | 'hull-split'
  | 'harvest'
  | 'post-harvest'

export interface HeatModel {
  /** Crop profile id this model belongs to. */
  cropId: string
  /** GDD base temperature, °C. */
  baseC: number
  /**
   * Cumulative GDD from 1 January below which each stage applies, in order.
   * Anything at or above the last entry is `harvest`.
   */
  stageBelowGdd: { stage: GrowthStageKey; belowGdd: number }[]
  /** Calendar months (1-12) that are always dormancy, and the one that is always post-harvest. */
  dormantMonths: number[]
  postHarvestMonth: number
  /** Bloom-anchored GDD targets for hull split and the harvest window. */
  season: PhenologyThresholds
  /** GDD between bud break and full bloom, for shifting targets when only bud break was observed. */
  budBreakToBloomGdd: number
  /** True while the numbers are starting values, not calibrated for this site. */
  provisional: boolean
  note: string
}

/**
 * Almond. Base 7.2 °C is the standard almond figure. The stage thresholds and
 * season targets are the values the cron has always used: provisional starting
 * values that were described as suited to a semi-arid Mediterranean site but
 * have never been checked against observed dates here. Calibrate them after a
 * full season using the dates logged in `phenology_events`.
 */
export const ALMOND_HEAT_MODEL: HeatModel = {
  cropId: 'almond',
  baseC: 7.2,
  stageBelowGdd: [
    { stage: 'bud-swell', belowGdd: 50 },
    { stage: 'bud-break', belowGdd: 150 },
    { stage: 'bloom', belowGdd: 300 },
    { stage: 'petal-fall', belowGdd: 500 },
    { stage: 'nut-development', belowGdd: 1600 },
    { stage: 'hull-split', belowGdd: 2100 },
  ],
  dormantMonths: [11, 12, 1],
  postHarvestMonth: 10,
  season: DEFAULT_PHENOLOGY_THRESHOLDS,
  budBreakToBloomGdd: 120,
  provisional: true,
  note: 'Provisional almond starting values (base 7.2 °C), not calibrated for this site: compare predicted and observed dates after a full season.',
}

const MODELS: HeatModel[] = [ALMOND_HEAT_MODEL]

/** The heat model for a crop as typed on a block, or null when the crop has none loaded. */
export function heatModelFor(cropName: string | null | undefined): HeatModel | null {
  if (!cropSupports(cropName, 'heatStages')) return null
  const id = findCrop(cropName)?.id
  return MODELS.find(m => m.cropId === id) ?? null
}

/** Growth stage from cumulative GDD (since 1 January) and the calendar month (1-12). */
export function inferGrowthStage(model: HeatModel, cumulativeGdd: number, month: number): GrowthStageKey {
  if (model.dormantMonths.includes(month)) return 'dormancy'
  if (month === model.postHarvestMonth) return 'post-harvest'
  for (const s of model.stageBelowGdd) {
    if (cumulativeGdd < s.belowGdd) return s.stage
  }
  return 'harvest'
}
