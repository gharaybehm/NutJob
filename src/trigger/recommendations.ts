import { logger, task } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";
import { createAdminClient } from "../../utils/supabase/admin";

// Initialize OpenAI SDK configured for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || "", // fallback if needed
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://nutjob.farm",
    "X-Title": "NutJob Farm Management",
  },
});

const AI_SYSTEM_PROMPT = `You are an expert agronomist specialising in almond farming in a semi-arid Mediterranean climate. You analyse real-time farm block data and produce prioritised, actionable recommendations for the farm manager.

Rules:
- Generate 1–3 recommendations per block, but ONLY where the data clearly indicates a need. Do not invent problems.
- Order by urgency across ALL blocks (priority 1 = most urgent farm-wide).
- Be specific: cite actual sensor values or observations in the rationale.
- Confidence: 90–100 = very strong signal, 70–89 = moderate, below 70 = weaker/precautionary.
- Use tree age and phenological stage to tailor recommendations: young trees (≤5 yr) require lower input rates and more frequent but smaller irrigations; stage-specific actions (e.g. hull-split sprays, bloom-period frost protection) are time-critical and should carry high priority and confidence. Cite stage and tree age in the rationale when they influence the recommendation.

Respond ONLY with a valid JSON array, no other text or explanation. Each element must match this schema:
{
  "block_id": "string",
  "category": "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other",
  "title": "string (max 60 chars, start with an imperative verb)",
  "rationale": "string (2–3 sentences citing specific data values)",
  "confidence": number (0–100),
  "priority": number (1 = highest)
}`;

