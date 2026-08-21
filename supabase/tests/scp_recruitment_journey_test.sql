-- The recruitment journey, end to end, as one person.
--
-- ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────
--
-- The flagship assessment already had a suite proving what its REPORT says.
-- This one proves the thing around it: that a human keeps one identity from
-- job application to released report, that an employer can start an assessment
-- from an application without retyping anybody's address, that somebody with
-- no account can still be invited, and that when they later sign up the
-- invitation finds them rather than creating a second person.
--
-- Four properties are asserted as ABSENCES, because each is a wrong outcome
-- that would look perfectly plausible in a demo:
--
--   * no employment record is created for a candidate;
--   * no second subject is created for somebody who already has one;
--   * a pending invitation writes no assignment and no attempt;
--   * one organisation sees none of another's people, applications,
--     assessments, reports or interview evidence.
--
-- Group RJ7 adds the step in front of all of it: opening an application AS a
-- candidate. scp_application_candidate is what turns an application id into
-- the person who made it, and it is asserted both for what it returns (the
-- same stable subject the attempt already belongs to) and for what it must
-- never return: an auth id, an address, a CV path, or one word of another
-- organisation's data.
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

-- ---------------------------------------------------------------------------
-- Fixture: two guarding companies, one job, one applicant with an account, one
-- invitee without one, and a stranger organisation that must see nothing.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE rj AS
SELECT
  'ea000000-1111-0000-0000-000000000001'::uuid AS employer,
  'ea000000-0000-0000-0000-000000000001'::uuid AS owner_user,
  'ea000000-0000-0000-0000-000000000002'::uuid AS anna,       -- has an account, applied
  'ea000000-0000-0000-0000-000000000003'::uuid AS bo,         -- account, no application
  'ea000000-0000-0000-0000-000000000004'::uuid AS cecilia,    -- NO account at invite time
  'ea000000-1111-0000-0000-000000000009'::uuid AS other_employer,
  'ea000000-0000-0000-0000-000000000009'::uuid AS other_owner,
  'ea000000-2222-0000-0000-000000000001'::uuid AS job,
  'ea000000-3333-0000-0000-000000000001'::uuid AS application;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ((SELECT owner_user  FROM rj), 'owner@journey.test',   now()),
  ((SELECT anna        FROM rj), 'anna@journey.test',    now()),
  ((SELECT bo          FROM rj), 'bo@journey.test',      now()),
  ((SELECT other_owner FROM rj), 'other@journey.test',   now());

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Nordvakt Bevakning AB', 'nordvakt-journey', 'active' FROM rj
UNION ALL
SELECT other_employer, 'Annan Bevakning AB', 'annan-journey', 'active' FROM rj;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM rj
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM rj;

-- A live internal posting, created the way the product actually creates one:
-- publishing is moderation-owned, so the insert runs as a platform admin. Going
-- round the guard by inserting a draft and calling it published would make the
-- application below pass a check the real flow has to satisfy.
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-0000000000ad', 'moderator@journey.test', now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('ea000000-0000-0000-0000-0000000000ad', 'admin');

GRANT SELECT ON rj TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en,
                         application_method, status, published_at, expires_at)
SELECT job, 'vaktare-stockholm-journey', 'RJ0001', employer,
       'Väktare, Stockholm', 'Security Officer, Stockholm', 'internal', 'published',
       now() - interval '1 day', now() + interval '30 days'
  FROM rj;
RESET ROLE; RESET request.jwt.claim.sub;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id,
                                     status, consent_given_at)
SELECT application, job, employer, anna, 'submitted', now() FROM rj;

CREATE TEMP TABLE rjv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rjv),
       'Recruitment journey suite', owner_user, now() + interval '30 days' FROM rj
UNION ALL
SELECT other_employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rjv),
       'Recruitment journey suite — second tenant', other_owner, now() + interval '30 days' FROM rj;

GRANT SELECT ON rj, rjv TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP RJ1 — TEST 1: assigning from a job application'; END $$;

-- =========================================================================
-- Group RJ1 — the employer starts from the application, not from an address
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rj_anna AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM rj), (SELECT version_id FROM rjv),
  'anna@journey.test', NULL, 'sv', 'recruitment', NULL, NULL,
  (SELECT application FROM rj), NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_anna TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM rj_anna) = 1,
  'RJ1.1 an assessment can be assigned from a job application');

