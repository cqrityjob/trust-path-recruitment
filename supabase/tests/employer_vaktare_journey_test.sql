-- The complete Security Guard / Väktare journey, end to end.
--
-- This is the real programme — sg-operational-baseline, 18 items — not the
-- 4-item delivery fixture. The fixture proves the plumbing; only the real
-- form proves the product.
--
--     employer assigns
--       → participant discovers the assignment
--       → starts
--       → answers part of it
--       → leaves
--       → resumes, and the earlier answers are still there
--       → answers the rest
--       → submits
--       → submits again (double-tap, two tabs, retry after timeout)
--       → the result lands in the right lifecycle state
--
-- ── GOVERNANCE ──────────────────────────────────────────────────────────
--
-- sg-operational-baseline is content_status 'draft', validation_status
-- 'design'. It is NOT published and NOT operationally validated, so it cannot
-- be used for selection and no employer may run it by default.
--
-- It runs here under an explicit closed_test grant, which is exactly what that
-- mechanism is for: a controlled pilot of real content, truthfully labelled.
-- The suite asserts both halves — that the grant admits the pilot, and that
-- the same grant can never produce a recruitment assignment.
--
-- Everything happens in one transaction that ends in ROLLBACK.

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

-- ---------------------------------------------------------------------------
-- Fixture: Säkerhet AB, an owner who assigns, and a participant who runs it.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE vj AS
SELECT
  'dd000000-0000-0000-0000-000000000001'::uuid AS employer,
  'dd000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'dd000000-0000-0000-0000-000000000003'::uuid AS participant;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user  FROM vj), 'owner@sakerhet-vj.test'),
  ((SELECT participant FROM vj), 'vaktare@sakerhet-vj.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Säkerhet AB', 'sakerhet-ab-vaktare-journey', 'active' FROM vj;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM vj;

CREATE TEMP TABLE vjv AS
SELECT av.id AS version_id, av.definition_id, av.content_status, av.validation_status,
       (SELECT count(*) FROM public.scp_form_items fi
          JOIN public.scp_forms f ON f.id = fi.form_id
         WHERE f.assessment_version_id = av.id) AS item_count
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC
 LIMIT 1;

-- The fixture ids are read back while acting AS the employer and as the
-- participant, and a temp table is not readable once SET LOCAL ROLE is in
-- effect. Same pattern as the public v3.1 flow suite.
GRANT SELECT ON vj, vjv TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ1 — the real programme, and its honest status'; END $$;

-- =========================================================================
-- Group VJ1 — this is the real 18-item instrument
-- =========================================================================

SELECT pg_temp.ok((SELECT count(*) FROM vjv) = 1,
  'VJ1.1 the Security Guard programme exists');

-- Pinned. Phase 6 requires the COMPLETE form to be run, so if the instrument
-- grows this suite must be re-read rather than quietly run a shorter test.
SELECT pg_temp.ok((SELECT item_count FROM vjv) = 18,
  'VJ1.2 it carries exactly 18 items — the full form, not a smoke test');

SELECT pg_temp.ok(
  (SELECT content_status FROM vjv) = 'draft'
    AND (SELECT validation_status FROM vjv) = 'design',
  'VJ1.3 it is honestly recorded as draft/design — not published, not validated');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ2 — no governance basis, no assignment'; END $$;

-- =========================================================================
-- Group VJ2 — the default is refusal
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM vj), (SELECT version_id FROM vjv), 'vaktare@sakerhet-vj.test'),
  'SCP_NO_GOVERNANCE_BASIS',
  'VJ2.1 without a grant, the pilot programme cannot be assigned at all');

RESET ROLE; RESET request.jwt.claim.sub;

-- The grant. Scoped to this one programme, time-bounded, with a stated reason:
-- what a real controlled pilot looks like.
INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT vj.employer, 'closed_test', vjv.definition_id,
       'Väktare closed pilot — Phase 6 end-to-end proof.',
       vj.owner_user, now() + interval '90 days'
  FROM vj, vjv;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ3 — assignment under a closed-test grant'; END $$;

