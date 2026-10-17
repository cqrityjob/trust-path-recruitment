-- 20270321090000: a Passport shared with an application needs a live Auth
-- session on both sides -- the employer reading it, the holder listing it --
-- while public sharing through a valid link keeps working.
--
--   AD1  live: the employer reads the shared Passport; the holder lists it.
--   AD2  the employer signed out: refused by the session rule itself
--        (REC_SESSION_REVOKED, before anything is read), nothing recorded.
--   AD3  the holder signed out: the list and a re-share are refused, the
--        disclosure is untouched.
--   AD4  another live session of the employer still reads; the session is
--        bound to its user (the holder's live session id does not help).
--   AD5  a valid public link still opens (service_role, as the app reads it),
--        also after the holder has signed out everywhere; a revoked link and
--        an application share never open as a link.
--   AD6  unchanged answers for live callers: another organisation, an unknown
--        application -- the same undifferentiated "none".
--
-- The fixture is sp_application_passport_test.sql's (synthetic people, one
-- verified credential); everything rolls back.
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
-- One request with a token naming (_sid) as its session: the first column of
-- the first row as text, or 'err:<message>'.
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
-- The public link, read as the app reads it: the service role.
CREATE OR REPLACE FUNCTION pg_temp.link(_token text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  r := public.sp_get_disclosure(_token)->>'status';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;

CREATE TEMP TABLE f AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid h, 'a0000000-0000-4000-8000-000000000003'::uuid m,
  'a0000000-0000-4000-8000-000000000004'::uuid other,
  'ad000000-0000-4000-8000-0000000000a1'::uuid m2,
  'f0000000-0000-4000-8000-0000000000ad'::uuid app,
  'c0000000-0000-4000-8000-000000000001'::uuid job;
GRANT SELECT ON f TO PUBLIC;
INSERT INTO auth.sessions (id, user_id) SELECT m2, m FROM f;
CREATE TEMP TABLE probe (k text PRIMARY KEY, q text);
GRANT SELECT ON probe TO PUBLIC;
INSERT INTO probe VALUES
  ('read',  $q$SELECT public.sp_application_disclosure('f0000000-0000-4000-8000-0000000000ad')->>'status'$q$),
  ('list',  $q$SELECT count(*)::text FROM public.sp_my_application_disclosures()$q$),
  ('share', $q$SELECT public.sp_share_passport_with_application('f0000000-0000-4000-8000-0000000000ad', 'public_card')::text$q$);
CREATE OR REPLACE FUNCTION pg_temp.p(_k text) RETURNS text LANGUAGE sql AS $$ SELECT q FROM probe WHERE k = _k $$;
CREATE OR REPLACE FUNCTION pg_temp.trace() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(d.id || ':' || d.access_count || ':' || coalesce(d.revoked_at::text, '-'), ',' ORDER BY d.id)
         || '|' || (SELECT count(*) FROM public.sp_disclosure_accesses)
    FROM public.sp_disclosures d WHERE d.holder_user_id = (SELECT h FROM f)
$$;

-- The holder applies and shares (the app's own submission), and makes one
-- public link.
SELECT pg_temp.req(h, h, format($q$SELECT public.sp_submit_application_with_passport(%L, %L, '070', NULL, %L, 'cv.pdf', 1000, true)->>'passport_shared'$q$,
                                app, job, h || '/' || app || '/cv.pdf')) AS shared FROM f \gset
SELECT pg_temp.req(h, h, $q$SELECT public.sp_create_disclosure('public_card', 30, NULL, NULL)$q$) AS token FROM f \gset
SELECT pg_temp.req(h, h, $q$SELECT public.sp_create_disclosure('public_card', 30, NULL, NULL)$q$) AS revoked_token FROM f \gset
UPDATE public.sp_disclosures SET revoked_at = now()
 WHERE token_hash = encode(digest(:'revoked_token', 'sha256'), 'hex');

DO $$ BEGIN RAISE NOTICE 'GROUP AD1 — live sessions'; END $$;
SELECT pg_temp.ok(:'shared' = 'true', 'AD1.1 the holder applied with the Passport shared');
SELECT pg_temp.ok(pg_temp.req(m, m, pg_temp.p('read')) = 'active', 'AD1.2 the employer on a live session reads the shared Passport') FROM f;
SELECT pg_temp.ok(pg_temp.req(h, h, pg_temp.p('list')) = '1', 'AD1.3 the holder on a live session lists the share') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP AD2 — the employer signed out'; END $$;
CREATE TEMP TABLE t0 AS SELECT pg_temp.trace() t;
DELETE FROM auth.sessions WHERE id = (SELECT m FROM f);
SELECT pg_temp.ok(pg_temp.req(m, m, pg_temp.p('read')) = 'err:REC_SESSION_REVOKED',
                  'AD2.1 the signed-out employer is refused by the session rule, before anything is read') FROM f;
SELECT pg_temp.ok(pg_temp.trace() = (SELECT t FROM t0), 'AD2.2 nothing was recorded: access count and access log unchanged');

DO $$ BEGIN RAISE NOTICE 'GROUP AD3 — the holder signed out'; END $$;
DELETE FROM auth.sessions WHERE id = (SELECT h FROM f);
SELECT pg_temp.ok(pg_temp.req(h, h, pg_temp.p('list')) = 'err:SP_SESSION_REVOKED',
                  'AD3.1 the signed-out holder cannot list the employers and jobs shared with') FROM f;
SELECT pg_temp.ok(pg_temp.req(h, h, pg_temp.p('share')) LIKE 'err:SP_SESSION_REVOKED%', 'AD3.2 nor re-share') FROM f;
SELECT pg_temp.ok(pg_temp.trace() = (SELECT t FROM t0), 'AD3.3 the disclosures are untouched');

DO $$ BEGIN RAISE NOTICE 'GROUP AD4 — another session, bound to its user'; END $$;
SELECT pg_temp.ok(pg_temp.req(m, m2, pg_temp.p('read')) = 'active', 'AD4.1 the employer''s other live session still reads') FROM f;
INSERT INTO auth.sessions (id, user_id) SELECT 'ad000000-0000-4000-8000-0000000000c1', h FROM f;
SELECT pg_temp.ok(pg_temp.req(m, 'ad000000-0000-4000-8000-0000000000c1', pg_temp.p('read')) = 'err:REC_SESSION_REVOKED'
                  AND pg_temp.req(h, m2, pg_temp.p('list')) = 'err:SP_SESSION_REVOKED',
                  'AD4.2 someone else''s live session id is refused, both ways') FROM f;
SELECT pg_temp.ok(pg_temp.req(h, 'ad000000-0000-4000-8000-0000000000c1', pg_temp.p('list')) = '1',
                  'AD4.3 the holder signed in again lists the share') FROM f;
DELETE FROM auth.sessions WHERE user_id = (SELECT h FROM f);

DO $$ BEGIN RAISE NOTICE 'GROUP AD5 — public sharing through a valid link'; END $$;
SELECT pg_temp.ok(pg_temp.link(:'token') = 'active', 'AD5.1 a valid link opens, with the holder signed out everywhere');
SELECT pg_temp.ok(pg_temp.link(:'revoked_token') = 'unavailable', 'AD5.2 a revoked link does not');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.sp_get_disclosure(text)', 'EXECUTE'),
                  'AD5.3 the link reader stays server-only (service_role)');

DO $$ BEGIN RAISE NOTICE 'GROUP AD6 — live callers see the same answers as before'; END $$;
SELECT pg_temp.ok(pg_temp.req(other, other, pg_temp.p('read')) = 'none', 'AD6.1 another organisation''s live owner: none') FROM f;
SELECT pg_temp.ok(pg_temp.req(m, m2, $q$SELECT public.sp_application_disclosure('f0000000-0000-4000-8000-00000000ffff')->>'status'$q$) = 'none',
                  'AD6.2 an unknown application: none') FROM f;

ROLLBACK;
