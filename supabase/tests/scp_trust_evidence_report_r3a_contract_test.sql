-- TRUST Evidence Report — PR-R3A: the Report V3 data contract (employer).
--
-- scp_employer_report_v3(attempt_id) is a projection of the released employer
-- document. This suite releases three Väktare attempts (one clean, one with a
-- human safety finding, one with an overturned free text) and proves that the
-- V3 document (a) is shaped as the product owner locked it, (b) carries every
-- conclusion the frozen document carries and none it does not, (c) keeps
-- SCC-08 on one item as limited evidence, (d) keeps self-report apart,
-- (e) reaches nothing internal, (f) is invisible to every wrong principal,
-- and (g) survives the two historical shapes production holds.
--
--   V0  fixture and state
--   V1  shape: the locked top-level and area fields; every area number a count
--   V2  every conclusion equals the frozen employer document
--   V3  SCC-08: one observed item is limited evidence, and follow-up
--   V4  self-report is its own array and never an observed source
--   V5  human review, free text and the safety finding
--   V6  the TRUST Interview Plan: three areas, five questions, authored text
--   V7  the thirty-second overview and the primary next step
--   V8  audience safety: nothing internal, nothing for the wrong principal
--   V9  post-interview addenda compose with an unchanged report
--   V10 provenance summary and historical compatibility
--
-- One transaction, ends in ROLLBACK.

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

CREATE OR REPLACE FUNCTION pg_temp.rubric_levels(_ivid uuid, _fmt text, _level int)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE _level END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- The area of a V3 document, by competency code.
CREATE OR REPLACE FUNCTION pg_temp.area(_d jsonb, _code text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT a FROM jsonb_array_elements(_d -> 'areas') a WHERE a ->> 'competency_code' = _code;
$fn$;

DO $$ BEGIN RAISE NOTICE 'GROUP V0 — fixture and state'; END $$;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3' AND p.prosecdef),
  'V0.1 scp_employer_report_v3 exists as a SECURITY DEFINER');
SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'scp_report_snapshots' AND column_name = 'manifest_id'),
  'V0.2 R2A-3 CONTRACT and PR-R1 are applied underneath');

-- ---------------------------------------------------------------------------
-- Fixture: one guarding company (owner, reviewer), three candidates, a second
-- organisation, a stranger. The flagship Väktare form.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tr AS
SELECT
  'fd300000-0000-0000-0000-000000000001'::uuid AS employer,
  'fd300000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fd300000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fd300000-0000-0000-0000-00000000000a'::uuid AS p1,
  'fd300000-0000-0000-0000-00000000000b'::uuid AS p2,
  'fd300000-0000-0000-0000-00000000000c'::uuid AS p3,
  'fd300000-0000-0000-0000-000000000011'::uuid AS other_employer,
  'fd300000-0000-0000-0000-000000000012'::uuid AS other_owner,
  'fd300000-0000-0000-0000-000000000013'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM tr), 'owner@trust-r3a.test'),
  ((SELECT reviewer_user FROM tr), 'reviewer@trust-r3a.test'),
  ((SELECT p1            FROM tr), 'p1@trust-r3a.test'),
  ((SELECT p2            FROM tr), 'p2@trust-r3a.test'),
  ((SELECT p3            FROM tr), 'p3@trust-r3a.test'),
  ((SELECT other_owner   FROM tr), 'other@trust-r3a.test'),
  ((SELECT stranger      FROM tr), 'stranger@trust-r3a.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Trust Bevakning R3A AB', 'trust-r3a', 'active' FROM tr
UNION ALL
SELECT other_employer, 'Annan Bevakning R3A AB', 'annan-trust-r3a', 'active' FROM tr;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user,    'owner',  'active' FROM tr UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM tr UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM tr;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM tr;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM tr;

CREATE TEMP TABLE trv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM trv),
       'TRUST evidence report R3A contract', owner_user,
       now() + interval '30 days' FROM tr;

GRANT SELECT ON tr, trv TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
CREATE TEMP TABLE runs AS
SELECT 'P1'::text AS persona, * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p1@trust-r3a.test', NULL, 'sv', 'recruitment')
UNION ALL
SELECT 'P2', * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p2@trust-r3a.test', NULL, 'sv', 'recruitment')
UNION ALL
SELECT 'P3', * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p3@trust-r3a.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON runs TO authenticated, anon;

CREATE TEMP TABLE items AS
SELECT fi.display_order, i.slug,
       iv.id AS ivid, iv.item_format, iv.evidence_source_type, iv.is_safety_critical,
       c.code AS competency_code,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
  JOIN public.scp_competencies c ON c.id = iv.competency_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM runs WHERE persona = 'P1'));
GRANT SELECT ON items TO authenticated;

CREATE TEMP TABLE flagged AS
SELECT ivid, slug, competency_code FROM items WHERE is_safety_critical ORDER BY display_order LIMIT 1;
CREATE TEMP TABLE overturned AS
SELECT ivid, slug, competency_code FROM items WHERE item_format = 'constructed_response' ORDER BY display_order LIMIT 1;
GRANT SELECT ON flagged, overturned TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM items) = 50
  AND (SELECT count(*) FROM items WHERE competency_code = 'SCC-08') = 1,
  'V0.3 the flagship form: 50 items, SCC-08 on exactly one');

-- All three answer identically: the best option everywhere, the same free text.
DO $$
DECLARE _p record; _it record;
BEGIN
  FOR _p IN SELECT r.persona, r.attempt_id,
                   CASE r.persona WHEN 'P1' THEN t.p1 WHEN 'P2' THEN t.p2 ELSE t.p3 END AS uid
              FROM runs r CROSS JOIN tr t
  LOOP
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', _p.uid::text, true);
    FOR _it IN SELECT * FROM items ORDER BY display_order LOOP
      IF _it.item_format = 'constructed_response' THEN
        PERFORM public.scp_save_response(_p.attempt_id, _it.ivid, NULL, NULL, NULL,
          'Jag missade att låsa en dörr på sista ronden. Jag ringde objektet samma '
          'kväll, skrev en avvikelse på mig själv och la till dörren i min egen '
          'slutkontroll. FRITEXTTOKEN-' || _p.persona);
      ELSE
        PERFORM public.scp_save_response(_p.attempt_id, _it.ivid, _it.best_option, NULL, NULL, NULL);
      END IF;
    END LOOP;
    PERFORM public.scp_submit_attempt(_p.attempt_id);
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

