-- Phase 8.5A — the four pre-pilot security findings, proven closed.
--
-- Every assertion here runs as a REAL principal: SET LOCAL ROLE authenticated
-- plus a JWT claim, so RLS is genuinely in force. That matters more than usual
-- for a denial suite, because the easiest way to write a passing security test
-- is to point it at a row the principal could not see anyway. So each denial is
-- preceded by proof that the row exists and is visible to somebody -- and where
-- the principal can read the row, the test asserts they can read it and still
-- cannot change it.
--
-- One transaction, ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  -- Every construct-bearing dimension at 4, every style dimension at 0. The
  -- derived contribution is therefore 1.000 if and only if writing quality is
  -- excluded, which is the property worth pinning in a fixture too.
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;


CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

/** A write that RLS refuses reports "0 rows" rather than raising, so a denial
 *  test has to look at the row afterwards. This asserts the statement changed
 *  nothing AND that the row is still there. */
CREATE OR REPLACE FUNCTION pg_temp.must_not_change(stmt text, probe text, expected bigint, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    NULL; -- a raised refusal is also a refusal
  END;
  EXECUTE probe INTO _n;
  IF _n IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % — probe returned %, expected %', label, _n, expected;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

/** Run a statement and swallow whatever it does. For a principal who cannot
 *  READ the row it is attacking, the probe has to happen outside that
 *  principal's visibility, so the attempt and the check are separate steps. */
CREATE OR REPLACE FUNCTION pg_temp.try(stmt text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture: two employers, an owner, an admin, a member, a participant,
-- a reviewer (content role), and a stranger.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE sg AS
SELECT
  'ac000000-0000-0000-0000-000000000001'::uuid AS employer,
  'ac000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'ac000000-0000-0000-0000-000000000003'::uuid AS participant,
  'ac000000-0000-0000-0000-000000000004'::uuid AS reviewer_user,
  'ac000000-0000-0000-0000-000000000005'::uuid AS member_user,
  'ac000000-0000-0000-0000-000000000006'::uuid AS admin_user,
  'ac000000-0000-0000-0000-000000000007'::uuid AS other_employer,
  'ac000000-0000-0000-0000-000000000008'::uuid AS other_owner,
  'ac000000-0000-0000-0000-000000000009'::uuid AS participant2;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user   FROM sg), 'owner@gate.test'),
  ((SELECT participant  FROM sg), 'participant@gate.test'),
  ((SELECT reviewer_user FROM sg), 'reviewer@gate.test'),
  ((SELECT member_user  FROM sg), 'member@gate.test'),
  ((SELECT admin_user   FROM sg), 'admin@gate.test'),
  ((SELECT other_owner  FROM sg), 'other-owner@gate.test'),
  ((SELECT participant2 FROM sg), 'participant2@gate.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Gate AB', 'gate-ab-security', 'active' FROM sg
UNION ALL SELECT other_employer, 'Annan Gate AB', 'annan-gate-security', 'active' FROM sg;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user,  'owner',  'active' FROM sg
UNION ALL SELECT employer, member_user, 'member', 'active' FROM sg
UNION ALL SELECT employer, admin_user,  'admin',  'active' FROM sg
UNION ALL SELECT other_employer, other_owner, 'owner', 'active' FROM sg;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM sg;

CREATE TEMP TABLE sgv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM sgv),
       'Security gate suite', owner_user, now() + interval '30 days' FROM sg
UNION ALL
SELECT other_employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM sgv),
       'Security gate suite', other_owner, now() + interval '30 days' FROM sg;

GRANT SELECT ON sg, sgv TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP SG1 — assignment permissions'; END $$;

-- =========================================================================
-- Group SG1 — who may assign
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM sg), (SELECT version_id FROM sgv),
  'participant@gate.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM run) = 1,
  'SG1.1 an owner can assign when governance permits');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000006';
