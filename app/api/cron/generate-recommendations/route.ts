import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateFarmRecommendations, OPENROUTER_MODEL } from "@/utils/generate-recommendations";

// Weekly AI Agronomist run: a fresh batch of recommendations for every farm.
// Each new batch expires the farm's still-pending cards (see
// generateFarmRecommendations). Farms run one after another so a slow or
// failing farm does not stop the rest.
//
// Scheduler: Coolify Scheduled Task, cron 0 4 * * 1 (Monday 04:00 UTC).
// This replaced the Trigger.dev `generate-recommendations` task on 2026-09-30.
//
//   GET /api/cron/generate-recommendations?secret=CRON_SECRET
//   optional: &farm=<farm id>  (one farm only)

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

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const onlyFarm = request.nextUrl.searchParams.get("farm");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped admin client, as in the other cron routes
  let query = (admin as any).from("farms").select("id, name");
  if (onlyFarm) query = query.eq("id", onlyFarm);
  const { data: farms, error: farmsError } = await query;
  if (farmsError) return NextResponse.json({ error: `Farms fetch error: ${farmsError.message}` }, { status: 500 });

  const results: { farm: string; count?: number; error?: string }[] = [];
  for (const farm of (farms ?? []) as { id: string; name: string }[]) {
    try {
      const { count } = await generateFarmRecommendations(admin, farm.id);
      results.push({ farm: farm.name, count });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[generate-recommendations] ${farm.name}: ${message}`);
      results.push({ farm: farm.name, error: message });
    }
  }

  // A farm with no blocks is not a failure worth flagging.
  const failed = results.some((r) => r.error && r.error !== "No blocks found for this farm" && r.error !== "No blocks found");
  return NextResponse.json({ ok: !failed, model: OPENROUTER_MODEL, results }, { status: failed ? 207 : 200 });
}
