import { NextRequest, NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/utils/cron-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { runFrostCheckAll } from "@/utils/decision/run-frost-check";

// Decision engine, frost check every two hours. For every block bound to a
// Crop Knowledge Pack whose frost engine is active in its current phase, a
// fresh forecast and the farm's latest validated station reading are run
// through the frost engine (utils/decision/run-frost-check.ts).
//
// Shadow: the check and its recommendations are recorded (frost_checks,
// engine_recommendation_log) and nothing else. Live (the farm admin switched
// the frost engine to Live): a night at warning or critical also opens an
// alert and sends a push, and a night no longer at risk has its alert closed.
//
// Trigger: Coolify Scheduled Task, cron 30 */2 * * * (every two hours, half
// past, so the hourly sensor pull on the hour has brought the latest reading in).
//
//   GET /api/cron/frost-check  (Authorization: Bearer CRON_SECRET)
//   optional: ?dry=1 (compute and report, write nothing)  &farm=<farm id>
//
// The response holds counts and error messages only, no recommendation text.

export async function GET(request: NextRequest) {
  const refused = rejectUnauthorizedCron(request);
  if (refused) return refused;

  try {
    const results = await runFrostCheckAll(createAdminClient(), {
      dryRun: request.nextUrl.searchParams.get("dry") === "1",
      farmId: request.nextUrl.searchParams.get("farm") ?? undefined,
    });
    const failed = results.some((r) => r.errors.length > 0);
    return NextResponse.json({ ok: !failed, results }, { status: failed ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
