CREATE OR REPLACE FUNCTION public.scp_attempt_lifecycle_state(
  _attempt_status text,
  _started_at     timestamptz,
  _submitted_at   timestamptz,
  _scored_at      timestamptz,
  _released_at    timestamptz,
  _reviews_open   integer DEFAULT 0
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _attempt_status = 'abandoned'   THEN 'abandoned'
    WHEN _released_at  IS NOT NULL       THEN 'result_available'
    WHEN _scored_at    IS NOT NULL       THEN 'ready_to_release'
    -- Submitted with review outstanding is a different product state from
    -- submitted with nothing outstanding: one is waiting on a human, the other
    -- is a transient the engine closes by itself.
    WHEN _submitted_at IS NOT NULL AND coalesce(_reviews_open, 0) > 0 THEN 'under_review'
    WHEN _submitted_at IS NOT NULL       THEN 'processing'
    WHEN _started_at   IS NOT NULL       THEN 'in_progress'
    ELSE 'invited'
  END;
$function$;

COMMENT ON FUNCTION public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer) IS
  'The single derivation of an attempt''s product lifecycle state. Every surface '
  'that shows a status must call this, so the employer pipeline, the person page '
  'and the participant''s own history cannot disagree about the same attempt.';

REVOKE ALL     ON FUNCTION public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_assessment_pipeline(_employer_id uuid)
RETURNS TABLE(
  attempt_id         uuid,
  assignment_id      uuid,
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
  reviews_total      integer,
  reviews_open       integer,
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
    SELECT at.id AS attempt_id, at.assignment_id, aa.employee_id,
           at.subject_id, at.status AS attempt_status,
           d.slug, d.name_sv, d.name_en, pv.purpose_code,
           coalesce(aa.use_case, 'workforce') AS use_case,
           at.governance_mode,
           aa.invited_at,
           -- scp_attempts.started_at DEFAULTs to now(), so it records when the
           -- attempt row was created -- i.e. when the employer assigned. The
           -- moment the participant actually opened the assessment is on the
           -- assignment. Using the attempt column here would make "invited"
           -- unreachable and every new assignment look already in progress.
           aa.started_at,
           at.submitted_at, at.scored_at, at.released_at,
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
  )
  SELECT r.attempt_id, r.assignment_id, r.employee_id,
         upper(substr(replace(r.subject_id::text, '-', ''), 1, 6)),
         -- A name only where an employment record supplies one. The pipeline is
         -- an operational view for the employer, not a directory, and an
         -- unnamed participant stays a pseudonymous reference.
         nullif(btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
         r.slug, r.name_sv, r.name_en, r.purpose_code, r.use_case, r.governance_mode,
         public.scp_attempt_lifecycle_state(
           r.attempt_status, r.started_at, r.submitted_at, r.scored_at,
           r.released_at, r.rev_open),
         r.invited_at, r.started_at, r.submitted_at, r.scored_at, r.released_at,
         r.rev_total, r.rev_open,
         -- Releasing is an owner/admin act, and only once scoring is complete.
         (r.scored_at IS NOT NULL AND r.released_at IS NULL AND _role IN ('owner','admin'))
    FROM rows r
   ORDER BY coalesce(r.released_at, r.scored_at, r.submitted_at, r.started_at, r.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_assessment_pipeline(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assessment_pipeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_person_assessments(
  _employer_id uuid,
  _employee_id uuid
)
RETURNS TABLE(
  attempt_id        uuid,
  assessment_slug   text,
  assessment_name_sv text,
  assessment_name_en text,
  purpose_code      text,
  use_case          text,
  governance_mode   public.scp_governance_mode,
  lifecycle_state   text,
  assigned_at       timestamptz,
  started_at        timestamptz,
  submitted_at      timestamptz,
  scored_at         timestamptz,
  released_at       timestamptz,
  reviews_total     integer,
  reviews_open      integer,
  employer_snapshot_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _subject uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
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
    JOIN public.scp_attempts at ON at.id = p.attempt_id
   WHERE at.subject_id = _subject
   ORDER BY coalesce(p.released_at, p.submitted_at, p.started_at, p.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) TO authenticated;

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
           at.status, aa.started_at, at.submitted_at, at.scored_at, at.released_at,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id AND hr.review_status = 'pending')),
         aa.invited_at, aa.started_at, at.submitted_at, at.released_at,
         (SELECT rs.id FROM public.scp_report_snapshots rs
           WHERE rs.attempt_id = at.id AND rs.audience = 'participant' LIMIT 1)
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
    LEFT JOIN public.employers e ON e.id = at.issuer_organization_id
    LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
   WHERE at.subject_id = _subject
   ORDER BY coalesce(at.released_at, at.submitted_at, at.started_at, aa.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_my_assessment_history() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_assessment_history() TO authenticated;

DO $$
DECLARE _d text;
BEGIN
  -- All three projections must use the one derivation.
  FOREACH _d IN ARRAY ARRAY[
      'public.scp_employer_assessment_pipeline(uuid)',
      'public.scp_my_assessment_history()'] LOOP
    IF pg_get_functiondef(_d::regprocedure) NOT LIKE '%scp_attempt_lifecycle_state%' THEN
      RAISE EXCEPTION 'SCP_LIFECYCLE_DRIFT: % derives its own status', _d;
    END IF;
  END LOOP;
  IF pg_get_functiondef('public.scp_employer_person_assessments(uuid,uuid)'::regprocedure)
       NOT LIKE '%scp_employer_assessment_pipeline%' THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_DRIFT: the person view is not a projection of the pipeline';
  END IF;
  -- Audiences must not cross.
  IF pg_get_functiondef('public.scp_my_assessment_history()'::regprocedure) LIKE '%''employer''%' THEN
    RAISE EXCEPTION 'SCP_AUDIENCE_MIXED: participant history reaches for the employer snapshot';
  END IF;
END $$;