-- Employer, job, application and assessment all retained on one row.
SELECT pg_temp.ok(
  (SELECT aa.employer_id = (SELECT employer FROM rj)
      AND aa.application_id = (SELECT application FROM rj)
      AND aa.job_id = (SELECT job FROM rj)
      AND aa.use_case = 'recruitment'
      AND aa.scp_assessment_version_id = (SELECT version_id FROM rjv)
     FROM public.assessment_assignments aa
    WHERE aa.id = (SELECT assignment_id FROM rj_anna)),
  'RJ1.2 employer, job, application, assessment and recruitment context are all retained');

-- The job is derived from the application rather than trusted from the caller.
SELECT pg_temp.ok(
  (SELECT aa.job_id FROM public.assessment_assignments aa
    WHERE aa.id = (SELECT assignment_id FROM rj_anna))
  = (SELECT a.job_id FROM public.job_applications a WHERE a.id = (SELECT application FROM rj)),
  'RJ1.3 the job comes from the application, not from what the caller passed');

-- Same human throughout: the attempt's subject is the applicant's subject.
SELECT pg_temp.ok(
  (SELECT si.subject_id FROM public.scp_subject_identities si
    WHERE si.user_id = (SELECT anna FROM rj)) = (SELECT subject_id FROM rj_anna),
  'RJ1.4 the attempt belongs to the applicant''s own subject — one person throughout');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees e
    WHERE e.employer_id = (SELECT employer FROM rj)) = 0,
  'RJ1.5 TEST 1 / no fake employee: assessing a candidate created no employment record');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities si
    WHERE si.user_id = (SELECT anna FROM rj)) = 1,
  'RJ1.6 and exactly one professional identity exists for her');

-- Navigation back: Application -> Assessment -> Report status.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_assessments((SELECT application FROM rj))) = 1,
  'RJ1.7 the recruiter can navigate Application -> Assessment');
SELECT pg_temp.ok(
  (SELECT attempt_id FROM public.scp_application_assessments((SELECT application FROM rj)))
  = (SELECT attempt_id FROM rj_anna),
  'RJ1.8 and reaches the same attempt, not a duplicate object');
RESET ROLE; RESET request.jwt.claim.sub;

-- The mirror-image rules that keep the two contexts from blurring.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''workforce'', NULL, NULL, %L::uuid, NULL)',
  (SELECT employer FROM rj), (SELECT version_id FROM rjv), 'anna@journey.test',
  (SELECT application FROM rj)),
  'SCP_PERSON_CONTEXT_MISMATCH',
  'RJ1.9 a job application cannot be attached to a workforce assignment');

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''recruitment'', NULL, NULL, %L::uuid, NULL)',
  (SELECT employer FROM rj), (SELECT version_id FROM rjv), 'bo@journey.test',
  (SELECT application FROM rj)),
  'SCP_APPLICATION_APPLICANT_MISMATCH',
  'RJ1.10 an assessment cannot be attached to somebody else''s application');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP RJ2 — TEST 2: direct invite, person already exists'; END $$;

-- =========================================================================
-- Group RJ2 — an existing person is reused, never duplicated
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rj_bo AS
SELECT * FROM public.scp_invite_participant(
  (SELECT employer FROM rj), (SELECT version_id FROM rjv),
  '  BO@Journey.TEST  ', 'recruitment', 'Bo Kandidat', 'sv');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_bo TO authenticated;

SELECT pg_temp.ok((SELECT outcome FROM rj_bo) = 'assigned',
  'RJ2.1 inviting somebody who already has an account assigns immediately');

-- Normalisation is a resolution hint doing its job: mixed case and whitespace
-- must not produce a second person.
SELECT pg_temp.ok(
  (SELECT subject_id FROM rj_bo)
  = (SELECT si.subject_id FROM public.scp_subject_identities si
      WHERE si.user_id = (SELECT bo FROM rj)),
  'RJ2.2 TEST 2 / the existing subject is reused, despite case and whitespace');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subjects) =
  (SELECT count(DISTINCT subject_id) FROM public.scp_subject_identities)
  + (SELECT count(*) FROM public.scp_subjects s
      WHERE NOT EXISTS (SELECT 1 FROM public.scp_subject_identities si
                         WHERE si.subject_id = s.id)),
  'RJ2.3 and no orphan duplicate identity was minted');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_invitations
    WHERE email = 'bo@journey.test') = 0,
  'RJ2.4 no pending invitation is left behind when the person already exists');

