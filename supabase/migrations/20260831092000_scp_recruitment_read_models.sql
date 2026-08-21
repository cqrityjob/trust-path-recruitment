-- The recruitment journey becomes navigable in both directions.
--
-- ── WHAT WAS MISSING ────────────────────────────────────────────────────
--
-- assessment_assignments has carried job_id and application_id since the
-- pre-Academy assignment model, and 20260831090000 started writing them. But
-- nothing reads them. A recruiter who assigns an assessment from an
-- application still has no way back:
--
--     Job -> Application -> Candidate -> Assessment -> Report
--
-- was a chain the data could express and no query would answer. So was the
-- other direction, Person -> Assessments -> Report, for a person the employer
-- knows through a hiring pipeline rather than an employment record.
--
-- ── WHY READ MODELS AND NOT VIEWS ───────────────────────────────────────
--
-- Every one of these crosses a tenant boundary and a person boundary in the
-- same query: an application belongs to an employer, an attempt belongs to a
-- subject, and a report belongs to an audience. A security_invoker view would
-- need the caller to hold SELECT on job_applications, scp_attempts and
-- scp_report_snapshots simultaneously — which employers correctly do not — so
-- these are definer functions that check membership once and return only that
-- organisation's rows.
--
-- Nothing here returns a raw response, an option, a score or a rubric level:
-- those columns are absent from every return type below.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Three new read functions, and one widened: scp_my_academy_work gains the job
-- title and the use case, so a candidate can see that an assessment relates to
-- a job they applied for rather than appearing out of nowhere.
--
-- Remediation: restore scp_my_academy_work from 20260826091000 and drop the
-- three new functions.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. What happened to the assessments on one application
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_application_assessments(_application_id uuid)
RETURNS TABLE(
  assignment_id uuid, attempt_id uuid, subject_id uuid,
  assessment_slug text, name_sv text, name_en text,
  designed_for text, use_case text,
  governance_mode public.scp_governance_mode,
  attempt_status text, answered integer, total_items integer,
  reviews_outstanding integer,
  invited_at timestamptz, deadline timestamptz,
  submitted_at timestamptz, scored_at timestamptz, released_at timestamptz,
  report_available boolean)
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
$function$;

COMMENT ON FUNCTION public.scp_application_assessments(uuid) IS
  'The assessments assigned from one job application, for a member of the '
  'organisation that owns it. Status and lineage only: no response, no option, '
  'no score and no reviewer material appears in the return type.';

