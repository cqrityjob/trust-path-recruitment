-- Admin assignment cancellation — the refusal contract, executed.
--
-- ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
--
-- An admin cancelled a test assignment and was shown
-- ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED. Five unrelated conditions
-- inside admin_cancel_assessment_assignment() and the assessment_assignments
-- table all raise SQLSTATE 23514, so the wrapper could not tell them apart and
-- the constant had to name two of them at once.
--
-- scripts/admin-error-contract-check.ts proves the CLIENT can name every
-- identifier. It cannot prove the database raises them, because it reads source
-- text. This suite executes each condition against real rows and asserts on the
-- error that actually comes back.
--
-- The three assertions that matter most are the ones a manual click cannot
-- make: that a REFUSED cancellation leaves the row and the audit log exactly as
-- they were, that the constraint-violation case names itself instead of leaking
-- the row it failed on, and that cancelling twice does not write two audit rows.
--
-- auth.uid() resolves from request.jwt.claim.sub, so "acting as" someone is a
-- SET LOCAL. Where the Postgres ROLE matters (anon must not even be able to
-- execute), the role is set explicitly too.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

/** Refused, AND refused with the identifier we promised. A test that only
 *  asserts "it failed" would have passed against the defect this suite exists
 *  to prevent -- the old function failed too, it just failed anonymously. */
CREATE OR REPLACE FUNCTION pg_temp.refused(_sql text, _identifier text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF position(_identifier in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%" instead of %',
        _label, _msg, _identifier;
    END IF;
    RAISE NOTICE '    ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

/** The refusal must not carry the database's own vocabulary out with it. */
CREATE OR REPLACE FUNCTION pg_temp.refusal_message(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  EXECUTE _sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
  RETURN _msg;
END $$;

-- ── Fixture ────────────────────────────────────────────────────────────────
-- AD is a platform admin, PL is an ordinary account with no roles at all.

CREATE TEMP TABLE t_f AS
SELECT
  'ac000000-0000-0000-0000-0000000000ad'::uuid AS admin_id,
  'ac000000-0000-0000-0000-000000000011'::uuid AS plain_id,
  'ac000000-1111-0000-0000-000000000001'::uuid AS employer_id,
  'ac000000-2222-0000-0000-000000000001'::uuid AS live_id,
  'ac000000-2222-0000-0000-000000000002'::uuid AS done_id,
  'ac000000-2222-0000-0000-000000000003'::uuid AS legacy_id,
  'ac000000-2222-0000-0000-000000000004'::uuid AS twice_id;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT admin_id FROM t_f), 'cancel-admin@acc.invalid'),
  ((SELECT plain_id FROM t_f), 'cancel-plain@acc.invalid');

INSERT INTO public.user_roles (user_id, role)
  SELECT admin_id, 'admin' FROM t_f;

INSERT INTO public.employers (id, name, slug, status)
  SELECT employer_id, 'Avbryt Test AB', 'avbryt-test-ab', 'active' FROM t_f;

-- Any live version. Chosen dynamically rather than hardcoded so a retirement
-- elsewhere cannot fail this suite for a reason unrelated to cancellation --
-- the same reasoning as employer_people_model_test.sql.
CREATE TEMP TABLE t_ver AS
SELECT av.id AS ver, av.assessment_id AS aid
  FROM public.assessment_versions av
 WHERE av.retired_at IS NULL
 ORDER BY av.assessment_id
 LIMIT 1;

SELECT pg_temp.ok((SELECT count(*) FROM t_ver) = 1,
  'AC0.1 a live assessment version exists to assign');

INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, assigned_by, invitation_token_hash, expires_at, status)
SELECT f.live_id, f.employer_id, v.aid, v.ver, 'security_professional', 'recruitment',
       'cancel-target@acc.invalid', f.admin_id, 'hash-cancel-live',
       now() + interval '14 days', 'invited'
  FROM t_f f, t_ver v;

INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, assigned_by, invitation_token_hash, expires_at, status, completed_at)
SELECT f.done_id, f.employer_id, v.aid, v.ver, 'security_professional', 'recruitment',
       'cancel-done@acc.invalid', f.admin_id, 'hash-cancel-done',
       now() + interval '14 days', 'completed', now() - interval '1 day'
  FROM t_f f, t_ver v;

INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, assigned_by, invitation_token_hash, expires_at, status)
SELECT f.twice_id, f.employer_id, v.aid, v.ver, 'security_professional', 'recruitment',
       'cancel-twice@acc.invalid', f.admin_id, 'hash-cancel-twice',
       now() + interval '14 days', 'invited'
  FROM t_f f, t_ver v;

SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-0000000000ad';


