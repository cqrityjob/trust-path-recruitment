-- 20270318090000: find voluntarily discoverable people for a published job,
-- explain why, and ask them to get in touch.
--
--   TS-F  fixture: organisation E1 (owner O, responsible recruiter R, plain
--         member M), organisation E2 (owner O2), pending organisation E3
--         (owner O3); published job J1 with a confirmed profile, draft job J2;
--         candidates C1 open, C2 active, C3 open (international only),
--         C4 private, C5 open but blocking E1; verifier V.
--   TS1   who may search: owner and responsible recruiter; never a plain
--         member, another organisation, a pending organisation, a draft job
--         or an outsider -- and all of those read the same refusal.
--   TS2   catalogue-bound criteria: classes cannot be mixed; unknown codes,
--         plain members and stale pages are refused; versioned and immutable.
--   TS3   results: only visible profiles, deterministic documented order.
--   TS4   explanations per requirement; "not shared" is not "missing"; an
--         international certification is not a local authorisation; no
--         score, verdict or ranking number.
--   TS5   privacy: no names, addresses, numbers, notes, user ids.
--   TS6   filters on the factual requirements.
--   TS7   a direct profile read of a private, blocked or unknown reference
--         reads "not_available"; counts never include private people.
--   TS8   contact: idempotent, one open per job and person, notices, the
--         person sees company, job and message, accepting reveals the name
--         only; double click is harmless.
--   TS9   decline and stop contact from the organisation.
--   TS10  mass-contact limits.
--   TS11  pause: old references stop resolving at once.
--   TS12  currency: revocation, expiry and changed criteria show on the next read.
--   TS13  the person's application is linked to the accepted contact;
--         hiring creates no talent access.
--   TS14  removed permission: refused at once; queued mail is skipped.
--   TS15  grants.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
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

DO $$ BEGIN RAISE NOTICE 'GROUP TS2 — catalogue-bound criteria'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j1 FROM f),
                    '[{"requirementId":"a7180000-5555-4000-8000-000000000001","credentialCodes":["OV","INTL_ASIS_CPP"]}]')) = 'err:TALENT_CRITERIA_MIXED_CLASSES',
                  'TS2.1 a regulated authorisation and an international certification cannot satisfy one requirement');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j1 FROM f),
                    '[{"requirementId":"a7180000-5555-4000-8000-000000000001","credentialCodes":["NOT_A_CODE"]}]')) = 'err:TALENT_CRITERIA_UNKNOWN_CREDENTIAL',
                  'TS2.2 only published catalogue definitions');
SELECT pg_temp.ok(pg_temp.try_as((SELECT m::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j1 FROM f), (SELECT j FROM crit)))
                    = 'err:TALENT_SEARCH_NOT_AVAILABLE', 'TS2.3 a plain member cannot set criteria');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j1 FROM f), (SELECT j FROM crit))) = 'ok',
                  'TS2.4 the owner confirms the criteria');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j1 FROM f), (SELECT j FROM crit)))
                    = 'err:TALENT_CRITERIA_STALE', 'TS2.5 a second confirm from the same old page is refused');
SELECT pg_temp.ok((SELECT criteria FROM public.rec_requirement_criteria_sets WHERE job_id = (SELECT j1 FROM f))
                    @> '[{"requirementClass":"regulated_authorisation","jurisdiction":"SE","mustBeValid":true},{"requirementClass":"education"},{"requirementClass":"certification","minLevel":"document_reviewed"},{"requirementClass":"experience","experienceMonths":24},{"requirementClass":"unbound"}]',
                  'TS2.6 each requirement carries its class, jurisdiction, validity rule and level');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), 'UPDATE public.rec_requirement_criteria_sets SET version = 9') LIKE 'err:permission denied%',
                  'TS2.7 a confirmed set cannot be edited directly');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o2::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 0, %L::jsonb)', (SELECT j_e2 FROM f),
                    '[{"requirementId":"a7180000-5555-4000-8000-000000000009","credentialCodes":["OV"]}]')) = 'ok',
                  'TS2.8 the second organisation confirms its own job');

