import { logger, schedules } from "@trigger.dev/sdk/v3";

// Pulls live telemetry from SenseCAP cloud into NutJob 3× per day,
// matching the "DAILY IoT" data tier consumed by the AI Agronomist.
// SenseCAP sensors transmit every 15 min; we read the latest buffered value
// at each of these three windows.
export const sensecapSyncTask = schedules.task({
  id: "sensecap-sync",
  cron: "0 0,8,16 * * *", // 3× daily: 00:00, 08:00, 16:00 UTC
  maxDuration: 120,
  run: async () => {
    logger.log("Starting SenseCAP telemetry sync");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL env var is not set");

    const url = `${appUrl}/api/cron/sensecap-sync${cronSecret ? `?secret=${cronSecret}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`sensecap-sync endpoint returned ${res.status}`);
    }

    const result = await res.json();
    logger.log("SenseCAP sync complete", result);
    return result;
  },
});
