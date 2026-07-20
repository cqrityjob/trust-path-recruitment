-- Phase H3.4 job-rejection-note-guard local validation — synthetic
-- fixtures. Fictional data only. One platform admin, one employer owner
-- (non-admin, for the "non-admin cannot reject" test), one active
-- employer, and four jobs covering every scenario the fix must
-- distinguish: a pending_review job to exercise reject_job() itself
-- (null/empty/whitespace/valid note), a draft job to prove publish is
-- unaffected, a second pending_review job for the non-admin-forbidden
-- test, and a third pending_review job for the direct-raw-update-bypass
-- test.

INSERT INTO auth.users (id, email) VALUES
  ('d4c00001-0000-0000-0000-000000000001', 'platform-admin.h34fix.test@example.invalid'),
  ('d4c00002-0000-0000-0000-000000000002', 'owner.h34fix.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d4c00001-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.employers (id, slug, name, country, registration_number, status) VALUES
  ('e4c00001-0000-0000-0000-000000000001', 'fictional-h34fix-employer', 'Fictional H34Fix Employer', 'SE', '556000-2001', 'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e4c00001-0000-0000-0000-000000000001', 'd4c00002-0000-0000-0000-000000000002', 'owner', 'active');

-- Jobs are inserted directly with status='pending_review'/'draft' as
-- fixtures (not via the real employer-submit flow) -- the
-- jobs_validate_before_write() trigger only allows a non-admin caller to
-- INSERT status='draft', so these fixture inserts run under the admin's
-- auth.uid() context, exactly like the H3.4A fixtures already do.
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);

-- f4c00001: pending_review -- the job reject_job() is exercised against.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en, application_method, family_id, workplace_type
) VALUES (
  'f4c00001-0000-0000-0000-000000000001', 'fictional-h34fix-employer-vakt-aaa111', 'aaa111h34fx',
  'e4c00001-0000-0000-0000-000000000001', 'pending_review', 'Väktare', 'Security Guard',
  'Beskrivning', 'Description', 'internal', 'protective_operations', 'onsite'
);

-- f4c00002: draft -- used to prove publish/approve is unaffected.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en, application_method, family_id, workplace_type
) VALUES (
  'f4c00002-0000-0000-0000-000000000002', 'fictional-h34fix-employer-analytiker-bbb222', 'bbb222h34fx',
  'e4c00001-0000-0000-0000-000000000001', 'draft', 'SOC-analytiker', 'SOC Analyst',
  'Beskrivning', 'Description', 'internal', 'security_technology', 'onsite'
);

-- f4c00003: pending_review -- used for the non-admin-forbidden test.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en, application_method, family_id, workplace_type
) VALUES (
  'f4c00003-0000-0000-0000-000000000003', 'fictional-h34fix-employer-tekniker-ccc333', 'ccc333h34fx',
  'e4c00001-0000-0000-0000-000000000001', 'pending_review', 'Larmtekniker', 'Alarm Technician',
  'Beskrivning', 'Description', 'internal', 'security_technology', 'onsite'
);

-- f4c00004: pending_review -- used for the direct-raw-update-bypass test.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en, application_method, family_id, workplace_type
) VALUES (
  'f4c00004-0000-0000-0000-000000000004', 'fictional-h34fix-employer-vakt2-ddd444', 'ddd444h34fx',
  'e4c00001-0000-0000-0000-000000000001', 'pending_review', 'Väktare (kväll)', 'Security Guard (evening)',
  'Beskrivning', 'Description', 'internal', 'protective_operations', 'onsite'
);
