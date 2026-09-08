import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  createSensecapClient,
  mapTelemetryToPayloads,
  mapHistoryToPayloads,
  type TimestampedPayloads,
} from "@/utils/sensecap-client";

// SenseCAP sensor sync — runs 3× per day at 00:00, 08:00, 16:00 UTC.
//
// For each farm with SenseCAP credentials configured, fetches every telemetry
// reading each registered sensor (device_id = SenseCAP EUI) has logged since
// its last stored reading, and writes them into soil_water_readings /
// weather_snapshots.
//
// The cron cadence is the PULL frequency, not the sample frequency: the
// devices uplink far more often than 3× a day, and the derived agronomy needs
// that resolution (chill hours are meaningless below roughly hourly data, and
// true daily Tmax/Tmin cannot be recovered from three fixed-time samples).
// Where the history endpoint is unavailable this falls back to storing just
// the latest point, which is the older behaviour.
//
// Trigger options (all call the same endpoint):
//   - Trigger.dev schedule (src/trigger/sensecap-sync.ts)  ← recommended
//   - External cron service (e.g. cron-job.org)
//   - Manual: GET /api/cron/sensecap-sync?secret=YOUR_CRON_SECRET

// How far back to look when a sensor has no stored readings at all. Bounded so
// a newly-registered device does not pull an unbounded backfill on first sync.
const MAX_BACKFILL_DAYS = 14;

// Supabase rejects very large single inserts; chunk anything bigger.
const INSERT_CHUNK = 200;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Newest stored reading for a sensor, across both reading tables. */
async function lastReadingAt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  sensorId: string,
): Promise<Date | null> {
  const newest = async (table: string): Promise<string | null> => {
    const { data } = await admin
      .from(table)
      .select("recorded_at")
      .eq("sensor_id", sensorId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.recorded_at ?? null;
  };

  const [soil, weather] = await Promise.all([
    newest("soil_water_readings"),
    newest("weather_snapshots"),
  ]);

  const stamps = [soil, weather].filter(Boolean) as string[];
  if (stamps.length === 0) return null;
  return new Date(stamps.sort().reverse()[0]);
}

/** Timestamps already stored for a sensor since a cutoff, for dedup. */
async function existingTimestamps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: string,
  sensorId: string,
  since: Date,
): Promise<Set<string>> {
  const { data } = await admin
    .from(table)
    .select("recorded_at")
    .eq("sensor_id", sensorId)
    .gte("recorded_at", since.toISOString());

  return new Set(
    ((data ?? []) as { recorded_at: string }[]).map(r =>
      new Date(r.recorded_at).toISOString(),
    ),
  );
}

