-- P0 lifecycle bridges — one person, from application to employment.
--
-- Two bridges are under test, and they are tested together because they are
-- the same claim seen twice: the person who applies, the person who is
-- assessed, the person who discloses a Passport and the person who ends up in
-- the workforce are ONE subject, and each employer sees only its own
-- relationship with them.
--
--   1. APPLICATION-SCOPED PASSPORT DISCLOSURE
--      The decisive assertions are the negative ones. L1 proves that applying
--      discloses nothing, and that "nothing was shared", "you are not a member"
--      and "no such application" are the SAME response — because any
--      difference between them tells an employer that a Passport exists.
--
--   2. HIRED -> EMPLOYEE, SAME SUBJECT
--      The decisive assertion is H3.2: the subject on the employment record is
--      the subject the recruitment attempt already ran against. A bridge that
--      minted a fresh identity would pass every count assertion here and fail
--      that one.
--
-- Two organisations throughout, because a shared professional identity is
-- exactly where tenancy leaks.
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

-- =========================================================================
-- Fixture
-- =========================================================================

CREATE TEMP TABLE lb AS SELECT
  'fa000000-1111-0000-0000-000000000001'::uuid AS employer,
  'fa000000-1111-0000-0000-000000000002'::uuid AS other_employer,
  'fa000000-0000-0000-0000-000000000001'::uuid AS owner_user,
  'fa000000-0000-0000-0000-000000000002'::uuid AS other_owner,
  'fa000000-0000-0000-0000-000000000003'::uuid AS anna,
  'fa000000-0000-0000-0000-000000000004'::uuid AS bo,
  'fa000000-0000-0000-0000-000000000005'::uuid AS member_user,
  'fa000000-2222-0000-0000-000000000001'::uuid AS job,
  'fa000000-2222-0000-0000-000000000002'::uuid AS other_job,
  'fa000000-3333-0000-0000-000000000001'::uuid AS application,
  'fa000000-3333-0000-0000-000000000002'::uuid AS bo_application,
  'fa000000-3333-0000-0000-000000000003'::uuid AS other_application;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_user,  'owner@lifecycle.test',  now() FROM lb UNION ALL
SELECT other_owner, 'other@lifecycle.test',  now() FROM lb UNION ALL
SELECT anna,        'anna@lifecycle.test',   now() FROM lb UNION ALL
SELECT bo,          'bo@lifecycle.test',     now() FROM lb UNION ALL
SELECT member_user, 'member@lifecycle.test', now() FROM lb;

-- Anna has a display name; Bo deliberately does not get a two-part one, so the
-- name-derivation branch is exercised rather than assumed.
UPDATE public.profiles SET display_name = 'Anna Andersson'
 WHERE id = (SELECT anna FROM lb);
UPDATE public.profiles SET display_name = 'Bo'
 WHERE id = (SELECT bo FROM lb);

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Nordvakt Lifecycle AB', 'nordvakt-lifecycle', 'active' FROM lb
UNION ALL
SELECT other_employer, 'Annan Lifecycle AB', 'annan-lifecycle', 'active' FROM lb;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM lb UNION ALL
SELECT employer, member_user, 'member', 'active' FROM lb UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM lb;

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('fa000000-0000-0000-0000-0000000000ad', 'moderator@lifecycle.test', now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('fa000000-0000-0000-0000-0000000000ad', 'admin');

GRANT SELECT ON lb TO authenticated;

-- Publishing is moderation-owned, so the advertisements are created the way the
-- product creates them. profession_slug is a real cig_professions key: the
-- employment record inherits it at hire, and asserting that is the Career
-- Intelligence continuity claim.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en,
                         profession_slug, application_method, status,
                         published_at, expires_at)
SELECT job, 'vaktare-lifecycle', 'LB0001', employer,
       'Väktare, Göteborg', 'Security Officer, Gothenburg', 'vaktare',
       'internal', 'published', now() - interval '1 day', now() + interval '30 days'
  FROM lb
