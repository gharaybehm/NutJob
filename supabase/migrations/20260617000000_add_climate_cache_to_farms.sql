-- Add climate caching columns to farms table.
-- climate_profile stores monthly normals derived from Open-Meteo archive data.
-- climate_fetched_at tracks when the profile was last fetched so we can
-- re-fetch after 180 days without hammering the API on every request.

ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS climate_profile JSONB,
  ADD COLUMN IF NOT EXISTS climate_fetched_at TIMESTAMPTZ;
