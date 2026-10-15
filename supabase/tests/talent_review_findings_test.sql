-- Independent review of #472/#473 (2026-10-15): nine reproduced findings,
-- one group each. Every group failed against e4f89ab/1ebaea2 and passes
-- after the fixes in the same slots (20270316090000-20270318090000).
--
--   RF1  a revoked Passport session reads nothing through the new SECURITY
--        DEFINER functions (holder, reviewer and recruiter side alike).
--   RF2  a Passport verifier never reads an employer attestation or its
--        internal note; the employer-side review thread stays the employer's.
--   RF3  a notice whose recipient lost access is not handed out again after
--        its lease expires, and leaves the inbox at once.
--   RF4  a correction REPLACES the searchable version: the saved selection
--        stays saveable and never contains a superseded entry.
--   RF5  decline, then the same answer with "block": every other open
--        request from that organisation is declined, snapshots cleared, and
--        the organisation no longer reads the person as discoverable.
--   RF6  validity knows valid_from; an expired merit only needs clarifying
--        when the employer asked for a valid one.
--   RF7  criteria are bound to the requirement-profile version the user saw.
--   RF8  a decision notice carries its verification method.
--   RF9  (application) recipient allowlist -- see scripts/talent-discovery-check.ts.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    -- psql -v report_only=1: record and continue, to show every failing group
    -- at once against an unfixed schema. Never set in db-test.sh.
    IF current_setting('rf.report_only', true) = 'on' THEN RAISE NOTICE 'not ok  %', label; RETURN; END IF;
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
\if :{?report_only}
SELECT set_config('rf.report_only', 'on', true);
\endif
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN _r := 'err:' || split_part(SQLERRM, ':', 1); END;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.j_as(_uid text, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _r;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.claim(_holder uuid, _code text, _valid_until date, _scope text DEFAULT NULL, _ref text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code = _code;
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
                                jurisdiction_code, sub_jurisdiction_code, valid_until, authorisation_scope,
                                credential_reference, lifecycle_state, assertion_level)
  VALUES (_holder, d.claim_type, d.name_en, _code, coalesce(d.issuer_name, 'Synthetic issuer'),
          d.country, d.region, _valid_until, _scope, _ref, 'active', 'self_declared')
  RETURNING id INTO _id;
  RETURN _id;
END $$;
-- Document review through the real RPCs.
CREATE OR REPLACE FUNCTION pg_temp.approve(_holder uuid, _claim uuid, _period uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.try_as(_holder::text, format('SELECT public.sp_submit_for_verification(%L, %L, ''cqrityjob_review'', NULL)', _claim, _period));
  IF pg_temp.try_as('a7180000-0000-4000-8000-0000000000f1', format(
      'SELECT public.sp_verifier_decide_reviewed(r.id, r.submitted_at, ''approved'', ''document_review'', NULL, NULL, NULL, NULL)
         FROM public.sp_verification_requests r WHERE r.status = ''pending'' AND (r.claim_id = %L OR r.period_id = %L)', _claim, _period)) <> 'ok' THEN
    RAISE EXCEPTION 'fixture approval failed';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.open(_holder uuid, _vis text, _claims uuid[], _periods uuid[], _prefs jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF pg_temp.try_as(_holder::text, format('SELECT public.sp_talent_save_settings(%s, %L, ''talent-v1'', %L::uuid[], %L::uuid[], %L::jsonb)',
       coalesce((SELECT version FROM public.sp_talent_profiles WHERE holder_user_id = _holder), 0), _vis, _claims, _periods, _prefs)) <> 'ok' THEN
    RAISE EXCEPTION 'fixture open failed';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ref(_holder uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT search_ref FROM public.sp_talent_profiles WHERE holder_user_id = _holder;
$$;

-- A call with a real-looking session: role authenticated and a session id.
CREATE OR REPLACE FUNCTION pg_temp.try_session(_uid text, _session text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', _session)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN _r := 'err:' || split_part(SQLERRM, ':', 1); END;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE TEMP TABLE f AS SELECT
  'a7180000-0000-4000-8000-000000000001'::uuid AS o,  'a7180000-0000-4000-8000-000000000002'::uuid AS r,
  'a7180000-0000-4000-8000-000000000003'::uuid AS m,  'a7180000-0000-4000-8000-000000000004'::uuid AS o2,
  'a7180000-0000-4000-8000-000000000005'::uuid AS o3, 'a7180000-0000-4000-8000-000000000006'::uuid AS outsider,
  'a7180000-0000-4000-8000-0000000000c1'::uuid AS c1, 'a7180000-0000-4000-8000-0000000000c2'::uuid AS c2,
  'a7180000-0000-4000-8000-0000000000c3'::uuid AS c3, 'a7180000-0000-4000-8000-0000000000c4'::uuid AS c4,
  'a7180000-0000-4000-8000-0000000000c5'::uuid AS c5, 'a7180000-0000-4000-8000-0000000000f1'::uuid AS v,
  'a7180000-1111-4000-8000-000000000001'::uuid AS e1, 'a7180000-1111-4000-8000-000000000002'::uuid AS e2,
  'a7180000-1111-4000-8000-000000000003'::uuid AS e3,
  'a7180000-2222-4000-8000-000000000001'::uuid AS j1, 'a7180000-2222-4000-8000-000000000002'::uuid AS j2,
  'a7180000-2222-4000-8000-000000000003'::uuid AS j_e2;
GRANT SELECT ON f TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT x.id, x.email FROM f, LATERAL (VALUES (o, 'ts-owner@synthetic.invalid'), (r, 'ts-recruiter@synthetic.invalid'),
  (m, 'ts-member@synthetic.invalid'), (o2, 'ts-owner2@synthetic.invalid'), (o3, 'ts-owner3@synthetic.invalid'),
  (outsider, 'ts-outsider@synthetic.invalid'), (c1, 'ts-c1@synthetic.invalid'), (c2, 'ts-c2@synthetic.invalid'),
  (c3, 'ts-c3@synthetic.invalid'), (c4, 'ts-c4@synthetic.invalid'), (c5, 'ts-c5@synthetic.invalid'),
  (v, 'ts-verifier@synthetic.invalid')) x(id, email);
UPDATE public.profiles SET display_name = 'Cecilia Syntetisk' WHERE id = (SELECT c1 FROM f);
UPDATE public.profiles SET display_name = 'Privat Person' WHERE id = (SELECT c4 FROM f);
INSERT INTO public.user_roles (user_id, role) SELECT v, 'passport_verifier'::public.app_role FROM f;
INSERT INTO public.employers (id, name, slug, status)
SELECT e1, 'TS Bevakning AB', 'ts-bevakning', 'active' FROM f UNION ALL
SELECT e2, 'TS Konkurrent AB', 'ts-konkurrent', 'active' FROM f UNION ALL
SELECT e3, 'TS Väntande AB', 'ts-vantande', 'pending' FROM f;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e1, o, 'owner', 'active' FROM f UNION ALL SELECT e1, r, 'member', 'active' FROM f UNION ALL
SELECT e1, m, 'member', 'active' FROM f UNION ALL SELECT e2, o2, 'owner', 'active' FROM f UNION ALL
SELECT e3, o3, 'owner', 'active' FROM f;

SELECT pg_temp.as_user((SELECT o::text FROM f));
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status, family_id, city, country, employment_type, workplace_type)
SELECT j1, 'ts-ordningsvakt', 'TS0001', e1, 'Ordningsvakt Stockholm', 'Public order guard Stockholm', 'internal', 'draft', 'corporate_security', 'Stockholm', 'SE', 'full_time', 'onsite' FROM f UNION ALL
SELECT j2, 'ts-utkast', 'TS0002', e1, 'Utkast', 'Draft', 'internal', 'draft', NULL, NULL, NULL, NULL, NULL FROM f;
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days' WHERE id = (SELECT j1 FROM f);
RESET ROLE;
SELECT pg_temp.as_user((SELECT o2::text FROM f));
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT j_e2, 'ts-konkurrent-jobb', 'TS0003', e2, 'Väktare', 'Guard', 'internal', 'draft' FROM f;
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days' WHERE id = (SELECT j_e2 FROM f);
RESET ROLE;
SELECT pg_temp.as_user('');
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
SELECT j1, e1, r FROM f ON CONFLICT (job_id) DO UPDATE SET responsible_user_id = EXCLUDED.responsible_user_id;

INSERT INTO public.recruitment_requirements (id, job_id, employer_id, kind, label_sv, label_en, position)
SELECT ('a7180000-5555-4000-8000-00000000000' || g)::uuid, j1, e1, k, lsv, len, g FROM f,
  (VALUES (1, 'mandatory', 'Ordningsvaktsförordnande', 'Public order guard appointment'),
          (2, 'mandatory', 'Väktarutbildning 1', 'Security guard training 1'),
          (3, 'desirable', 'CPP', 'CPP'),
          (4, 'desirable', 'Två års erfarenhet', 'Two years of experience'),
          (5, 'mandatory', 'Körkort B', 'Driving licence B')) x(g, k, lsv, len);
INSERT INTO public.recruitment_requirements (id, job_id, employer_id, kind, label_sv, label_en, position)
SELECT 'a7180000-5555-4000-8000-000000000009', j_e2, e2, 'mandatory', 'Ordningsvakt', 'Order guard', 1 FROM f;
-- The confirmed profiles (as rec_ri_confirm_profile stores them).
INSERT INTO public.rec_requirement_profiles (job_id, employer_id, version, rules, confirmed_by)
SELECT j1, e1, 1, (SELECT jsonb_agg(jsonb_build_object('requirementId', rr.id, 'kind', rr.kind, 'labelSv', rr.label_sv,
         'labelEn', rr.label_en, 'position', rr.position, 'decisionRule', 'human_confirmed',
         'acceptedSources', '["application_cv"]'::jsonb, 'instructionSv', 'Kontrollera', 'instructionEn', 'Check') ORDER BY rr.position)
         FROM public.recruitment_requirements rr WHERE rr.job_id = f.j1), o FROM f;
INSERT INTO public.rec_requirement_profiles (job_id, employer_id, version, rules, confirmed_by)
SELECT j_e2, e2, 1, jsonb_build_array(jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000009', 'kind', 'mandatory',
         'labelSv', 'Ordningsvakt', 'labelEn', 'Order guard', 'position', 1, 'decisionRule', 'human_confirmed',
         'acceptedSources', '["application_cv"]'::jsonb, 'instructionSv', 'K', 'instructionEn', 'C')), o2 FROM f;

-- Candidates.
CREATE TEMP TABLE cl AS SELECT
  pg_temp.claim((SELECT c1 FROM f), 'OV', current_date + 300, NULL, 'OV-998877') AS c1_ov,
  pg_temp.claim((SELECT c1 FROM f), 'VU1', NULL) AS c1_vu1,
  pg_temp.claim((SELECT c1 FROM f), 'INTL_ASIS_CPP', current_date + 500) AS c1_cpp,
  pg_temp.claim((SELECT c2 FROM f), 'OV', current_date - 10) AS c2_ov,
  pg_temp.claim((SELECT c2 FROM f), 'VU1', NULL) AS c2_vu1,
  pg_temp.claim((SELECT c2 FROM f), 'INTL_ASIS_CPP', current_date + 500) AS c2_cpp,
  pg_temp.claim((SELECT c3 FROM f), 'INTL_ASIS_CPP', current_date + 500) AS c3_cpp,
  pg_temp.claim((SELECT c3 FROM f), 'INTL_ISC2_CISSP', current_date + 500) AS c3_cissp,
  pg_temp.claim((SELECT c4 FROM f), 'OV', current_date + 300) AS c4_ov,
  pg_temp.claim((SELECT c5 FROM f), 'OV', current_date + 300) AS c5_ov;
GRANT SELECT ON cl TO PUBLIC;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, started_on, ended_on, security_relevance)
SELECT 'a7180000-3333-4000-8000-0000000000c1', c1, 'Nuvarande Arbetsgivare AB', 'Ordningsvakt', current_date - 920, NULL, 'primary' FROM f;
SELECT pg_temp.approve((SELECT c1 FROM f), (SELECT c1_ov FROM cl), NULL);
SELECT pg_temp.approve((SELECT c2 FROM f), (SELECT c2_cpp FROM cl), NULL);
SELECT pg_temp.open((SELECT c1 FROM f), 'open', ARRAY[(SELECT c1_ov FROM cl), (SELECT c1_vu1 FROM cl), (SELECT c1_cpp FROM cl)],
                    ARRAY['a7180000-3333-4000-8000-0000000000c1'::uuid],
                    '{"areas":["corporate_security"],"countries":["SE"],"employmentTypes":["full_time"]}');
SELECT pg_temp.open((SELECT c2 FROM f), 'active', ARRAY[(SELECT c2_ov FROM cl), (SELECT c2_vu1 FROM cl), (SELECT c2_cpp FROM cl)], '{}', '{}');
SELECT pg_temp.open((SELECT c3 FROM f), 'open', ARRAY[(SELECT c3_cpp FROM cl), (SELECT c3_cissp FROM cl)], '{}', '{"countries":["GB"]}');
SELECT pg_temp.open((SELECT c4 FROM f), 'open', ARRAY[(SELECT c4_ov FROM cl)], '{}', '{}');
SELECT pg_temp.j_as((SELECT c4::text FROM f), 'SELECT public.sp_talent_pause()');
SELECT pg_temp.open((SELECT c5 FROM f), 'open', ARRAY[(SELECT c5_ov FROM cl)], '{}', '{}');
INSERT INTO public.sp_talent_blocks (holder_user_id, employer_id) SELECT c5, e1 FROM f;

CREATE TEMP TABLE crit AS SELECT jsonb_build_array(
  jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000001', 'credentialCodes', jsonb_build_array('OV'), 'jurisdiction', 'SE'),
  jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000002', 'credentialCodes', jsonb_build_array('VU1')),
  jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000003', 'credentialCodes', jsonb_build_array('INTL_ASIS_CPP'), 'minLevel', 'document_reviewed'),
  jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000004', 'experienceMonths', 24),
  jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000005')) AS j;
GRANT SELECT ON crit TO PUBLIC;


-- Criteria confirmed through whichever confirm signature this schema has, so
-- each finding group below fails or passes on its own merits (RF7 tests the
-- profile binding itself).
CREATE OR REPLACE FUNCTION pg_temp.confirm(_uid uuid, _job uuid, _version int, _profile uuid, _crit jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure('public.rec_talent_confirm_criteria(uuid,integer,uuid,jsonb)') IS NOT NULL THEN
    RETURN pg_temp.try_as(_uid::text, format('SELECT public.rec_talent_confirm_criteria(%L, %s, %L, %L::jsonb)', _job, _version, _profile, _crit));
  END IF;
  RETURN pg_temp.try_as(_uid::text, format('SELECT public.rec_talent_confirm_criteria(%L, %s, %L::jsonb)', _job, _version, _crit));
END $$;
SELECT pg_temp.ok(pg_temp.confirm((SELECT o FROM f), (SELECT j1 FROM f), 0,
                    (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT j1 FROM f) AND version = 1), (SELECT j FROM crit)) = 'ok',
                  'RF-F criteria confirmed for the job');
-- A second published job of the same organisation (RF5).
SELECT pg_temp.as_user((SELECT o::text FROM f));
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT 'a7180000-2222-4000-8000-000000000004', 'rf-andra-jobbet', 'RF0004', e1, 'Väktare natt', 'Night guard', 'internal', 'draft' FROM f;
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days' WHERE id = 'a7180000-2222-4000-8000-000000000004';
RESET ROLE;
SELECT pg_temp.as_user('');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF1 — a revoked session reads nothing through the new functions'; END $$;
INSERT INTO auth.sessions (id, user_id)
SELECT 'a7180000-9999-4000-8000-0000000000c1'::uuid, c1 FROM f UNION ALL
SELECT 'a7180000-9999-4000-8000-000000000002'::uuid, r FROM f UNION ALL
SELECT 'a7180000-9999-4000-8000-0000000000f1'::uuid, v FROM f;
CREATE TEMP TABLE rf1 (who text, call text);
GRANT SELECT ON rf1 TO PUBLIC;
INSERT INTO rf1 SELECT 'c1', x FROM f, cl, LATERAL (VALUES
  ('SELECT public.sp_talent_preview()'),
  ('SELECT public.sp_talent_get_settings()'),
  (format('SELECT public.sp_review_thread(%L, NULL)', cl.c1_ov)),
  (format('SELECT public.sp_entry_review_state(%L, NULL)', cl.c1_ov)),
  ('SELECT public.user_notices_inbox(30)'),
  ('SELECT public.sp_talent_my_contacts()'),
  ('SELECT public.sp_talent_pause()')) v(x);
INSERT INTO rf1 SELECT 'r', x FROM f, LATERAL (VALUES
  (format('SELECT public.rec_talent_search(%L)', f.j1)),
  (format('SELECT public.rec_talent_get_criteria(%L)', f.j1)),
  (format('SELECT public.rec_talent_contacts(%L)', f.j1)),
  (format('SELECT public.rec_talent_profile(%L, %L)', f.j1, pg_temp.ref(f.c1)))) v(x);
INSERT INTO rf1 SELECT 'v', format('SELECT public.sp_review_thread(%L, NULL)', c1_ov) FROM cl;
CREATE OR REPLACE FUNCTION pg_temp.rf1_run() RETURNS text[] LANGUAGE sql AS $$
  SELECT array_agg(pg_temp.try_session(
           CASE who WHEN 'c1' THEN (SELECT c1::text FROM f) WHEN 'r' THEN (SELECT r::text FROM f) ELSE (SELECT v::text FROM f) END,
           CASE who WHEN 'c1' THEN 'a7180000-9999-4000-8000-0000000000c1' WHEN 'r' THEN 'a7180000-9999-4000-8000-000000000002'
                    ELSE 'a7180000-9999-4000-8000-0000000000f1' END, call) ORDER BY who, call)
    FROM rf1 WHERE call NOT LIKE '%sp_talent_pause%';
$$;
SELECT pg_temp.ok((SELECT bool_and(x = 'ok') FROM unnest(pg_temp.rf1_run()) x),
                  'RF1.1 control: with a live session every read answers');
-- The session ends (sign-out everywhere, or an administrator revokes it).
DELETE FROM auth.sessions WHERE id IN ('a7180000-9999-4000-8000-0000000000c1', 'a7180000-9999-4000-8000-000000000002',
                                       'a7180000-9999-4000-8000-0000000000f1');
SELECT pg_temp.ok(pg_temp.try_session((SELECT c1::text FROM f), 'a7180000-9999-4000-8000-0000000000c1',
                    'DO $x$ BEGIN IF (SELECT count(*) FROM public.sp_claims) <> 0 THEN RAISE EXCEPTION ''LEAK''; END IF; END $x$') = 'ok',
                  'RF1.2 reference: the ordinary table read already returns nothing');
SELECT pg_temp.ok((SELECT bool_and(x = 'err:SP_SESSION_REVOKED') FROM unnest(pg_temp.rf1_run()) x),
                  'RF1.3 every new read refuses a revoked session: holder, recruiter and reviewer');
SELECT pg_temp.ok(pg_temp.try_session((SELECT c1::text FROM f), 'a7180000-9999-4000-8000-0000000000c1', 'SELECT public.sp_talent_pause()')
                    = 'err:SP_SESSION_REVOKED'
                  AND pg_temp.try_session((SELECT c1::text FROM f), 'a7180000-9999-4000-8000-0000000000c1',
                    format('SELECT public.sp_talent_save_settings(%s, ''private'', NULL, ''{}''::uuid[], ''{}''::uuid[], ''{}''::jsonb)',
                           (SELECT version FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT c1 FROM f)))) = 'err:SP_SESSION_REVOKED',
                  'RF1.4 and every new write');
SELECT pg_temp.ok((SELECT visibility FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT c1 FROM f)) = 'open',
                  'RF1.5 nothing changed');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF2 — an employer attestation is never a Passport reviewer''s to read'; END $$;
INSERT INTO public.sp_verification_requests (id, holder_user_id, period_id, request_kind, target_employer_id, status,
                                             submitted_at, decided_at, decided_by, verification_method, decision_note, holder_message)
SELECT 'a7180000-7777-4000-8000-000000000001', c1, 'a7180000-3333-4000-8000-0000000000c1', 'employer_attestation', e1, 'approved',
       now() - interval '1 hour', now(), o, 'employer_confirmation', 'INTERN-ARBETSGIVARE: anteckning', 'Bekräftad av arbetsgivaren.' FROM f;
INSERT INTO public.sp_verification_decisions (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method,
                                              decision_note, holder_message)
SELECT 'a7180000-7777-4000-8000-000000000001', c1, o, 'TS Bevakning AB', 'approved', 'employer_confirmation',
       'INTERN-ARBETSGIVARE: anteckning', 'Bekräftad av arbetsgivaren.' FROM f;
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), 'SELECT public.sp_review_thread(NULL, ''a7180000-3333-4000-8000-0000000000c1'')')
                    = 'err:SP_TARGET_NOT_FOUND'
                  AND pg_temp.try_as((SELECT v::text FROM f), 'SELECT public.sp_entry_review_state(NULL, ''a7180000-3333-4000-8000-0000000000c1'')')
                    = 'err:SP_TARGET_NOT_FOUND',
                  'RF2.1 a verifier with no CQrityjob case for the period reads nothing');
