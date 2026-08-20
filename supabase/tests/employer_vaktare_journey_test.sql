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

-- Rewritten for the governed evidence model. Demanding a SEVERITY on every
-- safety-critical row is exactly what forced reviewers to grade a correct
-- answer. What must hold is that a classified item never produces evidence
-- without a reviewer's CONCLUSION -- and 'no_concern' is one.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE is_safety_critical AND safety_finding IS NULL) = 0,
  'VJ6.5b no safety-critical evidence anywhere lacks a reviewer finding');

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
SELECT hr.id AS review_id, hr.trigger_reason, r.id AS response_id,
       iv.id AS item_version_id, iv.item_format, iv.is_safety_critical, i.slug
  FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
  JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE r.attempt_id = (SELECT attempt_id FROM vja)
   AND hr.review_status = 'pending';
GRANT SELECT ON vjr TO authenticated;

-- The candidate may not grade their own safety-critical behaviour.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''mine'', ''low'')',
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
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ours'', ''high'')',
  (SELECT review_id FROM vjr WHERE trigger_reason = 'safety_critical_detected' LIMIT 1)),
  'SCP_NOT_A_REVIEWER',
  'VJ9.2 the commissioning employer cannot set the severity either');
RESET ROLE; RESET request.jwt.claim.sub;

-- #51. A response reviewer is authorised by the employer, and is a member of
-- it. The content role is kept to prove the two capabilities are now separate:
-- holding it is neither sufficient (authorisation is required) nor implied by
-- being an employer member.
INSERT INTO auth.users (id, email)
VALUES ('dd000000-0000-0000-0000-000000000004', 'reviewer@sakerhet-vj.test');
INSERT INTO public.scp_content_roles (user_id, role, granted_by)
VALUES ('dd000000-0000-0000-0000-000000000004', 'reviewer',
        'dd000000-0000-0000-0000-000000000002');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, 'dd000000-0000-0000-0000-000000000004', 'member', 'active' FROM vj;
INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, 'dd000000-0000-0000-0000-000000000004',
       ARRAY['workforce','recruitment']::text[], owner_user FROM vj;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000004';

-- Severity is never inferred. Omitting it on a safety-critical observation is
-- refused by name, not by a raw constraint violation.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', NULL)',
  (SELECT review_id FROM vjr WHERE is_safety_critical LIMIT 1)),
  'SCP_SAFETY_FINDING_REQUIRED',
  'VJ9.3 a reviewer cannot complete a safety review without stating a finding');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', ''catastrophic'')',
  (SELECT review_id FROM vjr WHERE is_safety_critical LIMIT 1)),
  'SCP_BAD_SAFETY_FINDING',
  'VJ9.4 an invented finding value is refused');

-- And a NON-safety observation may not carry one.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', ''low'')',
  (SELECT review_id FROM vjr WHERE NOT is_safety_critical LIMIT 1)),
  'SCP_FINDING_ON_NON_SAFETY_ITEM',
  'VJ9.5 a non-safety observation refuses to carry a finding');

-- A rationale is always required: a finding with no reasoning is not a review.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''  '', ''medium'')',
  (SELECT review_id FROM vjr WHERE is_safety_critical LIMIT 1)),
  'SCP_REVIEW_WITHOUT_RATIONALE',
  'VJ9.6 a review decision must state its reasons');

-- ── The two properties owner decision A and B exist to guarantee ─────────
--
-- The governed overload declares no contribution PARAMETER. Asserted on the
-- parameter list, not the body: the body legitimately contains a local
-- `_contribution` variable holding the value it DERIVES, so a body test would
-- fail on correct code.
--
-- The earlier form of this assertion compared
-- `pg_get_function_identity_arguments(oid)` against 'uuid, text, text, text,
-- jsonb'. That function returns parameter NAMES as well as types
-- ('_review_id uuid, _outcome text, ...'), so the predicate matched zero rows
-- and the assertion passed vacuously -- the same defect this suite's F7 group
-- was written to correct in 20260819110000. Found by verifying the hosted
-- result after the migration was applied. The regprocedure cast below raises if
-- the function is absent, so it cannot silently match nothing.
SELECT pg_temp.ok(
  pg_get_function_identity_arguments(
    'public.scp_complete_human_review(uuid,text,text,text,jsonb)'::regprocedure)
    NOT LIKE '%_contribution%',
  'VJ9.3b the governed overload declares no contribution parameter');

