-- Interview configuration contract. CLI-created 20261003201052, filename
-- moved to reserved canonical slot 20270207090000; PR #404 coordination.
-- RELEASE GATE: 20270206 applied and verified; app PR #405 PUBLISHED and
-- its scoped read verified. Merging an app PR alone is not publication.
-- This closes the legacy read; an old non-admin app loses its flag read.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.scp_iv_case_capabilities(uuid)') IS NULL
     OR to_regprocedure('scp_private.case_capabilities(uuid)') IS NULL THEN
    RAISE EXCEPTION 'INTERVIEW_CONFIG_PRECONDITION: expand must be applied first';
  END IF;
END $$;
ALTER POLICY scp_interview_ai_config_read ON public.scp_interview_ai_config
  TO authenticated USING (public.is_platform_admin(auth.uid()));

-- The live baseline has client SELECT only. Keep the existing trusted
-- owner/service write path and do not activate the dormant admin UPDATE policy.
-- Revoke column grants too, so future/default privilege residue cannot provide
-- an alternative client write path. No service_role grant is changed.
REVOKE ALL ON public.scp_interview_ai_config FROM PUBLIC, anon, authenticated;
DO $$ DECLARE c name; BEGIN
  FOR c IN SELECT attname FROM pg_attribute
    WHERE attrelid='public.scp_interview_ai_config'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.scp_interview_ai_config FROM PUBLIC, anon, authenticated',c);
  END LOOP;
END $$;
GRANT SELECT ON public.scp_interview_ai_config TO authenticated;

DO $$ BEGIN
  IF (SELECT qual FROM pg_policies WHERE schemaname='public'
    AND tablename='scp_interview_ai_config' AND policyname='scp_interview_ai_config_read')
      IS DISTINCT FROM 'is_platform_admin(auth.uid())'
    OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='scp_interview_ai_config' AND cmd IN ('SELECT','ALL')
      AND policyname <> 'scp_interview_ai_config_read'
      AND roles && ARRAY['public','anon','authenticated']::name[]) THEN
    RAISE EXCEPTION 'INTERVIEW_CONFIG_PROOF: unexpected client read policy';
  END IF;
  IF has_any_column_privilege('anon','public.scp_interview_ai_config','SELECT')
    OR has_any_column_privilege('authenticated','public.scp_interview_ai_config','UPDATE')
    OR has_any_column_privilege('authenticated','public.scp_interview_ai_config','INSERT')
    OR has_table_privilege('authenticated','public.scp_interview_ai_config','DELETE') THEN
    RAISE EXCEPTION 'INTERVIEW_CONFIG_PROOF: unwanted client privilege remains';
  END IF;
END $$;
COMMIT;