DO $$ BEGIN RAISE NOTICE 'GROUP TS1 — who may search'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'ok'
                  AND pg_temp.try_as((SELECT r::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'ok',
                  'TS1.1 the owner and the responsible recruiter may search');
SELECT pg_temp.ok(pg_temp.try_as((SELECT m::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS1.2 a plain member may not: membership is not a recruiting right');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o2::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE'
                  AND pg_temp.try_as((SELECT outsider::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS1.3 another organisation and an outsider read the same refusal');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j2 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE'
                  AND pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', gen_random_uuid())) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS1.4 a draft job and a non-existent job read the same refusal');
SELECT set_config('app.employer_moderation_in_progress', 'on', true);
UPDATE public.employers SET status = 'suspended' WHERE id = (SELECT e2 FROM f);
SELECT set_config('app.employer_moderation_in_progress', '', true);
SELECT pg_temp.ok(pg_temp.try_as((SELECT o2::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j_e2 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS1.5 a suspended organisation cannot search');
SELECT set_config('app.employer_moderation_in_progress', 'on', true);
UPDATE public.employers SET status = 'active' WHERE id = (SELECT e2 FROM f);
SELECT set_config('app.employer_moderation_in_progress', '', true);
SELECT pg_temp.ok((pg_temp.j_as((SELECT m::text FROM f), format('SELECT public.rec_talent_access(%L)', (SELECT j1 FROM f)))->>'maySearch') = 'false'
                  AND (pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_access(%L)', (SELECT j1 FROM f)))->>'maySearch') = 'true',
                  'TS1.6 the UI is told whether to offer "Find candidates", never why not');

DO $$ BEGIN RAISE NOTICE 'GROUP TS3 — results and order'; END $$;
CREATE TEMP TABLE s1 AS SELECT pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) AS j;
GRANT SELECT ON s1 TO PUBLIC;
SELECT pg_temp.ok((SELECT j->>'status' FROM s1) = 'ok' AND (SELECT (j->>'total')::int FROM s1) = 3, 'TS3.1 three visible, relevant people');
SELECT pg_temp.ok((SELECT array_agg(x->>'ref' ORDER BY (x->>'position')::int) FROM jsonb_array_elements((SELECT j->'results' FROM s1)) x)
                    = ARRAY[pg_temp.ref((SELECT c1 FROM f))::text, pg_temp.ref((SELECT c2 FROM f))::text, pg_temp.ref((SELECT c3 FROM f))::text],
                  'TS3.2 order: mandatory evidenced (C1 2, C2 1, C3 0)');
SELECT pg_temp.ok(NOT ((SELECT j::text FROM s1) LIKE '%' || pg_temp.ref((SELECT c4 FROM f)) || '%')
                  AND NOT ((SELECT j::text FROM s1) LIKE '%' || pg_temp.ref((SELECT c5 FROM f)) || '%'),
                  'TS3.3 the private person and the person blocking this organisation are absent');
SELECT pg_temp.ok((SELECT j->'ordering' FROM s1) = '["mandatoryEvidenced","mandatoryReviewed","desirableEvidenced","preferencesMet","reference"]',
                  'TS3.4 the order is stated with the result');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f)))->'results'
                    = (SELECT j->'results' FROM s1), 'TS3.5 deterministic: the same search gives the same result');

DO $$ BEGIN RAISE NOTICE 'GROUP TS4 — explanations'; END $$;
CREATE TEMP TABLE ev AS SELECT x->>'ref' AS ref, x->'evaluation' AS e FROM jsonb_array_elements((SELECT j->'results' FROM s1)) x;
GRANT SELECT ON ev TO PUBLIC;
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c1 FROM f))::text)
                    @> '{"criteria":[{"requirementClass":"regulated_authorisation","state":"evidenced","evidence":{"code":"OV","abbreviation":"OV","level":"document_reviewed","validity":"valid","jurisdiction":"SE"}}]}',
                  'TS4.1 C1: the appointment is evidenced -- full name, abbreviation, level, validity, jurisdiction');
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c1 FROM f))::text)
                    @> '{"criteria":[{"requirementClass":"certification","state":"needs_clarification","reasons":["level_below_requested","self_declared"]}]}',
                  'TS4.2 C1: CPP is shared but only self-declared where review was asked for');
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c1 FROM f))::text)
                    @> '{"criteria":[{"requirementClass":"experience","state":"evidenced","reasons":["experience_declared"]},{"requirementClass":"unbound","state":"to_clarify"}]}',
                  'TS4.3 C1: experience is declared and enough; the driving licence is to clarify');
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c1 FROM f))::text)
                    @> '{"preferences":{"area":"match","location":"match","employmentType":"match"}}',
                  'TS4.4 C1: stated job preferences match');
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c2 FROM f))::text)
                    @> '{"criteria":[{"requirementClass":"regulated_authorisation","state":"needs_clarification","reasons":["expired"]}],"summary":{"expiredMandatory":true}}',
                  'TS4.5 C2: an expired appointment is shown as expired, not as missing');
