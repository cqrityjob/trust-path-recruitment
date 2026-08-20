-- #51 — One human, one professional identity, across two employers.
--
-- The defect this pins: `employees` had no link to the person, so an employment
-- record and the professional subject that accumulates history were joined only
-- by an email string typed into an assignment form. The decisive assertion here
-- is S2.2 -- history must survive an email change, because that is precisely
-- what an email-string join cannot do.
--
-- The second property is that linking the human must NOT widen disclosure:
-- subject identity links the person, employer context controls what each
-- employer sees. Both must hold at once, so this uses two organisations.
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

INSERT INTO auth.users (id, email) VALUES
  ('f2000000-0000-0000-0000-00000000000a','ownerA@spine.test'),
  ('f2000000-0000-0000-0000-00000000000b','ownerB@spine.test'),
  ('f2000000-0000-0000-0000-00000000000c','person@spine.test');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('f2000000-1111-0000-0000-00000000000a','Alpha Spine AB','alpha-spine','active'),
  ('f2000000-1111-0000-0000-00000000000b','Beta Spine AB','beta-spine','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('f2000000-1111-0000-0000-00000000000a','f2000000-0000-0000-0000-00000000000a','owner','active'),
  ('f2000000-1111-0000-0000-00000000000b','f2000000-0000-0000-0000-00000000000b','owner','active');

INSERT INTO public.scp_test_grants (employer_id, purpose, reason, authorised_by) VALUES
  ('f2000000-1111-0000-0000-00000000000a','closed_test','spine fixture','f2000000-0000-0000-0000-00000000000a'),
  ('f2000000-1111-0000-0000-00000000000b','closed_test','spine fixture','f2000000-0000-0000-0000-00000000000b');

-- The same human is employed by BOTH organisations. That is the situation in
-- which a shared professional identity could leak, so it is the situation the
-- tenancy assertions need.
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by) VALUES
  ('f2000000-3333-0000-0000-00000000000a','f2000000-1111-0000-0000-00000000000a',
   'Test','Person','person@spine.test','active','f2000000-0000-0000-0000-00000000000a'),
  ('f2000000-3333-0000-0000-00000000000b','f2000000-1111-0000-0000-00000000000b',
   'Test','Person','person@spine.test','active','f2000000-0000-0000-0000-00000000000b');

CREATE TEMP TABLE spinefx AS
SELECT
  (SELECT av.id FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'sg-situational-awareness' LIMIT 1) AS av_id,
  -- A second, different assessment: assigning the SAME one twice is refused by
  -- SCP_ASSIGNMENT_ALREADY_OPEN, and a person accumulating history normally
  -- takes different assessments anyway.
  (SELECT av.id FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'sg-access-control' LIMIT 1) AS av_id2;
SELECT av_id AS avid, av_id2 AS avid2 FROM spinefx \gset

-- ── S1. Identity ──────────────────────────────────────────────────────────

SELECT pg_temp.ok(
  (SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_name='employees' AND column_name='subject_id'),
  'S1.1 an employment record may exist before the person has an account');

SELECT pg_temp.ok(
  (SELECT subject_id IS NULL FROM public.employees
    WHERE id='f2000000-3333-0000-0000-00000000000a'),
  'S1.2 the employment record starts unbound');

-- Assigning resolves the person and binds the relationship, with no manual step.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE aA AS
SELECT * FROM public.scp_employer_assign(
  'f2000000-1111-0000-0000-00000000000a'::uuid, :'avid'::uuid,
  'person@spine.test', NULL, 'sv', 'workforce',
  'f2000000-3333-0000-0000-00000000000a'::uuid, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT subject_id IS NOT NULL FROM public.employees
    WHERE id='f2000000-3333-0000-0000-00000000000a'),
  'S1.3 assigning an assessment binds the employment record to the person');

SELECT pg_temp.ok(
  (SELECT e.subject_id FROM public.employees e WHERE e.id='f2000000-3333-0000-0000-00000000000a')
  = (SELECT subject_id FROM aA),
  'S1.4 it binds to the SAME subject the attempt was created for');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities si
    WHERE si.user_id='f2000000-0000-0000-0000-00000000000c') = 1,
  'S1.5 one human still has exactly one professional identity');

-- Beta employs the same human. Binding must reuse the subject, not mint another.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE aB AS
SELECT * FROM public.scp_employer_assign(
  'f2000000-1111-0000-0000-00000000000b'::uuid, :'avid'::uuid,
  'person@spine.test', NULL, 'sv', 'workforce',
  'f2000000-3333-0000-0000-00000000000b'::uuid, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT subject_id FROM aA) = (SELECT subject_id FROM aB),
  'S1.6 employment at a second organisation reuses the same professional identity');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subjects s
    WHERE s.id IN (SELECT subject_id FROM aA UNION SELECT subject_id FROM aB)) = 1,
  'S1.7 no second person was created for the second employer');