-- The holder also asks CQrityjob to review the same period: the reviewer may
-- now read THAT case -- and still nothing of the employer's.
SELECT pg_temp.try_as((SELECT c1::text FROM f), 'SELECT public.sp_submit_for_verification(NULL, ''a7180000-3333-4000-8000-0000000000c1'', ''cqrityjob_review'', NULL)');
CREATE TEMP TABLE rf2 AS SELECT pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.sp_review_thread(NULL, ''a7180000-3333-4000-8000-0000000000c1'')') AS t;
GRANT SELECT ON rf2 TO PUBLIC;
SELECT pg_temp.ok((SELECT t::text NOT LIKE '%INTERN-ARBETSGIVARE%' AND t::text NOT LIKE '%a7180000-7777-4000-8000-000000000001%' FROM rf2),
                  'RF2.2 with its own case the verifier reads neither the attestation nor its internal note');
SELECT pg_temp.ok((SELECT t#>>'{current,state}' = 'pending' FROM rf2),
                  'RF2.3 and the current state is the CQrityjob case''s, not the employer''s approval');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_review_thread(NULL, ''a7180000-3333-4000-8000-0000000000c1'')')::text
                    NOT LIKE '%INTERN-ARBETSGIVARE%',
                  'RF2.4 the holder never reads an internal note either');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF8 — a decision notice says how it was decided'; END $$;
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.user_notices_inbox(50)')->'items'
                    @> '[{"kind":"passport_decision_approved","verificationMethod":"employer_confirmation"}]'
                  AND pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.user_notices_inbox(50)')->'items'
                    @> '[{"kind":"passport_decision_approved","verificationMethod":"document_review"}]',
                  'RF8.1 the inbox tells an employer confirmation from a CQrityjob document review');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE rf8 AS SELECT public.user_notices_claim_emails(50) AS j;
