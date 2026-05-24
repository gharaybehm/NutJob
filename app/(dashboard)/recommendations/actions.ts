"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk/v3";

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

const AI_SYSTEM_PROMPT = `You are an expert agronomist specialising in almond farming in a semi-arid Mediterranean climate. You analyse real-time farm block data and produce prioritised, actionable recommendations for the farm manager.

Rules:
- Generate 1–3 recommendations per block, but ONLY where the data clearly indicates a need. Do not invent problems.
- Order by urgency across ALL blocks (priority 1 = most urgent farm-wide).
- Be specific: cite actual sensor values or observations in the rationale.
- Confidence: 90–100 = very strong signal, 70–89 = moderate, below 70 = weaker/precautionary.

Respond ONLY with a valid JSON array, no other text. Each element:
{
  "block_id": "string",
  "category": "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other",
  "title": "string (max 60 chars, start with an imperative verb)",
  "rationale": "string (2–3 sentences citing specific data values)",
  "confidence": number (0–100),
  "priority": number (1 = highest)
}`;

export async function generateAIRecommendations(): Promise<{ count: number; model: string }> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorised");

  // Trigger the Trigger.dev background task and wait for the completed result.
  // This executes safely on background compute, bypassing serverless function timeouts,
  // while remaining fully compatible with the existing frontend UI promise flow.
  const run = await tasks.triggerAndWait("generate-recommendations", { userId: user.id });

  if (run.ok) {
    const output = run.output as { success: boolean; count: number; model: string };
    revalidatePath("/recommendations");
    return { count: output.count, model: output.model };
  } else {
    throw new Error(`AI agronomist reasoning task failed: ${JSON.stringify(run.error)}`);
  }
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
