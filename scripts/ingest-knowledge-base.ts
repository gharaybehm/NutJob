/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// One-off developer script: chunks and embeds crop-specific reference PDFs
// into knowledge_base_chunks so the AI recommendations engine can ground its
// advice in cited agronomic literature instead of the LLM's own knowledge.
//
// Usage:
//   npm run ingest:kb -- --crop=almond
//   npm run ingest:kb -- --crop=almond --only=guiadealmendroweb.pdf
//   npm run ingest:kb -- --crop=almond --dry-run     (extract + chunk only; no DB, no embedding cost)
//   npm run ingest:kb -- --crop=general              (crop-agnostic material)
//
// Before running: manually download the source PDFs (this script does not
// fetch them) into ./knowledge-base-source/<crop>/ (git-ignored). Describe each
// PDF in scripts/knowledge-base-sources.json (publisher, language, country,
// authority type, ...): a PDF with no entry is refused, because every passage
// must carry its origin.
//
// Each document is replaced on its own (keyed by source_file): an unchanged PDF
// (same SHA-256) is skipped without re-embedding, a changed one has its old
// chunks removed and re-ingested. Other documents are left untouched.

import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { createAdminClient } from "../utils/supabase/admin";
import { openrouter } from "../utils/openrouter";
import { chunkPages, type PageChunk } from "../utils/kb-chunking";

// Next.js loads .env.local automatically; this standalone script does not.
config({ path: join(process.cwd(), ".env.local") });

// Import from the lib sub-path to skip pdf-parse's top-level test-file require()
// — same workaround used in app/api/extract-soil-test/route.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer,
  options?: { pagerender?: (pageData: any) => Promise<string> },
) => Promise<{ text: string }>;

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;
const SOURCE_DIR = join(process.cwd(), "knowledge-base-source");

interface SourceMeta {
  title: string;
  publisher: string;
  language: "en" | "es" | "tr" | "ar";
  country: string | null;
  region: string | null;
  authority_type: string;
  regulatory: boolean;
  variety_applicability: string[] | null;
  climate_context: string | null;
  publication_date: string | null;
  document_version: string | null;
  /** false when numbered lines are figure captions, not section titles. Default true. */
  detect_headings?: boolean;
  /** PDF pages to leave out (1-based), e.g. a reference list whose titles would cause junk keyword matches. */
  skip_pages?: number[];
}

function loadSourceMeta(): Record<string, SourceMeta> {
  return JSON.parse(readFileSync(join(process.cwd(), "scripts", "knowledge-base-sources.json"), "utf8"));
}

/** Extracts text page by page, keeping line breaks so headings can be detected. */
async function extractPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let lastY: number | undefined;
      let text = "";
      for (const item of content.items) {
        const y = item.transform[5];
        text += lastY === undefined || lastY === y ? item.str : "\n" + item.str;
        lastY = y;
      }
      pages.push(text);
      return text;
    },
  });
  return pages;
}

function parseArgs(): { crop: string; only: string | null; dryRun: boolean } {
  const crop = process.argv.find((a) => a.startsWith("--crop="))?.split("=")[1];
  if (!crop) {
    console.error("Usage: npm run ingest:kb -- --crop=<crop_type> [--only=<file.pdf>] [--dry-run]");
    process.exit(1);
  }
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? null;
  return { crop, only, dryRun: process.argv.includes("--dry-run") };
}

async function embedAll(texts: string[]): Promise<(number[] | undefined)[]> {
  const out: (number[] | undefined)[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await openrouter.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    for (let j = 0; j < batch.length; j++) out.push(res.data[j]?.embedding);
    console.log(`  ...embedded ${Math.min(i + EMBED_BATCH, texts.length)}/${texts.length}`);
  }
  return out;
}

