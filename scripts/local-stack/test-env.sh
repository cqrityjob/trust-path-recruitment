#!/usr/bin/env bash
# The BESKT test environment — SYNTHETIC data, loopback only, never production.
#
#   scripts/local-stack/test-env.sh           build from scratch (replay + seed)
#   scripts/local-stack/test-env.sh --reseed  back to the seeded start state
#   scripts/local-stack/test-env.sh --with-beskt-v01
#                                             build, then import BESKT v0.1 (the
#                                             2026-09-10 specification) as the
#                                             synthetic editor, release it through
#                                             five SYNTHETIC test reviews, admit
#                                             BESKT Journey AB, and make that the
#                                             seeded start state
#   scripts/local-stack/down.sh               stop it
#
# Starts PostgreSQL 16 in Docker on 127.0.0.1:5432 and PostgREST from a local
# image, then runs up.sh unchanged. The gateway listens on 54331 by default,
# because 54321 is the Supabase CLI's port and is often taken.
#
# SECURITY_REF (optional): a git ref whose not-yet-merged security migrations
# are laid over the replay, e.g. origin/claude/beskt-report-independence-boundary.
# Once those migrations are on main this is unnecessary: the replay has them.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
command -v docker > /dev/null || { echo "docker is required" >&2; exit 1; }

NETWORK="${LOCAL_DOCKER_NETWORK:-beskt-e2e-net}"
DB_CONTAINER="${LOCAL_DB_CONTAINER:-beskt-e2e-pg}"
export PGPASSWORD="${LOCAL_DB_PASSWORD:-localbeskt}"
export POSTGREST_BIN="$ROOT/scripts/local-stack/postgrest-docker.sh"
export GATEWAY_PORT="${GATEWAY_PORT:-54331}"
export LOCAL_STACK_LOG_DIR="${LOCAL_STACK_LOG_DIR:-/tmp/beskt-local-stack}"

docker network inspect "$NETWORK" > /dev/null 2>&1 || docker network create "$NETWORK" > /dev/null
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  docker rm -f "$DB_CONTAINER" > /dev/null 2>&1 || true
  docker run -d --name "$DB_CONTAINER" --network "$NETWORK" -p 127.0.0.1:5432:5432 \
    -e POSTGRES_PASSWORD="$PGPASSWORD" postgres:16 > /dev/null
  for _ in $(seq 1 60); do
    psql -h 127.0.0.1 -U postgres -d postgres -Atc 'select 1' > /dev/null 2>&1 && break
    sleep 1
  done
fi

scripts/local-stack/down.sh > /dev/null 2>&1 || true
if [ "${1:-}" = "--reseed" ]; then
  scripts/local-stack/up.sh --reseed
  exit 0
fi
scripts/local-stack/up.sh

if [ -n "${SECURITY_REF:-}" ]; then
  echo "==> Laying the pending security migrations from ${SECURITY_REF} over the replay"
  scripts/local-stack/down.sh > /dev/null 2>&1 || true
  for f in $(git ls-tree --name-only "$SECURITY_REF" supabase/migrations/ \
               | grep -E '/20261127090000_|/20261128090000_|/20261129090000_'); do
    if [ ! -f "$f" ]; then
      git show "${SECURITY_REF}:${f}" | psql -h 127.0.0.1 -U postgres -d beskt_e2e \
        -v ON_ERROR_STOP=1 -q > /dev/null
      echo "    applied $(basename "$f")"
    fi
  done
  psql -h 127.0.0.1 -U postgres -d postgres -q \
    -c "DROP DATABASE IF EXISTS beskt_e2e_seed WITH (FORCE);" \
    -c "CREATE DATABASE beskt_e2e_seed TEMPLATE beskt_e2e;"
  scripts/local-stack/up.sh --reseed
fi

if [ "${1:-}" = "--with-beskt-v01" ]; then
  echo "==> Importing BESKT v0.1 as the synthetic editor (test environment only)"
  export BESKT_SUPABASE_URL="http://127.0.0.1:${GATEWAY_PORT}"
  export BESKT_SUPABASE_ANON_KEY="$(sed -n 's/^VITE_SUPABASE_PUBLISHABLE_KEY=//p' .env.local)"
  export BESKT_EDITOR_EMAIL="beskt-journey-editor@local.test" BESKT_EDITOR_PASSWORD="LocalJourney!2026"
  export BCP_DATABASE_URL="postgresql://postgres:${PGPASSWORD}@127.0.0.1:5432/beskt_e2e"
  version="$(bun run scripts/beskt-import/import-beskt-v0-1.ts --method rekrytering --synthetic \
               | sed -n 's/^METHOD_VERSION_ID=//p')"
  bun run scripts/beskt-import/import-beskt-v0-1.ts --method sakerhet --synthetic > /dev/null
  bun run scripts/beskt-import/synthetic-release.ts "$version"
  scripts/local-stack/down.sh > /dev/null 2>&1 || true
  psql -h 127.0.0.1 -U postgres -d postgres -q \
    -c "DROP DATABASE IF EXISTS beskt_e2e_seed WITH (FORCE);" \
    -c "CREATE DATABASE beskt_e2e_seed TEMPLATE beskt_e2e;"
  scripts/local-stack/up.sh --reseed
fi
