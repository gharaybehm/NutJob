-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- SECURITY HARDENING — close the holes found in the 2026-10-06 review.
--
-- DEPLOY THE APP FIRST. Sections 5 and 6 take columns away from the
-- `authenticated` role; the app version before this migration still reads them
-- with `select('*')` and would break.
--
-- WHAT WAS WRONG
--   1. user_profiles: the owner's UPDATE policy had no column limit, so any
--      user could set their own `role` to 'super_admin' from the browser.
--   2. farm_members: two leftover INSERT policies let any signed-in user add
--      any membership row, including themselves as admin of any farm.
--   3. soil_water_latest: the one view without security_invoker, so it ignored
--      RLS and returned every farm's latest reading to any signed-in user.
--   4. block_farm_id(): told any signed-in user which farm a block belongs to.
--   5. sensors: the "admins" write policy applied to every farm member, and
--      every member could read the ingest keys.
--   6. farms: every member could read the SenseCAP access key; anyone could
--      insert a farm directly, and an admin could rewrite organization_id,
--      both of which get round the plan's farm limit.
--   7. push_subscriptions: a user could subscribe to another farm's alerts.
--
-- All membership, farm-creation, sensor and credential writes already go
-- through the service-role client in server actions, which this does not touch.
--
-- BEFORE RUNNING, look at who holds a platform role today. Anyone unexpected
-- in this list may have used hole 1 and should be reset by hand:
--   SELECT p.id, u.email, p.role FROM public.user_profiles p
--     JOIN auth.users u ON u.id = p.id
--    WHERE p.role IN ('super_admin', 'admin');
--
-- NOTE FOR LATER MIGRATIONS: farms and sensors now use column-level SELECT
-- grants. A column added to either table is invisible to signed-in users until
-- it is granted here-style: GRANT SELECT (new_column) ON ... TO authenticated;

BEGIN;

-- ─── 1. user_profiles: users may edit their name and phone, never their role ──
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone) ON public.user_profiles TO authenticated;

-- ─── 2. farm_members: no client-side inserts ─────────────────────────────────
DROP POLICY IF EXISTS "farm_members: auth can insert" ON public.farm_members;
DROP POLICY IF EXISTS fm_insert_self                  ON public.farm_members;

-- ─── 3. soil_water_latest: obey the caller's RLS like the other views ────────
ALTER VIEW public.soil_water_latest SET (security_invoker = true);

-- ─── 4. block_farm_id: answer only for the caller's own farms ────────────────
-- Every policy that calls this already requires membership of the same farm,
-- so they evaluate exactly as before. A non-member now gets NULL.
CREATE OR REPLACE FUNCTION public.block_farm_id(target_block text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.farm_id
    FROM public.blocks b
   WHERE b.id = target_block
     AND EXISTS (
       SELECT 1 FROM public.farm_members m
        WHERE m.farm_id = b.farm_id AND m.user_id = auth.uid()
     );
$$;

-- ─── 5. sensors: admin-only writes, ingest key hidden from members ───────────
DROP POLICY IF EXISTS admins_write_sensors ON public.sensors;
CREATE POLICY admins_write_sensors
  ON public.sensors FOR ALL
  USING (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_farm_role(farm_id, ARRAY['admin']::public.user_role[]));

REVOKE SELECT ON public.sensors FROM anon, authenticated;
GRANT SELECT (id, farm_id, block_id, name, device_id, sensor_type, status,
              last_seen_at, location_notes, created_at)
  ON public.sensors TO authenticated;

-- ─── 6. farms: hide the SenseCAP key, limit what a client may write ──────────
DROP POLICY IF EXISTS "farms: auth can create" ON public.farms;
DROP POLICY IF EXISTS farms_insert             ON public.farms;

REVOKE SELECT, UPDATE ON public.farms FROM anon, authenticated;
GRANT SELECT (id, name, slug, gps_lat, gps_lng, gps_zoom, address, total_area,
              area_unit, created_by, created_at, updated_at, climate_profile,
              climate_fetched_at, sensecap_api_id, organization_id)
  ON public.farms TO authenticated;
GRANT UPDATE (name, address, gps_lat, gps_lng, gps_zoom, total_area, area_unit,
              updated_at)
  ON public.farms TO authenticated;

-- ─── 7. push_subscriptions: only for farms the user belongs to ───────────────
DROP POLICY IF EXISTS users_own_push_subscriptions ON public.push_subscriptions;
CREATE POLICY users_own_push_subscriptions
  ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_farm_member(farm_id));

COMMIT;

-- AFTER RUNNING, signed in as an ordinary worker, each of these must fail or
-- return only rows of the worker's own farm (browser console):
--   supabase.from('user_profiles').update({ role: 'super_admin' }).eq('id', myId)
--   supabase.from('farm_members').insert({ farm_id: otherFarm, user_id: myId, role: 'admin' })
--   supabase.from('soil_water_latest').select('*')
--   supabase.from('sensors').select('api_key')
--   supabase.from('farms').select('sensecap_access_key')
