#!/usr/bin/env bash
#
# Full-history migration replay + database test suite.
#
# Runs identically in CI (against a postgres service container) and locally
# (against any disposable instance). Never touches a real environment: it
# creates its own database, and refuses to run against anything that looks
# like a managed Supabase host.
#
# Usage:
#   scripts/db-test.sh
#
# Honours the standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Defaults target a local instance on 127.0.0.1:5432.

set -Eeuo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
TEST_DB="${TEST_DB:-scp_ci_test}"
export PGHOST PGPORT PGUSER

# ---------------------------------------------------------------------------
# Safety: this script drops and recreates a database. Refuse to point it at
# anything that is plausibly real.
# ---------------------------------------------------------------------------
case "$PGHOST" in
  *supabase.co|*supabase.com|*.rds.amazonaws.com|*.neon.tech)
    echo "REFUSING TO RUN: PGHOST '$PGHOST' looks like a managed/production host." >&2
    echo "This script creates and drops databases and must only target a disposable instance." >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

psql_q() { psql -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> Target: $PGUSER@$PGHOST:$PGPORT/$TEST_DB"

# ---------------------------------------------------------------------------
# 1. Clean database
# ---------------------------------------------------------------------------
echo "==> Creating a clean test database"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB};" >/dev/null

echo "==> Applying test-harness bootstrap"
psql_q -d "$TEST_DB" -f supabase/tests/00_bootstrap.sql >/dev/null

# ---------------------------------------------------------------------------
# 2. Migration ordering
#
# Migrations apply in filename (timestamp) order. A2 depends on objects A1
# creates, so assert the ordering explicitly rather than trusting the glob.
# ---------------------------------------------------------------------------
echo "==> Verifying Security Competency migration ordering"
# Portable across bash 3.2 (macOS) and 4+ (CI) -- no mapfile/readarray.
SCP_MIGRATION_LIST="$(ls supabase/migrations/*_scp_a*.sql | sort)"
SCP_MIGRATION_COUNT="$(printf '%s\n' "$SCP_MIGRATION_LIST" | grep -c . || true)"
if [ "$SCP_MIGRATION_COUNT" -lt 2 ]; then
  echo "FAIL: expected at least 2 scp migrations, found $SCP_MIGRATION_COUNT" >&2
  exit 1
fi
# Filename (timestamp) order must match aN order for every scp migration, so
# a later one can safely depend on an earlier one's objects.
_expected=1
while read -r _path; do
  [ -z "$_path" ] && continue
  _name="$(basename "$_path")"
  case "$_name" in
    *_scp_a${_expected}_*) echo "    ok  #${_expected}  $_name" ;;
    *)
      echo "FAIL: scp migration #${_expected} in filename order is '$_name'," >&2
      echo "      expected a file named *_scp_a${_expected}_*. Migration ordering is not safe." >&2
      exit 1
      ;;
  esac
  _expected=$((_expected + 1))
done <<EOF
$SCP_MIGRATION_LIST
EOF