RESET ROLE;
SELECT pg_temp.ok((SELECT j @> '[{"kind":"passport_decision_approved","verificationMethod":"employer_confirmation"}]'
                          AND j @> '[{"kind":"passport_decision_approved","verificationMethod":"document_review"}]' FROM rf8),
                  'RF8.2 and so does the mail payload');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF3 — lost access ends the notice: mail retry and inbox'; END $$;
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT v FROM f) AND email_status = 'claimed') > 0
                  AND (pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.user_notices_inbox(50)')->>'unread')::int > 0,
                  'RF3.1 control: the reviewer''s notices were claimed and are in the inbox');
DELETE FROM public.user_roles WHERE user_id = (SELECT v FROM f) AND role = 'passport_verifier';
UPDATE public.user_notices SET email_claimed_at = now() - interval '4 minutes' WHERE recipient_user_id = (SELECT v FROM f);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE rf3 AS SELECT public.user_notices_claim_emails(50) AS j;
RESET ROLE;
SELECT pg_temp.ok((SELECT NOT (j::text LIKE '%ts-verifier@%') FROM rf3)
                  AND NOT EXISTS (SELECT 1 FROM public.user_notices WHERE recipient_user_id = (SELECT v FROM f) AND email_status IN ('claimed', 'pending')),
                  'RF3.2 an expired lease is re-checked: no mail to a former reviewer, the rows settle as skipped');
