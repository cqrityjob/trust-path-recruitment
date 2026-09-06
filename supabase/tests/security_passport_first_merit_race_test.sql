-- =============================================================================
-- Security Passport — two identical first-merit submissions, for real
--
-- ── WHY THIS IS NOT A GROUP IN THE OTHER FILE ──────────────────────────
--
-- "Parallel identical requests cannot create duplicate merits" cannot be
-- shown from one psql session. A session has one transaction, so two calls
-- are two calls in sequence, and the second one reads a COMMITTED creation
-- event and takes the replay branch whether or not anything ever blocked.
-- A sequential test therefore passes identically against a function with no
-- unique index behind it, which makes it worse than no test: it reports a
-- guarantee nobody checked.
--
-- So this file is driven by scripts/db-test.sh in three phases, with two
-- genuinely concurrent psql PROCESSES in between:
--
--   phase=setup    creates the holder and the scratch table the two sessions
--                  write their answers into.
--
--   (the harness)  starts session A, which completes the first merit and then
--                  sleeps INSIDE its open transaction. Once A is observed
--                  holding a lock, session B submits the SAME operation id.
--                  The harness times B.
--
--   phase=verify   asserts what the two of them left behind.
--
-- The timing is what separates "the index serialised them" from "they ran in
-- order". B is started while A holds the row and A holds it for three
-- seconds; a B that returned in under two seconds waited for nothing, and its
-- answer is then no evidence at all.
--
-- The expected outcome is NOT that B is refused. Both callers submitted the
-- same operation, so both must be told the same thing: one merit, one id,
-- twice. B's insert loses on sp_events_one_per_operation, its subtransaction
-- takes its own merit row down with it, and it returns A's subject.
-- =============================================================================

\set ON_ERROR_STOP on
SET search_path = public, extensions;

\if :{?phase}
\else
\echo 'FAIL: this suite must be run with -v phase=setup or -v phase=verify'
\quit
\endif

SELECT CASE WHEN :'phase' = 'setup' THEN 'TRUE' ELSE 'FALSE' END AS is_setup \gset run_

-- -----------------------------------------------------------------------------
-- PHASE 1 of 3 — the holder, and somewhere for the two sessions to answer
-- -----------------------------------------------------------------------------
\if :run_is_setup

INSERT INTO auth.users (id, email) VALUES
  ('fe000000-0000-0000-0000-000000000001', 'fm-race@example.test')
ON CONFLICT (id) DO NOTHING;

-- A real table, not pg_temp: two processes have to write into the same one.
-- Test-only, in the disposable test database, and dropped by nothing because
-- the database itself is dropped at the end of the run.
DROP TABLE IF EXISTS public.sp_first_merit_race_out;
CREATE TABLE public.sp_first_merit_race_out (
  session      text PRIMARY KEY,
  subject_kind text,
  subject_id   uuid,
  created      boolean
);

\echo 'ok  race setup: holder fe...01 and the scratch table are ready'

\endif

-- -----------------------------------------------------------------------------
-- PHASE 3 of 3 — what two concurrent identical submissions left behind
-- -----------------------------------------------------------------------------
\if :run_is_setup
\else

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

DO $$
DECLARE
  _h uuid := 'fe000000-0000-0000-0000-000000000001';
  _a record; _b record; _n bigint;
BEGIN
  SELECT * INTO _a FROM public.sp_first_merit_race_out WHERE session = 'A';
  SELECT * INTO _b FROM public.sp_first_merit_race_out WHERE session = 'B';

  PERFORM pg_temp.ok(_a.subject_id IS NOT NULL AND _b.subject_id IS NOT NULL,
    'R.1 both concurrent sessions returned a merit id');

  -- THE ASSERTION THE WHOLE FILE EXISTS FOR.
  PERFORM pg_temp.ok(_a.subject_id = _b.subject_id,
    'R.2 both concurrent sessions returned the SAME merit id');

  PERFORM pg_temp.ok(_a.created AND NOT _b.created,
    'R.3 exactly one of them reports having created it');

  SELECT count(*) INTO _n FROM public.sp_experience_periods WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 1,
    'R.4 the holder has exactly one employment period, not two');

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'experience_created';
  PERFORM pg_temp.ok(_n = 1, 'R.5 and exactly one creation event');

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h
     AND event_type IN ('onboarding_completed', 'declaration_recorded');
  PERFORM pg_temp.ok(_n = 2,
    'R.6 one completion event and one declaration event, not two of each');

  PERFORM pg_temp.ok(
    (SELECT assertion_level = 'self_declared' AND lifecycle_state = 'active'
       FROM public.sp_experience_periods WHERE holder_user_id = _h),
    'R.7 the surviving merit is self_declared and active');

  -- The loser's own insert is gone, not merely unreferenced. If the
  -- subtransaction had not taken it down, there would be a period with no
  -- creation event -- an orphan nothing in the product could explain.
  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.sp_experience_periods p
       WHERE p.holder_user_id = _h
         AND NOT EXISTS (SELECT 1 FROM public.sp_passport_events e
                          WHERE e.subject_id = p.id AND e.event_type = 'experience_created')),
    'R.8 no merit exists without its creation event');
END $$;

\endif
