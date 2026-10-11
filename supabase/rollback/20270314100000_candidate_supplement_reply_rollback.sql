-- Rollback of 20270314100000 (reply141). Prefer an application rollback.
-- Refuses to discard a candidate's recorded answer; restores the employer read
-- to its supplement111 body, verbatim; drops the RPC, the guard and the table.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.rec_candidate_replies) THEN
    RAISE EXCEPTION 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rec_ri_supplement_state(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(a.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'applicationId', a.id,
    'awaitingSupplement', EXISTS (SELECT 1 FROM public.rec_requirement_supplement_requests
                                   WHERE application_id = a.id AND resolved_at IS NULL),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'requestId', r.id, 'profileVersion', p.version,
          'requirementIds', to_jsonb(r.requirement_ids),
          'requestedAt', r.requested_at, 'requestedBy', r.requested_by,
          'messageId', r.message_id,
          'messageStatus', m.status, 'emailStatus', m.email_status, 'sentAt', m.sent_at,
          'resolvedAt', r.resolved_at, 'outcome', r.outcome, 'resolutionNote', r.resolution_note)
        ORDER BY r.requested_at DESC)
        FROM public.rec_requirement_supplement_requests r
        JOIN public.rec_requirement_profiles p ON p.id = r.profile_id
        LEFT JOIN public.recruitment_messages m ON m.id = r.message_id
       WHERE r.application_id = a.id), '[]'::jsonb));
END $$;
DROP FUNCTION IF EXISTS public.rec_candidate_reply_to_message(uuid, text, text);
DROP TRIGGER IF EXISTS rec_candidate_replies_guard ON public.rec_candidate_replies;
DROP FUNCTION IF EXISTS public.rec_candidate_reply_guard();
DROP TABLE public.rec_candidate_replies;
COMMIT;
