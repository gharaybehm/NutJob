"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { localeToLanguageName } from "@/utils/format";
import { generateFarmRecommendations } from "@/utils/generate-recommendations";

import { requireFarmRole } from "@/utils/supabase/farm-access";
import {
  categoryToActivityType,
  defaultDurationHours,
  type RecommendationCategory,
} from "@/utils/recommendation-effects";

export async function getRecommendations(farmId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select("*, blocks(name)")
    .eq("farm_id", farmId)
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // An accepted recommendation is "scheduled" until its calendar event is
  // logged as done; attach the event so the card can show which state it is in.
  const ids = (data ?? []).filter((r) => r.status === "accepted" || r.status === "edited").map((r) => r.id);
  const events: Record<string, { id: string; start_date: string; completed_at: string | null }> = {};
  if (ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
    const { data: rows } = await (supabase.from("calendar_events") as any)
      .select("id, start_date, completed_at, details")
      .eq("farm_id", farmId)
      .in("details->>recommendation_id", ids);
    for (const row of rows ?? []) {
      const recId = (row.details as { recommendation_id?: string } | null)?.recommendation_id;
      if (recId) events[recId] = { id: row.id, start_date: row.start_date, completed_at: row.completed_at };
    }
  }

  return (data ?? []).map((r) => ({ ...r, scheduled_event: events[r.id] ?? null }));
}

export interface ScheduleInput {
  /** ISO start time chosen by the manager. */
  start: string;
  durationHours?: number;
}

/**
 * Accepting a recommendation books the work on the calendar. Nothing about the
 * block changes yet: the activity log entry and the block-state effects are
 * written when the event is logged as done (calendar/actions.ts), with the
 * actual start, end and materials.
 */
async function scheduleRecommendation(
  id: string,
  farmId: string,
  schedule: ScheduleInput,
  title?: string,
): Promise<string> {
  const gate = await requireFarmRole(farmId, "supervisor");
  if (!gate.ok) throw new Error(gate.error);

  const supabase = await createClient();
  const { data: rec, error: fetchError } = await supabase
    .from("recommendations")
    .select("title, category, block_id, rationale")
    .eq("id", id)
    .eq("farm_id", farmId)
    .single();
  if (fetchError || !rec) throw new Error(fetchError?.message ?? "Recommendation not found");

  const category = rec.category as RecommendationCategory;
  const start = new Date(schedule.start);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid start time");
  const hours = schedule.durationHours && schedule.durationHours > 0
    ? schedule.durationHours
    : defaultDurationHours(category);
  const end = new Date(start.getTime() + hours * 3_600_000);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
  const { data: event, error } = await (admin.from("calendar_events") as any)
    .insert({
      farm_id: farmId,
      user_id: gate.actor.userId,
      title: title ?? rec.title,
      type: categoryToActivityType(category),
      block_id: rec.block_id,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      notes: rec.rationale,
      details: { source: "recommendation", recommendation_id: id },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/${farmId}/calendar`);
  return event.id;
}

export async function acceptRecommendation(id: string, farmId: string, schedule: ScheduleInput) {
  await scheduleRecommendation(id, farmId, schedule);

  const admin = createAdminClient();
  const { error } = await admin
    .from("recommendations")
    .update({ status: "accepted", acted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/${farmId}/recommendations`);
  revalidatePath(`/${farmId}/dashboard`);
}

export type SkipReason = "already_done" | "disagree" | "no_resources";

/** The reason is kept in manager_note so the engine can see why it was skipped. */
export async function skipRecommendation(id: string, farmId: string, reason?: SkipReason) {
  const gate = await requireFarmRole(farmId, "supervisor");
  if (!gate.ok) throw new Error(gate.error);

  const admin = createAdminClient();
  const { error } = await admin
    .from("recommendations")
    .update({
      status: "skipped",
      acted_at: new Date().toISOString(),
      ...(reason ? { manager_note: `skip_reason:${reason}` } : {}),
    })
    .eq("id", id)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/${farmId}/recommendations`);
  revalidatePath(`/${farmId}/dashboard`);
}

export async function editRecommendation(
  id: string,
  updates: { title?: string; manager_note?: string },
  farmId: string,
  schedule: ScheduleInput,
) {
  const supabase = await createClient();
  const { data: rec, error: fetchError } = await supabase
    .from("recommendations")
    .select("title")
    .eq("id", id)
    .eq("farm_id", farmId)
    .single();
  if (fetchError || !rec) throw new Error(fetchError?.message ?? "Recommendation not found");

  const finalTitle = updates.title?.trim() || rec.title;
  await scheduleRecommendation(id, farmId, schedule, finalTitle);

  const admin = createAdminClient();
  const { error } = await admin
    .from("recommendations")
    .update({
      title: finalTitle,
      manager_note: updates.manager_note ?? null,
      status: "edited",
      acted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("farm_id", farmId);

  if (error) throw new Error(error.message);

  revalidatePath(`/${farmId}/recommendations`);
  revalidatePath(`/${farmId}/dashboard`);
}

export async function generateAIRecommendations(
  farmId: string
): Promise<{ count: number; model: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const locale = await getLocale();
    const languageName = localeToLanguageName(locale);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorised");

    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const languageInstruction = locale !== "en"
      ? `\n\nIMPORTANT: Write ALL title and rationale text in ${languageName}. The JSON keys must remain in English.`
      : "";

    const { count, model } = await generateFarmRecommendations(admin, farmId, {
      systemPromptSuffix: languageInstruction,
    });

    if (count === 0) {
      revalidatePath(`/${farmId}/recommendations`);
      return { count: 0, model };
    }

    // Fire a push notification for this farm (non-blocking)
    import("@/utils/push").then(({ sendPushToFarm }) => {
      sendPushToFarm(farmId, {
        title: "New AI Recommendations",
        body: `${count} new recommendation${count !== 1 ? "s" : ""} generated for your farm.`,
        url: `/${farmId}/recommendations`,
        tag: "ai-recommendations",
      }).catch((e: unknown) => console.error("[Push] Recommendation push failed:", e));
    });

    revalidatePath(`/${farmId}/recommendations`);
    return { count, model };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generateMockRecommendations(farmId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated DB types predate blocks.farm_id migration
  const { data: blocks, error: blocksError } = await (supabase.from("blocks") as any)
    .select("id")
    .eq("farm_id", farmId)
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
    farm_id: farmId,
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

  revalidatePath(`/${farmId}/recommendations`);
}
