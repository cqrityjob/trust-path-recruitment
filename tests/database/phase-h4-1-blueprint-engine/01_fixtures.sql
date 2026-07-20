-- =============================================================================
-- H4.1 Phase 1 local validation -- fixtures. Real schema fidelity: every new
-- table/RPC is exercised against the actual, full applied migration history
-- (bootstrap + every real supabase/migrations/*.sql file, minus the 7
-- confirmed duplicate/consolidated-snapshot files), not a hand-reconstructed
-- subset. Uses real seeded cig_professions/cig_work_environments/
-- cig_competencies rows.
-- =============================================================================

-- Actors
INSERT INTO auth.users (id, email) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'admin@test.local'),
  ('e0000001-0000-0000-0000-000000000001', 'employer-owner-a@test.local'),
  ('e0000002-0000-0000-0000-000000000002', 'employer-owner-b@test.local'),
  ('c0000001-0000-0000-0000-000000000001', 'candidate-1@test.local'),
  ('c0000002-0000-0000-0000-000000000002', 'candidate-2@test.local');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'admin');

-- Two employers, each with an active owner membership -- used to prove
-- cross-organisation Requirement Profile isolation.
INSERT INTO public.employers (id, slug, name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'test-employer-a', 'Test Employer A'),
  ('22222222-0000-0000-0000-000000000002', 'test-employer-b', 'Test Employer B');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('11111111-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'owner', 'active'),
  ('22222222-0000-0000-0000-000000000002', 'e0000002-0000-0000-0000-000000000002', 'owner', 'active');

-- Curate exactly one real, already-seeded Role and Environment as
-- assessable, matching how a platform admin would do it via a future
-- Builder UI (direct row update here since no RPC governs is_assessable
-- itself in Phase 1 -- it is pure curation data, not a state transition).
UPDATE public.cig_professions SET is_assessable = true WHERE slug = 'vaktare';
UPDATE public.cig_work_environments SET is_assessable = true WHERE slug = 'indoor-static-post';
