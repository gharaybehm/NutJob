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
import { gatherContext, regulatorySourceLoaded, searchCrop, type FarmInfo } from "./gather";
import type { AssistantCitation, AssistantPins, AssistantRecordRef, DeclineCategory, ReferenceStatus } from "./types";

type Admin = Parameters<typeof gatherContext>[0];

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
  t: (key: string) => string;
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
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: assistantSystemPrompt({ locale: o.locale, dosesAllowed }) },
    { role: "system", content: gathered.contextMessage },
    ...historyTurns,
    { role: "user", content: o.question },
  ];
  const suppliedText = [gathered.contextMessage, o.question, ...o.history.map((m) => m.content)].join("\n");
  const isAdvice = intent.kind === "advice";
  const passageCount = gathered.passages.length;

  // ── Stream, holding text back while it could still be a decline marker ──
  const { stream, model, usedFallback } = await streamWithFallback(
    { messages, temperature: 0.2, max_tokens: 1200 },
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    { signal: o.signal }
  );
  if (usedFallback) events.push({ kind: "fallback", category: null });
  let usedModel = model;
  let full = "";
  let released = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;
    full += delta;
    if (parseModelDecline(full) || mayBeDeclinePrefix(full)) continue;
    o.onDelta?.(full.slice(released));
    released = full.length;
  }
  const shown = full.slice(0, released);

  let modelDecline = parseModelDecline(full);
  let check: AnswerCheck = checkAnswer(full, { passageCount, isAdvice, suppliedText });

  // ── One retry on the stronger model, only for a failure code can detect ──
  if (!modelDecline && check.problems.length > 0) {
    events.push({ kind: "retry", category: check.problems.join(",") });
    try {
      const { completion, model: retryModel } = await completeWithFallback(
        { messages, temperature: 0.1, max_tokens: 1200 },
        RETRY_MODEL,
        FALLBACK_MODEL,
        { timeoutMs: 60_000 }
      );
      const retried = completion.choices[0]?.message?.content ?? "";
      const retryDecline = parseModelDecline(retried);
      const retryCheck = checkAnswer(retried, { passageCount, isAdvice, suppliedText });
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
  let text = stripInvalidCitations(full, passageCount).trim();
  if (!dosesAllowed) {
    const r = redactPesticideDoses(text, o.question);
    if (r.redacted) text = `${r.text}\n\n${o.t("doseRemoved")}`.trim();
  }
  if (check.problems.includes("unknown_figure")) text = `${text}\n\n${o.t("figureUnchecked")}`;
  if (check.problems.includes("form") || text.length === 0) text = o.t("couldNotAnswer");

  const cited = citedNumbers(text).filter((n) => n >= 1 && n <= passageCount);
  const citations = gathered.passages.filter((p) => cited.includes(p.n)).map(citationFor);
  const referenceStatus = isAdvice ? answerReferenceStatus(gathered.lookupStatus, citations.length) : null;
  if (isAdvice && referenceStatus !== "found") events.push({ kind: "unsourced", category: referenceStatus });

  return {
    kind: "answer",
    text: text.slice(0, 20000),
    citations,
    referenceStatus,
    recordRefs: gathered.recordRefs,
    model: usedModel,
    events,
    shown,
  };
}
