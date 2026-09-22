-- LOCAL-ONLY fixture for walking the employer lifecycle (phases 2 and 3).
--
-- Everything here is synthetic and lives on one laptop behind localhost. It
-- creates no production account, touches no hosted project, and contains no
-- real person's name, address or CV.
--
-- ── WHAT IT PREPARES, AND WHY EACH PIECE IS NEEDED ──────────────────────
--
-- Phase 2 is about a VACANCY summarising its own pipeline, so the walk needs
-- one job with applications spread across the stages -- a single status would
-- let a broken count look right.
--
--   EL-1  a job with five applications: two submitted, one at interview, one
--         hired, one rejected. The rejected row is what proves the total
--         counts the whole vacancy while no stage claims it.
--
-- Phase 3 is about ONE COLLEAGUE, and the two cases that look identical in a
-- list and are not:
--
--   EL-2  an employment record bound to a person AND carrying the application
--         it came out of -> "hired from" is drawn, and development activity
--         can be attributed
--   EL-3  an employment record with no person bound to it -> the development
--         section must say so rather than showing an empty list, which would
--         be a claim about the colleague
--
-- And the Product Owner's split needs an organisation that has NOT been
-- approved, because "a pending organisation may draft a job and may not create
-- an employee" is not observable with an active one:
--
--   EL-4  a pending organisation with its own owner
--
-- It deliberately writes NO training assignment. A hand-built one would prove
-- the page can render a row this file wrote rather than one scp_assign_training
-- produced; the walk asserts the honest empty state instead, and the DB suite
-- owns the assignment path.
--
-- Idempotent: every insert is ON CONFLICT DO UPDATE, so the walk can be run
-- again without finding its own finished state in the way.
--
-- Run against the LOCAL stack only:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/fixtures/interview-journey-fixture.sql
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/fixtures/employer-lifecycle-fixture.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- The same refusal the other employer fixtures carry. A fixture that writes
  -- applications and employment records must not be capable of running by
  -- accident against a database holding real people.
  IF current_setting('server_version_num')::int > 0
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'SCP_EL_FIXTURE_WRONG_DATABASE: this fixture writes recruitment and employment records and runs only against the local development database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions, asserted rather than assumed.
--
-- This fixture EXTENDS the journey fixture: the employer, its owner and the
-- account that can sign in all come from there. Failing loudly is much better
-- than inserting rows that reference an employer nobody can sign in to.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employers
                  WHERE id = '9e000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION
      'SCP_EL_FIXTURE_MISSING_JOURNEY: run scripts/fixtures/interview-journey-fixture.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- EL-4 · An organisation nobody has approved, with an owner who can sign in.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   'e1f00000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'pending-owner@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Vantande Agare"}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('e1f00000-0000-4000-8000-0000000000b1', 'e1f00000-0000-4000-8000-0000000000b1',
   '{"sub":"e1f00000-0000-4000-8000-0000000000b1","email":"pending-owner@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Created pending, and LEFT pending. employers.status may only move through
