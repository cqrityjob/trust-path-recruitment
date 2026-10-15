-- Talent discovery walk (2026-10-15): the synthetic people, organisations and
-- job e2e/talent-discovery-local.spec.ts signs in as, on the local stack.
--
--   td-cand-a@local.test     Cecilia: VU1 and an employment period saved; she
--                            adds CPP and OV in the walk, documents and asks
--                            for review, answers a clarification, opens
--                            discoverability, accepts a contact and applies.
--   td-cand-b@local.test     Bo: OV (reviewed), VU1 and CPP, discoverable as
--                            actively looking -- through the real RPCs.
--   td-cand-c@local.test     Petra: OV saved, PRIVATE. Must never appear.
--   td-reviewer@local.test   Passport reviewer (passport_verifier only).
--   td-owner@local.test      owner of TD Bevakning AB (approved).
--   td-recruiter@local.test  member of TD Bevakning AB, responsible for the job.
--   td-colleague@local.test  member of TD Bevakning AB, nothing more.
--   td-owner2@local.test     owner of TD Konkurrent AB (approved), another company.
--
-- The job "Ordningsvakt Stockholm" is published by its owner and its
-- requirement profile is confirmed through rec_ri_confirm_profile -- the
-- existing flows. Binding it to the catalogue, searching and contacting are
-- what the walk does in the browser.
--
-- Refuses any database that could be real (same two facts as the Passport
-- public-pilot fixture).

\set ON_ERROR_STOP on
DO $$
DECLARE _n integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO _n;
    IF _n > 0 THEN
      RAISE EXCEPTION 'TD_FIXTURE_WRONG_DATABASE: the migration tooling recorded % migration(s) here.', _n;
    END IF;
  END IF;
  SELECT count(*) INTO _n FROM auth.users WHERE email IS NULL OR email !~* '[.](test|invalid)$';
  IF _n > 0 THEN
    RAISE EXCEPTION 'TD_FIXTURE_WRONG_DATABASE: % account(s) here are not synthetic.', _n;
  END IF;
END $$;

BEGIN;
CREATE TEMP TABLE td_people (id uuid PRIMARY KEY, email text, name text) ON COMMIT DROP;
INSERT INTO td_people VALUES
  ('7d000000-0000-4000-8000-0000000000a1', 'td-cand-a@local.test',    'Cecilia Kandidat'),
  ('7d000000-0000-4000-8000-0000000000b1', 'td-cand-b@local.test',    'Bo Kandidat'),
  ('7d000000-0000-4000-8000-0000000000c1', 'td-cand-c@local.test',    'Petra Privat'),
  ('7d000000-0000-4000-8000-0000000000f1', 'td-reviewer@local.test',  'Rita Granskare'),
  ('7d000000-0000-4000-8000-0000000000e1', 'td-owner@local.test',     'Olle Ägare'),
  ('7d000000-0000-4000-8000-0000000000e2', 'td-recruiter@local.test', 'Rut Rekryterare'),
  ('7d000000-0000-4000-8000-0000000000e3', 'td-colleague@local.test', 'Kim Kollega'),
  ('7d000000-0000-4000-8000-0000000000e4', 'td-owner2@local.test',    'Anna Annanfirma');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email,
       crypt('LocalJourney!2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', p.name),
       now(), now(), '', '', '', '', '', '', '', ''
  FROM td_people p
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT p.id::text, p.id, jsonb_build_object('sub', p.id::text, 'email', p.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM td_people p
ON CONFLICT (provider, provider_id) DO NOTHING;
INSERT INTO public.profiles (id, display_name)
SELECT id, name FROM td_people ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code, work_location_confirmed_at)
SELECT id, name, 'SE', now() FROM td_people WHERE email LIKE 'td-cand-%'
ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('7d000000-0000-4000-8000-0000000000f1', 'passport_verifier') ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, name, slug, status, country)
VALUES ('7d000000-1111-4000-8000-000000000001', 'TD Bevakning AB', 'td-bevakning', 'active', 'SE'),
       ('7d000000-1111-4000-8000-000000000002', 'TD Konkurrent AB', 'td-konkurrent', 'active', 'SE')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('7d000000-1111-4000-8000-000000000001', '7d000000-0000-4000-8000-0000000000e1', 'owner', 'active'),
       ('7d000000-1111-4000-8000-000000000001', '7d000000-0000-4000-8000-0000000000e2', 'member', 'active'),
       ('7d000000-1111-4000-8000-000000000001', '7d000000-0000-4000-8000-0000000000e3', 'member', 'active'),
       ('7d000000-1111-4000-8000-000000000002', '7d000000-0000-4000-8000-0000000000e4', 'owner', 'active')
