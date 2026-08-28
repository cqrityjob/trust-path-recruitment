-- CQrity Interview Intelligence — the employer runtime, end to end.
--
-- Proves the properties the product rests on:
--
--   1. The WHOLE journey runs: case -> sources -> AI prep -> human approval ->
--      interview -> AI proposals -> human confirmation -> assessment -> report.
--   2. An AI output cannot become evidence without a named human, and a
--      rejected proposal never reaches a report.
--   3. Human corrections preserve the original AI wording.
--   4. Q1-Q8 and the pinned pack cannot be changed from the runtime.
--   5. Tenant isolation: another employer sees nothing, a candidate sees
--      nothing, anon sees nothing.
--   6. Level 0 stays insufficient evidence and never becomes a low score; no
--      total, ranking or recommendation exists anywhere.
--   7. Reports are immutable and the audit ledger is append-only.
--
-- Everything rolls back.

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

-- The runtime domain, named explicitly. "scp_interview_%" is not the domain:
-- the Phase 1 content tables and two assessment tables share the prefix.
CREATE OR REPLACE FUNCTION pg_temp.runtime_tables() RETURNS TABLE (t text)
LANGUAGE sql AS $$
  SELECT unnest(ARRAY[
    'scp_interview_ai_config','scp_interview_pack_pilot_grants','scp_interview_cases',
    'scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs',
    'scp_interview_ai_run_retrievals','scp_interview_role_requirements',
    'scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items',
    'scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes',
    'scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence',
    'scp_interview_findings','scp_interview_assessments','scp_interview_reports',
    'scp_interview_case_events']);
$$;

-- THIS suite's case, not whichever row happens to sort first.
--
-- These assertions used "FROM scp_interview_cases LIMIT 1", which is correct
-- only while the suite's own rows are the only ones present. The moment a real
-- case existed in the same database -- a developer walking the journey in a
-- browser -- the unscoped pick returned someone else's case and the assertions
-- failed as SCP_IV_NOT_CASE_MEMBER, which looks like a product bug and is not.
CREATE OR REPLACE FUNCTION pg_temp.suite_case() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM public.scp_interview_cases
   WHERE employer_id = '33330000-0000-0000-0000-00000000000a'
   ORDER BY created_at LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Fixture: two employers, so cross-tenant denial is testable, plus a candidate.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('22220000-0000-0000-0000-0000000000a1', 'owner-a@test.local'),
  ('22220000-0000-0000-0000-0000000000a2', 'member-a@test.local'),
  ('22220000-0000-0000-0000-0000000000b1', 'owner-b@test.local'),
  ('22220000-0000-0000-0000-0000000000c1', 'candidate@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('33330000-0000-0000-0000-00000000000a', 'Employer A', 'employer-a-iv', 'active'),
  ('33330000-0000-0000-0000-00000000000b', 'Employer B', 'employer-b-iv', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('22220000-0000-0000-0000-0000000000a1','33330000-0000-0000-0000-00000000000a','owner','active'),
  ('22220000-0000-0000-0000-0000000000a2','33330000-0000-0000-0000-00000000000a','member','active'),
  ('22220000-0000-0000-0000-0000000000b1','33330000-0000-0000-0000-00000000000b','owner','active')
ON CONFLICT DO NOTHING;


DO $$ BEGIN RAISE NOTICE 'GROUP R1 — the pack pilot boundary'; END $$;

-- The Vaktare pack is draft/pilot_hypothesis. Without a grant it cannot be used
-- at all: the owner decision permits a controlled pilot, not free use.
DO $$
DECLARE _packv uuid;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000a1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)',
           '33330000-0000-0000-0000-00000000000a', 'No grant', _packv, 'X'),
    'SCP_IV_PACK_NOT_USABLE',
    'R1.1 an unpublished pack cannot be used without an explicit pilot grant');
  RESET ROLE;

  -- A grant states its usage mode, its environment and when it ends. There is
  -- no such thing as an open-ended pilot.
  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
  VALUES ('33330000-0000-0000-0000-00000000000a', _packv, 'Kontrollerad intern pilot.',
          'internal_qa', 'development', current_date + 30)
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.ok(
    (SELECT content_status FROM public.scp_interview_pack_versions WHERE id = _packv) = 'draft',
    'R1.2 the grant does NOT change the pack status — it stays draft');
  PERFORM pg_temp.ok(
    (SELECT validation_label FROM public.scp_interview_pack_versions WHERE id = _packv) = 'pilot_hypothesis',
    'R1.3 and it stays labelled a pilot hypothesis');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP R2 — the complete journey, end to end'; END $$;

