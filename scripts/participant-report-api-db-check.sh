#!/usr/bin/env bash
# Final-state gate on an existing disposable local database; no provisioning.
# Uses the same libpq environment and fixture as scripts/db-test.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TEST_DB:?Set the disposable local test database}"
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) echo 'Loopback only' >&2; exit 2;; esac
MIG=supabase/migrations/20270216090000_participant_report_api_boundary.sql
RB=supabase/rollback/20270216090000_participant_report_api_boundary_rollback.sql
SUITE=supabase/tests/participant_report_api_boundary_test.sql
psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$SUITE"
psql -X -v ON_ERROR_STOP=1 -v participant_launch_gate=true -d "$TEST_DB" -f supabase/tests/employer_report_access_matrix_test.sql
# Each old function/policy/privilege must independently make the final-state
# suite fail on the named behavioural assertion. All mutations roll back when
# the connection exits on that assertion. No committed security downgrade.
for control in report progress recommendations rls funnel; do
  case "$control" in
    report) name=scp_participant_report; assertion=PB1 ;;
    progress) name=scp_subject_progress; assertion=PB2 ;;
    recommendations) name=scp_development_recommendations; assertion=PB3 ;;
    rls) name=; assertion=PB9 ;;
    funnel) name=; assertion=PB17 ;;
  esac
  if [ -n "$name" ]; then
    mutation="$(awk -v name="$name" 'index($0, "CREATE OR REPLACE FUNCTION public." name "(") == 1 {copy=1} copy {print; if ($0 ~ /[$]([a-zA-Z_]+)?[$];/) exit}' "$RB")"
    # The rollback contains both $$ and $function$ delimiters.
    [ -n "$mutation" ] || { echo 'Missing mutation anchor' >&2; exit 1; }
  elif [ "$control" = rls ]; then
    mutation="$(sed -n '/^ALTER POLICY scp_report_snapshots_own/,/issuer_organization_id));/p' "$RB")"
  else
    mutation='GRANT EXECUTE ON FUNCTION public.cd_record_funnel_event(text,jsonb,uuid) TO anon, authenticated;'
  fi
  set +e
  out="$(printf 'BEGIN;\n%s\n\\i %s\n' "$mutation" "$SUITE" | psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! printf '%s\n' "$out" | grep "ASSERTION FAILED: $assertion " >/dev/null; then
    printf '%s\n' "$out" >&2
    echo "Negative control did not fail on $assertion" >&2; exit 1
  fi
  echo "ok negative control $control caught on $assertion"
done
# A real rollback/reapply cycle preserves stored history and feedback. The
# compact fingerprint includes all rows, not only counts, without printing data.
fingerprint() {
  psql -X -At -v ON_ERROR_STOP=1 -d "$TEST_DB" -c "SELECT md5(coalesce(string_agg(row_data, '' ORDER BY row_data), '')) FROM (
    SELECT row_to_json(t)::text row_data FROM public.scp_report_snapshots t UNION ALL
    SELECT row_to_json(t)::text FROM public.scp_competency_evidence t UNION ALL
    SELECT row_to_json(t)::text FROM public.cd_v31_funnel_events t UNION ALL
    SELECT row_to_json(t)::text FROM public.cd_test_feedback t) rows;"
}
before="$(fingerprint)"
psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$RB"
set +e
out="$(psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$SUITE" 2>&1)"; rc=$?
set -e
[ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep 'ASSERTION FAILED: PB1 ' >/dev/null
[ "$before" = "$(fingerprint)" ] || { echo 'Rollback changed stored rows' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$MIG"
[ "$before" = "$(fingerprint)" ] || { echo 'Migration changed stored rows' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$SUITE"
echo 'ok rollback reopens old access, reapply closes it, stored rows unchanged'
