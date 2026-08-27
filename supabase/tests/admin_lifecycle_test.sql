-- Admin Control Center — platform lifecycle and safe data management.
--
-- Everything destructive in this feature is a SECURITY DEFINER function, so
-- the questions are: does it refuse the right callers, does it refuse the
-- right DATA, does it write the audit row, and does a refusal leave the
-- database exactly as it was. Each is asserted against real rows, never
-- against the function's source text.
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

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE '    ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

-- ── People ─────────────────────────────────────────────────────────────────
-- SA/SB two superadmins (so "last superadmin" is testable in both directions),
-- AD an ordinary platform admin, PL a plain account with nothing attached,
-- CA a candidate with an application, HO a Passport holder, ME an employer
-- member, EM an account bound to an employee record.

INSERT INTO auth.users (id, email) VALUES
  ('ad100000-0000-0000-0000-00000000005a','superadmin-a@acc.invalid'),
  ('ad100000-0000-0000-0000-00000000005b','superadmin-b@acc.invalid'),
  ('ad100000-0000-0000-0000-0000000000ad','admin@acc.invalid'),
  ('ad100000-0000-0000-0000-000000000011','plain@acc.invalid'),
  ('ad100000-0000-0000-0000-0000000000ca','candidate@acc.invalid'),
  ('ad100000-0000-0000-0000-000000000012','holder@acc.invalid'),
  ('ad100000-0000-0000-0000-000000000013','member@acc.invalid'),
  ('ad100000-0000-0000-0000-0000000000e1','employee@acc.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('ad100000-0000-0000-0000-00000000005a','superadmin'),
  ('ad100000-0000-0000-0000-00000000005b','superadmin'),
  ('ad100000-0000-0000-0000-0000000000ad','admin');

-- The fixtures below include a published advertisement, which
-- jobs_validate_before_write() only allows a platform admin to create. Acting
-- as the admin here is the fixture, not the assertion.
SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

-- ── Organisations ──────────────────────────────────────────────────────────
-- DISP is disposable (nothing attached, never moderated). LIVE has an
-- application. WORK has an employee. PASS has a Passport relationship.
-- ARCH is the one the archive transition is exercised on.

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('ad100000-1111-0000-0000-0000000000d1','Disposable Test AB','acc-disposable','draft'),
  ('ad100000-1111-0000-0000-000000000021','Live Kund AB','acc-live','active'),
  ('ad100000-1111-0000-0000-000000000022','Workforce Kund AB','acc-workforce','active'),
  ('ad100000-1111-0000-0000-000000000023','Passport Kund AB','acc-passport','active'),
  ('ad100000-1111-0000-0000-0000000000a1','Arkiv Kund AB','acc-archive','active'),
  ('ad100000-1111-0000-0000-000000000024','Reviewer Kund AB','acc-reviewer','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('ad100000-1111-0000-0000-0000000000a1','ad100000-0000-0000-0000-000000000013','owner','active',now()),
  ('ad100000-1111-0000-0000-000000000024','ad100000-0000-0000-0000-000000000013','owner','active',now());

-- A never-published draft belonging to the disposable organisation: it must be
-- removed with it, and it must be reported in advance as such.
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status, application_method)
VALUES ('ad100000-2222-0000-0000-0000000000d1','ad100000-1111-0000-0000-0000000000d1',
        'acc-disp-draft','accdisp0001','Utkast','Draft','draft','internal');

-- LIVE: a published advert and an application against it.
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, published_at, expires_at)
VALUES ('ad100000-2222-0000-0000-000000000031','ad100000-1111-0000-0000-000000000021',
        'acc-live-job','acclive0001','Väktare','Guard','published','internal',
        now(), now() + interval '30 days');

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('ad100000-3333-0000-0000-000000000041','ad100000-2222-0000-0000-000000000031',
        'ad100000-1111-0000-0000-000000000021','ad100000-0000-0000-0000-0000000000ca', now());

-- WORK: an employee, bound to a subject so the person-side blocker is real too.
INSERT INTO public.scp_subjects (id) VALUES ('ad100000-4444-0000-0000-0000000000e1');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('ad100000-4444-0000-0000-0000000000e1','ad100000-0000-0000-0000-0000000000e1');

INSERT INTO public.employees (id, employer_id, first_name, last_name, email, created_by, subject_id)
VALUES ('ad100000-5555-0000-0000-000000000051','ad100000-1111-0000-0000-000000000022',
        'Eva','Anställd','employee@acc.invalid','ad100000-0000-0000-0000-0000000000ad',
        'ad100000-4444-0000-0000-0000000000e1');

-- PASS: an experience period naming the organisation.
INSERT INTO public.sp_experience_periods (holder_user_id, employer_id, employer_name, role_title, started_on)
VALUES ('ad100000-0000-0000-0000-000000000012','ad100000-1111-0000-0000-000000000023',
        'Passport Kund AB','Väktare', DATE '2024-01-01');

-- The holder's own Passport claim: the user-side blocker, and the row that
-- anonymisation must leave completely untouched.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, title, lifecycle_state)
VALUES ('ad100000-6666-0000-0000-000000000061','ad100000-0000-0000-0000-000000000012',
        'certification','Väktarutbildning del 1','active');

-- REVIEWER: assessment history that is not an assignment.
INSERT INTO public.scp_employer_reviewers (employer_id, user_id)
VALUES ('ad100000-1111-0000-0000-000000000024','ad100000-0000-0000-0000-000000000013');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 1 — Employer archive
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.must_fail(
  $$SELECT public.moderate_employer('ad100000-1111-0000-0000-0000000000a1','archived', NULL)$$,
  'A note is required',
  'E1 archiving without a note is refused');

SELECT public.moderate_employer(
  'ad100000-1111-0000-0000-0000000000a1','archived','Kundrelationen avslutad.');

SELECT pg_temp.ok(
  (SELECT status FROM public.employers WHERE id = 'ad100000-1111-0000-0000-0000000000a1') = 'archived',
  'E2 an active organisation can be archived');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_moderation_events
    WHERE employer_id = 'ad100000-1111-0000-0000-0000000000a1'
      AND action = 'archived' AND previous_status = 'active' AND new_status = 'archived'
      AND admin_user_id = 'ad100000-0000-0000-0000-0000000000ad'
      AND note = 'Kundrelationen avslutad.') = 1,
  'E3 archiving wrote exactly one moderation event carrying the admin and the reason');

-- The operational consequence, asserted against real inserts rather than
-- against the RLS policy text.
SELECT pg_temp.must_fail(
  $$INSERT INTO public.jobs (employer_id, slug, short_id, title_sv, title_en, status, application_method)
    VALUES ('ad100000-1111-0000-0000-0000000000a1','acc-after-archive','accarch0001','X','X','draft','internal')$$,
  'EMPLOYER_NOT_OPERATIONAL',
  'E4 an archived organisation cannot have a new advertisement created for it');

SELECT pg_temp.must_fail(
  $$INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
    VALUES ('ad100000-1111-0000-0000-0000000000a1','Ny','Anställd','ad100000-0000-0000-0000-0000000000ad')$$,
  'EMPLOYER_NOT_OPERATIONAL',
  'E5 an archived organisation cannot have a new employee created for it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname LIKE '%employer_operational_guard'
      AND tgrelid IN ('public.jobs'::regclass,
                      'public.employees'::regclass,
                      'public.assessment_assignments'::regclass,
                      'public.scp_assessment_invitations'::regclass,
                      'public.scp_training_assignments'::regclass)) = 5,
  'E6 the operational guard is installed on all five commissioning tables');

