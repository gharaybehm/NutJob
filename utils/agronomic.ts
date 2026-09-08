/**
 * Agronomic computation utilities for almond farming.
 *
 * All methods use only daily Tmax/Tmin (available from Open-Meteo) so they
 * work without on-field sensors.
 *
 * References:
 *  - Hargreaves & Samani (1985) ETo method
 *  - FAO-56 for Ra calculation
 *  - GDD base 7.2°C standard for almonds (Prunus dulcis)
 *  - Richardson chill-hour model approximation
 */

const ALMOND_GDD_BASE = 7.2; // °C
export const GDD_BASE_C = ALMOND_GDD_BASE;

/**
 * Extraterrestrial radiation Ra (MJ/m²/day) from latitude and day-of-year.
 * FAO-56 equations 21–28.
 */
function extraterrestrialRadiation(latDeg: number, doy: number): number {
  const Gsc = 0.082; // solar constant MJ/m²/min
  const phi = (Math.PI / 180) * latDeg;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(-Math.tan(phi) * Math.tan(delta));
  const Ra =
    ((24 * 60) / Math.PI) *
    Gsc *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return Math.max(0, Ra);
}

/**
 * Daily ETo (mm/day) via Hargreaves-Samani method.
 * Requires only Tmax, Tmin, latitude, and day-of-year.
 */
export function hargreavesETo(
  tMax: number,
  tMin: number,
  latDeg: number,
  doy: number
): number {
  const tMean = (tMax + tMin) / 2;
  const Ra = extraterrestrialRadiation(latDeg, doy);
  const eto = 0.0023 * Ra * (tMean + 17.8) * Math.sqrt(Math.max(0, tMax - tMin));
  return Math.max(0, Math.round(eto * 100) / 100);
}

/**
 * Growing Degree Days contribution for a single day (°C·day, base 7.2°C).
 * Clamped so neither the average nor the range goes below base.
 */
export function dailyGDD(tMax: number, tMin: number): number {
  const tMean = (tMax + tMin) / 2;
  return Math.max(0, Math.round((tMean - ALMOND_GDD_BASE) * 10) / 10);
}

/**
 * Estimated chill-hour contribution for a single day from daily Tmin/Tmax.
 *
 * Uses a triangular distribution: temperature is assumed to vary linearly
 * between Tmin (at 0600) and Tmax (at 1400), giving an 18-h night/morning
 * window where temp may be below 7.2°C.  This is a coarse approximation —
 * real chill-hour counting requires hourly data.
 */
export function estimatedDaillyChillHours(tMax: number, tMin: number): number {
  if (tMin >= 7.2) return 0; // entire day above base
  if (tMax <= 7.2) return 24; // entire day below base

  // fraction of day below 7.2°C (linear interpolation)
  const fractionBelow = (7.2 - tMin) / (tMax - tMin);
  return Math.round(fractionBelow * 24 * 10) / 10;
}

/**
 * Day-of-year (1–365) from a Date object.
 */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

// ─── Bloom-anchored phenology prediction ─────────────────────────────────────
//
// Almond development after full bloom tracks accumulated heat far better than
// it tracks the calendar, so hull split and harvest are predicted as GDD
// targets measured from an observed bloom (or bud-break) date rather than as
// fixed dates. The anchor itself cannot be sensed — it is a visual observation
// the grower logs once per season.

/**
 * GDD targets, measured from the FULL BLOOM anchor, base 7.2°C.
 *
 * ⚠ PROVISIONAL — these are starting values, not calibrated figures. They are
 * set consistent with the season-total thresholds already used by
 * `inferGrowthStage` in the compute-fields cron, which puts hull split in the
 * 1600–2100 cumulative-since-Jan-1 band for a semi-arid Mediterranean site.
 *
 * They are cultivar- and region-specific in reality. Calibrate them after the
 * first full season by comparing the predicted dates stored in
 * `phenology_records` against the dates actually observed and logged in
 * `phenology_events` — the UC ANR Almond Production Manual in the RAG
 * knowledge base is the reference for doing this properly.
 */
export interface PhenologyThresholds {
  hullSplitGdd: number;
  harvestStartGdd: number;
  harvestEndGdd: number;
}

export const DEFAULT_PHENOLOGY_THRESHOLDS: PhenologyThresholds = {
  hullSplitGdd:    1850,
  harvestStartGdd: 2150,
  harvestEndGdd:   2500,
};

/**
 * When the anchor observed is bud break rather than full bloom, the GDD targets
 * above need shifting, since bud break precedes bloom. This is the approximate
 * heat accumulation between the two events — also provisional.
 */
