-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261015000000_fix_organization_policies.sql.
--
-- Decision engine, the remaining gaps. Additive only.
--
--   1. frost_checks             the frost check every two hours
--   2. calendar_events          an index for events booked from the engine plan
--   3. safeguard_acknowledgements  who acknowledged a safeguard warning, and when
--   4. farm_calibrations        the learning loop: calibrated values per farm, block and variety

-- ─── 1. Frost checks ─────────────────────────────────────────────────────────
-- One row per block per check (every two hours, only while the block is in a
-- phase in which the pack assesses frost): the nights judged, the station
-- reading used and the level. Written only by /api/cron/frost-check.
-- Append-only, like the recommendation log.
--
-- Readable by a farm's admins and supervisors. The platform operator gets no
-- policy: the check is farm data.
CREATE TABLE IF NOT EXISTS public.frost_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id      text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  checked_at    timestamptz NOT NULL,
  -- The farm's local date of the check.
  local_date    date NOT NULL,
  -- Whether the farm had switched the frost engine to Live at the time.
  mode          text NOT NULL CHECK (mode IN ('shadow', 'live')),
  pack_id       text NOT NULL,
  pack_version  text NOT NULL,
  level         text NOT NULL CHECK (level IN ('none', 'watch', 'warning', 'critical')),
  worst_night   date,
  worst_min_c   numeric(5,2),
  -- Every night judged: date, minimum, and the forecast and station values behind it.
  nights        jsonb NOT NULL,
  -- The level of each night at watch or worse, with the engine's text: what the calendar shows.
  night_levels  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The validated station reading used, or null.
  station       jsonb,
  notes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frost_checks_block ON public.frost_checks (block_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_frost_checks_farm ON public.frost_checks (farm_id, checked_at DESC);

CREATE OR REPLACE FUNCTION public.frost_checks_no_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'frost_checks is append-only';
END;
$$;

DROP TRIGGER IF EXISTS frost_checks_no_update ON public.frost_checks;
CREATE TRIGGER frost_checks_no_update
  BEFORE UPDATE ON public.frost_checks
  FOR EACH ROW EXECUTE FUNCTION public.frost_checks_no_update();

ALTER TABLE public.frost_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_frost_checks ON public.frost_checks;
CREATE POLICY staff_read_frost_checks
  ON public.frost_checks FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.frost_checks FROM anon, authenticated;
GRANT SELECT ON public.frost_checks TO authenticated;
GRANT ALL ON public.frost_checks TO service_role;

-- ─── 2. Events booked from the engine plan ───────────────────────────────────
-- Accepting a Live action books one calendar event that carries the log row
-- in details.engine_log_id. Unique, so a second click or a second tab cannot
-- book the same action twice; the plan finds its booking through it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_engine_log
  ON public.calendar_events ((details->>'engine_log_id'))
  WHERE details->>'engine_log_id' IS NOT NULL;

-- ─── 3. Safeguard acknowledgements ───────────────────────────────────────────
-- A safeguard finding in the plan (a veto, as recorded) stays pinned on the
-- Recommendations page until a supervisor or an admin acknowledges it. The
-- key names the safeguard, the action it stopped and the reason
-- (utils/decision/plan-view.ts, safeguardEventKey), so the same finding in
-- tomorrow's plan stays acknowledged and a new reason is pinned again.
-- Acknowledging changes nothing: the safeguard still applies. Append-only.
CREATE TABLE IF NOT EXISTS public.safeguard_acknowledgements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id         text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  event_key        text NOT NULL,
  safeguard_id     text NOT NULL,
  -- The plan in which it was acknowledged.
  plan_date        date NOT NULL,
  acknowledged_by  uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, event_key)
);

CREATE OR REPLACE FUNCTION public.safeguard_acknowledgements_no_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'safeguard_acknowledgements is append-only';
END;
$$;

DROP TRIGGER IF EXISTS safeguard_acknowledgements_no_update ON public.safeguard_acknowledgements;
CREATE TRIGGER safeguard_acknowledgements_no_update
  BEFORE UPDATE ON public.safeguard_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.safeguard_acknowledgements_no_update();

