-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai) BEFORE
-- deploying the app version that reads and writes planting_date.
--
-- Adds the date the trees were planted. planting_year stays (NOT NULL, already
-- filled); when planting_date is empty the year is read as the last quarter
-- (Sep to Dec) of that year, which is when the farm plants. The tree age this
-- gives drives irrigation demand, harvest windows and the nutrient budget.

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS planting_date date;

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_planting_date_check;
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_planting_date_check
  CHECK (planting_date IS NULL OR (planting_date >= DATE '1900-01-01' AND planting_date <= (CURRENT_DATE + INTERVAL '2 years')));
