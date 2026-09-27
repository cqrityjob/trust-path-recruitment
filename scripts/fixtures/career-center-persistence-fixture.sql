-- Career Center persistence fixture: the synthetic people
-- e2e/career-center-persistence.spec.ts signs in as, on an EMPTY local stack.
--
-- One pair per Playwright project, so the desktop and the 375px walk each
-- start from this state rather than from what the other left behind:
--
--   cc-walk-a-desktop@local.test   A: no saved profession -- the walk saves one
--   cc-walk-b-desktop@local.test   B: saved profession "ordningsvakt"
--   cc-walk-a-mobile@local.test    A, for the 375px project
--   cc-walk-b-mobile@local.test    B, for the 375px project
--
-- Every insert is keyed on its own id and conflict-safe, and A's profile row
-- is removed on every run: A always starts with nothing saved, so the
-- profession the walk finds afterwards can only be the one it saved. Every
-- token column is '' rather than NULL, which GoTrue requires, and each person
-- has the e-mail identity a password sign-in goes through.
--
-- Runs only against a local database; refuses anything that looks hosted.

\set ON_ERROR_STOP on
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION 'CC_PERSISTENCE_FIXTURE_WRONG_DATABASE: this fixture writes people and runs only against a local database (got "%").', current_database();
  END IF;
END $$;

BEGIN;

-- ── The four people ─────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c7c00000-0000-4000-8000-00000000da01', 'authenticated', 'authenticated', 'cc-walk-a-desktop@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Anna Karriär'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c7c00000-0000-4000-8000-00000000db01', 'authenticated', 'authenticated', 'cc-walk-b-desktop@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Bo Ordning'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c7c00000-0000-4000-8000-00000000ea01', 'authenticated', 'authenticated', 'cc-walk-a-mobile@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Anna Mobil'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c7c00000-0000-4000-8000-00000000eb01', 'authenticated', 'authenticated', 'cc-walk-b-mobile@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Bo Mobil'), now(), now(), '', '', '', '', '', '', '', '')
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
 WHERE u.id IN ('c7c00000-0000-4000-8000-00000000da01', 'c7c00000-0000-4000-8000-00000000db01',
                'c7c00000-0000-4000-8000-00000000ea01', 'c7c00000-0000-4000-8000-00000000eb01')
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.profiles (id, display_name) VALUES
  ('c7c00000-0000-4000-8000-00000000da01', 'Anna Karriär'),
  ('c7c00000-0000-4000-8000-00000000db01', 'Bo Ordning'),
  ('c7c00000-0000-4000-8000-00000000ea01', 'Anna Mobil'),
  ('c7c00000-0000-4000-8000-00000000eb01', 'Bo Mobil')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- ── What each person has saved ──────────────────────────────────────────
-- B works as an ordningsvakt, saved in the one row both the profile and the
-- Career Center read. A has nothing saved, every time this runs.
INSERT INTO public.security_career_profiles (user_id, profile_version, current_status, current_profession_slug)
VALUES
  ('c7c00000-0000-4000-8000-00000000db01', 'scp-v1', 'working_in_industry', 'ordningsvakt'),
  ('c7c00000-0000-4000-8000-00000000eb01', 'scp-v1', 'working_in_industry', 'ordningsvakt')
ON CONFLICT (user_id) DO UPDATE
  SET current_status = EXCLUDED.current_status,
      current_profession_slug = EXCLUDED.current_profession_slug,
      current_profession_other = NULL;

DELETE FROM public.security_career_profiles
 WHERE user_id IN ('c7c00000-0000-4000-8000-00000000da01', 'c7c00000-0000-4000-8000-00000000ea01');

COMMIT;
