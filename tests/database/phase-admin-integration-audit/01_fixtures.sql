-- Admin System Integration Audit — fixtures.
-- Fictional data only. One platform admin, one employer starting
-- 'pending' (self-service onboarding default), two draft jobs on it to
-- prove the publish-requires-active-employer gate across the employer's
-- full pending -> active -> suspended -> active lifecycle.

INSERT INTO auth.users (id, email) VALUES
  ('a1900001-0000-0000-0000-000000000001', 'platform-admin.test@example.invalid'),
  ('a1900002-0000-0000-0000-000000000002', 'owner-pending.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1900001-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('a1900011-0000-0000-0000-000000000001', 'fictional-audit-employer-co', 'Fictional Audit Employer Co', 'SE', 'pending');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('a1900011-0000-0000-0000-000000000001', 'a1900002-0000-0000-0000-000000000002', 'owner', 'active');

-- Two draft jobs, inserted as the platform admin (is_platform_admin()
-- exempts admin-authored INSERTs from the employer-facing draft-only
-- rule, matching adminSaveJobDraft()'s own real write path).
SELECT set_config('request.jwt.claim.sub', 'a1900001-0000-0000-0000-000000000001', false);
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, application_url, family_id, workplace_type, deadline_at, expires_at
) VALUES (
  'a1900021-0000-0000-0000-000000000001', 'fictional-audit-employer-co-vakt-abc123', 'abc123fac4',
  'a1900011-0000-0000-0000-000000000001', 'draft', 'Väktare', 'Security Guard',
  'external', 'https://example.invalid/apply', 'protective_operations', 'onsite',
  now() + interval '20 days', now() + interval '30 days'
);
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, application_url, family_id, workplace_type, deadline_at, expires_at
) VALUES (
  'a1900022-0000-0000-0000-000000000002', 'fictional-audit-employer-co-ordningsvakt-def456', 'def456fac5',
  'a1900011-0000-0000-0000-000000000001', 'draft', 'Ordningsvakt', 'Order Guard',
  'external', 'https://example.invalid/apply2', 'protective_operations', 'onsite',
  now() + interval '20 days', now() + interval '30 days'
);
RESET ALL;