DO $$
DECLARE
  _packv uuid; _case uuid; _srcJob uuid; _srcCv uuid;
  _run uuid; _plan uuid; _session uuid; _q1 uuid; _q uuid;
  _noteId uuid; _prop uuid; _propReject uuid; _ev uuid; _report uuid;
  _passage uuid; _dim uuid; _comp uuid; _n integer; _status text; _hash text;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000a1', true);

  -- 1. Case
  _case := public.scp_iv_create_case('33330000-0000-0000-0000-00000000000a',
             'Väktare Stockholm', _packv, 'Sara N.', NULL, 'EXT-001');
  SELECT status, pack_content_hash INTO _status, _hash
    FROM public.scp_interview_cases WHERE id = _case;
  PERFORM pg_temp.ok(_status = 'draft', 'R2.1 a new case starts as draft');
  PERFORM pg_temp.ok(_hash IS NOT NULL, 'R2.2 the case pins the pack content hash at creation');

  -- 2. Sources, split into citable passages
  _srcJob := public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare till stationär bevakning.\n\nKrav: VU1 och VU2.\n\nMeriterande: incidentrapportering.',
    'recruitment_interview', 'Berättigat intresse, rekrytering.');
  _srcCv := public.scp_iv_add_source(_case, 'candidate_cv', 'CV',
    E'Säkerhetsvakt, Nordic Guard 2023-2025.\n\nPatrullering och incidentrapportering.\n\nVU1, VU2.',
    'recruitment_interview', 'Kandidatens ansökan.', 'candidate_application');

  SELECT count(*) INTO _n FROM public.scp_interview_source_passages
   WHERE source_id IN (_srcJob, _srcCv);
  PERFORM pg_temp.ok(_n = 6, 'R2.3 both sources were split into citable passages');

  SELECT id INTO _passage FROM public.scp_interview_source_passages
   WHERE source_id = _srcCv AND passage_index = 2;

  PERFORM public.scp_iv_mark_sources_ready(_case);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _case) = 'sources_ready',
    'R2.4 the case advances to sources_ready');

  -- 3. An AI run, pinning the whole registry contract
  _run := public.scp_iv_ai_run_start(_case, 'interview_preparation_generation', 'mock', 'mock-1');
  PERFORM pg_temp.ok(
    (SELECT task_version IS NOT NULL AND prompt_version IS NOT NULL
            AND policy_version IS NOT NULL AND ai_task_id IS NOT NULL
       FROM public.scp_interview_ai_runs WHERE id = _run),
    'R2.5 the run pins task, prompt and policy versions and its registry row');

  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';

  _plan := public.scp_iv_record_prep_plan(_run,
    jsonb_build_object('roleSummary','Stationär bevakning.','candidateSummary','Två år som väktare.'),
    jsonb_build_array(
      jsonb_build_object('itemKind','relevant_experience','questionId',_q1::text,
        'statement','CV:t nämner incidentrapportering.','claimClass','source_grounded',
        'sourcePassageId',_passage::text,'sourceQuote','Patrullering och incidentrapportering.'),
      jsonb_build_object('itemKind','missing_information',
        'statement','Egen roll vid incidenter framgår inte.','claimClass','ai_inference')));

  PERFORM public.scp_iv_ai_run_settle(_run, 'succeeded', NULL, NULL,
    jsonb_build_object('note','mock provider'), 900, 300, 42, 0);

  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _case) = 'prep_generated',
    'R2.6 recording a plan advances the case to prep_generated');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_ai_runs WHERE id = _run) = 'succeeded',
    'R2.6b the run is settled with its own outcome and token metadata');

  -- 4. An interview cannot start until a human approves the plan
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_start_session(%L)', _case),
    'SCP_IV_PREP_NOT_APPROVED',
    'R2.7 an interview cannot start from an UNAPPROVED plan');

  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Granskad och godkänd.');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _case) = 'prep_approved',
    'R2.8 human approval makes it the active interview plan');

  -- 5. The interview
  _session := public.scp_iv_start_session(_case, 'M. Svensson');
  SELECT count(*) INTO _n FROM public.scp_interview_session_questions WHERE session_id = _session;
  PERFORM pg_temp.ok(_n = 8,
    'R2.9 the session seeds exactly the eight governed questions from the pinned pack');

  PERFORM pg_temp.ok(
    (SELECT string_agg(q.code, ',' ORDER BY sq.display_order)
       FROM public.scp_interview_session_questions sq
       JOIN public.scp_interview_core_questions q ON q.id = sq.question_id
      WHERE sq.session_id = _session) = 'Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8',
    'R2.10 in the pack''s fixed order');

  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_session, _q1, 'observation',
          'Kandidaten beskrev att hon upptäckte en olåst dörr och kontrollerade området innan hon larmade.',
          auth.uid())
  RETURNING id INTO _noteId;

  PERFORM public.scp_iv_set_session_state(_session, 'paused');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_sessions WHERE id = _session) = 'paused',
    'R2.11 the interview can be paused');
  PERFORM public.scp_iv_set_session_state(_session, 'in_progress');
  PERFORM public.scp_iv_set_session_state(_session, 'completed', 'evaluation',
    'Höll strukturen; ställde alla frågor i ordning.');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _case) = 'interview_complete',
    'R2.12 completing the session advances the case');

  -- 6. AI-proposed evidence
  SELECT id INTO _dim FROM public.scp_interview_evidence_dimensions
   WHERE question_id = _q1 AND display_order = 1;
  SELECT id INTO _comp FROM public.scp_interview_pack_competencies
   WHERE pack_version_id = _packv AND code = 'C1';

  _run := public.scp_iv_ai_run_start(_case, 'evidence_extraction', 'mock', 'mock-1');
  PERFORM public.scp_iv_record_evidence_proposals(_run, jsonb_build_array(
    jsonb_build_object('noteId', _noteId::text,
      'excerpt','upptäckte en olåst dörr och kontrollerade området innan hon larmade',
      'questionId', _q1::text, 'evidenceDimensionId', _dim::text,
      'packCompetencyId', _comp::text, 'extractionConfidence','0.82',
      'relevanceRationale','Beskriver upptäckt av avvikelse och kontroll före åtgärd, vilket är Q1:s evidensdimension.',
      'uncertaintyNote','Det framgår inte hur lång tid kontrollen tog.',
      'prohibitedConclusionNote','Detta säger inget om kandidatens trovärdighet eller lämplighet.'),
    jsonb_build_object('noteId', _noteId::text,
      'excerpt','kandidaten verkade nervös',
      'questionId', _q1::text, 'extractionConfidence','0.40',
      'relevanceRationale','Observation av uppträdande.')));

  PERFORM public.scp_iv_ai_run_settle(_run, 'succeeded', NULL, NULL,
    jsonb_build_object('note','mock provider'), 800, 250, 38, 0);

  SELECT id INTO _prop FROM public.scp_interview_evidence_proposals
   WHERE case_id = _case AND excerpt LIKE 'upptäckte%';
  SELECT id INTO _propReject FROM public.scp_interview_evidence_proposals
   WHERE case_id = _case AND excerpt LIKE '%nervös%';

  PERFORM public.scp_iv_begin_evidence_review(_case);

  -- THE boundary: a proposal is not evidence.
  SELECT count(*) INTO _n FROM public.scp_interview_evidence WHERE case_id = _case;
  PERFORM pg_temp.ok(_n = 0,
    'R2.13 AI proposals created ZERO confirmed evidence — the tables are separate');

  -- 7. Human confirmation, with an edit that preserves the original
  _ev := public.scp_iv_confirm_evidence_proposal(_prop, 'edit',
    'upptäckte en olåst dörr, kontrollerade området och larmade därefter',
    'ai_model_error', 'Förtydligade ordningsföljden.');

  PERFORM pg_temp.ok(
    (SELECT original_excerpt IS NOT NULL AND original_excerpt <> excerpt
       FROM public.scp_interview_evidence WHERE id = _ev),
    'R2.14 an edited confirmation keeps BOTH the AI wording and the human wording');
  PERFORM pg_temp.ok(
    (SELECT confirmed_by FROM public.scp_interview_evidence WHERE id = _ev) IS NOT NULL,
    'R2.15 confirmed evidence names the human who stands behind it');

  -- Rejecting the behavioural observation: it never becomes evidence.
  PERFORM public.scp_iv_confirm_evidence_proposal(_propReject, 'reject', NULL,
    'policy_violation', 'Nervositet är inte jobbrelevant evidens.');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_interview_evidence
                 WHERE proposal_id = _propReject),
    'R2.16 a rejected proposal produces no evidence at all');

  -- 8. Human assessment
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_record_assessment(%L, %L, 3, %L)', _case, _q1, ''),
    'SCP_IV_RATIONALE_REQUIRED',
    'R2.17 a level with no reasoning is refused');

  PERFORM public.scp_iv_record_assessment(_case, _q1, 3,
    'Kontrollerade fakta innan hon agerade och larmade proportionerligt.',
    'Tidsaspekten är oklar.');

  -- Every other question has no confirmed evidence, so the only honest level
  -- is 0. This is the product rule, enforced.
  FOR _q IN SELECT id FROM public.scp_interview_core_questions
             WHERE pack_version_id = _packv AND id <> _q1 LOOP
    PERFORM pg_temp.must_fail(
      format('SELECT public.scp_iv_record_assessment(%L, %L, 3, %L)', _case, _q, 'x'),
      'SCP_IV_NO_CONFIRMED_EVIDENCE',
      format('R2.18 level > 0 without confirmed evidence is refused (%s)', _q))
      WHERE _q = (SELECT id FROM public.scp_interview_core_questions
                   WHERE pack_version_id = _packv AND code = 'Q2');
    PERFORM public.scp_iv_record_assessment(_case, _q, 0,
      'Frågan hanns inte med; otillräcklig evidens.');
  END LOOP;

  PERFORM public.scp_iv_mark_assessed(_case);

  -- 9. The report
  _report := public.scp_iv_finalise_report(_case);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _case) = 'reported',
    'R2.19 the case reaches reported');
  PERFORM pg_temp.ok(
    (SELECT content_hash IS NOT NULL AND payload IS NOT NULL
       FROM public.scp_interview_reports WHERE id = _report),
    'R2.20 the report is a hashed, frozen snapshot');

  -- The report contains the CONFIRMED evidence and not the rejected proposal.
  PERFORM pg_temp.ok(
    (SELECT payload::text FROM public.scp_interview_reports WHERE id = _report)
      LIKE '%larmade därefter%',
    'R2.21 the report carries the human-corrected wording');
  PERFORM pg_temp.ok(
    (SELECT payload::text FROM public.scp_interview_reports WHERE id = _report)
      NOT LIKE '%nervös%',
    'R2.22 the rejected proposal is ABSENT from the report');
  PERFORM pg_temp.ok(
    (SELECT payload -> 'ai_disclosure' ->> 'statement' FROM public.scp_interview_reports WHERE id = _report)
      IS NOT NULL,
    'R2.23 the report discloses the AI role');
  PERFORM pg_temp.ok(
    (SELECT payload ->> 'decision_boundary' FROM public.scp_interview_reports WHERE id = _report)
      IS NOT NULL,
    'R2.24 the report states the decision is the employer''s');

  RESET ROLE;

  -- 10. Immutability
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_reports SET payload = ''{}''::jsonb WHERE id = %L', _report),
    'SCP_IV_REPORT_IMMUTABLE',
    'R2.25 a finalised report cannot be edited');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_case_events SET reason = ''x'' WHERE case_id = %L', _case),
    'SCP_IV_EVENT_APPEND_ONLY',
    'R2.26 the case audit ledger cannot be rewritten');

  -- 11. The audit trail tells the whole story, and says who did what.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_case_events
      WHERE case_id = _case AND actor_kind = 'ai') >= 2,
    'R2.27 AI actions are recorded as AI actions');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_case_events
      WHERE case_id = _case AND event = 'report_finalised' AND actor_kind = 'human') = 1,
    'R2.28 finalising the report is recorded as a HUMAN action');

  -- 12. The provenance chain reached the graph, tenant-scoped.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_intel_edges
      WHERE to_kind = 'report_conclusion' AND to_id = _report
        AND employer_id = '33330000-0000-0000-0000-00000000000a') >= 1,
    'R2.29 confirmed evidence is linked to the report in the intelligence graph');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_intel_edges
                 WHERE to_kind = 'report_conclusion' AND to_id = _report
                   AND employer_id IS NULL),
    'R2.30 and every such edge is tenant-scoped, never platform-wide');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP R3 — tenant isolation'; END $$;

