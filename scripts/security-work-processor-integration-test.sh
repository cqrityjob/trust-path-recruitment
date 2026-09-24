#!/usr/bin/env bash
set -euo pipefail
umask 077
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "$script_dir/.." && pwd)"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/sw-processor-integration.XXXXXX")"
fixture_pid=""
cleanup() {
  if [[ -n "$fixture_pid" ]]; then kill -TERM "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; fi
  if [[ "${SW_PROCESSOR_TEST_KEEP:-0}" == "1" ]]; then
    printf 'Synthetic fixture retained at %s\n' "$fixture_dir"
  else
    rm -rf "$fixture_dir"
    rm -f "$fixture_dir.bootstrap.log"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$root_dir"
bun run scripts/security-work-processor-local.ts "$fixture_dir" >"$fixture_dir.bootstrap.log" 2>&1 &
fixture_pid=$!
for attempt in $(seq 1 400); do
  if [[ -f "$fixture_dir/ready.json" ]]; then break; fi
  if ! kill -0 "$fixture_pid" 2>/dev/null; then cat "$fixture_dir.bootstrap.log"; exit 1; fi
  sleep 0.1
done
if [[ ! -f "$fixture_dir/ready.json" ]]; then cat "$fixture_dir.bootstrap.log"; printf 'Processor fixture did not become ready.\n' >&2; exit 1; fi
# Generated locally with shell-quoted values and mode0600, never a user file.
# shellcheck source=/dev/null
source "$fixture_dir/app.env"
bun build scripts/security-work-processor-http-check.ts --target=node --outfile="$fixture_dir/http-check.mjs"
node "$fixture_dir/http-check.mjs"
