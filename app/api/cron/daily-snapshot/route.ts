import { NextRequest, NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/utils/cron-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { runDailySnapshot } from "@/utils/run-daily-snapshot";

// Daily agronomic snapshot and watchdog. For every block: quality-checked
// readings and the forecast go through the irrigation and frost engines, the
// snapshot is stored in daily_snapshots, and block_alerts is reconciled
// (new events opened once, cleared ones resolved).
//
// Meant to run once a day, shortly after /api/cron/weather and
// /api/cron/compute-fields, so it sees a fresh forecast and stage.
//
//   GET /api/cron/daily-snapshot  (Authorization: Bearer CRON_SECRET)
//   optional: ?dry=1 (compute and report, write nothing)  &farm=<farm id>

export async function GET(request: NextRequest) {
  const refused = rejectUnauthorizedCron(request);
  if (refused) return refused;

  try {
    const results = await runDailySnapshot(createAdminClient(), {
      dryRun: request.nextUrl.searchParams.get("dry") === "1",
      farmId: request.nextUrl.searchParams.get("farm") ?? undefined,
    });
    const failed = results.some((r) => r.errors.length > 0);
    return NextResponse.json({ ok: !failed, results }, { status: failed ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
