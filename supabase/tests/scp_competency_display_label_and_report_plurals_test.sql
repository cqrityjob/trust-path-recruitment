-- PR-R3B copy decisions — the SCC-07 display label, and plural generation.
--
-- Two Product Owner decisions, proved against a report this suite actually
-- releases:
--
--   C0  fixture and state
--   C1  the label moved in the catalogue, and only the label moved
--   C2  a report released from here carries the new label
--   C3  a report already released keeps the label it was released with,
--       even after the catalogue moves again
--   C4  the generator agrees the noun with the number, in both languages
--   C5  nothing in a frozen document is rewritten by a later catalogue change
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

-- The rubric levels a completed human review must carry, for one item.
CREATE OR REPLACE FUNCTION pg_temp.rubric_levels(_ivid uuid, _fmt text, _level int)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE _level END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- The observed line for one area of the released employer brief.
CREATE OR REPLACE FUNCTION pg_temp.obs(_brief jsonb, _code text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT o FROM jsonb_array_elements(_brief -> 'observed') o WHERE o ->> 'area_code' = _code LIMIT 1;
$$;

DO $$ BEGIN RAISE NOTICE 'GROUP C0 - fixture: one employer, one candidate, one released report'; END $$;

CREATE TEMP TABLE cd AS
SELECT
  'fd3b0000-0000-0000-0000-000000000001'::uuid AS employer,
  'fd3b0000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fd3b0000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fd3b0000-0000-0000-0000-00000000000a'::uuid AS p1;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM cd), 'owner@trust-r3b.test'),
  ((SELECT reviewer_user FROM cd), 'reviewer@trust-r3b.test'),
  ((SELECT p1            FROM cd), 'p1@trust-r3b.test');

INSERT INTO public.profiles (id, display_name)
SELECT owner_user, 'Anna Agare' FROM cd
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Trust Bevakning R3B AB', 'trust-r3b', 'active' FROM cd;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM cd UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM cd;

INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM cd;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM cd;

CREATE TEMP TABLE cdv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM cdv),
       'PR-R3B copy decisions', owner_user, now() + interval '30 days' FROM cd;

GRANT SELECT ON cd, cdv TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd3b0000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM cd), (SELECT version_id FROM cdv),
  'p1@trust-r3b.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated;

CREATE TEMP TABLE items AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format, iv.is_safety_critical, c.code AS competency_code,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_competencies c ON c.id = iv.competency_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM run));
GRANT SELECT ON items TO authenticated;

SELECT pg_temp.ok(
  (SELECT count(*) FROM items WHERE competency_code = 'SCC-08') = 1
  AND (SELECT count(*) FROM items WHERE competency_code = 'SCC-01') > 1,
  'C0.1 the flagship form gives one observed task for SCC-08 and more than one for SCC-01');

DO $$
DECLARE _it record; _uid uuid; _att uuid;
BEGIN
  SELECT p1 INTO _uid FROM cd; SELECT attempt_id INTO _att FROM run;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  FOR _it IN SELECT * FROM items ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag missade att lasa en dorr pa sista ronden. Jag ringde objektet samma kvall och skrev en avvikelse pa mig sjalv.');
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd3b0000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS ivid, iv.item_format
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE hr.review_status = 'pending' AND r.attempt_id = (SELECT attempt_id FROM run)
  LOOP
    PERFORM public.scp_complete_human_review(_r.id, 'upheld',
      'Last mot rubriken. Konkret situation, egen atgard och vad som andrades.',
      CASE WHEN _r.is_safety_critical THEN 'no_concern' ELSE NULL END,
      pg_temp.rubric_levels(_r.ivid, _r.item_format, 4));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd3b0000-0000-0000-0000-000000000002';
DO $$ BEGIN PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM run)); END $$;
CREATE TEMP TABLE rep AS
SELECT to_jsonb(e) AS d FROM run, LATERAL public.scp_employer_report(run.attempt_id) e;
CREATE TEMP TABLE v3 AS
SELECT public.scp_employer_report_v3(run.attempt_id) AS d FROM run;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON rep, v3 TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM rep WHERE d IS NOT NULL) = 1
  AND (SELECT count(*) FROM v3 WHERE d IS NOT NULL) = 1,
  'C0.2 one released report, one V3 document');

DO $$ BEGIN RAISE NOTICE 'GROUP C1 - the display label moved, and only the label moved'; END $$;