REVOKE ALL     ON FUNCTION public.scp_application_assessments(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_application_assessments(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. One person, as this employer knows them
--
-- Deliberately scoped to the employer as well as the subject. A person may be
-- a candidate at three companies; each sees only its own relationship with
-- them, which is the same disclosure rule the employee spine established.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_person_overview(
  _employer_id uuid,
  _subject_id uuid)
RETURNS TABLE(
  row_kind text, row_id uuid,
  title_sv text, title_en text,
  status text, use_case text,
  application_id uuid, job_id uuid,
  attempt_id uuid, released_at timestamptz, report_available boolean,
  occurred_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer_id AND m.user_id = auth.uid()
                    AND m.status = 'active') THEN RETURN; END IF;

  -- Applications this person made to THIS employer. Reached through the
  -- subject's account links rather than through an email string.
  RETURN QUERY
  SELECT 'application'::text, a.id,
         j.title_sv, coalesce(j.title_en, j.title_sv),
         a.status, 'recruitment'::text,
         a.id, a.job_id, NULL::uuid, NULL::timestamptz, false, a.created_at
    FROM public.job_applications a
    JOIN public.scp_subject_identities si ON si.user_id = a.applicant_user_id
    LEFT JOIN public.jobs j ON j.id = a.job_id
   WHERE a.employer_id = _employer_id AND si.subject_id = _subject_id;

  -- Assessments this employer commissioned for this person.
  RETURN QUERY
  SELECT 'assessment'::text, at.id,
         coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
         at.status, asg.use_case,
         asg.application_id, asg.job_id, at.id, at.released_at,
         EXISTS (SELECT 1 FROM public.scp_report_snapshots s
                  WHERE s.attempt_id = at.id AND s.audience = 'employer'),
         coalesce(at.started_at, asg.invited_at)
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments asg ON asg.id = at.assignment_id
    LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE at.subject_id = _subject_id
     AND at.issuer_organization_id = _employer_id
     AND at.mode = 'assessment';

  -- Interview evidence recorded by this organisation.
  RETURN QUERY
  SELECT 'interview_note'::text, n.id,
         n.area_code, n.area_code, n.outcome, NULL::text,
         NULL::uuid, NULL::uuid, n.attempt_id, NULL::timestamptz, false, n.recorded_at
    FROM public.scp_interview_notes n
    JOIN public.scp_attempts at2 ON at2.id = n.attempt_id
   WHERE n.employer_id = _employer_id AND at2.subject_id = _subject_id;
END;
$function$;

COMMENT ON FUNCTION public.scp_employer_person_overview(uuid, uuid) IS
  'One person''s relationship with ONE organisation: their applications, the '
  'assessments that organisation commissioned, and the interview evidence it '
  'recorded. Scoped to both subject and employer, so a person shared between '
  'two companies never leaks one company''s activity to the other.';

REVOKE ALL     ON FUNCTION public.scp_employer_person_overview(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_person_overview(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Invitations waiting on somebody who has not signed up yet
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_invitations(_employer_id uuid)
RETURNS TABLE(
  invitation_id uuid, email text, invited_name text,
  name_sv text, name_en text, use_case text,
  application_id uuid, job_id uuid, job_title_sv text, job_title_en text,
  status text, closed_reason text,
  invited_at timestamptz, expires_at timestamptz,
  bound_assignment_id uuid, bound_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer_id AND m.user_id = auth.uid()
                    AND m.status = 'active') THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.email, i.invited_name,
         coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
         i.use_case, i.application_id, i.job_id,
         j.title_sv, coalesce(j.title_en, j.title_sv),
         i.status, i.closed_reason, i.invited_at, i.expires_at,
         i.bound_assignment_id, i.bound_at
    FROM public.scp_assessment_invitations i
    LEFT JOIN public.scp_assessment_versions av ON av.id = i.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    LEFT JOIN public.jobs j ON j.id = i.job_id
   WHERE i.employer_id = _employer_id
   ORDER BY i.invited_at DESC;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_employer_invitations(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_invitations(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The candidate learns WHY they were asked
--
-- Return type widens by two columns. Body from 20260826091000, with the job
-- joined in and the use case carried through, so an assessment that arrived
-- because somebody applied for a job says so instead of appearing unexplained
-- in a list.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_my_academy_work();

CREATE OR REPLACE FUNCTION public.scp_my_academy_work()
RETURNS TABLE(work_kind text, work_id uuid, title_sv text, title_en text,
              employer_name text, status text,
              progress_done integer, progress_total integer,
              assigned_at timestamptz, deadline timestamptz,
              released_at timestamptz, purpose_sv text, purpose_en text,
              use_case text, job_title_sv text, job_title_en text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    'assessment'::text, a.id, d.name_sv, d.name_en, e.name, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    a.started_at, asg.expires_at, a.released_at, p.notice_sv, p.notice_en,
    asg.use_case, j.title_sv, COALESCE(j.title_en, j.title_sv)
  FROM public.scp_attempts a
  JOIN public.scp_subject_identities si
    ON si.subject_id = a.subject_id AND si.user_id = auth.uid()
  LEFT JOIN public.assessment_assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.jobs j ON j.id = asg.job_id
  LEFT JOIN public.employers e ON e.id = a.issuer_organization_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  LEFT JOIN LATERAL (
    SELECT pp.name_sv AS notice_sv, pp.name_en AS notice_en
      FROM public.scp_purpose_versions pvv
      JOIN public.scp_processing_purposes pp ON pp.code = pvv.purpose_code
     WHERE pvv.id = a.purpose_version_id) p ON true
  WHERE a.mode = 'assessment';

  RETURN QUERY
  SELECT
    'training'::text, ta.id, pv.name_sv, pv.name_en, e.name, ta.status,
    COALESCE((SELECT count(*)::int FROM public.scp_training_module_progress mp
               WHERE mp.assignment_id = ta.id AND mp.status = 'completed'), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_training_module_progress mp
               WHERE mp.assignment_id = ta.id), 0),
    ta.assigned_at, ta.due_at, NULL::timestamptz, p.notice_sv, p.notice_en,
    'workforce'::text, NULL::text, NULL::text
  FROM public.scp_training_assignments ta
  JOIN public.scp_subject_identities si
    ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  LEFT JOIN public.employers e ON e.id = ta.employer_id
  LEFT JOIN LATERAL (
    SELECT pp.name_sv AS notice_sv, pp.name_en AS notice_en
      FROM public.scp_purpose_versions pvv
      JOIN public.scp_processing_purposes pp ON pp.code = pvv.purpose_code
     WHERE pvv.id = ta.purpose_version_id) p ON true
  WHERE ta.status <> 'cancelled';
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_my_academy_work() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_academy_work() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Proof: no read model leaks test material
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _fn text; _sig text; _bad text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.scp_application_assessments(uuid)',
    'public.scp_employer_person_overview(uuid,uuid)',
    'public.scp_employer_invitations(uuid)',
    'public.scp_my_academy_work()'
  ] LOOP
    _sig := pg_get_function_result(_fn::regprocedure);
    FOREACH _bad IN ARRAY ARRAY[
      'response_text','selected_option','score_value','is_preferred',
      'scoring_rationale','rubric','option_key','is_best_key','is_worst_key'
    ] LOOP
      IF _sig ILIKE '%' || _bad || '%' THEN
        RAISE EXCEPTION
          'SCP_READ_MODEL_LEAKS: % exposes "%" in its return type. A navigation '
          'read model must not be able to carry test material.', _fn, _bad;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'recruitment read models proven: no response, option, key or rubric in any return type';
END $$;
