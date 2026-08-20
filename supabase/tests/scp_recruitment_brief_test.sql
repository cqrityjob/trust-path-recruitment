-- The Candidate Assessment Brief, proven on three candidates who differ in the
-- one way the product must never get wrong.
--
-- ── WHY THREE PEOPLE AND NOT ONE ────────────────────────────────────────
--
-- A single fixture can prove the brief renders. It cannot prove the brief
-- DISCRIMINATES, and discrimination between two specific things is the whole
-- claim:
--
--   Persona A — answers the scenarios well and describes themselves well.
--   Persona B — strong on reporting, uneven on prioritisation, and describes
--               procedure adherence inconsistently across related questions.
--   Persona C — describes themselves exactly like A, and answers the scenarios
--               like somebody who has not done the job.
--
-- C is the load-bearing case. If the platform ever collapses "I say I do this"
-- into "I demonstrated this", C's brief becomes indistinguishable from A's, an
-- employer makes a hiring decision on a self-portrait, and no amount of
-- careful wording elsewhere repairs it. Several assertions below are stated as
-- ABSENCES on C, because an absence is what no accidental finding can satisfy.
--
-- One transaction, ends in ROLLBACK.

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

-- Every construct dimension at 4, every writing-quality dimension at 0. The
-- derived contribution is 1.000 if and only if writing style is excluded,
-- which is worth pinning here too.
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
-- Fixture: one guarding company, three candidates, a second organisation that
-- must see none of it.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE rb AS
SELECT
  'fb000000-0000-0000-0000-000000000001'::uuid AS employer,
  'fb000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fb000000-0000-0000-0000-00000000000a'::uuid AS cand_a,
  'fb000000-0000-0000-0000-00000000000b'::uuid AS cand_b,
  'fb000000-0000-0000-0000-00000000000c'::uuid AS cand_c,
  'fb000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fb000000-0000-0000-0000-000000000011'::uuid AS other_employer,
  'fb000000-0000-0000-0000-000000000012'::uuid AS other_owner;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM rb), 'owner@recruit-brief.test'),
  ((SELECT cand_a        FROM rb), 'a@recruit-brief.test'),
  ((SELECT cand_b        FROM rb), 'b@recruit-brief.test'),
  ((SELECT cand_c        FROM rb), 'c@recruit-brief.test'),
  ((SELECT reviewer_user FROM rb), 'reviewer@recruit-brief.test'),
  ((SELECT other_owner   FROM rb), 'other@recruit-brief.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Nordvakt Bevakning AB', 'nordvakt-recruit-brief', 'active' FROM rb
UNION ALL
SELECT other_employer, 'Annan Bevakning AB', 'annan-recruit-brief', 'active' FROM rb;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM rb
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM rb
UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM rb;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM rb;

-- The content role is what lets a reviewer READ the queue under RLS. It is
-- deliberately not sufficient on its own -- #51 moved the authorisation to
-- complete a review onto the employer's own reviewer grant above -- but
-- without it the reviewer cannot see the rows to work on.
INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM rb;

CREATE TEMP TABLE rbv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM rbv),
       'Flagship recruitment assessment closed test', owner_user,
       now() + interval '30 days' FROM rb;

GRANT SELECT ON rb, rbv TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP RB0 — the recruitment guard is not weakened'; END $$;

-- =========================================================================
-- Group RB0 — the assessment exists, is labelled, and is STILL refused for
-- recruitment. This is asserted before anything is run, because the whole
-- product would be a governance failure if it were not true.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT designed_for FROM public.scp_assessment_definitions
    WHERE slug = 'security-officer-recruitment') = 'recruitment_support',
  'RB0.1 the assessment is labelled as designed for recruitment support');

SELECT pg_temp.ok(
  (SELECT content_status = 'draft' AND validation_status = 'design'
     FROM public.scp_assessment_versions WHERE id = (SELECT version_id FROM rbv)),
  'RB0.2 and it is honestly draft, design-status content');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';

-- The load-bearing refusal. A recruitment-DESIGNED assessment does not become
-- recruitment-PERMITTED, and a closed-test grant can never confer selection use.
SELECT pg_temp.must_fail($$
  SELECT public.scp_employer_assign(
    (SELECT employer FROM rb), (SELECT version_id FROM rbv),
    'a@recruit-brief.test', NULL, 'sv', 'recruitment', NULL, NULL)$$,
  'SCP_NOT_VALID_FOR_RECRUITMENT',
  'RB0.3 a recruitment-designed assessment is STILL refused in a recruitment context');

RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Assign to all three, as a closed test.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE runs AS
SELECT 'A'::text AS persona, * FROM public.scp_employer_assign(
  (SELECT employer FROM rb), (SELECT version_id FROM rbv),
  'a@recruit-brief.test', NULL, 'sv', 'workforce', NULL, NULL)
UNION ALL
SELECT 'B', * FROM public.scp_employer_assign(
  (SELECT employer FROM rb), (SELECT version_id FROM rbv),
  'b@recruit-brief.test', NULL, 'sv', 'workforce', NULL, NULL)
UNION ALL
SELECT 'C', * FROM public.scp_employer_assign(
  (SELECT employer FROM rb), (SELECT version_id FROM rbv),
  'c@recruit-brief.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON runs TO authenticated;

SELECT pg_temp.ok(
  (SELECT bool_and(governance_mode = 'closed_test') FROM runs),
  'RB0.4 every attempt is stamped closed_test, not recruitment');

-- ---------------------------------------------------------------------------
-- The answer key, assembled once by the owning role.
--
-- The item bank is author-only under RLS, which is correct: a participant
-- answers through scp_get_attempt_items and can never enumerate the form. The
-- personas below need to CHOOSE deliberately, so the options are resolved here
-- and handed over, exactly as the report-audience suite does.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE rbitems AS
SELECT fi.display_order, fi.block_key, i.slug,
       iv.id AS ivid, iv.item_format, iv.evidence_source_type,
       c.code AS competency_code, f.slug AS facet_slug,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value ASC, o.display_order LIMIT 1)  AS worst_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order OFFSET 1 LIMIT 1) AS mid_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
  JOIN public.scp_competencies c ON c.id = iv.competency_id
  LEFT JOIN public.scp_competency_facets f ON f.id = iv.facet_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM runs WHERE persona = 'A'));
GRANT SELECT ON rbitems TO authenticated;

-- ---------------------------------------------------------------------------
-- Persona A — answers the scenarios well, describes themselves well.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-00000000000a';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE persona = 'A';
  FOR _it IN SELECT * FROM rbitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag missade att låsa en dörr på sista ronden. Jag ringde objektet samma '
        'kväll, skrev en avvikelse på mig själv och la till dörren i min egen '
        'slutkontroll så att den kvitteras separat.');
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Persona B — strong on reporting and communication; uneven where several
-- things compete for attention; and describes procedure adherence differently
-- from one related question to the next.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-00000000000b';
DO $$
DECLARE _att uuid; _it record; _n int := 0;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE persona = 'B';
  FOR _it IN SELECT * FROM rbitems ORDER BY display_order LOOP
    _n := _n + 1;
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Vi fick fel portkod av beställaren. Jag märkte det när koden inte gick '
        'och ringde platschefen i stället för att gissa. Sedan sa jag till '
        'nattpasset att koden i pärmen var fel.');
    ELSIF _it.evidence_source_type = 'self_report'
          AND _it.facet_slug = 'genomforandedisciplin' THEN
      -- The consistency signal, produced on purpose: related questions about
      -- the same habit answered at opposite ends.
      IF _n % 2 = 0 THEN
        PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
      ELSE
        PERFORM public.scp_save_response(_att, _it.ivid, _it.worst_option, NULL, NULL, NULL);
      END IF;
    ELSIF _it.competency_code IN ('SCC-04','SCC-11') THEN
      -- Uneven where things compete: some handled well, some not.
      IF _n % 2 = 0 THEN
        PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
      ELSE
        PERFORM public.scp_save_response(_att, _it.ivid, _it.worst_option, NULL, NULL, NULL);
      END IF;
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Persona C — describes themselves exactly as Persona A does, and answers the
-- scenarios like somebody who has not done the work. THE case.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-00000000000c';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE persona = 'C';
  FOR _it IN SELECT * FROM rbitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag brukar alltid följa rutinerna och rapportera allt. Jag är noggrann '
        'av mig och det brukar inte bli fel.');
    ELSIF _it.evidence_source_type = 'self_report' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.worst_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Review. Seven per attempt: three safety-critical scenarios and four