SELECT pg_temp.ok((pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.user_notices_inbox(50)')->>'unread')::int = 0
                  AND jsonb_array_length(pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.user_notices_inbox(50)')->'items') = 0,
                  'RF3.3 the inbox drops them at once');
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), 'SELECT id FROM public.user_notices') LIKE 'err:permission denied%',
                  'RF3.4 and the table is not readable around the inbox');
INSERT INTO public.user_roles (user_id, role) SELECT v, 'passport_verifier'::public.app_role FROM f;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF4 — a correction replaces the searchable version'; END $$;
CREATE TEMP TABLE rf4 AS SELECT (pg_temp.j_as((SELECT c1::text FROM f), format(
  'SELECT to_jsonb(public.sp_correct_claim(%L, c.title, c.claimed_issuer_name, c.jurisdiction_code, c.issued_on, c.valid_from, %L::date, ''Förnyad'', c.credential_code, c.credential_reference, c.holder_note)) FROM public.sp_claims c WHERE c.id = %L',
  (SELECT c1_vu1 FROM cl), current_date + 1000, (SELECT c1_vu1 FROM cl)))#>>'{}')::uuid AS id;
GRANT SELECT ON rf4 TO PUBLIC;
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_talent_items WHERE claim_id = (SELECT id FROM rf4))
                  AND NOT EXISTS (SELECT 1 FROM public.sp_talent_items WHERE claim_id = (SELECT c1_vu1 FROM cl)),
                  'RF4.1 the new version is selected in place of the old one');
