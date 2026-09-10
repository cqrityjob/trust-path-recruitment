-- The employer final report: a provable, deterministic basis; preview that
-- equals finalisation; every assessor; and a governed readback.
--
-- The product question: when a recruitment owner finalises a report and later
-- points at it to justify a decision, can anyone check that what they are
-- looking at is what was finalised -- and what was previewed -- and can a
-- reader tell a candidate statement from an interviewer's observation from a
-- human's interpretation, see every assessor rather than whichever row sorted
-- first, and see the assessment result the process actually ran on?
--
-- One employer, one candidate, one advertised job, one application, one case,
-- walked through the governed RPCs exactly as the product walks it. A second
-- assessor on the same question. A Passport disclosure carrying one
-- self-declared and one verified claim. A released employer assessment
-- document on the application. A second employer with no relationship to any
-- of it. The candidate has a login and no seat.
--
-- Superuser plumbing is used for exactly three things this suite is not
-- testing and the governed RPCs cannot produce on their own: a second
-- assessor's row, evidence linked to a Passport passage (the RPC takes a note
-- link, not a passage link), and a released assessment snapshot. Each is
-- marked where it happens.
--
-- Deterministic. No AI provider, no network. Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.become(_u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- Preview, then finalise exactly that: the product's own two steps.
CREATE OR REPLACE FUNCTION pg_temp.finalise(_case uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT public.scp_iv_finalise_report(_case,
           (SELECT basis_hash FROM public.scp_iv_preview_report(_case)));
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('8a000000-0000-4000-8000-0000000000a1', 'bi-owner-a@test.local'),
  ('8a000000-0000-4000-8000-0000000000a2', 'bi-member-a@test.local'),
  ('8a000000-0000-4000-8000-0000000000b1', 'bi-owner-b@test.local'),
  ('8a000000-0000-4000-8000-0000000000c1', 'bi-candidate@test.local')
ON CONFLICT (id) DO NOTHING;

-- The owner has a display name; the member deliberately has none, so the
-- readback's fallback to the account address is exercised rather than assumed.
-- An UPSERT: a profile row may already exist for the account, created by the
-- sign-up trigger, and a DO NOTHING would silently leave its name empty.
INSERT INTO public.profiles (id, display_name) VALUES
  ('8a000000-0000-4000-8000-0000000000a1', 'Ansvarig Rekryterare A')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('8b000000-0000-4000-8000-0000000000a1', 'BI Tenant A AB', 'bi-tenant-a-ab', 'active'),
  ('8b000000-0000-4000-8000-0000000000b1', 'BI Tenant B AB', 'bi-tenant-b-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('8a000000-0000-4000-8000-0000000000a1','8b000000-0000-4000-8000-0000000000a1','owner','active'),
  ('8a000000-0000-4000-8000-0000000000a2','8b000000-0000-4000-8000-0000000000a1','member','active'),
  ('8a000000-0000-4000-8000-0000000000b1','8b000000-0000-4000-8000-0000000000b1','owner','active')
ON CONFLICT DO NOTHING;

ALTER TABLE public.jobs DISABLE TRIGGER USER;
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, published_at, expires_at)
VALUES
  ('8c000000-0000-4000-8000-000000000001','8b000000-0000-4000-8000-0000000000a1',
   'bi-job-1','bijob00001','Väktare Väst','Guard West','published','internal',
   now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.jobs ENABLE TRIGGER USER;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES
  ('8d000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001',
   '8b000000-0000-4000-8000-0000000000a1','8a000000-0000-4000-8000-0000000000c1', now())
ON CONFLICT (id) DO NOTHING;

-- ---- The assessment the process ran on: a released employer document ----
-- Superuser plumbing (precedent: admin_lifecycle_test.sql). The assessment
-- release path has its own suites; what is under test here is that the
-- interview report binds to the exact released document through the
-- assessment domain's governed projection.
INSERT INTO public.scp_subjects (id) VALUES ('8e000000-0000-4000-8000-000000000001');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('8e000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-0000000000c1');

WITH fx AS (
  SELECT av.id AS av_id, f.id AS form_id
    FROM public.scp_assessment_versions av
    JOIN public.scp_forms f ON f.assessment_version_id = av.id
   WHERE av.content_status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM public.scp_form_items fi
         JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
        WHERE fi.form_id = f.id AND iv.mode IS DISTINCT FROM 'assessment')
     AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id = f.id)
   ORDER BY f.id LIMIT 1)
SELECT av_id AS bi_avid, form_id AS bi_fid FROM fx \gset

INSERT INTO public.assessment_assignments
  (id, employer_id, use_case, recipient_email, recipient_user_id, assigned_by,
   invitation_token_hash, expires_at, scp_assessment_version_id, status)
VALUES ('8f000000-0000-4000-8000-000000000001','8b000000-0000-4000-8000-0000000000a1','workforce',
        'bi-candidate@test.local','8a000000-0000-4000-8000-0000000000c1',
        '8a000000-0000-4000-8000-0000000000a1','hash-bi-1', now() + interval '30 days',
        :'bi_avid'::uuid,'started');
UPDATE public.assessment_assignments
   SET use_case = 'recruitment',
       application_id = '8d000000-0000-4000-8000-000000000001',
       job_id = '8c000000-0000-4000-8000-000000000001'
 WHERE id = '8f000000-0000-4000-8000-000000000001';

-- Two attempts on the application: one released (with an employer document),
-- one merely submitted (no document yet). The report must name both and
-- carry a result for exactly one.
INSERT INTO public.scp_attempts
  (id, subject_id, issuer_organization_id, assignment_id, mode, form_id,
   assessment_version_id, status, submitted_at)
VALUES
  ('90000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000001',
   '8b000000-0000-4000-8000-0000000000a1','8f000000-0000-4000-8000-000000000001',
   'assessment', :'bi_fid'::uuid, :'bi_avid'::uuid, 'submitted', now()),
  ('90000000-0000-4000-8000-000000000002','8e000000-0000-4000-8000-000000000001',
   '8b000000-0000-4000-8000-0000000000a1','8f000000-0000-4000-8000-000000000001',
   'assessment', :'bi_fid'::uuid, :'bi_avid'::uuid, 'submitted', now());

INSERT INTO public.scp_report_snapshots
  (id, attempt_id, subject_id, issuer_organization_id, report_version_id, audience,
   payload, brief, context, safety_flags)
SELECT '91000000-0000-4000-8000-000000000001',
       '90000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000001',
       '8b000000-0000-4000-8000-0000000000a1', rv.id, 'employer',
       '[{"competency_code":"SAK-01","maturity_level":"developing","threshold_version":"v1"}]'::jsonb,
       '{"observed":[{"area":"SAK-01","signal":"developing","mean":0.42,"spread":0.1}],"executive_summary":{"sv":"Fixtur."}}'::jsonb,
       '{"personContext":"candidate"}'::jsonb,
       '[{"finding":"Fixturfynd.","severity":"note","observed_at":"2026-09-01T00:00:00Z","behaviour_version_id":"internal"}]'::jsonb
  FROM public.scp_report_versions rv WHERE rv.audience = 'employer'
 ORDER BY rv.report_key, rv.version_number LIMIT 1;

-- ---- The Passport disclosure: one self-declared claim, one verified ----
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, title, assertion_level, lifecycle_state,
                              verified_by_user_id, verified_at)
