#!/usr/bin/env bash
# bench.sh DB RUNS USER_ID [FILTERS] [JOB] [PAGE] -> one line per run: exec_ms
# Each run is its own transaction shaped like a PostgREST request: SET LOCAL
# ROLE authenticated + request.jwt.claims; the app's own arguments.
set -euo pipefail
DB=$1; RUNS=$2; UID_=$3
FILTERS=${4:-'{"stage":"open","owner":null,"q":null,"job":null,"status":null,"requirement":null,"review":null,"analysis":null,"assessment":null,"answers":[]}'}
JOB=${5:-55555555-eeee-4000-8000-000000000005}; PAGE=${6:-1}
EMP=11111111-aaaa-4000-8000-000000000001
{
for i in $(seq 0 "$RUNS"); do
cat <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"$UID_","role":"authenticated","aud":"authenticated"}', true) \gset
EXPLAIN (ANALYZE, FORMAT JSON) SELECT public.rec_ri_candidate_view('$EMP','$JOB','$FILTERS'::jsonb,'requirements',NULL,$PAGE,25,NULL);
COMMIT;
SQL
done
} | psql -X -q -At -h 127.0.0.1 -p 5417 -U postgres -d "$DB" 2>&1 | grep -o '"Execution Time": [0-9.]*' | sed 's/.*: //' | tail -n +2
