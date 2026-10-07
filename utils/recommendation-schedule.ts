/* eslint-disable @typescript-eslint/no-explicit-any -- calendar_events.farm_id predates the generated types */
// Books the calendar event for an accepted recommendation. Shared by the
// Recommendations page and the field assistant's "Accept and schedule", so a
// draft card is booked exactly as a weekly card is.
//
// Deliberately NOT in a "use server" file: every export there becomes a
// browser-callable action, and this one takes an already-checked actor and
// writes with the service role. Callers gate first (requireFarmRole) and pass
// the row they read, scoped to the farm.

import { createAdminClient } from "@/utils/supabase/admin";
import {
  categoryToActivityType,
  defaultDurationHours,
  type RecommendationCategory,
} from "@/utils/recommendation-effects";

export interface ScheduleInput {
  /** ISO start time chosen by the manager. */
  start: string;
  durationHours?: number;
}

export interface BookableRecommendation {
  id: string;
  title: string;
  category: RecommendationCategory;
  block_id: string | null;
  rationale: string;
}

/** The start and end of the booking, or an error for a bad start time or duration. */
export function bookingWindow(category: RecommendationCategory, schedule: ScheduleInput): { start: Date; end: Date } {
  const start = new Date(schedule.start);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid start time");
  const hours =
    schedule.durationHours && schedule.durationHours > 0 && schedule.durationHours <= 24 * 14
      ? schedule.durationHours
      : defaultDurationHours(category);
  return { start, end: new Date(start.getTime() + hours * 3_600_000) };
}

/**
 * Inserts the calendar event. Nothing about the block changes yet: the
 * activity log entry and the block-state effects are written when the event
 * is logged as done (calendar/actions.ts).
 */
export async function bookRecommendationEvent(
  farmId: string,
  actorId: string,
  rec: BookableRecommendation,
  schedule: ScheduleInput,
  title?: string
): Promise<string> {
  const { start, end } = bookingWindow(rec.category, schedule);
  const admin = createAdminClient();
  const { data: event, error } = await (admin.from("calendar_events") as any)
    .insert({
      farm_id: farmId,
      user_id: actorId,
      title: title ?? rec.title,
      type: categoryToActivityType(rec.category),
      block_id: rec.block_id,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      notes: rec.rationale,
      details: { source: "recommendation", recommendation_id: rec.id },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return event.id as string;
}
