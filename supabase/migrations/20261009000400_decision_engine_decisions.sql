-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261009000300_decision_engine_plan.sql.
--
-- Decision engine, step 7: the manager's side of the recommendation log.
-- Additive only.
--
--   1. farm_engine_modes                 Shadow or Live, per farm, pack and engine
--   2. engine_recommendation_decisions   what the manager decided, and why
--   3. block_pack_history                lets a farm admin record a pack change made in the settings

-- ─── 1. Shadow or Live ───────────────────────────────────────────────────────
-- A newly installed pack starts in Shadow for every engine: no row here means
-- Shadow. A farm admin switches an engine to Live once its shadow record has
-- been reviewed; the application refuses while the pack still lists a value
-- that engine needs as "to be sourced".
CREATE TABLE IF NOT EXISTS public.farm_engine_modes (
  farm_id     uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  pack_id     text NOT NULL,
  engine_id   text NOT NULL,
  mode        text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),
  changed_by  uuid REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, pack_id, engine_id)
);

ALTER TABLE public.farm_engine_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_farm_engine_modes ON public.farm_engine_modes;
CREATE POLICY staff_read_farm_engine_modes
  ON public.farm_engine_modes FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- Switching an engine to Live is the farm admin's decision.
DROP POLICY IF EXISTS admins_write_farm_engine_modes ON public.farm_engine_modes;
CREATE POLICY admins_write_farm_engine_modes
  ON public.farm_engine_modes FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]));

REVOKE ALL ON public.farm_engine_modes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_engine_modes TO authenticated;
GRANT ALL ON public.farm_engine_modes TO service_role;

-- ─── 2. Manager decisions ────────────────────────────────────────────────────
-- One row per decision on a logged recommendation: accepted, edited or
-- skipped, with a reason when edited or skipped (spec A11.1). Append-only: a
-- change of mind is a new row and the latest one stands. A manager's decision
-- is a signal for review, not ground truth: it never changes a pack value.
--
-- Readable and writable by the farm's admins and supervisors only. The
-- platform operator gets no policy: reasons and notes are farm data.
CREATE TABLE IF NOT EXISTS public.engine_recommendation_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  log_id      uuid NOT NULL REFERENCES public.engine_recommendation_log(id) ON DELETE CASCADE,
  block_id    text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('accepted', 'edited', 'skipped')),
  reason      text CHECK (reason IN ('disagree_with_science', 'knew_something', 'resource_constraint', 'data_looked_wrong', 'already_done', 'other')),
  -- What was done instead, when edited; free text in every case.
  note        text,
  -- Whether the engine ran in Shadow or Live when the decision was made.
  mode        text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),
  decided_by  uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  -- An edit or a skip must say why.
  CONSTRAINT engine_recommendation_decisions_reason_required CHECK (decision = 'accepted' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_engine_recommendation_decisions_log
  ON public.engine_recommendation_decisions (log_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_recommendation_decisions_farm
  ON public.engine_recommendation_decisions (farm_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.engine_recommendation_decisions_no_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'engine_recommendation_decisions is append-only; record a new decision instead';
END;
$$;

DROP TRIGGER IF EXISTS engine_recommendation_decisions_no_update ON public.engine_recommendation_decisions;
CREATE TRIGGER engine_recommendation_decisions_no_update
  BEFORE UPDATE ON public.engine_recommendation_decisions
  FOR EACH ROW EXECUTE FUNCTION public.engine_recommendation_decisions_no_update();

ALTER TABLE public.engine_recommendation_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_engine_recommendation_decisions ON public.engine_recommendation_decisions;
CREATE POLICY staff_read_engine_recommendation_decisions
  ON public.engine_recommendation_decisions FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

DROP POLICY IF EXISTS staff_add_engine_recommendation_decisions ON public.engine_recommendation_decisions;
CREATE POLICY staff_add_engine_recommendation_decisions
  ON public.engine_recommendation_decisions FOR INSERT
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
    AND public.block_farm_id(block_id) = farm_id
    AND decided_by = auth.uid()
  );

REVOKE ALL ON public.engine_recommendation_decisions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.engine_recommendation_decisions TO authenticated;
GRANT ALL ON public.engine_recommendation_decisions TO service_role;

-- ─── 3. Pack changes made by a farm admin ────────────────────────────────────
-- Until now only the operator's script wrote this history. A farm admin who
-- links a block to a pack, or moves it to a new version, records the change
-- under their own name.
DROP POLICY IF EXISTS admins_add_block_pack_history ON public.block_pack_history;
CREATE POLICY admins_add_block_pack_history
  ON public.block_pack_history FOR INSERT
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[])
    AND public.block_farm_id(block_id) = farm_id
    AND changed_by = auth.uid()
  );

GRANT INSERT ON public.block_pack_history TO authenticated;