-- reflections. The reviewer is authorised by the employer and is neither the
-- participant nor the person who assigned it.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record; _level int;
BEGIN
  FOR _r IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS ivid, iv.item_format,
           run.persona
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN runs run ON run.attempt_id = r.attempt_id
     WHERE hr.review_status = 'pending'
  LOOP
    -- Nobody in this fixture raised a safety concern. That is deliberate: a
    -- safety flag is a real finding, and manufacturing one in every fixture is
    -- how a flag stops meaning anything.
    _level := CASE _r.persona WHEN 'A' THEN 4 WHEN 'B' THEN 3 ELSE 1 END;
    PERFORM public.scp_complete_human_review(_r.id, 'upheld',
      'Läst mot rubriken. Konkret situation, egen åtgärd och vad som ändrades.',
      CASE WHEN _r.is_safety_critical THEN 'no_concern' ELSE NULL END,
      pg_temp.rubric_levels(_r.ivid, _r.item_format, _level));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Release all three.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';
DO $$ DECLARE _r record; BEGIN
  FOR _r IN SELECT attempt_id FROM runs LOOP
    PERFORM public.scp_release_attempt_report(_r.attempt_id);
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

CREATE TEMP TABLE briefs AS
SELECT run.persona, s.audience, s.payload, s.brief, s.context, s.safety_flags,
       run.attempt_id
  FROM public.scp_report_snapshots s
  JOIN runs run ON run.attempt_id = s.attempt_id;
GRANT SELECT ON briefs TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP RB1 — the brief exists and is audience-shaped'; END $$;

-- =========================================================================
-- Group RB1 — structure
-- =========================================================================

SELECT pg_temp.ok((SELECT count(*) FROM briefs) = 6,
  'RB1.1 three candidates produce six snapshots, one per audience each');

SELECT pg_temp.ok(
  (SELECT bool_and(brief IS NOT NULL) FROM briefs),
  'RB1.2 every snapshot carries a frozen brief');

SELECT pg_temp.ok(
  (SELECT bool_and(brief->>'brief_version' = 'rab-v1'
                   AND brief->>'signal_version' = 'ras-v1') FROM briefs),
  'RB1.3 and records which derivation produced it');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(brief->'modules') = 5) FROM briefs),
  'RB1.4 all five modules appear on both audiences'' briefs');

SELECT pg_temp.ok(
  (SELECT bool_and((m->>'answered')::int = (m->>'items')::int)
     FROM briefs, jsonb_array_elements(brief->'modules') m),
  'RB1.5 every module was completed by every candidate');

-- The employer brief is a superset; the participant brief is a SUBSET, not a
-- softened rewrite. Asserted as an absence in one direction.
SELECT pg_temp.ok(
  (SELECT bool_and(brief ? 'interview_guide') FROM briefs WHERE audience = 'employer'),
  'RB1.6 the employer brief carries the interview guide');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (brief ? 'interview_guide')) FROM briefs WHERE audience = 'participant'),
  'RB1.7 the participant brief carries NO interview guide — those are the recruiter''s working notes');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (brief ? 'observed')) FROM briefs WHERE audience = 'participant'),
  'RB1.8 and no employer-facing strength/development framing');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (s ? 'mean') AND NOT (s ? 'spread') AND NOT (s ? 'why_sv'))
     FROM briefs, jsonb_array_elements(brief->'self_reported') s
    WHERE audience = 'participant'),
  'RB1.9 the participant sees WHAT they described, not the numbers behind it');

DO $$ BEGIN RAISE NOTICE 'GROUP RB2 — Persona A: strong answers, described strongly'; END $$;

-- =========================================================================
-- Group RB2 — Persona A
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'A' AND audience = 'employer'
      AND o->>'signal' IN ('strong','consistent')) >= 3,
  'RB2.1 A''s brief shows at least three areas of strong or consistent observed evidence');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(brief->'interview_guide') FROM briefs
    WHERE persona = 'A' AND audience = 'employer') >= 4,
  'RB2.2 and at least four personalised interview questions');

-- The brief is confident where the evidence supports it. It is never a verdict.
SELECT pg_temp.ok(
  (SELECT count(*) FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'A' AND audience = 'employer' AND o->>'signal' = 'limited') >= 1,
  'RB2.3 and still says plainly where there was too little evidence to speak');

-- Every reason is specific to what this candidate did: it names a count.
SELECT pg_temp.ok(
  (SELECT bool_and(o->>'why_sv' ~ '[0-9]' AND o->>'why_en' ~ '[0-9]')
     FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE audience = 'employer'),
  'RB2.4 every observed reason cites how many tasks it rests on, in both languages');

