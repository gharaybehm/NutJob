import { createAdminClient } from "@/utils/supabase/admin";

export type RecommendationCategory = "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other";
export type ActivityType = "irrigation" | "fertigation" | "spraying" | "pruning" | "scouting" | "other";

export function categoryToActivityType(category: RecommendationCategory): ActivityType {
  const map: Record<RecommendationCategory, ActivityType> = {
    irrigate: "irrigation",
    fertilize: "fertigation",
    spray: "spraying",
    prune: "pruning",
    scout: "scouting",
    other: "other",
  };
  return map[category] ?? "other";
}

/** Default length of the calendar slot an accepted recommendation books. */
export function defaultDurationHours(category: RecommendationCategory): number {
  return category === "irrigate" ? 4 : category === "scout" ? 1 : 2;
}

type AgroDomain = "soil-water" | "phenology" | "nutrition" | "pest-disease" | "weather";

/**
 * Block-state changes that follow from a recommendation's work being DONE.
 *
 * This used to run the moment a recommendation was accepted, so accepting an
 * irrigation recommendation reset the block's soil moisture to field capacity
 * before any water had been applied. It now runs when the linked calendar
 * event is logged as completed (calendar/actions.ts → logEventCompletion).
 */
export async function applyCompletedRecommendationEffects(
  category: RecommendationCategory,
  block_id: string | null,
) {
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
      notes: "Auto-generated when a recommended irrigation was logged as done",
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