UNION ALL
SELECT other_job, 'vaktare-lifecycle-annan', 'LB0002', other_employer,
       'Väktare, Malmö', 'Security Officer, Malmo', 'vaktare',
       'internal', 'published', now() - interval '1 day', now() + interval '30 days'
  FROM lb;
RESET ROLE; RESET request.jwt.claim.sub;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id,
                                     status, consent_given_at)
SELECT application, job, employer, anna, 'submitted', now() FROM lb UNION ALL
SELECT bo_application, job, employer, bo, 'submitted', now() FROM lb UNION ALL
SELECT other_application, other_job, other_employer, anna, 'submitted', now() FROM lb;

CREATE TEMP TABLE lbv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM lbv),
       'Lifecycle bridge suite', owner_user, now() + interval '30 days' FROM lb;

GRANT SELECT ON lb, lbv TO authenticated;

-- Anna holds a Security Passport. Bo does not — which is what makes the
-- "employer cannot tell the difference" assertions meaningful.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, cig_profession_slug)
VALUES ('fa000000-0000-0000-0000-000000000003', 'Anna Andersson', 'vaktare');
INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name)
VALUES ('fa000000-0000-0000-0000-000000000003', 'training',
        'Väktargrundutbildning', 'Nordvakt (fiktiv)');
RESET ROLE; RESET request.jwt.claim.sub;

\echo '    GROUP L1 -- applying is not consent'

-- =========================================================================
-- L1. An application discloses nothing by existing
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'none',
  'L1.1 an employer reading an application of a Passport holder is told nothing');
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000002'::uuid)
    ->> 'status' = 'none',
  'L1.2 and the answer for a candidate with no Passport at all is identical');
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-0000000000ff'::uuid)
    ->> 'status' = 'none',
  'L1.3 and so is the answer for an application that does not exist');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'none',
  'L1.4 another organisation reading the same application learns nothing either');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_disclosures
    WHERE application_id IS NOT NULL) = 0,
  'L1.5 and no disclosure row came into being from applying');

\echo '    GROUP L2 -- the holder discloses, to one employer, explicitly'

-- =========================================================================
-- L2. The explicit act
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lb_share AS
SELECT public.sp_share_passport_with_application(
         'fa000000-3333-0000-0000-000000000001'::uuid,
         'employer_review', 30, NULL, NULL) AS disclosure_id;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON lb_share TO authenticated;

SELECT pg_temp.ok((SELECT disclosure_id IS NOT NULL FROM lb_share),
  'L2.1 the holder can disclose a package to one application');

SELECT pg_temp.ok(
  (SELECT token_hash IS NULL FROM public.sp_disclosures
    WHERE id = (SELECT disclosure_id FROM lb_share)),
  'L2.2 an application disclosure carries no token -- it is not a link');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_disclosures
    WHERE application_id IS NOT NULL AND token_hash IS NOT NULL) = 0,
  'L2.3 and no row can be addressed both ways at once');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'active',
  'L2.4 the employer she applied to can now read it');
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'package' = 'employer_review',
  'L2.5 and gets exactly the package she chose');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'active',
  'L2.6 an ordinary member of that organisation can read it too');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'none',
  'L2.7 the OTHER organisation still learns nothing -- disclosure is per employer');
RESET ROLE; RESET request.jwt.claim.sub;

-- Anna also applied to the second organisation. Sharing with one employer must
-- not share with the other.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000003'::uuid)
    ->> 'status' = 'none',
  'L2.8 nor does her application to them inherit the disclosure she made elsewhere');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail(
  $$SELECT public.sp_share_passport_with_application(
      'fa000000-3333-0000-0000-000000000001'::uuid, 'employer_review', 30, NULL, NULL)$$,
  'SP_NOT_YOUR_APPLICATION',
  'L2.9 nobody can disclose against somebody else''s application');
