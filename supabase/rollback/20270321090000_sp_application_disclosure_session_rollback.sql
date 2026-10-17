-- Rollback for 20270321090000: restores the 20270105090000 body of
-- sp_application_disclosure and the 20260903091000 body of
-- sp_my_application_disclosures verbatim (pg_get_functiondef of the replayed
-- schema before this slot). Grants and comments are untouched by the slot.
BEGIN;

CREATE OR REPLACE FUNCTION public.sp_application_disclosure(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid; _d public.sp_disclosures%ROWTYPE;
BEGIN
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
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

COMMIT;
