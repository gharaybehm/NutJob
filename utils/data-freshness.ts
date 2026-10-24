/* eslint-disable @typescript-eslint/no-explicit-any -- farm_id columns predate the generated Supabase types */
import { createClient } from "@/utils/supabase/server";
import type { DataFreshness } from "@/utils/data-freshness-shared";
import { staleAfterS, typicalIntervalS } from "@/engines/sensor-interval";

export type { DataFreshness };

const SENSOR_ROWS = 200;

/** Stale threshold for the slowest sensor in the rows, minutes; null when no interval can be read. */
function sensorsStaleAfterMin(rows: { sensor_id: string | null; recorded_at: string }[]): number | null {
  const bySensor = new Map<string, string[]>();
  for (const r of rows) {
    const key = r.sensor_id ?? "";
    bySensor.set(key, [...(bySensor.get(key) ?? []), r.recorded_at]);
  }
  const intervals = [...bySensor.values()].map((times) => typicalIntervalS(times)).filter((s): s is number => s !== null);
  return intervals.length === 0 ? null : Math.round(staleAfterS(Math.max(...intervals)) / 60);
}

function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export async function getDataFreshness(farmId: string, blockIds: string[]): Promise<DataFreshness> {
  const supabase = await createClient();
  const db = supabase as any;
  const blockFilter = blockIds.length > 0 ? blockIds : ["__none__"];

  const [{ data: sensor }, { data: weather }, { data: irrigation }] = await Promise.all([
    // Enough recent readings to read each sensor's interval, which is set on the device.
    db.from("soil_water_readings")
      .select("sensor_id, recorded_at")
      .in("block_id", blockFilter)
      .eq("source", "sensor")
      .order("recorded_at", { ascending: false })
      .limit(SENSOR_ROWS),
    db.from("weather_snapshots")
      .select("recorded_at")
      .eq("farm_id", farmId)
      .order("recorded_at", { ascending: false })
      .limit(1),
    db.from("activity_log")
      .select("performed_at")
      .eq("farm_id", farmId)
      .eq("activity_type", "irrigation")
      .order("performed_at", { ascending: false })
      .limit(1),
  ]);

  return {
    sensorsMin: ageMinutes(sensor?.[0]?.recorded_at),
    sensorsStaleAfterMin: sensorsStaleAfterMin(sensor ?? []),
    weatherMin: ageMinutes(weather?.[0]?.recorded_at),
    irrigationLogMin: ageMinutes(irrigation?.[0]?.performed_at),
  };
}
