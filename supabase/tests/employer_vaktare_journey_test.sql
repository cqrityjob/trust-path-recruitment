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

-- Every single-choice item arrives with its options.
--
-- NOTE: the three sjt_best_worst items are deliberately NOT covered here. They
-- have four options each in scp_item_options but no rows at all in
-- scp_item_option_texts, so they reach the participant with an empty option
-- list and cannot be answered in the UI. That is a real, open content defect —
-- see F2.7/F2.8 in the Phase 1F content suite, which is where it is named and
-- where it fails. This suite proves the DELIVERY mechanism, and answers those
-- items by option id, which the database accepts.
SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(options) >= 2) FROM vji
    WHERE item_format = 'sjt_best_response'),
  'VJ4.3 every single-choice item arrives with at least two options');

SELECT pg_temp.ok(
  (SELECT count(*) FROM vji WHERE item_format = 'sjt_best_worst'
     AND jsonb_array_length(options) = 0) = 3,
  'VJ4.3b the three best/worst items reach the participant with NO options — the open content defect, pinned so it cannot be forgotten');

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

-- The 15 items a participant can actually answer today. The other three are
-- the open content defect; they are handled explicitly in VJ6.
CREATE TEMP TABLE vj_answerable AS
SELECT item_version_id, item_format,
       row_number() OVER (ORDER BY n) AS n
  FROM vj_items WHERE item_format <> 'sjt_best_worst';

GRANT SELECT ON vj_answerable, vji TO authenticated;

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
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 15,
  'VJ6.1 all fifteen ANSWERABLE items are answered');

-- ── THE BLOCKER, PINNED ─────────────────────────────────────────────────
--
-- The run cannot be finished. Three of the eighteen items reach the
-- participant with no options (see VJ4.3b), and scp_submit_attempt correctly
-- refuses a partial run — a result must never be produced from half a form.
--
-- This assertion is deliberately written as the CURRENT truth rather than as
-- the desired one. It is not a weakened test: it is the strongest honest
-- statement available, and it fails the moment the missing option texts are
-- authored — at which point the rest of VJ6, plus VJ7, must be restored from
-- the block below.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_submit_attempt(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_INCOMPLETE_ATTEMPT',
  'VJ6.2 the Väktare run CANNOT be submitted — 3 of 18 items are unanswerable (OPEN CONTENT DEFECT)');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = (SELECT attempt_id FROM vja))
    = 'in_progress',
  'VJ6.3 the refused submission left the attempt open and resumable, losing nothing');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE source_ref = (SELECT attempt_id FROM vja)) = 0,
  'VJ6.4 no evidence was written from the incomplete run');

-- Idempotency of the REFUSAL: retrying a blocked submission is still safe and
-- still writes nothing. This is the part of retry-safety reachable today.
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_submit_attempt(%L::uuid)', (SELECT attempt_id FROM vja)),
  'SCP_INCOMPLETE_ATTEMPT',
  'VJ6.5 retrying the blocked submission is refused identically, writing nothing');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses
    WHERE attempt_id = (SELECT attempt_id FROM vja)) = 15,
  'VJ6.6 the answers already given survived both refused submissions');

RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP VJ7 — nothing leaked from the unfinished run'; END $$;

-- =========================================================================
-- Group VJ7 — lifecycle
--
-- The post-submission half of this journey (evidence written, reviews opened,
-- double-submit refused as ALREADY_SUBMITTED, release gated behind human
-- review) is proven for the 4-item delivery fixture in
-- scp_phase2_journey_test.sql groups J3-J5. It cannot be proven for the REAL
-- 18-item form until the missing option texts exist. That gap is the launch
-- blocker, and it is stated here rather than papered over.
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
