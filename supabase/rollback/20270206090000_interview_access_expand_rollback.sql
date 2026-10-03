-- Operator-only recovery. Remove application use first; roll back 20270207
-- before this. Restores the former scenario exposure; requires release review.
-- No transaction wrapper: can be exercised inside a test savepoint.
ALTER POLICY scp_scenario_versions_read ON public.scp_scenario_versions
  TO authenticated USING (true);
DROP FUNCTION public.scp_iv_case_capabilities(uuid);
DROP FUNCTION scp_private.case_capabilities(uuid);
-- Leave the empty private namespace; never drop unrelated future objects.
