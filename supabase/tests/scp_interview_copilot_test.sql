-- Interview Copilot — the first real AI vertical, as a contract.
--
-- The product claim being tested is narrow and specific: an AI may read what a
-- recruiter wrote, organise it and propose evidence, and it may do that only
-- in the TRUST stage that permits the task. Everything after that is a human's
-- to do. These assertions are the difference between that claim and a story.
--
-- Deterministic. No AI is invoked, no network is touched. Everything rolls back.

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


-- ---------------------------------------------------------------------------
-- Fixtures: an active employer, a candidate with no membership, another
-- tenant, and a case driven to a completed interview with real notes.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('dddd0000-0000-4000-8000-000000000001', 'copilot-owner@test.local'),
  ('dddd0000-0000-4000-8000-000000000002', 'copilot-candidate@test.local'),
  ('dddd0000-0000-4000-8000-000000000003', 'copilot-other@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('dddd0000-0000-4000-8000-00000000000a', 'Copilot AB', 'copilot-ab', 'active'),
  ('dddd0000-0000-4000-8000-00000000000b', 'Annan AB',   'copilot-other-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('dddd0000-0000-4000-8000-000000000001','dddd0000-0000-4000-8000-00000000000a','owner','active'),
  ('dddd0000-0000-4000-8000-000000000003','dddd0000-0000-4000-8000-00000000000b','owner','active')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE cp (case_id uuid, session_id uuid, note_id uuid, q1 uuid, q2 uuid)
  ON COMMIT DROP;

DO $$
DECLARE
  _packv uuid; _case uuid; _sess uuid; _note uuid; _q1 uuid; _q2 uuid; _plan uuid;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
  _emp uuid := 'dddd0000-0000-4000-8000-00000000000a';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  _case := public.scp_iv_create_case(_emp, 'Copilot', _packv, 'Kandidat', NULL, 'CP-1');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.\n\nKrav: VU1 och VU2.',
    'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervju 1');

  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';
  SELECT id INTO _q2 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q2';
  RESET ROLE;

  -- The note the whole vertical hangs on.
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body)
  VALUES (_sess, _q1, 'observation',
    'Kandidaten beskrev en rondering där hen upptäckte en olarmad bakdörr, säkrade den, kontrollerade lokalen och larmade driftledningen innan rapport skrevs.')
  RETURNING id INTO _note;

  INSERT INTO cp VALUES (_case, _sess, _note, _q1, _q2);
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP1 — Understand permits zero model calls'; END $$;
-- ===========================================================================

-- Requirement 3. The live interview must never reach a language model. The
-- case is interview_in_progress, so it is in Understand.
DO $$
DECLARE _case uuid; _t record; _n integer := 0;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM cp;

  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'understand',
    'CP1.1 a live interview sits in the Understand stage');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.scp_trust_stage_ai_tasks st
        JOIN public.scp_trust_stages s ON s.id = st.stage_id
       WHERE s.stage_key = 'understand'),
    'CP1.2 the method binds NO AI task to Understand');

  -- Every active task, refused. Not a sample: all of them.
  --
  -- The list is gathered BEFORE the role switch: scp_ai_tasks is behind RLS,
  -- so reading it as `authenticated` returns nothing and the loop would
  -- silently assert against an empty set -- a test that passes by testing
  -- nothing.
  CREATE TEMP TABLE cp_tasks ON COMMIT DROP AS
    SELECT task_key FROM public.scp_ai_tasks WHERE activation_status = 'active';
  GRANT SELECT ON cp_tasks TO authenticated;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  FOR _t IN SELECT task_key FROM cp_tasks LOOP
    PERFORM pg_temp.must_fail(
      format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
             _case, _t.task_key, 'deterministic', 'deterministic-rules-1.0.0', 'synthetic'),
      'SCP_TRUST_TASK',
      format('CP1.3 "%s" is refused during the live interview', _t.task_key));
    _n := _n + 1;
  END LOOP;
  RESET ROLE;

  PERFORM pg_temp.ok(_n >= 11,
    format('CP1.4 every one of the %s active tasks was attempted and refused', _n));

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_ai_runs WHERE case_id = _case) = 0,
    'CP1.5 and not one run row exists — refusal happens before anything is recorded');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP2 — evidence tasks run only in Structure'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _sess uuid; _run uuid;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id, session_id INTO _case, _sess FROM cp;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_set_session_state(_sess, 'completed', 'evaluation', NULL, 'Reflektion.');
  RESET ROLE;

  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'structure',
    'CP2.1 a completed interview moves the case into Structure');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  _run := public.scp_iv_ai_run_start(_case, 'evidence_extraction',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  PERFORM pg_temp.ok(_run IS NOT NULL,
    'CP2.2 evidence_extraction is permitted in Structure');

  PERFORM pg_temp.ok(
    public.scp_iv_ai_run_start(_case, 'evidence_dimension_mapping',
      'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic') IS NOT NULL,
    'CP2.3 evidence_dimension_mapping too');

  -- A Trace task is refused here. This is why the product runs it AFTER the
  -- transition rather than bending the allowlist to fit one button.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'gap_and_contradiction_detection', 'deterministic',
           'deterministic-rules-1.0.0', 'synthetic'),
    'SCP_TRUST_TASK_WRONG_STAGE',
    'CP2.4 gap_and_contradiction_detection is REFUSED in Structure');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'report_draft_generation', 'deterministic',
           'deterministic-rules-1.0.0', 'synthetic'),
    'SCP_TRUST_TASK_WRONG_STAGE',
    'CP2.5 and so is report_draft_generation');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP3 — the note follows the question, untouched'; END $$;