-- Review. P1 all upheld and cleared; P2 one 'high' finding on the first
-- safety-critical scenario; P3 one free text overturned.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS ivid, iv.item_format, run.persona
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN runs run ON run.attempt_id = r.attempt_id
     WHERE hr.review_status = 'pending'
  LOOP
    IF _r.persona = 'P3' AND _r.ivid = (SELECT ivid FROM overturned) THEN
      PERFORM public.scp_complete_human_review(_r.id, 'overturned',
        'Texten svarar inte på frågan; den beskriver en rutin, inte en händelse.',
        NULL, pg_temp.rubric_levels(_r.ivid, _r.item_format, 1));
    ELSE
      PERFORM public.scp_complete_human_review(_r.id, 'upheld',
        'Läst mot rubriken. Konkret situation, egen åtgärd och vad som ändrades. RATIONALETOKEN',
        CASE WHEN NOT _r.is_safety_critical THEN NULL
             WHEN _r.persona = 'P2' AND _r.ivid = (SELECT ivid FROM flagged) THEN 'high'
             ELSE 'no_concern' END,
        pg_temp.rubric_levels(_r.ivid, _r.item_format, 4));
    END IF;
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) IS NULL,
  'V0.4 before release the V3 contract returns NULL, exactly as the audience contract returns no row');
DO $$ BEGIN
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P1'));
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P2'));
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P3'));
END $$;

-- The documents, read as the owner: the frozen employer document and its V3 projection.
CREATE TEMP TABLE emp AS
SELECT run.persona, to_jsonb(e) AS d
  FROM runs run, LATERAL public.scp_employer_report(run.attempt_id) e;
CREATE TEMP TABLE v3 AS
SELECT run.persona, public.scp_employer_report_v3(run.attempt_id) AS d FROM runs run;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON emp, v3 TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM v3 WHERE d IS NOT NULL) = 3
  AND (SELECT count(*) FROM emp) = 3,
  'V0.5 three released attempts, three V3 documents, three frozen employer documents');

DO $$ BEGIN RAISE NOTICE 'GROUP V1 — the locked shape'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(d ->> 'schema_version' = 'trust-evidence-report/v3' AND d ->> 'audience' = 'employer')
     FROM v3),
  'V1.1 schema_version trust-evidence-report/v3, audience employer');

SELECT pg_temp.ok(
  (SELECT bool_and(ARRAY['schema_version','report_id','released_at','audience','context','coverage','areas',
                         'self_reported_patterns','trust_followups','limitations','human_review',
                         'provenance_summary','primary_next_step','overview','safety_followup',
                         'trust_plan','interview_addenda']
                   <@ (SELECT array_agg(k) FROM jsonb_object_keys(d) k))
     FROM v3),
  'V1.2 every top-level field the owner locked is present, plus next step, overview, safety panel, plan and addenda');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (d ? 'score') AND NOT (d ? 'total') AND NOT (d ? 'rank') AND NOT (d ? 'verdict')
               AND NOT (d ? 'decision') AND NOT (d ? 'recommendation') AND NOT (d ? 'computation_manifest_ref'))
     FROM v3),
  'V1.3 no top-level score, total, rank, verdict, decision, recommendation or manifest reference');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'areas') = 8
      AND (SELECT array_agg(a ->> 'competency_code' ORDER BY a ->> 'competency_code') FROM jsonb_array_elements(d -> 'areas') a)
          = ARRAY['SCC-01','SCC-03','SCC-04','SCC-06','SCC-07','SCC-08','SCC-09','SCC-11'])
     FROM v3),
  'V1.4 exactly the eight competencies of the form, one area each');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        ARRAY['competency_code','competency_version','evidence_state','observed_item_count','planned_item_count',
              'context_count','source_types','coverage_status','review_status','methodological_flags',
              'factual_explanation','follow_up_priority','response_pattern']
        <@ (SELECT array_agg(k) FROM jsonb_object_keys(a) k))
        FROM jsonb_array_elements(d -> 'areas') a))
     FROM v3),
  'V1.5 every area carries the twelve locked fields and the response-pattern label');

-- Every number on an area is a count: top-level numbers end in _count, and
-- the evidence basis holds item / review counts only.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'areas') a, jsonb_each(a) kv
     WHERE jsonb_typeof(kv.value) = 'number' AND kv.key NOT LIKE '%\_count')
  AND NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'areas') a, jsonb_each(a -> 'evidence_basis') kv
     WHERE jsonb_typeof(kv.value) = 'number'
       AND kv.key NOT SIMILAR TO '%(items|answered|reviewed|completed|disputed)'),
  'V1.6 the only numbers on an area are counts');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(a ->> 'evidence_state' IN ('observed_consistent','observed_mixed','observed_follow_up',
                                                 'observed_limited','self_reported_only','not_covered','human_review_pending')
                  AND a ->> 'response_pattern' IN ('clearly_consistent','consistent','mixed','follow_up','limited','none')
                  AND a ->> 'coverage_status' IN ('covered','partially_covered','limited','not_covered')
                  AND a ->> 'review_status' IN ('not_required','pending','completed_upheld','completed_disputed')
                  AND a ->> 'follow_up_priority' IN ('first','next','if_time_allows','none'))
        FROM jsonb_array_elements(d -> 'areas') a))
     FROM v3),
  'V1.7 every state on every area is a value of its closed set');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(coalesce(a -> 'factual_explanation' ->> 'sv', '') <> '' AND coalesce(a -> 'factual_explanation' ->> 'en', '') <> ''
                  AND coalesce(a -> 'behaviour' ->> 'sv', '') <> '' AND coalesce(a -> 'behaviour' ->> 'en', '') <> ''
                  AND coalesce(a ->> 'competency_name_sv', '') <> '' AND coalesce(a ->> 'competency_name_en', '') <> '')
        FROM jsonb_array_elements(d -> 'areas') a)
     AND coalesce(d -> 'limitations' -> 'standing_statement' ->> 'sv', '') <> ''
     AND coalesce(d -> 'limitations' -> 'standing_statement' ->> 'en', '') <> ''
     AND coalesce(d -> 'primary_next_step' -> 'reason' ->> 'sv', '') <> ''
     AND coalesce(d -> 'primary_next_step' -> 'reason' ->> 'en', '') <> '')
     FROM v3),
  'V1.8 every authored line is present in both Swedish and English');

