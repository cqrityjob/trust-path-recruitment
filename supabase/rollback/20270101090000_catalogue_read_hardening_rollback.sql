-- Roll back 20270101090000_catalogue_read_hardening.
--
-- Restores the four read policies to USING (true) for authenticated and the
-- INSERT/UPDATE/DELETE grants `authenticated` held on the three catalogues,
-- exactly as production stood on 2026-10-01. This RE-OPENS what the migration
-- closed: every signed-in account can again read draft behaviour and role
-- versions, professions not approved for ranking, and the interviewer guide
-- including listen_for. It says so because that is what a rollback is. RLS
-- still refuses the restored writes for anyone who is not a content author,
-- as it did before.
ALTER POLICY scp_behaviour_versions_read ON public.scp_behaviour_versions
  TO authenticated USING (true);
ALTER POLICY scp_role_versions_read ON public.scp_role_versions
  TO authenticated USING (true);
ALTER POLICY cd_professions_read ON public.cd_professions
  TO authenticated USING (true);
ALTER POLICY scp_interview_guide_prompts_read ON public.scp_interview_guide_prompts
  TO authenticated USING (true);

COMMENT ON TABLE public.scp_interview_guide_prompts IS NULL;

GRANT INSERT, UPDATE, DELETE ON public.scp_followup_prompts        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scp_form_blocks             TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scp_interview_guide_prompts TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd = 'SELECT'
        AND btrim(qual) = 'true'
        AND policyname IN ('scp_behaviour_versions_read', 'scp_role_versions_read',
                           'cd_professions_read', 'scp_interview_guide_prompts_read')) <> 4 THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_ROLLBACK failed: the four read policies are not USING (true) again';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.scp_form_blocks', 'UPDATE') THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_ROLLBACK failed: write grants not restored';
  END IF;
  RAISE NOTICE 'CATALOGUE_HARDENING_ROLLBACK ok: USING (true) and client write grants restored (drafts, unapproved professions and the interviewer guide are readable by every signed-in account again)';
END $$;
