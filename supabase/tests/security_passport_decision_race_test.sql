-- =============================================================================
-- Security Passport — the concurrent decision, for real
--
-- ── WHY THIS IS NOT A GROUP IN THE OTHER FILE ──────────────────────────
--
-- Before this release `sp_verifier_decide` read a request's status and then
-- wrote, holding nothing across the gap. Two reviewers — or one reviewer in
-- two tabs — could both read 'pending', both pass the already-decided check,
-- and both write: two immutable rows in `sp_verification_decisions` for one
-- request, and two Passport events, of which the second records a decision
-- nobody made.
--
-- That defect cannot be demonstrated from one psql session. A session has one
-- transaction, so two calls are two calls in sequence, and the second one sees
-- a COMMITTED row and takes the already-decided branch whether or not a lock
-- was ever held. A sequential test passes identically against the broken
-- function and the fixed one, which makes it worse than no test: it reports a
-- guarantee that was never checked.
--
-- So this file is driven by scripts/db-test.sh in three phases, with two
-- genuinely concurrent psql PROCESSES in between:
--
--   phase=setup    creates a holder, a credential and one pending review, and
--                  prints the request id on the last line of stdout.
--
--   (the harness)  starts session A, which decides and then sleeps INSIDE its
--                  open transaction, holding the row. Once A is confirmed to
--                  hold it, session B decides the same request. The harness
--                  times B.
--
--   phase=verify   asserts what the two of them left behind.
--
-- The timing is the part that proves the LOCK rather than the check around it.
-- B is started only after A is observed holding the row and is refused only
-- after having WAITED for it; a B that returned immediately would mean it read
-- an uncommitted-invisible row and decided independently, which is the defect.
--
-- The cast is the `cb` cast from security_passport_trust_boundary_test.sql,
-- which runs first. This file adds one holder of its own, `...0b`.
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
-- PHASE 1 of 3 -- build the request the two sessions will fight over
-- -----------------------------------------------------------------------------
\if :run_is_setup

INSERT INTO auth.users (id, email) VALUES
  ('cb000000-0000-0000-0000-00000000000b','tb-race-holder@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('cb000000-0000-0000-0000-00000000000b','Rakel Race (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

-- The two reviewers are the platform admins the trust-boundary suite created.
-- Asserted rather than assumed: if that suite stops creating them, this one
-- must fail loudly instead of racing a single reviewer against themselves.
DO $$
BEGIN
  IF NOT public.sp_is_verifier('cb000000-0000-0000-0000-000000000009')
     OR NOT public.sp_is_verifier('cb000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION
      'RACE SETUP FAILED: the two reviewer identities are missing. This suite '
      'runs after security_passport_trust_boundary_test.sql, which creates them.';
  END IF;
END $$;

-- One credential, one pending CQrityjob review. Written as the owner: reaching
-- DOCUMENT_PROVIDED through the evidence workflow is a different suite's job.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-00000000000b'; _claim uuid; _req uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level,
     lifecycle_state, claimed_issuer_name, valid_from, valid_until)
  VALUES (_h,
          (SELECT claim_type FROM public.sp_credential_types WHERE code = 'VU1'),
          (SELECT name_sv FROM public.sp_credential_types WHERE code = 'VU1'),
          'VU1', 'document_provided', 'active',
          'Fiktiv utbildningsanordnare', DATE '2026-01-01', DATE '2027-12-31')
  RETURNING id INTO _claim;

  INSERT INTO public.sp_verification_requests (holder_user_id, request_kind, status, claim_id)
  VALUES (_h, 'cqrityjob_review', 'pending', _claim)
  RETURNING id INTO _req;
END $$;

-- Last line of stdout: the request the two sessions will fight over.
\pset tuples_only on
\pset format unaligned
SELECT id FROM public.sp_verification_requests
 WHERE holder_user_id = 'cb000000-0000-0000-0000-00000000000b';

\endif


-- -----------------------------------------------------------------------------
-- PHASE 3 of 3 -- what the two of them left behind
-- -----------------------------------------------------------------------------
\if :run_is_setup
\else

SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

\echo '    GROUP R -- two concurrent deciders leave one decision'

DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-00000000000b';
        _req uuid; _claim uuid; _n bigint;
BEGIN
  SELECT id, claim_id INTO _req, _claim
    FROM public.sp_verification_requests WHERE holder_user_id = _h;

  -- R.1 The request is decided, once. Not 'pending' (both failed), and it
  --     carries one decided_at, not the second writer's overwriting the first.
  SELECT count(*) INTO _n FROM public.sp_verification_requests
   WHERE id = _req AND status = 'approved' AND decided_at IS NOT NULL
     AND decided_by IS NOT NULL;
  PERFORM pg_temp.ok(_n = 1, 'R.1 the request is decided exactly once');

  -- R.2 THE ASSERTION THIS FILE EXISTS FOR. Before the row lock, both
  --     transactions wrote here.
  SELECT count(*) INTO _n FROM public.sp_verification_decisions
   WHERE request_id = _req AND decision IN ('approved','rejected');
  PERFORM pg_temp.ok(_n = 1, 'R.2 exactly one immutable decision row, not two');

  -- R.3 The winner's record is intact and is one reviewer's, not a blend.
  PERFORM pg_temp.ok(
    (SELECT decision_note FROM public.sp_verification_requests WHERE id = _req)
      = (SELECT decision_note FROM public.sp_verification_decisions
          WHERE request_id = _req AND decision = 'approved'),
    'R.3 the request and its decision row agree on who decided and why');
  PERFORM pg_temp.ok(
    (SELECT decided_by FROM public.sp_verification_requests WHERE id = _req)
      = (SELECT decided_by FROM public.sp_verification_decisions
          WHERE request_id = _req AND decision = 'approved'),
    'R.4 the decider on the request is the decider on the decision');

  -- R.5 One trust transition. The claim cannot be verified twice, but it can
  --     be verified by the loser AFTER the winner, which is what a second
  --     unguarded pass would have done.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    'R.5 the credential is verified');
  PERFORM pg_temp.ok(
    (SELECT verified_by_user_id FROM public.sp_claims WHERE id = _claim)
      = (SELECT decided_by FROM public.sp_verification_requests WHERE id = _req),
    'R.6 and verified by the reviewer who actually won the race');

  -- R.7 The audit is not double-counted. A second event here would be a
  --     decision in the holder's own history that never happened.
  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'verification_decided'
     AND subject_id = _claim;
  PERFORM pg_temp.ok(_n = 1, 'R.7 one verification_decided event in the Passport history');

  -- R.8 The request is closed to further decisions, by the same check that
  --     refused the loser -- so the end state is an ordinary decided request,
  --     not a special one the race left behind.
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req)
      NOT IN ('pending','clarification_requested'),
    'R.8 the request is no longer open');
END $$;

\endif