-- =========================================================================
-- Group VJ3 — the employer assigns, and the basis is recorded
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';

-- The grant admits a PILOT. It must never admit recruitment, whatever the
-- employer asks for — this is the line between a controlled test and a hiring
-- instrument, and it is the single most important assertion in this file.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, %L, %L)',
  (SELECT employer FROM vj), (SELECT version_id FROM vjv),
  'vaktare@sakerhet-vj.test', 'sv', 'recruitment'),
  'SCP_NOT_VALID_FOR_RECRUITMENT',
  'VJ3.1 a closed-test grant can NEVER be used to assess a job candidate');

CREATE TEMP TABLE vja AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM vj), (SELECT version_id FROM vjv),
  'vaktare@sakerhet-vj.test', NULL, 'sv', 'workforce');

RESET ROLE; RESET request.jwt.claim.sub;

GRANT SELECT ON vja TO authenticated;

SELECT pg_temp.ok((SELECT governance_mode FROM vja) = 'closed_test',
  'VJ3.2 the assignment is carried as a closed test, not as recruitment');

SELECT pg_temp.ok(
  (SELECT a.governance_mode FROM public.scp_attempts a
    WHERE a.id = (SELECT attempt_id FROM vja)) = 'closed_test',
  'VJ3.3 the attempt records the basis it was actually taken under');

-- The lineage is what stops a later publication from making this pilot look
-- validated in hindsight.
SELECT pg_temp.ok(
  (SELECT a.content_status_at_assignment = 'draft'
       AND a.validation_status_at_assignment = 'design'
       AND a.test_grant_id IS NOT NULL
     FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM vja)),
  'VJ3.4 the content status, validation status and grant of the day are frozen on it');

SELECT pg_temp.ok(
  (SELECT use_case FROM public.assessment_assignments
    WHERE id = (SELECT assignment_id FROM vja)) = 'workforce',
  'VJ3.5 the assignment is filed as development, matching the people model');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ4 — the participant discovers and starts'; END $$;

-- =========================================================================
-- Group VJ4 — discovery and the served form
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE vji AS
SELECT * FROM public.scp_get_attempt_items((SELECT attempt_id FROM vja), 'sv-SE');

SELECT pg_temp.ok((SELECT count(*) FROM vji) = 18,
  'VJ4.1 the participant is served all 18 items');

SELECT pg_temp.ok(
  (SELECT bool_and(prompt IS NOT NULL AND btrim(prompt) <> '') FROM vji),
  'VJ4.2 every item arrives with Swedish text — the run is genuinely takeable');

-- Every choice item arrives with its options. The three sjt_best_worst items
-- reached the participant with an EMPTY option list until 20260819110000
-- authored the missing scp_item_option_texts rows; this is the assertion that
-- caught it, now covering all choice formats rather than only single-choice.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(options) >= 2) FROM vji
    WHERE item_format <> 'constructed_response'),
  'VJ4.3 every choice item arrives with at least two options');

SELECT pg_temp.ok(
  (SELECT count(*) FROM vji WHERE item_format = 'sjt_best_worst'
     AND jsonb_array_length(options) = 4) = 3,
  'VJ4.3b all three best/worst items arrive with their full four options');

-- Options arrive in authored display order, not in whatever order the join
-- happened to produce. A best/worst item read out of order is a different
-- question from the one that was reviewed.
SELECT pg_temp.ok(
  (SELECT bool_and(labels_ordered) FROM (
     SELECT (SELECT bool_and(o.display_order = ord)
               FROM jsonb_array_elements(v.options) WITH ORDINALITY e(elem, ord)
               JOIN public.scp_item_options o
                 ON o.id = (elem->>'option_id')::uuid) AS labels_ordered
       FROM vji v WHERE v.item_format <> 'constructed_response') s),
  'VJ4.3c options are served in their authored display order');

