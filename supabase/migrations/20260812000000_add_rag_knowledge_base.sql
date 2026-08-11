-- Run this in the Supabase SQL editor.
-- Adds a crop-aware knowledge base for grounding AI recommendations in real
-- agronomic literature (starting with the UC ANR almond production manual),
-- instead of relying solely on the LLM's unverified training knowledge.
--
-- Chunks are tagged with crop_type (matching blocks.crop_type, e.g. "almond")
-- so a farm growing a different crop only retrieves relevant material, with
-- crop_type IS NULL reserved for crop-agnostic reference content. Populated
-- via `npm run ingest:kb -- --crop=<crop_type>`, not through this migration.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_title TEXT NOT NULL,
  source_section TEXT,
  source_url TEXT,
  page_number INT,
  content TEXT NOT NULL,
  category TEXT,
  crop_type TEXT,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_embedding
  ON public.knowledge_base_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_crop_type
  ON public.knowledge_base_chunks (crop_type);

ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- Reference material isn't farm-scoped data — any authenticated user can read
-- it (it's just published agronomic literature); writes go through the
-- service-role ingestion script only.
CREATE POLICY "authenticated_read_knowledge_base"
  ON public.knowledge_base_chunks FOR SELECT
  TO authenticated
  USING (true);

-- Cosine-similarity search, preferring crop-specific chunks over crop-agnostic
-- ones when filter_crop_type is given, falling back to general material if a
-- crop has no ingested corpus yet.
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter_crop_type TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_title TEXT,
  source_section TEXT,
  source_url TEXT,
  page_number INT,
  content TEXT,
  crop_type TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, source_title, source_section, source_url, page_number, content, crop_type,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base_chunks
  WHERE (filter_crop_type IS NULL OR crop_type = filter_crop_type OR crop_type IS NULL)
    AND (filter_category IS NULL OR category = filter_category)
  ORDER BY (crop_type IS NULL), embedding <=> query_embedding
  LIMIT match_count;
$$;