SELECT pg_temp.ok((SELECT e FROM ev WHERE ref = pg_temp.ref((SELECT c3 FROM f))::text)
                    @> '{"criteria":[{"requirementClass":"regulated_authorisation","state":"not_shared","reasons":["international_certification_is_not_authorisation"]}]}',
                  'TS4.6 C3: international certifications are never read as the local authorisation');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM ev, jsonb_array_elements(e->'criteria') c WHERE c->>'state' NOT IN ('evidenced','needs_clarification','not_shared','to_clarify')),
                  'TS4.7 the only states are evidenced, needs clarification, not shared, to clarify -- never "missing"');
SELECT pg_temp.ok(NOT ((SELECT j::text FROM s1) ~* '"(score|percent|match_score|suitab|verdict|recommend|reject)'),
                  'TS4.8 no score, percentage, verdict, recommendation or rejection in the payload');

DO $$ BEGIN RAISE NOTICE 'GROUP TS5 — privacy of the result'; END $$;
SELECT pg_temp.ok(NOT ((SELECT j::text FROM s1) LIKE '%Cecilia%' OR (SELECT j::text FROM s1) LIKE '%@synthetic.invalid%'
                       OR (SELECT j::text FROM s1) LIKE '%OV-998877%' OR (SELECT j::text FROM s1) LIKE '%Nuvarande Arbetsgivare%'
                       OR (SELECT j::text FROM s1) LIKE '%' || (SELECT c1 FROM f) || '%'),
                  'TS5.1 no name, address, licence number, employer name or user id');

DO $$ BEGIN RAISE NOTICE 'GROUP TS6 — filters'; END $$;
SELECT pg_temp.ok((pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L, ''{"allMandatory":true}'')', (SELECT j1 FROM f)))->>'total')::int = 1,
                  'TS6.1 all mandatory evidenced: C1 only');
SELECT pg_temp.ok((pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L, ''{"activeOnly":true}'')', (SELECT j1 FROM f)))->'results'->0->>'ref')
                    = pg_temp.ref((SELECT c2 FROM f))::text, 'TS6.2 actively looking: C2 only');
SELECT pg_temp.ok((pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L, ''{"validOnly":true}'')', (SELECT j1 FROM f)))->>'total')::int = 2,
                  'TS6.3 valid only: the expired mandatory merit is filtered');
SELECT pg_temp.ok((pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L, ''{"preferencesMatch":true}'')', (SELECT j1 FROM f)))->>'total')::int = 1,
                  'TS6.4 job preferences met: C1 only');

DO $$ BEGIN RAISE NOTICE 'GROUP TS7 — direct reads of what is not visible'; END $$;
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c4 FROM f))))
                    = '{"status":"not_available"}'
                  AND pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c5 FROM f))))
                    = '{"status":"not_available"}'
                  AND pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), gen_random_uuid()))
                    = '{"status":"not_available"}',
                  'TS7.1 private, blocking and unknown references all read the same');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c1 FROM f))))
                    @> '{"status":"ok","card":{"visibility":"open"}}', 'TS7.2 a visible person''s profile reads, live');
