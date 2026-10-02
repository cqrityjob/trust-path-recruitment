-- =============================================================================
-- P1 -- development recommendations show an employer only its own evidence
-- =============================================================================
--
-- THE DEFECT (2026-10-02 pre-launch hostile-user audit, P1-2):
--
--   scp_development_recommendations(_subject_id) is SECURITY DEFINER. Any
--   active member of any organisation with one released attempt for a subject
--   passed its gate, and then received rows selected from, and maturity
--   levels computed over, ALL of that subject's evidence -- including the
--   evidence other employers' assessments wrote. Employer A therefore learnt,
--   in derived form, which competencies employer B had assessed and how the
--   person did there.
--
-- THE INVARIANT: an employer caller's recommendations are built only from
-- evidence issued by its own organisations -- those it is an active member of
-- that have a released attempt for the subject (the gate the function already
-- used). Another employer's evidence neither selects a module nor moves a
-- maturity level. The participant still reads everything of their own,
-- through scp_compute_maturity exactly as before.
--
-- HOW: a private helper, scp_compute_maturity_for_issuers, is
-- scp_compute_maturity's body verbatim plus one filter on the issuing
-- organisation. It is not executable by any client role. scp_compute_maturity
-- itself is not changed.
--
-- NOT CHANGED: the participant branch, the gate, columns, ordering, the
-- module filters, grants, scp_compute_maturity, any row.
--
-- Rollback: supabase/rollback/20270104090000_scp_development_recommendations_employer_scope_rollback.sql
-- Suite:    supabase/tests/scp_development_recommendations_scope_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.scp_development_recommendations(uuid)') IS NULL
     OR to_regprocedure('public.scp_compute_maturity(uuid,uuid,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_PRECONDITION: scp_development_recommendations or scp_compute_maturity is missing';
  END IF;
END $$;

-- ── 1. Maturity over one set of issuing organisations ────────────────────
CREATE OR REPLACE FUNCTION public.scp_compute_maturity_for_issuers(_subject_id uuid, _competency_version_id uuid, _threshold_version text, _at timestamp with time zone, _issuers uuid[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _concern boolean;
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
      -- The locked rule. Development activity is recorded, not counted.
      JOIN public.scp_evidence_source_types st
        ON st.code = e.source_type AND st.counts_toward_maturity
     WHERE e.subject_id = _subject_id
       -- 20270104090000: only evidence these organisations issued.
       AND e.issuer_organization_id = ANY (_issuers)
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
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
         coalesce(bool_or(safety_finding IN ('low','medium','high','critical')), false)
    INTO _obs, _ctx, _srcs, _mean, _concern
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

  IF _concern AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END;
$function$
;

COMMENT ON FUNCTION public.scp_compute_maturity_for_issuers(uuid, uuid, text, timestamp with time zone, uuid[]) IS
  'scp_compute_maturity restricted to evidence issued by the given organisations '
  '(20270104090000). Internal: called by scp_development_recommendations for an '
  'employer caller, so another employer''s evidence never moves the level it sees.';
REVOKE ALL ON FUNCTION public.scp_compute_maturity_for_issuers(uuid, uuid, text, timestamp with time zone, uuid[])
  FROM PUBLIC, anon, authenticated;

-- ── 2. Recommendations scoped to the caller's own evidence ───────────────
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
      JOIN public.employer_memberships m
        ON m.employer_id = a.issuer_organization_id
       AND m.user_id = auth.uid() AND m.status = 'active'
     WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL;
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

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE
  _src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_development_recommendations(uuid)'::regprocedure);
  _h   regprocedure := 'public.scp_compute_maturity_for_issuers(uuid,uuid,text,timestamp with time zone,uuid[])'::regprocedure;
BEGIN
  IF position('scp_compute_maturity_for_issuers' IN _src) = 0
     OR position('e.issuer_organization_id = ANY (_issuers)' IN _src) = 0 THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_PROOF: the employer branch is not scoped to its own evidence';
  END IF;
  IF position('e.issuer_organization_id = ANY (_issuers)' IN (SELECT prosrc FROM pg_proc WHERE oid = _h)) = 0 THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_PROOF: the scoped maturity helper does not filter by issuer';
  END IF;
  IF has_function_privilege('anon', _h, 'EXECUTE') OR has_function_privilege('authenticated', _h, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_PROOF: a client role may execute scp_compute_maturity_for_issuers';
  END IF;
  IF has_function_privilege('anon', 'public.scp_development_recommendations(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_PROOF: anon may execute scp_development_recommendations';
  END IF;
  RAISE NOTICE 'SCP_RECOMMENDATIONS_SCOPE_PROOF ok: an employer''s recommendations are built only from its own evidence';
END $$;