VALUES
  ('92000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-0000000000c1',
   'training','Självdeklarerad kurs','self_declared','active', NULL, NULL),
  ('92000000-0000-4000-8000-000000000002','8a000000-0000-4000-8000-0000000000c1',
   'certification','Verifierat certifikat','verified','active',
   '8a000000-0000-4000-8000-0000000000b1', now());
INSERT INTO public.sp_disclosures (id, holder_user_id, package_code, purpose, application_id, expires_at)
VALUES ('93000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-0000000000c1',
        'verified_qualifications','recruitment','8d000000-0000-4000-8000-000000000001',
        now() + interval '30 days');
INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id) VALUES
  ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE bi (packv uuid, q1 uuid, q2 uuid, case1 uuid, sess1 uuid, note1 uuid,
                      pp1 uuid, pp2 uuid, r1 uuid, r2 uuid, hash1 text, basis1 text) ON COMMIT DROP;
INSERT INTO bi DEFAULT VALUES;
GRANT ALL ON bi TO authenticated;

DO $$
DECLARE _packv uuid; _q1 uuid; _q2 uuid; _case uuid; _sess uuid; _note uuid; _plan uuid; _q uuid;
  _src uuid; _pp1 uuid; _pp2 uuid;
  _a1 uuid := '8a000000-0000-4000-8000-0000000000a1';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';
  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';
  SELECT id INTO _q2 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q2';
  UPDATE bi SET packv = _packv, q1 = _q1, q2 = _q2;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_a1);

  _case := public.scp_iv_create_case('8b000000-0000-4000-8000-0000000000a1',
             'BI: ansökan 1', _packv, 'Kandidat',
             '8a000000-0000-4000-8000-0000000000c1', NULL,
             '8c000000-0000-4000-8000-000000000001',
             '8d000000-0000-4000-8000-000000000001');
  -- Sources added in an order that is NOT their sort order, to catch an
  -- aggregate that follows heap order.
  PERFORM public.scp_iv_add_source(_case, 'employer_requirements', 'Kravprofil',
    E'Krav.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervjuare A och B');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q1, 'observation', 'Kandidaten kontrollerade dörren innan larm.', auth.uid())
  RETURNING id INTO _note;
  PERFORM public.scp_iv_set_session_state(_sess, 'completed', 'evaluation', 'Höll strukturen.');

  -- Evidence confirmed FROM a note: the interviewer-observation case.
  PERFORM public.scp_iv_author_evidence(_case, _q1,
    'Kontrollerade området innan larm.', NULL, NULL, _note);
  PERFORM public.scp_iv_begin_evidence_review(_case);

  -- Superuser plumbing: a SECOND assessor on Q1, at a different level,
  -- written PHYSICALLY FIRST -- before the first assessor records theirs --
  -- so heap order (a2, a1) is the reverse of the order the builder must
  -- impose (a1, a2). A locked assessment refuses even a no-op UPDATE, so
  -- this is the only way to put the heap out of order for assessments. The
  -- panel machinery that seats a second assessor has its own suite.
  RESET ROLE;
  INSERT INTO public.scp_interview_assessments
    (case_id, question_id, anchor_id, level, rationale, uncertainty_note, assessor_id, assessed_at, locked_at)
  SELECT _case, _q1, an.id, 2, 'Handlade rätt men tvekade.', NULL,
         '8a000000-0000-4000-8000-0000000000a2', now() + interval '4 minutes', now() + interval '4 minutes'
    FROM public.scp_interview_rating_anchors an
   WHERE an.question_id = _q1 AND an.level = 2 LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_a1);

  PERFORM public.scp_iv_record_assessment(_case, _q1, 3,
    'Konkret handlande i rätt ordning.', 'Tidsåtgången är oklar.');
  PERFORM public.scp_iv_record_assessment(_case, _q2, 0,
    'Otillräcklig evidens.', NULL);
  FOR _q IN SELECT id FROM public.scp_interview_core_questions
             WHERE pack_version_id = _packv AND id NOT IN (_q1, _q2) LOOP
    PERFORM public.scp_iv_record_assessment(_case, _q, 0, 'Frågan hanns inte med; otillräcklig evidens.');
  END LOOP;
  PERFORM public.scp_iv_mark_assessed(_case);
  UPDATE bi SET case1 = _case, sess1 = _sess, note1 = _note;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);

  -- ---- Superuser plumbing ------------------------------------------------
  -- (a) A Passport source with two passages, one per claim, and evidence
  --     confirmed from each. The RPC takes a note link, not a passage link;
  --     the product sets source_passage_id through AI-proposal confirmation,
  --     which is not the path under test.
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note,
     disclosure_id, origin, provided_by)
  VALUES (_case, 'passport_disclosure', 'Passport',
          E'Självdeklarerad kurs, ej verifierad.\n\nVerifierat certifikat, verifierat av tredje part.',
          'recruitment_interview', 'Kandidatens delning.',
          '93000000-0000-4000-8000-000000000001', 'candidate_shared', _a1)
  RETURNING id INTO _src;
  INSERT INTO public.scp_interview_source_passages (source_id, passage_index, content)
  VALUES (_src, 1, 'Självdeklarerad kurs, ej verifierad.') RETURNING id INTO _pp1;
  INSERT INTO public.scp_interview_source_passages (source_id, passage_index, content)
  VALUES (_src, 2, 'Verifierat certifikat, verifierat av tredje part.') RETURNING id INTO _pp2;
  -- Inserted NEWEST-CONFIRMED FIRST, so heap order is the reverse of the
  -- sort order the builder must impose. Dated BEFORE the assessments, because
  -- material confirmed after an assessment is -- correctly -- a blocker.
  INSERT INTO public.scp_interview_evidence
    (case_id, question_id, origin, source_passage_id, excerpt, confirmed_by, confirmed_at)
  VALUES (_case, _q1, 'human_authored', _pp2, 'Verifierat certifikat.', _a1, now() - interval '2 minutes'),
         (_case, _q1, 'human_authored', _pp1, 'Självdeklarerad kurs.', _a1, now() - interval '3 minutes');
  UPDATE bi SET pp1 = _pp1, pp2 = _pp2;

