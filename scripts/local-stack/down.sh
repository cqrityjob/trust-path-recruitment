#!/usr/bin/env bash
#
# Stop everything scripts/local-stack/up.sh started, and say what it stopped.
# The database is left in place: it is the evidence, and dropping it silently
# would throw away the thing a reviewer might want to look at.

set -Eeuo pipefail
LOG_DIR="${LOCAL_STACK_LOG_DIR:-/tmp/beskt-local-stack}"

for name in app gateway postgrest; do
  pidfile="${LOG_DIR}/${name}.pid"
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2> /dev/null; then
    kill "$pid" 2> /dev/null || true
    echo "stopped ${name} (pid ${pid})"
  else
    echo "${name} was not running"
  fi
  rm -f "$pidfile"
done