DO $$ BEGIN RAISE NOTICE 'GROUP V2 — every conclusion equals the frozen document'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(v.d ->> 'report_id' = e.d ->> 'id'
               AND v.d ->> 'attempt_id' = e.d ->> 'attempt_id'
               AND v.d ->> 'subject_id' = e.d ->> 'subject_id'
               AND (v.d ->> 'released_at')::timestamptz = (e.d ->> 'released_at')::timestamptz)
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.1 report_id, attempt, subject and release time are the frozen employer document''s');

-- Each observed area: label from the frozen signal, count from the frozen
-- count, explanation verbatim from the frozen why-line.
SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        (pg_temp.area(v.d, o ->> 'area_code') ->> 'observed_item_count')::int = (o ->> 'items')::int
        AND pg_temp.area(v.d, o ->> 'area_code') -> 'factual_explanation' ->> 'sv' = o ->> 'why_sv'
        AND pg_temp.area(v.d, o ->> 'area_code') -> 'factual_explanation' ->> 'en' = o ->> 'why_en'
        AND pg_temp.area(v.d, o ->> 'area_code') -> 'behaviour' ->> 'sv' = o ->> 'behaviour_sv'
        AND pg_temp.area(v.d, o ->> 'area_code') ->> 'response_pattern' =
              CASE o ->> 'signal' WHEN 'strong' THEN 'clearly_consistent' WHEN 'consistent' THEN 'consistent'
                                  WHEN 'mixed' THEN 'mixed' WHEN 'developing' THEN 'follow_up' ELSE 'limited' END
        AND pg_temp.area(v.d, o ->> 'area_code') ->> 'evidence_state' =
              CASE o ->> 'signal' WHEN 'strong' THEN 'observed_consistent' WHEN 'consistent' THEN 'observed_consistent'
                                  WHEN 'mixed' THEN 'observed_mixed' WHEN 'developing' THEN 'observed_follow_up'
                                  ELSE 'observed_limited' END)
        FROM jsonb_array_elements(e.d -> 'brief' -> 'observed') o))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.2 every observed area: count, why-line, behaviour, pattern label and state come from the frozen signal');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(e.d -> 'brief' -> 'observed')) =
     (SELECT count(*) FROM jsonb_array_elements(v.d -> 'areas') a WHERE (a ->> 'observed_item_count')::int > 0))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.3 an area has observed evidence in V3 exactly when the frozen brief lists it');

SELECT pg_temp.ok(
  (SELECT bool_and(
        (v.d -> 'coverage' ->> 'observed_items')::int = (e.d -> 'brief' -> 'coverage' ->> 'observed_observations')::int
    AND (v.d -> 'coverage' ->> 'self_report_items')::int = (e.d -> 'brief' -> 'coverage' ->> 'self_report_observations')::int
    AND (v.d -> 'coverage' ->> 'evidence_contexts')::int = (e.d -> 'brief' -> 'coverage' ->> 'evidence_contexts')::int
    AND (v.d -> 'human_review' ->> 'reviews_total')::int = (e.d -> 'brief' -> 'coverage' ->> 'reviews_total')::int
    AND (v.d -> 'human_review' ->> 'reviews_completed')::int = (e.d -> 'brief' -> 'coverage' ->> 'reviews_completed')::int
    AND v.d -> 'coverage' -> 'modules' = e.d -> 'brief' -> 'modules')
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.4 coverage counts, review counts and modules are the frozen brief''s');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT array_agg(g ->> 'question_sv' ORDER BY (g ->> 'guide_order')::int, g ->> 'area_code', g ->> 'focus')
        FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g)
     = (SELECT array_agg(f -> 'question' ->> 'sv' ORDER BY f_ord)
          FROM jsonb_array_elements(v.d -> 'trust_followups') WITH ORDINALITY x(f, f_ord))
     AND (SELECT array_agg(g -> 'listen_for_en' ORDER BY (g ->> 'guide_order')::int, g ->> 'area_code', g ->> 'focus')
            FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g)
       = (SELECT array_agg(f -> 'listen_for' -> 'en' ORDER BY f_ord)
            FROM jsonb_array_elements(v.d -> 'trust_followups') WITH ORDINALITY x(f, f_ord)))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.5 the TRUST follow-ups are the frozen interview guide, verbatim and in its order');

