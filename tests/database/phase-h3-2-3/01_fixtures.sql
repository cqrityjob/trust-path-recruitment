-- Phase H3.2.3 local validation — synthetic fixtures. Fictional data only.
-- One pending employer, one active employer, a candidate-only user for
-- cross-tenant checks, and one pre-existing draft job per employer to
-- edit/submit against.

INSERT INTO auth.users (id, email) VALUES
  ('d2000001-0000-0000-0000-000000000001', 'owner-pending.test@example.invalid'),
  ('d2000002-0000-0000-0000-000000000002', 'owner-active.test@example.invalid'),
  ('d2000003-0000-0000-0000-000000000003', 'candidate-only.test@example.invalid');

INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('e2000001-0000-0000-0000-000000000001', 'fictional-pending-co-2', 'Fictional Pending Co 2', 'SE', 'pending'),
  ('e2000002-0000-0000-0000-000000000002', 'fictional-active-co-2', 'Fictional Active Co 2', 'SE', 'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e2000001-0000-0000-0000-000000000001', 'd2000001-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e2000002-0000-0000-0000-000000000002', 'd2000002-0000-0000-0000-000000000002', 'owner', 'active');

-- Pre-existing draft job for the active employer, used by the edit/submit
-- tests below (T4/T5/T7) so we exercise UPDATE, not just INSERT.
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  description_sv, description_en,
  application_method, application_url, family_id, workplace_type, expires_at
) VALUES (
  'f2000001-0000-0000-0000-000000000001', 'fictional-active-co-2-soc-abc123', 'abc123fac2',
  'e2000002-0000-0000-0000-000000000002', 'draft', 'SOC-analytiker', 'SOC Analyst',
  'Beskrivning', 'Description',
  'external', 'https://example.invalid/apply', 'security_technology', 'onsite',
  now() + interval '30 days'
);
