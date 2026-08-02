-- Phase 1H — the two Critical findings from the Pre-Phase 2 Architecture Audit.
--
-- ADDITIVE ONLY. Nothing else is changed. No new abstraction, no parallel
-- assignment domain, no speculative improvement.

-- =========================================================================
-- C1 — evidence can never be written without a stable source reference
-- =========================================================================
--
-- scp_compute_maturity() deduplicates with
--
--   SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id)
--
-- and Postgres treats NULLs as EQUAL in DISTINCT ON. A nullable source_ref
-- therefore meant that every evidence row omitting it, for the same source type
-- and behaviour, silently collapsed to ONE observation — with no error anywhere.
--
-- assessment_response always carries a response id, so today's writer is safe.
-- The reserved sources are the exposed ones: a manager observation or a
-- practical exercise has no natural row to point at, and would have been the
-- first to lose evidence.
--
-- The fix is to require the identity rather than to special-case the dedup. A
-- source with no natural row generates a uuid per observation, which is correct:
-- it IS a distinct observation.
--
-- The ledger is empty, so this is a plain NOT NULL. Append-only guarantees are
-- untouched: source_ref was already in scp_guard_evidence_append_only()'s
-- immutable column list, so it still cannot be changed after the fact.

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
--
-- assessment_assignments carried
--
--   assessment_id         TEXT NOT NULL REFERENCES public.assessments(id)
--   assessment_version_id UUID NOT NULL REFERENCES public.assessment_versions(id)
--
-- pointing at the LEGACY catalogue -- the product retired on 2026-07-28. The
-- Academy's content lives in scp_assessment_definitions / scp_assessment_versions,
-- so a Security Guard assignment could not have been created without first
-- inserting a shim row into the catalogue we retired.
--
-- The existing table is EXTENDED, not replaced. All ten assignment server
-- functions, the token-based recipient flow and every historical row keep
-- working unchanged.

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS scp_assessment_version_id uuid
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT;

-- The legacy columns become nullable so an Academy assignment need not invent
-- values for a catalogue it does not belong to. Existing rows are unaffected:
-- dropping NOT NULL never invalidates data.
ALTER TABLE public.assessment_assignments ALTER COLUMN assessment_id         DROP NOT NULL;
ALTER TABLE public.assessment_assignments ALTER COLUMN assessment_version_id DROP NOT NULL;
-- profile_id is a legacy Career-Guidance concept. Requiring it on an Academy
-- assignment would be exactly the leakage this correction exists to stop.
ALTER TABLE public.assessment_assignments ALTER COLUMN profile_id            DROP NOT NULL;

-- Exactly one lineage, always. This is what keeps a single assignment model from
-- becoming an ambiguous one.
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

-- -------------------------------------------------------------------------
-- The immutability guard, extended
-- -------------------------------------------------------------------------
--
-- Two defects in the existing guard, both surfaced by adding the new lineage:
--
--   * it compares with <>, which is NULL-blind. For an Academy assignment both
--     legacy columns are NULL on either side, so `NEW.x <> OLD.x` evaluates to
--     NULL and the guard never fires.
--   * it does not mention scp_assessment_version_id at all, so the new column
--     would have been freely mutable after creation.
--
-- Rewritten with IS DISTINCT FROM, which is NULL-correct, and covering the new
-- column. The legacy behaviour is otherwise identical.

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

-- -------------------------------------------------------------------------
-- The Academy lineage may only target published content
-- -------------------------------------------------------------------------
--
-- The legacy lineage already refuses retired versions
-- (assessment_assignments_block_retired). The new lineage needs the equivalent,
-- and it is stricter: an Academy version must be PUBLISHED, not merely
-- unretired. Everything is draft today, so this correctly refuses every Academy
-- assignment until content is published through the review workflow.

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
  -- C1: source_ref is required, and append-only is unchanged.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
     AND column_name = 'source_ref' AND is_nullable = 'NO';
  IF _n <> 1 THEN RAISE EXCEPTION 'SCP_P1H_SOURCE_REF_STILL_NULLABLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.scp_competency_evidence'::regclass
                    AND tgname = 'scp_evidence_append_only') THEN
    RAISE EXCEPTION 'SCP_P1H_APPEND_ONLY_LOST';
  END IF;

  -- C2: one model, two lineages, exactly one populated.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.assessment_assignments'::regclass
                    AND conname = 'assessment_assignments_single_lineage') THEN
    RAISE EXCEPTION 'SCP_P1H_LINEAGE_CONSTRAINT_MISSING';
  END IF;

  -- Every historical row is still valid under the widened model.
  SELECT count(*) INTO _n FROM public.assessment_assignments
   WHERE NOT (
     (assessment_id IS NOT NULL AND assessment_version_id IS NOT NULL
        AND profile_id IS NOT NULL AND scp_assessment_version_id IS NULL)
     OR (assessment_id IS NULL AND assessment_version_id IS NULL
        AND scp_assessment_version_id IS NOT NULL));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1H_HISTORICAL_ROWS_INVALID: % rows fail the lineage rule', _n;
  END IF;

  -- Nothing became assignable: no Academy version is published.
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
