import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  hargreavesETo,
  dailyGDD,
  estimatedDaillyChillHours,
  dayOfYear,
  sevenDayWaterDeficit,
  sumGDD,
  predictSeasonDates,
  type MonthlyNormalTemps,
} from "@/utils/agronomic";
import { fetchDailyTemperatureRange } from "@/utils/weather-history";
import { getOrFetchClimateProfile } from "@/utils/climate-profile";

// Scheduled computed-fields run — designed to execute once per day (midnight).
//
// For each farm with GPS coordinates, fetches today's Tmax/Tmin from Open-Meteo
// and writes per-block rows to:
//   - phenology_records  (cumulative GDD, chill hours, inferred growth stage)
//   - soil_water_readings (daily ETo, 7-day forward water deficit)
//
// Idempotent: skips blocks that already have a source="computed" phenology row
// recorded today so repeated cron runs are safe.
//
// Trigger options:
//   - Netlify Scheduled Function  (netlify/functions/cron-compute-fields.mts)
//   - Manual: GET /api/cron/compute-fields?secret=YOUR_CRON_SECRET

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

type GrowthStageKey =
  | "dormancy"
  | "bud-swell"
  | "bud-break"
  | "bloom"
  | "petal-fall"
  | "nut-development"
  | "hull-split"
  | "harvest"
  | "post-harvest";

// GDD thresholds calibrated for Prunus dulcis in semi-arid Mediterranean climate.
// Cumulative GDD is measured from Jan 1 with base 7.2°C.
function inferGrowthStage(cumulativeGdd: number, month: number): GrowthStageKey {
  if (month === 11 || month === 12 || month === 1) return "dormancy";
  if (month === 10) return "post-harvest";
  if (cumulativeGdd < 50)   return "bud-swell";
  if (cumulativeGdd < 150)  return "bud-break";
  if (cumulativeGdd < 300)  return "bloom";
  if (cumulativeGdd < 500)  return "petal-fall";
  if (cumulativeGdd < 1600) return "nut-development";
  if (cumulativeGdd < 2100) return "hull-split";
  return "harvest";
}

// ─── Bloom-anchored season prediction ────────────────────────────────────────

type AnchorEvent = { event_type: string; observed_on: string };

/**
 * Pick the anchor to measure heat accumulation from. Full bloom is the better
 * anchor — bud break is accepted as a fallback because it is the observation a
 * grower is most likely to have made first, with the GDD offset applied in
 * `predictSeasonDates`.
 */
function pickAnchor(events: AnchorEvent[]): AnchorEvent | null {
  return (
    events.find(e => e.event_type === "full-bloom") ??
    events.find(e => e.event_type === "bud-break") ??
    null
  );
}

interface PredictedFields {
  bud_break_date: string | null;
  estimated_harvest_start: string | null;
  estimated_harvest_end: string | null;
  days_to_hull_split: number | null;
}

