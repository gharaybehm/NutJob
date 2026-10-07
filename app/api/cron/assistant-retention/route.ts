/* eslint-disable @typescript-eslint/no-explicit-any -- the assistant tables are not in the generated Supabase types yet */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { RETENTION_DAYS } from "@/utils/assistant/limits";

// Field assistant retention: deletes conversations with no activity for
// RETENTION_DAYS (messages go with them by cascade). The counts in
// assistant_events hold no text and are kept.
//
// Meant to run once a day.
//   GET /api/cron/assistant-retention?secret=CRON_SECRET   optional: &dry=1

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

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const admin = createAdminClient() as any;
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const { count, error: countError } = await admin
    .from("assistant_threads")
    .select("id", { count: "exact", head: true })
    .lt("last_activity_at", cutoff);
  if (countError) return NextResponse.json({ error: "Could not read conversations" }, { status: 500 });
  if (dry || !count) return NextResponse.json({ ok: true, cutoff, deleted: 0, wouldDelete: count ?? 0 });

  const { error } = await admin.from("assistant_threads").delete().lt("last_activity_at", cutoff);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true, cutoff, deleted: count });
}
