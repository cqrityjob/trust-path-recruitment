-- Rollback for 20261031090000_sp_passport_first_merit.sql
--
-- Reverses exactly what that migration created, and nothing else:
--
--   * public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)
--   * public.sp_passport_ensure(text)
--   * public.sp_first_merit_fingerprint(text,text,text,text,date,date)
--   * public.sp_passport_operations                 (the receipts table)
--   * public.sp_events_one_per_operation            (partial unique index)
--   * sp_passport_profiles.onboarding_draft_revision (column)
--   * the tightened sp_events_self_insert policy, restored to its
--     20260817090000 definition
--
-- NO HOLDER DATA IS LOST. Every merit, event, profile row and declaration
-- written through the function stays exactly as written -- the function is a
-- way to write those rows, not a place they live. The `operation_id` already
-- recorded on past creation events is left in place, so re-applying the
-- migration re-creates the index over data that already satisfies it.
--
-- WHAT IS LOST, and it is worth saying plainly: the RECEIPTS. Dropping
-- `sp_passport_operations` discards the idempotency record, so an operation
-- that was already completed can no longer be recognised as a replay. Re-apply
-- and a retry of an old operation id would be treated as new -- and refused by
-- SP_FIRST_MERIT_ALREADY_EXISTS if the holder now has a merit, which is the
-- safe direction. Do not roll this back while first-run traffic is live.
--
-- WHAT YOU GET BACK BY RUNNING THIS
--
-- Nothing calls these once the application release is rolled back with them,
-- so on its own this is inert. Run it in the WRONG order -- while the
-- first-run journey is still deployed -- and every attempt to save a first
-- merit fails with an undefined-function error. That is a hard, visible
-- failure and not a silent one: the journey shows its save error and writes
-- nothing, which is the correct behaviour for a missing server operation.
-- Roll the application back first.
--
-- Safe to run more than once.

DROP FUNCTION IF EXISTS public.sp_passport_complete_first_merit(
  uuid, text, text, text, text, date, date, boolean);

DROP FUNCTION IF EXISTS public.sp_passport_ensure(text);

DROP FUNCTION IF EXISTS public.sp_first_merit_fingerprint(text, text, text, text, date, date);

DROP INDEX IF EXISTS public.sp_events_one_per_operation;

DROP TABLE IF EXISTS public.sp_passport_operations;

ALTER TABLE public.sp_passport_profiles
  DROP CONSTRAINT IF EXISTS sp_profile_draft_revision_non_negative;
ALTER TABLE public.sp_passport_profiles
  DROP COLUMN IF EXISTS onboarding_draft_revision;

-- The events INSERT policy, restored byte-for-byte to 20260817090000. The
-- tightening is dropped WITH the mechanism it protected: leaving it in place
-- would be a rollback that quietly kept half of a release.
DROP POLICY IF EXISTS sp_events_self_insert ON public.sp_passport_events;
CREATE POLICY sp_events_self_insert ON public.sp_passport_events
  FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND actor_user_id = auth.uid());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('sp_passport_complete_first_merit', 'sp_passport_ensure',
                         'sp_first_merit_fingerprint')) THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: a function is still present.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: the index is still present.';
  END IF;
  IF to_regclass('public.sp_passport_operations') IS NOT NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: the operations table is still present.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_passport_profiles'
       AND column_name = 'onboarding_draft_revision') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: the draft revision column is still present.';
  END IF;
  -- The rows the migration's functions may have written are NOT part of what
  -- this reverses, and saying so out loud is the point: an operator running a
  -- rollback needs to know which of the two kinds of change they are undoing.
  RAISE NOTICE 'SP_FIRST_MERIT_ROLLBACK: functions, table, index, column and policy tightening removed. No holder merit, event or profile row was touched.';
END $$;