SELECT pg_temp.ok(
  NOT public.employer_accepts_operations('ad100000-1111-0000-0000-0000000000a1')
  AND NOT public.employer_members_can_edit('ad100000-1111-0000-0000-0000000000a1'),
  'E7 archived fails both the operational predicate and the existing editing predicate');

-- History survives the archive.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_memberships
    WHERE employer_id = 'ad100000-1111-0000-0000-0000000000a1') = 1,
  'E8 archiving preserved the membership row');

SELECT pg_temp.must_fail(
  $$SELECT public.moderate_employer('ad100000-1111-0000-0000-0000000000a1','suspended','x')$$,
  'Invalid transition',
  'E9 an archived organisation cannot be suspended directly');

SELECT public.moderate_employer(
  'ad100000-1111-0000-0000-0000000000a1','restored','Kunden återupptar avtalet.');

SELECT pg_temp.ok(
  (SELECT status FROM public.employers WHERE id = 'ad100000-1111-0000-0000-0000000000a1') = 'suspended',
  'E10 restore lands on suspended, never straight back on active');

SELECT public.moderate_employer('ad100000-1111-0000-0000-0000000000a1','reactivated', NULL);

SELECT pg_temp.ok(
  (SELECT status FROM public.employers WHERE id = 'ad100000-1111-0000-0000-0000000000a1') = 'active',
  'E11 the existing suspend/reactivate workflow is unchanged by the new actions');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs WHERE employer_id = 'ad100000-1111-0000-0000-0000000000a1') = 0
  AND (SELECT count(*) FROM public.employees WHERE employer_id = 'ad100000-1111-0000-0000-0000000000a1') = 0,
  'E12 neither refused insert left a row behind');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 2 — Employer deletion impact
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (public.admin_employer_deletion_impact('ad100000-1111-0000-0000-0000000000d1') ->> 'deletable')::boolean,
  'D1 an organisation with no history at all is reported deletable');

SELECT pg_temp.ok(
  (public.admin_employer_deletion_impact('ad100000-1111-0000-0000-0000000000d1')
     -> 'removed_on_delete' ->> 'jobs.employer_id') = '1',
  'D2 the never-published draft is reported in advance as something the delete removes');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000021')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_APPLICATIONS"}]'::jsonb,
  'D3 an organisation with an application reports EMPLOYER_HAS_APPLICATIONS');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000021')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_PUBLISHED_JOBS"}]'::jsonb,
  'D4 a published advert is a blocker in its own right');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000022')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_WORKFORCE"}]'::jsonb,
  'D5 an organisation with an employee reports EMPLOYER_HAS_WORKFORCE');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000023')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_PASSPORT_RELATIONSHIPS"}]'::jsonb,
  'D6 an organisation named in a Passport experience period reports EMPLOYER_HAS_PASSPORT_RELATIONSHIPS');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000024')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_ASSESSMENT_HISTORY"}]'::jsonb,
  'D7 a granted response reviewer counts as assessment history');

SELECT pg_temp.ok(
  public.admin_employer_deletion_impact('ad100000-1111-0000-0000-0000000000a1')
    -> 'blockers' @> '[{"code":"EMPLOYER_HAS_AUDIT_HISTORY"}]'::jsonb,
  'D8 an organisation that has ever been moderated reports EMPLOYER_HAS_AUDIT_HISTORY');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 3 — Employer deletion authorisation and refusals
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-0000000000d1','städning','Disposable Test AB')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'X1 an ordinary platform admin cannot delete an organisation');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-0000000000d1','', 'Disposable Test AB')$$,
  'REASON_REQUIRED',
  'X2 deletion without a reason is refused');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-0000000000d1','städning','Fel Namn AB')$$,
  'CONFIRMATION_MISMATCH',
  'X3 deletion with a mistyped organisation name is refused');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-000000000021','städning','Live Kund AB')$$,
  'EMPLOYER_HAS_APPLICATIONS',
  'X4 an organisation with an application cannot be hard deleted, and the refusal names the blocker');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-000000000022','städning','Workforce Kund AB')$$,
  'EMPLOYER_HAS_WORKFORCE',
  'X5 an organisation with an employee cannot be hard deleted');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe(
      'ad100000-1111-0000-0000-000000000023','städning','Passport Kund AB')$$,
  'EMPLOYER_HAS_PASSPORT_RELATIONSHIPS',
  'X6 an organisation with a Passport relationship cannot be hard deleted');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employers WHERE id IN (
     'ad100000-1111-0000-0000-000000000021',
     'ad100000-1111-0000-0000-000000000022',
     'ad100000-1111-0000-0000-000000000023')) = 3
  AND (SELECT count(*) FROM public.job_applications
        WHERE employer_id = 'ad100000-1111-0000-0000-000000000021') = 1,
  'X7 every refused deletion left its organisation and its data completely intact');

-- The one that is genuinely disposable.
SELECT public.admin_delete_employer_if_safe(
  'ad100000-1111-0000-0000-0000000000d1',
  'Manuellt skapad testorganisation.',
  'Disposable Test AB');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employers WHERE id = 'ad100000-1111-0000-0000-0000000000d1') = 0,
  'X8 a genuinely disposable organisation is deleted');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs WHERE id = 'ad100000-2222-0000-0000-0000000000d1') = 0,
  'X9 its never-published draft went with it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'employer_deleted'
      AND subject_id = 'ad100000-1111-0000-0000-0000000000d1'
      AND actor_id = 'ad100000-0000-0000-0000-00000000005a'
      AND actor_role = 'superadmin'
      AND metadata ->> 'reason' = 'Manuellt skapad testorganisation.') = 1,
  'X10 the deletion wrote exactly one audit row carrying the actor and the reason');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 4 — Account disable
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-000000000011', true, 'Misstänkt missbruk.');

SELECT pg_temp.ok(
  (SELECT banned_until FROM auth.users
    WHERE id = 'ad100000-0000-0000-0000-000000000011') > now() + interval '50 years',
  'U1 disabling an account bans it far into the future');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'user_disabled'
      AND subject_id = 'ad100000-0000-0000-0000-000000000011'
      AND metadata ->> 'reason' = 'Misstänkt missbruk.') = 1,
  'U2 disabling wrote its audit row');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-0000000000ad', true, 'x')$$,
  'SELF_DISABLE_NOT_ALLOWED',
  'U3 an administrator cannot disable their own account');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-00000000005a', true, 'x')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'U4 an ordinary admin cannot disable a superadmin');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-000000000011', true, '')$$,
  'REASON_REQUIRED',
  'U5 a reason is required to change account access');

SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-000000000011', false, 'Utredningen avslutad.');

SELECT pg_temp.ok(
  (SELECT banned_until FROM auth.users
    WHERE id = 'ad100000-0000-0000-0000-000000000011') IS NULL,
  'U6 re-enabling clears the ban');

-- Last-superadmin protection, reached through disable rather than through
-- role revocation.
SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-00000000005b', true, 'Tillfälligt avstängd.');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-00000000005a', true, 'x')$$,
  'SELF_DISABLE_NOT_ALLOWED',
  'U7 a superadmin still cannot disable themselves');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005b';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-00000000005a', true, 'x')$$,
  'LAST_SUPERADMIN_PROTECTED',
  'U8 the only remaining ACTIVE superadmin cannot be disabled');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';
SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-00000000005b', false, 'Återställd.');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 5 — User deletion impact and deletion
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000ca')
    -> 'blockers' @> '[{"code":"USER_HAS_APPLICATIONS"}]'::jsonb,
  'P1 a candidate with an application is not deletable');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-000000000012')
    -> 'blockers' @> '[{"code":"USER_HAS_PASSPORT_EVIDENCE"}]'::jsonb,
  'P2 a Passport holder is not deletable');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-000000000013')
    -> 'blockers' @> '[{"code":"USER_HAS_EMPLOYER_MEMBERSHIP"}]'::jsonb,
  'P3 an employer member is not deletable');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000e1')
    -> 'blockers' @> '[{"code":"USER_IS_EMPLOYEE"}]'::jsonb,
  'P4 an account bound to an employment record is not deletable');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-00000000005a')
    -> 'blockers' @> '[{"code":"USER_HOLDS_PLATFORM_ROLE"}]'::jsonb,
  'P5 a platform-role holder is not deletable');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000ad')
    -> 'blockers' @> '[{"code":"USER_HAS_ACTED_ON_RECORDS"}]'::jsonb,
  'P6 an account that created records others depend on reports USER_HAS_ACTED_ON_RECORDS');

SELECT pg_temp.ok(
  jsonb_array_length(public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000ad') -> 'acted_on') > 0,
  'P7 and names the exact table and column, read from the catalogue');

SELECT pg_temp.ok(
  (public.admin_user_deletion_impact('ad100000-0000-0000-0000-000000000011') ->> 'deletable')::boolean,
  'P8 an account with nothing attached is reported deletable');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe(
      'ad100000-0000-0000-0000-000000000011','städning','plain@acc.invalid')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'P9 an ordinary platform admin cannot delete an account');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

-- P10 and P11 previously asserted that history REFUSED the deletion. The
-- owner's decision reversed that: for a superadmin, history is handled, not a
-- veto. What the report owes the administrator now is not a refusal but an
-- accurate account of what will happen to each row, so that is what is
-- asserted here. The deletion itself is exercised end to end in group 8d,
-- against a person built specifically to carry every kind of history at once;
-- the candidate and the holder stay alive here because six later assertions
-- still read them.
SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000ca')
    -> 'detached' ? 'job_applications.applicant_user_id',
  'P10 a candidate''s application is reported as DETACHED, not as a refusal');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-000000000012')
    -> 'deleted' ? 'sp_claims.holder_user_id',
  'P11 a Passport holder''s own claim is reported as DELETED, in advance and by name');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe(
      'ad100000-0000-0000-0000-000000000011','städning','wrong@acc.invalid')$$,
  'CONFIRMATION_MISMATCH',
  'P12 deletion with a mistyped address is refused');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_claims
    WHERE holder_user_id = 'ad100000-0000-0000-0000-000000000012') = 1
  AND (SELECT count(*) FROM public.job_applications
        WHERE applicant_user_id = 'ad100000-0000-0000-0000-0000000000ca') = 1,
  'P13 a refused deletion, and a read-only impact report, changed nothing at all');

SELECT public.admin_delete_user_if_safe(
  'ad100000-0000-0000-0000-000000000011','Testkonto.','plain@acc.invalid');

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE id = 'ad100000-0000-0000-0000-000000000011') = 0
  AND (SELECT count(*) FROM public.profiles WHERE id = 'ad100000-0000-0000-0000-000000000011') = 0,
  'P14 an account with nothing attached is deleted, profile and all');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'user_deleted'
      AND subject_id = 'ad100000-0000-0000-0000-000000000011'
      AND actor_role = 'superadmin') = 1,
  'P15 the account deletion wrote exactly one audit row');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 6 — Anonymisation
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_anonymise_user(
      'ad100000-0000-0000-0000-000000000012','begäran','holder@acc.invalid')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'N1 an ordinary platform admin cannot anonymise an account');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_anonymise_user(
      'ad100000-0000-0000-0000-00000000005b','begäran','superadmin-b@acc.invalid')$$,
  'USER_HOLDS_PLATFORM_ROLE',
  'N2 a platform-role holder must have the role revoked before anonymisation');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_anonymise_user(
      'ad100000-0000-0000-0000-000000000013','begäran','member@acc.invalid')$$,
  'USER_HAS_ACTIVE_MEMBERSHIP',
  'N3 an active organisation member must be removed from it before anonymisation');

UPDATE public.profiles SET display_name = 'Hilda Holder', country = 'SE'
 WHERE id = 'ad100000-0000-0000-0000-000000000012';

SELECT public.admin_anonymise_user(
  'ad100000-0000-0000-0000-000000000012','GDPR-begäran, ärende 12.','holder@acc.invalid');

SELECT pg_temp.ok(
  (SELECT display_name IS NULL AND country IS NULL FROM public.profiles
    WHERE id = 'ad100000-0000-0000-0000-000000000012'),
  'N4 anonymisation clears the personal profile');

SELECT pg_temp.ok(
  (SELECT email FROM auth.users WHERE id = 'ad100000-0000-0000-0000-000000000012')
    = 'anonymised+ad100000-0000-0000-0000-000000000012@removed.invalid',
  'N5 anonymisation replaces the sign-in address with an unroutable pseudonym');

SELECT pg_temp.ok(
  (SELECT banned_until FROM auth.users
    WHERE id = 'ad100000-0000-0000-0000-000000000012') > now(),
  'N6 an anonymised account is disabled in the same transaction');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_claims
    WHERE holder_user_id = 'ad100000-0000-0000-0000-000000000012'
      AND title = 'Väktarutbildning del 1') = 1,
  'N7 anonymisation does NOT touch verified Passport evidence');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_experience_periods
    WHERE holder_user_id = 'ad100000-0000-0000-0000-000000000012') = 1,
  'N8 anonymisation does NOT touch the employment history a verifier relied on');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'user_anonymised'
      AND subject_id = 'ad100000-0000-0000-0000-000000000012'
      AND metadata -> 'retained' @> '["sp_claims"]'::jsonb) = 1,
  'N9 the audit row records what was retained, not only what was cleared');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 7 — Job deletion
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_job_if_safe('ad100000-2222-0000-0000-000000000031','städning')$$,
  'JOB_NOT_DELETABLE',
  'J1 a published advertisement cannot be deleted by an administrator');

INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status, application_method)
VALUES ('ad100000-2222-0000-0000-000000000032','ad100000-1111-0000-0000-000000000021',
        'acc-clean-draft','accclean001','Rent utkast','Clean draft','draft','internal');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_job_if_safe('ad100000-2222-0000-0000-000000000032','')$$,
  'REASON_REQUIRED',
  'J2 deleting an advertisement requires a reason');

SELECT public.admin_delete_job_if_safe(
  'ad100000-2222-0000-0000-000000000032','Felaktigt skapat utkast.');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs WHERE id = 'ad100000-2222-0000-0000-000000000032') = 0
  AND (SELECT count(*) FROM public.audit_logs
        WHERE action = 'job_deleted' AND subject_id = 'ad100000-2222-0000-0000-000000000032') = 1,
  'J3 a never-published draft with nothing attached is deleted and audited');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 8 — Identity diagnostics and the disposable inventory
-- ═══════════════════════════════════════════════════════════════════════════