SELECT pg_temp.ok(pg_temp.try_as((SELECT m::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c1 FROM f))))
                    = 'err:TALENT_SEARCH_NOT_AVAILABLE', 'TS7.3 a plain member cannot read a profile by reference');
SELECT pg_temp.ok((pg_temp.j_as((SELECT o2::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j_e2 FROM f)))->>'total')::int = 3,
                  'TS7.4 the other organisation finds C1, C2 and C5 (C5 blocked only E1); never the private C4');

DO $$ BEGIN RAISE NOTICE 'GROUP TS8 — contact'; END $$;
CREATE TEMP TABLE k AS SELECT 'a7180000-6666-4000-8000-000000000001'::uuid AS key1, 'a7180000-6666-4000-8000-000000000002'::uuid AS key2;
GRANT SELECT ON k TO PUBLIC;
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, %L)', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c1 FROM f)), 'Hej!', (SELECT key1 FROM k))) = 'err:TALENT_CONTACT_INVALID', 'TS8.1 a message must say something');
CREATE TEMP TABLE sent AS SELECT pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, %L)', (SELECT j1 FROM f),
  pg_temp.ref((SELECT c1 FROM f)), 'Hej! Vi söker en ordningsvakt i Stockholm och din profil matchar våra krav.', (SELECT key1 FROM k))) AS j;
GRANT SELECT ON sent TO PUBLIC;
SELECT pg_temp.ok((SELECT j->>'status' FROM sent) = 'sent', 'TS8.2 the responsible recruiter sends a contact request tied to the job');
SELECT pg_temp.ok(pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, %L)', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c1 FROM f)), 'Hej! Vi söker en ordningsvakt i Stockholm och din profil matchar våra krav.', (SELECT key1 FROM k)))
                    @> jsonb_build_object('status', 'already_sent', 'id', (SELECT j->>'id' FROM sent)),
                  'TS8.3 a retry (double click, lost response) returns the same request');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, %L)', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c1 FROM f)), 'Ett annat meddelande från en kollega om samma tjänst.', (SELECT key2 FROM k)))->>'status' = 'already_contacted'
                  AND (SELECT count(*) FROM public.rec_talent_contact_requests WHERE holder_user_id = (SELECT c1 FROM f)) = 1,
                  'TS8.4 a colleague cannot send a second request for the same job');
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT c1 FROM f) AND kind = 'talent_contact_received') = 1,
                  'TS8.5 the person is notified once');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_my_contacts()')
                    @> '[{"status":"pending","employer":{"name":"TS Bevakning AB"},"job":{"titleSv":"Ordningsvakt Stockholm","open":true,"acceptsApplications":true}}]'
                  AND pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_my_contacts()')::text LIKE '%din profil matchar%',
                  'TS8.6 the person sees company, job, message and that the job is open');
SELECT pg_temp.ok(pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_contacts(%L)', (SELECT j1 FROM f)))
                    @> '[{"status":"pending","name":null}]', 'TS8.7 before an answer the organisation does not get the name');
SELECT pg_temp.ok(pg_temp.try_as((SELECT m::text FROM f), format('SELECT public.rec_talent_contacts(%L)', (SELECT j1 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS8.8 a plain member cannot read the contact list');
SELECT pg_temp.ok(pg_temp.try_as((SELECT c2::text FROM f), format('SELECT public.sp_talent_respond_contact(%L, true)', (SELECT j->>'id' FROM sent)))
                    = 'err:TALENT_CONTACT_NOT_FOUND', 'TS8.9 nobody else can answer the request');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), format('SELECT public.sp_talent_respond_contact(%L, true)', (SELECT j->>'id' FROM sent)))
                    @> '{"status":"accepted","repeat":false}', 'TS8.10 the person accepts');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), format('SELECT public.sp_talent_respond_contact(%L, true)', (SELECT j->>'id' FROM sent)))
                    @> '{"status":"accepted","repeat":true}'
                  AND pg_temp.try_as((SELECT c1::text FROM f), format('SELECT public.sp_talent_respond_contact(%L, false)', (SELECT j->>'id' FROM sent)))
                    = 'err:TALENT_CONTACT_ALREADY_ANSWERED',
                  'TS8.11 a double click on accept is a repeat; changing the answer later is refused');
