// Checks the system can make on an answer by itself. A failure here is the only
// reason to retry once on the stronger model (Requirements.md, Model choice).

import type { ReferenceStatus } from "./types";

export type AnswerProblem = "form" | "truncated" | "no_citation" | "unknown_figure";

/** The distinct [n] markers in an answer, in order of first appearance. */
export function citedNumbers(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** Drops markers that point at no supplied passage, so a citation is never invented. */
export function stripInvalidCitations(text: string, passageCount: number): string {
  return text.replace(/\s?\[(\d{1,2})\]/g, (whole, d) => {
    const n = Number(d);
    return n >= 1 && n <= passageCount ? whole : "";
  });
}

// Figures with a unit the engines or the records produce. A bare number (a
// date, a block name) is not checked.
const FIGURE = /(-?\d+(?:[.,]\d+)?)\s*(mm|m³|m3|°C|ºC|kg\s*N\s*\/\s*ha|kg\s*\/\s*ha|kg\s*\/\s*da|kg\s*\/\s*tree|kg\s*\/\s*ağaç|g\s*\/\s*tree|L\s*\/\s*tree|l\s*\/\s*ağaç|GDD|chill hours|saat soğuklama|%)/gi;

function canonical(n: string): string {
  const v = Number(n.replace(",", "."));
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : n;
}

/** Every number that appears anywhere in the supplied text, in canonical form. */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    out.add(canonical(m[0]));
    // "−2" written with a minus sign, or a negative read without its sign.
    out.add(canonical(m[0].replace(/^-/, "")));
  }
  return out;
}

/**
 * Figures with a unit in the answer that appear nowhere in what the model was
 * given. Numbers come from the engines and the records, never from the model,
 * so such a figure was worked out or made up.
 */
export function unknownFigures(answer: string, suppliedText: string): string[] {
  const known = numbersIn(suppliedText);
  const unknown: string[] = [];
  for (const m of answer.matchAll(FIGURE)) {
    const value = canonical(m[1]);
    if (!known.has(value) && !known.has(value.replace(/^-/, ""))) unknown.push(m[0].trim());
  }
  return unknown;
}

export interface AnswerCheck {
  problems: AnswerProblem[];
  /** Valid citation numbers, in order of first appearance. */
  cited: number[];
}

/**
 * @param isAdvice  advice must cite when passages were supplied; a record
 *                  question or a decline need not.
 * @param suppliedText everything the model was given (facts, records, passages, question)
 */
export function checkAnswer(
  text: string,
  {
    passageCount,
    isAdvice,
    suppliedText,
    finishReason = null,
  }: { passageCount: number; isAdvice: boolean; suppliedText: string; finishReason?: string | null }
): AnswerCheck {
  const problems: AnswerProblem[] = [];
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.startsWith("```") || trimmed.startsWith("{") || trimmed.startsWith("[{")) {
    problems.push("form");
  }
  // Stopped by the token limit: the answer ends mid-sentence.
  if (finishReason === "length") problems.push("truncated");
  const cited = citedNumbers(text).filter((n) => n >= 1 && n <= passageCount);
  if (isAdvice && passageCount > 0 && cited.length === 0) problems.push("no_citation");
  if (unknownFigures(text, suppliedText).length > 0) problems.push("unknown_figure");
  return { problems, cited };
}

/**
 * The reference status shown on an answer, by the same reasons as a
 * recommendation card. Null when sources do not apply (a record question).
 */
export function answerReferenceStatus(
  lookup: ReferenceStatus | null,
  citedCount: number
): ReferenceStatus | null {
  if (lookup === null) return null;
  if (citedCount > 0) return "found";
  // Passages were supplied but none was used: none of them covered it.
  return lookup === "found" ? "no_match" : lookup;
}