-- Every served option carries readable text. An option_id with a blank label
-- is unanswerable in the UI even though the payload looks populated.
SELECT pg_temp.ok(
  (SELECT bool_and(btrim(coalesce(elem->>'label','')) <> '')
     FROM vji v, jsonb_array_elements(v.options) elem
    WHERE v.item_format <> 'constructed_response'),
  'VJ4.3d every served option has a non-empty label');

-- The served payload carries the label and nothing else about the option. No
-- score, no rationale, no error type, no best/worst flag.
SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(k IN ('option_id','option_key','label'))
        FROM jsonb_object_keys(elem) k))
     FROM vji v, jsonb_array_elements(v.options) elem
    WHERE v.item_format <> 'constructed_response'),
  'VJ4.3e a served option exposes only its id, key and label — no scoring metadata');

-- The scoring key must not travel with the question. Read from the function's
-- actual result signature, which is what the participant receives.
SELECT pg_temp.ok(
  pg_get_function_result('public.scp_get_attempt_items(uuid,text)'::regprocedure)
    !~* '(score|rubric|correct|is_key|weight)',
  'VJ4.4 no scoring key, rubric or correctness marker reaches the participant');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ5 — answer part, leave, resume'; END $$;

-- =========================================================================
-- Group VJ5 — autosave and resume
-- =========================================================================
--
-- The participant answers the first 7 items, closes the tab, and comes back.
-- "Leaving" is not a database event: the proof that resume works is that the
-- answers are still there and countable on a fresh read, and that the attempt
-- is still open.

CREATE TEMP TABLE vj_items AS
SELECT fi.item_version_id, iv.item_format,
       row_number() OVER (ORDER BY fi.display_order, fi.item_version_id) AS n
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT form_id FROM public.scp_attempts
                      WHERE id = (SELECT attempt_id FROM vja));

GRANT SELECT ON vj_items TO authenticated;

-- One valid answer per item, in the shape its format requires.
--
-- Option ids come from the SERVED payload (vji), never from scp_item_options
-- directly: the item bank is RLS-protected and a participant genuinely cannot
-- read it. Sourcing ids the participant can actually see is the whole point —
-- reaching around RLS here would have hidden the very defect this suite found.
CREATE OR REPLACE FUNCTION pg_temp.answer(_attempt uuid, _ivid uuid, _fmt text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _opts jsonb; _a uuid; _b uuid;
BEGIN
  IF _fmt = 'constructed_response' THEN
    PERFORM public.scp_save_response(_attempt, _ivid, NULL, NULL, NULL,
      'Jag kontaktar min arbetsledare och dokumenterar händelsen i rapporten.');
    RETURN;
  END IF;

  SELECT options INTO _opts FROM vji WHERE item_version_id = _ivid;

  IF _opts IS NULL OR jsonb_array_length(_opts) < 2 THEN
    RAISE EXCEPTION
      'VAKTARE_ITEM_UNANSWERABLE: item % (%) was served with % option(s). A '
      'participant cannot answer it.', _ivid, _fmt,
      coalesce(jsonb_array_length(_opts), 0);
  END IF;

  _a := (_opts->0->>'option_id')::uuid;
  _b := (_opts->(jsonb_array_length(_opts) - 1)->>'option_id')::uuid;

  IF _fmt = 'sjt_best_worst' THEN
    PERFORM public.scp_save_response(_attempt, _ivid, NULL, _a, _b, NULL);
  ELSE
    PERFORM public.scp_save_response(_attempt, _ivid, _a, NULL, NULL, NULL);
  END IF;
END $$;

-- All 18 items are answerable since 20260819110000. Kept as a separate
-- relation (rather than reusing vj_items) so that if any item ever becomes
-- unanswerable again, VJ6.1's count moves and says so.
CREATE TEMP TABLE vj_answerable AS
SELECT item_version_id, item_format,
       row_number() OVER (ORDER BY n) AS n
  FROM vj_items;

GRANT SELECT ON vj_answerable, vji TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM vj_answerable) = 18,
  'VJ5.0 all 18 items are answerable — none is blocked by missing content');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000003';

DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT * FROM vj_answerable WHERE n <= 7 ORDER BY n LOOP
    PERFORM pg_temp.answer((SELECT attempt_id FROM vja), _r.item_version_id, _r.item_format);
  END LOOP;
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 7,
  'VJ5.1 seven answers are saved as the participant goes — autosave, not a final POST');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    = 'in_progress',
  'VJ5.2 the attempt is still open after the participant leaves');

-- An incomplete run must NOT be submittable. A partial submission that scored
-- would be the worst possible defect here: a result produced from half a form.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_submit_attempt(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_INCOMPLETE_ATTEMPT',
  'VJ5.3 a half-finished run cannot be submitted');

-- Resume: the earlier answers are still there, unchanged.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 7,
  'VJ5.4 on resume the seven earlier answers are still present');

-- Re-answering an item overwrites rather than duplicating, so a participant
-- who changes their mind does not end up with two answers to one question.
DO $$
DECLARE _r record;
BEGIN
  SELECT * INTO _r FROM vj_answerable WHERE n = 1;
  PERFORM pg_temp.answer((SELECT attempt_id FROM vja), _r.item_version_id, _r.item_format);
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 7,
  'VJ5.5 changing an answer updates it in place — no duplicate response rows');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ6 — finish all 18 and submit'; END $$;

-- =========================================================================
-- Group VJ6 — completion and idempotent submission
-- =========================================================================

DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT * FROM vj_answerable WHERE n > 7 ORDER BY n LOOP
    PERFORM pg_temp.answer((SELECT attempt_id FROM vja), _r.item_version_id, _r.item_format);
  END LOOP;
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 18,
  'VJ6.1 all 18 items are answered');

-- Both halves of every best/worst answer are stored, and they differ. This is
-- what could not be reached at all while the labels were missing.
-- Item format comes from vj_answerable, not from a join onto
-- scp_item_versions: the item bank is RLS-protected and this assertion runs as
-- the PARTICIPANT, so that join would silently return zero rows and the
-- assertion would fail for a reason that has nothing to do with the answers.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r
     JOIN vj_answerable a ON a.item_version_id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND a.item_format = 'sjt_best_worst'
      AND r.best_option_id IS NOT NULL AND r.worst_option_id IS NOT NULL
      AND r.best_option_id <> r.worst_option_id) = 3,
  'VJ6.1b all three best/worst answers name two distinct options');

-- Submission succeeds. Twelve of the eighteen items are safety-critical, and a
-- safety-critical observation carries a severity that only a human can supply —
-- so those responses are routed to review rather than scored here. The
-- candidate is finished either way: waiting for a reviewer is not their problem.
CREATE TEMP TABLE vjs AS
SELECT * FROM public.scp_submit_attempt((SELECT attempt_id FROM vja));

SELECT pg_temp.ok((SELECT attempt_status FROM vjs) = 'submitted',
  'VJ6.2 the candidate submits the full 18-item run successfully');

SELECT pg_temp.ok((SELECT reviews_opened FROM vjs) = 13,
  'VJ6.3 thirteen responses are routed to human review (12 safety-critical + 1 constructed)');

SELECT pg_temp.ok((SELECT evidence_written FROM vjs) = 5,
  'VJ6.4 only the five non-safety auto-scored responses become evidence immediately');

-- The invariant. No deterministic path may ever mint safety-critical evidence.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.is_safety_critical) = 0,
  'VJ6.5 no safety-critical evidence was fabricated at submission');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE is_safety_critical AND safety_severity IS NULL) = 0,
  'VJ6.5b no safety-critical evidence anywhere lacks a severity');

-- Retry safety. A double-tap, two tabs, or a resubmit after a timeout.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_submit_attempt(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_ATTEMPT_ALREADY_SUBMITTED',
  'VJ6.6 submitting twice is refused, not silently repeated');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_save_response(%L::uuid, %L::uuid, NULL, NULL, NULL, %L)',
  (SELECT attempt_id FROM vja),
  (SELECT item_version_id FROM vj_answerable WHERE n = 1),
  'changed my mind afterwards'),
  'SCP_ATTEMPT_NOT_OPEN',
  'VJ6.8 no answer can be changed after submission');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ7 — awaiting review, nothing released'; END $$;

