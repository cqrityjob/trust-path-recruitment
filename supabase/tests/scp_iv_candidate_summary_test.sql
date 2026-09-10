-- E4 — the candidate-safe interview summary, in a real database.
--
-- The product question: can an employer give the interviewed person a useful
-- account of the conversation WITHOUT giving them the employer's private
-- judgement about them, and without the two documents becoming one?
--
-- Two employers. Employer A holds a case walked through the real RPCs to a
-- finalised report, with confirmed evidence on one competency and none on the
-- others, and a recorded assessment carrying a level and a rationale -- so the
-- "no rating reaches the candidate" assertions have something real to leak.
-- Employer B holds its own case. A member of A who may not release; the
-- candidate, who has a login and no seat; and anon.
--
--   S0  the contract as applied
--   S1  PRECONDITION: no summary before a finalised report, and finalising
--       one does not release anything
--   S2  PREVIEW: byte-identical to what release then writes
--   S3  CONTENT: governed areas and the candidate's own words, and NOTHING
--       carrying a level, a reviewer, a finding or an AI's wording
--   S4  IMMUTABLE AND VERSIONED: idempotent, superseding, frozen
--   S5  AUTHORITY AND ISOLATION: member, reviewer, other tenant, candidate,
--       anon
--   S6  THE CANDIDATE'S OWN READ, and what it refuses
--
-- Deterministic. No AI provider, no network. One transaction, rolled back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S0 — the contract as applied'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('scp_iv_build_candidate_summary','scp_iv_preview_candidate_summary',
                        'scp_iv_release_candidate_summary','scp_iv_my_candidate_summary',
                        'scp_iv_released_candidate_summary')
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path%') = 5,
  'S0.1 all five functions are SECURITY DEFINER with a pinned search_path');

SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.scp_iv_candidate_summaries', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_iv_candidate_summaries', 'SELECT')
  AND (SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.scp_iv_candidate_summaries'::regclass),
  'S0.2 the table has RLS on, no policy and no client read — the functions are the only doors');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
        'public.scp_iv_build_candidate_summary(uuid)'::regprocedure, 'EXECUTE'),
  'S0.3 the builder is not client-executable: it is the two callers'' shared derivation');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('91000000-0000-4000-8000-0000000000a1', 'cs-owner-a@test.local'),
  ('91000000-0000-4000-8000-0000000000a2', 'cs-member-a@test.local'),
  ('91000000-0000-4000-8000-0000000000a3', 'cs-admin-a@test.local'),
  ('91000000-0000-4000-8000-0000000000b1', 'cs-owner-b@test.local'),
  ('91000000-0000-4000-8000-0000000000c1', 'cs-candidate@test.local'),
  ('91000000-0000-4000-8000-0000000000d1', 'cs-stranger@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('92000000-0000-4000-8000-0000000000a1', 'CS Tenant A AB', 'cs-tenant-a-ab', 'active'),
  ('92000000-0000-4000-8000-0000000000b1', 'CS Tenant B AB', 'cs-tenant-b-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('91000000-0000-4000-8000-0000000000a1','92000000-0000-4000-8000-0000000000a1','owner','active'),
  ('91000000-0000-4000-8000-0000000000a2','92000000-0000-4000-8000-0000000000a1','member','active'),
  ('91000000-0000-4000-8000-0000000000a3','92000000-0000-4000-8000-0000000000a1','admin','active'),
  ('91000000-0000-4000-8000-0000000000b1','92000000-0000-4000-8000-0000000000b1','owner','active')
ON CONFLICT DO NOTHING;

ALTER TABLE public.jobs DISABLE TRIGGER USER;
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, published_at, expires_at)
VALUES ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-0000000000a1',
        'cs-job-1','csjob00001','Väktare, stationär bevakning','Static guard','published',
        'internal', now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.jobs ENABLE TRIGGER USER;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-0000000000a1','91000000-0000-4000-8000-0000000000c1', now())
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE cs (
  packv uuid, comp1 uuid, comp2 uuid,
  case_a uuid, sess_a uuid, note_a uuid, report_a uuid,
  case_b uuid, sess_b uuid, note_b uuid
) ON COMMIT DROP;
INSERT INTO cs DEFAULT VALUES;
GRANT ALL ON cs TO authenticated, anon;

CREATE TEMP TABLE cs_snap (k text PRIMARY KEY, payload jsonb, hash text, id uuid) ON COMMIT DROP;
GRANT ALL ON cs_snap TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.build_case(
  _emp uuid, _title text, _cand uuid, _ext text, _job uuid, _app uuid,
  OUT case_id uuid, OUT session_id uuid, OUT note_id uuid)
LANGUAGE plpgsql AS $$
DECLARE _packv uuid; _plan uuid; _q1 uuid;
BEGIN
  SELECT packv INTO _packv FROM cs;
  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';
  case_id := public.scp_iv_create_case(_emp, _title, _packv, 'Kandidat', _cand, _ext, _job, _app);
  PERFORM public.scp_iv_add_source(case_id, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(case_id);
  _plan := public.scp_iv_record_manual_prep_plan(case_id, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  session_id := public.scp_iv_start_session(case_id, 'Intervjuare');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (session_id, _q1, 'observation',
          'Kandidaten beskrev en olåst dörr som kontrollerades innan larm.', auth.uid())
  RETURNING id INTO note_id;
  PERFORM public.scp_iv_set_session_state(session_id, 'completed', 'evaluation', 'Höll strukturen.');
END $$;

DO $$
DECLARE _r record; _q record;
  _a1 uuid := '91000000-0000-4000-8000-0000000000a1';
  _b1 uuid := '91000000-0000-4000-8000-0000000000b1';
  _c1 uuid := '91000000-0000-4000-8000-0000000000c1';
BEGIN
  UPDATE cs SET packv = (SELECT v.id FROM public.scp_interview_pack_versions v
                          JOIN public.scp_interview_packs p ON p.id = v.pack_id
                         WHERE p.slug = 'vaktare-se');
  UPDATE cs SET comp1 = (SELECT id FROM public.scp_interview_pack_competencies
                          WHERE pack_version_id = (SELECT packv FROM cs)
                          ORDER BY display_order LIMIT 1),
                comp2 = (SELECT id FROM public.scp_interview_pack_competencies
                          WHERE pack_version_id = (SELECT packv FROM cs)
                          ORDER BY display_order OFFSET 1 LIMIT 1);

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_a1);
  SELECT * INTO _r FROM pg_temp.build_case(
    '92000000-0000-4000-8000-0000000000a1', 'A: kandidatsammanfattning', _c1, NULL,
    '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001');
  UPDATE cs SET case_a = _r.case_id, sess_a = _r.session_id, note_a = _r.note_id;

  -- Evidence review is its own stage: interview_complete -> evidence_review
  -- -> assessed. The product opens it explicitly, and so does this.
  PERFORM public.scp_iv_begin_evidence_review((SELECT case_a FROM cs));

  -- ONE competency with the candidate's own confirmed words, and the rest
  -- deliberately without: the summary has to be able to say both "you gave
  -- concrete examples here" and "we did not get to one here", and a fixture
  -- in which every area is covered proves only the first.
  PERFORM public.scp_iv_author_evidence(
    (SELECT case_a FROM cs),
    (SELECT id FROM public.scp_interview_core_questions
      WHERE pack_version_id = (SELECT packv FROM cs) AND code = 'Q1'),
    'Jag kontrollerade dörren, dokumenterade och larmade innan jag gick vidare.',
    NULL, (SELECT comp1 FROM cs), (SELECT note_a FROM cs));

  -- A recorded assessment on every question, carrying a LEVEL, a RATIONALE
  -- and an UNCERTAINTY NOTE. This is the employer's private judgement, and it
  -- exists here so that "none of it reaches the candidate" is asserted against
  -- a case that really has some.
  FOR _q IN SELECT id, code FROM public.scp_interview_core_questions
             WHERE pack_version_id = (SELECT packv FROM cs) ORDER BY display_order LOOP
    PERFORM public.scp_iv_record_assessment(
      (SELECT case_a FROM cs), _q.id,
      CASE WHEN _q.code = 'Q1' THEN 3 ELSE 0 END,
      CASE WHEN _q.code = 'Q1'
           THEN 'HEMLIG-MOTIVERING-Q1: konkret handlande i rätt ordning.'
           ELSE 'HEMLIG-MOTIVERING: frågan hanns inte med; otillräcklig evidens.' END,
      'HEMLIG-OSAKERHET: tidsåtgången är oklar.');
  END LOOP;
  PERFORM public.scp_iv_mark_assessed((SELECT case_a FROM cs));
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.become(_b1);
  SELECT * INTO _r FROM pg_temp.build_case(
    '92000000-0000-4000-8000-0000000000b1', 'B: egen intervju', NULL, 'B-EXT-1', NULL, NULL);
  UPDATE cs SET case_b = _r.case_id, sess_b = _r.session_id, note_b = _r.note_id;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_assessments a
    WHERE a.case_id = (SELECT case_a FROM cs)
      AND a.rationale LIKE 'HEMLIG-%') > 0,
  'S0.4 the fixture really holds private rationales — S3 has something to leak');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S1 — the report is a precondition, never a trigger'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');

SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_release_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_BEFORE_REPORT',
  'S1.1 nothing can be shared with the candidate before the employer report is finalised');

RESET ROLE;
-- The table has no client read at all, so every direct count in this suite
-- runs as the superuser. That is not a gap in the test: S5 proves the refusal
-- from each client role in its own right.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_candidate_summaries
    WHERE case_id = (SELECT case_a FROM cs)) = 0,
  'S1.2 and the refusal wrote nothing');

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');
DO $$ DECLARE _r uuid; BEGIN
  _r := public.scp_iv_finalise_report((SELECT case_a FROM cs));
  UPDATE cs SET report_a = _r;
END $$;
RESET ROLE;

SELECT pg_temp.ok((SELECT report_a FROM cs) IS NOT NULL, 'S1.3 the employer report is final');

-- THE SEPARATION. Finalising is one act; sharing is another. A product that
-- released the candidate's copy as a side effect of locking the employer's
-- would be sharing something with a person because somebody pressed a button
-- about somebody else.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_candidate_summaries
    WHERE case_id = (SELECT case_a FROM cs)) = 0,
  'S1.4 finalising the employer report released NOTHING to the candidate');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_case_events
    WHERE case_id = (SELECT case_a FROM cs) AND event = 'candidate_summary_released') = 0,
  'S1.5 and recorded no release event');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S2 — the preview IS what gets released'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');

INSERT INTO cs_snap (k, payload, hash, id)
SELECT 'preview', public.scp_iv_preview_candidate_summary((SELECT case_a FROM cs)), NULL, NULL;

SELECT pg_temp.ok(
  (SELECT payload FROM cs_snap WHERE k = 'preview') IS NOT NULL,
  'S2.1 an owner can preview what the candidate would receive');

RESET ROLE;
-- Previewing writes NOTHING. A "preview" that quietly created the row would
-- make the release button a formality.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_candidate_summaries
    WHERE case_id = (SELECT case_a FROM cs)) = 0,
  'S2.2 and previewing wrote nothing');

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');
DO $$ DECLARE _id uuid; BEGIN
  _id := public.scp_iv_release_candidate_summary((SELECT case_a FROM cs));
  INSERT INTO cs_snap (k, payload, hash, id) VALUES ('released', NULL, NULL, _id);
END $$;
RESET ROLE;
UPDATE cs_snap SET payload = s.payload, hash = s.content_hash
  FROM public.scp_iv_candidate_summaries s
 WHERE cs_snap.k = 'released' AND s.id = cs_snap.id;

-- THE ASSERTION THE PREVIEW EXISTS FOR. Not "similar", not "the same
-- sections": identical. A preview that is a re-rendering is a preview of
-- something else.
SELECT pg_temp.ok(
  (SELECT payload FROM cs_snap WHERE k = 'preview')
    = (SELECT payload FROM cs_snap WHERE k = 'released'),
  'S2.3 the released document is byte-for-byte the document that was previewed');

SELECT pg_temp.ok(
  (SELECT hash FROM cs_snap WHERE k = 'released')
    = md5((SELECT payload FROM cs_snap WHERE k = 'preview')::text),
  'S2.4 and its content hash is the hash of exactly that');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S3 — governed areas and the candidate''s own words, and nothing else'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

-- WHAT IS THERE.
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(payload -> 'areas') FROM cs_snap WHERE k = 'released')
    = (SELECT count(*) FROM public.scp_interview_pack_competencies
        WHERE pack_version_id = (SELECT packv FROM cs)),
  'S3.1 every competency the pinned pack defines is named');

SELECT pg_temp.ok(
  (SELECT payload::text LIKE '%Jag kontrollerade dörren%' FROM cs_snap WHERE k = 'released'),
  'S3.2 the candidate''s own confirmed words are given back to them');

