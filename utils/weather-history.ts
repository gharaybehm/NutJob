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

const FORECAST_PAST_DAYS_MAX = 92;

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
  // Oldest date the forecast endpoint's past_days window can reach.
  const forecastFloor = new Date(today);
  forecastFloor.setDate(forecastFloor.getDate() - FORECAST_PAST_DAYS_MAX);

  const byDate = new Map<string, DailyTemps>();

  // ── Older portion: archive endpoint ───────────────────────────────────────
  if (start < forecastFloor) {
    const archiveEnd = new Date(Math.min(end.getTime(), forecastFloor.getTime()));
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
  if (end >= forecastFloor) {
    const pastDays = Math.min(
      FORECAST_PAST_DAYS_MAX,
      Math.max(1, daysBetween(start, today) + 1),
    );
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