SELECT pg_temp.ok(
  (SELECT bool_and(g->>'question_sv' <> '' AND g->>'question_en' <> ''
                   AND jsonb_array_length(g->'listen_for_sv') >= 3
                   AND jsonb_array_length(g->'listen_for_en') >= 3)
     FROM briefs, jsonb_array_elements(brief->'interview_guide') g
    WHERE audience = 'employer'),
  'RB2.5 every guide entry is bilingual and says what to listen for');

SELECT pg_temp.ok(
  (SELECT bool_and(g->>'why_sv' <> '' AND g->>'why_en' <> '')
     FROM briefs, jsonb_array_elements(brief->'interview_guide') g
    WHERE audience = 'employer'),
  'RB2.6 and every entry says WHY it was selected — the guide is never a generic list');

DO $$ BEGIN RAISE NOTICE 'GROUP RB3 — Persona B: uneven where things compete, inconsistent about shortcuts'; END $$;

-- =========================================================================
-- Group RB3 — Persona B
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT o->>'signal' FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'B' AND audience = 'employer' AND o->>'area_code' = 'SCC-11')
    IN ('mixed','developing'),
  'RB3.1 B''s uneven answers on professional judgement do not read as a strength');

SELECT pg_temp.ok(
  (SELECT o->>'signal' FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'B' AND audience = 'employer' AND o->>'area_code' = 'SCC-06') = 'strong',
  'RB3.2 while communication, answered consistently well, does');

-- The §12 consistency signal, produced by B answering related questions about
-- the same habit at opposite ends.
SELECT pg_temp.ok(
  (SELECT count(*) FROM briefs, jsonb_array_elements(brief->'self_reported') s
    WHERE persona = 'B' AND audience = 'employer' AND s->>'consistency' = 'varied') >= 1,
  'RB3.3 B''s inconsistent self-description surfaces as a "varied" signal');

SELECT pg_temp.ok(
  (SELECT bool_and(s->>'why_sv' NOT ILIKE '%oärlig%' AND s->>'why_sv' NOT ILIKE '%lög%'
                   AND s->>'why_en' NOT ILIKE '%dishonest%' AND s->>'why_en' NOT ILIKE '%decept%'
                   AND s->>'why_en' NOT ILIKE '%lying%')
     FROM briefs, jsonb_array_elements(brief->'self_reported') s
    WHERE audience = 'employer'),
  'RB3.4 and never as deception, dishonesty or lying — only as something to ask about');

SELECT pg_temp.ok(
  (SELECT count(*) FROM briefs, jsonb_array_elements(brief->'interview_guide') g
    WHERE persona = 'B' AND audience = 'employer'
      AND g->>'focus' = 'explore_development') >= 1,
  'RB3.5 B''s interview guide leads with what to explore, not with what to praise');

DO $$ BEGIN RAISE NOTICE 'GROUP RB4 — Persona C: the case the product exists to get right'; END $$;

-- =========================================================================
-- Group RB4 — Persona C. Says exactly what A says; did not do what A did.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(s->>'pattern' = 'consistently_described')
     FROM briefs, jsonb_array_elements(brief->'self_reported') s
    WHERE persona = 'C' AND audience = 'employer'),
  'RB4.1 C describes their own way of working exactly as strongly as A does');

SELECT pg_temp.ok(
  (SELECT bool_and(o->>'signal' IN ('developing','limited','mixed'))
     FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'C' AND audience = 'employer'),
  'RB4.2 and NOT ONE observed area reads as a strength');

-- Stated as an equality between two candidates, because that is the actual
-- claim: identical self-description, different observed evidence, and the brief
-- keeps them apart.
SELECT pg_temp.ok(
  (SELECT (SELECT jsonb_agg(s->>'pattern' ORDER BY s->>'domain_key')
             FROM jsonb_array_elements(a.brief->'self_reported') s)
        = (SELECT jsonb_agg(s->>'pattern' ORDER BY s->>'domain_key')
             FROM jsonb_array_elements(c.brief->'self_reported') s)
     FROM briefs a, briefs c
    WHERE a.persona='A' AND a.audience='employer'
      AND c.persona='C' AND c.audience='employer'),
  'RB4.3 A and C''s self-reported sections are identical...');