ON CONFLICT (employer_id, user_id) DO NOTHING;
COMMIT;

-- ── The job, published by its owner, with a confirmed requirement profile ──
BEGIN;
SELECT set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000e1', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, description_sv, description_en,
                         application_method, status, family_id, city, country, employment_type, workplace_type)
SELECT '7d000000-2222-4000-8000-000000000001', 'td-ordningsvakt-stockholm', 'TD0001',
       '7d000000-1111-4000-8000-000000000001', 'Ordningsvakt Stockholm', 'Public order guard Stockholm',
       'Syntetisk annons för det lokala testet.', 'Synthetic advert for the local test.',
       'internal', 'draft', 'corporate_security', 'Stockholm', 'SE', 'full_time', 'onsite'
 WHERE NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = '7d000000-2222-4000-8000-000000000001');
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '60 days'
 WHERE id = '7d000000-2222-4000-8000-000000000001' AND status = 'draft';
RESET ROLE;
COMMIT;

INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
VALUES ('7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', '7d000000-0000-4000-8000-0000000000e2')
ON CONFLICT (job_id) DO UPDATE SET responsible_user_id = EXCLUDED.responsible_user_id;
INSERT INTO public.recruitment_requirements (id, job_id, employer_id, kind, label_sv, label_en, position)
VALUES
 ('7d000000-3333-4000-8000-000000000001', '7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', 'mandatory', 'Ordningsvaktsförordnande', 'Public order guard appointment', 1),
 ('7d000000-3333-4000-8000-000000000002', '7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', 'mandatory', 'Väktarutbildning 1', 'Security guard training 1', 2),
 ('7d000000-3333-4000-8000-000000000003', '7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', 'desirable', 'CPP (granskad)', 'CPP (reviewed)', 3),
 ('7d000000-3333-4000-8000-000000000004', '7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', 'desirable', 'Minst två års erfarenhet', 'At least two years of experience', 4),
 ('7d000000-3333-4000-8000-000000000005', '7d000000-2222-4000-8000-000000000001', '7d000000-1111-4000-8000-000000000001', 'mandatory', 'Körkort B', 'Driving licence B', 5)
ON CONFLICT (id) DO NOTHING;

BEGIN;
SELECT set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000e1', true);
SET LOCAL ROLE authenticated;
SELECT public.rec_ri_confirm_profile(
  '7d000000-2222-4000-8000-000000000001', 0, '7d000000-4444-4000-8000-000000000001', NULL,
  (SELECT jsonb_agg(jsonb_build_object('requirementId', r.id, 'kind', r.kind, 'decisionRule', 'human_confirmed',
           'acceptedSources', '["application_cv"]'::jsonb, 'instructionSv', 'Kontrollera mot underlag',
           'instructionEn', 'Check against the evidence') ORDER BY r.position)
     FROM public.recruitment_requirements r WHERE r.job_id = '7d000000-2222-4000-8000-000000000001'))
 WHERE NOT EXISTS (SELECT 1 FROM public.rec_requirement_profiles WHERE job_id = '7d000000-2222-4000-8000-000000000001');
RESET ROLE;
COMMIT;

