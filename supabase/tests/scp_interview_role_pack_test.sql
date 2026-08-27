-- CQrity Interview Intelligence — Phase 1: the Role Interview Pack domain.
--
-- Proves the properties this phase actually rests on:
--
--   1. Every version begins as draft; published is reachable only through the
--      governed RPC, and only with all four gates approved AT THE CURRENT HASH.
--   2. An incomplete or unmapped pack cannot be published, transactionally.
--   3. Published parents and published children are immutable, and governed
--      content is not deleted.
--   4. The audit ledger is append-only and has no client writer.
--   5. The RLS matrix: anon, candidate, ordinary user and employer member all
--      see nothing; editor, reviewer and publisher each get exactly their own
--      authority and no more.
--   6. The Vaktare import is exactly the source document: eight questions in
--      order, the right types, levels 0-4, level 0 never aggregable.
--   7. No total, weight, ranking, threshold or recommendation column exists.
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


-- ---------------------------------------------------------------------------
-- The domain's OWN tables, named explicitly.
--
-- "scp_interview_%" is not the domain: scp_interview_guide_prompts (assessment
-- support) and scp_interview_notes (an assessment attempt's notes) share the
-- prefix and are deliberately NOT part of this phase. Every structural
-- assertion below runs over this list, and I2.0 fails if the list and the
-- schema ever disagree -- so a new table cannot quietly escape the checks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.domain_tables() RETURNS TABLE (t text)
LANGUAGE sql AS $$
  SELECT unnest(ARRAY[
    'scp_interview_packs',
    'scp_interview_pack_versions',
    'scp_interview_pack_competencies',
    'scp_interview_pack_competency_map',
    'scp_interview_core_questions',
    'scp_interview_question_competencies',
    'scp_interview_approved_probes',
    'scp_interview_evidence_dimensions',
    'scp_interview_rating_anchors',
    'scp_interview_verification_rules',
    'scp_interview_prohibited_areas',
    'scp_interview_pack_reviews',
    'scp_interview_pack_events']);
$$;

-- ---------------------------------------------------------------------------
-- Fixture actors. Distinct people on purpose: the separation-of-duties rules
-- are only testable with more than one human.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11110000-0000-0000-0000-0000000000e1', 'editor@test.local'),
  ('11110000-0000-0000-0000-0000000000e2', 'editor2@test.local'),
  ('11110000-0000-0000-0000-0000000000a1', 'reviewer@test.local'),
  ('11110000-0000-0000-0000-0000000000b1', 'publisher@test.local'),
  ('11110000-0000-0000-0000-0000000000c1', 'candidate@test.local'),
  ('11110000-0000-0000-0000-0000000000d1', 'employermember@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('11110000-0000-0000-0000-0000000000e1', 'editor'),
  ('11110000-0000-0000-0000-0000000000e2', 'editor'),
  ('11110000-0000-0000-0000-0000000000a1', 'reviewer'),
  ('11110000-0000-0000-0000-0000000000b1', 'publisher')
ON CONFLICT (user_id, role) DO NOTHING;


DO $$ BEGIN RAISE NOTICE 'GROUP I1 — the Vaktare import is the source document'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_packs WHERE slug = 'vaktare-se') = 1,
  'I1.1 the Vaktare pack was imported');

SELECT pg_temp.ok(
  (SELECT v.content_status FROM public.scp_interview_pack_versions v
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND v.version_number = 1) = 'draft',
  'I1.2 it is draft, not published');

SELECT pg_temp.ok(
  (SELECT v.validation_label FROM public.scp_interview_pack_versions v
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND v.version_number = 1) = 'pilot_hypothesis',
  'I1.3 it is labelled a pilot hypothesis, never validated science');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_core_questions q
     JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se') = 8,
  'I1.4 exactly eight core questions');