-- ===========================================================================

-- Requirements 1 and 2: the recruiter never retypes, and the original note
-- survives everything that happens downstream of it.
DO $$
DECLARE
  _case uuid; _note uuid; _q1 uuid; _q2 uuid; _run uuid; _prop uuid;
  _body text; _before text; _ev uuid;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id, note_id, q1, q2 INTO _case, _note, _q1, _q2 FROM cp;
  SELECT body INTO _before FROM public.scp_interview_session_notes WHERE id = _note;

  -- The note is already attached to its question. Nothing re-selects it.
  PERFORM pg_temp.ok(
    (SELECT question_id FROM public.scp_interview_session_notes WHERE id = _note) = _q1,
    'CP3.1 the note is stored against Q1 — evidence review can find it without being told');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _run := public.scp_iv_ai_run_start(_case, 'evidence_extraction',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');

  PERFORM public.scp_iv_record_evidence_proposals(_run, jsonb_build_array(
    jsonb_build_object(
      'noteId', _note::text,
      'excerpt', 'säkrade den, kontrollerade lokalen och larmade driftledningen',
      'questionId', _q1::text,
      'extractionConfidence', '0.8',
      'relevanceRationale', 'Beskriver eget handlande i rätt ordning.',
      'e1Situation', 'Rondering, olarmad bakdörr.',
      'e3Action', 'Säkrade dörren och larmade driftledningen.'
    )));
  RESET ROLE;

  SELECT id INTO _prop FROM public.scp_interview_evidence_proposals WHERE ai_run_id = _run;

  PERFORM pg_temp.ok(
    (SELECT note_id FROM public.scp_interview_evidence_proposals WHERE id = _prop) = _note,
    'CP3.2 the proposal cites the note it came from');
  PERFORM pg_temp.ok(
    (SELECT question_id FROM public.scp_interview_evidence_proposals WHERE id = _prop) = _q1,
    'CP3.3 and carries the question the note was written under');

  -- 5E rode along as description.
  PERFORM pg_temp.ok(
    (SELECT e1_situation IS NOT NULL AND e3_action IS NOT NULL AND e5_reflection IS NULL
       FROM public.scp_interview_evidence_proposals WHERE id = _prop),
    'CP3.4 5E is stored where present and left NULL where the account had none');

  -- A human edits and confirms. The note must not move.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _ev := public.scp_iv_confirm_evidence_proposal(_prop, 'edit',
           'Säkrade dörren, kontrollerade lokalen, larmade driftledningen.',
           'user_preference', 'Kortare formulering.', NULL, NULL, NULL, NULL, NULL);
  RESET ROLE;

  SELECT body INTO _body FROM public.scp_interview_session_notes WHERE id = _note;
  PERFORM pg_temp.ok(_body = _before,
    'CP3.5 the ORIGINAL note is byte-identical after extraction, edit and confirmation');

  PERFORM pg_temp.ok(
    (SELECT original_excerpt FROM public.scp_interview_evidence WHERE id = _ev)
      = 'säkrade den, kontrollerade lokalen och larmade driftledningen',
    'CP3.6 the AI''s original wording survives beside the human''s correction');
  PERFORM pg_temp.ok(
    (SELECT origin FROM public.scp_interview_evidence WHERE id = _ev) = 'ai_proposed_edited',
    'CP3.7 and the evidence records that a human corrected it');
  PERFORM pg_temp.ok(
    (SELECT note_id FROM public.scp_interview_evidence WHERE id = _ev) = _note,
    'CP3.8 confirmed evidence still points back at the note');
  PERFORM pg_temp.ok(
    (SELECT confirmed_by FROM public.scp_interview_evidence WHERE id = _ev) = _owner,
    'CP3.9 and names the human who confirmed it');
  PERFORM pg_temp.ok(
    (SELECT e1_situation FROM public.scp_interview_evidence WHERE id = _ev) IS NOT NULL,
    'CP3.10 the engine''s 5E carries forward when the human does not replace it');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP4 — a proposal never becomes evidence by itself'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _note uuid; _run uuid; _prop uuid; _n integer; _q1 uuid;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
  _cand uuid := 'dddd0000-0000-4000-8000-000000000002';
BEGIN
  -- Read the fixture BEFORE any role switch: `cp` is a temp table owned by
  -- the suite, and `authenticated` has no grant on it.
  SELECT case_id, note_id, q1 INTO _case, _note, _q1 FROM cp;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _run := public.scp_iv_ai_run_start(_case, 'evidence_extraction',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  PERFORM public.scp_iv_record_evidence_proposals(_run, jsonb_build_array(
    jsonb_build_object('noteId', _note::text, 'excerpt', 'kontrollerade lokalen',
      'questionId', _q1::text, 'extractionConfidence', '0.5',
      'relevanceRationale', 'Kontroll av antaganden.')));
  RESET ROLE;

  SELECT id INTO _prop FROM public.scp_interview_evidence_proposals
   WHERE ai_run_id = _run ORDER BY created_at DESC LIMIT 1;

  PERFORM pg_temp.ok(
    (SELECT review_state FROM public.scp_interview_evidence_proposals WHERE id = _prop) = 'pending',
    'CP4.1 a fresh proposal is pending — recording it created no evidence');

  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE proposal_id = _prop;
  PERFORM pg_temp.ok(_n = 0,
    'CP4.2 no evidence row exists for an unreviewed proposal');

  -- A candidate cannot confirm it into existence.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cand::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_evidence_proposal(%L, %L, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)',
           _prop, 'accept'),
    'SCP_IV_NOT_CASE_MEMBER',
    'CP4.3 a candidate cannot confirm a proposal');
  RESET ROLE;

  -- Nor can anyone review it twice.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_confirm_evidence_proposal(_prop, 'reject', NULL,
    'ai_model_error', 'Inte relevant.', NULL, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_evidence_proposal(%L, %L, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)',
           _prop, 'accept'),
    'SCP_IV_PROPOSAL_ALREADY_REVIEWED',
    'CP4.4 a reviewed proposal cannot be re-decided');
  RESET ROLE;

  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE proposal_id = _prop;
  PERFORM pg_temp.ok(_n = 0,
    'CP4.5 a rejected proposal produced no evidence');

  PERFORM pg_temp.ok(
    (SELECT body FROM public.scp_interview_session_notes WHERE id = _note) LIKE '%olarmad bakdörr%',
    'CP4.6 and rejection did not touch the note either');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP5 — assessment is the human''s, and rests on confirmed evidence'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _q1 uuid; _q2 uuid; _cols text;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id, q1, q2 INTO _case, _q1, _q2 FROM cp;

  -- The AI has no way to write a level: the only writer takes no actor
  -- argument and stamps auth.uid(), so a run cannot author an assessment.
  SELECT pg_get_function_identity_arguments(oid) INTO _cols
    FROM pg_proc WHERE proname = 'scp_iv_record_assessment';
  PERFORM pg_temp.ok(_cols NOT ILIKE '%run%' AND _cols NOT ILIKE '%actor%',
    'CP5.1 the assessment writer takes no AI run and no actor — it is always the caller');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_interview_assessments' AND column_name = 'ai_run_id') = 0,
    'CP5.2 an assessment cannot even reference an AI run');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- Q2 has no confirmed evidence, so only level 0 is available.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_record_assessment(%L, %L, 3, %L, NULL, NULL)',
           _case, _q2, 'Motivering som är tillräckligt lång för regeln.'),
    'SCP_IV_NO_CONFIRMED_EVIDENCE',
    'CP5.3 level 3 without confirmed evidence is refused');

  PERFORM pg_temp.ok(
    public.scp_iv_record_assessment(_case, _q2, 0,
      'Ingen evidens samlades in för den här frågan.', NULL, NULL) IS NOT NULL,
    'CP5.4 level 0 is the available judgement when evidence is missing');

  -- Q1 has confirmed evidence from CP3, so a level above 0 is reachable.
  PERFORM pg_temp.ok(
    public.scp_iv_record_assessment(_case, _q1, 3,
      'Kandidaten beskrev eget handlande i rätt ordning, mot bekräftad evidens.',
      NULL, NULL) IS NOT NULL,
    'CP5.5 and a level above 0 is reachable once evidence is confirmed');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assessor_id FROM public.scp_interview_assessments
      WHERE case_id = _case AND question_id = _q1 AND superseded_by IS NULL) = _owner,
    'CP5.6 the assessment names the human who made it');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP6 — Trace tasks, and what a report may rest on'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _run uuid;
  _owner uuid := 'dddd0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM cp;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_begin_evidence_review(_case);
  RESET ROLE;

  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'trace',
    'CP6.1 evidence review puts the case in Trace');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _run := public.scp_iv_ai_run_start(_case, 'gap_and_contradiction_detection',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  PERFORM pg_temp.ok(_run IS NOT NULL,
    'CP6.2 gap_and_contradiction_detection is permitted HERE — this is why the orchestrator waits');

  PERFORM pg_temp.ok(
    public.scp_iv_ai_run_start(_case, 'report_draft_generation',
      'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic') IS NOT NULL,
    'CP6.3 and so is the report draft');

  -- Extraction is now out of stage: the sequence only works in one order.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'evidence_extraction', 'deterministic',
           'deterministic-rules-1.0.0', 'synthetic'),
    'SCP_TRUST_TASK_WRONG_STAGE',
    'CP6.4 evidence_extraction is refused once the case has left Structure');
  RESET ROLE;

  -- A findings row is a prompt for a human, never a conclusion carrying a level.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_interview_findings'
        AND column_name IN ('level', 'score', 'rating', 'rank')) = 0,
    'CP6.5 a finding carries no level, score, rating or rank');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP7 — candidates, anon and other tenants see none of it'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _n integer;
  _cand uuid := 'dddd0000-0000-4000-8000-000000000002';
  _other uuid := 'dddd0000-0000-4000-8000-000000000003';