-- VJ9.3b2 removed with F2: it asserted the behaviour of the deprecated
-- overload, which no longer exists. VJ12 now asserts its absence instead.

-- A constructed response cannot be completed without its rubric, and cannot be
-- completed with only part of it. A missing dimension is a judgement the
-- reviewer did not make.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', ''no_concern'')',
  (SELECT review_id FROM vjr WHERE item_format = 'constructed_response'
     AND is_safety_critical LIMIT 1)),
  'SCP_RUBRIC_LEVELS_REQUIRED',
  'VJ9.3c a constructed response cannot be scored without its rubric');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ok'', ''no_concern'', %L::jsonb)',
  (SELECT review_id FROM vjr WHERE item_format = 'constructed_response'
     AND is_safety_critical LIMIT 1),
  (SELECT jsonb_build_object(min(d.dimension_key), 3)::text
     FROM public.scp_rubric_dimensions d
     JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
    WHERE rv.item_version_id = (SELECT item_version_id FROM vjr
                                 WHERE item_format = 'constructed_response'
                                   AND is_safety_critical LIMIT 1))),
  'SCP_RUBRIC_DIMENSION_MISSING',
  'VJ9.3d a partial rubric is refused rather than averaged');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ12 — the transition surface is gone'; END $$;

-- =========================================================================
-- Group VJ12 — F2: the deploy-window compatibility surface is removed
-- =========================================================================
--
-- The deprecated five-argument overload and the severity_required queue alias
-- existed for exactly one deploy window. They are gone, and these assertions
-- exist so nobody restores them by accident: a stale client using the legacy
-- signature cannot express 'no_concern', so it would silently record `low` on
-- a correct answer -- the over-flagging defect the governed model was built to
-- remove, re-enterable through one un-refreshed browser.

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_complete_human_review') = 1,
  'VJ12.1 exactly one scp_complete_human_review overload survives');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_complete_human_review'
      AND pg_get_function_identity_arguments(p.oid) LIKE '%numeric%') = 0,
  'VJ12.2 the deprecated numeric overload is no longer callable');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.parameters p
     JOIN information_schema.routines r ON r.specific_name = p.specific_name
    WHERE r.routine_schema = 'public' AND r.routine_name = 'scp_review_queue'
      AND p.parameter_name = 'severity_required') = 0,
  'VJ12.3 the severity_required alias is gone from the queue');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.parameters p
     JOIN information_schema.routines r ON r.specific_name = p.specific_name
    WHERE r.routine_schema = 'public' AND r.routine_name = 'scp_review_queue'
      AND p.parameter_name = 'finding_required') = 1,
  'VJ12.4 finding_required survived the removal');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.scp_complete_human_review(uuid, text, text, text, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_review_queue(text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_review_queue(text)', 'EXECUTE'),
  'VJ12.5 ACLs survived the drop and recreate: anon out, reviewers in');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''ours'', ''low''::text, NULL::jsonb)',
  (SELECT review_id FROM vjr WHERE slug = 'sg-b-16')),
  'SCP_NOT_A_REVIEWER',
  'VJ12.6 the commissioning employer still cannot complete a review');
RESET ROLE; RESET request.jwt.claim.sub;


-- VJ12 above resets the session identity when it finishes, so the reviewer is
-- re-established here rather than inherited.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000004';