# ---------------------------------------------------------------------------
# 3. Replay the full migration history, in order
#
# Nineteen migrations are known to fail on a clean replay and fail identically
# on origin/main: seventeen are duplicate Lovable-generated files that
# re-create objects an earlier migration already made, and two require
# storage.objects which the harness deliberately does not stub. They are
# allowlisted BY NAME, so a NEW failure -- or one of these starting to pass --
# is caught rather than silently absorbed.
#
# The 20260728 17:59-18:22 block is Lovable Cloud's own re-issue of the
# Security Competency and Career Discovery migrations, generated when the
# Cloud database was synced. Cloud applies them under its generated
# filenames while this repository already carries the authored originals, so
# on a clean replay the second copy hits "relation ... already exists". The
# resulting schema is identical either way; only the replay double-applies.
# Verified failing on origin/main at e1056e0 before being added here.
# ---------------------------------------------------------------------------
# Each entry is  <filename>|||<expected error substring>
#
# The expected error is asserted, not merely the filename. A file on this
# list that fails for a DIFFERENT reason, stops at a different statement,
# or starts passing, is reported as a deviation. Blanket-suppressing every
# error from a named file would hide exactly the drift this list exists to
# make visible.
KNOWN_FAILURES=(
  "20260718153627_f2b32c5d-cd50-4838-bc2c-369fc02ef5a3.sql|||relation \"security_career_profiles\" already exists"
  "20260719115332_aa5ec826-c781-4d2d-a03e-f6c744d43272.sql|||column \"status\" of relation \"employers\" already exists"
  "20260719180509_f897a9d9-28c9-41ed-b398-05030b81ec40.sql|||relation \"storage.objects\" does not exist"
  "20260719220600_0e43ff83-6b6a-4bd0-ab65-f16e86f79946.sql|||column \"registration_number\" of relation \"employers\" already exists"
  "20260720072016_c58d0842-55aa-437c-8260-4f0cefd56153.sql|||policy \"employers_owner_admin_update\" for table \"employers\" already exists"
  "20260720124636_c5e57833-aa14-4466-a5ec-03c29424eac0.sql|||relation \"employer_moderation_events\" already exists"
  "20260720150000_h3_4a_candidate_application_core.sql|||relation \"job_application_status_events\" already exists"
  "20260720160000_h3_4b_beta_feedback.sql|||relation \"beta_feedback\" already exists"
  "20260721085020_796e7c92-8234-4081-87b4-0b57dce9f35d.sql|||relation \"storage.objects\" does not exist"
  "20260723192846_096c5154-1c66-4089-bd18-b5b349d69f18.sql|||relation \"employees\" already exists"
  "20260724101608_64a91a93-b7af-45a5-aae2-a2ef7de6a81c.sql|||relation \"assessment_assignments\" already exists"
  "20260724130000_admin_portal_operational_scope.sql|||policy \"employees_admin_select\" for table \"employees\" already exists"
  # ---- Lovable Cloud sync re-issue (see the note above) ----
  "20260728175944_126362c3-0bfe-4872-9364-decdeffaa734.sql|||relation \"supabase_migrations.schema_migrations\" does not exist"
  "20260728181422_cff0d76a-c34f-46c1-98c1-dd28126902fb.sql|||relation \"scp_content_roles\" already exists"
  "20260728181803_500542a9-3dc2-4e13-8505-7113dc859560.sql|||relation \"scp_scoring_versions\" already exists"
  "20260728181901_0db6ed3c-faa0-4b55-8509-c24ed96e7b4a.sql|||trigger \"scp_competency_versions_insert_status\" for relation \"scp_competency_versions\" already exists"
  "20260728181922_8a907474-dd2f-45cc-a56e-44be6760ebca.sql|||relation \"scp_scoring_version_lineage\" already exists"
  "20260728182046_75665c93-b819-4d78-a0ef-722d21dbaab1.sql|||relation \"cd_definition_versions\" already exists"
  "20260728182219_bf31c515-b722-498b-8447-c7021a73b41b.sql|||relation \"cd_definition_items\" already exists"
  # Cloud re-issued 20260729090000 as 20260729075534, i.e. under an EARLIER
  # timestamp, so on replay Cloud's copy runs first and the authored file
  # then hits "already exists". Section 0 of the authored file (the
  # scp_item_versions guard repair) still commits before that point, which
  # the 6-guarded-tables assertion below independently confirms.
  "20260729090000_career_discovery_v3_internal_test.sql|||relation \"cd_internal_testers\" already exists"
)

# Returns 0 and echoes the expected error when the file is allowlisted.
expected_failure_for() {
  local name="$1" entry
  for entry in "${KNOWN_FAILURES[@]}"; do
    case "$entry" in
      "$name|||"*) printf '%s' "${entry#*|||}"; return 0 ;;
    esac
  done
  return 1
}

echo "==> Replaying full migration history"
UNEXPECTED=()
for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  set +e
  ERR_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$f" 2>&1 >/dev/null)"
  RC=$?
  set -e

  EXPECTED=""
  if EXPECTED="$(expected_failure_for "$name")"; then IS_KNOWN=1; else IS_KNOWN=0; fi

  if [ "$RC" -eq 0 ]; then
    if [ "$IS_KNOWN" -eq 1 ]; then
      echo "    !!  $name is allowlisted as a known failure but PASSED."
      echo "        Remove it from KNOWN_FAILURES in scripts/db-test.sh."
      UNEXPECTED+=("$name (unexpectedly passed)")
    fi
    continue
  fi

  # Failed. The first reported error line is the one that stopped it.
  ACTUAL="$(printf '%s' "$ERR_OUT" | grep -m1 -E '(ERROR|FEL):' || true)"

  if [ "$IS_KNOWN" -eq 0 ]; then
    echo "    XX  $name FAILED (not allowlisted)"
    printf '%s\n' "$ERR_OUT" | grep -iE "error|FEL" | head -3 || true
    UNEXPECTED+=("$name")
    continue
  fi

  # Allowlisted: the failure must be the EXPECTED one. A different error, a
  # different failing statement, or an earlier stop is a deviation, not a
  # known failure.
  case "$ACTUAL" in
    *"$EXPECTED"*)
      echo "    --  $name (known failure, expected error confirmed)"
      ;;
    *)
      echo "    XX  $name failed with an UNEXPECTED error."
      echo "        expected: $EXPECTED"
      echo "        actual:   $ACTUAL"
      UNEXPECTED+=("$name (error changed)")
      ;;
  esac
