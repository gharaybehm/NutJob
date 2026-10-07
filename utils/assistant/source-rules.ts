// Source rules for the field assistant, enforced in code rather than asked of
// the model (CLAUDE.md, Field Assistant): a pesticide product or dose is given
// only from a regulatory source for the farm's own country, and advice resting
// on a source from another country says so.

import { describeChunkOrigin, type RetrievedChunk } from "@/utils/generate-recommendations";
import type { AssistantCitation } from "./types";

// ─── Vocabulary (en / tr / ar / es) ──────────────────────────────────────────
// Lower-case substrings. Latin-script entries are matched at a word start so
// "rate" does not match "irrigate"; Arabic entries are matched anywhere.

const PESTICIDE_TERMS = [
  // en
  "pesticide", "insecticide", "fungicide", "herbicide", "acaricide", "miticide", "nematicide",
  "bactericide", "agrochemical", "active ingredient", "spray product", "chemical control",
  // tr
  "ilaç", "ilac", "pestisit", "insektisit", "fungisit", "herbisit", "akarisit", "nematisit",
  "etken madde", "zirai ilaç", "kimyasal mücadele", "ilaçlama",
  // es
  "plaguicida", "fitosanitario", "insecticida", "fungicida", "herbicida", "acaricida", "materia activa",
  // ar
  "مبيد", "مبيدات", "المادة الفعالة", "رش كيميائي",
];

const PRODUCT_OR_DOSE_TERMS = [
  // en
  "dose", "dosage", "rate", "how much", "how many ml", "per hectare", "per acre", "per litre", "per liter",
  "which product", "what product", "which pesticide", "what pesticide", "brand", "trade name",
  "what should i spray", "what to spray", "what can i spray", "mix ratio", "concentration",
  // tr
  "doz", "dozaj", "ne kadar", "dekara", "litreye", "hangi ilaç", "hangi ilac", "ne atmalı", "ne atayım",
  "hangi ürün", "marka", "karışım oranı",
  // es
  "dosis", "qué producto", "que producto", "cuánto", "cuanto", "por hectárea", "marca comercial",
  // ar
  "جرعة", "الجرعة", "كم", "أي مبيد", "ما هو المبيد", "ما المبيد", "لكل هكتار", "لكل لتر", "اسم تجاري",
];

const LATIN = /[a-zçğıöşüñáéíóú]/i;

/** Lower case with Turkish dotted and dotless i folded together, so "ILAÇ", "İlaç" and "ilaç" match. */
export function fold(text: string): string {
  return text.replace(/İ/g, "i").toLowerCase().replace(/ı/g, "i");
}

function containsTerm(text: string, term: string): boolean {
  const hay = fold(text);
  const needle = fold(term);
  if (!LATIN.test(needle[0] ?? "")) return hay.includes(needle);
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i === 0 ? "" : hay[i - 1];
    if (!before || !/[\p{L}\p{N}]/u.test(before)) return true;
    from = i + 1;
  }
}

export function mentionsPesticide(text: string): boolean {
  return PESTICIDE_TERMS.some((t) => containsTerm(text, t));
}

/** A question that asks which pesticide product to use, or how much of it. */
export function isPesticideProductOrDoseQuestion(text: string): boolean {
  const lower = fold(text);
  const asksWhatToSpray = /\b(what|which)\b[^.?!]{0,30}\bspray\b/.test(lower) || containsTerm(lower, "ne atmalı");
  return asksWhatToSpray || (mentionsPesticide(text) && PRODUCT_OR_DOSE_TERMS.some((t) => containsTerm(text, t)));
}

/** True when at least one passage is a regulatory source for the farm's own country. */
export function hasRegulatorySourceFor(chunks: Pick<RetrievedChunk, "regulatory" | "country">[], farmCountry: string | null): boolean {
  if (!farmCountry) return false;
  return chunks.some((c) => c.regulatory === true && (c.country ?? "").toUpperCase() === farmCountry.toUpperCase());
}

// ─── Doses in an answer ──────────────────────────────────────────────────────

const AMOUNT = String.raw`\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?`;
const UNIT = String.raw`(?:ml|mL|cc|cl|l|L|lt|litre|liter|litres|liters|g|gr|gram|grams|kg|oz|مل|لتر|غرام|كغ)`;
const PER = String.raw`(?:\s*\/\s*|\s+per\s+|\s+a\s+|\s+por\s+|\s+لكل\s+|\s+başına\s+)`;
const BASIS = String.raw`(?:ha|hectare|hectárea|hektar|da|dekar|decare|dönüm|dönüme|acre|100\s*(?:l|L|lt|litre|liter|litros)|1000\s*(?:l|L)|l|L|lt|litre|liter|litro|tree|ağaç|ağaca|árbol|هكتار|دونم|لتر|شجرة)`;
// "250 ml/100 L", "1.5 L per ha", "40 cc/da", "200 g/100 litre", "dekara 50 ml"
const DOSE = new RegExp(
  String.raw`${AMOUNT}\s*${UNIT}${PER}${BASIS}|(?:dekara|hektara|litreye|100\s*litre\s*suya)\s+${AMOUNT}\s*${UNIT}|${AMOUNT}\s*%\s*(?:solution|concentration|konsantrasyon|çözelti|محلول)`,
  "i"
);

export function containsDose(text: string): boolean {
  return DOSE.test(text);
}

/**
 * Removes pesticide product-and-dose sentences from an answer when no
 * regulatory source for the farm's country backs them. A sentence goes when it
 * states a dose and either it or the question is about pesticides; a nitrogen
 * rate in an answer about fertiliser stays.
 */
export function redactPesticideDoses(answer: string, question: string): { text: string; redacted: boolean } {
  const questionIsPesticide = mentionsPesticide(question) || isPesticideProductOrDoseQuestion(question);
  const parts = answer.split(/(?<=[.!?؟。])\s+|\n/);
  let redacted = false;
  const kept = parts.filter((s) => {
    if (!containsDose(s)) return true;
    if (questionIsPesticide || mentionsPesticide(s)) {
      redacted = true;
      return false;
    }
    return true;
  });
  return { text: redacted ? kept.join(" ").replace(/\s{2,}/g, " ").trim() : answer, redacted };
}

// ─── Passages as given to the model ──────────────────────────────────────────

export interface LabelledPassage {
  n: number;
  chunk: RetrievedChunk;
  origin: string;
  /** From the farm's own country. */
  local: boolean;
}

/**
 * Numbers the passages and labels where each comes from, adding what
 * describeChunkOrigin cannot know: whether the source is from the farm's
 * country, and that a regulatory source from elsewhere does not regulate here.
 */
export function labelPassages(chunks: RetrievedChunk[], farmCountry: string | null): LabelledPassage[] {
  const farm = farmCountry?.toUpperCase() ?? null;
  return chunks.map((chunk, i) => {
    const country = chunk.country?.toUpperCase() ?? null;
    const local = Boolean(farm && country && farm === country);
    let origin = describeChunkOrigin(chunk);
    if (chunk.crop_type) origin = `crop: ${chunk.crop_type}; ${origin}`;
    if (country && !local) {
      origin += farm ? `; from ${country}, not the farm's country (${farm})` : `; from ${country}`;
      if (chunk.regulatory) origin = origin.replace("regulatory source", `regulatory source in ${country} only`);
    }
    return { n: i + 1, chunk, origin, local };
  });
}

export function citationFor(p: LabelledPassage): AssistantCitation {
  return {
    n: p.n,
    title: p.chunk.source_title,
    section: p.chunk.source_section ?? null,
    page: p.chunk.page_number ?? null,
    origin: p.origin,
  };
}