-- scp_subject_identities is 1:1 by construction (subject_id is the primary key,
-- user_id is UNIQUE), so a duplicate can never be a second link. Assert that
-- constraint explicitly -- it is what makes the diagnostic's shape correct.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.scp_subject_identities'::regclass
             AND contype = 'u'
             AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)')
  AND EXISTS (SELECT 1 FROM pg_constraint
               WHERE conrelid = 'public.scp_subject_identities'::regclass
                 AND contype = 'p'
                 AND pg_get_constraintdef(oid) = 'PRIMARY KEY (subject_id)'),
  'I1 the identity link is 1:1, so a duplicate can only be an UNLINKED record');

-- The same person entered twice in one organisation's workforce.
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, created_by)
VALUES ('ad100000-5555-0000-0000-000000000053','ad100000-1111-0000-0000-000000000022',
        'Eva','Anställd','employee@acc.invalid','ad100000-0000-0000-0000-0000000000ad');

SELECT pg_temp.ok(
  public.admin_identity_diagnostics() -> 'findings'
    @> jsonb_build_array(jsonb_build_object(
         'code','DUPLICATE_EMPLOYEE_IN_ORGANISATION',
         'employer_id','ad100000-1111-0000-0000-000000000022',
         'email','employee@acc.invalid')),
  'I1b the same address entered twice in one organisation is flagged');

INSERT INTO public.employees (id, employer_id, first_name, last_name, email, created_by)
VALUES ('ad100000-5555-0000-0000-000000000052','ad100000-1111-0000-0000-000000000022',
        'Carl','Kandidat','candidate@acc.invalid','ad100000-0000-0000-0000-0000000000ad');

SELECT pg_temp.ok(
  public.admin_identity_diagnostics() -> 'findings'
    @> jsonb_build_array(jsonb_build_object(
         'code','EMPLOYEE_NOT_BOUND_TO_ACCOUNT',
         'employee_id','ad100000-5555-0000-0000-000000000052')),
  'I2 an employee whose address belongs to a real account but is unbound is flagged');

SELECT pg_temp.ok(
  jsonb_typeof(public.admin_identity_diagnostics() -> 'findings') = 'array',
  'I3 the diagnostic returns findings and performs no write');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('ad100000-1111-0000-0000-0000000000d2','Andra Testorg AB','acc-disposable-2','draft');

SELECT pg_temp.ok(
  public.admin_disposable_records(200) -> 'employers'
    @> jsonb_build_array(jsonb_build_object('id','ad100000-1111-0000-0000-0000000000d2')),
  'I4 the disposable inventory lists an organisation with no history');

SELECT pg_temp.ok(
  NOT (public.admin_disposable_records(200) -> 'employers'
    @> jsonb_build_array(jsonb_build_object('id','ad100000-1111-0000-0000-000000000021'))),
  'I5 the disposable inventory never lists an organisation carrying real data');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 8b — Canonical person view
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  public.admin_person_overview('ad100000-0000-0000-0000-0000000000ca')
    -> 'applications' -> 0 ->> 'id' = 'ad100000-3333-0000-0000-000000000041',
  'V1 the person view shows the candidate''s application');

SELECT pg_temp.ok(
  (public.admin_person_overview('ad100000-0000-0000-0000-0000000000e1') ->> 'subject_id')
    = 'ad100000-4444-0000-0000-0000000000e1'
  AND public.admin_person_overview('ad100000-0000-0000-0000-0000000000e1')
        -> 'employment' -> 0 ->> 'employee_id' = 'ad100000-5555-0000-0000-000000000051',
  'V2 the person view resolves the pseudonymous subject and the employment record');

SELECT pg_temp.ok(
  (public.admin_person_overview('ad100000-0000-0000-0000-000000000012') -> 'passport' ->> 'claims') = '1',
  'V3 the person view counts Passport evidence');

SELECT pg_temp.ok(
  public.admin_person_overview('ad100000-0000-0000-0000-000000000012') -> 'passport' -> 'claim_titles' IS NULL,
  'V4 the person view never returns the CONTENTS of Passport evidence');

SELECT pg_temp.ok(
  (public.admin_person_overview('ad100000-0000-0000-0000-000000000012') -> 'account' ->> 'disabled')::boolean,
  'V5 the person view reports the account disabled state auth.users cannot expose to PostgREST');

SELECT pg_temp.ok(
  public.admin_person_overview('ad100000-0000-0000-0000-000000000013')
    -> 'memberships' -> 0 ->> 'employer_slug' = 'acc-archive',
  'V6 the person view lists organisation memberships with their organisation status');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 8c — Account return behaviour
--
-- The two account endings are deliberately not variations of each other, and
-- this group holds them apart:
--
--   Disable  is reversible. The SAME auth account comes back -- same id, same
--            address, same profile, same history. The address stays taken for
--            as long as the account exists, because the account still exists.
--
--   Delete   is not. The auth account stops existing, and with it every row
--            that hung off it. The address becomes free, and the person can
--            register again from scratch. That is a NEW account with a new
--            id, not the old one returning: nothing is relinked, and the
--            administrative record of the deletion stays behind under the old
--            id, which is the whole point of keeping it.
--
-- The registration assertions run against the same two uniqueness rules
-- Supabase Auth enforces -- the partial unique index on auth.users.email and
-- the (provider_id, provider) unique constraint on auth.identities -- which
-- the harness bootstrap reproduces from a live instance. C5 below deliberately
-- re-runs a registration that MUST be refused, so that a passing C3/C4 cannot
-- be the harness simply having no rule to break.
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

-- Two accounts that reach the two different endings. Both are shaped like a
-- real email/password sign-up: an auth.users row, the auth.identities row
-- GoTrue writes beside it, the profile the on_auth_user_created trigger
-- creates, and one consent record.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad100000-0000-0000-0000-0000000000d0','retur-avstangd@acc.invalid',
   '{"display_name":"Avstängd Person"}'::jsonb),
  ('ad100000-0000-0000-0000-0000000000d1','retur-raderad@acc.invalid',
   '{"display_name":"Raderad Person"}'::jsonb);

INSERT INTO auth.identities (user_id, provider, provider_id, identity_data) VALUES
  ('ad100000-0000-0000-0000-0000000000d0','email','retur-avstangd@acc.invalid',
   '{"email":"retur-avstangd@acc.invalid"}'::jsonb),
  ('ad100000-0000-0000-0000-0000000000d1','email','retur-raderad@acc.invalid',
   '{"email":"retur-raderad@acc.invalid"}'::jsonb);

INSERT INTO public.consent_records (user_id, purpose, policy_version) VALUES
  ('ad100000-0000-0000-0000-0000000000d0','platform_terms','2026-01'),
  ('ad100000-0000-0000-0000-0000000000d1','platform_terms','2026-01');

-- ── A. A disabled account can be reopened ──────────────────────────────────

SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-0000000000d0', true, 'Avstängd under utredning.');

