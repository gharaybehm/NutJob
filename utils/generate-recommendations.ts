/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase admin client shared with build-block-context */
// Shared AI recommendation generation: retrieval (RAG) + prompt assembly +
// OpenRouter call + parse/validate/insert. Used by both the weekly
// Coolify cron (app/api/cron/generate-recommendations) and the on-demand server
// action (app/[farmId]/(dashboard)/recommendations/actions.ts) so the
// generation logic — including grounding recommendations in the
// crop-appropriate knowledge base — lives in one place.

import { AI_SYSTEM_PROMPT, buildAllBlockContexts } from "@/utils/build-block-context";
import { openrouter } from "@/utils/openrouter";
import { expandQuery, selectChunks } from "@/utils/kb-retrieval";
import { knowledgeBaseCrop } from "@/utils/crops";
import { varietyScope } from "@/utils/kb-coverage";
import { isPlaceholder } from "@/utils/plant-catalog";
// re-exported for existing callers
export { openrouter };


export const OPENROUTER_MODEL = "google/gemini-2.5-flash";
export const EMBEDDING_MODEL = "text-embedding-3-small";
// Empirically calibrated against text-embedding-3-small cosine similarity on
// this corpus: paragraph-length prose matched against short synthesized
// queries clusters much lower than short-text-to-short-text similarity (a
// strong, on-topic match scores ~0.6-0.76, not 0.9+). 0.5 filters out
// off-topic noise while still admitting genuinely relevant chunks.
const MIN_SIMILARITY = 0.5;
const CHUNKS_PER_BLOCK = 4;

const VALID_CATEGORIES = new Set(["irrigate", "fertilize", "spray", "scout", "prune", "other"]);

interface SupabaseAdminLike {
  from: (table: string) => any;
  rpc: (fn: any, args: Record<string, unknown>) => any;
}

export interface RetrievedChunk {
  content: string;
  source_title: string;
  source_section: string | null;
  page_number?: number | null;
  crop_type?: string | null;
  variety_applicability?: string[] | null;
  language?: string | null;
  country?: string | null;
  region?: string | null;
  publisher?: string | null;
  authority_type?: string | null;
  regulatory?: boolean | null;
  climate_context?: string | null;
  publication_date?: string | null;
  similarity: number;
  keyword_hit?: boolean | null;
  rrf_score?: number | null;
}

/**
 * One-line origin label so the model (and the manager reading its citation) can
 * see where a passage comes from. The farm is in Türkiye; most of the corpus is
 * Spanish or Californian, and the plan requires a recommendation to say so when
 * it rests on a non-local source.
 */
export function describeChunkOrigin(c: RetrievedChunk): string {
  const parts: string[] = [];
  if (c.publisher) parts.push(c.publisher);
  const place = [c.country, c.region].filter(Boolean).join("/");
  if (place) parts.push(place);
  if (c.publication_date) parts.push(c.publication_date.slice(0, 4));
  if (c.language) parts.push(`language: ${c.language}`);
  if (c.climate_context) parts.push(`climate: ${c.climate_context}`);
  // A document about named varieties only: say which, so it is not read as advice for the whole crop.
  if (varietyScope(c.variety_applicability, null) === "other") parts.push(`applies to: ${c.variety_applicability!.join(", ")}`);
  parts.push(c.regulatory ? "regulatory source" : "not a regulatory source for this farm");
  return parts.join("; ");
}

/**
 * What the knowledge-base lookup found for a block, kept on each recommendation
 * so a card with no citation can say why:
 * - `found`: passages were given to the model.
 * - `no_match`: the crop has documents, but none was relevant enough.
 * - `none_loaded`: no document is loaded for the crop.
 * - `error`: the lookup failed, so nothing is known about coverage.
 */
export type ReferenceStatus = "found" | "no_match" | "none_loaded" | "error";

export interface ReferenceLookup {
  chunks: RetrievedChunk[];
  status: ReferenceStatus;
}

/** The chunks alone, for callers that do not need the outcome (scripts/test-kb-retrieval.ts). */
export async function retrieveReferenceChunks(
  admin: SupabaseAdminLike,
  queryText: string,
  cropType: string | null,
  matchCount = CHUNKS_PER_BLOCK
): Promise<RetrievedChunk[]> {
  return (await lookUpReferences(admin, queryText, cropType, matchCount)).chunks;
}

/**
 * Embeds `queryText` and returns the top matching knowledge-base chunks for the
 * crop, with the outcome of the lookup. `variety`, when the block has one, keeps
 * out documents about other varieties only (see selectChunks).
 */
