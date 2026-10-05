-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
-- Requests for knowledge-base guides: a farm's supervisor or admin asks the
-- platform admin to load guides for a crop or variety that has none.
--
-- Why: guides are added by the platform admin, not by the farm. A farm growing
-- something uncovered had no way to say so, and the admin no way to see demand.
--
-- The app works before this is applied: the request button stays hidden.

CREATE TABLE IF NOT EXISTS public.knowledge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- As typed on the block, for display.
  crop_type TEXT NOT NULL,
  variety TEXT,
  -- Normalised by the app (utils/crops.ts knowledgeBaseCrop, utils/plant-catalog.ts
  -- optionKey), so "Elma" and "Apples" are one crop and "Vairo®" is "vairo".
  -- variety_key is '' for a request about the whole crop.
  crop_key TEXT NOT NULL,
  variety_key TEXT NOT NULL DEFAULT '',
  note TEXT,
  link TEXT,
  -- Set by the platform admin. A request whose guides are loaded needs no status:
  -- the app sees the documents and stops showing the gap.
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'declined')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One request per farm for a crop and variety; asking again updates it.
  UNIQUE (farm_id, crop_key, variety_key)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_requests_keys
  ON public.knowledge_requests (crop_key, variety_key);

DROP TRIGGER IF EXISTS set_knowledge_requests_updated_at ON public.knowledge_requests;
CREATE TRIGGER set_knowledge_requests_updated_at
  BEFORE UPDATE ON public.knowledge_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.knowledge_requests ENABLE ROW LEVEL SECURITY;

-- A farm sees its own requests. Writes go through server actions that use the
-- service-role client after checking the caller's role, so there is no write
-- policy: a member cannot set the admin's status or note from the browser.
DROP POLICY IF EXISTS farm_members_read_knowledge_requests ON public.knowledge_requests;
CREATE POLICY farm_members_read_knowledge_requests
  ON public.knowledge_requests FOR SELECT
  TO authenticated
  USING (public.is_farm_member(farm_id));

GRANT SELECT ON public.knowledge_requests TO authenticated;
GRANT ALL ON public.knowledge_requests TO service_role;

-- Make the API see the new table straight away.
NOTIFY pgrst, 'reload schema';
