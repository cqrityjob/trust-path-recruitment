-- SYNTHETIC accounts/applications for both actual role definitions, SV/EN.
-- Only the disposable loopback beskt_e2e harness may load this fixture.
-- Tests send, answer, review and release through ordinary UI/governed RPCs.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'beskt_e2e' THEN
    RAISE EXCEPTION 'ROLE_FIXTURE_WRONG_DATABASE';
  END IF;
END $$;
BEGIN;
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000',
       ('e6100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'authenticated', 'authenticated', 'role-' || n || '@local.test',
       crypt('LocalJourney!2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name','Syntetisk rollkandidat ' || n),
       now(), now(), '', '', '', '', '', '', '', ''
FROM generate_series(1,4) n
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider,
                            last_sign_in_at, created_at, updated_at)
SELECT id::text,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),
       'email',now(),now(),now()
FROM auth.users WHERE email ~ '^role-[1-4]@local.test$'
ON CONFLICT (provider,provider_id) DO NOTHING;
UPDATE public.profiles p SET display_name=u.raw_user_meta_data->>'full_name'
FROM auth.users u WHERE u.id=p.id AND p.id::text LIKE 'e6100000-%';
DO $jobs$ BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b4000000-0000-4000-8000-00000000ad01","role":"authenticated"}',true);
  PERFORM set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-00000000ad01',true);
  INSERT INTO public.jobs (id,slug,short_id,employer_id,application_method,
                          title_sv,title_en,status,published_at,expires_at)
  SELECT ('e6200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
         'synthetic-role-' || n,'ROLE' || n,
         'b4000000-0000-4000-8000-00000000ee01','internal',
         'Syntetisk rollrekrytering ' || n,'Synthetic role recruitment ' || n,
         'published',now(),now()+interval '90 days'
  FROM generate_series(1,4) n
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claims',NULL,true);
  PERFORM set_config('request.jwt.claim.sub',NULL,true);
END $jobs$;
INSERT INTO public.job_applications (id,job_id,employer_id,applicant_user_id,consent_given_at)
SELECT ('e6300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       ('e6200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'b4000000-0000-4000-8000-00000000ee01',
       ('e6100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,now()
FROM generate_series(1,4) n
ON CONFLICT (id) DO NOTHING;
COMMIT;
