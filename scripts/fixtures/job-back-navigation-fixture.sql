-- Job back-navigation fixture: the synthetic world e2e/job-back-navigation.spec.ts
-- walks, reproducible on an EMPTY local stack and a no-op on one that already
-- holds it (every insert is keyed on its own id and conflict-safe).
--
--   jonna.jobb@test.local        a candidate, who signs in through the real
--                                /login form with the local password below
--   Jobbnav Test AB              an active employer
--   "Väktare, Göteborg"          published, applied for through CQrityjob,
--                                career area protective_operations
--   "Väktare natt, Göteborg"     published, the same career area -- the ad
--                                listed under "Liknande jobb"
--   "Säkerhetschef, Stockholm"   published, and outside the search the walk uses
--
-- Published as the recruitment fixture publishes: inserted as drafts, then
-- moved to published without a timestamp, so the database stamps
-- published_at itself. Every token column is '' rather than NULL, which
-- GoTrue requires, and the person has the e-mail identity a password sign-in
-- goes through.
--
-- Runs only against a local database; refuses anything that looks hosted.

\set ON_ERROR_STOP on
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION 'JOBNAV_FIXTURE_WRONG_DATABASE: this fixture writes people and jobs and runs only against a local database (got "%").', current_database();
  END IF;
END $$;

BEGIN;

-- ── The candidate ───────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'jonna.jobb@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Jonna Jobb'), now(), now(), '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';
-- The e-mail identity GoTrue signs a password in through, as the other
-- password fixtures seed it (beskt-candidate-preparation-fixture.sql).
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.id = 'b7000000-0000-4000-8000-000000000001'
ON CONFLICT (provider, provider_id) DO NOTHING;
INSERT INTO public.profiles (id, display_name) VALUES
  ('b7000000-0000-4000-8000-000000000001', 'Jonna Jobb')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- ── The employer ────────────────────────────────────────────────────────
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b7100000-0000-4000-8000-000000000001', 'Jobbnav Test AB', 'jobbnav-test', 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Three advertisements ────────────────────────────────────────────────
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, description_sv, requirements_sv,
                         country, city, workplace_type, employment_type, family_id, application_method,
                         status, deadline_at, expires_at)
VALUES
  ('b7200000-0000-4000-8000-000000000001', 'jobbnav-vaktare-goteborg', 'jobnav0001', 'b7100000-0000-4000-8000-000000000001',
   'Väktare, Göteborg', 'Security officer, Gothenburg',
   'Syntetisk annons för webbläsartestet. Rondering och stationär bevakning i Göteborg.',
   'Väktarutbildning.',
   'SE', 'Göteborg', 'onsite', 'full_time', 'protective_operations', 'internal',
   'draft', now() + interval '25 days', now() + interval '40 days'),
  ('b7200000-0000-4000-8000-000000000002', 'jobbnav-vaktare-natt-goteborg', 'jobnav0002', 'b7100000-0000-4000-8000-000000000001',
   'Väktare natt, Göteborg', 'Night security officer, Gothenburg',
   'Syntetisk annons för webbläsartestet. Nattbevakning i Göteborg.',
   'Väktarutbildning.',
   'SE', 'Göteborg', 'onsite', 'full_time', 'protective_operations', 'internal',
   'draft', now() + interval '25 days', now() + interval '40 days'),
  ('b7200000-0000-4000-8000-000000000003', 'jobbnav-sakerhetschef-stockholm', 'jobnav0003', 'b7100000-0000-4000-8000-000000000001',
   'Säkerhetschef, Stockholm', 'Head of security, Stockholm',
   'Syntetisk annons för webbläsartestet. Ligger utanför sökningen.',
   'Erfarenhet av säkerhetsledning.',
   'SE', 'Stockholm', 'onsite', 'full_time', 'corporate_security', 'internal',
   'draft', now() + interval '25 days', now() + interval '40 days')
ON CONFLICT (id) DO NOTHING;

UPDATE public.jobs
   SET status = 'published', expires_at = now() + interval '40 days', deadline_at = now() + interval '25 days'
 WHERE id IN ('b7200000-0000-4000-8000-000000000001',
              'b7200000-0000-4000-8000-000000000002',
              'b7200000-0000-4000-8000-000000000003')
   AND status <> 'published';

COMMIT;
