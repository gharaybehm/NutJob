-- Run this in the Supabase SQL editor.
-- Creates the sensors device-registry table and adds sensor_id FK columns
-- to the two reading tables so every sensor-sourced row is traceable.

-- ─── Sensors table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sensors (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id        UUID        NOT NULL REFERENCES public.farms(id)   ON DELETE CASCADE,
  block_id       TEXT                 REFERENCES public.blocks(id)  ON DELETE SET NULL,
  name           TEXT        NOT NULL,
  device_id      TEXT        NOT NULL,
  sensor_type    TEXT        NOT NULL CHECK (sensor_type IN (
                               'soil_moisture', 'soil_ec', 'soil_temp',
                               'air_humidity', 'wind', 'rainfall', 'multi')),
  api_key        TEXT        NOT NULL UNIQUE,
  status         TEXT        NOT NULL DEFAULT 'unknown'
                               CHECK (status IN ('online', 'offline', 'unknown')),
  last_seen_at   TIMESTAMPTZ,
  location_notes TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.sensors ENABLE ROW LEVEL SECURITY;

-- All farm members can read sensors for farms they belong to
CREATE POLICY "farm_members_read_sensors"
  ON public.sensors FOR SELECT
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );

-- All farm members can manage sensors (admin gating is enforced in app server actions)
CREATE POLICY "admins_write_sensors"
  ON public.sensors FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_sensors_farm_id  ON public.sensors(farm_id);
CREATE INDEX idx_sensors_block_id ON public.sensors(block_id);
CREATE INDEX idx_sensors_api_key  ON public.sensors(api_key);

-- ─── Back-reference FK on reading tables ─────────────────────────────────────
-- Nullable so existing rows are unaffected; ON DELETE SET NULL preserves history
-- when a sensor is deleted.

ALTER TABLE public.soil_water_readings
  ADD COLUMN IF NOT EXISTS sensor_id UUID REFERENCES public.sensors(id) ON DELETE SET NULL;

ALTER TABLE public.weather_snapshots
  ADD COLUMN IF NOT EXISTS sensor_id UUID REFERENCES public.sensors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_swr_sensor_id ON public.soil_water_readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_ws_sensor_id  ON public.weather_snapshots(sensor_id);
