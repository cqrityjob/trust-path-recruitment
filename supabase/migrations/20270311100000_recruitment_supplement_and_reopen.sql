-- Canonical forward slot 20270311100000 ("supplement111"), slutuppdrag 2026-10-09.
-- Additive. Two acts the recruiter's day needed and the schema had no word for:
--
--   1. A REQUEST FOR A SUPPLEMENT. "Begär komplettering" used to be a free-text
--      next action and a hand-written message. It is now its own message kind
--      and a row that says which mandatory requirements were asked about, from
--      which profile version, and whether the answer has been reviewed -- so a
--      list can show "väntar på komplettering" as a VIEW over this row, not as a
--      new application status. The message is a DRAFT; nothing is sent here.
--
--   2. REOPENING A DECISION. "Ej aktuell" could not be undone, and the only
--      way around was to ask a candidate to apply again. Reopening is a
--      separate, authorised act with a stated reason: rejected -> reviewing,
--      manager only, refused on an archived application, a completed
--      recruitment or a pending erasure, recorded in the status ledger with
--      the reason, idempotent by operation id. A hire is never reopened here
--      (it created an employment record); a withdrawal is the candidate's own.
--
-- No AI, no automatic message, no stage mutation beyond the explicit reopen,
-- no retention activation. Existing profiles, reviews, reports and the eight
-- core interview questions are untouched.
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The supplement request is a message kind
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.recruitment_messages DROP CONSTRAINT recruitment_messages_kind_check;
ALTER TABLE public.recruitment_messages ADD CONSTRAINT recruitment_messages_kind_check
  CHECK (kind IN ('general', 'interview_invitation', 'rejection', 'offer', 'information', 'receipt',
                  'supplement_request'));

CREATE TABLE public.rec_requirement_supplement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  requirement_ids uuid[] NOT NULL CHECK (cardinality(requirement_ids) BETWEEN 1 AND 30),
  -- The draft the request produced. SET NULL: discarding the draft does not
  -- erase the fact that a supplement was asked for.
  message_id uuid REFERENCES public.recruitment_messages(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  -- Resolved by a PERSON: the answer was reviewed, or the request withdrawn.
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('answered', 'withdrawn')),
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
  CHECK ((resolved_at IS NULL) = (outcome IS NULL))
);
CREATE INDEX rec_requirement_supplement_requests_open_idx
  ON public.rec_requirement_supplement_requests (application_id) WHERE resolved_at IS NULL;
ALTER TABLE public.rec_requirement_supplement_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_requirement_supplement_requests FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.rec_requirement_supplement_requests IS
  'A supplement asked of a candidate for named mandatory requirements of one '
  'profile version. The message it produced is a draft until a person sends it. '
  '"Väntar på komplettering" is this row unresolved -- a view, never a status.';

-- The open request is immutable except through the resolve function: no
-- client DML at all, and the two timestamps are set once.
CREATE FUNCTION public.rec_supplement_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM public.job_applications WHERE id = OLD.application_id) THEN
      RETURN OLD; -- cascading with its application
    END IF;
    RAISE EXCEPTION 'RI_SUPPLEMENT_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_RESOLVED' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.application_id <> OLD.application_id OR NEW.profile_id <> OLD.profile_id
     OR NEW.requirement_ids <> OLD.requirement_ids OR NEW.requested_at <> OLD.requested_at
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rec_supplement_request_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rec_requirement_supplement_requests_guard
  BEFORE UPDATE OR DELETE ON public.rec_requirement_supplement_requests
  FOR EACH ROW EXECUTE FUNCTION public.rec_supplement_request_guard();