DO $$
DECLARE _n integer; _case uuid;
BEGIN
  _case := pg_temp.suite_case();

  -- Another employer's owner sees nothing.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000b1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_cases;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'R3.1 a different employer sees ZERO interview cases');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000b1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_evidence;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'R3.2 and ZERO confirmed evidence');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000b1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_session_notes;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'R3.3 and ZERO interview notes');

  -- The candidate has no access to the employer workspace at all.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000c1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_cases;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'R3.4 a candidate sees ZERO interview cases');

  -- A member of employer B cannot create a case against employer A.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000b1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, ''hostile'', (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = pg_temp.suite_case()), ''X'')',
           '33330000-0000-0000-0000-00000000000a'),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'R3.5 a non-member cannot create a case for another employer');
  RESET ROLE;
END $$;

-- anon sees nothing, on every runtime table.
DO $$
DECLARE _t text; _n integer; _leaks text := '';
BEGIN
  SET LOCAL ROLE anon;
  FOR _t IN SELECT t FROM pg_temp.runtime_tables() LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', _t) INTO _n;
      IF _n > 0 THEN _leaks := _leaks || _t || ' '; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.ok(_leaks = '',
    'R3.6 anon reads ZERO rows from every runtime table (leaked: ' || _leaks || ')');
END $$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.runtime_tables())
       AND grantee IN ('anon','PUBLIC')),
  'R3.7 anon holds no privilege of any kind on any runtime table');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.runtime_tables())
       AND grantee = 'authenticated'
       AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')),
  'R3.8 authenticated holds no TRUNCATE on any runtime table (RLS does not filter TRUNCATE)');