BEGIN
  SELECT case_id INTO _case FROM cp;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cand::text, true);
  SELECT count(*) INTO _n FROM public.scp_interview_session_notes;
  PERFORM pg_temp.ok(_n = 0, 'CP7.1 a candidate reads no interview notes');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence_proposals;
  PERFORM pg_temp.ok(_n = 0, 'CP7.2 no AI proposals');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence;
  PERFORM pg_temp.ok(_n = 0, 'CP7.3 no confirmed evidence');
  SELECT count(*) INTO _n FROM public.scp_interview_assessments;
  PERFORM pg_temp.ok(_n = 0, 'CP7.4 no assessments');
  SELECT count(*) INTO _n FROM public.scp_interview_findings;
  PERFORM pg_temp.ok(_n = 0, 'CP7.5 no findings');
  SELECT count(*) INTO _n FROM public.scp_interview_ai_runs;
  PERFORM pg_temp.ok(_n = 0, 'CP7.6 and no AI runs — no prompts or raw model output');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  SELECT count(*) INTO _n FROM public.scp_interview_session_notes;
  PERFORM pg_temp.ok(_n = 0, 'CP7.7 another tenant reads no notes from this case');
  SELECT count(*) INTO _n FROM public.scp_interview_evidence_proposals;
  PERFORM pg_temp.ok(_n = 0, 'CP7.8 nor its proposals');
  RESET ROLE;

  -- anon is refused harder than the candidate: it holds no table grant at
  -- all, so the read is denied outright rather than filtered to zero rows.
  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail(
    'SELECT count(*) FROM public.scp_interview_session_notes',
    'permission denied',
    'CP7.9 anon cannot even read the notes table');
  PERFORM pg_temp.must_fail(
    'SELECT count(*) FROM public.scp_interview_evidence',
    'permission denied',
    'CP7.10 nor the evidence table');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP8 — 5E describes; it never scores'; END $$;
