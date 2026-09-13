#!/usr/bin/env bash
#
# The routed walk, at every viewport, with its traces kept.
#
# One reseed per project, because the walk is NOT idempotent: it writes an
# append-only ledger that refuses DELETE for every caller, the database owner
# included, so the only honest way to run it twice is to start from the seeded
# state again.
#
# Playwright clears test-results/ at the start of each run, so each project's
# traces are moved out before the next one begins. They are NOT committed —
# a trace records the network and therefore carries the session's bearer
# token — but their digests are, so the evidence says exactly which files a
# reviewer should expect when they reproduce it.
#
# Usage:  scripts/local-stack/run-routed-evidence.sh [project ...]

set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PROJECTS=("$@")
[ ${#PROJECTS[@]} -eq 0 ] && PROJECTS=(chromium mobile-375 mobile-390)

OUT="artifacts/beskt-candidate-preparation/live"
TRACES="${BCP_TRACE_DIR:-/tmp/beskt-routed-traces}"
BASE="${E2E_BASE_URL:-http://127.0.0.1:3119}"

rm -rf "$OUT" "$TRACES"
mkdir -p "$OUT" "$TRACES"

for project in "${PROJECTS[@]}"; do
  echo "==> ${project}"
  scripts/local-stack/down.sh > /dev/null 2>&1 || true
  scripts/local-stack/up.sh --reseed > /dev/null

  E2E_LOCAL_STACK=1 E2E_BASE_URL="$BASE" \
    npx playwright test e2e/beskt-candidate-preparation.spec.ts \
      --project="$project" --workers=1 --trace on --reporter=list

  mkdir -p "${TRACES}/${project}"
  while IFS= read -r trace; do
    cp "$trace" "${TRACES}/${project}/$(basename "$(dirname "$trace")").zip"
  done < <(find test-results -name 'trace.zip')
  echo "    kept $(find "${TRACES}/${project}" -name '*.zip' | wc -l) trace(s)"
done

BCP_TRACE_DIR="$TRACES" bun run scripts/beskt-routed-evidence-manifest.ts
