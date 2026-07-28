-- =============================================================================
-- PR-A / SCP-A4 -- closes review finding LOW-4 (scoring-weight visibility).
--
-- The only remaining finding that needs a schema change. MED-1, MED-2, LOW-1,
-- LOW-2 and LOW-3 are closed by tests and documentation, because the
-- behaviour they concern is already correct -- it was the coverage and the
-- claims that were not.
--
-- ---------------------------------------------------------------------------
-- LOW-4 -- scp_scoring_versions and scp_role_weight_profile_weights carried a
--   `USING (true)` read policy, so any authenticated account -- candidate or
--   employer -- could read the live scoring configuration: component weights,
--   per-competency role weights, and the norm-comparison switch.
--
--   Per-option scoring keys were never exposed (they live in
--   scp_item_options, authoring-only since A1), so this was never an
--   exploitable "answer key" leak. It is still internal scoring configuration
--   reaching accounts that have no need for it, which the owner's stated
--   default forbids: "ordinary authenticated access must not automatically
--   expose internal scoring configuration unless the product explicitly
--   requires it."
--
--   Decision: restrict. Nothing in the candidate or employer product needs a
--   weight. What a report genuinely needs is LINEAGE -- which scoring version
--   produced this result, and what evidence backs it (spec 9.3
--   assessment_lineage + validation_status, acceptance criterion 18).
--
--   That need is met by a minimal read model, scp_scoring_version_lineage,
--   which exposes identity and validation status and deliberately no
--   numbers. A view rather than a broader grant, so the safe columns are
--   enumerated once in the schema instead of trusted to every future SELECT.
--
-- Additive apart from two policy replacements. No data changes.
-- Rollback: docs/assessment/implementation/migration-and-rollback.md.
-- =============================================================================


-- #############################################################################
-- SECTION 1 -- Restrict the scoring model to authoring and admin roles
-- #############################################################################

DROP POLICY IF EXISTS scp_scoring_versions_read ON public.scp_scoring_versions;
DROP POLICY IF EXISTS scp_role_weight_profile_weights_read ON public.scp_role_weight_profile_weights;

-- Both tables keep their existing `_author_write` / `_author_only` policy,
-- which is FOR ALL and therefore also governs SELECT. Dropping the permissive
-- read policy leaves exactly one policy on each table: authoring roles only.
-- Every other authenticated account now matches no policy and sees no rows.

COMMENT ON TABLE public.scp_scoring_versions IS
  'Owner decision A, restricted by review finding LOW-4. Internal scoring '
  'configuration: component weights, the indicative-summary flag and the '
  'norm-comparison switch. Readable ONLY by Security Competency authoring '
  'roles and platform admins. Candidate and employer surfaces read '
  'scp_scoring_version_lineage instead, which carries no numbers.';

COMMENT ON TABLE public.scp_role_weight_profile_weights IS
  'Per-competency role weights -- internal scoring configuration (spec 5.2). '
  'Restricted to authoring roles by review finding LOW-4. The parent '
  'scp_role_weight_profiles row stays readable so a report can name the '
  'profile and its validation status without exposing the weighting itself.';


-- #############################################################################
-- SECTION 2 -- Minimal lineage read model
--
-- A report must be able to state which scoring version produced a result and
-- how much evidence backs it. It must never need a weight to do so.
--
-- This is a plain view, so it runs with the view owner's rights and reads the
-- now-restricted base table on the caller's behalf -- exposing only the
-- columns listed here. Adding a column to the base table does not widen it.
-- #############################################################################

CREATE VIEW public.scp_scoring_version_lineage AS
SELECT
  sv.id,
  sv.slug,
  sv.version_number,
  sv.content_status,
  sv.validation_status,
  sv.published_at,
  sv.retired_at,
  -- Presentation policy, not a weight: whether the report layer is permitted
  -- to show a summary index alone, and whether norm comparison is allowed.
  -- Both are constraints ON the report, so the report must be able to read
  -- them (spec 8.1, 8.3).
  sv.core_summary_is_indicative,
  sv.norm_comparison_permitted
FROM public.scp_scoring_versions sv;

COMMENT ON VIEW public.scp_scoring_version_lineage IS
  'LOW-4 read model. Everything a candidate or employer report needs to state '
  'assessment lineage and validation status (spec 9.3, acceptance criterion '
  '18) and nothing more. Deliberately omits sjt_weight, biq_weight and '
  'content_hash. Safe for any authenticated reader.';

GRANT SELECT ON public.scp_scoring_version_lineage TO authenticated;
GRANT SELECT ON public.scp_scoring_version_lineage TO service_role;


INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version',
  'scp-a4-scoring-visibility',
  'updated',
  'Review finding LOW-4: internal scoring configuration restricted to authoring roles; lineage exposed through a minimal read model.',
  jsonb_build_object(
    'migration', '20260727150000_scp_a4_scoring_visibility',
    'restricted', jsonb_build_array('scp_scoring_versions', 'scp_role_weight_profile_weights'),
    'read_model', 'scp_scoring_version_lineage',
    'per_option_keys', 'were already authoring-only since A1; unchanged'
  )
);