SELECT pg_temp.ok(
  (SELECT v.name_sv FROM public.scp_competency_versions v
     JOIN public.scp_competencies c ON c.id = v.competency_id
    WHERE c.code = 'SCC-07' AND v.version_number = 2) = 'Professionellt bemötande och gränssättning',
  'C1.1 SCC-07 version 2 carries the approved Swedish label');

SELECT pg_temp.ok(
  (SELECT v.name_en FROM public.scp_competency_versions v
     JOIN public.scp_competencies c ON c.id = v.competency_id
    WHERE c.code = 'SCC-07' AND v.version_number = 2) = 'Professional Conduct & Boundary Setting',
  'C1.2 and the English label that matches it');

SELECT pg_temp.ok(
  (SELECT v2.definition_sv = v1.definition_sv AND v2.definition_en = v1.definition_en
      AND v2.strong_indicators_sv = v1.strong_indicators_sv
      AND v2.risk_indicators_sv = v1.risk_indicators_sv
      AND v2.development_indicators_sv = v1.development_indicators_sv
      AND v2.does_not_measure_sv = v1.does_not_measure_sv
      AND v2.interpretation_rule_sv IS NOT DISTINCT FROM v1.interpretation_rule_sv
      AND v2.interpretation_rule_en IS NOT DISTINCT FROM v1.interpretation_rule_en
     FROM public.scp_competency_versions v1
     JOIN public.scp_competencies c ON c.id = v1.competency_id
     JOIN public.scp_competency_versions v2 ON v2.competency_id = v1.competency_id AND v2.version_number = 2
    WHERE c.code = 'SCC-07' AND v1.version_number = 1),
  'C1.3 the definition, the indicators and the interpretation rules are identical to version 1');

SELECT pg_temp.ok(
  (SELECT v.name_sv = 'Respektfull service och gränshållning' AND v.name_en = 'Service Orientation'
      AND v.content_status = 'retired'
     FROM public.scp_competency_versions v
     JOIN public.scp_competencies c ON c.id = v.competency_id
    WHERE c.code = 'SCC-07' AND v.version_number = 1),
  'C1.4 version 1 keeps its own wording and stays readable as the retired historical version');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT competency_id FROM public.scp_competency_versions
      WHERE content_status = 'published' GROUP BY competency_id HAVING count(*) > 1) d) = 0,
  'C1.5 no competency has two published versions');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_behaviour_competency_map m
     JOIN public.scp_competency_versions v ON v.id = m.competency_version_id
     JOIN public.scp_competencies c ON c.id = v.competency_id
    WHERE c.code = 'SCC-07' AND v.version_number = 1) = 0
  AND (SELECT count(*) FROM public.scp_behaviour_competency_map m
     JOIN public.scp_competency_versions v ON v.id = m.competency_version_id
     JOIN public.scp_competencies c ON c.id = v.competency_id
    WHERE c.code = 'SCC-07' AND v.version_number = 2) > 0,
  'C1.6 every behaviour mapped to SCC-07 now resolves through version 2');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_facets f
     JOIN public.scp_competencies c ON c.id = f.competency_id
    WHERE c.code = 'SCC-07') > 0,
  'C1.7 the facets hang off the competency and survived the version change');

DO $$ BEGIN RAISE NOTICE 'GROUP C2 - a report released from here carries the new label'; END $$;

SELECT pg_temp.ok(
  (SELECT pg_temp.obs(d -> 'brief', 'SCC-07') ->> 'area_sv' FROM rep)
    = 'Professionellt bemötande och gränssättning',
  'C2.1 the released employer brief names SCC-07 by the approved Swedish label');

SELECT pg_temp.ok(
  (SELECT pg_temp.obs(d -> 'brief', 'SCC-07') ->> 'area_en' FROM rep)
    = 'Professional Conduct & Boundary Setting',
  'C2.2 and by the approved English label');

SELECT pg_temp.ok(
  (SELECT bool_and(a ->> 'competency_version' = '2')
     FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a
    WHERE a ->> 'competency_code' = 'SCC-07'),
  'C2.3 the V3 document records SCC-07 as competency version 2');

DO $$ BEGIN RAISE NOTICE 'GROUP C3 - a released report keeps the label it was released with'; END $$;

-- The catalogue moves again, after the report was released.
INSERT INTO public.scp_competency_versions (
  competency_id, version_number, content_status, name_sv, name_en,
  definition_sv, definition_en, strong_indicators_sv, risk_indicators_sv,
  development_indicators_sv, does_not_measure_sv)