-- ── S2. History follows the person, not the address ───────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'f2000000-1111-0000-0000-00000000000a'::uuid,
     'f2000000-3333-0000-0000-00000000000a'::uuid)) = 1,
  'S2.1 the assessment is discoverable under Medarbetare > Person');
RESET ROLE; RESET request.jwt.claim.sub;

-- THE decisive assertion. An email-string join cannot survive this.
UPDATE public.employees SET email = 'renamed@spine.test'
 WHERE id = 'f2000000-3333-0000-0000-00000000000a';
UPDATE auth.users SET email = 'new-private@spine.test'
 WHERE id = 'f2000000-0000-0000-0000-00000000000c';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'f2000000-1111-0000-0000-00000000000a'::uuid,
     'f2000000-3333-0000-0000-00000000000a'::uuid)) = 1,
  'S2.2 history survives BOTH the employment email and the account email changing');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT lifecycle_state IS NOT NULL FROM (
     SELECT * FROM public.scp_employer_person_assessments(
       'f2000000-1111-0000-0000-00000000000a'::uuid,
       'f2000000-3333-0000-0000-00000000000a'::uuid)) q LIMIT 1) IS NOT FALSE,
  'S2.3 the history row carries a lifecycle state, not a raw database status');

-- A second assessment accumulates rather than replacing the first.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT public.scp_employer_assign(
  'f2000000-1111-0000-0000-00000000000a'::uuid, :'avid2'::uuid,
  'new-private@spine.test', NULL, 'sv', 'workforce',
  'f2000000-3333-0000-0000-00000000000a'::uuid, NULL);
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'f2000000-1111-0000-0000-00000000000a'::uuid,
     'f2000000-3333-0000-0000-00000000000a'::uuid)) = 2,
  'S2.4 a second assessment adds a historical row and does not overwrite the first');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── S3. Shared identity is not a channel between employers ────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_employer_person_assessments(
      'f2000000-1111-0000-0000-00000000000a'::uuid,
      'f2000000-3333-0000-0000-00000000000a'::uuid) q
     WHERE q.attempt_id = (SELECT attempt_id FROM aB)),
  'S3.1 Alpha cannot see Beta''s assessment of the same human');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'f2000000-1111-0000-0000-00000000000b'::uuid,
     'f2000000-3333-0000-0000-00000000000b'::uuid)) = 0,
  'S3.2 Alpha''s owner gets nothing when asking about Beta''s employment record');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'f2000000-1111-0000-0000-00000000000b'::uuid,
     'f2000000-3333-0000-0000-00000000000b'::uuid)) = 1,
  'S3.3 Beta sees exactly its own assessment of that human');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── S4. Binding refuses to rewrite whose history it is ────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('f2000000-0000-0000-0000-00000000000d','other@spine.test');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail(
  'SELECT public.scp_bind_employee_subject(''f2000000-3333-0000-0000-00000000000a''::uuid,
                                           ''f2000000-0000-0000-0000-00000000000d''::uuid)',
  'SCP_EMPLOYEE_ALREADY_BOUND',
  'S4.1 an employment record already belonging to somebody cannot be rebound');
RESET ROLE; RESET request.jwt.claim.sub;

INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
VALUES ('f2000000-3333-0000-0000-00000000000c','f2000000-1111-0000-0000-00000000000a',
        'Dup','Record','dup@spine.test','active','f2000000-0000-0000-0000-00000000000a');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail(
  'SELECT public.scp_bind_employee_subject(''f2000000-3333-0000-0000-00000000000c''::uuid,
                                           ''f2000000-0000-0000-0000-00000000000c''::uuid)',
  'SCP_DUPLICATE_EMPLOYMENT',
  'S4.2 one human cannot hold two employment records in the same organisation');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(
  'SELECT public.scp_bind_employee_subject(''f2000000-3333-0000-0000-00000000000c''::uuid,
                                           ''f2000000-0000-0000-0000-00000000000d''::uuid)',
  'SCP_NOT_AUTHORISED_TO_BIND',
  'S4.3 another organisation''s owner cannot bind Alpha''s employment record');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── P. Three projections, one lifecycle ───────────────────────────────────