SELECT pg_temp.ok(
  (SELECT bool_and(v.d -> 'safety_followup' -> 'findings' = e.d -> 'safety_flags'
               AND (v.d -> 'safety_followup' ->> 'present')::boolean = (jsonb_array_length(e.d -> 'safety_flags') > 0)
               AND (v.d -> 'human_review' ->> 'safety_findings_present')::boolean = (jsonb_array_length(e.d -> 'safety_flags') > 0))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.6 the safety findings are the frozen findings, nothing more and nothing inferred');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(e.d -> 'brief' -> 'self_reported')) = jsonb_array_length(v.d -> 'self_reported_patterns')
     AND (SELECT bool_and(
            (SELECT count(*) FROM jsonb_array_elements(v.d -> 'self_reported_patterns') p
              WHERE p ->> 'domain_key' = s ->> 'domain_key' AND p ->> 'pattern' = s ->> 'pattern'
                AND p ->> 'consistency' = s ->> 'consistency' AND (p ->> 'item_count')::int = (s ->> 'items')::int
                AND p -> 'factual_explanation' ->> 'sv' = s ->> 'why_sv' AND p ->> 'competency_code' = s ->> 'area_code') = 1)
            FROM jsonb_array_elements(e.d -> 'brief' -> 'self_reported') s))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.7 every self-report pattern, consistency, count and why-line is the frozen brief''s');

-- No signal, maturity, state or self-report routine is called: the projection
-- reads, it does not compute.
SELECT pg_temp.ok(
  (SELECT p.prosrc NOT ILIKE '%scp_attempt_assessment_signal%' AND p.prosrc NOT ILIKE '%scp_attempt_maturity%'
      AND p.prosrc NOT ILIKE '%scp_attempt_evidence_state%' AND p.prosrc NOT ILIKE '%scp_attempt_self_report_pattern%'
      AND p.prosrc NOT ILIKE '%scp_competency_evidence%' AND p.prosrc NOT ILIKE '%scp_maturity_thresholds%'
      AND p.prosrc LIKE '%FROM public.scp_employer_report(_attempt_id)%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3'),
  'V2.8 the projection calls no scoring, signal, maturity or state routine and reads the ledger nowhere -- no parallel engine');

DO $$ BEGIN RAISE NOTICE 'GROUP V3 — SCC-08 on one item is limited evidence, and follow-up'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        (pg_temp.area(d, 'SCC-08') ->> 'observed_item_count')::int = 1
    AND (pg_temp.area(d, 'SCC-08') ->> 'planned_item_count')::int = 1
    AND pg_temp.area(d, 'SCC-08') ->> 'response_pattern' = 'limited'
    AND pg_temp.area(d, 'SCC-08') ->> 'evidence_state' = 'observed_limited'
    AND pg_temp.area(d, 'SCC-08') ->> 'coverage_status' = 'limited'
    AND pg_temp.area(d, 'SCC-08') -> 'methodological_flags' ? 'single_item'
    AND pg_temp.area(d, 'SCC-08') -> 'limitation' ->> 'code' = 'single_item')
     FROM v3),
  'V3.1 SCC-08 reads as limited evidence on one item, flagged single_item, on every document');

SELECT pg_temp.ok(
  (SELECT bool_and(
        pg_temp.area(d, 'SCC-08') ->> 'follow_up_priority' IN ('first','next')
    AND pg_temp.area(d, 'SCC-08') -> 'trust_followup_codes' ? 'explore_limited_evidence'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'trust_followups') f
                 WHERE f ->> 'competency_code' = 'SCC-08' AND f ->> 'focus' = 'explore_limited_evidence'
                   AND coalesce(f -> 'question' ->> 'sv', '') <> '' AND coalesce(f -> 'question' ->> 'en', '') <> '')
    AND pg_temp.area(d, 'SCC-08') -> 'limitation' ->> 'sv' ILIKE '%följ upp i intervju%'
    AND pg_temp.area(d, 'SCC-08') -> 'limitation' ->> 'en' ILIKE '%follow up in interview%')
     FROM v3),
  'V3.2 SCC-08 is a follow-up: an interview priority, an authored limited-evidence question, and the card says so');

SELECT pg_temp.ok(
  (SELECT bool_and(EXISTS (
     SELECT 1 FROM jsonb_array_elements(d -> 'overview' -> 'limited_evidence') x WHERE x ->> 'competency_code' = 'SCC-08')
     AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(d -> 'overview' -> 'clearest_support') x WHERE x ->> 'competency_code' = 'SCC-08'))
     FROM v3),
  'V3.3 SCC-08 sits under limited evidence in the overview and never under clearest support');

-- The regression rule, stated over every area of every document: fewer than
-- three observed items can never read as a confident pattern.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'areas') a
     WHERE (a ->> 'observed_item_count')::int < 3
       AND (a ->> 'response_pattern' NOT IN ('limited','none')
            OR a ->> 'evidence_state' IN ('observed_consistent','observed_mixed','observed_follow_up')
            OR a ->> 'coverage_status' = 'covered')),
  'V3.4 no area with fewer than three observed items reads as a confident pattern, a full coverage or a consistent state');

SELECT pg_temp.ok(
  (SELECT bool_and(lower(pg_temp.area(d, 'SCC-08')::text) NOT SIMILAR TO
     '%(svag|weak|risk|brist|deficien|låg poäng|low score|fail|underkän|otillräcklig)%')
     FROM v3),
  'V3.5 nothing on the SCC-08 card says weak, low, risk, fail or deficient in either language');

DO $$ BEGIN RAISE NOTICE 'GROUP V4 — self-report is its own array and never an observed source'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'self_reported_patterns') = 8
      AND (SELECT bool_and(p ->> 'evidence_type' = 'self_reported' AND p ->> 'interpretation' = 'descriptive_only'
                       AND p ->> 'pattern' IN ('consistently_described','mostly_described','rarely_described','not_described')
                       AND p ->> 'consistency' IN ('consistent','varied'))
             FROM jsonb_array_elements(d -> 'self_reported_patterns') p))
     FROM v3),
  'V4.1 eight self-described domains, every one stamped self_reported and descriptive_only');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'areas') a
     WHERE a -> 'source_types' ? 'self_report'
        OR (a ->> 'evidence_state' LIKE 'observed_%' AND a -> 'source_types' ? 'self_report')),
  'V4.2 no area lists self_report as a source, under any state');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        (SELECT count(*) FROM jsonb_array_elements(d -> 'self_reported_patterns') p WHERE p ->> 'competency_code' = a ->> 'competency_code')
        = jsonb_array_length(a -> 'self_description_domain_keys'))
        FROM jsonb_array_elements(d -> 'areas') a))
     FROM v3),
  'V4.3 a card only points at its own self-described domains; the words stay in the self-report array');

SELECT pg_temp.ok(
  (SELECT bool_and(
        pg_temp.area(d, 'SCC-08') -> 'self_description_domain_keys' = '[]'::jsonb
    AND pg_temp.area(d, 'SCC-11') -> 'self_description_domain_keys' = '[]'::jsonb
    AND jsonb_array_length(pg_temp.area(d, 'SCC-03') -> 'self_description_domain_keys') = 2
    AND pg_temp.area(d, 'SCC-03') -> 'methodological_flags' ? 'self_report_not_observed'
    AND NOT (pg_temp.area(d, 'SCC-08') -> 'methodological_flags' ? 'self_report_not_observed'))
     FROM v3),
  'V4.4 SCC-08 and SCC-11 have no self-description; SCC-03 has two domains and carries the flag');

