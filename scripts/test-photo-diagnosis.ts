// Accuracy test for photo diagnosis, run before any of the feature is built.
// Sends each case (1 to 3 photos of one problem on one tree) to the model the
// app already uses and records what it names, so the user can judge whether
// the answers are good enough on their own trees.
//
//   npm run test:photos -- --dir=photo-test [--limit=10] [--single]
//
// The folder holds the photos and a labels.csv:
//
//   case,file,expected,variety,month,notes
//   1,leaf-close.jpg,shot hole,Vairo,May,
//   1,leaf-under.jpg,shot hole,Vairo,May,
//   2,blurred.jpg,poor photo,Makako,,
//
// Rows sharing a `case` are judged together. `expected` is what the user or
// their agronomist believes it is: a problem name, `healthy`, `poor photo` or
// `unknown`. `variety`, `month` and `notes` are optional.
//
// Each case is asked twice: photos only, then photos with crop, variety, month
// and region. --single also asks each multi-photo case with its first photo
// only, to show what the extra photos add. Costs two or three model calls per
// case. Only the photos and that context are sent.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";
import sharp from "sharp";
import { openrouter } from "../utils/openrouter";
import { PRIMARY_MODEL } from "../utils/ai-models";

config({ path: join(process.cwd(), ".env.local") });

const MAX_PHOTOS = 3;
const MAX_SIDE_PX = 1500;
const REGION = "Aksaray, central Türkiye (continental, semi-arid)";
/** A cause at or above this counts as a confident answer when scoring. */
const CONFIDENT = 0.6;

interface Case {
  id: string;
  files: string[];
  expected: string;
  variety: string;
  month: string;
}

interface Verdict {
  photos: { usable: boolean; problem: string }[];
  healthy: boolean | null;
  causes: { name: string; confidence: number; signs: string }[];
}

type Variant = "image" | "context" | "first";

const SYSTEM_PROMPT = `You examine photos of an orchard tree taken by a farm worker and say what, if anything, is wrong with it.
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
- Do not name products, active ingredients or doses.`;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** Minimal CSV: commas, double-quoted fields, "" for a quote inside one. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function loadCases(dir: string): Case[] {
  const rows = parseCsv(readFileSync(join(dir, "labels.csv"), "utf8"));
  const byId = new Map<string, Case>();
  for (const r of rows) {
    if (!r.case || !r.file) continue;
    const c = byId.get(r.case) ?? { id: r.case, files: [], expected: "", variety: "", month: "" };
    c.files.push(r.file);
    c.expected ||= r.expected ?? "";
    c.variety ||= r.variety ?? "";
    c.month ||= r.month ?? "";
    byId.set(r.case, c);
  }
  return [...byId.values()];
}

/** Downscaled JPEG as a data URL. Re-encoding drops EXIF, including GPS. */
async function prepare(path: string): Promise<string> {
  const jpeg = await sharp(path)
    .rotate()
    .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function parseVerdict(raw: string, photoCount: number): Verdict {
  const clean = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const data = JSON.parse(clean) as Record<string, unknown>;
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const causes = Array.isArray(data.causes) ? data.causes : [];
  if (photos.length !== photoCount) {
    throw new Error(`expected ${photoCount} photo verdicts, got ${photos.length}`);
  }
  return {
    photos: photos.map((p: Record<string, unknown>) => ({
      usable: p.usable === true,
      problem: String(p.problem ?? ""),
    })),
    healthy: typeof data.healthy === "boolean" ? data.healthy : null,
    causes: causes.slice(0, 3).map((c: Record<string, unknown>) => ({
      name: String(c.name ?? ""),
      confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0)),
      signs: String(c.signs ?? ""),
    })),
  };
}

async function ask(images: string[], context: string | null): Promise<{ verdict: Verdict; raw: string }> {
  const text = context
    ? `${images.length} photo(s) of one tree. Context: ${context}`
    : `${images.length} photo(s) of one tree.`;
  const response = await openrouter.chat.completions.create(
    {
      model: PRIMARY_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        },
      ],
    },
    { timeout: 90_000 }
  );
  const raw = response.choices[0]?.message?.content ?? "";
  return { verdict: parseVerdict(raw, images.length), raw };
}

function contextFor(c: Case): string {
  const parts = ["crop: almond"];
  if (c.variety) parts.push(`variety: ${c.variety}`);
  if (c.month) parts.push(`month taken: ${c.month}`);
  parts.push(`region: ${REGION}`);
  return parts.join("; ");
}

const isConfident = (v: Verdict) => (v.causes[0]?.confidence ?? 0) >= CONFIDENT;

