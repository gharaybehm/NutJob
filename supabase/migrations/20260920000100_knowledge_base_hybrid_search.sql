-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
-- Hybrid retrieval: vector similarity fused with keyword search.
--
-- Why: embeddings alone are weak on Latin pest names (Monilinia, Capnodis,
-- Polystigma) and English queries systematically favour English chunks over
-- the Spanish MAPA guide. Exact keywords find those reliably in any language.
-- Results are fused with reciprocal rank fusion (RRF). A chunk that matches a
-- keyword is returned even when its cosine similarity is low.

ALTER TABLE public.knowledge_base_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_tsv
  ON public.knowledge_base_chunks USING gin (content_tsv);

CREATE OR REPLACE FUNCTION public.match_knowledge_base_hybrid(
  query_embedding VECTOR(1536),
  keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  match_count INT DEFAULT 12,
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
  similarity FLOAT,
  keyword_hit BOOLEAN,
  rrf_score FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM public.knowledge_base_chunks c
    WHERE (filter_crop_type IS NULL OR lower(c.crop_type) = lower(filter_crop_type) OR c.crop_type IS NULL)
      AND (filter_category IS NULL OR c.category = filter_category)
  ),
  vec AS (
    SELECT b.id, row_number() OVER (ORDER BY b.embedding <=> query_embedding) AS rk
    FROM base b
    ORDER BY b.embedding <=> query_embedding
    LIMIT 30
  ),
  kw AS (
    SELECT b.id, row_number() OVER (ORDER BY ts_rank(b.content_tsv, q.query) DESC) AS rk
    FROM base b, to_tsquery('simple', array_to_string(keywords, ' | ')) AS q(query)
    WHERE cardinality(keywords) > 0 AND b.content_tsv @@ q.query
    ORDER BY ts_rank(b.content_tsv, q.query) DESC
    LIMIT 30
  ),
  ids AS (
    SELECT vec.id FROM vec UNION SELECT kw.id FROM kw
  )
  SELECT
    b.id, b.source_title, b.source_section, b.source_url, b.page_number, b.content, b.crop_type,
    b.language, b.country, b.region, b.publisher, b.authority_type, b.regulatory,
    b.variety_applicability, b.climate_context, b.publication_date,
    1 - (b.embedding <=> query_embedding) AS similarity,
    (kw.id IS NOT NULL) AS keyword_hit,
    COALESCE(1.0 / (60 + vec.rk), 0) + COALESCE(1.0 / (60 + kw.rk), 0) AS rrf_score
  FROM ids
  JOIN base b ON b.id = ids.id
  LEFT JOIN vec ON vec.id = ids.id
  LEFT JOIN kw ON kw.id = ids.id
  ORDER BY rrf_score DESC
  LIMIT match_count;
$$;
