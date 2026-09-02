-- Interview evidence reliability, tested deliberately.
--
-- The product question: can a recruiter trust that what they confirmed during
-- an interview is exactly what reaches the assessment and the final report --
-- without disappearing, duplicating, being silently rewritten, or leaking
-- into another candidate, another application or another employer?
--
-- Two employers. Employer A has ONE candidate with TWO applications to TWO
-- jobs, and therefore two interview cases that pin the same pack and the same
-- questions -- the shape in which cross-case leakage is easiest, because every
-- question id matches. Employer B has its own case. A member of A who may not
-- finalise, and the candidate, who has a login and no seat.
--
-- Deterministic. No AI provider, no network. Everything rolls back.
--
-- ON TIME: the whole suite is one transaction, so now() -- which every
-- timestamp default and every RPC uses -- is one instant. In production every
-- request is its own transaction and "confirmed later" is a later now(). Where
-- a group needs material that was confirmed AFTER an assessment, it moves the
-- evidence row's confirmed_at forward by one minute as the superuser, which is
-- the only way to express "a later transaction" inside a single one. The rule
-- under test is confirmed_at > assessed_at; the mechanism is not the clock.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
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

CREATE OR REPLACE FUNCTION pg_temp.become(_u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
END $$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('81000000-0000-4000-8000-0000000000a1', 'er-owner-a@test.local'),
  ('81000000-0000-4000-8000-0000000000a2', 'er-member-a@test.local'),
  ('81000000-0000-4000-8000-0000000000b1', 'er-owner-b@test.local'),
  ('81000000-0000-4000-8000-0000000000c1', 'er-candidate@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('82000000-0000-4000-8000-0000000000a1', 'ER Tenant A AB', 'er-tenant-a-ab', 'active'),
  ('82000000-0000-4000-8000-0000000000b1', 'ER Tenant B AB', 'er-tenant-b-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('81000000-0000-4000-8000-0000000000a1','82000000-0000-4000-8000-0000000000a1','owner','active'),
  ('81000000-0000-4000-8000-0000000000a2','82000000-0000-4000-8000-0000000000a1','member','active'),
  ('81000000-0000-4000-8000-0000000000b1','82000000-0000-4000-8000-0000000000b1','owner','active')
ON CONFLICT DO NOTHING;

-- One candidate, two jobs, two applications -- all at employer A.
-- Two PUBLISHED adverts, so the candidate's applications are accepted. The
-- job lifecycle guard lets only a platform admin insert a published advert
-- directly; this fixture is superuser plumbing, not a path under test, so the
-- guard is stepped around for these two rows only and restored at once.
ALTER TABLE public.jobs DISABLE TRIGGER USER;
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, published_at, expires_at)
VALUES
  ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-0000000000a1',
   'er-job-1','erjob00001','Väktare Nord','Guard North','published','internal',
   now(), now() + interval '30 days'),
  ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-0000000000a1',
   'er-job-2','erjob00002','Väktare Syd','Guard South','published','internal',
   now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.jobs ENABLE TRIGGER USER;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES
  ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
   '82000000-0000-4000-8000-0000000000a1','81000000-0000-4000-8000-0000000000c1', now()),
  ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',
   '82000000-0000-4000-8000-0000000000a1','81000000-0000-4000-8000-0000000000c1', now())
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE er (
  packv uuid, q1 uuid, q2 uuid,
  case1 uuid, sess1 uuid, note1 uuid,
  case2 uuid, sess2 uuid, note2 uuid,
  case_b uuid, sess_b uuid, note_b uuid
) ON COMMIT DROP;
INSERT INTO er DEFAULT VALUES;
-- The role-switched blocks below read and write the scratch tables.
GRANT ALL ON er TO authenticated;

-- Every case is built through the governed RPCs, exactly as the product
-- builds one, and walked to interview_complete with one note on Q1.
CREATE OR REPLACE FUNCTION pg_temp.build_case(
  _emp uuid, _title text, _cand uuid, _ext text, _job uuid, _app uuid,
  OUT case_id uuid, OUT session_id uuid, OUT note_id uuid)
