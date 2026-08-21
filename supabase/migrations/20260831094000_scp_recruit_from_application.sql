-- Assigning from an application, without anybody typing an address.
--
-- ── WHY THIS IS NOT JUST A UI CONVENIENCE ───────────────────────────────
--
-- scp_employer_assign takes a recipient email. When the recruiter is looking at
-- an application, the platform already knows exactly which human that is — and
-- asking the recruiter to retype their address is not merely tedious:
--
--   * a typo creates a SECOND person, and the result attaches to nobody;
--   * an address typed from memory may be a work address while the account
--     uses a private one, which is the same failure with no typo in it;
--   * and it means the employer surface has to HOLD the candidate's email in
--     order to prefill it, which is a disclosure the applications list
--     deliberately does not make.
--
-- So the address never leaves the database. This function resolves the
-- applicant from the application, checks that the caller may act for the
-- employer that owns it, and delegates to the governed assign path with the
-- address it resolved. Nothing about permission, purpose or lineage is
-- reimplemented here: every one of those still happens in scp_employer_assign.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- One function. No table, column, policy or existing function is touched.
--
-- Remediation: drop it. The generic path it delegates to is unchanged and
-- still accepts an application id directly.

CREATE OR REPLACE FUNCTION public.scp_assign_from_application(
  _employer_id uuid,
  _application_id uuid,
  _assessment_version_id uuid,
  _deadline timestamptz DEFAULT NULL,
  _language text DEFAULT 'sv')
RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid,
              governance_mode public.scp_governance_mode)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _app_employer uuid; _applicant uuid; _email text;
BEGIN
  SELECT a.employer_id, a.applicant_user_id
    INTO _app_employer, _applicant
    FROM public.job_applications a WHERE a.id = _application_id;

  IF _app_employer IS NULL THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Checked here as well, before anything is resolved. scp_employer_assign
  -- checks it again; this one exists so that a caller who is not a member of
  -- the owning organisation cannot use this function to learn an applicant's
  -- address by observing which error comes back.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _app_employer AND m.user_id = auth.uid()
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or '
      'admin in the organisation that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _app_employer <> _employer_id THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_YOURS: that application belongs to '
      'another organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT lower(btrim(u.email)) INTO _email
    FROM auth.users u WHERE u.id = _applicant;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'SCP_APPLICANT_HAS_NO_ADDRESS: this application has no '
      'reachable applicant account.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT r.assignment_id, r.attempt_id, r.subject_id, r.governance_mode
    FROM public.scp_employer_assign(
           _employer_id, _assessment_version_id, _email, _deadline, _language,
           'recruitment', NULL, NULL, _application_id, NULL) r;
END;
$function$;

COMMENT ON FUNCTION public.scp_assign_from_application(uuid, uuid, uuid, timestamptz, text) IS
  'Assign an assessment from a job application. The candidate is resolved from '
  'the application inside the database, so the recruiter never types — and the '
  'employer surface never has to hold — the applicant''s address. Delegates to '
  'scp_employer_assign for permission, purpose and lineage: nothing about '
  'governance is reimplemented here.';

REVOKE ALL     ON FUNCTION public.scp_assign_from_application(uuid, uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_assign_from_application(uuid, uuid, uuid, timestamptz, text) TO authenticated;