-- =========================================================================
-- Group VJ7 — the candidate is done; the result is not
-- =========================================================================

-- Checked here rather than inside the participant block above: scp_human_reviews
-- is RLS-protected from the candidate, so counting it as them would report 0
-- and pass for the wrong reason.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_human_reviews hr
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)) = 13,
  'VJ7.0 the refused retry opened no duplicate reviews');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    = 'submitted',
  'VJ7.1 the attempt is submitted — candidate complete, reviewer outstanding');

SELECT pg_temp.ok(
  (SELECT scored_at FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    IS NULL,
  'VJ7.2 it is not scored while reviews remain, which is what the release gate reads');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_human_reviews hr
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND hr.trigger_reason = 'safety_critical_detected') = 12,
  'VJ7.3 all twelve safety-critical observations are queued as such');

-- The employer cannot release over unreviewed work.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_RELEASE_BEFORE_SCORED',
  'VJ7.4 the employer cannot release a report while safety review is outstanding');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 0,
  'VJ7.5 no report snapshot exists before release');

SELECT pg_temp.ok(
  (SELECT a.governance_mode FROM public.scp_attempts a
    WHERE a.id = (SELECT attempt_id FROM vja)) = 'closed_test',
  'VJ7.6 the run is still labelled a closed test');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ9 — who may judge a safety observation'; END $$;

-- =========================================================================
-- Group VJ9 — the review, and who is allowed to perform it
-- =========================================================================

CREATE TEMP TABLE vjr AS
SELECT hr.id AS review_id, hr.trigger_reason
  FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
 WHERE r.attempt_id = (SELECT attempt_id FROM vja)
   AND hr.review_status = 'pending';
GRANT SELECT ON vjr TO authenticated;

-- The candidate may not grade their own safety-critical behaviour.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''mine'', 0.5, ''low'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_NOT_A_REVIEWER',
  'VJ9.1 the candidate cannot set the severity of their own observation');
RESET ROLE; RESET request.jwt.claim.sub;

-- Nor may the employer who commissioned the assessment. Reviewing is an
-- authoring capability precisely so an employer cannot decide what its own
-- candidate's evidence says.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ours'', 0.5, ''high'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_NOT_A_REVIEWER',
  'VJ9.2 the commissioning employer cannot set the severity either');
RESET ROLE; RESET request.jwt.claim.sub;

-- A real reviewer holds the content-review capability.
INSERT INTO auth.users (id, email)
VALUES ('dd000000-0000-0000-0000-000000000004', 'reviewer@sakerhet-vj.test');
INSERT INTO public.scp_content_roles (user_id, role, granted_by)
VALUES ('dd000000-0000-0000-0000-000000000004', 'reviewer',
        'dd000000-0000-0000-0000-000000000002');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000004';

-- Severity is never inferred. Omitting it on a safety-critical observation is
-- refused by name, not by a raw constraint violation.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', 0.5, NULL)',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_SAFETY_SEVERITY_REQUIRED',
  'VJ9.3 a reviewer cannot complete a safety review without stating a severity');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', 0.5, ''catastrophic'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_BAD_SAFETY_SEVERITY',
  'VJ9.4 an invented severity value is refused');

-- And a NON-safety observation may not carry one.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', 0.5, ''low'')',
  (SELECT review_id FROM vjr WHERE trigger_reason <> 'safety_critical_detected' LIMIT 1)),
  'SCP_SEVERITY_ON_NON_SAFETY_ITEM',
  'VJ9.5 a non-safety observation refuses to carry a severity');

-- A rationale is always required: a severity with no reasoning is not a review.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''  '', 0.5, ''medium'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_REVIEW_WITHOUT_RATIONALE',
  'VJ9.6 a review decision must state its reasons');