-- The order and type contract, asserted position by position.
SELECT pg_temp.ok(
  (SELECT string_agg(q.code || ':' || q.question_type, ',' ORDER BY q.display_order)
     FROM public.scp_interview_core_questions q
     JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se')
  = 'Q1:behavioural,Q2:behavioural,Q3:behavioural,Q4:behavioural,Q5:behavioural,Q6:behavioural,Q7:situational,Q8:situational',
  'I1.5 Q1-Q8 in fixed order, Q1-Q6 behavioural and Q7-Q8 situational');

-- The exact governed wording of the first and last question, verbatim.
SELECT pg_temp.ok(
  (SELECT q.prompt_sv FROM public.scp_interview_core_questions q
     JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND q.code = 'Q1')
  = 'Berätta om en konkret situation där du upptäckte något som andra först inte verkade uppmärksamma och där det kunde ha fått betydelse för säkerheten eller verksamheten.',
  'I1.6 Q1 carries the source wording verbatim');

SELECT pg_temp.ok(
  (SELECT q.prompt_sv FROM public.scp_interview_core_questions q
     JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND q.code = 'Q8')
  = 'Under en rond får du ett larm från ett område samtidigt som du ser en upprörd grupp nära den tänkta vägen dit. Du är ensam i den omedelbara närheten och har begränsad information. Beskriv hur du skulle resonera och agera steg för steg.',
  'I1.7 Q8 carries the source wording verbatim');

SELECT pg_temp.ok(
  (SELECT string_agg(DISTINCT c.code, ',' ORDER BY c.code)
     FROM public.scp_interview_pack_competencies c
     JOIN public.scp_interview_pack_versions v ON v.id = c.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se') = 'C1,C2,C3,C4,C5,C6',
  'I1.8 the six competency domains C1-C6');

-- Every question carries a complete 0..4 anchor set. Forty rows, five levels.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_core_questions q
      JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE p.slug = 'vaktare-se'
       AND (SELECT string_agg(a.level::text, ',' ORDER BY a.level)
              FROM public.scp_interview_rating_anchors a WHERE a.question_id = q.id)
           IS DISTINCT FROM '0,1,2,3,4'),
  'I1.9 every question has exactly levels 0,1,2,3,4 — no more, no fewer');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_rating_anchors a
     JOIN public.scp_interview_core_questions q ON q.id = a.question_id
     JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND a.level = 0
      AND a.anchor_sv LIKE '%inte samma sak som låg kompetens%') = 8,
  'I1.10 every level-0 anchor says explicitly it is NOT low competence');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_interview_rating_anchors
               WHERE level = 0 AND counts_toward_aggregation),
  'I1.11 no level-0 anchor may be aggregated');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_interview_rating_anchors
               WHERE level > 0 AND NOT counts_toward_aggregation),
  'I1.12 levels 1-4 remain aggregable by a human, per source 6.1');

-- The constraint, not just the data: level 0 cannot be made aggregable.
SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_rating_anchors SET counts_toward_aggregation = true WHERE level = 0',
  'scp_interview_rating_anchors_check',
  'I1.13 a level-0 anchor cannot be switched to count toward an average');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_approved_probes pr
     JOIN public.scp_interview_pack_versions v ON v.id = pr.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND pr.question_id IS NULL) = 8,
  'I1.14 the eight general 5E probes exist at pack level');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_approved_probes pr
     JOIN public.scp_interview_pack_versions v ON v.id = pr.pack_version_id
     JOIN public.scp_interview_packs p ON p.id = v.pack_id
    WHERE p.slug = 'vaktare-se' AND pr.purpose_provenance = 'source_stated') = 8,
  'I1.15 exactly the general probes claim a source-stated purpose; the derived ones say so');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_competency_map m
      JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
      JOIN public.scp_interview_pack_versions v ON v.id = c.pack_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE p.slug = 'vaktare-se' AND m.mapping_state <> 'provisional'),
  'I1.16 every competency mapping arrives provisional — no invented equivalence');

-- Each mapping pins an EXACT competency version id, not a code.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_competency_map m
     WHERE NOT EXISTS (SELECT 1 FROM public.scp_competency_versions cv WHERE cv.id = m.competency_version_id)),
  'I1.17 every mapping resolves to a real canonical competency version');


DO $$ BEGIN RAISE NOTICE 'GROUP I2 — the prohibition surface'; END $$;

