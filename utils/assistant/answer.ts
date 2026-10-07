// The field assistant's answering core: from a checked question to a final,
// checked answer. Shared by the streaming route and the quality-check script
// (scripts/test-assistant.ts), so the test exercises exactly what users get.
//
// It writes nothing. The caller gates the request, stores the messages and
// logs the returned events.

import type OpenAI from "openai";
import { completeWithFallback, streamWithFallback } from "@/utils/openrouter";
import { PRIMARY_MODEL, RETRY_MODEL, FALLBACK_MODEL } from "@/utils/ai-models";
import { classifyQuestion, mayBeDeclinePrefix, parseModelDecline } from "./intent";
import { isPesticideProductOrDoseQuestion, hasRegulatorySourceFor, redactPesticideDoses, citationFor } from "./source-rules";
import { checkAnswer, stripInvalidCitations, citedNumbers, answerReferenceStatus, type AnswerCheck } from "./answer-checks";
import { assistantSystemPrompt } from "./prompt";
import { gatherContext, regulatorySourceLoaded, searchCrop, type FarmInfo, type GatheredContext } from "./gather";
import {
  applyIrrigationCalculation, irrigationTemplateDraft, parseDrafts, splitDrafts, streamSafeLength, MAX_DRAFTS, type AssistantDraft,
} from "./drafts";
import { fold } from "./source-rules";
import type { AssistantCitation, AssistantPins, AssistantRecordRef, DeclineCategory, ReferenceStatus } from "./types";

type Admin = Parameters<typeof gatherContext>[0];

// Gemini 2.5 Pro always reasons before it writes, and reasoning tokens count
// against max_tokens: at 1200 a retry was cut off mid-sentence. The answer is
// short; the headroom is for the reasoning, which OpenRouter caps separately.
const GENERATION = { max_tokens: 4000, reasoning: { max_tokens: 1024 } } as Record<string, unknown>;

export interface AnswerEvent {
  kind: "decline" | "retry" | "fallback" | "unsourced";
  category: string | null;
}

export type AnswerResult =
  | { kind: "decline"; category: DeclineCategory; text: string; model: string | null; events: AnswerEvent[] }
  | {
      kind: "answer";
      text: string;
      citations: AssistantCitation[];
      referenceStatus: ReferenceStatus | null;
      recordRefs: AssistantRecordRef[];
      drafts: AssistantDraft[];
      searchScope: GatheredContext["searchScope"];
      model: string;
      events: AnswerEvent[];
    };

