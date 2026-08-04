#!/usr/bin/env bash
#
# Proves Lovable can RESUME its migration run rather than restart it.
#
# Lovable's Cloud run stopped after 20260804100000_scp_phase1f_sjt_content.sql.
# This replays history in two halves against one database:
#
#   1. everything up to and including that file  -- simulating Cloud today
#   2. everything after it                       -- what Lovable must still run
#
# If step 2 succeeds without touching step 1's files, the resume point is safe.
# If any remaining migration silently depends on being run from empty, it fails
# here rather than half-way through a production run.
#
# LOCAL ONLY.

set -Eeuo pipefail
RESUME_AFTER="${RESUME_AFTER:-20260804100000}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:5441/partial_upgrade_test}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "REFUSING: not local" >&2; exit 1;; esac

ADMIN="${DB_URL%/*}/postgres"
psql "$ADMIN" -q -c "DROP DATABASE IF EXISTS partial_upgrade_test;" -c "CREATE DATABASE partial_upgrade_test;"
psql "$DB_URL" -q -f supabase/tests/00_bootstrap.sql >/dev/null 2>&1

KNOWN=()
while IFS= read -r line; do KNOWN+=("$line"); done < <(
  sed -n '/^KNOWN_FAILURES=(/,/^)/p' scripts/db-test.sh | grep '|||' \
    | sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//; s/\\"/"/g')

expected_for() {
  for e in "${KNOWN[@]}"; do [ "${e%%|||*}" = "$1" ] && { echo "${e##*|||}"; return 0; }; done
  return 1
}

apply_phase() {   # $1 = label, $2 = "before"|"after"
  local applied=0 skipped=0 failed=0
  for path in $(ls supabase/migrations/*.sql | sort); do
    f="$(basename "$path")"; v="${f%%_*}"
    if [ "$2" = "before" ]; then [ "$v" \> "$RESUME_AFTER" ] && continue
    else [ "$v" \> "$RESUME_AFTER" ] || continue; fi
    if out=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$path" 2>&1); then
      applied=$((applied+1))
    elif needle=$(expected_for "$f") && grep -qF "$needle" <<<"$out"; then
      skipped=$((skipped+1))
    else
      failed=$((failed+1)); printf '    XX %s\n%s\n' "$f" "$out" >&2
    fi
  done
  echo "  $1: applied=$applied known-failures=$skipped unexpected=$failed"
  [ "$failed" -eq 0 ]
}

echo "==> PHASE 1 — what Lovable has already applied (through $RESUME_AFTER)"
apply_phase "phase 1" before || exit 1

echo "==> Snapshot of Cloud's current state"
psql "$DB_URL" -tAc "SELECT '  scp_ tables now: '||count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'scp\_%';"
psql "$DB_URL" -tAc "SELECT '  scp_employer_library exists: '||EXISTS(SELECT 1 FROM pg_proc WHERE proname='scp_employer_library');"

echo "==> PHASE 2 — what Lovable must still run (after $RESUME_AFTER)"
apply_phase "phase 2" after || exit 1

echo "==> Verifying the resumed database"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "
  SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname='scp_employer_library')
         THEN '  ok  scp_employer_library present' ELSE '  FAIL missing' END;
  SELECT CASE WHEN (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                    JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D')=0
         THEN '  ok  no disabled triggers' ELSE '  FAIL disabled trigger' END;
  SELECT CASE WHEN (SELECT count(*) FROM scp_assessment_versions av
                    JOIN scp_assessment_definitions d ON d.id=av.definition_id
                   WHERE av.content_status='published' AND NOT d.is_test_fixture)=0
         THEN '  ok  no real content published' ELSE '  FAIL real content published' END;
  SELECT '  ok  enabled providers: '||string_agg(code,',') FROM scp_ai_providers WHERE is_enabled;"

psql "$ADMIN" -q -c "DROP DATABASE partial_upgrade_test;"
echo "==> PARTIAL UPGRADE OK — Lovable can resume without reapplying"