-- Phase 2 added a runtime layer and a governed-knowledge layer that share the
-- prefix. The guard's value is unchanged and its wording is now precise: every
-- scp_interview_ table must be CLASSIFIED into a known layer, so a new one
-- still cannot escape scrutiny simply by existing.
CREATE OR REPLACE FUNCTION pg_temp.known_tables() RETURNS TABLE (t text)
LANGUAGE sql AS $$
  SELECT t FROM pg_temp.domain_tables()           -- Phase 1 governed content (13)
  UNION ALL
  SELECT unnest(ARRAY[                             -- Phase 2 runtime (21)
    'scp_interview_ai_config','scp_interview_pack_pilot_grants','scp_interview_cases',
    'scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs',
    'scp_interview_ai_run_retrievals','scp_interview_role_requirements',
    'scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items',
    'scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes',
    'scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence',
    'scp_interview_findings','scp_interview_assessments','scp_interview_reports',
    'scp_interview_case_events'])
  UNION ALL
  SELECT unnest(ARRAY[                             -- candidate-facing (1)
    -- A candidate's statement that a FACT in their material is wrong. Read by a
    -- human, never applied automatically, and unable to reach an assessment.
    'scp_interview_candidate_corrections'])
  UNION ALL
  SELECT unnest(ARRAY[                             -- Phase 2 method library (2)
    'scp_interview_methods','scp_interview_method_practices'])
  UNION ALL
  SELECT unnest(ARRAY[                             -- pre-existing assessment domain (2)
    'scp_interview_guide_prompts','scp_interview_notes']);
$$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name LIKE 'scp_interview\_%' ESCAPE '\'
       AND table_name NOT IN (SELECT t FROM pg_temp.known_tables())),
  'I2.0 every scp_interview_ TABLE is classified into a known layer — a new one cannot escape');

-- Views are checked separately, because a view over this domain is exactly
-- where a candidate score would be smuggled in without a new column appearing.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'VIEW'
       AND table_name LIKE 'scp_interview\_%' ESCAPE '\'
       AND table_name NOT IN ('scp_interview_process_quality')),
  'I2.0c every scp_interview_ VIEW is a known one — a view is where a hidden score would hide');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_temp.domain_tables()) = 13,
  'I2.0b the Phase 1 governed-content domain is still exactly thirteen tables');

-- The forbidden vocabulary must not exist as a column ANYWHERE in the domain.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.domain_tables())
       AND (column_name IN (
              'total_score','suitability_score','fit_score','ranking','rank',
              'hire_recommendation','recommendation','pass_threshold','threshold',
              'credibility_score','deception_probability','weight','weighting',
              'score','total','cut_score','percentile','emotion','sentiment',
              'personality','stress_level','culture_fit')
            OR column_name LIKE '%_score'
            OR column_name LIKE '%credibility%'
            OR column_name LIKE '%deception%')),
  'I2.1 no total, score, weight, ranking, threshold or recommendation column exists in the domain');

-- Nor a function that would compute one.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname LIKE 'scp_interview_%'
       AND pr.proname <> 'scp_interview_notes'
       AND (pr.proname LIKE '%score%' OR pr.proname LIKE '%rank%'
            OR pr.proname LIKE '%recommend%' OR pr.proname LIKE '%total%')),
  'I2.2 no scoring, ranking or recommendation function exists in the domain');

-- The domain stores no candidate reference of any kind.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.domain_tables())
       AND column_name IN ('subject_id','candidate_id','application_id','attempt_id','assignment_id')),
  'I2.3 the domain holds no candidate, application or attempt reference');


DO $$ BEGIN RAISE NOTICE 'GROUP I3 — versions begin as draft and cannot be walked up by hand'; END $$;

-- A direct insert at 'published' is refused by the guard.
DO $$
DECLARE _pack uuid; _rv uuid;
BEGIN
  SELECT id INTO _pack FROM public.scp_interview_packs WHERE slug = 'vaktare-se';
  SELECT role_version_id INTO _rv FROM public.scp_interview_pack_versions LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_pack_versions
              (pack_id, version_number, content_status, locale, role_version_id,
               source_reference, source_document_version)
            VALUES (%L, 99, ''published'', ''sv-SE'', %L, ''x'', ''x'')', _pack, _rv),
    'SCP_INTERVIEW_MUST_START_AS_DRAFT',
    'I3.1 a version cannot be INSERTed straight into published');

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_pack_versions
              (pack_id, version_number, content_status, locale, role_version_id,
               source_reference, source_document_version)
            VALUES (%L, 98, ''expert_review'', ''sv-SE'', %L, ''x'', ''x'')', _pack, _rv),
    'SCP_INTERVIEW_MUST_START_AS_DRAFT',
    'I3.2 a version cannot be INSERTed straight into a review state either');
END $$;

-- A direct UPDATE of content_status, even as the table owner, is refused.
DO $$
DECLARE _v uuid;
BEGIN
  SELECT id INTO _v FROM public.scp_interview_pack_versions LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_versions SET content_status = ''expert_review'' WHERE id = %L', _v),
    'SCP_INTERVIEW_UNGOVERNED_TRANSITION',
    'I3.3 content_status cannot be changed by a direct table update');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_versions SET content_status = ''published'' WHERE id = %L', _v),
    'SCP_INTERVIEW_ILLEGAL_TRANSITION',
    'I3.4 draft -> published is not a legal transition at all');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP I4 — the RLS matrix'; END $$;

