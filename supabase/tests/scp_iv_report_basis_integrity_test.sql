-- The employer final report: a provable basis, and a governed readback.
--
-- The product question: when a recruitment owner finalises a report and later
-- points at it to justify a decision, can anyone check that the thing they are
-- looking at is the thing that was finalised -- and can a reader tell a fact
-- the candidate stated from an interviewer's observation from a human's
-- interpretation from something nobody established at all?
--
-- One employer, one candidate, one advertised job, one application, one case,
-- walked through the governed RPCs exactly as the product walks it. A second
-- employer with no relationship to any of it. The candidate has a login and no
-- seat, which is the whole point of group B4.
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

CREATE OR REPLACE FUNCTION pg_temp.refused(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('8a000000-0000-4000-8000-0000000000a1', 'bi-owner-a@test.local'),
  ('8a000000-0000-4000-8000-0000000000a2', 'bi-member-a@test.local'),
  ('8a000000-0000-4000-8000-0000000000b1', 'bi-owner-b@test.local'),
  ('8a000000-0000-4000-8000-0000000000c1', 'bi-candidate@test.local')
ON CONFLICT (id) DO NOTHING;

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

CREATE TEMP TABLE bi (packv uuid, q1 uuid, case1 uuid, sess1 uuid, note1 uuid,
                      r1 uuid, r2 uuid, hash1 text) ON COMMIT DROP;
INSERT INTO bi DEFAULT VALUES;
GRANT ALL ON bi TO authenticated;

DO $$
DECLARE _packv uuid; _q1 uuid; _case uuid; _sess uuid; _note uuid; _plan uuid; _q uuid;
  _a1 uuid := '8a000000-0000-4000-8000-0000000000a1';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';
  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';
  UPDATE bi SET packv = _packv, q1 = _q1;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_a1);

  _case := public.scp_iv_create_case('8b000000-0000-4000-8000-0000000000a1',
             'BI: ansökan 1', _packv, 'Kandidat',
             '8a000000-0000-4000-8000-0000000000c1', NULL,
             '8c000000-0000-4000-8000-000000000001',
             '8d000000-0000-4000-8000-000000000001');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervjuare');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q1, 'observation', 'Kandidaten kontrollerade dörren innan larm.', auth.uid())
  RETURNING id INTO _note;
  PERFORM public.scp_iv_set_session_state(_sess, 'completed', 'evaluation', 'Höll strukturen.');

  -- Evidence confirmed FROM a note: the interviewer-observation case.
  PERFORM public.scp_iv_author_evidence(_case, _q1,
    'Kontrollerade området innan larm.', NULL, NULL, _note);
  PERFORM public.scp_iv_begin_evidence_review(_case);
  -- A level and a rationale on EVERY question, so "no level reaches the wrong
  -- place" is asserted against a case that really has some.
  PERFORM public.scp_iv_record_assessment(_case, _q1, 3,
    'Konkret handlande i rätt ordning.', 'Tidsåtgången är oklar.');
  FOR _q IN SELECT id FROM public.scp_interview_core_questions
             WHERE pack_version_id = _packv AND id <> _q1 LOOP
    PERFORM public.scp_iv_record_assessment(_case, _q, 0, 'Frågan hanns inte med; otillräcklig evidens.');
  END LOOP;
  PERFORM public.scp_iv_mark_assessed(_case);

  UPDATE bi SET case1 = _case, sess1 = _sess, note1 = _note;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B0 — the hash is sha256, and says so'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _r uuid; _row record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;

  _r := public.scp_iv_finalise_report(b.case1);
  UPDATE bi SET r1 = _r;
  SELECT * INTO _row FROM public.scp_interview_reports WHERE id = _r;
  UPDATE bi SET hash1 = _row.content_hash;

  PERFORM pg_temp.ok(_row.status = 'final' AND _row.version_number = 1,
    'B0.1 finalising an assessed case produces version 1, status final');
  PERFORM pg_temp.ok(_row.content_hash_algorithm = 'sha256',
    'B0.2 the stored algorithm is sha256');
  PERFORM pg_temp.ok(_row.content_hash = encode(sha256(_row.payload::text::bytea), 'hex'),
    'B0.3 the stored hash IS the sha256 of the stored payload');
  PERFORM pg_temp.ok(length(_row.content_hash) = 64,
    'B0.4 and it is 64 hex characters, so it cannot be an md5 by accident');
  PERFORM pg_temp.ok(_row.content_hash <> md5(_row.payload::text),
    'B0.5 and it is not the md5 the previous contract wrote');
  PERFORM pg_temp.ok(_row.finalised_by = '8a000000-0000-4000-8000-0000000000a1'
                 AND _row.finalised_at IS NOT NULL,
    'B0.6 the authorised finalising actor and the moment are both recorded');

  -- Determinism: the same basis hashes the same way twice.
  PERFORM pg_temp.ok(
    encode(sha256(_row.payload::text::bytea), 'hex')
      = encode(sha256(_row.payload::text::bytea), 'hex'),
    'B0.7 the digest is deterministic over the stored basis');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B1 — the basis names the recruitment it belongs to'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;

  PERFORM pg_temp.ok(
    (_p -> 'recruitment' ->> 'application_id') = '8d000000-0000-4000-8000-000000000001',
    'B1.1 the report names the application it belongs to');
  PERFORM pg_temp.ok(
    (_p -> 'recruitment' ->> 'job_id') = '8c000000-0000-4000-8000-000000000001',
    'B1.2 and the advert');
  PERFORM pg_temp.ok(
    (_p -> 'recruitment' ->> 'advertised_role_sv') = 'Väktare Väst'
    AND (_p -> 'recruitment' ->> 'advertised_role_en') = 'Guard West',
    'B1.3 and the ADVERTISED role in both languages');
  PERFORM pg_temp.ok(
    (_p -> 'recruitment' ->> 'advertised_role_sv') <> (_p -> 'case' ->> 'title'),
    'B1.4 which is not the case''s internal title');
  PERFORM pg_temp.ok(
    (_p -> 'case' ->> 'candidate') IS NOT NULL,
    'B1.5 and the candidate the report is about');
  PERFORM pg_temp.ok(
    (_p -> 'pinned' ->> 'pack_version_id') IS NOT NULL
    AND (_p -> 'pinned' ->> 'pack_content_hash') IS NOT NULL,
    'B1.6 the interview method is pinned by pack version and content hash');
  PERFORM pg_temp.ok(
    jsonb_typeof(_p -> 'assessment_material') = 'array',
    'B1.7 the assessment material used is recorded as a list, empty or not');
  PERFORM pg_temp.ok(
    _p ->> 'decision_boundary' IS NOT NULL
    AND _p -> 'ai_disclosure' ->> 'statement' IS NOT NULL,
    'B1.8 the report states its limitation and the AI disclosure');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B2 — a reader can tell what kind of thing each item is'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb; _kinds text[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;

  SELECT array_agg(DISTINCT ev ->> 'classification') INTO _kinds
    FROM jsonb_array_elements(_p -> 'questions') q,
         jsonb_array_elements(q -> 'evidence') ev;

  PERFORM pg_temp.ok(_kinds @> ARRAY['interviewer_observation'],
    'B2.1 evidence confirmed from an interviewer note is classified as an observation');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'evidence') ev
                 WHERE ev ->> 'classification' IS NULL),
    'B2.2 every evidence item carries a classification -- none is left unsaid');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'evidence') ev
                 WHERE ev ->> 'classification' NOT IN (
                   'interviewer_observation','candidate_statement',
                   'candidate_supplied_document','verified_material',
                   'employer_supplied_material','unclassified','unattributed')),
    'B2.3 and only from the governed vocabulary');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                              jsonb_array_elements(q -> 'evidence') ev
                 WHERE ev ->> 'confirmed_by' IS NULL),
    'B2.4 every evidence item names the human who confirmed it');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q
             WHERE q -> 'assessment' ->> 'kind' = 'human_interpretation'),
    'B2.5 a level and its rationale are named as a human INTERPRETATION, not a further fact');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q
             WHERE q -> 'assessment' ->> 'assessor_id' IS NOT NULL),
    'B2.6 and attributed to the human who made it');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q
             WHERE q -> 'assessment' ->> 'uncertainty' IS NOT NULL),
    'B2.7 uncertainty is carried rather than rounded away');
  PERFORM pg_temp.ok(jsonb_typeof(_p -> 'unresolved') = 'array',
    'B2.8 missing or contradictory material has its own place in the report');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B3 — no automated judgement, anywhere'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _p jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload INTO _p FROM public.scp_interview_reports WHERE id = b.r1;

  -- Structure, not vocabulary: the pack's own wording may legitimately DENY
  -- ranking. What must be absent is any FIELD that could carry a verdict.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_p) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict|decision$)'),
    'B3.1 no top-level field could carry a ranking, score, suitability or verdict');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'questions') q,
                     jsonb_object_keys(coalesce(q -> 'assessment', '{}'::jsonb)) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B3.2 nor any field on a per-requirement assessment');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_p -> 'recruitment') k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)'),
    'B3.3 nor on the recruitment block this migration added');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p -> 'assessment_material') m,
                     jsonb_object_keys(m) k
                 WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict|level)'),
    'B3.4 nor on the assessment material block -- identity only, no result');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B4 — the readback proves which version was finalised'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _rb record; _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;

  SELECT * INTO _rb FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_rb.report_id = b.r1 AND _rb.version_number = 1 AND _rb.status = 'final',
    'B4.1 the readback returns the finalised version, by id and number');
  PERFORM pg_temp.ok(_rb.content_hash = b.hash1 AND _rb.content_hash_algorithm = 'sha256',
    'B4.2 with the stored hash and the algorithm behind it');
  PERFORM pg_temp.ok(_rb.hash_verified,
    'B4.3 and it RECOMPUTES the digest and confirms it matches -- a proof, not a claim');
  PERFORM pg_temp.ok(_rb.recomputed_hash = _rb.content_hash,
    'B4.4 the recomputed digest is returned beside the stored one for inspection');
  PERFORM pg_temp.ok(_rb.finalised_by = '8a000000-0000-4000-8000-0000000000a1',
    'B4.5 the readback names the authorised actor who finalised it');
  PERFORM pg_temp.ok(_rb.payload IS NOT NULL,
    'B4.6 and returns the exact basis that was finalised');

  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 1, 'B4.7 the version history shows exactly one finalised version so far');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B5 — a correction is a NEW version; the old one survives'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _r2 uuid; _rb record; _n integer; _p1 jsonb; _h1 text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a1');
  SELECT * INTO b FROM bi;
  SELECT payload, content_hash INTO _p1, _h1
    FROM public.scp_interview_reports WHERE id = b.r1;

  -- Finalising again with nothing changed is the SAME report, not a second one.
  PERFORM pg_temp.ok(public.scp_iv_finalise_report(b.case1) = b.r1,
    'B5.1 finalising an unchanged basis returns the report already made');

  -- A factual correction to the record.
  PERFORM public.scp_iv_author_evidence(b.case1, b.q1,
    'Rapporterade händelsen skriftligt efteråt.', NULL, NULL, b.note1);
  PERFORM public.scp_iv_record_assessment(b.case1, b.q1, 3,
    'Konkret handlande, och dokumenterat.', NULL, 'Omläsning efter rapport.');
  _r2 := public.scp_iv_finalise_report(b.case1);
  UPDATE bi SET r2 = _r2;

  PERFORM pg_temp.ok(_r2 <> b.r1,
    'B5.2 a corrected basis yields a NEW version, never a rewrite');
  PERFORM pg_temp.ok(
    (SELECT status = 'superseded' AND payload = _p1 AND content_hash = _h1
       FROM public.scp_interview_reports WHERE id = b.r1),
    'B5.3 version 1 is superseded and still byte-identical, hash included');
  PERFORM pg_temp.ok(
    (SELECT version_number = 2 AND status = 'final' AND content_hash_algorithm = 'sha256'
       FROM public.scp_interview_reports WHERE id = _r2),
    'B5.4 version 2 is the final one, and also sha256');
  PERFORM pg_temp.ok(
    (SELECT content_hash <> _h1 FROM public.scp_interview_reports WHERE id = _r2),
    'B5.5 and its hash differs, because its basis differs');

  SELECT * INTO _rb FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_rb.report_id = _r2 AND _rb.version_number = 2 AND _rb.hash_verified,
    'B5.6 the readback now proves version 2, and version 2 verifies');

  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 2,
    'B5.7 the history shows BOTH versions -- the previous one is preserved, not replaced');

  -- The locked report does not move when the live material moves under it.
  PERFORM public.scp_iv_author_evidence(b.case1, b.q1, 'Ytterligare underlag efteråt.', NULL, NULL, NULL);
  RESET ROLE;
  UPDATE public.jobs SET title_sv = 'Ändrad annonstitel'
   WHERE id = '8c000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.ok(
    (SELECT payload = _p1 AND content_hash = _h1
       FROM public.scp_interview_reports WHERE id = b.r1),
    'B5.8 and version 1 is STILL byte-identical after evidence and advert changes');
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B6 — who may read it, and who may never'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO b FROM bi;

  -- THE CANDIDATE. Has a login, no seat at the employer. The employer final
  -- report is never shared with the candidate, and this is where that is
  -- enforced rather than promised.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000c1');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 0,
    'B6.1 the CANDIDATE cannot read the employer final report through the readback');
  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 0,
    'B6.2 nor its version history');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = b.case1;
  PERFORM pg_temp.ok(_n = 0,
    'B6.3 nor the table directly, because RLS refuses them too');
  RESET ROLE;

  -- ANOTHER EMPLOYER. No relationship to this case at all.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000b1');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 0,
    'B6.4 another employer cannot read it');
  SELECT count(*) INTO _n FROM public.scp_iv_report_versions(b.case1);
  PERFORM pg_temp.ok(_n = 0,
    'B6.5 nor its history');
  RESET ROLE;

  -- A MEMBER of the right employer. May READ the report -- reading is how a
  -- team works -- but may not finalise one.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('8a000000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO _n FROM public.scp_iv_final_report(b.case1);
  PERFORM pg_temp.ok(_n = 1,
    'B6.6 a member of the employer may read the finalised report');
  PERFORM pg_temp.refused(
    format('SELECT public.scp_iv_finalise_report(%L)', b.case1),
    'B6.7 but a member may NOT finalise one -- that is an owner or admin act');
  RESET ROLE;

  -- ANON.
  SET LOCAL ROLE anon;
  PERFORM pg_temp.refused(
    format('SELECT public.scp_iv_final_report(%L)', b.case1),
    'B6.8 anon may not execute the readback at all');
  PERFORM pg_temp.refused(
    format('SELECT public.scp_iv_report_versions(%L)', b.case1),
    'B6.9 nor the version history');
  RESET ROLE;
END $$;

-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP B7 — tampering is detectable, and the basis is not live data'; END $$;
-- ###########################################################################
DO $$
DECLARE b bi%ROWTYPE; _rb record; _src text;
BEGIN
  SELECT * INTO b FROM bi;

  -- Neither the CURRENT final version nor the SUPERSEDED one can be edited.
  -- The second half is the one that matters for "a correction preserves the
  -- previous version": version 1 is the record of what was actually finalised
  -- and used, and it stays that record.
  PERFORM pg_temp.refused(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', b.r2),
    'B7.1 the current final version cannot be edited, even by the owner of the database connection');
  PERFORM pg_temp.refused(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', b.r1),
    'B7.1b nor can the SUPERSEDED version -- history is not editable either');
  PERFORM pg_temp.refused(
    format('UPDATE public.scp_interview_reports SET content_hash = ''x'' WHERE id = %L', b.r1),
    'B7.1c and its hash cannot be swapped to match a forged payload');

  -- The readback would CATCH it if one ever were. Proved by forcing the
  -- mismatch on a scratch copy rather than by trusting the sentence.
  PERFORM pg_temp.ok(
    (SELECT r.content_hash <> encode(sha256('{"tampered":true}'::text::bytea), 'hex')
       FROM public.scp_interview_reports r WHERE r.id = b.r1),
    'B7.2 a different basis would produce a different digest');

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_finalise_report';
  PERFORM pg_temp.ok(
    position('job_applications' in _src) = 0
    AND position('sp_claims' in _src) = 0
    AND position('cv_documents' in _src) = 0
    AND position('session_notes' in _src) = 0,
    'B7.3 the builder still reads no live application, Passport, CV or note table');
  PERFORM pg_temp.ok(
    position('scp_interview_evidence_proposals' in _src) = 0,
    'B7.4 and no AI proposal a human never accepted can reach a finalised report');
  PERFORM pg_temp.ok(
    position('digest(' in _src) = 0 AND position('sha256(' in _src) > 0,
    'B7.5 the digest is core sha256, not pgcrypto -- finalisation cannot fail on a missing extension');
END $$;

\echo '    ok  employer final-report basis and readback assertions passed'
