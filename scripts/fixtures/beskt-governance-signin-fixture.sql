-- BESKT governance accounts that can SIGN IN -- disposable local stack only.
--
-- Everything here is SYNTHETIC. The candidate-preparation fixture creates the
-- editor, the five gate reviewers, the publisher and the platform admin as
-- rows that never sign in, because the method is taken to `published`
-- through their separate RPC decisions. This file only lets the same
-- synthetic people sign in, so the routed walk can open the admin surface as
-- each of them. It grants nothing, approves nothing and publishes nothing:
-- their roles, mandates and recorded decisions are exactly what the first
-- fixture wrote through the governed functions.
--
-- These are test identities. They must never be copied to a hosted project
-- or described as real people's method approvals.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('postgres', 'beskt_e2e', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'BCP_FIXTURE_WRONG_DATABASE: this fixture creates sign-in credentials and runs only against a disposable local database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

UPDATE auth.users
   SET encrypted_password = crypt('LocalJourney!2026', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       aud = 'authenticated', role = 'authenticated',
       instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
       raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
       confirmation_token = '', recovery_token = '', email_change_token_new = '',
       email_change = '', email_change_token_current = '', phone_change = '',
       phone_change_token = '', reauthentication_token = ''
 WHERE email LIKE 'beskt-journey-%@local.test';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.email LIKE 'beskt-journey-%@local.test'
ON CONFLICT (provider, provider_id) DO NOTHING;

DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM auth.users
   WHERE email LIKE 'beskt-journey-%@local.test' AND coalesce(encrypted_password, '') <> '';
  IF _n <> 8 THEN
    RAISE EXCEPTION 'BCP_FIXTURE: expected 8 synthetic governance accounts able to sign in, found %', _n;
  END IF;
END $$;

COMMIT;
