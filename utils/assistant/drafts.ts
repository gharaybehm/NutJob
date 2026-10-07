// Draft recommendation cards in an assistant answer (Requirements.md, Field
// assistant: Draft cards). The model may append proposed actions after a
// marker line; code decides what survives: the block must be the farm's, the
// category one of the six, citations real passages, no pesticide dose without
// a regulatory source, and no figure the model worked out. Where the
// irrigation calculation already decides the action, the card is built from a
// template and the model's version is not used.

import type { DailySnapshot } from "@/engines/snapshot";
import { containsDose, redactPesticideDoses } from "./source-rules";
import { unknownFigures } from "./answer-checks";
import type { LabelledPassage } from "./source-rules";
import type { ReferenceStatus } from "./types";

export const DRAFTS_MARKER = "===DRAFTS===";
/** One per block and action; matches the most blocks an unpinned question covers (gather.ts). */
export const MAX_DRAFTS = 6;

export const DRAFT_CATEGORIES = ["irrigate", "fertilize", "spray", "scout", "prune", "other"] as const;
export type DraftCategory = (typeof DRAFT_CATEGORIES)[number];

export interface AssistantDraft {
  block_id: string;
  block_name: string;
  category: DraftCategory;
  title: string;
  rationale: string;
  /** 0–100, as shown on recommendation cards. */
  confidence: number;
  sources: { n: number | null; title: string; section: string | null }[];
  reference_status: ReferenceStatus | null;
  /** Built by code from the irrigation calculation, not by the model. */
  from_calculation: boolean;
}

/**
 * What became of a draft, keyed by its index in assistant_messages.draft_states.
 * The key "guides" records a "Request guides" sent from the answer.
 */
export type DraftState =
  | { state: "accepted" | "edited"; recommendation_id: string; at: string }
  | { state: "dismissed"; recommendation_id: string; reason: string | null; at: string }
  | { state: "guides_requested"; request_kind: "gap" | "question"; at: string };

/** The answer text and the raw drafts block after the marker, if any. */
export function splitDrafts(full: string): { answer: string; raw: string | null } {
  const i = full.indexOf(DRAFTS_MARKER);
  if (i < 0) return { answer: full, raw: null };
  return { answer: full.slice(0, i).trimEnd(), raw: full.slice(i + DRAFTS_MARKER.length) };
}

/**
 * How much of a streaming answer can be shown: everything before the marker,
 * and never a tail that could be the start of it.
 */
export function streamSafeLength(full: string): number {
  const i = full.indexOf(DRAFTS_MARKER);
  if (i >= 0) return i;
  for (let k = Math.min(DRAFTS_MARKER.length - 1, full.length); k > 0; k--) {
    if (DRAFTS_MARKER.startsWith(full.slice(full.length - k))) return full.length - k;
  }
  return full.length;
}

