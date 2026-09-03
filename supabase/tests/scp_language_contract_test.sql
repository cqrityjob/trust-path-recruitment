-- Assessment language contract — Väktare Recruitment Assessment (PR-V2).
--
-- ── THE DEFECT THIS KEEPS OUT ──────────────────────────────────────────────
--
-- The employer chooses the language when assigning, and it is stored on
-- assessment_assignments.language. The candidate runner never read it: it took
-- the site-wide language toggle, so an English assignment opened in Swedish in
-- a fresh browser -- while scp_release_attempt_report froze the ASSIGNED
-- language into the released report's context. The report therefore stated a
-- language the run had never been delivered in.
--
-- The application fix is in src/lib/security-competency/attempt-language.ts and
-- is asserted by scripts/assessment-language-contract-check.tsx. What only the
-- database can prove is the half underneath it:
--
--   L1  both languages are complete -- an EN run is not a shorter form
--   L2  delivery is identical in identity and order across languages; only
--       the words differ (T4: same item ids, same option ids, same order)
--   L3  nothing about a response records a language, and a fixed set of chosen
--       option ids scores identically whichever language it was read in
--   L4  the candidate can read their own assignment's language -- which is
--       what the runner now does, under the candidate's own RLS
--   L5  an EN assignment releases a report whose context says 'en', and an SV
--       assignment one that says 'sv'
--
-- Everything runs inside one transaction and is rolled back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

-- Every construct dimension at the given level, writing quality at 0.
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
-- Fixture: one guarding company, an owner who assigns, a reviewer who is not
-- the assigner, and two candidates -- one assigned in English, one in Swedish.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE lc AS
SELECT
  'cc000000-0000-0000-0000-000000000001'::uuid AS employer,
  'cc000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'cc000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'cc000000-0000-0000-0000-00000000000e'::uuid AS cand_en,
  'cc000000-0000-0000-0000-00000000000f'::uuid AS cand_sv;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM lc), 'owner@language-contract.test'),
  ((SELECT reviewer_user FROM lc), 'reviewer@language-contract.test'),
  ((SELECT cand_en       FROM lc), 'en@language-contract.test'),
  ((SELECT cand_sv       FROM lc), 'sv@language-contract.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Språkvakt AB', 'sprakvakt-language-contract', 'active' FROM lc;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM lc
UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM lc;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM lc;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM lc;

CREATE TEMP TABLE lcv AS
SELECT av.id AS version_id, av.definition_id,
       (SELECT f.id FROM public.scp_forms f
         WHERE f.assessment_version_id = av.id ORDER BY f.created_at LIMIT 1) AS form_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM lcv),
       'Language contract proof', owner_user, now() + interval '30 days' FROM lc;

GRANT SELECT ON lc, lcv TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L1 -- both languages are complete'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items WHERE form_id = (SELECT form_id FROM lcv)) = 50,
  'L1.1 the form carries 50 items (the count this contract is about)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_texts it
       ON it.item_version_id = fi.item_version_id AND it.language = 'sv-SE'
    WHERE fi.form_id = (SELECT form_id FROM lcv)) = 50,
  'L1.2 all 50 items have sv-SE text');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_texts it
       ON it.item_version_id = fi.item_version_id AND it.language = 'en-GB'
    WHERE fi.form_id = (SELECT form_id FROM lcv)) = 50,
  'L1.3 all 50 items have en-GB text -- an English run is not a shorter form');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_options o ON o.item_version_id = fi.item_version_id
     WHERE fi.form_id = (SELECT form_id FROM lcv)
       AND (NOT EXISTS (SELECT 1 FROM public.scp_item_option_texts ot
                         WHERE ot.item_option_id = o.id AND ot.language = 'sv-SE')
        OR  NOT EXISTS (SELECT 1 FROM public.scp_item_option_texts ot
                         WHERE ot.item_option_id = o.id AND ot.language = 'en-GB'))),
  'L1.4 every option is labelled in both languages -- no option vanishes');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L5 (assign) -- the employer''s choice is stored'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE runs AS
SELECT 'en'::text AS assigned, * FROM public.scp_employer_assign(
  (SELECT employer FROM lc), (SELECT version_id FROM lcv),
  'en@language-contract.test', NULL, 'en', 'recruitment')