export async function GET(request: NextRequest) {
  // Auth: same CRON_SECRET pattern as /api/cron/weather
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
  const now = new Date().toISOString();

  // Fetch all farms that have SenseCAP credentials configured
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farms, error: farmsError } = await (admin as any)
    .from("farms")
    .select("id, name, sensecap_api_id, sensecap_access_key")
    .not("sensecap_api_id", "is", null)
    .not("sensecap_access_key", "is", null);

  if (farmsError) {
    console.error("[sensecap-sync] Failed to fetch farms:", farmsError);
    return NextResponse.json({ error: farmsError.message }, { status: 500 });
  }

  if (!farms || farms.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No farms with SenseCAP credentials configured.",
      synced: 0,
      skipped: 0,
    });
  }

  let totalSynced = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const farm of farms) {
    const client = createSensecapClient(farm.sensecap_api_id, farm.sensecap_access_key);

    // Fetch all sensors for this farm that have a SenseCAP device EUI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sensors, error: sensorsError } = await (admin as any)
      .from("sensors")
      .select("id, block_id, device_id, sensor_type, name")
      .eq("farm_id", farm.id)
      .not("device_id", "is", null);

    if (sensorsError) {
      errors.push(`[${farm.name}] Failed to fetch sensors: ${sensorsError.message}`);
      continue;
    }

    if (!sensors || sensors.length === 0) continue;

    // Fetch device online/battery status in one batched call (max 50 per SenseCAP API)
    const deviceEuis: string[] = sensors.map((s: { device_id: string }) => s.device_id);
    const statusMap: Record<string, { online: boolean; last_seen: string | null }> = {};

    try {
      const statuses = await client.fetchDeviceStatus(deviceEuis);
      for (const s of statuses) {
        statusMap[s.device_eui] = {
          online: s.online_status === 1,
          last_seen: s.latest_message_time || null,
        };
      }
    } catch (err) {
      // Non-fatal — we still attempt telemetry fetches; status updates just won't happen
      console.warn(`[sensecap-sync] Device status fetch failed for farm ${farm.name}:`, err);
    }

    for (const sensor of sensors) {
      const eui: string = sensor.device_id;

      try {
        // ── Work out the window to pull ──────────────────────────────────────
        const floor = new Date(Date.now() - MAX_BACKFILL_DAYS * 86_400_000);
        const last = await lastReadingAt(admin, sensor.id);
        // Start just after the newest stored reading so it is not re-fetched.
        const since = last && last > floor ? new Date(last.getTime() + 1000) : floor;

        // ── Preferred path: full history since the last stored reading ───────
        let readings: TimestampedPayloads[] = [];
        try {
          const points = await client.fetchTelemetryHistory(eui, since);
          readings = mapHistoryToPayloads(points);
        } catch (err) {
          console.warn(
            `[sensecap-sync] History unavailable for ${sensor.name}, falling back to latest:`,
            err,
          );
        }

        // ── Fallback: the single latest point (previous behaviour) ───────────
        if (readings.length === 0) {
          const channels = await client.fetchLatestTelemetry(eui);
          if (!channels || channels.length === 0) {
            totalSkipped++;
            continue;
          }

          const { soil, weather } = mapTelemetryToPayloads(channels);
          const hasSoil = Object.keys(soil).some(
            (k) => k !== "recorded_at" && soil[k as keyof typeof soil] != null,
          );
          const hasWeather = Object.keys(weather).some(
            (k) => k !== "recorded_at" && weather[k as keyof typeof weather] != null,
          );

          if (!hasSoil && !hasWeather) {
            totalSkipped++;
            continue;
          }

          const { recorded_at: soilAt, ...soilFields } = soil;
          const { recorded_at: wxAt, ...weatherFields } = weather;
          readings = [{
            recorded_at: soilAt ?? wxAt ?? now,
            soil: soilFields,
            weather: weatherFields,
            hasSoil,
            hasWeather,
          }];
        }

        // ── Dedup against what is already stored ─────────────────────────────
        const [storedSoil, storedWeather] = await Promise.all([
          existingTimestamps(admin, "soil_water_readings", sensor.id, since),
          existingTimestamps(admin, "weather_snapshots", sensor.id, since),
        ]);

        const soilRows = readings
          .filter(r => r.hasSoil && !storedSoil.has(r.recorded_at))
          .map(r => ({
            block_id: sensor.block_id,
            sensor_id: sensor.id,
            source: "sensor",
            recorded_at: r.recorded_at,
            soil_moisture: r.soil.soil_moisture ?? null,
            soil_ec: r.soil.soil_ec ?? null,
            root_zone_temp: r.soil.root_zone_temp ?? null,
            ph: r.soil.ph ?? null,
          }));

        const weatherRows = readings
          .filter(r => r.hasWeather && !storedWeather.has(r.recorded_at))
          .map(r => ({
            block_id: sensor.block_id,
            sensor_id: sensor.id,
            source: "sensor",
            recorded_at: r.recorded_at,
            temp_c: r.weather.temp_c ?? null,
            humidity_pct: r.weather.humidity_pct ?? null,
            wind_kmh: r.weather.wind_kmh ?? null,
            wind_direction: r.weather.wind_direction != null ? String(r.weather.wind_direction) : null,
            rainfall_mm: r.weather.rainfall_mm ?? null,
            heat_stress_risk: r.weather.temp_c != null ? r.weather.temp_c > 38 : false,
            frost_risk: r.weather.temp_c != null ? r.weather.temp_c < 2 : false,
          }));

        totalSkipped += readings.length - Math.max(soilRows.length, weatherRows.length);

        const insertBatches = async (table: string, rows: unknown[]) => {
          for (const batch of chunk(rows, INSERT_CHUNK)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: insErr } = await (admin as any).from(table).insert(batch);
            if (insErr) {
              errors.push(`[${farm.name}/${sensor.name}] ${table} insert: ${insErr.message}`);
            } else {
              totalSynced += batch.length;
            }
          }
        };

        await insertBatches("soil_water_readings", soilRows);
        await insertBatches("weather_snapshots", weatherRows);

        // ── Update sensor heartbeat ───────────────────────────────────────────
        const statusInfo = statusMap[eui];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("sensors")
          .update({
            status: statusInfo?.online === false ? "offline" : "online",
            last_seen_at: statusInfo?.last_seen ?? now,
          })
          .eq("id", sensor.id);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${farm.name}/${sensor.name}] ${msg}`);
        totalSkipped++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    synced_at: now,
    synced: totalSynced,
    skipped: totalSkipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
