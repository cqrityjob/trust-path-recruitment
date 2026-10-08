#!/usr/bin/env bash
# No hosted mode. Two real SQL connections in a disposable local clone.
set -euo pipefail
: "${TEST_DB:?TEST_DB must name the isolated current-schema database}"
case "$TEST_DB" in *ci_test*) ;; *) echo 'FAIL: isolated ci_test database required' >&2; exit 1;; esac
case "${PGHOST:-}" in 127.0.0.1|localhost|/*) ;; *) echo 'FAIL: explicit local PGHOST required' >&2; exit 1;; esac
LIFECYCLE_RACE_DB="${TEST_DB:0:48}_lc_ci_test"
export LIFECYCLE_RACE_DB
case "$LIFECYCLE_RACE_DB" in *[!a-zA-Z0-9_]*) echo 'FAIL: invalid database identifier' >&2; exit 1;; esac
psql -X -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE \"$LIFECYCLE_RACE_DB\" TEMPLATE \"$TEST_DB\""
cleanup() { psql -X -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE \"$LIFECYCLE_RACE_DB\""; }
trap cleanup EXIT
"${LIFECYCLE_PYTHON:-python3}" scripts/interview-method-lifecycle-race.py