SELECT pg_temp.ok(
  (SELECT bool_and(lower((d -> 'self_reported_patterns')::text) NOT SIMILAR TO
     '%(visat|styrka|svag|shown|strength|weak|score|poäng|oärlig|dishonest|decept|social desirab|personlighet|personality)%')
     FROM v3),
  'V4.5 the self-report words stay descriptive: never shown, strength, weak, score, dishonest or personality');

DO $$ BEGIN RAISE NOTICE 'GROUP V5 — human review, free text and the safety finding'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        (d -> 'coverage' -> 'composition' ->> 'scenario_items')::int = 22
    AND (d -> 'coverage' -> 'composition' ->> 'self_description_items')::int = 24
    AND (d -> 'coverage' -> 'composition' ->> 'free_text_items')::int = 4
    AND (d -> 'coverage' -> 'composition' ->> 'scenario_answered')::int = 22
    AND (d -> 'coverage' -> 'composition' ->> 'self_description_answered')::int = 24
    AND (d -> 'coverage' -> 'composition' ->> 'free_text_answered')::int = 4
    AND (d -> 'coverage' -> 'composition' ->> 'free_text_reviewed')::int = 4
    AND (d -> 'coverage' -> 'composition' ->> 'safety_critical_items')::int = 3
    AND (d -> 'coverage' -> 'composition' ->> 'safety_critical_reviewed')::int = 3)
     FROM v3),
  'V5.1 the composition is truthful: 22 scenario, 24 self-description, 4 free-text answers, all four read and all three safety-critical answers checked');

SELECT pg_temp.ok(
  (SELECT bool_and((d -> 'human_review' ->> 'reviews_total')::int = 7
               AND (d -> 'human_review' ->> 'reviews_completed')::int = 7
               AND (d -> 'human_review' ->> 'reviews_pending')::int = 0
               AND (d -> 'human_review' ->> 'complete')::boolean
               AND (d -> 'context' ->> 'human_reviewed_badge')::boolean)
     FROM v3),
  'V5.2 seven reviews, seven completed, none pending: the report is human-reviewed and says so');

SELECT pg_temp.ok(
  (SELECT (d -> 'human_review' ->> 'disputed_readings')::int = 0 FROM v3 WHERE persona = 'P1')
  AND (SELECT (d -> 'human_review' ->> 'disputed_readings')::int = 1 FROM v3 WHERE persona = 'P3')
  AND (SELECT pg_temp.area(d, (SELECT competency_code FROM overturned)) ->> 'review_status' = 'completed_disputed'
         FROM v3 WHERE persona = 'P3')
  AND (SELECT pg_temp.area(d, (SELECT competency_code FROM overturned)) ->> 'review_status' = 'completed_upheld'
         FROM v3 WHERE persona = 'P1'),
  'V5.3 an overturned free text is a disputed reading on its area and in the review record; upheld elsewhere');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and((a -> 'source_types' ? 'human_reviewed_free_text') = ((a -> 'evidence_basis' ->> 'free_text_items')::int > 0))
        FROM jsonb_array_elements(d -> 'areas') a))
     FROM v3 WHERE persona = 'P1'),
  'V5.4 the free-text channel appears as its own source exactly on the areas whose free text a person read and let stand');

SELECT pg_temp.ok(
  (SELECT NOT (pg_temp.area(d, (SELECT competency_code FROM overturned)) -> 'source_types' ? 'human_reviewed_free_text')
     FROM v3 WHERE persona = 'P3')
  OR (SELECT (pg_temp.area(d, (SELECT competency_code FROM overturned)) -> 'evidence_basis' ->> 'free_text_items')::int > 1
        FROM v3 WHERE persona = 'P3'),
  'V5.5 an overturned free text is not offered as human-reviewed evidence');

SELECT pg_temp.ok(
  (SELECT NOT (d -> 'safety_followup' ->> 'present')::boolean AND d -> 'safety_followup' -> 'areas_flagged_for_follow_up' = '[]'::jsonb
     FROM v3 WHERE persona = 'P1')
  AND (SELECT (d -> 'safety_followup' ->> 'present')::boolean
           AND (d -> 'safety_followup' ->> 'finding_count')::int = 1
           AND d -> 'safety_followup' ->> 'source' = 'human_review'
           AND d -> 'safety_followup' -> 'areas_flagged_for_follow_up' ? (SELECT competency_code FROM flagged)
           AND (pg_temp.area(d, (SELECT competency_code FROM flagged)) ->> 'safety_critical_follow_up')::boolean
           AND pg_temp.area(d, (SELECT competency_code FROM flagged)) ->> 'follow_up_priority' = 'first'
         FROM v3 WHERE persona = 'P2'),
  'V5.6 the safety panel exists only for the human finding, names its area, and that area is a first-priority follow-up');

SELECT pg_temp.ok(
  (SELECT d -> 'safety_followup' -> 'findings' -> 0 ->> 'severity' = 'high'
      AND NOT (d -> 'safety_followup' ? 'score') AND NOT (d -> 'safety_followup' ? 'risk')
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'safety_followup' -> 'findings' -> 0) k)
          = ARRAY['finding','observed_at','severity']
     FROM v3 WHERE persona = 'P2'),
  'V5.7 the finding is stated as {finding, severity, observed_at} and never as a number');

-- The finding changes the next step and nothing in the evidence cards.
SELECT pg_temp.ok(
  (SELECT p1x.x = p2x.x
     FROM (SELECT jsonb_agg(a - 'safety_critical_follow_up' - 'follow_up_priority' ORDER BY a ->> 'competency_code') AS x
             FROM v3, jsonb_array_elements(d -> 'areas') a WHERE persona = 'P1') p1x,
          (SELECT jsonb_agg(a - 'safety_critical_follow_up' - 'follow_up_priority' ORDER BY a ->> 'competency_code') AS x
             FROM v3, jsonb_array_elements(d -> 'areas') a WHERE persona = 'P2') p2x),
  'V5.8 with and without the finding, every card reads the same apart from the follow-up marks');