ALTER TABLE public.safeguard_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_safeguard_acknowledgements ON public.safeguard_acknowledgements;
CREATE POLICY staff_read_safeguard_acknowledgements
  ON public.safeguard_acknowledgements FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

DROP POLICY IF EXISTS staff_add_safeguard_acknowledgements ON public.safeguard_acknowledgements;
CREATE POLICY staff_add_safeguard_acknowledgements
  ON public.safeguard_acknowledgements FOR INSERT
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
    AND public.block_farm_id(block_id) = farm_id
    AND acknowledged_by = auth.uid()
  );

REVOKE ALL ON public.safeguard_acknowledgements FROM anon, authenticated;
GRANT SELECT, INSERT ON public.safeguard_acknowledgements TO authenticated;
GRANT ALL ON public.safeguard_acknowledgements TO service_role;

-- ─── 4. Learning loop: calibrated values ─────────────────────────────────────
-- Calibrated pack parameters as farm-level overrides, per farm, variety or
-- block (spec A11.3; engines/learning/calibration.ts). Every step is a row:
-- a calibration job proposes a challenger with its backtest (service role
-- only), and the farm admin promotes, rejects or rolls back. The value in
-- force is worked out from the rows; nothing is ever updated or deleted.
-- Values outside the pack's bounds are never promoted, and the pack itself is
-- never changed. Safeguard limits are not pack parameters and never appear here.
CREATE TABLE IF NOT EXISTS public.farm_calibration_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  pack_id         text NOT NULL,
  param_id        text NOT NULL,
  -- The scope: both null for the whole farm; a variety; or one block.
  block_id        text REFERENCES public.blocks(id) ON DELETE CASCADE,
  variety_id      text,
  kind            text NOT NULL CHECK (kind IN ('proposed', 'promoted', 'rejected', 'rolled_back')),
  -- On 'proposed': the challenger value, how it was worked out, and its backtest on the logged history.
  value           numeric,
  method          text,
  evidence        jsonb,
  backtest        jsonb,
  -- On the other kinds: the 'proposed' row decided.
  calibration_id  uuid REFERENCES public.farm_calibration_events(id) ON DELETE CASCADE,
  actor           uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_calibration_events_shape CHECK (
    (kind = 'proposed' AND value IS NOT NULL AND calibration_id IS NULL)
    OR (kind <> 'proposed' AND calibration_id IS NOT NULL AND actor IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_farm_calibration_events_farm ON public.farm_calibration_events (farm_id, created_at);

CREATE OR REPLACE FUNCTION public.farm_calibration_events_no_change()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'farm_calibration_events is append-only; record a new event instead';
END;
$$;

DROP TRIGGER IF EXISTS farm_calibration_events_no_update ON public.farm_calibration_events;
CREATE TRIGGER farm_calibration_events_no_update
  BEFORE UPDATE ON public.farm_calibration_events
  FOR EACH ROW EXECUTE FUNCTION public.farm_calibration_events_no_change();

ALTER TABLE public.farm_calibration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_farm_calibration_events ON public.farm_calibration_events;
CREATE POLICY staff_read_farm_calibration_events
  ON public.farm_calibration_events FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- Promoting, rejecting and rolling back are the farm admin's decisions; proposing is the calibration job's.
DROP POLICY IF EXISTS admins_decide_farm_calibration_events ON public.farm_calibration_events;
CREATE POLICY admins_decide_farm_calibration_events
  ON public.farm_calibration_events FOR INSERT
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[])
    AND kind IN ('promoted', 'rejected', 'rolled_back')
    AND actor = auth.uid()
    -- The decision is on one of this farm's proposals, in the same scope.
    AND EXISTS (
      SELECT 1 FROM public.farm_calibration_events p
      WHERE p.id = calibration_id
        AND p.kind = 'proposed'
        AND p.farm_id = farm_calibration_events.farm_id
        AND p.pack_id = farm_calibration_events.pack_id
        AND p.param_id = farm_calibration_events.param_id
        AND p.block_id IS NOT DISTINCT FROM farm_calibration_events.block_id
        AND p.variety_id IS NOT DISTINCT FROM farm_calibration_events.variety_id
    )
  );

REVOKE ALL ON public.farm_calibration_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.farm_calibration_events TO authenticated;
GRANT ALL ON public.farm_calibration_events TO service_role;