SELECT pg_temp.ok(
  (SELECT (SELECT jsonb_agg(o->>'signal' ORDER BY o->>'area_code')
             FROM jsonb_array_elements(a.brief->'observed') o)
       <> (SELECT jsonb_agg(o->>'signal' ORDER BY o->>'area_code')
             FROM jsonb_array_elements(c.brief->'observed') o)
     FROM briefs a, briefs c
    WHERE a.persona='A' AND a.audience='employer'
      AND c.persona='C' AND c.audience='employer'),
  'RB4.4 ...and their observed sections are not. "I say I do this" never became "I demonstrated this"');

-- The structural half. Twenty-six observed items exist and twenty-four
-- self-report items exist; the observed lines must account for exactly the
-- twenty-six.
SELECT pg_temp.ok(
  (SELECT sum((o->>'items')::int) FROM briefs, jsonb_array_elements(brief->'observed') o
    WHERE persona = 'C' AND audience = 'employer') = 26,
  'RB4.5 the observed section counts exactly the 26 observed items — no self-report leaked in');

SELECT pg_temp.ok(
  (SELECT sum((s->>'items')::int) FROM briefs, jsonb_array_elements(brief->'self_reported') s
    WHERE persona = 'C' AND audience = 'employer') = 24,
  'RB4.6 and the self-reported section accounts for exactly the 24 self-report items');

SELECT pg_temp.ok(
  (SELECT sum((x->>'observations')::int) FROM briefs, jsonb_array_elements(payload) x
    WHERE persona = 'C' AND audience = 'employer') = 26,
  'RB4.7 the competency payload counts observations the same way the brief does');

-- And in the ledger itself, which is where a future reader will look.
SELECT pg_temp.ok(
  (SELECT count(DISTINCT e.source_type)
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona='C')) = 2,
  'RB4.8 the evidence ledger carries two distinct source types for one attempt');

SELECT pg_temp.ok(
  (SELECT NOT counts_toward_maturity FROM public.scp_evidence_source_types
    WHERE code = 'self_report'),
  'RB4.9 and self_report is excluded from measured competence by registry rule, not by wording');

SELECT pg_temp.ok(
  (SELECT bool_and(g->>'focus' <> 'confirm_strength')
     FROM briefs, jsonb_array_elements(brief->'interview_guide') g
    WHERE persona = 'C' AND audience = 'employer'),
  'RB4.10 C''s guide contains no "confirm this strength" question, because there is no observed strength to confirm');

DO $$ BEGIN RAISE NOTICE 'GROUP RB5 — the vocabulary the product refuses'; END $$;

-- =========================================================================
-- Group RB5 — what may never appear, in either language, in any brief
-- =========================================================================

DO $$
DECLARE _bad text; _hit int;
BEGIN
  FOREACH _bad IN ARRAY ARRAY[
    'lämplig','olämplig','rekommenderar anställning','anställ ','avslå','rangordn',
    'poäng av','totalpoäng','godkänd','underkänd','percentil','personlighetstyp',
    'suitable','unsuitable','recommend hiring','hire','reject','ranking',
    'overall score','total score','pass/fail','percentile','personality type',
    'risk score','trust score','integrity score'
  ] LOOP
    SELECT count(*) INTO _hit FROM briefs
     WHERE brief::text ILIKE '%' || _bad || '%';
    IF _hit > 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: RB5.1 — a released brief contains "%"', _bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  RB5.1 no brief contains hire/reject, suitability, ranking, or any total score — in either language';
END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (brief ? 'overall') AND NOT (brief ? 'score')
                   AND NOT (brief ? 'recommendation') AND NOT (brief ? 'decision'))
     FROM briefs),
  'RB5.2 and carries no overall, score, recommendation or decision key at all');

SELECT pg_temp.ok(
  (SELECT bool_and(context->>'governance_mode' = 'closed_test'
                   AND context->>'validation_status' = 'design')
     FROM briefs WHERE audience = 'employer'),
  'RB5.3 every employer brief states, on its face, that it came from unvalidated closed-test content');

DO $$ BEGIN RAISE NOTICE 'GROUP RB6 — interview evidence: recorded, inert, and not the decision'; END $$;

-- =========================================================================
-- Group RB6 — recruiter notes after the interview
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';

DO $$
DECLARE _att uuid; _id uuid;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE persona = 'B';
  _id := public.scp_record_interview_note(_att, 'SCC-11', 'evidence_confirmed',
    'Beskrev två tillfällen där hen valde en mindre ingripande åtgärd och kunde motivera varför.');
  PERFORM public.scp_record_interview_note(_att, 'SCC-09', 'additional_context',
    'Rutinavstegen hänger ihop med ett objekt där instruktionen är motstridig.');
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes
    WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona='B')) = 2,
  'RB6.1 a recruiter can record what the interview actually established');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes(
     (SELECT attempt_id FROM runs WHERE persona='B'))) = 2,
  'RB6.2 and read it back through the governed reader');