-- moderate_employer(), so this row is born where the walk needs it.
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('e1f00000-1111-4000-8000-0000000000b1', 'Vantande Vakt AB', 'vantande-vakt', 'pending')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('e1f00000-0000-4000-8000-0000000000b1', 'e1f00000-1111-4000-8000-0000000000b1', 'owner', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active', role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- EL-1 · One vacancy, and a pipeline spread across the stages.
-- ---------------------------------------------------------------------------
-- CREATED as a draft, then published, exactly as the product does it.
--
-- jobs_validate_before_write() refuses an insert with any other status for
-- anybody who is not a platform admin, and job_applications_stamp_employer_id()
-- refuses an application to anything but a published advertisement. Both rules
-- are correct; the fixture takes the same two steps a recruiter takes rather
-- than working around either.
INSERT INTO public.jobs (
  id, employer_id, slug, short_id, title_sv, title_en, status, application_method,
  description_sv, description_en, location_text)
VALUES
  ('e1f00000-2222-4000-8000-0000000000f1', '9e000000-0000-4000-8000-00000000000a',
   'lifecycle-vaktare', 'elfjob0001', 'Vaktare, lifecycle', 'Guard, lifecycle',
   'draft', 'internal', 'Testannons for lifecycle-vandringen.',
   'Test advertisement for the lifecycle walk.', 'Stockholm')
ON CONFLICT (id) DO NOTHING;

-- And then the transition the product itself performs. An advertisement may
-- only be CREATED as a draft, and an application may only be made to a
-- PUBLISHED one -- both rules are correct and both apply here, so the fixture
-- follows the same two steps a recruiter does. `published_at` is a
-- moderation-owned field the trigger stamps, so it is not sent.
UPDATE public.jobs
   SET status = 'published',
       expires_at = now() + interval '80 days'
 WHERE id = 'e1f00000-2222-4000-8000-0000000000f1'
   AND status <> 'published';

-- Five candidates, five applications. Applicant accounts are minimal: this
-- walk never signs in as one of them.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('e1f00000-3333-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'lifecycle-candidate-' || n || '@local.test',
  crypt('LocalJourney!2026', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  ('{"full_name":"EL Kandidat ' || n || '"}')::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
FROM generate_series(1, 5) AS n
ON CONFLICT (id) DO UPDATE
  SET email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  ('e1f00000-3333-4000-8000-00000000000' || n),
  ('e1f00000-3333-4000-8000-00000000000' || n)::uuid,
  ('{"sub":"e1f00000-3333-4000-8000-00000000000' || n
     || '","email":"lifecycle-candidate-' || n || '@local.test","email_verified":true}')::jsonb,
  'email', now(), now(), now()
FROM generate_series(1, 5) AS n
ON CONFLICT (provider, provider_id) DO NOTHING;

-- The statuses are written directly here rather than through
-- set_application_status(): this fixture is preparing a PICTURE for the walk,
-- not exercising the transition table, which the database suite owns.
INSERT INTO public.job_applications (
  id, job_id, employer_id, applicant_user_id, status, consent_given_at, created_at)
VALUES
  ('e1f00000-4444-4000-8000-0000000000a1', 'e1f00000-2222-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000a', 'e1f00000-3333-4000-8000-000000000001',
   'submitted', now(), now() - interval '5 days'),
  ('e1f00000-4444-4000-8000-0000000000a2', 'e1f00000-2222-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000a', 'e1f00000-3333-4000-8000-000000000002',
   'submitted', now(), now() - interval '4 days'),
  ('e1f00000-4444-4000-8000-0000000000a3', 'e1f00000-2222-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000a', 'e1f00000-3333-4000-8000-000000000003',
   'interview', now(), now() - interval '3 days'),
  ('e1f00000-4444-4000-8000-0000000000a4', 'e1f00000-2222-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000a', 'e1f00000-3333-4000-8000-000000000004',
   'hired', now(), now() - interval '2 days'),
  ('e1f00000-4444-4000-8000-0000000000a5', 'e1f00000-2222-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000a', 'e1f00000-3333-4000-8000-000000000005',
   'rejected', now(), now() - interval '1 day')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- EL-2 · An employment record that came out of that hire, bound to a person.
-- EL-3 · And one that is not bound to anybody.
--
-- subject_id and hired_from_application_id are function-only for an employer
-- member and are written here as the fixture's own superuser connection -- the
-- same thing scp_employment_from_application() would have written, without
-- requiring the walk to perform a hire first.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_subjects (id) VALUES
  ('e1f00000-5555-4000-8000-000000000051'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('e1f00000-5555-4000-8000-000000000051'::uuid,
   'e1f00000-3333-4000-8000-000000000004')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.employees (
  id, employer_id, first_name, last_name, email, role_title, site_name,
  employment_status, start_date, created_by, subject_id, hired_from_application_id,
  hired_from_job_id)
VALUES
  ('e1f00000-6666-4000-8000-0000000000e1', '9e000000-0000-4000-8000-00000000000a',
   'EL', 'Anstalld', 'lifecycle-candidate-4@local.test', 'Vaktare', 'Stockholm City',
   'active', current_date - 30, '9e000000-0000-4000-8000-000000000001',
   'e1f00000-5555-4000-8000-000000000051'::uuid,
   'e1f00000-4444-4000-8000-0000000000a4', 'e1f00000-2222-4000-8000-0000000000f1'),
  ('e1f00000-6666-4000-8000-0000000000e2', '9e000000-0000-4000-8000-00000000000a',
   'EL', 'Obunden', NULL, 'Vaktare', 'Stockholm Syd',
   'active', current_date - 10, '9e000000-0000-4000-8000-000000000001',
   NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE
  SET subject_id = EXCLUDED.subject_id,
      hired_from_application_id = EXCLUDED.hired_from_application_id,
      hired_from_job_id = EXCLUDED.hired_from_job_id,
      employment_status = 'active';

COMMIT;

DO $$ BEGIN RAISE NOTICE 'EL fixture ready: 1 vacancy, 5 applications, 2 employment records, 1 pending organisation.'; END $$;
