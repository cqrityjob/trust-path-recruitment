-- Phase H3.2 local validation — synthetic fixtures. Fictional data only.

INSERT INTO auth.users (id, email) VALUES
  ('d0000001-0000-0000-0000-000000000001', 'owner-a.test@example.invalid'),
  ('d0000002-0000-0000-0000-000000000002', 'member-a.test@example.invalid'),
  ('d0000003-0000-0000-0000-000000000003', 'owner-b.test@example.invalid'),
  ('d0000004-0000-0000-0000-000000000004', 'owner-suspended.test@example.invalid'),
  ('d0000005-0000-0000-0000-000000000005', 'platform-admin.test@example.invalid');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d0000005-0000-0000-0000-000000000005', 'admin');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('e0000001-0000-0000-0000-000000000001', 'fictional-company-a', 'Fictional Company A', 'SE', 'pending'),
  ('e0000002-0000-0000-0000-000000000002', 'fictional-company-b', 'Fictional Company B', 'SE', 'active'),
  ('e0000003-0000-0000-0000-000000000003', 'fictional-company-c', 'Fictional Company C', 'SE', 'suspended');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e0000001-0000-0000-0000-000000000001', 'd0000002-0000-0000-0000-000000000002', 'member', 'active'),
  ('e0000002-0000-0000-0000-000000000002', 'd0000003-0000-0000-0000-000000000003', 'owner', 'active'),
  ('e0000003-0000-0000-0000-000000000003', 'd0000004-0000-0000-0000-000000000004', 'owner', 'active');
