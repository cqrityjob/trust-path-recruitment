-- TRUST Evidence Report — PR-R2A-3 CONTRACT: the audience boundary, closed.
--
-- After 20261026090000 an audience reads a report only through its entry
-- point. This suite walks a released Väktare-family attempt and asserts, as
-- each principal in turn, that every legitimate read still works, every
-- forbidden path is REFUSED rather than filtered, the 16-orphan class of
-- historical report is still readable, and the Interview Intelligence bridge
-- still finds what it carries.
--
--   K1  participant: own report via RPC, table refused, ledger empty, safe
--   K2  employer: own report via RPC, table refused, safe
--   K3  historical orphaned snapshots (template row missing) still readable
--   K4  anon and the wrong tenant: nothing, from any path
--   K5  Interview Intelligence: the employer document carries its subset
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

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

DO $$ BEGIN RAISE NOTICE 'GROUP K0 — fixture and state'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') = 2,
  'K0.1 both audience contracts left-join the report template (#182 continuity present)');
SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select')
  AND (SELECT count(*) FROM pg_policies WHERE tablename = 'scp_report_snapshots' AND qual LIKE '%scp_report_snapshot_readable%') = 2,
  'K0.2 CONTRACT is applied: no direct read, no subject ledger policy, both row policies on the canonical predicate');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE xa AS
SELECT
  'fb100000-0000-0000-0000-000000000001'::uuid AS employer,
  'fb100000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fb100000-0000-0000-0000-000000000003'::uuid AS participant,
  'fb100000-0000-0000-0000-000000000004'::uuid AS other_employer,
  'fb100000-0000-0000-0000-000000000005'::uuid AS other_owner,
  'fb100000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fb100000-0000-0000-0000-000000000007'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user     FROM xa), 'owner@r2a-contract.test'),
  ((SELECT participant    FROM xa), 'participant@r2a-contract.test'),
  ((SELECT other_owner    FROM xa), 'other-owner@r2a-contract.test'),
  ((SELECT reviewer_user  FROM xa), 'reviewer@r2a-contract.test'),
  ((SELECT stranger       FROM xa), 'stranger@r2a-contract.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Kontrakt AB', 'kontrakt-ab-r2a', 'active' FROM xa
UNION ALL
SELECT other_employer, 'Annan Kontrakt AB', 'annan-kontrakt-r2a', 'active' FROM xa;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM xa
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM xa
UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM xa;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM xa;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM xa;

CREATE TEMP TABLE xav AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM xav),
       'R2A contract suite', owner_user, now() + interval '30 days' FROM xa;

GRANT SELECT ON xa, xav TO authenticated, anon;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM xa), (SELECT version_id FROM xav),
  'participant@r2a-contract.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated, anon;

CREATE TEMP TABLE xitems AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1)      AS first_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS last_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM run));
GRANT SELECT ON xitems TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000003';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _it IN SELECT * FROM xitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag följer instruktionen, håller avstånd, larmar och dokumenterar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.first_option, _it.last_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.first_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000006';
DO $$
DECLARE _att uuid; _rv record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format, i.slug
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld',
      'Inom mandatet, prioriterar säkerhet, dokumenterar åtgärden.',
      CASE WHEN NOT _rv.is_safety_critical THEN NULL
           WHEN _rv.slug = 'sg-b-10' THEN 'high'
           ELSE 'no_concern' END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000002';
DO $$ DECLARE _att uuid; BEGIN
  SELECT attempt_id INTO _att FROM run;
  PERFORM public.scp_release_attempt_report(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) = 2,
  'K0.3 the fixture released one snapshot per audience');



DO $$ BEGIN RAISE NOTICE 'GROUP K1 — the participant'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000003';
CREATE TEMP TABLE k_par AS
SELECT to_jsonb(p) AS d FROM public.scp_participant_report((SELECT attempt_id FROM run)) p;
SELECT pg_temp.ok((SELECT count(*) FROM k_par) = 1
  AND (SELECT d ->> 'audience' FROM k_par) = 'participant',
  'K1.1 own released report through scp_participant_report = 1 row');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0,
  'K1.2 the employer document is not returned to the participant');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'K1.3 the participant cannot SELECT the snapshot table at all');