END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B0 — the hash is sha256, the actor is named, preview equals finalisation'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _r uuid; _row record; _pv record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;

  SELECT * INTO _pv FROM public.scp_iv_preview_report(b.case1);
  PERFORM pg_temp.ok(_pv.payload IS NOT NULL AND _pv.basis_hash IS NOT NULL AND _pv.content_hash IS NOT NULL,
    'B0.1 a preview returns the complete payload, its basis identity and its digest');
  PERFORM pg_temp.ok(_pv.blocker_count = 0 AND jsonb_typeof(_pv.blockers) = 'array',
    'B0.2 and says what still blocks, which here is nothing');

  _r := public.scp_iv_finalise_report(b.case1, _pv.basis_hash);
  UPDATE bi SET r1 = _r;
  SELECT * INTO _row FROM public.scp_interview_reports WHERE id = _r;
  UPDATE bi SET hash1 = _row.content_hash, basis1 = _row.basis_hash;

  PERFORM pg_temp.ok(_row.status = 'final' AND _row.version_number = 1,
    'B0.3 finalising the previewed basis produces version 1, status final');
  PERFORM pg_temp.ok(_row.payload = _pv.payload,
    'B0.4 and what was finalised is BYTE-IDENTICAL to what was previewed');
  PERFORM pg_temp.ok(_row.basis_hash = _pv.basis_hash AND _row.content_hash = _pv.content_hash,
    'B0.5 with the same basis hash and the same content digest the preview reported');
  PERFORM pg_temp.ok(_row.content_hash_algorithm = 'sha256',
    'B0.6 the stored algorithm is sha256');
  PERFORM pg_temp.ok(_row.content_hash = encode(sha256(convert_to(_row.payload::text, 'UTF8')), 'hex'),
    'B0.7 the stored hash IS the sha256 of the stored payload');
  PERFORM pg_temp.ok(length(_row.content_hash) = 64 AND _row.content_hash <> md5(_row.payload::text),
    'B0.8 64 hex characters, and not the md5 the previous contract wrote');
  PERFORM pg_temp.ok(_row.finalised_by = '8a000000-0000-4000-8000-0000000000a1'
                 AND _row.finalised_at IS NOT NULL,
    'B0.9 the authorised finalising actor and the moment are both recorded');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B1 — the basis names the recruitment, the interview and the method'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;

  PERFORM pg_temp.ok((_p -> 'recruitment' ->> 'application_id') = '8d000000-0000-4000-8000-000000000001',
    'B1.1 the report names the application it belongs to');
  PERFORM pg_temp.ok((_p -> 'recruitment' ->> 'job_id') = '8c000000-0000-4000-8000-000000000001',
    'B1.2 and the advert');
  PERFORM pg_temp.ok((_p -> 'recruitment' ->> 'advertised_role_sv') = 'Väktare Väst'
                 AND (_p -> 'recruitment' ->> 'advertised_role_en') = 'Guard West',
    'B1.3 and the ADVERTISED role in both languages');
  PERFORM pg_temp.ok((_p -> 'recruitment' ->> 'advertised_role_sv') <> (_p -> 'case' ->> 'title'),
    'B1.4 which is not the case''s internal title');
  PERFORM pg_temp.ok((_p -> 'case' ->> 'candidate') IS NOT NULL,
    'B1.5 and the candidate the report is about');
  PERFORM pg_temp.ok((_p -> 'case' ->> 'pack_name_sv') IS NOT NULL
                 AND (_p -> 'case' ->> 'pack_version_number') IS NOT NULL
                 AND (_p -> 'pinned' ->> 'pack_content_hash') IS NOT NULL,
    'B1.6 the interview method is named, versioned and pinned by content hash');
  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'interview') = 1
                 AND (_p -> 'interview' -> 0 ->> 'interviewer_names') = 'Intervjuare A och B'
                 AND (_p -> 'interview' -> 0 ->> 'completed_at') IS NOT NULL,
    'B1.7 when the conversation happened and who held it travel from the session record');
  PERFORM pg_temp.ok(_p ->> 'decision_boundary' IS NOT NULL AND _p -> 'ai_disclosure' ->> 'statement' IS NOT NULL,
    'B1.8 the report states its limitation and the AI disclosure');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q
                 WHERE q -> 'requirement' ->> 'code' IS NULL),
    'B1.9 every question names the requirement it is for');
  -- Carried in both languages where the pack HAS both. The Väktare pack is
  -- authored in Swedish; the English key travels, null when the source is
  -- null, and a renderer falls back to Swedish rather than inventing text.
  PERFORM pg_temp.ok(
    (SELECT bool_and(q ? 'prompt_en' AND q -> 'requirement' ? 'name_en')
       FROM jsonb_array_elements(_p -> 'questions') q),
    'B1.10 and carries the English prompt and requirement name keys, null where the pack has none');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B2 — every kind of thing is told apart, and nothing is called verified'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb; _kinds text[]; _q1 jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;
  SELECT q INTO _q1 FROM jsonb_array_elements(_p -> 'questions') q WHERE q ->> 'code' = 'Q1';

  SELECT array_agg(DISTINCT ev ->> 'classification') INTO _kinds
    FROM jsonb_array_elements(_q1 -> 'evidence') ev;
  PERFORM pg_temp.ok(_kinds @> ARRAY['interviewer_observation'],
    'B2.1 evidence confirmed from an interviewer note is an observation');
  PERFORM pg_temp.ok(_kinds @> ARRAY['passport_disclosure'],
    'B2.2 evidence confirmed from a Passport passage is classified passport_disclosure');
  PERFORM pg_temp.ok(NOT (_kinds @> ARRAY['verified_material']),
    'B2.3 and NOTHING is classified verified_material');
  -- The same disclosure carries a self-declared claim and a verified one. The
  -- builder cannot tell which passage came from which claim, so it claims
  -- verification for neither.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_q1 -> 'evidence') ev
      WHERE ev ->> 'classification' = 'passport_disclosure') = 2,
    'B2.4 the self-declared and the verified Passport item classify IDENTICALLY -- neutrally');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'evidence') ev
                 WHERE ev ->> 'classification' IS NULL
                    OR ev ->> 'classification' NOT IN (
                   'interviewer_observation','candidate_statement','candidate_supplied_document',
                   'passport_disclosure','employer_supplied_material','unclassified','unattributed')),
    'B2.5 every evidence item carries a classification from the governed vocabulary');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'evidence') ev
                 WHERE ev ->> 'confirmed_by' IS NULL),
    'B2.6 every evidence item names the human who confirmed it');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                          jsonb_array_elements(q -> 'assessments') a
             WHERE a ->> 'kind' = 'human_interpretation' AND a ->> 'assessor_id' IS NOT NULL),
    'B2.7 a level and its rationale are a HUMAN INTERPRETATION, attributed to the human who made it');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                          jsonb_array_elements(q -> 'assessments') a
             WHERE a ->> 'uncertainty' IS NOT NULL),
    'B2.8 uncertainty is carried rather than rounded away');
  PERFORM pg_temp.ok(jsonb_typeof(_p -> 'unresolved') = 'array',
    'B2.9 missing or contradictory material has its own place');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_p -> 'sources') s WHERE (s ->> 'disclosure_backed')::boolean) = 1,
    'B2.10 the Passport source is marked as disclosure-backed, and nothing else is');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B3 — every assessor, in a fixed order; disagreement stated'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb; _q1 jsonb; _q2 jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;
  SELECT q INTO _q1 FROM jsonb_array_elements(_p -> 'questions') q WHERE q ->> 'code' = 'Q1';
  SELECT q INTO _q2 FROM jsonb_array_elements(_p -> 'questions') q WHERE q ->> 'code' = 'Q2';

  PERFORM pg_temp.ok(jsonb_array_length(_q1 -> 'assessments') = 2 AND (_q1 ->> 'assessor_count')::int = 2,
    'B3.1 BOTH assessors of Q1 reach the report -- none is picked arbitrarily');
  PERFORM pg_temp.ok((_q1 ->> 'levels_agree')::boolean = false,
    'B3.2 and their disagreement is STATED, not averaged away');
  PERFORM pg_temp.ok(
    (_q1 -> 'assessments' -> 0 ->> 'assessor_id') < (_q1 -> 'assessments' -> 1 ->> 'assessor_id'),
    'B3.3 ordered by assessor identity, a fixed key -- not by who happened to write first');
  PERFORM pg_temp.ok(
    (SELECT count(DISTINCT a ->> 'level') FROM jsonb_array_elements(_q1 -> 'assessments') a) = 2,
    'B3.4 both levels are present verbatim');
  PERFORM pg_temp.ok(jsonb_array_length(_q2 -> 'assessments') = 1 AND (_q2 ->> 'levels_agree')::boolean,
    'B3.5 a single assessor is a single entry that trivially agrees with itself');
  PERFORM pg_temp.ok(_p ? 'panel' AND _p -> 'panel' = 'null'::jsonb,
    'B3.6 no panel was concluded, and the report says so rather than inventing a conclusion');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q WHERE q ? 'assessment'),
    'B3.7 the single-assessment field is gone: there is no field that could carry "the" verdict');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B4 — the assessment result is in the report, bound to its snapshot'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb; _m jsonb; _rel jsonb; _unrel jsonb; _er record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;
  _m := _p -> 'assessment_material';

  PERFORM pg_temp.ok(jsonb_array_length(_m) = 2,
    'B4.1 both attempts on the application are named');
  SELECT x INTO _rel FROM jsonb_array_elements(_m) x WHERE x ->> 'attempt_id' = '90000000-0000-4000-8000-000000000001';
  SELECT x INTO _unrel FROM jsonb_array_elements(_m) x WHERE x ->> 'attempt_id' = '90000000-0000-4000-8000-000000000002';
  PERFORM pg_temp.ok(_unrel -> 'employer_report' = 'null'::jsonb,
    'B4.2 the attempt with no released document carries null, not an empty result');
  PERFORM pg_temp.ok((_rel -> 'employer_report' ->> 'snapshot_id') = '91000000-0000-4000-8000-000000000001',
    'B4.3 the released attempt is bound to the EXACT snapshot id');
  PERFORM pg_temp.ok((_rel -> 'employer_report' ->> 'report_version_id') IS NOT NULL
                 AND (_rel -> 'employer_report' ->> 'released_at') IS NOT NULL,
    'B4.4 and to its report version and release moment');
  PERFORM pg_temp.ok(
    (_rel -> 'employer_report' -> 'competencies' -> 0 ->> 'maturity_level') = 'developing',
    'B4.5 the governed per-competency finding travels with the interview evidence');
  PERFORM pg_temp.ok(
    (_rel -> 'employer_report' -> 'findings' -> 0 ->> 'finding') = 'Fixturfynd.'
    AND NOT (_rel -> 'employer_report' -> 'findings' -> 0 ? 'behaviour_version_id'),
    'B4.6 the human findings travel as the employer projection releases them -- without the internal id');
  PERFORM pg_temp.ok(
    NOT (_rel -> 'employer_report' -> 'brief' -> 'observed' -> 0 ? 'mean')
    AND NOT (_rel -> 'employer_report' -> 'brief' -> 'observed' -> 0 ? 'spread'),
    'B4.7 the brief carries no internal mean or spread, exactly as the audience read withholds them');
  -- The digest is over the projected content, so a re-release cannot silently
  -- change what this report was built on.
  SELECT * INTO _er FROM public.scp_employer_report('90000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.ok(
    (_rel -> 'employer_report' ->> 'snapshot_hash') = encode(sha256(convert_to(jsonb_build_object(
        'competencies', _er.payload, 'brief', _er.brief, 'findings', _er.safety_flags,
        'context', _er.context)::text, 'UTF8')), 'hex'),
    'B4.8 the snapshot digest is the sha256 of exactly what the governed projection returns');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_rel -> 'employer_report') k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict|pass_fail)'),
    'B4.9 and no field on the bound result could carry a ranking, total, suitability or verdict');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B5 — the readback proves which version, verifies it, and names who'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _rb record; _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;

  SELECT * INTO _rb FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_rb.report_id = b.r1 AND _rb.version_number = 1 AND _rb.status = 'final',
    'B5.1 the readback returns the finalised version, by id and number');
  PERFORM pg_temp.ok(_rb.content_hash = b.hash1 AND _rb.content_hash_algorithm = 'sha256' AND _rb.basis_hash = b.basis1,
    'B5.2 with the stored digest, the algorithm behind it, and the previewed basis identity');
  PERFORM pg_temp.ok(_rb.hash_verified AND _rb.recomputed_hash = _rb.content_hash,
    'B5.3 and it RECOMPUTES the digest and confirms it matches -- a proof, not a claim');
  PERFORM pg_temp.ok(_rb.finalised_by = '8a000000-0000-4000-8000-0000000000a1',
    'B5.4 the readback carries the actor''s identity');
  PERFORM pg_temp.ok(_rb.finalised_by_name = 'Ansvarig Rekryterare A' AND _rb.finalised_by_email = 'bi-owner-a@test.local',
    'B5.5 and resolves it to a display name and account address');
  PERFORM pg_temp.ok(_rb.payload IS NOT NULL AND _rb.payload = (SELECT payload FROM public.scp_interview_reports WHERE id = b.r1),
    'B5.6 and returns the exact basis that was finalised');
  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 1, 'B5.7 the version history shows exactly one finalised version so far');
  SELECT * INTO _rb FROM public.scp_iv_report_version(b.r1);
  PERFORM pg_temp.ok(_rb.report_id = b.r1 AND _rb.hash_verified AND _rb.payload IS NOT NULL,
    'B5.8 a specific version can be opened by id, verified, with its payload');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B6 — a correction is a NEW version; the old one survives, byte for byte'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _r2 uuid; _rb record; _n integer; _p1 jsonb; _h1 text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload, content_hash INTO _p1, _h1 FROM public.scp_interview_reports WHERE id = b.r1;

  PERFORM pg_temp.ok(pg_temp.finalise(b.case1) = b.r1,
    'B6.1 finalising an unchanged basis returns the report already made');

  -- A factual correction to the record.
  PERFORM public.scp_iv_author_evidence(b.case1, b.q1,
    'Rapporterade händelsen skriftligt efteråt.', NULL, NULL, b.note1);
  PERFORM public.scp_iv_record_assessment(b.case1, b.q1, 3,
    'Konkret handlande, och dokumenterat.', NULL, 'Omläsning efter rapport.');
  _r2 := pg_temp.finalise(b.case1);
  UPDATE bi SET r2 = _r2;

  PERFORM pg_temp.ok(_r2 <> b.r1, 'B6.2 a corrected basis yields a NEW version, never a rewrite');
  PERFORM pg_temp.ok(
    (SELECT status = 'superseded' AND payload = _p1 AND content_hash = _h1
       FROM public.scp_interview_reports WHERE id = b.r1),
    'B6.3 version 1 is superseded and still byte-identical, hash included');
  PERFORM pg_temp.ok(
    (SELECT version_number = 2 AND status = 'final' AND content_hash_algorithm = 'sha256' AND basis_hash IS NOT NULL
       FROM public.scp_interview_reports WHERE id = _r2),
    'B6.4 version 2 is the final one, sha256, with its own previewed basis');
  PERFORM pg_temp.ok((SELECT content_hash <> _h1 FROM public.scp_interview_reports WHERE id = _r2),
    'B6.5 and its hash differs, because its basis differs');
  SELECT * INTO _rb FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_rb.report_id = _r2 AND _rb.version_number = 2 AND _rb.hash_verified,
    'B6.6 the readback now proves version 2');
  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 2, 'B6.7 the history shows BOTH versions');
  SELECT * INTO _rb FROM public.scp_iv_report_version(b.r1);
  PERFORM pg_temp.ok(_rb.status = 'superseded' AND _rb.hash_verified AND _rb.payload = _p1,
    'B6.8 the superseded version can still be opened, verifies, and is what it was');

  -- The locked reports do not move when the live material moves under them.
  PERFORM public.scp_iv_author_evidence(b.case1, b.q1, 'Ytterligare underlag efteråt.', NULL, NULL, NULL);
  RESET ROLE;
  UPDATE public.jobs SET title_sv = 'Ändrad annonstitel' WHERE id = '8c000000-0000-4000-8000-000000000001';
  UPDATE public.scp_interview_sessions SET interviewer_names = 'Ändrad efteråt' WHERE id = b.sess1;
  PERFORM pg_temp.ok(
    (SELECT payload = _p1 AND content_hash = _h1 FROM public.scp_interview_reports WHERE id = b.r1),
    'B6.9 and version 1 is STILL byte-identical after evidence, advert and session changes');
  -- Neither the current nor the superseded version can be edited.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', _r2),
    'SCP_IV_REPORT_IMMUTABLE', 'B6.10 the current final version cannot be edited, even by the database owner');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', b.r1),
    'SCP_IV_REPORT_IMMUTABLE', 'B6.11 nor can the SUPERSEDED version -- history is not editable either');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET content_hash = ''x'' WHERE id = %L', b.r1),
    'SCP_IV_REPORT_IMMUTABLE', 'B6.12 and its hash cannot be swapped to match a forged payload');
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B7 — who may preview, read and finalise, and who may never'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO b FROM bi;

  -- THE CANDIDATE. A login, no seat. Never the employer final report.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000c1');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 0, 'B7.1 the CANDIDATE cannot read the employer final report through the readback');
  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 0, 'B7.2 nor its version history');
  SELECT count(*) INTO _n FROM public.scp_iv_report_version(b.r1);
  PERFORM pg_temp.ok(_n = 0, 'B7.3 nor a specific version by id');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = b.case1;
  PERFORM pg_temp.ok(_n = 0, 'B7.4 nor the table directly, because RLS refuses them too');
  PERFORM pg_temp.must_fail(format('SELECT * FROM public.scp_iv_preview_report(%L)', b.case1),
    'SCP_IV_NOT_CASE_MEMBER', 'B7.5 nor may the candidate preview it');
  RESET ROLE;

  -- ANOTHER EMPLOYER.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000b1');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 0, 'B7.6 another employer cannot read it');
  PERFORM pg_temp.must_fail(format('SELECT * FROM public.scp_iv_preview_report(%L)', b.case1),
    'SCP_IV_NOT_CASE_MEMBER', 'B7.7 nor preview it');
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_finalise_report(%L, %L)', b.case1, 'not-a-preview'),
    'SCP_IV_FINALISE_ROLE', 'B7.8 nor finalise it -- and the refusal is the role''s, before any hash is looked at');
  RESET ROLE;

  -- A MEMBER of the right employer: may preview and read, may not finalise.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO _n FROM public.scp_iv_preview_report(b.case1);
  PERFORM pg_temp.ok(_n = 1, 'B7.9 a member may PREVIEW -- reading is how a team works');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 1, 'B7.10 and read the finalised report');
  PERFORM pg_temp.must_fail(format('SELECT pg_temp.finalise(%L)', b.case1),
    'SCP_IV_FINALISE_ROLE', 'B7.11 but may NOT finalise, even with a valid preview in hand');
  RESET ROLE;

  -- ANON.
  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail(format('SELECT * FROM public.scp_iv_preview_report(%L)', b.case1), 'permission denied',
    'B7.12 anon may not execute the preview');
  PERFORM pg_temp.must_fail(format('SELECT * FROM public.scp_iv_final_report(%L)', b.case1), 'permission denied',
    'B7.13 nor the readback');
  PERFORM pg_temp.must_fail(format('SELECT * FROM public.scp_iv_report_version(%L)', b.r1), 'permission denied',
    'B7.14 nor a version');
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_build_report_basis(%L)', b.case1), 'permission denied',
    'B7.15 and the builder is not executable by anyone but the two doors');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_build_report_basis(%L)', b.case1), 'permission denied',
    'B7.16 not even by the owner, directly');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B8 — determinism: the same basis, whatever the heap order'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _before jsonb; _after jsonb; _pv1 record; _pv2 record; _rA uuid; _rB uuid; _n integer; _q1 jsonb;