export interface AnswerOptions {
  admin: Admin;
  farm: FarmInfo;
  pins: AssistantPins;
  question: string;
  locale: string;
  /** Earlier turns of the conversation, oldest first. */
  history: { role: "user" | "assistant"; content: string }[];
  /** Localised text by key under the "assistant" namespace. */
  t: (key: string, values?: Record<string, string | number>) => string;
  /** Text as it streams; the final answer may still differ (see `shown`). */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export async function answerQuestion(o: AnswerOptions): Promise<AnswerResult & { shown: string }> {
  const events: AnswerEvent[] = [];
  const decline = (category: DeclineCategory, model: string | null = null) => {
    events.push({ kind: "decline", category });
    return { kind: "decline" as const, category, text: o.t(`decline.${category}`), model, events, shown: "" };
  };

  // ── Declines that need no model call ──
  const intent = classifyQuestion(o.question);
  if (intent.kind === "decline") return decline(intent.category);

  if (
    isPesticideProductOrDoseQuestion(o.question) &&
    !(await regulatorySourceLoaded(o.admin, o.farm.country, searchCrop(o.farm, o.pins, o.question).crop))
  ) {
    return decline("pesticide_no_regulatory");
  }

  // ── Context ──
  const gathered = await gatherContext(o.admin, o.farm, o.pins, intent, o.question);
  const dosesAllowed = hasRegulatorySourceFor(gathered.passages.map((p) => p.chunk), o.farm.country);
  const historyTurns: OpenAI.Chat.ChatCompletionMessageParam[] = o.history.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const draftsAllowed = intent.kind === "advice" && gathered.scopeBlocks.length > 0;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: assistantSystemPrompt({ locale: o.locale, dosesAllowed, draftsAllowed }) },
    { role: "system", content: gathered.contextMessage },
    ...historyTurns,
    { role: "user", content: o.question },
  ];
  const suppliedText = [gathered.contextMessage, o.question, ...o.history.map((m) => m.content)].join("\n");
  const isAdvice = intent.kind === "advice";
  const passageCount = gathered.passages.length;

  // ── Stream, holding back a possible decline marker and anything from the drafts marker on ──
  const { stream, model, usedFallback } = await streamWithFallback(
    { messages, temperature: 0.2, ...GENERATION },
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    { signal: o.signal }
  );
  if (usedFallback) events.push({ kind: "fallback", category: null });
  let usedModel = model;
  let full = "";
  let released = 0;
  /** What the drawer is showing: anything different at the end is sent as a replace. */
  let shown = "";
  let finishReason: string | null = null;
  try {
    for await (const chunk of stream) {
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      full += delta;
      if (parseModelDecline(full) || mayBeDeclinePrefix(full)) continue;
      const safe = streamSafeLength(full);
      if (safe > released) {
        o.onDelta?.(full.slice(released, safe));
        released = safe;
        shown = full.slice(0, released);
      }
    }
  } catch (e) {
    // The provider dropped the stream part-way ("upstream idle timeout"). Unless the
    // user went away, answer in one piece on the other model; whatever was shown
    // is replaced by the final text.
    if (o.signal?.aborted) throw e;
    events.push({ kind: "fallback", category: "stream_broken" });
    const other = model === FALLBACK_MODEL ? PRIMARY_MODEL : FALLBACK_MODEL;
    const { completion, model: completedBy } = await completeWithFallback(
      { messages, temperature: 0.2, ...GENERATION },
      other,
      model,
      { timeoutMs: 90_000 }
    );
    full = completion.choices[0]?.message?.content ?? "";
    finishReason = completion.choices[0]?.finish_reason ?? null;
    usedModel = completedBy;
  }

  // The checks look at the answer only; the drafts block is validated on its own.
  const check0 = (text: string, reason: string | null) =>
    checkAnswer(splitDrafts(text).answer, { passageCount, isAdvice, suppliedText, finishReason: reason });
  let modelDecline = parseModelDecline(full);
  let check: AnswerCheck = check0(full, finishReason);

  // ── One retry on the stronger model, only for a failure code can detect ──
  if (!modelDecline && check.problems.length > 0) {
    events.push({ kind: "retry", category: check.problems.join(",") });
    try {
      const { completion, model: retryModel } = await completeWithFallback(
        { messages, temperature: 0.1, ...GENERATION },
        RETRY_MODEL,
        FALLBACK_MODEL,
        { timeoutMs: 90_000 }
      );
      const retried = completion.choices[0]?.message?.content ?? "";
      const retryDecline = parseModelDecline(retried);
      const retryCheck = check0(retried, completion.choices[0]?.finish_reason ?? null);
      if (retryDecline || retryCheck.problems.length < check.problems.length) {
        full = retried;
        modelDecline = retryDecline;
        check = retryCheck;
        usedModel = retryModel;
      }
    } catch (e) {
      console.error("[assistant] retry failed:", e instanceof Error ? e.name : "unknown");
    }
  }

  if (modelDecline) return { ...decline(modelDecline, usedModel), shown };

  // ── Code, not the model, has the last word on citations, doses and figures ──
  const { answer, raw: rawDrafts } = splitDrafts(full);
  let text = stripInvalidCitations(answer, passageCount).trim();
  if (!dosesAllowed) {
    const r = redactPesticideDoses(text, o.question);
    if (r.redacted) text = `${r.text}\n\n${o.t("doseRemoved")}`.trim();
  }
  if (check.problems.includes("unknown_figure")) text = `${text}\n\n${o.t("figureUnchecked")}`;
  if (check.problems.includes("form") || check.problems.includes("truncated") || text.length === 0) text = o.t("couldNotAnswer");

  const cited = citedNumbers(text).filter((n) => n >= 1 && n <= passageCount);
  const citations = gathered.passages.filter((p) => cited.includes(p.n)).map(citationFor);
  const referenceStatus = isAdvice ? answerReferenceStatus(gathered.lookupStatus, citations.length) : null;
  if (isAdvice && referenceStatus !== "found") events.push({ kind: "unsourced", category: referenceStatus });

  // ── Draft cards: validated by code; the irrigation calculation overrides the model ──
  let drafts: AssistantDraft[] = [];
  if (draftsAllowed && !check.problems.includes("form") && !check.problems.includes("truncated")) {
    drafts = parseDrafts(rawDrafts, {
      blocks: gathered.scopeBlocks,
      passages: gathered.passages,
      answerReferenceStatus: referenceStatus,
      question: o.question,
      dosesAllowed,
      suppliedText,
    });
    drafts = applyIrrigationCalculation(drafts, gathered.scopeBlocks, gathered.snapshots, o.t);
    // An irrigation question on a block the calculation says needs water gets its card from the template.
    if (asksAboutIrrigation(o.question)) {
      for (const b of gathered.scopeBlocks) {
        if (drafts.length >= MAX_DRAFTS) break;
        if (drafts.some((d) => d.block_id === b.id && d.category === "irrigate")) continue;
        const template = irrigationTemplateDraft(b, gathered.snapshots.get(b.id) ?? null, o.t);
        if (template) drafts.push(template);
      }
    }
  }

  return {
    kind: "answer",
    text: text.slice(0, 20000),
    citations,
    referenceStatus,
    recordRefs: gathered.recordRefs,
    drafts,
    searchScope: gathered.searchScope,
    model: usedModel,
    events,
    shown,
  };
}

const IRRIGATION_WORDS = ["irrigat", "water", "sula", "sulama", "riego", "regar", "ري", "سقي"];

function asksAboutIrrigation(question: string): boolean {
  const q = fold(question);
  return IRRIGATION_WORDS.some((w) => q.includes(w));
}
