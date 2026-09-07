-- =============================================================================
-- Security Passport — two DIFFERENT first-merit operations, for one holder,
-- genuinely at the same time
--
-- ── WHY THE OTHER RACE FILE DOES NOT COVER THIS ────────────────────────
--
-- security_passport_first_merit_race_test.sql proves that two requests
-- carrying the SAME operation id serialise on the receipt's primary key and
-- are given one canonical answer. It says nothing about two requests carrying
-- DIFFERENT ids -- one person pressing Save in two tabs, or a retry that lost
-- its draft and minted a fresh key. Without a per-holder lock, each inserts
-- its own receipt without conflict, each reaches the current-merit check,
-- each sees no committed merit, and each creates one: two first merits, two
-- declarations, two completions.
--
-- The sequential SP_FIRST_MERIT_ALREADY_EXISTS assertion in the main suite
-- cannot show this either: its second call reads a COMMITTED merit and is
-- refused whether or not anything ever serialised. Only two processes can.
--
-- ── THREE PHASES, DRIVEN BY scripts/db-test.sh ─────────────────────────
--
--   phase=setup    the holder and the scratch table both sessions answer into.
--
--   (the harness)  session A submits operation A and sleeps INSIDE its open
--                  transaction, holding the holder lock. Once A is observed
--                  holding it, session B submits operation B -- a different
--                  id, different facts. The harness times B.
--
--   phase=verify   asserts what the two of them left behind.
--
-- The timing is what proves the LOCK rather than the check around it. B must
-- have WAITED for A to commit; a B that returned in under two seconds never
-- met the lock, and whichever answer it gave is no evidence.
--
-- The expected outcome is asymmetric: A succeeds, B is refused with
-- SP_FIRST_MERIT_ALREADY_EXISTS, and B's own receipt rolls back with the
-- refusal so nothing half-written remains.
-- =============================================================================

\set ON_ERROR_STOP on
SET search_path = public, extensions;

\if :{?phase}
\else
\echo 'FAIL: this suite must be run with -v phase=setup or -v phase=verify'
\quit
\endif

-- The holder is a parameter so the harness can run this file twice on two
-- different people: once against the real function, and once, as a NEGATIVE
-- CONTROL, against a copy of it with the per-holder lock stripped out.
\if :{?holder}
\else
\echo 'FAIL: this suite must be run with -v holder=<uuid>'
\quit
\endif

SELECT CASE WHEN :'phase' = 'setup' THEN 'TRUE' ELSE 'FALSE' END AS is_setup \gset run_

-- -----------------------------------------------------------------------------
-- PHASE 1 of 3 — the holder, and somewhere for the two sessions to answer
-- -----------------------------------------------------------------------------
\if :run_is_setup

INSERT INTO auth.users (id, email) VALUES
  -- The whole uuid, not a prefix: the harness runs this twice on two holders
  -- that share the first eight characters, and auth.users has a partial
  -- unique index on email.
  (:'holder', 'fm-two-ops-' || replace(:'holder', '-', '') || '@example.test')
ON CONFLICT (id) DO NOTHING;

-- Deliberately NO profile row. The lock has to work when the Passport is
-- created inside the operation, which is the harder case; the main suite
-- already covers a pre-existing profile.

DROP TABLE IF EXISTS public.sp_first_merit_two_ops_out;
CREATE TABLE public.sp_first_merit_two_ops_out (
  session      text PRIMARY KEY,
  subject_kind text,
  subject_id   uuid,
  created      boolean,
  refused_with text
);

\echo 'ok  two-ops race setup: the holder and the scratch table are ready'

\endif

-- -----------------------------------------------------------------------------
-- PHASE 3 of 3 — what two concurrent DIFFERENT operations left behind
-- -----------------------------------------------------------------------------
\if :run_is_setup
\else

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- psql does not interpolate :'holder' inside a dollar-quoted body, so it is
-- handed to the block through a session setting.
SELECT set_config('sp_test.two_ops_holder', :'holder', false);

DO $$
DECLARE
  _h uuid := current_setting('sp_test.two_ops_holder')::uuid;
  _a record; _b record; _n bigint; _winner uuid;
BEGIN
  SELECT * INTO _a FROM public.sp_first_merit_two_ops_out WHERE session = 'A';
  SELECT * INTO _b FROM public.sp_first_merit_two_ops_out WHERE session = 'B';

  PERFORM pg_temp.ok(_a.subject_id IS NOT NULL AND _a.created,
    'T.1 the first operation succeeded and created the merit');

  -- THE ASSERTION THE WHOLE FILE EXISTS FOR.
  PERFORM pg_temp.ok(_b.subject_id IS NULL AND _b.refused_with LIKE '%SP_FIRST_MERIT_ALREADY_EXISTS%',
    'T.2 the second operation, a different id, was refused as a second first merit');

  SELECT count(*) INTO _n FROM public.sp_experience_periods
   WHERE holder_user_id = _h AND lifecycle_state = 'active';
  PERFORM pg_temp.ok(_n = 1, 'T.3 exactly one current merit exists');

  SELECT count(*) INTO _n FROM public.sp_claims WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, 'T.4 and the loser''s claim was never written');

  SELECT count(*) INTO _n FROM public.sp_passport_operations
   WHERE holder_user_id = _h AND operation_kind = 'first_merit';
  PERFORM pg_temp.ok(_n = 1, 'T.5 exactly one first-merit receipt');

  SELECT count(*) INTO _n FROM public.sp_passport_operations
   WHERE holder_user_id = _h AND operation_kind = 'first_merit' AND completed_at IS NULL;
  PERFORM pg_temp.ok(_n = 0,
    'T.6 and no incomplete losing receipt remains -- it rolled back with the refusal');

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type IN ('experience_created', 'claim_created');
  PERFORM pg_temp.ok(_n = 1, 'T.7 exactly one creation event');

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'declaration_recorded';
  PERFORM pg_temp.ok(_n = 1, 'T.8 exactly one declaration event');

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'onboarding_completed';
  PERFORM pg_temp.ok(_n = 1, 'T.9 exactly one onboarding-completed event');

  SELECT holder_user_id INTO _winner FROM public.sp_experience_periods WHERE id = _a.subject_id;
  PERFORM pg_temp.ok(_winner = _h, 'T.10 the successful subject belongs to the holder');

  PERFORM pg_temp.ok(
    (SELECT subject_id FROM public.sp_passport_operations
      WHERE holder_user_id = _h AND operation_kind = 'first_merit') = _a.subject_id,
    'T.11 and the one receipt points at it');

  -- The Passport itself was created INSIDE the winning operation, exactly
  -- once, with one receipt and one creation event -- the lock covered the
  -- case where there was no row to lock.
  SELECT count(*) INTO _n FROM public.sp_passport_profiles WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 1, 'T.12 the Passport was created once, inside the operation');
  SELECT count(*) INTO _n FROM public.sp_passport_operations
   WHERE holder_user_id = _h AND operation_kind = 'passport_create';
  PERFORM pg_temp.ok(_n = 1, 'T.13 with one creation receipt');
  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'passport_created';
  PERFORM pg_temp.ok(_n = 1, 'T.14 and one creation event');
END $$;

\endif
