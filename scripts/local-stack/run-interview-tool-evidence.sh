#!/usr/bin/env bash
#
# The PR 5B routed walk, at every viewport, with its traces kept.
#
# One reseed per project, because the walk is NOT idempotent: it opens a
# conduct session, locks two positions and reveals a panel, and the ledger
# underneath refuses DELETE for every caller including the database owner. The
# only honest way to run it twice is to start from the seeded state again.
#
# Playwright clears test-results/ at the start of each run, so each project's
# traces are moved out before the next one begins. They are NOT committed — a
# trace records the network and therefore carries the session's bearer token —
# but their digests are, so the evidence says exactly which files a reviewer
# should expect when they reproduce it.
#
# Usage:  scripts/local-stack/run-interview-tool-evidence.sh [project ...]

set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PROJECTS=("$@")
[ ${#PROJECTS[@]} -eq 0 ] && PROJECTS=(chromium mobile-375 mobile-390)

OUT="artifacts/beskt-interview-tool/live"
TRACES="${BCP_TOOL_TRACE_DIR:-/tmp/beskt-interview-tool-traces}"
BASE="${E2E_BASE_URL:-http://127.0.0.1:3119}"

rm -rf "$OUT" "$TRACES"
mkdir -p "$OUT" "$TRACES"

# A reseed restarts `vite dev`, and the first request after that compiles the
# route on demand. The server shell for /login arrives long before the
# client-rendered form does, so there is nothing useful to poll for here: the
# only honest readiness signal is the field itself, and the walk waits for that
# directly (see signIn in the spec). All this loop establishes is that the
# route is being served at all.
wait_for_login() {
  for _ in $(seq 1 180); do
    if curl -sfo /dev/null "${BASE}/login"; then return 0; fi
    sleep 1
  done
  echo "REFUSED: the application never served /login at ${BASE}" >&2
  exit 1
}

for project in "${PROJECTS[@]}"; do
  echo "==> ${project}"
  scripts/local-stack/down.sh > /dev/null 2>&1 || true
  scripts/local-stack/up.sh --reseed > /dev/null
  wait_for_login

  E2E_LOCAL_STACK=1 E2E_BASE_URL="$BASE" BCP_TOOL_EVIDENCE_DIR="$OUT" \
    npx playwright test e2e/beskt-interview-tool.spec.ts \
      --project="$project" --workers=1 --trace on --reporter=list

  mkdir -p "${TRACES}/${project}"
  while IFS= read -r trace; do
    cp "$trace" "${TRACES}/${project}/$(basename "$(dirname "$trace")").zip"
  done < <(find test-results -name 'trace.zip')
  echo "    kept $(find "${TRACES}/${project}" -name '*.zip' | wc -l) trace(s)"

  # And removed from the working tree once their digests are safe elsewhere.
  # test-results/ is where Playwright leaves the traces, a trace records the
  # network, and the evidence scan REFUSES any run that leaves one lying where
  # it could be uploaded. Keeping them in /tmp and digesting them is the whole
  # arrangement; leaving a second copy here would defeat it.
  rm -rf test-results
done

BCP_TOOL_EVIDENCE_DIR="$OUT" BCP_TOOL_TRACE_DIR="$TRACES" \
  bun run scripts/beskt-interview-tool-evidence-manifest.ts
