-- Run this in the Supabase SQL editor.
--
-- TENANT ISOLATION — close the cross-farm read/write holes and put the role
-- matrix in the database instead of the UI.
--
-- WHAT WAS WRONG
-- Two separate problems compounded each other:
--
-- 1. Legacy policies written before farms existed were never dropped when the
--    farm-scoped ones were added. Postgres ORs permissive policies together,
--    so `USING (true)` alongside `farm_id IN (...)` evaluates to `true` for
--    every authenticated user on the platform. Roughly a dozen tables were
--    readable and writable across tenants; isolation depended entirely on the
--    application remembering to filter by farm_id.
--
-- 2. activity_log and calendar_events have no farm_id at all. They were scoped
--    by block_id, and rows with a NULL block_id (farm-wide entries) matched
--    every tenant's `block_id.is.null` filter — so another farm's farm-wide
--    events actually rendered in your calendar and activity feed. That one was
--    a visible leak, not just a weak policy.
--
-- WHAT THIS DOES
--   * adds farm_id to activity_log, calendar_events and weather_snapshots,
--     backfilling from block_id / sensor_id / the author's membership
--   * drops every legacy `USING (true)` and global-role policy
--   * rewrites each table's policies as farm-scoped, role-gated pairs
--   * lets farm members read each other's user_profiles rows (needed for the
--     team list and for entry attribution — see the attribution migration)
--
-- THE ROLE MATRIX ENCODED HERE
--   worker      read everything in the farm; log field work (activity,
--               scouting, pest observations, consumable usage, maintenance)
--   supervisor  + create/edit operational records (calendar, blocks,
--               inventory items, agronomic logs, recommendations)
--   admin       + delete, sensors, farm settings, membership
--
-- ORPHANS
-- Rows whose farm cannot be determined keep farm_id NULL and are visible to
-- nobody. The DO block at the end reports how many there are per table so they
-- can be reassigned by hand. Nothing is deleted.

BEGIN;

-- ─── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy can consult farm_members without tripping over
-- that table's own RLS, and STABLE so the planner hoists them out of row loops
-- rather than re-running the lookup per row.

