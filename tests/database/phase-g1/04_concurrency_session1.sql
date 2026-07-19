-- Phase G1 concurrency test — session 1 (demotes owner_a1).
-- Opens an explicit transaction, calls update_employer_membership, then
-- holds the transaction open (sleeping) before committing -- this keeps
-- the row lock held long enough for session 2 to genuinely block on it,
-- rather than hoping for a lucky race window.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
BEGIN;
SELECT clock_timestamp() AS session1_start;
\echo 'SESSION 1: acquiring lock and evaluating owner change for owner_a1 (39c993b6-15b8-4d8a-ac0e-2f561661e790)'
SELECT * FROM public.update_employer_membership('39c993b6-15b8-4d8a-ac0e-2f561661e790', 'member', NULL);
SELECT clock_timestamp() AS session1_after_rpc_call;
\echo 'SESSION 1: holding transaction open for 3s before commit (keeps locks held so session 2 must wait)'
SELECT pg_sleep(3);
COMMIT;
SELECT clock_timestamp() AS session1_after_commit;
\echo 'SESSION 1: committed'
