-- TRUST Evidence Report — PR-R3A: the Report V3 data contract (employer).
--
-- scp_employer_report_v3(attempt_id) returns a FROZEN REPORT (a shared
-- audience-neutral core and the employer projection) beside a LIVE addenda
-- overlay. This suite releases three Väktare attempts (clean; a human
-- safety finding; an overturned free text) and proves:
--
--   V0  fixture and state
--   V1  the locked shape: three dimensions apart, every number a count
--   V2  every conclusion equals the frozen employer document
--   V3  SCC-08: one observed item is not_established / limited / next
--   V4  self-report is its own array and never an observed source
--   V5  human review, free text and the safety finding
--   V6  the TRUST Interview Plan
--   V7  the overview from the separated dimensions; the one next-step rule
--   V8  nothing internal, the employer field allowlist, no wrong principal
--   V9  frozen report versus live addenda overlay
--   V10 provenance, historical shapes, the truthful context count
--   V11 version lock: catalogue changes after release cannot alter the report
--   V12 "human reviewed" means the mandatory reviews were completed
--   V13 the shared core carries nothing employer-only
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

-- The core competency line / the employer area line of a V3 document.
CREATE OR REPLACE FUNCTION pg_temp.comp(_d jsonb, _code text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT a FROM jsonb_array_elements(_d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'competency_code' = _code;
$fn$;
CREATE OR REPLACE FUNCTION pg_temp.emp(_d jsonb, _code text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT a FROM jsonb_array_elements(_d -> 'frozen_report' -> 'employer' -> 'areas') a WHERE a ->> 'competency_code' = _code;
$fn$;
-- Every object key at any depth of a document.
CREATE OR REPLACE FUNCTION pg_temp.all_keys(_d jsonb) RETURNS SETOF text
LANGUAGE sql AS $fn$
  WITH RECURSIVE walk(v) AS (
    SELECT _d
    UNION ALL
    SELECT CASE jsonb_typeof(w.v) WHEN 'object' THEN x.value WHEN 'array' THEN y.value END
      FROM walk w
      LEFT JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(w.v) = 'object' THEN w.v ELSE '{}'::jsonb END) x ON true
      LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.v) = 'array' THEN w.v ELSE '[]'::jsonb END) y ON true
     WHERE jsonb_typeof(w.v) IN ('object', 'array')
  )
  SELECT DISTINCT k FROM walk, jsonb_object_keys(CASE WHEN jsonb_typeof(v) = 'object' THEN v ELSE '{}'::jsonb END) k;
$fn$;

DO $$ BEGIN RAISE NOTICE 'GROUP V0 — fixture and state'; END $$;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3' AND p.prosecdef)
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'scp_report_next_step' AND p.provolatile = 'i'),
  'V0.1 scp_employer_report_v3 (definer) and scp_report_next_step (immutable) exist');
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

INSERT INTO public.profiles (id, display_name)
SELECT owner_user, 'Anna Ägare' FROM tr
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

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
CREATE TEMP TABLE emp AS
SELECT run.persona, to_jsonb(e) AS d
  FROM runs run, LATERAL public.scp_employer_report(run.attempt_id) e;
CREATE TEMP TABLE v3 AS
SELECT run.persona, public.scp_employer_report_v3(run.attempt_id) AS d FROM runs run;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON emp, v3 TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM v3 WHERE d IS NOT NULL) = 3 AND (SELECT count(*) FROM emp) = 3,
  'V0.5 three released attempts, three V3 documents, three frozen employer documents');

DO $$ BEGIN RAISE NOTICE 'GROUP V1 — the locked shape: three dimensions apart'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(d ->> 'schema_version' = 'trust-evidence-report/v3'
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k) = ARRAY['addenda_overlay','frozen_report','report_id','schema_version']
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report') k) = ARRAY['core','employer']
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report' -> 'core') k)
          = ARRAY['assessment','competencies','core_version','coverage','human_review','limitations','provenance','self_reported_patterns','timestamps']
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report' -> 'employer') k)
          = ARRAY['areas','context','overview','primary_next_step','safety_followup','trust_followups','trust_plan']
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'addenda_overlay') k) = ARRAY['as_of','items','source']
      AND d -> 'frozen_report' -> 'core' ->> 'core_version' = 'trust-evidence-core/v1')
     FROM v3),
  'V1.1 the document is exactly {schema_version, report_id, frozen_report {core, employer}, addenda_overlay {as_of, source, items}}');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'frozen_report' -> 'core' -> 'competencies') = 8
      AND jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'areas') = 8
      AND (SELECT array_agg(a ->> 'competency_code' ORDER BY a ->> 'competency_code') FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a)
          = ARRAY['SCC-01','SCC-03','SCC-04','SCC-06','SCC-07','SCC-08','SCC-09','SCC-11']
      AND (SELECT array_agg(a ->> 'competency_code' ORDER BY a ->> 'competency_code') FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'areas') a)
          = ARRAY['SCC-01','SCC-03','SCC-04','SCC-06','SCC-07','SCC-08','SCC-09','SCC-11'])
     FROM v3),
  'V1.2 exactly the eight competencies of the form, one core line and one employer line each');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        ARRAY['competency_code','competency_version','competency_name_sv','competency_name_en','observed_pattern','evidence_sufficiency',
              'evidence_state','observed_item_count','answered_item_count','context_count','source_types','coverage_status','review_status',
              'methodological_flags','factual_explanation','limitation','evidence_basis','behaviour','self_description_domain_keys']
          <@ (SELECT array_agg(k) FROM jsonb_object_keys(a) k)
        AND a ->> 'observed_pattern' IN ('clearly_consistent','consistent','mixed','developing','not_established')
        AND a ->> 'evidence_sufficiency' IN ('sufficient','limited','none')
        AND a ->> 'evidence_state' IN ('observed_consistent','observed_mixed','observed_follow_up','observed_limited','self_reported_only','not_covered','human_review_pending')
        AND a ->> 'coverage_status' IN ('covered','partially_covered','limited','not_covered')
        AND a ->> 'review_status' IN ('not_required','pending','completed')
        AND NOT (a ? 'follow_up_priority') AND NOT (a ? 'response_pattern'))
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a)
     AND (SELECT bool_and(
        ARRAY['competency_code','follow_up_priority','safety_critical_follow_up','clearest_support_eligible','verify_reasons','interview_prompt','trust_followup_codes','traceability']
          <@ (SELECT array_agg(k) FROM jsonb_object_keys(a) k)
        AND a ->> 'follow_up_priority' IN ('first','next','if_time_allows','none')
        AND NOT (a ? 'observed_pattern') AND NOT (a ? 'evidence_sufficiency'))
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'areas') a))
     FROM v3),
  'V1.3 observed_pattern and evidence_sufficiency live on the core line, follow_up_priority on the employer line; every value is a member of its closed set');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a, jsonb_each(a) kv
     WHERE jsonb_typeof(kv.value) = 'number' AND kv.key NOT LIKE '%\_count')
  AND NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a, jsonb_each(a -> 'evidence_basis') kv
     WHERE jsonb_typeof(kv.value) = 'number' AND kv.key NOT SIMILAR TO '%(items|reviewed)'),
  'V1.4 the only numbers on a competency are counts');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(coalesce(a -> 'factual_explanation' ->> 'sv', '') <> '' AND coalesce(a -> 'factual_explanation' ->> 'en', '') <> ''
                  AND coalesce(a -> 'behaviour' ->> 'sv', '') <> '' AND coalesce(a -> 'behaviour' ->> 'en', '') <> ''
                  AND coalesce(a ->> 'competency_name_sv', '') <> '' AND coalesce(a ->> 'competency_name_en', '') <> '')
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a)
     AND coalesce(d -> 'frozen_report' -> 'core' -> 'limitations' -> 'standing_statement' ->> 'sv', '') <> ''
     AND coalesce(d -> 'frozen_report' -> 'core' -> 'limitations' -> 'standing_statement' ->> 'en', '') <> ''
     AND coalesce(d -> 'frozen_report' -> 'employer' -> 'primary_next_step' -> 'reason' ->> 'sv', '') <> ''
     AND coalesce(d -> 'frozen_report' -> 'employer' -> 'primary_next_step' -> 'reason' ->> 'en', '') <> '')
     FROM v3),
  'V1.5 every authored line is present in both Swedish and English');

