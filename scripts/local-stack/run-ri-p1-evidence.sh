#!/usr/bin/env bash
# Fresh, isolated P1 DB/API/browser proof. Auth and Storage are substitutes.
# No hosted URLs, SMTP, AI activation, retention jobs or other DB cleanup.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fail() { echo "RI P1 EVIDENCE REFUSED: $1" >&2; exit 2; }
[ "${RI_P1_DISPOSABLE_POSTGRES:-0}" = 1 ] || fail "explicit RI_P1_DISPOSABLE_POSTGRES=1 required"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) fail "Postgres must be loopback";; esac
[[ "$PGPORT" =~ ^[0-9]+$ ]] || fail "invalid PGPORT"
[ "$PGUSER" = postgres ] || fail "disposable bootstrap requires postgres"
[ -n "${PGPASSWORD:-}" ] || fail "synthetic disposable PGPASSWORD required"
for command in psql node bun curl; do command -v "$command" >/dev/null || fail "$command not on PATH"; done
MODE="${1:-fresh}"
[ "$MODE" = fresh ] || [ "$MODE" = --reset ] || fail "use no argument or --reset"
REPORT="${RI_P1_REPORT_DIR:-/tmp/cqrity-ri-p1-evidence-$$}"
[ ! -d "$REPORT" ] || [ -z "$(ls -A "$REPORT")" ] || fail "report directory must be fresh; old images must not be attributed to this run"
mkdir -p "$REPORT/private" "$REPORT/images"
stage() { printf '%s %s\n' "$1" "$2" >> "$REPORT/stages.log"; }
AUTH_PASSWORD="${RI_P1_AUTHENTICATOR_PASSWORD:-localp1authenticator}"
[[ "$AUTH_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]] || fail "synthetic authenticator password contains unsupported characters"
export LOCAL_JWT_SECRET="${RI_P1_LOCAL_JWT_SECRET:-ri-p1-evidence-local-only-0123456789abcdef}"
[ "${#LOCAL_JWT_SECRET}" -ge 32 ] || fail "synthetic JWT secret too short"
API_REST="${RI_P1_API_REST_PORT:-54391}" API_GATEWAY="${RI_P1_API_GATEWAY_PORT:-54392}"
UI_REST="${RI_P1_UI_REST_PORT:-54393}" UI_GATEWAY="${RI_P1_UI_GATEWAY_PORT:-54394}" APP_PORT="${RI_P1_APP_PORT:-3139}"
for port in "$API_REST" "$API_GATEWAY" "$UI_REST" "$UI_GATEWAY" "$APP_PORT"; do
 [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "invalid local port"
done
[ "$(printf '%s\n' "$API_REST" "$API_GATEWAY" "$UI_REST" "$UI_GATEWAY" "$APP_PORT" | sort -u | wc -l | tr -d ' ')" = 5 ] || fail "ports must be distinct"
PIDS=() CONTAINERS=()
cleanup() {
 local result=$?
 trap - EXIT
 for pid in "${PIDS[@]-}"; do [ -z "$pid" ] || kill "$pid" 2>/dev/null || true; done
 for container in "${CONTAINERS[@]-}"; do [ -z "$container" ] || docker stop "$container" >/dev/null 2>&1 || true; done
 RI_P1_RESULT="$result" RI_P1_REPORT_DIR="$REPORT" node scripts/local-stack/ri-p1-evidence-manifest.mjs || true
 exit "$result"
}
trap cleanup EXIT
sql() { psql -v ON_ERROR_STOP=1 -q "$@"; }
marker="ri-p1-evidence-v1"
for db in ri_p1_seed_ci_test ri_p1_browser_ci_test ri_p1_api_ci_test; do
 exists="$(psql -tAq -d postgres -c "SELECT 1 FROM pg_database WHERE datname='$db'")"
 if [ "$exists" = 1 ]; then
  [ "$MODE" = --reset ] || fail "$db exists; --reset is required and retains no old DB contents"
  owned="$(psql -tAq -d "$db" -c "SELECT value FROM public.ri_p1_local_evidence_marker" 2>/dev/null || true)"
  [ "$owned" = "$marker" ] || fail "$db is not an owned P1 evidence database"
  sql -d postgres -c "DROP DATABASE $db;"
 fi
done
sql -d postgres -c "CREATE DATABASE ri_p1_seed_ci_test;"
sql -d ri_p1_seed_ci_test -c "CREATE TABLE public.ri_p1_local_evidence_marker(value text PRIMARY KEY); INSERT INTO public.ri_p1_local_evidence_marker VALUES('$marker'); REVOKE ALL ON public.ri_p1_local_evidence_marker FROM PUBLIC;"
stage begin bootstrap
sql -d ri_p1_seed_ci_test -f supabase/tests/00_bootstrap.sql > "$REPORT/bootstrap.log" 2>&1
stage pass bootstrap
sql -d ri_p1_seed_ci_test -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated,service_role;"
echo "strict full-history replay" > "$REPORT/replay.log"
stage begin replay
for migration in supabase/migrations/*.sql; do
 echo "$migration" >> "$REPORT/replay.log"
 sql -d ri_p1_seed_ci_test -f "$migration" >> "$REPORT/replay.log" 2>&1
done
stage pass replay
stage begin oracle
sql -d ri_p1_seed_ci_test -f scripts/fixtures/recruiter-intelligence-p1-browser-fixture.sql > "$REPORT/sql-oracle.log" 2>&1
stage pass oracle
for db in ri_p1_browser_ci_test ri_p1_api_ci_test; do
 sql -d postgres -c "CREATE DATABASE $db TEMPLATE ri_p1_seed_ci_test;"
 sql -d "$db" -c "ALTER DATABASE $db SET bcp.authenticator_password='$AUTH_PASSWORD';"
 node scripts/local-stack/ri-p1-harness.mjs "$db" > "$REPORT/private/$db-harness.sql"
 sql -d "$db" -f "$REPORT/private/$db-harness.sql" > "$REPORT/private/$db-harness.log" 2>&1
done
start_rest() {
 local db="$1" port="$2" label="$3"
 if [ -n "${POSTGREST_BIN:-}" ]; then
  [ -x "$POSTGREST_BIN" ] || fail "POSTGREST_BIN is not executable"
  cat > "$REPORT/private/$label.conf" <<CONF
db-uri = "postgresql://authenticator:${AUTH_PASSWORD}@127.0.0.1:${PGPORT}/${db}"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "${LOCAL_JWT_SECRET}"
server-host = "127.0.0.1"
server-port = ${port}
CONF
  "$POSTGREST_BIN" "$REPORT/private/$label.conf" > "$REPORT/private/$label.log" 2>&1 &
  PIDS+=("$!")
 else
  command -v docker >/dev/null || fail "POSTGREST_BIN or Docker required"
  local name="ri-p1-evidence-$label-$$"
  local -a extra=(--init)
  [ "$(uname)" != Linux ] || extra=(--add-host host.docker.internal:host-gateway)
  docker run -d --name "$name" "${extra[@]}" -p "127.0.0.1:$port:3000" \
   -e "PGRST_DB_URI=postgresql://authenticator:${AUTH_PASSWORD}@host.docker.internal:${PGPORT}/${db}" \
   -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e 'PGRST_DB_EXTRA_SEARCH_PATH=public, extensions' \
   -e "PGRST_JWT_SECRET=$LOCAL_JWT_SECRET" -e PGRST_SERVER_HOST='*' -e PGRST_SERVER_PORT=3000 \
   "${RI_P1_POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v16.2}" > "$REPORT/private/$label-container.log"
  CONTAINERS+=("$name")
 fi
}
start_gateway() {
 local db="$1" rest="$2" gateway="$3" label="$4"
 LOCAL_DB_URL="postgresql://postgres:${PGPASSWORD}@127.0.0.1:${PGPORT}/${db}" \
 POSTGREST_URL="http://127.0.0.1:$rest" GATEWAY_PORT="$gateway" \
 node scripts/local-stack/auth-gateway.mjs > "$REPORT/private/$label-gateway.log" 2>&1 &
 PIDS+=("$!")
}
stage begin gateway
start_rest ri_p1_api_ci_test "$API_REST" api
start_rest ri_p1_browser_ci_test "$UI_REST" ui
start_gateway ri_p1_api_ci_test "$API_REST" "$API_GATEWAY" api
start_gateway ri_p1_browser_ci_test "$UI_REST" "$UI_GATEWAY" ui
wait_url() {
 local url="$1"
 for attempt in $(seq 1 60); do
  if curl --silent --fail "$url" >/dev/null; then return; fi
  sleep 1
 done
 fail "local service not ready: $url (see private logs)"
}
wait_url "http://127.0.0.1:$API_GATEWAY/rest/v1/"
wait_url "http://127.0.0.1:$UI_GATEWAY/rest/v1/"
stage pass gateway
stage begin api
RI_P1_API_URL="http://127.0.0.1:$API_GATEWAY/rest/v1" RI_P1_LOCAL_JWT_SECRET="$LOCAL_JWT_SECRET" \
 node scripts/recruiter-intelligence-p1-api-check.mjs > "$REPORT/http-api.log" 2>&1
stage pass api
ANON="$(LOCAL_DB_URL="postgresql://postgres:${PGPASSWORD}@127.0.0.1:${PGPORT}/ri_p1_browser_ci_test" POSTGREST_URL="http://127.0.0.1:$UI_REST" node scripts/local-stack/auth-gateway.mjs --print-anon-key)"
SERVICE="$(LOCAL_DB_URL="postgresql://postgres:${PGPASSWORD}@127.0.0.1:${PGPORT}/ri_p1_browser_ci_test" POSTGREST_URL="http://127.0.0.1:$UI_REST" node scripts/local-stack/auth-gateway.mjs --print-service-key)"
export SUPABASE_URL="http://127.0.0.1:$UI_GATEWAY" VITE_SUPABASE_URL="http://127.0.0.1:$UI_GATEWAY"
export SUPABASE_PUBLISHABLE_KEY="$ANON" VITE_SUPABASE_PUBLISHABLE_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SERVICE"
export SUPABASE_PROJECT_ID=local-ri-p1-evidence VITE_SUPABASE_PROJECT_ID=local-ri-p1-evidence
export VITE_EMPLOYER_PORTAL_ENABLED=true VITE_JOBS_ENABLED=true
stage begin runtime
node node_modules/vite/bin/vite.js dev --port "$APP_PORT" --strictPort --host 127.0.0.1 > "$REPORT/private/app.log" 2>&1 &
PIDS+=("$!")
wait_url "http://127.0.0.1:$APP_PORT/login"
stage pass runtime
stage begin browser
E2E_LOCAL_STACK=1 E2E_BASE_URL="http://127.0.0.1:$APP_PORT" E2E_SUPABASE_URL="http://127.0.0.1:$UI_GATEWAY" \
 E2E_RI_EVIDENCE_DIR="$REPORT/images" bunx playwright test e2e/recruiter-intelligence-p1.spec.ts \
 --project=chromium --workers=1 --reporter=line > "$REPORT/browser.log" 2>&1
stage pass browser
echo "P1 local DB/API/browser evidence passed; Auth/Storage are substitutes. Databases and report retained."
