-- 20270322090000: the holder's preview of what an employer receives when the
-- Passport is shared with an application.
--
--   PV1  the preview IS the employer's payload: after sharing, the employer's
--        sp_application_disclosure answer equals the preview, key for key,
--        apart from the times of the share itself.
--   PV2  nothing is stored: no disclosure, no access, no Passport event.
--   PV3  a signed-out holder is refused (the Passport's session rule).
--   PV4  a holder with nothing verified sees an empty preview, not an error;
--        the private fields never appear.
--   PV5  only the holder's own Passport; anon cannot call it.
--
-- The fixture is sp_application_passport_test.sql's; everything rolls back.
\set ON_ERROR_STOP on

BEGIN;
SET client_min_messages TO NOTICE;

-- ---------------------------------------------------------------------------
-- Synthetic cast. No real person, employer, job or credential appears here.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'holder@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000002', 'verifier@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000003', 'employer-member@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000004', 'other-employer@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000005', 'bystander@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000006', 'holder2@synthetic.test')
ON CONFLICT (id) DO NOTHING;

-- Every simulated Auth JWT below names a live session for the same actor.
-- Reuse the synthetic user UUID as its session UUID only within this rolled-
-- back fixture. auth.jwt() now reads the claims instead of returning {}, so
-- the real Passport session guard must be satisfied rather than bypassed.
INSERT INTO auth.sessions (id, user_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004'),
  ('a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005'),
  ('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Syntetisk Bevakning AB', 'syntetisk-bevakning', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'Annan Bevakning AB', 'annan-bevakning', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'owner', 'active')
ON CONFLICT DO NOTHING;

-- A published advertisement. jobs_validate_before_write only lets a platform
-- admin create one directly, so the fixture borrows that role for this one
-- statement rather than weakening the trigger it is about to rely on.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'fixture-admin@synthetic.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'admin')
ON CONFLICT DO NOTHING;

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method, slug, short_id, published_at, expires_at)
VALUES ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'Väktare', 'Security guard', 'published', 'internal', 'syntetisk-vaktare', 'SYN0001', now(), now() + interval '30 days'),
       ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'Ordningsvakt', 'Public order guard', 'published', 'internal', 'syntetisk-ov', 'SYN0002', now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;

RESET request.jwt.claim.sub;

-- The holder: one VERIFIED credential, one VERIFIED period, and a set of
-- entries that must never be disclosed.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Syntetisk Innehavare', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.sp_claims (
  id, holder_user_id, claim_type, credential_code, skill_code, skill_level, title, claimed_issuer_name,
  issued_on, valid_until, assertion_level, lifecycle_state, verified_by_user_id, verified_at,
  -- Added by the Swedish truth model (20260907091000): a skyddsvakt approval
  -- is limited to an employer, principal or protected object, and without
  -- saying which it reads as a general national licence.
  jurisdiction_code)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'licence', 'OV', NULL, NULL, 'Ordningsvaktsförordnande', 'Polismyndigheten',
   current_date - 30, current_date + 365, 'verified', 'active', 'a0000000-0000-4000-8000-000000000002', now(), 'SE'),
  -- Must NOT be disclosed: self-declared.
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'training', 'OV_TRAINING', NULL, NULL, 'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten',
   current_date - 200, NULL, 'self_declared', 'active', NULL, NULL, 'SE'),
  -- Must NOT be disclosed: verified but expired lifecycle.
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'licence', 'SE_PERSONNEL_APPROVAL', NULL, NULL, 'Personalgodkännande (bevakningsföretag)', 'Länsstyrelsen',
   current_date - 800, current_date - 10, 'verified', 'expired', 'a0000000-0000-4000-8000-000000000002', now(),
   'SE'),
  -- Must NOT be disclosed: verified but disputed.
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   'certification', 'INTL_ASIS_CPP', NULL, NULL, 'Certified Protection Professional (CPP)', 'ASIS International',
   current_date - 100, NULL, 'verified', 'disputed', 'a0000000-0000-4000-8000-000000000002', now(), NULL),
  -- A VERIFIED language: proves the package already carries skill claims.
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   'language', NULL, 'lang_en', 'B2', 'Engelska', NULL,
   NULL, NULL, 'verified', 'active', 'a0000000-0000-4000-8000-000000000002', now(), NULL)
ON CONFLICT (id) DO NOTHING;

-- ── The private fields, attached to the credential that IS disclosed ──────
--
-- The leak assertions below are only meaningful on a claim that reaches the
-- payload. Hanging them on a self-declared claim would prove nothing: that
-- row is excluded wholesale, so its columns could never appear anyway.
-- d...0001 is the verified Ordningsvaktsförordnande the employer is entitled
-- to see, and these three columns are what they are NOT entitled to see on
-- it -- field-level exclusion, not row-level.
--
-- 20260817180000 states the rule in a comment ("credential_reference and
-- holder_note are NOT added and must never be"). A comment does not fail a
-- build; this does.
UPDATE public.sp_claims
   SET credential_reference = 'SYNTHETIC-DOCNR-MUST-NOT-LEAK'
 WHERE id = 'd0000000-0000-4000-8000-000000000001';

-- A raw evidence document for that same credential.
INSERT INTO public.sp_evidence (
  id, holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes, sha256)
VALUES ('c1e00000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001/SYNTHETIC-EVIDENCE-PATH-MUST-NOT-LEAK.pdf',
        'SYNTHETIC-EVIDENCE-FILENAME-MUST-NOT-LEAK.pdf',
        'application/pdf', 1024, 'SYNTHETIC-SHA-MUST-NOT-LEAK')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_experience_periods (
  id, holder_user_id, employer_name, role_title, jurisdiction_code,
  employment_type, fte_fraction, security_relevance, security_fraction,
  started_on, ended_on, assertion_level, lifecycle_state)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Tidigare Bevakning AB', 'Väktare', 'SE', 'full_time', 1.0, 'primary', 1.0,
   '2021-01-01', NULL, 'verified', 'active'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Hemlig Arbetsgivare AB', 'Väktare', 'SE', 'full_time', 1.0, 'primary', 1.0,
   '2019-01-01', '2020-12-31', 'self_declared', 'active')