DO $$ BEGIN RAISE NOTICE 'GROUP V6 — the TRUST Interview Plan'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'trust_plan' -> 'priorities') BETWEEN 1 AND 3
               AND (d -> 'trust_plan' ->> 'question_count')::int BETWEEN 1 AND 5
               AND (d -> 'trust_plan' ->> 'area_limit')::int = 3
               AND (d -> 'trust_plan' ->> 'question_limit')::int = 5)
     FROM v3),
  'V6.1 at most three priority areas and at most five questions');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
          ARRAY['target','ready','understand','structure','tell'] <@ (SELECT array_agg(k) FROM jsonb_object_keys(p) k)
          AND coalesce(p -> 'understand' -> 'question' ->> 'sv', '') <> ''
          AND coalesce(p -> 'understand' -> 'question' ->> 'en', '') <> ''
          AND (SELECT array_agg(s ->> 'key' ORDER BY s_ord) FROM jsonb_array_elements(p -> 'structure' -> 'steps') WITH ORDINALITY x(s, s_ord))
              = ARRAY['situation','own_role','action','result','reflection']
          AND jsonb_array_length(p -> 'tell' -> 'listen_for' -> 'sv') > 0
          AND coalesce(p -> 'tell' -> 'document' ->> 'sv', '') <> ''
          AND coalesce(p -> 'ready' -> 'existing_evidence' ->> 'sv', '') <> '')
        FROM jsonb_array_elements(d -> 'trust_plan' -> 'priorities') p))
     FROM v3),
  'V6.2 every priority carries T, R, U, S and T: a target, the existing evidence, one authored question, the five-step structure, what to listen for');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(EXISTS (
        SELECT 1 FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g
         WHERE g ->> 'area_code' = p ->> 'competency_code'
           AND g ->> 'question_sv' = p -> 'understand' -> 'question' ->> 'sv'
           AND g ->> 'question_en' = p -> 'understand' -> 'question' ->> 'en'
           AND g -> 'listen_for_sv' = p -> 'tell' -> 'listen_for' -> 'sv'))
        FROM jsonb_array_elements(v.d -> 'trust_plan' -> 'priorities') p)
     AND (v.d -> 'trust_plan' -> 'priorities' -> 0 ->> 'competency_code')
         = (SELECT g ->> 'area_code' FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') WITH ORDINALITY x(g, o) ORDER BY o LIMIT 1))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V6.3 every plan question and listen-for line is an authored guide entry, and the first priority is the guide''s first area');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(d -> 'trust_plan' -> 'priorities') p) =
     (SELECT count(DISTINCT p ->> 'competency_code') FROM jsonb_array_elements(d -> 'trust_plan' -> 'priorities') p)
     AND (d -> 'trust_plan' ->> 'question_count')::int =
         (SELECT sum(CASE WHEN p -> 'structure' -> 'followup' IS NOT NULL AND jsonb_typeof(p -> 'structure' -> 'followup') = 'object' THEN 2 ELSE 1 END)
            FROM jsonb_array_elements(d -> 'trust_plan' -> 'priorities') p))
     FROM v3),
  'V6.4 no area twice, and the question count is the questions actually carried');

SELECT pg_temp.ok(
  (SELECT bool_and(lower((d -> 'trust_plan')::text) NOT SIMILAR TO
     '%(varför hade du svårt|why did you struggle|why were you unable|star-metod|star method|\mstar\M)%')
     FROM v3),
  'V6.5 no plan line assumes a deficiency, and nothing user-facing is called STAR');

DO $$ BEGIN RAISE NOTICE 'GROUP V7 — the overview and the primary next step'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        jsonb_array_length(d -> 'overview' -> 'clearest_support') <= 3
    AND jsonb_array_length(d -> 'overview' -> 'verify_in_interview') <= 3
    AND jsonb_array_length(d -> 'overview' -> 'limited_evidence') <= 3
    AND (SELECT bool_and(x ->> 'response_pattern' IN ('clearly_consistent','consistent')) FROM jsonb_array_elements(d -> 'overview' -> 'clearest_support') x)
    AND (SELECT bool_and(x ->> 'response_pattern' IN ('limited','none')) FROM jsonb_array_elements(d -> 'overview' -> 'limited_evidence') x)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(d -> 'overview' -> 'clearest_support') a
        JOIN jsonb_array_elements(d -> 'overview' -> 'limited_evidence') b ON a ->> 'competency_code' = b ->> 'competency_code'))
     FROM v3),
  'V7.1 three compact groups of at most three, disjoint, each holding only its own kind of area');

SELECT pg_temp.ok(
  (SELECT d -> 'primary_next_step' ->> 'step' = 'structured_interview' FROM v3 WHERE persona = 'P1')
  AND (SELECT d -> 'primary_next_step' ->> 'step' = 'request_clarification'
           AND d -> 'primary_next_step' ->> 'reason_code' = 'safety_follow_up' FROM v3 WHERE persona = 'P2')
  AND (SELECT d -> 'primary_next_step' ->> 'step' = 'structured_interview' FROM v3 WHERE persona = 'P3'),
  'V7.2 the clean report leads to a structured interview; the human finding leads to a clarification first');

SELECT pg_temp.ok(
  (SELECT bool_and(d -> 'primary_next_step' ->> 'step' IN ('structured_interview','additional_assessment','request_clarification','gather_more_evidence')
               AND (d -> 'primary_next_step' -> 'interview_handoff' ->> 'attempt_id')::uuid = (d ->> 'attempt_id')::uuid
               AND jsonb_array_length(d -> 'primary_next_step' -> 'interview_handoff' -> 'focus_area_codes') <= 3)
     FROM v3),
  'V7.3 the step is one of the four process steps, and the handoff names the attempt and at most three focus areas');

