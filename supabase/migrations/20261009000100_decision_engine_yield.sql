-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261009000000_decision_engine_shadow.sql.
--
-- Decision engine, step 3: what the yield forecast needs. Additive only.
--
--   1. farm_policy   a price for the crop, so a loss can be put in money
--   2. blocks        the manager's yield estimate for the block this season
--
-- Every engine's "is this worth doing" test is expected yield x price x the
-- share of the crop at risk. With no price set, actions are logged without a
-- money value.

-- ─── 1. Price ────────────────────────────────────────────────────────────────
ALTER TABLE public.farm_policy
  -- Price per yield unit of the crop (per kg of kernels for almond).
  ADD COLUMN IF NOT EXISTS price_per_yield_unit numeric(12,4),
  -- ISO 4217 code of the currency the price is in (TRY, USD, EUR).
  ADD COLUMN IF NOT EXISTS price_currency       text;

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_price_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_price_check
  CHECK (price_per_yield_unit IS NULL OR price_per_yield_unit >= 0);

ALTER TABLE public.farm_policy DROP CONSTRAINT IF EXISTS farm_policy_price_currency_check;
ALTER TABLE public.farm_policy
  ADD CONSTRAINT farm_policy_price_currency_check
  CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$');

-- ─── 2. Yield estimate per block ─────────────────────────────────────────────
-- Used only in the season it was entered for. Without it the forecast falls
-- back to the farm's mature-yield target (farm_policy.n_yield_target_kg_ha)
-- scaled by the pack's curve of yield by age.
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS expected_yield_kg_ha  numeric(8,1),
  ADD COLUMN IF NOT EXISTS expected_yield_season smallint;

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_expected_yield_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_expected_yield_check
  CHECK (expected_yield_kg_ha IS NULL OR expected_yield_kg_ha >= 0);

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_expected_yield_pair_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_expected_yield_pair_check
  CHECK ((expected_yield_kg_ha IS NULL) = (expected_yield_season IS NULL));
