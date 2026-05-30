"use server";

import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { localeToLanguageName } from "@/utils/format";

const AI_BASE_URL = process.env.NETLIFY_AI_GATEWAY_URL || "https://openrouter.ai/api/v1";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: AI_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "https://nutjob.farm",
    "X-Title": "NutJob Farm Management",
  },
});

const OPENROUTER_MODEL = "google/gemini-2.5-flash";

const AI_SYSTEM_PROMPT = `You are an expert agronomist specialising in almond farming in a semi-arid Mediterranean climate. You analyse real-time farm block data and produce prioritised, actionable recommendations for the farm manager.

Rules:
- Generate 1–3 recommendations per block, but ONLY where the data clearly indicates a need. Do not invent problems.
- Order by urgency across ALL blocks (priority 1 = most urgent farm-wide).
- Be specific: cite actual sensor values or observations in the rationale.
- Confidence: 90–100 = very strong signal, 70–89 = moderate, below 70 = weaker/precautionary.

Respond ONLY with a valid JSON array, no other text or explanation. Each element must match this schema:
{
  "block_id": "string",
  "category": "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other",
  "title": "string (max 60 chars, start with an imperative verb)",
  "rationale": "string (2–3 sentences citing specific data values)",
  "confidence": number (0–100),
  "priority": number (1 = highest)
}`;

type RecommendationCategory = "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other";
type ActivityType = "irrigation" | "fertigation" | "spraying" | "pruning" | "scouting" | "other";

function categoryToActivityType(category: RecommendationCategory): ActivityType {
  const map: Record<RecommendationCategory, ActivityType> = {
    irrigate: "irrigation",
    fertilize: "fertigation",
    spray: "spraying",
    prune: "pruning",
    scout: "scouting",
    other: "other",
  };
  return map[category];
}

