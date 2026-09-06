-- TRUST Evidence Report — PR-R3A hotfix: the name fallback on a report that
-- predates its catalogue rows.
--
-- On the production project the competency catalogue was (re)created on
-- 2026-08-28 by the project bootstrap, and every report released before that
-- date -- all of them -- carries created_at values LATER than its own
-- released_at. The V3 projection's fallback looks the name up only among
-- versions created at or before the release, finds nothing, and a SELECT INTO
-- that finds no row assigns NULL: the names the frozen document itself
-- supplied were thrown away, and every hosted employer document came back with
-- eight nameless competencies. The local suites never saw it because a local
-- catalogue always predates a local release.
--
-- This suite reproduces that exact condition and proves:
--
--   L0  fixture and state
--   L1  a manifest-backed report keeps its names and its competency version
--       when the catalogue postdates it
--   L2  a legacy (pre-R1) report keeps the names its frozen document supplied
--       when the catalogue postdates it, and its version stays the legacy null
--   L3  a report the catalogue does predate resolves exactly as before
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

CREATE OR REPLACE FUNCTION pg_temp.rubric_levels(_ivid uuid, _fmt text, _level int)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE _level END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- The V3 document as the issuing owner sees it.
CREATE OR REPLACE FUNCTION pg_temp.v3_as_owner(_att uuid) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE _d jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'fd3c0000-0000-0000-0000-000000000002', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT public.scp_employer_report_v3(_att) INTO _d;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _d;
END $fn$;

-- Every competency line has a name in both languages, and it is the name the
-- frozen employer brief carries for that area.
CREATE OR REPLACE FUNCTION pg_temp.names_match_frozen(_d jsonb, _att uuid) RETURNS boolean
LANGUAGE sql AS $fn$
  SELECT jsonb_array_length(_d -> 'frozen_report' -> 'core' -> 'competencies') = 8
     AND bool_and(a ->> 'competency_name_sv' IS NOT NULL AND a ->> 'competency_name_en' IS NOT NULL
                  AND a ->> 'competency_name_sv' = o ->> 'area_sv'
                  AND a ->> 'competency_name_en' = o ->> 'area_en')
    FROM jsonb_array_elements(_d -> 'frozen_report' -> 'core' -> 'competencies') a
    JOIN public.scp_report_snapshots s ON s.attempt_id = _att AND s.audience = 'employer'
    JOIN LATERAL jsonb_array_elements(s.brief -> 'observed') o ON o ->> 'area_code' = a ->> 'competency_code';
$fn$;

DO $$ BEGIN RAISE NOTICE 'GROUP L0 - fixture: one employer, one candidate, one released report'; END $$;

CREATE TEMP TABLE cd AS
SELECT
  'fd3c0000-0000-0000-0000-000000000001'::uuid AS employer,
  'fd3c0000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fd3c0000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fd3c0000-0000-0000-0000-00000000000a'::uuid AS p1;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM cd), 'owner@trust-r3a-fallback.test'),
  ((SELECT reviewer_user FROM cd), 'reviewer@trust-r3a-fallback.test'),
  ((SELECT p1            FROM cd), 'p1@trust-r3a-fallback.test');

INSERT INTO public.profiles (id, display_name)
SELECT owner_user, 'Anna Agare' FROM cd
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Trust Bevakning Fallback AB', 'trust-r3a-fallback', 'active' FROM cd;

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
       'PR-R3A legacy name fallback', owner_user, now() + interval '30 days' FROM cd;

GRANT SELECT ON cd, cdv TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd3c0000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM cd), (SELECT version_id FROM cdv),
  'p1@trust-r3a-fallback.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated;

CREATE TEMP TABLE items AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format, iv.is_safety_critical,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS best_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM run));
GRANT SELECT ON items TO authenticated;

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
SET LOCAL request.jwt.claim.sub = 'fd3c0000-0000-0000-0000-000000000006';
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
SET LOCAL request.jwt.claim.sub = 'fd3c0000-0000-0000-0000-000000000002';
DO $$ BEGIN PERFORM public.scp_release_attempt_report((SELECT attempt_id FROM run)); END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s WHERE s.attempt_id = (SELECT attempt_id FROM run) AND s.audience = 'employer' AND s.manifest_id IS NOT NULL) = 1,
  'L0.1 one released employer report, linked to its manifest');

SELECT pg_temp.ok(
  pg_temp.names_match_frozen(pg_temp.v3_as_owner((SELECT attempt_id FROM run)), (SELECT attempt_id FROM run)),
  'L0.2 with the catalogue older than the release, every competency is named as the frozen document names it');

DO $$ BEGIN RAISE NOTICE 'GROUP L1 - the catalogue moves to AFTER the release (the production condition)'; END $$;

-- Every competency version now looks as if it were created and published the
-- day after this report was released. created_at is not a lifecycle column,
-- so the immutability trigger is bypassed for this simulation only.
SET session_replication_role = replica;
UPDATE public.scp_competency_versions
   SET created_at   = (SELECT max(released_at) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) + interval '1 day',
       published_at = (SELECT max(released_at) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) + interval '1 day';
SET session_replication_role = origin;

SELECT pg_temp.ok(
  (SELECT bool_and(v.created_at > s.released_at)
     FROM public.scp_competency_versions v, public.scp_report_snapshots s
    WHERE s.attempt_id = (SELECT attempt_id FROM run)),
  'L1.0 the condition holds: every catalogue row postdates the release');