done

if [ "${#UNEXPECTED[@]}" -gt 0 ]; then
  echo ""
  echo "FAIL: ${#UNEXPECTED[@]} migration(s) deviated from the expected baseline:" >&2
  printf '  - %s\n' "${UNEXPECTED[@]}" >&2
  exit 1
fi
echo "    ok  migration replay matches the documented baseline"

# ---------------------------------------------------------------------------
# 4. Both Security Competency migrations must genuinely be applied
# ---------------------------------------------------------------------------
echo "==> Verifying the Security Competency schema landed"
SCP_TABLES="$(psql -tAq -d "$TEST_DB" -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name like 'scp\\_%';")"
if [ "$SCP_TABLES" -ne 23 ]; then
  echo "FAIL: expected 23 scp_ tables, found $SCP_TABLES" >&2
  exit 1
fi
echo "    ok  23 scp_ base tables present (A1 + A2 both applied)"

# A2-specific evidence, so an A1-only replay cannot pass this job.
psql_q -d "$TEST_DB" -c "
DO \$\$
BEGIN
  IF (SELECT count(*) FROM public.scp_scoring_versions) < 1 THEN
    RAISE EXCEPTION 'A2 did not apply: scp_scoring_versions is empty';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_name='scp_bundle_versions' AND column_name='scoring_version_id') <> 1 THEN
    RAISE EXCEPTION 'A2 did not apply: scp_bundle_versions.scoring_version_id is missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_name='scp_bundle_versions' AND column_name='scoring_version') <> 0 THEN
    RAISE EXCEPTION 'A2 did not apply: the free-text scoring_version column still exists';
  END IF;
END \$\$;" >/dev/null
echo "    ok  A2 applied after A1 (scoring version table + FK column replacement)"

# A3-specific evidence: the HIGH-finding fixes are actually present.
psql_q -d "$TEST_DB" -c "
DO \$\$
DECLARE _guarded integer; _reactivation integer;
BEGIN
  SELECT count(DISTINCT c.relname) INTO _guarded
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'scp_guard_version_starts_as_draft';
  IF _guarded <> 6 THEN
    RAISE EXCEPTION 'A3 did not apply: expected 6 versioned tables guarded, found %', _guarded;
  END IF;

  SELECT count(*) INTO _reactivation FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'assessment_assignments_block_retired_reactivation_trg';
  IF _reactivation <> 1 THEN
    RAISE EXCEPTION 'A3 did not apply: the retirement reactivation guard is missing';
  END IF;

  IF pg_get_functiondef('public.scp_bundle_version_assignability(uuid)'::regprocedure)
       NOT LIKE '%NO_FULLY_ADAPTED_LANGUAGE%' THEN
    RAISE EXCEPTION 'A3 did not apply: assignability still uses the fail-open language check';
  END IF;
END \$\$;" >/dev/null
echo "    ok  A3 applied (6 insert guards, reactivation guard, fail-closed assignability)"

# ---------------------------------------------------------------------------
# 5. The assertion suite (153 domain assertions across 20 groups)
#
# ON_ERROR_STOP means any failed assertion aborts psql with a non-zero exit,
# which -e propagates as a job failure.
# ---------------------------------------------------------------------------
echo "==> Running domain model + RLS assertions"
# Capture rather than let -e abort, so a failing assertion's own message is
# printed. A CI job that reports only "exit 3" makes the reviewer re-run it
# locally to find out what broke.
set +e
SUITE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_a1_domain_model_test.sql 2>&1)"
SUITE_RC=$?
set -e

echo "$SUITE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
PASSED="$(echo "$SUITE_OUT" | grep -c "ok  " || true)"

if [ "$SUITE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the assertion suite exited with code ${SUITE_RC}." >&2
  echo "$SUITE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${PASSED} assertions passed"

if [ "$PASSED" -lt 153 ]; then
  echo "FAIL: expected at least 153 assertions, only ${PASSED} ran." >&2
  echo "      A suite that silently stops running assertions is worse than one that fails." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5b. Security Career Discovery v3.0 Phase 1 assertions
#
# Persistence, the database-side scoring boundary, the lifecycle guard, and
# cross-user isolation. Runs before the destructive rollback step.
# ---------------------------------------------------------------------------
echo "==> Running Career Discovery v3 assertions"
set +e
CD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/career_discovery_v3_test.sql 2>&1)"
CD_RC=$?
set -e