DO $$ BEGIN RAISE NOTICE 'GROUP AC1 — a legitimate cancellation succeeds and is recorded'; END $$;
-- =========================================================================
-- AC1 — contract A: cancellable assignment + valid reason
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT new_status FROM public.admin_cancel_assessment_assignment(
     (SELECT live_id FROM t_f), '  Kandidaten har tackat nej.  ')) = 'cancelled',
  'AC1.1 a cancellable assignment with a valid reason is cancelled');

SELECT pg_temp.ok(
  (SELECT status FROM public.assessment_assignments WHERE id = (SELECT live_id FROM t_f))
    = 'cancelled',
  'AC1.2 the stored status is the new one -- the UI has something to refresh to');

SELECT pg_temp.ok(
  (SELECT cancellation_reason FROM public.assessment_assignments
    WHERE id = (SELECT live_id FROM t_f)) = 'Kandidaten har tackat nej.',
  'AC1.3 the reason is stored trimmed, matching what the form and the schema trim');

SELECT pg_temp.ok(
  (SELECT cancelled_by FROM public.assessment_assignments
    WHERE id = (SELECT live_id FROM t_f)) = (SELECT admin_id FROM t_f)
  AND (SELECT cancelled_at FROM public.assessment_assignments
        WHERE id = (SELECT live_id FROM t_f)) IS NOT NULL,
  'AC1.4 who cancelled it and when are both recorded');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'assignment_cancelled'
      AND subject_id = (SELECT live_id::text FROM t_f)) = 1,
  'AC1.5 exactly one audit row is written');

SELECT pg_temp.ok(
  (SELECT metadata->>'previous_status' FROM public.audit_logs
    WHERE action = 'assignment_cancelled'
      AND subject_id = (SELECT live_id::text FROM t_f)) = 'invited',
  'AC1.6 the audit row records the status it was cancelled FROM');


DO $$ BEGIN RAISE NOTICE 'GROUP AC2 — each refusal names itself'; END $$;
-- =========================================================================
-- AC2 — contracts B, C, D: the three refusals that used to be one string
-- =========================================================================

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT twice_id FROM t_f), ''),
  'ADMIN_CANCEL_REASON_REQUIRED',
  'AC2.1 an empty reason is refused, and says so');

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT twice_id FROM t_f), '     '),
  'ADMIN_CANCEL_REASON_REQUIRED',
  'AC2.2 a whitespace-only reason is refused the same way -- the backend trims too');

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT twice_id FROM t_f), repeat('x', 2001)),
  'ADMIN_CANCEL_REASON_TOO_LONG',
  'AC2.3 a reason over 2000 characters is refused with its OWN identifier');

SELECT pg_temp.ok(
  (SELECT new_status FROM public.admin_cancel_assessment_assignment(
     (SELECT twice_id FROM t_f), repeat('x', 2000))) = 'cancelled',
  'AC2.4 exactly 2000 characters is accepted -- the boundary is inclusive, and the form uses the same number');

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT done_id FROM t_f), 'för sent'),
  'ADMIN_CANCEL_NOT_CANCELLABLE',
  'AC2.5 a completed assignment is refused with the not-cancellable identifier, not the reason one');

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT live_id FROM t_f), 'igen'),
  'ADMIN_CANCEL_NOT_CANCELLABLE',
  'AC2.6 contract G -- cancelling an already-cancelled assignment is refused (the backend half of duplicate-submit protection)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'assignment_cancelled'
      AND subject_id = (SELECT live_id::text FROM t_f)) = 1,
  'AC2.7 the second attempt wrote no second audit row');

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         '00000000-0000-0000-0000-000000000000', 'saknas'),
  'ADMIN_CANCEL_NOT_FOUND',
  'AC2.8 an assignment that does not exist says so, rather than looking non-cancellable');


DO $$ BEGIN RAISE NOTICE 'GROUP AC3 — a refusal changes nothing'; END $$;
-- =========================================================================
-- AC3 — contract E: a refused cancellation leaves the row alone
-- =========================================================================
--
-- The old function refused before the UPDATE for three of its five conditions
-- and DURING it for the other two. "It failed" is not the same statement as
-- "nothing happened", and only the second one is safe.

SELECT pg_temp.ok(
  (SELECT status FROM public.assessment_assignments WHERE id = (SELECT done_id FROM t_f))
    = 'completed'
  AND (SELECT cancellation_reason FROM public.assessment_assignments
        WHERE id = (SELECT done_id FROM t_f)) IS NULL
  AND (SELECT cancelled_by FROM public.assessment_assignments
        WHERE id = (SELECT done_id FROM t_f)) IS NULL,
  'AC3.1 the refused completed assignment is untouched -- status, reason and actor all unchanged');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'assignment_cancelled'
      AND subject_id = (SELECT done_id::text FROM t_f)) = 0,
  'AC3.2 a refused cancellation writes no audit row');


