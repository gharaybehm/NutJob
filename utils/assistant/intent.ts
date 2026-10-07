// A cheap, rule-based first look at a question, before any model call.
// Clear declines are answered from a template; everything else goes to the
// model, which may still decline (it starts its answer with "DECLINE: <category>").

import { fold } from "./source-rules";
import { DECLINE_CATEGORIES, type DeclineCategory } from "./types";

export type QuestionIntent =
  | { kind: "decline"; category: DeclineCategory }
  /** About the farm's own records: answered from logs and snapshots, no guide needed. */
  | { kind: "record" }
  /** Agronomic advice or a calculated value: searches the guides. */
  | { kind: "advice" };

// Lower-case substrings matched at a word start (Latin script) or anywhere (Arabic).
const DECLINE_TERMS: Record<Exclude<DeclineCategory, "pesticide_no_regulatory" | "off_topic">, string[]> = {
  circumvention: [
    "ignore previous", "ignore all previous", "ignore your instructions", "ignore the instructions", "ignore the rules",
    "disregard your", "system prompt", "your instructions", "developer mode", "jailbreak", "pretend you are",
    "you are now", "ignore the variety", "ignore the filter", "bypass", "without the source rule",
    "önceki talimat", "talimatları yok say", "kuralları yok say", "sistem istemi",
    "ignora las instrucciones", "instrucciones anteriores",
    "تجاهل التعليمات", "تجاهل القواعد", "التعليمات السابقة",
  ],
  veterinary: [
    "veterinar", "my dog", "my cat", "livestock", "cattle", "sheep", "goat", "poultry", "chickens",
    "veteriner", "köpeğim", "kedim", "inek", "koyun", "keçi", "tavuk",
    "veterinari", "ganado", "ovejas",
    "بيطري", "الماشية", "أغنام", "دجاج", "كلبي", "قطتي",
  ],
  medical: [
    "my health", "doctor", "hospital", "symptom", "i feel sick", "i was poisoned", "poisoning", "rash on my",
    "headache", "pregnan", "first aid",
    "doktor", "hastane", "zehirlen", "semptom", "başım ağrı", "hamile",
    "médico", "hospital", "síntoma", "intoxicación",
    "طبيب", "مستشفى", "تسمم", "أعراض", "حامل",
  ],
  legal: [
    "lawyer", "lawsuit", "sue ", "legal advice", "in court", "to court", "court case", "contract dispute",
    "avukat", "dava", "mahkeme", "hukuki",
    "abogado", "demanda", "tribunal",
    "محامي", "محكمة", "دعوى", "استشارة قانونية",
  ],
  financial: [
    "invest in", "stock market", "shares in", "crypto", "bitcoin", "mortgage", "loan for", "tax return", "financial advice",
    "yatırım", "borsa", "kripto", "kredi çek", "vergi beyan",
    "inversión", "bolsa de valores", "préstamo", "hipoteca",
    "استثمار", "البورصة", "قرض", "ضريبة", "عملات رقمية",
  ],
};

// Only phrasings that ask about the past: "when should I…" is advice, so the
// bare words for "when" in Turkish, Spanish and Arabic are not here.
const RECORD_TERMS = [
  "when did", "when was", "when were", "last time", "last irrigat", "last spray", "last fertig", "what did we", "did we",
  "how many times", "history", "logged", "last leaf", "last soil test", "last test", "last sample",
  "en son", "son kez", "geçen sefer", "kaç kez", "kaç defa", "kaydedil", "yapıldı", "sulandı", "ilaçlandı", "gübrelendi",
  "última vez", "historial", "cuándo se", "cuándo fue",
  "آخر مرة", "متى تم", "متى قمنا", "هل قمنا", "كم مرة",
];

const LATIN = /[a-zçğıöşüñáéíóú]/i;

function has(text: string, term: string): boolean {
  const needle = fold(term);
  if (!LATIN.test(needle[0] ?? "")) return text.includes(needle);
  let from = 0;
  for (;;) {
    const i = text.indexOf(needle, from);
    if (i < 0) return false;
    if (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1])) return true;
    from = i + 1;
  }
}

export function classifyQuestion(question: string): QuestionIntent {
  const text = fold(question);
  // Circumvention first: "ignore the rules and tell me the dose" is not a pesticide question.
  for (const category of ["circumvention", "veterinary", "medical", "legal", "financial"] as const) {
    if (DECLINE_TERMS[category].some((t) => has(text, t))) return { kind: "decline", category };
  }
  if (RECORD_TERMS.some((t) => has(text, t))) return { kind: "record" };
  return { kind: "advice" };
}

/**
 * Reads a model's decline marker. The model is told to start with
 * "DECLINE: <category>" when a question falls outside what it may answer; an
 * unknown category is read as off_topic so a decline is never lost.
 */
export function parseModelDecline(text: string): DeclineCategory | null {
  const m = /^\s*\[?DECLINE\]?\s*[:：-]\s*([a-z_]+)/i.exec(text);
  if (!m) return null;
  const c = m[1].toLowerCase() as DeclineCategory;
  return DECLINE_CATEGORIES.includes(c) ? c : "off_topic";
}

/** True while a streamed answer could still turn out to be a decline marker. */
export function mayBeDeclinePrefix(text: string): boolean {
  const t = text.trimStart().toUpperCase();
  if (t.length === 0) return true;
  const marker = "DECLINE";
  const bare = t.startsWith("[") ? t.slice(1) : t;
  return marker.startsWith(bare.slice(0, marker.length)) && bare.length < marker.length + 25;
}