SELECT pg_temp.must_fail('SELECT derivation_input FROM public.scp_report_snapshots',
  'permission denied', 'K1.4 not even a single column of it');
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'K1.5 the participant reads zero evidence-ledger rows');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE contribution IS NOT NULL OR confidence IS NOT NULL OR derivation_basis IS NOT NULL
       OR safety_finding IS NOT NULL OR safety_severity IS NOT NULL) = 0,
  'K1.6 no contribution, confidence, rubric basis, finding or severity by any predicate');
SELECT pg_temp.ok(
  (SELECT NOT (d ? 'derivation_input') AND d::text NOT LIKE '%maturity_level%'
      AND d -> 'safety_flags' = '[]'::jsonb
      AND d ->> 'payload' NOT LIKE '%severity%' AND d ->> 'payload' NOT LIKE '%reviewer_rationale%'
      AND d ->> 'payload' NOT LIKE '%score_value%' AND d ->> 'payload' NOT LIKE '%is_preferred%'
      AND NOT (d -> 'brief' ? 'observed') AND NOT (d -> 'brief' ? 'interview_guide')
     FROM k_par),
  'K1.7 the participant document: no derivation input, no severity, no rationale, no answer key, no employer sections');
SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM k_par, jsonb_object_keys(d) k)
  = ARRAY['attempt_id','audience','brief','context','id','limitations_en','limitations_sv',
          'payload','released_at','safety_flags','subject_id'],
  'K1.8 exactly the eleven contract keys');
RESET ROLE; RESET request.jwt.claim.sub;

-- The ledger genuinely has rows for this subject; the zero above is the policy, not an empty table.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
    JOIN public.scp_subject_identities i ON i.subject_id = e.subject_id
   WHERE i.user_id = 'fb100000-0000-0000-0000-000000000003') > 0,
  'K1.9 the subject has ledger rows -- the zero is the closed policy, not an empty ledger');

DO $$ BEGIN RAISE NOTICE 'GROUP K2 — the employer'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000002';
CREATE TEMP TABLE k_emp AS
SELECT to_jsonb(e) AS d FROM public.scp_employer_report((SELECT attempt_id FROM run)) e;
SELECT pg_temp.ok((SELECT count(*) FROM k_emp) = 1
  AND (SELECT d ->> 'audience' FROM k_emp) = 'employer',
  'K2.1 the commissioning employer''s report through scp_employer_report = 1 row');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0,
  'K2.2 the participant document is not returned to the employer');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'K2.3 the employer cannot SELECT the snapshot table at all');
SELECT pg_temp.must_fail('SELECT brief, derivation_input FROM public.scp_report_snapshots',
  'permission denied', 'K2.4 nor the stored brief or derivation_input');
SELECT pg_temp.ok(
  (SELECT NOT (d ? 'derivation_input') AND d::text NOT LIKE '%behaviour_version_id%'
      AND coalesce((SELECT bool_and(NOT (o ? 'mean') AND NOT (o ? 'spread') AND o ? 'signal')
                      FROM jsonb_array_elements(d -> 'brief' -> 'observed') o), true)
      AND coalesce((SELECT bool_and(NOT (r ? 'mean') AND NOT (r ? 'spread'))
                      FROM jsonb_array_elements(d -> 'brief' -> 'self_reported') r), true)
      AND jsonb_array_length(coalesce(d -> 'brief' -> 'observed', '[]'::jsonb)) > 0
      AND d ->> 'payload' NOT LIKE '%reviewer_rationale%' AND d ->> 'payload' NOT LIKE '%score_value%'
      AND coalesce(d ->> 'brief','') NOT LIKE '%score_value%'
     FROM k_emp),
  'K2.5 the employer document: no derivation input, no mean, no spread, no behaviour id, no rationale, no answer key');
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(d -> 'safety_flags') = 1
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d -> 'safety_flags' -> 0) k)
          = ARRAY['finding','observed_at','severity']
     FROM k_emp),
  'K2.6 the one human finding arrives as {finding, severity, observed_at}');
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'K2.7 the employer reads no ledger row');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP K3 — historical orphaned snapshots stay readable'; END $$;

