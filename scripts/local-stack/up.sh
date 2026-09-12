#!/usr/bin/env bash
#
# Bring up the LOCAL routed-evidence stack and leave it running.
#
#   PostgreSQL 16  -- the full migration history, replayed as `postgres`
#   PostgREST      -- the real thing, enforcing the real RLS as `authenticator`
#   the gateway    -- GoTrue's four endpoints, plus /rest/v1 -> PostgREST
#   the app        -- `vite dev`, built from this checkout, pointed at the above
#
# Everything binds to loopback and the script refuses to continue if anything
# it is about to use is not local. It creates and DROPS a database, so it must
# only ever meet a disposable instance.
#
# Usage:
#   scripts/local-stack/up.sh                 replay the history, seed, snapshot, start
#   scripts/local-stack/up.sh --reseed        restore the snapshot (seconds), start
#   scripts/local-stack/up.sh --skip-replay   start against the database as it stands
#
# --reseed exists because the walk is NOT idempotent, and deliberately so: the
# ledger it writes is append-only against every caller, the owner included, so
# a second run cannot tidy up after the first. The honest way to repeat it is
# to start from the seeded state again, which the snapshot makes cheap.
#
# See README.md for what is real and what is substituted, and why.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DB_NAME="${LOCAL_DB_NAME:-beskt_e2e}"
DB_OWNER_PASSWORD="${LOCAL_DB_PASSWORD:-localbeskt}"
AUTHENTICATOR_PASSWORD="${LOCAL_AUTHENTICATOR_PASSWORD:-localauthenticator}"
# A local-only signing secret for a database that exists for one run. It is
# not a credential to anything that outlives this script.
JWT_SECRET="${LOCAL_JWT_SECRET:-beskt-local-evidence-secret-0123456789abcdef}"
PGREST_BIN="${POSTGREST_BIN:-/tmp/postgrest}"
APP_PORT="${APP_PORT:-3119}"
GATEWAY_PORT="${GATEWAY_PORT:-54321}"
PGREST_PORT="${PGREST_PORT:-3000}"
DB_URL="postgresql://postgres:${DB_OWNER_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
LOG_DIR="${LOCAL_STACK_LOG_DIR:-/tmp/beskt-local-stack}"

fail() { echo "LOCAL STACK REFUSED: $1" >&2; exit 1; }

# --- isolation, before anything is created ---------------------------------
case "${PGHOST:-127.0.0.1}" in
  127.0.0.1|localhost|"") : ;;
  *) fail "PGHOST '${PGHOST}' is not loopback; this script creates and drops databases" ;;
esac
[ "${#JWT_SECRET}" -ge 32 ] || fail "the JWT secret must be at least 32 characters"
command -v psql > /dev/null || fail "psql is not on PATH"
[ -x "$PGREST_BIN" ] || fail "no PostgREST binary at ${PGREST_BIN} (set POSTGREST_BIN)"

mkdir -p "$LOG_DIR"
export PGPASSWORD="$DB_OWNER_PASSWORD"

MODE="${1:-full}"
SEED_DB="${DB_NAME}_seed"

if [ "$MODE" = "--reseed" ]; then
  psql -tAq -h 127.0.0.1 -U postgres -d postgres \
    -c "SELECT 1 FROM pg_database WHERE datname = '${SEED_DB}'" | grep -q 1 \
    || fail "there is no ${SEED_DB} snapshot to restore; run without --reseed first"
  echo "==> Restoring ${DB_NAME} from the ${SEED_DB} snapshot"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "CREATE DATABASE ${DB_NAME} TEMPLATE ${SEED_DB};"
fi

