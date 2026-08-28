-- A LOCAL-ONLY employer fixture for walking the interview journey in a browser.
--
-- Everything here is synthetic. No real employer, candidate, CV or interview is
-- represented, and the password below is a throwaway for a database that lives
-- on one laptop behind localhost. It creates no production account and touches
-- no hosted project.
--
-- Two employers on purpose: the second exists so cross-tenant denial can be
-- demonstrated in the browser rather than only asserted in SQL.
--
--   journey@local.test    owner of Vaktbolaget Journey AB  — walks the journey
--   outsider@local.test   owner of Konkurrenten AB         — must see nothing
--
-- Run against the LOCAL stack only:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f <this file>

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- Refuse to run anywhere that looks like a real deployment. A fixture that
  -- creates sign-in credentials must not be capable of running by accident
  -- against a database holding real people.
  IF current_setting('server_version_num')::int > 0
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'SCP_IV_FIXTURE_WRONG_DATABASE: this fixture creates sign-in credentials and runs only against the local development database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Two auth users with a usable password.
-- ---------------------------------------------------------------------------
-- GoTrue scans the token columns as non-nullable strings, so they must be ''
-- rather than NULL. A fixture that leaves them NULL produces a 500 on sign-in
-- with the unhelpful message "Database error querying schema".
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '9e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'journey@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Journey Testare"}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '9e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'outsider@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Utomstaende Testare"}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000001',
   '{"sub":"9e000000-0000-4000-8000-000000000001","email":"journey@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000002',
   '{"sub":"9e000000-0000-4000-8000-000000000002","email":"outsider@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Two employers, both active.
-- ---------------------------------------------------------------------------
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('9e000000-0000-4000-8000-00000000000a', 'Vaktbolaget Journey AB', 'journey-ab', 'active'),
  ('9e000000-0000-4000-8000-00000000000b', 'Konkurrenten AB', 'konkurrenten-ab', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-00000000000b', 'owner', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active', role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- A pilot grant for the journey employer ONLY.
--
-- The Vaktare pack is a draft pilot hypothesis, so without this the journey
-- cannot start -- which is the control working. The competitor gets no grant,
-- so the same pack is unreachable for them.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_interview_pack_pilot_grants
  (employer_id, pack_version_id, rationale, usage_mode, environment, starts_on, expires_on)
SELECT '9e000000-0000-4000-8000-00000000000a', v.id,
       'Lokal genomgang av hela flodet infor granskning. Inget skarpt bruk.',
       'internal_qa', 'development', current_date - 1, current_date + 14
  FROM public.scp_interview_pack_versions v
  JOIN public.scp_interview_packs p ON p.id = v.pack_id
 WHERE p.slug = 'vaktare-se'
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'journey fixture ready: ' ||
       (SELECT count(*) FROM public.employer_memberships
         WHERE user_id IN ('9e000000-0000-4000-8000-000000000001',
                           '9e000000-0000-4000-8000-000000000002')) || ' memberships, ' ||
       (SELECT count(*) FROM public.scp_interview_pack_pilot_grants
         WHERE employer_id = '9e000000-0000-4000-8000-00000000000a'
           AND revoked_at IS NULL) || ' live grant(s)' AS status;
