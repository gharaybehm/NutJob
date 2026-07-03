-- Run this in the Supabase SQL editor.
-- SECURITY FIX: assets/consumables (and their logs) had no farm_id column at
-- all, so every farm on the site shared one global inventory. Existing rows
-- cannot be reliably attributed to a specific farm, so they are deleted here
-- (per product decision) rather than backfilled with a guess.

DELETE FROM public.asset_maintenance_log;
DELETE FROM public.consumable_usage_log;
DELETE FROM public.assets;
DELETE FROM public.consumables;

-- ─── assets ───────────────────────────────────────────────────────────────────

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
