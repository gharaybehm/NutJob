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
import { isExpired } from "@/utils/recommendation-lifecycle";

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

  // A pending card replaced by a newer batch, or past its 7 days, is shown in History as expired.
  const now = new Date();
  return (data ?? []).map((r) => ({
    ...r,
    scheduled_event: events[r.id] ?? null,
    expired: r.status === "pending" && isExpired(r.expires_at, now),
  }));
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

/** The reason is kept in manager_note; the next run's RECENT HISTORY shows it to the AI. */
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
    // The pipeline runs on the service-role client, so the farm role is checked
    // here; recommendations are staff-writable, matching the RLS policy.
    const gate = await requireFarmRole(farmId, "supervisor");
    if (!gate.ok) throw new Error(gate.error);

    const admin = createAdminClient();
    const locale = await getLocale();
    const languageName = localeToLanguageName(locale);

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
