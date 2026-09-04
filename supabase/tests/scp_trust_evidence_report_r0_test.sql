-- TRUST Evidence Report — PR-R0 characterisation and safety contract.
--
-- ── WHAT THIS SUITE IS ──────────────────────────────────────────────────
--
-- The future "CQrityjob TRUST Evidence Report" will be built ON the existing
-- Candidate Decision Support Report V2 chain (scp_submit_attempt ->
-- scp_competency_evidence -> scp_complete_human_review ->
-- scp_release_attempt_report -> scp_report_snapshots -> rds-v1). Before a
-- single line of that chain changes, this suite pins what it does TODAY, so
-- that PR-R1 (computation manifest) and PR-R2 (audience-safe read paths) can
-- prove they changed exactly what they meant to and nothing else.
--
-- Two kinds of assertion live here and they are labelled differently:
--
--   TRn.m   a CONTRACT -- a property the product depends on and which must
--           keep holding through every later PR.
--   TRn.mX  a PINNED EXPOSURE -- current behaviour that is a known gap
--           (recorded for PR-R2), asserted as it stands so that the PR that
--           closes it has to update this line deliberately, and no earlier
--           PR can close or widen it by accident.
--
-- It runs the real flagship form (security-officer-recruitment-form-a, 50
-- items: 26 observed, 24 self-report) through three candidates who answer
-- IDENTICALLY, and differ only in what the reviewer found:
--
--   P1  every safety-critical answer cleared ('no_concern'), every review upheld
--   P2  the same answers, one 'high' safety finding on one scenario
--   P3  the same answers, one review 'overturned' and released only after the
--       reviews had all closed -- the free-text and release-gate path
--
-- Identical answers are the point: any difference between P1 and P2 is the
-- finding and nothing else, which is what "a safety finding is not a numeric
-- penalty" needs in order to be a proof rather than a sentence.
--
-- Nothing here changes a schema, a score, an item, a competency or a report
-- output. One transaction, ends in ROLLBACK.

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

-- Every construct dimension at the given level, every writing-quality
-- dimension at 0, so a contribution of 1.000 proves style was excluded.
CREATE OR REPLACE FUNCTION pg_temp.rubric_levels(_ivid uuid, _fmt text, _level int)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE _level END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- Everything an audience could read about one released attempt, as one text.
-- plpgsql, because the temp table it reads is created later in the run.
CREATE OR REPLACE FUNCTION pg_temp.snapshot_text(_persona text, _audience text)
RETURNS text LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN (SELECT lower(s.payload::text || ' ' || coalesce(s.brief::text, '') || ' ' ||
                       coalesce(s.context::text, '') || ' ' || s.safety_flags::text)
            FROM snaps s WHERE s.persona = _persona AND s.audience = _audience);
END $fn$;

-- ---------------------------------------------------------------------------
-- Fixture: one guarding company with an owner, an admin, a plain member and an
-- authorised reviewer; three candidates; a second organisation; a stranger.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tr AS
SELECT
  'fc000000-0000-0000-0000-000000000001'::uuid AS employer,
  'fc000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fc000000-0000-0000-0000-000000000003'::uuid AS admin_user,
  'fc000000-0000-0000-0000-000000000004'::uuid AS member_user,
  'fc000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fc000000-0000-0000-0000-00000000000a'::uuid AS p1,
  'fc000000-0000-0000-0000-00000000000b'::uuid AS p2,
  'fc000000-0000-0000-0000-00000000000c'::uuid AS p3,
  'fc000000-0000-0000-0000-000000000011'::uuid AS other_employer,
  'fc000000-0000-0000-0000-000000000012'::uuid AS other_owner,
  'fc000000-0000-0000-0000-000000000013'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM tr), 'owner@trust-r0.test'),
  ((SELECT admin_user    FROM tr), 'admin@trust-r0.test'),
  ((SELECT member_user   FROM tr), 'member@trust-r0.test'),
  ((SELECT reviewer_user FROM tr), 'reviewer@trust-r0.test'),
  ((SELECT p1            FROM tr), 'p1@trust-r0.test'),
  ((SELECT p2            FROM tr), 'p2@trust-r0.test'),
  ((SELECT p3            FROM tr), 'p3@trust-r0.test'),
  ((SELECT other_owner   FROM tr), 'other@trust-r0.test'),
  ((SELECT stranger      FROM tr), 'stranger@trust-r0.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Trust Bevakning AB', 'trust-r0', 'active' FROM tr
UNION ALL
SELECT other_employer, 'Annan Bevakning AB', 'annan-trust-r0', 'active' FROM tr;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user,    'owner',  'active' FROM tr UNION ALL
SELECT employer, admin_user,    'admin',  'active' FROM tr UNION ALL
SELECT employer, member_user,   'member', 'active' FROM tr UNION ALL
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
       'TRUST evidence report R0 characterisation', owner_user,
       now() + interval '30 days' FROM tr;

GRANT SELECT ON tr, trv TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE runs AS
SELECT 'P1'::text AS persona, * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p1@trust-r0.test', NULL, 'sv', 'recruitment')
UNION ALL
SELECT 'P2', * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p2@trust-r0.test', NULL, 'sv', 'recruitment')
UNION ALL
SELECT 'P3', * FROM public.scp_employer_assign(
  (SELECT employer FROM tr), (SELECT version_id FROM trv),
  'p3@trust-r0.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON runs TO authenticated;

-- The answer key, resolved once as the owning role (the bank is author-only
-- under RLS, which is correct and asserted elsewhere).
CREATE TEMP TABLE items AS
SELECT fi.display_order, fi.block_key, i.slug,
       iv.id AS ivid, iv.item_format, iv.evidence_source_type, iv.is_safety_critical,
       iv.primary_behaviour_id,
       c.code AS competency_code, f.slug AS facet_slug,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
  JOIN public.scp_competencies c ON c.id = iv.competency_id
  LEFT JOIN public.scp_competency_facets f ON f.id = iv.facet_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM runs WHERE persona = 'P1'));
GRANT SELECT ON items TO authenticated;

-- One safety-critical scenario the reviewer will flag on P2, and one
-- constructed response the reviewer will overturn on P3.
CREATE TEMP TABLE flagged AS
SELECT ivid, slug, competency_code, primary_behaviour_id
  FROM items WHERE is_safety_critical ORDER BY display_order LIMIT 1;
CREATE TEMP TABLE overturned AS
SELECT ivid, slug, competency_code, primary_behaviour_id
  FROM items WHERE item_format = 'constructed_response' ORDER BY display_order LIMIT 1;
GRANT SELECT ON flagged, overturned TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP TR0 — the instrument this suite characterises'; END $$;

-- =========================================================================
-- Group TR0 — the form is the one the contracts below are stated about
-- =========================================================================

SELECT pg_temp.ok((SELECT count(*) FROM items) = 50,
  'TR0.1 the flagship form carries 50 items');

SELECT pg_temp.ok(
  (SELECT count(*) FILTER (WHERE evidence_source_type = 'assessment_response') = 26
      AND count(*) FILTER (WHERE evidence_source_type = 'self_report') = 24
     FROM items),
  'TR0.2 26 observed items and 24 self-report items, declared on the item version');

SELECT pg_temp.ok(
  (SELECT count(*) FROM items
    WHERE competency_code = 'SCC-08' AND evidence_source_type = 'assessment_response') = 1
  AND (SELECT count(*) FROM items WHERE competency_code = 'SCC-08') = 1,
  'TR0.3 SCC-08 has exactly one observed item and no self-report item on this form');

SELECT pg_temp.ok(
  (SELECT count(*) FROM items
    WHERE slug IN ('so-rj-c07','so-rj-c19')
      AND evidence_source_type = 'self_report' AND item_format = 'biq_frequency') = 2,
  'TR0.4 c07 and c19 are self-report frequency items');

SELECT pg_temp.ok(
  (SELECT NOT counts_toward_maturity FROM public.scp_evidence_source_types WHERE code = 'self_report')
  AND (SELECT counts_toward_maturity FROM public.scp_evidence_source_types WHERE code = 'assessment_response'),
  'TR0.5 the registry says self_report never counts toward maturity and assessment_response does');

SELECT pg_temp.ok(
  (SELECT min(min_observations) FROM public.scp_maturity_thresholds
    WHERE is_active AND level = 'developing_evidence') >= 2
  AND (SELECT min(min_contexts) FROM public.scp_maturity_thresholds
        WHERE is_active AND level = 'consistent_evidence') >= 2,
  'TR0.6 thresholds v1: developing needs two observations, consistent needs two contexts');

-- ---------------------------------------------------------------------------
-- All three candidates answer identically: the best option everywhere, and
-- the same free text (with a token this suite can search for).
-- ---------------------------------------------------------------------------
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

DO $$ BEGIN RAISE NOTICE 'GROUP TR1 — evidence channels at submission'; END $$;

-- =========================================================================
-- Group TR1 — what submission writes, per channel
-- =========================================================================

-- 26 observed items: 3 safety-critical scenarios + 4 constructed responses go
-- to a person; 19 are scored deterministically. 24 self-report items are
-- recorded deterministically. Nothing else.
SELECT pg_temp.ok(
  (SELECT bool_and(n_obs = 19 AND n_self = 24) FROM (
     SELECT run.persona,
            count(*) FILTER (WHERE e.source_type = 'assessment_response') AS n_obs,
            count(*) FILTER (WHERE e.source_type = 'self_report')         AS n_self
       FROM public.scp_competency_evidence e
       JOIN public.scp_candidate_responses r ON r.id = e.source_ref
       JOIN runs run ON run.attempt_id = r.attempt_id
      GROUP BY run.persona) x),
  'TR1.1 submission writes 19 observed and 24 self-report evidence rows per candidate, all deterministic');

SELECT pg_temp.ok(
  (SELECT bool_and(n = 7) FROM (
     SELECT run.persona, count(*) AS n
       FROM public.scp_human_reviews hr
       JOIN public.scp_candidate_responses r ON r.id = hr.response_id
       JOIN runs run ON run.attempt_id = r.attempt_id
      WHERE hr.review_status = 'pending'
      GROUP BY run.persona) x),
  'TR1.2 seven responses per candidate wait for a person: three safety-critical scenarios and four free texts');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_competency_evidence e
      JOIN public.scp_candidate_responses r ON r.id = e.source_ref
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id IN (SELECT attempt_id FROM runs)
       AND (iv.item_format = 'constructed_response' OR iv.is_safety_critical)),
  'TR1.3 no free text and no safety-critical answer becomes evidence without a person');

SELECT pg_temp.ok(
  (SELECT bool_and(e.source_type = iv.evidence_source_type)
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id IN (SELECT attempt_id FROM runs)),
  'TR1.4 every evidence row carries the source type the ITEM declared, never a format lookup');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE r.attempt_id IN (SELECT attempt_id FROM runs)
      AND i.slug IN ('so-rj-c07','so-rj-c19')
      AND e.source_type = 'self_report') = 6,
  'TR1.5 c07 and c19 land in the ledger as self_report for every candidate');

SELECT pg_temp.ok(
  (SELECT bool_and(a.status = 'submitted' AND a.scored_at IS NULL AND a.released_at IS NULL)
     FROM public.scp_attempts a WHERE a.id IN (SELECT attempt_id FROM runs)),
  'TR1.6 an attempt with reviews outstanding is submitted, not scored, not released');

DO $$ BEGIN RAISE NOTICE 'GROUP TR2 — the human release gate holds before review'; END $$;

-- =========================================================================
-- Group TR2 — nothing can be released over an unreviewed response
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P3')),
  'SCP_RELEASE_BEFORE_SCORED',
  'TR2.1 the owner cannot release while mandatory human review is pending');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id IN (SELECT attempt_id FROM runs)) = 0,
  'TR2.2 no snapshot exists before release');

-- ---------------------------------------------------------------------------
-- Review. P1: everything cleared and upheld. P2: identical, except one 'high'
-- finding on the first safety-critical scenario. P3: identical to P1, except
-- one constructed response is overturned.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000006';
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
       AND NOT (run.persona = 'P3' AND iv.id = (SELECT ivid FROM overturned))
  LOOP
    PERFORM public.scp_complete_human_review(_r.id, 'upheld',
      'Läst mot rubriken. Konkret situation, egen åtgärd och vad som ändrades.',
      CASE WHEN NOT _r.is_safety_critical THEN NULL
           WHEN _r.persona = 'P2' AND _r.ivid = (SELECT ivid FROM flagged) THEN 'high'
           ELSE 'no_concern' END,
      pg_temp.rubric_levels(_r.ivid, _r.item_format, 4));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP TR3 — the free-text boundary'; END $$;

-- =========================================================================
-- Group TR3 — free text only becomes evidence through a completed human
-- rubric review, and a disputed reading writes nothing
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT a.status = 'submitted' AND a.scored_at IS NULL
     FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM runs WHERE persona = 'P3')),
  'TR3.1 one pending review keeps P3 unscored, so the release gate still refuses');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_competency_evidence e
      JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3')
       AND r.item_version_id = (SELECT ivid FROM overturned)),
  'TR3.2 the unreviewed free text has no evidence row at all');

