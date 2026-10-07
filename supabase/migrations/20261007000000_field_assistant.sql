-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- FIELD ASSISTANT, PHASE 1: conversations, the event counts behind the daily
-- limits and the operator's figures, and the farm's country for the source rules.
--
-- RUN THIS BEFORE DEPLOYING the app version with the assistant: the drawer
-- reads these tables as soon as it opens.
--
-- WHO SEES WHAT
--   assistant_threads / assistant_messages
--     - a supervisor or admin sees their own conversations on a farm;
--     - a farm admin also sees every conversation on that farm (the drawer says so);
--     - workers, other farms and the platform operator see nothing.
--     Writes go through the server (service role) after requireFarmRole, so there
--     is no INSERT or UPDATE policy. The owner may delete their own thread.
--   assistant_events
--     Counts only (kind, category, time), never text. No client access at all;
--     the server reads it for the daily limits and the operator's counts.
--
-- farms.country is an ISO 3166-1 alpha-2 code, the same form as
-- knowledge_base_chunks.country. A pesticide product or dose is given only from
-- a regulatory source for this country; a farm with no country gets none.

BEGIN;

-- ─── 1. Farm country ─────────────────────────────────────────────────────────
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS country TEXT
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- Existing farms located inside Türkiye's bounding box. Anything else stays
-- NULL until it is set, which only makes the assistant more cautious.
UPDATE public.farms
   SET country = 'TR'
 WHERE country IS NULL
   AND gps_lat BETWEEN 35.8 AND 42.2
   AND gps_lng BETWEEN 25.6 AND 44.9;

-- farms uses column-level grants since 20261006000000_security_hardening.sql.
GRANT SELECT (country) ON public.farms TO authenticated;

-- ─── 2. Conversations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (char_length(title) <= 120),
  -- {blockId?, from?, to?, recommendationId?}, checked against the farm by the server.
  pins             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_farm_user
  ON public.assistant_threads (farm_id, user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_activity
  ON public.assistant_threads (last_activity_at);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  farm_id          UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL CHECK (char_length(content) <= 20000),
  -- [{n, title, section, page, origin}] for the passages the answer cites.
  citations        JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_status TEXT CHECK (reference_status IN ('found', 'no_match', 'none_loaded', 'error')),
  -- [{kind, label}] for the farm records an answer used.
  record_refs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'answer' | 'decline' | 'limit' | 'error'
  kind             TEXT NOT NULL DEFAULT 'answer',
  model            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread
  ON public.assistant_messages (thread_id, created_at);

-- ─── 3. Events (counts only) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL CHECK (kind IN (
               'question', 'unsourced', 'decline', 'retry', 'fallback', 'error',
               'draft_accepted', 'draft_dismissed')),
  category   TEXT CHECK (category IS NULL OR char_length(category) <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_events_farm_time
  ON public.assistant_events (farm_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_events_user_time
  ON public.assistant_events (user_id, kind, created_at DESC);

-- ─── 4. Row-level security ───────────────────────────────────────────────────
ALTER TABLE public.assistant_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_events   ENABLE ROW LEVEL SECURITY;

-- Own conversations while still a supervisor or admin of the farm; a farm admin
-- reads every conversation on the farm. Workers match neither branch.
DROP POLICY IF EXISTS assistant_threads_read ON public.assistant_threads;
CREATE POLICY assistant_threads_read
  ON public.assistant_threads FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid()
      AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
    OR public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[])
  );

DROP POLICY IF EXISTS assistant_threads_delete_own ON public.assistant_threads;
CREATE POLICY assistant_threads_delete_own
  ON public.assistant_threads FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  );

DROP POLICY IF EXISTS assistant_messages_read ON public.assistant_messages;
CREATE POLICY assistant_messages_read
  ON public.assistant_messages FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid()
      AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
    OR public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[])
  );

REVOKE ALL ON public.assistant_threads  FROM anon, authenticated;
REVOKE ALL ON public.assistant_messages FROM anon, authenticated;
REVOKE ALL ON public.assistant_events   FROM anon, authenticated;
GRANT SELECT, DELETE ON public.assistant_threads TO authenticated;
GRANT SELECT ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_threads, public.assistant_messages, public.assistant_events TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- AFTER RUNNING, check in the browser console (supabase client on any farm page):
--   as a WORKER:      supabase.from('assistant_threads').select('*')   → []
--                     supabase.from('assistant_messages').select('*')  → []
--   as a SUPERVISOR:  supabase.from('assistant_threads').select('user_id') → only your own id
--   as a FARM ADMIN:  supabase.from('assistant_threads').select('user_id') → every thread on your farm, none from others
--   as anyone:        supabase.from('assistant_events').select('*')    → permission denied
--                     supabase.from('assistant_threads').insert({ farm_id: myFarm, user_id: myId, title: 'x' }) → permission denied
--                     supabase.from('assistant_messages').update({ content: 'x' }).neq('id', '') → permission denied
--                     supabase.from('farms').select('country')         → your farms only
