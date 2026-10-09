import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runDecisionEngine } from "@/utils/decision/run-decision-engine";

// Decision engine, daily shadow run. For every block bound to a Crop Knowledge
// Pack: hourly weather is fetched and stored, the block state is built, the
// phenology, irrigation and frost engines run, and the state and any
// recommendations are stored (block_engine_state, engine_recommendation_log).
//
// Shadow only: nothing reaches the Recommendations page, the alerts or the
// calendar. The live daily snapshot (/api/cron/daily-snapshot) is separate and
// unchanged.
//
// Meant to run once a day, early in the farm's morning, after the previous
// local day is complete.
//
//   GET /api/cron/decision-engine?secret=CRON_SECRET
//   optional: &dry=1 (compute and report, write nothing)  &farm=<farm id>
//             &narrate=1 (ask the model to write the plan's explanation; one or two
//             model calls per farm. Without it the explanation is rule-based text.)
//
// The response holds counts and error messages only, no recommendation text.

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
    const results = await runDecisionEngine(createAdminClient(), {
      dryRun: request.nextUrl.searchParams.get("dry") === "1",
      farmId: request.nextUrl.searchParams.get("farm") ?? undefined,
      narrate: request.nextUrl.searchParams.get("narrate") === "1",
    });
    const failed = results.some((r) => r.errors.length > 0);
    return NextResponse.json({ ok: !failed, results }, { status: failed ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
