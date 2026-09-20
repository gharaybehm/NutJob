import { NextRequest, NextResponse } from "next/server";
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
//   GET /api/cron/daily-snapshot?secret=CRON_SECRET
//   optional: &dry=1 (compute and report, write nothing)  &farm=<farm id>

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: a missing CRON_SECRET must not leave the endpoint open in production
  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else if (secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