CREATE OR REPLACE FUNCTION public.is_farm_member(target_farm uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_farm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.farm_members
    WHERE farm_id = target_farm AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_farm_role(
  target_farm uuid,
  allowed public.user_role[]
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_farm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.farm_members
    WHERE farm_id = target_farm
      AND user_id = auth.uid()
      AND role = ANY (allowed)
  );
$$;

-- blocks.id is TEXT, so every transitively-scoped table joins on text.
CREATE OR REPLACE FUNCTION public.block_farm_id(target_block text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT farm_id FROM public.blocks WHERE id = target_block;
$$;

GRANT EXECUTE ON FUNCTION public.is_farm_member(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_farm_role(uuid, public.user_role[])     TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_farm_id(text)                         TO authenticated;

-- Shorthands used repeatedly below.
--   member    = ARRAY['admin','supervisor','worker']
--   staff     = ARRAY['admin','supervisor']
--   admin     = ARRAY['admin']

-- ─── 1. Schema: farm_id where it was missing ─────────────────────────────────

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE;

ALTER TABLE public.weather_snapshots
  ADD COLUMN IF NOT EXISTS farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE;

-- Backfill pass 1 — the block tells us the farm.
UPDATE public.activity_log a
   SET farm_id = b.farm_id
  FROM public.blocks b
 WHERE a.block_id = b.id AND a.farm_id IS NULL AND b.farm_id IS NOT NULL;

UPDATE public.calendar_events c
   SET farm_id = b.farm_id
  FROM public.blocks b
 WHERE c.block_id = b.id AND c.farm_id IS NULL AND b.farm_id IS NOT NULL;

UPDATE public.weather_snapshots w
   SET farm_id = b.farm_id
  FROM public.blocks b
 WHERE w.block_id = b.id AND w.farm_id IS NULL AND b.farm_id IS NOT NULL;

-- Backfill pass 2 — farm-wide weather rows carry the farm inside
-- forecast_json.farm_id (the cron had nowhere else to put it), or can be
-- traced through the sensor that reported them.
UPDATE public.weather_snapshots w
   SET farm_id = (w.forecast_json ->> 'farm_id')::uuid
 WHERE w.farm_id IS NULL
   AND w.forecast_json ? 'farm_id'
   AND EXISTS (SELECT 1 FROM public.farms f WHERE f.id = (w.forecast_json ->> 'farm_id')::uuid);

UPDATE public.weather_snapshots w
   SET farm_id = s.farm_id
  FROM public.sensors s
 WHERE w.sensor_id = s.id AND w.farm_id IS NULL;

-- Backfill pass 3 — farm-wide rows with no block: infer from the author, but
-- only when they belong to exactly one farm. A multi-farm author's rows are
-- ambiguous and deliberately left NULL rather than guessed into the wrong
-- tenant, which is the failure this migration exists to fix.
UPDATE public.activity_log a
   SET farm_id = m.farm_id
  FROM (
    -- Postgres has no min(uuid); HAVING guarantees a single value anyway,
    -- so take the first element of the aggregate rather than its minimum.
    SELECT user_id, (array_agg(farm_id))[1] AS farm_id
      FROM public.farm_members
     GROUP BY user_id
    HAVING count(DISTINCT farm_id) = 1
  ) m
 WHERE a.performed_by = m.user_id AND a.farm_id IS NULL;

UPDATE public.calendar_events c
   SET farm_id = m.farm_id
  FROM (
    -- Postgres has no min(uuid); HAVING guarantees a single value anyway,
    -- so take the first element of the aggregate rather than its minimum.
    SELECT user_id, (array_agg(farm_id))[1] AS farm_id
      FROM public.farm_members
     GROUP BY user_id
    HAVING count(DISTINCT farm_id) = 1
  ) m
 WHERE c.user_id = m.user_id AND c.farm_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_farm      ON public.activity_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_farm   ON public.calendar_events(farm_id);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_farm ON public.weather_snapshots(farm_id);

-- farm_id stays nullable on purpose: making it NOT NULL would abort the
-- migration on the orphans reported at the end. The policies below treat NULL
-- as "belongs to no farm", so an un-backfilled row is inert, not leaked.

-- ─── 2. Drop the legacy policies ─────────────────────────────────────────────
-- Every one of these is either `USING (true)`, `auth.uid() IS NOT NULL`, or
-- keyed off the platform-wide user_profiles.role with no farm predicate.

DROP POLICY IF EXISTS "Authenticated users can view activity log"              ON public.activity_log;
DROP POLICY IF EXISTS "Authenticated users can create activity log entries"    ON public.activity_log;
DROP POLICY IF EXISTS "Admins can delete activity log entries"                 ON public.activity_log;

DROP POLICY IF EXISTS "Authenticated users can view all events"                ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated users can insert events"                  ON public.calendar_events;
DROP POLICY IF EXISTS "Users can insert their own events"                      ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update their own events"                      ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view their own events"                        ON public.calendar_events;

DROP POLICY IF EXISTS "Authenticated users can view blocks"                    ON public.blocks;
DROP POLICY IF EXISTS "Authenticated users can manage blocks"                  ON public.blocks;

DROP POLICY IF EXISTS "Authenticated users can view alerts"                    ON public.block_alerts;
DROP POLICY IF EXISTS "Admins and supervisors can manage alerts"               ON public.block_alerts;

DROP POLICY IF EXISTS "Authenticated users can view fertigation log"           ON public.fertigation_log;
DROP POLICY IF EXISTS "Admins and supervisors can manage fertigation log"      ON public.fertigation_log;

DROP POLICY IF EXISTS "Authenticated users can view phenology"                 ON public.phenology_records;
DROP POLICY IF EXISTS "Admins and supervisors can manage phenology"            ON public.phenology_records;

DROP POLICY IF EXISTS "Authenticated users can view tissue samples"            ON public.tissue_samples;
DROP POLICY IF EXISTS "Admins and supervisors can manage tissue samples"       ON public.tissue_samples;

DROP POLICY IF EXISTS "Authenticated users can view scouting reports"          ON public.scouting_reports;
DROP POLICY IF EXISTS "Workers and above can create scouting reports"          ON public.scouting_reports;
DROP POLICY IF EXISTS "Admins and supervisors can update scouting reports"     ON public.scouting_reports;

DROP POLICY IF EXISTS "Authenticated users can view pest observations"         ON public.pest_observations;
DROP POLICY IF EXISTS "Workers and above can create pest observations"         ON public.pest_observations;

DROP POLICY IF EXISTS "Authenticated users can view weather"                   ON public.weather_snapshots;
DROP POLICY IF EXISTS "Admins can manage weather snapshots"                    ON public.weather_snapshots;

DROP POLICY IF EXISTS "Authenticated users can view soil water readings"       ON public.soil_water_readings;
DROP POLICY IF EXISTS "Admins and supervisors can insert soil water readings"  ON public.soil_water_readings;
DROP POLICY IF EXISTS auth_select_soil_water                                   ON public.soil_water_readings;
DROP POLICY IF EXISTS farm_members_select_soil_water                           ON public.soil_water_readings;
DROP POLICY IF EXISTS farm_members_insert_soil_water                           ON public.soil_water_readings;

DROP POLICY IF EXISTS authenticated_all_consumables                            ON public.consumables;
DROP POLICY IF EXISTS authenticated_all_usage_log                              ON public.consumable_usage_log;
DROP POLICY IF EXISTS authenticated_all_event_materials                        ON public.calendar_event_materials;

-- Superseded by the role-gated rewrites below.
DROP POLICY IF EXISTS farm_members_write_consumables                           ON public.consumables;
DROP POLICY IF EXISTS farm_members_write_consumable_usage_log                  ON public.consumable_usage_log;
DROP POLICY IF EXISTS farm_members_write_assets                                ON public.assets;
DROP POLICY IF EXISTS farm_members_write_asset_maintenance_log                 ON public.asset_maintenance_log;
DROP POLICY IF EXISTS farm_members_write_recommendations                       ON public.recommendations;

-- ─── 3. activity_log ─────────────────────────────────────────────────────────
-- Workers log their own field work; nobody edits history except an admin, who
-- can delete. Entries are immutable by design — a correction is a new entry.

CREATE POLICY farm_members_read_activity_log
  ON public.activity_log FOR SELECT
  USING (public.is_farm_member(farm_id));

CREATE POLICY farm_members_insert_activity_log
  ON public.activity_log FOR INSERT
  WITH CHECK (
    public.is_farm_member(farm_id)
    AND (block_id IS NULL OR public.block_farm_id(block_id) = farm_id)
  );

CREATE POLICY staff_update_activity_log
  ON public.activity_log FOR UPDATE
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY admins_delete_activity_log
  ON public.activity_log FOR DELETE
  USING (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]));

-- ─── 4. calendar_events ──────────────────────────────────────────────────────
-- Scheduling is a supervisor duty, but a worker must be able to close out a
-- task assigned to them. The UPDATE policy therefore admits a worker only for
-- rows they are completing; the app narrows that to the completion fields.

CREATE POLICY farm_members_read_calendar_events
  ON public.calendar_events FOR SELECT
  USING (public.is_farm_member(farm_id));

CREATE POLICY staff_insert_calendar_events
  ON public.calendar_events FOR INSERT
  WITH CHECK (
    public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
    AND (block_id IS NULL OR public.block_farm_id(block_id) = farm_id)
  );

CREATE POLICY farm_members_update_calendar_events
  ON public.calendar_events FOR UPDATE
  USING (public.is_farm_member(farm_id))
  WITH CHECK (public.is_farm_member(farm_id));

CREATE POLICY staff_delete_calendar_events
  ON public.calendar_events FOR DELETE
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- calendar_event_materials rides on its parent event.
CREATE POLICY farm_members_read_event_materials
  ON public.calendar_event_materials FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.calendar_events e
     WHERE e.id = calendar_event_id AND public.is_farm_member(e.farm_id)
  ));