CREATE TEMP TABLE run_admin AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM sg), (SELECT version_id FROM sgv),
  'participant2@gate.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM run_admin) = 1,
  'SG1.2 an admin can assign when governance permits');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000005';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM sg), (SELECT version_id FROM sgv), 'participant@gate.test'),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'SG1.3 an ordinary member cannot assign through the canonical SCP path');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM sg), (SELECT version_id FROM sgv), 'participant@gate.test'),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'SG1.4 a participant can never assign');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000008';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM sg), (SELECT version_id FROM sgv), 'participant@gate.test'),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'SG1.5 employer B cannot assign into employer A');
RESET ROLE; RESET request.jwt.claim.sub;

-- Finding 2: the legacy path must not be the wider door. A member could write
-- an assessment_assignments row directly before this phase.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000005';
SELECT pg_temp.must_not_change(format(
  'INSERT INTO public.assessment_assignments
     (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
      recipient_email, assigned_by, invitation_token_hash, expires_at)
   VALUES (%L::uuid, ''security-guard-foundation'',
           (SELECT id FROM public.assessment_versions LIMIT 1), ''p'', ''workforce'',
           ''member-inserted@gate.test'', %L::uuid, ''hash-member-'' || gen_random_uuid()::text,
           now() + interval ''30 days'')',
  (SELECT employer FROM sg), (SELECT member_user FROM sg)),
  format('SELECT count(*) FROM public.assessment_assignments WHERE recipient_email = %L',
         'member-inserted@gate.test'),
  0,
  'SG1.6 an ordinary member cannot insert through the LEGACY assignment path either');
RESET ROLE; RESET request.jwt.claim.sub;

-- …and the same member can still READ, so SG1.6 is a permission result and not
-- an invisible-row artefact.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments
    WHERE employer_id = (SELECT employer FROM sg)) >= 1,
  'SG1.7 the member CAN read the assignment list — the denial above is about writing');
RESET ROLE; RESET request.jwt.claim.sub;

-- Governance still fails closed: recruitment has no approved purpose version.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''recruitment'')',
  (SELECT employer FROM sg), (SELECT version_id FROM sgv), 'participant@gate.test'),
  'SCP_',
  'SG1.8 recruitment still fails closed — no purpose was activated by this phase');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP SG2 — direct writes to attempts, responses and evidence'; END $$;

-- =========================================================================
-- Group SG2 — finding 1
-- =========================================================================

CREATE TEMP TABLE att AS SELECT attempt_id AS id FROM run;
GRANT SELECT ON att TO authenticated;

-- The participant CAN see their own attempt. That is what makes the denials
-- below meaningful rather than vacuous.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 1,
  'SG2.1 the participant can READ their own attempt');

-- One legitimate response, written the only way it may be written. Without it
-- SG2.7 below would be deleting from an empty set and would pass for free.
-- The item is resolved before the role switch: the form bank is authoring
-- content, which a participant cannot read directly and does not need to.
RESET ROLE; RESET request.jwt.claim.sub;
DO $$
DECLARE _iv uuid;
BEGIN
  SELECT iv.id INTO _iv
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a WHERE a.id = (SELECT id FROM att))
     AND iv.item_format = 'constructed_response'
   ORDER BY fi.display_order LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000003', true);
  PERFORM public.scp_save_response((SELECT id FROM att), _iv, NULL, NULL, NULL, 'Ett svar.');
  RESET ROLE;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT id FROM att)) = 1,
  'SG2.1b the participant CAN answer — writing through the RPC is unaffected');

SELECT pg_temp.must_not_change(format(
  'UPDATE public.scp_attempts SET status = ''released'' WHERE id = %L::uuid', (SELECT id FROM att)),
  format('SELECT count(*) FROM public.scp_attempts WHERE id = %L::uuid AND status = ''in_progress''',
         (SELECT id FROM att)),
  1,
  'SG2.2 the participant cannot change their own attempt''s lifecycle');

