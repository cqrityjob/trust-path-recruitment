#!/usr/bin/env bash
# profile.sh DB USER_ID -> EXPLAIN (ANALYZE, BUFFERS) of the app's call plus the
# per-function calls/time of exactly that transaction (pg_stat_xact_user_functions),
# and the plan of the base CTE via auto_explain-like nested statement logging.
DB=$1; UID_=$2; JOB=${3:-55555555-eeee-4000-8000-000000000005}
F='{"stage":"open","owner":null,"q":null,"job":null,"status":null,"requirement":null,"review":null,"analysis":null,"assessment":null,"answers":[]}'
psql -X -q -h 127.0.0.1 -p 5417 -U postgres -d "$DB" <<SQL
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 50; SET auto_explain.log_analyze = on; SET auto_explain.log_buffers = on;
SET auto_explain.log_nested_statements = on; SET auto_explain.log_timing = on;
SET client_min_messages = log; SET auto_explain.log_level = notice;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"$UID_","role":"authenticated","aud":"authenticated"}', true) \gset

EXPLAIN (ANALYZE, BUFFERS) SELECT public.rec_ri_candidate_view('11111111-aaaa-4000-8000-000000000001','$JOB','$F'::jsonb,'requirements',NULL,1,25,NULL);
SELECT schemaname||'.'||funcname AS function, calls, round(total_time::numeric,1) total_ms, round(self_time::numeric,1) self_ms
  FROM pg_stat_xact_user_functions ORDER BY total_time DESC;
COMMIT;
SQL
