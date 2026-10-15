-- Run this in the Supabase SQL editor (Studio at supabase.rootloot.ai).
--
-- FIX: the organization policies from 20260817100000_create_organizations.sql
-- cannot be evaluated. members_read_organization_members selects from
-- organization_members inside its own USING clause, and Postgres refuses
-- with "infinite recursion detected in policy for relation
-- organization_members". members_read_organizations reads the same table, so
-- it fails the same way. Every read of either table by a signed-in user
-- errors, which app/actions/organizations.ts takes for "no organization":
-- the first farm a user creates would make them a new organization each
-- time, each with its own free seats, so the seat limit would never bite.
--
-- On 2026-10-15 production had no organizations and all four farms had
-- organization_id NULL, so nothing needs cleaning up.
--
-- The fix asks about membership through a SECURITY DEFINER function, which
-- runs as its owner (postgres, the table owner) without the policy and so
-- does not recurse (the same pattern as is_farm_member in
-- 20260909000000_tenant_isolation.sql).
--
-- Once reads work the seat limit applies, so two holes in it are closed here
-- too, where code alone cannot close them:
--   * two first farms at once (double submit, two tabs) each made an
--     organization: a user now owns at most one, and the second call in
--     app/actions/organizations.ts takes the first one's;
--   * two farms at once could each pass the count in createFarm: a trigger
--     now counts under a lock on the organization row.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_organization_member(target_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = target_org AND user_id = auth.uid()
  );
$$;
ALTER FUNCTION public.is_organization_member(uuid) OWNER TO postgres;
-- New functions are executable by PUBLIC; revoking from anon alone does nothing.
REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;

DROP POLICY IF EXISTS members_read_organization_members ON public.organization_members;
CREATE POLICY members_read_organization_members
  ON public.organization_members FOR SELECT
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS members_read_organizations ON public.organizations;
CREATE POLICY members_read_organizations
  ON public.organizations FOR SELECT
  USING (public.is_organization_member(id));

-- A user owns at most one organization (production had none on 2026-10-15).
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_one_owned_per_user
  ON public.organization_members(user_id) WHERE role = 'owner';

-- The seat limit, counted while the organization row is locked so a second
-- concurrent insert waits and then sees the first. createFarm checks the same
-- thing first for its own message.
CREATE OR REPLACE FUNCTION public.enforce_farm_seats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  seats integer;
  used  integer;
BEGIN
  IF NEW.organization_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id) THEN
    RETURN NEW;
  END IF;
  SELECT farm_seats INTO seats FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  SELECT count(*) INTO used FROM public.farms WHERE organization_id = NEW.organization_id AND id <> NEW.id;
  IF used >= seats THEN
    RAISE EXCEPTION 'Your plan''s farm limit has been reached.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.enforce_farm_seats() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.enforce_farm_seats() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_farm_seats ON public.farms;
CREATE TRIGGER enforce_farm_seats
  BEFORE INSERT OR UPDATE OF organization_id ON public.farms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_farm_seats();

COMMIT;

-- AFTER RUNNING, check in the SQL editor that a signed-in read works. Use
-- the id of any user who belongs to an organization (or create one first):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', '<user id>')::text, true);
--   SELECT count(*) FROM public.organization_members;   -- must not error
--   SELECT count(*) FROM public.organizations;          -- must not error
--   ROLLBACK;
-- And: SELECT indexname FROM pg_indexes WHERE indexname = 'organization_members_one_owned_per_user';
--      SELECT tgname FROM pg_trigger WHERE tgname = 'enforce_farm_seats';