DO $$ BEGIN RAISE NOTICE 'GROUP RJ3 — TEST 3: direct invite, no account yet'; END $$;

-- =========================================================================
-- Group RJ3 — a pending invitation is an intent, not an assignment
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rj_cec AS
SELECT * FROM public.scp_invite_participant(
  (SELECT employer FROM rj), (SELECT version_id FROM rjv),
  'cecilia@journey.test', 'recruitment', 'Cecilia Sökande', 'sv', NULL,
  (SELECT application FROM rj), NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_cec TO authenticated;

SELECT pg_temp.ok((SELECT outcome FROM rj_cec) = 'invited',
  'RJ3.1 TEST 3 / somebody with no account can still be invited');

SELECT pg_temp.ok(
  (SELECT assignment_id FROM rj_cec) IS NULL
  AND (SELECT attempt_id FROM rj_cec) IS NULL
  AND (SELECT subject_id FROM rj_cec) IS NULL,
  'RJ3.2 and the invitation is an INTENT: no assignment, no attempt, no subject');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments aa
    WHERE aa.recipient_email = 'cecilia@journey.test') = 0,
  'RJ3.3 nothing was written to the assignment table');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees e
    WHERE e.email = 'cecilia@journey.test') = 0,
  'RJ3.4 and no employment record was invented to hold her');

-- Context is retained so the binding can be correct later.
SELECT pg_temp.ok(
  (SELECT i.employer_id = (SELECT employer FROM rj)
      AND i.assessment_version_id = (SELECT version_id FROM rjv)
      AND i.application_id = (SELECT application FROM rj)
      AND i.job_id = (SELECT job FROM rj)
      AND i.use_case = 'recruitment'
      AND i.invited_name = 'Cecilia Sökande'
      AND i.status = 'pending'
     FROM public.scp_assessment_invitations i
    WHERE i.id = (SELECT invitation_id FROM rj_cec)),
  'RJ3.5 employer, assessment, job, application, context and name are all retained');

DO $$ BEGIN RAISE NOTICE 'GROUP RJ4 — TEST 4: the invited person claims an account'; END $$;

-- =========================================================================
-- Group RJ4 — binding, and the two ways it must refuse
-- =========================================================================

-- She signs up. Unconfirmed at first, which must bind nothing: otherwise
-- anybody could sign up as somebody else's address and take delivery.
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT cecilia, 'cecilia@journey.test', NULL FROM rj;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000004';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_claim_assessment_invitations()) = 0,
  'RJ4.1 an unconfirmed address claims nothing');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_assessment_invitations
    WHERE id = (SELECT invitation_id FROM rj_cec)) = 'pending',
  'RJ4.2 and the invitation is still waiting, not consumed');

-- She confirms.
UPDATE auth.users SET email_confirmed_at = now()
 WHERE id = (SELECT cecilia FROM rj);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000004';
CREATE TEMP TABLE rj_claim AS
SELECT * FROM public.scp_claim_assessment_invitations();
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_claim TO authenticated;

SELECT pg_temp.ok(
  (SELECT count(*) FROM rj_claim WHERE outcome = 'bound') = 1,
  'RJ4.3 TEST 4 / a confirmed address binds the invitation');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities si
    WHERE si.user_id = (SELECT cecilia FROM rj)) = 1,
  'RJ4.4 exactly one professional identity was created for her — no duplicate');

SELECT pg_temp.ok(
  (SELECT i.bound_subject_id FROM public.scp_assessment_invitations i
    WHERE i.id = (SELECT invitation_id FROM rj_cec))
  = (SELECT si.subject_id FROM public.scp_subject_identities si
      WHERE si.user_id = (SELECT cecilia FROM rj)),
  'RJ4.5 the invitation bound to that identity, not to a new one');

-- The context survived the round trip.
SELECT pg_temp.ok(
  (SELECT aa.application_id = (SELECT application FROM rj)
      AND aa.job_id = (SELECT job FROM rj)
      AND aa.use_case = 'recruitment'
      AND aa.employee_id IS NULL
     FROM public.assessment_assignments aa
    WHERE aa.id = (SELECT assignment_id FROM rj_claim WHERE outcome = 'bound')),
  'RJ4.6 job, application and recruitment context survived into the assignment');

