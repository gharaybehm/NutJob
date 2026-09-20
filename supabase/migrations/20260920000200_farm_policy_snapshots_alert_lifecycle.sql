-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- Foundation for the daily agronomic snapshot and watchdog (AI Agronomist v2):
--   1. blocks.root_depth_m        rooting depth the irrigation engine needs
--   2. farm_policy                per-farm settings the engines read (never hard-coded)
--   3. daily_snapshots            one row per block per day, values with unit/source/state
--   4. block_alerts lifecycle     rule id, dedup key, details, acknowledge and snooze
--
-- Every default below is an editable starting value, not a recommendation for
-- this farm: the manager or agronomist sets the real ones.

-- ─── 1. Rooting depth ────────────────────────────────────────────────────────
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS root_depth_m numeric(3,1);

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_root_depth_m_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_root_depth_m_check
  CHECK (root_depth_m IS NULL OR (root_depth_m > 0 AND root_depth_m <= 5));

-- ─── 2. Farm policy ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.farm_policy (
  farm_id                   uuid PRIMARY KEY REFERENCES public.farms(id) ON DELETE CASCADE,
  -- Irrigation strategy chosen by the manager/agronomist. The engine reports
  -- status against it and never changes it.
  irrigation_strategy_name  text          NOT NULL DEFAULT 'full',
  -- Fraction of plant-available water that may be used before irrigating
  -- (FAO-56 p; 0.40 is the published starting value for almond).
  allowable_depletion       numeric(3,2)  NOT NULL DEFAULT 0.40
                              CHECK (allowable_depletion > 0 AND allowable_depletion <= 1),
  -- Application efficiency (drip is typically about 0.90).
  irrigation_efficiency     numeric(3,2)  NOT NULL DEFAULT 0.90
                              CHECK (irrigation_efficiency > 0 AND irrigation_efficiency <= 1),
  -- Used when a block has no root_depth_m of its own. NULL means "not set":
  -- the irrigation engine then asks for it instead of assuming one.
  default_root_depth_m      numeric(3,1)
                              CHECK (default_root_depth_m IS NULL OR (default_root_depth_m > 0 AND default_root_depth_m <= 5)),
  -- Licensed well volume for the season.
  well_licence_volume_m3    numeric(12,0) CHECK (well_licence_volume_m3 IS NULL OR well_licence_volume_m3 >= 0),
  well_licence_season_year  smallint,
  -- Forecast error allowance for frost alerts, in °C.
  frost_margin_c            numeric(3,1)  NOT NULL DEFAULT 2.0 CHECK (frost_margin_c >= 0),
  -- Hours without a reading before a soil sensor is treated as failed.
  sensor_failed_after_hours smallint      NOT NULL DEFAULT 24 CHECK (sensor_failed_after_hours > 0),
  updated_by                uuid REFERENCES auth.users(id),
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  created_at                timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.farm_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_members_read_farm_policy ON public.farm_policy;
CREATE POLICY farm_members_read_farm_policy
  ON public.farm_policy FOR SELECT
  USING (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS staff_write_farm_policy ON public.farm_policy;
CREATE POLICY staff_write_farm_policy
  ON public.farm_policy FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- ─── 3. Daily snapshots ──────────────────────────────────────────────────────
-- Written only by the daily job (service role bypasses RLS), so there is
-- deliberately no write policy: nobody can edit a stored snapshot by hand.
CREATE TABLE IF NOT EXISTS public.daily_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id      text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  version       smallint NOT NULL DEFAULT 1,
  data          jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_farm_date
  ON public.daily_snapshots (farm_id, snapshot_date DESC);

ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_members_read_daily_snapshots ON public.daily_snapshots;
CREATE POLICY farm_members_read_daily_snapshots
  ON public.daily_snapshots FOR SELECT
  USING (public.is_farm_member(farm_id));

-- ─── 4. Alert lifecycle ──────────────────────────────────────────────────────
ALTER TABLE public.block_alerts
  ADD COLUMN IF NOT EXISTS rule_id          text,
  ADD COLUMN IF NOT EXISTS dedup_key        text,
  ADD COLUMN IF NOT EXISTS details          jsonb,
  ADD COLUMN IF NOT EXISTS acknowledged_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until    timestamptz;

-- One open alert per event: a rerun of the watchdog cannot duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_alerts_open_dedup
  ON public.block_alerts (block_id, dedup_key)
  WHERE resolved = false AND dedup_key IS NOT NULL;