DO $$ BEGIN RAISE NOTICE 'GROUP V2 — every conclusion equals the frozen document'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(v.d ->> 'report_id' = e.d ->> 'id'
               AND v.d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'report_id' = e.d ->> 'id'
               AND v.d -> 'frozen_report' -> 'employer' -> 'context' ->> 'attempt_id' = e.d ->> 'attempt_id'
               AND v.d -> 'frozen_report' -> 'employer' -> 'context' ->> 'subject_id' = e.d ->> 'subject_id'
               AND (v.d -> 'frozen_report' -> 'core' -> 'timestamps' ->> 'released_at')::timestamptz = (e.d ->> 'released_at')::timestamptz)
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.1 report_id, attempt, subject and release time are the frozen employer document''s');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        (pg_temp.comp(v.d, o ->> 'area_code') ->> 'observed_item_count')::int = (o ->> 'items')::int
        AND pg_temp.comp(v.d, o ->> 'area_code') -> 'factual_explanation' ->> 'sv' = o ->> 'why_sv'
        AND pg_temp.comp(v.d, o ->> 'area_code') -> 'factual_explanation' ->> 'en' = o ->> 'why_en'
        AND pg_temp.comp(v.d, o ->> 'area_code') -> 'behaviour' ->> 'sv' = o ->> 'behaviour_sv'
        AND pg_temp.comp(v.d, o ->> 'area_code') ->> 'competency_name_sv' = o ->> 'area_sv'
        AND pg_temp.comp(v.d, o ->> 'area_code') ->> 'observed_pattern' =
              CASE o ->> 'signal' WHEN 'strong' THEN 'clearly_consistent' WHEN 'consistent' THEN 'consistent'
                                  WHEN 'mixed' THEN 'mixed' WHEN 'developing' THEN 'developing' ELSE 'not_established' END
        AND pg_temp.comp(v.d, o ->> 'area_code') ->> 'evidence_sufficiency' =
              CASE WHEN o ->> 'signal' = 'limited' OR (o ->> 'items')::int < 3 THEN 'limited' ELSE 'sufficient' END)
        FROM jsonb_array_elements(e.d -> 'brief' -> 'observed') o))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.2 every observed area: count, why-line, behaviour, name, pattern and sufficiency come from the frozen signal and count');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(e.d -> 'brief' -> 'observed')) =
     (SELECT count(*) FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE (a ->> 'observed_item_count')::int > 0))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.3 a competency has observed evidence in V3 exactly when the frozen brief lists it');

SELECT pg_temp.ok(
  (SELECT bool_and(
        (v.d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'observed_items')::int = (e.d -> 'brief' -> 'coverage' ->> 'observed_observations')::int
    AND (v.d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'self_report_items')::int = (e.d -> 'brief' -> 'coverage' ->> 'self_report_observations')::int
    AND (v.d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'evidence_contexts')::int = (e.d -> 'brief' -> 'coverage' ->> 'evidence_contexts')::int
    AND (v.d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'reviews_total')::int = (e.d -> 'brief' -> 'coverage' ->> 'reviews_total')::int
    AND (v.d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'reviews_completed')::int = (e.d -> 'brief' -> 'coverage' ->> 'reviews_completed')::int
    AND v.d -> 'frozen_report' -> 'core' -> 'coverage' -> 'modules' = e.d -> 'brief' -> 'modules')
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.4 coverage counts, review counts and modules are the frozen brief''s');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT array_agg(g ->> 'question_sv' ORDER BY (g ->> 'guide_order')::int, g ->> 'area_code', g ->> 'focus')
        FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g)
     = (SELECT array_agg(f -> 'question' ->> 'sv' ORDER BY f_ord)
          FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'employer' -> 'trust_followups') WITH ORDINALITY x(f, f_ord))
     AND (SELECT array_agg(g -> 'listen_for_en' ORDER BY (g ->> 'guide_order')::int, g ->> 'area_code', g ->> 'focus')
            FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g)
       = (SELECT array_agg(f -> 'listen_for' -> 'en' ORDER BY f_ord)
            FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'employer' -> 'trust_followups') WITH ORDINALITY x(f, f_ord)))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.5 the TRUST follow-ups are the frozen interview guide, verbatim and in its order');

SELECT pg_temp.ok(
  (SELECT bool_and(v.d -> 'frozen_report' -> 'employer' -> 'safety_followup' -> 'findings' = e.d -> 'safety_flags'
               AND (v.d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'present')::boolean = (jsonb_array_length(e.d -> 'safety_flags') > 0)
               AND (v.d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'safety_findings_present')::boolean = (jsonb_array_length(e.d -> 'safety_flags') > 0))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.6 the safety findings are the frozen findings, nothing more and nothing inferred');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(e.d -> 'brief' -> 'self_reported')) = jsonb_array_length(v.d -> 'frozen_report' -> 'core' -> 'self_reported_patterns')
     AND (SELECT bool_and(
            (SELECT count(*) FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'core' -> 'self_reported_patterns') p
              WHERE p ->> 'domain_key' = s ->> 'domain_key' AND p ->> 'pattern' = s ->> 'pattern'
                AND p ->> 'consistency' = s ->> 'consistency' AND (p ->> 'item_count')::int = (s ->> 'items')::int
                AND p -> 'factual_explanation' ->> 'sv' = s ->> 'why_sv' AND p ->> 'competency_code' = s ->> 'area_code') = 1)
            FROM jsonb_array_elements(e.d -> 'brief' -> 'self_reported') s))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V2.7 every self-report pattern, consistency, count and why-line is the frozen brief''s');

SELECT pg_temp.ok(
  (SELECT p.prosrc NOT ILIKE '%scp_attempt_assessment_signal%' AND p.prosrc NOT ILIKE '%scp_attempt_maturity%'
      AND p.prosrc NOT ILIKE '%scp_attempt_evidence_state%' AND p.prosrc NOT ILIKE '%scp_attempt_self_report_pattern%'
      AND p.prosrc NOT ILIKE '%scp_competency_evidence%' AND p.prosrc NOT ILIKE '%scp_maturity_thresholds%'
      AND p.prosrc NOT ILIKE '%scp_candidate_responses%' AND p.prosrc NOT ILIKE '%scp_human_reviews%'
      AND p.prosrc NOT ILIKE '%scp_form_items%'
      AND p.prosrc LIKE '%FROM public.scp_employer_report(_attempt_id)%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3'),
  'V2.8 the projection calls no scoring, signal, maturity or state routine and reads no live response, review, form or ledger row -- no parallel engine');

