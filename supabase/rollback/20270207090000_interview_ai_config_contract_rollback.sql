-- Operator-only recovery for an app rollback. Reopens the known full-config
-- read to every signed-in user; requires explicit release review. Prefer fixing
-- the app. The baseline has SELECT only, so no client write grants are restored.
-- No transaction wrapper: used inside regression savepoints.
ALTER POLICY scp_interview_ai_config_read ON public.scp_interview_ai_config
  TO authenticated USING (true);
