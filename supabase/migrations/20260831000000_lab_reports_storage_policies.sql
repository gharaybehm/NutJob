-- Storage RLS for the `lab-reports` bucket.
--
-- WHY THIS EXISTS
-- storage.objects has RLS enabled but the Supabase Cloud project had *no*
-- policies on it at all — 81 policies existed on public.*, zero on storage.*.
-- RLS enabled with no policies denies everything, and app/actions/soilTests.ts
-- uploads with the *user* client rather than the service-role client. So lab
-- report uploads have never worked; storage.objects held 0 rows at migration
-- time, which is the evidence.
--
-- DESIGN — reads are farm-scoped, writes are authenticated-only
-- The upload path is flat (`reports/<uuid>.<ext>`), with no farm id in it, and
-- the client never receives a farmId, so a `foldername[1] = farm_id` policy has
-- nothing to match on. Instead, SELECT is scoped indirectly: an object is
-- readable only if some soil_water_readings row references it. That subquery is
-- itself subject to soil_water_readings' own RLS, so a user can only reach
-- files belonging to readings in their own farms.
--
-- INSERT is deliberately looser: the reading row does not exist yet at upload
-- time, so there is nothing to scope against. The exposure is bounded — a user
-- can write an orphan object into this bucket, but it lands on an unguessable
-- UUID path and stays unreadable unless linked from a row they own.
--
-- FOLLOW-UP (recorded in PROGRESS.md): change the upload path to
-- `<farmId>/reports/<uuid>.<ext>` and scope INSERT on it too. That needs farmId
-- threaded from BlocksPage -> LogTestResultModal -> form -> action, plus a
-- decision about "Whole Farm" tests where no block implies a farm.

-- Readable only when a visible soil_water_readings row points at the object.
DROP POLICY IF EXISTS "lab_reports_select_via_reading" ON storage.objects;
CREATE POLICY "lab_reports_select_via_reading"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lab-reports'
    AND EXISTS (
      SELECT 1
      FROM public.soil_water_readings r
      WHERE r.file_url = storage.objects.name
    )
  );

-- Any authenticated user may upload into this bucket, and only this bucket.
DROP POLICY IF EXISTS "lab_reports_insert_authenticated" ON storage.objects;
CREATE POLICY "lab_reports_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lab-reports');

-- Deliberately no UPDATE or DELETE policy: the app never modifies or removes
-- stored reports, so neither is granted. Cleanup, if it is ever needed, should
-- go through the service-role client in a server action.