DO $$ BEGIN RAISE NOTICE 'GROUP V3 — SCC-08 on one item: not_established, limited, next'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        pg_temp.comp(d, 'SCC-08') ->> 'observed_pattern' = 'not_established'
    AND pg_temp.comp(d, 'SCC-08') ->> 'evidence_sufficiency' = 'limited'
    AND (pg_temp.comp(d, 'SCC-08') ->> 'observed_item_count')::int = 1
    AND pg_temp.comp(d, 'SCC-08') -> 'methodological_flags' ? 'single_item'
    AND pg_temp.emp(d, 'SCC-08') ->> 'follow_up_priority' = 'next'
    AND pg_temp.comp(d, 'SCC-08') ->> 'evidence_state' = 'observed_limited'
    AND pg_temp.comp(d, 'SCC-08') ->> 'coverage_status' = 'limited')
     FROM v3),
  'V3.1 SCC-08 = {observed_pattern not_established, evidence_sufficiency limited, observed_item_count 1, single_item, follow_up_priority next} on every document');

SELECT pg_temp.ok(
  (SELECT bool_and(
        pg_temp.comp(d, 'SCC-08') -> 'limitation' ->> 'code' = 'single_item'
    AND pg_temp.comp(d, 'SCC-08') -> 'limitation' ->> 'sv' = 'Det finns ett observerat svar, men underlaget räcker inte för att fastställa ett stabilt svarsmönster. Följ upp området i intervju.'
    AND pg_temp.comp(d, 'SCC-08') -> 'limitation' ->> 'en' = 'There is one observed answer, but the evidence is not enough to establish a stable response pattern. Follow up the area in interview.'
    AND pg_temp.emp(d, 'SCC-08') -> 'trust_followup_codes' ? 'explore_limited_evidence'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'trust_followups') f
                 WHERE f ->> 'competency_code' = 'SCC-08' AND f ->> 'focus' = 'explore_limited_evidence'
                   AND coalesce(f -> 'question' ->> 'sv', '') <> '' AND coalesce(f -> 'question' ->> 'en', '') <> ''))
     FROM v3),
  'V3.2 the SCC-08 card states the user-facing meaning verbatim in both languages and carries an authored limited-evidence question');

SELECT pg_temp.ok(
  (SELECT bool_and(EXISTS (
     SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence') x WHERE x ->> 'competency_code' = 'SCC-08')
     AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') x WHERE x ->> 'competency_code' = 'SCC-08'))
     FROM v3),
  'V3.3 SCC-08 sits under limited evidence in the overview and never under clearest support');

-- The regression rule over every competency of every document: sufficiency
-- follows the count, and fewer than three observed items never establish a
-- pattern, a full coverage or a consistent state.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a
     WHERE ((a ->> 'observed_item_count')::int = 0 AND a ->> 'evidence_sufficiency' <> 'none')
        OR ((a ->> 'observed_item_count')::int BETWEEN 1 AND 2 AND a ->> 'evidence_sufficiency' <> 'limited')
        OR ((a ->> 'observed_item_count')::int >= 3 AND a ->> 'evidence_sufficiency' <> 'sufficient')
        OR ((a ->> 'observed_item_count')::int < 3
            AND (a ->> 'observed_pattern' <> 'not_established'
                 OR a ->> 'evidence_state' IN ('observed_consistent','observed_mixed','observed_follow_up')
                 OR a ->> 'coverage_status' = 'covered'))),
  'V3.4 sufficiency follows the observed count exactly, and no competency under three items reads as an established pattern, a full coverage or a consistent state');

SELECT pg_temp.ok(
  (SELECT bool_and(lower(pg_temp.comp(d, 'SCC-08')::text || pg_temp.emp(d, 'SCC-08')::text) NOT SIMILAR TO
     '%(svag|weak|risk|brist|deficien|låg poäng|low score|fail|underkän|otillräcklig)%')
     FROM v3),
  'V3.5 nothing on the SCC-08 card says weak, low, risk, fail or deficient in either language');

DO $$ BEGIN RAISE NOTICE 'GROUP V4 — self-report is its own array and never an observed source'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'frozen_report' -> 'core' -> 'self_reported_patterns') = 8
      AND (SELECT bool_and(p ->> 'evidence_type' = 'self_reported' AND p ->> 'interpretation' = 'descriptive_only'
                       AND p ->> 'pattern' IN ('consistently_described','mostly_described','rarely_described','not_described')
                       AND p ->> 'consistency' IN ('consistent','varied'))
             FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'self_reported_patterns') p))
     FROM v3),
  'V4.1 eight self-described domains, every one stamped self_reported and descriptive_only');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a
     WHERE a -> 'source_types' ? 'self_report'),
  'V4.2 no competency lists self_report as a source, under any state');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(
        (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'self_reported_patterns') p WHERE p ->> 'competency_code' = a ->> 'competency_code')
        = jsonb_array_length(a -> 'self_description_domain_keys'))
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a))
     FROM v3),
  'V4.3 a competency only points at its own self-described domains; the words stay in the self-report array');

SELECT pg_temp.ok(
  (SELECT bool_and(
        pg_temp.comp(d, 'SCC-08') -> 'self_description_domain_keys' = '[]'::jsonb
    AND pg_temp.comp(d, 'SCC-11') -> 'self_description_domain_keys' = '[]'::jsonb
    AND jsonb_array_length(pg_temp.comp(d, 'SCC-03') -> 'self_description_domain_keys') = 2
    AND pg_temp.comp(d, 'SCC-03') -> 'methodological_flags' ? 'self_report_not_observed'
    AND NOT (pg_temp.comp(d, 'SCC-08') -> 'methodological_flags' ? 'self_report_not_observed'))
     FROM v3),
  'V4.4 SCC-08 and SCC-11 have no self-description; SCC-03 has two domains and carries the flag');

SELECT pg_temp.ok(
  (SELECT bool_and(lower((d -> 'frozen_report' -> 'core' -> 'self_reported_patterns')::text) NOT SIMILAR TO
     '%(visat|styrka|svag|shown|strength|weak|score|poäng|oärlig|dishonest|decept|social desirab|personlighet|personality)%')
     FROM v3),
  'V4.5 the self-report words stay descriptive: never shown, strength, weak, score, dishonest or personality');

DO $$ BEGIN RAISE NOTICE 'GROUP V5 — human review, free text and the safety finding'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'scenario_items')::int = 22
    AND (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'self_description_items')::int = 24
    AND (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'free_text_items')::int = 4
    AND (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'free_text_reviewed')::int = 4
    AND (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'safety_critical_items')::int = 3
    AND (d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' ->> 'safety_critical_reviewed')::int = 3
    AND (SELECT sum((a ->> 'answered_item_count')::int) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a) = 50)
     FROM v3),
  'V5.1 the composition is truthful and frozen: 22 scenario, 24 self-description, 4 free-text answers all read, 3 safety-critical answers all checked, 50 answers');

SELECT pg_temp.ok(
  (SELECT bool_and((d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'reviews_total')::int = 7
               AND (d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'reviews_completed')::int = 7
               AND (d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'required')::boolean
               AND (d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'completed')::boolean
               AND d -> 'frozen_report' -> 'core' -> 'human_review' -> 'free_text' = '{"items": 4, "reviewed": 4}'::jsonb
               AND d -> 'frozen_report' -> 'core' -> 'human_review' -> 'safety_critical' = '{"items": 3, "reviewed": 3}'::jsonb)
     FROM v3),
  'V5.2 seven mandatory reviews, seven completed: the report is human-reviewed and says so in counts');

