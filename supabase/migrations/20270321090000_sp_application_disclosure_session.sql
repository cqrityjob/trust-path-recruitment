-- =============================================================================
-- 20270321090000 -- Passport shared with an application: the session rule on
-- the two reads that lacked it.
--
-- Canonical forward slot after 20270320090000. Schema-first; no application
-- change (the app already maps every employer-side error to "unavailable" and
-- surfaces the holder-side error).
--
-- Found by the independent acceptance of 2026-10-17 (P1) and reproduced on a
-- full replay with the repository's own Passport fixture:
--   * sp_my_application_disclosures() -- the holder's list of application
--     shares -- answered a SIGNED-OUT token with employer name, package and
--     job title (read-only SECURITY DEFINER, no session check).
--   * sp_application_disclosure(uuid) -- the employer's read of the shared
--     Passport -- was refused for a signed-out token only because its
--     access-counter UPDATE trips sp_passport_session_write_guard. Remove the
--     counter and the payload would flow; the rule is now explicit and first.
--
-- Unchanged on purpose: public sharing through a valid link
-- (sp_get_disclosure / sp_get_disclosure_session, service_role only, which the
-- session rule does not apply to); every writer (sp_share_passport_with_
-- application, sp_create_*_disclosure, sp_revoke_disclosure), which the
-- sp_disclosures write trigger already guards; signatures, grants, payloads
-- and the undifferentiated "none" answer for live callers.
--
-- Rollback: supabase/rollback/20270321090000_sp_application_disclosure_session_rollback.sql
-- Suite:    supabase/tests/sp_application_disclosure_session_test.sql
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.sp_application_disclosure(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid; _d public.sp_disclosures%ROWTYPE;
BEGIN
  -- 20270321090000: the employer's live Auth session, bound to this user, is
  -- checked before anything is read (20270320090000's rule). Until now the
  -- refusal came only from the access counter's UPDATE tripping the Passport
  -- write guard -- a side effect, not a rule.
  IF NOT public.rec_session_active() THEN
    RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501';
  END IF;

  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;

  -- Every negative answer is the same answer. A caller who is not a member,
  -- names an application that does not exist, or names one whose candidate
  -- has disclosed nothing, cannot tell those cases apart -- and therefore
  -- cannot learn that a Passport exists.
  IF _employer IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                     WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                       AND m.status = 'active')
     -- 20270105090000: and the organisation itself is active, as the
     -- job_applications RLS policy and the rec_* read paths require.
     OR NOT coalesce(public.employer_is_active_status(_employer), false) THEN
    RETURN jsonb_build_object('status','none');
  END IF;

  SELECT * INTO _d FROM public.sp_disclosures
   WHERE application_id = _application_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN RETURN jsonb_build_object('status','none'); END IF;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  RETURN public.sp_disclosure_payload(_d.id);
END; $function$;

CREATE OR REPLACE FUNCTION public.sp_my_application_disclosures()
 RETURNS TABLE(disclosure_id uuid, application_id uuid, employer_name text, job_title_sv text, job_title_en text, package_code text, focus_claim_id uuid, created_at timestamp with time zone, expires_at timestamp with time zone, revoked_at timestamp with time zone, access_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270321090000: the holder's live Auth session (the Passport's rule).
  -- This list names the employers and jobs the holder has shared with; a
  -- signed-out token read it until now.
  PERFORM public.sp_assert_passport_session();
  RETURN QUERY
  SELECT d.id, d.application_id, e.name, j.title_sv, coalesce(j.title_en, j.title_sv),
         d.package_code, d.focus_claim_id,
         d.created_at, d.expires_at, d.revoked_at, d.access_count
    FROM public.sp_disclosures d
    JOIN public.job_applications a ON a.id = d.application_id
    LEFT JOIN public.employers e ON e.id = a.employer_id
    LEFT JOIN public.jobs j ON j.id = a.job_id
   WHERE d.holder_user_id = auth.uid()
     AND d.application_id IS NOT NULL
   ORDER BY d.created_at DESC;
END;
$function$;

COMMIT;