-- Ask for a supplement: a draft message of its own kind plus the request row,
-- in one transaction, idempotent by operation id. The body is the reviewer's
-- own words (the neutral questions); nothing is generated and nothing is sent.
CREATE FUNCTION public.rec_ri_request_supplement(
  _application_id uuid, _profile_id uuid, _requirement_ids uuid[],
  _subject text, _body text, _language text, _operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE;
        request jsonb; result jsonb; mid uuid; rid uuid; latest integer;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(a.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(a.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL OR _requirement_ids IS NULL OR cardinality(_requirement_ids) NOT BETWEEN 1 AND 30
     OR nullif(btrim(_body), '') IS NULL OR char_length(_body) > 10000
     OR nullif(btrim(_subject), '') IS NULL OR char_length(_subject) > 200
     OR _language NOT IN ('sv', 'en') THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  request := jsonb_build_object('profile', _profile_id, 'requirements', to_jsonb(_requirement_ids),
                                'subject', _subject, 'body', _body, 'language', _language);
  result := recruiter_intelligence.operation_result(_operation_id, a.id, 'supplement_request', request);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF a.status NOT IN ('submitted', 'reviewing', 'interview') OR a.employer_archived_at IS NOT NULL
     OR a.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_OPEN' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO p FROM public.rec_requirement_profiles WHERE id = _profile_id AND job_id = a.job_id;
  SELECT max(version) INTO latest FROM public.rec_requirement_profiles WHERE job_id = a.job_id;
  IF NOT FOUND OR p.version <> latest THEN
    RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE = 'PT409';
  END IF;
  -- Only MANDATORY requirements of that version can be asked about: a merit
  -- is never the subject of a supplement.
  IF (SELECT count(DISTINCT r) FROM unnest(_requirement_ids) r) <> cardinality(_requirement_ids)
     OR EXISTS (SELECT 1 FROM unnest(_requirement_ids) r
                 WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.rules) x
                                    WHERE x->>'requirementId' = r::text AND x->>'kind' = 'mandatory')) THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rec_requirement_supplement_requests
              WHERE application_id = a.id AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_OPEN' USING ERRCODE = 'check_violation';
  END IF;
  -- The draft, through the one path every candidate message takes. Its own
  -- idempotency key is the operation id, so a retry finds the same draft.
  mid := public.rec_save_message_draft(NULL, a.id, 'supplement_request', _subject, _body, _language,
                                       NULL, 'supplement:' || _operation_id::text);
  INSERT INTO public.rec_requirement_supplement_requests
    (application_id, employer_id, profile_id, requirement_ids, message_id, requested_by)
  VALUES (a.id, a.employer_id, p.id, _requirement_ids, mid, auth.uid())
  RETURNING id INTO rid;
  result := jsonb_build_object('requestId', rid, 'messageId', mid, 'messageStatus', 'draft',
                               'profileVersion', p.version, 'requirementIds', to_jsonb(_requirement_ids));
  INSERT INTO recruiter_intelligence.operations
    VALUES (_operation_id, auth.uid(), a.id, 'supplement_request', md5(request::text), result, now(), a.job_id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_request_supplement(uuid, uuid, uuid[], text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_request_supplement(uuid, uuid, uuid[], text, text, text, uuid) TO authenticated;

-- A person closes the request: the answer was reviewed (and recorded in the
-- requirement review, which is where the decision lives), or the request is
-- withdrawn. Never automatic, never from a message status.
CREATE FUNCTION public.rec_ri_resolve_supplement(_request_id uuid, _outcome text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.rec_requirement_supplement_requests%ROWTYPE; a public.job_applications%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.rec_requirement_supplement_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(r.employer_id) THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO a FROM public.job_applications WHERE id = r.application_id;
  IF NOT public.rec_can_manage(a.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _outcome NOT IN ('answered', 'withdrawn') OR char_length(coalesce(_note, '')) > 2000 THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF r.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'RI_SUPPLEMENT_RESOLVED' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.rec_requirement_supplement_requests
     SET resolved_at = now(), resolved_by = auth.uid(), outcome = _outcome,
         resolution_note = nullif(btrim(_note), '')
   WHERE id = _request_id;
  RETURN public.rec_ri_supplement_state(r.application_id);
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_resolve_supplement(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_resolve_supplement(uuid, text, text) TO authenticated;

-- What the application page and the list read: is a supplement outstanding,
-- and the history of requests with the state of each draft/message.
CREATE FUNCTION public.rec_ri_supplement_state(_application_id uuid)
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
REVOKE ALL ON FUNCTION public.rec_ri_supplement_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_supplement_state(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Reopening a decision is its own authorised act, with a reason
-- ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public.rec_reopen_application(
  _application_id uuid, _expected_status text, _reason text, _operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; request jsonb; result jsonb; _now timestamptz := now(); _reason_clean text;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(a.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  _reason_clean := nullif(btrim(_reason), '');
  IF _operation_id IS NULL OR _reason_clean IS NULL OR char_length(_reason_clean) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'REOPEN_REASON_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  request := jsonb_build_object('expected', _expected_status, 'reason', _reason_clean);
  result := recruiter_intelligence.operation_result(_operation_id, a.id, 'reopen', request);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF a.status IS DISTINCT FROM _expected_status THEN
    RAISE EXCEPTION 'STALE_APPLICATION_STAGE' USING ERRCODE = 'serialization_failure';
  END IF;
  -- Only "ej aktuell" reopens. A hire has an employment record behind it and
  -- a withdrawal is the candidate's own decision.
  IF a.status <> 'rejected' THEN
    RAISE EXCEPTION 'REOPEN_NOT_ALLOWED' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.rec_can_manage(a.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_DECISION_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_settings s WHERE s.job_id = a.job_id AND s.completion_state <> 'open') THEN
    RAISE EXCEPTION 'RECRUITMENT_COMPLETED' USING ERRCODE = 'check_violation';
  END IF;
  -- Restore from the archive first: reopening is not a way around the
  -- archive, and an archived row is never silently un-archived.
  IF a.employer_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'APPLICATION_ARCHIVED' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_erasure_jobs e WHERE e.job_id = a.job_id AND e.completed_at IS NULL) THEN
    RAISE EXCEPTION 'RETENTION_ERASURE_PENDING' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_applications SET status = 'reviewing', updated_at = _now WHERE id = a.id;
  INSERT INTO public.job_application_status_events
    (application_id, job_id, employer_id, actor_user_id, actor_role, previous_status, new_status, note, created_at)
  VALUES (a.id, a.job_id, a.employer_id, auth.uid(), 'employer', 'rejected', 'reviewing',
          left('Återöppnad: ' || _reason_clean, 1000), _now);
  result := jsonb_build_object('applicationId', a.id, 'previousStatus', 'rejected', 'status', 'reviewing',
                               'reopenedAt', _now, 'reason', _reason_clean);
  INSERT INTO recruiter_intelligence.operations
    VALUES (_operation_id, auth.uid(), a.id, 'reopen', md5(request::text), result, _now, a.job_id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_reopen_application(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_reopen_application(uuid, text, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.rec_reopen_application(uuid, text, text, uuid) IS
  'Reopens a rejected application to reviewing. A separate, authorised act with '
  'a stated reason, recorded in job_application_status_events; refused when the '
  'application is archived, the recruitment completed or an erasure is pending. '
  'Idempotent by operation id. Sends nothing.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Self-verification
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruitment_messages_kind_check'
                  AND pg_get_constraintdef(oid) LIKE '%supplement_request%') THEN
    RAISE EXCEPTION 'REC_SUPPLEMENT_KIND_MISSING';
  END IF;
  IF has_table_privilege('authenticated', 'public.rec_requirement_supplement_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.rec_requirement_supplement_requests', 'SELECT') THEN
    RAISE EXCEPTION 'REC_SUPPLEMENT_TABLE_EXPOSED';
  END IF;
  IF has_function_privilege('anon', 'public.rec_reopen_application(uuid,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REC_REOPEN_EXPOSED_TO_ANON';
  END IF;
END $$;
COMMIT;