-- anon sees nothing, on every table in the domain.
DO $$
DECLARE _t text; _n integer; _leaks text := '';
BEGIN
  SET LOCAL ROLE anon;
  FOR _t IN SELECT t FROM pg_temp.domain_tables()
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', _t) INTO _n;
      IF _n > 0 THEN _leaks := _leaks || _t || ' '; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;  -- refused outright, which is the stronger outcome
    END;
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.ok(_leaks = '',
    'I4.1 anon reads ZERO rows from every interview-pack table (leaked: ' || _leaks || ')');
END $$;

-- A candidate / ordinary authenticated user sees nothing.
DO $$
DECLARE _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000c1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'I4.2 a candidate account sees ZERO pack versions');
END $$;

DO $$
DECLARE _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000d1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'I4.3 an ordinary employer member sees ZERO core questions');
END $$;

DO $$
DECLARE _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 8, 'I4.4 a content editor CAN read the eight questions');
END $$;

DO $$
DECLARE _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000c1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_pack_events;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'I4.5 a candidate cannot read the governance ledger');
END $$;

-- A candidate cannot create a pack, whatever they send.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000c1', true);
  PERFORM pg_temp.must_fail(
    'SELECT public.scp_interview_create_pack(''hostile'', (SELECT id FROM public.scp_roles LIMIT 1), ''x'', ''x'')',
    'SCP_INTERVIEW_NOT_EDITOR',
    'I4.6 a candidate cannot create a role interview pack');
  RESET ROLE;
END $$;

-- A reviewer cannot author content, and an editor cannot review or publish.
DO $$
DECLARE _v uuid;
BEGIN
  SELECT id INTO _v FROM public.scp_interview_pack_versions LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM pg_temp.must_fail(
    'SELECT public.scp_interview_create_pack(''reviewer-attempt'', (SELECT id FROM public.scp_roles LIMIT 1), ''x'', ''x'')',
    'SCP_INTERVIEW_NOT_EDITOR',
    'I4.7 a reviewer cannot author a pack');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_record_review(%L, ''expert'', ''approved'', ''looks fine to me'')', _v),
    'SCP_INTERVIEW_NOT_REVIEWER',
    'I4.8 an editor cannot record a review gate');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_publish_version(%L)', _v),
    'SCP_INTERVIEW_NOT_PUBLISHER',
    'I4.9 an editor cannot publish');
  RESET ROLE;
END $$;

-- An editor cannot write content into somebody else's PUBLISHED version, and
-- cannot write into the version row at all: there is no write policy for it.
DO $$
DECLARE _v uuid;
BEGIN
  SELECT id INTO _v FROM public.scp_interview_pack_versions LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_versions SET summary_sv = ''hostile'' WHERE id = %L', _v),
    'permission denied',
    'I4.10 no client, not even an editor, may UPDATE the version row directly');
  RESET ROLE;
END $$;

-- Supabase's default privileges hand authenticated the whole table privilege
-- set on creation. TRUNCATE among them -- and TRUNCATE is not filtered by RLS,
-- so a default left in place would let any signed-in user empty the audit
-- ledger regardless of policy. These two assert the revoke actually happened.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.domain_tables())
       AND grantee = 'authenticated'
       AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  'I4.14 authenticated holds no TRUNCATE (or REFERENCES/TRIGGER) on any domain table');

SELECT pg_temp.ok(
  (SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('scp_interview_pack_versions', 'scp_interview_pack_reviews',
                         'scp_interview_pack_events')
      AND grantee = 'authenticated') = 'SELECT',
  'I4.15 the version row, the reviews and the audit ledger are SELECT-only for clients');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN (SELECT t FROM pg_temp.domain_tables())
       AND grantee IN ('anon', 'PUBLIC')),
  'I4.16 anon holds no privilege of any kind on any domain table');

-- The audit ledger has no client writer at all.
DO $$
DECLARE _p uuid;
BEGIN
  SELECT id INTO _p FROM public.scp_interview_packs LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_pack_events (pack_id, event) VALUES (%L, ''published'')', _p),
    'permission denied',
    'I4.11 an editor cannot INSERT into the audit ledger');
  RESET ROLE;
END $$;

SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_pack_events SET reason = ''rewritten''',
  'SCP_INTERVIEW_EVENT_APPEND_ONLY',
  'I4.12 the audit ledger cannot be updated, even by the owner');

SELECT pg_temp.must_fail(
  'DELETE FROM public.scp_interview_pack_events',
  'SCP_INTERVIEW_EVENT_APPEND_ONLY',
  'I4.13 the audit ledger cannot be deleted from');


DO $$ BEGIN RAISE NOTICE 'GROUP I5 — the full governed lifecycle, end to end'; END $$;

-- Build a second, complete pack as an editor and walk it all the way to
-- published. This is the positive path, and everything it needs is checked.
DO $$
DECLARE
  _pack uuid; _v uuid; _role uuid; _rv uuid;
  _c uuid; _q uuid; _cv uuid; _i integer; _lvl integer;
  _status text; _blockers integer; _hash text;
BEGIN
  SELECT id INTO _role FROM public.scp_roles WHERE slug = 'security-guard-se';
  SELECT id INTO _rv FROM public.scp_role_versions WHERE role_id = _role ORDER BY version_number DESC LIMIT 1;
  SELECT cv.id INTO _cv FROM public.scp_competency_versions cv
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE c.code = 'SCC-06' AND cv.version_number = 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);

  _pack := public.scp_interview_create_pack('lifecycle-test', _role, 'Livscykeltest', 'Testsyfte');
  _v := public.scp_interview_create_version(_pack, 'sv-SE', _rv, 'Test source', 'v1');

  INSERT INTO public.scp_interview_pack_competencies
    (pack_version_id, code, display_order, name_sv, definition_sv, observable_indicators_sv)
  VALUES (_v, 'C1', 1, 'Kommunikation', 'Definition.', ARRAY['Tydlighet'])
  RETURNING id INTO _c;

  INSERT INTO public.scp_interview_pack_competency_map
    (pack_competency_id, competency_version_id, relation, mapping_state, rationale_sv)
  VALUES (_c, _cv, 'equivalent', 'provisional', 'Testmappning.');

  INSERT INTO public.scp_interview_core_questions
    (pack_version_id, code, display_order, question_type, prompt_sv)
  VALUES (_v, 'Q1', 1, 'behavioural', 'Berätta om en situation.')
  RETURNING id INTO _q;

  INSERT INTO public.scp_interview_question_competencies (question_id, pack_competency_id, is_primary)
  VALUES (_q, _c, true);

  INSERT INTO public.scp_interview_approved_probes
    (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
  VALUES (_v, _q, 'own_role', 'source_stated', 'Vad var ditt ansvar?', 1);

  INSERT INTO public.scp_interview_evidence_dimensions (question_id, code, label_sv, display_order)
  VALUES (_q, 'egen_roll', 'Egen roll', 1);

  FOR _lvl IN 0..4 LOOP
    INSERT INTO public.scp_interview_rating_anchors
      (question_id, level, label_sv, anchor_sv, counts_toward_aggregation)
    VALUES (_q, _lvl, 'Nivå ' || _lvl, 'Ankartext ' || _lvl, _lvl > 0);
  END LOOP;

  INSERT INTO public.scp_interview_verification_rules
    (pack_version_id, code, requirement_sv, interview_action_sv,
     subsequent_verification_sv, passport_boundary_sv, display_order)
  VALUES (_v, 'test_krav', 'Testkrav', 'Klargör.', 'Kontrolleras separat.', 'Ingen Passport-skrivning.', 1);

  INSERT INTO public.scp_interview_prohibited_areas
    (pack_version_id, area_type, code, statement_sv, rationale_sv, display_order)
  VALUES (_v, 'capability', 'ingen_totalpoang', 'Ingen totalpoäng.', 'Pilot.', 1);

  PERFORM public.scp_interview_touch_draft(_v, 'Utkast klart.');
  RESET ROLE;

  -- Still blocked: the mapping is provisional and no gate is approved.
  SELECT count(*) INTO _blockers FROM public.scp_interview_pack_validate(_v) WHERE severity = 'blocking';
  PERFORM pg_temp.ok(_blockers > 0, 'I5.1 a complete-looking draft is still blocked while mappings are provisional');

  -- Confirm the mapping, as a reviewer.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_confirm_competency_mapping(
    (SELECT m.id FROM public.scp_interview_pack_competency_map m WHERE m.pack_competency_id = _c));
  RESET ROLE;

  -- Walk the ladder. Each gate in turn, submitted by the editor and decided by
  -- the reviewer, who is deliberately a different person.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  _status := public.scp_interview_submit_for_review(_v, 'expert');
  RESET ROLE;
  PERFORM pg_temp.ok(_status = 'expert_review', 'I5.2 draft -> expert_review');

  -- A gate cannot be skipped.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_submit_for_review(%L, ''cognitive'')', _v),
    'SCP_INTERVIEW_GATE_OUT_OF_ORDER',
    'I5.3 the legal gate cannot be skipped');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_record_review(_v, 'expert', 'approved', 'Innehållet är jobbrelevant.');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM public.scp_interview_submit_for_review(_v, 'legal');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_record_review(_v, 'legal', 'approved', 'Inga otillåtna frågeområden.');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM public.scp_interview_submit_for_review(_v, 'cognitive');
  RESET ROLE;

  -- Publishing before the cognitive and product gates is refused, with reasons.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000b1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_publish_version(%L)', _v),
    'SCP_INTERVIEW_PUBLISH_BLOCKED',
    'I5.4 publication is refused while a review gate is outstanding');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_record_review(_v, 'cognitive', 'approved', 'Frågorna är begripliga.');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM public.scp_interview_submit_for_review(_v, 'product');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_record_review(_v, 'product', 'approved', 'Godkänt för pilot.');
  RESET ROLE;

  SELECT count(*) INTO _blockers FROM public.scp_interview_pack_validate(_v) WHERE severity = 'blocking';
  PERFORM pg_temp.ok(_blockers = 0, 'I5.5 with all four gates approved at the current hash, nothing blocks');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000b1', true);
  _hash := public.scp_interview_publish_version(_v, 'Pilotpublicering.');
  RESET ROLE;

  SELECT content_status INTO _status FROM public.scp_interview_pack_versions WHERE id = _v;
  PERFORM pg_temp.ok(_status = 'published', 'I5.6 the publisher publishes a complete, fully approved version');

  -- Published means immutable, parent and children alike.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_core_questions SET prompt_sv = ''omskriven'' WHERE pack_version_id = %L', _v),
    'SCP_INTERVIEW_PUBLISHED_IMMUTABLE',
    'I5.7 a published question cannot be rewritten');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_interview_rating_anchors WHERE question_id = %L', _q),
    'SCP_INTERVIEW_PUBLISHED_IMMUTABLE',
    'I5.8 a published anchor cannot be deleted');

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_prohibited_areas
              (pack_version_id, area_type, code, statement_sv, rationale_sv, display_order)
            VALUES (%L, ''topic'', ''smuggled'', ''x'', ''y'', 99)', _v),
    'SCP_INTERVIEW_PUBLISHED_IMMUTABLE',
    'I5.9 no new child row can be smuggled into a published version');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_versions SET summary_sv = ''x'' WHERE id = %L', _v),
    'SCP_INTERVIEW_PUBLISHED_IMMUTABLE',
    'I5.10 published version content is frozen');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_interview_pack_versions WHERE id = %L', _v),
    'SCP_INTERVIEW_NO_DELETE',
    'I5.11 a published version is never deleted');

  -- Suspend, then retire.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000b1', true);
  PERFORM public.scp_interview_suspend_version(_v, 'Innehållsfel upptäckt.');
  RESET ROLE;
  SELECT content_status INTO _status FROM public.scp_interview_pack_versions WHERE id = _v;
  PERFORM pg_temp.ok(_status = 'suspended', 'I5.12 a published version can be suspended with a reason');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000b1', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_suspend_version(%L, '''')', _v),
    'SCP_INTERVIEW_REASON_REQUIRED',
    'I5.13 suspension without a reason is refused');
  PERFORM public.scp_interview_retire_version(_v, 'Ersatt av v2.');
  RESET ROLE;
  SELECT content_status INTO _status FROM public.scp_interview_pack_versions WHERE id = _v;
  PERFORM pg_temp.ok(_status = 'retired', 'I5.14 a suspended version can be retired');

  -- A new version can now be created, and the old one is preserved.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM public.scp_interview_create_version(_pack, 'sv-SE', _rv, 'Test source', 'v2');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_pack_versions WHERE pack_id = _pack) = 2,
    'I5.15 a new version is created and the retired one is preserved');

  PERFORM pg_temp.ok(
    (SELECT content_status FROM public.scp_interview_pack_versions
      WHERE pack_id = _pack AND version_number = 2) = 'draft',
    'I5.16 the new version begins as draft');

  -- The audit trail recorded every governed step, in order, with actors.
  PERFORM pg_temp.ok(
    (SELECT string_agg(event, ',' ORDER BY seq) FROM public.scp_interview_pack_events
      WHERE pack_id = _pack)
    LIKE 'pack_created,version_created,draft_updated,submitted_for_expert_review,expert_review_approved,submitted_for_legal_review,legal_review_approved,submitted_for_cognitive_review,cognitive_review_approved,submitted_for_product_approval,product_approved,published,suspended,retired,new_version_created%',
    'I5.17 the audit ledger holds the whole governed history in order');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_interview_pack_events
                 WHERE pack_id = _pack AND event = 'published' AND actor_id IS NULL),
    'I5.18 the publish event names its actor');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP I6 — approvals die when the content changes'; END $$;