SELECT pg_temp.ok(
  (SELECT bool_and(e.provenance_type = 'human_review' AND e.contribution = 1.000
                   AND e.derivation_basis->>'method' = 'governed_rubric_mean')
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P1')
      AND iv.item_format = 'constructed_response'),
  'TR3.3 reviewed free text is evidence with human_review provenance, derived from the rubric mean');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT count(*) FROM public.scp_rubric_dimensions d
       WHERE d.rubric_version_id = (e.derivation_basis->>'rubric_version_id')::uuid
         AND d.assesses_writing_quality) >= 1
     AND (e.derivation_basis->>'contributing_dimensions')::int
         = (SELECT count(*) FROM public.scp_rubric_dimensions d
             WHERE d.rubric_version_id = (e.derivation_basis->>'rubric_version_id')::uuid
               AND NOT d.assesses_writing_quality))
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P1')
      AND iv.item_format = 'constructed_response'),
  'TR3.4 every rubric has a writing-quality dimension and it is excluded from the contribution');

-- Now overturn P3's remaining review.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000006';
DO $$
DECLARE _r record;
BEGIN
  SELECT hr.id, iv.id AS ivid, iv.item_format INTO _r
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE hr.review_status = 'pending'
     AND r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3');
  PERFORM public.scp_complete_human_review(_r.id, 'overturned',
    'Texten svarar inte på frågan; den beskriver en rutin, inte en händelse.',
    NULL, pg_temp.rubric_levels(_r.ivid, _r.item_format, 1));
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_competency_evidence e
      JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3')
       AND r.item_version_id = (SELECT ivid FROM overturned)),
  'TR3.5 an overturned reading writes NO evidence row -- no silent numeric contribution');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_rubric_scores s
     JOIN public.scp_human_reviews hr ON hr.id = s.review_id
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P3')
      AND r.item_version_id = (SELECT ivid FROM overturned)) > 0,
  'TR3.6 but the reviewer''s levels and rationale are preserved on the review, not the ledger');

SELECT pg_temp.ok(
  (SELECT bool_and(a.status = 'scored' AND a.scored_at IS NOT NULL)
     FROM public.scp_attempts a WHERE a.id IN (SELECT attempt_id FROM runs)),
  'TR3.7 the last review closing is what moves every attempt to scored');

DO $$ BEGIN RAISE NOTICE 'GROUP TR4 — human release authority'; END $$;

-- =========================================================================
-- Group TR4 — who may release, and that nothing else can
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'TR4.1 the participant cannot release their own employer report');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'TR4.2 an employer member without owner/admin role cannot release');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000006';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'TR4.3 the authorised reviewer cannot release either -- review and release are different authorities');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000012';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'TR4.4 an owner of another organisation cannot release');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000013';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'TR4.5 an unrelated signed-in account cannot release');
RESET ROLE; RESET request.jwt.claim.sub;

-- No AI, no trigger, no job: exactly one routine writes a snapshot, it is only
-- callable by a signed-in person, and it authorises on auth.uid().
SELECT pg_temp.ok(
  (SELECT array_agg(p.proname ORDER BY p.proname)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%INSERT INTO public.scp_report_snapshots%')
  = ARRAY['scp_release_attempt_report']::name[],
  'TR4.6 scp_release_attempt_report is the ONLY routine that writes a report snapshot');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_release_attempt_report(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.scp_release_attempt_report(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_release_attempt_report(uuid)', 'EXECUTE'),
  'TR4.7 release is executable by a signed-in person only -- neither anon nor the service key');

SELECT pg_temp.ok(
  position('auth.uid()' IN pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure)) > 0
  AND position('SCP_NOT_AUTHORISED_TO_RELEASE' IN pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure)) > 0,
  'TR4.8 and it authorises on the caller''s identity, refusing by name');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.prosrc ILIKE '%scp_release_attempt_report%'),
  'TR4.9 no trigger calls release -- there is no actor-less path to a snapshot');

-- Release P1 and P2 as the owner, P3 as the admin: both allowed roles, so
-- the contract is stated in both directions.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P1'));
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P2'));
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM runs WHERE persona = 'P3'));
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

CREATE TEMP TABLE snaps AS
SELECT run.persona, s.*
  FROM public.scp_report_snapshots s
  JOIN runs run ON run.attempt_id = s.attempt_id;
GRANT SELECT ON snaps TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM snaps) = 6,
  'TR4.10 owner and admin can both release; each release yields one snapshot per audience');

DO $$ BEGIN RAISE NOTICE 'GROUP TR5 — self-report is never observed evidence'; END $$;

-- =========================================================================
-- Group TR5 — the self-report separation, in the ledger and in the report
-- =========================================================================

-- Observed line counts equal the observed item count per competency, so the
-- self-report items (24 of them, 3-6 per competency) were not counted.
SELECT pg_temp.ok(
  (SELECT bool_and((x->>'observations')::int = i.n)
     FROM snaps s, jsonb_array_elements(s.payload) x
     JOIN (SELECT competency_code, count(*) AS n FROM items
            WHERE evidence_source_type = 'assessment_response' GROUP BY 1) i
       ON i.competency_code = x->>'competency_code'
    WHERE s.persona = 'P1' AND s.audience = 'employer'),
  'TR5.1 every observed line counts exactly the observed items -- no self-report item is counted');

SELECT pg_temp.ok(
  (SELECT bool_and(x->'source_types' = '["assessment_response"]'::jsonb)
     FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE s.persona = 'P1' AND s.audience = 'employer'),
  'TR5.2 no observed line names self_report among its source types');

SELECT pg_temp.ok(
  (SELECT bool_and(o->>'evidence_type' = 'observed')
     FROM snaps s, jsonb_array_elements(s.brief->'observed') o WHERE s.audience = 'employer')
  AND (SELECT bool_and(r->>'evidence_type' = 'self_reported')
         FROM snaps s, jsonb_array_elements(s.brief->'self_reported') r),
  'TR5.3 the brief stamps every observed area observed and every self-report pattern self_reported');

SELECT pg_temp.ok(
  (SELECT sum((o->>'items')::int) FROM snaps s, jsonb_array_elements(s.brief->'observed') o
    WHERE s.persona = 'P1' AND s.audience = 'employer') = 26
  AND (SELECT sum((r->>'items')::int) FROM snaps s, jsonb_array_elements(s.brief->'self_reported') r
        WHERE s.persona = 'P1' AND s.audience = 'employer') = 24,
  'TR5.4 observed areas account for the 26 observed items and self-report patterns for the 24 self-report items');

SELECT pg_temp.ok(
  (SELECT (brief->'coverage'->>'observed_observations')::int = 26
      AND (brief->'coverage'->>'self_report_observations')::int = 24
     FROM snaps WHERE persona = 'P1' AND audience = 'employer'),
  'TR5.5 coverage counts observed and self-report separately');

-- Maturity is computed over counting sources only. Adding self-report to a
-- competency changes nothing -- asserted on the real attempt with the real
-- functions, not on a synthetic subject.
SELECT pg_temp.ok(
  (SELECT bool_and(
     public.scp_attempt_maturity(s.attempt_id, cv.id, 'v1', now())
     = (SELECT d->>'maturity_level' FROM jsonb_array_elements(s.derivation_input) d
         WHERE d->>'competency_code' = c.code))
     FROM snaps s
     JOIN runs run ON run.attempt_id = s.attempt_id
     CROSS JOIN public.scp_competencies c
     JOIN public.scp_competency_versions cv ON cv.competency_id = c.id
    WHERE s.persona = 'P1' AND s.audience = 'employer'
      AND c.code IN (SELECT DISTINCT competency_code FROM items)
      AND cv.id IN (SELECT DISTINCT competency_version_id FROM public.scp_behaviour_competency_map)),
  'TR5.6 the frozen derivation input equals a recomputation over counting sources -- self-report moved nothing');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (r ? 'mean') AND NOT (r ? 'spread') AND NOT (r ? 'why_sv'))
     FROM snaps s, jsonb_array_elements(s.brief->'self_reported') r
    WHERE s.audience = 'participant'),
  'TR5.7 the participant sees the pattern of what they said, never the numbers behind it');

SELECT pg_temp.ok(
  (SELECT bool_and(r->>'pattern' IN ('consistently_described','mostly_described','rarely_described','not_described')
               AND r->>'consistency' IN ('consistent','varied'))
     FROM snaps s, jsonb_array_elements(s.brief->'self_reported') r),
  'TR5.8 self-report vocabulary is descriptive only: described / varied, never shown / strong / weak');

-- c07 and c19 specifically. They keep their authored keying (Product Owner
-- decision 2026-09-03, methodologically open) and that keying reaches the
-- ledger as self_report only. There is no `interpretation` field yet; the
-- gap is recorded for PR-R1/R2 in the characterisation document.
SELECT pg_temp.ok(
  (SELECT bool_and(e.source_type = 'self_report' AND e.provenance_type = 'deterministic')
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE r.attempt_id IN (SELECT attempt_id FROM runs)
      AND i.slug IN ('so-rj-c07','so-rj-c19')),
  'TR5.9 c07 and c19 evidence is self_report with deterministic provenance and nothing else');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_competency_evidence e
      JOIN public.scp_evidence_source_types t ON t.code = e.source_type AND t.counts_toward_maturity
      JOIN public.scp_candidate_responses r ON r.id = e.source_ref
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE r.attempt_id IN (SELECT attempt_id FROM runs)
       AND i.slug IN ('so-rj-c07','so-rj-c19')),
  'TR5.10 c07 and c19 are outside every maturity- and signal-counting join');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
     WHERE iv.evidence_source_type = 'self_report'
       AND (iv.is_safety_critical OR iv.requires_human_review
            OR iv.item_format = 'constructed_response')),
  'TR5.11 no self-report item anywhere in the bank is safety-critical, human-reviewed or free text');

DO $$ BEGIN RAISE NOTICE 'GROUP TR6 — SCC-08: one observed item is limited evidence, never a weakness'; END $$;

-- =========================================================================
-- Group TR6 — the SCC-08 limited-evidence contract
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(o->>'signal' = 'limited' AND (o->>'items')::int = 1)
     FROM snaps s, jsonb_array_elements(s.brief->'observed') o
    WHERE s.audience = 'employer' AND o->>'area_code' = 'SCC-08'),
  'TR6.1 SCC-08 reads as limited on every released brief, on exactly one task');

SELECT pg_temp.ok(
  (SELECT bool_and(o->>'evidence_state' = 'follow_up')
     FROM snaps s, jsonb_array_elements(s.brief->'observed') o
    WHERE s.audience = 'employer' AND o->>'area_code' = 'SCC-08')
  AND (SELECT bool_and(x->>'evidence_state' = 'follow_up')
         FROM snaps s, jsonb_array_elements(s.payload) x
        WHERE x->>'competency_code' = 'SCC-08'),
  'TR6.2 SCC-08 is a follow-up on both audiences -- never shown, never not_yet_shown, never critical');

SELECT pg_temp.ok(
  (SELECT bool_and(d->>'maturity_level' = 'limited_evidence')
     FROM snaps s, jsonb_array_elements(s.derivation_input) d
    WHERE d->>'competency_code' = 'SCC-08'),
  'TR6.3 internally, one observation caps SCC-08 at limited_evidence');

SELECT pg_temp.ok(
  (SELECT bool_and(o->>'why_sv' LIKE '%för lite för att säga något%'
               AND o->>'why_en' LIKE '%too few to say anything%')
     FROM snaps s, jsonb_array_elements(s.brief->'observed') o
    WHERE s.audience = 'employer' AND o->>'area_code' = 'SCC-08'),
  'TR6.4 the reason says the assessment touched the area too little -- a fact about the instrument');

SELECT pg_temp.ok(
  (SELECT bool_and(lower(o::text) NOT SIMILAR TO
     '%(svag|weak|risk|brist|deficien|låg poäng|low score|fail|underkän|otillräcklig kompetens)%')
     FROM snaps s, jsonb_array_elements(s.brief->'observed') o
    WHERE s.audience = 'employer' AND o->>'area_code' = 'SCC-08')
  AND (SELECT bool_and(lower(x::text) NOT SIMILAR TO
     '%(svag|weak|risk|brist|deficien|låg poäng|low score|fail|underkän)%')
     FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE x->>'competency_code' = 'SCC-08'),
  'TR6.5 no line about SCC-08 says weak, low, risk, fail or deficient in either language');

SELECT pg_temp.ok(
  (SELECT bool_and(EXISTS (
     SELECT 1 FROM jsonb_array_elements(s.brief->'interview_guide') g
      WHERE g->>'area_code' = 'SCC-08' AND g->>'focus' = 'explore_limited_evidence'
        AND coalesce(g->>'question_sv','') <> '' AND coalesce(g->>'question_en','') <> ''))
     FROM snaps s WHERE s.audience = 'employer'),
  'TR6.6 and the brief requires an interview follow-up on SCC-08 with an authored question in both languages');

