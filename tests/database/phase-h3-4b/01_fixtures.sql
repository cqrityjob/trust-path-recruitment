-- Phase H3.4B local validation — synthetic fixtures. Fictional data only.
-- One platform admin, two ordinary users (candidate-shaped, no special
-- role) to prove owner-insert-only / admin-select-only RLS on
-- beta_feedback.

INSERT INTO auth.users (id, email) VALUES
  ('d4b00001-0000-0000-0000-000000000001', 'platform-admin.h34b.test@example.invalid'),
  ('d4b00002-0000-0000-0000-000000000002', 'user-a.h34b.test@example.invalid'),
  ('d4b00003-0000-0000-0000-000000000003', 'user-b.h34b.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d4b00001-0000-0000-0000-000000000001', 'admin');