function parseJsonArray(raw: string): unknown[] {
  let text = raw.trim();
  if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```\s*$/, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface DraftContext {
  blocks: { id: string; name: string }[];
  passages: LabelledPassage[];
  /** The answer's reference status, used for a draft that cites nothing. */
  answerReferenceStatus: ReferenceStatus | null;
  question: string;
  dosesAllowed: boolean;
  /** Everything the model was given, for the figure check. */
  suppliedText: string;
}

/** Validated drafts from the raw block; anything that fails a rule is dropped, not repaired. */
export function parseDrafts(raw: string | null, ctx: DraftContext): AssistantDraft[] {
  if (!raw) return [];
  const out: AssistantDraft[] = [];
  for (const item of parseJsonArray(raw)) {
    if (out.length >= MAX_DRAFTS) break;
    if (typeof item !== "object" || item === null) continue;
    const d = item as Record<string, unknown>;

    const blockRef = typeof d.block === "string" ? d.block.trim() : typeof d.block_id === "string" ? d.block_id.trim() : "";
    const block =
      ctx.blocks.find((b) => b.id === blockRef) ??
      ctx.blocks.find((b) => b.name.trim().toLowerCase() === blockRef.toLowerCase());
    if (!block) continue;

    const category = typeof d.category === "string" ? (d.category.toLowerCase() as DraftCategory) : null;
    if (!category || !DRAFT_CATEGORIES.includes(category)) continue;

    const title = typeof d.title === "string" ? d.title.trim().replace(/\s+/g, " ").slice(0, 120) : "";
    const rationale = typeof d.rationale === "string" ? d.rationale.trim().slice(0, 1500) : "";
    if (!title || !rationale) continue;

    // Same rules as the answer: no dose without a regulatory source, no figure the model made up.
    // A spray card with any dose at all is a pesticide dose.
    const text = `${title}. ${rationale}`;
    if (!ctx.dosesAllowed && (redactPesticideDoses(text, ctx.question).redacted || (category === "spray" && containsDose(text)))) continue;
    if (unknownFigures(text, ctx.suppliedText).length > 0) continue;

    const nums = Array.isArray(d.sources) ? d.sources.map(Number).filter((n) => Number.isInteger(n)) : [];
    const cited = ctx.passages.filter((p) => nums.includes(p.n));
    const confidence = Math.round(Math.min(100, Math.max(0, Number(d.confidence) || 70)));

    out.push({
      block_id: block.id,
      block_name: block.name,
      category,
      title,
      rationale,
      confidence,
      sources: cited.map((p) => ({ n: p.n, title: p.chunk.source_title, section: p.chunk.source_section ?? null })),
      reference_status: cited.length > 0 ? "found" : ctx.answerReferenceStatus === "found" ? "no_match" : ctx.answerReferenceStatus ?? "no_match",
      from_calculation: false,
    });
  }
  return out;
}

const CONFIDENCE: Record<string, number> = { high: 85, medium: 70, low: 55 };

/**
 * The irrigation card the calculation decides, or null when it decides none.
 * `t` gives the localised template (assistant.templates.irrigate.*).
 */
export function irrigationTemplateDraft(
  block: { id: string; name: string },
  snapshot: DailySnapshot | null,
  t: (key: string, values?: Record<string, string | number>) => string
): AssistantDraft | null {
  const irr = snapshot?.water.irrigation;
  if (!snapshot || !irr || (irr.status !== "irrigate_now" && irr.status !== "irrigate_soon") || irr.requirementMm == null) return null;
  const r1 = (n: number | null) => (n == null ? "?" : String(Math.round(n * 10) / 10));
  return {
    block_id: block.id,
    block_name: block.name,
    category: "irrigate",
    title: t(irr.status === "irrigate_now" ? "templates.irrigate.titleNow" : "templates.irrigate.titleSoon", {
      block: block.name,
      mm: r1(irr.requirementMm),
    }),
    rationale: t("templates.irrigate.rationale", {
      date: snapshot.date,
      depletion: r1(irr.depletionMm),
      raw: r1(irr.rawMm),
      mm: r1(irr.requirementMm),
      m3: r1(irr.requirementM3),
      days: irr.daysToThreshold == null ? "?" : String(irr.daysToThreshold),
    }),
    confidence: CONFIDENCE[irr.confidence] ?? 70,
    sources: [{ n: null, title: t("templates.irrigate.source", { date: snapshot.date }), section: null }],
    reference_status: null,
    from_calculation: true,
  };
}

/**
 * Where the calculation decides irrigation for a block, it overrides the
 * model: its template replaces the model's irrigation draft, and a model
 * irrigation draft the calculation contradicts (no irrigation needed) is
 * dropped. With the calculation off, the model's draft stands.
 */
export function applyIrrigationCalculation(
  drafts: AssistantDraft[],
  blocks: { id: string; name: string }[],
  snapshots: Map<string, DailySnapshot>,
  t: (key: string, values?: Record<string, string | number>) => string
): AssistantDraft[] {
  return drafts.flatMap((d) => {
    if (d.category !== "irrigate") return [d];
    const snap = snapshots.get(d.block_id) ?? null;
    const status = snap?.water.irrigation.status;
    if (!snap || !status || status === "data_required" || !snap.crop.hasProfile) return [d];
    const template = irrigationTemplateDraft(blocks.find((b) => b.id === d.block_id)!, snap, t);
    return template ? [template] : [];
  });
}
