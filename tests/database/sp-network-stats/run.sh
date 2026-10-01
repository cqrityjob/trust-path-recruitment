#!/usr/bin/env bash
# Behavioural proof of sp_network_stats() against a throwaway local Postgres.
# Run: bash tests/database/sp-network-stats/run.sh   (needs initdb/pg_ctl on PATH
# or under /usr/lib/postgresql/*/bin; creates and removes its own cluster).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"; [ -n "$BIN" ] && export PATH="$BIN:$PATH"
TMP="$(mktemp -d)"; PORT=54329
chown -R postgres "$TMP" 2>/dev/null || true
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "export PATH=$PATH; $*"; else bash -c "$*"; fi; }
cleanup() { as_pg "pg_ctl -D $TMP/db -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
as_pg "initdb -D $TMP/db -A trust >/dev/null"
as_pg "pg_ctl -D $TMP/db -o '-p $PORT -k $TMP' -l $TMP/log -w start >/dev/null"
export PGHOST="$TMP" PGPORT=$PORT PGUSER=postgres
psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE t" postgres
export PGDATABASE=t
psql -v ON_ERROR_STOP=1 -q -f "$HERE/00_schema.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20261227090000_sp_network_statistics.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/01_tests.sql"