SELECT pg_temp.ok(
  (SELECT a.governance_mode::text = 'closed_test'
      AND pv.purpose_code = 'closed_test_recruitment'
     FROM public.scp_attempts a
     JOIN public.scp_purpose_versions pv ON pv.id = a.purpose_version_id
    WHERE a.id = (SELECT attempt_id FROM rj_claim WHERE outcome = 'bound')),
  'RJ4.7 and governance was decided at CLAIM time, on today''s grant');

-- Idempotent: claiming again binds nothing twice.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000004';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_claim_assessment_invitations()) = 0,
  'RJ4.8 claiming twice creates nothing the second time');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments aa
    WHERE aa.recipient_email = 'cecilia@journey.test') = 1,
  'RJ4.9 and exactly one assignment exists for her');

-- A withdrawn basis closes the invitation instead of producing an attempt.
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-00000000000e', 'expired@journey.test', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rj_exp AS
SELECT * FROM public.scp_invite_participant(
  (SELECT employer FROM rj), (SELECT version_id FROM rjv),
  'gone@journey.test', 'recruitment', NULL, 'sv');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_exp TO authenticated;

UPDATE public.scp_test_grants SET revoked_at = now()
 WHERE employer_id = (SELECT employer FROM rj);
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-00000000000f', 'gone@journey.test', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-00000000000f';
CREATE TEMP TABLE rj_gone AS SELECT * FROM public.scp_claim_assessment_invitations();
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT outcome FROM rj_gone) = 'expired',
  'RJ4.10 an invitation whose grant was revoked closes instead of binding');

SELECT pg_temp.ok(
  (SELECT closed_reason FROM public.scp_assessment_invitations
    WHERE id = (SELECT invitation_id FROM rj_exp)) = 'governance_basis_withdrawn',
  'RJ4.11 and says why, rather than looking like an expiry');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments aa
    WHERE aa.recipient_email = 'gone@journey.test') = 0,
  'RJ4.12 governance is re-evaluated at claim, so nothing was assigned');

-- Put the grant back for the isolation group.
UPDATE public.scp_test_grants SET revoked_at = NULL
 WHERE employer_id = (SELECT employer FROM rj);

DO $$ BEGIN RAISE NOTICE 'GROUP RJ5 — TEST 12: tenant isolation across the whole journey'; END $$;

-- =========================================================================
-- Group RJ5 — the second organisation sees none of it
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000009';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_assessments((SELECT application FROM rj))) = 0,
  'RJ5.1 another organisation reads no assessment on this one''s application');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     (SELECT employer FROM rj), (SELECT subject_id FROM rj_anna))) = 0,
  'RJ5.2 nor this one''s view of a person');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_invitations((SELECT employer FROM rj))) = 0,
  'RJ5.3 nor its pending invitations');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_invitations) = 0,
  'RJ5.4 and the invitation table itself is empty under RLS');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications) = 0,
  'RJ5.5 nor any of its job applications');

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''recruitment'', NULL, NULL, %L::uuid, NULL)',
  (SELECT other_employer FROM rj), (SELECT version_id FROM rjv), 'anna@journey.test',
  (SELECT application FROM rj)),
  'SCP_APPLICATION_NOT_YOURS',
  'RJ5.6 and cannot attach its own assignment to this one''s application');

RESET ROLE; RESET request.jwt.claim.sub;

-- The owning organisation still sees everything, so the denials above are
-- about the boundary and not about an empty fixture.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_assessments((SELECT application FROM rj))) >= 1,
  'RJ5.7 the owning organisation still reads its own application''s assessments');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     (SELECT employer FROM rj), (SELECT subject_id FROM rj_anna))
    WHERE row_kind = 'application') = 1,
  'RJ5.8 and sees Anna''s application in its own person view');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     (SELECT employer FROM rj), (SELECT subject_id FROM rj_anna))
    WHERE row_kind = 'assessment') = 1,
  'RJ5.9 with the assessment it commissioned beside it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_invitations((SELECT employer FROM rj))
    WHERE status = 'pending') >= 0,
  'RJ5.10 and its own invitation list');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP RJ6 — the candidate''s own view'; END $$;

