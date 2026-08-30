/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// One-off developer script: chunks and embeds crop-specific reference PDFs
// (e.g. UC ANR's Almond Production Manual) into knowledge_base_chunks so the
// AI recommendations engine can ground its advice in cited agronomic
// literature instead of relying on the LLM's own unverified knowledge.
//
// Usage:
//   npm run ingest:kb -- --crop=almond
//   npm run ingest:kb -- --crop=general   (crop-agnostic material)
//
// Before running: manually download the source PDFs (this script does not
// fetch them) into ./knowledge-base-source/<crop>/ — e.g. UC ANR Publication
// 3364 chapters and, optionally, related UC IPM pest guideline PDFs for
// ./knowledge-base-source/almond/. For a different crop, use extension
// material of equivalent authority (another land-grant university's
// cooperative extension service) and drop it in its own ./knowledge-base-source/<crop>/
// folder, tagged with that crop's --crop value (matching blocks.crop_type).
//
// Re-running with --crop=<x> replaces only that crop's previously ingested
// chunks — other crops' material is left untouched.

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { createAdminClient } from "../utils/supabase/admin";
import { openrouter } from "../utils/openrouter";

// Next.js loads .env.local automatically; this standalone script does not.
config({ path: join(process.cwd(), ".env.local") });

// Import from the lib sub-path to skip pdf-parse's top-level test-file require()
// — same workaround used in app/api/extract-soil-test/route.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (data: Buffer) => Promise<{ text: string }>;

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_CHARS = 3200; // ~800 tokens
const CHUNK_OVERLAP = 600; // ~150 tokens
const SOURCE_DIR = join(process.cwd(), "knowledge-base-source");


interface Chunk {
  sourceTitle: string;
  sourceSection: string | null;
  content: string;
}

// Detects a heading line like "Chapter 7: Irrigation Management" or "7. Irrigation".
// Numbered *sentences* (e.g. "4. Record your results (example form available
// online).") match the same "digit. Capitalized text" shape as a real numbered
// heading, so require no trailing period — real headings are short labels,
// not complete instructional sentences.
const HEADING_RE = /^(chapter\s+\d+[:.]?\s+[A-Z][^.]{2,79}|\d+\.\s+[A-Z][^.]{3,79})$/im;

function splitIntoSections(text: string): { heading: string | null; body: string }[] {
  const lines = text.split("\n");
  const sections: { heading: string | null; body: string }[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (HEADING_RE.test(line.trim())) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, body: currentLines.join("\n") });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join("\n") });
  }
  return sections.length > 0 ? sections : [{ heading: null, body: text }];
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= size) return cleaned.length > 0 ? [cleaned] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + size, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

function chunkDocument(sourceTitle: string, text: string): Chunk[] {
  const sections = splitIntoSections(text);
  const chunks: Chunk[] = [];
  for (const section of sections) {
    for (const body of chunkText(section.body, CHUNK_CHARS, CHUNK_OVERLAP)) {
      chunks.push({ sourceTitle, sourceSection: section.heading, content: body });
    }
  }
  return chunks;
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text;
}

function parseArgs(): { crop: string } {
  const arg = process.argv.find((a) => a.startsWith("--crop="));
  if (!arg) {
    console.error("Usage: npm run ingest:kb -- --crop=<crop_type>  (e.g. --crop=almond, --crop=general)");
    process.exit(1);
  }
  return { crop: arg.split("=")[1] };
}

async function main() {
  const { crop } = parseArgs();
  const cropDir = join(SOURCE_DIR, crop);

  let files: string[];
  try {
    files = readdirSync(cropDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch {
    console.error(`No source directory found at ${cropDir}. Create it and add source PDFs first.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`No PDF files found in ${cropDir}.`);
    process.exit(1);
  }

  console.log(`Found ${files.length} PDF(s) in ${cropDir}`);

  const allChunks: Chunk[] = [];
  for (const file of files) {
    const filePath = join(cropDir, file);
    console.log(`Extracting text from ${file}...`);
    const text = await extractPdfText(filePath);
    const sourceTitle = file.replace(/\.pdf$/i, "");
    const chunks = chunkDocument(sourceTitle, text);
    console.log(`  -> ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  console.log(`Embedding ${allChunks.length} chunks with ${EMBEDDING_MODEL}...`);
  const admin = createAdminClient();
  const crop_type = crop === "general" ? null : crop;

  const { error: deleteError } = await (admin as any)
    .from("knowledge_base_chunks")
    .delete()
    .filter("crop_type", crop_type === null ? "is" : "eq", crop_type);
  if (deleteError) {
    console.error("Failed to clear previous chunks for this crop:", deleteError.message);
    process.exit(1);
  }

  let inserted = 0;
  for (const chunk of allChunks) {
    const embeddingResponse = await openrouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunk.content,
    });
    const embedding = embeddingResponse.data[0]?.embedding;
    if (!embedding) {
      console.warn(`  Skipping chunk (no embedding returned): "${chunk.content.slice(0, 60)}..."`);
      continue;
    }

    const { error: insertError } = await (admin as any).from("knowledge_base_chunks").insert({
      source_title: chunk.sourceTitle,
      source_section: chunk.sourceSection,
      content: chunk.content,
      crop_type,
      embedding: JSON.stringify(embedding),
    });
    if (insertError) {
      console.error(`  Insert failed for chunk: ${insertError.message}`);
      continue;
    }
    inserted++;
    if (inserted % 20 === 0) console.log(`  ...${inserted}/${allChunks.length} inserted`);
  }

  console.log(`Done. Inserted ${inserted}/${allChunks.length} chunks for crop_type=${crop_type ?? "NULL (general)"}.`);
}

main().catch((e) => {
  console.error("Ingestion failed:", e);
  process.exit(1);
});