/** How the verdict compares with the label; "" when the label is not scored. */
function score(expected: string, v: Verdict): string {
  const want = expected.toLowerCase();
  if (!want || want === "unknown") return "";
  if (want === "healthy") {
    if (v.healthy === true) return "ok";
    return isConfident(v) ? "invented" : "unsure";
  }
  if (want === "poor photo") {
    if (v.photos.some((p) => !p.usable)) return "flagged";
    return isConfident(v) ? "confident anyway" : "unsure";
  }
  const at = v.causes.findIndex((c) => c.name.toLowerCase().includes(want));
  if (at === 0) return "top 1";
  if (at > 0) return "top 3";
  return isConfident(v) ? "confident miss" : "miss";
}

const describe = (v: Verdict) =>
  v.causes.map((c) => `${c.name} ${c.confidence.toFixed(2)}`).join(" | ") ||
  (v.healthy === true ? "healthy" : "cannot judge");

const quality = (v: Verdict) =>
  v.photos.map((p) => (p.usable ? "ok" : `no: ${p.problem}`)).join(" | ");

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const dirArg = arg("dir");
  if (!dirArg) {
    console.error("Usage: npm run test:photos -- --dir=photo-test [--limit=10] [--single]");
    process.exit(1);
  }
  const dir = resolve(dirArg);
  if (!existsSync(join(dir, "labels.csv"))) {
    console.error(`No labels.csv in ${dir}`);
    process.exit(1);
  }
  const limit = Number(arg("limit")) || Infinity;
  const single = process.argv.includes("--single");

  const all = loadCases(dir);
  const cases: Case[] = [];
  for (const c of all) {
    const missing = c.files.filter((f) => !existsSync(join(dir, f)));
    if (c.files.length > MAX_PHOTOS) {
      console.log(`SKIP  case ${c.id}: ${c.files.length} photos, the limit is ${MAX_PHOTOS}`);
    } else if (missing.length) {
      console.log(`SKIP  case ${c.id}: file not found: ${missing.join(", ")}`);
    } else if (cases.length < limit) {
      cases.push(c);
    }
  }
  console.log(`${cases.length} case(s) on ${PRIMARY_MODEL}\n`);

  const variants: Variant[] = single ? ["image", "context", "first"] : ["image", "context"];
  const tally: Record<string, Record<string, number>> = {};
  const csv = [["case", "files", "expected", "variant", "score", "photo_quality", "healthy", "causes", "error"].join(",")];
  const full: unknown[] = [];
  let failed = 0;

  for (const c of cases) {
    const images = await Promise.all(c.files.map((f) => prepare(join(dir, f))));
    console.log(`Case ${c.id}  (${c.files.join(", ")})  expected: ${c.expected || "not given"}`);

    for (const variant of variants) {
      if (variant === "first" && images.length === 1) continue;
      const sent = variant === "first" ? images.slice(0, 1) : images;
      const files = variant === "first" ? c.files.slice(0, 1) : c.files;
      const head = [c.id, files.join(" "), c.expected, variant].map(csvCell);
      try {
        const { verdict, raw } = await ask(sent, variant === "image" ? null : contextFor(c));
        const s = score(c.expected, verdict);
        if (s) ((tally[variant] ??= {})[s] = (tally[variant][s] ?? 0) + 1);
        console.log(`  ${variant.padEnd(8)}${s ? `[${s}] ` : ""}${describe(verdict)}`);
        console.log(`          photos: ${quality(verdict)}`);
        csv.push([...head, ...[s, quality(verdict), String(verdict.healthy), describe(verdict), ""].map(csvCell)].join(","));
        full.push({ case: c.id, files, expected: c.expected, variant, verdict, raw });
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        console.log(`  ${variant.padEnd(8)}ERROR ${message}`);
        csv.push([...head, ...["", "", "", "", message].map(csvCell)].join(","));
        full.push({ case: c.id, files, expected: c.expected, variant, error: message });
      }
    }
  }

  writeFileSync(join(dir, "results.csv"), csv.join("\n") + "\n");
  writeFileSync(join(dir, "results.json"), JSON.stringify(full, null, 2));

  console.log("\nScored against labels (cases labelled `unknown` or with no label are not scored):");
  for (const variant of variants) {
    const counts = Object.entries(tally[variant] ?? {}).map(([k, n]) => `${k}: ${n}`).join(", ");
    console.log(`  ${variant.padEnd(8)}${counts || "nothing scored"}`);
  }
  console.log(`\nWrote results.csv and results.json to ${dir}`);
  if (failed) console.log(`${failed} model call(s) failed; see the error column.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Photo test failed to run:", e);
  process.exit(1);
});