if [ "$MODE" = "full" ]; then
  echo "==> Recreating ${DB_NAME}"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "CREATE DATABASE ${DB_NAME};"

  echo "==> Applying the test-harness bootstrap"
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" -f supabase/tests/00_bootstrap.sql > /dev/null

  # The hosted privilege baseline, for the reason .github/workflows/e4-evidence.yml
  # records at length: a stock local cluster grants EXECUTE on new functions to
  # authenticated and service_role, the owner project does not, and a migration
  # that proves its own grants refuses itself under the difference.
  echo "==> Matching the hosted privilege baseline"
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" -c \
    "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
       REVOKE EXECUTE ON FUNCTIONS FROM authenticated, service_role;"
  acl="$(psql -tAq -d "$DB_URL" -c "SELECT coalesce(array_to_string(d.defaclacl,' | '),'(none)') FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname='public' AND d.defaclobjtype='f' AND pg_get_userbyid(d.defaclrole)='postgres'")"
  case "$acl" in
    *authenticated*|*service_role*) fail "an implicit function grant survived: ${acl}" ;;
  esac

  echo "==> Replaying the migration history"
  n=0
  for f in supabase/migrations/*.sql; do
    psql -v ON_ERROR_STOP=1 -q -d "$DB_URL" -f "$f" > /dev/null || fail "migration failed: $f"
    n=$((n + 1))
  done
  echo "    replayed ${n} migration(s)"

  echo "==> Applying the local-stack harness"
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" \
    -c "ALTER DATABASE ${DB_NAME} SET bcp.authenticator_password = '${AUTHENTICATOR_PASSWORD}';" > /dev/null
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" -f scripts/local-stack/harness.sql > /dev/null

  echo "==> Seeding the synthetic fixture"
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" \
    -f scripts/fixtures/beskt-candidate-preparation-fixture.sql > /dev/null

  echo "==> Snapshotting the seeded state as ${SEED_DB}"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS ${SEED_DB} WITH (FORCE);"
  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
    -c "CREATE DATABASE ${SEED_DB} TEMPLATE ${DB_NAME};"
fi

# --- PostgREST --------------------------------------------------------------
cat > "$LOG_DIR/postgrest.conf" <<CONF
db-uri = "postgresql://authenticator:${AUTHENTICATOR_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "${JWT_SECRET}"
server-host = "127.0.0.1"
server-port = ${PGREST_PORT}
CONF

echo "==> Starting PostgREST on 127.0.0.1:${PGREST_PORT}"
"$PGREST_BIN" "$LOG_DIR/postgrest.conf" > "$LOG_DIR/postgrest.log" 2>&1 &
echo $! > "$LOG_DIR/postgrest.pid"

# --- the gateway ------------------------------------------------------------
echo "==> Starting the local gateway on 127.0.0.1:${GATEWAY_PORT}"
LOCAL_JWT_SECRET="$JWT_SECRET" LOCAL_DB_URL="$DB_URL" \
  POSTGREST_URL="http://127.0.0.1:${PGREST_PORT}" GATEWAY_PORT="$GATEWAY_PORT" \
  node scripts/local-stack/auth-gateway.mjs > "$LOG_DIR/gateway.log" 2>&1 &
echo $! > "$LOG_DIR/gateway.pid"

ANON_KEY="$(LOCAL_JWT_SECRET="$JWT_SECRET" LOCAL_DB_URL="$DB_URL" \
  POSTGREST_URL="http://127.0.0.1:${PGREST_PORT}" \
  node scripts/local-stack/auth-gateway.mjs --print-anon-key)"

# --- the application's environment -----------------------------------------
cat > .env.local <<ENV
SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}
VITE_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}
SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
SUPABASE_PROJECT_ID=local-beskt-evidence
VITE_SUPABASE_PROJECT_ID=local-beskt-evidence
VITE_EMPLOYER_PORTAL_ENABLED=true
VITE_JOBS_ENABLED=true
VITE_CIG_LIFECYCLE_ENFORCED=true
ENV

grep -q 'wrygicdfxwjnrugduxnt' .env.local && fail "the owner project ref reached .env.local"

echo "==> Waiting for the stack"
for i in $(seq 1 60); do
  if curl -sfo /dev/null "http://127.0.0.1:${GATEWAY_PORT}/auth/v1/health"; then break; fi
  [ "$i" = 60 ] && fail "the gateway did not come up (see ${LOG_DIR}/gateway.log)"
  sleep 1
done
for i in $(seq 1 60); do
  if curl -sfo /dev/null -H "Authorization: Bearer ${ANON_KEY}" \
       "http://127.0.0.1:${GATEWAY_PORT}/rest/v1/"; then break; fi
  [ "$i" = 60 ] && fail "PostgREST did not come up (see ${LOG_DIR}/postgrest.log)"
  sleep 1
done

echo "==> Starting the application on 127.0.0.1:${APP_PORT}"
nohup npm run dev -- --port "$APP_PORT" --strictPort --host 127.0.0.1 \
  > "$LOG_DIR/app.log" 2>&1 &
echo $! > "$LOG_DIR/app.pid"
for i in $(seq 1 120); do
  if curl -sfo /dev/null "http://127.0.0.1:${APP_PORT}/"; then
    echo "    up after ${i}s"
    break
  fi
  [ "$i" = 120 ] && { tail -40 "$LOG_DIR/app.log"; fail "the application did not come up"; }
  sleep 1
done

echo
echo "local stack ready:"
echo "  app       http://127.0.0.1:${APP_PORT}"
echo "  supabase  http://127.0.0.1:${GATEWAY_PORT}"
echo "  database  ${DB_NAME} on 127.0.0.1:5432"
echo "  logs      ${LOG_DIR}"
echo
echo "stop it with: scripts/local-stack/down.sh"
