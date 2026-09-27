-- Security Passport public-pilot fixture: the synthetic people
-- e2e/passport-public-pilot-local.spec.ts signs in as, on an EMPTY local stack,
-- and the public pilot they walk into.
--
-- ── THE MARKETS ─────────────────────────────────────────────────────────
--
-- Great Britain, Northern Ireland and Dubai, and every definition authorised
-- for their internal pilot, are put in the PUBLIC pilot state that
-- 20261220090000 adds: "a fixture pack in the new state" (completion work
-- order, PR 3). is_active and the legal review are not touched. Once
-- 20261221090000 has opened them for real, this is a no-op.
--
-- ── THE PEOPLE ──────────────────────────────────────────────────────────
--
-- One set per Playwright project, so the desktop and the phone walk each
-- start from this state rather than from what the other left behind:
--
--   pp-dubai-<p>@local.test   ordinary holder working in Dubai, nothing saved
--   pp-mixed-<p>@local.test   holder working in Sweden with a Swedish, a British
--                             and an international credential already saved
--   pp-large-<p>@local.test   holder working in Great Britain with fifteen
--                             credentials across every market, one expired
--   pp-reviewer@local.test    a Passport reviewer (role passport_verifier only)
--   pp-admin@local.test       a platform administrator, for the catalogue page
--
-- The person who REGISTERS during the walk is not here: the walk signs them up
-- through /signup with an address of its own, and they confirm it from the
-- e-mail the local stack actually sends.
--
-- NOBODY holds a pilot grant: the walk is the proof that none is needed. The
-- existing credentials are saved through the real RPC as their holder, so
-- every trigger and rule that guards a holder's save guards these too.
--
-- Every insert is keyed on its own id and conflict-safe. What the walk writes
-- is reset on every run -- the Dubai and mixed holders' credentials, evidence,
-- reviews and shares, and the Dubai holders' profile answers -- so a second
-- run starts where the first did. Refuses any database that could be real (below).

\set ON_ERROR_STOP on
-- This file opens three markets and writes people, so it refuses any database
-- that could be real, on two independent facts rather than a database name:
--   * the Supabase migration tooling recorded migrations here -- true of every
--     hosted project, never of the local replay, which applies the history
--     with psql (CI starts its stack with the history held back);
--   * an account here is not synthetic: every address a fixture or a
--     migration writes ends in a reserved domain, .test or .invalid.
DO $$
DECLARE _n integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO _n;
    IF _n > 0 THEN
      RAISE EXCEPTION 'PP_FIXTURE_WRONG_DATABASE: the migration tooling recorded % migration(s) here; this fixture runs only on a local replay.', _n;
    END IF;
  END IF;
  SELECT count(*) INTO _n FROM auth.users WHERE email IS NULL OR email !~* '[.](test|invalid)$';
  IF _n > 0 THEN
    RAISE EXCEPTION 'PP_FIXTURE_WRONG_DATABASE: % account(s) here are not synthetic; this fixture runs only where every account is.', _n;
  END IF;
END $$;

BEGIN;

-- ── The public pilot ────────────────────────────────────────────────────
UPDATE public.sp_market_packs SET pilot_state = 'public_pilot'
 WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'internal_pilot' AND NOT is_active;
UPDATE public.sp_credential_types SET pilot_state = 'public_pilot'
 WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'internal_pilot' AND NOT is_active;

-- ── The people ──────────────────────────────────────────────────────────
CREATE TEMP TABLE pp_people (id uuid PRIMARY KEY, email text, name text, country text, region text)
  ON COMMIT DROP;
