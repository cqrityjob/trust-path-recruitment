-- #63 — Separation of duties stops being a wall and becomes a disclosure.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────
--
-- #51 gave an employer the right to authorise its own reviewers, and then made
-- that right unusable for most real customers. scp_review_conflict refused four
-- situations outright, and two of them describe the ordinary behaviour of a
-- small employer:
--
--   assigned_this_assessment   the member who sent the assessment out
--   acted_on_this_application  anyone who moved the candidate's application
--
-- On this platform's own reference tenant that is the SAME PERSON as the only
-- authorised reviewer. The owner of Säkerhet AB holds a live reviewer grant for
-- both use cases, and still sees "Mina granskningsuppgifter: 0" above fourteen
-- waiting responses, because they assigned one attempt and moved the other's
-- application. The product's answer was: hire a second human, or create a
-- second login. For a two-person guarding firm that is not an answer.
--
-- ── WHY THIS IS SAFE TO NARROW ──────────────────────────────────────────
--
-- Nothing in this repository requires reviewer independence as a legal control.
-- docs/assessment/governance/ai-and-human-oversight.md puts the legal weight
-- (GDPR Article 22, IMY guidance) on the EMPLOYMENT DECISION being made by a
-- person who can disagree with the test and must document their reasoning --
-- not on that person being different from whoever reviewed a free-text answer.
-- The independence rule was a product judgement recorded in the #51 migration
-- header, and it is being revisited as one.
--
-- What actually protects the candidate is unchanged by this migration:
--
--   * a human still judges every response that needs judging
--   * the reviewer still needs an explicit, revocable employer authorisation
--     naming this use case
--   * the reviewer still has to state reasons, which are recorded against them
--   * no score, and now no conflict, ever becomes a hire/reject recommendation
--
-- ── WHAT STAYS AN ABSOLUTE REFUSAL ──────────────────────────────────────
--
--   is_participant              nobody grades their own answers, ever. This is
--                               not a workflow inconvenience, it is the thing
--                               that makes the evidence mean anything.
--   recorded_employer_decision  reviewing an attempt you have already decided
--                               on is retro-justification. It cannot arise in
--                               the ordinary order of events (review precedes
--                               release precedes decision), so refusing it
--                               costs a legitimate reviewer nothing.
--   unknown_attempt             not a judgement, just an unknown id.
--
-- ── WHAT REPLACES THE REFUSAL ───────────────────────────────────────────
--
-- Disclosure. The two narrowed rules are still computed, still named, and are
-- now WRITTEN ONTO THE REVIEW ROW when it completes -- exactly as break-glass
-- already is. So the audit trail gets stronger, not weaker: previously these
-- reviews could not happen and left no trace, and the platform's own backlog
-- was instead being cleared under `reviewed_under_break_glass` by a platform
-- administrator, which records LESS about why.
--
-- ── ADDITIVE ────────────────────────────────────────────────────────────
--
-- One nullable column, one new disclosure function, one new read model, one
-- trigger. scp_review_conflict keeps its signature and its meaning ("the reason
-- this person may not review"), so the queue and workload predicates are
-- untouched and the invariant guard in 20260829095000 still holds.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A disclosed conflict is a recorded fact
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_human_reviews
  ADD COLUMN IF NOT EXISTS reviewer_conflict_disclosed text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'scp_human_reviews_disclosed_conflict_valid') THEN
    ALTER TABLE public.scp_human_reviews
      ADD CONSTRAINT scp_human_reviews_disclosed_conflict_valid
      CHECK (reviewer_conflict_disclosed IS NULL
             OR reviewer_conflict_disclosed IN
                ('assigned_this_assessment','acted_on_this_application'));
  END IF;
END $$;

COMMENT ON COLUMN public.scp_human_reviews.reviewer_conflict_disclosed IS
  'The separation-of-duties situation this reviewer was in when they completed '
  'this review -- they commissioned the assessment, or they had moved the '
  'candidate''s application. Permitted for an employer-authorised reviewer, '
  'never silent. NULL means no such situation applied.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The narrowed blocking rule
