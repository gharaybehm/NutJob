-- Run this in the Supabase SQL editor.
-- SECURITY FIX: assets/consumables (and their logs) never had a farm_id
-- column, so every farm on the site would have shared one global inventory
-- once these tables existed. It turns out the tables didn't exist in
-- production at all yet (the app silently falls back to mock data when they
-- error out) — this migration creates them correctly-scoped from the start.
-- If they do already exist with data in your environment, existing rows
-- cannot be reliably attributed to a specific farm, so they are deleted here
-- (per product decision) rather than backfilled with a guess.

-- ─── assets ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  category       TEXT        NOT NULL CHECK (category IN ('machinery', 'vehicle', 'tool', 'equipment', 'other')),
  status         TEXT        NOT NULL CHECK (status IN ('operational', 'needs-maintenance', 'out-of-service')),
  purchase_date  DATE,
  notes          TEXT,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.assets;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE;

ALTER TABLE public.assets
  ALTER COLUMN farm_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_farm_id ON public.assets(farm_id);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_members_read_assets" ON public.assets;
CREATE POLICY "farm_members_read_assets"
  ON public.assets FOR SELECT
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "farm_members_write_assets" ON public.assets;
CREATE POLICY "farm_members_write_assets"
  ON public.assets FOR ALL
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ─── asset_maintenance_log (scoped transitively via assets.farm_id) ──────────

CREATE TABLE IF NOT EXISTS public.asset_maintenance_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           UUID        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  maintenance_date   DATE        NOT NULL,
  maintenance_type   TEXT        NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'inspection')),
  description        TEXT        NOT NULL,
  cost               NUMERIC,
  performed_by       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.asset_maintenance_log;

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_log_asset_id ON public.asset_maintenance_log(asset_id);

ALTER TABLE public.asset_maintenance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_members_read_asset_maintenance_log" ON public.asset_maintenance_log;
CREATE POLICY "farm_members_read_asset_maintenance_log"
  ON public.asset_maintenance_log FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM public.assets
      WHERE farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "farm_members_write_asset_maintenance_log" ON public.asset_maintenance_log;
CREATE POLICY "farm_members_write_asset_maintenance_log"
  ON public.asset_maintenance_log FOR ALL
  USING (
    asset_id IN (
      SELECT id FROM public.assets
      WHERE farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
    )
  );

-- ─── consumables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consumables (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  category          TEXT        NOT NULL CHECK (category IN ('fertilizer', 'pesticide', 'herbicide', 'fuel', 'parts', 'other')),
  unit              TEXT        NOT NULL,
  starting_balance  NUMERIC     NOT NULL DEFAULT 0,
  current_balance   NUMERIC     NOT NULL DEFAULT 0,
  minimum_stock     NUMERIC,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.consumables;

ALTER TABLE public.consumables
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE;

ALTER TABLE public.consumables
  ALTER COLUMN farm_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consumables_farm_id ON public.consumables(farm_id);

ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_members_read_consumables" ON public.consumables;
CREATE POLICY "farm_members_read_consumables"
  ON public.consumables FOR SELECT
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "farm_members_write_consumables" ON public.consumables;
CREATE POLICY "farm_members_write_consumables"
  ON public.consumables FOR ALL
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ─── consumable_usage_log (scoped transitively via consumables.farm_id) ──────

CREATE TABLE IF NOT EXISTS public.consumable_usage_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consumable_id      UUID        NOT NULL REFERENCES public.consumables(id) ON DELETE CASCADE,
  usage_date         DATE        NOT NULL,
  quantity           NUMERIC     NOT NULL,
  calendar_event_id  UUID        REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  block              TEXT,
  notes              TEXT,
  logged_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.consumable_usage_log;

CREATE INDEX IF NOT EXISTS idx_consumable_usage_log_consumable_id ON public.consumable_usage_log(consumable_id);

ALTER TABLE public.consumable_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_members_read_consumable_usage_log" ON public.consumable_usage_log;
CREATE POLICY "farm_members_read_consumable_usage_log"
  ON public.consumable_usage_log FOR SELECT
  USING (
    consumable_id IN (
      SELECT id FROM public.consumables
      WHERE farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "farm_members_write_consumable_usage_log" ON public.consumable_usage_log;
CREATE POLICY "farm_members_write_consumable_usage_log"
  ON public.consumable_usage_log FOR ALL
  USING (
    consumable_id IN (
      SELECT id FROM public.consumables
      WHERE farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
    )
  );