-- Now do the work. Three deliberately different reviewer decisions, chosen by
-- item slug so the run is deterministic:
--
--   sg-b-10  a real safety concern      -> upheld, finding 'high'
--   sg-b-17  the reading is disputed    -> overturned, no evidence written
--   everything else                     -> upheld, and for a classified item
--                                          the finding a good answer deserves:
--                                          'no_concern'
--
-- Constructed responses carry rubric levels, with the STYLE dimension set to 0
-- and every construct-bearing one to 4. If writing quality were allowed to
-- contribute, the derived value would be 0.750 rather than 1.000, so the
-- assertion below distinguishes the two rather than merely accepting a number.
DO $$
DECLARE _r record; _levels jsonb;
BEGIN
  -- Skips the two VJ12 already completed through the legacy signature.
  FOR _r IN
    SELECT v.* FROM vjr v
      JOIN public.scp_human_reviews hr ON hr.id = v.review_id
     WHERE hr.review_status = 'pending'
     ORDER BY v.slug
  LOOP
    _levels := NULL;
    IF _r.item_format = 'constructed_response' THEN
      SELECT jsonb_object_agg(d.dimension_key,
               CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
        INTO _levels
        FROM public.scp_rubric_dimensions d
        JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
       WHERE rv.item_version_id = _r.item_version_id;
    END IF;

    PERFORM public.scp_complete_human_review(
      _r.review_id,
      CASE WHEN _r.slug = 'sg-b-17' THEN 'overturned' ELSE 'upheld' END,
      'Bedömd mot observerbart beteende i scenariot.',
      CASE WHEN _r.is_safety_critical THEN
             CASE WHEN _r.slug = 'sg-b-10' THEN 'high' ELSE 'no_concern' END
      END,
      _levels);
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

-- Provenance: every reviewed safety observation names its reviewer and carries
-- the reviewer's finding. Eleven of the twelve are 'no_concern' -- which is the
-- point. Before this model they would have been twelve invented severities.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.is_safety_critical
      AND e.provenance_type = 'human_review'
      AND e.assessor_actor_id = 'dd000000-0000-0000-0000-000000000004') = 12,
  'VJ9.9 all twelve safety observations name their reviewer');

-- Eleven of the twelve cleared: twelve safety-critical items minus sg-b-10's
-- real finding. Before the governed model all twelve would have carried an
-- invented severity.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.safety_finding = 'no_concern' AND e.safety_severity IS NULL) = 11,
  'VJ9.9b eleven safety-critical items were cleared, and carry no severity');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.safety_finding = 'high' AND e.safety_severity = 'high') = 1,
  'VJ9.9c the one real concern is recorded as a concern, severity and all');

-- ── The contribution is derived, and the reviewer never chose it ─────────
--
-- Recomputed here from the item bank, independently of the function, so this
-- asserts the DERIVATION rather than a remembered number.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.provenance_type = 'human_review'
      AND iv.item_format = 'sjt_best_response'
      AND e.contribution <> round(
            COALESCE((SELECT o.score_value FROM public.scp_item_options o
                       WHERE o.id = r.selected_option_id), 0)
            / NULLIF((SELECT max(o2.score_value) FROM public.scp_item_options o2
                       WHERE o2.item_version_id = iv.id), 0), 3)) = 0,
  'VJ9.10 every reviewed SJT contribution equals the governed item score');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.provenance_type = 'human_review'
      AND iv.item_format = 'sjt_best_worst'
      AND e.contribution <> round((
            COALESCE((SELECT CASE WHEN o.is_best_key THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = r.best_option_id), 0)
          + COALESCE((SELECT CASE WHEN o.is_worst_key THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = r.worst_option_id), 0)
            ) / 2.0, 3)) = 0,
  'VJ9.11 every reviewed best/worst contribution equals the governed keys');

-- Style scored 0, construct dimensions scored 4. 1.000 proves the style
-- dimension was excluded; 0.750 would prove it was not.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND iv.item_format = 'constructed_response'
      AND e.contribution = 1.000) = 2,
  'VJ9.12 constructed-response contributions come from the rubric, and writing style does not count');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_rubric_scores rs
     JOIN public.scp_human_reviews hr ON hr.id = rs.review_id
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)) = 12,
  'VJ9.13 every rubric level the reviewer chose is persisted (3 items x 4 dimensions)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.provenance_type = 'human_review'
      AND e.derivation_basis IS NULL) = 0,
  'VJ9.14 every reviewed row records how its number was produced');

-- ── A disputed reading writes nothing, and hides nothing ────────────────
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja) AND i.slug = 'sg-b-17') = 0,
  'VJ9.15 an overturned reading writes no competency contribution at all');

SELECT pg_temp.ok(
  (SELECT outcome FROM public.scp_human_reviews hr
     JOIN public.scp_candidate_responses r ON r.id = hr.response_id
     JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE r.attempt_id = (SELECT attempt_id FROM vja) AND i.slug = 'sg-b-17')
    = 'overturned'
  AND (SELECT reviewer_rationale IS NOT NULL FROM public.scp_human_reviews hr
         JOIN public.scp_candidate_responses r ON r.id = hr.response_id
         JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
         JOIN public.scp_items i ON i.id = iv.item_id
        WHERE r.attempt_id = (SELECT attempt_id FROM vja) AND i.slug = 'sg-b-17'),
  'VJ9.16 the disputed review, its outcome and its reasoning are all preserved');

