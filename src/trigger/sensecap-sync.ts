import { logger, schedules } from "@trigger.dev/sdk/v3";

// Pulls live telemetry from SenseCAP cloud into NutJob every hour, feeding the
// "DAILY IoT" data tier consumed by the AI Agronomist and the weather-station
// check. Each pull stores every reading the devices logged since the last one,
// so the pull rate sets how fresh the data is; the resolution is set by how
// often the devices themselves report (a device-side setting).
export const sensecapSyncTask = schedules.task({
  id: "sensecap-sync",
  cron: "0 * * * *", // hourly, on the hour (UTC)
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
