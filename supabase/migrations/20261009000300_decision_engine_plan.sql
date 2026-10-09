-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261009000200_decision_engine_pests.sql.
--
-- Decision engine, step 6: what the arbitrator needs. Additive only.
--
--   1. farm_policy   the farm's daily limits and how it protects against frost
--   2. farm_plans    the seven-day plan the arbitrator produces each day
--
-- Every limit is NULL until the farm sets it. An unset limit does not
-- constrain the plan, and the plan says so.

-- ─── 1. Farm limits ──────────────────────────────────────────────────────────
ALTER TABLE public.farm_policy
  -- Labour available on the farm per day, in hours.
  ADD COLUMN IF NOT EXISTS daily_labour_hours      numeric(6,1),
  -- Water the farm can apply per day, in cubic metres (pump and allocation).
  ADD COLUMN IF NOT EXISTS daily_water_m3          numeric(10,1),
  -- Sprayers on the farm. One sprayer covers one block a day.
  ADD COLUMN IF NOT EXISTS sprayer_count           smallint,
  -- How the farm protects against frost. With 'water', frost protection has
  -- first claim on water on a frost night (safeguard SG-FRO-1).
  ADD COLUMN IF NOT EXISTS frost_protection_method text;

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_daily_labour_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_daily_labour_check
  CHECK (daily_labour_hours IS NULL OR daily_labour_hours >= 0);

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_daily_water_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_daily_water_check
  CHECK (daily_water_m3 IS NULL OR daily_water_m3 >= 0);

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_sprayer_count_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_sprayer_count_check
  CHECK (sprayer_count IS NULL OR sprayer_count >= 0);

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_frost_method_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_frost_method_check
  CHECK (frost_protection_method IS NULL OR frost_protection_method IN ('water', 'wind_machine', 'heater'));

-- ─── 2. Farm plans ───────────────────────────────────────────────────────────
-- One row per farm per day: which proposed actions run on which day over the
-- next seven days, what was deferred and why, every safeguard veto, and the
-- explanation text. Written only by the daily job. Shadow: nothing here is
-- shown to the farm yet.
--
-- Readable by a farm's admins and supervisors only. The platform operator
-- gets no policy: plan and explanation text is farm data.
CREATE TABLE IF NOT EXISTS public.farm_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  plan_date              date NOT NULL,
  mode                   text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),
  -- OPTIMAL, FEASIBLE (search stopped early) or INFEASIBLE (a mandatory action does not fit).
  status                 text NOT NULL CHECK (status IN ('OPTIMAL', 'FEASIBLE', 'INFEASIBLE')),
  horizon_days           smallint NOT NULL,
  plan                   jsonb NOT NULL,
  deferred               jsonb NOT NULL,
  unscheduled_mandatory  jsonb NOT NULL,
  -- Every safeguard veto applied, shown verbatim and never paraphrased.
  safeguard_events       jsonb NOT NULL,
  notes                  jsonb NOT NULL,
  -- The limits in force when the plan was made.
  limits                 jsonb NOT NULL,
  narration              jsonb NOT NULL,
  -- 'model' when a model wrote the narration and it passed the number check; 'rules' otherwise.
  narration_source       text NOT NULL CHECK (narration_source IN ('model', 'rules')),
  narration_model        text,
  narration_language     text NOT NULL DEFAULT 'en',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, plan_date)
);

ALTER TABLE public.farm_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_farm_plans ON public.farm_plans;
CREATE POLICY staff_read_farm_plans
  ON public.farm_plans FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.farm_plans FROM anon, authenticated;
GRANT SELECT ON public.farm_plans TO authenticated;
GRANT ALL ON public.farm_plans TO service_role;