-- =========================================================================
-- Group RJ6 — what the person sees, and what they do not
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_my_academy_work() WHERE work_kind = 'assessment') = 1,
  'RJ6.1 Anna sees the assessment she was assigned');

-- The job context is what makes it explicable rather than mysterious.
SELECT pg_temp.ok(
  (SELECT job_title_sv FROM public.scp_my_academy_work() WHERE work_kind = 'assessment')
    = 'Väktare, Stockholm'
  AND (SELECT use_case FROM public.scp_my_academy_work() WHERE work_kind = 'assessment')
    = 'recruitment',
  'RJ6.2 and can see which job it relates to, and that it is a recruitment context');

SELECT pg_temp.ok(
  (SELECT employer_name FROM public.scp_my_academy_work() WHERE work_kind = 'assessment')
    = 'Nordvakt Bevakning AB',
  'RJ6.3 and who asked her');

-- Bo was invited by the same employer; Anna must not see his work.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_my_academy_work() w
               JOIN public.scp_attempts a ON a.id = w.work_id
              WHERE a.subject_id <> (SELECT subject_id FROM rj_anna)),
  'RJ6.4 and none of anybody else''s');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP RJ7 — Candidate 360: the application opens a person'; END $$;

-- =========================================================================
-- Group RJ7 — application -> candidate, and what that read must not carry
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';

CREATE TEMP TABLE rj_c360 AS
SELECT * FROM public.scp_application_candidate((SELECT application FROM rj));
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_c360 TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM rj_c360) = 1,
  'RJ7.1 an application opens exactly one candidate, not a list');

-- The whole point of the identity spine: the person the employer opens from an
-- APPLICATION is the same person the ASSESSMENT already belongs to. If these
-- two ever diverged, every downstream surface would be about somebody else
-- while looking entirely correct.
SELECT pg_temp.ok(
  (SELECT subject_id FROM rj_c360) = (SELECT subject_id FROM rj_anna),
  'RJ7.2 the candidate is the SAME stable subject the attempt belongs to');

SELECT pg_temp.ok(
  (SELECT subject_id FROM rj_c360)
  = (SELECT si.subject_id FROM public.scp_subject_identities si
      WHERE si.user_id = (SELECT anna FROM rj)),
  'RJ7.3 resolved through scp_subject_identities, not by matching an address');

-- The job and application context the page renders.
SELECT pg_temp.ok(
  (SELECT c.employer_id = (SELECT employer FROM rj)
      AND c.job_id = (SELECT job FROM rj)
      AND c.job_title_sv = 'Väktare, Stockholm'
      AND c.application_status = 'submitted'
      AND c.applied_at IS NOT NULL
     FROM rj_c360 c),
  'RJ7.4 employer, job, job title, status and application date all come back');

-- has_cv is a fact ABOUT the file, never the path to it: the download stays a
-- short-lived signed URL issued server-side.
SELECT pg_temp.ok(
  (SELECT has_cv FROM rj_c360) = false,
  'RJ7.5 CV presence is reported as a boolean (this fixture attached none)');

UPDATE public.job_applications
   SET cv_storage_path = 'ea000000/cv.pdf', cover_note = 'Jag har fem års erfarenhet.'
 WHERE id = (SELECT application FROM rj);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT c.has_cv = true AND c.cover_note = 'Jag har fem års erfarenhet.'
     FROM public.scp_application_candidate((SELECT application FROM rj)) c),
  'RJ7.6 an attached CV is reported as present, and the cover note comes back');
RESET ROLE; RESET request.jwt.claim.sub;

-- The absences. Each of these is a column somebody would add in good faith to
-- "make the page more useful", and each would hand an employer surface an
-- identity it has no use for.
DO $$
DECLARE _sig text; _bad text;
BEGIN
  _sig := pg_get_function_result('public.scp_application_candidate(uuid)'::regprocedure);
  FOREACH _bad IN ARRAY ARRAY['applicant_user_id','user_id','email','cv_storage_path'] LOOP
    IF _sig ILIKE '%' || _bad || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: RJ7.7 scp_application_candidate exposes "%"', _bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  RJ7.7 the candidate read carries no auth id, no address and no CV path';
END $$;

