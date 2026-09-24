-- Synthetic local GoTrue users only; each viewport/language owns its users.
-- Workspaces and manual records are created through the actual browser flow.
\set ON_ERROR_STOP on
\if :{?sw_fixture_suffix}
\else
\set sw_fixture_suffix ''
\endif
BEGIN;
SET LOCAL search_path = public, extensions;
SELECT set_config('sw.fixture_suffix', :'sw_fixture_suffix', true);
DO $fixture$
DECLARE project text; locale text; actor text; email text; user_id uuid;
BEGIN
  FOREACH project IN ARRAY ARRAY['chromium', 'mobile-375', 'mobile-390'] LOOP
    FOREACH locale IN ARRAY ARRAY['sv', 'en'] LOOP
      FOREACH actor IN ARRAY ARRAY['owner-a', 'owner-b', 'viewer', 'revoked', 'ordinary'] LOOP
        email := 'sw-' || project || '-' || locale || '-' || actor || current_setting('sw.fixture_suffix') || '@example.test';
        user_id := md5('security-work-browser:' || email)::uuid;
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        VALUES ('00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
          'authenticated', email, crypt('LocalJourney!2026', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', 'Synthetic Security Work ' || actor), now(), now(),
          '', '', '', '', '', '', '', '');
        INSERT INTO auth.identities
          (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (user_id::text, user_id,
          jsonb_build_object('sub', user_id, 'email', email, 'email_verified', true),
          'email', now(), now(), now());
      END LOOP;
    END LOOP;
  END LOOP;
END;
$fixture$;
DO $service_fixture$
DECLARE actor text; email text; user_id uuid;
BEGIN
  FOREACH actor IN ARRAY ARRAY['a', 'b', 'viewer', 'revoked'] LOOP
    email := 'sw-service-' || actor || '@example.test';
    user_id := md5('security-work-browser:' || email)::uuid;
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
      'authenticated', email, crypt('LocalJourney!2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', 'Synthetic Security Work service ' || actor), now(), now(),
      '', '', '', '', '', '', '', '') ON CONFLICT (id) DO NOTHING;
    INSERT INTO auth.identities
      (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (user_id::text, user_id,
      jsonb_build_object('sub', user_id, 'email', email, 'email_verified', true),
      'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
  END LOOP;
END;
$service_fixture$;
COMMIT;
