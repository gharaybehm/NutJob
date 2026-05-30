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