-- ===========================================================================

DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name ~ '^e[1-5]_' AND data_type <> 'text';
  PERFORM pg_temp.ok(_n = 0, 'CP8.1 every 5E column is text — none is a number');

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name ~ '^e[1-5]_' AND is_nullable = 'NO';
  PERFORM pg_temp.ok(_n = 0,
    'CP8.2 all are nullable — a missing E is a gap to ask about, not a write error');

  -- Nothing anywhere counts, totals, weights or thresholds a 5E field.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~* '(count|sum|avg)\s*\(\s*[^)]*e[1-5]_';
  PERFORM pg_temp.ok(_n = 0, 'CP8.3 no function aggregates a 5E field');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('e_completeness', 'five_e_score', 'evidence_score')) = 0,
    'CP8.4 and no completeness column has appeared');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CP9 — no scoring vocabulary entered the schema'; END $$;
-- ===========================================================================

DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO _bad
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name LIKE 'scp_interview%'
     AND (column_name ~* '(total_score|overall_score|suitability|ranking|rank_position|pass_fail|hire_recommendation|credibility|deception)');
  PERFORM pg_temp.ok(_bad IS NULL,
    format('CP9.1 no scoring/verdict column exists (found: %s)', coalesce(_bad, 'none')));

  -- The one place a number is legitimate is the human's own level, which is
  -- per question, never aggregated, and level 0 means "not enough evidence".
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_interview_assessments' AND column_name = 'level') = 1,
    'CP9.2 the only level is the human''s per-question judgement');
END $$;

ROLLBACK;
