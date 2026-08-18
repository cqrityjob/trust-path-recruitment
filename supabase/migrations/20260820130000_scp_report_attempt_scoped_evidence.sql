-- A standard assessment report is about ONE attempt.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- Every evidence query in scp_release_attempt_report filtered on
-- `e.subject_id = _a.subject_id` and nothing else. That is the whole competency
-- graph for the person: every attempt they have ever completed, for every
-- purpose, in every context.
--
-- With one attempt per person the difference is invisible. The moment the same
-- employee sat the same assessment twice, the second report claimed 36
-- observations and 24 safety-critical answers — the sum of both sittings —
-- while presenting itself as the report for the second attempt. A reader would
-- reasonably conclude the person answered 36 things on that occasion.
--
-- Worse than the wrong number: a later attempt silently rewrote what an earlier
-- one meant. Evidence accumulates, so a second sitting could lift a competency
-- over a threshold and the first report would still be sitting there, immutable,
-- saying something the system no longer agreed with.
--
-- ── THE FIX: REAL PROVENANCE, NOT A TIMESTAMP WINDOW ────────────────────
--
-- Every evidence row carries source_ref, which is the id of the
-- scp_candidate_responses row it came from, and that row carries attempt_id.
-- So the attempt boundary is an exact join, not a guess:
--
--     e.source_ref IN (SELECT id FROM scp_candidate_responses
--                       WHERE attempt_id = <this attempt>)
--
-- Confirmed against live data before writing this: 54 of 54 evidence rows
-- resolve to an attempt through that path. Nothing needed to be inferred from
-- observed_at, and nothing is.
--
-- The same join is what keeps evidence from another PURPOSE out. Learning
-- evidence, evidence from a recruitment case, evidence about a different person
-- — none of it has a source_ref among this attempt's responses, so none of it
-- can enter, and no separate purpose filter is needed to achieve that.
--
-- ── WHY A SECOND MATURITY FUNCTION ──────────────────────────────────────
--
-- scp_compute_maturity is canonical and is NOT touched: it answers "how strong
-- is the evidence about this person", which is the right question for a
-- cumulative development view and the wrong one for a report about a single
-- sitting.
--
-- scp_attempt_maturity answers the scoped question using the SAME
-- scp_maturity_thresholds rows, the same de-duplication on
-- (source_type, source_ref, behaviour_version_id), the same
-- confidence-weighted mean, and the same safety cap. No new scale, no new
-- threshold, no second opinion about what "consistent" means — only a narrower
-- evidence set. If the thresholds change, both change together.
--
-- ── REPRODUCIBILITY ─────────────────────────────────────────────────────
--
-- The snapshot records evidence_scope_version alongside evidence_state_version
-- and threshold_version, so a historical report states which boundary produced
-- it. Snapshots released before this migration carry NULL and are left exactly
-- as they are — including the two that legitimately contain cumulative figures,
-- which are now historically explicable rather than silently wrong.
--
-- Forward-only. Remediation: restore scp_release_attempt_report from
-- 20260820110000 and drop the two new functions. No existing row is rewritten.

ALTER TABLE public.scp_report_snapshots
  ADD COLUMN IF NOT EXISTS evidence_scope_version text;

