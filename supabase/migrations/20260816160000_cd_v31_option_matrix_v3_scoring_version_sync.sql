-- Security Career Discovery v3.1 -- fix: cd_option_loadings re-tagged for
-- scoring_version 'v3.1-draft-3'.
--
-- ── THE PRODUCTION BUG THIS FIXES ────────────────────────────────────────
--
-- 20260816150000_cd_v31_content_v2_compliance_dimension.sql bumped
-- cd_definition_versions.scoring_version from 'v3.1-draft-1' to
-- 'v3.1-draft-3' (CID17 + CQ21/CQ22, see that migration's header). That
-- broke every real save: cd_v31_validate_session_evidence's
-- CD_OPTION_NOT_IN_MATRIX check compares
--
--     cd_option_loadings.scoring_version = cd_definition_versions.scoring_version
--
-- and cd_option_loadings only had rows tagged 'v3.1-draft-1' and
-- 'v3.1-draft-2' -- never 'v3.1-draft-3'. Every session with at least one
-- single_choice answer (8 of the 22 scored items: CQ02/03/06/09/12/15/17/20)
-- failed CD_OPTION_NOT_IN_MATRIX, which cd_v31_complete_session turns into
-- CD_VALIDATION_FAILED, which persistPublicV31Run surfaces as the generic
-- persist_failed("completion") the candidate saw as "Rapporten kunde inte
-- sparas".
--
-- Root cause: cd_definition_versions has NO separate option_matrix_version
-- column (confirmed live: id, assessment_id, assessment_version_id,
-- definition_version, content_version, scoring_version, taxonomy_version,
-- lifecycle_status, available_locales, review_status, created_at,
-- updated_at). The `scoring_version` column has always done double duty as
-- BOTH the dimension-aggregation version AND the option-matrix content-tag
-- validate_session_evidence looks up -- a schema constraint from before
-- OPTION_MATRIX_VERSION was split into its own independent TS constant
-- (Owner Approval Gate item 2). As long as SCORING_VERSION and
-- OPTION_MATRIX_VERSION happened to share a value (or SCORING_VERSION
-- stayed put while only OPTION_MATRIX_VERSION moved), this was invisible.
-- The moment SCORING_VERSION moved to a value with no corresponding
-- cd_option_loadings rows, every option-bearing save broke.
--
-- Reproduced and verified live before and after this fix (forensic
-- verification session, synthetic, no real candidate data, cleaned up
-- after): cd_v31_validate_session_evidence returned CD_OPTION_NOT_IN_MATRIX
-- for all 8 option ids beforehand; empty (valid) after; cd_v31_complete_session
-- then completed successfully and idempotently (a second call against the
-- same session returned the same snapshot, no duplicate row).
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
-- Duplicate the 164 existing 'v3.1-draft-2' option-loading rows under
-- 'v3.1-draft-3' -- the option matrix CONTENT genuinely did not change in
-- this cycle (only two new SCALE items were added, which carry no options
-- at all; see core-items.ts). This is not a new authoring pass, just
-- re-tagging already-approved content so cd_definition_versions.scoring_version
-- and cd_option_loadings.scoring_version stay in lockstep, which
-- cd_v31_validate_session_evidence has always required.
--
-- ── GOING FORWARD ─────────────────────────────────────────────────────────
--
-- Any future bump of SCORING_VERSION (version.ts) MUST be accompanied by a
-- matching cd_option_loadings re-tag (or a genuine new option-matrix
-- authoring pass), even when OPTION_MATRIX_VERSION itself does not change.
-- scripts/career-discovery-v31-check.ts gained a new offline check for
-- exactly this invariant so it fails CI before it ever reaches production
-- again.

INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
SELECT 'v3.1-draft-3', question_id, option_id, dimension_id, role, role_weight, value, rationale
FROM public.cd_option_loadings
WHERE scoring_version = 'v3.1-draft-2'
ON CONFLICT (scoring_version, question_id, option_id, dimension_id) DO NOTHING;

DO $$
DECLARE
  _count int;
BEGIN
  SELECT count(*) INTO _count FROM public.cd_option_loadings WHERE scoring_version = 'v3.1-draft-3';
  IF _count <> 164 THEN
    RAISE EXCEPTION 'expected 164 v3.1-draft-3 option-loading rows, got %', _count;
  END IF;
END $$;
