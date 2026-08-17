-- Employer Assessment Center — the people model.
--
-- One human is one professional identity; the employment RELATIONSHIP is a
-- property of the assignment, not of the person. These assertions prove that
-- the two cannot be confused:
--
--   * a candidate and an employee are distinguishable
--   * neither is silently converted into the other
--   * the same human keeps ONE subject_id across both relationships, so their
--     attempt history stays continuous
--
-- Everything happens in one transaction that ends in ROLLBACK.

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

-- ---------------------------------------------------------------------------
-- Fixture: one organisation, one human who is BOTH a past candidate and a
-- current employee. That overlap is the interesting case, not an edge case:
-- it is what happens every time a company hires someone it assessed.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_f AS
SELECT
  'aa000000-0000-0000-0000-000000000001'::uuid AS employer,
  'aa000000-0000-0000-0000-000000000002'::uuid AS actor,
  'aa000000-0000-0000-0000-000000000003'::uuid AS person,
  'aa000000-0000-0000-0000-000000000004'::uuid AS other_employer;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT actor FROM t_f),  'people-actor@example.test'),
  ((SELECT person FROM t_f), 'hired-person@example.test');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ((SELECT employer FROM t_f), 'Säkerhet AB', 'sakerhet-ab-people-test', 'active'),
  ((SELECT other_employer FROM t_f), 'Annan Säkerhet AB', 'annan-people-test', 'active');

CREATE TEMP TABLE t_emp AS
WITH ins AS (
  INSERT INTO public.employees (employer_id, first_name, last_name, email, created_by)
  SELECT employer, 'Hired', 'Person', 'hired-person@example.test', actor FROM t_f
  RETURNING id
) SELECT id AS employee FROM ins;

-- Any live version will do: this suite is about the people model, not about a
-- particular instrument. Chosen dynamically rather than hardcoded, because
-- security-guard-foundation is retired and a retirement guard would otherwise
-- fail this suite for a reason that has nothing to do with what it tests.
CREATE TEMP TABLE t_ver AS
SELECT av.id AS ver, av.assessment_id AS aid
  FROM public.assessment_versions av
 WHERE av.retired_at IS NULL
 ORDER BY av.assessment_id
 LIMIT 1;

SELECT pg_temp.ok((SELECT count(*) FROM t_ver) = 1,
  'PM0.1 a live assessment version exists to assign');

DO $$ BEGIN RAISE NOTICE 'GROUP PM1 — the two relationships are distinguishable'; END $$;

-- =========================================================================
-- Group PM1 — a candidate and an employee are different things
-- =========================================================================

-- The recruitment assignment: a candidate. No employee record referenced.
INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, recipient_user_id, assigned_by, invitation_token_hash,
   expires_at, status, completed_at)
SELECT 'bb000000-0000-0000-0000-000000000001', employer, (SELECT aid FROM t_ver),
       (SELECT ver FROM t_ver), 'security_professional', 'recruitment',
       'hired-person@example.test', person, actor, 'hash-recruitment',
       now() + interval '14 days', 'completed', now() - interval '60 days'
  FROM t_f;

-- The workforce assignment: the same human, now staff. No application or job.
INSERT INTO public.assessment_assignments
  (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   employee_id, recipient_email, recipient_user_id, assigned_by,
   invitation_token_hash, expires_at, status)
SELECT 'bb000000-0000-0000-0000-000000000002', employer, (SELECT aid FROM t_ver),
       (SELECT ver FROM t_ver), 'security_professional', 'workforce',
       (SELECT employee FROM t_emp), 'hired-person@example.test', person, actor,
       'hash-workforce', now() + interval '14 days', 'invited'
  FROM t_f;

SELECT pg_temp.ok(
  (SELECT count(DISTINCT use_case) FROM public.assessment_assignments
    WHERE employer_id = (SELECT employer FROM t_f)) = 2,
  'PM1.1 the same human holds both a recruitment and a workforce assignment');

SELECT pg_temp.ok(
  (SELECT employee_id FROM public.assessment_assignments
    WHERE id = 'bb000000-0000-0000-0000-000000000001') IS NULL,
  'PM1.2 the recruitment assignment references no employee record');

SELECT pg_temp.ok(
  (SELECT employee_id FROM public.assessment_assignments
    WHERE id = 'bb000000-0000-0000-0000-000000000002') IS NOT NULL,
  'PM1.3 the workforce assignment does reference the employee record');

DO $$ BEGIN RAISE NOTICE 'GROUP PM2 — neither is silently converted into the other'; END $$;

-- =========================================================================
-- Group PM2 — the contradiction is refused
-- =========================================================================

SELECT pg_temp.must_fail(format(
  $q$INSERT INTO public.assessment_assignments
       (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
        employee_id, recipient_email, assigned_by, invitation_token_hash, expires_at)
     VALUES (%L, %L, %L, 'security_professional',
             'recruitment', %L, 'x@example.test', %L, 'h1', now() + interval '7 days')$q$,
  (SELECT employer FROM t_f), (SELECT aid FROM t_ver), (SELECT ver FROM t_ver),
  (SELECT employee FROM t_emp), (SELECT actor FROM t_f)),
  'assessment_assignments_person_context_agrees',
  'PM2.1 a recruitment assignment may not reference an employee record');

SELECT pg_temp.must_fail(format(
  $q$INSERT INTO public.assessment_assignments
       (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
        job_id, recipient_email, assigned_by, invitation_token_hash, expires_at)
     VALUES (%L, %L, %L, 'security_professional',
             'workforce', %L, 'x@example.test', %L, 'h2', now() + interval '7 days')$q$,
  (SELECT employer FROM t_f), (SELECT aid FROM t_ver), (SELECT ver FROM t_ver),
  gen_random_uuid(), (SELECT actor FROM t_f)),
  'assessment_assignments_person_context_agrees',
  'PM2.2 a workforce assignment may not reference a job');

