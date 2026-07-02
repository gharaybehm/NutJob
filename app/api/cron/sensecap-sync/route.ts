import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createSensecapClient, mapTelemetryToPayloads } from "@/utils/sensecap-client";

// SenseCAP sensor sync — runs 3× per day at 00:00, 08:00, 16:00 UTC.
//
// For each farm with SenseCAP credentials configured, fetches the latest
// telemetry reading for every registered sensor (device_id = SenseCAP EUI)
// and writes the values into soil_water_readings / weather_snapshots.
//
// Trigger options (all call the same endpoint):
//   - Trigger.dev schedule (src/trigger/sensecap-sync.ts)  ← recommended
//   - External cron service (e.g. cron-job.org)
//   - Manual: GET /api/cron/sensecap-sync?secret=YOUR_CRON_SECRET

export async function GET(request: NextRequest) {
  // Auth: same CRON_SECRET pattern as /api/cron/weather
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
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
        const channels = await client.fetchLatestTelemetry(eui);

        if (!channels || channels.length === 0) {
          totalSkipped++;
          continue;
        }

        const { soil, weather } = mapTelemetryToPayloads(channels);
        const hasSoil = Object.keys(soil).some((k) => k !== "recorded_at" && soil[k as keyof typeof soil] != null);
        const hasWeather = Object.keys(weather).some((k) => k !== "recorded_at" && weather[k as keyof typeof weather] != null);

        if (!hasSoil && !hasWeather) {
          totalSkipped++;
          continue;
        }

        // ── Soil insert ───────────────────────────────────────────────────────
        if (hasSoil) {
          const recordedAt = soil.recorded_at ?? now;

          // Dedup: skip if we already have a reading from this sensor at this timestamp
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await (admin as any)
            .from("soil_water_readings")
            .select("id", { count: "exact", head: true })
            .eq("sensor_id", sensor.id)
            .eq("recorded_at", recordedAt);

          if ((count ?? 0) === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: soilErr } = await (admin as any)
              .from("soil_water_readings")
              .insert({
                block_id: sensor.block_id,
                sensor_id: sensor.id,
                source: "sensor",
                recorded_at: recordedAt,
                soil_moisture: soil.soil_moisture ?? null,
                soil_ec: soil.soil_ec ?? null,
                root_zone_temp: soil.root_zone_temp ?? null,
                ph: soil.ph ?? null,
              });

            if (soilErr) {
              errors.push(`[${farm.name}/${sensor.name}] Soil insert: ${soilErr.message}`);
            } else {
              totalSynced++;
            }
          } else {
            totalSkipped++;
          }
        }

        // ── Weather insert ────────────────────────────────────────────────────
        if (hasWeather) {
          const recordedAt = weather.recorded_at ?? now;

          // Dedup
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await (admin as any)
            .from("weather_snapshots")
            .select("id", { count: "exact", head: true })
            .eq("sensor_id", sensor.id)
            .eq("recorded_at", recordedAt);

          if ((count ?? 0) === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: wxErr } = await (admin as any)
              .from("weather_snapshots")
              .insert({
                block_id: sensor.block_id,
                sensor_id: sensor.id,
                source: "sensor",
                recorded_at: recordedAt,
                temp_c: weather.temp_c ?? null,
                humidity_pct: weather.humidity_pct ?? null,
                wind_kmh: weather.wind_kmh ?? null,
                wind_direction: weather.wind_direction != null ? String(weather.wind_direction) : null,
                rainfall_mm: weather.rainfall_mm ?? null,
                heat_stress_risk: weather.temp_c != null ? weather.temp_c > 38 : false,
                frost_risk: weather.temp_c != null ? weather.temp_c < 2 : false,
              });

            if (wxErr) {
              errors.push(`[${farm.name}/${sensor.name}] Weather insert: ${wxErr.message}`);
            } else {
              totalSynced++;
            }
          } else {
            totalSkipped++;
          }
        }

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