export async function lookUpReferences(
  admin: SupabaseAdminLike,
  queryText: string,
  cropType: string | null,
  matchCount = CHUNKS_PER_BLOCK,
  variety: string | null = null
): Promise<ReferenceLookup> {
  try {
    // Spanish/Latin terms help the embedding find the Spanish MAPA guide, and the
    // specific pest names also drive an exact keyword search (hybrid retrieval).
    const { embeddingText, keywords } = expandQuery(queryText);
    const embeddingResponse = await openrouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: embeddingText,
    });
    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) return { chunks: [], status: "error" };

    let candidates: RetrievedChunk[];
    let chunks: RetrievedChunk[];

    const hybrid = await admin.rpc("match_knowledge_base_hybrid", {
      query_embedding: JSON.stringify(queryEmbedding),
      keywords,
      match_count: matchCount * 3,
      filter_crop_type: cropType,
    });
    if (!hybrid.error && hybrid.data) {
      candidates = hybrid.data as RetrievedChunk[];
      chunks = selectChunks(candidates, matchCount, MIN_SIMILARITY, keywords.length > 0, variety);
    } else {
      // Hybrid function not deployed yet (migration pending): fall back to vector-only search.
      const { data, error } = await admin.rpc("match_knowledge_base", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: matchCount,
        filter_crop_type: cropType,
      });
      if (error || !data) return { chunks: [], status: "error" };
      candidates = data as RetrievedChunk[];
      chunks = candidates.filter(
        (c) => c.similarity >= MIN_SIMILARITY && (isPlaceholder(variety) || varietyScope(c.variety_applicability, variety) !== "other")
      );
    }

    if (chunks.length > 0) return { chunks, status: "found" };
    // The search also returns crop-agnostic material, so only a candidate stored
    // under a crop shows that this crop has documents.
    return { chunks, status: candidates.some((c) => c.crop_type) ? "no_match" : "none_loaded" };
  } catch (e) {
    // Retrieval is a best-effort enhancement — never block recommendation generation on it.
    console.error("[recommendations] Knowledge-base lookup failed, continuing without reference material:", e);
    return { chunks: [], status: "error" };
  }
}

/** Builds a short retrieval query from a block's known signals, without an extra LLM call. */
function synthesizeBlockQuery(block: any, activeAlerts: any[], phenology: any): string {
  const parts: string[] = [];
  if (block.crop_type) parts.push(block.crop_type);
  if (block.variety) parts.push(block.variety);
  if (phenology?.current_stage) parts.push(phenology.current_stage);
  for (const a of activeAlerts) {
    if (a.domain) parts.push(a.domain);
    if (a.message) parts.push(a.message);
  }
  return parts.join(" ") || `${block.crop_type ?? "general"} crop management`;
}

/** Formats retrieved chunks as a REFERENCE MATERIAL section to append to a block's context. */
function formatReferenceSection(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const lines = chunks.map((c, i) => {
    const where = [c.source_section, c.page_number ? `p. ${c.page_number}` : null].filter(Boolean).join(", ");
    return `[${i + 1}] ${c.source_title}${where ? ` — ${where}` : ""} (${describeChunkOrigin(c)}): "${c.content}"`;
  });
  return `\n\n=== REFERENCE MATERIAL ===\n${lines.join("\n\n")}`;
}

/**
 * Retrieves crop-appropriate reference material for every block and appends it to
 * each block's section of `blockContexts`. Blocks are separated by "\n\n---\n\n"
 * (see buildAllBlockContexts) so we split, augment, and rejoin rather than
 * threading retrieval into that function's already-dense body. Also returns what
 * the lookup found for each block.
 */
async function augmentWithRAGContext(
  admin: SupabaseAdminLike,
  blockContexts: string,
  blocks: any[]
): Promise<{ contexts: string; statusByBlock: Map<string, ReferenceStatus> }> {
  const sections = blockContexts.split("\n\n---\n\n");

  const { data: alerts } = await admin.from("block_alerts").select("*").eq("resolved", false);
  const { data: phenologyRecords } = await admin.from("phenology_latest").select("*");

  const alertsByBlock = new Map<string, any[]>();
  alerts?.forEach((a: any) => {
    if (!alertsByBlock.has(a.block_id)) alertsByBlock.set(a.block_id, []);
    alertsByBlock.get(a.block_id)!.push(a);
  });
  const phenologyByBlock = new Map<string, any>();
  phenologyRecords?.forEach((p: any) => {
    if (p.block_id) phenologyByBlock.set(p.block_id, p);
  });

  const augmented = await Promise.all(
    blocks.map(async (block, i) => {
      const section = sections[i] ?? "";
      const query = synthesizeBlockQuery(
        block,
        alertsByBlock.get(block.id) ?? [],
        phenologyByBlock.get(block.id)
      );
      // blocks.crop_type is stored capitalized (e.g. "Almond"); the RPC does a
      // case-insensitive compare, but normalize here too for consistency.
      // "Almond", "badem" and "almendro" all find the almond documents.
      const cropType = knowledgeBaseCrop(block.crop_type);
      const { chunks, status } = await lookUpReferences(admin, query, cropType, CHUNKS_PER_BLOCK, block.variety ?? null);
      return { section: section + formatReferenceSection(chunks), status };
    })
  );

  return {
    contexts: augmented.map((a) => a.section).join("\n\n---\n\n"),
    statusByBlock: new Map(blocks.map((b, i) => [b.id as string, augmented[i].status])),
  };
}

