#!/usr/bin/env bash
# A dedicated local GoTrue + PostgREST + PostgreSQL stack. No repository env
# file or existing project is changed; the state directory belongs to this run.
set -Eeuo pipefail
SW_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SW_STATE="${SW_BROWSER_STATE_DIR:?Set SW_BROWSER_STATE_DIR to a new disposable directory}"
SW_CLI="${SW_SUPABASE_CLI:-supabase}"
case "$SW_STATE" in /tmp/*|/private/tmp/*|"${RUNNER_TEMP:-/nonexistent}"/*) ;; *) echo 'Refused: stack state must be a disposable temporary directory' >&2; exit 2 ;; esac
case "${1:-}" in
  down)
    test -f "$SW_STATE/owned-stack" || { echo 'Refused: no owned-stack marker'; exit 2; }
    SW_OWNED="$(cat "$SW_STATE/owned-stack")"
    [[ "$SW_OWNED" =~ ^sw-browser-[0-9]+-[0-9]+$ ]] || { echo 'Refused: unknown stack owner'; exit 2; }
    grep -Fqx "project_id = \"$SW_OWNED\"" "$SW_STATE/supabase/config.toml" || { echo 'Refused: stack config does not match ownership marker'; exit 2; }
    "$SW_CLI" --workdir "$SW_STATE" stop --no-backup
    exit 0 ;;
  up) ;;
  *) echo 'Usage: security-work-browser-stack.sh up|down' >&2; exit 2 ;;
esac
test ! -e "$SW_STATE/owned-stack" || { echo 'Refused: this stack directory already exists'; exit 2; }
mkdir -p "$SW_STATE"
chmod 700 "$SW_STATE"
SW_PROJECT="sw-browser-$(date +%s)-$$"
SW_API_PORT="${SW_BROWSER_API_PORT:-57321}"
SW_DB_PORT="${SW_BROWSER_DB_PORT:-57322}"
SW_APP_PORT="${SW_BROWSER_APP_PORT:-3127}"
for port in "$SW_API_PORT" "$SW_DB_PORT" "$SW_APP_PORT"; do
  [[ "$port" =~ ^[0-9]+$ ]] || { echo 'Refused: nonnumeric local port'; exit 2; }
done
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY; do
  [ -z "${!name:-}" ] || { echo "Refused: $name must not be inherited by this isolated test"; exit 2; }
done
"$SW_CLI" --workdir "$SW_STATE" init > "$SW_STATE/init.log" 2>&1
mkdir -p "$SW_STATE/supabase/migrations"
cat > "$SW_STATE/supabase/config.toml" <<EOF
project_id = "$SW_PROJECT"
[api]
enabled = true
port = $SW_API_PORT
schemas = ["public"]
extra_search_path = ["public", "extensions"]
[db]
port = $SW_DB_PORT
shadow_port = $((SW_DB_PORT + 8))
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = true
[auth]
enabled = true
site_url = "http://127.0.0.1:$SW_APP_PORT"
additional_redirect_urls = ["http://127.0.0.1:$SW_APP_PORT"]
enable_signup = true
[auth.email]
enable_signup = true
enable_confirmations = false
[realtime]
enabled = false
[edge_runtime]
enabled = false
[analytics]
enabled = false
EOF
printf '%s\n' "$SW_PROJECT" > "$SW_STATE/owned-stack"
SW_STARTED=0
for attempt in 1 2 3; do
  case "$attempt" in 1|3) registry=public.ecr.aws ;; *) registry=ghcr.io ;; esac
  if SUPABASE_INTERNAL_IMAGE_REGISTRY="$registry" "$SW_CLI" --workdir "$SW_STATE" start \
    --exclude realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
    >> "$SW_STATE/start.log" 2>&1; then SW_STARTED=1; break; fi
  [ "$attempt" = 3 ] || sleep $((attempt * 20))
done
[ "$SW_STARTED" = 1 ] || { tail -50 "$SW_STATE/start.log"; exit 1; }
"$SW_CLI" --workdir "$SW_STATE" status -o env > "$SW_STATE/status.env" 2> "$SW_STATE/status.log"
chmod 600 "$SW_STATE/status.env"
# These values came from this run's local CLI, never from the repository env.
set -a
. "$SW_STATE/status.env"
set +a
case "$API_URL" in "http://127.0.0.1:$SW_API_PORT"|"http://localhost:$SW_API_PORT") ;; *) echo 'Refused: API is not the owned loopback listener'; exit 2 ;; esac
case "$DB_URL" in "postgresql://"*@"127.0.0.1:$SW_DB_PORT/"*|"postgresql://"*@"localhost:$SW_DB_PORT/"*) ;; *) echo 'Refused: database is not the owned loopback listener'; exit 2 ;; esac
# Match the hosted owner project's privilege baseline BEFORE strict replay.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated, service_role;'
SW_REPLAYED=0
for migration in "$SW_REPO"/supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$migration" >> "$SW_STATE/replay.log" 2>&1 || { tail -50 "$SW_STATE/replay.log"; exit 1; }
  SW_REPLAYED=$((SW_REPLAYED + 1))
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$SW_REPO/scripts/fixtures/security-work-browser-fixture.sql" > "$SW_STATE/fixture.log" 2>&1
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "NOTIFY pgrst, 'reload schema';"
# A NOTIFY acknowledgement is not proof that PostgREST has reloaded its cache.
# The known RPC must resolve and deny anon before real user tests may begin.
SW_READY=0
for attempt in $(seq 1 40); do
  if curl --silent --show-error --max-time 5 "$API_URL/rest/v1/rpc/sw_create_personal_workspace" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' \
    --data '{"_name":"readiness"}' > "$SW_STATE/readiness.json" \
    && [ "$(jq -r '.code // ""' "$SW_STATE/readiness.json")" = 42501 ]; then SW_READY=1; break; fi
  sleep 1
done
[ "$SW_READY" = 1 ] || { echo 'PostgREST did not expose the protected Security Work RPC after schema reload'; exit 1; }
{
  printf 'export E2E_LOCAL_STACK=1\n'
  printf 'export E2E_BASE_URL=%q\n' "http://127.0.0.1:$SW_APP_PORT"
  printf 'export SW_DATABASE_URL=%q\n' "$DB_URL"
  printf 'export SW_API_URL=%q\n' "$API_URL"
  printf 'export SW_ANON_KEY=%q\n' "$ANON_KEY"
  printf 'export SW_PSQL_BIN=%q\n' "${SW_PSQL_BIN:-psql}"
  printf 'export SUPABASE_URL=%q\n' "$API_URL"
  printf 'export VITE_SUPABASE_URL=%q\n' "$API_URL"
  printf 'export SUPABASE_PUBLISHABLE_KEY=%q\n' "$ANON_KEY"
  printf 'export VITE_SUPABASE_PUBLISHABLE_KEY=%q\n' "$ANON_KEY"
  printf 'export SUPABASE_PROJECT_ID=%q\n' "$SW_PROJECT"
  printf 'export VITE_SUPABASE_PROJECT_ID=%q\n' "$SW_PROJECT"
} > "$SW_STATE/run.env"
chmod 600 "$SW_STATE/run.env"
echo "Security Work local stack ready: API $SW_API_PORT, PostgreSQL $SW_DB_PORT, app $SW_APP_PORT; $SW_REPLAYED migrations replayed."
echo "Environment file: $SW_STATE/run.env (local credentials; never publish)"
