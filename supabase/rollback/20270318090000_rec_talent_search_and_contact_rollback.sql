-- Rollback of 20270318090000 (rec_talent_search_and_contact).
-- Prefer an application rollback. Refuses to discard a contact request or a
-- confirmed criteria set, restores the three notice functions to their
-- 20270316090000 bodies verbatim, and removes everything the slot added.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.rec_talent_contact_requests) OR EXISTS (SELECT 1 FROM public.rec_requirement_criteria_sets)
     OR EXISTS (SELECT 1 FROM public.user_notices WHERE kind LIKE 'talent_%') THEN
    RAISE EXCEPTION 'SP_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
END $$;
DROP TRIGGER IF EXISTS rec_talent_link_application ON public.job_applications;
DROP FUNCTION IF EXISTS public.rec_talent_link_application();
DROP FUNCTION IF EXISTS public.sp_talent_respond_contact(uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.sp_talent_my_contacts();
DROP FUNCTION IF EXISTS public.rec_talent_withdraw_contact(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_contacts(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_send_contact(uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.rec_talent_profile(uuid, uuid);
DROP TABLE IF EXISTS public.rec_talent_contact_requests;
DROP FUNCTION IF EXISTS public.rec_talent_contact_guard();
DROP FUNCTION IF EXISTS public.rec_talent_search(uuid, jsonb);
DROP TABLE IF EXISTS public.rec_talent_search_log;
DROP FUNCTION IF EXISTS public.rec_talent_pool(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_evaluate(jsonb, jsonb, public.jobs);
DROP FUNCTION IF EXISTS public.rec_talent_level_rank(text);
DROP FUNCTION IF EXISTS public.rec_talent_confirm_criteria(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.rec_talent_catalogue_options();
DROP FUNCTION IF EXISTS public.rec_talent_get_criteria(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_latest_criteria(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_latest_profile(uuid);
DROP TABLE IF EXISTS public.rec_requirement_criteria_sets;
DROP FUNCTION IF EXISTS public.rec_criteria_sets_immutable();
DROP FUNCTION IF EXISTS public.rec_talent_access(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_assert_may_search(uuid);
DROP FUNCTION IF EXISTS public.rec_talent_user_may_search(uuid, uuid);

-- Notice functions, verbatim from 20270316090000.
CREATE OR REPLACE FUNCTION public.user_notices_still_allowed(_n public.user_notices)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE _n.audience
    WHEN 'reviewer' THEN EXISTS (SELECT 1 FROM public.user_roles ur
                                  WHERE ur.user_id = _n.recipient_user_id AND ur.role = 'passport_verifier'::public.app_role)
    WHEN 'holder' THEN true
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.user_notices_still_allowed(public.user_notices) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_notices_inbox(_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'unread', (SELECT count(*) FROM public.user_notices WHERE recipient_user_id = auth.uid() AND read_at IS NULL),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'audience', n.audience, 'kind', n.kind, 'subjectType', n.subject_type,
               'subjectId', n.subject_id, 'requestId', n.request_id, 'createdAt', n.created_at, 'readAt', n.read_at,
               -- For the holder: the merit's own name. For a reviewer: the catalogue name only.
               'credentialCode', c.credential_code,
               'title', CASE WHEN n.audience = 'holder' THEN coalesce(c.title, p.role_title) END)
             ORDER BY n.created_at DESC)
        FROM (SELECT * FROM public.user_notices WHERE recipient_user_id = auth.uid()
               ORDER BY created_at DESC LIMIT greatest(1, least(coalesce(_limit, 30), 100))) n
        LEFT JOIN public.sp_claims c ON n.subject_type = 'claim' AND c.id = n.subject_id
        LEFT JOIN public.sp_experience_periods p ON n.subject_type = 'experience' AND p.id = n.subject_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.user_notices_inbox(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_notices_inbox(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_notices_claim_emails(_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _token uuid := gen_random_uuid(); _out jsonb;
BEGIN
  UPDATE public.user_notices n SET email_status = 'skipped', email_error_code = 'recipient_not_allowed'
   WHERE n.email_status IN ('pending', 'failed') AND NOT public.user_notices_still_allowed(n);

  WITH due AS (
    SELECT n.id FROM public.user_notices n
     WHERE (n.email_status = 'pending'
         OR (n.email_status = 'failed' AND n.email_attempts < 5
             AND n.email_claimed_at < now() - make_interval(mins => 5 * n.email_attempts))
         OR (n.email_status = 'claimed' AND n.email_claimed_at < now() - interval '3 minutes'))
       AND n.created_at > now() - interval '7 days'
     ORDER BY n.created_at
     LIMIT greatest(1, least(coalesce(_limit, 20), 50))
     FOR UPDATE SKIP LOCKED),
  claimed AS (
    UPDATE public.user_notices n
       SET email_status = 'claimed', email_claimed_at = now(), email_claim_token = _token,
           email_attempts = n.email_attempts + 1
      FROM due WHERE n.id = due.id
    RETURNING n.*)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'claimToken', c.email_claim_token, 'kind', c.kind, 'audience', c.audience,
           'subjectType', c.subject_type, 'subjectId', c.subject_id, 'requestId', c.request_id,
           'email', u.email, 'locale', coalesce(pr.locale, 'sv'),
           'credentialCode', cl.credential_code)), '[]'::jsonb)
    INTO _out
    FROM claimed c
    JOIN auth.users u ON u.id = c.recipient_user_id
    LEFT JOIN public.profiles pr ON pr.id = c.recipient_user_id
    LEFT JOIN public.sp_claims cl ON c.subject_type = 'claim' AND cl.id = c.subject_id;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.user_notices_claim_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_notices_claim_emails(integer) TO service_role;

ALTER TABLE public.user_notices DROP CONSTRAINT user_notices_kind_check;
ALTER TABLE public.user_notices ADD CONSTRAINT user_notices_kind_check CHECK (kind IN (
  'passport_review_requested', 'passport_clarification_answered',
  'passport_clarification_requested', 'passport_decision_approved',
  'passport_decision_rejected', 'passport_verification_revoked'));
ALTER TABLE public.user_notices DROP CONSTRAINT user_notices_subject_type_check;
ALTER TABLE public.user_notices ADD CONSTRAINT user_notices_subject_type_check
  CHECK (subject_type IN ('claim', 'experience', 'request'));
DO $$ BEGIN
  IF to_regclass('public.rec_talent_contact_requests') IS NOT NULL
     OR position('rec_talent' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.user_notices_claim_emails(integer)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'TALENT_SEARCH_ROLLBACK_PROOF failed';
  END IF;
  RAISE NOTICE 'TALENT_SEARCH_ROLLBACK_PROOF ok';
END $$;
COMMIT;
