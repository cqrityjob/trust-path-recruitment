-- Canonical forward slot 20270314100000 ("reply141"), slutuppdrag 2026-10-11.
-- The candidate's half of a supplement: an answer written in the app to a
-- supplement request the employer actually SENT, kept with the application,
-- readable by the candidate who wrote it and by the organisation's members.
--
-- Until this slot a candidate could only read what was sent and reply by
-- e-mail to the central inbox; the employer then recorded "answered" by hand.
-- That manual resolution stays a person's act (rec_ri_resolve_supplement is
-- untouched); this slot gives it something in the app to resolve against.
--
-- Boundaries, by design:
--   - the candidate writes only to a SENT message of kind supplement_request on
--     their own OPEN application, while the request is unresolved; a draft, a
--     rejection notice, a withdrawn or decided application, a resolved request
--     and another person's application are refused;
--   - replies are append-only (RI_REPLY_IMMUTABLE), 1..4000 characters, no
--     attachments, no HTML, no AI; the CV and the original answers are not
--     changed by a reply; the review decides what the reply is worth;
--   - the employer reads replies through rec_ri_supplement_state (replaced here
--     with the same signature, plus `replies` per request and a top-level
--     `candidateReplied`), never through client DML; the candidate reads their
--     own rows under RLS;
--   - no message is sent anywhere by this slot; no retention activation.
BEGIN;

CREATE TABLE public.rec_candidate_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  -- The SENT request the candidate answers. The message is history too;
  -- cascading with it keeps the pair consistent.
  message_id uuid NOT NULL REFERENCES public.recruitment_messages(id) ON DELETE CASCADE,
  -- The supplement request that produced the message, when it still exists.
  request_id uuid REFERENCES public.rec_requirement_supplement_requests(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  language text CHECK (language IS NULL OR language IN ('sv', 'en')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rec_candidate_replies_application_idx ON public.rec_candidate_replies (application_id, created_at);
CREATE INDEX rec_candidate_replies_request_idx ON public.rec_candidate_replies (request_id);
ALTER TABLE public.rec_candidate_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_candidate_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rec_candidate_replies TO authenticated;
-- The candidate reads what they wrote; members read what reached them.
CREATE POLICY rec_candidate_replies_own_read ON public.rec_candidate_replies
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY rec_candidate_replies_member_read ON public.rec_candidate_replies
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));
COMMENT ON TABLE public.rec_candidate_replies IS
  'A candidate''s in-app answer to a SENT supplement request on their own open '
  'application. Append-only; written only through rec_candidate_reply_to_message.';

CREATE FUNCTION public.rec_candidate_reply_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1
       AND (NOT EXISTS (SELECT 1 FROM public.job_applications WHERE id = OLD.application_id)
            OR NOT EXISTS (SELECT 1 FROM public.recruitment_messages WHERE id = OLD.message_id)) THEN
      RETURN OLD; -- cascading with its application or its message
    END IF;
    RAISE EXCEPTION 'RI_REPLY_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF pg_trigger_depth() > 1 AND (to_jsonb(NEW) - 'created_by' - 'request_id') = (to_jsonb(OLD) - 'created_by' - 'request_id')
     AND (NEW.created_by IS NULL OR NEW.created_by = OLD.created_by)
     AND (NEW.request_id IS NULL OR NEW.request_id = OLD.request_id) THEN
    RETURN NEW; -- SET NULL from a deleted user or request; the reply stays
  END IF;
  RAISE EXCEPTION 'RI_REPLY_IMMUTABLE' USING ERRCODE = 'check_violation';
END $$;
REVOKE ALL ON FUNCTION public.rec_candidate_reply_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rec_candidate_replies_guard
  BEFORE UPDATE OR DELETE ON public.rec_candidate_replies
  FOR EACH ROW EXECUTE FUNCTION public.rec_candidate_reply_guard();

-- The candidate's act. Returns the reply as recorded.
CREATE FUNCTION public.rec_candidate_reply_to_message(_message_id uuid, _body text, _language text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.recruitment_messages%ROWTYPE; a public.job_applications%ROWTYPE;
        r public.rec_requirement_supplement_requests%ROWTYPE; rid uuid; at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO m FROM public.recruitment_messages WHERE id = _message_id;
  IF FOUND THEN SELECT * INTO a FROM public.job_applications WHERE id = m.application_id; END IF;
  -- Not found, not yours and not sent read the same: the candidate learns
  -- nothing about other people's mail, nor about a draft on their own file.
  IF m.id IS NULL OR a.id IS NULL OR a.applicant_user_id IS DISTINCT FROM auth.uid() OR m.status <> 'sent' THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF m.kind <> 'supplement_request' THEN
    RAISE EXCEPTION 'REPLY_NOT_ALLOWED' USING ERRCODE = 'check_violation';
  END IF;
  IF a.withdrawn_at IS NOT NULL OR a.status NOT IN ('submitted', 'reviewing', 'interview') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_OPEN' USING ERRCODE = 'check_violation';
  END IF;
  IF nullif(btrim(_body), '') IS NULL OR char_length(_body) > 4000
     OR (_language IS NOT NULL AND _language NOT IN ('sv', 'en')) THEN
    RAISE EXCEPTION 'REPLY_BODY_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM public.rec_requirement_supplement_requests
   WHERE message_id = m.id ORDER BY requested_at DESC LIMIT 1;
  IF r.id IS NOT NULL AND r.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPLEMENT_ALREADY_RESOLVED' USING ERRCODE = 'check_violation';
  END IF;
  at := now();
  INSERT INTO public.rec_candidate_replies (application_id, employer_id, message_id, request_id, body, language, created_by, created_at)
  VALUES (a.id, a.employer_id, m.id, r.id, btrim(_body), _language, auth.uid(), at)
  RETURNING id INTO rid;
  RETURN jsonb_build_object('replyId', rid, 'messageId', m.id, 'requestId', r.id,
                            'applicationId', a.id, 'createdAt', at);
END $$;
REVOKE ALL ON FUNCTION public.rec_candidate_reply_to_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_candidate_reply_to_message(uuid, text, text) TO authenticated;

-- The employer's read, same signature as supplement111, plus the replies.
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
    -- An unresolved request that already has an in-app answer: the ball is
    -- with the reviewer, not the candidate.
    'candidateReplied', EXISTS (SELECT 1 FROM public.rec_requirement_supplement_requests r
                                  JOIN public.rec_candidate_replies c ON c.request_id = r.id
                                 WHERE r.application_id = a.id AND r.resolved_at IS NULL),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'requestId', r.id, 'profileVersion', p.version,
          'requirementIds', to_jsonb(r.requirement_ids),
          'requestedAt', r.requested_at, 'requestedBy', r.requested_by,
          'messageId', r.message_id,
          'messageStatus', m.status, 'emailStatus', m.email_status, 'sentAt', m.sent_at,
          'resolvedAt', r.resolved_at, 'outcome', r.outcome, 'resolutionNote', r.resolution_note,
          'replies', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'replyId', c.id, 'body', c.body, 'language', c.language, 'createdAt', c.created_at)
                ORDER BY c.created_at)
              FROM public.rec_candidate_replies c WHERE c.request_id = r.id), '[]'::jsonb))
        ORDER BY r.requested_at DESC)
        FROM public.rec_requirement_supplement_requests r
        JOIN public.rec_requirement_profiles p ON p.id = r.profile_id
        LEFT JOIN public.recruitment_messages m ON m.id = r.message_id
       WHERE r.application_id = a.id), '[]'::jsonb));
END $$;
-- Grants of supplement111 stand: authenticated may execute, anon may not.

COMMIT;