DO $$ BEGIN RAISE NOTICE 'GROUP V8 — nothing internal, nothing for the wrong principal'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(lower(d::text) NOT SIMILAR TO
     '%("mean"|"spread"|derivation_input|behaviour_version_id|manifest_id|canonical_sha256|score_value|reviewer_rationale|contribution|confidence|option_key|is_preferred|rubric_level|derivation_basis|weighted_sum|denominator|maturity_level|ratiotoken)%'
     AND d::text NOT LIKE '%RATIONALETOKEN%'
     AND d::text NOT LIKE '%FRITEXTTOKEN%')
     FROM v3),
  'V8.1 no mean, spread, derivation input, behaviour id, manifest id, hash, option key, score value, rubric level, rationale or free-text body anywhere in the document');

-- The template's own limitation lines are the product's authored denials
-- ("not a ranking of people") and are checked separately below; everything
-- this projection writes or carries from the brief must be clean outright.
SELECT pg_temp.ok(
  (SELECT bool_and(lower((d #- '{limitations,template}')::text) NOT SIMILAR TO
     '%(bör anställas|rekommenderar anställning|rekommenderas för anställning|olämplig|lämplig för tjänsten|rangordn|percentil|totalpoäng|sammanlagd poäng|slutpoäng|riskpoäng|riskprofil|personlighet|matchprocent|normgrupp|spindeldiagram|radardiagram|svag kompetens|svagt område|låg poäng|förutsäger|topp 3|topp 5)%'
     AND lower((d #- '{limitations,template}')::text) NOT SIMILAR TO
     '%(should be hired|recommend hiring|recommended for hire|unsuitable|suitable for the role|ranked|ranking|percentile|total score|overall score|final score|weighted score|risk score|risk profile|personality|match percentage|job fit|fit score|norm group|top candidate|top 3|top 5|radar chart|spider chart|weak competency|weak area|low score|predicts|bias-free|unbiased|pass/fail|traffic light)%')
     FROM v3),
  'V8.2 no forbidden claim, in either language, anywhere in the document outside the template''s own denials');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(lower(l) NOT SIMILAR TO '%(rangordn|rank)%' OR lower(l) SIMILAR TO '%(inte|ingen|not |no )%')
        FROM jsonb_array_elements_text((d -> 'limitations' -> 'template' -> 'sv') || (d -> 'limitations' -> 'template' -> 'en')) l))
     FROM v3),
  'V8.2b and where a template line names a ranking it does so only to deny one');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'areas') a, jsonb_object_keys(a) k
     WHERE k IN ('total_score','overall_score','percentile','ranking','benchmark','match_percent','job_fit','fit_score',
                 'suitability','pass_fail','hire','reject','risk_score','potential_score','personality','radar','traffic_light')),
  'V8.3 no forbidden key on any area');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) IS NULL,
  'V8.4 the participant gets NULL from the employer V3 contract for their own attempt');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000012';
SELECT pg_temp.ok(
  (SELECT bool_and(public.scp_employer_report_v3(attempt_id) IS NULL) FROM runs),
  'V8.5 a second organisation gets NULL for every attempt');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000013';
SELECT pg_temp.ok(
  (SELECT bool_and(public.scp_employer_report_v3(attempt_id) IS NULL) FROM runs),
  'V8.6 an unrelated signed-in account gets NULL');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'V8.7 and still cannot read the snapshot table');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT public.scp_employer_report_v3(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'V8.8 anon cannot execute the V3 contract');
RESET ROLE;

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_employer_report_v3(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_employer_report_v3(uuid)', 'EXECUTE')
  AND NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT')
  AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
          AND p.prosrc LIKE '%scp_audience_brief%' AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') = 2,
  'V8.9 the posture: V3 is authenticated-only, the table stays closed, both audience contracts are untouched');

DO $$ BEGIN RAISE NOTICE 'GROUP V9 — post-interview addenda compose with an unchanged report'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(d -> 'interview_addenda' = '[]'::jsonb) FROM v3),
  'V9.1 before any interview note, the addenda are empty');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
SELECT public.scp_record_interview_note(
  (SELECT attempt_id FROM runs WHERE persona = 'P1'), 'SCC-08', 'evidence_confirmed',
  'Beskrev en samordnad insats med väktare från två objekt; egen roll tydlig.');
SELECT public.scp_record_interview_note(
  (SELECT attempt_id FROM runs WHERE persona = 'P1'), 'SCC-06', 'additional_context',
  'Skriver rapporter på engelska i nuvarande tjänst.');
CREATE TEMP TABLE v3_after AS
SELECT public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) AS d;
CREATE TEMP TABLE emp_after AS
SELECT to_jsonb(e) AS d FROM public.scp_employer_report((SELECT attempt_id FROM runs WHERE persona = 'P1')) e;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(d -> 'interview_addenda') = 2
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'interview_addenda') x
                   WHERE x ->> 'competency_code' = 'SCC-08' AND x ->> 'status' = 'supported_in_interview')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'interview_addenda') x
                   WHERE x ->> 'competency_code' = 'SCC-06' AND x ->> 'status' = 'additional_context')
      AND (SELECT bool_and(x ->> 'source' = 'interview_note'
                       AND (x ->> 'recorded_at') IS NOT NULL
                       AND x -> 'author' ->> 'email' = 'owner@trust-r3a.test'
                       AND coalesce(x ->> 'note', '') <> ''
                       AND x ->> 'status' IN ('supported_in_interview','not_supported_in_interview','additional_context'))
             FROM jsonb_array_elements(d -> 'interview_addenda') x)
      AND (SELECT array_agg((x ->> 'recorded_at')::timestamptz ORDER BY o)
             FROM jsonb_array_elements(d -> 'interview_addenda') WITH ORDINALITY q(x, o))
          = (SELECT array_agg((x ->> 'recorded_at')::timestamptz ORDER BY (x ->> 'recorded_at')::timestamptz DESC)
               FROM jsonb_array_elements(d -> 'interview_addenda') x)
     FROM v3_after),
  'V9.2 two addenda, newest first, each with status, note, source, timestamp and author');

SELECT pg_temp.ok(
  (SELECT (a.d - 'interview_addenda') = (b.d - 'interview_addenda')
     FROM v3_after a, (SELECT d FROM v3 WHERE persona = 'P1') b)
  AND (SELECT a.d = b.d FROM emp_after a, (SELECT d FROM emp WHERE persona = 'P1') b),
  'V9.3 the addenda are the only thing that changed: every other line of the V3 document and the frozen document are identical');

