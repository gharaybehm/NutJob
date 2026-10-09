-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261009000100_decision_engine_yield.sql.
--
-- Decision engine, step 4: what the insect pest and disease engines and the
-- spray safeguards need. Additive only.
--
--   1. field_observations          trap checks, scouting counts, hull split, hives, an observed biofix
--   2. farm_products               the product library: label values the spray safeguards read
--   3. block_engine_state          a column for model state carried day to day (biofix, degree-days)
--
-- There is no form for either table yet; the screens come with the interface
-- step. Until then rows are entered in Studio.

-- ─── 1. Field observations ───────────────────────────────────────────────────
-- One row per observation. The pack names the kinds and their fields (for
-- example kind 'trap_check' with a count), so new crops need no new tables.
--   kind     what was observed: trap_check, hull_split, shoot_strikes, hives, biofix, ...
--   subject  the pack id of the pest or disease it concerns; NULL for a block-level observation
--   data     the fields the pack asks for, for example {"eggs": 14, "traps_checked": 4, "traps_with_eggs": 3}
--            hives:  {"present": true}        biofix: {} (the date is observed_on)
CREATE TABLE IF NOT EXISTS public.field_observations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id     text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]*$'),
  subject      text,
  observed_on  date NOT NULL,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  notes        text,
  -- Every manual entry records who entered it and when (spec R2.2).
  entered_by   uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_observations_block_date
  ON public.field_observations (block_id, observed_on DESC);
CREATE INDEX IF NOT EXISTS idx_field_observations_farm
  ON public.field_observations (farm_id, observed_on DESC);

ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;

-- Workers do the scouting, so every farm member may read and add observations.
-- Only admins and supervisors may correct or remove one.
DROP POLICY IF EXISTS farm_members_read_field_observations ON public.field_observations;
CREATE POLICY farm_members_read_field_observations
  ON public.field_observations FOR SELECT
  USING (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS farm_members_add_field_observations ON public.field_observations;
CREATE POLICY farm_members_add_field_observations
  ON public.field_observations FOR INSERT
  WITH CHECK (
    public.is_farm_member(farm_id)
    AND public.block_farm_id(block_id) = farm_id
    AND entered_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_change_field_observations ON public.field_observations;
CREATE POLICY staff_change_field_observations
  ON public.field_observations FOR UPDATE
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
    AND public.block_farm_id(block_id) = farm_id
  );

DROP POLICY IF EXISTS staff_delete_field_observations ON public.field_observations;
CREATE POLICY staff_delete_field_observations
  ON public.field_observations FOR DELETE
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.field_observations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_observations TO authenticated;
GRANT ALL ON public.field_observations TO service_role;

-- ─── 2. Product library ──────────────────────────────────────────────────────
-- Per farm, entered by hand from the product label. The spray safeguards take
-- every limit from here and invent none: a product with a missing value is
-- blocked by the safeguard that needs it. A product counts only once approved.
CREATE TABLE IF NOT EXISTS public.farm_products (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                     uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name                        text NOT NULL,
  product_type                text NOT NULL CHECK (product_type IN ('insecticide', 'fungicide', 'herbicide', 'acaricide', 'fertiliser', 'other')),
  active_ingredient           text,
  -- FRAC, IRAC or HRAC code, for rotating modes of action.
  mode_of_action_group        text,
  -- Pack ids of the pests, diseases or weeds it is used against, for example {now,ptb}.
  targets                     text[] NOT NULL DEFAULT '{}',
  -- Pack ids of the crops it is registered for in the farm's country, for example {almond}.
  registered_crops            text[],
  registration_number         text,
  -- Wind limits during application, m/s. The minimum is the inversion limit.
  max_wind_ms                 numeric(4,1) CHECK (max_wind_ms IS NULL OR max_wind_ms >= 0),
  min_wind_ms                 numeric(4,1) CHECK (min_wind_ms IS NULL OR min_wind_ms >= 0),
  rainfast_hours              numeric(5,1) CHECK (rainfast_hours IS NULL OR rainfast_hours >= 0),
  -- Pre-harvest and re-entry intervals.
  phi_days                    smallint CHECK (phi_days IS NULL OR phi_days >= 0),
  rei_hours                   numeric(6,1) CHECK (rei_hours IS NULL OR rei_hours >= 0),
  max_applications_per_season smallint CHECK (max_applications_per_season IS NULL OR max_applications_per_season >= 0),
  bee_toxic                   boolean,
  -- Fertilisers: percent of each nutrient, for example {"N": 46}.
  nutrient_content            jsonb CHECK (nutrient_content IS NULL OR jsonb_typeof(nutrient_content) = 'object'),
  -- The stock item this product is, when the farm tracks it in the inventory.
  consumable_id               uuid REFERENCES public.consumables(id) ON DELETE SET NULL,
  notes                       text,
  -- Set when a farm admin has checked the values against the label.
  approved_by                 uuid REFERENCES auth.users(id),
  approved_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, name)
);

ALTER TABLE public.farm_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_members_read_farm_products ON public.farm_products;
CREATE POLICY farm_members_read_farm_products
  ON public.farm_products FOR SELECT
  USING (public.is_farm_member(farm_id));

-- Label values drive what may be sprayed, so only a farm admin may write them.
DROP POLICY IF EXISTS admins_write_farm_products ON public.farm_products;
CREATE POLICY admins_write_farm_products
  ON public.farm_products FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]));

REVOKE ALL ON public.farm_products FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_products TO authenticated;
GRANT ALL ON public.farm_products TO service_role;

-- ─── 3. Carried model state ──────────────────────────────────────────────────
ALTER TABLE public.block_engine_state
  ADD COLUMN IF NOT EXISTS carried_models jsonb;