SELECT pg_temp.ok(
  (SELECT banned_until FROM auth.users
    WHERE id = 'ad100000-0000-0000-0000-0000000000d0') > now() + interval '50 years'
  AND (SELECT count(*) FROM auth.users
        WHERE id = 'ad100000-0000-0000-0000-0000000000d0') = 1
  AND (SELECT count(*) FROM auth.identities
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d0') = 1
  AND (SELECT count(*) FROM public.profiles
        WHERE id = 'ad100000-0000-0000-0000-0000000000d0') = 1
  AND (SELECT count(*) FROM public.consent_records
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d0') = 1,
  'A1 disabling only bans the account -- the account, its identity, its profile and its consent record are all still there');

SELECT pg_temp.must_fail(
  $$INSERT INTO auth.users (id, email)
    VALUES ('ad100000-0000-0000-0000-0000000000df','retur-avstangd@acc.invalid')$$,
  'users_email_partial_key',
  'A2 a disabled account still holds its address -- the same email cannot be registered while it exists');

SELECT public.admin_set_user_disabled(
  'ad100000-0000-0000-0000-0000000000d0', false, 'Utredningen avslutad.');

SELECT pg_temp.ok(
  (SELECT banned_until FROM auth.users
    WHERE id = 'ad100000-0000-0000-0000-0000000000d0') IS NULL
  AND (SELECT email FROM auth.users
        WHERE id = 'ad100000-0000-0000-0000-0000000000d0') = 'retur-avstangd@acc.invalid'
  AND (SELECT display_name FROM public.profiles
        WHERE id = 'ad100000-0000-0000-0000-0000000000d0') = 'Avstängd Person'
  AND (SELECT count(*) FROM auth.identities
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d0') = 1
  AND (SELECT count(*) FROM public.consent_records
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d0') = 1,
  'A3 reopening restores the SAME auth account -- same id, same address, same profile, same history');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE subject_id = 'ad100000-0000-0000-0000-0000000000d0'
      AND action = 'user_disabled') = 1
  AND (SELECT count(*) FROM public.audit_logs
        WHERE subject_id = 'ad100000-0000-0000-0000-0000000000d0'
          AND action = 'user_enabled') = 1,
  'A4 both halves of the reversible ending are on the record, separately');

-- ── B. A permanently deleted account cannot be reopened ────────────────────

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

SELECT pg_temp.ok(
  (public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000d1')
     ->> 'deletable')::boolean,
  'B1 an account with only a profile, an identity and a consent record is reported deletable');

SELECT public.admin_delete_user_if_safe(
  'ad100000-0000-0000-0000-0000000000d1','Permanent radering.','retur-raderad@acc.invalid');

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE id = 'ad100000-0000-0000-0000-0000000000d1') = 0
  AND (SELECT count(*) FROM auth.identities WHERE user_id = 'ad100000-0000-0000-0000-0000000000d1') = 0
  AND (SELECT count(*) FROM public.profiles WHERE id = 'ad100000-0000-0000-0000-0000000000d1') = 0
  AND (SELECT count(*) FROM public.user_roles WHERE user_id = 'ad100000-0000-0000-0000-0000000000d1') = 0
  AND (SELECT count(*) FROM public.consent_records WHERE user_id = 'ad100000-0000-0000-0000-0000000000d1') = 0,
  'B2 permanent deletion leaves no auth account, no identity, no profile, no role and no consent record behind');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-0000000000d1', false, 'Öppna igen.')$$,
  'USER_NOT_FOUND',
  'B3 a permanently deleted account cannot be reopened -- there is nothing left to reopen');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_person_overview('ad100000-0000-0000-0000-0000000000d1')$$,
  'USER_NOT_FOUND',
  'B4 and the administrator cannot even open it as a person any more');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE subject_id = 'ad100000-0000-0000-0000-0000000000d1'
      AND action = 'user_deleted'
      AND metadata ->> 'email' = 'retur-raderad@acc.invalid') = 1,
  'B5 the deletion itself stays on the record, under the OLD id and with the address it carried');

-- ── C. The deleted address can register again, as a NEW account ────────────

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE email = 'retur-raderad@acc.invalid') = 0
  AND (SELECT count(*) FROM auth.identities
        WHERE provider = 'email' AND provider_id = 'retur-raderad@acc.invalid') = 0,
  'C1 the address is free -- nothing in auth.users and no identity still claims it');

-- A brand-new sign-up, written the way GoTrue writes one. If any stale row
-- had survived the deletion, one of these two inserts is what would refuse.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad100000-0000-0000-0000-0000000000d2','retur-raderad@acc.invalid',
   '{"display_name":"Nyregistrerad Person"}'::jsonb);

INSERT INTO auth.identities (user_id, provider, provider_id, identity_data) VALUES
  ('ad100000-0000-0000-0000-0000000000d2','email','retur-raderad@acc.invalid',
   '{"email":"retur-raderad@acc.invalid"}'::jsonb);

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE email = 'retur-raderad@acc.invalid') = 1
  AND (SELECT id FROM auth.users WHERE email = 'retur-raderad@acc.invalid')
        <> 'ad100000-0000-0000-0000-0000000000d1'::uuid,
  'C2 the same address registers again and gets a NEW account, not the old one back');

SELECT pg_temp.ok(
  (SELECT display_name FROM public.profiles
    WHERE id = 'ad100000-0000-0000-0000-0000000000d2') = 'Nyregistrerad Person'
  AND (SELECT count(*) FROM public.user_roles
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d2') = 0
  AND (SELECT count(*) FROM public.consent_records
        WHERE user_id = 'ad100000-0000-0000-0000-0000000000d2') = 0,
  'C3 the new account starts clean -- a fresh profile from the sign-up trigger, no inherited role, no inherited consent');

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.ok(
  (public.admin_person_overview('ad100000-0000-0000-0000-0000000000d2') -> 'account' ->> 'disabled')::boolean
    IS NOT TRUE,
  'C4 the new account is usable from the first moment -- it did not inherit the old one''s disabled state');

SELECT pg_temp.must_fail(
  $$INSERT INTO auth.users (id, email)
    VALUES ('ad100000-0000-0000-0000-0000000000d3','retur-raderad@acc.invalid')$$,
  'users_email_partial_key',
  'C5 and the address is taken again by the new account -- so C1-C4 tested a rule that really is enforced here');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 8d — Permanent deletion of an account that has real history
--
-- Group 8c proved the two ENDINGS are different. This group proves the ending
-- is reachable at all for the only kind of account anyone actually wants to
-- delete: one that has been used.
--
-- HI below is built to carry, at once, every kind of history the platform
-- knows how to attach to a person -- a profile, an application with its status
-- history, a recruitment assessment assignment, a completed attempt with
-- reviewed evidence and a released report, a Security Passport with a claim,
-- evidence, an experience period, a disclosure to an employer and a
-- verification decision, an organisation membership, a consent record, an
-- audit trail, and records they ACTED on as an employer person, including two
-- that the schema forbids anyone from ever editing.
--
-- Every assertion below is on real rows after a real call. Nothing is asserted
-- against the function's source text.
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad100000-0000-0000-0000-0000000000b1','historik@acc.invalid',
   '{"display_name":"Full Historik"}'::jsonb);

INSERT INTO auth.identities (user_id, provider, provider_id, identity_data) VALUES
  ('ad100000-0000-0000-0000-0000000000b1','email','historik@acc.invalid',
   '{"email":"historik@acc.invalid"}'::jsonb);

INSERT INTO public.consent_records (user_id, purpose, policy_version) VALUES
  ('ad100000-0000-0000-0000-0000000000b1','platform_terms','2026-01');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('ad100000-1111-0000-0000-000000000021','ad100000-0000-0000-0000-0000000000b1','member','active',now());

-- An application to the live advert, carrying the personal fields a candidate
-- actually submits, plus one status change the employer made.
INSERT INTO public.job_applications
  (id, job_id, employer_id, applicant_user_id, consent_given_at, phone, cover_note,
   cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes, status)
