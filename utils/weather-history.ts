// Daily historical temperature retrieval from Open-Meteo.
//
// Needed to accumulate GDD between an observed phenology anchor (bloom or bud
// break) and today — a span that routinely reaches 4–5 months, far longer than
// any single Open-Meteo endpoint covers well:
//
//   - The ARCHIVE endpoint (ERA5) goes back decades but lags real time by
//     roughly 5 days, so it cannot supply the most recent week.
//   - The FORECAST endpoint serves recent history via `past_days`, but is
//     capped at 92 days.
//
// So a long span is stitched from both, with the forecast values winning on
// any overlapping date since they are the more recent reanalysis.

const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

// The archive (ERA5-based) lags real time by a few days; anything newer than this
// many days comes from the forecast endpoint's past_days. Splitting at 92 days
// instead (the forecast endpoint's documented limit) left an 18-day hole
// (21 Jun – 8 Jul 2026) where neither source returned data, which silently
// understated season heat totals.
const ARCHIVE_LAG_DAYS = 7;

export interface DailyTemps {
  date: string; // YYYY-MM-DD
  tMax: number;
  tMin: number;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

interface OpenMeteoDaily {
  time?: string[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
}

async function fetchDaily(url: URL): Promise<DailyTemps[]> {
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json = await res.json();
  const daily = json.daily as OpenMeteoDaily | undefined;
  if (!daily?.time?.length) return [];

  const out: DailyTemps[] = [];
  for (let i = 0; i < daily.time.length; i++) {
    const tMax = daily.temperature_2m_max?.[i];
    const tMin = daily.temperature_2m_min?.[i];
    if (tMax == null || tMin == null) continue;
    out.push({ date: daily.time[i], tMax, tMin });
  }
  return out;
}

/**
 * Daily Tmax/Tmin for [startDate, endDate] inclusive, both YYYY-MM-DD.
 *
 * Returns whatever could be retrieved — an empty array on total failure, and a
 * partial series if one of the two upstream calls fails. Callers deciding
 * whether a result is trustworthy should check `.length` against the span they
 * asked for rather than assuming completeness.
 */
export async function fetchDailyTemperatureRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<DailyTemps[]> {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const today = new Date();
  // Newest date the archive can be trusted for.
  const archiveCutoff = new Date(today);
  archiveCutoff.setDate(archiveCutoff.getDate() - ARCHIVE_LAG_DAYS);

  const byDate = new Map<string, DailyTemps>();

  // ── Older portion: archive endpoint ───────────────────────────────────────
  if (start <= archiveCutoff) {
    const archiveEnd = new Date(Math.min(end.getTime(), archiveCutoff.getTime()));
    const url = new URL(ARCHIVE_BASE);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("start_date", isoDate(start));
    url.searchParams.set("end_date", isoDate(archiveEnd));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "auto");

    for (const day of await fetchDaily(url)) byDate.set(day.date, day);
  }

  // ── Recent portion: forecast endpoint with past_days ──────────────────────
  if (end > archiveCutoff) {
    const recentStart = start > archiveCutoff ? start : archiveCutoff;
    const pastDays = Math.max(1, daysBetween(recentStart, today) + 1);
    const url = new URL(FORECAST_BASE);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("past_days", String(pastDays));
    url.searchParams.set("forecast_days", "1");

    // Forecast values overwrite archive ones on overlap — deliberate.
    for (const day of await fetchDaily(url)) byDate.set(day.date, day);
  }

  return Array.from(byDate.values())
    .filter(d => d.date >= startDate && d.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Hourly weather, for verifying a weather station ─────────────────────────

export interface HourlyWeather {
  /** ISO timestamp of the hour, UTC (e.g. 2026-09-20T13:00:00Z). */
  at: string;
  tempC: number | null;
  humidityPct: number | null;
  /** 10 m hourly mean wind speed, km/h. */
  windKmh: number | null;
  /** Precipitation over the hour ending at `at`, mm. */
  precipMm: number | null;
}

const HOURLY_VARS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation";

async function fetchHourly(url: URL): Promise<HourlyWeather[]> {
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json = await res.json();
  const h = json.hourly as {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation?: (number | null)[];
  } | undefined;
  if (!h?.time?.length) return [];
  return h.time.map((t, i) => ({
    // timezone=GMT returns "YYYY-MM-DDTHH:mm" with no offset: it is UTC.
    at: `${t}:00Z`,
    tempC: h.temperature_2m?.[i] ?? null,
    humidityPct: h.relative_humidity_2m?.[i] ?? null,
    windKmh: h.wind_speed_10m?.[i] ?? null,
    precipMm: h.precipitation?.[i] ?? null,
  }));
}

/**
 * Hourly temperature, humidity, wind and precipitation (UTC, wind in km/h) for
 * [startDate, endDate] inclusive, stitched from the archive (older) and the
 * forecast endpoint's past_days (recent), the same way
 * `fetchDailyTemperatureRange` does. Returns whatever could be retrieved; empty
 * on total failure.
 */
export async function fetchHourlyWeatherRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<HourlyWeather[]> {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const today = new Date();
  const archiveCutoff = new Date(today);
  archiveCutoff.setDate(archiveCutoff.getDate() - ARCHIVE_LAG_DAYS);

  const byTime = new Map<string, HourlyWeather>();

  if (start <= archiveCutoff) {
    const archiveEnd = new Date(Math.min(end.getTime(), archiveCutoff.getTime()));
    const url = new URL(ARCHIVE_BASE);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("start_date", isoDate(start));
    url.searchParams.set("end_date", isoDate(archiveEnd));
    url.searchParams.set("hourly", HOURLY_VARS);
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timezone", "GMT");
    for (const h of await fetchHourly(url)) byTime.set(h.at, h);
  }

  if (end > archiveCutoff) {
    const recentStart = start > archiveCutoff ? start : archiveCutoff;
    const pastDays = Math.max(1, daysBetween(recentStart, today) + 1);
    const url = new URL(FORECAST_BASE);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("hourly", HOURLY_VARS);
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timezone", "GMT");
    url.searchParams.set("past_days", String(pastDays));
    url.searchParams.set("forecast_days", "1");
    for (const h of await fetchHourly(url)) byTime.set(h.at, h);
  }

  return Array.from(byTime.values())
    .filter(h => h.at.slice(0, 10) >= startDate && h.at.slice(0, 10) <= endDate)
    .sort((a, b) => a.at.localeCompare(b.at));
}
