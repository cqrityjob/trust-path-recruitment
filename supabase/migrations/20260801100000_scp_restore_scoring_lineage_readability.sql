-- Restore the LOW-4 scoring-lineage read model.
--
-- ADDITIVE ONLY. Changes one view option, re-asserts existing grants, and adds
-- two standing guards. No table, policy, function or row is modified. No
-- previously applied migration is edited.
--
-- ── ROOT CAUSE ─────────────────────────────────────────────────────────
--
-- 20260731053218_ebac47bc-fefb-457c-add0-71b0d6e6d768.sql line 2:
--
--     ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = true);
--
-- That migration is a Supabase security-linter remediation batch. Two of its
-- three sections are correct hardening and are LEFT ALONE here: pinning
-- search_path on trigger functions, and revoking anon EXECUTE on SECURITY
-- DEFINER functions. Only the view flip is reverted.
--
-- The linter flags "security definer view" generically. In this one case
-- definer semantics are not an oversight — they are the entire mechanism
-- LOW-4 was built on, stated in 20260727150000_scp_a4_scoring_visibility.sql:
--
--   "This is a plain view, so it runs with the view owner's rights and reads
--    the now-restricted base table on the caller's behalf -- exposing only the
--    columns listed here. Adding a column to the base table does not widen it."
--
-- LOW-4 deliberately removed the permissive read policy from
-- scp_scoring_versions so no candidate or employer can read weights. With
-- security_invoker = true the view executes as the CALLER, so the caller hits
-- that same restriction and reads zero rows. The result is not a leak — it is
-- the opposite: assessment lineage and validation status became unreadable for
-- exactly the two audiences the read model exists to serve, and every report
-- lost its ability to state which scoring version produced it (spec 9.3,
-- acceptance criterion 18).
--
-- Caught by scp_a1_domain_model_test.sql:1709
-- "LOW-4: a CANDIDATE CAN read scoring lineage (no numbers)".
--
-- ── WHY THIS IS SAFE, AND WHY THE LINTER WARNING DOES NOT APPLY ────────
--
-- A definer view is dangerous when it forwards the owner's rights to rows or
-- columns the caller should not see. Here the exposure surface is not the base
-- table — it is the nine columns enumerated in the view body, none of which is
-- a weight, a key or a hash. The base table stays restricted to authoring
-- roles; the view is the ONLY authorised path, and it is narrower than any
-- column grant could be because a future column added to
-- scp_scoring_versions does not appear in it.
--
-- The alternative the linter implies — leave the view as invoker and add a
-- read policy on scp_scoring_versions — is strictly worse: RLS is row-level,
-- so such a policy would expose sjt_weight, biq_weight and content_hash on
-- every readable row. That is precisely what LOW-4 closed.
--
-- Section 3 below makes this durable: the forbidden columns are now asserted
-- by the schema itself, so a future sweep cannot quietly widen the view.

-- =========================================================================
-- 1. Restore definer semantics
-- =========================================================================

ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = false);

-- A definer view over a restricted table should also be a barrier: it stops a
-- caller-supplied function in a WHERE clause from being evaluated against rows
-- before the view's own quals. This view has no quals today, so it changes
-- nothing observable now — it closes the side channel in advance of any future
-- filtered variant.
ALTER VIEW public.scp_scoring_version_lineage SET (security_barrier = true);

COMMENT ON VIEW public.scp_scoring_version_lineage IS
  'LOW-4 read model. Everything a candidate or employer report needs to state '
  'assessment lineage and validation status (spec 9.3, acceptance criterion '
  '18) and nothing more. Deliberately omits sjt_weight, biq_weight and '
  'content_hash. Safe for any authenticated reader. '
  'DELIBERATELY security_invoker = false: the base table scp_scoring_versions '
  'is restricted to authoring roles by LOW-4, and definer semantics are what '
  'let this narrow projection serve candidates and employers without granting '
  'them the weights. Do NOT flip this to security_invoker in response to a '
  'generic "security definer view" linter warning -- doing so silently makes '
  'lineage unreadable for both audiences. See migration 20260801100000.';

-- =========================================================================
-- 2. Re-assert the access model explicitly
-- =========================================================================
--
-- These grants already exist. Restating them means this migration alone
-- documents the complete intended access model, and any drift is corrected
-- rather than assumed.

GRANT SELECT ON public.scp_scoring_version_lineage TO authenticated;
GRANT SELECT ON public.scp_scoring_version_lineage TO service_role;

-- anon must hold nothing, on the view or its base table. Revoked rather than
-- merely never granted, so an inherited PUBLIC default cannot supply access.
REVOKE ALL ON public.scp_scoring_version_lineage FROM anon;
REVOKE ALL ON public.scp_scoring_version_lineage FROM PUBLIC;
REVOKE ALL ON public.scp_scoring_versions FROM anon;
REVOKE ALL ON public.scp_role_weight_profile_weights FROM anon;
REVOKE ALL ON public.scp_item_options FROM anon;

-- =========================================================================
-- 3. Standing guards
-- =========================================================================
--
-- The two properties that must hold together. Either one alone is not the
-- security model: a readable view that leaked weights would be a breach, and a
-- safe view nobody can read is the outage this migration fixes.

-- 3a. The view must never expose scoring internals.
DO $$
DECLARE _leaked text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO _leaked
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'scp_scoring_version_lineage'
    AND column_name IN ('sjt_weight', 'biq_weight', 'content_hash');

  IF _leaked IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_LINEAGE_LEAKS_SCORING_INTERNALS: the lineage read model exposes %; '
      'it must carry identity and validation status only', _leaked;
  END IF;
END $$;

-- 3b. The base tables must stay restricted. If a permissive read policy came
--     back, definer semantics on the view would no longer be the only path to
--     the weights, and LOW-4 would be reopened from the other side.
DO $$
DECLARE _permissive text;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ') INTO _permissive
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('scp_scoring_versions', 'scp_role_weight_profile_weights')
    AND cmd IN ('SELECT', 'ALL')
    AND coalesce(qual, '') IN ('true', '(true)');

  IF _permissive IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_SCORING_TABLES_UNRESTRICTED: % grants unconditional read on internal '
      'scoring configuration; LOW-4 requires authoring roles only', _permissive;
  END IF;
END $$;

-- 3c. The fix actually took effect. Reverting is the whole point of this
--     migration, so it fails rather than applying silently as a no-op.
DO $$
DECLARE _invoker text;
BEGIN
  SELECT coalesce(
           (SELECT option FROM unnest(c.reloptions) AS option
             WHERE option LIKE 'security_invoker=%' LIMIT 1),
           'security_invoker=false')
    INTO _invoker
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'scp_scoring_version_lineage';

  IF _invoker <> 'security_invoker=false' THEN
    RAISE EXCEPTION
      'SCP_LINEAGE_STILL_INVOKER: expected security_invoker=false, found %',
      _invoker;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version',
  'scp-a4-scoring-visibility',
  'updated',
  'Restored LOW-4 lineage readability: 20260731053218 flipped the read model to security_invoker, which made assessment lineage unreadable for candidates and employers. Base-table restrictions unchanged.',
  jsonb_build_object(
    'migration', '20260801100000_scp_restore_scoring_lineage_readability',
    'reverts', '20260731053218_ebac47bc-fefb-457c-add0-71b0d6e6d768 section 1 only',
    'unchanged', jsonb_build_array(
      'scp_scoring_versions RLS', 'scp_role_weight_profile_weights RLS',
      'scp_item_options RLS', 'search_path pinning', 'anon EXECUTE revokes'),
    'read_model', 'scp_scoring_version_lineage'
  )
);
