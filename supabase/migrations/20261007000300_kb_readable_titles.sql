-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- DATA FIX: two knowledge-base guides were loaded with their file name as the
-- title, so every citation showed "uc-ipm-almond-pmg" and
-- "geisseler-horwath-almond-nutrient-mgmt". The titles below are the ones in
-- scripts/knowledge-base-sources.json, which a re-ingest would also use.
--
-- Recommendation cards and assistant answers keep a copy of each source's
-- title, so those copies are renamed too. Nothing else changes. Safe to run
-- more than once.

BEGIN;

CREATE TEMP TABLE kb_title_fix (old_title TEXT PRIMARY KEY, new_title TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO kb_title_fix VALUES
  ('uc-ipm-almond-pmg', 'UC IPM Almond Pest Management Guidelines'),
  ('geisseler-horwath-almond-nutrient-mgmt', 'Almond Nutrient Management (Geisseler & Horwath)');

-- 1. The guide chunks.
UPDATE public.knowledge_base_chunks k
   SET source_title = f.new_title
  FROM kb_title_fix f
 WHERE k.source_title = f.old_title;

-- 2. Sources saved on recommendation cards ([{title, section}]).
UPDATE public.recommendations r
   SET sources = (
     SELECT jsonb_agg(
              CASE WHEN f.new_title IS NOT NULL THEN jsonb_set(e, '{title}', to_jsonb(f.new_title)) ELSE e END
              ORDER BY ord)
       FROM jsonb_array_elements(r.sources::jsonb) WITH ORDINALITY AS t(e, ord)
       LEFT JOIN kb_title_fix f ON f.old_title = e->>'title'
   )
 WHERE jsonb_typeof(r.sources::jsonb) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(r.sources::jsonb) e
      JOIN kb_title_fix f ON f.old_title = e->>'title'
   );

-- 3. Citations saved on assistant answers ([{n, title, section, page, origin}]).
UPDATE public.assistant_messages m
   SET citations = (
     SELECT jsonb_agg(
              CASE WHEN f.new_title IS NOT NULL THEN jsonb_set(e, '{title}', to_jsonb(f.new_title)) ELSE e END
              ORDER BY ord)
       FROM jsonb_array_elements(m.citations) WITH ORDINALITY AS t(e, ord)
       LEFT JOIN kb_title_fix f ON f.old_title = e->>'title'
   )
 WHERE jsonb_typeof(m.citations) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(m.citations) e
      JOIN kb_title_fix f ON f.old_title = e->>'title'
   );

COMMIT;

-- AFTER RUNNING, both queries should return no rows:
--   SELECT DISTINCT source_title FROM public.knowledge_base_chunks
--    WHERE source_title IN ('uc-ipm-almond-pmg', 'geisseler-horwath-almond-nutrient-mgmt');
--   SELECT id FROM public.recommendations
--    WHERE sources::text LIKE '%uc-ipm-almond-pmg%' OR sources::text LIKE '%geisseler-horwath-almond-nutrient-mgmt%';
