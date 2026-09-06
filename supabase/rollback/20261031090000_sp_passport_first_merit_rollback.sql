-- Rollback for 20261031090000_sp_passport_first_merit.sql
--
-- Drops the two objects that migration created and nothing else:
--
--   * public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)
--   * public.sp_events_one_per_operation  (partial unique index)
--
-- NO DATA IS LOST. Every merit, event, profile row and declaration written
-- through the function stays exactly as written -- the function is a way to
-- write those rows, not a place they live, and the index is a constraint over
-- a key space that only exists inside `detail`. The `operation_id` already
-- recorded on past creation events is left in place, so re-applying the
-- migration re-creates the index over data that already satisfies it.
--
-- WHAT YOU GET BACK BY RUNNING THIS
--
-- Nothing calls the function once the application release is rolled back with
-- it, so on its own this is inert. Run it in the WRONG order -- while the
-- first-run journey is still deployed -- and every attempt to save a first
-- merit fails with an undefined-function error. That is a hard, visible
-- failure and not a silent one: the journey shows its save error and writes
-- nothing, which is the correct behaviour for a missing server operation.
-- Roll the application back first.
--
-- Safe to run more than once.

DROP FUNCTION IF EXISTS public.sp_passport_complete_first_merit(
  uuid, text, text, text, text, date, date, boolean);

DROP INDEX IF EXISTS public.sp_events_one_per_operation;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: the function is still present.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ROLLBACK: the index is still present.';
  END IF;
  -- The rows the migration's function may have written are NOT part of what
  -- this reverses, and saying so out loud is the point: an operator running a
  -- rollback needs to know which of the two kinds of change they are undoing.
  RAISE NOTICE 'SP_FIRST_MERIT_ROLLBACK: function and index dropped. No holder data was touched.';
END $$;