-- A recorded rubric level is not editable afterwards.
SELECT pg_temp.must_fail(
  'UPDATE public.scp_review_rubric_scores SET level = 0',
  'SCP_RUBRIC_SCORE_APPEND_ONLY',
  'VJ9.17 a recorded rubric level cannot be rewritten');

DO $$ BEGIN RAISE NOTICE 'GROUP VJ13 — F1: a review completes exactly once'; END $$;

-- =========================================================================
-- Group VJ13 — F1: the completion race
-- =========================================================================
--
-- Before this fix, scp_complete_human_review checked `review_status = pending`
-- in its opening lookup and then completed with an UPDATE carrying no status
-- predicate and no lock. Two reviewers -- or one reviewer in two tabs -- both
-- passed the lookup and BOTH inserted competency evidence for the same
-- response, permanently, into an append-only ledger. The maturity functions
-- de-duplicate, so it stayed invisible there; the employer report does not,
-- and would have rendered a duplicated safety finding in an immutable snapshot.
--
-- A single session cannot hold two real transactions here, so this asserts the
-- property that actually protects the ledger: once a review is completed, a
-- second completion is refused BY NAME and writes nothing. That is the state
-- the losing transaction of a genuine race arrives at after the winner commits.

CREATE TEMP TABLE vj13 AS
SELECT hr.id AS review_id,
       (SELECT count(*) FROM public.scp_competency_evidence e
         WHERE e.provenance_ref = hr.id) AS evidence_before
  FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
  JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE r.attempt_id = (SELECT attempt_id FROM vja) AND i.slug = 'sg-b-09';
GRANT SELECT ON vj13 TO authenticated;

SELECT pg_temp.ok((SELECT evidence_before FROM vj13) = 1,
  'VJ13.1 the completed safety review wrote exactly one evidence row');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'dd000000-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_complete_human_review(%L::uuid, ''upheld'', ''andra forsoket'', ''high''::text, NULL::jsonb)',
  (SELECT review_id FROM vj13)),
  'SCP_REVIEW_NOT_PENDING',
  'VJ13.2 a second completion of the same review is refused by name');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
    WHERE e.provenance_ref = (SELECT review_id FROM vj13)) = 1,
  'VJ13.3 and the refused attempt wrote no second evidence row');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_human_reviews hr
    WHERE hr.id = (SELECT review_id FROM vj13) AND hr.review_status = 'completed') = 1
  AND (SELECT hr.reviewer_rationale <> 'andra forsoket' FROM public.scp_human_reviews hr
        WHERE hr.id = (SELECT review_id FROM vj13)),
  'VJ13.4 the first reviewer''s decision and reasoning are not overwritten');

-- No response in this attempt ended up with more than one live evidence row,
-- which is the ledger-level statement of the same property.
SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT e.source_ref
       FROM public.scp_competency_evidence e
       JOIN public.scp_candidate_responses r ON r.id = e.source_ref
      WHERE r.attempt_id = (SELECT attempt_id FROM vja)
        AND e.provenance_type = 'human_review'
        AND e.superseded_by IS NULL
      GROUP BY e.source_ref HAVING count(*) > 1) dupes) = 0,
  'VJ13.5 no response carries duplicate live human-review evidence');

-- And the released employer report therefore cannot double-count a finding.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.safety_finding IN ('low','medium','high','critical')) = 1,
  'VJ13.6 exactly one real safety finding exists to be reported');

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

-- The finding survives release: a released report must still be able to state
-- the basis of every safety-critical observation, including the cleared ones.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT attempt_id FROM vja)
      AND e.is_safety_critical AND e.safety_finding IS NOT NULL) = 12,
  'VJ10.4 every safety-critical finding persists after release');

-- ── The alert an employer sees is a finding, not a category ─────────────
--
-- Twelve items were classified safety-critical; one reviewer found something.
-- Before this model the employer report carried twelve flags on every run,
-- which is the same as carrying none.
-- One finding, not twelve classified items. Before this model it was twelve on
-- every run.
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja) AND audience = 'employer') = 1,
  'VJ10.7 the employer report flags the one real finding, not the twelve items');