function parseRecommendationsJSON(raw: string): Record<string, unknown>[] {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  let parsed: unknown = JSON.parse(clean);
  if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
    const firstArray = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (firstArray) parsed = firstArray;
  }
  if (!Array.isArray(parsed)) throw new Error("Parsed output is not an array");
  return parsed as Record<string, unknown>[];
}

interface RecommendationSource {
  title: string;
  section: string | null;
}

function normalizeSources(value: unknown): RecommendationSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      section: typeof s.section === "string" ? s.section : null,
    }))
    .filter((s) => s.title.length > 0);
}

export interface GenerateFarmRecommendationsOptions {
  systemPromptSuffix?: string;
}

export interface GenerateFarmRecommendationsResult {
  count: number;
  model: string;
}

/**
 * Full generation pipeline for one farm: fetch block context, retrieve
 * crop-appropriate reference material per block, call the LLM, validate its
 * output, and insert new recommendation rows (including citations).
 * Throws on unrecoverable errors (missing blocks, unparseable AI output,
 * insert failure) so callers can decide how to surface/log them.
 */
export async function generateFarmRecommendations(
  admin: SupabaseAdminLike,
  farmId: string,
  options: GenerateFarmRecommendationsOptions = {}
): Promise<GenerateFarmRecommendationsResult> {
  const today = new Date().toISOString().split("T")[0];

  const { blockContexts, blockIds } = await buildAllBlockContexts(admin, farmId);
  if (blockIds.length === 0) throw new Error("No blocks found for this farm");

  const { data: blocks } = await admin
    .from("blocks")
    .select("id, crop_type, variety")
    .eq("farm_id", farmId);

  const orderedBlocks = blockIds.map(
    (id) => blocks?.find((b: any) => b.id === id) ?? { id, crop_type: null, variety: null }
  );

  const { contexts: ragBlockContexts, statusByBlock } = await augmentWithRAGContext(admin, blockContexts, orderedBlocks);

  const systemPrompt = AI_SYSTEM_PROMPT + (options.systemPromptSuffix ?? "");

  const response = await openrouter.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Today: ${today}\n\nFarm data:\n\n${ragBlockContexts}\n\nGenerate prioritised recommendations.`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content ?? "[]";

  let parsed: Record<string, unknown>[];
  try {
    parsed = parseRecommendationsJSON(raw);
  } catch (e) {
    throw new Error(`AI returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }

  const validBlockIds = new Set(blockIds);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const toInsert = parsed
    .filter(
      (r) =>
        typeof r.block_id === "string" && validBlockIds.has(r.block_id) &&
        typeof r.category === "string" && VALID_CATEGORIES.has(r.category) &&
        typeof r.title === "string" && r.title.length > 0 &&
        typeof r.rationale === "string" && r.rationale.length > 0
    )
    .map((r) => ({
      farm_id: farmId,
      block_id: r.block_id as string,
      category: r.category as any,
      title: (r.title as string).slice(0, 200),
      rationale: r.rationale as string,
      confidence: Math.min(1, Math.max(0, (Number(r.confidence) || 75) / 100)),
      status: "pending" as const,
      llm_model: OPENROUTER_MODEL,
      expires_at: expiresAt,
      sources: normalizeSources(r.sources),
      reference_status: statusByBlock.get(r.block_id as string) ?? null,
    }));

  if (toInsert.length === 0) {
    return { count: 0, model: OPENROUTER_MODEL };
  }

  // The cards still open from earlier runs, read before the insert so the new batch is not among them.
  const { data: openRows } = await admin
    .from("recommendations")
    .select("id")
    .eq("farm_id", farmId)
    .eq("status", "pending");

  let { error: insertError } = await admin.from("recommendations").insert(toInsert);
  if (insertError && /reference_status/.test(insertError.message ?? "")) {
    // Column not there yet (migration pending): keep the run working, without the status.
    const withoutStatus = toInsert.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      delete copy.reference_status;
      return copy;
    });
    ({ error: insertError } = await admin.from("recommendations").insert(withoutStatus));
  }
  if (insertError) throw new Error(`Insert error: ${insertError.message}`);

  // The new batch replaces them. The model saw them as NOT ACTED ON and re-issued
  // the ones still needed. They are expired, not deleted, so History and the next
  // run's context keep them. The status check leaves alone any accepted meanwhile.
  const openIds = ((openRows as { id: string }[] | null) ?? []).map((r) => r.id);
  if (openIds.length > 0) {
    const { error: supersedeError } = await admin
      .from("recommendations")
      .update({ expires_at: new Date().toISOString() })
      .in("id", openIds)
      .eq("status", "pending");
    // The new batch is already in; a failure here only leaves old cards until their own expiry.
    if (supersedeError) console.error(`[recommendations] Failed to expire the previous batch: ${supersedeError.message}`);
  }

  return { count: toInsert.length, model: OPENROUTER_MODEL };
}
