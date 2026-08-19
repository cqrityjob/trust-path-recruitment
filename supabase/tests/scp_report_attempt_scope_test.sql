-- A standard assessment report is about ONE attempt.
--
-- The same subject sits the same assessment twice. Everything below asks the
-- same question from a different angle: does the second report describe the
-- second sitting, or does it describe the person's whole history while claiming
-- to describe the sitting?
--
-- Before 20260820130000 it was the latter. Every evidence query filtered on
-- subject_id alone, so the second report showed the sum of both sittings —
-- and a later attempt could silently change what an earlier, immutable report
-- appeared to mean.
--
-- The boundary is exact provenance, not a time window:
--   evidence.source_ref -> scp_candidate_responses.id -> attempt_id
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

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  -- Every construct-bearing dimension at 4, every style dimension at 0. The
  -- derived contribution is therefore 1.000 if and only if writing quality is
  -- excluded, which is the property worth pinning in a fixture too.
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;


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
-- Fixture
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE sc AS
SELECT
  'ab000000-0000-0000-0000-000000000001'::uuid AS employer,
  'ab000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'ab000000-0000-0000-0000-000000000003'::uuid AS participant,
  'ab000000-0000-0000-0000-000000000004'::uuid AS reviewer_user;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user    FROM sc), 'owner@scope.test'),
  ((SELECT participant   FROM sc), 'participant@scope.test'),
  ((SELECT reviewer_user FROM sc), 'reviewer@scope.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Scope AB', 'scope-ab-attempt', 'active' FROM sc;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM sc;
INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM sc;

CREATE TEMP TABLE scv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM scv),
       'Attempt scope suite', owner_user, now() + interval '30 days' FROM sc;

GRANT SELECT ON sc, scv TO authenticated;

-- One helper that runs a whole attempt end to end, so the two sittings are
-- identical in every respect except which attempt they belong to.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt() RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  -- Each step runs as the principal that is actually allowed to take it. The
  -- RPCs are SECURITY DEFINER and gate on auth.uid(), so setting the claim is
  -- what makes the authorisation real rather than bypassed.
  PERFORM set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT employer FROM sc), (SELECT version_id FROM scv),
    'participant@scope.test', NULL, 'sv', 'workforce', NULL, NULL);

  PERFORM set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000003', true);
  FOR _it IN
    SELECT iv.id AS ivid, iv.item_format,
           (SELECT o.id FROM public.scp_item_options o
             WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
           (SELECT o.id FROM public.scp_item_options o
             WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_attempts at ON at.id = _att AND at.form_id = fi.form_id
     ORDER BY fi.display_order
  LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);

  PERFORM set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000004', true);
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format,
           i.slug
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    -- One real finding per attempt, the rest cleared, so the attempt-scoping
    -- assertions below still compare a non-zero number. Under the governed
    -- evidence model a report flags what a reviewer FOUND, so a run where every
    -- response was fine produces no flags at all -- correct, but it would make
    -- AS2.5 and AS2.6 compare zero with zero and prove nothing.
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
      CASE WHEN NOT _rv.is_safety_critical THEN NULL
           WHEN _rv.slug = 'sg-b-10' THEN 'high'
           ELSE 'no_concern' END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
  PERFORM public.scp_release_attempt_report(_att);
  RETURN _att;
END $$;

-- Authorisation of each RPC is asserted in detail by the audience suite; here
-- the point is only that the two runs are identical apart from which attempt
-- they belong to.
CREATE TEMP TABLE att1 AS SELECT pg_temp.run_attempt() AS id;
CREATE TEMP TABLE snap1 AS
SELECT audience, payload, safety_flags, context, evidence_scope_version
  FROM public.scp_report_snapshots WHERE attempt_id = (SELECT id FROM att1);

CREATE TEMP TABLE att2 AS SELECT pg_temp.run_attempt() AS id;
CREATE TEMP TABLE snap2 AS
SELECT audience, payload, safety_flags, context, evidence_scope_version
  FROM public.scp_report_snapshots WHERE attempt_id = (SELECT id FROM att2);

DO $$ BEGIN RAISE NOTICE 'GROUP AS1 — the fixture really is two separate sittings'; END $$;

SELECT pg_temp.ok((SELECT id FROM att1) <> (SELECT id FROM att2),
  'AS1.1 two distinct attempts were created for the same subject');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT subject_id) FROM public.scp_attempts
    WHERE id IN (SELECT id FROM att1 UNION SELECT id FROM att2)) = 1,
  'AS1.2 both attempts belong to the SAME subject — the case that used to accumulate');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT id FROM att1)) = 18
  AND (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT id FROM att2)) = 18,
  'AS1.3 each sitting answered all 18 items');

