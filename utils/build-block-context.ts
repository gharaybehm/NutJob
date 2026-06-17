// Shared AI Agronomist context builder.
//
// Structures farm data into three freshness tiers so the AI can reason about
// data quality and flag stale inputs:
//
//   SLOW (6-monthly) — soil lab tests, block static metadata, regional climate
//   WEEKLY           — 7-day forecast, tissue samples, scouting, phenology
//   DAILY (3×/day)   — IoT soil moisture/EC/temp, current weather, alerts
//
// Both the Trigger.dev background task and the on-demand server action call
// this module so the prompt logic stays in one place.

import { getOrFetchClimateProfile, buildClimateSection } from "@/utils/climate-profile";

// ─── helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function formatDate(iso: string) {
  return iso.split("T")[0];
}

function ageLabel(isoDate: string | null | undefined, now: Date): string {
  if (!isoDate) return "unknown date";
  const days = Math.round(daysBetween(new Date(isoDate), now));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// ─── exported system prompt ──────────────────────────────────────────────────

export const AI_SYSTEM_PROMPT = `You are an expert agronomist specialising in almond farming. You analyse farm block data structured in three freshness tiers and produce prioritised, actionable recommendations for the farm manager.

Data tiers:
- SLOW DATA (6-month cadence): soil lab results, static block properties, and long-term regional climate normals derived from GPS coordinates. Use the regional climate profile to contextualise current conditions against historical norms (e.g. "current rainfall is 40% below the June average for this region").
- WEEKLY DATA: 7-day weather forecast, scouting reports, tissue samples, phenological stage.
- DAILY DATA (IoT — 3 readings/day at 00:00 / 08:00 / 16:00): soil moisture, EC, root-zone temp, current weather, computed ETo and water deficit.

Rules:
- Generate 1–3 recommendations per block, but ONLY where the data clearly indicates a need. Do not invent problems.
- Order by urgency across ALL blocks (priority 1 = most urgent farm-wide).
- Be specific: cite actual sensor values, dates, and historical norms in the rationale.
- Confidence: 90–100 = very strong signal, 70–89 = moderate, below 70 = weaker/precautionary.
- Use tree age and phenological stage to tailor recommendations: young trees (≤5 yr) require lower input rates and more frequent but smaller irrigations; stage-specific actions (e.g. hull-split sprays, bloom-period frost protection) are time-critical.
- If critical slow data (soil lab test) is older than 6 months, include a "scout" or "other" recommendation to re-sample.
- If daily IoT data is missing or its timestamp is older than 24 hours, note the data gap in the rationale and reduce your confidence score for irrigation/soil recommendations.

Respond ONLY with a valid JSON array, no other text or explanation. Each element must match this schema:
{
  "block_id": "string",
  "category": "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other",
  "title": "string (max 60 chars, start with an imperative verb)",
  "rationale": "string (2–3 sentences citing specific data values and dates)",
  "confidence": number (0–100),
  "priority": number (1 = highest)
}`;

// ─── main builder ────────────────────────────────────────────────────────────

interface SupabaseAdminLike {
  from: (table: string) => any;
}

export interface BlockContextResult {
  blockContexts: string;
  blockIds: string[];
}

export async function buildAllBlockContexts(
  admin: SupabaseAdminLike,
  farmId?: string | null
): Promise<BlockContextResult> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // ── fetch all data in parallel ──────────────────────────────────────────────
  const staleDailyThreshold = new Date(today.getTime() - 25 * 60 * 60 * 1000); // 25h ago

  const blockQuery = farmId
    ? admin.from("blocks").select("*").eq("farm_id", farmId)
    : admin.from("blocks").select("*");

  const [
    { data: blocks, error: blocksError },
    { data: allSoilReadings },
    { data: allLabTests },
    { data: weatherSnapshots },
    { data: alerts },
    { data: scoutingReports },
    { data: tissueSamples },
    { data: phenologyRecords },
    { data: farms },
  ] = await Promise.all([
    blockQuery,
    // Daily tier: sensor/computed readings — only last 25h
    admin
      .from("soil_water_readings")
      .select("*")
      .in("source", ["sensor", "computed"])
      .gte("recorded_at", staleDailyThreshold.toISOString())
      .order("recorded_at", { ascending: false }),
    // Slow tier: lab soil/water tests — latest ever per block
    admin
      .from("soil_water_readings")
      .select("*")
      .in("test_type", ["soil", "water"])
      .order("recorded_at", { ascending: false }),
    // Weekly tier: forecast snapshots
    admin
      .from("weather_snapshots")
      .select("*")
      .order("recorded_at", { ascending: false }),
    // Daily tier: unresolved alerts
    admin.from("block_alerts").select("*").eq("resolved", false),
    // Weekly tier: scouting
    admin
      .from("scouting_reports")
      .select("*")
      .order("scouted_at", { ascending: false }),
    // Weekly tier: tissue samples
    admin
      .from("tissue_samples")
      .select("*")
      .order("sampled_at", { ascending: false }),
    // Weekly tier: phenology
    admin.from("phenology_latest").select("*"),
    // Slow tier: farm GPS + climate cache
    admin.from("farms").select("id, gps_lat, gps_lng, climate_profile, climate_fetched_at"),
  ]);

  if (blocksError) throw new Error(`Blocks fetch error: ${blocksError.message}`);
  if (!blocks || blocks.length === 0) throw new Error("No blocks found");

  // ── index data ──────────────────────────────────────────────────────────────

  // Daily: latest sensor reading per block (within 25h)
  const latestDailySoil = new Map<string, any>();
  allSoilReadings?.forEach((r: any) => {
    if (r.block_id && !latestDailySoil.has(r.block_id)) latestDailySoil.set(r.block_id, r);
  });

  // Slow: latest lab test per block
  const latestLabTest = new Map<string, any>();
  allLabTests?.forEach((r: any) => {
    if (r.block_id && !latestLabTest.has(r.block_id)) latestLabTest.set(r.block_id, r);
  });

  // Weekly: weather
  const latestWeather = new Map<string, any>();
  weatherSnapshots?.forEach((r: any) => {
    const key = r.block_id ?? "global";
    if (!latestWeather.has(key)) latestWeather.set(key, r);
  });
  const globalWeather = latestWeather.get("global") ?? Array.from(latestWeather.values())[0] ?? null;

  // Daily: alerts per block
  const blockAlerts = new Map<string, any[]>();
  alerts?.forEach((a: any) => {
    if (!blockAlerts.has(a.block_id)) blockAlerts.set(a.block_id, []);
    blockAlerts.get(a.block_id)!.push(a);
  });

  // Weekly: scouting
  const latestScouting = new Map<string, any>();
  scoutingReports?.forEach((r: any) => {
    if (!latestScouting.has(r.block_id)) latestScouting.set(r.block_id, r);
  });

  // Weekly: tissue
  const latestTissue = new Map<string, any>();
  tissueSamples?.forEach((r: any) => {
    if (!latestTissue.has(r.block_id)) latestTissue.set(r.block_id, r);
  });

  // Weekly: phenology
  const latestPhenology = new Map<string, any>();
  phenologyRecords?.forEach((r: any) => {
    if (r.block_id && !latestPhenology.has(r.block_id)) latestPhenology.set(r.block_id, r);
  });

  // Slow: farms by id
  const farmsById = new Map<string, any>();
  farms?.forEach((f: any) => farmsById.set(f.id, f));

  // ── climate profiles per farm (fetched/cached) ───────────────────────────────
  const climateByFarm = new Map<string, any>();
  const uniqueFarmIds = [...new Set(blocks.map((b: any) => b.farm_id).filter(Boolean))];
  await Promise.all(
    uniqueFarmIds.map(async (fid: string) => {
      const farm = farmsById.get(fid);
      if (!farm?.gps_lat || !farm?.gps_lng) return;
      const profile = await getOrFetchClimateProfile(fid, farm.gps_lat, farm.gps_lng);
      if (profile) climateByFarm.set(fid, profile);
    })
  );

  // ── build per-block context strings ─────────────────────────────────────────
  const currentYear = today.getFullYear();

  const blockContexts = blocks
    .map((block: any) => {
      const treeAge = block.planting_year ? currentYear - block.planting_year : null;
      const dailySoil = latestDailySoil.get(block.id);
      const labTest = latestLabTest.get(block.id);
      const weather = latestWeather.get(block.id) ?? globalWeather;
      const activeAlerts = blockAlerts.get(block.id) ?? [];
      const scouting = latestScouting.get(block.id);
      const tissue = latestTissue.get(block.id);
      const phenology = latestPhenology.get(block.id);
      const climate = block.farm_id ? climateByFarm.get(block.farm_id) : null;

      const lines: string[] = [];

      // ── SLOW tier ────────────────────────────────────────────────────────────
      lines.push(`=== SLOW DATA (6-month cadence) — Block "${block.name}" (id: ${block.id}) ===`);

      if (climate) {
        lines.push(buildClimateSection(climate, today));
      }

      lines.push(
        `Block: ${block.crop_type} | Variety: ${block.variety} | Planted: ${block.planting_year} (age: ${treeAge ?? "unknown"} yr) | Area: ${block.area} ${block.area_unit} | Trees: ${block.tree_count}`
      );
      lines.push(
        `Field capacity: ${block.field_capacity ?? "N/A"}% | Wilting point: ${block.wilting_point ?? "N/A"}%`
      );

      if (labTest) {
        const labAge = ageLabel(labTest.recorded_at, today);
        const labDays = daysBetween(new Date(labTest.recorded_at), today);
        lines.push(`Last soil lab test: ${formatDate(labTest.recorded_at)} (${labAge})`);
        const labParams: string[] = [];
        if (labTest.ph != null) labParams.push(`pH: ${labTest.ph}`);
        if (labTest.soil_ec != null) labParams.push(`EC: ${labTest.soil_ec} dS/m`);
        if (labTest.parameters && typeof labTest.parameters === "object") {
          const p = labTest.parameters as Record<string, unknown>;
          if (p.organic_matter != null) labParams.push(`OM: ${p.organic_matter}%`);
          if (p.phosphorus_p2o5 != null) labParams.push(`P: ${p.phosphorus_p2o5} ppm`);
          if (p.potassium_k2o != null) labParams.push(`K: ${p.potassium_k2o} ppm`);
          if (p.cec != null) labParams.push(`CEC: ${p.cec} meq`);
        }
        if (labParams.length > 0) lines.push(`  ${labParams.join(" | ")}`);
        if (labDays > 180) {
          lines.push(`  [!] Lab test is ${Math.round(labDays / 30)} months old — consider recommending re-test.`);
        }
      } else {
        lines.push(`Last soil lab test: none on record`);
        lines.push(`  [!] No lab test data — consider recommending initial soil analysis.`);
      }

      // ── WEEKLY tier ──────────────────────────────────────────────────────────
      lines.push(`\n=== WEEKLY DATA ===`);

      if (weather) {
        const weatherAge = ageLabel(weather.recorded_at, today);
        lines.push(`Weather snapshot: ${formatDate(weather.recorded_at)} (${weatherAge})`);
        if (weather.forecast_json && typeof weather.forecast_json === "object") {
          const fc = weather.forecast_json as { days?: any[] };
          if (fc.days && Array.isArray(fc.days)) {
            const dayStrs = fc.days.slice(0, 7).map(
              (d: any) =>
                `${d.date ? d.date.slice(5) : "?"} ${d.temp_max ?? "?"}/${d.temp_min ?? "?"}C ${d.precipitation_mm ?? 0}mm`
            );
            lines.push(`  7-day forecast: ${dayStrs.join(" | ")}`);
          }
        }
        lines.push(
          `  Rainfall 7d: ${weather.rainfall_7d_mm ?? "N/A"} mm | Heat stress: ${weather.heat_stress_risk ? "YES" : "No"} | Frost risk: ${weather.frost_risk ? "YES" : "No"}`
        );
      } else {
        lines.push(`Weather snapshot: NO DATA`);
      }

      if (tissue) {
        const tissueAge = ageLabel(tissue.sampled_at, today);
        const nutrients =
          tissue.nutrients && typeof tissue.nutrients === "object"
            ? Object.entries(tissue.nutrients as Record<string, unknown>)
                .map(([k, v]) => `${k}:${v}`)
                .join(", ")
            : "no data";
        lines.push(`Tissue sample: ${formatDate(tissue.sampled_at)} (${tissueAge}) — ${nutrients}`);
      } else {
        lines.push(`Tissue sample: none on record`);
      }

      if (scouting) {
        const scoutAge = ageLabel(scouting.scouted_at, today);
        lines.push(
          `Scouting: ${formatDate(scouting.scouted_at)} (${scoutAge}) — overall_risk: ${scouting.overall_risk}${scouting.notes ? ` — "${scouting.notes}"` : ""}`
        );
      } else {
        lines.push(`Scouting: none on record`);
      }

      if (phenology) {
        lines.push(
          `Growth stage: ${phenology.current_stage} | GDD: ${phenology.cumulative_gdd ?? "N/A"} | Chill hours: ${phenology.chill_hours ?? "N/A"}${phenology.days_to_hull_split != null ? ` | Days to hull split: ${phenology.days_to_hull_split}` : ""}`
        );
        if (phenology.estimated_harvest_start || phenology.estimated_harvest_end) {
          lines.push(
            `Est. harvest window: ${phenology.estimated_harvest_start ?? "?"} – ${phenology.estimated_harvest_end ?? "?"}`
          );
        }
      } else {
        lines.push(`Growth stage: unknown`);
      }

      // ── DAILY tier (IoT — 3×/day) ────────────────────────────────────────────
      lines.push(`\n=== DAILY DATA (IoT — 3 readings/day at 00:00 / 08:00 / 16:00) ===`);

      if (dailySoil) {
        const soilAge = ageLabel(dailySoil.recorded_at, today);
        const soilMoisture = dailySoil.soil_moisture ?? "N/A";
        const fc = block.field_capacity;
        const wp = block.wilting_point;
        const deficit = dailySoil.water_deficit ?? "N/A";
        const depletionPct =
          fc && wp && dailySoil.soil_moisture != null
            ? Math.round(((fc - dailySoil.soil_moisture) / (fc - wp)) * 100)
            : null;

        lines.push(`Latest soil reading: ${formatDate(dailySoil.recorded_at)} ${dailySoil.recorded_at.split("T")[1]?.slice(0, 5) ?? ""} (${soilAge})`);
        lines.push(
          `  Soil moisture: ${soilMoisture}%${depletionPct != null ? ` (${depletionPct}% depleted)` : ""} | Field capacity: ${fc ?? "N/A"}% -> deficit: ${deficit} mm`
        );
        lines.push(
          `  ETo: ${dailySoil.eto ?? "N/A"} mm/day | EC: ${dailySoil.soil_ec ?? "N/A"} dS/m | Root-zone temp: ${dailySoil.root_zone_temp ?? "N/A"}°C`
        );
      } else {
        lines.push(
          `Latest soil reading: NO RECENT DATA (no sensor reading within the last 24 hours)`
        );
        lines.push(
          `  [!] Soil moisture / ETo data unavailable — reduce confidence on irrigation recommendations.`
        );
      }

      if (activeAlerts.length > 0) {
        lines.push(
          `Active alerts (${activeAlerts.length}): ${activeAlerts
            .map(
              (a: any) =>
                `[${String(a.severity).toUpperCase()} ${a.domain}: "${a.message}"]`
            )
            .join(" | ")}`
        );
      } else {
        lines.push(`Active alerts: none`);
      }

      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return {
    blockContexts,
    blockIds: blocks.map((b: any) => b.id as string),
  };
}

export { type ClimateProfile } from "@/utils/climate-profile";