-- The property that makes the review gates worth anything: approve, then edit,
-- and the approval no longer counts.
DO $$
DECLARE
  _pack uuid; _v uuid; _role uuid; _rv uuid; _c uuid; _q uuid; _cv uuid;
  _lvl integer; _blockers integer; _before integer;
BEGIN
  SELECT id INTO _role FROM public.scp_roles WHERE slug = 'security-guard-se';
  SELECT id INTO _rv FROM public.scp_role_versions WHERE role_id = _role ORDER BY version_number DESC LIMIT 1;
  SELECT cv.id INTO _cv FROM public.scp_competency_versions cv
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE c.code = 'SCC-06' AND cv.version_number = 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  _pack := public.scp_interview_create_pack('hash-binding-test', _role, 'Hashtest', 'Testsyfte');
  _v := public.scp_interview_create_version(_pack, 'sv-SE', _rv, 'Test source', 'v1');

  INSERT INTO public.scp_interview_pack_competencies
    (pack_version_id, code, display_order, name_sv, definition_sv, observable_indicators_sv)
  VALUES (_v, 'C1', 1, 'Kommunikation', 'Definition.', ARRAY['Tydlighet']) RETURNING id INTO _c;
  INSERT INTO public.scp_interview_pack_competency_map
    (pack_competency_id, competency_version_id, relation, mapping_state, rationale_sv, confirmed_at)
  VALUES (_c, _cv, 'equivalent', 'confirmed', 'Testmappning.', now());
  INSERT INTO public.scp_interview_core_questions
    (pack_version_id, code, display_order, question_type, prompt_sv)
  VALUES (_v, 'Q1', 1, 'behavioural', 'Ursprunglig formulering.') RETURNING id INTO _q;
  INSERT INTO public.scp_interview_question_competencies (question_id, pack_competency_id, is_primary)
  VALUES (_q, _c, true);
  INSERT INTO public.scp_interview_approved_probes
    (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
  VALUES (_v, _q, 'own_role', 'source_stated', 'Vad var ditt ansvar?', 1);
  INSERT INTO public.scp_interview_evidence_dimensions (question_id, code, label_sv, display_order)
  VALUES (_q, 'egen_roll', 'Egen roll', 1);
  FOR _lvl IN 0..4 LOOP
    INSERT INTO public.scp_interview_rating_anchors
      (question_id, level, label_sv, anchor_sv, counts_toward_aggregation)
    VALUES (_q, _lvl, 'Nivå ' || _lvl, 'Ankartext ' || _lvl, _lvl > 0);
  END LOOP;
  INSERT INTO public.scp_interview_verification_rules
    (pack_version_id, code, requirement_sv, interview_action_sv,
     subsequent_verification_sv, passport_boundary_sv, display_order)
  VALUES (_v, 'test_krav', 'Testkrav', 'Klargör.', 'Separat.', 'Ingen Passport-skrivning.', 1);
  INSERT INTO public.scp_interview_prohibited_areas
    (pack_version_id, area_type, code, statement_sv, rationale_sv, display_order)
  VALUES (_v, 'capability', 'ingen_totalpoang', 'Ingen totalpoäng.', 'Pilot.', 1);
  PERFORM public.scp_interview_touch_draft(_v, 'Klart.');
  PERFORM public.scp_interview_submit_for_review(_v, 'expert');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000a1', true);
  PERFORM public.scp_interview_record_review(_v, 'expert', 'approved', 'Godkänd.');
  RESET ROLE;

  SELECT count(*) INTO _before FROM public.scp_interview_pack_validate(_v)
   WHERE severity = 'blocking' AND code = 'REVIEW_GATE_EXPERT_NOT_APPROVED';
  PERFORM pg_temp.ok(_before = 0, 'I6.1 the expert gate counts as approved immediately after approval');

  -- Now change the question wording. The approval must stop counting.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  UPDATE public.scp_interview_core_questions SET prompt_sv = 'Omskriven formulering.' WHERE id = _q;
  RESET ROLE;

  SELECT count(*) INTO _blockers FROM public.scp_interview_pack_validate(_v)
   WHERE severity = 'blocking' AND code = 'REVIEW_GATE_EXPERT_NOT_APPROVED';
  PERFORM pg_temp.ok(_blockers = 1,
    'I6.2 editing the content after approval invalidates the gate — approve, edit, publish is impossible');

  -- And the reviewer may not be the author.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-0000000000e1', true);
  PERFORM public.scp_interview_touch_draft(_v, 'Ändrad.');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT created_by FROM public.scp_interview_pack_versions WHERE id = _v)
      = '11110000-0000-0000-0000-0000000000e1'::uuid,
    'I6.3 the version records its author');
