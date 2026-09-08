-- Run this in the Supabase SQL editor, BEFORE 20260909000000_tenant_isolation.sql.
--
-- Repairs the 13 rows (10 calendar_events + 3 activity_log) that have no
-- block_id, and would therefore have no farm once isolation is enforced.
--
-- Ten calendar_events rows carry a block NAME in the legacy `block` text column
-- but no `block_id`. They date from 13 May – 23 June 2026, i.e. mostly before
-- farms existed at all (farms/farm_members landed 30 May 2026), which is why
-- nothing ever linked them to a block row.
--
-- WHY THIS MATTERS FOR ISOLATION
-- A row with no block has no farm, and the tenant-isolation migration cannot
-- work out where it belongs. Its author is the one user who is a member of four
-- farms, so inferring from authorship is ambiguous too. Left alone, these ten
-- rows would end up with a NULL farm_id and disappear from the application.
--
-- They are not actually ambiguous. Every one names a block that exists, and all
-- of those blocks belong to a single farm. So the correct repair is to restore
-- the block_id the row should always have had, rather than stamping a farm on
-- it. Isolation's first backfill pass (block -> blocks.farm_id) then resolves
-- them without a special case, and the events reappear on their blocks in the
-- calendar instead of floating farm-wide.
--
-- SAFETY
-- Only rows whose `block` text matches EXACTLY ONE block row are touched. A
-- name that matches zero or several blocks is left alone and reported, because
-- guessing across farms is the failure this whole exercise exists to prevent.

BEGIN;

-- Report what will be touched, and what will not.
DO $$
DECLARE
  fixable    bigint;
  ambiguous  bigint;
  unmatched  bigint;
BEGIN
  SELECT count(*) INTO fixable
    FROM public.calendar_events c
   WHERE c.block_id IS NULL
     AND c.block IS NOT NULL
     AND (SELECT count(*) FROM public.blocks b WHERE b.name = c.block) = 1;

  SELECT count(*) INTO ambiguous
    FROM public.calendar_events c
   WHERE c.block_id IS NULL
     AND c.block IS NOT NULL
     AND (SELECT count(*) FROM public.blocks b WHERE b.name = c.block) > 1;

  SELECT count(*) INTO unmatched
    FROM public.calendar_events c
   WHERE c.block_id IS NULL
     AND (c.block IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.name = c.block));

  RAISE NOTICE 'calendar_events with no block_id:';
  RAISE NOTICE '  repairable (name matches exactly one block) %', fixable;
  RAISE NOTICE '  ambiguous  (name matches several blocks)   %', ambiguous;
  RAISE NOTICE '  unmatched  (no usable block name)          %', unmatched;
END $$;

UPDATE public.calendar_events c
   SET block_id = b.id
  FROM public.blocks b
 WHERE c.block_id IS NULL
   AND c.block IS NOT NULL
   AND b.name = c.block
   AND (SELECT count(*) FROM public.blocks b2 WHERE b2.name = c.block) = 1;

-- ─── activity_log ────────────────────────────────────────────────────────────
-- Three activity_log rows have no block_id either. All three carry a
-- calendar_event_id, and all three point at events repaired immediately above
-- ("Fertigation", "Block A fertilization", "Block D composte"). They were
-- written by the calendar completion path, which copies block_id from the
-- event — and faithfully copied NULL, because the event had none.
--
-- So they inherit from their parent event. This must run after the UPDATE
-- above, which is why both repairs live in one file rather than two.

UPDATE public.activity_log a
   SET block_id = e.block_id
  FROM public.calendar_events e
 WHERE a.calendar_event_id = e.id
   AND a.block_id IS NULL
   AND e.block_id IS NOT NULL;

-- Confirm the result before committing.
DO $$
DECLARE
  remaining_events   bigint;
  remaining_activity bigint;
BEGIN
  SELECT count(*) INTO remaining_events
    FROM public.calendar_events WHERE block_id IS NULL;
  SELECT count(*) INTO remaining_activity
    FROM public.activity_log WHERE block_id IS NULL;

  RAISE NOTICE 'Still without a block_id after repair:';
  RAISE NOTICE '  calendar_events %', remaining_events;
  RAISE NOTICE '  activity_log    %', remaining_activity;
  RAISE NOTICE 'Both should be 0. If not, do not apply the isolation migration yet.';
END $$;

COMMIT;