VALUES ('ad100000-3333-0000-0000-0000000000b1','ad100000-2222-0000-0000-000000000031',
        'ad100000-1111-0000-0000-000000000021','ad100000-0000-0000-0000-0000000000b1', now(),
        '+46701234567','Jag heter Full Historik och söker tjänsten.',
        'ad100000-0000-0000-0000-0000000000b1/cv.pdf','Full-Historik-CV.pdf',
        'application/pdf', 1234, 'reviewing');

INSERT INTO public.job_application_status_events
  (application_id, job_id, employer_id, actor_user_id, actor_role, previous_status, new_status)
VALUES ('ad100000-3333-0000-0000-0000000000b1','ad100000-2222-0000-0000-000000000031',
        'ad100000-1111-0000-0000-000000000021','ad100000-0000-0000-0000-0000000000ad',
        'employer','submitted','reviewing');

-- The pseudonymous spine, and a completed, reviewed, reported assessment on it.
INSERT INTO public.scp_subjects (id) VALUES ('ad100000-4444-0000-0000-0000000000b1');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('ad100000-4444-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1');

-- The form has to satisfy two guards that are not under test here, so both
-- conditions are stated rather than left to whichever row happens to sort
-- first: the version must be PUBLISHED (or the assign guard refuses for want
-- of a grant), and every item on the form must be assessment-mode (or the
-- attempt guard refuses the mode). Ordered by id so the same row is chosen on
-- every replay.
WITH fx AS (
  SELECT av.id AS av_id, f.id AS form_id
    FROM public.scp_assessment_versions av
    JOIN public.scp_forms f ON f.assessment_version_id = av.id
   WHERE av.content_status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM public.scp_form_items fi
         JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
        WHERE fi.form_id = f.id AND iv.mode IS DISTINCT FROM 'assessment')
     AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id = f.id)
   ORDER BY f.id LIMIT 1)
SELECT av_id AS h_avid, form_id AS h_fid FROM fx \gset

-- Inserted as workforce and relabelled, because no content on this platform is
-- operationally validated yet and the assign guard correctly refuses to create
-- a recruitment assignment against content that is not. The rules under test
-- here are the deletion rules, not the assign guard, which keeps its own
-- assertions elsewhere.
INSERT INTO public.assessment_assignments
  (id, employer_id, use_case, recipient_email, recipient_user_id, assigned_by,
   invitation_token_hash, expires_at, scp_assessment_version_id, status)
VALUES ('ad100000-5555-0000-0000-0000000000b1','ad100000-1111-0000-0000-000000000021','workforce',
        'historik@acc.invalid','ad100000-0000-0000-0000-0000000000b1',
        'ad100000-0000-0000-0000-0000000000ad','hash-historik', now() + interval '30 days',
        :'h_avid'::uuid,'started');

UPDATE public.assessment_assignments
   SET use_case = 'recruitment',
       application_id = 'ad100000-3333-0000-0000-0000000000b1',
       job_id = 'ad100000-2222-0000-0000-000000000031'
 WHERE id = 'ad100000-5555-0000-0000-0000000000b1';

INSERT INTO public.scp_attempts
  (id, subject_id, issuer_organization_id, assignment_id, mode, form_id,
   assessment_version_id, status, submitted_at)
VALUES ('ad100000-6666-0000-0000-0000000000b1','ad100000-4444-0000-0000-0000000000b1',
        'ad100000-1111-0000-0000-000000000021','ad100000-5555-0000-0000-0000000000b1',
        'assessment', :'h_fid'::uuid, :'h_avid'::uuid, 'submitted', now());

INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
   contribution, confidence, assessor_actor_id)
SELECT 'ad100000-4444-0000-0000-0000000000b1', bv.id, 'assessment_response',
       'ad100000-6666-0000-0000-0000000000b1', 'human_review', 0.5, 0.5,
       'ad100000-0000-0000-0000-0000000000ad'
  FROM public.scp_behaviour_versions bv ORDER BY bv.id LIMIT 1;

INSERT INTO public.scp_report_snapshots (attempt_id, subject_id, report_version_id, audience, payload)
SELECT 'ad100000-6666-0000-0000-0000000000b1','ad100000-4444-0000-0000-0000000000b1',
       rv.id, 'employer', '{"fixture":true}'::jsonb
  FROM public.scp_report_versions rv ORDER BY rv.id LIMIT 1;

-- The holder's own Security Passport, and one disclosure of it to the employer.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, title, lifecycle_state)
VALUES ('ad100000-7777-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1',
        'certification','Väktarutbildning del 1','active');

INSERT INTO public.sp_evidence (holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
VALUES ('ad100000-0000-0000-0000-0000000000b1','ad100000-7777-0000-0000-0000000000b1',
        'ad100000-0000-0000-0000-0000000000b1/bevis.pdf','bevis.pdf','application/pdf', 999);

INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on)
VALUES ('ad100000-0000-0000-0000-0000000000b1','Tidigare AB','Väktare', DATE '2023-01-01');

INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, detail)
VALUES ('ad100000-0000-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1',
        'claim_created','{}'::jsonb);

INSERT INTO public.sp_verification_requests
  (id, holder_user_id, claim_id, request_kind, status, decided_at, decided_by)
VALUES ('ad100000-aaaa-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1',
        'ad100000-7777-0000-0000-0000000000b1','cqrityjob_review','approved',
        now(),'ad100000-0000-0000-0000-0000000000ad');

INSERT INTO public.sp_verification_decisions (request_id, holder_user_id, decided_by, decision)
VALUES ('ad100000-aaaa-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1',
        'ad100000-0000-0000-0000-0000000000ad','approved');

INSERT INTO public.sp_disclosures
  (id, holder_user_id, package_code, application_id, focus_claim_id, purpose, recipient_hint)
VALUES ('ad100000-8888-0000-0000-0000000000b1','ad100000-0000-0000-0000-0000000000b1',
        'employer_review','ad100000-3333-0000-0000-0000000000b1',
        'ad100000-7777-0000-0000-0000000000b1','recruitment','Live Kund AB');

-- What HI DID, not what was done to them. The invitation is editable and its
-- actor is released; the interview note and the employer decision are records
-- the schema forbids anyone from ever editing, and keep the actor they name.
INSERT INTO public.scp_assessment_invitations
  (id, employer_id, assessment_version_id, email, invited_name, use_case, invited_by, expires_at)
VALUES ('ad100000-9999-0000-0000-0000000000b1','ad100000-1111-0000-0000-000000000021',
        :'h_avid'::uuid,'nagon-annan@acc.invalid','Någon Annan','workforce',
        'ad100000-0000-0000-0000-0000000000b1', now() + interval '30 days');

INSERT INTO public.scp_interview_notes (attempt_id, employer_id, area_code, outcome, recorded_by)
VALUES ('ad100000-6666-0000-0000-0000000000b1','ad100000-1111-0000-0000-000000000021',
        'situational_awareness','additional_context','ad100000-0000-0000-0000-0000000000b1');

INSERT INTO public.scp_employer_report_decisions
  (attempt_id, employer_id, action, reason_code, decided_by)
VALUES ('ad100000-6666-0000-0000-0000000000b1','ad100000-1111-0000-0000-000000000021',
        'no_action_needed','meets_expectation','ad100000-0000-0000-0000-0000000000b1');

INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
VALUES ('ad100000-0000-0000-0000-0000000000b1','platform_admin','fixture_action','job',
        'ad100000-2222-0000-0000-000000000031','{}'::jsonb);