SELECT pg_temp.ok(pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_contacts(%L)', (SELECT j1 FROM f)))
                    @> '[{"status":"accepted","name":"Cecilia Syntetisk","applicationId":null}]'
                  AND NOT (pg_temp.j_as((SELECT r::text FROM f), format('SELECT public.rec_talent_contacts(%L)', (SELECT j1 FROM f)))::text LIKE '%ts-c1@%'),
                  'TS8.12 accepting shares the name, not the address; no application is created');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.job_applications WHERE applicant_user_id = (SELECT c1 FROM f))
                  AND NOT EXISTS (SELECT 1 FROM public.sp_disclosures WHERE holder_user_id = (SELECT c1 FROM f)),
                  'TS8.13 no application and no Passport disclosure without the person''s own act');
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT r FROM f) AND kind = 'talent_contact_accepted') = 1,
                  'TS8.14 the sender is told once');

DO $$ BEGIN RAISE NOTICE 'GROUP TS9 — decline and stop contact'; END $$;
CREATE TEMP TABLE sent2 AS SELECT pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, gen_random_uuid())', (SELECT j1 FROM f),
  pg_temp.ref((SELECT c2 FROM f)), 'Hej! Vi söker en ordningsvakt i Stockholm, är du intresserad av att höras?')) AS j;
GRANT SELECT ON sent2 TO PUBLIC;
SELECT pg_temp.ok(pg_temp.j_as((SELECT c2::text FROM f), format('SELECT public.sp_talent_respond_contact(%L, false, true)', (SELECT j->>'id' FROM sent2)))
                    @> '{"status":"declined"}', 'TS9.1 C2 declines and stops contact from the organisation');
SELECT pg_temp.ok((SELECT snapshot IS NULL FROM public.rec_talent_contact_requests WHERE id = (SELECT (j->>'id')::uuid FROM sent2)),
                  'TS9.2 the organisation''s snapshot is cleared on decline');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c2 FROM f))))
                    = '{"status":"not_available"}'
                  AND (pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f)))->>'total')::int = 2,
                  'TS9.3 the organisation no longer finds C2');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, gen_random_uuid())', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c2 FROM f)), 'Ett nytt försök att nå samma person igen.')) = 'err:TALENT_PROFILE_NOT_AVAILABLE',
                  'TS9.4 and cannot contact C2 again');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c2::text FROM f), 'SELECT public.sp_talent_get_settings()') @> '{"blockedEmployers":[{"name":"TS Bevakning AB"}]}',
                  'TS9.5 C2 sees whom they stopped, and can undo it');

DO $$ BEGIN RAISE NOTICE 'GROUP TS10 — mass contact'; END $$;
INSERT INTO public.rec_talent_contact_requests (job_id, employer_id, sender_user_id, holder_user_id, search_ref, message, idempotency_key, status)
SELECT j1, e1, o, c4, gen_random_uuid(), 'Syntetiskt utskick nummer ' || g || ' för gränsprov.', gen_random_uuid(), 'withdrawn'
  FROM f, generate_series(1, 20) g;
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, gen_random_uuid())', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c3 FROM f)), 'Hej! Vi söker en ordningsvakt i Stockholm och vill gärna höras.')) = 'err:TALENT_CONTACT_LIMIT_REACHED',
                  'TS10.1 20 requests per sender and day');