END $$;

-- A reviewer who is also the author is refused, at the table level.
DO $$
DECLARE _v uuid; _hash text;
BEGIN
  SELECT v.id INTO _v FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'hash-binding-test';
  _hash := public.scp_interview_pack_content_hash(_v);
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_interview_pack_reviews
              (pack_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review)
            VALUES (%L, ''expert'', ''approved'', %L, ''self approval'', %L)',
           _v, '11110000-0000-0000-0000-0000000000e1', _hash),
    'SCP_INTERVIEW_SELF_REVIEW',
    'I6.4 the author of a version cannot review their own work');
END $$;

SELECT pg_temp.must_fail(
  'UPDATE public.scp_interview_pack_reviews SET decision = ''approved''',
  'SCP_INTERVIEW_REVIEW_APPEND_ONLY',
  'I6.5 a review record is never rewritten');


DO $$ BEGIN RAISE NOTICE 'GROUP I7 — the guard that fails closed, and coexistence'; END $$;

-- Attaching the child guard to a table it does not know must RAISE, not pass.
-- This is the difference from scp_guard_child_of_published(), and it is the
-- reason this domain does not reuse it.
DO $$
BEGIN
  CREATE TEMP TABLE pg_temp_unknown_child (id int, pack_version_id uuid);
  EXECUTE 'CREATE TABLE public.scp_interview_unknown_probe (id serial primary key, pack_version_id uuid)';
  EXECUTE 'CREATE TRIGGER t BEFORE INSERT ON public.scp_interview_unknown_probe
             FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent()';
  PERFORM pg_temp.must_fail(
    'INSERT INTO public.scp_interview_unknown_probe (pack_version_id) VALUES (gen_random_uuid())',
    'SCP_INTERVIEW_GUARD_UNKNOWN_TABLE',
    'I7.1 the child guard REFUSES a table it was not taught about, instead of silently allowing the write');
  EXECUTE 'DROP TABLE public.scp_interview_unknown_probe';