-- Evidence and proposals are read-only to clients: the confirmation boundary
-- cannot be bypassed with a direct write.
SELECT pg_temp.ok(
  (SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('scp_interview_evidence','scp_interview_evidence_proposals',
                         'scp_interview_assessments','scp_interview_reports',
                         'scp_interview_case_events','scp_interview_ai_runs')
      AND grantee = 'authenticated') = 'SELECT',
  'R3.9 evidence, proposals, assessments, reports, AI runs and the ledger are SELECT-only for clients');


DO $$ BEGIN RAISE NOTICE 'GROUP R4 — Q1-Q8 and the pinned pack are untouchable from the runtime'; END $$;

SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_core_questions SET prompt_sv = ''omskriven av runtime''',
  'SCP_INTERVIEW_PUBLISHED_IMMUTABLE',
  'R4.1 the runtime cannot rewrite a governed question')
WHERE (SELECT content_status FROM public.scp_interview_pack_versions
        WHERE id = (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = pg_temp.suite_case())) NOT IN
      ('draft','expert_review','legal_review','cognitive_review');

-- The pack used here is a draft, so Phase 1 permits content edits. What must
-- NOT be possible is the CASE silently following that change: the case pinned a
-- version and a hash, and both are frozen from prep_approved onward.
DO $$
DECLARE _case uuid;
BEGIN
  SELECT id INTO _case FROM public.scp_interview_cases WHERE status = 'reported' LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_cases SET pack_version_id = gen_random_uuid() WHERE id = %L', _case),
    'SCP_IV_PIN_IMMUTABLE',
    'R4.2 a case cannot be repointed at a different pack version after approval');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_cases SET pack_content_hash = ''tampered'' WHERE id = %L', _case),
    'SCP_IV_PIN_IMMUTABLE',
    'R4.3 nor can its pinned content hash be edited');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_cases SET status = ''draft'' WHERE id = %L', _case),
    'SCP_IV_ILLEGAL_TRANSITION',
    'R4.4 a reported case is terminal');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_cases SET employer_id = %L WHERE id = %L',
           '33330000-0000-0000-0000-00000000000b', _case),
    'SCP_IV_TENANT_IMMUTABLE',
    'R4.5 a case can never change employer');
END $$;

-- A probe from another pack cannot be used.
DO $$
DECLARE _session uuid; _q uuid; _foreign_probe uuid;
BEGIN
  SELECT s.id, sq.question_id INTO _session, _q
    FROM public.scp_interview_sessions s
    JOIN public.scp_interview_session_questions sq ON sq.session_id = s.id
   LIMIT 1;
  SELECT gen_random_uuid() INTO _foreign_probe;
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_probe_usages (session_id, question_id, probe_id)
            VALUES (%L, %L, %L)', _session, _q, _foreign_probe),
    'SCP_IV_PROBE_NOT_IN_PACK',
    'R4.6 a probe outside the pinned pack cannot be recorded as used');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP R5 — the prohibition surface'; END $$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.runtime_tables())
       AND (column_name IN ('total_score','suitability_score','fit_score','ranking','rank',
                            'hire_recommendation','recommendation','pass_threshold','threshold',
                            'credibility_score','deception_probability','weight','weighting',
                            'score','total','cut_score','percentile','emotion','sentiment',
                            'personality','stress_level','culture_fit')
            OR column_name LIKE '%_score'
            OR column_name LIKE '%credibility%'
            OR column_name LIKE '%deception%')),
  'R5.1 no total, score, weight, ranking, threshold or recommendation column in the runtime domain');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_interview_evidence'
       AND column_name LIKE '%confidence%'),
  'R5.2 confirmed evidence has no confidence column at all');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='scp_interview_evidence_proposals'
      AND column_name='extraction_confidence') = 1,
  'R5.3 extraction_confidence exists only on the PROPOSAL, where it describes the extraction');

-- The process-quality view must be usable as process intelligence and unusable
-- as a candidate score.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_interview_process_quality'
       AND (column_name LIKE '%level%' OR column_name LIKE '%score%'
            OR column_name LIKE '%avg%' OR column_name LIKE '%rank%')),
  'R5.4 the process-quality view exposes no candidate level, score, average or rank');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='scp_interview_process_quality'
             AND column_name='insufficient_evidence_count'),
  'R5.5 it does count insufficient evidence — as a PROCESS outcome');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'scp\_iv\_%' ESCAPE '\' OR p.proname LIKE 'scp\_interview\_%' ESCAPE '\')
       AND (p.proname LIKE '%total%' OR p.proname LIKE '%rank%'
            OR p.proname LIKE '%recommend%' OR p.proname LIKE '%suitab%')),
  'R5.6 no scoring, ranking, suitability or recommendation function exists');

-- Level 0 keeps its meaning at runtime, via the anchor it must reference.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_assessments a
      JOIN public.scp_interview_rating_anchors an ON an.id = a.anchor_id
     WHERE a.level = 0 AND an.counts_toward_aggregation),
  'R5.7 a level-0 assessment always references a non-aggregable anchor');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_assessments WHERE level = 0) >= 7,
  'R5.8 unanswered questions were recorded as insufficient evidence, not as low scores');


DO $$ BEGIN RAISE NOTICE 'GROUP R6 — AI governance'; END $$;

-- A task with no active registry row cannot run at all.
DO $$
DECLARE _case uuid;
BEGIN
  _case := pg_temp.suite_case();
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000a1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, ''evidence_extraction'', ''mock'', ''m'')', _case),
    'SCP_IV_ILLEGAL',   -- deliberately wrong needle, replaced below
    'placeholder')
  WHERE false;
  RESET ROLE;
END $$;

DO $$
DECLARE _case uuid; _n integer;
BEGIN
  _case := pg_temp.suite_case();
  UPDATE public.scp_ai_tasks SET activation_status = 'rolled_back'
   WHERE task_key = 'gap_and_contradiction_detection';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000a1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, ''gap_and_contradiction_detection'', ''mock'', ''m'')', _case),
    'SCP_IV_TASK_NOT_ACTIVE',
    'R6.1 a rolled-back AI task cannot execute');
  RESET ROLE;

  UPDATE public.scp_ai_tasks SET activation_status = 'active'
   WHERE task_key = 'gap_and_contradiction_detection';
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_ai_runs WHERE status = 'succeeded') >= 2,
  'R6.2a the journey settled its AI runs (so the next assertion is not vacuous)');

SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_ai_runs SET raw_response = ''{"tampered":true}''::jsonb
    WHERE id = (SELECT id FROM public.scp_interview_ai_runs WHERE status = ''succeeded'' LIMIT 1)',
  'SCP_IV_AI_RUN_SETTLED',
  'R6.2 a finished AI run can never be rewritten');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_ai_tasks WHERE requires_human_review) =
  (SELECT count(*) FROM public.scp_ai_tasks),
  'R6.3 every registered AI task requires human review');

-- Abstention is a first-class outcome, not an error.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='scp_interview_ai_runs' AND column_name='abstention_reason'),
  'R6.4 the engine can record WHY it declined to answer');

SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_interview_ai_runs
     (case_id, task, task_version, prompt_version, provider, model, status)
   SELECT id, ''evidence_extraction'', ''1.0.0'', ''1.0.0'', ''mock'', ''m'', ''abstained''
     FROM public.scp_interview_cases WHERE id = pg_temp.suite_case()',
  'scp_interview_ai_runs_abstention',
  'R6.5 an abstention without a stated reason is refused');


DO $$ BEGIN RAISE NOTICE 'GROUP R7 — the transcript gate'; END $$;

DO $$
DECLARE _case uuid;
BEGIN
  _case := pg_temp.suite_case();
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_case_sources
              (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note)
            VALUES (%L, ''transcript'', ''T'', ''x'', ''p'', ''n'')', _case),
    'SCP_IV_TRANSCRIPT_DISABLED',
    'R7.1 a transcript is refused while the platform flag is off');

  UPDATE public.scp_interview_ai_config SET transcript_enabled = true;

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_case_sources
              (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note)
            VALUES (%L, ''transcript'', ''T'', ''x'', ''p'', ''n'')', _case),
    'SCP_IV_TRANSCRIPT_NO_LAWFUL_BASIS',
    'R7.2 and still refused until THIS case records a lawful basis');

  UPDATE public.scp_interview_ai_config SET transcript_enabled = false;
END $$;

-- Only an owner or admin may make that confirmation, never any member.
DO $$
DECLARE _case uuid;
BEGIN
  _case := pg_temp.suite_case();
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-0000000000a2', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, ''vi har stöd'')', _case),
    'SCP_IV_TRANSCRIPT_CONFIRM_ROLE',
    'R7.3 an ordinary member cannot confirm a lawful basis for transcript processing');
  RESET ROLE;
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP R8 — passages, citations and coexistence'; END $$;

SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_source_passages SET content = ''rewritten'' WHERE content <> ''''',
  'SCP_IV_PASSAGE_IMMUTABLE',
  'R8.1 a cited passage can never be rewritten');

