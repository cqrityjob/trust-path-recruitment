-- =============================================================================
-- P1-B (1/4) -- one active-employer rule, applied to employer reports and reads
-- =============================================================================
--
-- THE DEFECT (2026-10-02 full re-audit, P1-B, reproduced on production inside
-- a rolled-back transaction):
--
--   An organisation that is not 'active' -- suspended by moderation, or not
--   yet approved -- loses its members' access to applications through
--   row-level security (job_applications_employer_select requires
--   employer_is_active_status). But most SECURITY DEFINER functions, and
--   several row policies, check only the caller's MEMBERSHIP. With the
--   organisation suspended, its owner still read: the released employer
--   report (scp_employer_report / _v3 / _identity), the assessment pipeline
--   (12 rows), subject progress (24), development recommendations (3),
--   participants (12) and person overviews (3).
--
-- THE CANONICAL RULE: has_active_employer_role(user, employer, roles)
--
--   Introduced here, reused by every later fix in this series. True only for
--   an active membership (has_employer_role, optionally in one of the roles)
--   of an organisation whose status is 'active'. Draft, pending, rejected,
--   suspended, archived and unknown organisations are all false. It is the
--   same rule job_applications already enforces, expressed once.
--
--   Not every employer path takes it. An organisation's OWN set-up -- its
--   profile, job drafts, team list and content catalogue -- stays reachable to
--   draft and pending members (employer_members_can_edit), exactly as today.
--   The rule guards what is about candidates, people and their evidence.
--
-- THIS MIGRATION: employer reports and assessment reads.
--
--   Helpers (each also feeds row-level security and other functions):
--     scp_report_snapshot_readable   employer branch -> the employer report
--                                    family, scp_subject_progress and the
--                                    scp_report_snapshots_employer policy
--     scp_report_issuer_admin        -> scp_participant_report_for_issuer
--   Read functions:
--     scp_employer_participants, scp_employer_assessment_pipeline,
--     scp_employer_person_overview, scp_employer_person_assessments,
--     scp_employer_training_status, scp_employer_decisions,
--     scp_employer_invitations, scp_employer_review_board,
--     scp_employer_review_pressure, scp_subject_progress,
--     scp_development_recommendations
--   Row policies (direct table reads of the same data):
--     scp_assessment_invitations_employer_read,
--     scp_employer_decisions_member_read, scp_training_assignments_read,
--     scp_training_progress_read
--
--   A caller who fails the rule gets exactly the answer a non-member already
--   gets (no rows / false), so an inactive organisation cannot tell
--   "inactive" from "not there".
--
-- Each body is the hosted body verbatim except its membership gate, which now
-- calls has_active_employer_role (marked "20270108090000" in place).
--
-- NOT CHANGED: payloads, columns and grants of every function; the
-- participant's own reads; scp_employer_team, scp_employer_library and
-- scp_employer_content_library (an organisation's own set-up); any row.
-- Later migrations in this series cover candidate identity and job-alert
-- notifications, assessment actions, Interview Intelligence and the Security
-- Passport.
--
-- The application already routes every non-active employer to /employer/pending
-- before any of these functions is called
-- (src/routes/_authenticated.employer.$employerSlug.tsx), so no legitimate
-- screen loses data.
--
-- Rollback: supabase/rollback/20270108090000_employer_active_reads_rollback.sql
-- Suite:    supabase/tests/employer_active_reads_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY[
    'public.scp_report_snapshot_readable(text,uuid,uuid)',
    'public.scp_report_issuer_admin(uuid)',
    'public.scp_employer_participants(uuid)',
    'public.scp_employer_person_overview(uuid,uuid)',
    'public.scp_employer_person_assessments(uuid,uuid)',
    'public.scp_employer_training_status(uuid)',
    'public.scp_employer_decisions(uuid)',
    'public.scp_employer_invitations(uuid)',
    'public.scp_employer_review_board(uuid)',
    'public.scp_employer_review_pressure(uuid)',
    'public.scp_employer_assessment_pipeline(uuid)',
    'public.scp_subject_progress(uuid)',
    'public.scp_development_recommendations(uuid)',
    'public.has_employer_role(uuid,uuid,text[])',
    'public.employer_is_active_status(uuid)'] LOOP
    IF to_regprocedure(_s) IS NULL THEN
      RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PRECONDITION: % is missing', _s;
    END IF;
  END LOOP;
END $$;

-- ── 1. The canonical primitive ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_active_employer_role(_user_id uuid, _employer_id uuid, _roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The one rule for reaching an organisation's candidates, people and
  -- assessment evidence: an ACTIVE membership (has_employer_role, optionally
  -- in one of _roles) of an organisation whose status is 'active'. Every
  -- other status -- draft, pending, rejected, suspended, archived, or no row
  -- at all -- is false. NULL never reads as true.
  SELECT coalesce(public.has_employer_role(_user_id, _employer_id, _roles), false)
     AND coalesce(public.employer_is_active_status(_employer_id), false);
$function$
;

COMMENT ON FUNCTION public.has_active_employer_role(uuid, uuid, text[]) IS
  'True only for an active membership (optionally in one of _roles) of an organisation whose status is active. The canonical gate for employer access to candidates, people and assessment evidence (20270108090000).';

REVOKE ALL ON FUNCTION public.has_active_employer_role(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_employer_role(uuid, uuid, text[]) TO authenticated, service_role;

-- ── 2. The gates (each body is the hosted body; only the gate changes) ───
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

CREATE OR REPLACE FUNCTION public.scp_report_issuer_admin(_issuer_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _issuer_organization_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     -- 20270108090000: an active member of an ACTIVE organisation
     AND public.has_active_employer_role(auth.uid(), _issuer_organization_id, ARRAY['owner','admin']);
$function$
;

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

CREATE OR REPLACE FUNCTION public.scp_employer_person_assessments(_employer_id uuid, _employee_id uuid)
 RETURNS TABLE(attempt_id uuid, assessment_slug text, assessment_name_sv text, assessment_name_en text, purpose_code text, use_case text, governance_mode scp_governance_mode, lifecycle_state text, assigned_at timestamp with time zone, started_at timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, reviews_total integer, reviews_open integer, employer_snapshot_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _subject uuid;
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  SELECT e.subject_id INTO _subject
    FROM public.employees e
   WHERE e.id = _employee_id AND e.employer_id = _employer_id;
  IF _subject IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.attempt_id, p.assessment_slug, p.assessment_name_sv, p.assessment_name_en,
         p.purpose_code, p.use_case, p.governance_mode, p.lifecycle_state,
         p.invited_at, p.started_at, p.submitted_at, p.scored_at, p.released_at,
         p.reviews_total, p.reviews_open,
         (SELECT rs.id FROM public.scp_report_snapshots rs
           WHERE rs.attempt_id = p.attempt_id AND rs.audience = 'employer' LIMIT 1)
    FROM public.scp_employer_assessment_pipeline(_employer_id) p
   WHERE p.subject_id = _subject
   ORDER BY coalesce(p.released_at, p.submitted_at, p.started_at, p.invited_at) DESC NULLS LAST;
END; $function$
;

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

-- ── 3. Row-level security on the same data ──────────────────────────────
ALTER POLICY scp_assessment_invitations_employer_read ON public.scp_assessment_invitations
  USING (public.has_active_employer_role(auth.uid(), employer_id));

ALTER POLICY scp_employer_decisions_member_read ON public.scp_employer_report_decisions
  USING (public.has_active_employer_role(auth.uid(), employer_id));

ALTER POLICY scp_training_assignments_read ON public.scp_training_assignments
  USING (public.has_active_employer_role(auth.uid(), employer_id)
         OR EXISTS (SELECT 1 FROM public.scp_subject_identities si
                     WHERE si.subject_id = scp_training_assignments.subject_id
                       AND si.user_id = auth.uid()));

ALTER POLICY scp_training_progress_read ON public.scp_training_module_progress
  USING (EXISTS (SELECT 1 FROM public.scp_training_assignments ta
                  WHERE ta.id = scp_training_module_progress.assignment_id
                    AND (public.has_active_employer_role(auth.uid(), ta.employer_id)
                         OR EXISTS (SELECT 1 FROM public.scp_subject_identities si
                                     WHERE si.subject_id = ta.subject_id
                                       AND si.user_id = auth.uid()))));

-- ── 4. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _s text; _p text;
BEGIN
  IF to_regprocedure('public.has_active_employer_role(uuid,uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: has_active_employer_role is missing';
  END IF;
  IF has_function_privilege('anon', 'public.has_active_employer_role(uuid,uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: anon may execute has_active_employer_role';
  END IF;
  FOREACH _s IN ARRAY ARRAY['public.scp_report_snapshot_readable(text,uuid,uuid)', 'public.scp_report_issuer_admin(uuid)', 'public.scp_employer_participants(uuid)', 'public.scp_employer_person_overview(uuid,uuid)', 'public.scp_employer_person_assessments(uuid,uuid)', 'public.scp_employer_training_status(uuid)', 'public.scp_employer_decisions(uuid)', 'public.scp_employer_invitations(uuid)', 'public.scp_employer_review_board(uuid)', 'public.scp_employer_review_pressure(uuid)', 'public.scp_employer_assessment_pipeline(uuid)', 'public.scp_subject_progress(uuid)', 'public.scp_development_recommendations(uuid)'] LOOP
    IF position('has_active_employer_role' IN (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: % does not use has_active_employer_role', _s;
    END IF;
    IF position('employer_memberships' IN (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure)) > 0
       AND _s NOT IN ('public.scp_employer_assessment_pipeline(uuid)') THEN
      RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: % still gates on employer_memberships directly', _s;
    END IF;
    IF has_function_privilege('anon', _s, 'EXECUTE') THEN
      RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: anon may execute %', _s;
    END IF;
  END LOOP;
  FOREACH _p IN ARRAY ARRAY['scp_assessment_invitations.scp_assessment_invitations_employer_read', 'scp_employer_report_decisions.scp_employer_decisions_member_read', 'scp_training_assignments.scp_training_assignments_read', 'scp_training_module_progress.scp_training_progress_read'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = split_part(_p, '.', 1)
                      AND policyname = split_part(_p, '.', 2)
                      AND qual LIKE '%has_active_employer_role%'
                      AND qual NOT LIKE '%has_employer_role(%'
                      AND qual NOT LIKE '%employer_memberships%') THEN
      RAISE EXCEPTION 'EMPLOYER_ACTIVE_READS_PROOF: policy % does not use has_active_employer_role alone', _p;
    END IF;
  END LOOP;
  RAISE NOTICE 'EMPLOYER_ACTIVE_READS_PROOF ok: 13 functions and 4 policies require an active organisation';
END $$;