--
-- Same name, same signature, same contract: "the reason this person must not
-- review this attempt, or NULL". Two reasons moved out of it and into section 3.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_review_conflict(_user_id uuid, _attempt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _a public.scp_attempts%ROWTYPE; _subject_user uuid;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN 'unknown_attempt'; END IF;

  -- Nobody reviews their own responses. No authorisation narrows this.
  SELECT si.user_id INTO _subject_user
    FROM public.scp_subject_identities si WHERE si.subject_id = _a.subject_id;
  IF _subject_user = _user_id THEN RETURN 'is_participant'; END IF;

  -- Already decided the outcome for this attempt: reviewing it afterwards can
  -- only be justification for a decision that has already been taken.
  IF EXISTS (SELECT 1 FROM public.scp_employer_report_decisions d
              WHERE d.attempt_id = _attempt_id AND d.decided_by = _user_id) THEN
    RETURN 'recorded_employer_decision';
  END IF;

  RETURN NULL;
END; $function$;

COMMENT ON FUNCTION public.scp_review_conflict(uuid, uuid) IS
  'The separation-of-duties reason this person may NOT review this attempt, or '
  'NULL. Absolute refusals only: the participant, and anyone who has already '
  'recorded the employer decision. Commissioning the assessment or handling the '
  'application is disclosed instead -- see scp_review_conflict_disclosure.';

