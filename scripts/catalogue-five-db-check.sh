#!/usr/bin/env bash
# Scoped gate on a disposable, fully replayed LOCAL database. Never production.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in
  127.0.0.1|localhost|/private/tmp|/tmp) ;;
  *) echo 'REFUSING: catalogue gate requires a local disposable database' >&2; exit 2 ;;
esac
TEST_DB="${TEST_DB:-scp_ci_test}"
MIG=supabase/migrations/20270218090000_catalogue_internal_metadata_boundary.sql
RB=supabase/rollback/20270218090000_catalogue_internal_metadata_boundary_rollback.sql
SUITE=supabase/tests/catalogue_internal_metadata_boundary_test.sql
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/tests/catalogue_internal_metadata_preservation_test.sql
out="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$SUITE" 2>&1)" || { echo "$out"; exit 1; }
count="$(printf '%s\n' "$out" | command grep -c 'NOTICE:  ok  C5')"
[ "$count" -ge 139 ] || { echo "FAIL: catalogue assertion shortfall ($count)"; exit 1; }
echo "ok catalogue-five: $count access assertions"
# Reuse authoring fixtures under the final policy, including the limited library exception.
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/assessment_draft_authoring_test.sql


nc() {
  local label="$1" expected="$2" mutation="$3" output rc
  set +e
  output="$(printf '%s\n' "$mutation" "\\i $SUITE" | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" = 0 ] || ! printf '%s\n' "$output" | command grep -F "ASSERTION FAILED: $expected" >/dev/null; then
    echo "FAIL: negative control $label did not fail on $expected"; echo "$output"; exit 1
  fi
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$RB" -f "$MIG" >/dev/null
  echo "ok catalogue-five negative control: $label"
}
for table in graph_versions scp_bundle_versions scp_role_weight_profiles scp_forms scp_form_blocks; do
  policy="${table}_read"
  [ "$table" != graph_versions ] || policy='graph_versions read all'
  nc "$table allow-all" "C5 base $table candidate A" "ALTER POLICY \"$policy\" ON public.$table USING (true);"
done
for view in graph_versions_published scp_bundle_versions_published scp_role_weight_profiles_published; do
  base="${view%_published}"
  nc "$view no publication filter" "C5 published $base candidate A" "DO \$\$ DECLARE d text; BEGIN SELECT pg_get_viewdef('public.$view'::regclass,true) INTO d; EXECUTE 'CREATE OR REPLACE VIEW public.$view WITH (security_barrier=true,security_invoker=false) AS ' || regexp_replace(d,' WHERE.*;', ';', 's'); END \$\$;"
  case "$base" in
    graph_versions) extra=notes ;;
    scp_bundle_versions) extra=approved_by ;;
    scp_role_weight_profiles) extra=notes ;;
  esac
  nc "$view internal column" 'C5 internal columns excluded' "DO \$\$ DECLARE d text; BEGIN SELECT pg_get_viewdef('public.$view'::regclass,true) INTO d; EXECUTE 'CREATE OR REPLACE VIEW public.$view WITH (security_barrier=true,security_invoker=false) AS ' || regexp_replace(d,' FROM', ', $base.$extra FROM'); END \$\$;"
done
# A real rollback must make the same access suite fail, not just execute.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$RB" >/dev/null
set +e
out="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$SUITE" 2>&1)"; rc=$?
set -e
[ "$rc" != 0 ] && printf '%s\n' "$out" | command grep -F 'ASSERTION FAILED: C5 base graph_versions candidate A' >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$MIG" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$SUITE" >/dev/null
echo 'ok catalogue-five: 11 negative controls, rollback exposes old access, reapply passes'
