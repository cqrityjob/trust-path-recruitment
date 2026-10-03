-- Rollback of 20270203090000_employer_report_access_model.
--
-- !! THIS REOPENS THE MEMBER-WIDE READ !! Every active member of an organisation
-- again reads every candidate's report, decisions, notes, progress, the person,
-- participant, pipeline, invitation and assignment lists and the review counts,
-- the subject who is a member again reads the employer document about themselves,
-- and reviewer grants again gate nothing but review work. Run it ONLY in an
-- isolated test database (scripts/db-test.sh and the suite cycle it).
--
-- Order: the row policies first (they call the functions below), then every
-- function back to the hosted body it had before (md5(prosrc) pinned, verified at
-- the end), then the three functions this migration introduced. The interview
-- case gates (20270204090000) call employer_reports_readable: roll that migration
-- back FIRST.

ALTER POLICY "scp_report_snapshots_employer" ON public.scp_report_snapshots
  USING (((audience = 'employer'::text) AND scp_report_snapshot_readable(audience, subject_id, issuer_organization_id)));

ALTER POLICY "scp_employer_decisions_member_read" ON public.scp_employer_report_decisions
  USING (has_active_employer_role(auth.uid(), employer_id));

ALTER POLICY "scp_interview_notes_employer_read" ON public.scp_interview_notes
  USING (has_active_employer_role(auth.uid(), employer_id));

ALTER POLICY "scp_assessment_invitations_employer_read" ON public.scp_assessment_invitations
  USING (has_active_employer_role(auth.uid(), employer_id));

ALTER POLICY "assignments_employer_select" ON public.assessment_assignments
  USING ((has_employer_role(auth.uid(), employer_id, NULL::text[]) AND employer_members_can_edit(employer_id)));

ALTER POLICY "scp_training_assignments_read" ON public.scp_training_assignments
  USING ((has_active_employer_role(auth.uid(), employer_id) OR (EXISTS ( SELECT 1
   FROM scp_subject_identities si
  WHERE ((si.subject_id = scp_training_assignments.subject_id) AND (si.user_id = auth.uid()))))));

ALTER POLICY "scp_training_progress_read" ON public.scp_training_module_progress
  USING ((EXISTS ( SELECT 1
   FROM scp_training_assignments ta
  WHERE ((ta.id = scp_training_module_progress.assignment_id) AND (has_active_employer_role(auth.uid(), ta.employer_id) OR (EXISTS ( SELECT 1
           FROM scp_subject_identities si
          WHERE ((si.subject_id = ta.subject_id) AND (si.user_id = auth.uid())))))))));

CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable(_audience text, _subject_id uuid, _issuer_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Verbatim the predicates of scp_report_snapshots_own and
  -- scp_report_snapshots_employer (20260808090000). A participant reads their
  -- OWN participant document; an active member of the commissioning
  -- organisation reads that organisation's employer document. Anything else,
  -- including an unknown audience, is false.
  SELECT CASE _audience
    WHEN 'participant' THEN EXISTS (
      SELECT 1 FROM public.scp_subject_identities si
       WHERE si.subject_id = _subject_id
         AND si.user_id = auth.uid())
    WHEN 'employer' THEN
      _issuer_organization_id IS NOT NULL
      -- 20270108090000: an active member of an ACTIVE organisation
      AND public.has_active_employer_role(auth.uid(), _issuer_organization_id)
    ELSE false
  END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_report_snapshot_readable(text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_report_snapshot_readable(text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_report(_attempt_id uuid)
 RETURNS TABLE(id uuid, attempt_id uuid, subject_id uuid, audience text, released_at timestamp with time zone, payload jsonb, brief jsonb, safety_flags jsonb, context jsonb, limitations_sv text[], limitations_en text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The employer document as released, minus what is internal: no
  -- derivation_input, no mean/spread on any area, and each human finding as
  -- {finding, severity, observed_at} -- the behaviour_version_id the release
  -- function stored beside it is traceability for the private manifest
  -- (PR-R1), not employer report data. subject_id is the pseudonymous
  -- subject, as the row has always carried it; resolving it to a person still
  -- needs scp_resolve_participant_identity. Zero rows for any other
  -- organisation or for a non-member.
  --
  -- LEFT JOIN for the same reason as the participant contract above.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'finding',     f.value -> 'finding',
                    'severity',    f.value -> 'severity',
                    'observed_at', f.value -> 'observed_at')
                  ORDER BY f.ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(s.safety_flags) WITH ORDINALITY f),
         s.context,
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_report_identity(_attempt_id uuid)
 RETURNS TABLE(snapshot_id uuid, report_version_id uuid, released_at timestamp with time zone, scoring_model_version text, threshold_version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.report_version_id, s.released_at, s.scoring_model_version, s.threshold_version
    FROM public.scp_report_snapshots s
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_report_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_report_identity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
 RETURNS TABLE(released_at timestamp with time zone, attempt_id uuid, competency_code text, competency_name_sv text, competency_name_en text, evidence_state text, observations integer, safety_flag_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _audience text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_subject_identities si
              WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    _audience := 'participant';
  ELSIF EXISTS (SELECT 1 FROM public.scp_attempts a
                 WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL
                   -- 20270108090000: an active member of an ACTIVE organisation
                   AND public.has_active_employer_role(auth.uid(), a.issuer_organization_id)) THEN
    _audience := 'employer';
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'evidence_state', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
     AND s.audience = _audience
     -- 20270102090000: only snapshots the caller could read directly. For the
     -- employer audience that is the caller's own organisations' documents;
     -- another employer's report never leaves through this function.
     AND public.scp_report_snapshot_readable(s.audience, s.subject_id, s.issuer_organization_id)
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_development_recommendations(_subject_id uuid)
 RETURNS TABLE(module_version_id uuid, module_name_sv text, module_name_en text, summary_sv text, summary_en text, estimated_minutes integer, addresses_competency_sv text, addresses_competency_en text, maturity_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- NULL: the participant, who reads all of their own evidence. Otherwise the
  -- organisations whose evidence an employer caller may build on.
  _issuers uuid[];
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    -- 20270104090000: an employer caller reads only what its own
    -- organisations issued -- the organisations it is an active member of
    -- that have a released attempt for this subject. Another employer's
    -- evidence neither selects a row nor moves a maturity level.
    SELECT array_agg(DISTINCT a.issuer_organization_id) INTO _issuers
      FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL
       -- 20270108090000: an active member of an ACTIVE organisation
       AND public.has_active_employer_role(auth.uid(), a.issuer_organization_id);
    IF _issuers IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (mv.id)
    mv.id, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, cv.name_sv, cv.name_en,
    lvl.maturity
  FROM public.scp_competency_evidence e
  JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
  JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
  JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
  JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
  JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
  JOIN public.scp_modules m ON m.id = mv.module_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN _issuers IS NULL
                THEN public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
                ELSE public.scp_compute_maturity_for_issuers(_subject_id, cv.id, 'v1', now(), _issuers)
           END AS maturity) lvl
  WHERE e.subject_id = _subject_id
    AND e.superseded_by IS NULL
    AND (_issuers IS NULL OR e.issuer_organization_id = ANY (_issuers))
    -- #47: recommend only content that could actually be delivered. A draft or
    -- retired module is not a development option, it is an authoring artefact.
    AND mv.content_status = 'published'
    AND mv.retired_at IS NULL
    -- And never recommend another employer's private content.
    AND m.owner_employer_id IS NULL
    AND lvl.maturity IN ('no_evidence','limited_evidence','developing_evidence')
  ORDER BY mv.id, mv.display_order;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_development_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_development_recommendations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_decisions(_attempt_id uuid)
 RETURNS TABLE(id uuid, decided_at timestamp with time zone, decided_by_email text, action text, reason_code text, reason_note text, next_step text, next_step_owner text, supersedes_id uuid, is_current boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _emp uuid;
BEGIN
  SELECT a.issuer_organization_id INTO _emp
    FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _emp IS NULL THEN RETURN; END IF;

  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _emp) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.id, d.decided_at, u.email::text, d.action, d.reason_code, d.reason_note,
         d.next_step, d.next_step_owner, d.supersedes_id,
         -- Current means nothing supersedes it.
         NOT EXISTS (SELECT 1 FROM public.scp_employer_report_decisions s
                      WHERE s.supersedes_id = d.id)
    FROM public.scp_employer_report_decisions d
    JOIN auth.users u ON u.id = d.decided_by
   WHERE d.attempt_id = _attempt_id
   ORDER BY d.decided_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_decisions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_decisions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_interview_notes(_attempt_id uuid)
 RETURNS TABLE(id uuid, area_code text, outcome text, note text, recorded_by_email text, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_attempts a
     WHERE a.id = _attempt_id
       -- 20270109090000: an active member of an ACTIVE organisation
       AND public.has_active_employer_role(auth.uid(), a.issuer_organization_id))
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.id, n.area_code, n.outcome, n.note,
         u.email::text, n.recorded_at
    FROM public.scp_interview_notes n
    LEFT JOIN auth.users u ON u.id = n.recorded_by
   WHERE n.attempt_id = _attempt_id
   ORDER BY n.recorded_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_interview_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_notes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_participants(_employer_id uuid)
 RETURNS TABLE(subject_id uuid, attempt_id uuid, assignment_id uuid, programme_name_sv text, programme_name_en text, attempt_status text, answered integer, total_items integer, reviews_outstanding integer, deadline timestamp with time zone, started_at timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, identity_resolvable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.subject_id, a.id, a.assignment_id, d.name_sv, d.name_en, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    -- A count, never the responses themselves.
    COALESCE((SELECT count(*)::int FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses r ON r.id = hr.response_id
               WHERE r.attempt_id = a.id AND hr.review_status = 'pending'), 0),
    asg.expires_at, a.started_at, a.submitted_at, a.scored_at, a.released_at,
    (a.released_at IS NOT NULL)
  FROM public.scp_attempts a
  LEFT JOIN public.assessment_assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  WHERE a.issuer_organization_id = _employer_id
    AND a.mode = 'assessment'
  ORDER BY a.started_at DESC;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_assessment_pipeline(_employer_id uuid)
 RETURNS TABLE(attempt_id uuid, assignment_id uuid, subject_id uuid, employee_id uuid, participant_ref text, participant_name text, assessment_slug text, assessment_name_sv text, assessment_name_en text, purpose_code text, use_case text, governance_mode scp_governance_mode, lifecycle_state text, invited_at timestamp with time zone, started_at timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, deadline timestamp with time zone, answered integer, total_items integer, reviews_total integer, reviews_open integer, identity_resolvable boolean, can_release boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  -- 20270108090000: an active member of an ACTIVE organisation
  IF _role IS NULL OR NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT at.id AS attempt_id, at.assignment_id, at.subject_id, aa.employee_id,
           at.status AS attempt_status, at.form_id,
           d.slug, d.name_sv, d.name_en, pv.purpose_code,
           coalesce(aa.use_case, 'workforce') AS use_case,
           at.governance_mode, aa.invited_at,
           -- The participant's first answer: the only evidence of engagement
           -- this schema actually records.
           (SELECT min(cr.created_at) FROM public.scp_candidate_responses cr
             WHERE cr.attempt_id = at.id) AS first_answer_at,
           at.submitted_at, at.scored_at, at.released_at, aa.expires_at,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id) AS rev_total,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id AND hr.review_status = 'pending') AS rev_open,
           e.first_name, e.last_name
      FROM public.scp_attempts at
      LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
      LEFT JOIN public.employees e ON e.id = aa.employee_id
      LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
      LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
      LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
     WHERE at.issuer_organization_id = _employer_id
       AND at.mode = 'assessment'
  )
  SELECT r.attempt_id, r.assignment_id, r.subject_id, r.employee_id,
         upper(substr(replace(r.subject_id::text, '-', ''), 1, 6)),
         CASE WHEN r.employee_id IS NOT NULL
              THEN nullif(btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), '')
              ELSE NULL END,
         r.slug, r.name_sv, r.name_en, r.purpose_code, r.use_case, r.governance_mode,
         public.scp_attempt_lifecycle_state(
           r.attempt_status, r.first_answer_at, r.submitted_at,
           r.scored_at, r.released_at, r.rev_open),
         r.invited_at, r.first_answer_at, r.submitted_at, r.scored_at,
         r.released_at, r.expires_at,
         coalesce((SELECT count(*)::int FROM public.scp_candidate_responses cr
                    WHERE cr.attempt_id = r.attempt_id), 0),
         coalesce((SELECT count(*)::int FROM public.scp_form_items fi
                    WHERE fi.form_id = r.form_id), 0),
         r.rev_total, r.rev_open,
         (r.released_at IS NOT NULL),
         (r.scored_at IS NOT NULL AND r.released_at IS NULL AND _role IN ('owner','admin'))
    FROM rows r
   ORDER BY coalesce(r.released_at, r.scored_at, r.submitted_at,
                     r.first_answer_at, r.invited_at) DESC NULLS LAST;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_assessment_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_assessment_pipeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_person_overview(_employer_id uuid, _subject_id uuid)
 RETURNS TABLE(row_kind text, row_id uuid, title_sv text, title_en text, status text, use_case text, application_id uuid, job_id uuid, attempt_id uuid, released_at timestamp with time zone, report_available boolean, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

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
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_person_overview(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_person_overview(uuid,uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.scp_employer_invitations(_employer_id uuid)
 RETURNS TABLE(invitation_id uuid, email text, invited_name text, name_sv text, name_en text, use_case text, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, status text, closed_reason text, invited_at timestamp with time zone, expires_at timestamp with time zone, bound_assignment_id uuid, bound_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

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
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_invitations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_review_board(_employer_id uuid)
 RETURNS TABLE(attempt_id uuid, responses_open integer, my_basis text, my_disclosure text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Same entry gate as scp_employer_review_pressure: an active member of this
  -- organisation, and nobody else. A non-member gets zero rows, not an error --
  -- an error would confirm the organisation exists.
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT at.id,
         count(hr.id)::int,
         public.scp_review_authorisation(auth.uid(), at.id),
         public.scp_review_conflict_disclosure(auth.uid(), at.id)
    FROM public.scp_attempts at
    JOIN public.scp_candidate_responses r ON r.attempt_id = at.id
    JOIN public.scp_human_reviews hr ON hr.response_id = r.id
   WHERE at.issuer_organization_id = _employer_id
     AND hr.review_status = 'pending'
   GROUP BY at.id
   ORDER BY at.id;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_review_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_review_board(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_review_pressure(_employer_id uuid)
 RETURNS TABLE(awaiting_review integer, attempts_blocked integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT count(*)::int,
         count(DISTINCT at.id)::int
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_attempts at ON at.id = r.attempt_id
   WHERE hr.review_status = 'pending'
     AND at.issuer_organization_id = _employer_id;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_review_pressure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_review_pressure(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_training_status(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, subject_id uuid, programme_name_sv text, programme_name_en text, version_number integer, status text, modules_total integer, modules_completed integer, assigned_at timestamp with time zone, due_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, language text, identity_resolvable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ta.id, ta.subject_id, pv.name_sv, pv.name_en, pv.version_number, ta.status,
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id),
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id AND mp.status = 'completed'),
    ta.assigned_at, ta.due_at, ta.started_at, ta.completed_at, ta.language,
    EXISTS (SELECT 1 FROM public.scp_subject_identities si
             WHERE si.subject_id = ta.subject_id)
  FROM public.scp_training_assignments ta
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  WHERE ta.employer_id = _employer_id
  ORDER BY ta.assigned_at DESC;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_training_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_training_status(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.employer_report_access(uuid);
DROP FUNCTION IF EXISTS public.scp_report_snapshot_readable(text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_attempt_reports_readable(uuid);
DROP FUNCTION IF EXISTS public.employer_reports_readable(uuid, text, uuid, uuid, uuid[], uuid);

DO $$
DECLARE _bad text := '';
  _pins jsonb := '{"public.scp_report_snapshot_readable(text,uuid,uuid)": "3e86e5201f8bb9c822f556148c0b41dd", "public.scp_employer_report(uuid)": "ed549724a1cd9328e8cd4ef50a935ae4", "public.scp_employer_report_identity(uuid)": "69a2a44a759bd0a4b3582efa5fc81aad", "public.scp_subject_progress(uuid)": "473012949923872e2c4a7e31cff7f141", "public.scp_development_recommendations(uuid)": "28930b9165728e258c3a6caa9750f9d0", "public.scp_employer_decisions(uuid)": "53b14b9ad84934f0cdf48402040ff71f", "public.scp_interview_notes(uuid)": "36456649bce49ffb70bb95f91ddda1ac", "public.scp_employer_participants(uuid)": "2f3588f1e45730feff745ce51e4c55df", "public.scp_employer_assessment_pipeline(uuid)": "782321af9acaca329e4dce6c1290ae14", "public.scp_employer_person_overview(uuid,uuid)": "fdace57c2402b90c5c25a079da1751cd", "public.scp_application_assessments(uuid)": "b750286805de886076bcac7624d02fcc", "public.scp_employer_invitations(uuid)": "2500771f117e9122e8d488a83f275892", "public.scp_employer_review_board(uuid)": "26ab457f0a2209823666afbf1d10a0d4", "public.scp_employer_review_pressure(uuid)": "ea4784377f5a8ceae715328d7f8498cd", "public.scp_employer_training_status(uuid)": "71d5bffbce69ab9225cbf709d6f6f35c"}'::jsonb;
  _k text;
BEGIN
  FOR _k IN SELECT jsonb_object_keys(_pins) LOOP
    IF md5((SELECT prosrc FROM pg_proc WHERE oid = _k::regprocedure)) <> _pins ->> _k THEN
      _bad := _bad || ' ' || _k;
    END IF;
  END LOOP;
  IF _bad <> '' THEN
    RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_ROLLBACK: not the hosted pre-fix body:%', _bad;
  END IF;
  IF to_regprocedure('public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)') IS NOT NULL
     OR to_regprocedure('public.scp_attempt_reports_readable(uuid)') IS NOT NULL
     OR to_regprocedure('public.scp_report_snapshot_readable(text,uuid,uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.employer_report_access(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_ROLLBACK: a function of the migration survives';
  END IF;
  RAISE NOTICE 'EMPLOYER_REPORT_ACCESS_ROLLBACK ok: the member-wide bodies and policies are back';
END $$;