CREATE TEMP TABLE rf4s AS SELECT pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_get_settings()') AS s;
GRANT SELECT ON rf4s TO PUBLIC;
SELECT pg_temp.ok(pg_temp.try_as((SELECT c1::text FROM f), format(
                    'SELECT public.sp_talent_save_settings(%s, ''open'', ''talent-v1'', %L::uuid[], %L::uuid[], %L::jsonb)',
                    (SELECT s->>'version' FROM rf4s),
                    (SELECT array_agg(x)::text FROM rf4s, jsonb_array_elements_text(s#>'{items,claims}') x),
                    (SELECT coalesce(array_agg(x), '{}')::text FROM rf4s, jsonb_array_elements_text(s#>'{items,experiences}') x),
                    (SELECT s->'preferences' FROM rf4s))) = 'ok',
                  'RF4.2 saving the selection the page read back succeeds');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_talent_items i JOIN public.sp_claims c ON c.id = i.claim_id
                               WHERE i.holder_user_id = (SELECT c1 FROM f) AND c.lifecycle_state NOT IN ('active', 'expired')),
                  'RF4.3 no superseded entry is ever selected');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF5 — declined, then the same answer with block'; END $$;
INSERT INTO public.rec_talent_contact_requests (id, job_id, employer_id, sender_user_id, holder_user_id, search_ref, message,
                                                idempotency_key, status, snapshot, snapshot_at)
SELECT 'a7180000-8888-4000-8000-000000000001'::uuid, j1, e1, o, c2, pg_temp.ref(c2), 'Hej! Vi söker en ordningsvakt i Stockholm.',
       gen_random_uuid(), 'pending', '{"merits":[]}'::jsonb, now() FROM f UNION ALL
SELECT 'a7180000-8888-4000-8000-000000000002'::uuid, 'a7180000-2222-4000-8000-000000000004'::uuid, e1, o, c2, pg_temp.ref(c2),
       'Hej! Vi söker också en nattväktare i Stockholm.', gen_random_uuid(), 'pending', '{"merits":[]}'::jsonb, now() FROM f;
SELECT pg_temp.ok(pg_temp.try_as((SELECT c2::text FROM f), 'SELECT public.sp_talent_respond_contact(''a7180000-8888-4000-8000-000000000001'', false, false)') = 'ok'
                  AND pg_temp.try_as((SELECT c2::text FROM f), 'SELECT public.sp_talent_respond_contact(''a7180000-8888-4000-8000-000000000001'', false, true)') = 'ok',
                  'RF5.1 declined, then the same answer again with block');
SELECT pg_temp.ok((SELECT status = 'declined' AND snapshot IS NULL AND blocked_employer FROM public.rec_talent_contact_requests
                    WHERE id = 'a7180000-8888-4000-8000-000000000002')
                  AND (SELECT blocked_employer FROM public.rec_talent_contact_requests WHERE id = 'a7180000-8888-4000-8000-000000000001'),
                  'RF5.2 the other open request is declined with it, its snapshot cleared, both marked blocked');
SELECT pg_temp.ok(NOT (pg_temp.j_as((SELECT o::text FROM f), 'SELECT public.rec_talent_contacts(''a7180000-2222-4000-8000-000000000004'')')
                    @> '[{"currentlyDiscoverable":true}]'),
                  'RF5.3 the organisation no longer reads the person as discoverable');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF6 — validity'; END $$;
UPDATE public.sp_claims SET valid_from = current_date + 100 WHERE id = (SELECT c1_cpp FROM cl);
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_preview()')#>'{card,merits}'
                    @> '[{"code":"INTL_ASIS_CPP","validity":"not_yet_valid"}]',
                  'RF6.1 a merit that starts in 100 days is not yet valid');
CREATE TEMP TABLE rf6 AS SELECT x->'evaluation' AS e FROM jsonb_array_elements(
  pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f)))->'results') x
 WHERE x->>'ref' = pg_temp.ref((SELECT c1 FROM f))::text;