SELECT pg_temp.ok(
  (SELECT pg_temp.comp(d, (SELECT competency_code FROM overturned)) ->> 'review_status' = 'completed' FROM v3 WHERE persona = 'P3')
  AND (SELECT NOT (pg_temp.comp(d, (SELECT competency_code FROM overturned)) -> 'source_types' ? 'human_reviewed_free_text') FROM v3 WHERE persona = 'P3')
  AND (SELECT pg_temp.comp(d, (SELECT competency_code FROM overturned)) -> 'source_types' ? 'human_reviewed_free_text' FROM v3 WHERE persona = 'P1')
  AND (SELECT NOT EXISTS (SELECT 1 FROM pg_temp.all_keys(d) k WHERE k IN ('reviews_disputed','completed_disputed','disputed_readings','outcome','review_outcome')) FROM v3 WHERE persona = 'P3'),
  'V5.3 an overturned free text is a completed review that adds no human-reviewed source; the reviewer''s workflow outcome is not in the document');

SELECT pg_temp.ok(
  (SELECT pg_temp.emp(d, (SELECT competency_code FROM overturned)) -> 'verify_reasons' ? 'human_review_adjusted'
      AND NOT (pg_temp.emp(d, (SELECT competency_code FROM overturned)) ->> 'clearest_support_eligible')::boolean
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview') x
                   WHERE x ->> 'competency_code' = (SELECT competency_code FROM overturned))
     FROM v3 WHERE persona = 'P3')
  AND (SELECT NOT (pg_temp.emp(d, (SELECT competency_code FROM overturned)) -> 'verify_reasons' ? 'human_review_adjusted') FROM v3 WHERE persona = 'P1'),
  'V5.3b a human review that changed a reading is a governed verify reason: the area is verified in interview and never clearest support');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and((a -> 'source_types' ? 'human_reviewed_free_text') = ((a -> 'evidence_basis' ->> 'free_text_items')::int > 0))
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a))
     FROM v3 WHERE persona = 'P1'),
  'V5.4 the free-text channel appears as its own source exactly on the competencies whose free text stands as evidence');

SELECT pg_temp.ok(
  (SELECT NOT (d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'present')::boolean
      AND d -> 'frozen_report' -> 'employer' -> 'safety_followup' -> 'areas_flagged_for_follow_up' = '[]'::jsonb
     FROM v3 WHERE persona = 'P1')
  AND (SELECT (d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'present')::boolean
           AND (d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'finding_count')::int = 1
           AND d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'source' = 'human_review'
           AND d -> 'frozen_report' -> 'employer' -> 'safety_followup' -> 'areas_flagged_for_follow_up' ? (SELECT competency_code FROM flagged)
           AND (pg_temp.emp(d, (SELECT competency_code FROM flagged)) ->> 'safety_critical_follow_up')::boolean
           AND pg_temp.emp(d, (SELECT competency_code FROM flagged)) ->> 'follow_up_priority' = 'first'
           AND NOT (pg_temp.emp(d, (SELECT competency_code FROM flagged)) ->> 'clearest_support_eligible')::boolean
         FROM v3 WHERE persona = 'P2'),
  'V5.5 the safety panel exists only for the human finding; its area is a first-priority follow-up and never clearest support');

SELECT pg_temp.ok(
  (SELECT d -> 'frozen_report' -> 'employer' -> 'safety_followup' -> 'findings' -> 0 ->> 'severity' = 'high'
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report' -> 'employer' -> 'safety_followup' -> 'findings' -> 0) k)
          = ARRAY['finding','observed_at','severity']
     FROM v3 WHERE persona = 'P2'),
  'V5.6 the finding is stated as {finding, severity, observed_at} and never as a number');

SELECT pg_temp.ok(
  (SELECT p1.d -> 'frozen_report' -> 'core' -> 'competencies' = p2.d -> 'frozen_report' -> 'core' -> 'competencies'
     FROM v3 p1, v3 p2 WHERE p1.persona = 'P1' AND p2.persona = 'P2'),
  'V5.7 with and without the finding, every core competency line reads the same: the finding lives in the employer projection only');

DO $$ BEGIN RAISE NOTICE 'GROUP V6 — the TRUST Interview Plan'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'trust_plan' -> 'priorities') BETWEEN 1 AND 3
               AND (d -> 'frozen_report' -> 'employer' -> 'trust_plan' ->> 'question_count')::int BETWEEN 1 AND 5)
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
          AND p -> 'ready' ->> 'observed_pattern' IN ('clearly_consistent','consistent','mixed','developing','not_established')
          AND p -> 'ready' ->> 'evidence_sufficiency' IN ('sufficient','limited','none'))
        FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'trust_plan' -> 'priorities') p))
     FROM v3),
  'V6.2 every priority carries T, R, U, S and T, and its readiness names the two separated dimensions');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(EXISTS (
        SELECT 1 FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') g
         WHERE g ->> 'area_code' = p ->> 'competency_code'
           AND g ->> 'question_sv' = p -> 'understand' -> 'question' ->> 'sv'
           AND g -> 'listen_for_sv' = p -> 'tell' -> 'listen_for' -> 'sv'))
        FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'employer' -> 'trust_plan' -> 'priorities') p)
     AND (v.d -> 'frozen_report' -> 'employer' -> 'trust_plan' -> 'priorities' -> 0 ->> 'competency_code')
         = (SELECT g ->> 'area_code' FROM jsonb_array_elements(e.d -> 'brief' -> 'interview_guide') WITH ORDINALITY x(g, o) ORDER BY o LIMIT 1))
     FROM v3 v JOIN emp e ON e.persona = v.persona),
  'V6.3 every plan question and listen-for line is an authored guide entry, and the first priority is the guide''s first area');

SELECT pg_temp.ok(
  (SELECT bool_and(lower((d -> 'frozen_report' -> 'employer' -> 'trust_plan')::text) NOT SIMILAR TO
     '%(varför hade du svårt|why did you struggle|why were you unable|star-metod|star method|\mstar\M)%')
     FROM v3),
  'V6.4 no plan line assumes a deficiency, and nothing user-facing is called STAR');

DO $$ BEGIN RAISE NOTICE 'GROUP V7 — the overview from the separated dimensions; the one rule'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') <= 3
    AND jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview') <= 3
    AND jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence') <= 3
    AND coalesce((SELECT bool_and(x ->> 'observed_pattern' IN ('clearly_consistent','consistent') AND x ->> 'evidence_sufficiency' = 'sufficient'
                              AND NOT (x ->> 'safety_critical_follow_up')::boolean
                              AND pg_temp.comp(d, x ->> 'competency_code') ->> 'review_status' <> 'pending')
                  FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') x), true)
    AND coalesce((SELECT bool_and(x ->> 'evidence_sufficiency' IN ('limited','none'))
                  FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence') x), true)
    AND coalesce((SELECT bool_and(jsonb_array_length(x -> 'verify_reasons') > 0
                              AND (SELECT bool_and(r IN ('safety_finding','developing_pattern','mixed_pattern','limited_evidence','pending_review','human_review_adjusted'))
                                     FROM jsonb_array_elements_text(x -> 'verify_reasons') r)
                              AND ((x -> 'verify_reasons' ? 'safety_finding') = (x ->> 'safety_critical_follow_up')::boolean)
                              AND ((x -> 'verify_reasons' ? 'mixed_pattern') = (x ->> 'observed_pattern' = 'mixed'))
                              AND ((x -> 'verify_reasons' ? 'developing_pattern') = (x ->> 'observed_pattern' = 'developing'))
                              AND ((x -> 'verify_reasons' ? 'limited_evidence') = (x ->> 'evidence_sufficiency' = 'limited')))
                  FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview') x), true)
    AND coalesce((SELECT bool_and(jsonb_array_length(a -> 'verify_reasons') = 0)
                  FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'areas') a
                  WHERE (a ->> 'clearest_support_eligible')::boolean), true)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') a
        JOIN jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence') b ON a ->> 'competency_code' = b ->> 'competency_code')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') a
        JOIN jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview') b ON a ->> 'competency_code' = b ->> 'competency_code'))
     FROM v3),
  'V7.1 clearest support needs an established consistent pattern AND sufficient evidence AND no safety or pending review; limited evidence follows sufficiency; verify follows the separated conditions; clearest overlaps neither');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'evidence_sufficiency' IN ('limited','none'))
     = LEAST(3, jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence'))
     OR (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'evidence_sufficiency' IN ('limited','none')) >= 3)
     FROM v3),
  'V7.2 every limited or evidence-free competency reaches the limited-evidence group until the group is full');