-- ── 1. The action is available despite the history ─────────────────────────

SELECT pg_temp.ok(
  jsonb_array_length(public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000b1')
    -> 'blockers') >= 5
  AND (public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000b1')
        ->> 'has_history')::boolean,
  'H1 the account really does carry history -- five or more separate kinds of it');

SELECT pg_temp.ok(
  public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000b1')
    -> 'deleted' ? 'sp_claims.holder_user_id'
  AND public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000b1')
        -> 'detached' ? 'job_applications.applicant_user_id'
  AND public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000b1')
        -> 'preserved' ? 'scp_interview_notes.recorded_by',
  'H2 the report tells the administrator, in advance, which rows are deleted, which detached and which preserved');

-- ── 2. Only a superadmin may do it ─────────────────────────────────────────

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ad';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe(
      'ad100000-0000-0000-0000-0000000000b1','x','historik@acc.invalid')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'H3 an ordinary platform admin cannot permanently delete an account with history either');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ca';
SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe(
      'ad100000-0000-0000-0000-0000000000b1','x','historik@acc.invalid')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED',
  'H4 and an ordinary signed-in person is refused at the same gate');
RESET ROLE;

-- ── 3. An injected failure rolls the whole operation back ──────────────────
--
-- A savepoint stands in for "something raised on the last step". The deletion
-- runs to completion and is then thrown away, and the assertion is that the
-- account and every one of its rows came back exactly as they were -- not that
-- the function refused, which would prove nothing about atomicity.

SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-00000000005a';

SAVEPOINT before_failed_deletion;
SELECT public.admin_delete_user_if_safe(
  'ad100000-0000-0000-0000-0000000000b1','Avbruten radering.','historik@acc.invalid');
ROLLBACK TO SAVEPOINT before_failed_deletion;

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE id = 'ad100000-0000-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.profiles WHERE id = 'ad100000-0000-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 1
  AND (SELECT applicant_user_id FROM public.job_applications
        WHERE id = 'ad100000-3333-0000-0000-0000000000b1') = 'ad100000-0000-0000-0000-0000000000b1'::uuid
  AND (SELECT phone FROM public.job_applications
        WHERE id = 'ad100000-3333-0000-0000-0000000000b1') = '+46701234567'
  AND (SELECT recipient_email FROM public.assessment_assignments
        WHERE id = 'ad100000-5555-0000-0000-0000000000b1') = 'historik@acc.invalid'
  AND (SELECT count(*) FROM public.audit_logs
        WHERE action = 'user_deleted'
          AND subject_id = 'ad100000-0000-0000-0000-0000000000b1') = 0,
  'H5 a deletion that does not commit leaves NOTHING behind -- not a detached application, not a pseudonymised address, not an audit row');

-- ── 4. The deletion itself ─────────────────────────────────────────────────

SELECT public.admin_delete_user_if_safe(
  'ad100000-0000-0000-0000-0000000000b1','Ägarens begäran om radering.','historik@acc.invalid');

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM auth.identities WHERE user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0,
  'H6 the auth account and its sign-in identity are gone');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.profiles WHERE id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.user_roles WHERE user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.employer_memberships WHERE user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.consent_records WHERE user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0,
  'H7 the profile, the platform role, the organisation membership and the consent record went with it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.sp_passport_events WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0
  AND (SELECT count(*) FROM public.sp_verification_decisions WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b1') = 0,
  'H8 the holder''s own Security Passport went with it too, append-only history included');

-- ── 5. What had to survive, survived ───────────────────────────────────────

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications
    WHERE id = 'ad100000-3333-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.job_application_status_events
        WHERE application_id = 'ad100000-3333-0000-0000-0000000000b1') = 1
  AND (SELECT status FROM public.job_applications
        WHERE id = 'ad100000-3333-0000-0000-0000000000b1') = 'reviewing',
  'H9 the employer keeps its recruitment record: the application, its status and its history');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id = 'ad100000-6666-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.scp_competency_evidence
        WHERE subject_id = 'ad100000-4444-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.scp_report_snapshots
        WHERE subject_id = 'ad100000-4444-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.scp_subjects WHERE id = 'ad100000-4444-0000-0000-0000000000b1') = 1,
  'H10 the completed assessment, its reviewed evidence and its released report survive on the pseudonymous subject');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities
    WHERE subject_id = 'ad100000-4444-0000-0000-0000000000b1') = 0,
  'H11 and the subject is no longer attached to any person -- the spine is detached, not deleted');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_disclosures WHERE id = 'ad100000-8888-0000-0000-0000000000b1') = 1
  AND (SELECT holder_user_id FROM public.sp_disclosures
        WHERE id = 'ad100000-8888-0000-0000-0000000000b1') IS NULL
  AND (SELECT holder_detached_at FROM public.sp_disclosures
        WHERE id = 'ad100000-8888-0000-0000-0000000000b1') IS NOT NULL
  AND (SELECT focus_claim_id FROM public.sp_disclosures
        WHERE id = 'ad100000-8888-0000-0000-0000000000b1') IS NULL,
  'H12 the disclosure the employer received survives the holder AND the deleted claim it pointed at');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes
    WHERE recorded_by = 'ad100000-0000-0000-0000-0000000000b1') = 1
  AND (SELECT count(*) FROM public.scp_employer_report_decisions
        WHERE decided_by = 'ad100000-0000-0000-0000-0000000000b1') = 1,
  'H13 the two records nobody may ever edit are untouched, actor id and all');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'user_deleted'
      AND subject_id = 'ad100000-0000-0000-0000-0000000000b1'
      AND metadata ->> 'email' = 'historik@acc.invalid'
      AND (metadata ->> 'had_history')::boolean) = 1
  AND (SELECT count(*) FROM public.audit_logs
        WHERE subject_id = 'ad100000-2222-0000-0000-000000000031'
          AND action = 'fixture_action') = 1,
  'H14 the deletion is on the record, and so is what the person did before it');

-- ── 6. Nothing personal is left where it should have been anonymised ───────

SELECT pg_temp.ok(
  (SELECT applicant_user_id FROM public.job_applications
    WHERE id = 'ad100000-3333-0000-0000-0000000000b1') IS NULL
  AND (SELECT applicant_detached_at FROM public.job_applications
        WHERE id = 'ad100000-3333-0000-0000-0000000000b1') IS NOT NULL
  AND (SELECT coalesce(phone,'') || coalesce(cover_note,'') || coalesce(cv_storage_path,'')
              || coalesce(cv_original_filename,'')
         FROM public.job_applications
        WHERE id = 'ad100000-3333-0000-0000-0000000000b1') = '',
  'H15 the retained application keeps no phone number, no covering note and no CV');

SELECT pg_temp.ok(
  (SELECT recipient_email FROM public.assessment_assignments
    WHERE id = 'ad100000-5555-0000-0000-0000000000b1')
      = 'raderad+ad100000-0000-0000-0000-0000000000b1@removed.invalid'
  AND (SELECT recipient_user_id FROM public.assessment_assignments
        WHERE id = 'ad100000-5555-0000-0000-0000000000b1') IS NULL,
  'H16 the retained assessment assignment carries a pseudonym, not the person''s address');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.job_applications
     WHERE id = 'ad100000-3333-0000-0000-0000000000b1'
       AND (coalesce(phone,'') || coalesce(cover_note,'') || coalesce(employer_note,''))
             ILIKE '%historik@acc.invalid%')
  AND NOT EXISTS (
    SELECT 1 FROM public.assessment_assignments
     WHERE recipient_email = 'historik@acc.invalid')
  AND NOT EXISTS (
    SELECT 1 FROM public.sp_disclosures WHERE recipient_hint = 'historik@acc.invalid'),
  'H17 the deleted address appears nowhere on any retained row');