SELECT pg_temp.ok(pg_temp.try_as((SELECT r::text FROM f), format('SELECT public.rec_talent_send_contact(%L, %L, %L, gen_random_uuid())', (SELECT j1 FROM f),
                    pg_temp.ref((SELECT c3 FROM f)), 'Hej! Vi söker en ordningsvakt i Stockholm och vill gärna höras.')) = 'ok',
                  'TS10.2 a colleague under the limit can still send');
DELETE FROM public.rec_talent_contact_requests WHERE holder_user_id = (SELECT c4 FROM f);

DO $$ BEGIN RAISE NOTICE 'GROUP TS11 — pause'; END $$;
CREATE TEMP TABLE oldref AS SELECT pg_temp.ref((SELECT c3 FROM f)) AS ref;
GRANT SELECT ON oldref TO PUBLIC;
SELECT pg_temp.j_as((SELECT c3::text FROM f), 'SELECT public.sp_talent_pause()');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), (SELECT ref FROM oldref)))
                    = '{"status":"not_available"}', 'TS11.1 the old reference stops resolving at once');
SELECT pg_temp.ok((pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f)))->>'total')::int = 1,
                  'TS11.2 the next search no longer counts the paused person');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c3::text FROM f), 'SELECT public.sp_talent_my_contacts()') @> '[{"status":"pending"}]',
                  'TS11.3 a pending request stays the person''s to answer');

DO $$ BEGIN RAISE NOTICE 'GROUP TS12 — the next read is current'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format('SELECT public.sp_verifier_revoke(%L, NULL, ''Förordnandet återkallat'')', (SELECT c1_ov FROM cl))) = 'ok',
                  'TS12.1 the verifier revokes C1''s appointment review');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c1 FROM f))))
                    @> '{"evaluation":{"criteria":[{"requirementClass":"regulated_authorisation","state":"not_shared"}]}}',
                  'TS12.2 the next read no longer shows the revoked appointment');
SELECT pg_temp.ok((SELECT snapshot @> '{"evaluation":{"criteria":[{"requirementClass":"regulated_authorisation","state":"evidenced"}]}}' AND snapshot_at IS NOT NULL
                     FROM public.rec_talent_contact_requests WHERE id = (SELECT (j->>'id')::uuid FROM sent)),
                  'TS12.3 the organisation''s dated snapshot keeps what it saw when it wrote, separately');
SELECT pg_temp.try_as((SELECT c1::text FROM f), format(
  'SELECT public.sp_correct_claim(%L, c.title, c.claimed_issuer_name, c.jurisdiction_code, c.issued_on, c.valid_from, %L::date, ''Rättat'', c.credential_code, c.credential_reference, c.holder_note) FROM public.sp_claims c WHERE c.id = %L',
  (SELECT c1_cpp FROM cl), current_date - 1, (SELECT c1_cpp FROM cl)));
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f), pg_temp.ref((SELECT c1 FROM f))))
                    @> '{"evaluation":{"criteria":[{"requirementClass":"certification","reasons":["expired"]}]}}',
                  'TS12.4 a changed validity date shows as expired on the next read');
-- A changed profile requires the criteria to be confirmed again before searching.
INSERT INTO public.rec_requirement_profiles (job_id, employer_id, version, rules, confirmed_by)
SELECT job_id, employer_id, 2, rules, confirmed_by FROM public.rec_requirement_profiles WHERE job_id = (SELECT j1 FROM f) AND version = 1;
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = '{"status":"criteria_required"}'
                  AND pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_get_criteria(%L)', (SELECT j1 FROM f))) @> '{"criteria":{"current":false}}',
                  'TS12.5 after a profile change the old criteria are not used');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), format('SELECT public.rec_talent_confirm_criteria(%L, 1, %L::jsonb)', (SELECT j1 FROM f), (SELECT j FROM crit))) = 'ok'
                  AND (pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f)))->>'status') = 'ok',
                  'TS12.6 confirming them again restores search');