-- The conversion must also be refused on UPDATE. A constraint that only binds
-- INSERT would let the same reclassification happen one statement later.
SELECT pg_temp.must_fail(
  $q$UPDATE public.assessment_assignments SET use_case = 'recruitment'
      WHERE id = 'bb000000-0000-0000-0000-000000000002'$q$,
  'assessment_assignments_person_context_agrees',
  'PM2.3 an employee''s assignment cannot be relabelled as recruitment');

-- Assigning to a bare email stays legitimate in BOTH directions: a candidate
-- who has not applied yet, and a staff member not yet in the register, are
-- real. If this ever fails, the rule has been over-tightened into something
-- that pushes users toward picking the wrong context.
INSERT INTO public.assessment_assignments
  (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, assigned_by, invitation_token_hash, expires_at)
SELECT employer, (SELECT aid FROM t_ver), (SELECT ver FROM t_ver),
       'security_professional', 'recruitment', 'not-yet-applied@example.test',
       actor, 'h3', now() + interval '7 days' FROM t_f;

INSERT INTO public.assessment_assignments
  (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
   recipient_email, assigned_by, invitation_token_hash, expires_at)
SELECT employer, (SELECT aid FROM t_ver), (SELECT ver FROM t_ver),
       'security_professional', 'workforce', 'not-yet-registered@example.test',
       actor, 'h4', now() + interval '7 days' FROM t_f;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments
    WHERE employer_id = (SELECT employer FROM t_f)
      AND employee_id IS NULL AND application_id IS NULL AND job_id IS NULL) = 3,
  'PM2.4 assigning to a bare email is still allowed in both contexts');

DO $$ BEGIN RAISE NOTICE 'GROUP PM3 — one human, one professional identity'; END $$;

-- =========================================================================
-- Group PM3 — identity continuity across the relationship change
-- =========================================================================

CREATE TEMP TABLE t_subj AS
WITH ins AS (
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id
) SELECT id AS subject FROM ins;

INSERT INTO public.scp_subject_identities (subject_id, user_id)
SELECT (SELECT subject FROM t_subj), person FROM t_f;

-- The load-bearing property: one login resolves to exactly one subject, so
-- being hired does not fork a person's assessment history into two people.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities
    WHERE user_id = (SELECT person FROM t_f)) = 1,
  'PM3.1 the human resolves to exactly one assessment subject');

SELECT pg_temp.must_fail(format(
  'INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (%L, %L)',
  gen_random_uuid(), (SELECT person FROM t_f)),
  'scp_subject_identities_user_id_key',
  'PM3.2 a second subject cannot be linked to the same human');

-- Both relationships resolve to that same subject. This is the assertion that
-- would fail if anybody "fixed" the candidate/employee distinction by giving
-- each context its own person record.
SELECT pg_temp.ok(
  (SELECT count(DISTINCT si.subject_id)
     FROM public.assessment_assignments a
     JOIN public.scp_subject_identities si ON si.user_id = a.recipient_user_id
    WHERE a.employer_id = (SELECT employer FROM t_f)) = 1,
  'PM3.3 both relationships resolve to ONE subject — no duplicate person');

-- scp_subjects holds no personal data. Names and emails stay in profiles,
-- employees and job_applications, reachable only through the identity link.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_subjects'
      AND column_name NOT IN ('id','created_at')) = 0,
  'PM3.4 the subject carries no personal data of its own');

DO $$ BEGIN RAISE NOTICE 'GROUP PM4 — the participant read model'; END $$;

-- =========================================================================
-- Group PM4 — one place to ask who a participant is
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_rm_employer_participants
    WHERE employer_id = (SELECT employer FROM t_f)
      AND recipient_email = 'hired-person@example.test') = 2,
  'PM4.1 the hired person appears once per relationship, not once overall');

-- The read model must NOT carry the subject. Identity resolution is the job of
-- scp_resolve_participant_identity, which checks authorisation; a read model
-- carrying subject_id would turn this list into a re-identification surface.
-- The structural rule is asserted platform-wide at P2A.1; this is the
-- people-model half of it, stated where somebody adding a "convenient"
-- subject_id column to this view would actually be looking.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_rm_employer_participants'
      AND column_name = 'subject_id') = 0,
  'PM4.2 the participant read model exposes no subject_id');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_depend d
     JOIN pg_rewrite rw ON rw.oid = d.objid
     JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind = 'v'
     JOIN pg_class t ON t.oid = d.refobjid
    WHERE t.relname = 'scp_subject_identities'
      AND v.relname = 'scp_rm_employer_participants') = 0,
  'PM4.2b it does not reach scp_subject_identities at all');

SELECT pg_temp.ok(
  (SELECT relationship FROM public.scp_rm_employer_participants
    WHERE employer_id = (SELECT employer FROM t_f)
      AND recipient_email = 'hired-person@example.test'
      AND employee_id IS NOT NULL) = 'workforce',
  'PM4.3 the relationship is reported, not inferred by the caller');

-- The view is security_invoker, so it must not become a cross-tenant read.
-- Checked as a real signed-in user of the OTHER organisation.
INSERT INTO auth.users (id, email)
VALUES ('aa000000-0000-0000-0000-000000000009', 'outsider@example.test');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000009';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_rm_employer_participants) = 0,
  'PM4.4 a signed-in outsider reads no participant of any employer');

RESET ROLE;
RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_rm_employer_participants',
  'permission denied', 'PM4.5 anon cannot read the participant read model');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'employer_people_model_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