SELECT pg_temp.ok(
  (SELECT bool_and(coalesce(x->>'followup_sv','') <> '')
     FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE s.audience = 'employer' AND x->>'competency_code' = 'SCC-08'),
  'TR6.7 the competency line carries its curated follow-up question too');

DO $$ BEGIN RAISE NOTICE 'GROUP TR7 — a safety finding is separate from every number'; END $$;

-- =========================================================================
-- Group TR7 — the safety finding contract, proven on identical answers
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) FROM snaps WHERE persona = 'P1' AND audience = 'employer') = 0
  AND (SELECT jsonb_array_length(safety_flags) FROM snaps WHERE persona = 'P2' AND audience = 'employer') = 1
  AND (SELECT jsonb_array_length(safety_flags) FROM snaps WHERE persona = 'P3' AND audience = 'employer') = 0,
  'TR7.1 only the candidate a reviewer actually flagged carries a safety flag');

SELECT pg_temp.ok(
  (SELECT safety_flags->0->>'finding' = 'high'
      AND safety_flags->0 ? 'behaviour_version_id'
      AND NOT (safety_flags->0 ? 'score') AND NOT (safety_flags->0 ? 'contribution')
     FROM snaps WHERE persona = 'P2' AND audience = 'employer'),
  'TR7.2 the flag is the reviewer''s finding on a behaviour -- it carries no number');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(safety_flags) = 0) FROM snaps WHERE audience = 'participant')
  AND (SELECT context->>'safety_concern_present' = 'true' FROM snaps WHERE persona = 'P2' AND audience = 'participant')
  AND (SELECT context->>'safety_concern_present' = 'false' FROM snaps WHERE persona = 'P1' AND audience = 'participant'),
  'TR7.3 the participant is told a concern exists, never its severity');

-- The proof. Same answers, same governed key, same number -- the finding sits
-- in its own columns and touches neither.
SELECT pg_temp.ok(
  (SELECT p1.contribution = p2.contribution AND p1.confidence = p2.confidence
      AND p1.derivation_basis = p2.derivation_basis
      AND p1.safety_finding = 'no_concern' AND p2.safety_finding = 'high'
      AND p1.safety_severity IS NULL AND p2.safety_severity = 'high'
     FROM (SELECT e.* FROM public.scp_competency_evidence e
             JOIN public.scp_candidate_responses r ON r.id = e.source_ref
            WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P1')
              AND r.item_version_id = (SELECT ivid FROM flagged)) p1,
          (SELECT e.* FROM public.scp_competency_evidence e
             JOIN public.scp_candidate_responses r ON r.id = e.source_ref
            WHERE r.attempt_id = (SELECT attempt_id FROM runs WHERE persona = 'P2')
              AND r.item_version_id = (SELECT ivid FROM flagged)) p2),
  'TR7.4 a high finding leaves the evidence row''s contribution, confidence and basis byte-identical');

SELECT pg_temp.ok(
  (SELECT a.observed = b.observed FROM
     (SELECT jsonb_agg(o - 'evidence_state' ORDER BY o->>'area_code') AS observed
        FROM snaps s, jsonb_array_elements(s.brief->'observed') o
       WHERE s.persona = 'P1' AND s.audience = 'employer') a,
     (SELECT jsonb_agg(o - 'evidence_state' ORDER BY o->>'area_code') AS observed
        FROM snaps s, jsonb_array_elements(s.brief->'observed') o
       WHERE s.persona = 'P2' AND s.audience = 'employer') b),
  'TR7.5 every observed signal, mean and spread is identical with and without the finding');

SELECT pg_temp.ok(
  (SELECT a.d = b.d FROM
     (SELECT derivation_input AS d FROM snaps WHERE persona = 'P1' AND audience = 'employer') a,
     (SELECT derivation_input AS d FROM snaps WHERE persona = 'P2' AND audience = 'employer') b),
  'TR7.6 the frozen maturity derivation is identical too -- on one attempt the finding subtracts nothing');

SELECT pg_temp.ok(
  (SELECT count(*) FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE s.persona = 'P2' AND s.audience = 'employer'
      AND x->>'evidence_state' = 'critical_follow_up') = 1
  AND (SELECT x->>'competency_code' FROM snaps s, jsonb_array_elements(s.payload) x
        WHERE s.persona = 'P2' AND s.audience = 'employer'
          AND x->>'evidence_state' = 'critical_follow_up')
      = (SELECT competency_code FROM flagged)
  AND (SELECT count(*) FROM snaps s, jsonb_array_elements(s.payload) x
        WHERE s.persona = 'P1' AND s.audience = 'employer'
          AND x->>'evidence_state' = 'critical_follow_up') = 0,
  'TR7.7 the finding changes exactly one thing: the flagged competency becomes a critical follow-up');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT (s.context ? 'risk_score') AND NOT (s.context ? 'safety_score')
               AND NOT (s.payload::text ILIKE '%risk_score%'))
     FROM snaps s),
  'TR7.8 there is no risk score, safety score or candidate-level safety figure anywhere');

-- The safety route starts at a human and nowhere else.
SELECT pg_temp.ok(
  (SELECT bool_and(e.provenance_type = 'human_review' AND e.assessor_actor_id IS NOT NULL)
     FROM public.scp_competency_evidence e
    WHERE e.safety_finding IS NOT NULL),
  'TR7.9 every safety finding in the ledger was made by an identified person');

SELECT pg_temp.ok(
  position('safety_finding' IN pg_get_functiondef('public.scp_submit_attempt(uuid)'::regprocedure)) = 0
  AND position('safety_severity' IN pg_get_functiondef('public.scp_submit_attempt(uuid)'::regprocedure)) = 0,
  'TR7.10 the deterministic scorer cannot write a finding or a severity at all');

DO $$ BEGIN RAISE NOTICE 'GROUP TR8 — released snapshots are frozen'; END $$;

-- =========================================================================
-- Group TR8 — immutability and pinning
-- =========================================================================

CREATE TEMP TABLE before_md5 AS
SELECT persona, audience,
       md5(payload::text || coalesce(brief::text,'') || coalesce(context::text,'')
           || safety_flags::text || coalesce(derivation_input::text,'')) AS h,
       report_version_id
  FROM snaps;

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_report_snapshots SET payload = ''[]''::jsonb WHERE attempt_id = %L::uuid',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_SNAPSHOT_IMMUTABLE',
  'TR8.1 a released payload cannot be edited, even by the table owner');

SELECT pg_temp.must_fail(format(
  'DELETE FROM public.scp_report_snapshots WHERE attempt_id = %L::uuid',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_SNAPSHOT_IMMUTABLE',
  'TR8.2 nor deleted');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)',
  (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'SCP_ALREADY_RELEASED',
  'TR8.3 a second release is refused');
RESET ROLE; RESET request.jwt.claim.sub;

-- 1. The source item is edited after release (draft content, so the bank
--    allows it).
UPDATE public.scp_item_texts
   SET prompt = prompt || ' [redigerad efter release]'
 WHERE item_version_id = (SELECT ivid FROM flagged) AND language = 'sv-SE';

-- 2. A newer report template is published for both audiences.
INSERT INTO public.scp_report_versions
  (report_key, version_number, content_status, audience, threshold_version,
   limitations_sv, limitations_en, published_at)
SELECT v.report_key, v.version_number + 100, 'published', v.audience, v.threshold_version,
       v.limitations_sv, v.limitations_en, now()
  FROM public.scp_report_versions v
 WHERE v.id IN (SELECT DISTINCT report_version_id FROM snaps);

-- 3. Later interview evidence is written against the released brief.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT public.scp_record_interview_note(
  (SELECT attempt_id FROM runs WHERE persona = 'P1'), 'SCC-08',
  'evidence_not_confirmed', 'Kunde inte ge ett konkret exempel på överlämning.') AS note_id
  \gset
RESET ROLE; RESET request.jwt.claim.sub;

-- 4. An employer decision is recorded.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT public.scp_record_employer_decision(
  (SELECT attempt_id FROM runs WHERE persona = 'P1'), 'gather_more_evidence',
  'evidence_thin', 'Ett område berördes av en enda uppgift.', 'Praktiskt moment', 'Driftchef', NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT bool_and(b.h = md5(s.payload::text || coalesce(s.brief::text,'') || coalesce(s.context::text,'')
                            || s.safety_flags::text || coalesce(s.derivation_input::text,''))
               AND b.report_version_id = s.report_version_id)
     FROM public.scp_report_snapshots s
     JOIN runs run ON run.attempt_id = s.attempt_id
     JOIN before_md5 b ON b.persona = run.persona AND b.audience = s.audience),
  'TR8.4 an item edit, a newer template, an interview note and a decision leave every snapshot byte-identical');

SELECT pg_temp.ok(
  (SELECT bool_and(s.payload::text NOT ILIKE '%redigerad efter release%'
               AND coalesce(s.brief::text,'') NOT ILIKE '%överlämning.%evidence_not_confirmed%'
               AND s.payload::text NOT ILIKE '%gather_more_evidence%')
     FROM public.scp_report_snapshots s WHERE s.attempt_id IN (SELECT attempt_id FROM runs)),
  'TR8.5 the edited text, the interview note and the decision are not in any snapshot');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes WHERE attempt_id IN (SELECT attempt_id FROM runs)) = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.scp_competency_evidence e
     WHERE e.observed_at > (SELECT min(released_at) FROM snaps)
       AND e.subject_id IN (SELECT subject_id FROM snaps)),
  'TR8.6 the interview note exists on its own table and wrote nothing to the evidence ledger');

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_interview_notes SET outcome = ''evidence_confirmed'' WHERE id = %L::uuid', :'note_id'),
  'SCP_INTERVIEW_NOTE_APPEND_ONLY',
  'TR8.7 the addendum is append-only too');

SELECT pg_temp.ok(
  (SELECT bool_and(a.assessment_version_id IS NOT NULL AND a.form_id IS NOT NULL
               AND a.purpose_version_id IS NOT NULL AND a.scoring_model_version IS NOT NULL
               AND a.option_order_seed IS NOT NULL
               AND a.content_status_at_assignment IS NOT NULL
               AND a.validation_status_at_assignment IS NOT NULL)
     FROM public.scp_attempts a WHERE a.id IN (SELECT attempt_id FROM runs)),
  'TR8.8 the attempt pins assessment version, form, purpose version, scoring model, option seed and governance of the day');

SELECT pg_temp.ok(
  (SELECT bool_and(s.threshold_version = 'v1' AND s.evidence_state_version = 'des-v2'
               AND s.evidence_scope_version = 'attempt-v1' AND s.scoring_model_version = 'det-v1'
               AND s.brief->>'brief_version' = 'rab-v1' AND s.brief->>'signal_version' = 'ras-v1'
               AND s.report_version_id IS NOT NULL)
     FROM snaps s),
  'TR8.9 every snapshot names its threshold, state, scope, scoring, brief and signal derivation versions and its template row');

-- Form items pin item VERSIONS, so a later item version cannot reach a
-- released attempt through the form.
SELECT pg_temp.ok(
  (SELECT bool_and(fi.item_version_id IS NOT NULL)
     FROM public.scp_form_items fi
    WHERE fi.form_id = (SELECT form_id FROM public.scp_attempts
                         WHERE id = (SELECT attempt_id FROM runs WHERE persona = 'P1'))),
  'TR8.10 the form pins item versions, not items');

SELECT pg_temp.ok(
  (SELECT bool_and(s.context->>'report_key' = v.report_key
               AND (s.context->>'report_version')::int = v.version_number)
     FROM snaps s JOIN public.scp_report_versions v ON v.id = s.report_version_id),
  'TR8.11 the context names the exact template row the snapshot was rendered under');

DO $$ BEGIN RAISE NOTICE 'GROUP TR9 — the vocabulary neither audience can ever receive'; END $$;

-- =========================================================================
-- Group TR9 — forbidden claims, as keys and as prose, in both languages
-- =========================================================================

-- Keys. A key is a promise about what the field means, so these are checked
-- as exact key names anywhere in the four JSON columns.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM snaps s,
      unnest(ARRAY['total_score','overall_score','score','points','percentile','percentage',
                   'rank','ranking','benchmark','norm_group','match','match_percent','fit',
                   'job_fit','suitability','suitable','pass','fail','pass_fail','hire',
                   'reject','recommendation','recommended','verdict','decision','risk_score',
                   'safety_score','safety_risk','index','candidate_index','potential',
                   'personality','trait','radar','profile_percent','traffic_light',
                   'weighted_score','composite','grade','band','level_label']) k
     WHERE (s.payload::text || coalesce(s.brief::text,'') || coalesce(s.context::text,'')
            || s.safety_flags::text) ~ ('"' || k || '":')),
  'TR9.1 no snapshot carries a score, total, percentile, rank, benchmark, match, fit, suitability, pass/fail, hire/reject, risk-score, index, potential, personality, radar or grade KEY');

