-- Restore the LOW-4 scoring-lineage read model.
-- Source file: supabase/migrations/20260801100000_scp_restore_scoring_lineage_readability.sql

ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = false);
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

GRANT SELECT ON public.scp_scoring_version_lineage TO authenticated;
GRANT SELECT ON public.scp_scoring_version_lineage TO service_role;

REVOKE ALL ON public.scp_scoring_version_lineage FROM anon;
REVOKE ALL ON public.scp_scoring_version_lineage FROM PUBLIC;
REVOKE ALL ON public.scp_scoring_versions FROM anon;
REVOKE ALL ON public.scp_role_weight_profile_weights FROM anon;
REVOKE ALL ON public.scp_item_options FROM anon;

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