LANGUAGE plpgsql AS $$
DECLARE _packv uuid; _plan uuid; _q1 uuid;
BEGIN
  SELECT packv, q1 INTO _packv, _q1 FROM er;
  case_id := public.scp_iv_create_case(_emp, _title, _packv, 'Kandidat', _cand, _ext, _job, _app);
  PERFORM public.scp_iv_add_source(case_id, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(case_id);
  _plan := public.scp_iv_record_manual_prep_plan(case_id, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  session_id := public.scp_iv_start_session(case_id, 'Intervjuare');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (session_id, _q1, 'observation',
          'Kandidaten beskrev en olåst dörr som kontrollerades innan larm. [' || _title || ']',
          auth.uid())
  RETURNING id INTO note_id;
  PERFORM public.scp_iv_set_session_state(session_id, 'completed', 'evaluation', 'Höll strukturen.');
END $$;

DO $$
DECLARE _r record;
  _a1 uuid := '81000000-0000-4000-8000-0000000000a1';
  _b1 uuid := '81000000-0000-4000-8000-0000000000b1';
  _c1 uuid := '81000000-0000-4000-8000-0000000000c1';
  _empA uuid := '82000000-0000-4000-8000-0000000000a1';
  _empB uuid := '82000000-0000-4000-8000-0000000000b1';
BEGIN
  UPDATE er SET packv = (SELECT v.id FROM public.scp_interview_pack_versions v
                          JOIN public.scp_interview_packs p ON p.id = v.pack_id
                         WHERE p.slug = 'vaktare-se');
  UPDATE er SET q1 = (SELECT id FROM public.scp_interview_core_questions
                       WHERE pack_version_id = (SELECT packv FROM er) AND code = 'Q1'),
                q2 = (SELECT id FROM public.scp_interview_core_questions
                       WHERE pack_version_id = (SELECT packv FROM er) AND code = 'Q2');

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_a1);
  SELECT * INTO _r FROM pg_temp.build_case(_empA, 'A: ansökan 1', _c1, NULL,
    '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001');
  UPDATE er SET case1 = _r.case_id, sess1 = _r.session_id, note1 = _r.note_id;
  SELECT * INTO _r FROM pg_temp.build_case(_empA, 'A: ansökan 2', _c1, NULL,
    '83000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002');
  UPDATE er SET case2 = _r.case_id, sess2 = _r.session_id, note2 = _r.note_id;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_b1);
  SELECT * INTO _r FROM pg_temp.build_case(_empB, 'B: egen intervju', NULL, 'B-EXT-1', NULL, NULL);
  UPDATE er SET case_b = _r.case_id, sess_b = _r.session_id, note_b = _r.note_id;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

