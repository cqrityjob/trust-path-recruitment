-- Phase G1 concurrency test — session 2 (attempts to demote owner_a2 at
-- essentially the same moment session 1 is demoting owner_a1). Started
-- ~0.5s after session 1 by the orchestrating shell script, while session
-- 1 is still holding its locks (mid pg_sleep) -- this session's own
-- SELECT ... FOR UPDATE inside update_employer_membership must therefore
-- block until session 1 commits, at which point it re-evaluates the
-- final-owner rule against genuinely current (post-session-1) data.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
BEGIN;
SELECT clock_timestamp() AS session2_start;
\echo 'SESSION 2: attempting lock and owner change for owner_a2 (903cad1b-3885-434d-bae6-d962eb98532a)'
SELECT * FROM public.update_employer_membership('903cad1b-3885-434d-bae6-d962eb98532a', 'member', NULL);
SELECT clock_timestamp() AS session2_after_rpc_call_should_not_print_if_blocked_then_raised;
COMMIT;
\echo 'SESSION 2: committed (should not be reached if the final-owner check correctly fires)'
