/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase rows shaped into prompt text */
// Shared AI Agronomist context builder.
//
// Structures farm data into three freshness tiers so the AI can reason about
// data quality and flag stale inputs:
//
//   SLOW (6-monthly) — soil lab tests, block static metadata, regional climate
//   WEEKLY           — 7-day forecast, tissue samples, scouting, phenology
//   DAILY (hourly)   — IoT soil moisture/EC/temp, current weather, alerts
//
// Both the Trigger.dev background task and the on-demand server action call
// this module so the prompt logic stays in one place.

import { getOrFetchClimateProfile, buildClimateSection } from "@/utils/climate-profile";
import { pickLabTest, checkLabConsistency, describeLabTest, describeConflict } from "@/utils/lab-tests";
import { assessMaturity, expectsCrop } from "@/engines/maturity";
import { assessLeafSample, describeLeafAssessment } from "@/engines/nutrition";
import { nitrogenBudget, nitrogenApplied, describeNitrogenBudget, parseNSplit, type FertigationLog, type NitrogenSplitPart } from "@/engines/nitrogen";
import { toHectares } from "@/utils/area";
import { resolveVariety } from "@/engines/varieties";
import { findCrop } from "@/utils/crops";

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

export const AI_SYSTEM_PROMPT = `You are an expert agronomist. Each block specifies its own crop and variety — tailor your reasoning to that crop rather than assuming a single crop farm-wide. You analyse farm block data structured in three freshness tiers and produce prioritised, actionable recommendations for the farm manager.

Data tiers:
- SLOW DATA (6-month cadence): soil lab results, static block properties, and long-term regional climate normals derived from GPS coordinates. Use the regional climate profile to contextualise current conditions against historical norms (e.g. "current rainfall is 40% below the June average for this region").
- WEEKLY DATA: 7-day weather forecast, scouting reports, tissue samples, phenological stage.
- DAILY DATA (IoT — synced every hour): soil moisture, EC, root-zone temp, current weather, computed ETo and water deficit.

Rules:
- Generate 1–3 recommendations per block, but ONLY where the data clearly indicates a need. Do not invent problems.
- Order by urgency across ALL blocks (priority 1 = most urgent farm-wide).
- Be specific: cite actual sensor values, dates, and historical norms in the rationale.
- Confidence: 90–100 = very strong signal, 70–89 = moderate, below 70 = weaker/precautionary.
- Each block states its tree maturity (leaf year, and whether a crop is expected). Use it: for a block marked NO CROP EXPECTED, never recommend harvest, hull-split, crop-load or yield-based actions, and expect water and fertiliser needs far below a mature orchard's. Use the phenological stage to time stage-specific actions (e.g. bloom-period frost protection) only where the block can bear a crop.
- Lines starting with [!] are data-quality warnings and [i] lines are assumptions. Do not base a recommendation on a value a [!] line calls suspect, and say so in the rationale. Every recommendation must respect the units shown (P2O5 and K2O are in kg/da, not ppm).
- Leaf tissue results arrive already judged against the reference bands (deficient, marginal, adequate, high). Use those judgements, do not apply nutrient thresholds of your own, and never treat a nutrient marked "not judged" as adequate or deficient. If a caution says the sample was taken outside the July window, the block is not bearing, or the bands are provisional, say so in the rationale and lower the confidence. Each block may also carry a "Nitrogen budget (guide)" line, its seasonal split and the urea already logged this year. You may cite those figures as a guide and say how much of the budget remains, but do not invent a rate of your own or state a different one, and say the agronomist should confirm it. If the budget line is missing or a [!] line says it is unsupported, give no rate.
- If critical slow data (soil lab test) is older than 6 months, include a "scout" or "other" recommendation to re-sample.
- If daily IoT data is missing or its timestamp is older than 24 hours, note the data gap in the rationale and reduce your confidence score for irrigation/soil recommendations.
- Each block's data may include a "=== REFERENCE MATERIAL ===" section with excerpts retrieved from trusted agronomic sources (e.g. university cooperative extension manuals) for that block's crop. Where a recommendation is supported by this material, ground your rationale in it and cite the source title/section in "sources". If no reference material was provided, or none of it is relevant to a given recommendation, leave "sources" as an empty array — never fabricate a citation.

Respond ONLY with a valid JSON array, no other text or explanation. Each element must match this schema:
{
  "block_id": "string",
  "category": "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other",
  "title": "string (max 60 chars, start with an imperative verb)",
  "rationale": "string (2–3 sentences citing specific data values and dates)",
  "confidence": number (0–100),
  "priority": number (1 = highest),
  "sources": [{ "title": "string", "section": "string | null" }]
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
    (uniqueFarmIds as string[]).map(async (fid: string) => {
      const farm = farmsById.get(fid);
      if (!farm?.gps_lat || !farm?.gps_lng) return;
      const profile = await getOrFetchClimateProfile(fid, farm.gps_lat, farm.gps_lng);
      if (profile) climateByFarm.set(fid, profile);
    })
  );

  // ── nitrogen budget inputs: per-farm yield target and this year's fertigation ─
  const yieldTargetByFarm = new Map<string, number>();
  const nSplitByFarm = new Map<string, NitrogenSplitPart[]>();
  const { data: policyRows } = await admin.from("farm_policy").select("*");
  (policyRows as any[] | null)?.forEach((p) => {
    const t = Number(p.n_yield_target_kg_ha);
    if (p.farm_id && Number.isFinite(t) && t > 0) yieldTargetByFarm.set(p.farm_id, t);
    const split = parseNSplit(p.n_split);
    if (p.farm_id && split) nSplitByFarm.set(p.farm_id, split);
  });
  const fertByBlock = new Map<string, FertigationLog[]>();
  const { data: fertRows } = await admin
    .from("activity_log")
    .select("block_id, performed_at, details")
    .eq("activity_type", "fertigation")
    .gte("performed_at", `${today.getFullYear()}-01-01`);
  (fertRows as any[] | null)?.forEach((r) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    const list = fertByBlock.get(r.block_id) ?? [];
    list.push({
      performedAt: r.performed_at,
      product: typeof d.product_name === "string" ? d.product_name : null,
      amountPerTree: typeof d.amount_per_tree === "number" ? d.amount_per_tree : null,
      unit: typeof d.amount_unit === "string" ? d.amount_unit : null,
    });
    fertByBlock.set(r.block_id, list);
  });

  // ── build per-block context strings ─────────────────────────────────────────
  const blockContexts = blocks
    .map((block: any) => {
      const maturity = assessMaturity({ plantingDate: block.planting_date, plantingYear: block.planting_year, cropType: block.crop_type ?? null, now: today });
      const dailySoil = latestDailySoil.get(block.id);
      // The block's own latest test, else the whole-farm test of its farm (never another farm's).
      const soilPick = pickLabTest(allLabTests ?? [], { blockId: block.id, farmId: block.farm_id ?? null, testType: "soil" });
      const waterPick = pickLabTest(allLabTests ?? [], { blockId: block.id, farmId: block.farm_id ?? null, testType: "water" });
      const labTest = soilPick.row;
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
        `Block: ${block.crop_type} | Variety: ${block.variety} | Rootstock: ${block.rootstock && String(block.rootstock).toLowerCase() !== "unknown" ? block.rootstock : "not recorded"} | Planted: ${block.planting_date ?? `${block.planting_year} (year only, read as Sep-Dec)`} | Area: ${block.area} ${block.area_unit} | Trees: ${block.tree_count}`
      );
      lines.push(
        `Tree maturity: ${maturity.label}${
          expectsCrop(maturity)
            ? ""
            : " — NO CROP EXPECTED: no harvest, hull-split or crop-load actions apply, and water and fertiliser needs are far below a mature orchard's"
        }`
      );
      for (const note of maturity.notes) lines.push(`  [i] ${note}`);
      if (!findCrop(block.crop_type)) {
        lines.push(`  [i] No crop-specific engine data (frost thresholds, tree-age schedule, crop coefficients, growth stages) is loaded for "${block.crop_type}": rely on the reference material and the block's own data, and do not apply figures from another crop.`);
      } else if (!resolveVariety(block.variety, block.crop_type).recognised) {
        lines.push(`  [i] Variety "${block.variety}" is not on the reference list, so no variety-specific data (for example frost tolerance) is available and general ${findCrop(block.crop_type)!.id} values apply.`);
      }
      lines.push(
        `Field capacity: ${block.field_capacity ?? "N/A"}% | Wilting point: ${block.wilting_point ?? "N/A"}%`
      );

      if (labTest) {
        const labAge = ageLabel(labTest.recorded_at, today);
        const labDays = daysBetween(new Date(labTest.recorded_at), today);
        const scope = soilPick.scope === "farm" ? "whole-farm sample, not specific to this block" : "this block";
        lines.push(
          `Last soil lab test: ${formatDate(labTest.recorded_at)} (${labAge}) | ${scope}${labTest.lab_reference ? ` | lab ref ${labTest.lab_reference}` : ""}`
        );
        const labParams = describeLabTest(labTest);
        if (labParams.length > 0) lines.push(`  ${labParams.join(" | ")}`);
        lines.push(`  Reference bands follow a Turkish lab's units (P2O5 and K2O in kg/da) and are not almond-specific. This test does not measure nitrogen.`);
        for (const flag of checkLabConsistency(labTest)) lines.push(`  [!] ${flag}`);
        for (const c of soilPick.conflicts) lines.push(`  [!] ${describeConflict(c)}`);
        if (labDays > 180) {
          lines.push(`  [!] Lab test is ${Math.round(labDays / 30)} months old — consider recommending re-test.`);
        }
      } else {
        lines.push(`Last soil lab test: none on record`);
        lines.push(`  [!] No lab test data — consider recommending initial soil analysis.`);
      }

      if (waterPick.row) {
        const w = waterPick.row;
        const p = (w.parameters ?? {}) as Record<string, unknown>;
        lines.push(
          `Last irrigation-water test: ${formatDate(w.recorded_at)} (${ageLabel(w.recorded_at, today)}) | ${
            p.water_ec_us_cm != null ? `EC ${p.water_ec_us_cm} uS/cm` : "EC not recorded"
          }${w.ph != null ? ` | pH ${w.ph}` : ""}`
        );
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
          tissue.nutrients && typeof tissue.nutrients === "object" && !Array.isArray(tissue.nutrients)
            ? (tissue.nutrients as Record<string, unknown>)
            : {};
        const leaf = assessLeafSample({ cropType: block.crop_type, sampledAt: String(tissue.sampled_at).slice(0, 10), values: nutrients, maturity });
        lines.push(`Leaf tissue sample: ${formatDate(tissue.sampled_at)} (${tissueAge})${tissue.lab_reference ? ` | lab ref ${tissue.lab_reference}` : ""}`);
        for (const l of describeLeafAssessment(leaf)) lines.push(`  ${l}`);
      } else {
        lines.push(`Leaf tissue sample: none on record`);
      }

      {
        const budget = nitrogenBudget({
          cropType: block.crop_type ?? null, plantingDate: block.planting_date, plantingYear: block.planting_year,
          areaHa: toHectares(block.area, block.area_unit), yieldTargetKgHa: yieldTargetByFarm.get(block.farm_id), split: nSplitByFarm.get(block.farm_id), now: today,
        });
        const applied = budget.supported ? nitrogenApplied(fertByBlock.get(block.id) ?? [], Number(block.tree_count) || 0, today.getFullYear()) : null;
        for (const l of describeNitrogenBudget(budget, applied)) lines.push(l);
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

      // ── DAILY tier (IoT — synced hourly) ─────────────────────────────────────
      lines.push(`\n=== DAILY DATA (IoT — synced every hour) ===`);

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