SELECT pg_temp.must_fail(
  $$SELECT public.sp_share_passport_with_application(
      'fa000000-3333-0000-0000-000000000002'::uuid, 'employer_review', 30, NULL, NULL)$$,
  'SP_NO_PASSPORT',
  'L2.10 and a candidate with no Passport has nothing to disclose');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  $$SELECT public.sp_share_passport_with_application(
      'fa000000-3333-0000-0000-000000000001'::uuid, 'everything', 30, NULL, NULL)$$,
  'SP_UNKNOWN_PACKAGE',
  'L2.11 an unreviewed package code cannot be conjured into existence');
RESET ROLE; RESET request.jwt.claim.sub;

\echo '    GROUP L3 -- one contract, one builder'

-- =========================================================================
-- L3. The employer path and the public path return the same thing
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lb_token AS
SELECT public.sp_create_disclosure('employer_review', 30, NULL, 'link recipient') AS token;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON lb_token TO authenticated, service_role;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE lb_token_payload AS
SELECT public.sp_get_disclosure((SELECT token FROM lb_token)) AS payload;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lb_app_payload AS
SELECT public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid) AS payload;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT payload -> 'verified_claims' FROM lb_app_payload)
    = (SELECT payload -> 'verified_claims' FROM lb_token_payload),
  'L3.1 both paths disclose the same claims for the same package');
SELECT pg_temp.ok(
  (SELECT payload ->> 'holder' FROM lb_app_payload)
    = (SELECT payload ->> 'holder' FROM lb_token_payload),
  'L3.2 and present the holder identically');
SELECT pg_temp.ok(
  (SELECT payload ->> 'profession_slug' FROM lb_app_payload) = 'vaktare',
  'L3.3 the disclosed profession is a Career Intelligence slug, not free text');
SELECT pg_temp.ok(
  (SELECT payload -> 'verified_claims' FROM lb_app_payload) = '[]'::jsonb,
  'L3.4 an unverified entry is not disclosed by either path');

\echo '    GROUP L4 -- the holder stays in control'

-- =========================================================================
-- L4. Supersede, revoke, expire
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lb_reshare AS
SELECT public.sp_share_passport_with_application(
         'fa000000-3333-0000-0000-000000000001'::uuid,
         'verified_qualifications', 30, NULL, NULL) AS disclosure_id;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_disclosures
    WHERE application_id = 'fa000000-3333-0000-0000-000000000001'
      AND revoked_at IS NULL) = 1,
  'L4.1 re-sharing supersedes: one live disclosure per application, never two');

SELECT pg_temp.ok(
  (SELECT revoked_at IS NOT NULL FROM public.sp_disclosures
    WHERE id = (SELECT disclosure_id FROM lb_share)),
  'L4.2 and the superseded one is revoked rather than left readable');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'package' = 'verified_qualifications',
  'L4.3 the employer now sees the narrowed package, not the earlier one');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_my_application_disclosures()) = 2,
  'L4.4 the holder can see both what she shared and what she withdrew');
SELECT pg_temp.ok(
  (SELECT employer_name FROM public.sp_my_application_disclosures()
    ORDER BY created_at DESC LIMIT 1) = 'Nordvakt Lifecycle AB',
  'L4.5 named by the organisation it went to, not by a token');
SELECT public.sp_revoke_disclosure((SELECT disclosure_id FROM lb_reshare));
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'none',
  'L4.6 revoking returns the employer to knowing nothing');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000004';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_my_application_disclosures()) = 0,
  'L4.7 and nobody else sees her sharing history');
RESET ROLE; RESET request.jwt.claim.sub;

-- Expiry, proven rather than assumed: the row is live but past its date.
UPDATE public.sp_disclosures
   SET revoked_at = NULL, expires_at = now() - interval '1 day'
 WHERE id = (SELECT disclosure_id FROM lb_reshare);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'none',
  'L4.8 an expired disclosure reads as nothing shared');
RESET ROLE; RESET request.jwt.claim.sub;

UPDATE public.sp_disclosures SET revoked_at = now()
 WHERE id = (SELECT disclosure_id FROM lb_reshare);

SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated','public.sp_disclosures','application_id','UPDATE'),
  'L4.9 a holder cannot re-point an existing share at a different application');
SELECT pg_temp.ok(
  has_column_privilege('authenticated','public.sp_disclosures','revoked_at','UPDATE'),
  'L4.10 revoking directly is still theirs to do');

\echo '    GROUP H -- hired, and still the same person'

-- =========================================================================
-- H1. The recruitment run establishes the subject
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lb_assign AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM lb), (SELECT version_id FROM lbv),
  'anna@lifecycle.test', NULL, 'sv', 'recruitment', NULL, NULL,
  (SELECT application FROM lb), NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON lb_assign TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM lb_assign) = 1,
  'H1.1 the recruitment assessment is assigned from the application');

SELECT pg_temp.ok(
  (SELECT subject_id FROM lb_assign)
    = (SELECT si.subject_id FROM public.scp_subject_identities si
        WHERE si.user_id = 'fa000000-0000-0000-0000-000000000003'),
  'H1.2 the participant subject is the applicant''s own professional identity');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 0,
  'H1.3 being assessed does not make somebody an employee');

-- =========================================================================
-- H2. The employer records the outcome
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000001','reviewing',NULL);
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000001','interview',NULL);
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000001','hired','Welcome');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 1,
  'H2.1 recording the hire produced exactly one employment record');

SELECT pg_temp.ok(
  (SELECT subject_id FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001')
    = (SELECT subject_id FROM lb_assign),
  'H2.2 bound to the SAME subject the assessment ran against -- no new person');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities
    WHERE user_id = 'fa000000-0000-0000-0000-000000000003') = 1,
  'H2.3 and the hire did not mint a second professional identity');

SELECT pg_temp.ok(
  (SELECT hired_from_application_id FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001')
    = 'fa000000-3333-0000-0000-000000000001',
  'H2.4 the employment record remembers which application it came from');

SELECT pg_temp.ok(
  (SELECT hired_from_job_id FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001')
    = 'fa000000-2222-0000-0000-000000000001',
  'H2.5 and which advertisement');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 'vaktare',
  'H2.6 and carries the advertisement''s canonical Career Intelligence profession');

SELECT pg_temp.ok(
  (SELECT first_name || '/' || last_name FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 'Anna/Andersson',
  'H2.7 named from what the employer was already shown, not from a new disclosure');

SELECT pg_temp.ok(
  (SELECT email IS NULL FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'),
  'H2.8 and the hire does not copy the candidate''s address into the directory');

-- =========================================================================
-- H3. The person page works without anybody attaching anything
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'fa000000-1111-0000-0000-000000000001'::uuid,
     (SELECT id FROM public.employees
       WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'))) = 1,
  'H3.1 the recruitment assessment appears on the new employee''s page automatically');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     'fa000000-1111-0000-0000-000000000001'::uuid,
     (SELECT subject_id FROM lb_assign))) >= 2,
  'H3.2 and the application and the assessment are one person''s history');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_overview(
     'fa000000-1111-0000-0000-000000000001'::uuid,
     (SELECT subject_id FROM lb_assign))) = 0,
  'H3.3 another organisation reading the same subject gets nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- =========================================================================
-- H4. Idempotence, refusals and the shape of the bridge
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  public.scp_employment_from_application('fa000000-3333-0000-0000-000000000001'::uuid)
    = (SELECT id FROM public.employees
        WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'),
  'H4.1 running the bridge again returns the same employment record');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 1,
  'H4.2 and did not create a second one');

