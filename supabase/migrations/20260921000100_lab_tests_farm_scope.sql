-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai) BEFORE
-- deploying the app version that saves lab tests with a farm.
--
-- Problem: soil_water_readings had a nullable block_id and no farm_id, and the
-- tenant-isolation policies (20260909000000) require a block for every manual
-- insert. So the "Whole Farm" option in the lab-test form can no longer save,
-- and the farm-wide tests saved before that migration belong to no farm and are
-- invisible to every user. The AI recommender also skipped them.
--
-- Fix: give every lab test a farm. A test may still name no block (a composite
-- sample for the whole farm), but it always belongs to one farm.

ALTER TABLE public.soil_water_readings
  ADD COLUMN IF NOT EXISTS farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE;

-- Manual lab tests that name a block take that block's farm.
UPDATE public.soil_water_readings r
   SET farm_id = b.farm_id
  FROM public.blocks b
 WHERE r.block_id = b.id
   AND r.farm_id IS NULL
   AND r.source = 'manual'
   AND r.test_type IN ('soil', 'water');

CREATE INDEX IF NOT EXISTS idx_soil_water_readings_farm_lab
  ON public.soil_water_readings (farm_id, recorded_at DESC)
  WHERE farm_id IS NOT NULL;

-- One saved record per lab report number, per farm, test type and block (or
-- whole-farm). The same report saved three times, with three different sets of
-- values, is what prompted this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_soil_water_lab_report
  ON public.soil_water_readings (farm_id, lower(btrim(lab_reference)), test_type, COALESCE(block_id, ''))
  WHERE source = 'manual'
    AND farm_id IS NOT NULL
    AND lab_reference IS NOT NULL
    AND btrim(lab_reference) <> '';

-- ─── Policies ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS farm_members_read_soil_water ON public.soil_water_readings;
CREATE POLICY farm_members_read_soil_water
  ON public.soil_water_readings FOR SELECT
  USING (
    (farm_id IS NOT NULL AND public.is_farm_member(farm_id))
    OR (block_id IS NOT NULL AND public.is_farm_member(public.block_farm_id(block_id)))
    OR EXISTS (
      SELECT 1 FROM public.sensors s
       WHERE s.id = sensor_id AND public.is_farm_member(s.farm_id)
    )
  );

DROP POLICY IF EXISTS staff_insert_soil_water ON public.soil_water_readings;
CREATE POLICY staff_insert_soil_water
  ON public.soil_water_readings FOR INSERT
  WITH CHECK (
    (
      block_id IS NOT NULL
      AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[])
      AND (farm_id IS NULL OR farm_id = public.block_farm_id(block_id))
    )
    OR (
      block_id IS NULL
      AND farm_id IS NOT NULL
      AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
    )
  );

DROP POLICY IF EXISTS staff_update_soil_water ON public.soil_water_readings;
CREATE POLICY staff_update_soil_water
  ON public.soil_water_readings FOR UPDATE
  USING (
    (block_id IS NOT NULL AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
    OR (block_id IS NULL AND farm_id IS NOT NULL AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  )
  WITH CHECK (
    (
      block_id IS NOT NULL
      AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[])
      AND (farm_id IS NULL OR farm_id = public.block_farm_id(block_id))
    )
    OR (block_id IS NULL AND farm_id IS NOT NULL AND public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  );

-- ─── Not done here, on purpose ───────────────────────────────────────────────
-- Three farm-wide rows for lab report TT250093 (created 2026-06-16) still have
-- no farm, so nobody can see them. They cannot be assigned from the data: ask
-- which farm the report belongs to, then run once, with that farm's id:
--
--   UPDATE public.soil_water_readings
--      SET farm_id = '<farm id>'
--    WHERE lab_reference = 'TT250093' AND block_id IS NULL AND farm_id IS NULL;
--
-- The three copies disagree (CEC 2.421 / 242.1 / missing, clay and silt swapped in
-- two, texture Loam / Loam / Clay), and the unique index above will refuse the
-- update until two of them are removed. Merge them into one record first.
