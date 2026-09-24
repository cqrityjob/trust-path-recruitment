#!/usr/bin/env bash
# Real local Supabase + first-party parser. No remote account or live AI key.
set -Eeuo pipefail
SW_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SW_STATE="${SW_BROWSER_STATE_DIR:?Owned local stack directory required}"
test -f "$SW_STATE/owned-stack" && test -f "$SW_STATE/run.env"
. "$SW_STATE/run.env"
case "$E2E_BASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 2 ;; esac
case "$SW_DATABASE_URL" in postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;; *) exit 2 ;; esac
export SW_BROWSER_RUN_ID="analysis-$(date +%s)-$$"
SW_PROCESSOR_PID=
SW_APP_PID=
cleanup() {
  for child in "$SW_APP_PID" "$SW_PROCESSOR_PID"; do
    if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
  done
}
trap cleanup EXIT
if [ -z "${SW_PROCESSOR_URL:-}" ]; then
  SW_PROCESSOR_DIR="$SW_STATE/processor-$SW_BROWSER_RUN_ID"
  bun run "$SW_REPO/scripts/security-work-processor-local.ts" "$SW_PROCESSOR_DIR" > "$SW_STATE/processor-$SW_BROWSER_RUN_ID.log" 2>&1 &
  SW_PROCESSOR_PID=$!
  for attempt in $(seq 1 120); do
    kill -0 "$SW_PROCESSOR_PID" 2>/dev/null || { echo 'Local processor failed; inspect private processor log'; exit 1; }
    if [ -f "$SW_PROCESSOR_DIR/ready.json" ]; then break; fi
    [ "$attempt" = 120 ] && { echo 'Local processor did not become ready'; exit 1; }
    sleep 1
  done
  . "$SW_PROCESSOR_DIR/app.env"
fi
case "${SW_PROCESSOR_URL:-}" in https://127.0.0.1:*/v1/extract|https://localhost:*/v1/extract) ;; *) echo 'Local TLS processor required'; exit 2 ;; esac
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY SW_ANTHROPIC_API_KEY
export SW_AI_ENABLED=false
export SW_WORKER_KEY_ID=local-browser-key
export SW_WORKER_SECRET=synthetic-local-browser-signing-0000000000000000
psql "$SW_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('local-browser-key','synthetic-local-browser-signing-0000000000000000') ON CONFLICT(key_id) DO UPDATE SET secret=excluded.secret,active=true;" > "$SW_STATE/analysis-key-fixture.log" 2>&1
export SW_ANALYSIS_EVIDENCE_DIR="$SW_STATE/evidence-$SW_BROWSER_RUN_ID"
export SW_BROWSER_EVIDENCE_DIR="$SW_ANALYSIS_EVIDENCE_DIR"
export SW_BROWSER_REPORT="$SW_STATE/analysis-report-$SW_BROWSER_RUN_ID.json"
export SW_BROWSER_JOURNEY=analysis
mkdir -p "$SW_ANALYSIS_EVIDENCE_DIR"
psql "$SW_DATABASE_URL" -v ON_ERROR_STOP=1 -v "sw_fixture_suffix=-$SW_BROWSER_RUN_ID" -q -f "$SW_REPO/scripts/fixtures/security-work-browser-fixture.sql" > "$SW_STATE/fixture-$SW_BROWSER_RUN_ID.log" 2>&1
cd "$SW_REPO"
bun run dev -- --host 127.0.0.1 --port "${E2E_BASE_URL##*:}" --strictPort > "$SW_STATE/app-$SW_BROWSER_RUN_ID.log" 2>&1 &
SW_APP_PID=$!
for attempt in $(seq 1 90); do
  kill -0 "$SW_APP_PID" 2>/dev/null || { tail -30 "$SW_STATE/app-$SW_BROWSER_RUN_ID.log"; exit 1; }
  if curl --fail --silent --max-time 5 "$E2E_BASE_URL/login" >/dev/null; then break; fi
  [ "$attempt" = 90 ] && { echo 'Local app not ready'; exit 1; }
  sleep 1
done
PLAYWRIGHT_JSON_OUTPUT_NAME="$SW_BROWSER_REPORT" bunx playwright test e2e/security-work-analysis.spec.ts --workers=1 --reporter=list,json --output="$SW_STATE/raw-$SW_BROWSER_RUN_ID" "$@"
bun run scripts/security-work-browser-evidence.ts
export SW_AI_EVIDENCE_DIR="$SW_STATE/ai-evidence-$SW_BROWSER_RUN_ID"
export SW_BROWSER_EVIDENCE_DIR="$SW_AI_EVIDENCE_DIR"
export SW_BROWSER_REPORT="$SW_STATE/ai-report-$SW_BROWSER_RUN_ID.json"
export SW_BROWSER_JOURNEY=ai
mkdir -p "$SW_AI_EVIDENCE_DIR"
PLAYWRIGHT_JSON_OUTPUT_NAME="$SW_BROWSER_REPORT" bunx playwright test e2e/security-work-ai-review.spec.ts --workers=1 --reporter=list,json --output="$SW_STATE/ai-raw-$SW_BROWSER_RUN_ID" "$@"
bun run scripts/security-work-browser-evidence.ts
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'evidence_dir=%s\n' "$SW_ANALYSIS_EVIDENCE_DIR" >> "$GITHUB_OUTPUT"
  printf 'ai_evidence_dir=%s\n' "$SW_AI_EVIDENCE_DIR" >> "$GITHUB_OUTPUT"
fi
echo "Browser screenshots: $SW_ANALYSIS_EVIDENCE_DIR (synthetic only, inspect before publication)"
