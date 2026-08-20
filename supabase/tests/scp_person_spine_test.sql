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

ROLLBACK;
