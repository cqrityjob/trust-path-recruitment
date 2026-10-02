-- =============================================================================
-- P1 -- a suspended employer reads no applicant through the definer functions
-- =============================================================================
--
-- THE DEFECT (2026-10-02 pre-launch hostile-user audit, P1-3, reproduced on
-- production inside a rolled-back transaction):
--
--   The employer read of job_applications is gated twice: an active
--   membership AND an active organisation (job_applications_employer_select:
--   has_employer_role(...) AND employer_is_active_status(employer_id); the
--   rec_* functions do the same). Three SECURITY DEFINER functions that read
--   an application for its employer checked only the membership:
--
--     scp_application_candidate    name, phone, cover note, status, subject
--     scp_application_assessments  the candidate's assessment attempts
--     sp_application_disclosure    the candidate's Passport disclosure (and
--                                  counts an access)
--
--   With the employer suspended, RLS returned 0 applications, but these
--   functions still returned the applicant's personal data to its members.
--
-- THE INVARIANT: each function answers its employer caller only while BOTH
-- the caller's membership and the organisation are active -- the same rule
-- as the table's policy. Otherwise it gives the same empty answer it already
-- gives a non-member, so a suspended organisation cannot tell "suspended"
-- from "not there".
--
-- Only the gate changes; each body is otherwise the hosted body verbatim.
-- NOT CHANGED: columns, payloads, grants, the candidate's own paths, the
-- admin paths, any row.
--
-- Rollback: supabase/rollback/20270105090000_suspended_employer_applicant_reads_rollback.sql
-- Suite:    supabase/tests/suspended_employer_applicant_reads_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.scp_application_candidate(uuid)') IS NULL
     OR to_regprocedure('public.scp_application_assessments(uuid)') IS NULL
     OR to_regprocedure('public.sp_application_disclosure(uuid)') IS NULL
     OR to_regprocedure('public.employer_is_active_status(uuid)') IS NULL THEN
    RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_PRECONDITION: a gated function or employer_is_active_status is missing';
  END IF;
END $$;

-- ── 1. The three gates ───────────────────────────────────────────────────
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
                    AND m.status = 'active')
     -- 20270105090000: and the organisation itself is active, as the
     -- job_applications RLS policy and the rec_* read paths require.
     OR NOT coalesce(public.employer_is_active_status(_employer), false) THEN RETURN; END IF;

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
                    AND m.status = 'active')
     -- 20270105090000: and the organisation itself is active, as the
     -- job_applications RLS policy and the rec_* read paths require.
     OR NOT coalesce(public.employer_is_active_status(_employer), false) THEN RETURN; END IF;

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
END; $function$
;

REVOKE ALL ON FUNCTION public.sp_application_disclosure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_application_disclosure(uuid) TO authenticated;

-- ── 2. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY['scp_application_candidate', 'scp_application_assessments', 'sp_application_disclosure'] LOOP
    IF position('employer_is_active_status(_employer)' IN
         (SELECT prosrc FROM pg_proc WHERE oid = ('public.' || _f || '(uuid)')::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_PROOF: % does not require an active organisation', _f;
    END IF;
    IF has_function_privilege('anon', 'public.' || _f || '(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SUSPENDED_EMPLOYER_READS_PROOF: anon may execute %', _f;
    END IF;
  END LOOP;
  RAISE NOTICE 'SUSPENDED_EMPLOYER_READS_PROOF ok: the three applicant reads require an active organisation';
END $$;