const EMPTY_PREDICTION: PredictedFields = {
  bud_break_date: null,
  estimated_harvest_start: null,
  estimated_harvest_end: null,
  days_to_hull_split: null,
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function predictForBlock(
  events: AnchorEvent[],
  normals: MonthlyNormalTemps[] | null,
  lat: number,
  lng: number,
  today: Date,
  todayGdd: number,
  // Shared across blocks in a farm so blocks with the same anchor date cost one fetch.
  historyCache: Map<string, { tMax: number; tMin: number }[]>,
): Promise<PredictedFields> {
  const budBreak = events.find(e => e.event_type === "bud-break");
  const budBreakDate = budBreak?.observed_on ?? null;

  const anchor = pickAnchor(events);
  // No anchor observed, or no climate normals to project forward with: report
  // the bud-break observation if there is one, but predict nothing.
  if (!anchor || !normals || normals.length !== 12) {
    return { ...EMPTY_PREDICTION, bud_break_date: budBreakDate };
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const anchorDate = anchor.observed_on;

  let history = historyCache.get(anchorDate);
  if (!history) {
    const series =
      anchorDate <= isoDate(yesterday)
        ? await fetchDailyTemperatureRange(lat, lng, anchorDate, isoDate(yesterday))
        : [];
    history = series.map(d => ({ tMax: d.tMax, tMin: d.tMin }));
    historyCache.set(anchorDate, history);
  }

  const expectedDays = Math.max(
    0,
    Math.floor((yesterday.getTime() - new Date(`${anchorDate}T00:00:00Z`).getTime()) / 86_400_000),
  );
  // A badly incomplete series would understate accumulated heat and push every
  // predicted date too late. Better to show nothing than a confidently wrong date.
  if (expectedDays > 0 && history.length < expectedDays * 0.8) {
    return { ...EMPTY_PREDICTION, bud_break_date: budBreakDate };
  }

  const gddSinceAnchor = sumGDD(history) + todayGdd;
  const prediction = predictSeasonDates(
    today,
    gddSinceAnchor,
    normals,
    anchor.event_type === "bud-break",
  );

  return {
    bud_break_date: budBreakDate,
    estimated_harvest_start: prediction.harvestStart ? isoDate(prediction.harvestStart) : null,
    estimated_harvest_end: prediction.harvestEnd ? isoDate(prediction.harvestEnd) : null,
    days_to_hull_split: prediction.daysToHullSplit,
  };
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: a missing CRON_SECRET must not leave the endpoint open in production
  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else if (secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const todayDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const currentYear = now.getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farms, error: farmsError } = await (admin as any)
    .from("farms")
    .select("id, name, gps_lat, gps_lng");

  if (farmsError) {
    console.error("[compute-fields] Failed to fetch farms:", farmsError);
    return NextResponse.json({ error: farmsError.message }, { status: 500 });
  }

  const farmsWithGPS = (farms ?? []).filter(
    (f: { gps_lat: number | null; gps_lng: number | null }) =>
      f.gps_lat !== null && f.gps_lng !== null
  );

  if (farmsWithGPS.length === 0) {
    return NextResponse.json({ ok: true, message: "No farms with GPS coordinates.", updated: 0 });
  }

  const results: { farm: string; status: string }[] = [];

  for (const farm of farmsWithGPS) {
    try {
      // Fetch today + 7-day forecast from Open-Meteo
      const url = new URL(OPEN_METEO_BASE);
      url.searchParams.set("latitude", String(farm.gps_lat));
      url.searchParams.set("longitude", String(farm.gps_lng));
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "8"); // today + 7 ahead

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        results.push({ farm: farm.name, status: `Open-Meteo error: ${res.status}` });
        continue;
      }

      const meteo = await res.json();
      const daily = meteo.daily as {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
      };

      if (!daily?.time?.length) {
        results.push({ farm: farm.name, status: "No daily data returned from Open-Meteo" });
        continue;
      }

      // Today's values (index 0)
      const tMax = daily.temperature_2m_max[0];
      const tMin = daily.temperature_2m_min[0];
      const latDeg = farm.gps_lat as number;
      const doy = dayOfYear(now);

      const todayEto = hargreavesETo(tMax, tMin, latDeg, doy);
      const todayGdd = dailyGDD(tMax, tMin);
      const todayChillHours = estimatedDaillyChillHours(tMax, tMin);

      // 7-day forward water deficit (days 1-7 of the forecast)
      const forecastDays = Array.from({ length: Math.min(7, daily.time.length - 1) }, (_, i) => ({
        temp_max: daily.temperature_2m_max[i + 1] ?? tMax,
        temp_min: daily.temperature_2m_min[i + 1] ?? tMin,
        precipitation_mm: daily.precipitation_sum[i + 1] ?? 0,
      }));
      const waterDeficit7d = sevenDayWaterDeficit(forecastDays, latDeg, doy + 1);

      // Fetch all blocks for this farm
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: farmBlocks } = await (admin.from("blocks") as any)
        .select("id")
        .eq("farm_id", farm.id);

      const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);
      if (blockIds.length === 0) {
        results.push({ farm: farm.name, status: "No blocks found" });
        continue;
      }

      // ── Season prediction inputs, gathered once per farm ──────────────────
      // Climate normals drive the forward projection past the forecast horizon.
      const climate = await getOrFetchClimateProfile(farm.id, latDeg, farm.gps_lng as number);
      const normals: MonthlyNormalTemps[] | null = climate?.monthly_normals ?? null;

      // Observed anchors for the current season, all blocks in one query.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: seasonEvents } = await (admin as any)
        .from("phenology_events")
        .select("block_id, event_type, observed_on")
        .in("block_id", blockIds)
        .eq("season", currentYear);

      const eventsByBlock = new Map<string, AnchorEvent[]>();
      for (const ev of (seasonEvents ?? []) as (AnchorEvent & { block_id: string })[]) {
        const list = eventsByBlock.get(ev.block_id) ?? [];
        list.push({ event_type: ev.event_type, observed_on: ev.observed_on });
        eventsByBlock.set(ev.block_id, list);
      }

      const historyCache = new Map<string, { tMax: number; tMin: number }[]>();

      let updatedCount = 0;

      for (const blockId of blockIds) {
        // Idempotency check — skip if already computed today
        const { data: existing } = await admin
          .from("phenology_records")
          .select("id")
          .eq("block_id", blockId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq("source", "computed" as any)
          .gte("recorded_at", `${todayDate}T00:00:00.000Z`)
          .maybeSingle();

        if (existing) continue;

        // Fetch latest phenology record for running totals
        const { data: latestPheno } = await admin
          .from("phenology_records")
          .select("cumulative_gdd, chill_hours, recorded_at")
          .eq("block_id", blockId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Reset cumulative GDD on Jan 1 of a new year
        const latestYear = latestPheno ? new Date(latestPheno.recorded_at).getFullYear() : null;
        const prevGdd = latestYear !== null && latestYear < currentYear
          ? 0
          : (latestPheno?.cumulative_gdd ?? 0);
        const newCumulativeGdd = prevGdd + todayGdd;

        // Reset chill hours at the start of a new chill season (Oct 1)
        const chillSeasonYear = currentMonth >= 10 ? currentYear : currentYear - 1;
        const isNewChillSeason = latestYear !== null && latestYear < chillSeasonYear;
        const prevChill = isNewChillSeason ? 0 : (latestPheno?.chill_hours ?? 0);
        const newChillHours = prevChill + todayChillHours;

        const currentStage = inferGrowthStage(newCumulativeGdd, currentMonth);

        // Bloom-anchored predictions. Null throughout when the grower has not
        // logged a season anchor yet — the tab renders "—" rather than a guess.
        const predicted = await predictForBlock(
          eventsByBlock.get(blockId) ?? [],
          normals,
          latDeg,
          farm.gps_lng as number,
          now,
          todayGdd,
          historyCache,
        );

        const { error: phenoError } = await admin.from("phenology_records").insert({
          block_id: blockId,
          cumulative_gdd: newCumulativeGdd,
          chill_hours: newChillHours,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          current_stage: currentStage as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          source: "computed" as any,
          recorded_at: now.toISOString(),
          bud_break_date: predicted.bud_break_date,
          estimated_harvest_start: predicted.estimated_harvest_start,
          estimated_harvest_end: predicted.estimated_harvest_end,
          days_to_hull_split: predicted.days_to_hull_split,
        });

        if (phenoError) {
          console.error(`[compute-fields] Phenology insert error block ${blockId}:`, phenoError);
          continue;
        }

        // If a sensor reading arrived in the last 24 h, carry its soil_moisture
        // into the computed row so the daily snapshot reflects real field data.
        const { data: latestSensorSoil } = await admin
          .from("soil_water_readings")
          .select("soil_moisture")
          .eq("block_id", blockId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq("source", "sensor" as any)
          .gte("recorded_at", new Date(Date.now() - 86_400_000).toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error: soilError } = await admin.from("soil_water_readings").insert({
          block_id: blockId,
          eto: todayEto,
          water_deficit: waterDeficit7d,
          soil_moisture: latestSensorSoil?.soil_moisture ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          source: "computed" as any,
          test_type: "computed",
          recorded_at: now.toISOString(),
        });

        if (soilError) {
          console.error(`[compute-fields] Soil reading insert error block ${blockId}:`, soilError);
        }

        updatedCount++;
      }

      results.push({
        farm: farm.name,
        status: `OK — ETo: ${todayEto} mm/day, +${todayGdd} GDD, +${todayChillHours} chill hrs — ${updatedCount}/${blockIds.length} blocks`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ farm: farm.name, status: `Error: ${msg}` });
    }
  }

  const successCount = results.filter((r) => r.status.startsWith("OK")).length;

  return NextResponse.json({
    ok: true,
    computed_at: now.toISOString(),
    farms_processed: farmsWithGPS.length,
    farms_ok: successCount,
    results,
  });
}
