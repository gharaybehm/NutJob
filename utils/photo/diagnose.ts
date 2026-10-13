// What the model is asked about the photos of a case, and how its answer is
// read (Requirements.md, Photo cases). Shared by the app and by
// scripts/test-photo-diagnosis.ts, so the accuracy test measures what the app
// runs.
//
// The answer is a list of possible causes, never a diagnosis. Two findings of
// the accuracy test are built in: the model's confidence is the same on right
// and wrong answers, so the app keeps only the order of the causes and drops
// the figure; and nothing that reads like a treatment is kept, whatever the
// model wrote (pesticide product and dose come only from a regulatory source,
// through the field assistant's source rules).

import { DATA_FENCE_RULE, asUntrustedData } from "@/utils/assistant/prompt-safety";

export const MAX_CAUSES = 3;

export interface Verdict {
  photos: { usable: boolean; problem: string }[];
  /** null when it cannot be judged. */
  healthy: boolean | null;
  /** Most likely first. `confidence` is the model's own figure: for the test only. */
  causes: { name: string; confidence: number; signs: string }[];
}

/** What the app stores and shows: no confidence figure, no treatment text. */
export interface PossibleCauses {
  photos: { usable: boolean; problem: string }[];
  healthy: boolean | null;
  causes: { name: string; signs: string }[];
}

export const SYSTEM_PROMPT = `You examine photos of an orchard tree taken by a farm worker and say what, if anything, is wrong with it.
All the photos in one message show the same problem on the same tree.
Reply with one JSON object and nothing else:
{
  "photos": [{ "usable": true or false, "problem": "why it cannot be judged, or empty" }],
  "healthy": true, false, or null when it cannot be judged,
  "causes": [{ "name": "the pest, disease or disorder", "confidence": 0 to 1, "signs": "what is visible in the photos that points to it" }]
}
Rules:
- "photos" has one entry per photo, in the order given. A photo is not usable when it is blurred, too dark, overexposed, too far away, or does not show a plant.
- Give at most three causes, most likely first. Give none when the plant looks healthy or when no photo is usable.
- When you cannot tell, say so: set "healthy" to null and give no causes. Do not guess.
- Confidence is how sure you are from what is visible, not how common the problem is.
- Do not name products, active ingredients or doses, and do not say how to treat it.
- ${DATA_FENCE_RULE}`;

export interface CaseContext {
  crop?: string | null;
  variety?: string | null;
  /** Month the photos were taken, in English. */
  month?: string | null;
  region?: string | null;
}

export function contextLine(c: CaseContext): string {
  // Block and farm fields are typed by users; keep them to one short plain line each.
  const plain = (s: string) => s.replace(/[^\p{L}\p{N} ,.()'/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const parts: string[] = [];
  if (c.crop) parts.push(`crop: ${plain(c.crop)}`);
  if (c.variety) parts.push(`variety: ${plain(c.variety)}`);
  if (c.month) parts.push(`month taken: ${plain(c.month)}`);
  if (c.region) parts.push(`region: ${plain(c.region)}`);
  return parts.join("; ");
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/**
 * The chat messages for one case. `images` are data URLs. `note` is what the
 * person in the field typed: it is given as data, never as an instruction.
 * `language` is the language to answer in (English when left out).
 */
export function buildMessages(o: { images: string[]; context?: string | null; note?: string | null; language?: string | null }): {
  role: "system" | "user";
  content: string | Part[];
}[] {
  const lines = [`${o.images.length} photo(s) of one tree.`];
  if (o.context) lines.push(`Context: ${o.context}`);
  if (o.language) lines.push(`Write "problem", "name" and "signs" in ${o.language}.`);
  if (o.note?.trim()) lines.push(`Note from the person who took the photos:\n${asUntrustedData("field note", o.note, 1000)}`);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [{ type: "text", text: lines.join("\n") }, ...o.images.map((url) => ({ type: "image_url" as const, image_url: { url } }))] },
  ];
}

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Reads the model's reply. Throws when it is not the JSON asked for. */
export function parseVerdict(raw: string, photoCount: number): Verdict {
  const clean = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const data = JSON.parse(clean) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object");
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const causes = Array.isArray(data.causes) ? data.causes : [];
  if (photos.length !== photoCount) {
    throw new Error(`expected ${photoCount} photo verdicts, got ${photos.length}`);
  }
  return {
    photos: photos.map((p: Record<string, unknown>) => ({
      usable: p?.usable === true,
      problem: text(p?.problem, 200),
    })),
    healthy: typeof data.healthy === "boolean" ? data.healthy : null,
    causes: causes
      .slice(0, MAX_CAUSES)
      .map((c: Record<string, unknown>) => ({
        name: text(c?.name, 80),
        confidence: Math.min(1, Math.max(0, Number(c?.confidence) || 0)),
        signs: text(c?.signs, 300),
      }))
      .filter((c) => c.name),
  };
}

// An amount of product: "200 ml/100 L", "2 kg per ha", "50 g", "300 ppm".
const DOSE = /\d+(?:[.,]\d+)?\s*(?:ml|cc|lt?|g|gr|kg|oz|lb|ppm)\b(?:\s*(?:\/|per\s|a\s)\s*(?:\d+\s*)?(?:ha|da|dekar|dönüm|donum|acre|lt?|hl|tree|ağaç|agac)\b)?/iu;
// Common pesticide actives and product classes. Nutrients (copper, sulphur,
// zinc) are left out on purpose: "zinc deficiency" is a cause, not a product.
const ACTIVE =
  /\b(mancozeb|captan|chlorothalonil|tebuconazole|difenoconazole|myclobutanil|azoxystrobin|pyraclostrobin|boscalid|thiophanate|dodine|ziram|thiram|bordeaux|imidacloprid|acetamiprid|thiamethoxam|abamectin|spinosad|spinetoram|chlorpyrifos|deltamethrin|lambda[- ]?cyhalothrin|cypermethrin|malathion|dimethoate|spirotetramat|glyphosate|paraquat|streptomycin|oxytetracycline|kasugamycin)\b/i;
// An instruction to treat: the photo step says what it might be, not what to do.
const TREAT = /\b(apply|spray(?:ing)? with|treat(?:ment)? with|dose|dosage|application rate|use an? (?:fungicide|insecticide|miticide|acaricide|bactericide|pesticide|herbicide))\b/i;

/** True when the text names a product, an active ingredient, a dose or a treatment. */
export function mentionsTreatment(s: string): boolean {
  return DOSE.test(s) || ACTIVE.test(s) || TREAT.test(s);
}

/**
 * What the app keeps of a verdict. A cause whose name reads like a treatment
 * is dropped; signs that do are blanked; the confidence figure is not kept.
 * With no usable photo there are no causes, whatever the model said.
 */
export function toPossibleCauses(v: Verdict): PossibleCauses {
  const anyUsable = v.photos.some((p) => p.usable);
  const causes = anyUsable
    ? v.causes
        .filter((c) => !mentionsTreatment(c.name))
        .map((c) => ({ name: c.name, signs: mentionsTreatment(c.signs) ? "" : c.signs }))
    : [];
  return {
    photos: v.photos.map((p) => ({ usable: p.usable, problem: mentionsTreatment(p.problem) ? "" : p.problem })),
    healthy: anyUsable ? v.healthy : null,
    causes,
  };
}

/** JPEG files start with FF D8 FF. The bucket checks only the declared type. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
