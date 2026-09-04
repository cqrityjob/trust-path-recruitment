-- Rollback for 20261025090000_scp_trust_evidence_report_r2a_report_version_continuity.sql
--
-- Restores the two audience read contracts exactly as 20261024090000 defined
-- them, with the INNER JOIN onto scp_report_versions.
--
-- ── READ THIS BEFORE RUNNING IT ────────────────────────────────────────
--
-- The INNER JOIN is the defect. Running this file makes every released
-- snapshot whose template row is missing disappear from its audience again,
-- and the candidate sees "Rapporten är inte tillgänglig ännu" while their
-- history still offers the report. On the production project that was 16
-- reports, 8 participant and 8 employer.
--
-- It is here because a rollback must exist and must be honest about what it
-- reverses, not because it should be run. Nothing here touches a row, a
-- policy, a grant or the audience predicate.

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
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         '[]'::jsonb,
         s.context,
         v.limitations_sv, v.limitations_en
    FROM public.scp_report_snapshots s
    JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'participant'
     AND public.scp_report_snapshot_readable('participant', s.subject_id, s.issuer_organization_id);
$$;

CREATE OR REPLACE FUNCTION public.scp_employer_report(_attempt_id uuid)
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
         v.limitations_sv, v.limitations_en
    FROM public.scp_report_snapshots s
    JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$$;

REVOKE ALL     ON FUNCTION public.scp_participant_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_participant_report(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_employer_report(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report(uuid)    TO authenticated;

DO $proof$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') <> 0 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_ROLLBACK: a contract still left-joins the template';
  END IF;
END
$proof$;