SELECT pg_temp.must_not_change(
  'INSERT INTO public.scp_competency_evidence
     (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
      contribution, confidence)
   SELECT a.subject_id, (SELECT id FROM public.scp_behaviour_versions LIMIT 1),
          ''assessment_response'', gen_random_uuid(), ''deterministic'', 1.000, 1.000
     FROM public.scp_attempts a WHERE a.id = ' || quote_literal((SELECT id FROM att)) || '::uuid',
  'SELECT count(*) FROM public.scp_competency_evidence WHERE confidence = 1.000 AND contribution = 1.000',
  0,
  'SG2.3 the participant cannot fabricate competency evidence about themselves');
RESET ROLE; RESET request.jwt.claim.sub;

-- The reviewer is the principal the old FOR ALL policies actually exposed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000004';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 1,
  'SG2.4 the reviewer can READ the attempt — they need to, to review it');

SELECT pg_temp.must_not_change(format(
  'DELETE FROM public.scp_attempts WHERE id = %L::uuid', (SELECT id FROM att)),
  format('SELECT count(*) FROM public.scp_attempts WHERE id = %L::uuid', (SELECT id FROM att)),
  1,
  'SG2.5 the reviewer can no longer DELETE an attempt');

SELECT pg_temp.must_not_change(
  'INSERT INTO public.scp_competency_evidence
     (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
      contribution, confidence)
   SELECT a.subject_id, (SELECT id FROM public.scp_behaviour_versions LIMIT 1),
          ''assessment_response'', gen_random_uuid(), ''human_review'', 0.999, 0.999
     FROM public.scp_attempts a WHERE a.id = ' || quote_literal((SELECT id FROM att)) || '::uuid',
  'SELECT count(*) FROM public.scp_competency_evidence WHERE contribution = 0.999',
  0,
  'SG2.6 the reviewer can no longer INSERT evidence outside the review RPC');

SELECT pg_temp.must_not_change(format(
  'DELETE FROM public.scp_candidate_responses WHERE attempt_id = %L::uuid', (SELECT id FROM att)),
  format('SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = %L::uuid',
         (SELECT id FROM att)),
  1,
  'SG2.7 the reviewer can no longer DELETE the candidate''s answer');
RESET ROLE; RESET request.jwt.claim.sub;

-- The employer owner and employer B cannot READ scp_attempts at all: everything
-- an employer sees about an attempt arrives through a SECURITY DEFINER
-- function. That is asserted rather than assumed, because it is the reason the
-- two denials below are probed after RESET ROLE instead of in place.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 0,
  'SG2.8 the commissioning employer has no direct read on the attempt row');
SELECT pg_temp.try(format(
  'UPDATE public.scp_attempts SET scored_at = now() WHERE id = %L::uuid', (SELECT id FROM att)));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT scored_at IS NULL FROM public.scp_attempts WHERE id = (SELECT id FROM att)),
  'SG2.9 …and cannot mark that attempt scored by hand');

-- Cross-tenant.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000008';
SELECT pg_temp.try(format(
  'UPDATE public.scp_attempts SET status = ''abandoned'' WHERE id = %L::uuid', (SELECT id FROM att)));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 'in_progress',
  'SG2.10 employer B cannot mutate employer A''s attempt');

DO $$ BEGIN RAISE NOTICE 'GROUP SG3 — the legitimate flows still work'; END $$;

-- =========================================================================
-- Group SG3 — positive paths, through the authorised functions
-- =========================================================================

CREATE TEMP TABLE sgitems AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a2.form_id FROM public.scp_attempts a2 WHERE a2.id = (SELECT id FROM att));
GRANT SELECT ON sgitems TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT id INTO _att FROM att;
  FOR _it IN SELECT * FROM sgitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT id FROM att)) = 18,
  'SG3.1 save/resume still works through scp_save_response');

DO $$ BEGIN PERFORM public.scp_submit_attempt((SELECT id FROM att)); END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 'submitted',
  'SG3.2 submit still works through scp_submit_attempt');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000004';
DO $$
DECLARE _rv record;
BEGIN
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id = (SELECT id FROM att) AND hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
      CASE WHEN _rv.is_safety_critical THEN 'no_concern' ELSE NULL END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT id FROM att)) = 'scored',
  'SG3.3 review still works through scp_complete_human_review');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
