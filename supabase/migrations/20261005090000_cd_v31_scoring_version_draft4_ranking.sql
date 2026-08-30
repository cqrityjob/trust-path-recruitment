-- Security Career Discovery v3.1 -- SCORING_VERSION 'v3.1-draft-3' ->
-- 'v3.1-draft-4' (Profession Recommendation Validation mandate).
--
-- ── WHAT MOVED IN THE ENGINE ──────────────────────────────────────────────
--
-- The answer -> dimension arithmetic is BYTE-IDENTICAL. No item, option,
-- loading, role weight, aggregation rule or confidence threshold changed,
-- and scripts/career-discovery-v31-check.ts proves it: with every code
-- change in place and SCORING_VERSION temporarily held at 'v3.1-draft-3',
-- all 601 checks passed on the PREVIOUS frozen persona hashes.
--
-- What moved is how scored dimensions become a RANKED recommendation --
-- scoring behaviour a stored report must stay reproducible against, hence
-- the version bump (see src/lib/career-discovery/v31/version.ts):
--
--   * Recommendation Priority orders on `centralExpressionZ` instead of the
--     floor-only `fitScore`, which saturates near 100 once neutral-baseline-z
--     gating is in force and was deciding rankings on 0.2-point differences.
--   * `fitTier` moves onto the same statistic. On the clipped `centralZ` it
--     was applied to before, Security Coordinator (SP006, one central band)
--     had a maximum attainable z of 0.84 against a 1.0 threshold -- it could
--     never be a "strong" match for anyone, and the tier-first comparator
--     therefore suppressed it permanently.
--   * The context/CIG priority bonuses move onto that z scale (0.1 SD each,
--     was +6 on the 0-100 fitScore scale where the entire strong-tier spread
--     is 0.7-3.9 points).
--   * The always-present top-3 ranking now runs through the same career-pivot
--     stage classification the tier buckets use, so the two candidate-facing
--     surfaces of one result can no longer disagree.
--
-- Historical cd_report_snapshots rows keep their OWN frozen scoring_version
-- and are never re-scored. Nothing here rewrites a stored report.
--
-- ── WHY THIS MIGRATION IS NOT OPTIONAL ────────────────────────────────────
--
-- cd_v31_validate_session_evidence's CD_OPTION_NOT_IN_MATRIX check compares
--
--     cd_option_loadings.scoring_version = cd_definition_versions.scoring_version
--
-- so bumping SCORING_VERSION in TypeScript alone breaks EVERY save carrying
-- a single_choice answer (8 of the 22 scored items) with the generic
-- "Rapporten kunde inte sparas". That is not hypothetical: it is exactly the
-- production incident 20260816160000_cd_v31_option_matrix_v3_scoring_version_sync.sql
-- was written to fix, and the offline invariant that migration added to
-- scripts/career-discovery-v31-check.ts is what caught this bump in CI.
--
-- The option matrix CONTENT is unchanged this cycle -- no option text, span,
-- value or role moved (OPTION_MATRIX_VERSION stays 'v3.1-draft-2'). So this
-- re-tags already-approved rows rather than authoring new ones.
--
-- Additive and reversible: two statements, no column, constraint, policy or
-- grant touched, prior versions' rows left in place as the audit trail.
-- Rollback: supabase/rollback/20261005090000_cd_v31_scoring_version_draft4_ranking_rollback.sql

INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
SELECT 'v3.1-draft-4', question_id, option_id, dimension_id, role, role_weight, value, rationale
FROM public.cd_option_loadings
WHERE scoring_version = 'v3.1-draft-3'
ON CONFLICT (scoring_version, question_id, option_id, dimension_id) DO NOTHING;

UPDATE public.cd_definition_versions
SET scoring_version = 'v3.1-draft-4',
    updated_at = now()
WHERE definition_version = '2026-scd-v3.1.0'
  AND scoring_version = 'v3.1-draft-3';

-- =========================================================================
-- Self-verification -- the two values validate_session_evidence compares
-- must be in lockstep before this migration is allowed to succeed.
-- =========================================================================

DO $$
DECLARE
  _loadings int;
  _scoring  text;
BEGIN
  SELECT count(*) INTO _loadings
  FROM public.cd_option_loadings
  WHERE scoring_version = 'v3.1-draft-4';

  IF _loadings <> 164 THEN
    RAISE EXCEPTION
      'CD_SCORING_V4_LOADINGS: expected 164 v3.1-draft-4 option-loading rows, got %', _loadings;
  END IF;

  SELECT scoring_version INTO _scoring
  FROM public.cd_definition_versions
  WHERE definition_version = '2026-scd-v3.1.0';

  IF _scoring IS DISTINCT FROM 'v3.1-draft-4' THEN
    RAISE EXCEPTION
      'CD_SCORING_V4_NOT_APPLIED: cd_definition_versions.scoring_version is %, expected v3.1-draft-4',
      _scoring;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cd_option_loadings
    WHERE scoring_version = (
      SELECT scoring_version FROM public.cd_definition_versions
      WHERE definition_version = '2026-scd-v3.1.0'
    )
  ) THEN
    RAISE EXCEPTION
      'CD_SCORING_V4_LOCKSTEP: no cd_option_loadings rows for the active scoring_version -- every option-bearing save would fail CD_OPTION_NOT_IN_MATRIX';
  END IF;
END $$;