SELECT pg_temp.ok(
  (SELECT count(*) FROM cs_snap, jsonb_array_elements(payload -> 'areas') a
    WHERE k = 'released' AND (a ->> 'covered')::boolean) = 1,
  'S3.3 exactly the one area with confirmed evidence is marked covered');
SELECT pg_temp.ok(
  (SELECT count(*) FROM cs_snap, jsonb_array_elements(payload -> 'areas') a
    WHERE k = 'released' AND NOT (a ->> 'covered')::boolean) > 0,
  'S3.4 and the areas without one are reported as such — coverage, not a verdict');

SELECT pg_temp.ok(
  (SELECT (payload ? 'limitations_sv') AND (payload ? 'limitations_en')
      AND (payload ? 'decision_sv') AND (payload ? 'decision_en')
     FROM cs_snap WHERE k = 'released'),
  'S3.5 it carries its limitations and says who makes the decision, in both languages');

-- WHAT IS NOT THERE. Each of these exists in this case and is employer-only.
SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%HEMLIG-MOTIVERING%'
      AND payload::text NOT LIKE '%HEMLIG-OSAKERHET%'
     FROM cs_snap WHERE k = 'released'),
  'S3.6 no assessment rationale and no uncertainty note — the employer''s private judgement stays private');

SELECT pg_temp.ok(
  (SELECT NOT (payload ? 'assessments') AND NOT (payload ? 'questions')
      AND NOT (payload ? 'unresolved') AND NOT (payload ? 'ai_disclosure')
      AND NOT (payload ? 'sources')
     FROM cs_snap WHERE k = 'released'),
  'S3.7 none of the employer report''s own sections is present');

SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%"level"%'
      AND payload::text NOT LIKE '%anchor%'
      AND payload::text NOT LIKE '%counts_toward_aggregation%'
      AND payload::text NOT LIKE '%assessor%'
      AND payload::text NOT LIKE '%confirmed_by%'
      AND payload::text NOT LIKE '%rationale%'
     FROM cs_snap WHERE k = 'released'),
  'S3.8 no level, no anchor, no assessor and no reviewer identity');

-- The interview QUESTIONS stay withheld. Publishing the pinned pack's Q1-Q8
-- turns a structured interview into a memory test and destroys the
-- comparability the whole method rests on -- and the candidate's own page
-- already says so.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_core_questions q, cs_snap
     WHERE q.pack_version_id = (SELECT packv FROM cs)
       AND cs_snap.k = 'released'
       AND cs_snap.payload::text LIKE '%' || left(q.prompt_sv, 40) || '%'),
  'S3.9 not one core question prompt reaches the candidate');

-- THE PRODUCT INVARIANT, asserted on the document itself.
--
-- The CONTENT half only: `limitations_*` and `decision_*` exist precisely to
-- say that this document contains no score, no ranking and no recommendation,
-- and a sweep that forbade those words everywhere would forbid the honest half
-- of the document. So the areas and the interview header are swept, and the
-- limitations are asserted separately to DENY them.
SELECT pg_temp.ok(
  (SELECT (payload -> 'areas')::text !~* '(total_?score|"rank"|ranking|percentile|pass_?fail|"passed"|rekommend|recommend|lämplig|suitab|poäng|score)'
      AND (payload -> 'interview')::text !~* '(total_?score|"rank"|ranking|percentile|pass_?fail|rekommend|recommend|lämplig|suitab)'
     FROM cs_snap WHERE k = 'released'),
  'S3.10 no total, no rank, no percentile, no pass/fail, no recommendation, no suitability in the content');

SELECT pg_temp.ok(
  (SELECT (payload ->> 'limitations_sv') ~* 'poäng'
      AND (payload ->> 'limitations_sv') ~* 'rangordning'
      AND (payload ->> 'limitations_sv') ~* 'rekommendation'
      AND (payload ->> 'limitations_en') ~* 'score'
      AND (payload ->> 'limitations_en') ~* 'ranking'
      AND (payload ->> 'limitations_en') ~* 'recommendation'
     FROM cs_snap WHERE k = 'released'),
  'S3.11 and the limitations say so explicitly, in both languages');

-- An area with no examples is a statement about the CONVERSATION. The
-- limitations have to carry that, or "covered: false" reads as a finding
-- about the person.
SELECT pg_temp.ok(
  (SELECT (payload ->> 'limitations_sv') ~* 'hann'
      AND (payload ->> 'limitations_en') ~* 'did not get there'
     FROM cs_snap WHERE k = 'released'),
  'S3.12 and an uncovered area is explained as time, not as missing experience');

