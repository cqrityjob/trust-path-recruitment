#!/usr/bin/env bash
# Two actual PostgreSQL sessions. Run only against the disposable db:test database.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in
  127.0.0.1|localhost|::1) ;;
  *) echo "Race test requires a local disposable PostgreSQL database" >&2; exit 2 ;;
esac
source_db="${TEST_DB:-scp_ci_test}"
[[ "$source_db" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
race_db="${source_db}_assignment_race_$$"
race_dir="$(mktemp -d)"
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE IF EXISTS \"$race_db\" WITH (FORCE)" >/dev/null
  rm -rf "$race_dir"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE \"$race_db\" TEMPLATE \"$source_db\"" >/dev/null
psql -X -v ON_ERROR_STOP=1 -q -1 -d "$race_db" -f supabase/tests/recruitment_assignment_fixture.sql >/dev/null

cat > "$race_dir/a.sql" <<'SQL'
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT 'RACE_RESULT=' || assignment_id || ',' || attempt_id
FROM public.scp_assign_from_application(
  'ea000000-1111-0000-0000-000000000001',
  'ea000000-3333-0000-0000-000000000001',
  (SELECT av.id FROM public.scp_assessment_versions av
   JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
   WHERE d.slug='security-officer-recruitment' ORDER BY av.version_number DESC LIMIT 1));
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$race_dir/b.sql" <<'SQL'
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT 'RACE_RESULT=' || assignment_id || ',' || attempt_id
FROM public.scp_employer_assign(
  'ea000000-1111-0000-0000-000000000001',
  (SELECT av.id FROM public.scp_assessment_versions av
   JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
   WHERE d.slug='security-officer-recruitment' ORDER BY av.version_number DESC LIMIT 1),
  'anna@journey.test', NULL, 'sv', 'recruitment', NULL, NULL,
  'ea000000-3333-0000-0000-000000000001', NULL);
COMMIT;
SQL
PGAPPNAME=assignment_race_a psql -X -Atq -v ON_ERROR_STOP=1 -d "$race_db" -f "$race_dir/a.sql" > "$race_dir/a.out" 2>&1 &
pid_a=$!
sleeping=0
for ((i=0; i<40; i++)); do
  sleeping="$(psql -X -Atq -d "$race_db" -c "SELECT count(*) FROM pg_stat_activity WHERE datname='$race_db' AND application_name='assignment_race_a' AND wait_event='PgSleep'")"
  [[ "$sleeping" = 1 ]] && break
  sleep 0.05
done
[[ "$sleeping" = 1 ]] || { cat "$race_dir/a.out"; echo 'Session A did not hold the transaction open'; exit 1; }
PGAPPNAME=assignment_race_b psql -X -Atq -v ON_ERROR_STOP=1 -d "$race_db" -f "$race_dir/b.sql" > "$race_dir/b.out" 2>&1 &
pid_b=$!
blocked=0
for ((i=0; i<30; i++)); do
  blocked="$(psql -X -Atq -d "$race_db" -c "SELECT count(*) FROM pg_stat_activity WHERE datname='$race_db' AND application_name='assignment_race_b' AND wait_event_type='Lock'")"
  [[ "$blocked" = 1 ]] && break
  sleep 0.05
done
wait "$pid_a" || { cat "$race_dir/a.out"; exit 1; }
wait "$pid_b" || { cat "$race_dir/b.out"; exit 1; }
[[ "$blocked" = 1 ]] || { echo 'No overlapping lock wait observed'; exit 1; }
result_a="$(grep '^RACE_RESULT=' "$race_dir/a.out")"
result_b="$(grep '^RACE_RESULT=' "$race_dir/b.out")"
[[ -n "$result_a" && "$result_a" = "$result_b" ]] || { echo 'Concurrent calls did not return the same ids'; exit 1; }
count="$(psql -X -Atq -v ON_ERROR_STOP=1 -d "$race_db" -c "SELECT count(*) FROM public.assessment_assignments aa JOIN public.scp_attempts a ON a.assignment_id=aa.id WHERE aa.application_id='ea000000-3333-0000-0000-000000000001'")"
[[ "$count" = 1 ]] || { echo "Expected one assignment and attempt, got $count"; exit 1; }
echo 'PASS: overlapping wrapper/direct RPC calls return the same single assignment and attempt'
