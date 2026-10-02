-- Rollback for 20270105090000_suspended_employer_applicant_reads.
--
-- Restores scp_application_candidate, scp_application_assessments and
-- sp_application_disclosure exactly as hosted before (md5(prosrc) pinned
-- below). This REOPENS P1-3 of the 2026-10-02 audit: a member of a SUSPENDED
-- employer can again read an applicant's name, phone, cover note,
-- assessments and Passport disclosure. No row is touched.

CREATE OR REPLACE FUNCTION public.scp_application_candidate(_application_id uuid)
 RETURNS TABLE(application_id uuid, employer_id uuid, job_id uuid, job_slug text, job_title_sv text, job_title_en text, application_status text, applied_at timestamp with time zone, updated_at timestamp with time zone, cover_note text, phone text, has_cv boolean, display_name text, subject_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL THEN RETURN; END IF;

  -- Membership of THIS organisation, checked before anything is read. An
  -- application id is guessable; membership is not. Returning nothing rather
  -- than raising keeps a non-member unable to tell "not yours" from "not
  -- there", which is the same answer scp_application_assessments gives.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                    AND m.status = 'active') THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    a.id, a.employer_id, a.job_id,
    j.slug, j.title_sv, coalesce(j.title_en, j.title_sv),
    a.status,
    a.created_at, a.updated_at,
    a.cover_note, a.phone, (a.cv_storage_path IS NOT NULL),
    p.display_name,
    si.subject_id
  FROM public.job_applications a
  LEFT JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_user_id
  LEFT JOIN public.scp_subject_identities si ON si.user_id = a.applicant_user_id
  WHERE a.id = _application_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_application_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_application_candidate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_application_assessments(_application_id uuid)
 RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid, assessment_slug text, name_sv text, name_en text, designed_for text, use_case text, governance_mode scp_governance_mode, attempt_status text, answered integer, total_items integer, reviews_outstanding integer, invited_at timestamp with time zone, deadline timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, report_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL THEN RETURN; END IF;

  -- Membership of THIS organisation, checked before anything is read. An
  -- application id is guessable; membership is not.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                    AND m.status = 'active') THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    asg.id, at.id, at.subject_id,
    d.slug, coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
    d.designed_for, asg.use_case, at.governance_mode, at.status,
    coalesce((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = at.id), 0),
    coalesce((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = at.form_id), 0),
    coalesce((SELECT count(*)::int FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses r ON r.id = hr.response_id
               WHERE r.attempt_id = at.id AND hr.review_status <> 'completed'), 0),
    asg.invited_at, asg.expires_at,
    at.submitted_at, at.scored_at, at.released_at,
    EXISTS (SELECT 1 FROM public.scp_report_snapshots s
             WHERE s.attempt_id = at.id AND s.audience = 'employer')
  FROM public.assessment_assignments asg
  JOIN public.scp_attempts at ON at.assignment_id = asg.id
  LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  WHERE asg.application_id = _application_id
    AND asg.employer_id = _employer
  ORDER BY asg.invited_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_application_assessments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_application_assessments(uuid) TO authenticated;

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
                       AND m.status = 'active') THEN
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
END; $function$
;

REVOKE ALL ON FUNCTION public.sp_application_disclosure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_application_disclosure(uuid) TO authenticated;

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_application_candidate(uuid)'::regprocedure)) <> '0032df2a452e5600ae0eaed45a13cdc1' THEN
    RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_ROLLBACK: scp_application_candidate is not the hosted pre-fix body';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_application_assessments(uuid)'::regprocedure)) <> 'e96893da682c3a4c250b9adb843cc3bd' THEN
    RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_ROLLBACK: scp_application_assessments is not the hosted pre-fix body';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_application_disclosure(uuid)'::regprocedure)) <> '56a71668fd07bba773933ae2031da5d6' THEN
    RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_ROLLBACK: sp_application_disclosure is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'SUSPENDED_EMPLOYER_READS_ROLLBACK ok: pre-20270105090000 bodies restored';
END $$;