async function writeActivityLog(params: {
  title: string;
  category: RecommendationCategory;
  block_id: string | null;
  rationale: string;
  manager_note?: string | null;
  recommendation_id: string;
  performed_by: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_log")
    .insert({
      title: params.title,
      activity_type: categoryToActivityType(params.category),
      block_id: params.block_id,
      description: params.rationale,
      details: {
        source: "recommendation",
        recommendation_id: params.recommendation_id,
        ...(params.manager_note ? { manager_note: params.manager_note } : {}),
      },
      performed_at: new Date().toISOString(),
      performed_by: params.performed_by,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

type AgroDomain = "soil-water" | "phenology" | "nutrition" | "pest-disease" | "weather";

async function applyStateMutation(category: RecommendationCategory, block_id: string | null) {
  if (!block_id) return;

  const domainMap: Record<RecommendationCategory, AgroDomain | null> = {
    irrigate: "soil-water",
    fertilize: "nutrition",
    spray: "pest-disease",
    scout: "pest-disease",
    prune: "phenology",
    other: null,
  };

  const domain = domainMap[category];
  const admin = createAdminClient();

  if (domain) {
    await admin
      .from("block_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("block_id", block_id)
      .eq("domain", domain)
      .eq("resolved", false);
  }

  if (category === "irrigate") {
    const { data: block } = await admin
      .from("blocks")
      .select("field_capacity")
      .eq("id", block_id)
      .single();

    await admin.from("soil_water_readings").insert({
      block_id,
      water_deficit: 0,
      soil_moisture: block?.field_capacity ?? 30,
      source: "manual",
      test_type: "Irrigation Reset",
      notes: "Auto-generated from accepted AI recommendation",
      recorded_at: new Date().toISOString(),
    });
  }

  if (category === "spray") {
    await admin
      .from("pest_observations")
      .update({ stage: "Resolved", risk_level: "green" })
      .eq("block_id", block_id)
      .neq("stage", "Resolved");
  }
}

export async function getRecommendations() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recommendations")
    .select(`
      *,
      blocks (
        name
      )
    `)
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching recommendations:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function updateRecommendationStatus(
  id: string,
  status: "pending" | "accepted" | "edited" | "skipped"
) {
  const supabase = await createClient();

  let activityLogId: string | null = null;

  if (status === "accepted") {
    const [{ data: { user } }, { data: rec, error: fetchError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("recommendations")
        .select("title, category, block_id, rationale, manager_note")
        .eq("id", id)
        .single(),
    ]);

    if (fetchError || !rec) throw new Error(fetchError?.message ?? "Recommendation not found");

    activityLogId = await writeActivityLog({
      title: rec.title,
      category: rec.category as RecommendationCategory,
      block_id: rec.block_id,
      rationale: rec.rationale,
      manager_note: rec.manager_note,
      recommendation_id: id,
      performed_by: user?.id ?? null,
    });

    await applyStateMutation(rec.category as RecommendationCategory, rec.block_id);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("recommendations")
    .update({
      status,
      acted_at: status !== "pending" ? new Date().toISOString() : null,
      ...(activityLogId ? { activity_log_id: activityLogId } : {}),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/recommendations");
}

export async function editRecommendation(
  id: string,
  updates: { title?: string; manager_note?: string }
) {
  const supabase = await createClient();

  const [{ data: { user } }, { data: rec, error: fetchError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("recommendations")
      .select("title, category, block_id, rationale")
      .eq("id", id)
      .single(),
  ]);

  if (fetchError || !rec) throw new Error(fetchError?.message ?? "Recommendation not found");

  const finalTitle = updates.title?.trim() || rec.title;

  const activityLogId = await writeActivityLog({
    title: finalTitle,
    category: rec.category as RecommendationCategory,
    block_id: rec.block_id,
    rationale: rec.rationale,
    manager_note: updates.manager_note,
    recommendation_id: id,
    performed_by: user?.id ?? null,
  });

  await applyStateMutation(rec.category as RecommendationCategory, rec.block_id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("recommendations")
    .update({
      title: finalTitle,
      manager_note: updates.manager_note ?? null,
      status: "edited",
      acted_at: new Date().toISOString(),
      activity_log_id: activityLogId,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/recommendations");
}

export async function generateAIRecommendations(): Promise<{ count: number; model: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const languageName = localeToLanguageName(locale);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorised");

  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

  // Fetch all context in parallel
  const [
    { data: blocks, error: blocksError },
    { data: soilReadings },
    { data: weatherSnapshots },
    { data: alerts },
    { data: scoutingReports },
    { data: tissueSamples },
  ] = await Promise.all([
    admin.from("blocks").select("*"),
    admin.from("soil_water_readings").select("*").order("recorded_at", { ascending: false }),
    admin.from("weather_snapshots").select("*").order("recorded_at", { ascending: false }),
    admin.from("block_alerts").select("*").eq("resolved", false),
    admin.from("scouting_reports").select("*").order("scouted_at", { ascending: false }),
    admin.from("tissue_samples").select("*").order("sampled_at", { ascending: false }),
  ]);

  if (blocksError) throw new Error(`Blocks fetch error: ${blocksError.message}`);
  if (!blocks || blocks.length === 0) throw new Error("No blocks found in database");

  // Index latest reading per block
  const latestSoil = new Map<string, typeof soilReadings extends (infer T)[] | null ? T : never>();
  soilReadings?.forEach((r) => { if (r.block_id && !latestSoil.has(r.block_id)) latestSoil.set(r.block_id, r); });

  const latestWeather = new Map<string, typeof weatherSnapshots extends (infer T)[] | null ? T : never>();
  weatherSnapshots?.forEach((r) => {
    const key = r.block_id ?? "global";
    if (!latestWeather.has(key)) latestWeather.set(key, r);
  });
  const globalWeather = latestWeather.get("global") ?? Array.from(latestWeather.values())[0] ?? null;

  const blockAlerts = new Map<string, (typeof alerts extends (infer T)[] | null ? T : never)[]>();
  alerts?.forEach((a) => {
    if (!blockAlerts.has(a.block_id)) blockAlerts.set(a.block_id, []);
    blockAlerts.get(a.block_id)!.push(a);
  });

  const latestScouting = new Map<string, typeof scoutingReports extends (infer T)[] | null ? T : never>();
  scoutingReports?.forEach((r) => { if (!latestScouting.has(r.block_id)) latestScouting.set(r.block_id, r); });

  const latestTissue = new Map<string, typeof tissueSamples extends (infer T)[] | null ? T : never>();
  tissueSamples?.forEach((r) => { if (!latestTissue.has(r.block_id)) latestTissue.set(r.block_id, r); });

  // Build per-block context strings
  const today = new Date().toISOString().split("T")[0];
  const blockContexts = blocks.map((block) => {
    const soil = latestSoil.get(block.id);
    const weather = latestWeather.get(block.id) ?? globalWeather;
    const activeAlerts = blockAlerts.get(block.id) ?? [];
    const scouting = latestScouting.get(block.id);
    const tissue = latestTissue.get(block.id);

    let ctx = `Block "${block.name}" (id: ${block.id})
- Crop: ${block.crop_type}, Variety: ${block.variety}, Planted: ${block.planting_year}, Area: ${block.area} ${block.area_unit}, Trees: ${block.tree_count}`;

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
      ctx += `\n- Active alerts: ${activeAlerts.map((a) => `[${(a as { severity: string; domain: string; message: string }).severity.toUpperCase()} ${(a as { severity: string; domain: string; message: string }).domain}: "${(a as { severity: string; domain: string; message: string }).message}"]`).join(" | ")}`;
    }

    if (scouting) {
      ctx += `\n- Last scouting (${(scouting as { scouted_at: string; overall_risk: string; notes?: string }).scouted_at.split("T")[0]}): risk=${(scouting as { scouted_at: string; overall_risk: string; notes?: string }).overall_risk}${(scouting as { scouted_at: string; overall_risk: string; notes?: string }).notes ? ` — "${(scouting as { scouted_at: string; overall_risk: string; notes?: string }).notes}"` : ""}`;
    }

    if (tissue && typeof (tissue as { nutrients?: unknown }).nutrients === "object" && (tissue as { nutrients?: unknown }).nutrients !== null) {
      const nutrientStr = Object.entries((tissue as { nutrients: Record<string, unknown>; sampled_at: string }).nutrients)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      ctx += `\n- Tissue sample (${(tissue as { nutrients: Record<string, unknown>; sampled_at: string }).sampled_at.split("T")[0]}): ${nutrientStr}`;
    }

    return ctx;
  }).join("\n\n");

  const languageInstruction = locale !== 'en'
    ? `\n\nIMPORTANT: Write ALL title and rationale text in ${languageName}. The JSON keys must remain in English.`
    : '';

  const response = await openrouter.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT + languageInstruction },
      {
        role: "user",
        content: `Today: ${today}\n\nFarm data:\n\n${blockContexts}\n\nGenerate prioritised recommendations.`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content ?? "[]";

  // Parse — handle markdown fences or object wrappers
  let parsed: unknown;
  try {
    let clean = raw.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
      const values = Object.values(parsed as Record<string, unknown>);
      const firstArray = values.find(Array.isArray);
      if (firstArray) parsed = firstArray;
    }
    if (!Array.isArray(parsed)) throw new Error("Parsed output is not an array");
  } catch (e) {
    throw new Error(`AI returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
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
      category: r.category as RecommendationCategory,
      title: (r.title as string).slice(0, 200),
      rationale: r.rationale as string,
      confidence: Math.min(1, Math.max(0, (Number(r.confidence) || 75) / 100)),
      status: "pending" as const,
      llm_model: OPENROUTER_MODEL,
    }));

  if (toInsert.length === 0) {
    revalidatePath("/recommendations");
    return { count: 0, model: OPENROUTER_MODEL };
  }

  const { error: insertError } = await admin.from("recommendations").insert(toInsert);
  if (insertError) throw new Error(`Insert error: ${insertError.message}`);

  revalidatePath("/recommendations");
  return { count: toInsert.length, model: OPENROUTER_MODEL };
}

export async function generateMockRecommendations() {
  const supabase = await createClient();

  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("id")
    .limit(5);

  if (blocksError || !blocks || blocks.length === 0) {
    console.error("Error fetching blocks for mock data:", blocksError);
    throw new Error("Could not fetch blocks to assign recommendations.");
  }

  const mockTemplates = [
    {
      category: "irrigate",
      title: "High soil moisture deficit detected",
      rationale:
        "Soil moisture sensors in this block show a deficit approaching wilting point. High temperatures expected in the next 3 days.",
      confidence: 92,
    },
    {
      category: "spray",
      title: "Spidermite risk high",
      rationale:
        "Recent hot, dry conditions are ideal for spidermite outbreaks. Nearby blocks have reported increased pressure.",
      confidence: 85,
    },
    {
      category: "fertilize",
      title: "Nitrogen top-up required",
      rationale:
        "Tissue samples show N levels dropping below optimal threshold for the current nut-development stage.",
      confidence: 78,
    },
    {
      category: "scout",
      title: "Monitor for Navel Orangeworm",
      rationale:
        "Hull split is beginning in this variety. NOW flights have been detected in the region.",
      confidence: 88,
    },
    {
      category: "prune",
      title: "Remove shaded lower branches",
      rationale:
        "Canopy density has reduced light penetration below 30% in the lower third, reducing fruiting wood viability.",
      confidence: 65,
    },
  ];

  const newRecommendations = mockTemplates.map((template, i) => ({
    block_id: blocks[i % blocks.length].id,
    category: template.category as RecommendationCategory,
    title: template.title,
    rationale: template.rationale,
    confidence: template.confidence / 100,
    status: "pending" as const,
  }));

  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("recommendations")
    .insert(newRecommendations);

  if (insertError) {
    console.error("Error inserting mock recommendations:", insertError);
    throw new Error(insertError.message);
  }

  revalidatePath("/recommendations");
}
