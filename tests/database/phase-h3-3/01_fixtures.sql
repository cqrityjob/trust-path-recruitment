-- Phase H3.3 local validation — synthetic fixtures. Fictional data only.
-- One platform admin, one candidate-only user (no admin, no employer
-- membership), and four employers covering every status the moderation
-- workflow touches (pending/active/suspended/rejected), each with an
-- owner membership.

INSERT INTO auth.users (id, email) VALUES
  ('d3000001-0000-0000-0000-000000000001', 'platform-admin.test@example.invalid'),
  ('d3000002-0000-0000-0000-000000000002', 'candidate-only.test@example.invalid'),
  ('d3000003-0000-0000-0000-000000000003', 'owner-pending.test@example.invalid'),
  ('d3000004-0000-0000-0000-000000000004', 'owner-active.test@example.invalid'),
  ('d3000005-0000-0000-0000-000000000005', 'owner-suspended.test@example.invalid'),
  ('d3000006-0000-0000-0000-000000000006', 'owner-rejected.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d3000001-0000-0000-0000-000000000001', 'admin');

-- auth.users insert already triggers automatic public.profiles row creation
-- (handle_new_user trigger); update rather than insert.
UPDATE public.profiles SET display_name = 'Test Admin' WHERE id = 'd3000001-0000-0000-0000-000000000001';
UPDATE public.profiles SET display_name = 'Owner Pending' WHERE id = 'd3000003-0000-0000-0000-000000000003';
UPDATE public.profiles SET display_name = 'Owner Active' WHERE id = 'd3000004-0000-0000-0000-000000000004';

INSERT INTO auth.users (id, email) VALUES
  ('d3000007-0000-0000-0000-000000000007', 'owner-pending2.test@example.invalid');

INSERT INTO public.employers (id, slug, name, country, registration_number, status) VALUES
  ('e3000001-0000-0000-0000-000000000001', 'fictional-pending-co-3', 'Fictional Pending Co 3', 'SE', '556000-0001', 'pending'),
  ('e3000002-0000-0000-0000-000000000002', 'fictional-active-co-3', 'Fictional Active Co 3', 'SE', '556000-0002', 'active'),
  ('e3000003-0000-0000-0000-000000000003', 'fictional-suspended-co-3', 'Fictional Suspended Co 3', 'SE', '556000-0003', 'suspended'),
  ('e3000004-0000-0000-0000-000000000004', 'fictional-rejected-co-3', 'Fictional Rejected Co 3', 'SE', '556000-0004', 'rejected'),
  ('e3000005-0000-0000-0000-000000000005', 'fictional-pending-co-3b', 'Fictional Pending Co 3b', 'SE', '556000-0005', 'pending');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e3000001-0000-0000-0000-000000000001', 'd3000003-0000-0000-0000-000000000003', 'owner', 'active'),
  ('e3000002-0000-0000-0000-000000000002', 'd3000004-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e3000003-0000-0000-0000-000000000003', 'd3000005-0000-0000-0000-000000000005', 'owner', 'active'),
  ('e3000004-0000-0000-0000-000000000004', 'd3000006-0000-0000-0000-000000000006', 'owner', 'active'),
  ('e3000005-0000-0000-0000-000000000005', 'd3000007-0000-0000-0000-000000000007', 'owner', 'active');