-- The bridge's gate is the OUTCOME's gate, not the assessment-assignment one.
-- An ordinary member may record a hire, so an ordinary member must be able to
-- complete it -- otherwise the automatic path refuses somebody the manual
-- Medarbetare form would happily let through, and a duplicate gets typed in.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  public.scp_employment_from_application('fa000000-3333-0000-0000-000000000001'::uuid)
    = (SELECT id FROM public.employees
        WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'),
  'H4.3 an ordinary member reaches the same record, as they do in the directory');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(
  $$SELECT public.scp_employment_from_application('fa000000-3333-0000-0000-000000000001'::uuid)$$,
  'SCP_NOT_AUTHORISED_TO_HIRE',
  'H4.4 and neither can another organisation');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  $$SELECT public.scp_employment_from_application('fa000000-3333-0000-0000-000000000002'::uuid)$$,
  'SCP_APPLICATION_NOT_HIRED',
  'H4.5 the bridge follows a recorded decision; it never makes one');
RESET ROLE; RESET request.jwt.claim.sub;

-- Rejecting is the other outcome, and it must leave the workforce alone.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000002','rejected',NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001') = 1,
  'H4.6 a rejection adds nobody to the workforce');

-- =========================================================================
-- H5. A placeholder the employer typed is bound, not duplicated
-- =========================================================================

INSERT INTO public.employees (id, employer_id, first_name, last_name, email,
                              employment_status, created_by)
VALUES ('fa000000-4444-0000-0000-000000000001',
        'fa000000-1111-0000-0000-000000000002',
        'Anna','Andersson','ANNA@Lifecycle.test','active',
        'fa000000-0000-0000-0000-000000000002');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000002';
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000003','reviewing',NULL);
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000003','interview',NULL);
SELECT public.set_application_status('fa000000-3333-0000-0000-000000000003','hired',NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000002') = 1,
  'H5.1 hiring somebody the employer had already typed in does not duplicate them');

SELECT pg_temp.ok(
  (SELECT subject_id FROM public.employees
    WHERE id = 'fa000000-4444-0000-0000-000000000001')
    = (SELECT subject_id FROM lb_assign),
  'H5.2 the placeholder is bound to the person it was always meant to be');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT subject_id) FROM public.employees
    WHERE subject_id IS NOT NULL) = 1,
  'H5.3 two employers, two employment records, ONE professional identity');

\echo '    GROUP H6 -- the workforce lifecycle continues against the same person'

-- =========================================================================
-- H6. Development after hire lands on the same longitudinal history
-- =========================================================================

INSERT INTO public.scp_test_grants
  (employer_id, purpose, reason, authorised_by, expires_at)
SELECT employer, 'closed_test'::public.scp_governance_mode,
       'Lifecycle bridge suite — development after hire', owner_user,
       now() + interval '30 days' FROM lb;

CREATE TEMP TABLE lbv2 AS
SELECT av.id AS version_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-situational-awareness'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON lbv2 TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lb_dev AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM lb), (SELECT version_id FROM lbv2),
  'anna@lifecycle.test', NULL, 'sv', 'workforce',
  (SELECT id FROM public.employees
    WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'), NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT subject_id FROM lb_dev) = (SELECT subject_id FROM lb_assign),
  'H6.1 a development assessment after hire runs against the same subject');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'fa000000-1111-0000-0000-000000000001'::uuid,
     (SELECT id FROM public.employees
       WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'))) = 2,
  'H6.2 recruitment and development sit on one person''s history, not two');
RESET ROLE; RESET request.jwt.claim.sub;

\echo '    GROUP CO -- it lands on Candidate overview, and widens nothing there'

-- =========================================================================
-- CO. The two read models Candidate overview composes
--
-- The page resolves WHO through scp_application_candidate (PR #58) and WHAT
-- WAS SHARED through sp_application_disclosure. They must agree about the
-- application and stay strangers about everything else: the candidate read
-- model must not grow a Passport column, and the disclosure must not grow an
-- identity one.
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
SELECT public.sp_share_passport_with_application(
  'fa000000-3333-0000-0000-000000000001'::uuid, 'employer_review', 30, NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT c.application_id FROM public.scp_application_candidate(
     'fa000000-3333-0000-0000-000000000001'::uuid) c)
    = 'fa000000-3333-0000-0000-000000000001',
  'CO.1 Candidate overview resolves the application it was opened for');

SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000001'::uuid)
    ->> 'status' = 'active',
  'CO.2 and the Passport section on that same page has something to show');

-- Bo applied to the same employer and disclosed nothing. Candidate overview
-- opens for him exactly as it does for Anna, and says nothing.
SELECT pg_temp.ok(
  (SELECT c.application_id FROM public.scp_application_candidate(
     'fa000000-3333-0000-0000-000000000002'::uuid) c)
    = 'fa000000-3333-0000-0000-000000000002',
  'CO.3 the page opens identically for a candidate who disclosed nothing');

SELECT pg_temp.ok(
  public.sp_application_disclosure('fa000000-3333-0000-0000-000000000002'::uuid)
    ->> 'status' = 'none',
  'CO.4 and its Passport section has nothing to show -- same page, same section');
RESET ROLE; RESET request.jwt.claim.sub;

-- The two must not grow into each other. RJ8.6 pins this from main's side;
-- pinned here too, because this suite is the one that adds the capability.
DO $$
DECLARE _cols text;
BEGIN
  SELECT pg_get_function_result('public.scp_application_candidate(uuid)'::regprocedure)
    INTO _cols;
  IF _cols ~* '(passport|disclosure|claim|credential)' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CO.5 the candidate read model grew a Passport column';
  END IF;
  RAISE NOTICE 'ok  CO.5 the candidate read model still has no Passport column to grow into';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='sp_disclosures'
                AND column_name IN ('applicant_user_id','subject_id','attempt_id')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CO.6 a disclosure grew an identity column';
  END IF;
  RAISE NOTICE 'ok  CO.6 and a disclosure still carries no identity beyond its holder';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000003';
SELECT public.sp_revoke_disclosure(
  (SELECT d.id FROM public.sp_disclosures d
    WHERE d.application_id = 'fa000000-3333-0000-0000-000000000001'
      AND d.revoked_at IS NULL));
RESET ROLE; RESET request.jwt.claim.sub;

\echo '    GROUP G -- nothing else was loosened'

-- =========================================================================
-- G. Governance
-- =========================================================================

SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated','public.employees','subject_id','UPDATE'),
  'G1 whose history an employment record belongs to is not client-writable');
SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated','public.employees','hired_from_application_id','UPDATE'),
  'G2 nor is its recruitment lineage');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fa000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  $$UPDATE public.employees SET subject_id = NULL
     WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'$$,
  'permission denied',
  'G3 and an employer trying it directly is refused by the database');

-- The ordinary directory must still work exactly as before.
INSERT INTO public.employees (employer_id, first_name, last_name, email,
                              role_title, employment_status, created_by)
VALUES ('fa000000-1111-0000-0000-000000000001','Nils','Nilsson',
        'nils@lifecycle.test','Väktare','active',
        'fa000000-0000-0000-0000-000000000001');
UPDATE public.employees SET role_title = 'Skyddsvakt', employment_status = 'inactive'
 WHERE employer_id = 'fa000000-1111-0000-0000-000000000001'
   AND first_name = 'Nils';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT role_title = 'Skyddsvakt' AND employment_status = 'inactive'
     FROM public.employees WHERE first_name = 'Nils'),
  'G4 adding and editing an employee by hand still works');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon','public.sp_application_disclosure(uuid)','EXECUTE'),
  'G5 the employer disclosure path is closed to anon');
SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated','public.sp_disclosure_payload(uuid)','EXECUTE'),
  'G6 and the payload builder cannot be called without a check in front of it');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon','public.scp_employment_from_application(uuid)','EXECUTE'),
  'G7 the hire bridge is closed to anon');

-- Raw participant material stays out of every surface this change touches.
SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%response%' FROM lb_app_payload),
  'G8 no assessment response reaches a Passport disclosure');
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sp_disclosures'
      AND column_name IN ('attempt_id','subject_id')) = 0,
  'G9 the Passport still holds no foreign key into the assessment engine');

ROLLBACK;