UNION ALL
SELECT 'sv', * FROM public.scp_employer_assign(
  (SELECT employer FROM lc), (SELECT version_id FROM lcv),
  'sv@language-contract.test', NULL, 'sv', 'recruitment');

RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON runs TO authenticated;

SELECT pg_temp.ok(
  (SELECT bool_and(aa.language = r.assigned)
     FROM runs r JOIN public.assessment_assignments aa ON aa.id = r.assignment_id),
  'L5.1 each assignment stores exactly the language the employer chose');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L4 -- the candidate can read their own assigned language'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is the read the application now makes: the runner asks for the attempt
-- and its assignment's language under the CANDIDATE's own RLS. If this stops
-- being readable, the runner silently falls back to the site language and the
-- contract quietly breaks -- which is exactly the defect it came from.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-00000000000e';

SELECT pg_temp.ok(
  (SELECT aa.language
     FROM public.scp_attempts a
     JOIN public.assessment_assignments aa ON aa.id = a.assignment_id
    WHERE a.id = (SELECT attempt_id FROM runs WHERE assigned = 'en')) = 'en',
  'L4.1 the EN candidate reads "en" from their own attempt''s assignment');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.assessment_assignments aa
     WHERE aa.id = (SELECT assignment_id FROM runs WHERE assigned = 'sv')),
  'L4.2 and cannot read anybody else''s assignment row');

RESET ROLE; RESET request.jwt.claim.sub;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L2 -- delivery is the same run in two languages'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-00000000000e';

CREATE TEMP TABLE served_sv AS
SELECT * FROM public.scp_get_attempt_items(
  (SELECT attempt_id FROM runs WHERE assigned = 'en'), 'sv-SE');
CREATE TEMP TABLE served_en AS
SELECT * FROM public.scp_get_attempt_items(
  (SELECT attempt_id FROM runs WHERE assigned = 'en'), 'en-GB');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM served_sv) = 50 AND (SELECT count(*) FROM served_en) = 50,
  'L2.1 both languages deliver all 50 items');

SELECT pg_temp.ok(
  (SELECT array_agg(item_version_id ORDER BY display_order) FROM served_sv)
  = (SELECT array_agg(item_version_id ORDER BY display_order) FROM served_en),
  'L2.2 the same item ids in the same order -- one form, two languages');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_sv s JOIN served_en e USING (item_version_id)
     WHERE s.block_key IS DISTINCT FROM e.block_key
        OR s.item_format IS DISTINCT FROM e.item_format
        OR s.is_safety_critical IS DISTINCT FROM e.is_safety_critical),
  'L2.3 section, format and safety-criticality are identical');

-- Option identity AND order. The per-attempt permutation is a function of
-- (seed, item, option) and must not depend on the language: a candidate who
-- switched language mid-run would otherwise see the options move, and the
-- pilot would be reading a different instrument in English.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_sv s JOIN served_en e USING (item_version_id)
     WHERE (SELECT array_agg(x->>'option_id' ORDER BY ord)
              FROM jsonb_array_elements(s.options) WITH ORDINALITY AS t(x, ord))
        IS DISTINCT FROM
           (SELECT array_agg(x->>'option_id' ORDER BY ord)
              FROM jsonb_array_elements(e.options) WITH ORDINALITY AS t(x, ord))),
  'L2.4 the same option ids in the same served order in both languages');

SELECT pg_temp.ok(
  (SELECT count(*) FROM served_sv s JOIN served_en e USING (item_version_id)
    WHERE s.prompt IS DISTINCT FROM e.prompt) >= 45,
  'L2.5 the words really do differ -- this is a translation, not the same text');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_en WHERE prompt IS NULL OR btrim(prompt) = ''),
  'L2.6 no English item is delivered empty');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L3 -- language cannot enter an answer or a score'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'scp_candidate_responses'
                 AND column_name = 'language'),
  'L3.1 a response records no language -- it is an option id and text, nothing else');