-- Prose. Substrings a human would read as a verdict. Negations the product is
-- SUPPOSED to say ("inte ett anställningsbeslut", "inte ... en svaghet") are
-- allowed and asserted separately below.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM snaps s,
      unnest(ARRAY[
        -- Swedish
        'bör anställas','rekommenderar anställning','rekommenderas för anställning','anställningsbar',
        'bör inte anställas','avslå kandidaten','avslås','olämplig','lämplig för','lämplighet',
        'rangordn','percentil','totalpoäng','sammanlagd poäng','slutpoäng','viktad poäng',
        'godkänd','underkänd','godkänt/underkänt','riskpoäng','riskprofil','säkerhetsrisk',
        'personlighet','matchning','matchprocent','jobbmatch','normgrupp','jämförelsegrupp',
        'bland de bästa','topp 3','topp 5','topp 10','spindeldiagram','radardiagram','svag kompetens','svagt område',
        'låg poäng','brist på kompetens','förutsäg','arbetsprestation',
        -- English
        'should be hired','recommend hiring','recommended for hire','hireable','should not be hired',
        'reject the candidate','rejected','unsuitable','suitable for','suitability',
        'ranked','ranking','percentile','total score','overall score','final score','weighted score',
        'passed','failed','pass/fail','risk score','risk profile','security risk',
        'personality','match percentage','job fit','fit score','norm group','comparison group',
        'top candidate','top 3','top 5','top 10','top-ranked','radar chart','spider chart','weak competency','weak area',
        'low score','lacks competence','predict','job performance','bias-free','unbiased'
      ]) w
     WHERE pg_temp.snapshot_text(s.persona, s.audience) LIKE '%' || w || '%'),
  'TR9.2 no snapshot prose states a hire/reject, suitability, rank, percentile, total, pass/fail, risk-score, personality, match, prediction or bias-free claim in either language');

-- The one place an employment word may appear is a sentence denying the claim.
SELECT pg_temp.ok(
  (SELECT bool_and(
     s.brief->'executive_summary'->>'sv' LIKE '%inte ett anställningsbeslut%'
     OR s.brief->'executive_summary'->>'sv' NOT LIKE '%anställ%')
     FROM snaps s WHERE s.audience = 'employer'),
  'TR9.3 where the summary mentions employment at all, it is to deny that it decides it');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (s.brief->'executive_summary'->>'sv' NOT LIKE '%svag%'
      OR s.brief->'executive_summary'->>'sv' LIKE '%inte ska läsas som en svaghet%')
     AND (s.brief->'executive_summary'->>'en' NOT LIKE '%weak%'
      OR s.brief->'executive_summary'->>'en' LIKE '%should not be read as a weakness%'))
     FROM snaps s WHERE s.audience = 'employer'),
  'TR9.4 where the summary mentions weakness at all, it is to say thin coverage is not one');

SELECT pg_temp.ok(
  (SELECT bool_and(x->>'evidence_state' IN
     ('strongly_shown','shown','follow_up','not_yet_shown','critical_follow_up'))
     FROM snaps s, jsonb_array_elements(s.payload) x)
  AND (SELECT bool_and(o->>'signal' IN ('strong','consistent','mixed','developing','limited'))
         FROM snaps s, jsonb_array_elements(s.brief->'observed') o WHERE s.audience = 'employer'),
  'TR9.5 evidence states and signals come from their closed vocabularies -- there is no other axis');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM snaps s
     WHERE s.brief ? 'total' OR s.brief ? 'overall' OR s.brief ? 'summary_score'
        OR s.context ? 'total' OR s.context ? 'overall'),
  'TR9.6 nothing sums the areas: no brief or context carries an overall figure');

-- The two attempts P1 and P3 differ by one overturned review: no line, no
-- signal and no count may ORDER them against each other.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM snaps s
     WHERE s.context ? 'rank' OR s.context ? 'position' OR s.context ? 'cohort_size'
        OR s.brief ? 'rank' OR s.brief ? 'comparison'),
  'TR9.7 no snapshot places a candidate relative to another');

-- Process vocabulary in the governed tables around the report.
SELECT pg_temp.ok(
  (SELECT pg_get_constraintdef(oid) NOT ILIKE '%hire%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%reject%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%suitab%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%rank%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%shortlist%'
     FROM pg_constraint
    WHERE conrelid = 'public.scp_interview_notes'::regclass AND conname LIKE '%outcome%'),
  'TR9.8 interview note outcomes carry no hire, reject, suitability, rank or shortlist');

SELECT pg_temp.ok(
  (SELECT pg_get_constraintdef(oid) NOT ILIKE '%hire%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%reject%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%shortlist%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%screen%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%rank%'
     FROM pg_constraint
    WHERE conrelid = 'public.scp_employer_report_decisions'::regclass AND conname LIKE '%action%'),
  'TR9.9 employer decision actions carry no hire, reject, shortlist, screen-out or rank');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_interview_guide_prompts p
     WHERE p.content_status = 'published'
       AND lower(p.question_sv || ' ' || p.question_en || ' ' || coalesce(p.followup_sv,'') || ' '
                 || coalesce(p.followup_en,'') || ' ' || array_to_string(p.listen_for_sv,' ') || ' '
                 || array_to_string(p.listen_for_en,' '))
           SIMILAR TO '%(bör anställas|rekommenderar anställning|olämplig|rangordn|percentil|should be hired|recommend hiring|unsuitable|percentile|ranked)%')
  AND NOT EXISTS (
    SELECT 1 FROM public.scp_followup_prompts p
     WHERE p.content_status = 'published'
       AND lower(p.prompt_sv || ' ' || p.prompt_en)
           SIMILAR TO '%(bör anställas|rekommenderar anställning|olämplig|rangordn|percentil|should be hired|recommend hiring|unsuitable|percentile|ranked)%'),
  'TR9.10 the curated follow-up and interview-guide libraries carry no verdict vocabulary');

DO $$ BEGIN RAISE NOTICE 'GROUP TR10 — audience boundaries, as PR-R2A-3 closed them'; END $$;

-- =========================================================================
-- Group TR10 — what each audience can read. Contracts first; the four
-- assertions that PR-R0 pinned as EXPOSURES (TR10.5X / 6X / 10X / 13X) are
-- inverted here on purpose by PR-R2A-3 (20261026090000, CONTRACT) and
-- carry their closed form under the same numbers. An audience reads its
-- document through scp_participant_report / scp_employer_report; the table
-- refuses it.
-- =========================================================================

-- The participant document, read as the participant.
CREATE OR REPLACE FUNCTION pg_temp.par_doc(_persona text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT to_jsonb(p) FROM runs r, LATERAL public.scp_participant_report(r.attempt_id) p
   WHERE r.persona = _persona;
$fn$;
CREATE OR REPLACE FUNCTION pg_temp.emp_doc(_persona text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT to_jsonb(e) FROM runs r, LATERAL public.scp_employer_report(r.attempt_id) e
   WHERE r.persona = _persona;
$fn$;
GRANT EXECUTE ON FUNCTION pg_temp.par_doc(text), pg_temp.emp_doc(text) TO authenticated;

-- The participant.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-00000000000b';

SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 1
  AND pg_temp.par_doc('P2') ->> 'audience' = 'participant'
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0,
  'TR10.1 the participant reads exactly one document: their own participant report, and no employer one');

SELECT pg_temp.ok(
  (SELECT d ->> 'payload' NOT LIKE '%severity%' AND d ->> 'payload' NOT LIKE '%followup_sv%'
      AND d ->> 'payload' NOT LIKE '%reviewer_rationale%'
      AND d -> 'safety_flags' = '[]'::jsonb
      AND NOT (d -> 'context' ? 'scoring_model_version') AND NOT (d -> 'context' ? 'reviews_total')
      AND NOT (d -> 'context' ? 'participant_ref')
      AND NOT (d -> 'brief' ? 'interview_guide') AND NOT (d -> 'brief' ? 'observed')
      AND NOT (d -> 'brief' ? 'executive_summary')
     FROM pg_temp.par_doc('P2') d),
  'TR10.2 the participant document carries no severity, no employer question, no rationale, no guide, no observed signals');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_human_reviews) = 0
  AND (SELECT count(*) FROM public.scp_review_rubric_scores) = 0
  AND (SELECT count(*) FROM public.scp_item_options) = 0,
  'TR10.3 the participant cannot read reviews, rubric levels or the answer key');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses) = 50,
  'TR10.4 the participant can read their own 50 answers (their own words, nothing derived)');

-- R0-X1, closed. The table refuses the participant, and the document the
-- entry point returns has no derivation_input at all -- not a null, not a
-- column.
SELECT pg_temp.must_fail(
  'SELECT derivation_input FROM public.scp_report_snapshots',
  'permission denied',
  'TR10.5 CLOSED (was R0-X1): the participant cannot read derivation_input -- the snapshot table refuses the role outright');
SELECT pg_temp.ok(
  NOT (pg_temp.par_doc('P2') ? 'derivation_input')
  AND pg_temp.par_doc('P2')::text NOT LIKE '%maturity_level%'
  AND pg_temp.par_doc('P2')::text NOT LIKE '%derivation%',
  'TR10.5b and the participant document carries no derivation, no maturity level');

-- R0-X2, closed. The subject's ledger policy is gone: the same 50 rows the
-- participant could read in PR-R0 -- contribution, rubric basis, the
-- reviewer's finding and severity -- are now zero rows.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'TR10.6 CLOSED (was R0-X2): the participant reads none of their 50 evidence rows -- no contribution, no rubric basis, no finding, no severity');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE safety_severity IS NOT NULL OR derivation_basis IS NOT NULL OR contribution IS NOT NULL) = 0,
  'TR10.6b nor a single internal field by any predicate');

RESET ROLE; RESET request.jwt.claim.sub;

-- The employer owner.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 3
  AND (SELECT bool_and(e.audience = 'employer')
         FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e)
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0,
  'TR10.7 the employer reads its three employer documents and no participant one');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence) = 0
  AND (SELECT count(*) FROM public.scp_candidate_responses) = 0
  AND (SELECT count(*) FROM public.scp_human_reviews) = 0
  AND (SELECT count(*) FROM public.scp_review_rubric_scores) = 0
  AND (SELECT count(*) FROM public.scp_item_options) = 0,
  'TR10.8 the employer cannot read the ledger, a raw answer, a review, a rubric level or the answer key');

SELECT pg_temp.ok(
  (SELECT bool_and(d ->> 'payload' NOT LIKE '%reviewer_rationale%'
               AND d ->> 'payload' NOT LIKE '%FRITEXTTOKEN%'
               AND coalesce(d ->> 'brief','') NOT LIKE '%FRITEXTTOKEN%'
               AND d ->> 'payload' NOT LIKE '%score_value%' AND d ->> 'payload' NOT LIKE '%is_preferred%'
               AND coalesce(d ->> 'brief','') NOT LIKE '%score_value%')
     FROM (SELECT pg_temp.emp_doc(persona) AS d FROM runs) x),
  'TR10.9 no employer document quotes a candidate''s words, a reviewer''s reasoning or a scoring key');

-- R0-X3, closed. The table refuses the employer; the employer document has
-- no derivation_input; and its brief carries no mean and no spread on any
-- observed area or self-report pattern. The stored row still has them (PR-R1
-- moves them to the private manifest) -- asserted as the owning role in TR13.
SELECT pg_temp.must_fail(
  'SELECT derivation_input, brief FROM public.scp_report_snapshots',
  'permission denied',
  'TR10.10 CLOSED (was R0-X3): the employer cannot read derivation_input or the stored brief from the table');
SELECT pg_temp.ok(
  (SELECT bool_and(NOT (d ? 'derivation_input')
               AND (SELECT bool_and(NOT (o ? 'mean') AND NOT (o ? 'spread') AND o ? 'signal' AND o ? 'why_sv')
                      FROM jsonb_array_elements(d -> 'brief' -> 'observed') o)
               AND (SELECT bool_and(NOT (r ? 'mean') AND NOT (r ? 'spread') AND r ? 'pattern')
                      FROM jsonb_array_elements(d -> 'brief' -> 'self_reported') r))
     FROM (SELECT pg_temp.emp_doc(persona) AS d FROM runs) x),
  'TR10.10b and the employer document carries no derivation_input and no mean/spread on any area -- signals and why-lines intact');

RESET ROLE; RESET request.jwt.claim.sub;

-- The other organisation and the stranger.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000012';
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0
  AND (SELECT count(*) FROM public.scp_interview_notes) = 0
  AND (SELECT count(*) FROM public.scp_employer_decisions((SELECT attempt_id FROM runs WHERE persona = 'P1'))) = 0,
  'TR10.11 another organisation reads no document, note or decision of this one');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_report_snapshots', 'permission denied',
  'TR10.11b and the table refuses it like everyone else');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000013';
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0
  AND (SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'TR10.12 a stranger reads nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- The exact privilege the audience role holds on the snapshot table: none.
-- PR-R0 pinned the full 17-column SELECT here; PR-R2A withdrew it.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
               WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                 AND grantee IN ('authenticated', 'anon', 'PUBLIC'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
               WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                 AND grantee IN ('authenticated', 'anon', 'PUBLIC'))
  AND has_table_privilege('service_role', 'public.scp_report_snapshots', 'SELECT'),
  'TR10.13 CLOSED: authenticated and anon hold no privilege on any snapshot column -- derivation_input included; the server role keeps its read');