CREATE TEMP TABLE er_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON er_ids TO authenticated;
CREATE TEMP TABLE er_snap (k text PRIMARY KEY, payload jsonb, hash text) ON COMMIT DROP;
GRANT ALL ON er_snap TO authenticated;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER1 — evidence is bound to its case, question and application'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _ev uuid; _dim_q2 uuid; _run uuid; _n integer;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  PERFORM pg_temp.ok(
    (SELECT candidate_user_id FROM public.scp_interview_cases WHERE id = e.case1)
      = (SELECT candidate_user_id FROM public.scp_interview_cases WHERE id = e.case2)
    AND (SELECT application_id FROM public.scp_interview_cases WHERE id = e.case1)
      <> (SELECT application_id FROM public.scp_interview_cases WHERE id = e.case2),
    'ER1.1 the same candidate holds two cases for two different applications');

  -- The same employer, the same candidate, the same question id: the note from
  -- application 1 must still not be citable in application 2.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L, NULL, NULL, %L)',
           e.case2, e.q1, 'Texten från intervju 1.', e.note1),
    'SCP_IV_EVIDENCE_ORIGIN_MISMATCH',
    'ER1.2 a note from application 1 cannot be cited as evidence in application 2');

  _ev := public.scp_iv_author_evidence(e.case1, e.q1,
           'Kontrollerade området innan larm.', NULL, NULL, e.note1);
  INSERT INTO er_ids VALUES ('ev1', _ev);
  PERFORM pg_temp.ok(
    (SELECT case_id = e.case1 AND question_id = e.q1 AND note_id = e.note1
            AND confirmed_by = auth.uid()
       FROM public.scp_interview_evidence WHERE id = _ev),
    'ER1.3 evidence carries its own case, question, source note and confirming human');

  SELECT id INTO _dim_q2 FROM public.scp_interview_evidence_dimensions
   WHERE question_id = e.q2 ORDER BY display_order LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L, %L, NULL, %L)',
           e.case1, e.q1, 'Fel dimension.', _dim_q2, e.note1),
    'SCP_IV_EVIDENCE_DIMENSION_MISMATCH',
    'ER1.4 an evidence dimension of another question cannot be attached to this one');

  -- The AI path is bound the same way: a proposal may only cite its own case.
  _run := public.scp_iv_ai_run_start(e.case1, 'evidence_extraction',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  INSERT INTO er_ids VALUES ('run1', _run);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_record_evidence_proposals(%L, %L::jsonb)', _run,
           jsonb_build_array(jsonb_build_object(
             'noteId', e.note2::text, 'excerpt', 'från fel intervju',
             'questionId', e.q1::text, 'relevanceRationale', 'x'))::text),
    'SCP_IV_EVIDENCE_ORIGIN_MISMATCH',
    'ER1.5 an AI proposal cannot cite a note from another case either');
  PERFORM public.scp_iv_record_evidence_proposals(_run, jsonb_build_array(jsonb_build_object(
    'noteId', e.note1::text, 'excerpt', 'kontrollerades innan larm',
    'questionId', e.q1::text, 'extractionConfidence', '0.7',
    'relevanceRationale', 'Kontroll före åtgärd.')));

  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE case_id = e.case2;
  PERFORM pg_temp.ok(_n = 0,
    'ER1.6 application 2 has no evidence: nothing leaked across from application 1');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence ev
    JOIN public.scp_interview_session_notes n ON n.id = ev.note_id
    JOIN public.scp_interview_sessions s ON s.id = n.session_id
   WHERE ev.case_id <> s.case_id;
  PERFORM pg_temp.ok(_n = 0,
    'ER1.7 no evidence row anywhere cites a note from a different case');
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER2 — a proposal is not evidence, and a note is not evidence'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _prop uuid; _ev uuid; _again uuid; _n integer;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  SELECT id INTO _prop FROM public.scp_interview_evidence_proposals
   WHERE case_id = e.case1 AND review_state = 'pending';
  PERFORM pg_temp.ok(_prop IS NOT NULL, 'ER2.1 the AI proposal exists and is pending');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 1,
    'ER2.2 recording the proposal created no evidence: only the human-authored item exists');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence
   WHERE case_id = e.case2 OR note_id = e.note2;
  PERFORM pg_temp.ok(_n = 0,
    'ER2.3 a note nobody confirmed is evidence nowhere');
  PERFORM pg_temp.ok(
    position('scp_interview_evidence_proposals' in
      pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0,
    'ER2.4 the report builder does not read the proposals table at all');

  -- Human confirmation, then the same click again.
  _ev := public.scp_iv_confirm_evidence_proposal(_prop, 'accept');
  INSERT INTO er_ids VALUES ('ev_prop', _ev);
  _again := public.scp_iv_confirm_evidence_proposal(_prop, 'accept');
  PERFORM pg_temp.ok(_ev = _again,
    'ER2.5 confirming the same proposal twice returns the same evidence item');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE proposal_id = _prop;
  PERFORM pg_temp.ok(_n = 1, 'ER2.6 and exactly one evidence row exists for it');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_evidence_proposal(%L, %L, NULL, %L)',
           _prop, 'reject', 'user_preference'),
    'SCP_IV_PROPOSAL_ALREADY_REVIEWED',
    'ER2.7 a DIFFERENT decision on a reviewed proposal is still refused');
  PERFORM pg_temp.ok(
    (SELECT review_state FROM public.scp_interview_evidence_proposals WHERE id = _prop) = 'confirmed',
    'ER2.8 the recorded decision is unchanged by the retry and the refusal');
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER3 — double submit and retry create no duplicate'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _a uuid; _b uuid; _c uuid; _n integer; _q uuid; _as1 uuid; _as2 uuid;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  _a := public.scp_iv_author_evidence(e.case1, e.q1, 'Kontrollerade området innan larm.', NULL, NULL, e.note1);
  _b := public.scp_iv_author_evidence(e.case1, e.q1, 'Kontrollerade området innan larm.', NULL, NULL, e.note1);
  _c := public.scp_iv_author_evidence(e.case1, e.q1, '  Kontrollerade området innan larm.  ', NULL, NULL, e.note1);
  PERFORM pg_temp.ok(_a = _b AND _b = _c AND _a = (SELECT v FROM er_ids WHERE k = 'ev1'),
    'ER3.1 authoring the same material three times is ONE evidence item');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence
   WHERE case_id = e.case1 AND question_id = e.q1 AND origin = 'human_authored';
  PERFORM pg_temp.ok(_n = 1, 'ER3.2 one human-authored row for the question, not three');

  _b := public.scp_iv_author_evidence(e.case1, e.q1, 'Larmade först efter kontroll.', NULL, NULL, e.note1);
  PERFORM pg_temp.ok(_b <> _a,
    'ER3.3 different words are a different item -- idempotency is not deduplication of meaning');
  INSERT INTO er_ids VALUES ('ev_second', _b);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L)', e.case1, e.q1, '   '),
    'SCP_IV_EVIDENCE_TEXT_REQUIRED',
    'ER3.4 evidence with no words is refused by name');

  PERFORM public.scp_iv_begin_evidence_review(e.case1);

  _as1 := public.scp_iv_record_assessment(e.case1, e.q1, 3, 'Konkret handlande i rätt ordning.', 'Tidsåtgången är oklar.');
  _as2 := public.scp_iv_record_assessment(e.case1, e.q1, 3, 'Konkret handlande i rätt ordning.', 'Tidsåtgången är oklar.');
  PERFORM pg_temp.ok(_as1 = _as2,
    'ER3.5 saving the identical assessment twice returns the recorded one');
  SELECT count(*) INTO _n FROM public.scp_interview_assessments
   WHERE case_id = e.case1 AND question_id = e.q1;
  PERFORM pg_temp.ok(_n = 1, 'ER3.6 one assessment row, live, not a superseded pair');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_record_assessment(%L, %L, 3, %L)', e.case1, e.q1, 'Annan motivering.'),
    'SCP_IV_SUPERSEDE_REASON_REQUIRED',
    'ER3.7 a CHANGED judgement without a documented reason is still refused');
  PERFORM pg_temp.ok(
    (SELECT rationale FROM public.scp_interview_assessments WHERE id = _as1) = 'Konkret handlande i rätt ordning.',
    'ER3.8 the recorded judgement did not drift under the refused change');

  -- Level 0 for everything else, exactly as the rubric defines it.
  FOR _q IN SELECT id FROM public.scp_interview_core_questions
             WHERE pack_version_id = e.packv AND id <> e.q1 LOOP
    PERFORM public.scp_iv_record_assessment(e.case1, _q, 0, 'Frågan hanns inte med; otillräcklig evidens.');
  END LOOP;
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER4 — an assessment covers the material that existed when it was made'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _ev uuid; _n integer; _live uuid; _newer uuid;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  PERFORM public.scp_iv_mark_assessed(e.case1);
  PERFORM public.scp_iv_mark_assessed(e.case1);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = e.case1) = 'assessed',
    'ER4.1 marking the assessment complete twice is one transition');
  SELECT count(*) INTO _n FROM public.scp_iv_report_blockers(e.case1);
  PERFORM pg_temp.ok(_n = 0, 'ER4.2 nothing blocks the report while every assessment covers its material');

  -- New material for Q1, confirmed after Q1 was assessed.
  _ev := public.scp_iv_author_evidence(e.case1, e.q1, 'Rapporterade händelsen skriftligt efteråt.', NULL, NULL, e.note1);
  RESET ROLE;
  -- "Later" inside one transaction: see the header.
  UPDATE public.scp_interview_evidence SET confirmed_at = confirmed_at + interval '1 minute' WHERE id = _ev;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_iv_report_blockers(e.case1)
             WHERE code = 'ASSESSMENT_PREDATES_MATERIAL' AND message LIKE 'Q1 %'),
    'ER4.3 the report is blocked: Q1 has material its assessment never saw');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_finalise_report(%L)', e.case1),
    'ASSESSMENT_PREDATES_MATERIAL',
    'ER4.4 finalising is refused for the same reason, inside the same transaction');
  SELECT id INTO _live FROM public.scp_interview_assessments
   WHERE case_id = e.case1 AND question_id = e.q1 AND superseded_by IS NULL;
  PERFORM pg_temp.ok(
    (SELECT level = 3 AND rationale = 'Konkret handlande i rätt ordning.'
       FROM public.scp_interview_assessments WHERE id = _live),
    'ER4.5 the assessment was NOT silently changed or removed -- it stands, uncovered');

  -- The human looks again, through the existing supersede path.
  _newer := public.scp_iv_record_assessment(e.case1, e.q1, 3,
    'Konkret handlande i rätt ordning, och skriftlig rapport efteråt.', NULL,
    'Nytt bekräftat underlag har tillkommit.');
  PERFORM pg_temp.ok(
    (SELECT superseded_by = _newer AND supersede_reason IS NOT NULL
       FROM public.scp_interview_assessments WHERE id = _live),
    'ER4.6 the earlier judgement survives, superseded with the documented reason');
  -- In production the re-assessment is a later transaction than the material
  -- it covers. Inside this one transaction both carry the same now(), so the
  -- minute added above is taken back: the material is now "at or before" the
  -- replacement, which is the production ordering.
  RESET ROLE;
  UPDATE public.scp_interview_evidence SET confirmed_at = confirmed_at - interval '1 minute' WHERE id = _ev;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');
  SELECT count(*) INTO _n FROM public.scp_iv_report_blockers(e.case1);
  PERFORM pg_temp.ok(_n = 0,
    'ER4.7 once the question is assessed again, nothing blocks the report');
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER5 — the finalised report is historical'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _r1 uuid; _r2 uuid; _payload jsonb; _hash text; _n integer; _ev uuid; _r3 uuid;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');

  _r1 := public.scp_iv_finalise_report(e.case1);
  _r2 := public.scp_iv_finalise_report(e.case1);
  PERFORM pg_temp.ok(_r1 = _r2, 'ER5.1 finalising twice returns the same report');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 1, 'ER5.2 one report version, not two');
  SELECT payload, content_hash INTO _payload, _hash FROM public.scp_interview_reports WHERE id = _r1;
  INSERT INTO er_snap VALUES ('v1', _payload, _hash);
  INSERT INTO er_ids VALUES ('report1', _r1);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_payload -> 'questions') q
      WHERE q ->> 'code' = 'Q1' AND jsonb_array_length(q -> 'evidence') = 4) = 1,
    'ER5.3 the frozen report carries Q1''s four confirmed items exactly once each');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_payload -> 'questions') q,
                          jsonb_array_elements(q -> 'evidence') ev) = 4,
    'ER5.4 and no evidence appears under any other question');
  PERFORM pg_temp.ok(
    _payload::text NOT LIKE '%ansökan 2%',
    'ER5.5 nothing from application 2 is in application 1''s report');

  -- Life goes on after the report is locked.
  _ev := public.scp_iv_author_evidence(e.case1, e.q2, 'Nytt underlag efter rapporten.', NULL, NULL, NULL);
  PERFORM public.scp_iv_record_assessment(e.case1, e.q2, 0, 'Fortfarande otillräcklig evidens.', NULL, 'Omläsning efter rapport.');
  UPDATE public.scp_interview_session_notes SET body = body || ' [ändrad efter rapport]' WHERE id = e.note1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'ER5.6 the interviewer can still edit their own note afterwards');
  RESET ROLE;
  UPDATE public.jobs SET title_sv = 'Ändrad titel' WHERE id = '83000000-0000-4000-8000-000000000001';
  UPDATE public.scp_interview_cases SET title = 'Ändrad rubrik' WHERE id = e.case1;

  PERFORM pg_temp.ok(
    (SELECT payload = _payload AND content_hash = _hash AND status = 'final' AND version_number = 1
       FROM public.scp_interview_reports WHERE id = _r1),
    'ER5.7 the locked report is byte-identical after evidence, assessment, note, job and case changes');
  PERFORM pg_temp.ok(
    position('job_applications' in pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0
    AND position('sp_claims' in pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0
    AND position('cv_documents' in pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0
    AND position('session_notes' in pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0,
    'ER5.8 the report builder never reads the application, Passport, CV or note tables');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', _r1),
    'SCP_IV_REPORT_IMMUTABLE',
    'ER5.9 even the superuser cannot edit a finalised report');

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET content_hash = ''x'' WHERE id = %L', _r1),
    'permission denied',
    'ER5.10 the owner has no UPDATE on reports at all');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_interview_reports WHERE id = %L', _r1),
    'permission denied',
    'ER5.11 nor DELETE');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_evidence SET excerpt = ''x'' WHERE case_id = %L', e.case1),
    'permission denied',
    'ER5.12 confirmed evidence cannot be rewritten by a client');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_interview_evidence WHERE case_id = %L', e.case1),
    'permission denied',
    'ER5.13 nor deleted');

  -- The material changed, so a NEW version can be produced -- and the old one
  -- stays exactly what it was.
  _r3 := public.scp_iv_finalise_report(e.case1);
  PERFORM pg_temp.ok(_r3 <> _r1, 'ER5.14 changed material yields a new report version, never a rewrite');
  PERFORM pg_temp.ok(
    (SELECT status = 'superseded' AND payload = _payload AND content_hash = _hash
       FROM public.scp_interview_reports WHERE id = _r1),
    'ER5.15 version 1 is superseded, and still byte-identical');
  -- Structure, not vocabulary: the pack's own wording is allowed to DENY
  -- ranking, and a requirement may legitimately say "tillämplig utbildning".
  -- What must be absent is any FIELD that could carry a verdict.
  PERFORM pg_temp.ok(
    (SELECT payload ->> 'decision_boundary' IS NOT NULL
        AND payload -> 'ai_disclosure' ->> 'statement' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload) k
           WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict|decision$)')
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(payload -> 'questions') q,
                        jsonb_object_keys(coalesce(q -> 'assessment', '{}'::jsonb)) k
           WHERE k ~* '(rank|score|total|suitab|recommend|hire|verdict)')
       FROM public.scp_interview_reports WHERE id = _r3),
    'ER5.16 the report states the decision boundary and has no field for a ranking, score, suitability or hiring verdict');
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER6 — who may finalise'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000a2');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_finalise_report(%L)', e.case1),
    'SCP_IV_FINALISE_ROLE',
    'ER6.1 a member cannot finalise, by direct RPC');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_evidence WHERE case_id = e.case1) > 0,
    'ER6.2 the same member reads the case''s evidence -- preparing is theirs, locking is not');
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT finalised_by FROM public.scp_interview_reports WHERE id = (SELECT v FROM er_ids WHERE k = 'report1'))
      = '81000000-0000-4000-8000-0000000000a1',
    'ER6.3 the owner finalised, and the report names them');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER7 — employer B is refused every read and write across the boundary'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _n integer; _prop uuid;