SELECT pg_temp.ok(
  (SELECT pg_get_function_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_save_response') NOT ILIKE '%language%',
  'L3.2 and saving one cannot be told a language');

SELECT pg_temp.ok(
  (SELECT pg_get_function_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_submit_attempt') NOT ILIKE '%language%',
  'L3.3 nor can scoring -- scp_submit_attempt takes no language at all');

-- ---------------------------------------------------------------------------
-- The two runs. Both candidates choose the SAME option ids on every item and
-- write the same reflection; one read the form in English, the other in
-- Swedish. If language could reach scoring, the evidence ledgers would differ.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE lcitems AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value ASC, o.display_order LIMIT 1) AS worst_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT form_id FROM lcv);
GRANT SELECT ON lcitems TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-00000000000e';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE assigned = 'en';
  FOR _it IN SELECT * FROM lcitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'I missed a door on the last round. I called the site the same evening, '
        'raised a report against myself and added the door to my own final check.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.best_option, _it.worst_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-00000000000f';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM runs WHERE assigned = 'sv';
  FOR _it IN SELECT * FROM lcitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'I missed a door on the last round. I called the site the same evening, '
        'raised a report against myself and added the door to my own final check.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.best_option, _it.worst_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.best_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(DISTINCT x) FROM (
     SELECT r.assigned,
            array_agg((e.behaviour_version_id, e.contribution, e.confidence,
                       e.is_safety_critical, e.source_type)::text
                      ORDER BY (e.behaviour_version_id, e.contribution, e.confidence,
                                e.is_safety_critical, e.source_type)::text) AS x
       FROM runs r
       JOIN public.scp_candidate_responses cr ON cr.attempt_id = r.attempt_id
       JOIN public.scp_competency_evidence e ON e.source_ref = cr.id
      WHERE e.superseded_by IS NULL
      GROUP BY r.assigned) s) = 1,
  'L3.4 the same chosen option ids produce an identical evidence ledger in either language');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'L5 -- the released report names the delivered language'; END $$;
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS ivid, iv.item_format
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN runs run ON run.attempt_id = r.attempt_id
     WHERE hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_r.id, 'upheld',
      'Read against the rubric. Concrete situation, own action, what changed.',
      CASE WHEN _r.is_safety_critical THEN 'no_concern' ELSE NULL END,
      pg_temp.rubric_levels(_r.ivid, _r.item_format, 3));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000002';
DO $$ DECLARE _r record; BEGIN
  FOR _r IN SELECT attempt_id FROM runs LOOP
    PERFORM public.scp_release_attempt_report(_r.attempt_id);
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
     JOIN runs r ON r.attempt_id = s.attempt_id) >= 4,
  'L5.2 both runs released, with an employer and a participant snapshot each');

SELECT pg_temp.ok(
  (SELECT bool_and(s.context->>'language' = 'en')
     FROM public.scp_report_snapshots s
     JOIN runs r ON r.attempt_id = s.attempt_id
    WHERE r.assigned = 'en'),
  'L5.3 the EN assignment''s report context says "en" -- on BOTH audiences');

SELECT pg_temp.ok(
  (SELECT bool_and(s.context->>'language' = 'sv')
     FROM public.scp_report_snapshots s
     JOIN runs r ON r.attempt_id = s.attempt_id
    WHERE r.assigned = 'sv'),
  'L5.4 and the SV assignment''s says "sv"');

-- The whole point, in one assertion: what the report claims is what the
-- assignment stored, which is what the runner now delivers under.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_report_snapshots s
      JOIN runs r ON r.attempt_id = s.attempt_id
      JOIN public.assessment_assignments aa ON aa.id = r.assignment_id
     WHERE s.context->>'language' IS DISTINCT FROM aa.language),
  'L5.5 no released report names a language other than the one assigned');

-- ── DIAGNOSTIC, gating nothing ─────────────────────────────────────────────
--
-- The English texts of this instrument are recorded as adaptation_pending.
-- Delivery is complete and identical in structure, which is what this suite
-- asserts; psychometric equivalence of the two languages is NOT claimed, and
-- the content-review work that would establish it is still outstanding.
DO $$
DECLARE _pending int;
BEGIN
  SELECT count(*) INTO _pending
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = (SELECT form_id FROM lcv)
     AND EXISTS (SELECT 1 FROM public.scp_item_texts it
                  WHERE it.item_version_id = iv.id AND it.language = 'en-GB'
                    AND it.adaptation_status = 'adaptation_pending');
  RAISE NOTICE '    diag  % of 50 items carry an en-GB text still marked adaptation_pending', _pending;
END $$;

ROLLBACK;
