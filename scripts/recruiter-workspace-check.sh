#!/usr/bin/env bash
# Isolated SQL bootstrap/role proof only, never hosted Auth/REST or Storage bytes.
set -euo pipefail
: "${TEST_DB:?an isolated ci_test database is required}"
case "$TEST_DB" in *ci_test*) ;; *) echo 'FAIL: ci_test database required' >&2; exit 1;; esac
case "$TEST_DB" in *[!a-zA-Z0-9_]*) echo 'FAIL: invalid database identifier' >&2; exit 1;; esac
case "${PGHOST:-}" in 127.0.0.1|localhost|/*) ;; *) echo 'FAIL: explicit local PGHOST required' >&2; exit 1;; esac
WORKSPACE_PSQL="${PSQL:-psql}"
WORKSPACE_PYTHON="${WORKSPACE_PYTHON:-python3}"
sql() { "$WORKSPACE_PSQL" -X -v ON_ERROR_STOP=1 -q -d "$TEST_DB" "$@"; }
assertions() {
  local result count
  result="$(sql -f supabase/tests/recruiter_workspace_test.sql 2>&1)" || { echo "$result" >&2; exit 1; }
  count="$(echo "$result" | command grep -c 'NOTICE:  ok WORKSPACE' || true)"
  [ "$count" -ge 36 ] || { echo "$result" >&2; echo 'FAIL:36 workspace assertions required' >&2; exit 1; }
  echo "    ok  ${count} workspace SQL assertions"
}
assertions
# Each race clones the empty current schema; fixture data never enters TEST_DB.
for scenario in cas down; do
  WORKSPACE_RACE_DB="${TEST_DB:0:42}_ws_${scenario}_ci_test"
  export WORKSPACE_RACE_DB WORKSPACE_PSQL
  "$WORKSPACE_PSQL" -X -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE \"$WORKSPACE_RACE_DB\" TEMPLATE \"$TEST_DB\""
  cleanup_race() { "$WORKSPACE_PSQL" -X -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE \"$WORKSPACE_RACE_DB\""; }
  trap cleanup_race EXIT
  "$WORKSPACE_PYTHON" scripts/recruiter-workspace-race.py "$scenario"
  cleanup_race
  trap - EXIT
done
# DOWN must refuse real audit data before changing any function or table. This
# transaction also rolls back the synthetic100 fixture when the refusal fires.
set +e
WORKSPACE_NONEMPTY="$(sql <<'SQL' 2>&1
BEGIN;
CREATE FUNCTION pg_temp.ok(cond boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'fixture assertion: %',label; END IF; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text) TO PUBLIC;
\i supabase/tests/fixtures/recruiter_workspace_100.sql
SELECT public.rec_ri_confirm_reviewed_profile((SELECT job FROM fixture),1,'ee100000-7777-4000-8000-000000000002','2026-12-01',(SELECT body FROM rules),'Synthetic rollback witness');
RESET ROLE;
\i supabase/rollback/20270310100000_recruiter_profile_change_review_rollback.sql
SQL
)"
WORKSPACE_NONEMPTY_RC=$?
set -e
if [ "$WORKSPACE_NONEMPTY_RC" -eq 0 ] || ! echo "$WORKSPACE_NONEMPTY" | command grep -q 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA'; then
  echo "$WORKSPACE_NONEMPTY" >&2; echo 'FAIL: nonempty audit DOWN must refuse' >&2; exit 1
fi
[ "$(sql -Atc "SELECT NOT EXISTS(SELECT 1 FROM recruiter_intelligence.profile_change_reviews) AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id='ee100000-0000-4000-8000-000000000001')")" = "t" ] || exit 1
echo '    ok  nonempty DOWN refused; fixture and audit transaction rolled back'
# All pre-existing P1 bodies/ACLs/configs survive an EMPTY DOWN exactly.
WORKSPACE_BASE_SELECT="SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,''),E'\\n' ORDER BY n.nspname,p.proname,p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='recruiter_intelligence' AND p.proname<>'protect_profile_change_review') OR (n.nspname='public' AND p.proname LIKE 'rec_ri_%' AND p.proname NOT IN('rec_ri_profile_change_impact','rec_ri_confirm_reviewed_profile','rec_ri_profile_change_history','rec_ri_compare_applications','rec_ri_next_unreviewed','rec_ri_page_evidence'))"
WORKSPACE_BASE_BEFORE="$(sql -Atc "$WORKSPACE_BASE_SELECT")"
sql -f supabase/rollback/20270310100000_recruiter_profile_change_review_rollback.sql >/dev/null
[ "$(sql -Atc "$WORKSPACE_BASE_SELECT")" = "$WORKSPACE_BASE_BEFORE" ] || { echo 'FAIL: workspace DOWN changed old P1' >&2; exit 1; }
[ "$(sql -Atc "SELECT to_regclass('recruiter_intelligence.profile_change_reviews') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN('rec_ri_profile_change_impact','rec_ri_confirm_reviewed_profile','rec_ri_profile_change_history','rec_ri_compare_applications','rec_ri_next_unreviewed','rec_ri_page_evidence')) OR (n.nspname='recruiter_intelligence' AND p.proname='protect_profile_change_review'))")" = "t" ] || exit 1
echo '    ok  empty DOWN removes only new objects; old P1 bodies/ACL/config unchanged'
sql -f supabase/migrations/20270310100000_recruiter_profile_change_review.sql >/dev/null
assertions
echo '    ok  exact forward migration reapplies; schema retained until historical standdown'