CREATE TEMP TABLE v3_manifest AS SELECT pg_temp.v3_as_owner((SELECT attempt_id FROM run)) AS d;

SELECT pg_temp.ok(
  pg_temp.names_match_frozen((SELECT d FROM v3_manifest), (SELECT attempt_id FROM run)),
  'L1.1 manifest-backed: every competency is still named as the frozen document names it');

-- The version a competency is currently released against: the one its
-- behaviour map points at. Hard-coding "1" would break the moment the
-- catalogue moves (PR-R3B publishes SCC-07 as version 2).
CREATE OR REPLACE FUNCTION pg_temp.mapped_version(_code text) RETURNS text
LANGUAGE sql AS $fn$
  SELECT max(v.version_number)::text
    FROM public.scp_behaviour_competency_map m
    JOIN public.scp_competency_versions v ON v.id = m.competency_version_id
    JOIN public.scp_competencies c ON c.id = v.competency_id
   WHERE c.code = _code;
$fn$;

SELECT pg_temp.ok(
  (SELECT bool_and(a ->> 'competency_version' = pg_temp.mapped_version(a ->> 'competency_code'))
     FROM v3_manifest, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a),
  'L1.2 manifest-backed: the competency version still comes from the frozen manifest');

DO $$ BEGIN RAISE NOTICE 'GROUP L2 - a legacy (pre-R1) report under the same condition'; END $$;

SET session_replication_role = replica;
UPDATE public.scp_report_snapshots
   SET manifest_id = NULL, canonical_sha256 = NULL
 WHERE attempt_id = (SELECT attempt_id FROM run);
SET session_replication_role = origin;

CREATE TEMP TABLE v3_legacy AS SELECT pg_temp.v3_as_owner((SELECT attempt_id FROM run)) AS d;

SELECT pg_temp.ok(
  (SELECT d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'computation_chain' = 'legacy'
      AND NOT (d -> 'frozen_report' -> 'core' -> 'provenance' ->> 'evidence_basis_available')::boolean
     FROM v3_legacy),
  'L2.0 the report now reads as a legacy document');

SELECT pg_temp.ok(
  pg_temp.names_match_frozen((SELECT d FROM v3_legacy), (SELECT attempt_id FROM run)),
  'L2.1 legacy: every competency keeps the name its frozen document supplied -- a lookup that finds nothing takes nothing away');

SELECT pg_temp.ok(
  (SELECT bool_and(a -> 'competency_version' = 'null'::jsonb)
     FROM v3_legacy, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a),
  'L2.2 legacy: the competency version is the explicit legacy null, never invented');

SELECT pg_temp.ok(
  (SELECT count(*) > 0 AND bool_and(l ->> 'competency_name_sv' IS NOT NULL AND l ->> 'competency_name_en' IS NOT NULL)
     FROM v3_legacy,
          -- Parenthesised on purpose: -> and || share precedence in Postgres.
          jsonb_array_elements((d -> 'frozen_report' -> 'employer' -> 'overview' -> 'clearest_support')
                            || (d -> 'frozen_report' -> 'employer' -> 'overview' -> 'verify_in_interview')
                            || (d -> 'frozen_report' -> 'employer' -> 'overview' -> 'limited_evidence')) l),
  'L2.3 legacy: the thirty-second overview names every area it lists');

DO $$ BEGIN RAISE NOTICE 'GROUP L3 - the catalogue predates the release again'; END $$;

SET session_replication_role = replica;
UPDATE public.scp_competency_versions
   SET created_at   = (SELECT min(released_at) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) - interval '30 days',
       published_at = (SELECT min(released_at) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) - interval '30 days';
SET session_replication_role = origin;

CREATE TEMP TABLE v3_legacy_dated AS SELECT pg_temp.v3_as_owner((SELECT attempt_id FROM run)) AS d;

SELECT pg_temp.ok(
  pg_temp.names_match_frozen((SELECT d FROM v3_legacy_dated), (SELECT attempt_id FROM run)),
  'L3.1 legacy with a dated catalogue: the names are the frozen document''s, exactly as before');

-- With every catalogue row dated before the release, the fallback resolves
-- the highest version published by then -- the same version the map points at.
SELECT pg_temp.ok(
  (SELECT bool_and(a ->> 'competency_version' = pg_temp.mapped_version(a ->> 'competency_code'))
     FROM v3_legacy_dated, jsonb_array_elements(d -> 'frozen_report' -> 'core' -> 'competencies') a),
  'L3.2 legacy with a dated catalogue: the version published at the release instant is resolved, exactly as before');

SELECT pg_temp.ok(
  (SELECT (a.d -> 'frozen_report' -> 'core' -> 'competencies')::text <> (b.d -> 'frozen_report' -> 'core' -> 'competencies')::text
     FROM v3_legacy a, v3_legacy_dated b)
  AND (SELECT bool_and((a1 - 'competency_version') = (b1 - 'competency_version'))
         FROM v3_legacy a, v3_legacy_dated b,
              jsonb_array_elements(a.d -> 'frozen_report' -> 'core' -> 'competencies') WITH ORDINALITY x(a1, i)
         JOIN jsonb_array_elements(b.d -> 'frozen_report' -> 'core' -> 'competencies') WITH ORDINALITY y(b1, j) ON i = j),
  'L3.3 between the two catalogue states only competency_version differs on a legacy document; every other field is identical');

ROLLBACK;
