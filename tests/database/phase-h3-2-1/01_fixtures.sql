-- Phase H3.2.1 local validation — synthetic fixtures. Fictional data only.
-- Reuses the same employer/user shape as tests/database/phase-h3-2 (one
-- pending employer, one active employer, one suspended employer) and adds
-- jobs + job_applications rows so the dashboard/applications defect fixes
-- can be verified against real RLS-scoped reads, plus a genuine
-- candidate-only user with no employer membership at all.

INSERT INTO auth.users (id, email) VALUES
  ('d1000001-0000-0000-0000-000000000001', 'owner-pending.test@example.invalid'),
  ('d1000002-0000-0000-0000-000000000002', 'owner-active.test@example.invalid'),
  ('d1000003-0000-0000-0000-000000000003', 'owner-suspended.test@example.invalid'),
  ('d1000004-0000-0000-0000-000000000004', 'candidate-only.test@example.invalid'),
  ('d1000005-0000-0000-0000-000000000005', 'applicant.test@example.invalid'),
  ('d1000006-0000-0000-0000-000000000006', 'platform-admin.test@example.invalid');

-- Only used to establish the one already-published fixture row below via
-- the same admin exemption jobs_validate_before_write() already grants in
-- production (is_platform_admin(auth.uid())) -- no test in this suite
-- exercises admin behaviour itself.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('d1000006-0000-0000-0000-000000000006', 'admin');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('e1000001-0000-0000-0000-000000000001', 'fictional-pending-co', 'Fictional Pending Co', 'SE', 'pending'),
  ('e1000002-0000-0000-0000-000000000002', 'fictional-active-co', 'Fictional Active Co', 'SE', 'active'),
  ('e1000003-0000-0000-0000-000000000003', 'fictional-suspended-co', 'Fictional Suspended Co', 'SE', 'suspended');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e1000002-0000-0000-0000-000000000002', 'd1000002-0000-0000-0000-000000000002', 'owner', 'active'),
  ('e1000003-0000-0000-0000-000000000003', 'd1000003-0000-0000-0000-000000000003', 'owner', 'active');

-- Pending employer: one draft job only (cannot publish while pending).
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f1000001-0000-0000-0000-000000000001', 'fictional-pending-co-vakt-abc123', 'abc123fpc1',
  'e1000001-0000-0000-0000-000000000001', 'draft', 'Väktare', 'Security Guard',
  'external', 'protective_operations', 'onsite'
);

-- Active employer: one published job (with applications) + one draft.
-- Inserted as the platform-admin fixture user because
-- jobs_validate_before_write() only allows a non-admin employer INSERT to
-- create status='draft' rows (matching production: an employer can never
-- insert a job directly into 'published') -- this mirrors how a real
-- published row actually comes to exist (draft -> pending_review ->
-- admin-approved publish), condensed to one admin-authored insert for
-- fixture setup only.
SELECT set_config('request.jwt.claim.sub', 'd1000006-0000-0000-0000-000000000006', false);
SET ROLE authenticated;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, application_url, family_id, workplace_type,
  published_at, expires_at
) VALUES (
  'f1000002-0000-0000-0000-000000000002', 'fictional-active-co-soc-def456', 'def456fac2',
  'e1000002-0000-0000-0000-000000000002', 'published', 'SOC-analytiker', 'SOC Analyst',
  'external', 'https://example.invalid/apply', 'security_technology', 'hybrid',
  now(), now() + interval '30 days'
);
RESET ROLE;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f1000003-0000-0000-0000-000000000003', 'fictional-active-co-draft-ghi789', 'ghi789fac3',
  'e1000002-0000-0000-0000-000000000002', 'draft', 'Riskanalytiker', 'Risk Analyst',
  'external', 'risk_management', 'remote'
);

-- Suspended employer: one job, left over from before suspension.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f1000004-0000-0000-0000-000000000004', 'fictional-suspended-co-draft-jkl012', 'jkl012fsc4',
  'e1000003-0000-0000-0000-000000000003', 'draft', 'Skyddsvakt', 'Protective Guard',
  'external', 'protective_operations', 'onsite'
);

-- One application on the active employer's published job, from the
-- candidate-only user (who has no employer membership anywhere).
INSERT INTO public.job_applications (
  id, job_id, applicant_user_id, status, consent_given_at
) VALUES (
  'a1000001-0000-0000-0000-000000000001', 'f1000002-0000-0000-0000-000000000002',
  'd1000005-0000-0000-0000-000000000005', 'submitted', now()
);