SELECT pg_temp.ok(
  (SELECT d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'step' = 'structured_interview' FROM v3 WHERE persona = 'P1')
  AND (SELECT d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'step' = 'request_clarification'
           AND d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'reason_code' = 'safety_follow_up' FROM v3 WHERE persona = 'P2')
  AND (SELECT d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'step' = 'structured_interview' FROM v3 WHERE persona = 'P3'),
  'V7.3 the clean report leads to a structured interview; the human finding leads to a clarification first');

-- The step in the document is the one rule's answer to the document's own
-- aggregates: no second rule in the projection.
SELECT pg_temp.ok(
  (SELECT bool_and(
     (d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'step', d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'reason_code')
     = (SELECT r.step, r.reason_code FROM public.scp_report_next_step(
          (d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'safety_findings_present')::boolean,
          (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'observed_items')::int,
          (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'areas_sufficient')::int,
          (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'areas_limited')::int) r)
     AND d -> 'frozen_report' -> 'employer' -> 'primary_next_step' ->> 'rule_version' = 'rds-v1'
     AND (d -> 'frozen_report' -> 'employer' -> 'primary_next_step' -> 'interview_handoff' ->> 'attempt_id')::uuid
         = (d -> 'frozen_report' -> 'employer' -> 'context' ->> 'attempt_id')::uuid
     AND jsonb_array_length(d -> 'frozen_report' -> 'employer' -> 'primary_next_step' -> 'interview_handoff' -> 'focus_area_codes') <= 3)
     FROM v3),
  'V7.4 the primary next step is scp_report_next_step over the document''s own aggregates, versioned rds-v1, with a handoff naming the attempt and at most three focus areas');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'areas_sufficient')::int
       = (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'evidence_sufficiency' = 'sufficient')
     AND (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'areas_limited')::int
       = (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'evidence_sufficiency' = 'limited')
     AND (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'areas_none')::int
       = (SELECT count(*) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE a ->> 'evidence_sufficiency' = 'none'))
     FROM v3),
  'V7.5 the coverage counts are the sufficiency counts over the competencies');

-- TEST 1 (working group): a consistent pattern on limited evidence. ras-v1
-- never freezes that pair, so it is forced into a frozen brief, and the
-- projection must still keep the dimensions apart: never clearest support,
-- always limited evidence, expected in the interview.
SET session_replication_role = replica;
UPDATE public.scp_report_snapshots s
   SET brief = jsonb_set(s.brief, '{observed}', (
     SELECT jsonb_agg(CASE WHEN o ->> 'area_code' = 'SCC-04'
                           THEN o || '{"signal": "consistent", "items": 2}'::jsonb ELSE o END ORDER BY ord)
       FROM jsonb_array_elements(s.brief -> 'observed') WITH ORDINALITY x(o, ord)))
 WHERE s.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3') AND s.audience = 'employer';
SET session_replication_role = origin;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
CREATE TEMP TABLE v3_t1 AS SELECT public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P3')) AS d;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT pg_temp.comp(d, 'SCC-04') ->> 'observed_pattern' = 'consistent'
      AND pg_temp.comp(d, 'SCC-04') ->> 'evidence_sufficiency' = 'limited'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support') x WHERE x ->> 'competency_code' = 'SCC-04')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence') x WHERE x ->> 'competency_code' = 'SCC-04')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview') x WHERE x ->> 'competency_code' = 'SCC-04')
      AND NOT (pg_temp.emp(d, 'SCC-04') ->> 'clearest_support_eligible')::boolean
      AND pg_temp.emp(d, 'SCC-04') ->> 'follow_up_priority' IN ('first','next')
     FROM v3_t1),
  'V7.6 TEST 1: a consistent pattern on limited evidence is never clearest support, always limited evidence, and an interview follow-up');

DO $$ BEGIN RAISE NOTICE 'GROUP V8 — nothing internal, the employer allowlist, no wrong principal'; END $$;

-- The employer-visible field allowlist. Locked here and in
-- scripts/fixtures/trust-evidence-report-v3-contract.ts; the TypeScript guard
-- reads this block and refuses if the two lists differ.
-- ALLOWLIST BEGIN
CREATE TEMP TABLE allowlist AS SELECT unnest(ARRAY[
  'addenda_overlay','answered','answered_item_count','area_en','area_limit','area_sv','areas','areas_flagged_for_follow_up',
  'areas_limited','areas_none','areas_sufficient','as_of','asks','assessment','assessment_name_en','assessment_name_sv',
  'assessment_slug','assessment_version','attempt_id','author_display_name','available','behaviour','block_key','brief_version',
  'calculated_at','clearest_support','clearest_support_eligible','code','competencies','competency_code','competency_name_en',
  'competency_name_sv','competency_version','completed','composition','computation_chain','consistency','content_status',
  'context','context_count','core','core_version','coverage','coverage_status','document','domain_en','domain_key','domain_sv',
  'employer','en','evidence_basis','evidence_basis_available','evidence_contexts','evidence_scope_version','evidence_state',
  'evidence_state_version','evidence_sufficiency','evidence_type','existing_evidence','factual_explanation','finding',
  'finding_count','findings','focus','focus_area_codes','follow_up_priority','followup','free_text','free_text_items',
  'free_text_reviewed','frozen_report','governance_mode','heading','human_review','id','interpretation','interview_handoff',
  'interview_prompt','item_count','items','key','language','limitation','limitations','limited_evidence','line','listen_for',
  'meaning','methodological_flags','modules','name_en','name_sv','note','observed_at','observed_item_count','observed_items',
  'observed_pattern','order','organisation_name','overview','participant_ref','pattern','person_context','present',
  'primary_next_step','priorities','priority','provenance','purpose_code','question','question_count','question_limit','ready',
  'reason','reason_code','recorded_at','released_at','report_id','report_key','report_template','required','review_status',
  'reviewed','reviews_completed','reviews_total','rubric_versions','rule_version','safety_critical','safety_critical_follow_up',
  'safety_critical_items','safety_critical_reviewed','safety_findings_present','safety_followup','scenario_items',
  'schema_version','scored_at','scoring_model_version','self_description_domain_keys','self_description_items',
  'self_report_items','self_reported_patterns','severity','signal_version','source','source_types','standing_limitation',
  'standing_statement','started_at','statement','status','step','steps','structure','subheading','subject_id','submitted_at',
  'sv','target','tell','template_limitations','threshold_version','timestamps','traceability','traceability_available',
  'trust_followup_codes','trust_followups','trust_plan','trust_question_version','understand','validation_status',
  'verify_in_interview','verify_reasons','version','why'
]) AS k;
-- ALLOWLIST END

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM v3, pg_temp.all_keys(d) k WHERE k NOT IN (SELECT k FROM allowlist))
  AND NOT EXISTS (SELECT 1 FROM v3_t1, pg_temp.all_keys(d) k WHERE k NOT IN (SELECT k FROM allowlist)),
  'V8.1 TEST 8: every key at every depth of the employer document is on the locked allowlist');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, pg_temp.all_keys(d) k
     WHERE k IN ('user_id','email','recorded_by','manifest_id','canonical_sha256','body','selected_option_key','best_option_key',
                 'worst_option_key','selected_score_value','score_value','contribution','confidence','rubric_levels','rubric_version_id',
                 'reviewer_rationale','rationale','reviews_disputed','completed_disputed','disputed_readings','outcome','review_outcome',
                 'trigger_reason','derivation_input','derivation_basis','mean','spread','behaviour_version_id','weighted_sum',
                 'denominator','maturity_level','item_max_score','option_key_version','response_id','review_id','evidence_id',
                 'released_by','released_by_role','planned_item_count','response_pattern','total_score','overall_score','percentile',
                 'ranking','benchmark','match_percent','job_fit','fit_score','suitability','pass_fail','hire','reject','risk_score',
                 'potential_score','personality','radar','traffic_light')),
  'V8.2 TEST 8: no author id, no e-mail, no manifest field, no answer key, no rationale, no review workflow field, no forbidden key');