END $$;

-- Coexistence: the assessment-support interview content is untouched.
SELECT pg_temp.ok(
  to_regclass('public.scp_interview_guide_prompts') IS NOT NULL,
  'I7.2 scp_interview_guide_prompts still exists and is a separate thing');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_interview_guide_prompts'
       AND column_name LIKE '%pack%'),
  'I7.3 the assessment interview guide gained no interview-pack column');

-- The generic guards were not repointed at this domain.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE c.relname IN (SELECT t FROM pg_temp.domain_tables())
       AND p.proname IN ('scp_guard_published_immutable', 'scp_guard_child_of_published',
                         'scp_guard_version_starts_as_draft')),
  'I7.4 no generic assessment guard is attached to an interview-pack table');

-- Every SECURITY DEFINER function in the domain pins search_path and is out of
-- reach of anon.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'scp_interview_%'
       AND p.proname <> 'scp_interview_notes'
       AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                        WHERE cfg LIKE 'search_path=%')),
  'I7.5 every SECURITY DEFINER function in the domain pins search_path');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'scp_interview_%'
       AND p.proname <> 'scp_interview_notes'
       AND p.prosecdef
       AND (has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'I7.6 no interview-domain definer function is executable by anon');

-- RLS is on, everywhere.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname IN (SELECT t FROM pg_temp.domain_tables())
       AND NOT c.relrowsecurity),
  'I7.7 row level security is enabled on every table in the domain');

ROLLBACK;