DO $$
DECLARE _sig text; _bad text;
BEGIN
  _sig := pg_get_function_result('public.scp_application_candidate(uuid)'::regprocedure);
  FOREACH _bad IN ARRAY ARRAY[
    'response_text','selected_option','score_value','is_preferred',
    'scoring_rationale','rubric','option_key'] LOOP
    IF _sig ILIKE '%' || _bad || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: RJ7.8 scp_application_candidate exposes "%"', _bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  RJ7.8 and no raw assessment material of any kind';
END $$;

-- Tenancy, on the read that starts the journey. RJ5 proved it for the three
-- read models that follow; a candidate lookup that leaked would make all three
-- reachable, because it is the thing that hands over the subject id.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000009';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_candidate((SELECT application FROM rj))) = 0,
  'RJ7.9 another organisation opens no candidate from this one''s application');

-- And having been refused the subject, it cannot reach the person view either
-- -- proven with the REAL subject id, so this is the boundary and not a bad
-- guess at an identifier.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     (SELECT other_employer FROM rj), (SELECT subject_id FROM rj_anna))) = 0,
  'RJ7.10 nor this person''s history, even under its OWN employer id');
RESET ROLE; RESET request.jwt.claim.sub;

-- A member with no role beyond membership still reads the candidate: viewing
-- is not assigning. Assigning is owner/admin only, which RJ1 covers.
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-00000000000b', 'member@journey.test', now());
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, 'ea000000-0000-0000-0000-00000000000b', 'member', 'active' FROM rj;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_candidate((SELECT application FROM rj))) = 1,
  'RJ7.11 an ordinary member of the owning organisation reads the candidate');

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_assign_from_application(%L::uuid, %L::uuid, %L::uuid)',
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv)),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'RJ7.12 but cannot assign from it — that stays owner or admin');
RESET ROLE; RESET request.jwt.claim.sub;

-- A suspended member keeps nothing. Membership is checked as ACTIVE, so
-- removing somebody from the organisation removes the candidate with it.
UPDATE public.employer_memberships SET status = 'suspended'
 WHERE user_id = 'ea000000-0000-0000-0000-00000000000b';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_application_candidate((SELECT application FROM rj))) = 0,
  'RJ7.13 a suspended member reads no candidate at all');
RESET ROLE; RESET request.jwt.claim.sub;

-- Somebody who has applied but has never been assessed has NO subject yet, and
-- the read says so rather than minting one. Creating a person as a side effect
-- of opening a page is exactly the duplicate-person failure the spine exists
-- to prevent.
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-00000000000c', 'dagny@journey.test', now());
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id,
                                     status, consent_given_at)
SELECT 'ea000000-3333-0000-0000-000000000002', job, employer,
       'ea000000-0000-0000-0000-00000000000c', 'submitted', now() FROM rj;

CREATE TEMP TABLE rj_subjects_before AS
SELECT count(*) AS n FROM public.scp_subjects;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rj_dagny AS
SELECT * FROM public.scp_application_candidate('ea000000-3333-0000-0000-000000000002');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_dagny, rj_subjects_before TO authenticated;

SELECT pg_temp.ok(
  (SELECT count(*) FROM rj_dagny) = 1 AND (SELECT subject_id FROM rj_dagny) IS NULL,
  'RJ7.14 a candidate who has never been assessed opens, with no subject yet');

SELECT pg_temp.ok(
  (SELECT n FROM rj_subjects_before) = (SELECT count(*) FROM public.scp_subjects),
  'RJ7.15 and reading them minted no person — a read must never create one');

-- The other direction of identity continuity: two applications by the SAME
-- person to the same employer resolve to the same subject, never to two.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id,
                                     status, consent_given_at)
SELECT 'ea000000-3333-0000-0000-000000000003', job, employer, anna, 'withdrawn', now() FROM rj;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT c.subject_id FROM public.scp_application_candidate(
     'ea000000-3333-0000-0000-000000000003') c) = (SELECT subject_id FROM rj_anna),
  'RJ7.16 a second application by the same person opens the SAME subject');

-- Which is what makes the person view a history rather than a fragment.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     (SELECT employer FROM rj), (SELECT subject_id FROM rj_anna))
    WHERE row_kind = 'application') = 2,
  'RJ7.17 and both applications appear on that one person''s timeline');

