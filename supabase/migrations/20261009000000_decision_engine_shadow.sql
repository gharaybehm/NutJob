-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- Decision engine, step 2: what the shadow run needs. Nothing here changes a
-- table the live app reads; every statement is additive and can be re-run.
--
--   1. crop_packs               installed Crop Knowledge Packs (platform-wide)
--   2. blocks                   pack and variety binding, canopy and wetted fraction
--   3. block_pack_history       log of every binding change
--   4. farms.elevation_m        needed for Penman-Monteith ET0
--   5. weather_hourly           hourly weather per farm
--   6. block_engine_state       the shared block state per day
--   7. engine_recommendation_log   append-only record of every recommendation
--
-- After running it:
--   npm run install:pack -- --pack=almond --version=0.1.0
--   npm run bind:blocks  -- --pack=almond --version=0.1.0 --dry-run   (then without --dry-run)

-- ─── 1. Installed packs ──────────────────────────────────────────────────────
-- Platform-wide and installed by the operator after review, like the guide
-- documents. A version is immutable once installed; a change is a new version.
CREATE TABLE IF NOT EXISTS public.crop_packs (
  pack_id       text        NOT NULL,
  version       text        NOT NULL CHECK (version ~ '^\d+\.\d+\.\d+$'),
  crop_name     text        NOT NULL,
  -- The parsed pack files, as validated.
  content       jsonb       NOT NULL,
  -- SHA-256 of the pack files, as written in the manifest.
  digest        text        NOT NULL,
  -- The validation report at install time (values to be sourced, review notes).
  report        jsonb       NOT NULL,
  installed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, version)
);

ALTER TABLE public.crop_packs ENABLE ROW LEVEL SECURITY;

-- A pack holds published science and no farm data, so any signed-in user may
-- read it. Only the install script (service role) writes.
DROP POLICY IF EXISTS authenticated_read_crop_packs ON public.crop_packs;
CREATE POLICY authenticated_read_crop_packs
  ON public.crop_packs FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.crop_packs FROM anon, authenticated;
GRANT SELECT ON public.crop_packs TO authenticated;
GRANT ALL ON public.crop_packs TO service_role;

-- ─── 2. Block binding and canopy ─────────────────────────────────────────────
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS pack_id               text,
  ADD COLUMN IF NOT EXISTS pack_version          text,
  -- The variety id inside the pack; NULL when the block's variety is not in it.
  ADD COLUMN IF NOT EXISTS pack_variety_id       text,
  -- Fraction of ground covered by the canopy near solar noon, and tree height.
  -- Re-measured as the trees grow; the crop coefficient is derived from them.
  ADD COLUMN IF NOT EXISTS canopy_cover_fraction numeric(3,2),
  ADD COLUMN IF NOT EXISTS canopy_height_m       numeric(3,1),
  ADD COLUMN IF NOT EXISTS canopy_measured_on    date,
  -- Fraction of the soil surface the irrigation system wets (drip is well below 1).
  ADD COLUMN IF NOT EXISTS wetted_fraction       numeric(3,2);

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_pack_fkey;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_pack_fkey
  FOREIGN KEY (pack_id, pack_version) REFERENCES public.crop_packs (pack_id, version);

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_pack_pair_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_pack_pair_check
  CHECK ((pack_id IS NULL) = (pack_version IS NULL));

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_canopy_cover_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_canopy_cover_check
  CHECK (canopy_cover_fraction IS NULL OR (canopy_cover_fraction >= 0 AND canopy_cover_fraction <= 1));

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_canopy_height_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_canopy_height_check
  CHECK (canopy_height_m IS NULL OR (canopy_height_m > 0 AND canopy_height_m <= 30));

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_wetted_fraction_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_wetted_fraction_check
  CHECK (wetted_fraction IS NULL OR (wetted_fraction > 0 AND wetted_fraction <= 1));

-- ─── 3. Binding history ──────────────────────────────────────────────────────
-- Changing a block's pack version is an explicit, logged action (spec R1.4).
CREATE TABLE IF NOT EXISTS public.block_pack_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id         text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  pack_id          text,
  pack_version     text,
  pack_variety_id  text,
  -- NULL when the binding was made by the operator's script.
  changed_by       uuid REFERENCES auth.users(id),
  reason           text,
  changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_block_pack_history_block
  ON public.block_pack_history (block_id, changed_at DESC);

ALTER TABLE public.block_pack_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_members_read_block_pack_history ON public.block_pack_history;
CREATE POLICY farm_members_read_block_pack_history
  ON public.block_pack_history FOR SELECT
  USING (public.is_farm_member(farm_id));

REVOKE ALL ON public.block_pack_history FROM anon, authenticated;
GRANT SELECT ON public.block_pack_history TO authenticated;
GRANT ALL ON public.block_pack_history TO service_role;

-- ─── 4. Farm elevation ───────────────────────────────────────────────────────
-- Filled by the daily job from the weather service's terrain model.
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS elevation_m numeric(6,1);

