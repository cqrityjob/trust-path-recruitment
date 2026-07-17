
-- ==========================================================================
-- Epic 2 — P7: Legacy taxonomy hard cleanup, rollback-controlled
-- ==========================================================================

-- 1) Permanent backup of the 13 archived legacy family rows
CREATE TABLE IF NOT EXISTS public.cig_profession_families_legacy_backup
  (LIKE public.cig_profession_families INCLUDING ALL);

-- Ensure Data-API access follows the same admin-only pattern as job_admin_meta.
GRANT ALL ON public.cig_profession_families_legacy_backup TO service_role;
ALTER TABLE public.cig_profession_families_legacy_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legacy_family_backup_admin_all"
  ON public.cig_profession_families_legacy_backup;
CREATE POLICY "legacy_family_backup_admin_all"
  ON public.cig_profession_families_legacy_backup
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Snapshot every archived row (idempotent by primary key).
INSERT INTO public.cig_profession_families_legacy_backup
SELECT * FROM public.cig_profession_families
WHERE archived_at IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2) Preflight invariants — abort if any assumption is violated
DO $epic2_p7$
DECLARE
  v_archived   int;
  v_backup     int;
  v_rel_refs   int;
  v_prof_refs  int;
  v_job_refs   int;
BEGIN
  SELECT count(*) INTO v_archived
    FROM public.cig_profession_families WHERE archived_at IS NOT NULL;

  SELECT count(*) INTO v_backup
    FROM public.cig_profession_families_legacy_backup;

  IF v_backup < v_archived THEN
    RAISE EXCEPTION 'Backup incomplete: backup=% archived=%', v_backup, v_archived;
  END IF;

  SELECT count(*) INTO v_rel_refs
    FROM public.cig_profession_family_rel r
    JOIN public.cig_profession_families f ON f.id = r.family_id
    WHERE f.archived_at IS NOT NULL;
  IF v_rel_refs <> 0 THEN
    RAISE EXCEPTION 'Cannot hard-delete: % family_rel rows still reference archived families', v_rel_refs;
  END IF;

  SELECT count(*) INTO v_prof_refs
    FROM public.cig_professions p
    JOIN public.cig_profession_families f ON f.id = p.primary_family_id
    WHERE f.archived_at IS NOT NULL;
  IF v_prof_refs <> 0 THEN
    RAISE EXCEPTION 'Cannot hard-delete: % professions still reference archived primary family', v_prof_refs;
  END IF;

  SELECT count(*) INTO v_job_refs
    FROM public.jobs j
    LEFT JOIN public.cig_profession_families f ON f.canonical_id = j.family_id
    WHERE j.family_id IS NOT NULL AND f.id IS NULL;
  IF v_job_refs <> 0 THEN
    RAISE EXCEPTION 'Cannot hard-delete: % jobs use a non-canonical family_id', v_job_refs;
  END IF;
END $epic2_p7$;

-- 3) Hard delete the archived legacy rows
DELETE FROM public.cig_profession_families
WHERE archived_at IS NOT NULL;

-- 4) Narrow the family whitelist to the 14 canonical IDs
CREATE OR REPLACE FUNCTION public.assert_cig_family_id(p_family_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_family_id IN (
    'protective_operations','public_safety_justice','corrections_secure_transport',
    'defence_national_security','corporate_security','critical_infrastructure_security',
    'risk_management','crisis_management','business_continuity_resilience',
    'cyber_information_security','financial_crime_compliance','security_technology',
    'security_leadership_governance','investigations_intelligence'
  );
$$;

-- 5) Post-check: exactly 14 canonical rows remain, none archived
DO $epic2_p7_post$
DECLARE
  v_total    int;
  v_archived int;
  v_canonical int;
BEGIN
  SELECT count(*) INTO v_total    FROM public.cig_profession_families;
  SELECT count(*) INTO v_archived FROM public.cig_profession_families WHERE archived_at IS NOT NULL;
  SELECT count(*) INTO v_canonical FROM public.cig_profession_families WHERE canonical_id IS NOT NULL;
  IF v_total <> 14 OR v_archived <> 0 OR v_canonical <> 14 THEN
    RAISE EXCEPTION 'Post-cleanup invariant failed: total=% archived=% canonical=%',
      v_total, v_archived, v_canonical;
  END IF;
END $epic2_p7_post$;