-- ── The employer has no direct write path to this column at all ──────────
--
-- There is no UPDATE policy (and no table grant) for `authenticated` on
-- job_applications beyond the platform-admin one, so a raw write by an
-- employer either raises outright or matches zero rows. Both are the same
-- invariant -- the write does not land -- and which one it is depends on
-- whether the grant or the policy refuses first, so the assertion is about
-- the OUTCOME rather than about the error.
--
-- This is also why the CHECK constraint cannot be exercised from here: a
-- statement that never reaches the row can never trip it, and a test that
-- "passed" because permission was refused would prove nothing about the
-- column. It is therefore run below, as the owner, where a write really can
-- reach the column and the constraint is the only thing left to stop it.
DO $$
BEGIN
  BEGIN
    EXECUTE 'UPDATE public.job_applications SET status = ''hired'' WHERE id = '
         || quote_literal('ea000000-3333-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

SELECT pg_temp.ok(
  (SELECT a.status FROM public.job_applications a
    WHERE a.id = (SELECT application FROM rj)) = 'submitted',
  'RJ7.18 an employer has no direct UPDATE path: a raw write leaves the status alone');

-- ── The decision is a person's, taken through the governed RPC ───────────
--
-- No score, no ranking and no recommendation reaches this: the employer walks
-- the application through its own lifecycle, one human transition at a time,
-- and the allow-list in set_application_status is what decides which are
-- available. 'hired' is reachable only from 'interview'.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.set_application_status(%L::uuid, ''hired'', NULL)',
  (SELECT application FROM rj)),
  'not allowed',
  'RJ7.19 an application cannot jump straight to hired');

SELECT public.set_application_status((SELECT application FROM rj), 'reviewing', NULL);
SELECT public.set_application_status((SELECT application FROM rj), 'interview', NULL);
CREATE TEMP TABLE rj_hired AS
SELECT * FROM public.set_application_status((SELECT application FROM rj), 'hired', NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rj_hired TO authenticated;

SELECT pg_temp.ok(
  (SELECT new_status FROM rj_hired) = 'hired'
  AND (SELECT previous_status FROM rj_hired) = 'interview',
  'RJ7.20 and reaches hired through the lifecycle, one human step at a time');

-- The point of the whole spine, at the moment it matters most. Hiring must not
-- fork the person: the subject behind the application is the SAME one
-- afterwards, which is what lets an employment relation be created later
-- against the identity that already carries their assessment history.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT c.subject_id FROM public.scp_application_candidate(
     (SELECT application FROM rj)) c) = (SELECT subject_id FROM rj_anna),
  'RJ7.21 hiring preserves the subject -- the same person, now an employee-to-be');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities si
    WHERE si.user_id = (SELECT anna FROM rj)) = 1,
  'RJ7.22 and still exactly one professional identity for her -- no second person');

-- And no employment record was invented on the way. Recruitment ends at a
-- decision; creating the employee is a separate, deliberate act.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees e
    WHERE e.employer_id = (SELECT employer FROM rj)) = 0,
  'RJ7.23 hiring built no employee record as a side effect');

-- ── The column itself, exercised where a write can actually reach it ─────
--
-- The persisted lifecycle is the one the employer already had. Nothing in this
-- work added an assessment state to job_applications.status, and nothing may:
-- assessment progress is a separate lifecycle that the UI composes alongside
-- this one, never merges into it.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.job_applications a
     WHERE a.status NOT IN ('submitted','reviewing','interview','rejected','hired','withdrawn')),
  'RJ7.24 no application carries a status outside the persisted lifecycle');

SELECT pg_temp.must_fail(
  'UPDATE public.job_applications SET status = ''assessment_in_progress'' WHERE id = '
  || quote_literal('ea000000-3333-0000-0000-000000000002'),
  'job_applications_status_check',
  'RJ7.25 and the column refuses an assessment state even to the owner');

-- The mirror, so RJ7.25 is about the VALUE and not about a frozen column:
-- every status that IS the lifecycle still writes.
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY['submitted','reviewing','interview','rejected','hired','withdrawn'] LOOP
    UPDATE public.job_applications SET status = _s
     WHERE id = 'ea000000-3333-0000-0000-000000000002';
  END LOOP;
  RAISE NOTICE 'ok  RJ7.26 and accepts every one of the six that are the lifecycle';
END $$;

ROLLBACK;