-- ─── 5. Hourly weather ───────────────────────────────────────────────────────
-- One row per farm per hour. Forecast hours are overwritten as they pass.
CREATE TABLE IF NOT EXISTS public.weather_hourly (
  farm_id          uuid        NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  at               timestamptz NOT NULL,
  -- The farm-local calendar date and hour, so days are cut where the farm's day is.
  local_date       date        NOT NULL,
  local_hour       smallint    NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  temp_c           numeric(5,2),
  rh_pct           numeric(5,2),
  wind_10m_ms      numeric(5,2),
  shortwave_wm2    numeric(7,2),
  precip_mm        numeric(6,2),
  precip_prob_pct  numeric(5,2),
  dew_point_c      numeric(5,2),
  is_forecast      boolean     NOT NULL DEFAULT false,
  -- 'open-meteo' is modelled for the location, not measured on the farm.
  source           text        NOT NULL DEFAULT 'open-meteo',
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, at)
);

CREATE INDEX IF NOT EXISTS idx_weather_hourly_farm_date
  ON public.weather_hourly (farm_id, local_date);

ALTER TABLE public.weather_hourly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_members_read_weather_hourly ON public.weather_hourly;
CREATE POLICY farm_members_read_weather_hourly
  ON public.weather_hourly FOR SELECT
  USING (public.is_farm_member(farm_id));

REVOKE ALL ON public.weather_hourly FROM anon, authenticated;
GRANT SELECT ON public.weather_hourly TO authenticated;
GRANT ALL ON public.weather_hourly TO service_role;

-- ─── 6. Block state per day ──────────────────────────────────────────────────
-- What the engines saw and concluded, including when they proposed nothing,
-- and the water balance carried to the next day. Written only by the daily job.
CREATE TABLE IF NOT EXISTS public.block_engine_state (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id      text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  state_date    date NOT NULL,
  pack_id       text NOT NULL,
  pack_version  text NOT NULL,
  state         jsonb NOT NULL,
  carried       jsonb,
  engines       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, state_date)
);

CREATE INDEX IF NOT EXISTS idx_block_engine_state_farm_date
  ON public.block_engine_state (farm_id, state_date DESC);

ALTER TABLE public.block_engine_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_block_engine_state ON public.block_engine_state;
CREATE POLICY staff_read_block_engine_state
  ON public.block_engine_state FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.block_engine_state FROM anon, authenticated;
GRANT SELECT ON public.block_engine_state TO authenticated;
GRANT ALL ON public.block_engine_state TO service_role;

-- ─── 7. Recommendation log ───────────────────────────────────────────────────
-- Append-only (spec A11.1): a recommendation is never edited after the fact; a
-- correction is a new entry. The manager's decision and the observed outcome
-- will be separate rows that point here, added with the interface.
--
-- Readable by a farm's admins and supervisors only. The platform operator is
-- not a farm member and gets no policy: recommendation text is farm data.
CREATE TABLE IF NOT EXISTS public.engine_recommendation_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id          text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  run_date          date NOT NULL,
  logged_at         timestamptz NOT NULL DEFAULT now(),
  -- Shadow: recommended and logged, not shown for accept, edit or skip.
  mode              text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),
  engine_id         text NOT NULL,
  rule_id           text NOT NULL,
  pack_id           text NOT NULL,
  pack_version      text NOT NULL,
  crop              text,
  variety           text,
  action_type       text NOT NULL,
  -- The first day the action can be done.
  target_date       date NOT NULL,
  -- The whole proposed action in the standard format (spec A5.2).
  action            jsonb NOT NULL,
  -- The exact inputs the rule used, and the farm-calibrated values in force.
  inputs            jsonb NOT NULL,
  calibrated_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags             text[] NOT NULL DEFAULT '{}',
  confidence        numeric(3,2) NOT NULL,
  mandatory         boolean NOT NULL DEFAULT false,
  expected_outcome  text,
  -- One entry per recommendation per day, however often the job runs.
  UNIQUE (block_id, run_date, engine_id, rule_id, action_type, target_date)
);

CREATE INDEX IF NOT EXISTS idx_engine_recommendation_log_farm_date
  ON public.engine_recommendation_log (farm_id, run_date DESC);

CREATE OR REPLACE FUNCTION public.engine_recommendation_log_no_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'engine_recommendation_log is append-only; log a new entry instead';
END;
$$;

DROP TRIGGER IF EXISTS engine_recommendation_log_no_update ON public.engine_recommendation_log;
CREATE TRIGGER engine_recommendation_log_no_update
  BEFORE UPDATE ON public.engine_recommendation_log
  FOR EACH ROW EXECUTE FUNCTION public.engine_recommendation_log_no_update();

ALTER TABLE public.engine_recommendation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_engine_recommendation_log ON public.engine_recommendation_log;
CREATE POLICY staff_read_engine_recommendation_log
  ON public.engine_recommendation_log FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.engine_recommendation_log FROM anon, authenticated;
GRANT SELECT ON public.engine_recommendation_log TO authenticated;
GRANT ALL ON public.engine_recommendation_log TO service_role;