SELECT pg_temp.ok(
  (SELECT bool_and(lower(d::text) NOT SIMILAR TO
     '%("mean"|"spread"|derivation_input|behaviour_version_id|manifest_id|canonical_sha256|score_value|reviewer_rationale|option_key|is_preferred|rubric_level|derivation_basis|weighted_sum|denominator|maturity_level|@trust-r3a.test)%'
     AND d::text NOT LIKE '%RATIONALETOKEN%' AND d::text NOT LIKE '%FRITEXTTOKEN%'
     AND d::text NOT LIKE '%fd300000-0000-0000-0000-000000000002%')
     FROM v3),
  'V8.3 no mean, spread, derivation input, behaviour id, manifest id, hash, option key, rubric level, rationale, free-text body, e-mail or author id anywhere in the text');

SELECT pg_temp.ok(
  (SELECT bool_and(lower((d #- '{frozen_report,employer,context,template_limitations}')::text) NOT SIMILAR TO
     '%(bör anställas|rekommenderar anställning|rekommenderas för anställning|olämplig|lämplig för tjänsten|rangordn|percentil|totalpoäng|sammanlagd poäng|slutpoäng|riskpoäng|riskprofil|personlighet|matchprocent|normgrupp|spindeldiagram|radardiagram|svag kompetens|svagt område|låg poäng|förutsäger|topp 3|topp 5)%'
     AND lower((d #- '{frozen_report,employer,context,template_limitations}')::text) NOT SIMILAR TO
     '%(should be hired|recommend hiring|recommended for hire|unsuitable|suitable for the role|ranked|ranking|percentile|total score|overall score|final score|weighted score|risk score|risk profile|personality|match percentage|job fit|fit score|norm group|top candidate|top 3|top 5|radar chart|spider chart|weak competency|weak area|low score|predicts|bias-free|unbiased|pass/fail|traffic light)%')
     FROM v3),
  'V8.4 no forbidden claim, in either language, anywhere in the document outside the template''s own denials');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(lower(l) NOT SIMILAR TO '%(rangordn|rank)%' OR lower(l) SIMILAR TO '%(inte|ingen|not |no )%')
        FROM jsonb_array_elements_text((d -> 'frozen_report' -> 'employer' -> 'context' -> 'template_limitations' -> 'sv')
                                       || (d -> 'frozen_report' -> 'employer' -> 'context' -> 'template_limitations' -> 'en')) l))
     FROM v3),
  'V8.4b and where a template line names a ranking it does so only to deny one');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) IS NULL,
  'V8.5 the participant gets NULL from the employer V3 contract for their own attempt');
SELECT pg_temp.must_fail('SELECT * FROM public.scp_report_next_step(false, 1, 1, 0)',
  'permission denied', 'V8.5b the rule is internal: not executable by a signed-in account');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_computation_manifests',
  'permission denied', 'V8.5c the manifest stays closed to a signed-in account');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000012';
SELECT pg_temp.ok((SELECT bool_and(public.scp_employer_report_v3(attempt_id) IS NULL) FROM runs),
  'V8.6 a second organisation gets NULL for every attempt');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000013';
SELECT pg_temp.ok((SELECT bool_and(public.scp_employer_report_v3(attempt_id) IS NULL) FROM runs),
  'V8.7 an unrelated signed-in account gets NULL');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'V8.7b and still cannot read the snapshot table');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT public.scp_employer_report_v3(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'V8.8 anon cannot execute the V3 contract');
SELECT pg_temp.must_fail('SELECT * FROM public.scp_report_next_step(false, 1, 1, 0)',
  'permission denied', 'V8.8b nor the rule');
RESET ROLE;

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_employer_report_v3(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_employer_report_v3(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_report_next_step(boolean,integer,integer,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.scp_report_next_step(boolean,integer,integer,integer)', 'EXECUTE')
  AND NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.scp_report_computation_manifests', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_report_computation_manifests', 'SELECT')
  AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_computation_manifests') = 0
  AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
          AND p.prosrc LIKE '%scp_audience_brief%' AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') = 2
  AND (SELECT proconfig::text LIKE '%search_path=%' FROM pg_proc WHERE proname = 'scp_employer_report_v3'),
  'V8.9 the posture: V3 authenticated-only, the rule internal, the snapshot table and the manifest closed, both audience contracts untouched, search_path pinned');

DO $$ BEGIN RAISE NOTICE 'GROUP V9 — frozen report versus live addenda overlay'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(d -> 'addenda_overlay' -> 'items' = '[]'::jsonb
               AND d -> 'addenda_overlay' ->> 'source' = 'interview_note'
               AND (d -> 'addenda_overlay' ->> 'as_of') IS NOT NULL) FROM v3),
  'V9.1 before any interview note, the overlay is empty and stamped');

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
  (SELECT jsonb_array_length(d -> 'addenda_overlay' -> 'items') = 2
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'addenda_overlay' -> 'items') x
                   WHERE x ->> 'competency_code' = 'SCC-08' AND x ->> 'status' = 'supported_in_interview')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'addenda_overlay' -> 'items') x
                   WHERE x ->> 'competency_code' = 'SCC-06' AND x ->> 'status' = 'additional_context')
      AND (SELECT bool_and(x ->> 'author_display_name' = 'Anna Ägare'
                       AND (x ->> 'recorded_at') IS NOT NULL AND coalesce(x ->> 'note', '') <> ''
                       AND NOT (x ? 'user_id') AND NOT (x ? 'email') AND NOT (x ? 'recorded_by')
                       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k)
                           = ARRAY['author_display_name','competency_code','id','note','recorded_at','status'])
             FROM jsonb_array_elements(d -> 'addenda_overlay' -> 'items') x)
      AND (SELECT array_agg((x ->> 'recorded_at')::timestamptz ORDER BY o) FROM jsonb_array_elements(d -> 'addenda_overlay' -> 'items') WITH ORDINALITY q(x, o))
          = (SELECT array_agg((x ->> 'recorded_at')::timestamptz ORDER BY (x ->> 'recorded_at')::timestamptz DESC) FROM jsonb_array_elements(d -> 'addenda_overlay' -> 'items') x)
     FROM v3_after),
  'V9.2 two addenda, newest first, each with status, note, timestamp and a display name only -- no user id, no e-mail');

SELECT pg_temp.ok(
  (SELECT a.d -> 'frozen_report' = b.d -> 'frozen_report'
      AND (a.d -> 'frozen_report')::text = (b.d -> 'frozen_report')::text
      AND a.d ->> 'report_id' = b.d ->> 'report_id'
      AND a.d -> 'frozen_report' -> 'core' -> 'provenance' = b.d -> 'frozen_report' -> 'core' -> 'provenance'
      AND a.d -> 'addenda_overlay' <> b.d -> 'addenda_overlay'
      AND (a.d -> 'addenda_overlay' ->> 'as_of')::timestamptz >= (b.d -> 'addenda_overlay' ->> 'as_of')::timestamptz
     FROM v3_after a, (SELECT d FROM v3 WHERE persona = 'P1') b)
  AND (SELECT a.d = b.d FROM emp_after a, (SELECT d FROM emp WHERE persona = 'P1') b),
  'V9.3 TEST 6: after the addenda, frozen_report is byte-identical, report_id and provenance unchanged, only the overlay differs, and the frozen employer document is untouched');

SELECT pg_temp.ok(
  (SELECT pg_temp.comp(d, 'SCC-08') ->> 'observed_pattern' = 'not_established'
      AND pg_temp.comp(d, 'SCC-08') ->> 'evidence_sufficiency' = 'limited'
     FROM v3_after),
  'V9.4 an interview note never rewrites the assessment reading of its area');

DO $$ BEGIN RAISE NOTICE 'GROUP V10 — provenance, historical shapes, the truthful context count'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'computation_chain' = 'verified'
    AND (d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'evidence_basis_available')::boolean
    AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'scoring_model_version' = 'det-v1'
    AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'threshold_version' = 'v1'
    AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'signal_version' = 'ras-v1'
    AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'evidence_state_version' = 'des-v2'
    AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'brief_version' = 'rab-v1'
    AND d -> 'frozen_report' -> 'core' -> 'provenance' -> 'rubric_versions' = '[1]'::jsonb
    AND coalesce(d -> 'frozen_report' -> 'core' -> 'provenance' -> 'report_template' ->> 'report_key', '') <> ''
    AND (d -> 'frozen_report' -> 'core' -> 'assessment' ->> 'assessment_version')::int = 1
    AND d -> 'frozen_report' -> 'core' -> 'assessment' ->> 'governance_mode' = 'closed_test'
    AND (SELECT bool_and(a ->> 'competency_version' = '1') FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a))
     FROM v3),
  'V10.1 the provenance names every version, the template, the rubric edition, the competency version and a verified chain -- and no id or hash');

-- TEST 2: two report-level contexts, one competency-specific context.
SET session_replication_role = replica;
UPDATE public.scp_report_snapshots
   SET brief = jsonb_set(brief, '{coverage,evidence_contexts}', '2'::jsonb)
 WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P1') AND audience = 'employer';
SET session_replication_role = origin;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
CREATE TEMP TABLE v3_ctx AS SELECT public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) AS d;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT (d -> 'frozen_report' -> 'core' -> 'coverage' ->> 'evidence_contexts')::int = 2
      AND (SELECT bool_and((a ->> 'context_count')::int = 1) FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a WHERE (a ->> 'context_count')::int = 2)
     FROM v3_ctx),
  'V10.2 TEST 2: with two report-level contexts, every competency still shows its own frozen count of one -- the global count is never copied onto a card');

-- Historical shape 1: a released snapshot whose template row is missing.
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
  (SELECT d IS NOT NULL AND jsonb_array_length(d -> 'frozen_report' -> 'core' -> 'competencies') = 8
      AND d -> 'frozen_report' -> 'employer' -> 'context' -> 'template_limitations' -> 'sv' = '[]'::jsonb
      AND jsonb_array_length(d -> 'frozen_report' -> 'core' -> 'limitations' -> 'items') >= 6
     FROM v3_hist WHERE persona = 'P3'),
  'V10.3 an orphaned historical report still renders fully; only the template lines are empty');

SELECT pg_temp.ok(
  (SELECT d IS NOT NULL
      AND d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'computation_chain' = 'legacy'
      AND NOT (d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'evidence_basis_available')::boolean
      AND d -> 'frozen_report' -> 'core' -> 'provenance' -> 'rubric_versions' = '[]'::jsonb
      AND d -> 'frozen_report' -> 'core' -> 'coverage' -> 'composition' = 'null'::jsonb
      AND d -> 'frozen_report' -> 'core' -> 'human_review' -> 'free_text' = 'null'::jsonb
      AND (SELECT bool_and(a -> 'evidence_basis' = 'null'::jsonb AND a -> 'context_count' = 'null'::jsonb
                       AND a -> 'answered_item_count' = 'null'::jsonb AND a -> 'review_status' = 'null'::jsonb
                       AND a ->> 'competency_version' = '1')
             FROM jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a)
      AND (SELECT bool_and(NOT (a -> 'traceability' ->> 'available')::boolean) FROM jsonb_array_elements(d -> 'frozen_report' -> 'employer' -> 'areas') a)
      AND jsonb_array_length(d -> 'frozen_report' -> 'core' -> 'competencies') = 8
      AND (d -> 'frozen_report' -> 'employer' -> 'safety_followup' ->> 'present')::boolean
     FROM v3_hist WHERE persona = 'P2'),
  'V10.4 a pre-R1 report renders fully as legacy: every structural fact an explicit null, nothing fabricated, the frozen conclusions intact');

SELECT pg_temp.ok(
  (SELECT (SELECT jsonb_agg(a - 'evidence_basis' - 'context_count' - 'answered_item_count' - 'review_status' - 'source_types' ORDER BY a ->> 'competency_code')
             FROM jsonb_array_elements(h.d -> 'frozen_report' -> 'core' -> 'competencies') a)
        = (SELECT jsonb_agg(a - 'evidence_basis' - 'context_count' - 'answered_item_count' - 'review_status' - 'source_types' ORDER BY a ->> 'competency_code')
             FROM jsonb_array_elements(v.d -> 'frozen_report' -> 'core' -> 'competencies') a)
      AND h.d -> 'frozen_report' -> 'core' -> 'self_reported_patterns' = v.d -> 'frozen_report' -> 'core' -> 'self_reported_patterns'
      AND h.d -> 'frozen_report' -> 'employer' -> 'trust_followups' = v.d -> 'frozen_report' -> 'employer' -> 'trust_followups'
      AND h.d -> 'frozen_report' -> 'employer' -> 'primary_next_step' = v.d -> 'frozen_report' -> 'employer' -> 'primary_next_step'
     FROM v3_hist h JOIN v3 v ON v.persona = h.persona WHERE h.persona = 'P2'),
  'V10.5 legacy provenance changes only the structural facts that were never frozen; every conclusion, pattern, sufficiency and follow-up is the same');

DO $$ BEGIN RAISE NOTICE 'GROUP V11 — version lock: catalogue changes after release cannot alter the report'; END $$;

-- The frozen report of P1, byte for byte, before any catalogue change (the
-- context-count edit above is part of that snapshot now).
CREATE TEMP TABLE frozen_before AS
SELECT (d -> 'frozen_report')::text AS t, d ->> 'report_id' AS rid FROM v3_ctx;

-- TEST 3: publish a newer version of every competency of the form.
INSERT INTO public.scp_competency_versions
  (competency_id, version_number, content_status, name_sv, name_en, definition_sv, definition_en)