BEGIN
  SELECT * INTO b FROM bi;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');

  -- B6 moved the live basis on purpose after version 2. Finalise the basis as
  -- it stands NOW, so the reorder below is bracketed by two finalisations of
  -- one and the same basis.
  SELECT * INTO _pv1 FROM public.scp_iv_preview_report(b.case1);
  _before := _pv1.payload;
  _rA := public.scp_iv_finalise_report(b.case1, _pv1.basis_hash);
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = b.case1;
  SELECT q INTO _q1 FROM jsonb_array_elements(_before -> 'questions') q WHERE q ->> 'code' = 'Q1';

  -- The fixture wrote Q1's Passport evidence NEWEST FIRST, its second
  -- assessor BEFORE its first, and its sources out of alphabetical order.
  -- The arrays must follow the declared keys, not the heap.
  PERFORM pg_temp.ok(
    (SELECT bool_and(prev_at <= cur_at) FROM (
       SELECT lag((ev ->> 'confirmed_at')::timestamptz) OVER (ORDER BY ord) prev_at,
              (ev ->> 'confirmed_at')::timestamptz cur_at
         FROM jsonb_array_elements(_q1 -> 'evidence') WITH ORDINALITY x(ev, ord)) s
      WHERE prev_at IS NOT NULL),
    'B8.1 evidence is ordered by the moment it was confirmed, not by heap position');
  PERFORM pg_temp.ok(
    (SELECT bool_and(prev_a <= cur_a) FROM (
       SELECT lag(a ->> 'assessor_id') OVER (ORDER BY ord) prev_a, a ->> 'assessor_id' cur_a
         FROM jsonb_array_elements(_q1 -> 'assessments') WITH ORDINALITY x(a, ord)) s
      WHERE prev_a IS NOT NULL),
    'B8.2 assessments are ordered by assessor identity, although the second assessor was written first');
  PERFORM pg_temp.ok(
    (SELECT bool_and(prev_c <= cur_c) FROM (
       SELECT lag(c.created_at) OVER (ORDER BY ord) prev_c, c.created_at cur_c
         FROM jsonb_array_elements(_before -> 'sources') WITH ORDINALITY x(s, ord)
         JOIN public.scp_interview_case_sources c ON c.id = (s ->> 'id')::uuid) u
      WHERE prev_c IS NOT NULL),
    'B8.3 sources are ordered by creation, then id');
  PERFORM pg_temp.ok(
    (SELECT bool_and(prev_o < cur_o) FROM (
       SELECT lag((q ->> 'order')::int) OVER (ORDER BY ord) prev_o, (q ->> 'order')::int cur_o
         FROM jsonb_array_elements(_before -> 'questions') WITH ORDINALITY x(q, ord)) s
      WHERE prev_o IS NOT NULL),
    'B8.4 questions are ordered by the pack''s display order');
  RESET ROLE;

  -- Now REORDER THE HEAP. A no-op UPDATE writes a new tuple version, so a
  -- sequential scan returns these rows in a different order than before.
  -- Nothing in the basis changed. Not assessments: a locked assessment
  -- refuses even a no-op UPDATE (SCP_IV_ASSESSMENT_LOCKED), which is right;
  -- their heap was put out of order by the fixture, and B8.2 covers them.
  UPDATE public.scp_interview_evidence SET excerpt = excerpt WHERE case_id = b.case1;
  UPDATE public.scp_interview_case_sources SET label = label WHERE case_id = b.case1;
  UPDATE public.scp_interview_findings SET statement = statement WHERE case_id = b.case1;
  UPDATE public.scp_interview_sessions SET status = status WHERE case_id = b.case1;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO _pv2 FROM public.scp_iv_preview_report(b.case1);
  _after := _pv2.payload;
  PERFORM pg_temp.ok(_after::text = _before::text,
    'B8.5 after the heap is reordered the payload is BYTE-IDENTICAL');
  PERFORM pg_temp.ok(_pv2.basis_hash = _pv1.basis_hash AND _pv2.content_hash = _pv1.content_hash,
    'B8.6 and so are both digests');
  _rB := public.scp_iv_finalise_report(b.case1, _pv2.basis_hash);
  PERFORM pg_temp.ok(_rB = _rA,
    'B8.7 finalising again returns the SAME report -- no version was created for a reordered heap');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_reports WHERE case_id = b.case1) = _n,
    'B8.8 and the version count did not move');
  PERFORM pg_temp.ok(public.scp_iv_basis_hash(_before) = public.scp_iv_basis_hash(_after)
                 AND public.scp_iv_content_hash(_before) = public.scp_iv_content_hash(_after),
    'B8.9 the hash rules are pure functions of the basis');
  PERFORM pg_temp.ok(public.scp_iv_basis_hash(_before) <> public.scp_iv_content_hash(_before),
    'B8.10 and the basis identity differs from the content digest only by the status field it excludes');
  UPDATE bi SET r2 = _rA;
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B9 — the owner finalises exactly what was previewed, or not at all'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _pv record; _stale text; _r uuid; _n integer;
BEGIN
  SELECT * INTO b FROM bi;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');

  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_finalise_report(%L, NULL)', b.case1),
    'SCP_IV_PREVIEW_REQUIRED', 'B9.1 finalising with no preview identity is refused');
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_finalise_report(%L, %L)', b.case1, ''),
    'SCP_IV_PREVIEW_REQUIRED', 'B9.2 and so is an empty one');

  SELECT * INTO _pv FROM public.scp_iv_preview_report(b.case1);
  _stale := _pv.basis_hash;
  -- The basis moves between preview and finalisation.
  PERFORM public.scp_iv_author_evidence(b.case1, b.q2, 'Nytt underlag mellan förhandsgranskning och färdigställande.', NULL, NULL, NULL);
  PERFORM public.scp_iv_record_assessment(b.case1, b.q2, 1, 'Något underlag nu.', NULL, 'Nytt underlag.');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = b.case1;
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_finalise_report(%L, %L)', b.case1, _stale),
    'SCP_IV_STALE_PREVIEW', 'B9.3 a stale preview is refused explicitly -- the owner is told to preview again');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_reports WHERE case_id = b.case1) = _n,
    'B9.4 and the refusal wrote no version');
  PERFORM pg_temp.must_fail(format('SELECT public.scp_iv_finalise_report(%L, %L)', b.case1, 'not-a-preview'),
    'SCP_IV_STALE_PREVIEW', 'B9.5 a fabricated identity is refused the same way');

  SELECT * INTO _pv FROM public.scp_iv_preview_report(b.case1);
  PERFORM pg_temp.ok(_pv.basis_hash <> _stale, 'B9.6 a fresh preview carries a new identity');
  _r := public.scp_iv_finalise_report(b.case1, _pv.basis_hash);
  PERFORM pg_temp.ok(_r <> b.r2 AND (SELECT payload = _pv.payload AND basis_hash = _pv.basis_hash
                                        FROM public.scp_interview_reports WHERE id = _r),
    'B9.7 finalising the fresh preview produces a NEW version, byte-identical to that preview');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B10 — no automated judgement, anywhere in the document'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_p) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict|decision$)'),
    'B10.1 no top-level field could carry a ranking, score, suitability or verdict');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'assessments') a, jsonb_object_keys(a) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B10.2 nor any field on any per-requirement human assessment');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_p -> 'recruitment') k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B10.3 nor on the recruitment block');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'assessment_material') m, jsonb_object_keys(m) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B10.4 nor on the assessment material identity');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q, jsonb_object_keys(q) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B10.5 nor on any question');
  RESET ROLE;
END $$;

\echo '    ok  employer final-report basis and readback assertions passed'