DO $$ BEGIN RAISE NOTICE 'GROUP AS2 — each report counts only its own attempt'; END $$;

-- The headline defect: the second report claimed the sum of both sittings.
SELECT pg_temp.ok(
  (SELECT (context->>'evidence_observations')::int FROM snap2 WHERE audience='employer')
  = (SELECT count(*) FROM public.scp_competency_evidence e
      WHERE e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                              WHERE r.attempt_id = (SELECT id FROM att2))),
  'AS2.1 attempt 2 counts exactly its own evidence, not the accumulated total');

SELECT pg_temp.ok(
  (SELECT (context->>'evidence_observations')::int FROM snap1 WHERE audience='employer')
  = (SELECT (context->>'evidence_observations')::int FROM snap2 WHERE audience='employer'),
  'AS2.2 two identical sittings produce identical observation counts — no drift upward');

SELECT pg_temp.ok(
  (SELECT sum((x->>'observations')::int) FROM snap2 s, jsonb_array_elements(s.payload) x
    WHERE s.audience='employer')
  = (SELECT (context->>'evidence_observations')::int FROM snap2 WHERE audience='employer'),
  'AS2.3 per-competency observations add up to the attempt total');

-- Repeating the same form must not invent a second evidence context, because
-- the sufficiency gate counts contexts.
SELECT pg_temp.ok(
  (SELECT (context->>'evidence_contexts')::int FROM snap2 WHERE audience='employer') = 1,
  'AS2.4 sitting the same form twice is still ONE evidence context');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) FROM snap1 WHERE audience='employer')
  = (SELECT jsonb_array_length(safety_flags) FROM snap2 WHERE audience='employer'),
  'AS2.5 safety flags are scoped per attempt, not summed across attempts');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) FROM snap2 WHERE audience='employer')
  = (SELECT count(*) FROM public.scp_competency_evidence e
      WHERE e.safety_finding IN ('low','medium','high','critical')
        AND e.superseded_by IS NULL
        AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                              WHERE r.attempt_id = (SELECT id FROM att2))),
  'AS2.6 every safety flag in the report traces to a response of THIS attempt');

-- And the count is the reviewer's findings, not the item bank's classifications:
-- twelve items are classified safety-critical and one flag is reported.
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) FROM snap2 WHERE audience='employer') = 1
  AND (SELECT count(*) FROM public.scp_competency_evidence e
        WHERE e.is_safety_critical AND e.superseded_by IS NULL
          AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                                WHERE r.attempt_id = (SELECT id FROM att2))) = 12,
  'AS2.6b twelve classified items, one reported flag');

DO $$ BEGIN RAISE NOTICE 'GROUP AS3 — a later attempt does not rewrite an earlier report'; END $$;

-- Attempt 1's snapshot was captured before attempt 2 existed. It must be
-- unchanged now that attempt 2 has been released.
SELECT pg_temp.ok(
  (SELECT md5(payload::text) FROM snap1 WHERE audience='employer')
  = (SELECT md5(payload::text) FROM public.scp_report_snapshots
      WHERE attempt_id = (SELECT id FROM att1) AND audience='employer'),
  'AS3.1 releasing attempt 2 leaves attempt 1''s employer payload byte-identical');

SELECT pg_temp.ok(
  (SELECT md5(payload::text) FROM snap1 WHERE audience='participant')
  = (SELECT md5(payload::text) FROM public.scp_report_snapshots
      WHERE attempt_id = (SELECT id FROM att1) AND audience='participant'),
  'AS3.2 and the participant payload too');

SELECT pg_temp.ok(
  (SELECT md5(safety_flags::text) FROM snap1 WHERE audience='employer')
  = (SELECT md5(safety_flags::text) FROM public.scp_report_snapshots
      WHERE attempt_id = (SELECT id FROM att1) AND audience='employer'),
  'AS3.3 the earlier safety flags are untouched by the later release');

-- The evidence states of the two reports agree, because the sittings are
-- identical. If accumulation were still happening they would diverge.
SELECT pg_temp.ok(
  (SELECT jsonb_agg(x->>'evidence_state' ORDER BY x->>'competency_code')
     FROM snap1 s, jsonb_array_elements(s.payload) x WHERE s.audience='employer')
  = (SELECT jsonb_agg(x->>'evidence_state' ORDER BY x->>'competency_code')
     FROM snap2 s, jsonb_array_elements(s.payload) x WHERE s.audience='employer'),
  'AS3.4 identical sittings yield identical evidence states — no silent improvement');

