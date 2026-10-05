-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
-- Knowledge-base coverage: makes it visible which crops and varieties have
-- documents loaded, and why a recommendation carries no citation.
--
-- Why: a crop or variety with no documents still gets recommendations, written
-- from the model's own knowledge. Nothing in the app showed that, and a failed
-- lookup looked the same as an empty knowledge base.
--
-- The app works before this is applied: coverage shows as "could not be read"
-- and new recommendations are saved without the status.

-- One row per ingested document, so the app can list what is loaded without
-- reading every chunk. Rows ingested before source_file existed are keyed by title.
CREATE OR REPLACE VIEW public.knowledge_base_documents
WITH (security_invoker = true) AS
SELECT DISTINCT ON (COALESCE(source_file, source_title))
  COALESCE(source_file, source_title) AS source_file,
  source_title,
  crop_type,
  variety_applicability,
  language,
  country,
  publisher,
  publication_date
FROM public.knowledge_base_chunks
ORDER BY COALESCE(source_file, source_title);

-- Same audience as the chunks themselves (published literature, not farm data).
GRANT SELECT ON public.knowledge_base_documents TO authenticated, service_role;

-- What the knowledge-base lookup found for the block when the recommendation
-- was generated. Null on rows from before this migration.
ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS reference_status TEXT;

ALTER TABLE public.recommendations
  DROP CONSTRAINT IF EXISTS recommendations_reference_status_check;
ALTER TABLE public.recommendations
  ADD CONSTRAINT recommendations_reference_status_check
  CHECK (reference_status IN ('found', 'no_match', 'none_loaded', 'error'));

-- Make the API see the new column and view straight away.
NOTIFY pgrst, 'reload schema';