-- Now do the work: every outstanding review, with a severity on each
-- safety-critical one.
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT * FROM vjr LOOP
    PERFORM public.scp_complete_human_review(
      _r.review_id, 'upheld',
      'Bedömd mot observerbart beteende i scenariot.',
      0.5,
      CASE WHEN _r.trigger_reason = 'safety_critical_detected' THEN 'medium' END);
  END LOOP;
END $$;

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_human_reviews hr
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND hr.review_status = 'pending') = 0,
  'VJ9.7 every outstanding review is completed');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    = 'scored'
  AND (SELECT scored_at FROM public.scp_attempts
        WHERE id = (SELECT attempt_id FROM vja)) IS NOT NULL,
  'VJ9.8 the attempt becomes scored only once no review remains');

-- Provenance: reviewed safety evidence names its reviewer and its severity.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.is_safety_critical
      AND e.safety_severity = 'medium'
      AND e.provenance_type = 'human_review'
      AND e.assessor_actor_id = 'dd000000-0000-0000-0000-000000000004') = 12,
  'VJ9.9 all twelve safety observations carry a severity and a named reviewer');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ10 — release, and what each side sees'; END $$;

-- =========================================================================
-- Group VJ10 — the release gate
-- =========================================================================

-- A different organisation's owner cannot release this attempt.
INSERT INTO auth.users (id, email)
VALUES ('dd000000-0000-0000-0000-000000000005', 'other-owner@elsewhere.test');
INSERT INTO public.employers (id, name, slug, status)
VALUES ('dd000000-1111-0000-0000-000000000009', 'Annan AB', 'annan-ab-vj', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('dd000000-1111-0000-0000-000000000009',
        'dd000000-0000-0000-0000-000000000005', 'owner', 'active');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000005';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'VJ10.1 an owner of another organisation cannot release this result');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE vjrel AS
SELECT * FROM public.scp_release_attempt_report((SELECT attempt_id FROM vja));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT participant_snapshot FROM vjrel) IS NOT NULL
  AND (SELECT employer_snapshot FROM vjrel) IS NOT NULL,
  'VJ10.2 once review is complete the employer can release both reports');

SELECT pg_temp.ok(
  (SELECT released_at FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    IS NOT NULL,
  'VJ10.3 the attempt records when it was released');

-- Severity survives release. A released report must still be able to state the
-- basis of a safety observation.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.is_safety_critical AND e.safety_severity IS NOT NULL) = 12,
  'VJ10.4 severity persists after release');

-- Releasing twice is refused; snapshots are immutable.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_ALREADY_RELEASED',
  'VJ10.5 a second release is refused — snapshots are immutable');
RESET ROLE; RESET request.jwt.claim.sub;

-- Reassessment must not rewrite history. Completing the same review again is
-- refused, so an old severity can never be silently replaced.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''overturned'', ''second thoughts'', 0.9, ''low'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_REVIEW_NOT_PENDING',
  'VJ10.6 a completed review cannot be re-decided, so history is not overwritten');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ8 — the grant is bounded'; END $$;

-- =========================================================================
-- Group VJ8 — revocation and expiry
-- =========================================================================
--
-- A pilot that cannot end is not a pilot. Revoking the grant must stop NEW
-- assignments without rewriting the history of the one already taken.

UPDATE public.scp_test_grants SET revoked_at = now()
 WHERE employer_id = (SELECT employer FROM vj);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
  (SELECT employer FROM vj), (SELECT version_id FROM vjv), 'owner@sakerhet-vj.test'),
  'SCP_NO_GOVERNANCE_BASIS',
  'VJ8.1 once the grant is revoked, no new pilot assignment is possible');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT a.governance_mode FROM public.scp_attempts a
    WHERE a.id = (SELECT attempt_id FROM vja)) = 'closed_test'
  AND (SELECT a.test_grant_id FROM public.scp_attempts a
        WHERE a.id = (SELECT attempt_id FROM vja)) IS NOT NULL,
  'VJ8.2 revocation does not rewrite the basis of the run already taken');

DO $$ BEGIN RAISE NOTICE 'employer_vaktare_journey_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