REVOKE ALL     ON FUNCTION public.scp_review_conflict(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_conflict(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The disclosed rule
--
-- Returns what the reviewer's involvement WAS, for a reviewer who is permitted
-- to proceed. Read by the UI so the banner over the review form says it, and by
-- the trigger below so the completed row records it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_review_conflict_disclosure(
  _user_id uuid, _attempt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _a public.scp_attempts%ROWTYPE; _application uuid;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.assessment_assignments aa
              WHERE aa.id = _a.assignment_id AND aa.assigned_by = _user_id) THEN
    RETURN 'assigned_this_assessment';
  END IF;

  SELECT aa.application_id INTO _application
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  IF _application IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.job_application_status_events e
                  WHERE e.application_id = _application AND e.actor_user_id = _user_id) THEN
    RETURN 'acted_on_this_application';
  END IF;

  RETURN NULL;
END; $function$;

COMMENT ON FUNCTION public.scp_review_conflict_disclosure(uuid, uuid) IS
  'The reviewer''s own involvement in this attempt -- commissioned it, or moved '
  'the candidate''s application -- which is permitted but never silent. NULL '
  'when there is none.';

REVOKE ALL     ON FUNCTION public.scp_review_conflict_disclosure(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_conflict_disclosure(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Completing a review records the disclosure
--
-- A trigger rather than an edit to scp_complete_human_review's two-hundred-line
-- body: the stamp then belongs to the TRANSITION, so it cannot be missed by a
-- future write path, and this migration does not have to restate scoring logic
-- it is not changing.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_stamp_review_conflict_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _attempt uuid;
BEGIN
  IF NEW.review_status = 'completed'
     AND coalesce(OLD.review_status, '') <> 'completed'
     AND NEW.reviewer_actor_id IS NOT NULL THEN
    SELECT r.attempt_id INTO _attempt
      FROM public.scp_candidate_responses r WHERE r.id = NEW.response_id;
    NEW.reviewer_conflict_disclosed :=
      public.scp_review_conflict_disclosure(NEW.reviewer_actor_id, _attempt);
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS scp_human_reviews_disclose_conflict ON public.scp_human_reviews;
CREATE TRIGGER scp_human_reviews_disclose_conflict
  BEFORE UPDATE ON public.scp_human_reviews
  FOR EACH ROW EXECUTE FUNCTION public.scp_stamp_review_conflict_disclosure();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The employer's blocked work, and why THIS caller can or cannot clear it
--
-- The Granskningar page had two numbers with no list under them: "fourteen
-- responses waiting" and "two results blocked" were unclickable, and the queue
-- beneath was empty for a different reason that the page could not name.
--
-- This is the missing list. One row per blocked ATTEMPT, employer-scoped,
-- carrying no response content whatsoever -- no answer text, no chosen option,
-- no item prompt. What it adds is `my_basis`: whether the caller may act, and
-- if not, which rule says so, so the page can distinguish "you have no
-- authorisation" from "nothing is waiting" from "somebody else must take this
-- one".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_review_board(_employer_id uuid)
RETURNS TABLE(
  attempt_id       uuid,
  responses_open   integer,
  my_basis         text,
  my_disclosure    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Same entry gate as scp_employer_review_pressure: an active member of this
  -- organisation, and nobody else. A non-member gets zero rows, not an error --
  -- an error would confirm the organisation exists.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT at.id,
         count(hr.id)::int,
         public.scp_review_authorisation(auth.uid(), at.id),
         public.scp_review_conflict_disclosure(auth.uid(), at.id)
    FROM public.scp_attempts at
    JOIN public.scp_candidate_responses r ON r.attempt_id = at.id
    JOIN public.scp_human_reviews hr ON hr.response_id = r.id
   WHERE at.issuer_organization_id = _employer_id
     AND hr.review_status = 'pending'
   GROUP BY at.id
   ORDER BY at.id;
END; $function$;

COMMENT ON FUNCTION public.scp_employer_review_board(uuid) IS
  'One row per attempt of this employer with pending human review: how many '
  'responses are open, and on what basis THIS caller may act on it. Carries no '
  'response content -- the material under review reaches a reviewer only '
  'through scp_review_queue.';

REVOKE ALL     ON FUNCTION public.scp_employer_review_board(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_review_board(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text;
BEGIN
  -- 6a. The absolute refusals are still absolute.
  _def := pg_get_functiondef('public.scp_review_conflict(uuid,uuid)'::regprocedure);
  IF _def NOT LIKE '%is_participant%' THEN
    RAISE EXCEPTION 'SCP_CONFLICT_LOST_PARTICIPANT_RULE: a participant could review their own responses';
  END IF;
  IF _def NOT LIKE '%recorded_employer_decision%' THEN
    RAISE EXCEPTION 'SCP_CONFLICT_LOST_DECISION_RULE: a decider could review the attempt they decided';
  END IF;

  -- 6b. The narrowed rules are DISCLOSED, not deleted. A silent narrowing is
  --     the failure mode this migration must not have.
  _def := pg_get_functiondef('public.scp_review_conflict_disclosure(uuid,uuid)'::regprocedure);
  IF _def NOT LIKE '%assigned_this_assessment%'
     OR _def NOT LIKE '%acted_on_this_application%' THEN
    RAISE EXCEPTION 'SCP_DISCLOSURE_INCOMPLETE: a narrowed conflict is not being disclosed';
  END IF;

  -- 6c. The queue and the workload still gate on employer authorisation.
  _def := pg_get_functiondef('public.scp_review_queue(text)'::regprocedure);
  IF _def NOT LIKE '%scp_can_review_for%' OR _def NOT LIKE '%scp_review_conflict%' THEN
    RAISE EXCEPTION 'SCP_QUEUE_UNSCOPED: the queue lost its authorisation predicate';
  END IF;
  _def := pg_get_functiondef('public.scp_my_review_workload()'::regprocedure);
  IF _def NOT LIKE '%scp_can_review_for%' OR _def NOT LIKE '%scp_review_conflict%' THEN
    RAISE EXCEPTION 'SCP_WORKLOAD_UNSCOPED: the reviewer count does not use the queue predicate';
  END IF;

  -- 6d. The board must never become a second way to read responses.
  _def := pg_get_functiondef('public.scp_employer_review_board(uuid)'::regprocedure);
  IF _def LIKE '%response_text%' OR _def LIKE '%selected_option_id%'
     OR _def LIKE '%scp_item_texts%' THEN
    RAISE EXCEPTION 'SCP_BOARD_LEAKS_RESPONSES: the employer board reaches response content';
  END IF;
END $$;
