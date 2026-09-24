#!/usr/bin/env bash
# Logs, raw reports and authenticated traces stay in the private temporary tree.
# Only validated screenshots and a minimal evidence manifest can be published.
set -Eeuo pipefail
SW_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SW_STATE="${SW_BROWSER_STATE_DIR:?Set the directory created by security-work-browser-stack.sh}"
test -f "$SW_STATE/owned-stack" && test -f "$SW_STATE/run.env"
. "$SW_STATE/run.env"
case "$E2E_BASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 2 ;; esac
case "$SW_API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 2 ;; esac
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY
export SW_BROWSER_RUN_ID="$(date +%s)-$$"
export SW_BROWSER_EVIDENCE_DIR="$SW_STATE/evidence-$SW_BROWSER_RUN_ID"
export SW_BROWSER_REPORT="$SW_STATE/report-$SW_BROWSER_RUN_ID.json"
mkdir -p "$SW_BROWSER_EVIDENCE_DIR"
# New users make a rerun independent without deleting any append-only records.
psql "$SW_DATABASE_URL" -v ON_ERROR_STOP=1 -v "sw_fixture_suffix=-$SW_BROWSER_RUN_ID" -q \
  -f "$SW_REPO/scripts/fixtures/security-work-browser-fixture.sql" > "$SW_STATE/fixture-$SW_BROWSER_RUN_ID.log" 2>&1
cd "$SW_REPO"
SW_APP_PORT="${E2E_BASE_URL##*:}"
bun run dev -- --host 127.0.0.1 --port "$SW_APP_PORT" --strictPort > "$SW_STATE/app-$SW_BROWSER_RUN_ID.log" 2>&1 &
SW_APP_PID=$!
trap 'kill "$SW_APP_PID" 2>/dev/null || true; wait "$SW_APP_PID" 2>/dev/null || true' EXIT
for attempt in $(seq 1 90); do
  kill -0 "$SW_APP_PID" 2>/dev/null || { tail -30 "$SW_STATE/app-$SW_BROWSER_RUN_ID.log"; exit 1; }
  if curl --fail --silent --max-time 5 "$E2E_BASE_URL/login" >/dev/null; then break; fi
  [ "$attempt" = 90 ] && { echo 'Local app did not become ready'; exit 1; }
  sleep 1
done
set +e
PLAYWRIGHT_JSON_OUTPUT_NAME="$SW_BROWSER_REPORT" bunx playwright test e2e/security-work-manual.spec.ts \
  --workers=1 --reporter=list,json --output="$SW_STATE/raw-results-$SW_BROWSER_RUN_ID" "$@"
SW_TEST_STATUS=$?
set -e
# Validation must succeed before this path is eligible for artifact upload.
bun run scripts/security-work-browser-evidence.ts
printf '%s\n' "$SW_BROWSER_EVIDENCE_DIR" > "$SW_STATE/publish-path"
if [ -n "${GITHUB_OUTPUT:-}" ]; then printf 'evidence_dir=%s\n' "$SW_BROWSER_EVIDENCE_DIR" >> "$GITHUB_OUTPUT"; fi
exit "$SW_TEST_STATUS"
