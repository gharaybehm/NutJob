/* eslint-disable @typescript-eslint/no-explicit-any -- farm_id columns predate the generated Supabase types */
import { createClient } from "@/utils/supabase/server";
import type { DataFreshness } from "@/utils/data-freshness-shared";

export type { DataFreshness };

function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export async function getDataFreshness(farmId: string, blockIds: string[]): Promise<DataFreshness> {
  const supabase = await createClient();
  const db = supabase as any;
  const blockFilter = blockIds.length > 0 ? blockIds : ["__none__"];

  const [{ data: sensor }, { data: weather }, { data: irrigation }] = await Promise.all([
    db.from("soil_water_readings")
      .select("recorded_at")
      .in("block_id", blockFilter)
      .eq("source", "sensor")
      .order("recorded_at", { ascending: false })
      .limit(1),
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
    weatherMin: ageMinutes(weather?.[0]?.recorded_at),
    irrigationLogMin: ageMinutes(irrigation?.[0]?.performed_at),
  };
}
