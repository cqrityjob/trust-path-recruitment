-- Phase 1H — the two Critical findings from the Pre-Phase 2 Architecture Audit.
-- ADDITIVE ONLY.

-- =========================================================================
-- C1 — evidence can never be written without a stable source reference
-- =========================================================================

ALTER TABLE public.scp_competency_evidence
  ALTER COLUMN source_ref SET NOT NULL;

COMMENT ON COLUMN public.scp_competency_evidence.source_ref IS
  'Stable identity of the observation this evidence came from. NOT NULL because '
  'scp_compute_maturity() deduplicates on it and Postgres treats NULLs as equal '
  'in DISTINCT ON -- a nullable value silently collapsed independent observations '
  'into one. A source with no natural row (manager observation, practical '
  'exercise) supplies a generated uuid per observation.';

-- =========================================================================
-- C2 — one assignment model, two lineages
-- =========================================================================

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS scp_assessment_version_id uuid
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT;

ALTER TABLE public.assessment_assignments ALTER COLUMN assessment_id         DROP NOT NULL;
ALTER TABLE public.assessment_assignments ALTER COLUMN assessment_version_id DROP NOT NULL;
ALTER TABLE public.assessment_assignments ALTER COLUMN profile_id            DROP NOT NULL;

ALTER TABLE public.assessment_assignments
  DROP CONSTRAINT IF EXISTS assessment_assignments_single_lineage;
ALTER TABLE public.assessment_assignments
  ADD CONSTRAINT assessment_assignments_single_lineage CHECK (
    (assessment_id IS NOT NULL AND assessment_version_id IS NOT NULL
       AND profile_id IS NOT NULL AND scp_assessment_version_id IS NULL)
    OR
    (assessment_id IS NULL AND assessment_version_id IS NULL
       AND scp_assessment_version_id IS NOT NULL)
  );

COMMENT ON COLUMN public.assessment_assignments.scp_assessment_version_id IS
  'Security Competence Platform lineage. Exactly one of this or the legacy '
  '(assessment_id, assessment_version_id, profile_id) triple is populated -- '
  'enforced by assessment_assignments_single_lineage. An Academy assignment '
  'therefore never touches the retired legacy catalogue.';

CREATE OR REPLACE FUNCTION public.assessment_assignments_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employer_id               IS DISTINCT FROM OLD.employer_id
     OR NEW.assessment_id             IS DISTINCT FROM OLD.assessment_id
     OR NEW.assessment_version_id     IS DISTINCT FROM OLD.assessment_version_id
     OR NEW.scp_assessment_version_id IS DISTINCT FROM OLD.scp_assessment_version_id
     OR NEW.profile_id                IS DISTINCT FROM OLD.profile_id
     OR NEW.recipient_email           IS DISTINCT FROM OLD.recipient_email
     OR NEW.assigned_by               IS DISTINCT FROM OLD.assigned_by
     OR NEW.invitation_token_hash     IS DISTINCT FROM OLD.invitation_token_hash
  THEN
    RAISE EXCEPTION
      'ASSESSMENT_ASSIGNMENT_IMMUTABLE: an assignment''s employer, assessment '
      'lineage, recipient, assigner and invitation token are fixed at creation.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.assessment_assignments_immutable_guard() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.scp_guard_assignment_targets_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _retired timestamptz;
BEGIN
  IF NEW.scp_assessment_version_id IS NULL THEN RETURN NEW; END IF;

  SELECT content_status, retired_at INTO _status, _retired
    FROM public.scp_assessment_versions WHERE id = NEW.scp_assessment_version_id;

  IF _status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_NOT_PUBLISHED: assessment version % is "%" and cannot be '
      'assigned. Publication is a reviewed, owner-approved step.',
      NEW.scp_assessment_version_id, coalesce(_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;

  IF _retired IS NOT NULL AND _retired <= now() THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_RETIRED: assessment version % was retired at % and can no '
      'longer receive new assignments.', NEW.scp_assessment_version_id, _retired
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_guard_assignment_targets_published() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS scp_assignments_target_published_trg ON public.assessment_assignments;
CREATE TRIGGER scp_assignments_target_published_trg
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_assignment_targets_published();

CREATE INDEX IF NOT EXISTS assessment_assignments_scp_version_idx
  ON public.assessment_assignments (scp_assessment_version_id)
  WHERE scp_assessment_version_id IS NOT NULL;

-- =========================================================================
-- Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
     AND column_name = 'source_ref' AND is_nullable = 'NO';
  IF _n <> 1 THEN RAISE EXCEPTION 'SCP_P1H_SOURCE_REF_STILL_NULLABLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.scp_competency_evidence'::regclass
                    AND tgname = 'scp_evidence_append_only') THEN
    RAISE EXCEPTION 'SCP_P1H_APPEND_ONLY_LOST';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.assessment_assignments'::regclass
                    AND conname = 'assessment_assignments_single_lineage') THEN
    RAISE EXCEPTION 'SCP_P1H_LINEAGE_CONSTRAINT_MISSING';
  END IF;

  SELECT count(*) INTO _n FROM public.assessment_assignments
   WHERE NOT (
     (assessment_id IS NOT NULL AND assessment_version_id IS NOT NULL
        AND profile_id IS NOT NULL AND scp_assessment_version_id IS NULL)
     OR (assessment_id IS NULL AND assessment_version_id IS NULL
        AND scp_assessment_version_id IS NOT NULL));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1H_HISTORICAL_ROWS_INVALID: % rows fail the lineage rule', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_assessment_versions
   WHERE content_status = 'published';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1H_ACADEMY_PUBLISHED: % versions are published', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.assessments WHERE employer_visible)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers
                 WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P1H_BOUNDARY_BREACHED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1h-foundation-corrections', 'updated',
  'Phase 1H: the two Critical findings from the Pre-Phase 2 Architecture Audit. C1 — scp_competency_evidence.source_ref is NOT NULL, so no future evidence source can silently collapse independent observations in scp_compute_maturity(). C2 — assessment_assignments now carries both the legacy and the Security Competence Platform lineage under one model, with exactly one populated; the immutability guard was rewritten NULL-correctly and extended to the new column, and an Academy assignment may only target a published version.',
  jsonb_build_object(
    'migration', '20260806090000_scp_phase1h_foundation_corrections',
    'c1', 'source_ref NOT NULL',
    'c2', 'single assignment model, two lineages',
    'new_tables', 0,
    'parallel_domains', 0));