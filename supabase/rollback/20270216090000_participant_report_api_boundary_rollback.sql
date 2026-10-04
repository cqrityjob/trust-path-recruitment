-- Operational rollback: REOPENS employee report access and client telemetry.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.scp_participant_report(_attempt_id uuid)
RETURNS TABLE (
  id uuid,
  attempt_id uuid,
  subject_id uuid,
  audience text,
  released_at timestamptz,
  payload jsonb,
  brief jsonb,
  safety_flags jsonb,
  context jsonb,
  limitations_sv text[],
  limitations_en text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The participant document and nothing else. No derivation_input, no
  -- employer document, no ledger. safety_flags is [] by contract: the
  -- participant is told that a concern exists (context.safety_concern_present)
  -- and never its severity (RA3.2, RA3.3). Zero rows when the caller is not
  -- the subject -- indistinguishable from "not released", as the row policy
  -- has always made it.
  --
  -- LEFT JOIN: a released report stays readable by the person it is about
  -- even when its template row is missing (see the migration header). The
  -- template contributes limitation lines and nothing else.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         '[]'::jsonb,
         s.context,
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'participant'
     AND public.scp_report_snapshot_readable('participant', s.subject_id, s.issuer_organization_id);
$$;

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
                   -- 20270203090000: an attempt the caller may read (standing, not the
                   -- subject, and owner/admin, use-case reviewer or the vacancy's
                   -- responsible recruiter)
                   AND public.scp_attempt_reports_readable(a.id)) THEN
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
     AND public.scp_report_snapshot_readable(s.audience, s.subject_id, s.issuer_organization_id, s.attempt_id)
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$;

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
       -- 20270203090000: an attempt the caller may read -- and only in an
       -- organisation where EVERY released attempt of this subject is one they
       -- may read. Maturity is computed per issuing organisation and cannot be
       -- split by attempt, so a reader of one use case or one vacancy gets
       -- nothing rather than a blend that includes an attempt they may not read.
       AND public.scp_attempt_reports_readable(a.id)
       AND NOT EXISTS (SELECT 1 FROM public.scp_attempts b
                        WHERE b.subject_id = a.subject_id
                          AND b.issuer_organization_id = a.issuer_organization_id
                          AND b.released_at IS NOT NULL
                          AND NOT public.scp_attempt_reports_readable(b.id));
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
END; $function$;

ALTER POLICY scp_report_snapshots_own ON public.scp_report_snapshots
  USING (audience = 'participant'
         AND public.scp_report_snapshot_readable(audience, subject_id, issuer_organization_id));
GRANT EXECUTE ON FUNCTION public.cd_record_funnel_event(text, jsonb, uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