-- The decision belongs to the employer, said in the document.
SELECT pg_temp.ok(
  (SELECT (payload ->> 'decision_sv') ~* 'arbetsgivaren'
      AND (payload ->> 'decision_en') ~* 'employer'
     FROM cs_snap WHERE k = 'released'),
  'S3.13 and the document says the employer makes the decision');

-- AND NO OTHER CANDIDATE, EVER.
SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%B-EXT-1%' AND payload::text NOT LIKE '%Tenant B%'
     FROM cs_snap WHERE k = 'released'),
  'S3.14 nothing from another case or another tenant appears in it');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S4 — immutable, idempotent, versioned'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');

-- TWO CLICKS ARE ONE SHARE. A retry after a lost response finds the share it
-- already made rather than making a second one.
DO $$ DECLARE _again uuid; BEGIN
  _again := public.scp_iv_release_candidate_summary((SELECT case_a FROM cs));
  PERFORM pg_temp.ok(_again = (SELECT id FROM cs_snap WHERE k = 'released'),
    'S4.1 an unchanged re-release returns the version that already exists');
END $$;

RESET ROLE;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_candidate_summaries
    WHERE case_id = (SELECT case_a FROM cs)) = 1,
  'S4.2 and creates no second row');
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');

-- A CHANGED SUMMARY IS A NEW VERSION, and the old one is superseded rather
-- than rewritten. What the person was told before is still what they were told.
DO $$ DECLARE _v2 uuid; BEGIN
  PERFORM public.scp_iv_author_evidence(
    (SELECT case_a FROM cs),
    (SELECT id FROM public.scp_interview_core_questions
      WHERE pack_version_id = (SELECT packv FROM cs) AND code = 'Q2'),
    'Jag ringde in avvikelsen och skrev rapport samma kväll.',
    NULL, (SELECT comp2 FROM cs), NULL);
  _v2 := public.scp_iv_release_candidate_summary((SELECT case_a FROM cs));
  INSERT INTO cs_snap (k, payload, hash, id) VALUES ('v2', NULL, NULL, _v2);
END $$;
RESET ROLE;
UPDATE cs_snap SET payload = s.payload, hash = s.content_hash
  FROM public.scp_iv_candidate_summaries s
 WHERE cs_snap.k = 'v2' AND s.id = cs_snap.id;

SELECT pg_temp.ok(
  (SELECT id FROM cs_snap WHERE k = 'v2') <> (SELECT id FROM cs_snap WHERE k = 'released'),
  'S4.3 a changed summary is a new row');
SELECT pg_temp.ok(
  (SELECT version_number FROM public.scp_iv_candidate_summaries
    WHERE id = (SELECT id FROM cs_snap WHERE k = 'v2')) = 2,
  'S4.4 numbered 2');
SELECT pg_temp.ok(
  (SELECT status FROM public.scp_iv_candidate_summaries
    WHERE id = (SELECT id FROM cs_snap WHERE k = 'released')) = 'superseded',
  'S4.5 and the previous version is superseded, not deleted');

-- THE IMMUTABILITY THAT MATTERS. Version 1's payload is byte-for-byte what it
-- was when it was shared, although the case has changed underneath it.
SELECT pg_temp.ok(
  (SELECT payload FROM public.scp_iv_candidate_summaries
    WHERE id = (SELECT id FROM cs_snap WHERE k = 'released'))
    = (SELECT payload FROM cs_snap WHERE k = 'preview'),
  'S4.6 the superseded version still holds exactly what was shared');
SELECT pg_temp.ok(
  (SELECT payload FROM cs_snap WHERE k = 'v2')
    <> (SELECT payload FROM cs_snap WHERE k = 'released'),
  'S4.7 while the new one reflects the new evidence');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_case_events
    WHERE case_id = (SELECT case_a FROM cs) AND event = 'candidate_summary_released') = 2,
  'S4.8 and both releases are in the ledger — the idempotent retry is not a third');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S5 — release authority, and isolation'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

-- An ADMIN may, exactly as they may finalise.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.ok(
  public.scp_iv_preview_candidate_summary((SELECT case_a FROM cs)) IS NOT NULL,
  'S5.1 an admin may preview — the same authority finalising requires');
RESET ROLE;