SELECT pg_temp.ok((SELECT c->>'state' = 'needs_clarification' AND c->'reasons' ? 'not_yet_valid'
                     FROM rf6, jsonb_array_elements(e->'criteria') c WHERE c->>'requirementId' = 'a7180000-5555-4000-8000-000000000003'),
                  'RF6.2 the search says so instead of "evidenced"');
CREATE OR REPLACE FUNCTION pg_temp.eval_expired(_must boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.rec_talent_evaluate(
    '{"visibility":"open","preferences":{},"experience":[],"totalSecurityMonths":0,
      "merits":[{"code":"OV","requirementClass":"regulated_authorisation","jurisdiction":"SE","validity":"expired","level":"document_reviewed","hasScopeLimitation":false}]}'::jsonb,
    jsonb_build_array(jsonb_build_object('requirementId', 'a7180000-5555-4000-8000-000000000001', 'kind', 'mandatory',
      'requirementClass', 'regulated_authorisation', 'credentialCodes', '[{"code":"OV"}]'::jsonb, 'jurisdiction', 'SE',
      'mustBeValid', _must, 'minLevel', 'any')),
    (SELECT j FROM public.jobs j WHERE j.id = (SELECT j1 FROM f)))->'criteria'->0;
$$;
SELECT pg_temp.ok(pg_temp.eval_expired(false)->>'state' = 'evidenced' AND pg_temp.eval_expired(false)->'reasons' ? 'expired',
                  'RF6.3 an expired merit is evidence with a note when validity was not asked for');