async function main() {
  const { crop, only, dryRun } = parseArgs();
  const cropDir = join(SOURCE_DIR, crop);
  const sources = loadSourceMeta();

  let files: string[];
  try {
    files = readdirSync(cropDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch {
    console.error(`No source directory found at ${cropDir}. Create it and add source PDFs first.`);
    process.exit(1);
  }
  if (only) files = files.filter((f) => f === only);
  if (files.length === 0) {
    console.error(`No matching PDF files found in ${cropDir}.`);
    process.exit(1);
  }

  const missing = files.filter((f) => !sources[f]);
  if (missing.length > 0) {
    console.error(`No metadata in scripts/knowledge-base-sources.json for: ${missing.join(", ")}`);
    process.exit(1);
  }

  const crop_type = crop === "general" ? null : crop;
  const admin = dryRun ? null : createAdminClient();

  for (const file of files) {
    const meta = sources[file];
    const buffer = readFileSync(join(cropDir, file));
    const hash = createHash("sha256").update(buffer).digest("hex");

    if (admin) {
      const { data: existing } = await (admin as any)
        .from("knowledge_base_chunks")
        .select("content_hash")
        .eq("source_file", file)
        .limit(1);
      if (existing?.[0]?.content_hash === hash) {
        console.log(`${file}: unchanged (${hash.slice(0, 8)}), skipping`);
        continue;
      }
    }

    console.log(`${file}: extracting pages...`);
    const skip = new Set(meta.skip_pages ?? []);
    // Blank out skipped pages rather than removing them, so page numbers stay true to the PDF.
    const pages = (await extractPages(buffer)).map((t, i) => (skip.has(i + 1) ? "" : t));
    const chunks: PageChunk[] = chunkPages(pages, undefined, undefined, meta.detect_headings !== false);
    const withHeading = chunks.filter((c) => c.heading).length;
    console.log(`  -> ${pages.length} pages, ${chunks.length} chunks (${withHeading} with a heading)`);

    if (dryRun) {
      for (const c of [chunks[0], chunks[Math.floor(chunks.length / 2)], chunks[chunks.length - 1]]) {
        console.log(`  sample p.${c.page} [${c.heading ?? "no heading"}]: ${c.content.slice(0, 140)}...`);
      }
      continue;
    }

    console.log(`  embedding with ${EMBEDDING_MODEL}...`);
    const embeddings = await embedAll(chunks.map((c) => c.content));

    const rows = chunks.flatMap((c, i) =>
      embeddings[i]
        ? [{
            source_title: meta.title,
            source_section: c.heading,
            page_number: c.page,
            content: c.content,
            crop_type,
            embedding: JSON.stringify(embeddings[i]),
            source_file: file,
            content_hash: hash,
            language: meta.language,
            country: meta.country,
            region: meta.region,
            publisher: meta.publisher,
            authority_type: meta.authority_type,
            regulatory: meta.regulatory,
            variety_applicability: meta.variety_applicability,
            climate_context: meta.climate_context,
            publication_date: meta.publication_date,
            document_version: meta.document_version,
          }]
        : [],
    );
    if (rows.length !== chunks.length) console.warn(`  ${chunks.length - rows.length} chunks got no embedding and were skipped`);

    // Replace this document only, after embedding succeeded, so a failed run
    // never leaves the document missing from the knowledge base.
    const { error: deleteError } = await (admin as any).from("knowledge_base_chunks").delete().eq("source_file", file);
    if (deleteError) {
      console.error(`  Failed to clear previous chunks for ${file}:`, deleteError.message);
      process.exit(1);
    }
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await (admin as any).from("knowledge_base_chunks").insert(rows.slice(i, i + 50));
      if (error) console.error(`  Insert failed for rows ${i}-${i + 50}: ${error.message}`);
      else inserted += Math.min(50, rows.length - i);
    }
    console.log(`  Done. Inserted ${inserted}/${chunks.length} chunks (${meta.language}, ${meta.country ?? "-"}).`);
  }
}

main().catch((e) => {
  console.error("Ingestion failed:", e);
  process.exit(1);
});