export const BUD_BREAK_TO_BLOOM_GDD = 120;

/** Sum daily GDD across a series of daily Tmax/Tmin pairs. */
export function sumGDD(days: { tMax: number; tMin: number }[]): number {
  let total = 0;
  for (const day of days) {
    if (day.tMax == null || day.tMin == null) continue;
    total += dailyGDD(day.tMax, day.tMin);
  }
  return Math.round(total * 10) / 10;
}

/** Monthly climate normal, as cached in farms.climate_profile. */
export interface MonthlyNormalTemps {
  month: number;      // 1–12
  avg_high_c: number;
  avg_low_c: number;
}

/**
 * Project the date on which a GDD target will be reached, walking forward day
 * by day from `from` and accumulating the climate-normal GDD for each day's
 * calendar month.
 *
 * This is deliberately climatological rather than forecast-driven: the targets
 * sit weeks-to-months ahead, well past any useful forecast horizon. Returns
 * null if the target is not reached within a year (which indicates the
 * thresholds need calibrating for this site, not that the season is endless).
 */
export function projectGddDate(
  from: Date,
  gddAlreadyAccumulated: number,
  targetGdd: number,
  normals: MonthlyNormalTemps[],
): Date | null {
  // A target already met is in the PAST, not today. Returning `from` here
  // would render a completed season as "harvest window: today → today" —
  // worse than showing nothing. Callers distinguish this from "cannot
  // compute" via `SeasonPrediction.passed`.
  if (gddAlreadyAccumulated >= targetGdd) return null;
  if (normals.length !== 12) return null;

  const byMonth = new Map(normals.map(n => [n.month, n]));
  let accumulated = gddAlreadyAccumulated;
  const cursor = new Date(from);

  for (let i = 0; i < 400; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const normal = byMonth.get(cursor.getMonth() + 1);
    if (!normal) return null;
    accumulated += dailyGDD(normal.avg_high_c, normal.avg_low_c);
    if (accumulated >= targetGdd) return new Date(cursor);
  }

  return null;
}

export interface SeasonPrediction {
  hullSplitDate: Date | null;
  harvestStart: Date | null;
  harvestEnd: Date | null;
  daysToHullSplit: number | null;
  gddSinceAnchor: number;
  /** True when enough heat has accumulated that harvest is already behind us. */
  passed: boolean;
}

/**
 * Predict hull split and the harvest window from an observed season anchor.
 *
 * `gddSinceAnchor` must already cover anchor date → today. Anything still in
 * the future is projected from climate normals.
 */
export function predictSeasonDates(
  today: Date,
  gddSinceAnchor: number,
  normals: MonthlyNormalTemps[],
  anchorIsBudBreak = false,
  thresholds: PhenologyThresholds = DEFAULT_PHENOLOGY_THRESHOLDS,
): SeasonPrediction {
  // Bud break precedes bloom, so the same physical events sit further along
  // the accumulation curve when measured from a bud-break anchor.
  const shift = anchorIsBudBreak ? BUD_BREAK_TO_BLOOM_GDD : 0;

  const hullSplitDate = projectGddDate(today, gddSinceAnchor, thresholds.hullSplitGdd + shift, normals);
  const harvestStart  = projectGddDate(today, gddSinceAnchor, thresholds.harvestStartGdd + shift, normals);
  const harvestEnd    = projectGddDate(today, gddSinceAnchor, thresholds.harvestEndGdd + shift, normals);

  const daysToHullSplit = hullSplitDate
    ? Math.max(0, Math.round((hullSplitDate.getTime() - today.getTime()) / 86_400_000))
    : null;

  const passed = gddSinceAnchor >= thresholds.harvestEndGdd + shift;

  return { hullSplitDate, harvestStart, harvestEnd, daysToHullSplit, gddSinceAnchor, passed };
}

/**
 * Given a 7-day forecast and a block's current soil moisture and field capacity,
 * compute a simple 7-day cumulative water deficit (mm).
 *
 * deficit_7d = Σ(ETo_i) - Σ(rain_i)
 * Positive = net crop water demand not met by rain alone.
 */
export function sevenDayWaterDeficit(
  forecastDays: { temp_max: number; temp_min: number; precipitation_mm: number }[],
  latDeg: number,
  startDoy: number
): number {
  let deficit = 0;
  for (let i = 0; i < forecastDays.length; i++) {
    const day = forecastDays[i];
    const eto = hargreavesETo(day.temp_max, day.temp_min, latDeg, startDoy + i);
    deficit += eto - (day.precipitation_mm ?? 0);
  }
  return Math.round(deficit * 10) / 10;
}