DO $$ BEGIN RAISE NOTICE 'GROUP AS4 — nothing from outside the attempt can enter'; END $$;

-- Every competency line must be reconstructible from this attempt alone.
SELECT pg_temp.ok(
  (SELECT bool_and(
     (x->>'observations')::int = (
       SELECT count(*) FROM public.scp_competency_evidence e
         JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
         JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
         JOIN public.scp_competencies c ON c.id = cv.competency_id
        WHERE c.code = x->>'competency_code'
          AND e.superseded_by IS NULL
          AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                                WHERE r.attempt_id = (SELECT id FROM att2))))
     FROM snap2 s, jsonb_array_elements(s.payload) x WHERE s.audience='employer'),
  'AS4.1 every line''s count is reproducible from this attempt''s evidence alone');

-- Evidence belonging to a different subject entirely must never appear. The
-- other suites' fixtures roll back, so this is asserted structurally: the
-- scope join cannot reach a response that is not on this attempt.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
    WHERE e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                            WHERE r.attempt_id = (SELECT id FROM att2))
      AND e.subject_id <> (SELECT subject_id FROM public.scp_attempts
                            WHERE id = (SELECT id FROM att2))) = 0,
  'AS4.2 the attempt boundary cannot reach another participant''s evidence');

-- Learning evidence and any other purpose write a different source_ref, so the
-- join excludes them by construction rather than by a filter that could be
-- forgotten.
SELECT pg_temp.ok(
  (SELECT bool_and(e.source_type = 'assessment_response')
     FROM public.scp_competency_evidence e
    WHERE e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                            WHERE r.attempt_id = (SELECT id FROM att2))),
  'AS4.3 only assessment-response evidence is inside the boundary');

DO $$ BEGIN RAISE NOTICE 'GROUP AS5 — the boundary is recorded, and both audiences share it'; END $$;

SELECT pg_temp.ok(
  (SELECT bool_and(evidence_scope_version = 'attempt-v1') FROM snap2),
  'AS5.1 the snapshot records which evidence boundary produced it');

SELECT pg_temp.ok(
  (SELECT bool_and(context ? 'evidence_scope_version') FROM snap2),
  'AS5.2 the boundary is visible in the frozen context as well');

-- Same boundary, different audiences: the counts agree while the payloads
-- remain separate products.
SELECT pg_temp.ok(
  (SELECT sum((x->>'observations')::int) FROM snap2 s, jsonb_array_elements(s.payload) x
    WHERE s.audience='employer')
  = (SELECT sum((x->>'observations')::int) FROM snap2 s, jsonb_array_elements(s.payload) x
    WHERE s.audience='participant'),
  'AS5.3 employer and participant reports share one attempt boundary');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT md5(payload::text)) FROM snap2) = 2,
  'AS5.4 …while still being two different documents');

DO $$ BEGIN RAISE NOTICE 'GROUP AS6 — cumulative progress stays a separate product'; END $$;

-- Resolved before the role switch: scp_attempts is not readable by an employer
-- under RLS (only by the subject or an authoring principal), so looking the
-- subject up while acting as the owner would silently yield NULL and make the
-- assertion below pass for the wrong reason.
CREATE TEMP TABLE subj AS
SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT id FROM att2);
GRANT SELECT ON att1, att2, subj TO authenticated;

-- scp_subject_progress is the across-attempts view. It must read the released
-- snapshots rather than the live graph, so it can never feed a standard report
-- and can never disagree with one.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ab000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE prog AS
SELECT * FROM public.scp_subject_progress((SELECT subject_id FROM subj));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(DISTINCT attempt_id) FROM prog) = 2,
  'AS6.1 progress spans both attempts — that is its job, and it is labelled as such');

SELECT pg_temp.ok(
  (SELECT count(*) = count(DISTINCT (attempt_id::text || competency_code)) FROM prog),
  'AS6.2 progress reports each competency once per attempt, not once per audience');

-- The safety net: progress is a projection of released snapshots, so a standard
-- report can never accidentally be fed from the cumulative view.
SELECT pg_temp.ok(
  (SELECT bool_and(p.evidence_state = x->>'evidence_state')
     FROM prog p
     JOIN public.scp_report_snapshots s
       ON s.attempt_id = p.attempt_id AND s.audience = 'employer'
     CROSS JOIN LATERAL jsonb_array_elements(s.payload) x
    WHERE x->>'competency_code' = p.competency_code),
  'AS6.3 progress echoes the frozen snapshots exactly — it never recomputes');

ROLLBACK;
