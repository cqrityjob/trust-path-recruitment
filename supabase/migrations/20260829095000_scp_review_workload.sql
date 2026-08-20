-- #51 — "My review work" is not "my organisation's blocked results".
--
-- Two different questions were previously answered by one number, which is how
-- the Granskningar page ended up printing "0 väntar" above a list of pending
-- cards:
--
--   EMPLOYER  -- how much of OUR work is stuck waiting on a human, and how many
--               results are consequently not ready. Answered by
--               scp_employer_review_pressure, employer-scoped.
--
--   REVIEWER  -- how many responses am I authorised to act on right now.
--               Answered here, scoped exactly like scp_review_queue.
--
-- They are not interchangeable and must never be summed. An employer can have
-- twelve responses awaiting review while a given member has zero to do, because
-- they are not an authorised reviewer, or because separation of duties excludes
-- them from those particular attempts.
--
-- The one invariant that matters: this function and scp_review_queue must apply
-- the SAME predicate, so a count can never disagree with the cards beneath it.

CREATE OR REPLACE FUNCTION public.scp_my_review_workload()
RETURNS TABLE(
  responses_waiting  integer,
  attempts_waiting   integer,
  employers_covered  integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT count(*)::int,
         count(DISTINCT at.id)::int,
         count(DISTINCT at.issuer_organization_id)::int
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_attempts at ON at.id = r.attempt_id
    LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
   WHERE hr.review_status = 'pending'
     -- Identical predicate to scp_review_queue. If these ever diverge the
     -- product starts lying about how much work exists again.
     AND public.scp_can_review_for(auth.uid(), at.issuer_organization_id,
                                   coalesce(aa.use_case, 'workforce'))
     AND public.scp_review_conflict(auth.uid(), at.id) IS NULL;
END; $function$;

COMMENT ON FUNCTION public.scp_my_review_workload() IS
  'How many responses THIS caller is authorised to review, scoped identically to '
  'scp_review_queue. Distinct from scp_employer_review_pressure, which counts an '
  'organisation''s blocked work regardless of who may act on it.';

REVOKE ALL     ON FUNCTION public.scp_my_review_workload() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_review_workload() TO authenticated;

DO $$
DECLARE _q text; _w text;
BEGIN
  _q := pg_get_functiondef('public.scp_review_queue(text)'::regprocedure);
  _w := pg_get_functiondef('public.scp_my_review_workload()'::regprocedure);
  -- Both must gate on employer authorisation AND separation of duties.
  IF _w NOT LIKE '%scp_can_review_for%' OR _w NOT LIKE '%scp_review_conflict%' THEN
    RAISE EXCEPTION 'SCP_WORKLOAD_UNSCOPED: the reviewer count does not use the queue predicate';
  END IF;
  IF _q NOT LIKE '%scp_can_review_for%' OR _q NOT LIKE '%scp_review_conflict%' THEN
    RAISE EXCEPTION 'SCP_QUEUE_UNSCOPED: the queue lost its authorisation predicate';
  END IF;
  IF _w LIKE '%scp_can_author%' THEN
    RAISE EXCEPTION 'SCP_WORKLOAD_CONTENT_GATED: the reviewer count uses the content capability';
  END IF;
END $$;