DO $$ BEGIN PERFORM public.scp_release_attempt_report((SELECT id FROM att)); END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT id FROM att)) = 2,
  'SG3.4 release still works and still produces one snapshot per audience');

DO $$ BEGIN RAISE NOTICE 'GROUP SG4 — maturity execution'; END $$;

-- =========================================================================
-- Group SG4 — finding 3
-- =========================================================================

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.scp_compute_maturity(uuid, uuid, text, timestamp with time zone)', 'EXECUTE'),
  'SG4.1 anon cannot execute scp_compute_maturity');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
    'public.scp_compute_maturity(uuid, uuid, text, timestamp with time zone)', 'EXECUTE'),
  'SG4.2 an ordinary authenticated client cannot execute it either');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
    'public.scp_attempt_maturity(uuid, uuid, text, timestamp with time zone)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.scp_attempt_evidence_state(uuid, uuid, text)', 'EXECUTE'),
  'SG4.3 the Phase 8 derivation helpers are closed to clients too');

-- A direct call as a real client is refused rather than merely ungranted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  'SELECT public.scp_compute_maturity(gen_random_uuid(), gen_random_uuid())',
  'permission denied',
  'SG4.4 a direct client call is refused at execution time');
RESET ROLE; RESET request.jwt.claim.sub;

-- …and the authorised workflow still computed a real result, which SG3.4
-- already released. The derivation record proves the algorithm ran.
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(derivation_input) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT id FROM att) AND audience = 'employer') > 0,
  'SG4.5 the authorised release workflow still computes maturity internally');

SELECT pg_temp.ok(
  (SELECT bool_and(x->>'maturity_level' IS NOT NULL)
     FROM public.scp_report_snapshots s, jsonb_array_elements(s.derivation_input) x
    WHERE s.attempt_id = (SELECT id FROM att) AND s.audience = 'employer'),
  'SG4.6 every derived line still records the maturity it came from');

DO $$ BEGIN RAISE NOTICE 'GROUP SG5 — SCP duplicate protection'; END $$;

-- =========================================================================
-- Group SG5 — finding 4
-- =========================================================================

-- The old index keyed on assessment_id, which the single-lineage CHECK forces
-- to NULL for every SCP row. This is the bypass, stated as a fact about the
-- data rather than about the index definition.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments
    WHERE scp_assessment_version_id IS NOT NULL AND assessment_id IS NOT NULL) = 0,
  'SG5.1 every SCP assignment has a NULL legacy key — the old index could never bind');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE indexname = 'scp_assignments_one_open_per_subject_idx'
             AND indexdef ILIKE '%scp_assessment_version_id%'
             AND indexdef ILIKE '%recipient_user_id%'
             AND indexdef ILIKE '%use_case%'),
  'SG5.2 the new protection is keyed on the real SCP lineage');

-- The first assignment (SG1.1) is now finished, so it is no longer open and a
-- fresh assignment for the same person is legitimate.
SELECT pg_temp.ok(
  (SELECT NOT scp_open FROM public.assessment_assignments
    WHERE id = (SELECT assignment_id FROM run)),
  'SG5.3 a finished attempt releases its assignment — reassessment stays possible');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run2 AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM sg), (SELECT version_id FROM sgv),
  'participant@gate.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM run2) = 1,
  'SG5.4 a repeat assignment succeeds once the previous one is complete');

SELECT pg_temp.ok(
  (SELECT scp_open FROM public.assessment_assignments WHERE id = (SELECT assignment_id FROM run2)),
  'SG5.5 the new assignment is marked open');

-- The actual duplicate: same employer, version, person and use case, while one
-- is still open.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM sg), (SELECT version_id FROM sgv), 'participant@gate.test'),
  'SCP_ASSIGNMENT_ALREADY_OPEN',
  'SG5.6 a second OPEN assignment for the same person is refused');
RESET ROLE; RESET request.jwt.claim.sub;

