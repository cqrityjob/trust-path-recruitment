-- Admin Portal operational-scope — fixtures. Fictional data only.
--
-- Two platform admins (one superadmin, one ordinary admin), two separate
-- employer organisations (A active, B pending) each with their own owner,
-- an employee on each org, and one assignment on org A -- enough to
-- prove: admin-wide read visibility, cross-tenant isolation for ordinary
-- employer users, superadmin-only role management with self-elevation
-- and last-superadmin protection, and admin assignment cancellation.

INSERT INTO auth.users (id, email) VALUES
  ('a2000001-0000-0000-0000-000000000001', 'superadmin.test@example.invalid'),
  ('a2000002-0000-0000-0000-000000000002', 'ordinary-admin.test@example.invalid'),
  ('a2000003-0000-0000-0000-000000000003', 'owner-org-a.test@example.invalid'),
  ('a2000004-0000-0000-0000-000000000004', 'owner-org-b.test@example.invalid'),
  ('a2000005-0000-0000-0000-000000000005', 'recipient.test@example.invalid'),
  ('a2000006-0000-0000-0000-000000000006', 'second-superadmin.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a2000001-0000-0000-0000-000000000001', 'superadmin'),
  ('a2000002-0000-0000-0000-000000000002', 'admin'),
  ('a2000006-0000-0000-0000-000000000006', 'superadmin');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('a2000011-0000-0000-0000-000000000001', 'fictional-portal-org-a', 'Fictional Portal Org A', 'SE', 'active'),
  ('a2000012-0000-0000-0000-000000000002', 'fictional-portal-org-b', 'Fictional Portal Org B', 'SE', 'pending');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('a2000011-0000-0000-0000-000000000001', 'a2000003-0000-0000-0000-000000000003', 'owner', 'active'),
  ('a2000012-0000-0000-0000-000000000002', 'a2000004-0000-0000-0000-000000000004', 'owner', 'active');

INSERT INTO public.employees (
  id, employer_id, first_name, last_name, email, employment_status, created_by
) VALUES (
  'a2000021-0000-0000-0000-000000000001', 'a2000011-0000-0000-0000-000000000001',
  'Org A', 'Employee', 'employee-a.test@example.invalid', 'active',
  'a2000003-0000-0000-0000-000000000003'
), (
  'a2000022-0000-0000-0000-000000000002', 'a2000012-0000-0000-0000-000000000002',
  'Org B', 'Employee', 'employee-b.test@example.invalid', 'active',
  'a2000004-0000-0000-0000-000000000004'
);

INSERT INTO public.assessment_assignments (
  id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
  recipient_email, assigned_by, language, status, invitation_token_hash, expires_at, invited_at
) VALUES (
  'a2000031-0000-0000-0000-000000000001', 'a2000011-0000-0000-0000-000000000001',
  'security_career_guidance',
  (SELECT id FROM public.assessment_versions WHERE assessment_id = 'security_career_guidance' LIMIT 1),
  'security_professional', 'workforce',
  'recipient.test@example.invalid', 'a2000003-0000-0000-0000-000000000003', 'sv', 'invited',
  'fictional-hash-do-not-use-0000000000000000000000000000000000000000000000000000000001',
  now() + interval '14 days', now()
);
