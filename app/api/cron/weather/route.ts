import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Scheduled weather fetch — designed to run every 3 hours.
//
// For each farm with GPS coordinates, fetches current conditions and
// 7-day forecast from Open-Meteo (free, no API key) and writes a
// weather_snapshot row with block_id = null (farm-level).
//
// Trigger options:
//   - Netlify Scheduled Function  (cron: "0 0,3,6,9,12,15,18,21 * * *")
//   - Supabase pg_cron calling this endpoint
//   - External cron service (e.g. cron-job.org)
//   - Manual: GET /api/cron/weather?secret=YOUR_CRON_SECRET

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

function windDegreesToDirection(degrees: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(degrees / 22.5) % 16];
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
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

  // Fetch all farms with GPS coordinates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farms, error: farmsError } = await (admin as any)
    .from("farms")
    .select("id, name, gps_lat, gps_lng");

  if (farmsError) {
    console.error("[weather-cron] Failed to fetch farms:", farmsError);
    return NextResponse.json({ error: farmsError.message }, { status: 500 });
  }

  const farmsWithGPS = (farms ?? []).filter(
    (f: { gps_lat: number | null; gps_lng: number | null }) =>
      f.gps_lat !== null && f.gps_lng !== null
  );

  if (farmsWithGPS.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No farms with GPS coordinates found. Skipping.",
      snapshots_created: 0,
    });
  }

  const now = new Date().toISOString();
  const results: { farm: string; status: string }[] = [];

  for (const farm of farmsWithGPS) {
    try {
      const url = new URL(OPEN_METEO_BASE);
      url.searchParams.set("latitude", String(farm.gps_lat));
      url.searchParams.set("longitude", String(farm.gps_lng));
      url.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m"
      );
      url.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code"
      );
      url.searchParams.set("timezone", "auto");

      const res = await fetch(url.toString(), { cache: "no-store" });

      if (!res.ok) {
        results.push({ farm: farm.name, status: `Open-Meteo error: ${res.status}` });
        continue;
      }

      const data: OpenMeteoResponse = await res.json();
      const current = data.current;
      const daily = data.daily;

      // Sum 7-day precipitation
      const rainfall7d = (daily.precipitation_sum ?? []).reduce(
        (sum: number, v: number) => sum + (v || 0),
        0
      );

      // Determine risk flags
      const heatStress = current.temperature_2m > 38;
      const frostRisk = daily.temperature_2m_min.some((t: number) => t <= 0);

      // Build forecast JSON for the AI engine and the Weather tab
      const forecastDays = daily.time.map((date: string, i: number) => ({
        date,
        temp_max: daily.temperature_2m_max[i],
        temp_min: daily.temperature_2m_min[i],
        precipitation_mm: daily.precipitation_sum[i],
        precipitation_probability: daily.precipitation_probability_max[i],
        weather_code: daily.weather_code[i],
      }));

      // Fetch block IDs for this farm so we can tag the snapshot
      // block_id is null = farm-wide snapshot; we also store per-farm in a
      // way the AI engine can find via its existing weather_snapshots query.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: farmBlocks } = await (admin.from("blocks") as any)
        .select("id")
        .eq("farm_id", farm.id);

      // Insert farm-level snapshot (block_id = null, tied to farm via forecast_json.farm_id)
      const snapshot = {
        block_id: null,
        temp_c: Math.round(current.temperature_2m * 10) / 10,
        humidity_pct: Math.round(current.relative_humidity_2m),
        rainfall_mm: Math.round(current.precipitation * 10) / 10,
        rainfall_7d_mm: Math.round(rainfall7d * 10) / 10,
        wind_kmh: Math.round(current.wind_speed_10m * 10) / 10,
        wind_direction: windDegreesToDirection(current.wind_direction_10m),
        heat_stress_risk: heatStress,
        frost_risk: frostRisk,
        forecast_json: {
          farm_id: farm.id,
          fetched_at: now,
          days: forecastDays,
        },
        source: "forecast" as const,
        recorded_at: now,
      };

      const { error: insertError } = await admin
        .from("weather_snapshots")
        .insert(snapshot);

      if (insertError) {
        results.push({ farm: farm.name, status: `Insert error: ${insertError.message}` });
        continue;
      }

      // Also insert per-block snapshots (same weather data, tagged to each block)
      // so the AI recommendation engine can join weather data per block.
      const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);
      if (blockIds.length > 0) {
        const blockSnapshots = blockIds.map((blockId) => ({
          ...snapshot,
          block_id: blockId,
          forecast_json: { ...snapshot.forecast_json, block_id: blockId },
        }));

        const { error: blockInsertError } = await admin
          .from("weather_snapshots")
          .insert(blockSnapshots);

        if (blockInsertError) {
          console.error(`[weather-cron] Block snapshot insert error for farm ${farm.name}:`, blockInsertError);
        }
      }

      results.push({
        farm: farm.name,
        status: `OK — ${current.temperature_2m}°C, ${current.relative_humidity_2m}% humidity, ${blockIds.length} block snapshots`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ farm: farm.name, status: `Error: ${msg}` });
    }
  }

  const successCount = results.filter((r) => r.status.startsWith("OK")).length;

  return NextResponse.json({
    ok: true,
    fetched_at: now,
    farms_processed: farmsWithGPS.length,
    snapshots_created: successCount,
    results,
  });
}