-- Orphan both snapshots the way the cutover did (a restore bypasses triggers).
SET session_replication_role = replica;
UPDATE public.scp_report_snapshots
   SET report_version_id = 'd0ddaa61-2ede-4036-81a8-9555eb49338c'::uuid
 WHERE attempt_id = (SELECT attempt_id FROM run);
SET session_replication_role = origin;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 1
  AND (SELECT limitations_sv = ARRAY[]::text[] FROM public.scp_participant_report((SELECT attempt_id FROM run))),
  'K3.1 the orphaned participant report is still returned through the contract, limitations empty');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'K3.1b and the table is still refused');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 1
  AND (SELECT brief::text NOT LIKE '%"mean"%' AND safety_flags::text NOT LIKE '%behaviour_version_id%'
         FROM public.scp_employer_report((SELECT attempt_id FROM run))),
  'K3.2 the orphaned employer report is still returned through the contract, still stripped');
RESET ROLE; RESET request.jwt.claim.sub;

-- History and report agree for the orphan too.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_my_assessment_history() h
     WHERE h.lifecycle_state = 'result_available' AND h.participant_snapshot_id IS NOT NULL
       AND (SELECT count(*) FROM public.scp_participant_report(h.attempt_id)) = 0)
  AND EXISTS (SELECT 1 FROM public.scp_my_assessment_history() WHERE lifecycle_state = 'result_available'),
  'K3.3 the history offers exactly what the contract returns');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP K4 — anon and the wrong tenant'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0,
  'K4.1 a second organisation gets nothing from either contract');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'K4.2 and cannot read the table');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000007';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'K4.3 an unrelated signed-in account gets nothing: not another participant''s report, not the employer''s, not the ledger');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_participant_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'permission denied', 'K4.4 anon cannot execute the participant contract');
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_employer_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'permission denied', 'K4.5 nor the employer contract');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'K4.6 nor read the snapshot table');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_competency_evidence',
  'permission denied', 'K4.7 nor the ledger');
RESET ROLE;

-- The posture, stated once.
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_participant_report(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_employer_report(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_participant_report(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_employer_report(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_report_snapshot_readable(text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.scp_audience_brief(jsonb)', 'EXECUTE')
  AND NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT')
  AND has_table_privilege('service_role', 'public.scp_report_snapshots', 'INSERT'),
  'K4.8 EXECUTE on the contracts is authenticated-only, the helper is private, the table is closed to audiences, the backend keeps its write');

DO $$ BEGIN RAISE NOTICE 'GROUP K5 — Interview Intelligence'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fb100000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT released_at IS NOT NULL
      AND coalesce((SELECT bool_and(o ? 'area_sv' AND o ? 'area_en' AND o ? 'signal' AND o ? 'behaviour_sv')
                      FROM jsonb_array_elements(brief -> 'observed') o), false)
      AND coalesce((SELECT bool_and(g ? 'area_code' AND g ? 'focus' AND g ? 'why_sv' AND g ? 'followup_sv')
                      FROM jsonb_array_elements(brief -> 'interview_guide') g), true)
     FROM public.scp_employer_report((SELECT attempt_id FROM run))),
  'K5.1 the bridge finds released_at, observed area/signal/behaviour and the guide follow-ups in the employer document');
SELECT pg_temp.ok(
  (SELECT brief::text NOT LIKE '%"mean"%' AND brief::text NOT LIKE '%"spread"%'
      AND to_jsonb(e)::text NOT LIKE '%derivation_input%'
     FROM public.scp_employer_report((SELECT attempt_id FROM run)) e),
  'K5.2 and nothing internal travels with it');
RESET ROLE; RESET request.jwt.claim.sub;

ROLLBACK;
