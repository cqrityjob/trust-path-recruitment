-- =============================================================================
-- Phase G1 local validation — employer_memberships fixtures
--
-- Applied AFTER the Phase G1 migration (employer_memberships doesn't exist
-- before it). All synthetic, fictional data — see 01_fixtures.sql for the
-- corresponding auth.users/employers rows.
-- =============================================================================

-- auth.users row for employer B's sole owner (must exist before it's
-- referenced by the employer_memberships FK below).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'sole-owner-b.test@example.invalid')
ON CONFLICT (id) DO NOTHING;

-- Employer A ('a1111111-...'): TWO active owners — used for "one of two
-- owners can be changed" (test 20) and the concurrency race (test 21).
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'owner', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now()),
  ('a1111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'owner', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());

-- Employer A: one plain member, used for basic "active member sees only
-- own membership/employer" tests, and cross-employer isolation tests.
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'member', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());

-- Employer A: one employer-scoped "admin" role member (distinct from
-- platform app_role.admin) — used for the role-naming isolation test.
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());

-- Employer A: suspended / removed / invited memberships — none of these
-- should grant any access.
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at, removed_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'suspended', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now(), NULL),
  ('a1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', 'removed', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now(), now());
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'member', 'invited', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());

-- Employer B ('b2222222-...'): a SOLE active owner — used for the
-- final-owner-blocked negative tests (17, 18, 19). Each blocked attempt
-- raises and rolls back, so the same row is reused across all three.
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());

-- Employer B: also has the dual-org user and one employer-B-only member,
-- used for "user in two employers sees only those two" (test 10) and
-- general cross-employer isolation.
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('b2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'member', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());

-- The dual-org user is ALSO an active member of employer A (test 10 needs
-- exactly two distinct, correctly-separated employers for one user).
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'active', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now(), now());
