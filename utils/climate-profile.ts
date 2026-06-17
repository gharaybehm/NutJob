// Fetches 3-year monthly climate normals from the Open-Meteo archive API
// and caches the result in farms.climate_profile for 180 days.
//
// This "slow tier" data (6-monthly cadence) gives the AI Agronomist a
// baseline understanding of the region's climate so it can contextualise
// current sensor readings against historical norms.

import { createAdminClient } from "@/utils/supabase/admin";

export interface MonthlyNormal {
  month: number;       // 1–12
  name: string;        // "Jan"–"Dec"
  avg_high_c: number;  // average daily maximum temperature
  avg_low_c: number;   // average daily minimum temperature
  avg_precip_mm: number; // average monthly total precipitation
}

export interface ClimateProfile {
  fetched_at: string;         // ISO date string
  lat: number;
  lng: number;
  monthly_normals: MonthlyNormal[];
  annual_precip_mm: number;
  aridity_class: string;
  peak_irrigation_months: string[]; // month names e.g. ["Jun","Jul","Aug","Sep"]
  frost_risk_months: string[];      // months where avg low < 2°C
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CACHE_DAYS = 180;

function classifyAridity(annualPrecip: number, junAvgHigh: number): string {
  if (annualPrecip < 250) return "arid";
  if (annualPrecip < 500 && junAvgHigh > 25) return "semi-arid Mediterranean";
  if (annualPrecip < 700) return "Mediterranean";
  if (annualPrecip < 1000) return "sub-humid";
  return "humid";
}

export async function getOrFetchClimateProfile(
  farmId: string,
  lat: number,
  lng: number
): Promise<ClimateProfile | null> {
  if (!lat || !lng) return null;

  const admin = createAdminClient();

  // Check cache
  const { data: farm } = await (admin as any)
    .from("farms")
    .select("climate_profile, climate_fetched_at")
    .eq("id", farmId)
    .single();

  const cacheAgeDays = farm?.climate_fetched_at
    ? (Date.now() - new Date(farm.climate_fetched_at).getTime()) / 86_400_000
    : Infinity;

  if (farm?.climate_profile && cacheAgeDays < CACHE_DAYS) {
    return farm.climate_profile as ClimateProfile;
  }

  // Fetch 3 years of daily data from Open-Meteo archive API (free, no key)
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() - 1); // end at last complete month
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 3);

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("start_date", startDate.toISOString().split("T")[0]);
  url.searchParams.set("end_date", endDate.toISOString().split("T")[0]);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");

  let res: Response;
  try {
    res = await fetch(url.toString());
    if (!res.ok) return null;
  } catch {
    return null;
  }

  const json = await res.json();
  const { time, temperature_2m_max, temperature_2m_min, precipitation_sum } = json.daily ?? {};
  if (!time || !temperature_2m_max) return null;

  // Aggregate into monthly buckets
  // For precipitation: sum per year-month, then average across years
  // For temperature: average all daily readings in that calendar month
  type Bucket = { highs: number[]; lows: number[]; precipByYear: Map<number, number> };
  const buckets: Bucket[] = Array.from({ length: 12 }, () => ({
    highs: [],
    lows: [],
    precipByYear: new Map(),
  }));

  for (let i = 0; i < time.length; i++) {
    const d = new Date(time[i]);
    const m = d.getMonth(); // 0-11
    const y = d.getFullYear();
    if (temperature_2m_max[i] != null) buckets[m].highs.push(temperature_2m_max[i]);
    if (temperature_2m_min[i] != null) buckets[m].lows.push(temperature_2m_min[i]);
    if (precipitation_sum[i] != null) {
      buckets[m].precipByYear.set(y, (buckets[m].precipByYear.get(y) ?? 0) + precipitation_sum[i]);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  const avgMap = (map: Map<number, number>) => {
    const vals = Array.from(map.values());
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };

  const monthly_normals: MonthlyNormal[] = buckets.map((b, i) => ({
    month: i + 1,
    name: MONTH_NAMES[i],
    avg_high_c: avg(b.highs),
    avg_low_c: avg(b.lows),
    avg_precip_mm: avgMap(b.precipByYear),
  }));

  const annual_precip_mm = monthly_normals.reduce((s, m) => s + m.avg_precip_mm, 0);
  const junNormal = monthly_normals[5]; // June (index 5)
  const aridity_class = classifyAridity(annual_precip_mm, junNormal.avg_high_c);

  // Peak irrigation demand: months where avg high > 28°C and avg precip < 20mm
  const peak_irrigation_months = monthly_normals
    .filter((m) => m.avg_high_c > 28 && m.avg_precip_mm < 20)
    .map((m) => m.name);

  // Frost risk: months where avg low drops below 2°C
  const frost_risk_months = monthly_normals
    .filter((m) => m.avg_low_c < 2)
    .map((m) => m.name);

  const profile: ClimateProfile = {
    fetched_at: new Date().toISOString().split("T")[0],
    lat,
    lng,
    monthly_normals,
    annual_precip_mm,
    aridity_class,
    peak_irrigation_months,
    frost_risk_months,
  };

  // Cache in DB (non-blocking; ignore errors)
  (admin as any)
    .from("farms")
    .update({ climate_profile: profile, climate_fetched_at: new Date().toISOString() })
    .eq("id", farmId)
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("[climate-profile] Failed to cache:", error);
    });

  return profile;
}

export function buildClimateSection(profile: ClimateProfile, today: Date): string {
  const currentMonth = today.getMonth(); // 0-11
  const norm = profile.monthly_normals[currentMonth];
  const peakStr = profile.peak_irrigation_months.join(", ") || "none identified";
  const frostStr = profile.frost_risk_months.join(", ") || "none";

  return [
    `Farm GPS: ${profile.lat.toFixed(2)}N, ${profile.lng.toFixed(2)}E | Climate normals (3-yr avg, fetched: ${profile.fetched_at})`,
    `  ${norm.name}: avg high ${norm.avg_high_c}C / avg low ${norm.avg_low_c}C / avg precip ${norm.avg_precip_mm}mm`,
    `  Annual rainfall norm: ${profile.annual_precip_mm}mm | Aridity class: ${profile.aridity_class}`,
    `  Peak irrigation demand months: ${peakStr}`,
    `  Frost risk months: ${frostStr}`,
  ].join("\n");
}
