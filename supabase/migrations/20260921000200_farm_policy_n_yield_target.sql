-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- Mature-tree kernel yield target per farm, used by the nitrogen budget
-- (engines/nitrogen.ts). NULL means "not set": the engine then uses its
-- default of 2,500 kg/ha, which is the manager's own figure, not a recommendation.
ALTER TABLE public.farm_policy
  ADD COLUMN IF NOT EXISTS n_yield_target_kg_ha numeric(6,0)
    CHECK (n_yield_target_kg_ha IS NULL OR (n_yield_target_kg_ha > 0 AND n_yield_target_kg_ha <= 10000));