INSERT INTO pp_people VALUES
  ('a7a00000-0000-4000-8000-00000000d001', 'pp-dubai-desktop@local.test',   'Nadia Fiktiv',   'AE', 'AE-DU'),
  ('a7a00000-0000-4000-8000-00000000e001', 'pp-dubai-mobile@local.test',    'Nadia Mobil',    'AE', 'AE-DU'),
  ('a7a00000-0000-4000-8000-00000000d002', 'pp-mixed-desktop@local.test',   'Maja Blandad',   'SE', NULL),
  ('a7a00000-0000-4000-8000-00000000e002', 'pp-mixed-mobile@local.test',    'Maja Mobil',     'SE', NULL),
  ('a7a00000-0000-4000-8000-00000000d003', 'pp-large-desktop@local.test',   'Alexandra Konstantinopoulou-Lindqvist', 'GB', NULL),
  ('a7a00000-0000-4000-8000-00000000e003', 'pp-large-mobile@local.test',    'Leo Mobil',      'GB', NULL),
  ('a7a00000-0000-4000-8000-00000000f009', 'pp-reviewer@local.test',        'Rita Granskare', 'SE', NULL),
  ('a7a00000-0000-4000-8000-00000000f00a', 'pp-admin@local.test',           'Ada Administratör', 'SE', NULL);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email,
       crypt('LocalJourney!2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', p.name),
       now(), now(), '', '', '', '', '', '', '', ''
  FROM pp_people p
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT p.id::text, p.id, jsonb_build_object('sub', p.id::text, 'email', p.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM pp_people p
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.profiles (id, display_name)
SELECT id, name FROM pp_people
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- The Passport's own name is the one a reviewer reads in the queue.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code, sub_jurisdiction_code, work_location_confirmed_at)
SELECT id, name, country, region, now() FROM pp_people
ON CONFLICT (holder_user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      jurisdiction_code = EXCLUDED.jurisdiction_code,
      sub_jurisdiction_code = EXCLUDED.sub_jurisdiction_code,
      work_location_confirmed_at = EXCLUDED.work_location_confirmed_at;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a7a00000-0000-4000-8000-00000000f009', 'passport_verifier'),
       ('a7a00000-0000-4000-8000-00000000f00a', 'admin')
ON CONFLICT DO NOTHING;

-- No grant, for anybody: the public pilot needs none.
DELETE FROM public.sp_pilot_members WHERE user_id IN (SELECT id FROM pp_people);

COMMIT;

-- ── What the walk wrote last time ───────────────────────────────────────
-- The Dubai and mixed holders start from their seeded state on every run: no
-- credential, evidence, review or share left over. Claims are append-only for
-- their holder, so the reset disables the USER triggers for its own deletes
-- (never the foreign keys) and restores them in the same transaction.
BEGIN;
CREATE TEMP TABLE pp_reset (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO pp_reset VALUES
  ('a7a00000-0000-4000-8000-00000000d001'), ('a7a00000-0000-4000-8000-00000000e001'),
  ('a7a00000-0000-4000-8000-00000000d002'), ('a7a00000-0000-4000-8000-00000000e002');
ALTER TABLE public.sp_claims DISABLE TRIGGER USER;
ALTER TABLE public.sp_evidence DISABLE TRIGGER USER;
ALTER TABLE public.sp_verification_requests DISABLE TRIGGER USER;
ALTER TABLE public.sp_verification_decisions DISABLE TRIGGER USER;
ALTER TABLE public.sp_disclosures DISABLE TRIGGER USER;
ALTER TABLE public.sp_disclosure_items DISABLE TRIGGER USER;
ALTER TABLE public.sp_credential_disclosure_policy DISABLE TRIGGER USER;
ALTER TABLE public.sp_credential_share_events DISABLE TRIGGER USER;
DELETE FROM public.sp_evidence_extractions WHERE evidence_id IN (
  SELECT id FROM public.sp_evidence WHERE holder_user_id IN (SELECT id FROM pp_reset));
DELETE FROM public.sp_credential_details WHERE claim_id IN (
  SELECT id FROM public.sp_claims WHERE holder_user_id IN (SELECT id FROM pp_reset));
DELETE FROM public.sp_credential_share_events WHERE disclosure_id IN (
  SELECT id FROM public.sp_disclosures WHERE holder_user_id IN (SELECT id FROM pp_reset));
DELETE FROM public.sp_credential_disclosure_policy WHERE disclosure_id IN (
  SELECT id FROM public.sp_disclosures WHERE holder_user_id IN (SELECT id FROM pp_reset));
DELETE FROM public.sp_disclosures WHERE holder_user_id IN (SELECT id FROM pp_reset);
DELETE FROM public.sp_verification_decisions WHERE holder_user_id IN (SELECT id FROM pp_reset);
DELETE FROM public.sp_verification_requests WHERE holder_user_id IN (SELECT id FROM pp_reset);
DELETE FROM public.sp_evidence WHERE holder_user_id IN (SELECT id FROM pp_reset);
UPDATE public.sp_claims SET supersedes_id = NULL WHERE holder_user_id IN (SELECT id FROM pp_reset);
DELETE FROM public.sp_claims WHERE holder_user_id IN (SELECT id FROM pp_reset);
ALTER TABLE public.sp_claims ENABLE TRIGGER USER;
ALTER TABLE public.sp_evidence ENABLE TRIGGER USER;
ALTER TABLE public.sp_verification_requests ENABLE TRIGGER USER;
ALTER TABLE public.sp_verification_decisions ENABLE TRIGGER USER;
ALTER TABLE public.sp_disclosures ENABLE TRIGGER USER;
ALTER TABLE public.sp_disclosure_items ENABLE TRIGGER USER;
ALTER TABLE public.sp_credential_disclosure_policy ENABLE TRIGGER USER;
ALTER TABLE public.sp_credential_share_events ENABLE TRIGGER USER;
-- The occupation the walk states on the profile, so the profile asks again.
DELETE FROM public.security_career_profiles WHERE user_id IN
  ('a7a00000-0000-4000-8000-00000000d001', 'a7a00000-0000-4000-8000-00000000e001');
COMMIT;

-- ── What each person has already saved ─────────────────────────────────
-- Through sp_save_international_credential, as the holder, one call per
-- credential. The Dubai holders start from nothing; the others are seeded.
CREATE FUNCTION pg_temp.pp_save(_holder uuid, _code text, _issued date, _valid date, _extra jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE t public.sp_credential_types%ROWTYPE; _in jsonb;
BEGIN
  SELECT * INTO t FROM public.sp_credential_types WHERE code = _code;
  _in := jsonb_build_object('definition_code', _code,
    'market_country', coalesce(t.jurisdiction_code, ''), 'market_region', coalesce(t.sub_jurisdiction_code, ''),
    'identifier', '', 'issued_on', _issued, 'valid_until', coalesce(_valid::text, ''), 'no_expiry', false) || _extra;
  IF t.requires_scope AND NOT _extra ? 'authorisation_scope' THEN
    _in := _in || jsonb_build_object('authorisation_scope', 'Fiktivt bevakningsbolag');
  END IF;
  -- The subject alone, as the other fixtures seed: with no JWT payload the
  -- save is an owner-side fixture write (sp_passport_session_active), and every
  -- rule that guards the holder's own save still runs as that holder.
  PERFORM set_config('request.jwt.claim.sub', _holder::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_save_international_credential(_in);
  RESET ROLE;
END $$;

DO $$
DECLARE
  _p uuid;
BEGIN
  -- The mixed-market holders: Sweden, Great Britain, international.
  FOREACH _p IN ARRAY ARRAY['a7a00000-0000-4000-8000-00000000d002', 'a7a00000-0000-4000-8000-00000000e002']::uuid[] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE holder_user_id = _p) THEN
      PERFORM pg_temp.pp_save(_p, 'VU1', '2019-03-01', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
      PERFORM pg_temp.pp_save(_p, 'UK_SIA_LICENCE_SG', '2023-06-01', '2026-12-31');
      PERFORM pg_temp.pp_save(_p, 'INTL_ASIS_APP', '2022-09-01', '2027-09-01');
    END IF;
  END LOOP;
  -- The large Passports: fifteen credentials in every market, one expired.
  FOREACH _p IN ARRAY ARRAY['a7a00000-0000-4000-8000-00000000d003', 'a7a00000-0000-4000-8000-00000000e003']::uuid[] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE holder_user_id = _p) THEN
      PERFORM pg_temp.pp_save(_p, 'VU1', '2015-01-10', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
      PERFORM pg_temp.pp_save(_p, 'VU2', '2015-06-10', NULL, '{"issuer_name":"Fiktiv Väktarskola AB"}');
      PERFORM pg_temp.pp_save(_p, 'OV', '2020-02-01', '2028-02-01');
      PERFORM pg_temp.pp_save(_p, 'UK_SIA_LICENCE_SG', '2023-06-01', '2026-12-31');
      PERFORM pg_temp.pp_save(_p, 'UK_SIA_LICENCE_DS', '2023-06-01', '2026-12-31');
      PERFORM pg_temp.pp_save(_p, 'UK_SIA_LICENCE_CP', '2018-01-01', '2021-01-01');
      PERFORM pg_temp.pp_save(_p, 'UK_SIA_LICENCE_VI', '2023-06-01', '2026-12-31');
      PERFORM pg_temp.pp_save(_p, 'AE_DU_SIRA_CARD_GUARD', '2024-02-01', '2026-02-01');
      PERFORM pg_temp.pp_save(_p, 'AE_DU_SIRA_CARD_SUPERVISOR', '2024-02-01', '2027-02-01');
      PERFORM pg_temp.pp_save(_p, 'AE_DU_BASIC_FIRE_SAFETY', '2024-01-15', '2026-01-15', '{"issuer_name":"Fiktivt Utbildningscenter LLC"}');
      PERFORM pg_temp.pp_save(_p, 'IN_MEPSC_Q7101', '2021-04-01', NULL, '{"issuer_name":"Fiktivt Training Centre"}');
      PERFORM pg_temp.pp_save(_p, 'IN_MEPSC_Q7201', '2022-04-01', NULL, '{"issuer_name":"Fiktivt Training Centre"}');
      PERFORM pg_temp.pp_save(_p, 'INTL_ASIS_CPP', '2021-05-01', '2027-05-01');
      PERFORM pg_temp.pp_save(_p, 'INTL_ISC2_CISSP', '2020-05-01', '2026-05-01');
      PERFORM pg_temp.pp_save(_p, 'INTL_ACFE_CFE', '2019-11-01', '2026-11-01');
    END IF;
  END LOOP;
END $$;

SELECT u.email,
       (SELECT count(*) FROM public.sp_claims c WHERE c.holder_user_id = u.id) AS claims,
       (SELECT count(*) FROM public.sp_pilot_members m WHERE m.user_id = u.id) AS grants
  FROM auth.users u
 WHERE u.email LIKE 'pp-%@local.test' ORDER BY u.email;