DO $$ BEGIN RAISE NOTICE 'GROUP AC4 — the constraint violation names itself and shows nothing'; END $$;
-- =========================================================================
-- AC4 — contract F: the historical / person-context failure
-- =========================================================================
--
-- assessment_assignments_person_context_agrees was added NOT VALID
-- (20260819090000): it binds every write from then on, and does NOT re-check
-- rows written before it existed. A pre-existing recruitment assignment that
-- carries an employee_id therefore passed its own INSERT and fails EVERY LATER
-- UPDATE -- including a cancellation that is otherwise entirely legitimate.
--
-- The row is built the only way such a row can exist: with the constraint
-- absent, then reinstated NOT VALID exactly as the migration declares it. That
-- is not a contrivance, it is a reproduction of the deployment history.

CREATE TEMP TABLE t_emp AS
WITH ins AS (
  INSERT INTO public.employees (employer_id, first_name, last_name, email, created_by)
  SELECT employer_id, 'Legacy', 'Person', 'cancel-legacy@acc.invalid', admin_id FROM t_f
  RETURNING id
) SELECT id AS employee FROM ins;

ALTER TABLE public.assessment_assignments
  DROP CONSTRAINT assessment_assignments_person_context_agrees;

INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   employee_id, recipient_email, assigned_by, invitation_token_hash, expires_at, status)
SELECT f.legacy_id, f.employer_id, v.aid, v.ver, 'security_professional', 'recruitment',
       (SELECT employee FROM t_emp), 'cancel-legacy@acc.invalid', f.admin_id,
       'hash-cancel-legacy', now() + interval '14 days', 'invited'
  FROM t_f f, t_ver v;

ALTER TABLE public.assessment_assignments
  ADD CONSTRAINT assessment_assignments_person_context_agrees
  CHECK (
    CASE use_case
      WHEN 'recruitment' THEN employee_id IS NULL
      WHEN 'workforce'   THEN application_id IS NULL AND job_id IS NULL
      ELSE true
    END
  ) NOT VALID;

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT legacy_id FROM t_f), 'giltig orsak'),
  'ADMIN_CANCEL_STATE_INCONSISTENT',
  'AC4.1 a row that violates a NOT VALID constraint is refused with its own identifier, not the reason or status one');

-- The whole point. Before this contract, the message that reached the browser
-- was the constraint failure itself: constraint name, relation name, and a
-- DETAIL line containing every column of the row -- recipient email included.
SELECT pg_temp.ok(
  position('person_context_agrees' in pg_temp.refusal_message(
    format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
           (SELECT legacy_id FROM t_f), 'giltig orsak'))) = 0,
  'AC4.2 the refusal does not name the constraint');

SELECT pg_temp.ok(
  position('assessment_assignments' in pg_temp.refusal_message(
    format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
           (SELECT legacy_id FROM t_f), 'giltig orsak'))) = 0,
  'AC4.3 the refusal does not name the relation');

SELECT pg_temp.ok(
  position('cancel-legacy@acc.invalid' in pg_temp.refusal_message(
    format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
           (SELECT legacy_id FROM t_f), 'giltig orsak'))) = 0,
  'AC4.4 the refusal does not carry the row -- no recipient email reaches the client');

SELECT pg_temp.ok(
  (SELECT status FROM public.assessment_assignments WHERE id = (SELECT legacy_id FROM t_f))
    = 'invited'
  AND (SELECT count(*) FROM public.audit_logs
        WHERE action = 'assignment_cancelled'
          AND subject_id = (SELECT legacy_id::text FROM t_f)) = 0,
  'AC4.5 catching the constraint violation did not swallow it -- nothing was written');


DO $$ BEGIN RAISE NOTICE 'GROUP AC5 — the authorization boundary is unchanged'; END $$;
-- =========================================================================
-- AC5 — the boundary this work must not weaken
-- =========================================================================

SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000011';

SELECT pg_temp.refused(
  format('SELECT public.admin_cancel_assessment_assignment(%L, %L)',
         (SELECT legacy_id FROM t_f), 'jag är inte admin'),
  'ADMIN_CANCEL_FORBIDDEN',
  'AC5.1 an ordinary account is refused by the function itself, not by the caller');

SELECT pg_temp.ok(
  (SELECT status FROM public.assessment_assignments WHERE id = (SELECT legacy_id FROM t_f))
    = 'invited',
  'AC5.2 the refused non-admin attempt changed nothing');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.admin_cancel_assessment_assignment(uuid, text)', 'EXECUTE'),
  'AC5.3 anon cannot execute the function at all');

SELECT pg_temp.ok(
  has_function_privilege('authenticated',
    'public.admin_cancel_assessment_assignment(uuid, text)', 'EXECUTE'),
  'AC5.4 authenticated can still execute it -- the grant is unchanged');

SELECT pg_temp.ok(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_cancel_assessment_assignment'),
  'AC5.5 it is still SECURITY DEFINER');

ROLLBACK;
