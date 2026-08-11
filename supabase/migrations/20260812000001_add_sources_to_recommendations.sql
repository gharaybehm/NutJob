-- Run this in the Supabase SQL editor.
-- Adds a citation field so AI recommendations grounded via RAG (see
-- 20260812000000_add_rag_knowledge_base.sql) can show the farm manager which
-- source(s) they were drawn from. jsonb (not text[]) because each citation is
-- structured — [{ "title": "...", "section": "..." }] — matching what the
-- LLM emits and what the UI renders. Nullable: non-RAG paths (mock
-- recommendations, or recommendations generated with no relevant retrieval
-- hits) simply omit it.

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS sources JSONB;