DO $$ BEGIN RAISE NOTICE 'GROUP TR11 — provenance the snapshot freezes today'; END $$;

-- =========================================================================
-- Group TR11 — the current provenance contract, pinned as the PR-R1 baseline
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM (
     SELECT DISTINCT k FROM snaps s, jsonb_object_keys(s.context) k
      WHERE s.audience = 'employer') x)
  = ARRAY['assessment_name_en','assessment_name_sv','assessment_slug','assessment_version',
          'attempt_status','brief_version','content_status','evidence_contexts',
          'evidence_observations','evidence_scope_version','evidence_state_version',
          'governance_mode','language','organisation_name','participant_ref','person_context',
          'purpose_code','report_key','report_version','reviews_completed','reviews_total',
          'safety_concerns','scored_at','scoring_model_version','self_report_observations',
          'signal_version','started_at','submitted_at','threshold_version','validation_status'],
  'TR11.1 the employer context carries exactly these provenance keys today (PR-R1 baseline)');

SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM (
     SELECT DISTINCT k FROM snaps s, jsonb_object_keys(s.context) k
      WHERE s.audience = 'participant') x)
  = ARRAY['assessment_name_en','assessment_name_sv','assessment_version','brief_version',
          'evidence_contexts','evidence_observations','evidence_scope_version','governance_mode',
          'human_review_occurred','language','organisation_name','person_context','purpose_code',
          'report_key','report_version','safety_concern_present','self_report_observations',
          'submitted_at','validation_status'],
  'TR11.2 the participant context carries exactly these keys today (PR-R1 baseline)');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(derivation_input) = 8
               AND (SELECT bool_and(d ? 'competency_code' AND d ? 'maturity_level' AND d ? 'threshold_version'
                                   AND NOT (d ? 'contribution') AND NOT (d ? 'confidence')
                                   AND NOT (d ? 'evidence_ids') AND NOT (d ? 'weighted_sum')
                                   AND NOT (d ? 'denominator'))
                      FROM jsonb_array_elements(derivation_input) d))
     FROM snaps),
  'TR11.3 derivation_input freezes the maturity level per competency and NOTHING per item -- the PR-R1 gap, stated');

-- Inverted deliberately by PR-R1 (20261027090000): the manifest exists, the
-- snapshot links to it by id and hash, and the per-item freeze lives on the
-- private manifest -- never on the audience-readable row. Group TR15 proves
-- the content; this line pins the shape.
SELECT pg_temp.ok(
  EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests')
  AND (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
          AND column_name IN ('manifest_id', 'canonical_sha256') AND is_nullable = 'YES') = 2
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
       AND column_name IN ('calculated_at','calculation_schema_version',
                           'included_evidence','excluded_evidence','rubric_version',
                           'competency_mapping_version','item_versions','body')),
  'TR11.4 CLOSED (PR-R1): the computation manifest exists and the snapshot links to it by nullable id and hash; the per-item freeze is on the manifest, not on the snapshot row');

SELECT pg_temp.ok(
  (SELECT bool_and(e.scoring_model_version = 'det-v1' AND e.source_snapshot_hash IS NULL)
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id IN (SELECT attempt_id FROM runs)),
  'TR11.5 evidence rows name the scoring model and carry no source hash today');

DO $$ BEGIN RAISE NOTICE 'GROUP TR12 — the report is one product, not two'; END $$;

-- =========================================================================
-- Group TR12 — no parallel engine
-- =========================================================================

-- PR-R1 added the manifest builder, which RECORDS the release function's
-- derivation (calling the same signal / maturity / state routines) and
-- raises if its own inputs disagree with them. Two names, pinned; a third
-- would be a parallel engine.
SELECT pg_temp.ok(
  (SELECT array_agg(p.proname ORDER BY p.proname)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'scp_%report%'
      AND p.prosrc ILIKE '%jsonb_build_object%'
      AND p.prosrc ILIKE '%evidence_state%')
  = ARRAY['scp_release_attempt_report', 'scp_report_manifest_computation']::name[],
  'TR12.1 exactly two routines derive an evidence-state payload: the release function and (PR-R1) the manifest builder that records its derivation');

SELECT pg_temp.ok(
  (SELECT p.prosrc LIKE '%scp_attempt_assessment_signal(%'
      AND p.prosrc LIKE '%scp_attempt_maturity(%'
      AND p.prosrc LIKE '%scp_attempt_evidence_state(%'
      AND p.prosrc LIKE '%scp_attempt_self_report_pattern(%'
      AND p.prosrc LIKE '%SCP_MANIFEST_DERIVATION_MISMATCH%'
      AND p.prosrc NOT LIKE '%INSERT INTO%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_report_manifest_computation'),
  'TR12.1b the builder calls the four existing derivation routines, refuses to disagree with them, and writes nothing');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%INSERT INTO public.scp_competency_evidence%')
  = 4
  AND (SELECT array_agg(p.proname ORDER BY p.proname)
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ILIKE '%INSERT INTO public.scp_competency_evidence%')
      = ARRAY['scp_complete_human_review','scp_complete_learning_module',
              'scp_complete_training_programme','scp_submit_attempt']::name[],
  'TR12.2 exactly four routines write the ledger: submit, human review, and the two training writers (non-counting)');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'scp_iv_%'
       AND (p.prosrc ILIKE '%scp_competency_evidence%' OR p.prosrc ILIKE '%scp_report_snapshots%')),
  'TR12.3 Interview Intelligence neither writes the ledger nor the assessment snapshot');

DO $$ BEGIN RAISE NOTICE 'GROUP TR13 — PR-R2A-1 audience read contracts'; END $$;

-- =========================================================================
-- Group TR13 — the audience entry points (20261024090000) return the
-- audience document and nothing else, agree with the row, and are refused to
-- anon and to the wrong tenant. Added by PR-R2A-1. Everything here also holds
-- after PR-R2A-3 withdraws the direct read; nothing here depends on it.
-- =========================================================================

CREATE OR REPLACE FUNCTION pg_temp.par_doc(_persona text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT to_jsonb(p) FROM runs r, LATERAL public.scp_participant_report(r.attempt_id) p
   WHERE r.persona = _persona;
$fn$;
CREATE OR REPLACE FUNCTION pg_temp.emp_doc(_persona text) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT to_jsonb(e) FROM runs r, LATERAL public.scp_employer_report(r.attempt_id) e
   WHERE r.persona = _persona;
$fn$;
GRANT EXECUTE ON FUNCTION pg_temp.par_doc(text), pg_temp.emp_doc(text) TO authenticated;

-- 13.1–13.4  The participant document, field for field, against the row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE par_p2 AS SELECT pg_temp.par_doc('P2') AS d;
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 1
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0,
  'TR13.0 the participant gets exactly one document from the entry points: their own participant report, and no employer one');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM par_p2, jsonb_object_keys(d) k)
  = ARRAY['attempt_id','audience','brief','context','id','limitations_en','limitations_sv',
          'payload','released_at','safety_flags','subject_id'],
  'TR13.1 the participant document has exactly these eleven keys -- no derivation_input, no threshold, no scoring model, no issuer');

SELECT pg_temp.ok(
  (SELECT d -> 'payload' = s.payload AND d -> 'context' = s.context
      AND d ->> 'id' = s.id::text AND d ->> 'subject_id' = s.subject_id::text
      AND (d ->> 'released_at')::timestamptz = s.released_at
      AND d ->> 'audience' = 'participant'
      AND d -> 'safety_flags' = '[]'::jsonb
     FROM par_p2, snaps s WHERE s.persona = 'P2' AND s.audience = 'participant'),
  'TR13.2 payload, context, ids and release time are the row''s own -- the visible participant report is unchanged');

SELECT pg_temp.ok(
  (SELECT d -> 'brief' = s.brief
     FROM par_p2, snaps s WHERE s.persona = 'P2' AND s.audience = 'participant')
  AND (SELECT (d -> 'brief' -> 'self_reported' -> 0) ? 'pattern' FROM par_p2)
  AND (SELECT jsonb_array_length(d -> 'brief' -> 'modules') > 0 FROM par_p2),
  'TR13.3 the participant brief is byte-identical to the stored one (it never carried mean/spread) -- modules, patterns and coverage intact');

SELECT pg_temp.ok(
  (SELECT d -> 'limitations_sv' = to_jsonb(v.limitations_sv) AND d -> 'limitations_en' = to_jsonb(v.limitations_en)
      AND jsonb_array_length(d -> 'limitations_sv') > 0
     FROM par_p2, snaps s JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE s.persona = 'P2' AND s.audience = 'participant'),
  'TR13.4 the template limitations travel with the document, as the joined read carries them');

SELECT pg_temp.ok(
  (SELECT d::text NOT LIKE '%maturity_level%' AND d::text NOT LIKE '%derivation%'
      AND d ->> 'payload' NOT LIKE '%severity%' AND d ->> 'payload' NOT LIKE '%followup_sv%'
      AND NOT (d -> 'context' ? 'participant_ref') AND NOT (d -> 'context' ? 'reviews_total')
      AND NOT (d -> 'brief' ? 'interview_guide') AND NOT (d -> 'brief' ? 'observed')
      AND NOT (d -> 'brief' ? 'executive_summary')
     FROM par_p2),
  'TR13.4b and carries no maturity, no derivation, no severity, no employer question, no guide, no observed signals');

-- 13.5–13.8  The employer document against the row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE emp_docs AS SELECT persona, pg_temp.emp_doc(persona) AS d FROM runs;
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 3
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0,
  'TR13.5 the employer owner gets its three employer documents and no participant one');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT bool_and((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k)
     = ARRAY['attempt_id','audience','brief','context','id','limitations_en','limitations_sv',
             'payload','released_at','safety_flags','subject_id']) FROM emp_docs)
  AND (SELECT bool_and(NOT (d ? 'derivation_input') AND d::text NOT LIKE '%maturity_level%') FROM emp_docs),
  'TR13.5b the employer document has the same eleven keys and no derivation_input');

SELECT pg_temp.ok(
  (SELECT bool_and(e.d -> 'payload' = s.payload AND e.d -> 'context' = s.context
                AND e.d ->> 'id' = s.id::text AND e.d ->> 'subject_id' = s.subject_id::text
                AND e.d ->> 'audience' = 'employer'
                AND e.d -> 'brief' -> 'interview_guide' = s.brief -> 'interview_guide'
                AND e.d -> 'brief' -> 'modules' = s.brief -> 'modules'
                AND e.d -> 'brief' -> 'coverage' = s.brief -> 'coverage'
                AND e.d -> 'brief' -> 'executive_summary' = s.brief -> 'executive_summary'
                AND e.d -> 'brief' -> 'pace' = s.brief -> 'pace'
                AND e.d -> 'brief' ->> 'brief_version' = s.brief ->> 'brief_version'
                AND e.d -> 'brief' ->> 'signal_version' = s.brief ->> 'signal_version')
     FROM emp_docs e JOIN snaps s ON s.persona = e.persona AND s.audience = 'employer'),
  'TR13.6 payload, context, ids, guide, modules, coverage, summary, pace and versions are the row''s own -- the visible employer report is unchanged');

-- Independent strip: the same row, minus mean/spread, computed here and not
-- by the function under test.
SELECT pg_temp.ok(
  (SELECT bool_and(
       e.d -> 'brief' -> 'observed' =
         (SELECT jsonb_agg(o - 'mean' - 'spread' ORDER BY ord)
            FROM jsonb_array_elements(s.brief -> 'observed') WITH ORDINALITY t(o, ord))
   AND e.d -> 'brief' -> 'self_reported' =
         (SELECT jsonb_agg(r - 'mean' - 'spread' ORDER BY ord)
            FROM jsonb_array_elements(s.brief -> 'self_reported') WITH ORDINALITY t(r, ord))
   AND jsonb_array_length(e.d -> 'brief' -> 'observed') = jsonb_array_length(s.brief -> 'observed')
   AND (SELECT bool_and(o ? 'signal' AND o ? 'why_sv' AND NOT (o ? 'mean') AND NOT (o ? 'spread'))
          FROM jsonb_array_elements(e.d -> 'brief' -> 'observed') o))
     FROM emp_docs e JOIN snaps s ON s.persona = e.persona AND s.audience = 'employer'),
  'TR13.7 every observed area and self-report pattern is the row''s own minus exactly mean and spread, in the same order -- signals and why-lines intact');

SELECT pg_temp.ok(
  (SELECT bool_and(o ? 'mean' AND o ? 'spread')
     FROM snaps s, jsonb_array_elements(s.brief -> 'observed') o WHERE s.audience = 'employer'),
  'TR13.8 the stored row still carries mean/spread for the private manifest (PR-R1) -- the read path, not the release, changed');

-- 13.9–13.11  Safety flags: the released finding, no internal id.
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(d -> 'safety_flags') = 1 FROM emp_docs WHERE persona = 'P2')
  AND (SELECT jsonb_array_length(d -> 'safety_flags') = 0 FROM emp_docs WHERE persona = 'P1')
  AND (SELECT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'safety_flags' -> 0) k)
              = ARRAY['finding','observed_at','severity']
         FROM emp_docs WHERE persona = 'P2')
  AND (SELECT d -> 'safety_flags' -> 0 ->> 'severity' = 'high' FROM emp_docs WHERE persona = 'P2'),
  'TR13.9 the employer document carries P2''s one human finding as {finding, severity, observed_at} and nothing for P1');

