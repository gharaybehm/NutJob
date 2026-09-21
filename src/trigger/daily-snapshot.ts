import { logger, schedules } from "@trigger.dev/sdk/v3";

// Runs the daily agronomic snapshot and watchdog: for every block it builds the
// snapshot (irrigation, frost, leaf nutrition) and reconciles block_alerts.
// This is what raises the frost, irrigation, sensor and leaf-nutrient alerts and
// the June leaf-sample reminder, so nothing of that appears unless it runs.
//
// Every 3 hours, ten minutes after each weather run (weather is
// 0 0,3,6,...,21 * * *), so the watchdog sees a recent forecast. Safe to repeat:
// snapshots upsert by block and date, and alerts deduplicate on their key.
export const dailySnapshotTask = schedules.task({
  id: "daily-snapshot",
  cron: "10 0,3,6,9,12,15,18,21 * * *", // UTC
  maxDuration: 300,
  run: async () => {
    logger.log("Starting daily snapshot and watchdog");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL env var is not set");

    const url = `${appUrl}/api/cron/daily-snapshot${cronSecret ? `?secret=${cronSecret}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });

    // 207 means some blocks had errors but the run completed: report it, do not retry it.
    if (!res.ok && res.status !== 207) {
      throw new Error(`daily-snapshot endpoint returned ${res.status}`);
    }

    const result = await res.json();
    if (res.status === 207) logger.warn("Daily snapshot finished with block errors", result);
    else logger.log("Daily snapshot complete", result);
    return result;
  },
});
