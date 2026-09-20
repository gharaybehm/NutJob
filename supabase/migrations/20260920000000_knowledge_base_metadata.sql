-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
-- Adds source metadata to the knowledge base so every retrieved passage can be
-- labelled with where it came from: language, country, publisher, authority
-- type, and whether it is a regulatory source. The farm is in Türkiye and the
-- corpus is mostly Spanish and Californian, so the AI must be able to say
-- "this rests on a non-Turkish source" (plan §12, §13, §20).
--
-- Also adds source_file (the ingest key, so a re-ingest replaces exactly one
-- document) and content_hash (SHA-256 of the source PDF, so an unchanged
-- document is never re-embedded, plan §15).

ALTER TABLE public.knowledge_base_chunks
  ADD COLUMN IF NOT EXISTS source_file TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS authority_type TEXT,
  ADD COLUMN IF NOT EXISTS regulatory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variety_applicability TEXT[],
  ADD COLUMN IF NOT EXISTS climate_context TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS document_version TEXT;

ALTER TABLE public.knowledge_base_chunks
  DROP CONSTRAINT IF EXISTS knowledge_base_chunks_language_check;
ALTER TABLE public.knowledge_base_chunks
  ADD CONSTRAINT knowledge_base_chunks_language_check
  CHECK (language IN ('en', 'es', 'tr', 'ar'));

-- Everything ingested before this migration is University of California
-- material (UC ANR / UC IPM / UC Davis), in English, from a California climate.
-- source_title was the PDF filename, which is the ingest key.
UPDATE public.knowledge_base_chunks
SET source_file    = source_title,
    country        = 'US',
    region         = 'California',
    authority_type = 'university_extension',
    climate_context = 'California Central Valley'
WHERE source_file IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_source_file
  ON public.knowledge_base_chunks (source_file);

-- Return type changes, so the function must be dropped and recreated.
DROP FUNCTION IF EXISTS public.match_knowledge_base(VECTOR, INT, TEXT, TEXT);

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
  language TEXT,
  country TEXT,
  region TEXT,
  publisher TEXT,
  authority_type TEXT,
  regulatory BOOLEAN,
  variety_applicability TEXT[],
  climate_context TEXT,
  publication_date DATE,
  similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, source_title, source_section, source_url, page_number, content, crop_type,
    language, country, region, publisher, authority_type, regulatory,
    variety_applicability, climate_context, publication_date,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base_chunks
  WHERE (filter_crop_type IS NULL OR lower(crop_type) = lower(filter_crop_type) OR crop_type IS NULL)
    AND (filter_category IS NULL OR category = filter_category)
  ORDER BY (crop_type IS NULL), embedding <=> query_embedding
  LIMIT match_count;
$$;
