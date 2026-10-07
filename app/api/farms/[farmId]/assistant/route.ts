/* eslint-disable @typescript-eslint/no-explicit-any -- the assistant tables are not in the generated Supabase types yet */
// Field assistant: one question in, a streamed answer out (server-sent events).
// Supervisors and admins only; every model call is made here, never by the
// browser. See Requirements.md, "Field assistant", and CLAUDE.md for the rules.
// The answering itself is utils/assistant/answer.ts; this file gates, checks
// the request, stores the conversation and logs the counts.
//
//   POST /api/farms/<farmId>/assistant
//   { question: string, threadId?: uuid, pins?: { blockId?, from?, to?, recommendationId? } }

import { NextRequest, NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireFarmRole } from "@/utils/supabase/farm-access";
import { isOpenRouterConfigured } from "@/utils/openrouter";
import { answerQuestion } from "@/utils/assistant/answer";
import { checkPins, loadFarm } from "@/utils/assistant/gather";
import { HISTORY_TURNS, LIMIT_WINDOW_MS, MAX_QUESTION_CHARS, limitHit } from "@/utils/assistant/limits";
import type { AssistantStreamEvent } from "@/utils/assistant/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;

function fail(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await ctx.params;
  if (!UUID.test(farmId)) return fail(400, "bad_request");

  // ── Gate: signed in, then supervisor or admin of this farm. Nothing else runs first. ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized");
  const gate = await requireFarmRole(farmId, "supervisor");
  if (!gate.ok) return fail(403, "forbidden");
  const actor = gate.actor;

  if (!isOpenRouterConfigured()) return fail(503, "not_configured");

  // ── Body ──
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "bad_request");
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, "bad_request");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail(400, "bad_request");
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length === 0 || question.length > MAX_QUESTION_CHARS) return fail(400, "bad_request");
  const threadIdIn = body.threadId == null ? null : typeof body.threadId === "string" && UUID.test(body.threadId) ? body.threadId : undefined;
  if (threadIdIn === undefined) return fail(400, "bad_request");

  const admin = createAdminClient() as any;
  const farm = await loadFarm(admin, farmId);
  if (!farm) return fail(404, "not_found");
  const pins = await checkPins(admin, farm, body.pins);
  if (!pins) return fail(400, "bad_request");

  // ── The thread must be the caller's own, on this farm ──
  let threadId: string | null = null;
  if (threadIdIn) {
    const { data: thread } = await admin
      .from("assistant_threads")
      .select("id, user_id")
      .eq("id", threadIdIn)
      .eq("farm_id", farmId)
      .maybeSingle();
    if (!thread || thread.user_id !== actor.userId) return fail(403, "forbidden");
    threadId = thread.id;
  }

  // ── Daily limits ──
  const since = new Date(Date.now() - LIMIT_WINDOW_MS).toISOString();
  const [{ count: userCount }, { count: farmCount }] = await Promise.all([
    admin.from("assistant_events").select("id", { count: "exact", head: true })
      .eq("user_id", actor.userId).eq("kind", "question").gte("created_at", since),
    admin.from("assistant_events").select("id", { count: "exact", head: true })
      .eq("farm_id", farmId).eq("kind", "question").gte("created_at", since),
  ]);
  const hit = limitHit(userCount ?? 0, farmCount ?? 0);
  if (hit) return fail(429, hit);

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "assistant" });

  // ── Thread, history and the question ──
  const now = () => new Date().toISOString();
  if (!threadId) {
    const title = question.replace(/\s+/g, " ").slice(0, 80);
    const { data: created, error } = await admin
      .from("assistant_threads")
      .insert({ farm_id: farmId, user_id: actor.userId, title, pins })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[assistant] thread insert failed:", error?.code ?? "unknown");
      return fail(500, "unavailable");
    }
    threadId = created.id as string;
  } else {
    await admin.from("assistant_threads").update({ pins, last_activity_at: now() }).eq("id", threadId);
  }
  const thread = threadId;

  const { data: historyRows } = await admin
    .from("assistant_messages")
    .select("role, content, kind")
    .eq("thread_id", thread)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  const history = ((historyRows ?? []) as { role: string; content: string; kind: string }[])
    .reverse()
    .filter((m) => m.kind !== "error" && m.kind !== "limit")
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));

  await Promise.all([
    admin.from("assistant_messages").insert({ thread_id: thread, farm_id: farmId, user_id: actor.userId, role: "user", content: question }),
    admin.from("assistant_events").insert({ farm_id: farmId, user_id: actor.userId, kind: "question" }),
  ]);

  const logEvents = async (events: { kind: string; category: string | null }[]) => {
    if (events.length === 0) return;
    await admin.from("assistant_events").insert(events.map((e) => ({ farm_id: farmId, user_id: actor.userId, kind: e.kind, category: e.category })));
  };
  const storeAnswer = async (row: Record<string, unknown>): Promise<string | null> => {
    const { data, error } = await admin
      .from("assistant_messages")
      .insert({ thread_id: thread, farm_id: farmId, user_id: actor.userId, role: "assistant", ...row })
      .select("id")
      .single();
    await admin.from("assistant_threads").update({ last_activity_at: now() }).eq("id", thread);
    if (error) console.error("[assistant] answer insert failed:", error.code ?? "unknown");
    return data?.id ?? null;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AssistantStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      send({ type: "meta", threadId: thread });

      try {
        const result = await answerQuestion({
          admin,
          farm,
          pins,
          question,
          locale,
          history,
          t: (key) => t(key as never),
          onDelta: (text) => send({ type: "delta", text }),
          signal: request.signal,
        });
        await logEvents(result.events);
        if (result.text !== result.shown) send({ type: "replace", text: result.text });

        if (result.kind === "decline") {
          const messageId = await storeAnswer({ content: result.text, kind: "decline", model: result.model });
          send({ type: "done", messageId, kind: "decline", citations: [], referenceStatus: null, recordRefs: [] });
        } else {
          const messageId = await storeAnswer({
            content: result.text,
            kind: "answer",
            citations: result.citations,
            reference_status: result.referenceStatus,
            record_refs: result.recordRefs,
            model: result.model,
          });
          send({
            type: "done",
            messageId,
            kind: "answer",
            citations: result.citations,
            referenceStatus: result.referenceStatus,
            recordRefs: result.recordRefs,
          });
        }
      } catch (e) {
        if (request.signal.aborted) return;
        // Name and status only: never the question, the context or the provider's message.
        const status = (e as { status?: number })?.status;
        console.error("[assistant] answer failed:", e instanceof Error ? e.name : "unknown", status ?? "");
        await logEvents([{ kind: "error", category: null }]);
        send({ type: "error", code: "unavailable" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