SELECT c.id, (SELECT max(version_number) + 1 FROM public.scp_competency_versions WHERE competency_id = c.id),
       'draft', cv.name_sv || ' (ny version)', cv.name_en || ' (new version)', cv.definition_sv, cv.definition_en
  FROM public.scp_competencies c
  JOIN LATERAL (SELECT * FROM public.scp_competency_versions WHERE competency_id = c.id ORDER BY version_number DESC LIMIT 1) cv ON true
 WHERE c.code IN ('SCC-01','SCC-03','SCC-04','SCC-06','SCC-07','SCC-08','SCC-09','SCC-11');
SET session_replication_role = replica;
UPDATE public.scp_competency_versions
   SET content_status = 'published', published_at = now() + interval '1 second'
 WHERE name_sv LIKE '% (ny version)';
-- TEST 4: retire the rubric editions the release used.
UPDATE public.scp_rubric_versions rv
   SET content_status = 'retired', retired_at = now() + interval '1 second'
 WHERE rv.item_version_id IN (SELECT ivid FROM items WHERE item_format = 'constructed_response');
-- TEST C: mutate live catalogue metadata and authored prompt text.
UPDATE public.scp_competencies SET display_order = 100 - display_order;
UPDATE public.scp_followup_prompts SET prompt_sv = prompt_sv || ' [ändrad]', prompt_en = prompt_en || ' [changed]';
UPDATE public.scp_interview_guide_prompts SET question_sv = question_sv || ' [ändrad]';
UPDATE public.scp_report_versions SET limitations_sv = limitations_sv || ARRAY['Ny begränsning.'] WHERE audience = 'employer';
SET session_replication_role = origin;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd300000-0000-0000-0000-000000000002';
CREATE TEMP TABLE v3_locked AS SELECT public.scp_employer_report_v3((SELECT attempt_id FROM runs WHERE persona = 'P1')) AS d;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_versions WHERE name_sv LIKE '% (ny version)' AND content_status = 'published') = 8
  AND (SELECT count(*) FROM public.scp_rubric_versions WHERE content_status = 'retired' AND retired_at IS NOT NULL) >= 4,
  'V11.0 the catalogue really changed: eight newer competency versions published, the used rubric editions retired');

SELECT pg_temp.ok(
  (SELECT (l.d -> 'frozen_report' -> 'core')::text = (b.d -> 'frozen_report' -> 'core')::text
      AND l.d ->> 'report_id' = f.rid
      AND (SELECT bool_and(a ->> 'competency_version' = '1' AND a ->> 'competency_name_sv' NOT LIKE '%ny version%')
             FROM jsonb_array_elements(l.d -> 'frozen_report' -> 'core' -> 'competencies') a)
     FROM v3_locked l, v3_ctx b, frozen_before f),
  'V11.1 TEST 3: after newer competency versions are published, the frozen core is byte-identical and still names version 1');

SELECT pg_temp.ok(
  (SELECT l.d -> 'frozen_report' -> 'core' -> 'provenance' -> 'rubric_versions' = '[1]'::jsonb
      AND l.d -> 'frozen_report' -> 'core' -> 'provenance' = b.d -> 'frozen_report' -> 'core' -> 'provenance'
     FROM v3_locked l, v3_ctx b),
  'V11.2 TEST 4: after the rubric editions are retired, the provenance still names edition 1 and is unchanged');

SELECT pg_temp.ok(
  (SELECT ((l.d -> 'frozen_report' -> 'employer') - 'context')::text = ((b.d -> 'frozen_report' -> 'employer') - 'context')::text
      AND ((l.d -> 'frozen_report' -> 'employer' -> 'context') - 'template_limitations')
        = ((b.d -> 'frozen_report' -> 'employer' -> 'context') - 'template_limitations')
      AND (l.d -> 'frozen_report' -> 'employer' -> 'trust_followups')::text NOT LIKE '%[ändrad]%'
      AND (l.d -> 'frozen_report' -> 'employer' -> 'areas')::text NOT LIKE '%[ändrad]%'
     FROM v3_locked l, v3_ctx b),
  'V11.3 TEST C: after the catalogue order, the follow-up prompts and the guide questions change, the employer projection is byte-identical outside the template lines');

-- The template lines are the one thing that follows the live template row,
-- and they do so through the R2A audience contract, not through this
-- projection. Stated, not hidden.
SELECT pg_temp.ok(
  (SELECT l.d -> 'frozen_report' -> 'employer' -> 'context' -> 'template_limitations' -> 'sv' ? 'Ny begränsning.'
     FROM v3_locked l),
  'V11.4 the template limitation lines are the audience contract''s live template text, carried outside the frozen core');

DO $$ BEGIN RAISE NOTICE 'GROUP V12 — human reviewed means the mandatory reviews were completed'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
        (d -> 'frozen_report' -> 'core' -> 'human_review' ->> 'completed')::boolean
    AND d -> 'frozen_report' -> 'core' -> 'human_review' -> 'meaning' ->> 'sv' LIKE 'Mänskligt granskat betyder att de obligatoriska%'
    AND lower(d -> 'frozen_report' -> 'core' -> 'human_review' -> 'meaning' ->> 'sv') LIKE '%inte%'
    AND lower(d -> 'frozen_report' -> 'core' -> 'human_review' -> 'meaning' ->> 'en') LIKE '%does not mean%'
    AND replace(lower((d #- '{frozen_report,core,human_review,meaning}'
                 #- '{frozen_report,core,limitations}'
                 #- '{frozen_report,employer,context,standing_limitation}'
                 #- '{frozen_report,employer,context,template_limitations}')::text), 'unvalidated_content', '')
        NOT SIMILAR TO '%(godkän|validerad|lämplig|approved|validated|endorse|suitab|verified by|scientific)%')
     FROM v3),
  'V12.1 TEST 7: human_review.completed is true, its meaning is stated as a denial, and no other line reads as approved, validated, suitable or endorsed');

DO $$ BEGIN RAISE NOTICE 'GROUP V13 — the shared core carries nothing employer-only'; END $$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM v3, pg_temp.all_keys(d -> 'frozen_report' -> 'core') k
     WHERE k IN ('attempt_id','subject_id','participant_ref','organisation_name','purpose_code','primary_next_step','step','reason_code',
                 'follow_up_priority','safety_followup','findings','severity','finding','observed_at','interview_prompt','trust_followups',
                 'trust_plan','question','listen_for','addenda_overlay','author_display_name','note','recorded_at','clearest_support',
                 'verify_in_interview','limited_evidence','interview_handoff','template_limitations','standing_limitation'))
  AND NOT EXISTS (SELECT 1 FROM v3 WHERE (d -> 'frozen_report' -> 'core')::text LIKE '%fd300000-0000-0000-0000-00000000000%'),
  'V13.1 the core names no process step, priority, safety detail, interview material, addendum, author, organisation, attempt or subject');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report' -> 'core' -> 'human_review') k)
       = ARRAY['completed','free_text','meaning','required','reviews_completed','reviews_total','safety_critical','safety_findings_present']
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'frozen_report' -> 'core' -> 'provenance') k)
       = ARRAY['brief_version','calculated_at','computation_chain','evidence_basis_available','evidence_scope_version','evidence_state_version',
               'released_at','report_id','report_template','rubric_versions','scoring_model_version','signal_version','threshold_version','traceability_available'])
     FROM v3),
  'V13.2 the core''s human-review and provenance blocks are exactly the locked fields');

ROLLBACK;