SELECT pg_temp.ok(
  (SELECT safety_flags @> '[{"finding":"high"}]'::jsonb
     FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja) AND audience = 'employer')
  AND (SELECT count(*) FROM public.scp_report_snapshots sn,
                            jsonb_array_elements(sn.safety_flags) f
        WHERE sn.attempt_id = (SELECT attempt_id FROM vja) AND sn.audience = 'employer'
          AND f->>'finding' = 'no_concern') = 0,
  'VJ10.8 the flags carry the reviewers'' actual findings, and no cleared item among them');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja)
      AND audience = 'participant'
      AND jsonb_array_length(safety_flags) > 0) = 0,
  'VJ10.9 the participant snapshot still carries no severity-bearing flag');

-- The participant is told a review happened -- true for everybody -- and the
-- concern count is the number of real findings, so a clean run cannot produce
-- a sentence saying the participant raised one.
SELECT pg_temp.ok(
  (SELECT (context->>'safety_concerns')::int FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja) AND audience = 'employer') = 1
  AND (SELECT (context->>'safety_concern_present')::boolean
         FROM public.scp_report_snapshots
        WHERE attempt_id = (SELECT attempt_id FROM vja) AND audience = 'participant'),
  'VJ10.10 the report counts findings, not safety-critical items');

-- A competency whose only review was overturned still appears, as a follow-up,
-- rather than disappearing from the report because no evidence was written.
SELECT pg_temp.ok(
  EXISTS (
    SELECT 1 FROM public.scp_report_snapshots sn,
                  jsonb_array_elements(sn.payload) line
     WHERE sn.attempt_id = (SELECT attempt_id FROM vja) AND sn.audience = 'employer'
       AND line->>'competency_code' = 'SCC-06'
       AND line->>'evidence_state' IN ('follow_up','critical_follow_up')),
  'VJ10.11 the disputed competency is still reported, as a follow-up');

-- ── The corrected competency mappings, as the report actually renders ───
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_report_snapshots sn,
                  jsonb_array_elements(sn.payload) line
     WHERE sn.attempt_id = (SELECT attempt_id FROM vja)
       AND line->>'competency_code' = 'SCC-05'),
  'VJ10.12 no report line claims Emotionell självreglering, which the programme says it does not measure');

SELECT pg_temp.ok(
  EXISTS (
    SELECT 1 FROM public.scp_report_snapshots sn,
                  jsonb_array_elements(sn.payload) line
     WHERE sn.attempt_id = (SELECT attempt_id FROM vja)
       AND line->>'competency_code' = 'SCC-07'),
  'VJ10.13 de-escalation evidence is reported under SCC-07 instead');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots sn,
                        jsonb_array_elements(sn.payload) line
    WHERE sn.attempt_id = (SELECT attempt_id FROM vja) AND sn.audience = 'employer'
      AND (line->>'followup_sv' IS NULL OR line->>'followup_en' IS NULL)) = 0,
  'VJ10.14 every reported competency still reaches a follow-up prompt in both languages');

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
  'SELECT public.scp_complete_human_review(%L::uuid, ''overturned'', ''second thoughts'', ''low'')',
  (SELECT review_id FROM vjr WHERE is_safety_critical LIMIT 1)),
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

DO $$ BEGIN RAISE NOTICE 'GROUP VJ11 — the v1 content and governance corrections'; END $$;

-- =========================================================================
-- Group VJ11 — what 20260823100000 fixed, asserted against stored data
-- =========================================================================
--
-- These hold independently of the run above. They exist here rather than in a
-- new suite because they are properties of the same programme, and a suite
-- that shares the fixture cannot drift from it.

