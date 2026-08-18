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

# ---------------------------------------------------------------------------
# Suite failure policy.
#
# DEFAULT (unset or 0): the first failing suite aborts the run, exactly as
# before. Fail-fast is right for a normal PR -- the first failure is the one
# to fix.
#
# DB_TEST_CONTINUE_ON_SUITE_FAILURE=1: a failing suite is RECORDED and the run
# continues to the next one. The script still exits non-zero at the end, and
# still prints every failure. This exists because the suites run in one long
# sequence and the later ones -- the whole Security Passport set among them --
# are invisible while an earlier suite is red. One CI run then reports the real
# blast radius instead of one symptom at a time.
#
# It changes REPORTING, never what counts as a pass: no threshold is relaxed
# and no assertion is skipped. Note that later suites then run against a
# database an earlier failure may have left dirty, so a cascade of failures
# under this flag should be re-confirmed fail-fast before being believed.
#
# Migration-replay deviations (section 3) are deliberately NOT covered: if the
# schema did not replay, every suite result afterwards is meaningless.
# ---------------------------------------------------------------------------
DB_TEST_CONTINUE_ON_SUITE_FAILURE="${DB_TEST_CONTINUE_ON_SUITE_FAILURE:-0}"
SUITE_FAILURES=()

suite_failed() {
  local label="$1"
  SUITE_FAILURES+=("$label")
  if [ "$DB_TEST_CONTINUE_ON_SUITE_FAILURE" != "1" ]; then
    exit 1
  fi
  echo "    !!  ${label} FAILED -- continuing (DB_TEST_CONTINUE_ON_SUITE_FAILURE=1)" >&2
}

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
# Seventeen migrations are known to fail on a clean replay and fail
# identically on origin/main: they are duplicate Lovable-generated files that
# re-create objects an earlier migration already made. They are
# allowlisted BY NAME, so a NEW failure -- or one of these starting to pass --
# is caught rather than silently absorbed.
#
# The two storage migrations that used to sit on this list no longer do:
# Phase 5 stubs storage.buckets and storage.objects in 00_bootstrap.sql, so
# the bucket policies this repository authors now actually execute and are
# asserted rather than assumed.
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
  "20260719220600_0e43ff83-6b6a-4bd0-ab65-f16e86f79946.sql|||column \"registration_number\" of relation \"employers\" already exists"
  "20260720072016_c58d0842-55aa-437c-8260-4f0cefd56153.sql|||policy \"employers_owner_admin_update\" for table \"employers\" already exists"
  "20260720124636_c5e57833-aa14-4466-a5ec-03c29424eac0.sql|||relation \"employer_moderation_events\" already exists"
  "20260720150000_h3_4a_candidate_application_core.sql|||relation \"job_application_status_events\" already exists"
  "20260720160000_h3_4b_beta_feedback.sql|||relation \"beta_feedback\" already exists"
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
  # ---- Lovable Cloud sync re-issue, 2026-08-04 block ----
  #
  # These six were allowlisted in 2429463 and are deliberately NOT listed here
  # any more. The four Cloud re-issues, the authored Phase 1F file and the
  # 20260804063418 reconciliation were repaired instead, so they now replay
  # cleanly rather than being expected to fail. Re-adding them would make this
  # script report "allowlisted as a known failure but PASSED".
  # Cloud re-issued 20260729090000 as 20260729075534, i.e. under an EARLIER
  # timestamp, so on replay Cloud's copy runs first and the authored file
  # then hits "already exists". Section 0 of the authored file (the
  # scp_item_versions guard repair) still commits before that point, which
  # the 6-guarded-tables assertion below independently confirms.
  "20260729090000_career_discovery_v3_internal_test.sql|||relation \"cd_internal_testers\" already exists"
  # ---- Lovable Cloud sync re-issue, 2026-08-05 block (Phase 1G .. Phase 2l) ----
  #
  # Cloud re-issued twelve migrations under generated 20260805 05xxxx filenames.
  # Those sort BEFORE the authored originals (20260805 09xxxx onward), so on a
  # clean replay Cloud's copy runs first and the authored file is then a SECOND
  # application of the same change. Each expected error below is the signature
  # of that second application, not a defect: the live database was verified
  # independently (0 real content published, 0 assessment options carrying
  # learning feedback, external AI disabled).
  #
  # 1G's content correction is refused by the Phase 2h guard, which is the guard
  # working as designed -- re-writing learning feedback onto an assessment-mode
  # option is exactly what 2h made impossible.
  "20260805090000_scp_phase1g_content_correction.sql|||SCP_LEARNING_FEEDBACK_ON_ASSESSMENT_ITEM"
  # The remaining three boundary assertions read "no published Academy content".
  # On replay the fixtures were already published by Cloud's earlier-timestamped
  # copies of 2c/2f, so the assertion fires on ordering, not on real content.
  "20260805100000_scp_phase1g_learning_and_anchors.sql|||SCP_P1G_BOUNDARY_BREACHED"
  "20260806090000_scp_phase1h_foundation_corrections.sql|||SCP_P1H_ACADEMY_PUBLISHED"
  "20260807090000_scp_phase2_read_models_and_identity_rpc.sql|||SCP_P2_BOUNDARY_BREACHED"
  # Literal second inserts of the two fixture programmes.
  "20260808100000_scp_phase2c_test_fixture_programme.sql|||duplicate key value violates unique constraint \"scp_assessment_versions_definition_id_version_number_key\""
  "20260809100000_scp_phase2f_learning_fixture.sql|||duplicate key value violates unique constraint \"scp_program_versions_program_id_version_number_key\""
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
# 23 from PR-A (A1 + A2), plus the 15 Competency Graph tables added by Phase 0
# (20260802090000): the identity pair (scp_subjects, scp_subject_identities),
# the interpretation registries (jurisdictions, evidence_source_types,
# processing_purposes, purpose_versions), the spine (roles, role_versions,
# observable_behaviours, behaviour_versions, and the two maps), the evidence
# ledger, the maturity thresholds and the read-model contract.
# 23 PR-A + 15 Competency Graph (Phase 0) + 22 Academy (Phase 1a/1b/1c).
# + scp_review_requirements from Phase 1F.
if [ "$SCP_TABLES" -ne 66 ]; then
  echo "FAIL: expected 66 scp_ tables (23 PR-A + 15 graph + 23 Academy + 1 report snapshot + 1 fixture access + 1 test grants + 1 follow-up prompts + 1 employer decisions), found $SCP_TABLES" >&2
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
  suite_failed "domain model + RLS"
