"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

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

export async function updateRecommendationStatus(
  id: string,
  status: "pending" | "accepted" | "edited" | "skipped",
  farmId: string,
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

  revalidatePath(`/${farmId}/recommendations`);
}

export async function editRecommendation(
  id: string,
  updates: { title?: string; manager_note?: string },
  farmId: string,
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

  revalidatePath(`/${farmId}/recommendations`);
}

export async function getRecommendations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select("*, blocks(name)")
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