-- Version 1 of all eight. proportional_decision_making stays on SCC-04 here:
-- six PUBLISHED fixture item versions share that version, and moving it was
-- refused by scp_guard_published_immutable -- correctly. The SG programme uses
-- version 2 instead, asserted in VJ11.1b.
SELECT pg_temp.ok(
  (SELECT count(*) FROM (VALUES
      ('de_escalation','SCC-07'), ('factual_reporting','SCC-06'),
      ('proportional_decision_making','SCC-04'),
      ('situational_judgement','SCC-03'), ('mandate_and_escalation','SCC-09'),
      ('operational_communication','SCC-06'), ('operational_coordination','SCC-08'),
      ('integrity_and_information_handling','SCC-01')
    ) AS v(behaviour_slug, competency_code)
    JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
    JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id AND c.code = v.competency_code) = 8,
  'VJ11.1 version 1 of all eight behaviours maps where the owner decided');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
     JOIN public.scp_behaviour_versions bv ON bv.id = iv.primary_behaviour_id
     JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
     JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
     JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
     JOIN public.scp_competencies c ON c.id = cv.competency_id
    WHERE i.slug IN ('sg-b-03','sg-b-04','sg-b-13')
      AND b.slug = 'proportional_decision_making'
      AND bv.version_number = 2 AND c.code = 'SCC-11') = 3,
  'VJ11.1b sg-b-03/04/13 resolve to SCC-11 through behaviour version 2');

-- Every behaviour version reaches exactly one competency: no ambiguity, no orphan.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_behaviour_versions bv
    WHERE (SELECT count(*) FROM public.scp_behaviour_competency_map m
            WHERE m.behaviour_version_id = bv.id) <> 1) = 0,
  'VJ11.1c every behaviour version maps to exactly one competency');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
    WHERE iv.primary_behaviour_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.scp_behaviour_competency_map m
          JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
         WHERE m.behaviour_version_id = iv.primary_behaviour_id
           AND cv.competency_id = iv.competency_id)) = 0,
  'VJ11.2 no item claims a competency its behaviour cannot reach');

-- The best is never presented first, and the three items do not share a
-- pattern -- so noticing the shape of one teaches nothing about the next.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
      AND o.is_best_key AND o.display_order = 1) = 0,
  'VJ11.3 no SG best/worst item presents its best option first');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT pattern) FROM (
     SELECT max(o.display_order) FILTER (WHERE o.is_best_key) * 10
          + max(o.display_order) FILTER (WHERE o.is_worst_key) AS pattern
       FROM public.scp_item_options o
       JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
       JOIN public.scp_items i ON i.id = iv.item_id
      WHERE i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
      GROUP BY o.item_version_id) p) = 3,
  'VJ11.4 the three best/worst items show three different presentation patterns');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_option_texts t
     JOIN public.scp_item_options o ON o.id = t.item_option_id
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'sg-b-03' AND o.option_key = 'A'
      AND (t.label ILIKE '%vård%' OR t.label ILIKE '%medical help%')) = 2,
  'VJ11.5 sg-b-03 option A names the care assessment in both languages');

SELECT pg_temp.ok(
  (SELECT av.language_scope @> ARRAY['sv-SE','en-GB']
     FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'sg-operational-baseline' AND av.version_number = 1),
  'VJ11.6 the version declares both languages it actually delivers');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_texts t
     JOIN public.scp_item_versions iv ON iv.id = t.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND t.adaptation_status <> 'adaptation_pending') = 0,
  'VJ11.7 and declaring the scope did not clear the adaptation gate');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_items i
     JOIN public.scp_item_versions iv ON iv.item_id = i.id
    WHERE i.slug IN ('sg-b-02','sg-b-04','sg-b-05','sg-b-06','sg-b-15','sg-b-18')
      AND iv.legal_basis_required AND iv.legal_review_status = 'pending') = 6,
  'VJ11.8 all six legal subjects are consistently required and pending');

-- The assertion that matters most in a governance change: nothing was approved.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (iv.sme_review_status = 'approved' OR iv.bias_review_status = 'approved'
        OR iv.cognitive_review_status = 'passed' OR iv.language_review_status = 'passed'
        OR iv.accessibility_review_status = 'passed'
        OR iv.legal_review_status = 'approved')) = 0,
  'VJ11.9 not one review gate was cleared by any of this');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_requirements WHERE status <> 'outstanding') = 0,
  'VJ11.10 every review requirement is still outstanding');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_test_grants WHERE purpose = 'recruitment') = 0,
  'VJ11.11 no recruitment grant exists, and the CHECK makes one unstorable');

DO $$ BEGIN RAISE NOTICE 'employer_vaktare_journey_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
