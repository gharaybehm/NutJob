-- Add SenseCAP org-level API credentials to farms.
-- These are entered once per farm in Settings → Sensor Integration,
-- and used by the /api/cron/sensecap-sync endpoint to pull live
-- telemetry from the SenseCAP cloud 3× per day.
--
-- The device EUI per physical sensor is stored in sensors.device_id
-- (already exists). No per-sensor credential columns are needed.

ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS sensecap_api_id     TEXT,
  ADD COLUMN IF NOT EXISTS sensecap_access_key TEXT;