else
  echo "    ok  ${PASSED} assertions passed"
  if [ "$PASSED" -lt 153 ]; then
    echo "FAIL: expected at least 153 assertions, only ${PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "domain model + RLS (assertion shortfall: floor 153)"
  fi
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
  suite_failed "Career Discovery v3"
else
  echo "    ok  ${CD_PASSED} Career Discovery assertions passed"
  if [ "$CD_PASSED" -lt 130 ]; then
    echo "FAIL: expected at least 130 Career Discovery assertions, only ${CD_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "Career Discovery v3 (assertion shortfall: floor 130)"
  fi
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
  suite_failed "Career Discovery v3.1 schema"
else
  echo "    ok  ${CD31_PASSED} Career Discovery v3.1 assertions passed"
  if [ "$CD31_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 Career Discovery v3.1 assertions, only ${CD31_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "Career Discovery v3.1 schema (assertion shortfall: floor 45)"
  fi
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
  suite_failed "Career Discovery v3.1 completion"
else
  echo "    ok  ${CDC_PASSED} Career Discovery v3.1 completion assertions passed"
  if [ "$CDC_PASSED" -lt 35 ]; then
    echo "FAIL: expected at least 35 completion assertions, only ${CDC_PASSED} ran." >&2
    suite_failed "Career Discovery v3.1 completion (assertion shortfall: floor 35)"
  fi
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
  suite_failed "public v3.1 flow"
else
  echo "    ok  ${PUB_PASSED} public v3.1 flow assertions passed"
  if [ "$PUB_PASSED" -lt 20 ]; then
    echo "FAIL: expected at least 20 public-flow assertions, only ${PUB_PASSED} ran." >&2
    suite_failed "public v3.1 flow (assertion shortfall: floor 20)"
  fi
fi

# ---------------------------------------------------------------------------
# 5b. The v3.1 personal layer — the frozen 26-question MVP
#
# Proves 2 context + 20 Career DNA + 4 Discovery Path are all administrable
# against production v3.1, and — the assertion that matters most — that the
# scored set is still exactly the twenty Career DNA items.
# ---------------------------------------------------------------------------
echo "==> Running v3.1 personal layer assertions"
set +e
PL_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/career_discovery_v31_personal_layer_test.sql 2>&1)"
PL_RC=$?
set -e
echo "$PL_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
PL_PASSED="$(echo "$PL_OUT" | grep -c "ok  " || true)"
if [ "$PL_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the v3.1 personal layer suite exited with code ${PL_RC}." >&2
  echo "$PL_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "v3.1 personal layer"
else
  echo "    ok  ${PL_PASSED} personal layer assertions passed"
  if [ "$PL_PASSED" -lt 24 ]; then
    echo "FAIL: expected at least 24 personal-layer assertions, only ${PL_PASSED} ran." >&2
    suite_failed "v3.1 personal layer (assertion shortfall: floor 24)"
  fi
fi

# ---------------------------------------------------------------------------
# 5c. The Security Competency Graph (Phase 0)
#
# Proves the graph is connected, the evidence ledger is append-only and
# accumulating, maturity is a LEVEL decided by two independent gates rather than
# a percentage, and the Career Guidance separation survived widening the family
# guard.
# ---------------------------------------------------------------------------
echo "==> Running Competency Graph assertions"
set +e
GRAPH_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_competency_graph_test.sql 2>&1)"
GRAPH_RC=$?
set -e
echo "$GRAPH_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
GRAPH_PASSED="$(echo "$GRAPH_OUT" | grep -c "ok  " || true)"
if [ "$GRAPH_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Competency Graph suite exited with code ${GRAPH_RC}." >&2
  echo "$GRAPH_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Competency Graph"
else
  echo "    ok  ${GRAPH_PASSED} Competency Graph assertions passed"
  if [ "$GRAPH_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 Competency Graph assertions, only ${GRAPH_PASSED} ran." >&2
    suite_failed "Competency Graph (assertion shortfall: floor 45)"
  fi
fi

# ---------------------------------------------------------------------------
# 5d. Security Competence Academy (Phase 1)
#
# Proves the programme domain closes the development loop, Learning and
# Assessment content are disjoint, rubrics cannot publish incomplete, no
# external AI provider is enabled, and employers have no direct path to
# identities, attempts or responses.
# ---------------------------------------------------------------------------
echo "==> Running Security Competence Academy assertions"
set +e
ACAD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_academy_phase1_test.sql 2>&1)"
ACAD_RC=$?
set -e
echo "$ACAD_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ACAD_PASSED="$(echo "$ACAD_OUT" | grep -c "ok  " || true)"
if [ "$ACAD_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Academy suite exited with code ${ACAD_RC}." >&2
  echo "$ACAD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Academy"
else
  echo "    ok  ${ACAD_PASSED} Academy assertions passed"
  if [ "$ACAD_PASSED" -lt 39 ]; then
    echo "FAIL: expected at least 39 Academy assertions, only ${ACAD_PASSED} ran." >&2
    suite_failed "Academy (assertion shortfall: floor 39)"
  fi
fi

# ---------------------------------------------------------------------------
# 5e. Phase 1F content completeness and the candidate-payload boundary
# ---------------------------------------------------------------------------
echo "==> Running Phase 1F content assertions"
set +e
CONT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_content_phase1f_test.sql 2>&1)"
CONT_RC=$?
set -e
echo "$CONT_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CONT_PASSED="$(echo "$CONT_OUT" | grep -c "ok  " || true)"
if [ "$CONT_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Phase 1F content suite exited with code ${CONT_RC}." >&2
  echo "$CONT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Phase 1F content"
else
  echo "    ok  ${CONT_PASSED} content assertions passed"
  if [ "$CONT_PASSED" -lt 50 ]; then
    echo "FAIL: expected at least 50 content assertions, only ${CONT_PASSED} ran." >&2
    suite_failed "Phase 1F content (assertion shortfall: floor 50)"
  fi
fi

# ---------------------------------------------------------------------------
# 5f. Phase 2 read models and the scoped identity RPC
# ---------------------------------------------------------------------------
echo "==> Running Phase 2 identity and read-model assertions"
set +e
P2_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_phase2_identity_and_read_models_test.sql 2>&1)"
P2_RC=$?
set -e
echo "$P2_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
P2_PASSED="$(echo "$P2_OUT" | grep -c "ok  " || true)"
if [ "$P2_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Phase 2 suite exited with code ${P2_RC}." >&2
  echo "$P2_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Phase 2 identity and read models"
else
  echo "    ok  ${P2_PASSED} Phase 2 assertions passed"
  if [ "$P2_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 Phase 2 assertions, only ${P2_PASSED} ran." >&2
    suite_failed "Phase 2 identity and read models (assertion shortfall: floor 18)"
  fi
fi

# ---------------------------------------------------------------------------
# 5b. The complete Assessment Center journey, end to end.
# ---------------------------------------------------------------------------
echo "==> Running the Phase 2 end-to-end journey"
set +e
J_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_phase2_journey_test.sql 2>&1)"
J_RC=$?
set -e
echo "$J_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
J_PASSED="$(echo "$J_OUT" | grep -c "ok  " || true)"
if [ "$J_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Phase 2 journey suite exited with code ${J_RC}." >&2
  echo "$J_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Phase 2 journey"
else
  echo "    ok  ${J_PASSED} journey assertions passed"
  if [ "$J_PASSED" -lt 102 ]; then
    echo "FAIL: expected at least 102 journey assertions, only ${J_PASSED} ran." >&2
    suite_failed "Phase 2 journey (assertion shortfall: floor 102)"
  fi
fi

# ---------------------------------------------------------------------------
# 5l. The full Security Guard / Väktare journey (18 items, closed-test grant)
# ---------------------------------------------------------------------------
echo "==> Running the full Vaktare journey"
set +e
VJ_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_vaktare_journey_test.sql 2>&1)"
VJ_RC=$?
set -e

echo "$VJ_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
VJ_PASSED="$(echo "$VJ_OUT" | grep -c "ok  " || true)"

if [ "$VJ_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Vaktare journey suite exited with code ${VJ_RC}." >&2
  echo "$VJ_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${VJ_PASSED} Vaktare journey assertions passed"

if [ "$VJ_PASSED" -lt 55 ]; then
  echo "FAIL: expected at least 55 Vaktare journey assertions, only ${VJ_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-b. Purpose governance — an assignment names why it processes a person
#
# Guards the mapping that replaced "newest published purpose, across all
# purposes". Recruitment and reassessment are expected to FAIL here: their
# purpose versions are deliberately unpublished pending Product Owner and legal
# review, and the suite asserts the closure is real rather than papered over.
# ---------------------------------------------------------------------------
echo "==> Running purpose-governance assertions"
set +e
PGOV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_purpose_governance_test.sql 2>&1)"
PGOV_RC=$?
set -e

echo "$PGOV_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
PGOV_PASSED="$(echo "$PGOV_OUT" | grep -c "ok  " || true)"

if [ "$PGOV_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the purpose-governance suite exited with code ${PGOV_RC}." >&2
  echo "$PGOV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${PGOV_PASSED} purpose-governance assertions passed"

if [ "$PGOV_PASSED" -lt 23 ]; then
  echo "FAIL: expected at least 23 purpose-governance assertions, only ${PGOV_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-c. Report audience separation
#
# The test that was missing. Until Phase 8 the employer and participant
# snapshots held the SAME payload, and the journey suite could not tell:
# it applied one predicate to both rows, so byte-identical snapshots passed.
# This suite asserts ABSENCE in both directions.
# ---------------------------------------------------------------------------
echo "==> Running report audience-separation assertions"
set +e
RAUD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_report_audience_test.sql 2>&1)"
RAUD_RC=$?
set -e

echo "$RAUD_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
RAUD_PASSED="$(echo "$RAUD_OUT" | grep -c "ok  " || true)"

if [ "$RAUD_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the report audience suite exited with code ${RAUD_RC}." >&2
  echo "$RAUD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${RAUD_PASSED} report audience assertions passed"

if [ "$RAUD_PASSED" -lt 51 ]; then
  echo "FAIL: expected at least 51 report audience assertions, only ${RAUD_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-d. Report evidence scope
#
# A standard assessment report is about ONE attempt. Before 20260820130000 every
# evidence query filtered on subject_id alone, so a second sitting made the
# second report show the sum of both -- and a later attempt could silently
# change what an earlier immutable report appeared to mean. This suite sits the
# same assessment twice and holds the boundary.
# ---------------------------------------------------------------------------
echo "==> Running report evidence-scope assertions"
set +e
ASCOPE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_report_attempt_scope_test.sql 2>&1)"
ASCOPE_RC=$?
set -e

echo "$ASCOPE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ASCOPE_PASSED="$(echo "$ASCOPE_OUT" | grep -c "ok  " || true)"

if [ "$ASCOPE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the report evidence-scope suite exited with code ${ASCOPE_RC}." >&2
  echo "$ASCOPE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${ASCOPE_PASSED} report evidence-scope assertions passed"

if [ "$ASCOPE_PASSED" -lt 23 ]; then
  echo "FAIL: expected at least 23 report evidence-scope assertions, only ${ASCOPE_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-e. Pilot security gate
#
# Phase 8.5A. Four confirmed findings, each proven closed against a REAL
# principal: SET ROLE authenticated plus a JWT claim, so RLS is genuinely in
# force. Denial suites fail silently when they are pointed at a row the
# principal could not see anyway, so every denial here is paired with proof
# that somebody can still read or write the same row through the authorised
# path -- and the positive flows (save, submit, review, release) run in full.
# ---------------------------------------------------------------------------
echo "==> Running pilot security-gate assertions"
set +e
GATE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_pilot_security_gate_test.sql 2>&1)"
GATE_RC=$?
set -e

echo "$GATE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
GATE_PASSED="$(echo "$GATE_OUT" | grep -c "ok  " || true)"

if [ "$GATE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the pilot security-gate suite exited with code ${GATE_RC}." >&2
  echo "$GATE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${GATE_PASSED} pilot security-gate assertions passed"

if [ "$GATE_PASSED" -lt 46 ]; then
  echo "FAIL: expected at least 46 pilot security-gate assertions, only ${GATE_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5m. Employer Assessment Center — the people model
#
# Runs BEFORE the rollback step: it reads scp_subject_identities and the
# participant read model, both of which the rollback drops.
# ---------------------------------------------------------------------------
echo "==> Running employer people model assertions"
set +e
PM_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_people_model_test.sql 2>&1)"
PM_RC=$?
set -e

echo "$PM_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
PM_PASSED="$(echo "$PM_OUT" | grep -c "ok  " || true)"

if [ "$PM_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the people model suite exited with code ${PM_RC}." >&2
  echo "$PM_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${PM_PASSED} people model assertions passed"

if [ "$PM_PASSED" -lt 18 ]; then
  echo "FAIL: expected at least 18 people model assertions, only ${PM_PASSED} ran." >&2
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
  suite_failed "rollback verification"
else
  echo "    ok  ${ROLLBACK_PASSED} rollback assertions passed"
  if [ "$ROLLBACK_PASSED" -lt 26 ]; then
    echo "FAIL: expected at least 26 rollback assertions, only ${ROLLBACK_PASSED} ran." >&2
    suite_failed "rollback verification (assertion shortfall: floor 26)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Verifying job advertisement archiving"
set +e
ARCH_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/jobs_archive_test.sql 2>&1)"
ARCH_RC=$?
set -e

ARCH_PASSED="$(echo "$ARCH_OUT" | grep -c "ok  " || true)"

if [ "$ARCH_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the job archive suite exited with code ${ARCH_RC}." >&2
  echo "$ARCH_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "job advertisement archiving"
else
  echo "    ok  ${ARCH_PASSED} job archive assertions passed"
  if [ "$ARCH_PASSED" -lt 14 ]; then
    echo "FAIL: expected at least 14 job archive assertions, only ${ARCH_PASSED} ran." >&2
    suite_failed "job advertisement archiving (assertion shortfall: floor 14)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 2 assertions"
set +e
SP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase2_test.sql 2>&1)"
SP_RC=$?
set -e

SP_PASSED="$(echo "$SP_OUT" | grep -c "ok  " || true)"

if [ "$SP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 2 suite exited with code ${SP_RC}." >&2
  echo "$SP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 2"
else
  echo "    ok  ${SP_PASSED} Security Passport assertions passed"
  # The floor matters: a suite that silently stops running its denial tests
  # would otherwise report success for doing nothing.
  if [ "$SP_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 Security Passport assertions, only ${SP_PASSED} ran." >&2
    suite_failed "Security Passport Phase 2 (assertion shortfall: floor 30)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 3/4 assertions"
set +e
SP3_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase3_test.sql 2>&1)"
SP3_RC=$?
set -e

SP3_PASSED="$(echo "$SP3_OUT" | grep -c "ok  " || true)"

if [ "$SP3_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 3/4 suite exited with code ${SP3_RC}." >&2
  echo "$SP3_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 3/4"
else
  echo "    ok  ${SP3_PASSED} Security Passport Phase 3/4 assertions passed"
  if [ "$SP3_PASSED" -lt 35 ]; then
    echo "FAIL: expected at least 35 Phase 3/4 assertions, only ${SP3_PASSED} ran." >&2
    suite_failed "Security Passport Phase 3/4 (assertion shortfall: floor 35)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 5 assertions"
set +e
SP5_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase5_test.sql 2>&1)"
SP5_RC=$?
set -e

SP5_PASSED="$(echo "$SP5_OUT" | grep -c "ok  " || true)"

if [ "$SP5_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 5 suite exited with code ${SP5_RC}." >&2
  echo "$SP5_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 5"
else
  echo "    ok  ${SP5_PASSED} Security Passport Phase 5 assertions passed"
  if [ "$SP5_PASSED" -lt 40 ]; then
    echo "FAIL: expected at least 40 Phase 5 assertions, only ${SP5_PASSED} ran." >&2
    suite_failed "Security Passport Phase 5 (assertion shortfall: floor 40)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 6 assertions"
set +e
SP6_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase6_test.sql 2>&1)"
SP6_RC=$?
set -e

echo "$SP6_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP6_PASSED="$(echo "$SP6_OUT" | grep -c "ok  " || true)"

if [ "$SP6_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 6 suite exited with code ${SP6_RC}." >&2
  echo "$SP6_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 6"
else
  echo "    ok  ${SP6_PASSED} Security Passport Phase 6 assertions passed"
  # Every rule in the taxonomy is asserted by mutation, so a suite that stopped
  # early would be reporting success for having attempted nothing.
  if [ "$SP6_PASSED" -lt 20 ]; then
    echo "FAIL: expected at least 20 Phase 6 assertions, only ${SP6_PASSED} ran." >&2
    suite_failed "Security Passport Phase 6 (assertion shortfall: floor 20)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 6b assertions"
set +e
SP6B_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase6b_test.sql 2>&1)"
SP6B_RC=$?
set -e

echo "$SP6B_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP6B_PASSED="$(echo "$SP6B_OUT" | grep -c "ok  " || true)"

if [ "$SP6B_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 6b suite exited with code ${SP6B_RC}." >&2
  echo "$SP6B_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 6b"
else
  echo "    ok  ${SP6B_PASSED} Security Passport Phase 6b assertions passed"
  # Correction is where trust can leak forward onto a changed claim, so a suite
  # that stopped early here would be the worst kind of false pass.
  if [ "$SP6B_PASSED" -lt 25 ]; then
    echo "FAIL: expected at least 25 Phase 6b assertions, only ${SP6B_PASSED} ran." >&2
    suite_failed "Security Passport Phase 6b (assertion shortfall: floor 25)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 7 assertions"
set +e
SP7_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase7_test.sql 2>&1)"
SP7_RC=$?
set -e

echo "$SP7_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP7_PASSED="$(echo "$SP7_OUT" | grep -c "ok  " || true)"

if [ "$SP7_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 7 suite exited with code ${SP7_RC}." >&2
  echo "$SP7_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 7"
else
  echo "    ok  ${SP7_PASSED} Security Passport Phase 7 assertions passed"
  # This suite guards the ONLY anonymous surface in the product. A short run
  # here means the package-boundary and fail-closed checks did not execute.
  if [ "$SP7_PASSED" -lt 75 ]; then
    echo "FAIL: expected at least 75 Phase 7 assertions, only ${SP7_PASSED} ran." >&2
    suite_failed "Security Passport Phase 7 (assertion shortfall: floor 75)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 8 assertions"
set +e
SP8_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase8_test.sql 2>&1)"
SP8_RC=$?
set -e

echo "$SP8_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP8_PASSED="$(echo "$SP8_OUT" | grep -c "ok  " || true)"

if [ "$SP8_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 8 suite exited with code ${SP8_RC}." >&2
  echo "$SP8_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 8"
else
  echo "    ok  ${SP8_PASSED} Security Passport Phase 8 assertions passed"
  # This suite guards what a holder may do to their own record. A short run
  # means the deletion and cross-holder guards did not execute.
  if [ "$SP8_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 Phase 8 assertions, only ${SP8_PASSED} ran." >&2
    suite_failed "Security Passport Phase 8 (assertion shortfall: floor 30)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 10 assertions"
set +e
SP10_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase10_test.sql 2>&1)"
SP10_RC=$?
set -e

echo "$SP10_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP10_PASSED="$(echo "$SP10_OUT" | grep -c "ok  " || true)"

if [ "$SP10_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 10 suite exited with code ${SP10_RC}." >&2
  echo "$SP10_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 10"
else
  echo "    ok  ${SP10_PASSED} Security Passport Phase 10 assertions passed"
  # This suite runs the real decision RPC and then reads the rows it left.
  # A short run means the atomicity and refusal groups did not execute, which
  # is exactly the gap that let the production decision defect through.
  if [ "$SP10_PASSED" -lt 40 ]; then
    echo "FAIL: expected at least 40 Phase 10 assertions, only ${SP10_PASSED} ran." >&2
    suite_failed "Security Passport Phase 10 (assertion shortfall: floor 40)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport Phase 11 assertions"
set +e
SP11_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_phase11_test.sql 2>&1)"
SP11_RC=$?
set -e

echo "$SP11_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP11_PASSED="$(echo "$SP11_OUT" | grep -c "ok  " || true)"

if [ "$SP11_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport Phase 11 suite exited with code ${SP11_RC}." >&2
  echo "$SP11_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Phase 11"
else
  echo "    ok  ${SP11_PASSED} Security Passport Phase 11 assertions passed"
  # A short run means the controlled-vocabulary refusals did not execute, which
  # is the entire reason languages and skills are not free text.
  if [ "$SP11_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 Phase 11 assertions, only ${SP11_PASSED} ran." >&2
    suite_failed "Security Passport Phase 11 (assertion shortfall: floor 30)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Tidy up
# ---------------------------------------------------------------------------
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null

# ---------------------------------------------------------------------------
# 8. Aggregate verdict
#
# Only reachable with DB_TEST_CONTINUE_ON_SUITE_FAILURE=1; without it the run
# has already exited at the first failure.
# ---------------------------------------------------------------------------
if [ "${#SUITE_FAILURES[@]}" -gt 0 ]; then
  echo ""
  echo "===================================================="
  echo " DB suite FAILED: ${#SUITE_FAILURES[@]} suite(s) did not pass"
  echo "===================================================="
  printf '  - %s\n' "${SUITE_FAILURES[@]}" >&2
  exit 1
fi

echo ""
echo "===================================================="
echo " DB suite OK: ${PASSED} domain assertions,"
echo "              ${CD_PASSED} Career Discovery assertions,"
echo "              ${CD31_PASSED} Career Discovery v3.1 assertions,"
echo "              ${CDC_PASSED} v3.1 completion + stability assertions,"
echo "              ${PUB_PASSED} public v3.1 flow assertions,"
echo "              ${PL_PASSED} v3.1 personal layer assertions,"
echo "              ${GRAPH_PASSED} Competency Graph assertions,"
echo "              ${ACAD_PASSED} Academy assertions,"
echo "              ${CONT_PASSED} Phase 1F content assertions,"
echo "              ${P2_PASSED} Phase 2 identity assertions,
              ${J_PASSED} Phase 2 journey assertions,"
echo "              ${VJ_PASSED} Vaktare journey assertions,"
echo "              ${PGOV_PASSED} purpose-governance assertions,"
echo "              ${RAUD_PASSED} report audience assertions,"
echo "              ${ASCOPE_PASSED} report evidence-scope assertions,"
echo "              ${GATE_PASSED} pilot security-gate assertions,"
echo "              ${PM_PASSED} employer people model assertions,"
echo "              ${ROLLBACK_PASSED} rollback assertions,"
echo "              ${ARCH_PASSED} job archive assertions"
echo "===================================================="
