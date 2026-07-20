-- Phase H3.4A local validation — synthetic fixtures. Fictional data only.
-- One platform admin, two candidates (for cross-candidate isolation),
-- two active employers each with one owner member (for cross-tenant
-- isolation), and four jobs covering every eligibility combination the
-- submission path must distinguish: published+internal (applicable),
-- published+external (wrong method), draft+internal (wrong status), and
-- a second employer's published+internal job (cross-tenant target).

INSERT INTO auth.users (id, email) VALUES
  ('d4000001-0000-0000-0000-000000000001', 'platform-admin.h34a.test@example.invalid'),
  ('d4000002-0000-0000-0000-000000000002', 'candidate-a.h34a.test@example.invalid'),
  ('d4000003-0000-0000-0000-000000000003', 'candidate-b.h34a.test@example.invalid'),
  ('d4000004-0000-0000-0000-000000000004', 'owner-1.h34a.test@example.invalid'),
  ('d4000005-0000-0000-0000-000000000005', 'owner-2.h34a.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d4000001-0000-0000-0000-000000000001', 'admin');

UPDATE public.profiles SET display_name = 'Test Admin H34A' WHERE id = 'd4000001-0000-0000-0000-000000000001';
UPDATE public.profiles SET display_name = 'Candidate A' WHERE id = 'd4000002-0000-0000-0000-000000000002';
UPDATE public.profiles SET display_name = 'Candidate B' WHERE id = 'd4000003-0000-0000-0000-000000000003';

INSERT INTO public.employers (id, slug, name, country, registration_number, status) VALUES
  ('e4000001-0000-0000-0000-000000000001', 'fictional-h34a-employer-1', 'Fictional H34A Employer 1', 'SE', '556000-1001', 'active'),
  ('e4000002-0000-0000-0000-000000000002', 'fictional-h34a-employer-2', 'Fictional H34A Employer 2', 'SE', '556000-1002', 'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e4000001-0000-0000-0000-000000000001', 'd4000004-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e4000002-0000-0000-0000-000000000002', 'd4000005-0000-0000-0000-000000000005', 'owner', 'active');

-- Jobs are inserted directly with status='published'/'draft' as fixtures
-- (not via the real employer-submit-then-admin-approve flow) -- the
-- jobs_validate_before_write() trigger only allows a non-admin caller to
-- INSERT status='draft', so these fixture inserts run under the admin's
-- auth.uid() context, exactly like a platform admin using adminUpsertEmployer-
-- style tooling would.
SELECT set_config('request.jwt.claim.sub', 'd4000001-0000-0000-0000-000000000001', false);

-- j4000001: published + internal -- the applicable job for most tests.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en,
  application_method, family_id, workplace_type, published_at, expires_at
) VALUES (
  'f4000001-0000-0000-0000-000000000001', 'fictional-h34a-employer-1-vakt-aaa111', 'aaa111fh4a',
  'e4000001-0000-0000-0000-000000000001', 'published', 'Väktare', 'Security Guard',
  'Beskrivning', 'Description',
  'internal', 'protective_operations', 'onsite', now(), now() + interval '30 days'
);

-- j4000002: published + external -- NOT applicable via on-platform submission.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en,
  application_method, application_url, family_id, workplace_type, published_at, expires_at
) VALUES (
  'f4000002-0000-0000-0000-000000000002', 'fictional-h34a-employer-1-analytiker-bbb222', 'bbb222fh4a',
  'e4000001-0000-0000-0000-000000000001', 'published', 'SOC-analytiker', 'SOC Analyst',
  'Beskrivning', 'Description',
  'external', 'https://example.invalid/apply', 'security_technology', 'onsite', now(), now() + interval '30 days'
);

-- j4000003: draft + internal -- NOT applicable (not published yet).
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en,
  application_method, family_id, workplace_type
) VALUES (
  'f4000003-0000-0000-0000-000000000003', 'fictional-h34a-employer-1-draft-ccc333', 'ccc333fh4a',
  'e4000001-0000-0000-0000-000000000001', 'draft', 'Utkast', 'Draft role',
  'Beskrivning', 'Description',
  'internal', 'protective_operations', 'onsite'
);

-- j4000004: second employer, published + internal -- cross-tenant target.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en,
  application_method, family_id, workplace_type, published_at, expires_at
) VALUES (
  'f4000004-0000-0000-0000-000000000004', 'fictional-h34a-employer-2-vakt-ddd444', 'ddd444fh4a',
  'e4000002-0000-0000-0000-000000000002', 'published', 'Väktare', 'Security Guard',
  'Beskrivning', 'Description',
  'internal', 'protective_operations', 'onsite', now(), now() + interval '30 days'
);
