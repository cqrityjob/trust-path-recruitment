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

-- ── THE SECOND BLOCKER, PINNED ──────────────────────────────────────────
--
-- Submission now reaches the scoring path — the option-label defect is gone —
-- and fails there instead.
--
-- scp_submit_attempt writes each response as competency evidence, copying
-- is_safety_critical from the item but NEVER setting safety_severity.
-- scp_evidence_safety_is_specified requires a severity whenever the evidence
-- is safety-critical, so the INSERT is refused and the whole submission aborts.
--
-- Twelve of the eighteen Väktare items are safety-critical. Ten of those do not
-- require human review, so they take this deterministic path. The 4-item
-- delivery fixture has ZERO safety-critical items, which is exactly why 102
-- journey assertions passed for years while this was broken.
--
-- There is no authored severity anywhere in the content model — not on the item
-- version, not on the behaviour version. The only severity input in the whole
-- system is the _safety_severity parameter of scp_complete_human_review, i.e.
-- a REVIEWER's judgement. The schema states the intent plainly: "A
-- safety-critical observation must state how severe and must be reviewable."
--
-- Resolving it is a governance decision, not an engineering one — see the
-- engineering report. Defaulting a severity here would fabricate a safety
-- judgement about a security guard's behaviour, which is precisely what the
-- constraint exists to prevent.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_submit_attempt(%L::uuid)', (SELECT attempt_id FROM vja)),
  'scp_evidence_safety_is_specified',
  'VJ6.2 submission FAILS — safety-critical evidence has no severity (OPEN GOVERNANCE BLOCKER)');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    = 'in_progress',
  'VJ6.3 the failed submission left the attempt open and resumable, losing nothing');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE source_ref = (SELECT attempt_id FROM vja)) = 0,
  'VJ6.4 the aborted submission wrote no partial evidence');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 18,
  'VJ6.5 all 18 answers survived the failed submission');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ7 — nothing leaked from the unfinished run'; END $$;

-- =========================================================================
-- Group VJ7 — lifecycle
--
-- The post-submission half (evidence, reviews opened, ALREADY_SUBMITTED on
-- retry, release gated behind human review) is proven for the 4-item delivery
-- fixture in scp_phase2_journey_test.sql groups J3-J5. It cannot be proven for
-- the real 18-item form until the safety-severity question is answered.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT released_at FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    IS NULL,
  'VJ7.1 nothing is released to the employer from an unfinished run');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 0,
  'VJ7.2 no report snapshot exists for an unfinished run');

-- The pilot basis stays attached regardless of how far the run got.
SELECT pg_temp.ok(
  (SELECT a.governance_mode FROM public.scp_attempts a
    WHERE a.id = (SELECT attempt_id FROM vja)) = 'closed_test',
  'VJ7.3 the run is still labelled a closed test');

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
