#!/usr/bin/env bash
# Synthetic assigned-role and TestBank browser checks; never hosted credentials.
# Existing test-env.sh replays the full history once and restores its snapshot
# before each mutating suite/project. Separate names preserve parallel stacks.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-role-assessment-e2e-db}"
export LOCAL_DOCKER_NETWORK="${LOCAL_DOCKER_NETWORK:-role-assessment-e2e-net}"
export LOCAL_STACK_LOG_DIR="${LOCAL_STACK_LOG_DIR:-/tmp/role-assessment-e2e}"
export APP_PORT="${APP_PORT:-3119}" GATEWAY_PORT="${GATEWAY_PORT:-54331}"
export PGREST_PORT="${PGREST_PORT:-59433}"
export POSTGREST_IMAGE="postgrest/postgrest:v14.15"
export LOCAL_DB_NAME=beskt_e2e LOCAL_DB_PASSWORD=localbeskt
export RESEND_API_KEY=""
# The harness rewrites these to its own local tokens. Never inherit a mail key.
export E2E_LOCAL_STACK=1 E2E_BASE_URL="http://127.0.0.1:${APP_PORT}"
export E2E_SUPABASE_URL="http://127.0.0.1:${GATEWAY_PORT}"
export JOURNEY_DATABASE_URL="postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e"
export SUPABASE_URL="$E2E_SUPABASE_URL" VITE_SUPABASE_URL="$E2E_SUPABASE_URL"
export SUPABASE_PROJECT_ID=local-beskt-evidence VITE_SUPABASE_PROJECT_ID=local-beskt-evidence
export PUBLIC_SITE_URL="$E2E_BASE_URL"
# up.sh mints its own loopback tokens into .env.local. Inherited credentials
# must not override that file when Vite starts the app.
unset SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
unset SUPABASE_ANON_KEY VITE_SUPABASE_ANON_KEY SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
export ROLE_EVIDENCE_DIR="${ROLE_EVIDENCE_DIR:-/tmp/role-assessment-evidence}"
trap 'bash scripts/local-stack/down.sh' EXIT
bash scripts/local-stack/test-env.sh
for project in chromium mobile-390; do
  for suite in role-assessment-journey test-bank-dispatch; do
    bash scripts/local-stack/test-env.sh --reseed
    psql "$JOURNEY_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
      -f scripts/fixtures/role-assessment-journey-fixture.sql
    if [ "$suite" = test-bank-dispatch ]; then
      psql "$JOURNEY_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
        -f scripts/fixtures/recruitment-workspace-fixture.sql
    fi
    export E2E_SUPABASE_ANON_KEY
    E2E_SUPABASE_ANON_KEY="$(sed -n 's/^VITE_SUPABASE_PUBLISHABLE_KEY=//p' .env.local)"
    node scripts/local-dev-server-warmup.mjs "$E2E_BASE_URL"
    # JSON is inspected below: skipped new role coverage must not go green.
    PLAYWRIGHT_JSON_OUTPUT_NAME="${ROLE_EVIDENCE_DIR}/${suite}-${project}.json" \
      bunx playwright test "e2e/${suite}.spec.ts" --project="$project" \
        --workers=1 --reporter=list,json
    bun -e 'const r=await Bun.file(process.argv[1]).json();const s=r.stats;
      const expected=process.argv[2]==="test-bank-dispatch"&&process.argv[3]==="mobile-390"?3:4;
      const skipped=expected===3?1:0;
      if(s.expected!==expected||s.unexpected!==0||s.flaky!==0||s.skipped!==skipped)throw Error(JSON.stringify(s));' \
      "${ROLE_EVIDENCE_DIR}/${suite}-${project}.json" "$suite" "$project"
  done
done