COMMENT ON COLUMN public.scp_report_snapshots.evidence_scope_version IS
  'Which evidence boundary produced this payload. attempt-v1 = the current frozen attempt only. NULL on rows released before the boundary was scoped; those are cumulative and are never recomputed.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Maturity over one attempt, on the canonical thresholds
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_attempt_maturity(
  _attempt_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _safety boolean;
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
       -- The attempt boundary. Exact provenance: evidence -> response -> attempt.
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ),
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(is_safety_critical), false)
    INTO _obs, _ctx, _srcs, _mean, _safety
    FROM best;

  IF _obs = 0 THEN
    RETURN 'no_evidence';
  END IF;

  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  -- The same safety cap as the canonical function: a safety-critical
  -- observation keeps a competency out of the two top levels.
  IF _safety AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The display state, over the same boundary
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_attempt_evidence_state(
  _attempt_id uuid,
  _competency_version_id uuid,
  _maturity text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _needs_action boolean; _reviewer_flagged boolean;
BEGIN
  -- Safety, and only from a human, and only from THIS attempt. A safety
  -- observation from an earlier sitting belongs to that sitting's report.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND e.is_safety_critical
       AND (e.safety_severity IN ('high','critical') OR e.review_status IN ('pending','in_review'))
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ) INTO _needs_action;

  IF _needs_action THEN RETURN 'critical_follow_up'; END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
      JOIN public.scp_human_reviews hr ON hr.id = e.provenance_ref
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND e.provenance_type = 'human_review'
       AND hr.outcome IN ('adjusted','overturned')
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ) INTO _reviewer_flagged;

  IF _reviewer_flagged THEN RETURN 'follow_up'; END IF;

  RETURN CASE _maturity
    WHEN 'strong_evidence'     THEN 'strongly_shown'
    WHEN 'consistent_evidence' THEN 'shown'
    WHEN 'no_evidence'         THEN 'not_yet_shown'
    ELSE 'follow_up'
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_attempt_evidence_state(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_attempt_evidence_state(uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Release, bounded by the attempt
-- ═══════════════════════════════════════════════════════════════════════════

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
  _scope_version constant text := 'attempt-v1';
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

  -- The evidence set for this report, resolved once by provenance.
  CREATE TEMP TABLE _scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
   WHERE e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  -- ── Part A source facts ────────────────────────────────────────────────
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

  -- Coverage over THIS attempt. Repeating the same form does not add an
  -- evidence context, and now it does not add observations either.
  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope);

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  -- ── The shared spine, scoped ───────────────────────────────────────────
  WITH lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now()) AS maturity,
           count(*) AS observations,
           array_agg(DISTINCT e.source_type ORDER BY e.source_type) AS source_types,
           string_agg(DISTINCT bv.statement_sv, ' ') AS behaviour_sv,
           string_agg(DISTINCT bv.statement_en, ' ') AS behaviour_en,
           bool_or(e.provenance_type = 'human_review') AS human_reviewed
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
      JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
      JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE e.id IN (SELECT id FROM _scope)
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_attempt_evidence_state(_attempt_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'followup_sv',        fpe.prompt_sv,
      'followup_en',        fpe.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'human_reviewed',     s.human_reviewed,
      'reflection_sv',      fpp.prompt_sv,
      'reflection_en',      fpp.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code', s.competency_code,
      'maturity_level',  s.maturity,
      'threshold_version', 'v1'
    ) ORDER BY s.competency_code)
    INTO _emp_payload, _par_payload, _derivation
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fpe
           ON fpe.competency_id = cv2.competency_id AND fpe.audience = 'employer'
          AND fpe.content_status = 'published'
    LEFT JOIN public.scp_followup_prompts fpp
           ON fpp.competency_id = cv2.competency_id AND fpp.audience = 'participant'
          AND fpp.content_status = 'published';

  -- Safety flags for THIS attempt only.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope) AND e.is_safety_critical;

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
    'participant_ref', _ref, 'person_context', _person,
    'organisation_name', _org, 'purpose_code', _purpose,
    'assessment_slug', _slug, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'started_at', _a.started_at,
    'submitted_at', _a.submitted_at, 'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total, 'reviews_completed', _rev_done,
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'report_key', _ev_key, 'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'evidence_scope_version', _scope_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  _par_ctx := jsonb_build_object(
    'person_context', _person, 'organisation_name', _org,
    'purpose_code', _purpose, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'report_key', _pv_key, 'report_version', _pv_num,
    'evidence_scope_version', _scope_version);

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context, evidence_scope_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
          'participant', COALESCE(_par_payload,'[]'::jsonb),
          '[]'::jsonb, _a.scoring_model_version, _state_version,
          _derivation, _par_ctx, _scope_version)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context, evidence_scope_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
          'employer', COALESCE(_emp_payload,'[]'::jsonb), _flags,
          _a.scoring_model_version, _state_version,
          _derivation, _emp_ctx, _scope_version)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  DROP TABLE IF EXISTS _scope;
  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;