SELECT pg_temp.ok(
  (SELECT bool_and(d::text NOT LIKE '%behaviour_version_id%') FROM emp_docs)
  AND (SELECT bool_and(f ? 'behaviour_version_id')
         FROM snaps s, jsonb_array_elements(s.safety_flags) f WHERE s.audience = 'employer' AND s.persona = 'P2'),
  'TR13.10 behaviour_version_id stays on the row as traceability and never reaches the employer document (decision: internal)');

SELECT pg_temp.ok(
  (SELECT bool_and(d ->> 'payload' NOT LIKE '%reviewer_rationale%'
               AND d ->> 'payload' NOT LIKE '%FRITEXTTOKEN%'
               AND coalesce(d ->> 'brief','') NOT LIKE '%FRITEXTTOKEN%'
               AND d ->> 'payload' NOT LIKE '%score_value%' AND d ->> 'payload' NOT LIKE '%is_preferred%')
     FROM emp_docs),
  'TR13.11 no employer document quotes a candidate''s words, a reviewer''s reasoning or a scoring key');

-- 13.12  The Interview Intelligence bridge's needs are in the employer document.
SELECT pg_temp.ok(
  (SELECT bool_and(
       (SELECT bool_and(o ? 'area_sv' AND o ? 'area_en' AND o ? 'signal' AND o ? 'behaviour_sv')
          FROM jsonb_array_elements(d -> 'brief' -> 'observed') o)
   AND (SELECT bool_and(g ? 'area_code' AND g ? 'focus' AND g ? 'why_sv' AND g ? 'followup_sv')
          FROM jsonb_array_elements(d -> 'brief' -> 'interview_guide') g)
   AND (d ->> 'released_at') IS NOT NULL)
     FROM emp_docs),
  'TR13.12 the Interview Intelligence bridge finds released_at, observed area/signal/behaviour and the guide follow-ups in the employer document');

-- 13.13–13.14  Posture: definer, pinned, the rule in a function that agrees
-- with the policies it will replace, and no anon reach.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
      AND p.prosecdef AND p.prosrc LIKE '%scp_report_snapshot_readable%'
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) = 2
  AND (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') = 2,
  'TR13.13 both entry points are SECURITY DEFINER, pinned, and evaluate scp_report_snapshot_readable; the two row policies are still in place');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_participant_report(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_employer_report(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_report_snapshot_readable(text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_audience_brief(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.scp_audience_brief(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_participant_report(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_employer_report(uuid)', 'EXECUTE'),
  'TR13.14 anon can execute none of the four; authenticated can execute the two entry points and not the projection helper');

-- 13.15–13.17  Tenant isolation and anon, through the entry points.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000012';
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0,
  'TR13.15 another organisation gets no document from either entry point');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000013';
SELECT pg_temp.ok(
  (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_employer_report(r.attempt_id) e) = 0
  AND (SELECT count(*) FROM runs r CROSS JOIN LATERAL public.scp_participant_report(r.attempt_id) p) = 0,
  'TR13.16 a stranger gets nothing from either');
RESET ROLE; RESET request.jwt.claim.sub;

GRANT SELECT ON runs TO anon;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_participant_report(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'TR13.17 anon cannot execute the participant entry point');
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_employer_report(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'TR13.17b nor the employer one');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP TR14 — PR-R2A-3 negative security: refused, not filtered'; END $$;

-- =========================================================================
-- Group TR14 — after CONTRACT every forbidden path is refused outright.
-- anon and the signed-in owner alike: no table read, no write, no TRUNCATE
-- on the two tables CONTRACT hardens. Added by PR-R2A-3.
-- =========================================================================

-- 14.1–14.4  anon: no document, no table, no write, no TRUNCATE.
GRANT SELECT ON runs TO anon;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_participant_report(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'TR14.1 anon cannot execute the participant entry point');
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_employer_report(%L::uuid)', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'TR14.1b nor the employer one');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'TR14.2 anon cannot read the snapshot table');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_competency_evidence',
  'permission denied', 'TR14.2b nor the ledger');
SELECT pg_temp.must_fail('TRUNCATE public.scp_report_snapshots',
  'permission denied', 'TR14.3 anon cannot TRUNCATE the report snapshots');
SELECT pg_temp.must_fail('TRUNCATE public.scp_competency_evidence',
  'permission denied', 'TR14.3b nor the evidence ledger');
SELECT pg_temp.must_fail('INSERT INTO public.scp_report_snapshots (attempt_id, subject_id, report_version_id, audience, payload) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ''participant'', ''[]''::jsonb)',
  'permission denied', 'TR14.4 anon cannot INSERT a snapshot');
SELECT pg_temp.must_fail('DELETE FROM public.scp_competency_evidence',
  'permission denied', 'TR14.4b nor DELETE from the ledger');
RESET ROLE;

-- 14.5  A signed-in user, even the owner: SELECT only, TRUNCATE refused
-- before any trigger could have a say.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail('TRUNCATE public.scp_report_snapshots',
  'permission denied', 'TR14.5 the employer owner cannot TRUNCATE the snapshots');
SELECT pg_temp.must_fail('TRUNCATE public.scp_competency_evidence',
  'permission denied', 'TR14.5b nor the ledger');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'TR14.5c and cannot SELECT the snapshot table at all -- the entry point is the only path');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
     FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND grantee = 'authenticated'
      AND table_name = 'scp_competency_evidence') = 'SELECT'
  AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                   WHERE table_schema = 'public' AND grantee = 'authenticated'
                     AND table_name = 'scp_report_snapshots')
  AND (SELECT count(*) FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND grantee IN ('anon','PUBLIC')
          AND table_name IN ('scp_report_snapshots','scp_competency_evidence')) = 0,
  'TR14.6 authenticated holds SELECT and only SELECT on the ledger and nothing on the snapshots; anon holds nothing on either');

DO $$ BEGIN RAISE NOTICE 'GROUP TR15 — PR-R1 reproducible provenance'; END $$;

-- =========================================================================
-- Group TR15 — the private computation manifest (20261027090000). One row
-- per release, frozen inside the release transaction; every number the
-- report was derived from, and why each row counted or did not; a canonical
-- hash; no audience reach. Added by PR-R1. The audience assertions above
-- (TR5-TR10, TR13, TR14) all still hold on the same releases, which is the
-- proof that the report itself did not change.
-- =========================================================================

CREATE TEMP TABLE mani AS
SELECT run.persona, m.*
  FROM public.scp_report_computation_manifests m
  JOIN runs run ON run.attempt_id = m.attempt_id;
GRANT SELECT ON mani TO authenticated, anon, service_role;

-- 15.1–15.5  Identity, one instant, versions, templates, who released.
SELECT pg_temp.ok(
  (SELECT count(*) FROM mani) = 3
  AND (SELECT count(DISTINCT attempt_id) FROM mani) = 3
  AND (SELECT bool_and(s.manifest_id = m.id AND s.canonical_sha256 = m.canonical_sha256
                       AND s.id IN (m.participant_snapshot_id, m.employer_snapshot_id))
         FROM snaps s JOIN mani m ON m.attempt_id = s.attempt_id)
  AND (SELECT bool_and(pa.audience = 'participant' AND em.audience = 'employer')
         FROM mani m
         JOIN public.scp_report_snapshots pa ON pa.id = m.participant_snapshot_id
         JOIN public.scp_report_snapshots em ON em.id = m.employer_snapshot_id),
  'TR15.1 every release wrote exactly one manifest; both snapshots point at it and carry its hash; it names the right snapshot per audience');

SELECT pg_temp.ok(
  (SELECT bool_and(m.calculated_at = s.released_at AND m.calculated_at = a.released_at)
     FROM mani m
     JOIN snaps s ON s.attempt_id = m.attempt_id
     JOIN public.scp_attempts a ON a.id = m.attempt_id),
  'TR15.2 one calculated_at per release: the manifest, both snapshots and the attempt carry the same instant');

SELECT pg_temp.ok(
  (SELECT bool_and(calculation_schema_version = 'rcm-v1' AND scoring_model_version = 'det-v1'
               AND signal_model_version = 'ras-v1' AND threshold_version = 'v1'
               AND evidence_state_version = 'des-v2' AND evidence_scope_version = 'attempt-v1'
               AND brief_version = 'rab-v1' AND competency_mapping_version LIKE 'bcm-sha256:%'
               AND body ->> 'schema_version' = 'rcm-v1'
               AND body -> 'versions' ->> 'competency_mapping_version' = competency_mapping_version
               AND body -> 'versions' ->> 'scoring_model_version' = 'det-v1'
               AND body -> 'versions' ->> 'signal_model_version' = 'ras-v1'
               AND body -> 'versions' ->> 'threshold_version' = 'v1'
               AND body -> 'versions' ->> 'evidence_state_version' = 'des-v2'
               AND (body -> 'attempt' ->> 'attempt_id')::uuid = attempt_id
               AND (body -> 'attempt' ->> 'form_id')::uuid IS NOT NULL
               AND (body -> 'attempt' ->> 'assessment_version_id')::uuid IS NOT NULL)
     FROM mani),
  'TR15.3 every version is frozen twice -- as a column and inside the hashed body -- and the body pins the attempt, form and assessment version');

SELECT pg_temp.ok(
  (SELECT bool_and(
       (m.body -> 'versions' -> 'report_template_version' -> 'participant' ->> 'report_version_id')::uuid = pa.report_version_id
   AND (m.body -> 'versions' -> 'report_template_version' -> 'employer' ->> 'report_version_id')::uuid = em.report_version_id
   AND m.participant_report_version_id = pa.report_version_id
   AND m.employer_report_version_id = em.report_version_id
   AND m.body -> 'versions' -> 'report_template_version' -> 'employer' ->> 'report_key' = em.context ->> 'report_key')
     FROM mani m
     JOIN public.scp_report_snapshots pa ON pa.id = m.participant_snapshot_id
     JOIN public.scp_report_snapshots em ON em.id = m.employer_snapshot_id),
  'TR15.4 the template row per audience is pinned by id, key and number, and agrees with the snapshots');

SELECT pg_temp.ok(
  (SELECT bool_and(CASE persona
                     WHEN 'P3' THEN released_by_role = 'admin' AND released_by = (SELECT admin_user FROM tr)
                     ELSE released_by_role = 'owner' AND released_by = (SELECT owner_user FROM tr) END)
     FROM mani),
  'TR15.5 the releasing role and account are frozen: owner for P1/P2, admin for P3');

-- 15.6–15.7  Threshold rows and mapping rows, with their hash.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'computation' -> 'thresholds') = 4
      AND body -> 'computation' -> 'thresholds' = (
            SELECT jsonb_agg(jsonb_build_object(
                     'level', t.level, 'min_mean_contribution', t.min_mean_contribution,
                     'min_observations', t.min_observations, 'min_contexts', t.min_contexts,
                     'min_source_types', t.min_source_types, 'max_age_days', t.max_age_days)
                   ORDER BY t.min_mean_contribution, t.min_observations)
              FROM public.scp_maturity_thresholds t
             WHERE t.threshold_version = 'v1' AND t.is_active))
     FROM mani),
  'TR15.6 the four v1 threshold rows are frozen with their values, not only the version string');

SELECT pg_temp.ok(
  (SELECT bool_and(body -> 'computation' -> 'competency_mapping' ->> 'version'
                     = 'bcm-sha256:' || public.scp_report_manifest_hash(body -> 'computation' -> 'competency_mapping' -> 'rows')
               AND jsonb_array_length(body -> 'computation' -> 'competency_mapping' -> 'rows') >= 8
               AND body -> 'computation' -> 'source_types' @> '[{"code": "self_report", "counts_toward_maturity": false}]'::jsonb
               AND body -> 'computation' -> 'source_types' @> '[{"code": "assessment_response", "counts_toward_maturity": true}]'::jsonb)
     FROM mani),
  'TR15.7 the mapping rows are frozen and their canonical hash is the mapping version; the registry rule that makes self-report non-counting is frozen with them');

-- 15.8–15.13  Every response accounted for; what each row freezes.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'computation' -> 'evidence') = 50) FROM mani)
  AND (SELECT bool_and(n_incl = CASE persona WHEN 'P3' THEN 25 ELSE 26 END
                   AND n_self = 24
                   AND n_disp = CASE persona WHEN 'P3' THEN 1 ELSE 0 END
                   AND n_other = 0)
         FROM (SELECT m.persona,
                      count(*) FILTER (WHERE (e ->> 'included')::boolean) AS n_incl,
                      count(*) FILTER (WHERE e ->> 'exclusion_reason' = 'self_report_non_counting'
                                         AND e ->> 'classification' = 'self_report'
                                         AND NOT (e ->> 'included')::boolean) AS n_self,
                      count(*) FILTER (WHERE e ->> 'exclusion_reason' = 'review_disputed'
                                         AND e -> 'evidence_id' = 'null'::jsonb
                                         AND e ->> 'classification' = 'none') AS n_disp,
                      count(*) FILTER (WHERE NOT (e ->> 'included')::boolean
                                         AND e ->> 'exclusion_reason' NOT IN ('self_report_non_counting', 'review_disputed')) AS n_other
                 FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
                GROUP BY 1) x),
  'TR15.8 every response is accounted for exactly once: 26 included (25 for P3), 24 self-report excluded by reason, and P3''s overturned review listed as review_disputed with no evidence row');

