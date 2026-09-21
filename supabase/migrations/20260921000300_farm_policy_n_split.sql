-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- Seasonal split of the annual nitrogen budget per farm (engines/nitrogen.ts).
-- A JSON array of {"label": text, "share": 0-1}. NULL means "not set": the
-- engine then uses its default 30 / 40 / 30 shape, which is a starting value
-- to be confirmed by the agronomist, not a recommendation.
ALTER TABLE public.farm_policy
  ADD COLUMN IF NOT EXISTS n_split jsonb
    CHECK (n_split IS NULL OR jsonb_typeof(n_split) = 'array');
