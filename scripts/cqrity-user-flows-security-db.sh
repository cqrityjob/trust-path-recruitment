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

# Verify the actual rollback without changing this clone's final schema.
{
  printf 'BEGIN;\n'
  cat supabase/rollback/20270215090000_application_passport_verified_content_guard_rollback.sql
  cat <<'SQL'
DO $$ BEGIN
  IF to_regprocedure('public.sp_require_application_verified_content()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sp_disclosures'::regclass
                AND tgname = 'sp_application_verified_content') THEN
    RAISE EXCEPTION 'F09 rollback left its function or trigger installed';
  END IF;
  RAISE NOTICE 'ok  F09 rollback removes its trigger and function';
END $$;
ROLLBACK;
DO $$ BEGIN
  IF to_regprocedure('public.sp_require_application_verified_content()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sp_disclosures'::regclass
                    AND tgname = 'sp_application_verified_content') THEN
    RAISE EXCEPTION 'F09 rollback test did not restore the current schema';
  END IF;
  RAISE NOTICE 'ok  F09 rollback verification restored the current schema';
END $$;
SQL
} | "$DOCKER_BIN" exec -i "$SECURITY_DOCKER_CONTAINER" psql -U postgres -d "$SECURITY_TEST_DB" -v ON_ERROR_STOP=1
