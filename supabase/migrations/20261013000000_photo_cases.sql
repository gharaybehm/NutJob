-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai), after
-- 20261009000400_decision_engine_decisions.sql.
--
-- Photo cases (Requirements.md, Photo cases): a field user photographs a
-- problem on a tree, 1 to 3 photos per case; the photos are kept against the
-- block and a supervisor or admin sees possible causes. Additive only.
--
--   1. photo_cases           one row per case, written from the user's device
--   2. photo_case_results    possible causes and what it turned out to be
--   3. plant-photos bucket   the photos themselves, private
--   4. farms.photo_causes_enabled   the per-farm switch for the model step
--
-- Who sees what: any farm member may add a case; a worker reads only their
-- own; supervisors and admins read every case on the farm. Possible causes are
-- for supervisors and admins only. The platform operator has no policy on
-- either table or on the bucket.

-- ─── 1. Photo cases ──────────────────────────────────────────────────────────
-- The id is made on the device, so a send that is repeated after a dropped
-- connection lands on the same row instead of making a second one.
CREATE TABLE IF NOT EXISTS public.photo_cases (
  id           uuid PRIMARY KEY,
  farm_id      uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  block_id     text NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  -- When the case was saved on the device, which can be hours before it arrives.
  taken_at     timestamptz NOT NULL,
  note         text CHECK (note IS NULL OR char_length(note) <= 1000),
  -- Storage paths in the plant-photos bucket: <farm_id>/<id>/<n>.jpg, n from 1.
  -- A row can only ever point at its own photos.
  photo_paths  text[] NOT NULL,
  entered_by   uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_cases_paths_are_own CHECK (
    cardinality(photo_paths) BETWEEN 1 AND 3
    AND photo_paths[1] = farm_id::text || '/' || id::text || '/1.jpg'
    AND (cardinality(photo_paths) < 2 OR photo_paths[2] = farm_id::text || '/' || id::text || '/2.jpg')
    AND (cardinality(photo_paths) < 3 OR photo_paths[3] = farm_id::text || '/' || id::text || '/3.jpg')
  )
);

CREATE INDEX IF NOT EXISTS idx_photo_cases_block
  ON public.photo_cases (block_id, taken_at DESC);
-- The daily caps count a user's and a farm's recent cases.
CREATE INDEX IF NOT EXISTS idx_photo_cases_farm_created
  ON public.photo_cases (farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_cases_user_created
  ON public.photo_cases (entered_by, created_at DESC);

ALTER TABLE public.photo_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_photo_cases ON public.photo_cases;
CREATE POLICY staff_read_photo_cases
  ON public.photo_cases FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

DROP POLICY IF EXISTS own_read_photo_cases ON public.photo_cases;
CREATE POLICY own_read_photo_cases
  ON public.photo_cases FOR SELECT
  USING (entered_by = auth.uid() AND public.is_farm_member(farm_id));

DROP POLICY IF EXISTS farm_members_add_photo_cases ON public.photo_cases;
CREATE POLICY farm_members_add_photo_cases
  ON public.photo_cases FOR INSERT
  WITH CHECK (
    public.is_farm_member(farm_id)
    AND public.block_farm_id(block_id) = farm_id
    AND entered_by = auth.uid()
  );

-- No UPDATE or DELETE for users: a case is not edited, and removing one also
-- removes its photos, which the server does after checking the role.
REVOKE ALL ON public.photo_cases FROM anon, authenticated;
GRANT SELECT, INSERT ON public.photo_cases TO authenticated;
GRANT ALL ON public.photo_cases TO service_role;

-- ─── 2. Possible causes ──────────────────────────────────────────────────────
-- Written by the server only. `result` holds what the model returned after the
-- code's own checks: per photo whether it was usable and why not, whether the
-- plant looks healthy, and up to three possible causes with the visible signs
-- each rests on. No confidence figure is stored for display and no product or
-- dose is ever stored. `confirmed_cause` is what a supervisor or admin says it
-- really was.
--   status  pending   waiting for the model
--           done      result holds the answer
--           failed    the model step failed; it can be run again
--           off       not run: `reason` says why (disabled, limit_user, limit_farm)
CREATE TABLE IF NOT EXISTS public.photo_case_results (
  case_id          uuid PRIMARY KEY REFERENCES public.photo_cases(id) ON DELETE CASCADE,
  farm_id          uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'off')),
  reason           text,
  model            text,
  result           jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  confirmed_cause  text CHECK (confirmed_cause IS NULL OR char_length(confirmed_cause) <= 200),
  confirmed_by     uuid REFERENCES auth.users(id),
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_case_results_farm
  ON public.photo_case_results (farm_id);

ALTER TABLE public.photo_case_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_read_photo_case_results ON public.photo_case_results;
CREATE POLICY staff_read_photo_case_results
  ON public.photo_case_results FOR SELECT
  USING (public.has_farm_role(farm_id, ARRAY['admin', 'supervisor']::public.user_role[]));

REVOKE ALL ON public.photo_case_results FROM anon, authenticated;
GRANT SELECT ON public.photo_case_results TO authenticated;
GRANT ALL ON public.photo_case_results TO service_role;

-- ─── 3. The photos ───────────────────────────────────────────────────────────
-- Private bucket, JPEG only, 2 MB per file (the app re-encodes every photo to
-- about 300 to 500 KB before it is stored).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('plant-photos', 'plant-photos', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A member may add a photo only under their own farm's folder, and only at a
-- path of the form <farm uuid>/<case uuid>/<1-3>.jpg. The CASE keeps the cast
-- to uuid from ever running on a name that is not one.
--
-- There is deliberately no SELECT, UPDATE or DELETE policy: photos are shown
-- through short-lived signed links the server makes after checking the role,
-- and removed by the server. So a user cannot read, replace or delete a stored
-- photo directly, their own included.
DROP POLICY IF EXISTS "plant_photos_insert_own_farm" ON storage.objects;
CREATE POLICY "plant_photos_insert_own_farm"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'plant-photos'
    AND CASE
      WHEN name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[1-3]\.jpg$'
        THEN public.is_farm_member(split_part(name, '/', 1)::uuid)
      ELSE false
    END
  );

-- ─── 4. Per-farm switch ──────────────────────────────────────────────────────
-- Off: photos are still taken, checked, stored and shown; the model is not asked.
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS photo_causes_enabled boolean NOT NULL DEFAULT true;
