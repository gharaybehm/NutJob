/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts */
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "../../utils/supabase/admin";
import { generateFarmRecommendations, OPENROUTER_MODEL } from "../../utils/generate-recommendations";

// Runs automatically every Monday at 04:00 UTC.
// Can also be triggered manually via the Trigger.dev dashboard.
export const generateRecommendationsTask = schedules.task({
  id: "generate-recommendations",
  cron: "0 4 * * 1", // Monday 04:00 UTC
  maxDuration: 600,
  run: async () => {
    logger.log("Starting weekly AI Agronomist recommendations task");

    const admin = createAdminClient();

    const { data: farms, error: farmsError } = await (admin as any).from("farms").select("id");
    if (farmsError) throw new Error(`Farms fetch error: ${farmsError.message}`);

    let totalCount = 0;

    for (const farm of farms ?? []) {
      const farmId = farm.id as string;

      try {
        const { count } = await generateFarmRecommendations(admin, farmId);
        logger.log("Generated recommendations for farm", { farmId, count });
        totalCount += count;
      } catch (e: any) {
        logger.error("Failed to generate recommendations for farm", { farmId, error: e.message });
        continue;
      }
    }

    logger.log("Weekly AI Agronomist task completed", { count: totalCount });
    return { success: true, count: totalCount, model: OPENROUTER_MODEL };
  },
});
