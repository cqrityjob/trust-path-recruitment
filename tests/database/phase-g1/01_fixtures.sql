-- =============================================================================
-- Phase G1 local validation — synthetic fixtures
--
-- Every identifier below is a fictional, hand-picked UUID and every name is
-- invented for this test run only. No real user, employer, job, email, or
-- token appears anywhere in this file.
-- =============================================================================

-- ---- auth.users (synthetic) -------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin-only.test@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'superadmin-only.test@example.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'content-editor-only.test@example.invalid'),
  ('44444444-4444-4444-4444-444444444444', 'assessment-editor-only.test@example.invalid'),
  ('55555555-5555-5555-5555-555555555555', 'support-only.test@example.invalid'),
  ('66666666-6666-6666-6666-666666666666', 'candidate-no-membership.test@example.invalid'),
  ('77777777-7777-7777-7777-777777777777', 'member-employer-a.test@example.invalid'),
  ('88888888-8888-8888-8888-888888888888', 'owner-a1.test@example.invalid'),
  ('99999999-9999-9999-9999-999999999999', 'owner-a2.test@example.invalid'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dual-org-user.test@example.invalid'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'suspended-member.test@example.invalid'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'removed-member.test@example.invalid'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'invited-member.test@example.invalid'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'employer-scoped-admin-role.test@example.invalid'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'employer-b-member.test@example.invalid');

-- ---- platform roles ----------------------------------------------------------
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'superadmin'),
  ('33333333-3333-3333-3333-333333333333', 'content_editor'),
  ('44444444-4444-4444-4444-444444444444', 'assessment_editor'),
  ('55555555-5555-5555-5555-555555555555', 'support');
-- Every other synthetic user (candidate, employer-scoped roles, dual-org,
-- suspended/removed/invited members) intentionally holds NO platform role.

-- ---- employers (fictional companies) -----------------------------------------
INSERT INTO public.employers (id, slug, name, country, description_sv, description_en) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'fictional-shield-security', 'Fictional Shield Security AB', 'SE', 'Fiktivt testbolag.', 'Fictional test company.'),
  ('b2222222-2222-2222-2222-222222222222', 'fictional-north-guard', 'Fictional North Guard AB', 'SE', 'Fiktivt testbolag.', 'Fictional test company.'),
  ('c3333333-3333-3333-3333-333333333333', 'fictional-suspended-corp', 'Fictional Suspended Corp AB', 'SE', 'Fiktivt testbolag.', 'Fictional test company.'),
  ('d4444444-4444-4444-4444-444444444444', 'fictional-archived-corp', 'Fictional Archived Corp AB', 'SE', 'Fiktivt testbolag.', 'Fictional test company.');

-- ---- jobs (fictional postings, used only for public-visibility tests) --------
-- Employer A: one currently-published, currently-active job.
INSERT INTO public.jobs (id, employer_id, status, published_at, title_sv, title_en) VALUES
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 'published', now() - interval '1 day', 'Fiktiv väktare', 'Fictional Security Officer');
-- Employer C (will be set to status='suspended' after the migration adds
-- the column): also has a published job, to prove the job itself stops
-- being publicly visible once its employer is suspended.
INSERT INTO public.jobs (id, employer_id, status, published_at, title_sv, title_en) VALUES
  ('33333333-cccc-cccc-cccc-333333333333', 'c3333333-3333-3333-3333-333333333333', 'published', now() - interval '1 day', 'Fiktiv väktare (suspenderad)', 'Fictional Security Officer (suspended employer)');
-- Employer D (will be set to status='archived'): same, for the archived case.
INSERT INTO public.jobs (id, employer_id, status, published_at, title_sv, title_en) VALUES
  ('44444444-dddd-dddd-dddd-444444444444', 'd4444444-4444-4444-4444-444444444444', 'published', now() - interval '1 day', 'Fiktiv väktare (arkiverad)', 'Fictional Security Officer (archived employer)');
