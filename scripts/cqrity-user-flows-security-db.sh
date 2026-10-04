#!/usr/bin/env bash
# Focused synthetic regression, repeatable on a disposable current-schema DB.
# No provisioning, hosted connection or production mutation. Replay migrations
# once in a new DB before using this script. All test fixtures are rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SECURITY_DOCKER_CONTAINER:?Set the existing local Docker database container}"
: "${SECURITY_TEST_DB:?Set a disposable database beginning cqrityjob_}"
case "$SECURITY_TEST_DB" in cqrityjob_[a-zA-Z0-9_]*) ;; *) echo 'Refusing a non-disposable database name' >&2; exit 2;; esac
DOCKER_BIN="${DOCKER_BIN:-docker}"
for suite in career_discovery_v31_public_flow_test sp_application_passport_test; do
  "$DOCKER_BIN" exec -i "$SECURITY_DOCKER_CONTAINER" psql -U postgres -d "$SECURITY_TEST_DB" -v ON_ERROR_STOP=1 < "supabase/tests/${suite}.sql"
done
# These older suites have no enclosing transaction of their own.
for suite in security_passport_selected_sharing_test security_passport_share_gateway_test; do
  {
    printf 'BEGIN;\n'
    cat "supabase/tests/${suite}.sql"
    printf '\nROLLBACK;\n'
  } | "$DOCKER_BIN" exec -i "$SECURITY_DOCKER_CONTAINER" psql -U postgres -d "$SECURITY_TEST_DB" -v ON_ERROR_STOP=1
done
