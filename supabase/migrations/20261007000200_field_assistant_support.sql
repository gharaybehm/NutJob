-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- FIELD ASSISTANT, PHASE 3: share a conversation with support, and the
-- operator's counts.
--
-- RUN THIS BEFORE DEPLOYING the Phase 3 app version.
--
-- WHO SEES WHAT
--   The platform operator is not a farm member and sees no conversation text,
--   with one exception: a conversation its owner chose to share with support.
--   - assistant_shares: one row per share. Live while revoked_at is null and
--     expires_at is in the future (14 days by default). The owner sees their
--     own shares; writes go through the server after the owner check.
--   - assistant_share_views: one row each time the operator opens a shared
--     conversation. No client access: the server writes it before showing
--     the conversation, and nobody can edit or delete it from the browser.
--   - The operator reads a shared conversation through the server (service
--     role) after the super_admin check and the share check; there is no RLS
--     path for the operator into assistant_messages.
--   - assistant_events gains share_created, share_withdrawn and share_viewed,
--     so shares and views also show in the counts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  farm_id    UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  shared_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  revoked_at TIMESTAMPTZ
);

-- At most one share not withdrawn per conversation (sharing again replaces it).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assistant_shares_open
  ON public.assistant_shares (thread_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assistant_shares_expiry
  ON public.assistant_shares (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.assistant_share_views (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id  UUID NOT NULL REFERENCES public.assistant_shares(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_share_views_share
  ON public.assistant_share_views (share_id, viewed_at DESC);

ALTER TABLE public.assistant_shares      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_share_views ENABLE ROW LEVEL SECURITY;

-- The owner sees their own shares while still a supervisor or admin of the farm.
DROP POLICY IF EXISTS assistant_shares_read_own ON public.assistant_shares;
CREATE POLICY assistant_shares_read_own
  ON public.assistant_shares FOR SELECT TO authenticated
  USING (
    shared_by = auth.uid()
    AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  );

REVOKE ALL ON public.assistant_shares      FROM anon, authenticated;
REVOKE ALL ON public.assistant_share_views FROM anon, authenticated;
GRANT SELECT ON public.assistant_shares TO authenticated;
GRANT ALL ON public.assistant_shares, public.assistant_share_views TO service_role;

ALTER TABLE public.assistant_events DROP CONSTRAINT IF EXISTS assistant_events_kind_check;
ALTER TABLE public.assistant_events
  ADD CONSTRAINT assistant_events_kind_check CHECK (kind IN (
    'question', 'unsourced', 'decline', 'retry', 'fallback', 'error',
    'draft_accepted', 'draft_dismissed', 'guides_requested',
    'share_created', 'share_withdrawn', 'share_viewed'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- AFTER RUNNING, in the browser console (supabase client on any farm page):
--   as anyone:   supabase.from('assistant_share_views').select('*')               → permission denied
--                supabase.from('assistant_shares').insert({ thread_id: '…', farm_id: '…', shared_by: myId }) → permission denied
--                supabase.from('assistant_shares').update({ expires_at: '2099-01-01' }).neq('id', '') → permission denied
--   as a WORKER: supabase.from('assistant_shares').select('*')                    → []