-- A source_grounded claim without a passage is refused by CHECK.
DO $$
DECLARE _case uuid; _run uuid;
BEGIN
  _case := pg_temp.suite_case();
  SELECT id INTO _run FROM public.scp_interview_ai_runs LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_candidate_facts
              (case_id, ai_run_id, fact_kind, statement, claim_class)
            VALUES (%L, %L, ''employment'', ''Påstådd anställning'', ''source_grounded'')',
           _case, _run),
    'scp_interview_candidate_facts_citation',
    'R8.2 a source-grounded candidate claim without a citation is refused');
END $$;

SELECT pg_temp.ok(
  to_regclass('public.scp_interview_guide_prompts') IS NOT NULL
    AND to_regclass('public.scp_interview_notes') IS NOT NULL,
  'R8.3 the two assessment-domain tables that share the prefix are untouched');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_core_questions
    WHERE pack_version_id = (SELECT ver.id FROM public.scp_interview_pack_versions ver
                              JOIN public.scp_interview_packs p ON p.id = ver.pack_id
                             WHERE p.slug = 'vaktare-se')) = 8,
  'R8.4 the Phase 1 Vaktare pack still has exactly eight questions');

-- Every SECURITY DEFINER function in the runtime pins search_path and is out of
-- anon's reach.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'scp\_iv\_%' ESCAPE '\'
       AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
                        WHERE cfg LIKE 'search_path=%')),
  'R8.5 every runtime SECURITY DEFINER function pins search_path');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'scp\_iv\_%' ESCAPE '\'
       AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  'R8.6 no runtime definer function is executable by anon');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND c.relname IN (SELECT t FROM pg_temp.runtime_tables())
       AND NOT c.relrowsecurity),
  'R8.7 row level security is enabled on every runtime table');