DO $$ BEGIN RAISE NOTICE 'GROUP TS13 — application and hiring'; END $$;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'a7180000-7777-4000-8000-000000000001', j1, e1, c1, 'submitted', now() FROM f;
SELECT pg_temp.ok((SELECT application_id FROM public.rec_talent_contact_requests WHERE id = (SELECT (j->>'id')::uuid FROM sent)) = 'a7180000-7777-4000-8000-000000000001',
                  'TS13.1 the person''s own application is linked to the accepted contact');
SELECT pg_temp.ok(pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_my_contacts()') @> '[{"applicationId":"a7180000-7777-4000-8000-000000000001"}]',
                  'TS13.2 the person sees that they applied');
CREATE TEMP TABLE before_hire AS SELECT (SELECT count(*) FROM public.sp_talent_items) items, (SELECT count(*) FROM public.sp_talent_profiles) profiles,
  (SELECT count(*) FROM public.sp_disclosures) disclosures;
SELECT pg_temp.try_as((SELECT o::text FROM f), 'SELECT public.set_application_status(''a7180000-7777-4000-8000-000000000001'', ''reviewing'', NULL)');
SELECT pg_temp.try_as((SELECT o::text FROM f), 'SELECT public.set_application_status(''a7180000-7777-4000-8000-000000000001'', ''interview'', NULL)');
SELECT pg_temp.ok(pg_temp.try_as((SELECT o::text FROM f), 'SELECT public.set_application_status(''a7180000-7777-4000-8000-000000000001'', ''hired'', NULL)') = 'ok',
                  'TS13.3a the organisation hires the person in the existing workflow');
SELECT pg_temp.ok((SELECT status FROM public.job_applications WHERE id = 'a7180000-7777-4000-8000-000000000001') = 'hired',
                  'TS13.3b the application is hired');
SELECT pg_temp.ok((SELECT items FROM before_hire) = (SELECT count(*) FROM public.sp_talent_items)
                  AND (SELECT disclosures FROM before_hire) = (SELECT count(*) FROM public.sp_disclosures),
                  'TS13.3 hiring creates no Passport access of any kind');
SELECT pg_temp.j_as((SELECT c1::text FROM f), 'SELECT public.sp_talent_pause()');
SELECT pg_temp.ok(pg_temp.j_as((SELECT o::text FROM f), format('SELECT public.rec_talent_profile(%L, %L)', (SELECT j1 FROM f),
                    (SELECT search_ref FROM public.rec_talent_contact_requests WHERE id = (SELECT (j->>'id')::uuid FROM sent))))
                    = '{"status":"not_available"}', 'TS13.4 after hiring and pausing, the employer cannot read the live profile');

DO $$ BEGIN RAISE NOTICE 'GROUP TS14 — removed permission'; END $$;
UPDATE public.recruitment_settings SET responsible_user_id = NULL WHERE job_id = (SELECT j1 FROM f);
SELECT pg_temp.ok(pg_temp.try_as((SELECT r::text FROM f), format('SELECT public.rec_talent_search(%L)', (SELECT j1 FROM f))) = 'err:TALENT_SEARCH_NOT_AVAILABLE',
                  'TS14.1 a recruiter who is no longer responsible is refused at once');
UPDATE public.user_notices SET email_status = 'pending' WHERE recipient_user_id = (SELECT r FROM f);
SET LOCAL ROLE service_role;
SELECT public.user_notices_claim_emails(50);
RESET ROLE;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.user_notices WHERE recipient_user_id = (SELECT r FROM f) AND email_status <> 'skipped'),
                  'TS14.2 their queued mail is skipped at claim time');

DO $$ BEGIN RAISE NOTICE 'GROUP TS15 — grants'; END $$;
SELECT pg_temp.ok(NOT has_table_privilege('authenticated', 'public.rec_talent_contact_requests', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.rec_talent_search_log', 'SELECT')
                  AND NOT has_function_privilege('anon', 'public.rec_talent_search(uuid,jsonb)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.rec_talent_evaluate(jsonb,jsonb,public.jobs)', 'EXECUTE'),
                  'TS15.1 no direct table read, no anon, no internal evaluator');

ROLLBACK;
