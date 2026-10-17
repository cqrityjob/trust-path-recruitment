-- Employer journey (2026-10-17): the people e2e/employer-journey-local.spec.ts
-- meets that the journey does NOT create itself, on the real CLI stack of
-- scripts/employer-journey-real-ci-run.mjs.
--
--   ej-cand-b@local.test     Bo: OV (reviewed by CQrityjob), VU1 and CPP,
--                            discoverable as actively looking -- through the
--                            real RPCs, the same way the talent discovery
--                            fixture seeds him.
--   ej-cand-c@local.test     Petra: OV saved, PRIVATE. Must never appear.
--   ej-reviewer@local.test   Passport reviewer (passport_verifier only); only
--                            here so Bo's OV carries a real review decision.
--   ej-admin@local.test      Platform administrator (user_roles 'admin').
--
-- Deliberately absent: any employer, membership, job, requirement or
-- requirement profile. The employer registers through /signup, is approved
-- by the administrator in the admin UI and writes, publishes and matches its
-- job in the browser. The fixture refuses to run if any of that already
-- exists, and the runner checks it again afterwards.
--
-- Real GoTrue only: the four accounts are created through
-- /auth/v1/admin/users by the runner (-v real_auth=1); nothing here writes
-- to auth.*. Refuses any database that could be real (the same two facts as
-- the talent discovery and Passport public-pilot fixtures).

\set ON_ERROR_STOP on
DO $$
DECLARE _n integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO _n;
    IF _n > 0 THEN
      RAISE EXCEPTION 'EJ_FIXTURE_WRONG_DATABASE: the migration tooling recorded % migration(s) here.', _n;
    END IF;
  END IF;
  SELECT count(*) INTO _n FROM auth.users WHERE email IS NULL OR email !~* '[.](test|invalid)$';
  IF _n > 0 THEN
    RAISE EXCEPTION 'EJ_FIXTURE_WRONG_DATABASE: % account(s) here are not synthetic.', _n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.employers) OR EXISTS (SELECT 1 FROM public.jobs) THEN
    RAISE EXCEPTION 'EJ_FIXTURE_NOT_FRESH: the journey creates the employer and the job itself.';
  END IF;
END $$;

\if :{?real_auth}
\else
DO $$ BEGIN RAISE EXCEPTION 'EJ_FIXTURE_REAL_AUTH_REQUIRED: run with -v real_auth=1 after creating the accounts through GoTrue.'; END $$;
\endif

BEGIN;
CREATE TEMP TABLE ej_people (id uuid PRIMARY KEY, email text, name text) ON COMMIT DROP;
INSERT INTO ej_people VALUES
  ('7e000000-0000-4000-8000-0000000000b1', 'ej-cand-b@local.test',   'Bo Kandidat'),
  ('7e000000-0000-4000-8000-0000000000c1', 'ej-cand-c@local.test',   'Petra Privat'),
  ('7e000000-0000-4000-8000-0000000000f1', 'ej-reviewer@local.test', 'Rita Granskare'),
  ('7e000000-0000-4000-8000-0000000000d1', 'ej-admin@local.test',    'Ada Administratör');

DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users u JOIN ej_people p ON p.id = u.id AND lower(p.email) = lower(u.email)) <> 4 THEN
    RAISE EXCEPTION 'EJ_FIXTURE_REAL_AUTH_ACCOUNTS_MISSING';
  END IF;
END $$;

INSERT INTO public.profiles (id, display_name)
SELECT id, name FROM ej_people ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code, work_location_confirmed_at)
SELECT id, name, 'SE', now() FROM ej_people WHERE email LIKE 'ej-cand-%'
ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('7e000000-0000-4000-8000-0000000000f1', 'passport_verifier'),
       ('7e000000-0000-4000-8000-0000000000d1', 'admin')
ON CONFLICT DO NOTHING;
COMMIT;

-- ── What the candidates already hold (through the holder's own save) ──
CREATE FUNCTION pg_temp.ej_save(_holder uuid, _code text, _issued date, _valid date, _extra jsonb DEFAULT '{}')
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
  -- Bo: OV reviewed by CQrityjob (document attached, request, decision -- the
  -- real RPCs), VU1, CPP; discoverable as actively looking.
  _ov := pg_temp.ej_save('7e000000-0000-4000-8000-0000000000b1', 'OV', '2023-01-10', (current_date + 700));
  PERFORM pg_temp.ej_save('7e000000-0000-4000-8000-0000000000b1', 'VU1', '2016-05-01', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
  PERFORM pg_temp.ej_save('7e000000-0000-4000-8000-0000000000b1', 'INTL_ASIS_CPP', '2022-05-01', (current_date + 900));
  IF NOT EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE claim_id = _ov) THEN
    PERFORM set_config('request.jwt.claim.sub', '7e000000-0000-4000-8000-0000000000b1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_attach_evidence(_ov, NULL, '7e000000-0000-4000-8000-0000000000b1/ej-ov.pdf', 'ej-ov.pdf',
                                      'application/pdf', 1024, repeat('a', 64));
    _req := public.sp_submit_for_verification(_ov, NULL, 'cqrityjob_review', NULL);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '7e000000-0000-4000-8000-0000000000f1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_verifier_decide_reviewed(_req, (SELECT submitted_at FROM public.sp_verification_requests WHERE id = _req),
      'approved', 'document_review', 'Syntetisk granskning', NULL, NULL, NULL);
    RESET ROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_talent_profiles WHERE holder_user_id = '7e000000-0000-4000-8000-0000000000b1') THEN
    PERFORM set_config('request.jwt.claim.sub', '7e000000-0000-4000-8000-0000000000b1', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.sp_talent_save_settings(0, 'active', 'talent-v1',
      (SELECT array_agg(id) FROM public.sp_claims WHERE holder_user_id = '7e000000-0000-4000-8000-0000000000b1' AND lifecycle_state = 'active'),
      '{}'::uuid[], '{"areas":["corporate_security"],"countries":["SE"],"cities":["Stockholm"],"employmentTypes":["full_time"]}'::jsonb);
    RESET ROLE;
  END IF;

  -- Petra: OV saved, private. She holds what the job asks for and must
  -- still never be shown or counted.
  PERFORM pg_temp.ej_save('7e000000-0000-4000-8000-0000000000c1', 'OV', '2022-02-01', (current_date + 400));
END $$;

SELECT u.email,
       (SELECT count(*) FROM public.sp_claims c WHERE c.holder_user_id = u.id) AS claims,
       coalesce((SELECT visibility FROM public.sp_talent_profiles t WHERE t.holder_user_id = u.id), 'private') AS visibility
  FROM auth.users u WHERE u.email LIKE 'ej-%@local.test' ORDER BY u.email;