-- The refusal is a domain error. The API layer masks anything without an SCP_
-- token, so this is what decides whether a user sees words or Postgres.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc WHERE proname = 'scp_guard_one_open_assignment'
     AND prosrc LIKE '%SCP_ASSIGNMENT_ALREADY_OPEN%') = 1,
  'SG5.7 the refusal carries a domain token, not a raw constraint name');

-- Tenants do not collide.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000008';
CREATE TEMP TABLE run_other AS
SELECT * FROM public.scp_employer_assign(
  (SELECT other_employer FROM sg), (SELECT version_id FROM sgv),
  'participant@gate.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM run_other) = 1,
  'SG5.8 a different employer may open its own assignment for the same person');

-- Nothing historical was touched by any of it.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT id FROM att)) = 2
  AND (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT id FROM att)) = 18,
  'SG5.9 the completed attempt, its responses and its reports are intact');

-- The lifecycle flag is trigger-owned. Owner/admin retain the two columns the
-- employer cancellation action needs, but cannot lower the uniqueness guard.
SELECT pg_temp.ok(
  has_column_privilege('authenticated', 'public.assessment_assignments',
    'status', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.assessment_assignments',
    'scp_open', 'UPDATE'),
  'SG5.10 authenticated may cancel, but cannot write the derived scp_open flag');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_not_change(format(
  'UPDATE public.assessment_assignments SET scp_open = false WHERE id = %L::uuid',
  (SELECT assignment_id FROM run2)),
  format('SELECT count(*) FROM public.assessment_assignments WHERE id = %L::uuid AND scp_open',
         (SELECT assignment_id FROM run2)),
  1,
  'SG5.11 an owner cannot forge an assignment closed to evade duplicate protection');
RESET ROLE; RESET request.jwt.claim.sub;

-- A released result is history, not something the legacy screen may relabel as
-- cancelled merely because its assignment row still says invited.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'UPDATE public.assessment_assignments SET status = ''cancelled'', cancelled_at = now() '
  'WHERE id = %L::uuid', (SELECT assignment_id FROM run)),
  'SCP_ASSIGNMENT_NOT_CANCELLABLE',
  'SG5.12 a completed SCP attempt cannot be cosmetically cancelled');
RESET ROLE; RESET request.jwt.claim.sub;

-- Put one real response on the open reassessment before cancellation. The
-- cancellation must abandon the attempt, never erase participant work.
DO $$
DECLARE
  _attempt_id uuid := (SELECT attempt_id FROM run2);
  _item_version_id uuid;
BEGIN
  SELECT iv.id INTO _item_version_id
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_attempts a ON a.form_id = fi.form_id
   WHERE a.id = _attempt_id
     AND iv.item_format = 'constructed_response'
   ORDER BY fi.display_order
   LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub',
    'ac000000-0000-0000-0000-000000000003', true);
  PERFORM public.scp_save_response(
    _attempt_id, _item_version_id, NULL, NULL, NULL, 'Svar före avbrott.');
  RESET ROLE;
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM run2)) = 1,
  'SG5.13 the open reassessment contains real participant work before cancellation');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
UPDATE public.assessment_assignments
   SET status = 'cancelled', cancelled_at = now()
 WHERE id = (SELECT assignment_id FROM run2);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status = 'cancelled' AND NOT scp_open
     FROM public.assessment_assignments
    WHERE id = (SELECT assignment_id FROM run2)),
  'SG5.14 cancelling an open SCP assignment atomically releases the uniqueness key');

SELECT pg_temp.ok(
  (SELECT status = 'abandoned' FROM public.scp_attempts
    WHERE id = (SELECT attempt_id FROM run2)),
  'SG5.15 cancellation moves the linked in-progress attempt to abandoned');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM run2)) = 1,
  'SG5.16 cancellation preserves the participant response');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run3 AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM sg), (SELECT version_id FROM sgv),
  'participant@gate.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM run3) = 1,
  'SG5.17 reassignment succeeds after an explicit cancellation');

ROLLBACK;