-- The invitation the person SENT is somebody else's record of somebody else.
-- Releasing the sender must not touch the person it was sent to.
SELECT pg_temp.ok(
  (SELECT invited_by FROM public.scp_assessment_invitations
    WHERE id = 'ad100000-9999-0000-0000-0000000000b1') IS NULL
  AND (SELECT email FROM public.scp_assessment_invitations
        WHERE id = 'ad100000-9999-0000-0000-0000000000b1') = 'nagon-annan@acc.invalid'
  AND (SELECT invited_name FROM public.scp_assessment_invitations
        WHERE id = 'ad100000-9999-0000-0000-0000000000b1') = 'Någon Annan',
  'H18 an invitation they sent keeps the recipient it named, and loses only the sender');

-- ── 7. No orphans ──────────────────────────────────────────────────────────
--
-- Read from the catalogue rather than from a list somebody maintained: every
-- foreign key in public that still points at auth.users is checked for a value
-- that no longer resolves. This is the assertion that would catch a column
-- someone adds later and forgets.

DO $$
DECLARE _rec record; _n bigint;
BEGIN
  FOR _rec IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
       AND c.connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s t WHERE t.%I IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.%I)',
      _rec.tbl, _rec.col, _rec.col) INTO _n;
    IF _n > 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: H19 -- %.% holds % row(s) pointing at a deleted account',
        _rec.tbl, _rec.col, _n;
    END IF;
  END LOOP;
  RAISE NOTICE '    ok  %', 'H19 no foreign key anywhere in the schema still points at the deleted account';
END $$;

-- ── 8. It cannot be reopened, and the address is free ──────────────────────

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled(
      'ad100000-0000-0000-0000-0000000000b1', false, 'Öppna igen.')$$,
  'USER_NOT_FOUND',
  'H20 an account deleted with all its history cannot be reopened either');

SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE email = 'historik@acc.invalid') = 0
  AND (SELECT count(*) FROM auth.identities
        WHERE provider = 'email' AND provider_id = 'historik@acc.invalid') = 0,
  'H21 the address is free -- nothing in auth.users and no identity still claims it');

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad100000-0000-0000-0000-0000000000b2','historik@acc.invalid',
   '{"display_name":"Ny Historik"}'::jsonb);
INSERT INTO auth.identities (user_id, provider, provider_id, identity_data) VALUES
  ('ad100000-0000-0000-0000-0000000000b2','email','historik@acc.invalid',
   '{"email":"historik@acc.invalid"}'::jsonb);

SELECT pg_temp.ok(
  (SELECT id FROM auth.users WHERE email = 'historik@acc.invalid')
    = 'ad100000-0000-0000-0000-0000000000b2'::uuid
  AND (SELECT display_name FROM public.profiles
        WHERE id = 'ad100000-0000-0000-0000-0000000000b2') = 'Ny Historik',
  'H22 the same address registers again, as a new account with a new id and a fresh profile');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.user_roles WHERE user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0
  AND (SELECT count(*) FROM public.employer_memberships WHERE user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0
  AND (SELECT count(*) FROM public.job_applications WHERE applicant_user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0
  AND (SELECT count(*) FROM public.scp_subject_identities WHERE user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0
  AND (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0
  AND (SELECT count(*) FROM public.consent_records WHERE user_id = 'ad100000-0000-0000-0000-0000000000b2') = 0,
  'H23 the new account inherits nothing: no role, no membership, no application, no subject, no Passport, no consent');

-- ── 9. The exception the guards recognise is not a general licence ─────────

SELECT pg_temp.must_fail(
  $$UPDATE public.assessment_assignments
       SET recipient_email = 'nagot-annat@acc.invalid'
     WHERE id = 'ad100000-5555-0000-0000-0000000000b1'$$,
  'ASSESSMENT_ASSIGNMENT_IMMUTABLE',
  'H24 outside a deletion, a superadmin still cannot edit an assignment''s recipient');

SELECT pg_temp.must_fail(
  $$UPDATE public.scp_interview_notes SET outcome = 'evidence_confirmed'
     WHERE attempt_id = 'ad100000-6666-0000-0000-0000000000b1'$$,
  'SCP_INTERVIEW_NOTE_APPEND_ONLY',
  'H25 and an interview note is still append-only, deletion or no deletion');


-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP 9 — Authorisation boundary
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ad100000-0000-0000-0000-0000000000ca';

SELECT pg_temp.must_fail(
  $$SELECT public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000021')$$,
  'platform admin role required',
  'S1 an ordinary authenticated user cannot read an employer deletion impact');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_user_deletion_impact('ad100000-0000-0000-0000-0000000000ca')$$,
  'platform admin role required',
  'S2 an ordinary authenticated user cannot read a user deletion impact');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled('ad100000-0000-0000-0000-0000000000ca', true, 'x')$$,
  'platform admin role required',
  'S3 an ordinary authenticated user cannot disable an account');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_identity_diagnostics()$$,
  'platform admin role required',
  'S4 an ordinary authenticated user cannot read identity diagnostics');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_disposable_records(10)$$,
  'platform admin role required',
  'S5 an ordinary authenticated user cannot read the disposable inventory');

SELECT pg_temp.must_fail(
  $$SELECT public.admin_person_overview('ad100000-0000-0000-0000-0000000000ca')$$,
  'platform admin role required',
  'S5b an ordinary authenticated user cannot read another person''s canonical view');

RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  $$SELECT public.admin_employer_deletion_impact('ad100000-1111-0000-0000-000000000021')$$,
  'permission denied',
  'S6 anon cannot even execute the impact function');
SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_employer_if_safe('ad100000-1111-0000-0000-000000000021','x','y')$$,
  'permission denied',
  'S7 anon cannot even execute employer deletion');
SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe('ad100000-0000-0000-0000-0000000000ca','x','y')$$,
  'permission denied',
  'S8 anon cannot even execute account deletion');
SELECT pg_temp.must_fail(
  $$SELECT public.admin_anonymise_user('ad100000-0000-0000-0000-0000000000ca','x','y')$$,
  'permission denied',
  'S9 anon cannot even execute anonymisation');
SELECT pg_temp.must_fail(
  $$SELECT public.admin_set_user_disabled('ad100000-0000-0000-0000-0000000000ca', true, 'x')$$,
  'permission denied',
  'S10 anon cannot even execute account disable');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_employer_deletion_impact','admin_delete_employer_if_safe',
                        'admin_user_deletion_impact','admin_delete_user_if_safe',
                        'admin_anonymise_user','admin_set_user_disabled',
                        'admin_delete_job_if_safe','admin_identity_diagnostics',
                        'admin_disposable_records','employer_accepts_operations',
                        'admin_person_overview')
      AND p.prosecdef
      AND p.proconfig::text LIKE '%search_path%') = 11,
  'S11 every new function is SECURITY DEFINER with a fixed search_path');

DO $$ BEGIN RAISE NOTICE '    ok  admin_lifecycle_test: 128 assertions passed'; END $$;

ROLLBACK;
