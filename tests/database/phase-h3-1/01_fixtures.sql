-- =============================================================================
-- Phase H3.1 local validation — synthetic fixtures
-- Every identifier is fictional. Run after 00_mock_schema.sql (reused from
-- tests/database/phase-g1/), the real G1 migration, and the H3.1 migration.
-- =============================================================================

INSERT INTO auth.users (id, email) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'candidate-a.test@example.invalid'),
  ('c0000002-0000-0000-0000-000000000002', 'candidate-b.test@example.invalid'),
  ('c0000003-0000-0000-0000-000000000003', 'candidate-c.test@example.invalid'),
  ('c0000004-0000-0000-0000-000000000004', 'platform-admin.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c0000004-0000-0000-0000-000000000004', 'admin');