ON CONFLICT (id) DO NOTHING;

-- A second holder with a Passport but nothing verified.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('a0000000-0000-4000-8000-000000000006', 'Ingen Verifiering', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.sp_claims (
  id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name, jurisdiction_code, issued_on,
  assertion_level, lifecycle_state)
VALUES ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000006',
        'training', 'OV_TRAINING', 'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', 'SE', current_date - 100, 'self_declared', 'active')
ON CONFLICT (id) DO NOTHING;



CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.req(_uid uuid, _sid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', _sid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN EXECUTE _sql INTO r; EXCEPTION WHEN OTHERS THEN r := 'err:' || SQLERRM; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN coalesce(r, '');
END $$;
-- The payload without the times of the share itself.
CREATE OR REPLACE FUNCTION pg_temp.stable(_p jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT _p - 'authorised_at' - 'expires_at' - 'last_updated'
$$;
CREATE OR REPLACE FUNCTION pg_temp.trace() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM public.sp_disclosures) || '/' || (SELECT count(*) FROM public.sp_disclosure_accesses)
         || '/' || (SELECT count(*) FROM public.sp_passport_events)
$$;
CREATE TEMP TABLE f AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid h, 'a0000000-0000-4000-8000-000000000003'::uuid m,
  'a0000000-0000-4000-8000-000000000006'::uuid h2,
  'f0000000-0000-4000-8000-0000000000bb'::uuid app, 'c0000000-0000-4000-8000-000000000001'::uuid job;
GRANT SELECT ON f TO PUBLIC;
CREATE TEMP TABLE pv AS SELECT pg_temp.trace() t0 FROM f;
UPDATE pv SET t0 = pg_temp.trace();
ALTER TABLE pv ADD COLUMN preview jsonb;
UPDATE pv SET preview = (SELECT pg_temp.req(h, h, 'SELECT public.sp_preview_application_disclosure()::text')::jsonb FROM f);

DO $$ BEGIN RAISE NOTICE 'GROUP PV2 — nothing is stored'; END $$;
SELECT pg_temp.ok(pg_temp.trace() = (SELECT t0 FROM pv), 'PV2.1 the preview left no disclosure, access or Passport event');

DO $$ BEGIN RAISE NOTICE 'GROUP PV1 — the preview is the employer''s payload'; END $$;
SELECT pg_temp.ok((SELECT preview->>'status' FROM pv) = 'active'
                  AND (SELECT preview->>'package' FROM pv) = 'employer_review',
                  'PV1.1 the preview is an active employer_review payload');
SELECT pg_temp.req(h, h, format($q$SELECT public.sp_submit_application_with_passport(%L, %L, '070', NULL, %L, 'cv.pdf', 1000, true)->>'passport_shared'$q$,
                                app, job, h || '/' || app || '/cv.pdf')) AS shared FROM f \gset
SELECT pg_temp.ok(:'shared' = 'true', 'PV1.2 the holder then applies and shares');
SELECT pg_temp.ok(pg_temp.stable(pg_temp.req(m, m, format('SELECT public.sp_application_disclosure(%L)::text', app))::jsonb)
                  = pg_temp.stable((SELECT preview FROM pv)),
                  'PV1.3 what the employer receives is exactly what the holder previewed') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP PV3 — a signed-out holder'; END $$;
DELETE FROM auth.sessions WHERE id = (SELECT h FROM f);
SELECT pg_temp.ok(pg_temp.req(h, h, 'SELECT public.sp_preview_application_disclosure()::text') = 'err:SP_SESSION_REVOKED',
                  'PV3.1 the preview needs the holder''s live session') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP PV4 — nothing verified'; END $$;
SELECT pg_temp.ok(jsonb_array_length(p->'verified_claims') = 0 AND jsonb_array_length(p->'verified_experience') = 0
                  AND position('Ordningsvaktsutbildning' IN p::text) = 0,
                  'PV4.1 a holder with nothing verified sees an empty preview, never a self-declared entry')
  FROM (SELECT pg_temp.req(h2, h2, 'SELECT public.sp_preview_application_disclosure()::text')::jsonb p FROM f) t;
SELECT pg_temp.ok(position('MUST-NOT-LEAK' IN (SELECT preview::text FROM pv)) = 0,
                  'PV4.2 the private fields of a shared credential are not in the preview');

DO $$ BEGIN RAISE NOTICE 'GROUP PV5 — own Passport only'; END $$;
SELECT pg_temp.ok(position('Syntetisk Innehavare' IN pg_temp.req(h2, h2, 'SELECT public.sp_preview_application_disclosure()::text')) = 0,
                  'PV5.1 another holder''s preview shows nothing of this Passport') FROM f;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_preview_application_disclosure()', 'EXECUTE')
                  AND has_function_privilege('authenticated', 'public.sp_preview_application_disclosure()', 'EXECUTE'),
                  'PV5.2 anon cannot call it');

ROLLBACK;