SELECT pg_temp.ok(
  (SELECT bool_and(e ->> 'item_version_id' IS NOT NULL
               AND e ->> 'option_key_version' = e ->> 'item_version_id'
               AND (e ->> 'item_version')::int >= 1
               AND (e ->> 'contribution')::numeric BETWEEN 0 AND 1
               AND (e ->> 'confidence')::numeric = 1.000
               AND e ->> 'classification' = 'observed'
               AND e ->> 'source_type' = 'assessment_response'
               AND e ->> 'competency_code' LIKE 'SCC-%'
               AND e ->> 'competency_mapping_version' = m.competency_mapping_version
               AND e ->> 'provenance_type' IN ('deterministic', 'human_review')
               AND e ->> 'scoring_model_version' IS NOT DISTINCT FROM CASE e ->> 'provenance_type' WHEN 'deterministic' THEN 'det-v1' END
               AND (e ->> 'counted_for_maturity')::boolean)
     FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
    WHERE (e ->> 'included')::boolean),
  'TR15.9 every included row freezes item version, option-key version, contribution, confidence, source type, classification, mapping version and provenance');

SELECT pg_temp.ok(
  (SELECT bool_and(e ->> 'selected_option_key' IS NOT NULL
               AND (e ->> 'selected_score_value')::numeric = (e ->> 'item_max_score')::numeric
               AND (e ->> 'contribution')::numeric = 1.000)
     FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
    WHERE e ->> 'provenance_type' = 'deterministic'),
  'TR15.10 every deterministic row freezes the option key chosen and the score it carried (the fixture chose the best option everywhere, so score = max = contribution 1.000)');

SELECT pg_temp.ok(
  (SELECT bool_and(e ->> 'rubric_version_id' IS NOT NULL
               AND e -> 'derivation_basis' ->> 'method' = 'governed_rubric_mean'
               AND e ->> 'review_id' IS NOT NULL AND e ->> 'review_outcome' = 'upheld')
     FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
    WHERE e ->> 'item_format' = 'constructed_response' AND (e ->> 'included')::boolean)
  AND (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
        WHERE e ->> 'item_format' = 'constructed_response' AND (e ->> 'included')::boolean) = 11,
  'TR15.11 every counted free-text row names its rubric version, its review and the governed rubric-mean method (4 + 4 + 3 across the three candidates)');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'versions' -> 'rubric_versions') = 4
               AND body -> 'versions' -> 'rubric_versions' = body -> 'computation' -> 'rubric_versions')
     FROM mani),
  'TR15.12 the four rubric versions behind the form''s free-text items are frozen as versions -- for P3 too, whose overturned review keeps its rubric');

SELECT pg_temp.ok(
  (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
    WHERE e ->> 'safety_finding' IN ('low', 'medium', 'high', 'critical')) = 1
  AND (SELECT m.persona = 'P2' AND e ->> 'safety_finding' = 'high' AND e ->> 'safety_severity' = 'high'
              AND (e ->> 'included')::boolean AND (e ->> 'contribution')::numeric = 1.000
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
        WHERE e ->> 'safety_finding' IN ('low', 'medium', 'high', 'critical')),
  'TR15.13 the one human safety finding (P2, high) is frozen on its row -- still counted, contribution untouched, never subtracted');

-- 15.14  The finding changes one state and nothing numeric.
SELECT pg_temp.ok(
  (SELECT bool_and(same) FROM (
     SELECT (a1 ->> 'weighted_sum') = (a2 ->> 'weighted_sum')
        AND (a1 ->> 'denominator') = (a2 ->> 'denominator')
        AND (a1 ->> 'spread') = (a2 ->> 'spread')
        AND (a1 ->> 'mean') = (a2 ->> 'mean')
        AND (a1 ->> 'item_count') = (a2 ->> 'item_count')
        AND (a1 ->> 'final_area_signal') = (a2 ->> 'final_area_signal')
        AND (a1 ->> 'maturity_level') = (a2 ->> 'maturity_level') AS same
       FROM mani m1, jsonb_array_elements(m1.body -> 'computation' -> 'areas') a1,
            mani m2, jsonb_array_elements(m2.body -> 'computation' -> 'areas') a2
      WHERE m1.persona = 'P1' AND m2.persona = 'P2'
        AND a1 ->> 'competency_code' = a2 ->> 'competency_code') x)
  AND (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
        WHERE m.persona = 'P2' AND (a ->> 'safety_finding_present')::boolean
          AND a ->> 'evidence_state' = 'critical_follow_up') = 1
  AND (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
        WHERE m.persona = 'P1' AND ((a ->> 'safety_finding_present')::boolean
                                     OR a ->> 'evidence_state' = 'critical_follow_up')) = 0,
  'TR15.14 P1 and P2 freeze identical numbers on every area; the finding changes exactly one area''s state and nothing numeric');

-- 15.15–15.20  Areas: agreement with the released documents, arithmetic,
-- accounting, SCC-08, the disputed review.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'computation' -> 'areas') = 8) FROM mani)
  AND (SELECT bool_and(a ->> 'final_area_signal' = o ->> 'signal'
                   AND (a ->> 'item_count')::int = (o ->> 'items')::int
                   AND (a ->> 'mean')::numeric = (o ->> 'mean')::numeric
                   AND (a ->> 'spread')::numeric = (o ->> 'spread')::numeric
                   AND a ->> 'evidence_state' = o ->> 'evidence_state')
         FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
              jsonb_array_elements(m.body -> 'computation' -> 'areas') a
         JOIN jsonb_array_elements(s.brief -> 'observed') o ON o ->> 'area_code' = a ->> 'competency_code')
  AND (SELECT count(*)
         FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
              jsonb_array_elements(m.body -> 'computation' -> 'areas') a
         JOIN jsonb_array_elements(s.brief -> 'observed') o ON o ->> 'area_code' = a ->> 'competency_code') = 24,
  'TR15.15 every area''s frozen signal, item count, mean, spread and state equal the released employer brief (8 areas x 3 candidates)');

SELECT pg_temp.ok(
  (SELECT bool_and(a ->> 'maturity_level' = d ->> 'maturity_level'
               AND (a ->> 'item_count')::int = (p ->> 'observations')::int
               AND a ->> 'evidence_state' = p ->> 'evidence_state')
     FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
          jsonb_array_elements(m.body -> 'computation' -> 'areas') a
     JOIN jsonb_array_elements(s.derivation_input) d ON d ->> 'competency_code' = a ->> 'competency_code'
     JOIN jsonb_array_elements(s.payload) p ON p ->> 'competency_code' = a ->> 'competency_code'),
  'TR15.16 and its maturity level equals the frozen derivation_input, its count and state the payload line');

SELECT pg_temp.ok(
  (SELECT bool_and(round((a ->> 'weighted_sum')::numeric / (a ->> 'denominator')::numeric, 3) = (a ->> 'mean')::numeric
               AND (a ->> 'item_count')::int = jsonb_array_length(a -> 'evidence_ids')
               AND (a ->> 'denominator')::numeric = (a ->> 'item_count')::numeric
               AND a ->> 'classification_rule' LIKE 'ras-v1: n<3 -> limited;%'
               AND a ->> 'classification_rule' LIKE '%safety cap%'
               AND a ->> 'classification_rule' LIKE '%Self-report never enters an area%'
               AND a ->> 'signal_model_version' = 'ras-v1' AND a ->> 'threshold_version' = 'v1')
     FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a),
  'TR15.17 weighted sum over denominator reproduces every mean (w_i = 1, so the denominator is the count); the evidence ids match the count; the rule names the bands, the safety cap and the self-report boundary');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1
      FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a,
           jsonb_array_elements_text(a -> 'evidence_ids') AS eid(value)
      JOIN LATERAL (SELECT e FROM jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
                     WHERE e ->> 'evidence_id' = eid.value) x ON true
     WHERE NOT (x.e ->> 'included')::boolean OR x.e ->> 'classification' <> 'observed')
  AND (SELECT sum(jsonb_array_length(a -> 'evidence_ids'))
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a) = 26 + 26 + 25,
  'TR15.18 no area counts an evidence id that is not an included observed row, and the areas account for every included row');

SELECT pg_temp.ok(
  (SELECT bool_and((a ->> 'item_count')::int = 1 AND a ->> 'final_area_signal' = 'limited'
               AND a ->> 'maturity_level' = 'limited_evidence' AND a ->> 'evidence_state' = 'follow_up')
     FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
    WHERE a ->> 'competency_code' = 'SCC-08')
  AND (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
        WHERE a ->> 'competency_code' = 'SCC-08') = 3,
  'TR15.19 SCC-08 is frozen as one item, limited, limited_evidence, follow_up -- for every candidate');

SELECT pg_temp.ok(
  (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
    WHERE (a ->> 'disputed_review_present')::boolean) = 1
  AND (SELECT m.persona = 'P3' AND a ->> 'evidence_state' = 'follow_up'
              AND a ->> 'competency_code' = (SELECT competency_code FROM overturned)
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'areas') a
        WHERE (a ->> 'disputed_review_present')::boolean),
  'TR15.20 the overturned review is frozen on its area (P3): disputed, follow_up, no number from it');

-- 15.21–15.22  Reviews frozen; nothing a person wrote is copied.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'computation' -> 'reviews') = 7) FROM mani)
  AND (SELECT bool_and(r ->> 'outcome' IN ('upheld', 'overturned') AND r ->> 'review_status' = 'completed'
                   AND r ->> 'completed_at' IS NOT NULL AND NOT (r ? 'reviewer_rationale'))
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'reviews') r)
  AND (SELECT bool_and(r ->> 'rubric_version_id' IS NOT NULL AND r -> 'rubric_levels' IS NOT NULL)
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'reviews') r
        WHERE r ->> 'trigger_reason' <> 'safety_critical_detected')
  AND (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'reviews') r
        WHERE r ->> 'outcome' = 'overturned') = 1,
  'TR15.21 the seven reviews per candidate are frozen with outcome, rubric version and levels -- the overturned one included');

SELECT pg_temp.ok(
  (SELECT bool_and(body::text NOT ILIKE '%FRITEXTTOKEN%'
               AND body::text NOT ILIKE '%rationale%'
               AND body::text NOT ILIKE '%response_text%'
               AND body::text NOT ILIKE '%@trust-r0.test%')
     FROM mani),
  'TR15.22 the manifest carries no candidate words, no reviewer reasoning and no e-mail address');

-- 15.23–15.24  Self-report frozen apart.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(body -> 'computation' -> 'self_report_areas') = 8) FROM mani)
  AND (SELECT sum((a ->> 'item_count')::int)
         FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'self_report_areas') a) = 72
  AND (SELECT bool_and(a ->> 'classification' = 'self_report'
                   AND a ->> 'pattern' = r ->> 'pattern' AND a ->> 'consistency' = r ->> 'consistency'
                   AND (a ->> 'item_count')::int = (r ->> 'items')::int
                   AND (a ->> 'mean')::numeric = (r ->> 'mean')::numeric
                   AND (a ->> 'spread')::numeric = (r ->> 'spread')::numeric)
         FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
              jsonb_array_elements(m.body -> 'computation' -> 'self_report_areas') a
         JOIN jsonb_array_elements(s.brief -> 'self_reported') r ON r ->> 'domain_key' = a ->> 'facet_slug')
  AND NOT EXISTS (
    SELECT 1 FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'self_report_areas') sa,
                  jsonb_array_elements_text(sa -> 'evidence_ids') sid
     WHERE sid IN (SELECT jsonb_array_elements_text(a -> 'evidence_ids')
                     FROM jsonb_array_elements(m.body -> 'computation' -> 'areas') a)),
  'TR15.23 self-report is frozen apart: eight facets, 24 items per candidate, patterns equal to the brief, classified self_report, and no self-report id in any area');

SELECT pg_temp.ok(
  (SELECT count(*) FROM mani m, jsonb_array_elements(m.body -> 'computation' -> 'evidence') e
    WHERE e ->> 'item_slug' IN ('so-rj-c07', 'so-rj-c19')
      AND e ->> 'classification' = 'self_report' AND NOT (e ->> 'included')::boolean) = 6
  AND NOT EXISTS (SELECT 1 FROM mani
                   WHERE body::text ILIKE '%methodologically_open%' OR body::text ILIKE '%descriptive_only%'
                      OR body::text ILIKE '%deception%' OR body::text ILIKE '%dishonest%'
                      OR body::text ILIKE '%lie%detect%'),
  'TR15.24 c07 and c19 are frozen as self-report rows and nothing else: no interpretation label, no deception reading');

