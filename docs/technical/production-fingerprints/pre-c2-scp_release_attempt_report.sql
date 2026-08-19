-- ============================================================================
-- PRODUCTION FINGERPRINT — captured READ-ONLY before the C2 migration
--
-- Database:  zrahptwsnjcdyzfywbeh
-- Lovable:   9ec625ef-34a1-4b4b-8cbb-712cae168579
-- Captured:  19 August 2026, immediately before
--            20260820130000_scp_report_attempt_scoped_evidence was proposed
--            for execution.
-- Source:    SELECT pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure)
--
-- THIS IS THE ROLLBACK ARTEFACT. If C2 is applied and must be reverted, this
-- exact text is what restores the prior behaviour. Do not edit it.
--
-- Note for the reader: this pre-C2 definition computes evidence with
--   WHERE e.subject_id = _a.subject_id
-- i.e. SUBJECT-scoped and cumulative across every attempt that subject has
-- ever made. That is precisely what C2 changes to attempt-scoped.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
 RETURNS TABLE(participant_snapshot uuid, employer_snapshot uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _flags jsonb; _emp_payload jsonb; _par_payload jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid; _derivation jsonb;
  _emp_ctx jsonb; _par_ctx jsonb;
  _org text; _purpose text; _slug text; _name_sv text; _name_en text;
  _version int; _lang text; _person text; _ref text;
  _rev_total int; _rev_done int; _obs int; _ctx int;
  _pv_key text; _ev_key text; _pv_num int; _ev_num int;
  _state_version constant text := 'des-v1';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT e.name INTO _org FROM public.employers e WHERE e.id = _a.issuer_organization_id;
  SELECT pv2.purpose_code INTO _purpose
    FROM public.scp_purpose_versions pv2 WHERE pv2.id = _a.purpose_version_id;
  SELECT d.slug, d.name_sv, d.name_en, av.version_number
    INTO _slug, _name_sv, _name_en, _version
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _a.assessment_version_id;
  SELECT aa.language,
         CASE WHEN aa.employee_id IS NOT NULL OR aa.use_case = 'workforce'
              THEN 'employee' ELSE 'candidate' END
    INTO _lang, _person
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  _ref := upper(substr(replace(_a.subject_id::text, '-', ''), 1, 6));

  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL;

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  WITH lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity,
           count(*) AS observations
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
      JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
      JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_display_evidence_state(_a.subject_id, l.competency_version_id, l.maturity) AS state,
           (SELECT array_agg(DISTINCT e3.source_type ORDER BY e3.source_type)
              FROM public.scp_competency_evidence e3
              JOIN public.scp_behaviour_competency_map m3 ON m3.behaviour_version_id = e3.behaviour_version_id
             WHERE e3.subject_id = _a.subject_id
               AND m3.competency_version_id = l.competency_version_id
               AND e3.superseded_by IS NULL) AS source_types,
           EXISTS (
             SELECT 1 FROM public.scp_competency_evidence e2
               JOIN public.scp_behaviour_competency_map m2 ON m2.behaviour_version_id = e2.behaviour_version_id
              WHERE e2.subject_id = _a.subject_id
                AND m2.competency_version_id = l.competency_version_id
                AND e2.superseded_by IS NULL
                AND e2.provenance_type = 'human_review') AS human_reviewed,
           (SELECT string_agg(DISTINCT bv2.statement_sv, ' ')
              FROM public.scp_competency_evidence e4
              JOIN public.scp_behaviour_versions bv2 ON bv2.id = e4.behaviour_version_id
              JOIN public.scp_behaviour_competency_map m4 ON m4.behaviour_version_id = bv2.id
             WHERE e4.subject_id = _a.subject_id
               AND m4.competency_version_id = l.competency_version_id
               AND e4.superseded_by IS NULL) AS behaviour_sv,
           (SELECT string_agg(DISTINCT bv3.statement_en, ' ')
              FROM public.scp_competency_evidence e5
              JOIN public.scp_behaviour_versions bv3 ON bv3.id = e5.behaviour_version_id
              JOIN public.scp_behaviour_competency_map m5 ON m5.behaviour_version_id = bv3.id
             WHERE e5.subject_id = _a.subject_id
               AND m5.competency_version_id = l.competency_version_id
               AND e5.superseded_by IS NULL) AS behaviour_en
      FROM lines l
  )
  SELECT jsonb_agg(jsonb_build_object(
           'competency_code',    s.competency_code,
           'competency_name_sv', s.name_sv,
           'competency_name_en', s.name_en,
           'evidence_state',     s.state,
           'observations',       s.observations,
           'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
           'behaviour_sv',       s.behaviour_sv,
           'behaviour_en',       s.behaviour_en,
           'followup_sv',        fp.prompt_sv,
           'followup_en',        fp.prompt_en
         ) ORDER BY s.competency_code)
    INTO _emp_payload
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fp
           ON fp.competency_id = cv2.competency_id AND fp.audience = 'employer'
          AND fp.content_status = 'published';

  WITH lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity,
           count(*) AS observations
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
      JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
      JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_display_evidence_state(_a.subject_id, l.competency_version_id, l.maturity) AS state,
           EXISTS (
             SELECT 1 FROM public.scp_competency_evidence e2
               JOIN public.scp_behaviour_competency_map m2 ON m2.behaviour_version_id = e2.behaviour_version_id
              WHERE e2.subject_id = _a.subject_id
                AND m2.competency_version_id = l.competency_version_id
                AND e2.superseded_by IS NULL
                AND e2.provenance_type = 'human_review') AS human_reviewed,
           (SELECT string_agg(DISTINCT bv2.statement_sv, ' ')
              FROM public.scp_competency_evidence e4
              JOIN public.scp_behaviour_versions bv2 ON bv2.id = e4.behaviour_version_id
              JOIN public.scp_behaviour_competency_map m4 ON m4.behaviour_version_id = bv2.id
             WHERE e4.subject_id = _a.subject_id
               AND m4.competency_version_id = l.competency_version_id
               AND e4.superseded_by IS NULL) AS behaviour_sv,
           (SELECT string_agg(DISTINCT bv3.statement_en, ' ')
              FROM public.scp_competency_evidence e5
              JOIN public.scp_behaviour_versions bv3 ON bv3.id = e5.behaviour_version_id
              JOIN public.scp_behaviour_competency_map m5 ON m5.behaviour_version_id = bv3.id
             WHERE e5.subject_id = _a.subject_id
               AND m5.competency_version_id = l.competency_version_id
               AND e5.superseded_by IS NULL) AS behaviour_en
      FROM lines l
  )
  SELECT jsonb_agg(jsonb_build_object(
           'competency_code',    s.competency_code,
           'competency_name_sv', s.name_sv,
           'competency_name_en', s.name_en,
           'evidence_state',     s.state,
           'observations',       s.observations,
           'behaviour_sv',       s.behaviour_sv,
           'behaviour_en',       s.behaviour_en,
           'human_reviewed',     s.human_reviewed,
           'reflection_sv',      fp.prompt_sv,
           'reflection_en',      fp.prompt_en
         ) ORDER BY s.competency_code)
    INTO _par_payload
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fp
           ON fp.competency_id = cv2.competency_id AND fp.audience = 'participant'
          AND fp.content_status = 'published';

  SELECT jsonb_agg(jsonb_build_object(
           'competency_code', x.code, 'maturity_level', x.maturity, 'threshold_version', 'v1')
         ORDER BY x.code)
    INTO _derivation
    FROM (
      SELECT c.code, public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity
        FROM public.scp_competency_evidence e
        JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
        JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
        JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
        JOIN public.scp_competencies c ON c.id = cv.competency_id
       WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
       GROUP BY c.code, cv.id
    ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.subject_id = _a.subject_id
     AND e.is_safety_critical AND e.superseded_by IS NULL;

  SELECT id, report_key, version_number INTO _pv, _pv_key, _pv_num
    FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id, report_key, version_number INTO _ev, _ev_key, _ev_num
    FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  _emp_ctx := jsonb_build_object(
    'participant_ref', _ref,
    'person_context', _person,
    'organisation_name', _org,
    'purpose_code', _purpose,
    'assessment_slug', _slug,
    'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en,
    'assessment_version', _version,
    'language', _lang,
    'started_at', _a.started_at,
    'submitted_at', _a.submitted_at,
    'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total,
    'reviews_completed', _rev_done,
    'evidence_observations', _obs,
    'evidence_contexts', _ctx,
    'report_key', _ev_key,
    'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  _par_ctx := jsonb_build_object(
    'person_context', _person,
    'organisation_name', _org,
    'purpose_code', _purpose,
    'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en,
    'assessment_version', _version,
    'language', _lang,
    'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'evidence_observations', _obs,
    'evidence_contexts', _ctx,
    'report_key', _pv_key,
    'report_version', _pv_num);

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
          'participant', COALESCE(_par_payload,'[]'::jsonb),
          '[]'::jsonb, _a.scoring_model_version, _state_version, _derivation, _par_ctx)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
          'employer', COALESCE(_emp_payload,'[]'::jsonb), _flags,
          _a.scoring_model_version, _state_version, _derivation, _emp_ctx)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$