SELECT pg_temp.ok(
  (SELECT pg_temp.area(d, 'SCC-08') ->> 'response_pattern' = 'limited'
      AND pg_temp.area(d, 'SCC-08') ->> 'evidence_state' = 'observed_limited'
     FROM v3_after),
  'V9.4 an interview note never rewrites the assessment reading of its area');

DO $$ BEGIN RAISE NOTICE 'GROUP V10 — provenance summary and historical compatibility'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        d -> 'provenance_summary' ->> 'computation_chain' = 'verified'
    AND (d -> 'provenance_summary' ->> 'traceability_available')::boolean
    AND d -> 'provenance_summary' ->> 'report_id' = d ->> 'report_id'
    AND d -> 'provenance_summary' ->> 'scoring_model_version' = 'det-v1'
    AND d -> 'provenance_summary' ->> 'threshold_version' = 'v1'
    AND d -> 'provenance_summary' ->> 'signal_version' = 'ras-v1'
    AND d -> 'provenance_summary' ->> 'evidence_state_version' = 'des-v2'
    AND d -> 'provenance_summary' ->> 'brief_version' = 'rab-v1'
    AND (d -> 'provenance_summary' ->> 'assessment_version')::int = 1
    AND jsonb_array_length(d -> 'provenance_summary' -> 'rubric_versions') >= 1
    AND coalesce(d -> 'provenance_summary' -> 'report_template' ->> 'report_key', '') <> ''
    AND NOT (d -> 'provenance_summary' ? 'manifest_id') AND NOT (d -> 'provenance_summary' ? 'canonical_sha256'))
     FROM v3),
  'V10.1 the provenance summary names every version, the template, the rubric edition and a verified chain -- and no id or hash');

SELECT pg_temp.ok(
  (SELECT bool_and(
        d -> 'context' ->> 'assessment_slug' = 'security-officer-recruitment'
    AND d -> 'context' ->> 'governance_mode' = 'closed_test'
    AND d -> 'context' ->> 'person_context' = 'candidate'
    AND coalesce(d -> 'context' ->> 'participant_ref', '') <> ''
    AND coalesce(d -> 'context' ->> 'organisation_name', '') = 'Trust Bevakning R3A AB'
    AND coalesce(d -> 'context' -> 'standing_limitation' ->> 'sv', '') <> '')
     FROM v3),
  'V10.2 the header context: assessment, governance, person context, pseudonymous reference, organisation, standing limitation');

SELECT pg_temp.ok(
  (SELECT bool_and(
        (SELECT array_agg(l ->> 'code' ORDER BY l_ord) FROM jsonb_array_elements(d -> 'limitations' -> 'items') WITH ORDINALITY x(l, l_ord))
        @> ARRAY['one_assessment_occasion','self_report_not_observed','unvalidated_content','closed_test_pilot','no_norm_group','no_predictive_claim']
    AND (SELECT bool_and(l ->> 'code' IN ('one_assessment_occasion','single_evidence_context','self_report_not_observed',
                                          'unvalidated_content','closed_test_pilot','no_norm_group','no_predictive_claim')
                     AND coalesce(l -> 'statement' ->> 'sv', '') <> '' AND coalesce(l -> 'statement' ->> 'en', '') <> '')
           FROM jsonb_array_elements(d -> 'limitations' -> 'items') l)
    AND jsonb_typeof(d -> 'limitations' -> 'template' -> 'sv') = 'array')
     FROM v3),
  'V10.3 the limitations are the closed code set, each stated in both languages, with the template lines beside them');

-- Historical shape 1: a released snapshot whose template row is missing
-- (the sixteen production orphans). Bypass the immutability trigger the way
-- the restore did.
SET session_replication_role = replica;
UPDATE public.scp_report_snapshots
   SET report_version_id = 'd0ddaa61-2ede-4036-81a8-9555eb49338c'::uuid
 WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3');
-- Historical shape 2: a snapshot released before PR-R1 (no manifest link).
UPDATE public.scp_report_snapshots
   SET manifest_id = NULL, canonical_sha256 = NULL
 WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P2');
SET session_replication_role = origin;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
CREATE TEMP TABLE v3_hist AS
SELECT run.persona, public.scp_employer_report_v3(run.attempt_id) AS d FROM runs run WHERE run.persona IN ('P2','P3');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT d IS NOT NULL AND jsonb_array_length(d -> 'areas') = 8
      AND d -> 'limitations' -> 'template' -> 'sv' = '[]'::jsonb
      AND jsonb_array_length(d -> 'limitations' -> 'items') >= 6
     FROM v3_hist WHERE persona = 'P3'),
  'V10.4 an orphaned historical report still renders fully; only the template lines are empty');

SELECT pg_temp.ok(
  (SELECT d IS NOT NULL
      AND d -> 'provenance_summary' ->> 'computation_chain' = 'legacy'
      AND NOT (d -> 'provenance_summary' ->> 'traceability_available')::boolean
      AND (SELECT bool_and(NOT (a -> 'traceability' ->> 'available')::boolean) FROM jsonb_array_elements(d -> 'areas') a)
      AND jsonb_array_length(d -> 'areas') = 8
      AND (d -> 'safety_followup' ->> 'present')::boolean
     FROM v3_hist WHERE persona = 'P2'),
  'V10.5 a pre-R1 report renders fully with a legacy computation chain and no traceability offered');

SELECT pg_temp.ok(
  (SELECT (h.d - 'provenance_summary' - 'areas') = (v.d - 'provenance_summary' - 'areas')
      AND (SELECT jsonb_agg(a - 'traceability' ORDER BY a ->> 'competency_code') FROM jsonb_array_elements(h.d -> 'areas') a)
        = (SELECT jsonb_agg(a - 'traceability' ORDER BY a ->> 'competency_code') FROM jsonb_array_elements(v.d -> 'areas') a)
     FROM v3_hist h JOIN v3 v ON v.persona = h.persona WHERE h.persona = 'P2'),
  'V10.6 legacy provenance changes the provenance summary and the traceability flag, and nothing else in the document');

ROLLBACK;