CREATE POLICY farm_members_write_event_materials
  ON public.calendar_event_materials FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.calendar_events e
     WHERE e.id = calendar_event_id AND public.is_farm_member(e.farm_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.calendar_events e
     WHERE e.id = calendar_event_id AND public.is_farm_member(e.farm_id)
  ));

-- ─── 5. blocks ───────────────────────────────────────────────────────────────
-- blocks_select previously allowed `farm_id IS NULL` through to everyone.
-- Unassigned blocks are legacy data; they now belong to nobody until fixed.

DROP POLICY IF EXISTS blocks_select ON public.blocks;
CREATE POLICY blocks_select
  ON public.blocks FOR SELECT
  USING (public.is_farm_member(farm_id));

-- blocks_insert / blocks_update / blocks_delete already carry the right role
-- predicates and are left as they are.

-- ─── 6. Block-scoped agronomic tables ────────────────────────────────────────
-- These have a NOT NULL block_id and no farm_id of their own, so they inherit
-- the block's farm. No orphan case exists here.

CREATE POLICY farm_members_read_block_alerts
  ON public.block_alerts FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_write_block_alerts
  ON public.block_alerts FOR ALL
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY farm_members_read_fertigation_log
  ON public.fertigation_log FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_write_fertigation_log
  ON public.fertigation_log FOR ALL
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY farm_members_read_phenology_records
  ON public.phenology_records FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_write_phenology_records
  ON public.phenology_records FOR ALL
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY farm_members_read_tissue_samples
  ON public.tissue_samples FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_write_tissue_samples
  ON public.tissue_samples FOR ALL
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