CD_PASSED="$(echo "$CD_OUT" | grep -c "ok  " || true)"

if [ "$CD_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Career Discovery suite exited with code ${CD_RC}." >&2
  echo "$CD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${CD_PASSED} Career Discovery assertions passed"

if [ "$CD_PASSED" -lt 130 ]; then
  echo "FAIL: expected at least 130 Career Discovery assertions, only ${CD_PASSED} ran." >&2
  echo "      A suite that silently stops running assertions is worse than one that fails." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5c. Security Career Discovery v3.1 PR1 schema assertions
#
# The additive v3.1 schema: new item kinds, the option order seed, option
# evidence, option loadings, Layer 4 calibration and sharing. Every guard is
# mutated to prove it refuses what it exists to refuse.
#
# Runs before the destructive rollback step, like 5b.
# ---------------------------------------------------------------------------
echo "==> Running Career Discovery v3.1 schema assertions"
set +e
CD31_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/career_discovery_v31_schema_test.sql 2>&1)"
CD31_RC=$?
set -e

echo "$CD31_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CD31_PASSED="$(echo "$CD31_OUT" | grep -c "ok  " || true)"

if [ "$CD31_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Career Discovery v3.1 suite exited with code ${CD31_RC}." >&2
  echo "$CD31_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${CD31_PASSED} Career Discovery v3.1 assertions passed"

if [ "$CD31_PASSED" -lt 45 ]; then
  echo "FAIL: expected at least 45 Career Discovery v3.1 assertions, only ${CD31_PASSED} ran." >&2
  echo "      A suite that silently stops running assertions is worse than one that fails." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5d. Security Career Discovery v3.1 completion, idempotency and snapshot
#     stability.
#
# The stability group mutates the real definition, item registry and option
# matrix tables and then proves the stored snapshot bytes are unchanged.
# ---------------------------------------------------------------------------
echo "==> Running Career Discovery v3.1 completion + stability assertions"
set +e
CDC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/career_discovery_v31_completion_test.sql 2>&1)"
CDC_RC=$?
set -e

echo "$CDC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CDC_PASSED="$(echo "$CDC_OUT" | grep -c "ok  " || true)"

if [ "$CDC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Career Discovery v3.1 completion suite exited with code ${CDC_RC}." >&2
  echo "$CDC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${CDC_PASSED} Career Discovery v3.1 completion assertions passed"

if [ "$CDC_PASSED" -lt 35 ]; then
  echo "FAIL: expected at least 35 completion assertions, only ${CDC_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5e. Public v3.1 assessment flow (replay-on-login), isolated fixture.
#
# Creates its OWN pilot test instrument, runs the flow, and proves production
# v3.1 stays internal_test with every review gate outstanding.
# ---------------------------------------------------------------------------
echo "==> Running public v3.1 flow assertions"
set +e
PUB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/career_discovery_v31_public_flow_test.sql 2>&1)"
PUB_RC=$?
set -e
echo "$PUB_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
PUB_PASSED="$(echo "$PUB_OUT" | grep -c "ok  " || true)"
if [ "$PUB_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the public v3.1 flow suite exited with code ${PUB_RC}." >&2
  echo "$PUB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi
echo "    ok  ${PUB_PASSED} public v3.1 flow assertions passed"
if [ "$PUB_PASSED" -lt 20 ]; then
  echo "FAIL: expected at least 20 public-flow assertions, only ${PUB_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 6. Rollback verification (destructive -- must run last)
# ---------------------------------------------------------------------------
echo "==> Verifying the documented rollback procedure"
set +e
ROLLBACK_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_a_rollback_test.sql 2>&1)"
ROLLBACK_RC=$?
set -e

ROLLBACK_PASSED="$(echo "$ROLLBACK_OUT" | grep -c "ok  " || true)"

if [ "$ROLLBACK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: rollback verification exited with code ${ROLLBACK_RC}." >&2
  echo "$ROLLBACK_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${ROLLBACK_PASSED} rollback assertions passed"

if [ "$ROLLBACK_PASSED" -lt 26 ]; then
  echo "FAIL: expected at least 26 rollback assertions, only ${ROLLBACK_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Tidy up
# ---------------------------------------------------------------------------
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null

echo ""
echo "===================================================="
echo " DB suite OK: ${PASSED} domain assertions,"
echo "              ${CD_PASSED} Career Discovery assertions,"
echo "              ${CD31_PASSED} Career Discovery v3.1 assertions,"
echo "              ${CDC_PASSED} v3.1 completion + stability assertions,"
echo "              ${PUB_PASSED} public v3.1 flow assertions,"
echo "              ${ROLLBACK_PASSED} rollback assertions"
echo "===================================================="