RESET ROLE; RESET request.jwt.claim.sub;

-- The property that keeps a conversation from becoming a second scoring pass.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona='B')) = 50,
  'RB6.3 recording interview evidence wrote NOTHING to the competency ledger');

-- Two independent locks, asserted separately because they fail differently and
-- a test that conflated them would pass while one of them was missing.
--
-- First: RLS. There is no INSERT/UPDATE/DELETE policy, so an employer's own
-- statement matches nothing at all -- it does not raise, it simply touches
-- no rows, which is what "the application cannot write this table directly"
-- looks like from inside.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE rb_rls_write AS
WITH u AS (
  UPDATE public.scp_interview_notes SET note = 'omskrivet'
   WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona='B')
  RETURNING 1)
SELECT count(*) AS rows_written FROM u;

SELECT pg_temp.ok((SELECT rows_written FROM rb_rls_write) = 0,
  'RB6.4 an employer cannot rewrite an interview note through the table — RLS grants no write');

RESET ROLE; RESET request.jwt.claim.sub;

-- Second: the trigger, which is what protects the record from anything holding
-- more privilege than the application does. Run as the owning role precisely
-- because that role bypasses RLS: if the guard only existed in a policy, this
-- is where the record would quietly change.
SELECT pg_temp.must_fail($$
  UPDATE public.scp_interview_notes SET note = 'omskrivet'
   WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona='B')$$,
  'SCP_INTERVIEW_NOTE_APPEND_ONLY',
  'RB6.5 and no privilege level can rewrite one — the guard is a trigger, not a policy');

SELECT pg_temp.must_fail($$
  DELETE FROM public.scp_interview_notes
   WHERE attempt_id = (SELECT attempt_id FROM runs WHERE persona='B')$$,
  'SCP_INTERVIEW_NOTE_APPEND_ONLY',
  'RB6.5b nor delete one');

-- A stranger's organisation sees none of it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000012';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes) = 0,
  'RB6.6 another organisation reads no interview note of this one''s');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
    WHERE s.attempt_id IN (SELECT attempt_id FROM runs)) = 0,
  'RB6.7 nor any of its briefs — tenant isolation holds on the snapshot itself');

SELECT pg_temp.must_fail($$
  SELECT public.scp_record_interview_note(
    (SELECT attempt_id FROM runs WHERE persona='B'), 'SCC-11', 'evidence_confirmed', 'x')$$,
  'SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW',
  'RB6.8 and cannot record one against another organisation''s candidate');

RESET ROLE; RESET request.jwt.claim.sub;

-- A candidate reads their own report and nothing else — not the employer's
-- copy of it, and not the interview notes written about them.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-00000000000b';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
    WHERE s.attempt_id IN (SELECT attempt_id FROM runs)) = 1,
  'RB6.9 a candidate sees exactly one snapshot: their own participant report');

SELECT pg_temp.ok(
  (SELECT audience FROM public.scp_report_snapshots s
    WHERE s.attempt_id IN (SELECT attempt_id FROM runs)) = 'participant',
  'RB6.10 and it is the participant one');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes) = 0,
  'RB6.11 and no interview note written about them');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona='A')) = 0,
  'RB6.12 and none of another candidate''s raw answers');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP RB7 — raw answers never reach an employer'; END $$;

-- =========================================================================
-- Group RB7 — the trust boundary the brief must not have widened
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb000000-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r
    WHERE r.attempt_id IN (SELECT attempt_id FROM runs)) = 0,
  'RB7.1 the employer owner cannot read a single raw response');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options) = 0,
  'RB7.2 nor the scoring key');

RESET ROLE; RESET request.jwt.claim.sub;

-- Persona C wrote a distinctive sentence. If any of it reached a brief, the
-- brief is quoting a candidate to their prospective employer.
SELECT pg_temp.ok(
  (SELECT count(*) FROM briefs
    WHERE brief::text ILIKE '%noggrann av mig%'
       OR payload::text ILIKE '%noggrann av mig%') = 0,
  'RB7.3 no brief or payload quotes a word the candidate actually wrote');

DO $$ BEGIN RAISE NOTICE 'GROUP RB8 — cleanup'; END $$;

ROLLBACK;
