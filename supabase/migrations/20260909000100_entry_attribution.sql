-- Run this in the Supabase SQL editor. Apply after 20260909000000_tenant_isolation.sql,
-- which adds the user_profiles read policy this feature depends on — without it
-- a UUID recorded here can never be resolved to a name by the browser.
--
-- ENTRY ATTRIBUTION — who recorded what, with inventory as the priority.
--
-- WHAT WAS ALREADY THERE
-- assets.created_by, consumables.created_by and consumable_usage_log.logged_by
-- were being written on insert but never read back — no query selected them and
-- no component rendered them. The attribution existed in the database and
-- nowhere else.
--
-- WHAT WAS MISSING
--   * asset_maintenance_log.performed_by is free text typed into a form. It
--     names who turned the wrench, which is worth keeping, but it is not an
--     identity — anyone can type anything. There was no record of who entered
--     the row. This adds logged_by alongside it.
--   * addStock() changed both balances and wrote no log line and no actor at
--     all, so stock could appear from nowhere. Restocks now become entries in
--     the usage ledger via entry_type.
--   * Nothing recorded edits. assets and consumables get updated_by/updated_at,
--     stamped by trigger so a direct SQL edit is caught too.
--
-- The ledger keeps balance_after on every line, so a disputed balance can be
-- reconstructed entry by entry rather than trusted.

BEGIN;

-- ─── 1. Who entered a maintenance record ─────────────────────────────────────
-- performed_by (text) stays as-is: it answers "who serviced the machine",
-- which is often a contractor with no account. logged_by answers "who typed
-- this in", which is the accountability question.

ALTER TABLE public.asset_maintenance_log
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.asset_maintenance_log.performed_by IS
  'Free text: who physically did the work (may be a contractor). Not an identity.';
COMMENT ON COLUMN public.asset_maintenance_log.logged_by IS
  'The authenticated user who recorded this entry.';

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_log_logged_by
  ON public.asset_maintenance_log(logged_by);

-- ─── 2. The consumable ledger ────────────────────────────────────────────────
-- consumable_usage_log becomes the single ledger for every balance movement
-- rather than consumption only. A restock was previously invisible.

ALTER TABLE public.consumable_usage_log
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'usage',
  ADD COLUMN IF NOT EXISTS balance_after numeric;

-- Existing rows are all consumption; the default already covers them, but be
-- explicit so a re-run on partially-migrated data lands in a known state.
UPDATE public.consumable_usage_log SET entry_type = 'usage' WHERE entry_type IS NULL;

ALTER TABLE public.consumable_usage_log
  DROP CONSTRAINT IF EXISTS consumable_usage_log_entry_type_check;
ALTER TABLE public.consumable_usage_log
  ADD CONSTRAINT consumable_usage_log_entry_type_check
  CHECK (entry_type IN ('usage', 'restock', 'correction'));

COMMENT ON COLUMN public.consumable_usage_log.entry_type IS
  'usage = stock consumed, restock = stock added, correction = manual adjustment.';
COMMENT ON COLUMN public.consumable_usage_log.balance_after IS
  'Balance immediately after this entry, so a disputed total can be reconstructed. NULL on rows written before attribution existed.';
COMMENT ON COLUMN public.consumable_usage_log.logged_by IS
  'The authenticated user who recorded this entry.';

CREATE INDEX IF NOT EXISTS idx_consumable_usage_log_logged_by
  ON public.consumable_usage_log(logged_by);
CREATE INDEX IF NOT EXISTS idx_consumable_usage_log_entry_type
  ON public.consumable_usage_log(consumable_id, entry_type);

-- ─── 3. Edit attribution on the inventory items themselves ───────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.consumables
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Stamped by trigger rather than by the application, so an edit made straight
-- through SQL or the Supabase table editor is attributed too. Service-role
-- writes have no auth.uid(); those keep whatever the caller passed.
CREATE OR REPLACE FUNCTION public.stamp_updated_by()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assets_stamp_updated ON public.assets;
CREATE TRIGGER trg_assets_stamp_updated
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_by();

DROP TRIGGER IF EXISTS trg_consumables_stamp_updated ON public.consumables;
CREATE TRIGGER trg_consumables_stamp_updated
  BEFORE UPDATE ON public.consumables
  FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_by();

-- ─── 4. Default the actor rather than trusting the client ────────────────────
-- calendar_events.user_id already defaults to auth.uid(). Doing the same for
-- the log tables means an insert that omits the actor still records one, and
-- the WITH CHECK below stops a client from attributing an entry to someone
-- else. The application still passes the id explicitly; this is the backstop.

ALTER TABLE public.consumable_usage_log  ALTER COLUMN logged_by SET DEFAULT auth.uid();
ALTER TABLE public.asset_maintenance_log ALTER COLUMN logged_by SET DEFAULT auth.uid();
ALTER TABLE public.activity_log          ALTER COLUMN performed_by SET DEFAULT auth.uid();

-- Tighten the insert policies from the isolation migration so the recorded
-- actor must be the caller. Service-role writes (crons, the calendar
-- completion path) bypass RLS and are unaffected.

DROP POLICY IF EXISTS farm_members_insert_usage_log ON public.consumable_usage_log;
CREATE POLICY farm_members_insert_usage_log
  ON public.consumable_usage_log FOR INSERT
  WITH CHECK (
    (logged_by IS NULL OR logged_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.consumables c
       WHERE c.id = consumable_id AND public.is_farm_member(c.farm_id)
    )
  );

DROP POLICY IF EXISTS farm_members_insert_asset_maintenance_log ON public.asset_maintenance_log;
CREATE POLICY farm_members_insert_asset_maintenance_log
  ON public.asset_maintenance_log FOR INSERT
  WITH CHECK (
    (logged_by IS NULL OR logged_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assets a
       WHERE a.id = asset_id AND public.is_farm_member(a.farm_id)
    )
  );

DROP POLICY IF EXISTS farm_members_insert_activity_log ON public.activity_log;
CREATE POLICY farm_members_insert_activity_log
  ON public.activity_log FOR INSERT
  WITH CHECK (
    (performed_by IS NULL OR performed_by = auth.uid())
    AND public.is_farm_member(farm_id)
    AND (block_id IS NULL OR public.block_farm_id(block_id) = farm_id)
  );

COMMIT;
