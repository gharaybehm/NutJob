-- Run this in the Supabase SQL editor.
-- SECURITY FIX: recommendations never had a farm_id column, so getRecommendations()
-- returned every recommendation for every farm in the database to whichever farm's
-- page loaded it. Every existing row is attributable to a farm via block_id ->
-- blocks.farm_id (verified before writing this migration: all 16 production rows
-- matched a real block, all belonging to a single farm), so we backfill rather
-- than delete.

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE;

UPDATE public.recommendations r
SET farm_id = b.farm_id
FROM public.blocks b
WHERE r.block_id = b.id
  AND r.farm_id IS NULL;

ALTER TABLE public.recommendations
  ALTER COLUMN farm_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendations_farm_id ON public.recommendations(farm_id);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- Drop whatever policies currently exist on this table (name unknown — it predates
-- tracked migrations) so a stale permissive policy can't coexist with the new
-- farm-scoped ones below (Postgres RLS policies are OR'd together).
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recommendations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.recommendations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "farm_members_read_recommendations"
  ON public.recommendations FOR SELECT
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

CREATE POLICY "farm_members_write_recommendations"
  ON public.recommendations FOR ALL
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