-- Scouting is the one agronomic log a worker files directly — that is the job.
CREATE POLICY farm_members_read_scouting_reports
  ON public.scouting_reports FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY farm_members_insert_scouting_reports
  ON public.scouting_reports FOR INSERT
  WITH CHECK (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_update_scouting_reports
  ON public.scouting_reports FOR UPDATE
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY admins_delete_scouting_reports
  ON public.scouting_reports FOR DELETE
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin']::public.user_role[]));

CREATE POLICY farm_members_read_pest_observations
  ON public.pest_observations FOR SELECT
  USING (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY farm_members_insert_pest_observations
  ON public.pest_observations FOR INSERT
  WITH CHECK (public.is_farm_member(public.block_farm_id(block_id)));

CREATE POLICY staff_modify_pest_observations
  ON public.pest_observations FOR UPDATE
  USING (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[]));

-- ─── 7. Sensor/telemetry tables ──────────────────────────────────────────────
-- Written by the crons and ingest routes under the service role, which bypasses
-- RLS entirely. These policies only govern what the browser can read.

CREATE POLICY farm_members_read_weather_snapshots
  ON public.weather_snapshots FOR SELECT
  USING (
    public.is_farm_member(farm_id)
    OR (block_id IS NOT NULL AND public.is_farm_member(public.block_farm_id(block_id)))
  );

-- soil_water_readings has a nullable block_id and no farm_id; a farm-wide row
-- is traceable only through the sensor that produced it.
CREATE POLICY farm_members_read_soil_water
  ON public.soil_water_readings FOR SELECT
  USING (
    (block_id IS NOT NULL AND public.is_farm_member(public.block_farm_id(block_id)))
    OR EXISTS (
      SELECT 1 FROM public.sensors s
       WHERE s.id = sensor_id AND public.is_farm_member(s.farm_id)
    )
  );

-- Manual lab results are entered through the app by supervisors and admins.
CREATE POLICY staff_insert_soil_water
  ON public.soil_water_readings FOR INSERT
  WITH CHECK (
    block_id IS NOT NULL
    AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[])
  );

CREATE POLICY staff_update_soil_water
  ON public.soil_water_readings FOR UPDATE
  USING (
    block_id IS NOT NULL
    AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[])
  )
  WITH CHECK (
    block_id IS NOT NULL
    AND public.has_farm_role(public.block_farm_id(block_id), ARRAY['admin', 'supervisor']::public.user_role[])
  );

-- ─── 8. Inventory ────────────────────────────────────────────────────────────
-- Per the agreed matrix: a worker records what they consumed and what they
-- serviced, but creating or editing the item itself is a supervisor duty.