BEGIN
  SELECT * INTO e FROM er;
  SELECT id INTO _prop FROM public.scp_interview_evidence_proposals WHERE case_id = e.case1 LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000b1');

  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 0, 'ER7.1 B reads none of A''s evidence');
  SELECT count(*) INTO _n FROM public.scp_interview_assessments WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 0, 'ER7.2 nor A''s assessments');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 0, 'ER7.3 nor A''s report');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence_proposals WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 0, 'ER7.4 nor A''s AI proposals');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L)', e.case1, e.q1, 'Intrång.'),
    'SCP_IV_NOT_CASE_MEMBER', 'ER7.5 B cannot author evidence into A''s case');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_record_assessment(%L, %L, 0, %L)', e.case1, e.q1, 'Intrång.'),
    'SCP_IV_NOT_CASE_MEMBER', 'ER7.6 B cannot assess A''s interview');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_evidence_proposal(%L, %L)', _prop, 'accept'),
    'SCP_IV_NOT_CASE_MEMBER', 'ER7.7 B cannot decide on A''s proposals');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_mark_assessed(%L)', e.case1),
    'SCP_IV_NOT_CASE_MEMBER', 'ER7.8 B cannot move A''s case');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_finalise_report(%L)', e.case1),
    'SCP_IV_FINALISE_ROLE', 'ER7.9 B cannot finalise A''s report');
  -- B's OWN case, citing A's note: the guard, not the membership check, is
  -- what refuses this one.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L, NULL, NULL, %L)',
           e.case_b, e.q1, 'A:s anteckning i B:s ärende.', e.note1),
    'SCP_IV_EVIDENCE_ORIGIN_MISMATCH',
    'ER7.10 B cannot cite A''s note as provenance in B''s own case');
  UPDATE public.scp_interview_session_notes SET body = 'Överskriven av B' WHERE id = e.note1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 0, 'ER7.11 B''s update of A''s note touches zero rows');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_iv_report_blockers(e.case1) WHERE code = 'NOT_PERMITTED'),
    'ER7.12 the blocker list answers "not permitted", not "nothing blocks"');
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT body FROM public.scp_interview_session_notes WHERE id = e.note1) NOT LIKE 'Överskriven%',
    'ER7.13 and A''s note is unchanged');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER8 — the candidate has a login and no seat'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO e FROM er;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become('81000000-0000-4000-8000-0000000000c1');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE case_id IN (e.case1, e.case2);
  PERFORM pg_temp.ok(_n = 0, 'ER8.1 the candidate reads no evidence about themselves through this route');
  SELECT count(*) INTO _n FROM public.scp_interview_session_notes;
  PERFORM pg_temp.ok(_n = 0, 'ER8.2 nor any interviewer note');
  SELECT count(*) INTO _n FROM public.scp_interview_reports WHERE case_id = e.case1;
  PERFORM pg_temp.ok(_n = 0, 'ER8.3 nor the report');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_author_evidence(%L, %L, %L)', e.case1, e.q1, 'Jag själv.'),
    'SCP_IV_NOT_CASE_MEMBER', 'ER8.4 and cannot write evidence into their own interview');
  RESET ROLE;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ER9 — Level 0 and the prohibition surface are exactly as they were'; END $$;
