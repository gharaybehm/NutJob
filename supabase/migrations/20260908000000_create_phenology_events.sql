-- Run this in the Supabase SQL editor.
--
-- Observed phenology events — the manual season anchors that sensors cannot
-- supply. Bloom and bud break are visual observations, and every downstream
-- prediction (hull split, harvest window) is measured as heat accumulated from
-- one of them.
--
-- Deliberately a separate table rather than more columns on phenology_records:
-- that table gets a fresh computed row every day, and phenology_latest returns
-- only the newest one per block, so an observation written there would be
-- superseded and lost within 24 hours. Observations belong in their own
-- durable log; the compute-fields cron reads them and propagates the derived
-- dates onto each day's computed row.

CREATE TABLE IF NOT EXISTS public.phenology_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID        NOT NULL REFERENCES public.farms(id)  ON DELETE CASCADE,
  block_id    TEXT        NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL CHECK (event_type IN (
                            'bud-break', 'full-bloom', 'petal-fall',
                            'hull-split', 'harvest-start', 'harvest-end')),
  observed_on DATE        NOT NULL,
  -- The season an event belongs to. Stored rather than derived so that a
  -- Southern-Hemisphere season spanning a year boundary can be corrected by
  -- hand without rewriting the observed date.
  season      SMALLINT    NOT NULL,
  notes       TEXT,
  observed_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One observation of a given event per block per season. Re-observing replaces
-- rather than accumulates (the server action upserts on this constraint).
CREATE UNIQUE INDEX IF NOT EXISTS idx_phenology_events_unique
  ON public.phenology_events(block_id, event_type, season);

CREATE INDEX IF NOT EXISTS idx_phenology_events_farm  ON public.phenology_events(farm_id);
CREATE INDEX IF NOT EXISTS idx_phenology_events_block ON public.phenology_events(block_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Farm-scoped via farm_members, matching the public.sensors policy pattern.
-- Role gating (workers may not write) is enforced in the server actions, as
-- elsewhere in this schema.

ALTER TABLE public.phenology_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_members_read_phenology_events"  ON public.phenology_events;
DROP POLICY IF EXISTS "farm_members_write_phenology_events" ON public.phenology_events;

CREATE POLICY "farm_members_read_phenology_events"
  ON public.phenology_events FOR SELECT
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "farm_members_write_phenology_events"
  ON public.phenology_events FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );
