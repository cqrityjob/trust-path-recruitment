-- Facet resolution in scp_release_attempt_report (20261026093000, carried
-- into R1 20261027090000).
--
-- ── WHAT THIS SUITE PROVES ──────────────────────────────────────────────
--
-- A facet is identified by (competency_id, slug) -- the table's UNIQUE
-- constraint. The release function used to resolve a guide facet by slug
-- alone, which raises 21000 wherever two facets share a slug. This suite
-- builds that situation with VALID relational data only: a second, real
-- competency receives facets with the same slugs as the Väktare form's
-- self-report facets, each with its own (wrong) guide prompt. Two candidates
-- answer identically; one is released before the duplicates exist (clean
-- control), one after. The released documents must be identical, the wrong
-- prompts must never be selected, and nothing numeric may move.
--
--   FR0  the domain key and the shape of the defect, on valid data
--   FR1  clean control: release works, output captured
--   FR2  same slug in an unrelated competency: release still works
--   FR3  wrong-competency facet / prompt is never selected
--   FR4  duplicate-shape equivalence: documents byte-equal to the control
--   FR5  no scoring change: contributions, signals, classification identical
--   FR6  no report-semantic change: only the failure disappears
--   FR7  security / function properties
--   FR8  R1 forward carries the corrected, structural predicate
--
-- Nothing here changes a schema, a score, an item or a competency; the 48
-- historical orphan rows on production are not modelled (they are not valid
-- relational state) -- the duplicate here has a real competency behind it.
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

-- ---------------------------------------------------------------------------
-- Fixture: one company (owner + authorised reviewer), two candidates.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE fx AS
SELECT
  'fd000000-0000-0000-0000-000000000001'::uuid AS employer,
  'fd000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fd000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fd000000-0000-0000-0000-00000000000a'::uuid AS p1,
  'fd000000-0000-0000-0000-00000000000b'::uuid AS p2;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM fx), 'owner@facet.test'),
  ((SELECT reviewer_user FROM fx), 'reviewer@facet.test'),
  ((SELECT p1            FROM fx), 'p1@facet.test'),
  ((SELECT p2            FROM fx), 'p2@facet.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Facet Bevakning AB', 'facet-test', 'active' FROM fx;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user,    'owner',  'active' FROM fx UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM fx;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM fx;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM fx;

CREATE TEMP TABLE fxv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM fxv),
       'facet resolution regression', owner_user, now() + interval '30 days' FROM fx;

GRANT SELECT ON fx, fxv TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE runs AS
SELECT 'P1'::text AS persona, * FROM public.scp_employer_assign(
  (SELECT employer FROM fx), (SELECT version_id FROM fxv),
  'p1@facet.test', NULL, 'sv', 'recruitment')
UNION ALL
SELECT 'P2', * FROM public.scp_employer_assign(
  (SELECT employer FROM fx), (SELECT version_id FROM fxv),
  'p2@facet.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON runs TO authenticated;

CREATE TEMP TABLE items AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format, iv.evidence_source_type,
       iv.is_safety_critical, iv.facet_id,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM runs WHERE persona = 'P1'));
GRANT SELECT ON items TO authenticated;

-- Both candidates answer identically: the best option everywhere, the same text.
DO $$
DECLARE _p record; _it record;
BEGIN
  FOR _p IN SELECT r.persona, r.attempt_id,
                   CASE r.persona WHEN 'P1' THEN f.p1 ELSE f.p2 END AS uid
              FROM runs r CROSS JOIN fx f
  LOOP
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', _p.uid::text, true);
    FOR _it IN SELECT * FROM items ORDER BY display_order LOOP
      IF _it.item_format = 'constructed_response' THEN
        PERFORM public.scp_save_response(_p.attempt_id, _it.ivid, NULL, NULL, NULL,
          'Jag missade att låsa en dörr på sista ronden. Jag ringde objektet samma '
          'kväll, skrev en avvikelse på mig själv och la till dörren i min egen '
          'slutkontroll.');
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

-- Every review upheld, every safety-critical answer cleared, for both.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS ivid, iv.item_format
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE hr.review_status = 'pending' AND r.attempt_id IN (SELECT attempt_id FROM runs)
  LOOP
    PERFORM public.scp_complete_human_review(_r.id, 'upheld',
      'Läst mot rubriken. Konkret situation, egen åtgärd och vad som ändrades.',
      CASE WHEN _r.is_safety_critical THEN 'no_concern' ELSE NULL END,
      pg_temp.rubric_levels(_r.ivid, _r.item_format, 4));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT bool_and(a.status = 'scored' AND a.scored_at IS NOT NULL)
     FROM public.scp_attempts a WHERE a.id IN (SELECT attempt_id FROM runs)),
  'FX both candidates are scored and unreleased');

DO $$ BEGIN RAISE NOTICE 'GROUP FR0 — the domain key, and the shape of the defect on valid data'; END $$;

-- The facets the Väktare form actually uses, with the competency each belongs to.
CREATE TEMP TABLE form_facets AS
SELECT DISTINCT f.id AS facet_id, f.competency_id, f.slug, c.code
  FROM items i
  JOIN public.scp_competency_facets f ON f.id = i.facet_id
  JOIN public.scp_competencies c ON c.id = f.competency_id;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.scp_competency_facets'::regclass AND contype = 'u'
             AND pg_get_constraintdef(oid) = 'UNIQUE (competency_id, slug)')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'public.scp_competency_facets'::regclass AND contype = 'u'
                     AND pg_get_constraintdef(oid) = 'UNIQUE (slug)'),
  'FR0.1 a facet is identified by (competency_id, slug); a slug alone is not a key');

SELECT pg_temp.ok(
  (SELECT count(*) FROM form_facets) >= 8
  AND (SELECT count(DISTINCT code) FROM form_facets) >= 6,
  'FR0.2 the form''s self-report items span several facets across several competencies');

-- An unrelated, VALID competency: one the form has no self-report facet on.
CREATE TEMP TABLE other AS
SELECT c.id AS competency_id, c.code
  FROM public.scp_competencies c
 WHERE c.id NOT IN (SELECT competency_id FROM form_facets)
 ORDER BY c.code LIMIT 1;

SELECT pg_temp.ok(
  (SELECT count(*) FROM other) = 1
  AND EXISTS (SELECT 1 FROM public.scp_competency_versions cv WHERE cv.competency_id = (SELECT competency_id FROM other)),
  'FR0.3 a real competency with a version of its own exists outside the form''s facet set');

DO $$ BEGIN RAISE NOTICE 'GROUP FR1 — clean control'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P1'));
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

CREATE TEMP TABLE snap AS
SELECT run.persona, s.*
  FROM public.scp_report_snapshots s JOIN runs run ON run.attempt_id = s.attempt_id;

SELECT pg_temp.ok(
  (SELECT count(*) FROM snap WHERE persona = 'P1') = 2
  AND (SELECT jsonb_array_length(brief -> 'interview_guide') FROM snap WHERE persona = 'P1' AND audience = 'employer') > 0
  AND (SELECT count(*) FROM snap s, jsonb_array_elements(s.brief -> 'interview_guide') g
        WHERE s.persona = 'P1' AND s.audience = 'employer' AND g ->> 'evidence_type' = 'self_reported') >= 1,
  'FR1.1 the clean control releases; its guide carries at least one self-report (facet-resolved) entry');

DO $$ BEGIN RAISE NOTICE 'GROUP FR2 — the same slug in an unrelated competency'; END $$;

-- Every facet slug the form uses now also exists under the unrelated
-- competency -- a legitimate row: valid competency, unique (competency, slug).
INSERT INTO public.scp_competency_facets
  (competency_id, slug, name_sv, name_en, definition_sv, definition_en, display_order)
SELECT (SELECT competency_id FROM other), ff.slug,
       'DUBBLETT ' || ff.slug, 'DUPLICATE ' || ff.slug,
       'En facett med samma slug under en annan kompetens.',
       'A facet with the same slug under another competency.',
       100 + row_number() OVER (ORDER BY ff.slug)
  FROM form_facets ff;

-- ...each with its own explore_self_report prompt, so a wrong resolution would
-- have something to select.
INSERT INTO public.scp_interview_guide_prompts
  (competency_id, facet_id, focus, question_sv, question_en, followup_sv, followup_en,
   listen_for_sv, listen_for_en)
SELECT f.competency_id, f.id, 'explore_self_report',
       'WRONG-FACET-PROMPT ' || f.slug, 'WRONG-FACET-PROMPT ' || f.slug,
       'WRONG-FACET-FOLLOWUP', 'WRONG-FACET-FOLLOWUP',
       ARRAY['WRONG-FACET-LISTEN'], ARRAY['WRONG-FACET-LISTEN']
  FROM public.scp_competency_facets f
 WHERE f.competency_id = (SELECT competency_id FROM other)
   AND f.slug IN (SELECT slug FROM form_facets);

SELECT pg_temp.ok(
  (SELECT bool_and(n = 2) FROM (
     SELECT slug, count(*) n FROM public.scp_competency_facets
      WHERE slug IN (SELECT slug FROM form_facets) GROUP BY slug) x),
  'FR2.1 every form facet slug now resolves to two rows by slug alone -- both valid');

-- The defect, demonstrated on this valid data: the old scalar lookup cannot
-- pick one.
SELECT pg_temp.must_fail(
  format('SELECT (SELECT f2.id FROM public.scp_competency_facets f2 WHERE f2.slug = %L)',
         (SELECT slug FROM form_facets ORDER BY slug LIMIT 1)),
  'more than one row returned by a subquery',
  'FR2.2 the slug-only scalar lookup raises 21000 on valid data');

SELECT pg_temp.ok(
  (SELECT bool_and(n = 1) FROM (
     SELECT ff.competency_id, ff.slug,
            (SELECT count(*) FROM public.scp_competency_facets f2
              WHERE f2.competency_id = ff.competency_id AND f2.slug = ff.slug) n
       FROM form_facets ff) x),
  'FR2.3 (competency_id, slug) resolves each intended facet to exactly one row');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P2'));
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

DROP TABLE snap;
CREATE TEMP TABLE snap AS
SELECT run.persona, s.*
  FROM public.scp_report_snapshots s JOIN runs run ON run.attempt_id = s.attempt_id;

SELECT pg_temp.ok(
  (SELECT count(*) FROM snap WHERE persona = 'P2') = 2,
  'FR2.4 the release succeeds with the duplicate-slug facets in place');

DO $$ BEGIN RAISE NOTICE 'GROUP FR3 — the wrong competency''s facet is never selected'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(s.brief::text NOT LIKE '%WRONG-FACET%' AND s.payload::text NOT LIKE '%WRONG-FACET%')
     FROM snap s),
  'FR3.1 no released document carries the wrong competency''s prompt, follow-up or listen-for');

-- Through the manifest (R1 is applied in this state): every guide prompt row
-- selected for P2 belongs to a facet under the area's own competency.
SELECT pg_temp.ok(
  (SELECT bool_and(f.competency_id = c.id AND f.competency_id <> (SELECT competency_id FROM other))
     FROM public.scp_report_computation_manifests m
     JOIN runs run ON run.attempt_id = m.attempt_id
     CROSS JOIN LATERAL jsonb_array_elements(m.body -> 'prompts' -> 'interview_guide') g
     JOIN public.scp_interview_guide_prompts p ON p.id = (g ->> 'prompt_id')::uuid
     JOIN public.scp_competencies c ON c.code = g ->> 'area_code'
     JOIN public.scp_competency_facets f ON f.id = p.facet_id
    WHERE run.persona = 'P2' AND g ->> 'evidence_type' = 'self_reported')
  AND (SELECT count(*)
         FROM public.scp_report_computation_manifests m
         JOIN runs run ON run.attempt_id = m.attempt_id
         CROSS JOIN LATERAL jsonb_array_elements(m.body -> 'prompts' -> 'interview_guide') g
        WHERE run.persona = 'P2' AND g ->> 'evidence_type' = 'self_reported') >= 1,
  'FR3.2 every self-report guide prompt frozen for P2 sits on a facet of the area''s competency, never on the duplicate');

DO $$ BEGIN RAISE NOTICE 'GROUP FR4 — duplicate-shape equivalence'; END $$;

SELECT pg_temp.ok(
  (SELECT a.payload = b.payload AND a.brief = b.brief
      AND a.derivation_input = b.derivation_input AND a.safety_flags = b.safety_flags
     FROM snap a JOIN snap b ON b.audience = a.audience
    WHERE a.persona = 'P1' AND b.persona = 'P2' AND a.audience = 'employer'),
  'FR4.1 the employer document released under duplicate slugs is byte-equal to the clean control');

SELECT pg_temp.ok(
  (SELECT a.payload = b.payload AND a.brief = b.brief AND a.safety_flags = b.safety_flags
     FROM snap a JOIN snap b ON b.audience = a.audience
    WHERE a.persona = 'P1' AND b.persona = 'P2' AND a.audience = 'participant'),
  'FR4.2 and so is the participant document');

SELECT pg_temp.ok(
  (SELECT (a.context - 'participant_ref') = (b.context - 'participant_ref')
     FROM snap a JOIN snap b ON b.audience = a.audience
    WHERE a.persona = 'P1' AND b.persona = 'P2' AND a.audience = 'employer'),
  'FR4.3 the employer context differs only by the pseudonymous participant reference');

SELECT pg_temp.ok(
  (SELECT a.brief -> 'interview_guide' = b.brief -> 'interview_guide'
     FROM snap a JOIN snap b ON b.audience = a.audience
    WHERE a.persona = 'P1' AND b.persona = 'P2' AND a.audience = 'employer'),
  'FR4.4 the interview guide -- the part that resolves facets -- is identical entry for entry');

DO $$ BEGIN RAISE NOTICE 'GROUP FR5 — no scoring change'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT r.item_version_id, e.source_type, e.provenance_type, e.contribution, e.confidence,
            e.safety_finding, e.behaviour_version_id
       FROM public.scp_competency_evidence e
       JOIN public.scp_candidate_responses r ON r.id = e.source_ref
      WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P1')
     EXCEPT
     SELECT r.item_version_id, e.source_type, e.provenance_type, e.contribution, e.confidence,
            e.safety_finding, e.behaviour_version_id
       FROM public.scp_competency_evidence e
       JOIN public.scp_candidate_responses r ON r.id = e.source_ref
      WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P2')) x) = 0
  AND (SELECT count(*) FROM public.scp_competency_evidence e
        JOIN public.scp_candidate_responses r ON r.id = e.source_ref
       WHERE r.attempt_id IN (SELECT attempt_id FROM runs)) = 2 * 50,
  'FR5.1 every SJT / self-report / reviewed contribution is identical item for item between the two candidates');

SELECT pg_temp.ok(
  (SELECT bool_and(a1 ->> 'final_area_signal' = a2 ->> 'final_area_signal'
               AND (a1 ->> 'mean')::numeric = (a2 ->> 'mean')::numeric
               AND (a1 ->> 'spread')::numeric = (a2 ->> 'spread')::numeric
               AND (a1 ->> 'item_count')::int = (a2 ->> 'item_count')::int
               AND (a1 ->> 'weighted_sum')::numeric = (a2 ->> 'weighted_sum')::numeric
               AND a1 ->> 'maturity_level' = a2 ->> 'maturity_level'
               AND a1 ->> 'evidence_state' = a2 ->> 'evidence_state')
     FROM public.scp_report_computation_manifests ma JOIN runs ra ON ra.attempt_id = ma.attempt_id AND ra.persona = 'P1',
          jsonb_array_elements(ma.body -> 'computation' -> 'areas') a1,
          public.scp_report_computation_manifests mb JOIN runs rb ON rb.attempt_id = mb.attempt_id AND rb.persona = 'P2',
          jsonb_array_elements(mb.body -> 'computation' -> 'areas') a2
    WHERE a1 ->> 'competency_code' = a2 ->> 'competency_code')
  AND (SELECT count(*) FROM public.scp_report_computation_manifests ma JOIN runs ra ON ra.attempt_id = ma.attempt_id AND ra.persona = 'P1',
          jsonb_array_elements(ma.body -> 'computation' -> 'areas') a1,
          public.scp_report_computation_manifests mb JOIN runs rb ON rb.attempt_id = mb.attempt_id AND rb.persona = 'P2',
          jsonb_array_elements(mb.body -> 'computation' -> 'areas') a2
    WHERE a1 ->> 'competency_code' = a2 ->> 'competency_code') = 8
  AND (SELECT bool_and(s1 ->> 'pattern' = s2 ->> 'pattern' AND s1 ->> 'consistency' = s2 ->> 'consistency'
                   AND (s1 ->> 'mean')::numeric = (s2 ->> 'mean')::numeric)
         FROM public.scp_report_computation_manifests ma JOIN runs ra ON ra.attempt_id = ma.attempt_id AND ra.persona = 'P1',
              jsonb_array_elements(ma.body -> 'computation' -> 'self_report_areas') s1,
              public.scp_report_computation_manifests mb JOIN runs rb ON rb.attempt_id = mb.attempt_id AND rb.persona = 'P2',
              jsonb_array_elements(mb.body -> 'computation' -> 'self_report_areas') s2
        WHERE s1 ->> 'facet_slug' = s2 ->> 'facet_slug')
  AND (SELECT count(*) FROM public.scp_report_computation_manifests m JOIN runs r ON r.attempt_id = m.attempt_id) = 2,
  'FR5.2 every competency signal, mean, count and state is identical; the frozen provenance agrees');

SELECT pg_temp.ok(
  (SELECT (SELECT jsonb_object_agg(k, v) FROM (
             SELECT e ->> 'classification' k, count(*) v
               FROM jsonb_array_elements(a.body -> 'computation' -> 'evidence') e GROUP BY 1) x)
        = (SELECT jsonb_object_agg(k, v) FROM (
             SELECT e ->> 'classification' k, count(*) v
               FROM jsonb_array_elements(b.body -> 'computation' -> 'evidence') e GROUP BY 1) y)
     FROM public.scp_report_computation_manifests a JOIN runs ra ON ra.attempt_id = a.attempt_id AND ra.persona = 'P1',
          public.scp_report_computation_manifests b JOIN runs rb ON rb.attempt_id = b.attempt_id AND rb.persona = 'P2'),
  'FR5.3 the evidence classification (observed / self_report) is identical');

DO $$ BEGIN RAISE NOTICE 'GROUP FR6 — no report-semantic change'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(
       (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s.brief) k)
         = ARRAY['audience','brief_version','coverage','executive_summary','interview_guide','modules','observed','pace','self_reported','signal_version']
       AND (SELECT bool_and(g ? 'question_sv' AND g ? 'followup_sv' AND g ? 'listen_for_sv' AND g ? 'focus'
                            AND g ? 'area_code' AND g ? 'evidence_type' AND NOT (g ? 'prompt_id') AND NOT (g ? 'facet_id'))
              FROM jsonb_array_elements(s.brief -> 'interview_guide') g))
     FROM snap s WHERE s.audience = 'employer'),
  'FR6.1 the employer brief keeps exactly its keys and each guide entry keeps exactly its shape -- no new field, no facet id');

SELECT pg_temp.ok(
  (SELECT bool_and(g ->> 'question_sv' <> '' AND g ->> 'question_sv' NOT ILIKE '%DUBBLETT%')
     FROM snap s, jsonb_array_elements(s.brief -> 'interview_guide') g WHERE s.audience = 'employer'),
  'FR6.2 every guide question is the authored one for the area''s own facet');

DO $$ BEGIN RAISE NOTICE 'GROUP FR7 — security and function properties'; END $$;

SELECT pg_temp.ok(
  (SELECT p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report'),
  'FR7.1 the release function is SECURITY DEFINER, pinned, authenticated-only, never anon, never service_role');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report', 'scp_employer_report')
      AND p.prosecdef AND p.prosrc LIKE '%scp_report_snapshot_readable%'
      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%'
      AND p.prosrc NOT ILIKE '%scp_competency_facets%'
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 2
  AND NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT'),
  'FR7.2 the R2A audience contracts are untouched: definer, predicate-gated, continuity-joined, facet-free, and the direct read stays withdrawn');

-- A genuine reader still gets its document, and only its own.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 1
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0,
  'FR7.3 the second candidate reads exactly their own participant document and no employer one');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP FR8 — the predicate is structural, in the applied R1 function'; END $$;

SELECT pg_temp.ok(
  (SELECT regexp_count(p.prosrc, 'scp_competency_facets f2') = 1
      AND p.prosrc ~ 'EXISTS \(SELECT 1 FROM public\.scp_competency_facets f2\s+WHERE f2\.id = p\.facet_id\s+AND f2\.competency_id = c\.id\s+AND f2\.slug = g\.facet_slug\)'
      AND p.prosrc !~ 'WHERE f2\.slug = g\.facet_slug'
      AND p.prosrc !~ '\(SELECT f2\.id FROM public\.scp_competency_facets'
      AND p.prosrc !~* 'scp_competency_facets[^;]*LIMIT 1'
      AND p.prosrc !~* 'DISTINCT ON \(f2'
      AND p.prosrc ~ 'JOIN public\.scp_competencies c ON c\.code = g\.area_code'
      AND p.prosrc LIKE '%scp_report_computation_manifests%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report'),
  'FR8.1 the applied (R1) release function binds the prompt''s facet to the area''s competency and the slug -- one facet reference, no slug-only form, no LIMIT 1, no DISTINCT ON');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'scp_report_manifest_computation'
                 AND p.prosrc ILIKE '%scp_competency_facets f2%'),
  'FR8.2 the manifest builder resolves no facet by slug');

ROLLBACK;
