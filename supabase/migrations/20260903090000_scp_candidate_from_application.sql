-- An application opens the person who made it.
--
-- ── WHAT WAS MISSING ────────────────────────────────────────────────────
--
-- 20260831092000 made the recruitment chain navigable in both directions —
-- but only once an assessment existed. scp_application_assessments returns a
-- subject_id, and scp_employer_person_overview takes one; nothing in between
-- turns an APPLICATION into the person who made it. So the very first step a
-- recruiter takes — open the application, look at the candidate — had no read
-- model behind it, and the only way to name the applicant was a service-role
-- read of public.profiles from the employer surface (see
-- listApplicationsForEmployer, which does exactly that, best-effort, because
-- profiles is self-select-only).
--
-- ── WHY A DEFINER FUNCTION AND NOT A WIDER GRANT ────────────────────────
--
-- The same reason the three read models before it are definer functions: this
-- crosses a tenant boundary and a person boundary in one query. An application
-- belongs to an employer, a display name belongs to a profile that only its
-- owner may select, and a subject belongs to the identity spine. Granting an
-- employer SELECT on profiles to get a name would be a far larger disclosure
-- than the name, and it would apply to every profile rather than to the people
-- who chose to apply to them.
--
-- So membership is checked once, and exactly one row comes back: the
-- application as the employer already knows it, the applicant's display name,
-- and the stable subject the rest of the journey hangs from.
--
-- ── WHAT IT DELIBERATELY DOES NOT RETURN ────────────────────────────────
--
--   * applicant_user_id — the auth identity. The employer surface has no use
--     for it and every reason not to hold it.
--   * the applicant's email address. Assignment resolves the candidate inside
--     the database (scp_assign_from_application); a surface that held the
--     address would invite somebody to retype it.
--   * the CV storage path. Whether a CV EXISTS is employer-visible; where it
--     lives is not, and the download stays a short-lived signed URL.
--
-- subject_id IS returned, and is the point: it is a pseudonymous platform
-- identifier that the employer already receives from
-- scp_application_assessments, and every function that accepts one re-checks
-- membership for itself.
--
-- It is NULL for a candidate who has applied but never been assessed. That is
-- correct rather than a gap: a subject is minted when somebody is first
-- assessed, and inventing one on a read would create a person record as a
-- side effect of looking at a page.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- One function. No table, column, policy or existing function is touched.
--
-- Remediation:
--
--     DROP FUNCTION IF EXISTS public.scp_application_candidate(uuid) CASCADE;
--
-- Nothing else depends on it, and that exact statement is carried in the
-- rollback suite (supabase/tests/scp_a_rollback_test.sql) beside the three read
-- models it sits with, so the unwind is proven rather than described.

CREATE OR REPLACE FUNCTION public.scp_application_candidate(_application_id uuid)
RETURNS TABLE(
  application_id uuid, employer_id uuid, job_id uuid,
  job_slug text, job_title_sv text, job_title_en text,
  application_status text,
  applied_at timestamptz, updated_at timestamptz,
  cover_note text, phone text, has_cv boolean,
  display_name text, subject_id uuid)
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
$function$;

COMMENT ON FUNCTION public.scp_application_candidate(uuid) IS
  'One job application and the person who made it, for a member of the '
  'organisation that owns it. Resolves the stable subject through '
  'scp_subject_identities rather than through an email string, and returns '
  'neither the applicant''s auth id, nor their address, nor the CV path.';

REVOKE ALL     ON FUNCTION public.scp_application_candidate(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_application_candidate(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof: the candidate read model carries no test material and no auth identity
--
-- Same shape as the guard in 20260831092000, extended with the two identity
-- columns this function specifically must never grow. A return type is the one
-- part of a read model that cannot be widened by accident without being seen.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _sig text; _bad text;
BEGIN
  _sig := pg_get_function_result('public.scp_application_candidate(uuid)'::regprocedure);
  FOREACH _bad IN ARRAY ARRAY[
    'response_text','selected_option','score_value','is_preferred',
    'scoring_rationale','rubric','option_key','is_best_key','is_worst_key',
    'applicant_user_id','user_id','email','cv_storage_path'
  ] LOOP
    IF _sig ILIKE '%' || _bad || '%' THEN
      RAISE EXCEPTION
        'SCP_READ_MODEL_LEAKS: scp_application_candidate exposes "%" in its '
        'return type. The candidate read model must carry neither test '
        'material nor an auth identity.', _bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'candidate read model proven: no test material, no auth identity, no storage path';
END $$;