-- 15.25–15.26  The prompt rows behind the guide and the payload lines.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(m.body -> 'prompts' -> 'interview_guide')
                     = jsonb_array_length(s.brief -> 'interview_guide')
               AND jsonb_array_length(m.body -> 'prompts' -> 'interview_guide') > 0)
     FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id)
  AND (SELECT bool_and(EXISTS (SELECT 1 FROM public.scp_interview_guide_prompts p
                                WHERE p.id = (g ->> 'prompt_id')::uuid AND p.content_status = 'published'
                                  AND p.version_number = (g ->> 'prompt_version')::int
                                  AND p.focus = g ->> 'focus'))
         FROM mani m, jsonb_array_elements(m.body -> 'prompts' -> 'interview_guide') g)
  AND (SELECT bool_and(g.value ->> 'area_code' = b.value ->> 'area_code' AND g.value ->> 'focus' = b.value ->> 'focus')
         FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
              jsonb_array_elements(m.body -> 'prompts' -> 'interview_guide') WITH ORDINALITY g
         JOIN jsonb_array_elements(s.brief -> 'interview_guide') WITH ORDINALITY b ON b.ordinality = g.ordinality)
  AND (SELECT bool_and(NOT (g ? 'prompt_id') AND NOT (g ? 'prompt_version'))
         FROM snaps s, jsonb_array_elements(s.brief -> 'interview_guide') g WHERE s.audience = 'employer')
  AND (SELECT bool_and(body -> 'versions' -> 'trust_question_version' -> 'prompts' = body -> 'prompts' -> 'interview_guide')
         FROM mani),
  'TR15.25 every guide entry of the released brief is frozen, in order, as a published prompt row id and version -- and the brief itself carries neither');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(m.body -> 'prompts' -> 'followup') = 8) FROM mani m)
  AND (SELECT bool_and((f ->> 'employer_followup_prompt_id' IS NOT NULL) = (p ->> 'followup_sv' IS NOT NULL))
         FROM mani m JOIN snaps s ON s.id = m.employer_snapshot_id,
              jsonb_array_elements(m.body -> 'prompts' -> 'followup') f
         JOIN jsonb_array_elements(s.payload) p ON p ->> 'competency_code' = f ->> 'competency_code')
  AND (SELECT bool_and((f ->> 'participant_reflection_prompt_id' IS NOT NULL) = (p ->> 'reflection_sv' IS NOT NULL))
         FROM mani m JOIN snaps s ON s.id = m.participant_snapshot_id,
              jsonb_array_elements(m.body -> 'prompts' -> 'followup') f
         JOIN jsonb_array_elements(s.payload) p ON p ->> 'competency_code' = f ->> 'competency_code'),
  'TR15.26 the follow-up and reflection prompt rows behind every payload line are frozen by id, exactly where a line carries one');

-- 15.27–15.30  The hash contract.
SELECT pg_temp.ok(
  (SELECT bool_and(canonical_sha256 = public.scp_report_manifest_hash(body)
               AND canonical_sha256 ~ '^[0-9a-f]{64}$'
               AND NOT (body ? 'calculated_at') AND NOT (body ? 'manifest_id')
               AND NOT (body ? 'participant_snapshot_id') AND NOT (body ? 'released_by'))
     FROM mani)
  AND (SELECT count(DISTINCT canonical_sha256) FROM mani) = 3,
  'TR15.27 the stored hash is the canonical hash of the stored body; identity and time are columns, not hashed; three releases hash differently');

SELECT pg_temp.ok(
  (SELECT bool_and(v.integrity_ok AND v.reproducible AND v.snapshots_linked
               AND v.stored_sha256 = v.body_sha256
               AND v.stored_computation_sha256 = v.recomputed_computation_sha256)
     FROM mani m CROSS JOIN LATERAL public.scp_verify_report_manifest(m.id) v)
  AND (SELECT count(*) FROM mani m CROSS JOIN LATERAL public.scp_verify_report_manifest(m.id) v) = 3
  AND (SELECT count(*) FROM public.scp_verify_report_manifest(gen_random_uuid())) = 0,
  'TR15.28 the verifier rebuilds the computation from the live ledger under the frozen instant and reproduces it exactly, for all three; an unknown id yields nothing');

SELECT pg_temp.ok(
  (SELECT bool_and(public.scp_report_manifest_computation(m.attempt_id, m.calculated_at, 'v1', 'ras-v1') = m.body -> 'computation'
               AND public.scp_report_manifest_hash(public.scp_report_manifest_computation(m.attempt_id, m.calculated_at, 'v1', 'ras-v1'))
                     = public.scp_report_manifest_hash(m.body -> 'computation'))
     FROM mani m)
  AND public.scp_report_manifest_hash('{"z": [1, 2], "a": {"y": 1, "x": 2}}'::jsonb)
        = public.scp_report_manifest_hash('{"a": {"x": 2, "y": 1}, "z": [1, 2]}'::jsonb)
  AND public.scp_report_manifest_hash('{"z": [1, 2]}'::jsonb) <> public.scp_report_manifest_hash('{"z": [2, 1]}'::jsonb)
  AND public.scp_report_manifest_hash('{"b": 1, "a": 2}'::jsonb) = '21501dbaf73f5223934d22283f01caff4132bc1de4a9550c1ed0dffeb397a323',
  'TR15.29 same frozen inputs, same versions, same instant -> the same computation and the same hash; key order is canonical, array order is content, the digest is pinned');

UPDATE public.scp_maturity_thresholds SET min_mean_contribution = 0.401
 WHERE threshold_version = 'v1' AND level = 'limited_evidence';
SELECT pg_temp.ok(
  (SELECT bool_and(v.integrity_ok AND NOT v.reproducible AND v.snapshots_linked)
     FROM mani m CROSS JOIN LATERAL public.scp_verify_report_manifest(m.id) v)
  AND (SELECT bool_and(canonical_sha256 = public.scp_report_manifest_hash(body)) FROM mani),
  'TR15.30 a threshold value re-seeded after release leaves the stored manifest and its hash intact, and the verifier says the live sources no longer reproduce it');
UPDATE public.scp_maturity_thresholds SET min_mean_contribution = 0.400
 WHERE threshold_version = 'v1' AND level = 'limited_evidence';
SELECT pg_temp.ok(
  (SELECT bool_and(v.reproducible) FROM mani m CROSS JOIN LATERAL public.scp_verify_report_manifest(m.id) v),
  'TR15.30b and restoring the value restores reproducibility');

-- 15.31–15.32  Immutable, and self-checking.
SELECT pg_temp.must_fail(
  'UPDATE public.scp_report_computation_manifests SET body = ''{}''::jsonb',
  'SCP_MANIFEST_IMMUTABLE',
  'TR15.31 a manifest cannot be edited, even by the table owner');
SELECT pg_temp.must_fail(
  'DELETE FROM public.scp_report_computation_manifests',
  'SCP_MANIFEST_IMMUTABLE',
  'TR15.31b nor deleted');
SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_report_computation_manifests
     (attempt_id, subject_id, participant_snapshot_id, employer_snapshot_id,
      participant_report_version_id, employer_report_version_id, calculated_at,
      calculation_schema_version, scoring_model_version, signal_model_version,
      threshold_version, evidence_state_version, evidence_scope_version, brief_version,
      competency_mapping_version, released_by_role, body, canonical_sha256)
   SELECT attempt_id, subject_id, participant_snapshot_id, employer_snapshot_id,
          participant_report_version_id, employer_report_version_id, calculated_at,
          calculation_schema_version, scoring_model_version, signal_model_version,
          threshold_version, evidence_state_version, evidence_scope_version, brief_version,
          competency_mapping_version, released_by_role, body, repeat(''0'', 64)
     FROM mani WHERE persona = ''P1''',
  'scp_manifest_hash_matches_body',
  'TR15.32 a manifest whose hash does not match its body is refused by the table itself');
SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_report_snapshots
     (attempt_id, subject_id, report_version_id, audience, payload, manifest_id)
   SELECT attempt_id, subject_id, participant_report_version_id, ''participant'', ''[]''::jsonb, id
     FROM mani WHERE persona = ''P1''',
  'scp_report_snapshots_manifest_pair',
  'TR15.32b a snapshot naming a manifest without its hash (or the reverse) is refused');

-- 15.33–15.37  Privacy: refused, not filtered. The participant, the employer
-- owner, another organisation, a stranger, anon: no table, no routine, and
-- the audience documents name none of it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_computation_manifests',
  'permission denied', 'TR15.33 the participant cannot read the manifest table');
SELECT pg_temp.must_fail(
  format('SELECT public.scp_report_manifest_computation(%L::uuid, now())', (SELECT attempt_id FROM runs WHERE persona = 'P1')),
  'permission denied', 'TR15.33b nor execute the builder');
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_verify_report_manifest(%L::uuid)', (SELECT id FROM mani WHERE persona = 'P1')),
  'permission denied', 'TR15.33c nor the verifier');
SELECT pg_temp.must_fail('SELECT public.scp_report_manifest_hash(''{}''::jsonb)',
  'permission denied', 'TR15.33d nor the hash rule');
SELECT pg_temp.ok(
  (SELECT d::text NOT ILIKE '%manifest%' AND d::text NOT ILIKE '%canonical_sha256%'
      AND d::text NOT LIKE '%' || (SELECT canonical_sha256 FROM mani WHERE persona = 'P1') || '%'
      AND d::text NOT ILIKE '%weighted_sum%' AND d::text NOT ILIKE '%denominator%'
      AND d::text NOT ILIKE '%option_key%' AND d::text NOT ILIKE '%rubric_version%'
      AND d::text NOT ILIKE '%selected_score%' AND d::text NOT ILIKE '%exclusion_reason%'
     FROM (SELECT pg_temp.par_doc('P1') AS d) x),
  'TR15.34 the participant document names no manifest, hash, denominator, option key, score, rubric version or exclusion reason');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_computation_manifests',
  'permission denied', 'TR15.35 the employer owner cannot read the manifest table either');
SELECT pg_temp.must_fail('SELECT manifest_id, canonical_sha256 FROM public.scp_report_snapshots',
  'permission denied', 'TR15.35b nor the link columns from the snapshot table');
SELECT pg_temp.must_fail('TRUNCATE public.scp_report_computation_manifests',
  'permission denied', 'TR15.35c nor TRUNCATE it');
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_verify_report_manifest(%L::uuid)', (SELECT id FROM mani WHERE persona = 'P1')),
  'permission denied', 'TR15.35d nor run the verifier');
SELECT pg_temp.ok(
  (SELECT bool_and(d::text NOT ILIKE '%manifest%' AND d::text NOT ILIKE '%canonical_sha256%'
               AND d::text NOT LIKE '%' || m.canonical_sha256 || '%'
               AND d::text NOT ILIKE '%weighted_sum%' AND d::text NOT ILIKE '%denominator%'
               AND d::text NOT ILIKE '%option_key%' AND d::text NOT ILIKE '%rubric_version%'
               AND d::text NOT ILIKE '%selected_score%' AND d::text NOT ILIKE '%exclusion_reason%'
               AND d::text NOT ILIKE '%prompt_id%')
     FROM mani m, LATERAL (SELECT pg_temp.emp_doc(m.persona) AS d) x),
  'TR15.36 the employer document names no manifest, hash, denominator, option key, score, rubric version, exclusion reason or prompt id');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fc000000-0000-0000-0000-000000000012';
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_computation_manifests',
  'permission denied', 'TR15.37 another organisation''s owner is refused the table outright');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_computation_manifests',
  'permission denied', 'TR15.37b anon is refused the table');
SELECT pg_temp.must_fail('SELECT public.scp_report_manifest_hash(''{}''::jsonb)',
  'permission denied', 'TR15.37c and the hash rule');
SELECT pg_temp.must_fail('TRUNCATE public.scp_report_computation_manifests',
  'permission denied', 'TR15.37d and TRUNCATE');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.ok(
  (SELECT count(*) FROM mani m CROSS JOIN LATERAL public.scp_verify_report_manifest(m.id) v WHERE v.integrity_ok) = 3,
  'TR15.38 service_role -- the backend -- can run the verifier');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_computation_manifests') = 0
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scp_report_computation_manifests'::regclass)
  AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                   WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
                     AND grantee IN ('anon', 'authenticated', 'PUBLIC'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                   WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
                     AND grantee IN ('anon', 'authenticated', 'PUBLIC'))
  AND (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
         FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
          AND grantee = 'service_role') LIKE '%INSERT%SELECT%',
  'TR15.39 posture: RLS on, zero policies, no audience privilege at table or column level, service_role kept');

-- 15.40  Legacy provenance: a snapshot with no manifest is a valid, readable
-- row. Proven the way the continuity suite reproduces production: replica
-- mode, on a fresh attempt id, then read through the audience contract.
SELECT pg_temp.ok(
  (SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots' AND column_name = 'manifest_id')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
                     AND column_name IN ('payload', 'brief', 'context')),
  'TR15.40 manifest_id is nullable (a historical snapshot is legacy provenance, never backfilled), and the manifest holds no audience document of its own');

ROLLBACK;