-- An ordinary MEMBER may not, either act.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_preview_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_PREVIEW_ROLE',
  'S5.2 an ordinary member cannot preview what the candidate would receive');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_release_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_RELEASE_ROLE',
  'S5.3 and cannot share it');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_released_candidate_summary((SELECT case_a FROM cs))) = 0,
  'S5.4 and reads nothing of what was shared');
RESET ROLE;

-- Another tenant's owner: nothing, from any door.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000b1');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_preview_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_PREVIEW_ROLE', 'S5.5 another tenant''s owner cannot preview it');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_release_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_RELEASE_ROLE', 'S5.6 or share it');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_released_candidate_summary((SELECT case_a FROM cs))) = 0,
  'S5.7 or read it');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_my_candidate_summary((SELECT case_a FROM cs))) = 0,
  'S5.8 and the candidate door gives them nothing either');
RESET ROLE;

-- A signed-in stranger with no membership anywhere.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000d1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_my_candidate_summary((SELECT case_a FROM cs))) = 0,
  'S5.9 a stranger reads nothing');
RESET ROLE;

-- Anon reaches no function and no table.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_my_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'permission denied', 'S5.10 anon cannot execute the candidate read');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_release_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'permission denied', 'S5.11 or the release');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_iv_candidate_summaries',
  'permission denied', 'S5.12 or read the table at all');
RESET ROLE;

-- The CANDIDATE may not release their own summary either.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000c1');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_release_candidate_summary(%L)', (SELECT case_a FROM cs)),
  'SCP_IV_SUMMARY_RELEASE_ROLE', 'S5.13 the candidate cannot release their own summary');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_iv_candidate_summaries',
  'permission denied', 'S5.14 and cannot read the table');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S6 — the candidate''s own read'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000c1');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_my_candidate_summary((SELECT case_a FROM cs))) = 1,
  'S6.1 the candidate reads exactly one summary — the released version');
SELECT pg_temp.ok(
  (SELECT version_number FROM public.scp_iv_my_candidate_summary((SELECT case_a FROM cs))) = 2,
  'S6.2 and it is the current one, not the superseded one');
SELECT pg_temp.ok(
  (SELECT payload FROM public.scp_iv_my_candidate_summary((SELECT case_a FROM cs)))
    = (SELECT payload FROM cs_snap WHERE k = 'v2'),
  'S6.3 byte-for-byte what the employer released');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_my_candidate_summary((SELECT case_b FROM cs))) = 0,
  'S6.4 and nothing at all for a case that is not theirs');

-- The employer's verification read returns the SAME document, which is what
-- makes "here is what we shared" a fact rather than a description.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.ok(
  (SELECT payload FROM public.scp_iv_released_candidate_summary((SELECT case_a FROM cs)))
    = (SELECT payload FROM cs_snap WHERE k = 'v2'),
  'S6.5 the employer verifies the exact document the candidate reads');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_released_candidate_summary((SELECT case_a FROM cs))) = 1,
  'S6.6 and sees only the released version');
RESET ROLE;

-- ── THE FACT-ONLY READ ─────────────────────────────────────────────
--
-- The strip has to tell "finalised, nothing shared" from "shared on a date",
-- and an ordinary member sees that distinction because it is about their own
-- organisation's process. What they must NOT get is the document.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_application_summary_releases(
     '94000000-0000-4000-8000-000000000001')) = 1,
  'S6.8 an ordinary member learns that a summary was shared, and when');
SELECT pg_temp.ok(
  (SELECT version_number FROM public.scp_iv_application_summary_releases(
     '94000000-0000-4000-8000-000000000001')) = 2,
  'S6.9 including which version — a superseded one is not counted');
-- And still not the document.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_released_candidate_summary((SELECT case_a FROM cs))) = 0,
  'S6.10 while the document itself stays owner/admin-only');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000b1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_application_summary_releases(
     '94000000-0000-4000-8000-000000000001')) = 0,
  'S6.11 another tenant learns nothing, not even that one exists');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_iv_application_summary_releases(''94000000-0000-4000-8000-000000000001'')',
  'permission denied', 'S6.12 and anon cannot execute it');
RESET ROLE;

-- A case with nothing released: zero rows, not an error, from both doors.
SET LOCAL ROLE authenticated;
SELECT pg_temp.become('91000000-0000-4000-8000-0000000000b1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_iv_released_candidate_summary((SELECT case_b FROM cs))) = 0,
  'S6.7 an unreleased case reads as nothing, not as a failure');
RESET ROLE;


ROLLBACK;
