-- #51 — The Tester workspace gets ONE read model, not two.
--
-- scp_employer_assessment_pipeline was added alongside the older
-- scp_employer_participants, which left the actual employer workspace still
-- reading the legacy shape: raw attempt.status instead of the shared lifecycle
-- derivation, and no purpose, use case, employment link or release capability.
-- Two read models over the same rows is exactly the drift this work exists to
-- remove, so the pipeline becomes a superset and the page moves onto it.
--
-- Carried over from the legacy function, deliberately:
--
--   * answered / total_items -- counts, never responses;
--   * identity_resolvable = (released_at IS NOT NULL). Identity resolution
--     stays gated on release. The pipeline must not become a way to learn who
--     somebody is earlier than the governed workflow allows;
--   * mode = 'assessment'. Training attempts belong to Kompetensutveckling and
--     were never part of this workspace -- the first version of the pipeline
--     omitted this filter and would have mixed them in.
--
-- Return type changes, so this is a drop and recreate and the ACL is restated.

DROP FUNCTION IF EXISTS public.scp_employer_assessment_pipeline(uuid);

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
           at.governance_mode,
           aa.invited_at, aa.started_at AS participant_started_at,
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
       -- Training attempts belong to Kompetensutveckling, not to Tester.
       AND at.mode = 'assessment'
  )
  SELECT r.attempt_id, r.assignment_id, r.subject_id, r.employee_id,
         upper(substr(replace(r.subject_id::text, '-', ''), 1, 6)),
         -- A NAME only where the employer's OWN employment record supplies one.
         -- That is the employer's data about its own staff, and it is what lets
         -- a workforce row link to a person profile. Everyone else stays a
         -- pseudonymous reference: populating the table must never become a
         -- bulk identity reveal for candidates or unlinked participants.
         CASE WHEN r.employee_id IS NOT NULL
              THEN nullif(btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), '')
              ELSE NULL END,
         r.slug, r.name_sv, r.name_en, r.purpose_code, r.use_case, r.governance_mode,
         public.scp_attempt_lifecycle_state(
           r.attempt_status, r.participant_started_at, r.submitted_at,
           r.scored_at, r.released_at, r.rev_open),
         r.invited_at, r.participant_started_at, r.submitted_at, r.scored_at,
         r.released_at, r.expires_at,
         -- Counts, never responses.
         coalesce((SELECT count(*)::int FROM public.scp_candidate_responses cr
                    WHERE cr.attempt_id = r.attempt_id), 0),
         coalesce((SELECT count(*)::int FROM public.scp_form_items fi
                    WHERE fi.form_id = r.form_id), 0),
         r.rev_total, r.rev_open,
         -- Unchanged from the legacy model: who a participant is may only be
         -- resolved once their result has been released.
         (r.released_at IS NOT NULL),
         (r.scored_at IS NOT NULL AND r.released_at IS NULL AND _role IN ('owner','admin'))
    FROM rows r
   ORDER BY coalesce(r.released_at, r.scored_at, r.submitted_at,
                     r.participant_started_at, r.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_assessment_pipeline(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assessment_pipeline(uuid) TO authenticated;

-- The person view is a projection OF the pipeline; its column list moved, so it
-- is restated here against the new shape rather than left to bind positionally.
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
   WHERE p.subject_id = _subject
   ORDER BY coalesce(p.released_at, p.submitted_at, p.started_at, p.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) TO authenticated;

DO $$
DECLARE _d text;
BEGIN
  _d := pg_get_functiondef('public.scp_employer_assessment_pipeline(uuid)'::regprocedure);
  IF _d NOT LIKE '%scp_attempt_lifecycle_state%' THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_DRIFT: the pipeline derives its own status';
  END IF;
  IF _d NOT LIKE '%mode = ''assessment''%' THEN
    RAISE EXCEPTION 'SCP_PIPELINE_MIXES_TRAINING: the Tester pipeline is not limited to assessments';
  END IF;
  IF _d NOT LIKE '%r.employee_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'SCP_PIPELINE_BULK_IDENTITY: names are not restricted to employment records';
  END IF;
END $$;