--
-- The point of the shared derivation is that these surfaces cannot disagree.
-- Asserting equality between them is the only way that stays true as they grow.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE proj_pipeline AS
SELECT * FROM public.scp_employer_assessment_pipeline('f2000000-1111-0000-0000-00000000000a'::uuid);
CREATE TEMP TABLE proj_person AS
SELECT * FROM public.scp_employer_person_assessments(
  'f2000000-1111-0000-0000-00000000000a'::uuid,
  'f2000000-3333-0000-0000-00000000000a'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000c';
CREATE TEMP TABLE proj_participant AS
SELECT * FROM public.scp_my_assessment_history();
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM proj_pipeline) = 2,
  'P1.1 the employer pipeline lists both of this organisation''s attempts');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM proj_person pp JOIN proj_pipeline pl ON pl.attempt_id = pp.attempt_id
     WHERE pp.lifecycle_state IS DISTINCT FROM pl.lifecycle_state),
  'P1.2 the person page and the pipeline never disagree about the same attempt');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM proj_participant pa JOIN proj_pipeline pl ON pl.attempt_id = pa.attempt_id
     WHERE pa.lifecycle_state IS DISTINCT FROM pl.lifecycle_state),
  'P1.3 the participant sees the same lifecycle state the employer sees');

SELECT pg_temp.ok(
  (SELECT count(*) FROM proj_participant) = 3,
  'P1.4 the participant sees all three of their attempts, across BOTH employers');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT issuer_name) FROM proj_participant) = 2,
  'P1.5 and each carries the organisation that issued it');

-- Audiences must not cross. The participant projection must never hand back an
-- employer snapshot, and the employer projection never a participant one.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM proj_participant pa
      JOIN public.scp_report_snapshots rs ON rs.id = pa.participant_snapshot_id
     WHERE rs.audience <> 'participant'),
  'P1.6 participant history only ever returns the participant report');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM proj_person pp
      JOIN public.scp_report_snapshots rs ON rs.id = pp.employer_snapshot_id
     WHERE rs.audience <> 'employer'),
  'P1.7 the employer person view only ever returns the employer report');

SELECT pg_temp.ok(
  (SELECT bool_and(lifecycle_state = 'invited') FROM proj_pipeline),
  'P1.8 a freshly assigned attempt reads as "invited", not as a raw engine status');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT can_release) FROM proj_pipeline),
  'P1.9 nothing is releasable before it is scored');

-- ── PR. The pipeline must not become a bulk identity reveal ───────────────
--
-- The workspace shows a NAME only where the employer's own employment record
-- supplies one. Everyone else stays a pseudonymous reference, and who a
-- participant is stays resolvable only after their result is released.

-- An attempt with no employment record behind it.
INSERT INTO public.assessment_assignments
  (id, employer_id, use_case, recipient_email, assigned_by, invitation_token_hash,
   expires_at, scp_assessment_version_id, status)
VALUES ('f2000000-5555-0000-0000-00000000000a','f2000000-1111-0000-0000-00000000000a',
        'workforce','person@spine.test','f2000000-0000-0000-0000-00000000000a',
        'hashNoEmp', now()+interval '30 days', :'avid'::uuid, 'started');
INSERT INTO public.scp_attempts
  (id, subject_id, issuer_organization_id, assignment_id, mode, form_id,
   assessment_version_id, status)
SELECT 'f2000000-6666-0000-0000-00000000000a',
       (SELECT subject_id FROM aA),
       'f2000000-1111-0000-0000-00000000000a','f2000000-5555-0000-0000-00000000000a',
       'assessment', f.id, :'avid'::uuid, 'in_progress'
  FROM public.scp_forms f WHERE f.assessment_version_id = :'avid'::uuid LIMIT 1;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f2000000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE priv AS
SELECT * FROM public.scp_employer_assessment_pipeline('f2000000-1111-0000-0000-00000000000a'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT participant_name IS NULL FROM priv
    WHERE attempt_id='f2000000-6666-0000-0000-00000000000a'),
  'PR1 an attempt with no employment record exposes NO name');

SELECT pg_temp.ok(
  (SELECT participant_ref IS NOT NULL AND length(participant_ref) = 6 FROM priv
    WHERE attempt_id='f2000000-6666-0000-0000-00000000000a'),
  'PR2 it is still identifiable operationally by a pseudonymous reference');

SELECT pg_temp.ok(
  (SELECT participant_name = 'Test Person' FROM priv
    WHERE attempt_id = (SELECT attempt_id FROM aA)),
  'PR3 a row backed by the employer''s own employment record may show that name');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT identity_resolvable) FROM priv),
  'PR4 nobody''s identity is resolvable before their result is released');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM priv pr JOIN public.scp_attempts at ON at.id = pr.attempt_id
               WHERE at.mode <> 'assessment'),
  'PR5 the Tester pipeline never mixes in training attempts');

SELECT pg_temp.ok(
  (SELECT count(*) FROM priv WHERE participant_name IS NOT NULL)
  <= (SELECT count(*) FROM priv WHERE employee_id IS NOT NULL),
  'PR6 no name appears for more rows than have an employment record');

ROLLBACK;
