-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- FIELD ASSISTANT, PHASE 2: draft cards and "Request guides".
--
-- RUN THIS BEFORE DEPLOYING the Phase 2 app version. Every change is additive
-- (new columns with defaults, a relaxed unique constraint), so the version
-- running now keeps working after it.
--
-- 1. recommendations.origin: 'weekly' (the scheduled run, every existing row)
--    or 'assistant' (a draft card accepted or dismissed in the assistant). An
--    assistant row is written as accepted, edited or skipped, never pending, so
--    the weekly run's expiry of pending cards never touches it.
--    assistant_message_id + draft_index tie the row to its draft; the unique
--    index makes a second accept of the same draft fail in the database.
-- 2. assistant_messages: the validated draft cards of an answer, what became
--    of each, and which crop and variety the answer's guides were searched for.
-- 3. knowledge_requests: questions from the assistant. A question about a gap
--    is added to the farm's one request for that gap (questions); a question
--    the loaded guides did not cover is its own row of kind 'question', which
--    the platform operator closes by hand. One request per farm per gap still
--    holds, now as a partial unique index on kind = 'gap'.
-- 4. assistant_events: a 'guides_requested' kind for the operator's counts.

BEGIN;

-- ─── 1. Recommendations from the assistant ───────────────────────────────────
ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS assistant_message_id UUID REFERENCES public.assistant_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_index SMALLINT;

ALTER TABLE public.recommendations DROP CONSTRAINT IF EXISTS recommendations_origin_check;
ALTER TABLE public.recommendations
  ADD CONSTRAINT recommendations_origin_check CHECK (origin IN ('weekly', 'assistant'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_recommendations_assistant_draft
  ON public.recommendations (assistant_message_id, draft_index)
  WHERE assistant_message_id IS NOT NULL;

-- ─── 2. Draft cards on assistant answers ─────────────────────────────────────
ALTER TABLE public.assistant_messages
  ADD COLUMN IF NOT EXISTS drafts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_states JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS search_scope JSONB;

-- ─── 3. Questions on knowledge requests ──────────────────────────────────────
ALTER TABLE public.knowledge_requests
  ADD COLUMN IF NOT EXISTS kind      TEXT NOT NULL DEFAULT 'gap',
  ADD COLUMN IF NOT EXISTS origin    TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS question  TEXT;

ALTER TABLE public.knowledge_requests DROP CONSTRAINT IF EXISTS knowledge_requests_kind_check;
ALTER TABLE public.knowledge_requests DROP CONSTRAINT IF EXISTS knowledge_requests_origin_check;
ALTER TABLE public.knowledge_requests DROP CONSTRAINT IF EXISTS knowledge_requests_question_check;
ALTER TABLE public.knowledge_requests
  ADD CONSTRAINT knowledge_requests_kind_check CHECK (kind IN ('gap', 'question')),
  ADD CONSTRAINT knowledge_requests_origin_check CHECK (origin IN ('manual', 'assistant')),
  ADD CONSTRAINT knowledge_requests_question_check CHECK (question IS NULL OR char_length(question) <= 2000);

-- The old table-wide UNIQUE (farm_id, crop_key, variety_key), whatever its name.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.knowledge_requests'::regclass
       AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.knowledge_requests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_knowledge_requests_gap
  ON public.knowledge_requests (farm_id, crop_key, variety_key)
  WHERE kind = 'gap';

-- ─── 4. Event kinds ──────────────────────────────────────────────────────────
ALTER TABLE public.assistant_events DROP CONSTRAINT IF EXISTS assistant_events_kind_check;
ALTER TABLE public.assistant_events
  ADD CONSTRAINT assistant_events_kind_check CHECK (kind IN (
    'question', 'unsourced', 'decline', 'retry', 'fallback', 'error',
    'draft_accepted', 'draft_dismissed', 'guides_requested'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- AFTER RUNNING, check in the SQL editor:
--   SELECT origin, count(*) FROM public.recommendations GROUP BY 1;          → only 'weekly'
--   SELECT kind, origin, count(*) FROM public.knowledge_requests GROUP BY 1, 2; → 'gap', 'manual'
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('recommendations', 'knowledge_requests')
--     AND indexname LIKE 'uniq_%';                                           → both new indexes
-- and in the browser console, signed in as a WORKER:
--   supabase.from('assistant_messages').select('drafts')                    → []
