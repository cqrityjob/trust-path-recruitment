-- #51 — "In progress" has to be reachable, and has to be true.
--
-- The previous migration derived the started signal from
-- assessment_assignments.started_at, on the reasoning that scp_attempts.started_at
-- DEFAULTs to now() and therefore records when the EMPLOYER assigned rather than
-- when the participant began.
--
-- That reasoning was right and the replacement was wrong. Nothing in the SCP
-- path ever sets assessment_assignments.started_at: measured against production,
-- every assignment behind a submitted or released attempt still has
-- started_at IS NULL and status 'invited'. So the derivation could never return
-- 'in_progress' at all -- an attempt went straight from "Inbjuden" to
-- "Under granskning", and a participant who was halfway through answering
-- appeared to the employer as not having started.
--
-- There is no served-items record to consult either. The only fact that
-- actually evidences a participant engaging with an assessment is a saved
-- response, so that is what the derivation now reads: the time of their first
-- answer. It cannot be produced by assigning, it cannot be faked by opening a
-- page, and it is exactly what "in progress" means to the person reading it.

CREATE OR REPLACE FUNCTION public.scp_employer_assessment_pipeline(_employer_id uuid)
RETURNS TABLE(
  attempt_id         uuid,
  assignment_id      uuid,
  subject_id         uuid,
  employee_id        uuid,
  participant_ref    text,
  participant_name   text,
  assessment_slug    text,
  assessment_name_sv text,
  assessment_name_en text,
  purpose_code       text,
  use_case           text,
  governance_mode    public.scp_governance_mode,
  lifecycle_state    text,
  invited_at         timestamptz,
  started_at         timestamptz,
  submitted_at       timestamptz,
  scored_at          timestamptz,
  released_at        timestamptz,
  deadline           timestamptz,
  answered           integer,
  total_items        integer,
  reviews_total      integer,
  reviews_open       integer,
  identity_resolvable boolean,
  can_release        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL THEN RETURN; END IF;

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
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_assessment_pipeline(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assessment_pipeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_my_assessment_history()
RETURNS TABLE(
  attempt_id        uuid,
  assessment_slug   text,
  assessment_name_sv text,
  assessment_name_en text,
  issuer_name       text,
  purpose_code      text,
  use_case          text,
  lifecycle_state   text,
  invited_at        timestamptz,
  started_at        timestamptz,
  submitted_at      timestamptz,
  released_at       timestamptz,
  participant_snapshot_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _subject uuid;
BEGIN
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = auth.uid();
  IF _subject IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT at.id, d.slug, d.name_sv, d.name_en, e.name, pv.purpose_code,
         coalesce(aa.use_case, 'workforce'),
         public.scp_attempt_lifecycle_state(
           at.status,
           (SELECT min(cr.created_at) FROM public.scp_candidate_responses cr
             WHERE cr.attempt_id = at.id),
           at.submitted_at, at.scored_at, at.released_at,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id AND hr.review_status = 'pending')),
         aa.invited_at,
         (SELECT min(cr.created_at) FROM public.scp_candidate_responses cr
           WHERE cr.attempt_id = at.id),
         at.submitted_at, at.released_at,
         (SELECT rs.id FROM public.scp_report_snapshots rs
           WHERE rs.attempt_id = at.id AND rs.audience = 'participant' LIMIT 1)
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
    LEFT JOIN public.employers e ON e.id = at.issuer_organization_id
    LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
   WHERE at.subject_id = _subject
     AND at.mode = 'assessment'
   ORDER BY coalesce(at.released_at, at.submitted_at, aa.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_my_assessment_history() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_assessment_history() TO authenticated;

DO $$
DECLARE _d text;
BEGIN
  _d := pg_get_functiondef('public.scp_employer_assessment_pipeline(uuid)'::regprocedure);
  IF _d LIKE '%aa.started_at%' THEN
    RAISE EXCEPTION 'SCP_UNREACHABLE_IN_PROGRESS: the pipeline still reads an assignment column nothing sets';
  END IF;
  IF _d NOT LIKE '%min(cr.created_at)%' THEN
    RAISE EXCEPTION 'SCP_NO_ACTIVITY_SIGNAL: the pipeline does not derive started from real participant activity';
  END IF;
END $$;