export const generateRecommendationsTask = task({
  id: "generate-recommendations",
  maxDuration: 600, // 10 minutes max execution time
  run: async (payload: { userId: string }) => {
    logger.log("Starting agronomist AI agent recommendations task", { payload });

    // Initialize Supabase Admin client (RLS bypass)
    const admin = createAdminClient();

    // Fetch all context in parallel
    const [
      { data: blocks, error: blocksError },
      { data: soilReadings, error: soilError },
      { data: weatherSnapshots, error: weatherError },
      { data: alerts, error: alertsError },
      { data: scoutingReports, error: scoutingError },
      { data: tissueSamples, error: tissueError },
      { data: phenologyRecords, error: _phenologyError },
    ] = await Promise.all([
      admin.from("blocks").select("*"),
      admin.from("soil_water_readings").select("*").order("recorded_at", { ascending: false }),
      admin.from("weather_snapshots").select("*").order("recorded_at", { ascending: false }),
      admin.from("block_alerts").select("*").eq("resolved", false),
      admin.from("scouting_reports").select("*").order("scouted_at", { ascending: false }),
      admin.from("tissue_samples").select("*").order("sampled_at", { ascending: false }),
      admin.from("phenology_latest").select("*"),
    ]);

    if (blocksError) throw new Error(`Blocks fetch error: ${blocksError.message}`);
    if (!blocks || blocks.length === 0) throw new Error("No blocks found in database");

    logger.log("Successfully fetched database context. Building block summaries...", {
      blocksCount: blocks.length,
      soilReadingsCount: soilReadings?.length ?? 0,
      weatherSnapshotsCount: weatherSnapshots?.length ?? 0,
      alertsCount: alerts?.length ?? 0,
      scoutingReportsCount: scoutingReports?.length ?? 0,
      tissueSamplesCount: tissueSamples?.length ?? 0,
      phenologyRecordsCount: phenologyRecords?.length ?? 0,
    });

    // Index latest reading per block
    const latestSoil = new Map();
    soilReadings?.forEach((r) => { if (r.block_id && !latestSoil.has(r.block_id)) latestSoil.set(r.block_id, r); });

    const latestWeather = new Map();
    weatherSnapshots?.forEach((r) => {
      const key = r.block_id ?? "global";
      if (!latestWeather.has(key)) latestWeather.set(key, r);
    });
    const globalWeather = latestWeather.get("global") ?? Array.from(latestWeather.values())[0] ?? null;

    const blockAlerts = new Map();
    alerts?.forEach((a) => {
      if (!blockAlerts.has(a.block_id)) blockAlerts.set(a.block_id, []);
      blockAlerts.get(a.block_id)!.push(a);
    });

    const latestScouting = new Map();
    scoutingReports?.forEach((r) => { if (!latestScouting.has(r.block_id)) latestScouting.set(r.block_id, r); });

    const latestTissue = new Map();
    tissueSamples?.forEach((r) => { if (!latestTissue.has(r.block_id)) latestTissue.set(r.block_id, r); });

    const latestPhenology = new Map();
    phenologyRecords?.forEach((r) => { if (r.block_id && !latestPhenology.has(r.block_id)) latestPhenology.set(r.block_id, r); });

    // Build per-block context strings
    const today = new Date().toISOString().split("T")[0];
    const currentYear = new Date().getFullYear();
    const blockContexts = blocks.map((block) => {
      const soil = latestSoil.get(block.id);
      const weather = latestWeather.get(block.id) ?? globalWeather;
      const activeAlerts = blockAlerts.get(block.id) ?? [];
      const scouting = latestScouting.get(block.id);
      const tissue = latestTissue.get(block.id);
      const phenology = latestPhenology.get(block.id);
      const treeAge = block.planting_year ? currentYear - block.planting_year : null;

      let ctx = `Block "${block.name}" (id: ${block.id})
- Crop: ${block.crop_type}, Variety: ${block.variety}, Planted: ${block.planting_year} (age: ${treeAge ?? "unknown"} yr), Area: ${block.area} ${block.area_unit}, Trees: ${block.tree_count}`;

      if (soil) {
        ctx += `
- Soil moisture: ${soil.soil_moisture ?? "N/A"}% | Field capacity: ${block.field_capacity ?? "N/A"}% | Wilting point: ${block.wilting_point ?? "N/A"}%
- Water deficit: ${soil.water_deficit ?? "N/A"} mm | ETo: ${soil.eto ?? "N/A"} mm/day | EC: ${soil.soil_ec ?? "N/A"} dS/m`;
      } else {
        ctx += `\n- No soil readings on record`;
      }

      if (weather) {
        ctx += `
- Weather: ${weather.temp_c ?? "N/A"}°C | Humidity: ${weather.humidity_pct ?? "N/A"}% | Rainfall 7d: ${weather.rainfall_7d_mm ?? "N/A"} mm
- Heat stress: ${weather.heat_stress_risk ? "YES" : "No"} | Frost risk: ${weather.frost_risk ? "YES" : "No"}`;
      }

      if (activeAlerts.length > 0) {
        ctx += `\n- Active alerts: ${activeAlerts.map((a: any) => `[${a.severity.toUpperCase()} ${a.domain}: "${a.message}"]`).join(" | ")}`;
      }

      if (scouting) {
        ctx += `\n- Last scouting (${scouting.scouted_at.split("T")[0]}): risk=${scouting.overall_risk}${scouting.notes ? ` — "${scouting.notes}"` : ""}`;
      }

      if (tissue?.nutrients && typeof tissue.nutrients === "object") {
        const nutrientStr = Object.entries(tissue.nutrients as Record<string, unknown>)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ");
        ctx += `\n- Tissue sample (${tissue.sampled_at.split("T")[0]}): ${nutrientStr}`;
      }

      if (phenology) {
        ctx += `\n- Growth stage: ${phenology.current_stage} | GDD accumulated: ${phenology.cumulative_gdd ?? "N/A"} | Chill hours: ${phenology.chill_hours ?? "N/A"}`;
        if (phenology.days_to_hull_split != null) {
          ctx += ` | Days to hull split: ${phenology.days_to_hull_split}`;
        }
        if (phenology.estimated_harvest_start || phenology.estimated_harvest_end) {
          ctx += `\n- Est. harvest window: ${phenology.estimated_harvest_start ?? "?"} – ${phenology.estimated_harvest_end ?? "?"}`;
        }
      }

      return ctx;
    }).join("\n\n");

    const openRouterModel = "google/gemini-2.5-flash";
    logger.log(`Invoking OpenRouter model: ${openRouterModel}...`);

    const response = await openrouter.chat.completions.create({
      model: openRouterModel,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today: ${today}\n\nFarm data:\n\n${blockContexts}\n\nGenerate prioritised recommendations.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0].message.content || "[]";
    logger.log("Received AI response from OpenRouter", { responseLength: raw.length });

    let parsed: unknown;
    try {
      // Find array content if wrapped in extra text or markdown
      let cleanRaw = raw.trim();
      if (cleanRaw.startsWith("```json")) {
        cleanRaw = cleanRaw.replace(/```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanRaw.startsWith("```")) {
        cleanRaw = cleanRaw.replace(/```\s*/, "").replace(/\s*```$/, "");
      }
      parsed = JSON.parse(cleanRaw);
      if (!Array.isArray(parsed)) {
        if (typeof parsed === "object" && parsed !== null) {
          // If returned an object with a recommendations key
          const keys = Object.keys(parsed);
          const potentialArray = (parsed as any)[keys[0]];
          if (Array.isArray(potentialArray)) {
            parsed = potentialArray;
          }
        }
      }
      if (!Array.isArray(parsed)) throw new Error("Parsed output is not an array");
    } catch (e: any) {
      logger.error("Failed to parse AI JSON recommendations", { raw, error: e.message });
      throw new Error(`AI returned unparseable output: ${e.message}`);
    }

    const validCategories = new Set(["irrigate", "fertilize", "spray", "scout", "prune", "other"]);
    const validBlockIds = new Set(blocks.map((b) => b.id));

    const toInsert = (parsed as Record<string, unknown>[])
      .filter(
        (r) =>
          typeof r.block_id === "string" && validBlockIds.has(r.block_id) &&
          typeof r.category === "string" && validCategories.has(r.category) &&
          typeof r.title === "string" && r.title.length > 0 &&
          typeof r.rationale === "string" && r.rationale.length > 0
      )
      .map((r) => ({
        block_id: r.block_id as string,
        category: r.category as any,
        title: (r.title as string).slice(0, 200),
        rationale: r.rationale as string,
        confidence: Math.min(1, Math.max(0, (Number(r.confidence) || 75) / 100)),
        status: "pending" as const,
        llm_model: openRouterModel,
      }));

    if (toInsert.length === 0) {
      logger.log("No valid recommendations extracted from AI response.");
      return { success: true, count: 0, model: openRouterModel };
    }

    logger.log(`Inserting ${toInsert.length} recommendations into database...`);
    const { error: insertError } = await admin.from("recommendations").insert(toInsert);
    if (insertError) throw new Error(`Insert error: ${insertError.message}`);

    logger.log("Background worker agronomist task completed successfully!");
    return { success: true, count: toInsert.length, model: openRouterModel };
  },
});