SELECT v.competency_id, 3, 'draft', 'SCC-07 (annu en ny version)', 'SCC-07 (yet another version)',
       v.definition_sv, v.definition_en, v.strong_indicators_sv, v.risk_indicators_sv,
       v.development_indicators_sv, v.does_not_measure_sv
  FROM public.scp_competency_versions v
  JOIN public.scp_competencies c ON c.id = v.competency_id
 WHERE c.code = 'SCC-07' AND v.version_number = 2;

UPDATE public.scp_competency_versions v SET content_status = 'published', published_at = now()
  FROM public.scp_competencies c
 WHERE c.id = v.competency_id AND c.code = 'SCC-07' AND v.version_number = 3;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd3b0000-0000-0000-0000-000000000002';
CREATE TEMP TABLE rep_after AS
SELECT to_jsonb(e) AS d FROM run, LATERAL public.scp_employer_report(run.attempt_id) e;
CREATE TEMP TABLE v3_after AS
SELECT public.scp_employer_report_v3(run.attempt_id) AS d FROM run;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT pg_temp.obs(d -> 'brief', 'SCC-07') ->> 'area_sv' FROM rep_after)
    = 'Professionellt bemötande och gränssättning',
  'C3.1 after a newer competency version is published, the released report still names the label it was released with');

SELECT pg_temp.ok(
  (SELECT bool_and(a ->> 'competency_version' = '2'
                   AND a ->> 'competency_name_sv' NOT LIKE '%annu en ny version%')
     FROM v3_after, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a
    WHERE a ->> 'competency_code' = 'SCC-07'),
  'C3.2 and the V3 document still records version 2, never the version published afterwards');

SELECT pg_temp.ok(
  (SELECT (a.d -> 'frozen_report' -> 'core')::text = (b.d -> 'frozen_report' -> 'core')::text
      AND a.d ->> 'report_id' = b.d ->> 'report_id'
     FROM v3_after a, v3 b),
  'C3.3 the whole frozen core is byte-identical before and after the catalogue moved');

DO $$ BEGIN RAISE NOTICE 'GROUP C4 - the generator agrees the noun with the number'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(o ->> 'why_sv' NOT LIKE '%uppgift(er)%' AND o ->> 'why_en' NOT LIKE '%task(s)%')
     FROM rep, jsonb_array_elements(d -> 'brief' -> 'observed') o),
  'C4.1 no observed line in a newly released report contains a plural placeholder');

SELECT pg_temp.ok(
  (SELECT o ->> 'why_sv' LIKE '%1 uppgift %' AND o ->> 'why_sv' NOT LIKE '%1 uppgifter%'
     FROM rep, LATERAL pg_temp.obs(d -> 'brief', 'SCC-08') o),
  'C4.2 the area with one observed task reads "1 uppgift", not "1 uppgifter"');

SELECT pg_temp.ok(
  (SELECT o ->> 'why_en' LIKE '%1 task %' AND o ->> 'why_en' NOT LIKE '%1 tasks%'
     FROM rep, LATERAL pg_temp.obs(d -> 'brief', 'SCC-08') o),
  'C4.3 and reads "1 task", not "1 tasks", in English');

SELECT pg_temp.ok(
  (SELECT o ->> 'why_sv' ~ '[2-9][0-9]* uppgifter' AND o ->> 'why_en' ~ '[2-9][0-9]* tasks'
     FROM rep, LATERAL pg_temp.obs(d -> 'brief', 'SCC-01') o),
  'C4.4 an area with more than one observed task keeps the plural, in both languages');

SELECT pg_temp.ok(
  (SELECT position('uppgift(er)' in pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure)) = 0
      AND position('task(s)' in pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure)) = 0),
  'C4.5 the release function cannot write a placeholder: its own source contains none');

DO $$ BEGIN RAISE NOTICE 'GROUP C5 - the client repair has nothing to do on a new report'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
     a -> 'factual_explanation' ->> 'sv' = pg_temp.obs(r.d -> 'brief', a ->> 'competency_code') ->> 'why_sv')
     FROM v3 t, rep r, jsonb_array_elements(t.d -> 'frozen_report' -> 'core' -> 'competencies') a
    WHERE pg_temp.obs(r.d -> 'brief', a ->> 'competency_code') IS NOT NULL),
  'C5.1 the V3 projection returns the frozen sentence verbatim and rewrites nothing');

SELECT pg_temp.ok(
  (SELECT bool_and(a -> 'factual_explanation' ->> 'sv' NOT LIKE '%(er)%'
                   AND a -> 'factual_explanation' ->> 'en' NOT LIKE '%(s)%')
     FROM v3, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a),
  'C5.2 nothing a reader sees in a new V3 document carries an unresolved plural');

ROLLBACK;