DO $$ BEGIN RAISE NOTICE 'GROUP R9 — the research registry and the graph'; END $$;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_research_claims
               WHERE btrim(unsupported_use) = '' OR btrim(limitations) = ''),
  'R9.1 every research claim states what it does NOT support');

-- Reading a document and having an expert review the claims drawn from it are
-- two different things, and the registry tracks them separately. The invariant
-- that matters runs one way only: nothing may claim REVIEW it has not had, and
-- nothing may claim review of a document nobody opened. A source that is read
-- but unreviewed is the ordinary, honest intermediate state.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_research_sources
               WHERE review_status <> 'unreviewed' AND access_status <> 'verified_read'),
  'R9.2 no source claims to be reviewed when nobody has read it');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='scp_intel_edges'
       AND (column_name LIKE '%weight%' OR column_name LIKE '%score%'
            OR column_name LIKE '%strength%' OR column_name LIKE '%confidence%')),
  'R9.3 the intelligence graph has NO weight column — a weighted edge is a scoring model');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_intel_edges
               WHERE from_kind = 'candidate' OR to_kind = 'candidate'),
  'R9.4 the graph has no candidate node kind at all');

-- A platform-knowledge edge cannot terminate on case data, and vice versa.
SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id)
   SELECT ''confirmed_evidence'', id, ''reported_in'', ''report_conclusion'', gen_random_uuid()
     FROM public.scp_interview_evidence LIMIT 1',
  'SCP_INTEL_EDGE_SCOPE',
  'R9.5 an edge touching case data must carry its tenant');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_intel_edges
    WHERE from_kind = 'interview_competency' AND relation = 'maps_to') = 11,
  'R9.6 C1-C6 map to exact SCC competency versions, many-to-many');

ROLLBACK;