SELECT pg_temp.ok(pg_temp.eval_expired(true)->>'state' = 'needs_clarification',
                  'RF6.4 and needs clarifying when it was');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP RF7 — criteria are bound to the profile version the user saw'; END $$;
CREATE TEMP TABLE rf7 AS SELECT
  (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT j1 FROM f) AND version = 1) AS seen,
  (SELECT version FROM public.rec_requirement_criteria_sets WHERE job_id = (SELECT j1 FROM f) ORDER BY version DESC LIMIT 1) AS cv;
GRANT SELECT ON rf7 TO PUBLIC;
-- Another session confirms profile version 2 meanwhile.
INSERT INTO public.rec_requirement_profiles (job_id, employer_id, version, rules, confirmed_by)
SELECT j1, e1, 2, (SELECT rules FROM public.rec_requirement_profiles WHERE job_id = f.j1 AND version = 1), o FROM f;
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, %s, %L, %L::jsonb)',
                    (SELECT j1 FROM f), (SELECT cv FROM rf7), (SELECT seen FROM rf7), (SELECT j FROM crit))) = 'err:TALENT_CRITERIA_STALE',
                  'RF7.1 the form opened on version 1 cannot confirm criteria onto version 2');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, %s, %L, %L::jsonb)',
                    (SELECT j1 FROM f), (SELECT cv FROM rf7),
                    (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT j1 FROM f) AND version = 2), (SELECT j FROM crit))) = 'ok',
                  'RF7.2 after reading version 2 it can');

ROLLBACK;