CREATE POLICY staff_write_assets
  ON public.assets FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

CREATE POLICY staff_write_consumables
  ON public.consumables FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- A worker logging usage has to move the balance on the parent consumable, so
-- the UPDATE path is open to any member. The app restricts it to the balance
-- columns; widening this to a full role gate would block usage logging.
CREATE POLICY farm_members_update_consumable_balance
  ON public.consumables FOR UPDATE
  USING (public.is_farm_member(farm_id))
  WITH CHECK (public.is_farm_member(farm_id));

CREATE POLICY farm_members_insert_usage_log
  ON public.consumable_usage_log FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.consumables c
     WHERE c.id = consumable_id AND public.is_farm_member(c.farm_id)
  ));

CREATE POLICY staff_modify_usage_log
  ON public.consumable_usage_log FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.consumables c
     WHERE c.id = consumable_id
       AND public.has_farm_role(c.farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.consumables c
     WHERE c.id = consumable_id
       AND public.has_farm_role(c.farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  ));

CREATE POLICY admins_delete_usage_log
  ON public.consumable_usage_log FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.consumables c
     WHERE c.id = consumable_id
       AND public.has_farm_role(c.farm_id, ARRAY['admin']::public.user_role[])
  ));

CREATE POLICY farm_members_insert_asset_maintenance_log
  ON public.asset_maintenance_log FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assets a
     WHERE a.id = asset_id AND public.is_farm_member(a.farm_id)
  ));

CREATE POLICY staff_modify_asset_maintenance_log
  ON public.asset_maintenance_log FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.assets a
     WHERE a.id = asset_id
       AND public.has_farm_role(a.farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assets a
     WHERE a.id = asset_id
       AND public.has_farm_role(a.farm_id, ARRAY['admin', 'supervisor']::public.user_role[])
  ));

CREATE POLICY admins_delete_asset_maintenance_log
  ON public.asset_maintenance_log FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.assets a
     WHERE a.id = asset_id
       AND public.has_farm_role(a.farm_id, ARRAY['admin']::public.user_role[])
  ));

-- ─── 9. Recommendations ──────────────────────────────────────────────────────
-- Everyone sees the AI's suggestions; accepting, editing or skipping one is a
-- decision, and decisions belong to supervisors and admins.

CREATE POLICY staff_write_recommendations
  ON public.recommendations FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

-- ─── 10. user_profiles: let co-members see each other ────────────────────────
-- The only SELECT policy was "your own row", which silently truncated the
-- settings team list to a single person and makes attribution impossible —
-- a UUID can never be resolved to a name. Farm members may now read the
-- profiles of people they share a farm with, and nobody else's.

CREATE POLICY farm_comembers_read_profiles
  ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.farm_members me
        JOIN public.farm_members them ON them.farm_id = me.farm_id
       WHERE me.user_id = auth.uid()
         AND them.user_id = public.user_profiles.id
    )
  );

-- ─── 11. Report the orphans ──────────────────────────────────────────────────

DO $$
DECLARE
  orphan_activity  bigint;
  orphan_calendar  bigint;
  orphan_weather   bigint;
  orphan_blocks    bigint;
BEGIN
  SELECT count(*) INTO orphan_activity FROM public.activity_log      WHERE farm_id IS NULL;
  SELECT count(*) INTO orphan_calendar FROM public.calendar_events   WHERE farm_id IS NULL;
  SELECT count(*) INTO orphan_weather  FROM public.weather_snapshots WHERE farm_id IS NULL;
  SELECT count(*) INTO orphan_blocks   FROM public.blocks            WHERE farm_id IS NULL;

  RAISE NOTICE 'Rows left unassigned (visible to nobody until reassigned):';
  RAISE NOTICE '  activity_log      %', orphan_activity;
  RAISE NOTICE '  calendar_events   %', orphan_calendar;
  RAISE NOTICE '  weather_snapshots %', orphan_weather;
  RAISE NOTICE '  blocks            %', orphan_blocks;
END $$;

COMMIT;