-- ── What the candidates already hold (through the holder's own save) ──
CREATE FUNCTION pg_temp.td_save(_holder uuid, _code text, _issued date, _valid date, _extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t public.sp_credential_types%ROWTYPE; _in jsonb; _id uuid;
BEGIN
  SELECT id INTO _id FROM public.sp_claims WHERE holder_user_id = _holder AND credential_code = _code AND lifecycle_state = 'active';
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  SELECT * INTO t FROM public.sp_credential_types WHERE code = _code;
  _in := jsonb_build_object('definition_code', _code,
    'market_country', coalesce(t.jurisdiction_code, ''), 'market_region', coalesce(t.sub_jurisdiction_code, ''),
    'identifier', '', 'issued_on', _issued, 'valid_until', coalesce(_valid::text, ''), 'no_expiry', false) || _extra;
  PERFORM set_config('request.jwt.claim.sub', _holder::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_save_international_credential(_in);
  RESET ROLE;
  SELECT id INTO _id FROM public.sp_claims WHERE holder_user_id = _holder AND credential_code = _code AND lifecycle_state = 'active';
  RETURN _id;
END $$;

DO $$
DECLARE _ov uuid; _req uuid;
BEGIN
  -- Cecilia: VU1 and an employment period.
  PERFORM pg_temp.td_save('7d000000-0000-4000-8000-0000000000a1', 'VU1', '2018-03-01', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
  INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, started_on, ended_on, security_relevance)
  VALUES ('7d000000-5555-4000-8000-0000000000a1', '7d000000-0000-4000-8000-0000000000a1', 'Fiktiv Nuvarande Arbetsgivare AB',
          'Väktare', current_date - 1100, NULL, 'primary')
  ON CONFLICT (id) DO NOTHING;

  -- Bo: OV reviewed by CQrityjob (document attached, request, decision -- the real RPCs),
  -- VU1, CPP; discoverable as actively looking.
  _ov := pg_temp.td_save('7d000000-0000-4000-8000-0000000000b1', 'OV', '2023-01-10', (current_date + 700));
  PERFORM pg_temp.td_save('7d000000-0000-4000-8000-0000000000b1', 'VU1', '2016-05-01', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
  PERFORM pg_temp.td_save('7d000000-0000-4000-8000-0000000000b1', 'INTL_ASIS_CPP', '2022-05-01', (current_date + 900));
  IF NOT EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE claim_id = _ov) THEN
    PERFORM set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000b1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_attach_evidence(_ov, NULL, '7d000000-0000-4000-8000-0000000000b1/td-ov.pdf', 'td-ov.pdf',
                                      'application/pdf', 1024, repeat('a', 64));
    _req := public.sp_submit_for_verification(_ov, NULL, 'cqrityjob_review', NULL);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000f1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_verifier_decide_reviewed(_req, (SELECT submitted_at FROM public.sp_verification_requests WHERE id = _req),
      'approved', 'document_review', 'Syntetisk granskning', NULL, NULL, NULL);
    RESET ROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_talent_profiles WHERE holder_user_id = '7d000000-0000-4000-8000-0000000000b1') THEN
    PERFORM set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000b1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_talent_save_settings(0, 'active', 'talent-v1',
      (SELECT array_agg(id) FROM public.sp_claims WHERE holder_user_id = '7d000000-0000-4000-8000-0000000000b1' AND lifecycle_state = 'active'),
      '{}'::uuid[], '{"areas":["corporate_security"],"countries":["SE"],"cities":["Stockholm"],"employmentTypes":["full_time"]}'::jsonb);
    RESET ROLE;
  END IF;

  -- Petra: OV, private, with a review request waiting (the rejection scenario).
  _ov := pg_temp.td_save('7d000000-0000-4000-8000-0000000000c1', 'OV', '2022-02-01', (current_date + 400));
  IF NOT EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE claim_id = _ov) THEN
    PERFORM set_config('request.jwt.claim.sub', '7d000000-0000-4000-8000-0000000000c1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_attach_evidence(_ov, NULL, '7d000000-0000-4000-8000-0000000000c1/td-ov.pdf', 'td-ov.pdf',
                                      'application/pdf', 1024, repeat('c', 64));
    PERFORM public.sp_submit_for_verification(_ov, NULL, 'cqrityjob_review', NULL);
    RESET ROLE;
  END IF;
END $$;

SELECT u.email,
       (SELECT count(*) FROM public.sp_claims c WHERE c.holder_user_id = u.id) AS claims,
       coalesce((SELECT visibility FROM public.sp_talent_profiles t WHERE t.holder_user_id = u.id), 'private') AS visibility
  FROM auth.users u WHERE u.email LIKE 'td-%@local.test' ORDER BY u.email;