-- ###########################################################################
DO $$
DECLARE e er%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO e FROM er;
  SELECT count(*) INTO _n FROM public.scp_interview_rating_anchors a
    JOIN public.scp_interview_core_questions q ON q.id = a.question_id
   WHERE q.pack_version_id = e.packv AND a.level = 0 AND a.counts_toward_aggregation;
  PERFORM pg_temp.ok(_n = 0, 'ER9.1 no level-0 anchor counts toward any aggregate');
  SELECT count(*) INTO _n FROM public.scp_interview_assessments
   WHERE case_id = e.case1 AND level = 0 AND superseded_by IS NULL;
  PERFORM pg_temp.ok(_n = 7, 'ER9.2 seven questions carry a live level 0 -- insufficient evidence, recorded honestly');
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.proname LIKE 'scp\_iv\_%' ESCAPE '\' OR p.proname LIKE 'scp\_interview\_%' ESCAPE '\')
     AND (p.proname LIKE '%total%' OR p.proname LIKE '%rank%'
          OR p.proname LIKE '%recommend%' OR p.proname LIKE '%suitab%' OR p.proname LIKE '%score%');
  PERFORM pg_temp.ok(_n = 0, 'ER9.3 no scoring, ranking, suitability or recommendation function exists');
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('scp_interview_evidence', 'scp_interview_assessments', 'scp_interview_reports')
     AND (column_name LIKE '%score%' OR column_name LIKE '%rank%' OR column_name LIKE '%confidence%'
          OR column_name LIKE '%suitab%' OR column_name LIKE '%recommend%');
  PERFORM pg_temp.ok(_n = 0, 'ER9.4 evidence, assessments and reports still hold no score, rank, confidence or recommendation column');
  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'scp_interview_evidence'
     AND grantee = 'authenticated' AND privilege_type <> 'SELECT';
  PERFORM pg_temp.ok(_n = 0, 'ER9.5 confirmed evidence is SELECT-only for clients: append-only is a grant, not a habit');
  PERFORM pg_temp.ok(
    (SELECT proacl IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM aclexplode(proacl) x JOIN pg_roles r ON r.oid = x.grantee
         WHERE r.rolname IN ('anon', 'authenticated'))
       FROM pg_proc WHERE proname = 'scp_iv_guard_evidence_origin_in_case'),
    'ER9.6 the origin guard is executable by neither anon nor authenticated');
END $$;

SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('request.jwt.claim.sub', NULL, true);

DO $$ BEGIN RAISE NOTICE 'Interview evidence reliability assertions passed.'; END $$;
ROLLBACK;
