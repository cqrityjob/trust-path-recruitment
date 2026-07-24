-- Phase: Employer Assessment Assignment workflow — synthetic fixtures.
-- Fictional data only. Two employers (one active, one pending) to prove
-- the employer_is_active_status() gate on assignment creation; one
-- applicant/job/application on the active employer; one employee on the
-- active employer; a second, unrelated active employer for cross-tenant
-- denial tests.

INSERT INTO auth.users (id, email) VALUES
  ('a1000001-0000-0000-0000-000000000001', 'owner-active.test@example.invalid'),
  ('a1000002-0000-0000-0000-000000000002', 'owner-pending.test@example.invalid'),
  ('a1000003-0000-0000-0000-000000000003', 'owner-other-active.test@example.invalid'),
  ('a1000004-0000-0000-0000-000000000004', 'applicant.test@example.invalid'),
  ('a1000005-0000-0000-0000-000000000005', 'recipient-registered.test@example.invalid');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('b1000001-0000-0000-0000-000000000001', 'fictional-active-assign-co', 'Fictional Active Assign Co', 'SE', 'active'),
  ('b1000002-0000-0000-0000-000000000002', 'fictional-pending-assign-co', 'Fictional Pending Assign Co', 'SE', 'pending'),
  ('b1000003-0000-0000-0000-000000000003', 'fictional-other-active-co', 'Fictional Other Active Co', 'SE', 'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('b1000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', 'owner', 'active'),
  ('b1000002-0000-0000-0000-000000000002', 'a1000002-0000-0000-0000-000000000002', 'owner', 'active'),
  ('b1000003-0000-0000-0000-000000000003', 'a1000003-0000-0000-0000-000000000003', 'owner', 'active');

-- The real jobs_validate_before_write() trigger reserves published_at as
-- moderation-owned (only settable via the actual admin-approval RPC, not
-- a plain UPDATE) -- irrelevant to what these fixtures need (a valid
-- job/application row to attach an assignment to; this suite tests
-- assessment_assignments RLS, not job publishing). Bypassed for this one
-- fixture insert only, as the superuser setting up the fixture, exactly
-- as phase-h3-2-1's own fixtures disable triggers they don't need for
-- their scenario.
ALTER TABLE public.jobs DISABLE TRIGGER jobs_validate_before_write_tg;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type, published_at, expires_at
) VALUES (
  'c1000001-0000-0000-0000-000000000001', 'fictional-active-assign-co-vakt-jkl012', 'jkl012fac3',
  'b1000001-0000-0000-0000-000000000001', 'published', 'Väktare', 'Security Guard',
  'internal', 'protective_operations', 'onsite', now(), now() + interval '30 days'
);
ALTER TABLE public.jobs ENABLE TRIGGER jobs_validate_before_write_tg;

INSERT INTO public.job_applications (
  id, job_id, employer_id, applicant_user_id, status, consent_given_at
) VALUES (
  'd1000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001',
  'b1000001-0000-0000-0000-000000000001', 'a1000004-0000-0000-0000-000000000004',
  'submitted', now()
);

INSERT INTO public.employees (
  id, employer_id, first_name, last_name, email, employment_status, created_by
) VALUES (
  'e1000001-0000-0000-0000-000000000001', 'b1000001-0000-0000-0000-000000000001',
  'Test', 'Employee', 'employee.test@example.invalid', 'active',
  'a1000001-0000-0000-0000-000000000001'
);
