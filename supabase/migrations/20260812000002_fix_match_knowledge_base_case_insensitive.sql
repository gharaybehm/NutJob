-- Run this in the Supabase SQL editor.
-- Fix: blocks.crop_type is stored capitalized (e.g. "Almond", "Apple") but
-- the knowledge-base ingestion script tags chunks with the lowercase CLI arg
-- (e.g. "almond"). match_knowledge_base's exact-text crop_type comparison
-- was case-sensitive, so retrieval silently matched zero crop-specific chunks
-- for every real block, falling through to crop-agnostic material only —
-- caught by testing retrieval against actual farm data, not by inspection.

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
  WHERE (filter_crop_type IS NULL OR lower(crop_type) = lower(filter_crop_type) OR crop_type IS NULL)
    AND (filter_category IS NULL OR category = filter_category)
  ORDER BY (crop_type IS NULL), embedding <=> query_embedding
  LIMIT match_count;
$$;
