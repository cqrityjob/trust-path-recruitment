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

# grep -q under pipefail. `echo "$OUT" | grep -q PATTERN` is used throughout
# this script on large outputs. grep -q leaves at its first match; the writer
# then dies of SIGPIPE, the pipeline reports failure under `pipefail`, and a
# line that WAS found is reported as missing (observed 2026-10-03: "a mandatory
# first-merit assertion did not run: 2.8" with `ok 2.8` in the very output, and
# a negative control that did fail reported as "the suite PASSED"). Whether it
# happens depends on output size and timing, so it came and went between runs.
# Inside this script, -q therefore reads its whole input and discards the
# matches: same exit status (0 found, 1 not found, 2 error), no early exit.
grep() {
  local -a args=()
  local quiet=0 arg
  while [ "$#" -gt 0 ]; do
    arg="$1"; shift
    if [ "$arg" = "--" ]; then args+=("$arg" "$@"); break; fi
    if [[ "$arg" =~ ^-[A-Za-z]*q[A-Za-z]*$ ]]; then
      quiet=1
      arg="${arg//q/}"
      [ "$arg" = "-" ] && continue
    fi
    args+=("$arg")
  done
  if [ "$quiet" = 1 ]; then command grep "${args[@]}" >/dev/null; else command grep "${args[@]}"; fi
}
# The proof, before anything else depends on it: a match on the first line of
# an output far larger than a pipe buffer must still be a match.
GREP_Q_BIG="$(seq 1 40000 | sed 's/^/x marker line /')"
for _i in 1 2 3 4 5; do
  echo "$GREP_Q_BIG" | grep -q '^x marker' \
    || { echo "FAIL: grep -q under pipefail reports a match as missing (SIGPIPE)" >&2; exit 1; }
  echo "$GREP_Q_BIG" | grep -qF 'no such text' \
    && { echo "FAIL: grep -q reports a match that is not there" >&2; exit 1; }
done
unset GREP_Q_BIG _i

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
echo "==> Migration safety policy"
bun run scripts/migration-safety-check.ts

echo "==> Creating a clean test database"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB};" >/dev/null

# ── NO AUTOVACUUM WHILE THE SUITES ROLL MIGRATIONS BACK ─────────────────
#
# Several suites reproduce their defect by running the REAL rollback inside a
# savepoint, and a rollback's ALTER POLICY takes an AccessExclusiveLock on a
# table the suite has just written to. If autovacuum picks that table up in
# between, the two can deadlock: on #397 (run 37139672945) the 0203 rollback's
# ALTER POLICY on scp_report_snapshots and "autovacuum: VACUUM
# public.scp_report_snapshots" each waited on the other, the planted control
# RM NC6 failed on the deadlock instead of on its assertion, and the job went
# red on a timing accident. Autovacuum has no part in what any suite proves,
# so it is switched off for the run, server-wide because it is not settable
# per database, and restored on exit. A server this role may not reconfigure
# keeps running as before, with a warning.
DB_TEST_AUTOVACUUM_OFF=0
if psql_q -d postgres -c "ALTER SYSTEM SET autovacuum = off;" >/dev/null 2>&1 \
  && psql_q -d postgres -c "SELECT pg_reload_conf();" >/dev/null 2>&1; then
  DB_TEST_AUTOVACUUM_OFF=1
  trap 'if [ "$DB_TEST_AUTOVACUUM_OFF" = "1" ]; then psql -q -d postgres -c "ALTER SYSTEM RESET autovacuum;" -c "SELECT pg_reload_conf();" >/dev/null 2>&1 || true; fi' EXIT
  echo "    ok  autovacuum is off for this run (restored on exit)"
else
  echo "    !!  could not switch autovacuum off (needs superuser); a rollback inside a suite can still deadlock with it" >&2
fi

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
# 3. Replay the full migration history, in order — STRICTLY.
#
# Every file in supabase/migrations/ must execute successfully, in filename
# order, on an empty database. There is no allowlist, no expected-error
# matching and no tolerated SQLSTATE: the KNOWN_FAILURES mechanism that used
# to absorb 24 historical duplicate/re-issue failures was removed on
# 2026-08-28 when the legacy generated chain was retired to
# supabase/archive/parked-migrations/ (see migrations-policy.json "parked").
#
# That mechanism is also BANNED from returning: scripts/migration-safety-check.ts
# fails the build if this file reintroduces KNOWN_FAILURES, expected-error
# matching, or any error suppression inside the contract region below.
#
# Rationale: the official Supabase GitHub integration applies this directory
# strictly and stops on the first error — which is exactly how the owner
# Supabase bootstrap of vcgwvtmzftmulmoxmufv failed on 2026-08-28. A replay
# that passes only because errors are tolerated proves nothing about a real
# deployment.
# ---------------------------------------------------------------------------
# STRICT-REPLAY-CONTRACT BEGIN
echo "==> Replaying full migration history (strict: first failure aborts)"
REPLAYED=0
for f in supabase/migrations/*.sql; do
  if ! psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$f" >/dev/null; then
    echo "" >&2
    echo "FAIL: $(basename "$f") did not apply cleanly (see the error above)." >&2
    echo "      The active migration history must replay on an empty database with" >&2
    echo "      ZERO failures. There is no allowlist: fix the migration set (or park" >&2
    echo "      a generated re-issue via migrations-policy.json), never this script." >&2
    exit 1
  fi
  REPLAYED=$((REPLAYED + 1))
done
echo "    ok  ${REPLAYED} migrations applied cleanly, in filename order"
# STRICT-REPLAY-CONTRACT END

# #428 launch decision: verify the final API policy and each negative control.
# Older suites below deliberately exercise the previous participant/funnel
# contracts, including their original rollback proofs. Keep those historical
# assertions intact, in an explicit pre-launch-policy phase. The focused gate
# above proves rollback/reapply and returns to the final state before this phase.
TEST_DB="$TEST_DB" bash scripts/participant-report-api-db-check.sh
psql_q -d "$TEST_DB" -f supabase/rollback/20270216090000_participant_report_api_boundary_rollback.sql

echo "==> Interview configuration contract regression"
psql_q -d "$TEST_DB" -f supabase/tests/interview_ai_config_contract_test.sql
echo "==> Interview access expand regression"
psql_q -d "$TEST_DB" -f supabase/tests/interview_access_expand_test.sql
echo "==> Running complete client catalogue and privilege audit"
psql_q -d "$TEST_DB" -f supabase/tests/client_table_privilege_hardening_test.sql
echo "==> Manual retention routines (docs/legal/retention-runbook-v1.md), run as written on synthetic data"
psql_q -d "$TEST_DB" -f supabase/tests/retention_manual_routines_test.sql

# 20270208090000: account erasure removes the person's credential metadata and
# document readings, which used to keep their Passport rows alive and make
# admin_delete_user_if_safe() refuse with ERASURE_INCOMPLETE. Run straight after
# the replay: later blocks re-execute older migrations, and 20260917090000
# would put the pre-fix body back. Each planted control must fail on its NAMED
# assertion, or the suite proves nothing.
echo "==> Running account erasure with credential metadata assertions"
ER_SUITE=supabase/tests/account_erasure_credential_details_test.sql
ER_MIG=supabase/migrations/20270208090000_account_erasure_credential_details.sql
ER_RB=supabase/rollback/20270208090000_account_erasure_credential_details_rollback.sql
ER_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$ER_SUITE" 2>&1)" || { echo "$ER_OUT" | grep -E "ERROR|FAILED" | head -5; echo "FAIL: account erasure suite"; exit 1; }
ER_PASSED="$(printf '%s\n' "$ER_OUT" | grep -c "ok  " || true)"
[ "$ER_PASSED" -ge 27 ] || { echo "FAIL: account erasure assertion shortfall: $ER_PASSED (floor 27)"; exit 1; }
echo "    ok  $ER_PASSED account erasure assertions passed"
er_nc_expect_fail() {
  local label="$1" expect="$2" mutation="$3" out rc
  set +e
  out="$(printf 'BEGIN;\n%s\n\\i %s\n' "$mutation" "$ER_SUITE" | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: ${expect}"; then
    echo "FAIL: planted control '${label}': the suite did not fail on ${expect} -- it proves nothing" >&2
    echo "$out" | grep -E "ERROR|FAILED" | head -3 >&2 || true
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails on ${expect}"
}
ER_FN="$(sed -n '/^CREATE OR REPLACE FUNCTION public.admin_delete_user_if_safe(/,/^\$\$;$/p' "$ER_MIG")"
ER_FN_NO_BLOCK="$(printf '%s\n' "$ER_FN" | sed '/^  -- ── Dependents that do not name the account/,/^  IF _n > 0 THEN _dependents := _dependents || jsonb_build_object(.sp_credential_details/d')"
[ -n "$ER_FN" ] && [ "$ER_FN_NO_BLOCK" != "$ER_FN" ] || { echo "FAIL: account erasure control anchors not found"; exit 1; }
er_nc_expect_fail "ER NC1 full rollback of 20270208090000" "ER1.2" "$(cat "$ER_RB")"
er_nc_expect_fail "ER NC2 the dependents are not removed first" "ER2.0" "$ER_FN_NO_BLOCK"
er_nc_expect_fail "ER NC3 the reading is append-only with no erasure exception" "ER2.0" "$(cat <<'SQL'
DROP TRIGGER sp_extractions_append_only ON public.sp_evidence_extractions;
CREATE TRIGGER sp_extractions_append_only BEFORE UPDATE OR DELETE ON public.sp_evidence_extractions
  FOR EACH ROW EXECUTE FUNCTION public.sp_extractions_append_only();
SQL
)"
er_nc_expect_fail "ER NC4 the exception ignores who is being erased" "ER4.4" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.sp_evidence_extractions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND nullif(current_setting('trustpath.deleting_account', true), '') IS NOT NULL
     AND public.is_superadmin(auth.uid()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'SP_EXTRACTION_APPEND_ONLY';
END $$;
SQL
)"
echo "    ok  four planted defects, each caught on its named assertion"

# ---------------------------------------------------------------------------
# 20270202090000 / 20270203090000 / 20270204090000: who may read what an
# organisation learned about a person, and the circumvention of a suspension.
# Design: docs/release/2026-10-03-employer-report-access-design.md. The suites
# run here, straight after the replay, so they read the final state of the
# chain and not what a later rollback block leaves behind.
#
#   employer_membership_standing_test    suspension cannot be circumvented (MS)
#   employer_report_access_matrix_test   actor x read, release, finalise, offboarding (RM)
#   employer_report_access_model_test    the single definition and its resolvers (RA)
#   interview_case_access_model_test     Interview Intelligence (IC)
#
# Each suite reproduces its defect on the PRE-FIX state ITSELF (the real
# rollback, inside a savepoint: MS0, RM0, RA0, IC0), then proves the fix. Every
# planted control below mutates the schema INSIDE the suite's own transaction
# (the suite's ROLLBACK ends it, nothing is left behind) and MUST make the suite
# fail on the NAMED assertion.
ac_run_suite() { psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "supabase/tests/$1" 2>&1; }
ac_expect_pass() {
  local label="$1" suite="$2" floor="$3"
  set +e
  local out; out="$(ac_run_suite "$suite")"; local rc=$?
  set -e
  local passed; passed="$(echo "$out" | grep -c "NOTICE:  ok  " || true)"
  if [ "$rc" -ne 0 ]; then
    echo "$out" | grep -E "ERROR|FAILED" >&2 || true
    echo "FAIL: the ${label} suite exited with code ${rc}." >&2
    suite_failed "${label}"
    return 0
  fi
  if [ "$passed" -lt "$floor" ]; then
    echo "FAIL: ${label} assertion shortfall: $passed (floor $floor)" >&2
    suite_failed "${label} (assertion shortfall: floor $floor)"
    return 0
  fi
  AC_LAST_PASSED="$passed"
  echo "    ok  $passed ${label} assertions passed (defect reproduced pre-fix, refused post-fix)"
}
ac_nc_expect_fail() {
  local label="$1" suite="$2" expect="$3" mutation="$4"
  set +e
  local out
  out="$(printf 'BEGIN;\n%s\n\\i supabase/tests/%s\n' "$mutation" "$suite" | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
  local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: ${expect}"; then
    echo "FAIL: planted control '${label}': the suite did not fail on ${expect} -- it proves nothing" >&2
    echo "$out" | grep -E "ERROR|FAILED" | head -3 >&2 || true
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails on ${expect}"
}
# One function of a migration or rollback file, by name (each body ends with a line holding ';').
ac_fn() { sed -n "/^CREATE OR REPLACE FUNCTION public.$2(/,/^;\$/p" "$1"; }
AC_MIG_A=supabase/migrations/20270203090000_employer_report_access_model.sql
AC_MIG_B=supabase/migrations/20270204090000_interview_case_access_model.sql
AC_RB_A=supabase/rollback/20270203090000_employer_report_access_model_rollback.sql
AC_RB_B=supabase/rollback/20270204090000_interview_case_access_model_rollback.sql

echo "==> Running employer membership standing assertions (suspension cannot be circumvented)"
ac_expect_pass "employer membership standing" employer_membership_standing_test.sql 43
MS_PASSED="$AC_LAST_PASSED"
ac_nc_expect_fail "MS NC1 full rollback of 20270202090000" employer_membership_standing_test.sql "MS0.5" "$(cat supabase/rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql)"
ac_nc_expect_fail "MS NC2 the request insert is not guarded" employer_membership_standing_test.sql "MS1.1" "DROP TRIGGER employer_access_requests_standing_guard ON public.employer_access_requests;"
ac_nc_expect_fail "MS NC3 the request guard only knows 'removed'" employer_membership_standing_test.sql "MS1.1" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.employer_access_request_standing_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employer_memberships m WHERE m.employer_id = NEW.employer_id
              AND m.user_id = NEW.requester_user_id AND m.status IN ('removed')) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_MEMBERSHIP_BLOCKED: x' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $function$;
SQL
)"
ac_nc_expect_fail "MS NC4 approve_access_request reactivates again" employer_membership_standing_test.sql "MS2.1" "$(sed -n '/^CREATE OR REPLACE FUNCTION public.approve_access_request/,/^;$/p' supabase/rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql)"
ac_nc_expect_fail "MS NC5 reviewer grants survive suspension" employer_membership_standing_test.sql "MS4.1" "DROP TRIGGER employer_memberships_revoke_reviewer_grants ON public.employer_memberships;"
ac_nc_expect_fail "MS NC6 reviewer grants survive removal but not suspension" employer_membership_standing_test.sql "MS4.5" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.employer_membership_revoke_reviewer_grants() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'suspended' THEN
    UPDATE public.scp_employer_reviewers r SET revoked_at = now(), revoked_by = auth.uid()
     WHERE r.employer_id = NEW.employer_id AND r.user_id = NEW.user_id AND r.revoked_at IS NULL;
  END IF;
  RETURN NULL;
END; $function$;
SQL
)"

echo "==> Running employer report access matrix assertions"
ac_expect_pass "employer report access matrix" employer_report_access_matrix_test.sql 63
RM_PASSED="$AC_LAST_PASSED"
ac_nc_expect_fail "RM NC1 a suspended or removed membership still counts" employer_report_access_matrix_test.sql "RM6.1" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.has_employer_role(_user_id uuid, _employer_id uuid, _roles text[] DEFAULT NULL::text[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.employer_memberships em
    WHERE em.user_id = _user_id AND em.employer_id = _employer_id
      AND (_roles IS NULL OR em.role = ANY(_roles))
  );
$function$;
SQL
)"
ac_nc_expect_fail "RM NC2 a platform admin reads every employer report" employer_report_access_matrix_test.sql "RM8.1" \
  "$(ac_fn "$AC_MIG_A" scp_report_snapshot_readable | sed 's/AND public.scp_attempt_reports_readable(_attempt_id)/AND (public.scp_attempt_reports_readable(_attempt_id) OR public.is_platform_admin(auth.uid()))/')"
ac_nc_expect_fail "RM NC3 the interview case read is open to any authenticated user" employer_report_access_matrix_test.sql "RM2.1" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL;
$function$;
SQL
)"
ac_nc_expect_fail "RM NC4 every active member reads again (R1 widened to membership)" employer_report_access_matrix_test.sql "RM5.1" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed "s/public.has_active_employer_role(auth.uid(), _employer_id, ARRAY\['owner', 'admin'\])/true/")"
ac_nc_expect_fail "RM NC5 the subject is no longer excluded" employer_report_access_matrix_test.sql "RM5s.1" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed 's/AND NOT coalesce(auth.uid() = ANY (_subject_users), false)/AND true/')"
ac_nc_expect_fail "RM NC6 a reviewer grant ignores the use case" employer_report_access_matrix_test.sql "RM5.3" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed 's/public.scp_can_review_for(auth.uid(), _employer_id, _use_case)/public.scp_can_review_for(auth.uid(), _employer_id, NULL)/')"
ac_nc_expect_fail "RM NC7 the responsible recruiter reads every vacancy" employer_report_access_matrix_test.sql "RM5.5" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed 's/JOIN public.recruitment_settings s ON s.job_id = v.job_id AND s.employer_id = _employer_id/JOIN public.recruitment_settings s ON s.employer_id = _employer_id/')"
ac_nc_expect_fail "RM NC8 the case basis is open to every member" employer_report_access_matrix_test.sql "RM5.1" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed 's/AND (c.created_by = auth.uid()/AND (true OR c.created_by = auth.uid()/')"

echo "==> Running employer report access model assertions"
ac_expect_pass "employer report access model" employer_report_access_model_test.sql 66
RA_PASSED="$AC_LAST_PASSED"
ac_nc_expect_fail "RA NC1 a reviewer grant is never consulted" employer_report_access_model_test.sql "RA1.3" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed 's/public.scp_can_review_for(auth.uid(), _employer_id, _use_case)/false/')"
ac_nc_expect_fail "RA NC2 an unknown use case is reachable through a grant" employer_report_access_model_test.sql "RA1.4" \
  "$(ac_fn "$AC_MIG_A" employer_reports_readable | sed "s/_use_case IN ('workforce', 'recruitment')/true/")"
ac_nc_expect_fail "RA NC3 an attempt with no assignment is treated as workforce" employer_report_access_model_test.sql "RA2.1" \
  "$(ac_fn "$AC_MIG_A" scp_attempt_reports_readable | sed "s/a.issuer_organization_id, aa.use_case, aa.job_id/a.issuer_organization_id, coalesce(aa.use_case, 'workforce'), aa.job_id/")"
ac_nc_expect_fail "RA NC4 recommendations on a partly readable subject" employer_report_access_model_test.sql "RA2.7" \
  "$(ac_fn "$AC_RB_A" scp_development_recommendations | sed 's/AND public.has_active_employer_role(auth.uid(), a.issuer_organization_id);/AND public.scp_attempt_reports_readable(a.id);/')"
ac_nc_expect_fail "RA NC5 the snapshot gate without an attempt falls back to membership" employer_report_access_model_test.sql "RA3.1" \
  "$(ac_fn "$AC_MIG_A" scp_report_snapshot_readable | sed 's/THEN public.employer_reports_readable(/THEN public.has_active_employer_role(auth.uid(), _issuer_organization_id) OR public.employer_reports_readable(/')"
ac_nc_expect_fail "RA NC6 the pipeline lists every attempt again" employer_report_access_model_test.sql "RA4.2" \
  "$(ac_fn "$AC_MIG_A" scp_employer_assessment_pipeline | sed '/AND public.scp_attempt_reports_readable(at.id)/d')"
ac_nc_expect_fail "RA NC7 the review-pressure counts are not filtered per attempt" employer_report_access_model_test.sql "RA4.9" \
  "$(ac_fn "$AC_MIG_A" scp_employer_review_pressure | sed '/AND public.scp_attempt_reports_readable(at.id)/d' | sed 's/AND at.issuer_organization_id = _employer_id$/AND at.issuer_organization_id = _employer_id;/')"
ac_nc_expect_fail "RA NC8 a member with nothing to read gets a row of zeros, which says how much is waiting" employer_report_access_model_test.sql "RA4.8" \
  "$(ac_fn "$AC_MIG_A" scp_employer_review_pressure | sed '/IF NOT (public.employer_reports_readable(_employer_id)$/,/END IF;/d')"

ac_nc_expect_fail "RA NC9 the screen is told every member is an owner or administrator" employer_report_access_model_test.sql "RA9.2" \
  "$(ac_fn "$AC_MIG_A" employer_report_access | sed 's/public.employer_reports_readable(_employer_id),$/true,/')"

echo "==> Running interview case access model assertions"
ac_expect_pass "interview case access model" interview_case_access_model_test.sql 43
IC_PASSED="$AC_LAST_PASSED"
ac_nc_expect_fail "IC NC1 full rollback of 20270204090000" interview_case_access_model_test.sql "IC0.5" "$(cat "$AC_RB_B")"
ac_nc_expect_fail "IC NC2 the write gate admits every member again" interview_case_access_model_test.sql "IC2.2" \
  "$(ac_fn "$AC_RB_B" scp_iv_can_write_case)"
ac_nc_expect_fail "IC NC3 the case row policy admits every member again" interview_case_access_model_test.sql "IC1.2" \
  "$(ac_fn "$AC_RB_B" scp_iv_case_row_visible)"
ac_nc_expect_fail "IC NC4 the corrections policy no longer asks the vetting restriction (finding a, as defence in depth)" interview_case_access_model_test.sql "IC5.5" "$(cat <<'SQL'
CREATE FUNCTION public.zz_corrections_member_only(_case_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id AND public.has_active_employer_role(auth.uid(), c.employer_id));
$function$;
GRANT EXECUTE ON FUNCTION public.zz_corrections_member_only(uuid) TO authenticated;
ALTER POLICY scp_iv_corrections_employer ON public.scp_interview_candidate_corrections USING (public.zz_corrections_member_only(case_id));
SQL
)"
ac_nc_expect_fail "IC NC5 the read gate forgets the vetting restriction" interview_case_access_model_test.sql "IC5.2" \
  "$(ac_fn "$AC_MIG_B" scp_iv_can_read_case | sed '/Additive, and unchanged/d' | sed '/AND public.bcp_case_access_ok(_case_id)/d' | sed 's/c.id)))$/c.id));/')"
ac_nc_expect_fail "IC NC6 the candidate is no longer excluded from the case" interview_case_access_model_test.sql "IC3.1" \
  "$(ac_fn "$AC_MIG_B" scp_iv_can_read_case | sed 's/ARRAY\[c.candidate_user_id, a.applicant_user_id\]/NULL::uuid[]/')"

# ── THE OLDER MIGRATIONS THAT ARE RE-APPLIED BELOW REDEFINE WHAT THE MODEL REDEFINES ──────────────
#
# Many of the sections below prove an older migration the same way: roll it back, require its suite to
# fail, then RE-APPLY the migration and require the suite to pass again. A re-applied older migration
# puts its OLD function bodies and policies back (20270102 scp_subject_progress, 20270104 recommendations,
# 20270105 scp_application_assessments, 20270108 the employer reads, 20270109 the interview notes, 20270111
# the interview case gates, 20270120 approve_access_request, 20261107 / 20261130 / 20260904174903 ...), which
# silently replaces 20270202090000, 20270203090000 and 20270204090000 for every suite that follows. In
# production the older migrations never run again; here they do. So after every FULL re-apply of one of
# them (a rollback file is not) the three migrations are applied again, in order: the state a later suite
# sees is the one the migration chain defines, and the suites proved above are proved once more after the
# last of those cycles. (The BESKT stand-down cycles pin function bodies and are left alone.)
AC_OLD_OVERLAP='20260904174903|20261107090000|20261130090000|20270102090000|20270104090000|20270105090000|20270108090000|20270109090000|20270111090000|20270120090000'
ac_restore_model() {
  local f
  for f in supabase/migrations/20270202090000_employer_membership_standing_not_bypassable.sql "$AC_MIG_A" "$AC_MIG_B"; do
    PGOPTIONS='-c client_min_messages=warning' psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$f" >/dev/null \
      || { echo "FAIL: the access model could not be re-applied from $f after an older migration was re-applied" >&2; exit 1; }
  done
}
psql_q() {
  psql -v ON_ERROR_STOP=1 -q "$@" || return $?
  local a prev=""
  for a in "$@"; do
    if [ "$prev" = "-f" ] && [[ "$a" =~ ($AC_OLD_OVERLAP) ]] && [[ "$a" != *rollback* ]]; then
      ac_restore_model
      break
    fi
    prev="$a"
  done
}

# 20270101090000: four catalogue reads narrowed (drafts and unapproved
# professions to authors/admins, the interviewer guide to authors) and three
# stray client write grants revoked. Run the suite, prove it cannot pass on the
# pre-hardening state (rollback -> suite must fail on an assertion), prove the
# rollback restores exactly that state, then re-apply with its postflight.
echo "==> Running catalogue read hardening assertions"
set +e
CRH_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/catalogue_read_hardening_test.sql 2>&1)"
CRH_RC=$?
set -e
CRH_PASSED="$(echo "$CRH_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$CRH_RC" -ne 0 ]; then
  echo "$CRH_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the catalogue read hardening suite exited with code ${CRH_RC}." >&2
  exit 1
fi
[ "$CRH_PASSED" -ge 150 ] || { echo "$CRH_OUT"; echo "FAIL: catalogue read hardening assertion shortfall: $CRH_PASSED (floor 150)" >&2; exit 1; }
echo "    ok  $CRH_PASSED catalogue read hardening assertions passed"
psql_q -d "$TEST_DB" -f supabase/rollback/20270101090000_catalogue_read_hardening_rollback.sql >/dev/null
crh_back="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual='true' AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles))")"
[ "$crh_back" = "43" ] || { echo "FAIL: 20270101090000 rollback left $crh_back USING (true) catalogue reads (expected 43; scenario/config hardening remains)"; exit 1; }
echo "    ok  rollback restores the catalogue state with scenario/config hardening retained (43 USING (true) catalogue reads, write grants back)"
set +e
CRH_NC="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/catalogue_read_hardening_test.sql 2>&1)"
CRH_NC_RC=$?
set -e
if [ "$CRH_NC_RC" -eq 0 ] || ! echo "$CRH_NC" | grep -q "ASSERTION FAILED"; then
  echo "FAIL: the catalogue read hardening suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite fails on an assertion without the migration (negative control)"
psql_q -d "$TEST_DB" -f supabase/migrations/20270101090000_catalogue_read_hardening.sql >/dev/null
echo "    ok  catalogue read hardening migration re-applied (postflight proved)"

# P0 20261228090000: an answer's option must belong to the item it answers.
# The suite reproduces the exploit on the pre-fix state itself (OO0), then
# proves the fix. Negative controls, each of which MUST make the suite fail on
# an assertion:
#   NC1  the real rollback (both layers gone)          -> a foreign option is accepted
#   NC2  only the save-path check removed, keys kept   -> the refusal is no longer the ownership refusal
#   NC3  only the composite keys removed, check kept   -> the owner can store a mismatched row
# Then the migration is re-applied with its postflight and the suite passes again.
run_p0_option_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_response_option_ownership_test.sql 2>&1
}
echo "==> Running P0 response option ownership assertions"
set +e
P0O_OUT="$(run_p0_option_suite)"; P0O_RC=$?
set -e
P0O_PASSED="$(echo "$P0O_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$P0O_RC" -ne 0 ]; then
  echo "$P0O_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the P0 response option ownership suite exited with code ${P0O_RC}." >&2
  exit 1
fi
[ "$P0O_PASSED" -ge 45 ] || { echo "$P0O_OUT"; echo "FAIL: P0 option ownership assertion shortfall: $P0O_PASSED (floor 45)" >&2; exit 1; }
echo "    ok  $P0O_PASSED P0 option ownership assertions passed (exploit reproduced pre-fix, refused post-fix)"
p0_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_p0_option_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: P0 negative control '${label}': the suite PASSED with the ownership validation removed -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: OO[0-9.]*' | head -1))"
}
psql_q -d "$TEST_DB" -f supabase/rollback/20261228090000_scp_response_option_ownership_rollback.sql >/dev/null
p0_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20261228090000_scp_response_option_ownership.sql >/dev/null
psql_q -d "$TEST_DB" -c "CREATE OR REPLACE FUNCTION public.scp_save_response(_attempt_id uuid, _item_version_id uuid, _selected_option_id uuid DEFAULT NULL, _best_option_id uuid DEFAULT NULL, _worst_option_id uuid DEFAULT NULL, _response_text text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS \$f\$ DECLARE _status text; _form_id uuid; _id uuid; BEGIN SELECT a.status, a.form_id INTO _status, _form_id FROM public.scp_attempts a JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id WHERE a.id = _attempt_id AND si.user_id = auth.uid(); IF _form_id IS NULL THEN RAISE EXCEPTION 'SCP_ATTEMPT_NOT_YOURS' USING ERRCODE = 'insufficient_privilege'; END IF; IF _status <> 'in_progress' THEN RAISE EXCEPTION 'SCP_ATTEMPT_NOT_OPEN' USING ERRCODE = 'check_violation'; END IF; IF NOT EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id = _form_id AND item_version_id = _item_version_id) THEN RAISE EXCEPTION 'SCP_ITEM_NOT_ON_FORM' USING ERRCODE = 'check_violation'; END IF; INSERT INTO public.scp_candidate_responses (attempt_id, item_version_id, selected_option_id, best_option_id, worst_option_id, response_text) VALUES (_attempt_id, _item_version_id, _selected_option_id, _best_option_id, _worst_option_id, nullif(btrim(coalesce(_response_text,'')), '')) ON CONFLICT (attempt_id, item_version_id) DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id, best_option_id = EXCLUDED.best_option_id, worst_option_id = EXCLUDED.worst_option_id, response_text = EXCLUDED.response_text, responded_at = now() RETURNING id INTO _id; RETURN _id; END; \$f\$;" >/dev/null
p0_nc_expect_fail "NC2 save-path ownership check removed"
psql_q -d "$TEST_DB" -f supabase/rollback/20261228090000_scp_response_option_ownership_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20261228090000_scp_response_option_ownership.sql >/dev/null
psql_q -d "$TEST_DB" -c "ALTER TABLE public.scp_candidate_responses DROP CONSTRAINT scp_candidate_responses_selected_option_on_item_fkey, DROP CONSTRAINT scp_candidate_responses_best_option_on_item_fkey, DROP CONSTRAINT scp_candidate_responses_worst_option_on_item_fkey;" >/dev/null
p0_nc_expect_fail "NC3 composite item-option keys removed"
psql_q -d "$TEST_DB" -f supabase/rollback/20261228090000_scp_response_option_ownership_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20261228090000_scp_response_option_ownership.sql >/dev/null
set +e
P0O_OUT="$(run_p0_option_suite)"; P0O_RC=$?
set -e
[ "$P0O_RC" -eq 0 ] || { echo "$P0O_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: P0 suite does not pass after rollback and re-apply" >&2; exit 1; }
echo "    ok  P0 migration re-applied after rollback (postflight proved); suite passes again"

# 20261229090000: the delivery payload must not carry the answer key. The suite
# reproduces the leak on the pre-fix body itself (DK0). Negative controls, each
# of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (option_key served again)       -> DK1.2
#   NC2  the seeding helper reduced to a no-op               -> DK3.x
run_dk_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_delivery_answer_key_test.sql 2>&1
}
dk_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_dk_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: delivery answer-key negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: DK[0-9.]*' | head -1))"
}
echo "==> Running delivery answer-key assertions"
set +e
DK_OUT="$(run_dk_suite)"; DK_RC=$?
set -e
DK_PASSED="$(echo "$DK_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$DK_RC" -ne 0 ]; then
  echo "$DK_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the delivery answer-key suite exited with code ${DK_RC}." >&2
  exit 1
fi
[ "$DK_PASSED" -ge 20 ] || { echo "$DK_OUT"; echo "FAIL: delivery answer-key assertion shortfall: $DK_PASSED (floor 20)" >&2; exit 1; }
echo "    ok  $DK_PASSED delivery answer-key assertions passed (leak reproduced pre-fix, closed post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20261229090000_scp_delivery_answer_key_leak_rollback.sql >/dev/null
dk_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20261229090000_scp_delivery_answer_key_leak.sql >/dev/null
psql_q -d "$TEST_DB" -c "CREATE OR REPLACE FUNCTION public.scp_seed_unanswered_legacy_attempts() RETURNS integer LANGUAGE sql AS 'SELECT 0';" >/dev/null
dk_nc_expect_fail "NC2 seeding helper is a no-op"
psql_q -d "$TEST_DB" -f supabase/rollback/20261229090000_scp_delivery_answer_key_leak_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20261229090000_scp_delivery_answer_key_leak.sql >/dev/null
set +e
DK_OUT="$(run_dk_suite)"; DK_RC=$?
set -e
[ "$DK_RC" -eq 0 ] || { echo "$DK_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: delivery answer-key suite does not pass after rollback and re-apply" >&2; exit 1; }
echo "    ok  delivery answer-key migration re-applied after rollback (postflight proved); suite passes again"

# 20261230090000: a candidate creates their own application in its initial
# state only (P1-1, P1-2). The suite reproduces the forged hired application,
# the employer-note injection, the composed CV snapshot and the foreign CV path
# on the pre-fix boundary itself (JA0). Negative controls, each of which MUST
# make the suite fail on an assertion:
#   NC1  the real rollback (any field, any path)              -> JA2.x
#   NC2  the original row check, column grants kept           -> JA3.x
#   NC3  the row check without the CqrityJob snapshot rule    -> JA4.1
run_ja_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/job_application_insert_boundary_test.sql 2>&1
}
ja_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ja_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: application insert-boundary negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: JA[0-9.]*' | head -1))"
}
ja_plant_policy() {
  psql_q -d "$TEST_DB" -c "DROP POLICY job_applications_owner_insert ON public.job_applications; CREATE POLICY job_applications_owner_insert ON public.job_applications FOR INSERT TO authenticated WITH CHECK ($1);" >/dev/null
}
echo "==> Running application insert-boundary assertions"
set +e
JA_OUT="$(run_ja_suite)"; JA_RC=$?
set -e
JA_PASSED="$(echo "$JA_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$JA_RC" -ne 0 ]; then
  echo "$JA_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the application insert-boundary suite exited with code ${JA_RC}." >&2
  exit 1
fi
[ "$JA_PASSED" -ge 44 ] || { echo "$JA_OUT"; echo "FAIL: application insert-boundary assertion shortfall: $JA_PASSED (floor 44)" >&2; exit 1; }
echo "    ok  $JA_PASSED application insert-boundary assertions passed (forgery reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql >/dev/null
ja_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20261230090000_job_application_insert_boundary.sql >/dev/null
ja_plant_policy "applicant_user_id = auth.uid()"
ja_nc_expect_fail "NC2 original row check, column grants kept"
ja_plant_policy "applicant_user_id = auth.uid() AND status = 'submitted' AND employer_note IS NULL AND withdrawn_at IS NULL AND created_at = now() AND updated_at = now() AND (cv_storage_path IS NULL OR (cv_storage_path ~ ('^' || auth.uid()::text || '/' || id::text || '/[A-Za-z0-9._-]{1,120}\$') AND split_part(cv_storage_path, '/', 3) !~ '^\\.+\$'))"
ja_nc_expect_fail "NC3 no CqrityJob snapshot rule"
psql_q -d "$TEST_DB" -f supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20261230090000_job_application_insert_boundary.sql >/dev/null
set +e
JA_OUT="$(run_ja_suite)"; JA_RC=$?
set -e
[ "$JA_RC" -eq 0 ] || { echo "$JA_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: application insert-boundary suite does not pass after rollback and re-apply" >&2; exit 1; }
echo "    ok  application insert-boundary migration re-applied after rollback (postflight proved); suite passes again"
# The job-board suites below need the FINAL schema -- in particular the insert
# boundary (20261230090000) the CV suite's CV4.x assertions rely on -- so they
# run here, straight after it. Further down this script walks the CV state back
# to phase 1 for the historical suites.
# ---------------------------------------------------------------------------
# 20270130090000 / 20270131090000 / 20270201090000: the job-board launch-readiness
# database corrections. Each suite reproduces its defect on the pre-fix state
# ITSELF (the real rollback, inside a savepoint: NE0 / PW0 / CV0), then proves
# the fix and every legitimate path. Negative controls, each of which MUST make
# its suite fail on an assertion:
#   PW NC1  the real rollback of 20270131090000        -> PW1.1
#   PW NC2  only the expires_at rule disabled          -> PW1.1
#   PW NC3  only the address rules disabled            -> PW3.1
#   NE NC1  the real rollback of 20270130090000        -> NE1.1
#   NE NC2  the refusal narrowed to one column         -> NE1.2
#   NE NC3  the refusal applied to every role          -> NE5.1
#   CV NC1  the real rollback of 20270201090000        -> CV1.1
#   CV NC2  only the applicant INSERT policy back      -> CV1.1
#   CV NC3  applicant SELECT + DELETE policies back    -> CV1.4
# The two jobs migrations re-declare ONE function, in order: rolling the first
# back also takes the second's rules with it, so the second is re-applied after
# every control of the first and the chain ends exactly as it was replayed.
jb_run_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "supabase/tests/$1" 2>&1
}
jb_nc_expect_fail() {
  local label="$1" suite="$2" prefix="$3"
  set +e
  local out; out="$(jb_run_suite "$suite")"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: job-board negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o "ASSERTION FAILED: ${prefix}[0-9.]*" | head -1))"
}
jb_expect_pass() {
  local label="$1" suite="$2" floor="$3"
  set +e
  local out; out="$(jb_run_suite "$suite")"; local rc=$?
  set -e
  local passed; passed="$(echo "$out" | grep -c "NOTICE:  ok  " || true)"
  if [ "$rc" -ne 0 ]; then
    echo "$out" | grep -E "ERROR|FAILED" >&2 || true
    echo "FAIL: the ${label} suite exited with code ${rc}." >&2
    exit 1
  fi
  [ "$passed" -ge "$floor" ] || { echo "$out"; echo "FAIL: ${label} assertion shortfall: $passed (floor $floor)" >&2; exit 1; }
  echo "    ok  $passed ${label} assertions passed (defect reproduced pre-fix, refused post-fix)"
}
JB_NE_MIG=supabase/migrations/20270130090000_jobs_not_editable_in_place.sql
JB_NE_RB=supabase/rollback/20270130090000_jobs_not_editable_in_place_rollback.sql
JB_PW_MIG=supabase/migrations/20270131090000_jobs_publish_window_and_url_scheme.sql
JB_PW_RB=supabase/rollback/20270131090000_jobs_publish_window_and_url_scheme_rollback.sql
JB_CV_MIG=supabase/migrations/20270201090000_job_cvs_no_client_writes.sql
JB_CV_RB=supabase/rollback/20270201090000_job_cvs_no_client_writes_rollback.sql

echo "==> Running job-board launch-readiness assertions (in-place edits, publication window, CV bucket)"
jb_expect_pass "jobs not editable in place" jobs_not_editable_in_place_test.sql 42
jb_expect_pass "publication window and address" jobs_publish_window_and_url_scheme_test.sql 40
jb_expect_pass "CV bucket client writes" job_cvs_no_client_writes_test.sql 22

# 20270131090000 first (it sits on top of 20270130090000).
psql_q -d "$TEST_DB" -f "$JB_PW_RB" >/dev/null
jb_nc_expect_fail "PW NC1 full rollback" jobs_publish_window_and_url_scheme_test.sql PW
psql_q -d "$TEST_DB" -f "$JB_PW_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "$(sed 's/AND NEW.expires_at <= now() THEN/AND false THEN/' "$JB_PW_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
jb_nc_expect_fail "PW NC2 expires_at rule disabled" jobs_publish_window_and_url_scheme_test.sql PW
psql_q -d "$TEST_DB" -f "$JB_PW_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "$(sed "s/'\^https?:\/\/\[\^\/?#\[:space:\]\]+'/'^'/g" "$JB_PW_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
jb_nc_expect_fail "PW NC3 address rules disabled" jobs_publish_window_and_url_scheme_test.sql PW
psql_q -d "$TEST_DB" -f "$JB_PW_MIG" >/dev/null

# 20270130090000: its rollback restores the 20260906100000 body, which has no
# rule of the second migration either -- so the second is applied again below.
psql_q -d "$TEST_DB" -f "$JB_NE_RB" >/dev/null
jb_nc_expect_fail "NE NC1 full rollback" jobs_not_editable_in_place_test.sql NE
psql_q -d "$TEST_DB" -f "$JB_NE_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "$(sed "s/(to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at')/NEW.title_sv IS DISTINCT FROM OLD.title_sv/" "$JB_NE_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
jb_nc_expect_fail "NE NC2 refusal narrowed to one column" jobs_not_editable_in_place_test.sql NE
psql_q -d "$TEST_DB" -c "$(sed "s/current_user IN ('authenticated', 'anon')/true/" "$JB_NE_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
jb_nc_expect_fail "NE NC3 refusal applied to every role" jobs_not_editable_in_place_test.sql NE
psql_q -d "$TEST_DB" -f "$JB_NE_MIG" >/dev/null
psql_q -d "$TEST_DB" -f "$JB_PW_MIG" >/dev/null

psql_q -d "$TEST_DB" -f "$JB_CV_RB" >/dev/null
jb_nc_expect_fail "CV NC1 full rollback" job_cvs_no_client_writes_test.sql CV
psql_q -d "$TEST_DB" -f "$JB_CV_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "CREATE POLICY job_cvs_applicant_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-application-cvs' AND auth.uid()::text = (storage.foldername(name))[1]);" >/dev/null
jb_nc_expect_fail "CV NC2 applicant INSERT policy back" job_cvs_no_client_writes_test.sql CV
# A DELETE (or UPDATE) policy alone cannot act on a row its role cannot SELECT, so the
# control restores the pair that makes a stored CV deletable.
psql_q -d "$TEST_DB" -c "DROP POLICY job_cvs_applicant_insert ON storage.objects; CREATE POLICY job_cvs_applicant_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'job-application-cvs' AND auth.uid()::text = (storage.foldername(name))[1]); CREATE POLICY job_cvs_applicant_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'job-application-cvs' AND auth.uid()::text = (storage.foldername(name))[1]);" >/dev/null
jb_nc_expect_fail "CV NC3 applicant SELECT + DELETE policies back" job_cvs_no_client_writes_test.sql CV
psql_q -d "$TEST_DB" -f "$JB_CV_MIG" >/dev/null

jb_expect_pass "jobs not editable in place (after re-apply)" jobs_not_editable_in_place_test.sql 42
jb_expect_pass "publication window and address (after re-apply)" jobs_publish_window_and_url_scheme_test.sql 40
jb_expect_pass "CV bucket client writes (after re-apply)" job_cvs_no_client_writes_test.sql 22
echo "    ok  the three job-board migrations re-applied after every control (postflights proved); suites pass again"

# ---------------------------------------------------------------------------
# 20270205090000: e-mail to the employer on a NEW application (outbox, claim,
# settle, recipients). The suite proves every rule in one transaction; the
# negative controls below each plant ONE defect in the migration's own SQL and
# require the suite to fail on a NAMED assertion; the races use two real
# sessions. The migration is idempotent where the repository's style is, and
# the controls end with the real rollback and a clean re-apply.
#
# Negative controls (each MUST make the suite fail on the named assertion):
#   EN NC1   a client role may execute the claim                     -> EN2.1
#   EN NC2   a client role may read the outbox                       -> EN2.5
#   EN NC3   a plain member is a recipient                           -> EN1.3
#   EN NC4   a suspended or removed member is a recipient            -> EN1.3
#   EN NC5   no cap on the number of recipients                      -> EN1.10
#   EN NC6   enqueue is not set-once (a replay adds the new admin)   -> EN3.4
#   EN NC7   no lease: a held claim is handed to a second worker     -> EN4.6
#   EN NC8   a takeover keeps the previous attempt id                -> EN4.9
#   EN NC9   eligibility is not decided again at the claim           -> EN4.12
#   EN NC10  a sent row is claimed again                             -> EN4.11
#   EN NC11  settle takes a row that is not claimed                  -> EN5.2
#   EN NC12  no cap on attempts                                      -> EN6.4
#   EN NC13  the retention deletes a claimed row                     -> EN8.1
#   EN NC14  the retention ignores its window                        -> EN8.1
#   EN NC15  the retention deletes rows that can still be retried    -> EN8.1
#   EN NC16  a client role may execute the retention                 -> EN2.1
#   EN NC17  the retention accepts a window under a day              -> EN8.6
# ---------------------------------------------------------------------------
EN_MIG=supabase/migrations/20270205090000_employer_new_application_notices.sql
EN_RB=supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql
EN_SUITE=supabase/tests/employer_new_application_notices_test.sql
# Re-applying the migration over itself says "already exists, skipping" for each
# IF NOT EXISTS; those notices are the point of idempotence, not news.
en_psql() { PGOPTIONS='-c client_min_messages=warning' psql_q "$@"; }
en_run_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$EN_SUITE" 2>&1
}
en_nc_expect_fail() {
  local label="$1" expect="$2"
  set +e
  local out; out="$(en_run_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: ${expect} "; then
    echo "FAIL: employer-notice negative control '${label}': the suite did not fail on ${expect} -- it proves nothing" >&2
    echo "$out" | grep -E "ERROR|FAILED" | head -3 >&2 || true
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o "ASSERTION FAILED: ${expect}" | head -1))"
}
# The migration's own SQL with ONE substitution, the postflight cut off. The
# substitution must change the file, or the control proves nothing.
en_plant() {
  local sedexpr="$1" mutated
  mutated="$(sed "$sedexpr" "$EN_MIG" | sed '/^DO \$\$$/,$d')"
  if [ "$mutated" = "$(sed '/^DO \$\$$/,$d' "$EN_MIG")" ]; then
    echo "FAIL: employer-notice negative control anchor not found in the migration: ${sedexpr}" >&2
    exit 1
  fi
  en_psql -d "$TEST_DB" -c "$mutated" >/dev/null
}

echo "==> Running employer new-application notice assertions"
set +e
EN_OUT="$(en_run_suite)"; EN_RC=$?
set -e
EN_PASSED="$(echo "$EN_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$EN_RC" -ne 0 ]; then
  echo "$EN_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the employer-notice suite exited with code ${EN_RC}." >&2
  exit 1
fi
[ "$EN_PASSED" -ge 105 ] || { echo "$EN_OUT"; echo "FAIL: employer-notice assertion shortfall: $EN_PASSED (floor 105)" >&2; exit 1; }
echo "    ok  $EN_PASSED employer-notice assertions passed"

en_plant 's/^GRANT EXECUTE ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text\[\]) TO service_role;/GRANT EXECUTE ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text[]) TO service_role, authenticated;/'
en_nc_expect_fail "NC1 a client role may execute the claim" EN2.1
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/^GRANT SELECT ON TABLE public.recruitment_employer_notices TO service_role;/GRANT SELECT ON TABLE public.recruitment_employer_notices TO service_role, authenticated;/'
en_nc_expect_fail "NC2 a client role may read the outbox" EN2.5
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/WHERE us.role IN ('owner', 'admin')/WHERE true/"
en_nc_expect_fail "NC3 a plain member is a recipient" EN1.3
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/ON m.employer_id = app.employer_id AND m.status = 'active'/ON m.employer_id = app.employer_id/"
en_nc_expect_fail "NC4 a suspended or removed member is a recipient" EN1.3
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/^       LIMIT 10$/       LIMIT 100/'
en_nc_expect_fail "NC5 no cap on recipients" EN1.10
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/IF EXISTS (SELECT 1 FROM public.recruitment_employer_notices n$/IF false AND EXISTS (SELECT 1 FROM public.recruitment_employer_notices n/'
en_nc_expect_fail "NC6 enqueue is not set-once" EN3.4
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/OR (n.status = 'claimed' AND n.claimed_at < now() - interval '3 minutes')/OR (n.status = 'claimed')/"
en_nc_expect_fail "NC7 no lease" EN4.6
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/^           attempt_id = gen_random_uuid(),/           attempt_id = coalesce(n.attempt_id, gen_random_uuid()),/'
en_nc_expect_fail "NC8 a takeover keeps the previous attempt id" EN4.9
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/FROM public.rec_employer_notice_recipients(_n.application_id) r/FROM (SELECT u.id AS recipient_user_id, u.email::text AS recipient_email, 'owner'::text AS via FROM auth.users u) r/"
en_nc_expect_fail "NC9 eligibility is not decided again at the claim" EN4.12
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
# A sent row claimed again: the shape constraint refuses it, so it is taken out
# first -- the control is about the claim's own filter.
en_psql -d "$TEST_DB" -c "ALTER TABLE public.recruitment_employer_notices DROP CONSTRAINT recruitment_employer_notices_shape;" >/dev/null
en_plant "s/(n.status = 'pending' AND n.next_attempt_at <= now())/(n.status IN ('pending', 'sent') AND n.next_attempt_at <= now())/"
en_nc_expect_fail "NC10 a sent row is claimed again" EN4.11
en_psql -d "$TEST_DB" -f "$EN_RB" >/dev/null
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/^  IF _n.status <> 'claimed' THEN$/  IF false THEN/"
en_nc_expect_fail "NC11 settle takes a row that is not claimed" EN5.2
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/^       AND n.attempts < 6$/       AND n.attempts < 600/'
en_nc_expect_fail "NC12 no cap on attempts" EN6.4
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/^            n.status IN ('sent', 'skipped')\$/            n.status IN ('sent', 'skipped', 'claimed')/"
en_nc_expect_fail "NC13 the retention deletes a claimed row" EN8.1
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/WHERE n.settled_at < now() - _older_than/WHERE n.settled_at < now()/'
en_nc_expect_fail "NC14 the retention ignores its window" EN8.1
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/AND (n.attempts >= 6$/AND (true OR n.attempts >= 6/'
en_nc_expect_fail "NC15 the retention deletes rows that can still be retried" EN8.1
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant 's/^GRANT EXECUTE ON FUNCTION public.rec_purge_employer_notices(interval) TO service_role;/GRANT EXECUTE ON FUNCTION public.rec_purge_employer_notices(interval) TO service_role, anon;/'
en_nc_expect_fail "NC16 a client role may execute the retention" EN2.1
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_plant "s/_older_than < interval '1 day'/_older_than < interval '0'/"
en_nc_expect_fail "NC17 the retention accepts a window under a day" EN8.6
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
# The real rollback, then the migration again from nothing, then the suite.
en_psql -d "$TEST_DB" -f "$EN_RB" >/dev/null
en_psql -d "$TEST_DB" -f "$EN_RB" >/dev/null
EN_LEFT="$(psql -tAq -d "$TEST_DB" -c "SELECT (to_regclass('public.recruitment_employer_notices') IS NOT NULL)::int + (SELECT count(*) FROM pg_proc WHERE proname IN ('rec_employer_notice_recipients','rec_enqueue_employer_new_application_notices','rec_claim_employer_notices','rec_settle_employer_notice','rec_employer_notice_backoff','rec_purge_employer_notices'))")"
[ "$EN_LEFT" = "0" ] || { echo "FAIL: the employer-notice rollback left $EN_LEFT object(s) behind" >&2; exit 1; }
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
set +e
EN_OUT="$(en_run_suite)"; EN_RC=$?
set -e
[ "$EN_RC" -eq 0 ] || { echo "$EN_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: the employer-notice suite does not pass after rollback and re-apply" >&2; exit 1; }
echo "    ok  employer-notice migration rolled back clean, applied twice (idempotent), and the suite passes again"

# ---------------------------------------------------------------------------
# The same rules under a REAL race: two sessions, two processes. A holds its
# transaction open (pg_sleep) and B arrives a second later:
#   enqueue   the second waits on the advisory lock and then creates nothing
#   claim     the second takes NOTHING and does not wait (SKIP LOCKED); once
#             the first committed the lease keeps it out as well
#   sweep     the same, across applications
#   settle    the second waits on the row, then finds it already settled
# Committed synthetic fixture, removed afterwards.
# ---------------------------------------------------------------------------
echo "==> Running employer new-application notice races"
ENR_FAILED=0
ENR_APP="ef000000-3333-0000-0000-000000000001"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('ef000000-0000-0000-0000-00000000000a', 'enr-owner@race.test',  now(), '{"display_name":"Race Owner"}'::jsonb),
  ('ef000000-0000-0000-0000-0000000000a1', 'enr-admin1@race.test', now(), '{"display_name":"Race Admin 1"}'::jsonb),
  ('ef000000-0000-0000-0000-0000000000a2', 'enr-admin2@race.test', now(), '{"display_name":"Race Admin 2"}'::jsonb),
  ('ef000000-0000-0000-0000-0000000000ad', 'enr-mod@race.test',    now(), '{"display_name":"Race Mod"}'::jsonb),
  ('ef000000-0000-0000-0000-000000000c01', 'enr-cand@race.test',   now(), '{"display_name":"Race Kandidat"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('ef000000-0000-0000-0000-0000000000ad', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO public.employers (id, name, slug, status)
VALUES ('ef000000-1111-0000-0000-00000000000a', 'Race Notis AB', 'race-notis-ab', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('ef000000-1111-0000-0000-00000000000a', 'ef000000-0000-0000-0000-00000000000a', 'owner', 'active'),
  ('ef000000-1111-0000-0000-00000000000a', 'ef000000-0000-0000-0000-0000000000a1', 'admin', 'active'),
  ('ef000000-1111-0000-0000-00000000000a', 'ef000000-0000-0000-0000-0000000000a2', 'admin', 'active')
ON CONFLICT DO NOTHING;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
VALUES ('ef000000-2222-0000-0000-000000000001', 'enr-race-job', 'ENR0001', 'ef000000-1111-0000-0000-00000000000a', 'Väktare, Race', 'Guard, Race', 'internal', 'draft');
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-0000000000ad', true);
SET LOCAL ROLE authenticated;
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day', expires_at = now() + interval '30 days'
 WHERE id = 'ef000000-2222-0000-0000-000000000001';
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-000000000c01', true);
SET LOCAL ROLE authenticated;
SELECT public.rec_submit_application('ef000000-3333-0000-0000-000000000001', 'ef000000-2222-0000-0000-000000000001',
  NULL, NULL, 'ef000000-0000-0000-0000-000000000c01/ef000000-3333-0000-0000-000000000001/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb);
COMMIT;
SQL
ENR_HAS="$(psql -tAq -d "$TEST_DB" -c "SELECT count(*) FROM public.job_applications WHERE id='${ENR_APP}'")"
if [ "$ENR_HAS" != "1" ]; then
  echo "FAIL: the notice race fixture did not get its application (got '${ENR_HAS}')." >&2
  suite_failed "employer notice race fixture"
fi

ENR_A="$(mktemp)"; ENR_B="$(mktemp)"; ENR_AO="$(mktemp)"; ENR_BO="$(mktemp)"
# Two sessions, A first; B starts a second later. Prints B's wait in ms.
enr_race() {
  local a_sql="$1" b_sql="$2"
  printf 'BEGIN;\nSET LOCAL ROLE service_role;\n%s\nSELECT pg_sleep(2);\nCOMMIT;\n' "$a_sql" > "$ENR_A"
  printf "SELECT 'T0=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;\nBEGIN;\nSET LOCAL ROLE service_role;\n%s\nCOMMIT;\nSELECT 'T1=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;\n" "$b_sql" > "$ENR_B"
  psql -tAq -d "$TEST_DB" -f "$ENR_A" > "$ENR_AO" 2>&1 &
  local pid=$!
  sleep 1
  psql -tAq -d "$TEST_DB" -f "$ENR_B" > "$ENR_BO" 2>&1
  wait "$pid" || true
  local t0 t1
  t0="$(grep -oE 'T0=[0-9]+' "$ENR_BO" | cut -d= -f2 || true)"
  t1="$(grep -oE 'T1=[0-9]+' "$ENR_BO" | cut -d= -f2 || true)"
  ENR_B_MS=$(( ${t1:-0} - ${t0:-0} ))
}

# 1. enqueue under a race
enr_race "SELECT 'N=' || public.rec_enqueue_employer_new_application_notices('${ENR_APP}');" \
         "SELECT 'N=' || public.rec_enqueue_employer_new_application_notices('${ENR_APP}');"
ENR_A_N="$(grep -oE 'N=[0-9]+' "$ENR_AO" | head -1 | cut -d= -f2 || true)"
ENR_B_N="$(grep -oE 'N=[0-9]+' "$ENR_BO" | head -1 | cut -d= -f2 || true)"
ENR_ROWS="$(psql -tAq -d "$TEST_DB" -c "SELECT count(*) FROM public.recruitment_employer_notices WHERE application_id='${ENR_APP}'")"
if [ "$ENR_A_N" != "3" ] || [ "$ENR_B_N" != "0" ] || [ "$ENR_ROWS" != "3" ]; then
  echo "FAIL: two concurrent enqueues created ${ENR_A_N:-?} and ${ENR_B_N:-?} notices (${ENR_ROWS} rows); expected 3, 0 and 3 rows." >&2
  head -5 "$ENR_AO" "$ENR_BO" >&2
  ENR_FAILED=1
else
  echo "    ok  two concurrent enqueues: the first queued three notices, the second none (three rows)"
fi
if [ "$ENR_B_MS" -lt 800 ]; then
  echo "FAIL: the second enqueue answered after ${ENR_B_MS} ms; it did not wait on the first, so this was not a race." >&2
  ENR_FAILED=1
else
  echo "    ok  the second enqueue WAITED for the first (${ENR_B_MS} ms) and then found its rows"
fi

# 2. claim under a race
enr_race "SELECT 'C=' || count(*) FROM public.rec_claim_employer_notices('${ENR_APP}');" \
         "SELECT 'C=' || count(*) FROM public.rec_claim_employer_notices('${ENR_APP}');"
ENR_A_C="$(grep -oE 'C=[0-9]+' "$ENR_AO" | head -1 | cut -d= -f2 || true)"
ENR_B_C="$(grep -oE 'C=[0-9]+' "$ENR_BO" | head -1 | cut -d= -f2 || true)"
ENR_CLAIMED="$(psql -tAq -d "$TEST_DB" -c "SELECT count(*) || '/' || count(DISTINCT attempt_id) || '/' || coalesce(max(attempts), 0) FROM public.recruitment_employer_notices WHERE application_id='${ENR_APP}' AND status='claimed'")"
if [ "$ENR_A_C" != "3" ] || [ "$ENR_B_C" != "0" ] || [ "$ENR_CLAIMED" != "3/3/1" ]; then
  echo "FAIL: two concurrent claims took ${ENR_A_C:-?} and ${ENR_B_C:-?} notices (claimed/attempt ids/attempts ${ENR_CLAIMED}); expected 3 and 0, 3/3/1." >&2
  head -5 "$ENR_AO" "$ENR_BO" >&2
  ENR_FAILED=1
else
  echo "    ok  two concurrent claims: the first took all three, the second took none (one attempt each)"
fi
if [ "$ENR_B_MS" -ge 1500 ]; then
  echo "FAIL: the second claim waited ${ENR_B_MS} ms on the first; SKIP LOCKED should have let it pass at once." >&2
  ENR_FAILED=1
else
  echo "    ok  and the second claim did not wait for the first (${ENR_B_MS} ms)"
fi
ENR_LATER="$(psql -tAq -d "$TEST_DB" -c "BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.rec_claim_employer_notices('${ENR_APP}'); COMMIT;" | grep -E '^[0-9]+$' | head -1)"
if [ "$ENR_LATER" != "0" ]; then
  echo "FAIL: a claim after the first committed took ${ENR_LATER} notice(s) that were already leased." >&2
  ENR_FAILED=1
else
  echo "    ok  a claim after the first committed gets nothing: the lease holds"
fi

# 3. sweep under a race
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "UPDATE public.recruitment_employer_notices SET status='pending', attempts=0, attempt_id=NULL, claimed_at=NULL WHERE application_id='${ENR_APP}'" >/dev/null
enr_race "SELECT 'C=' || count(*) FROM public.rec_claim_employer_notices(NULL, 50);" \
         "SELECT 'C=' || count(*) FROM public.rec_claim_employer_notices(NULL, 50);"
ENR_A_C="$(grep -oE 'C=[0-9]+' "$ENR_AO" | head -1 | cut -d= -f2 || true)"
ENR_B_C="$(grep -oE 'C=[0-9]+' "$ENR_BO" | head -1 | cut -d= -f2 || true)"
if [ "$ENR_A_C" != "3" ] || [ "$ENR_B_C" != "0" ] || [ "$ENR_B_MS" -ge 1500 ]; then
  echo "FAIL: two concurrent sweeps took ${ENR_A_C:-?} and ${ENR_B_C:-?} notices, the second after ${ENR_B_MS} ms; expected 3, 0 and no waiting." >&2
  head -5 "$ENR_AO" "$ENR_BO" >&2
  ENR_FAILED=1
else
  echo "    ok  two concurrent sweeps: the first took the three due notices, the second took nothing and did not wait (${ENR_B_MS} ms)"
fi

# 4. settle under a race: A settles "sent" and holds, B settles "failed"
ENR_ATT="$(psql -tAq -d "$TEST_DB" -c "SELECT attempt_id FROM public.recruitment_employer_notices WHERE application_id='${ENR_APP}' AND status='claimed' ORDER BY id LIMIT 1")"
enr_race "SELECT 'S=' || public.rec_settle_employer_notice('${ENR_ATT}', 'sent', 200);" \
         "SELECT 'S=' || public.rec_settle_employer_notice('${ENR_ATT}', 'failed', 500);"
ENR_A_S="$(grep -oE 'S=[a-z_]+' "$ENR_AO" | head -1 | cut -d= -f2 || true)"
ENR_B_S="$(grep -oE 'S=[a-z_]+' "$ENR_BO" | head -1 | cut -d= -f2 || true)"
ENR_SETTLED="$(psql -tAq -d "$TEST_DB" -c "SELECT status || '/' || last_status FROM public.recruitment_employer_notices WHERE attempt_id='${ENR_ATT}'")"
if [ "$ENR_A_S" != "sent" ] || [ "$ENR_B_S" != "sent" ] || [ "$ENR_SETTLED" != "sent/200" ] || [ "$ENR_B_MS" -lt 800 ]; then
  echo "FAIL: two concurrent settles answered '${ENR_A_S}' and '${ENR_B_S}' (row '${ENR_SETTLED}', second after ${ENR_B_MS} ms); expected sent, sent, sent/200 and a wait." >&2
  head -5 "$ENR_AO" "$ENR_BO" >&2
  ENR_FAILED=1
else
  echo "    ok  two concurrent settles: the second waited (${ENR_B_MS} ms), found the row already sent and changed nothing"
fi
rm -f "$ENR_A" "$ENR_B" "$ENR_AO" "$ENR_BO"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
DELETE FROM public.recruitment_employer_notices WHERE application_id = 'ef000000-3333-0000-0000-000000000001';
DELETE FROM public.job_applications WHERE id = 'ef000000-3333-0000-0000-000000000001';
DELETE FROM public.jobs WHERE id = 'ef000000-2222-0000-0000-000000000001';
DELETE FROM public.employers WHERE id = 'ef000000-1111-0000-0000-00000000000a';
DELETE FROM auth.users WHERE id IN ('ef000000-0000-0000-0000-000000000c01', 'ef000000-0000-0000-0000-0000000000ad',
  'ef000000-0000-0000-0000-0000000000a2', 'ef000000-0000-0000-0000-0000000000a1', 'ef000000-0000-0000-0000-00000000000a');
SQL
if [ "$ENR_FAILED" -ne 0 ]; then
  suite_failed "employer new-application notice races"
fi
# 20261231090000: only the assignment path may bind an employment record to a
# person (P1-3). The suite reproduces a non-member binding another employer's
# employee on the pre-fix grant itself (RB0). Negative controls, each of which
# MUST make the suite fail on an assertion:
#   NC1  the real rollback (authenticated granted again)   -> RB1.1
#   NC2  the grant given back through PUBLIC                -> RB1.1
run_rb_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_resolve_employment_owner_only_test.sql 2>&1
}
rb_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_rb_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: employment-binding negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: RB[0-9.]*' | head -1))"
}
echo "==> Running employment-binding helper assertions"
set +e
RB_OUT="$(run_rb_suite)"; RB_RC=$?
set -e
RB_PASSED="$(echo "$RB_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$RB_RC" -ne 0 ]; then
  echo "$RB_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the employment-binding suite exited with code ${RB_RC}." >&2
  exit 1
fi
[ "$RB_PASSED" -ge 13 ] || { echo "$RB_OUT"; echo "FAIL: employment-binding assertion shortfall: $RB_PASSED (floor 13)" >&2; exit 1; }
echo "    ok  $RB_PASSED employment-binding assertions passed (binding reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20261231090000_scp_resolve_employment_owner_only_rollback.sql >/dev/null
rb_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20261231090000_scp_resolve_employment_owner_only.sql >/dev/null
psql_q -d "$TEST_DB" -c "GRANT EXECUTE ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) TO PUBLIC;" >/dev/null
rb_nc_expect_fail "NC2 granted back through PUBLIC"
psql_q -d "$TEST_DB" -f supabase/migrations/20261231090000_scp_resolve_employment_owner_only.sql >/dev/null
set +e
RB_OUT="$(run_rb_suite)"; RB_RC=$?
set -e
[ "$RB_RC" -eq 0 ] || { echo "$RB_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: employment-binding suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  employment-binding migration re-applied (postflight proved); suite passes again"
# 20270103090000: only an assessment run is scored by scp_submit_attempt
# (P1-1 of the 2026-10-02 audit). The suite reproduces a learning run scored
# as full-credit assessment evidence on the pre-fix body itself (SA0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (any run of the caller's is scored)          -> SA1.1
#   NC2  only an employer-less learning run is refused (training runs
#        under an employer still score)                                  -> SA2.1
run_sa_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_submit_assessment_only_test.sql 2>&1
}
sa_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_sa_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: assessment-only negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: SA[0-9.]*' | head -1))"
}
echo "==> Running assessment-only submission assertions"
set +e
SA_OUT="$(run_sa_suite)"; SA_RC=$?
set -e
SA_PASSED="$(echo "$SA_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$SA_RC" -ne 0 ]; then
  echo "$SA_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the assessment-only suite exited with code ${SA_RC}." >&2
  exit 1
fi
[ "$SA_PASSED" -ge 25 ] || { echo "$SA_OUT"; echo "FAIL: assessment-only assertion shortfall: $SA_PASSED (floor 25)" >&2; exit 1; }
echo "    ok  $SA_PASSED assessment-only assertions passed (learning run scored pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20270103090000_scp_submit_assessment_only_rollback.sql >/dev/null
sa_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270103090000_scp_submit_assessment_only.sql >/dev/null
SA_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION/,/^END; \$function\$/p' supabase/migrations/20270103090000_scp_submit_assessment_only.sql \
  | sed "s/IF _a.mode IS DISTINCT FROM 'assessment' THEN/IF _a.mode = 'learning' AND _a.issuer_organization_id IS NULL THEN/")"
echo "$SA_NC2_SQL" | grep -q "_a.issuer_organization_id IS NULL THEN" || { echo "FAIL: assessment-only NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$SA_NC2_SQL" >/dev/null
sa_nc_expect_fail "NC2 employer learning runs still scored"
psql_q -d "$TEST_DB" -f supabase/migrations/20270103090000_scp_submit_assessment_only.sql >/dev/null
set +e
SA_OUT="$(run_sa_suite)"; SA_RC=$?
set -e
[ "$SA_RC" -eq 0 ] || { echo "$SA_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: assessment-only suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  assessment-only migration re-applied (postflight proved); suite passes again"

# 20270102090000: the progress series shows an employer only its own
# organisation's reports (P0-1 of the 2026-10-02 audit). The suite reproduces
# the cross-employer read on the pre-fix body itself (PS0). Negative controls,
# each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (every employer report of the subject)   -> PS1.1
#   NC2  scoped by organisation but ignoring membership status       -> PS4.1
run_ps_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_subject_progress_scope_test.sql 2>&1
}
ps_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ps_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: progress-scope negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: PS[0-9.]*' | head -1))"
}
echo "==> Running progress-series employer scope assertions"
set +e
PS_OUT="$(run_ps_suite)"; PS_RC=$?
set -e
PS_PASSED="$(echo "$PS_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$PS_RC" -ne 0 ]; then
  echo "$PS_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the progress-scope suite exited with code ${PS_RC}." >&2
  exit 1
fi
[ "$PS_PASSED" -ge 12 ] || { echo "$PS_OUT"; echo "FAIL: progress-scope assertion shortfall: $PS_PASSED (floor 12)" >&2; exit 1; }
echo "    ok  $PS_PASSED progress-scope assertions passed (cross-employer read reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20270102090000_scp_subject_progress_employer_scope_rollback.sql >/dev/null
ps_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270102090000_scp_subject_progress_employer_scope.sql >/dev/null
PS_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION/,/^\$function\$;/p' supabase/migrations/20270102090000_scp_subject_progress_employer_scope.sql \
  | sed "s/AND public.scp_report_snapshot_readable(s.audience, s.subject_id, s.issuer_organization_id)/AND (s.audience = 'participant' OR EXISTS (SELECT 1 FROM public.employer_memberships mm WHERE mm.employer_id = s.issuer_organization_id AND mm.user_id = auth.uid()))/")"
echo "$PS_NC2_SQL" | grep -q "mm.user_id = auth.uid()" || { echo "FAIL: progress-scope NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$PS_NC2_SQL" >/dev/null
ps_nc_expect_fail "NC2 membership status ignored"
psql_q -d "$TEST_DB" -f supabase/migrations/20270102090000_scp_subject_progress_employer_scope.sql >/dev/null
set +e
PS_OUT="$(run_ps_suite)"; PS_RC=$?
set -e
[ "$PS_RC" -eq 0 ] || { echo "$PS_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: progress-scope suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  progress-scope migration re-applied (postflight proved); suite passes again"
# 20270104090000: development recommendations show an employer only what its
# own evidence supports (P1-2 of the 2026-10-02 audit). The suite reproduces
# the cross-employer derivation on the pre-fix body itself (DR0). Negative
# controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (rows and levels from every employer's evidence) -> DR1.1
#   NC2  rows scoped to the caller's evidence, levels still over all of it  -> DR1.2
run_dr_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_development_recommendations_scope_test.sql 2>&1
}
dr_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_dr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: recommendations-scope negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: DR[0-9.]*' | head -1))"
}
echo "==> Running development-recommendations employer scope assertions"
set +e
DR_OUT="$(run_dr_suite)"; DR_RC=$?
set -e
DR_PASSED="$(echo "$DR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$DR_RC" -ne 0 ]; then
  echo "$DR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the recommendations-scope suite exited with code ${DR_RC}." >&2
  exit 1
fi
[ "$DR_PASSED" -ge 16 ] || { echo "$DR_OUT"; echo "FAIL: recommendations-scope assertion shortfall: $DR_PASSED (floor 16)" >&2; exit 1; }
echo "    ok  $DR_PASSED recommendations-scope assertions passed (cross-employer derivation reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20270104090000_scp_development_recommendations_employer_scope_rollback.sql >/dev/null
# The suite calls the helper by name (DR3.3, DR4.4); restore it alone so NC1
# fails on behaviour, not on a missing function.
psql_q -d "$TEST_DB" -c "$(sed -n '/^CREATE OR REPLACE FUNCTION public.scp_compute_maturity_for_issuers/,/^\$function\$$/p' supabase/migrations/20270104090000_scp_development_recommendations_employer_scope.sql)" >/dev/null
psql_q -d "$TEST_DB" -c "REVOKE ALL ON FUNCTION public.scp_compute_maturity_for_issuers(uuid, uuid, text, timestamp with time zone, uuid[]) FROM PUBLIC, anon, authenticated" >/dev/null
dr_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270104090000_scp_development_recommendations_employer_scope.sql >/dev/null
DR_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.scp_development_recommendations/,/^END; \$function\$/p' supabase/migrations/20270104090000_scp_development_recommendations_employer_scope.sql \
  | sed "s/ELSE public.scp_compute_maturity_for_issuers(_subject_id, cv.id, 'v1', now(), _issuers)/ELSE public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())/")"
grep -qF 'END; $function$' <<<"$DR_NC2_SQL" && ! grep -q "scp_compute_maturity_for_issuers" <<<"$DR_NC2_SQL" \
  || { echo "FAIL: recommendations-scope NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$DR_NC2_SQL" >/dev/null
dr_nc_expect_fail "NC2 levels still over every employer's evidence"
psql_q -d "$TEST_DB" -f supabase/migrations/20270104090000_scp_development_recommendations_employer_scope.sql >/dev/null
set +e
DR_OUT="$(run_dr_suite)"; DR_RC=$?
set -e
[ "$DR_RC" -eq 0 ] || { echo "$DR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: recommendations-scope suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  recommendations-scope migration re-applied (postflight proved); suite passes again"
# 20270105090000: a suspended employer reads no applicant through the definer
# functions (P1-3 of the 2026-10-02 audit). The suite reproduces the read on
# the pre-fix bodies itself (SE0). Negative controls, each of which MUST make
# the suite fail on an assertion:
#   NC1  the real rollback (membership checked, organisation not)       -> SE1.1
#   NC2  a deny-list: only a 'suspended' organisation is refused         -> SE2
run_se_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/suspended_employer_applicant_reads_test.sql 2>&1
}
se_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_se_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: suspended-employer negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: SE[0-9.]*' | head -1))"
}
echo "==> Running suspended-employer applicant read assertions"
set +e
SE_OUT="$(run_se_suite)"; SE_RC=$?
set -e
SE_PASSED="$(echo "$SE_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$SE_RC" -ne 0 ]; then
  echo "$SE_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the suspended-employer suite exited with code ${SE_RC}." >&2
  exit 1
fi
[ "$SE_PASSED" -ge 18 ] || { echo "$SE_OUT"; echo "FAIL: suspended-employer assertion shortfall: $SE_PASSED (floor 18)" >&2; exit 1; }
echo "    ok  $SE_PASSED suspended-employer assertions passed (suspended read reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20270105090000_suspended_employer_applicant_reads_rollback.sql >/dev/null
se_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270105090000_suspended_employer_applicant_reads.sql >/dev/null
SE_NC2_SQL="$(sed -n '/^-- ── 1\. The three gates/,/^-- ── 2\. Postflight/p' supabase/migrations/20270105090000_suspended_employer_applicant_reads.sql \
  | sed "s/OR NOT coalesce(public.employer_is_active_status(_employer), false)/OR EXISTS (SELECT 1 FROM public.employers ee WHERE ee.id = _employer AND ee.status = 'suspended')/")"
[ "$(grep -c "ee.status = 'suspended'" <<<"$SE_NC2_SQL")" -eq 3 ] || { echo "FAIL: suspended-employer NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$SE_NC2_SQL" >/dev/null
se_nc_expect_fail "NC2 only 'suspended' refused"
psql_q -d "$TEST_DB" -f supabase/migrations/20270105090000_suspended_employer_applicant_reads.sql >/dev/null
set +e
SE_OUT="$(run_se_suite)"; SE_RC=$?
set -e
[ "$SE_RC" -eq 0 ] || { echo "$SE_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: suspended-employer suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  suspended-employer migration re-applied (postflight proved); suite passes again"
# 20270106090000: Passport evidence and verification requests are written only
# by their functions (P1-4 of the 2026-10-02 audit). The suite reproduces the
# cross-holder plant on the pre-fix grants and policies themselves (SV0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (grants and write policies back)            -> SV1.1
#   NC2  old write policies back, write grants still revoked            -> SV4.1
#   NC3  write grants back, SELECT-only policies kept                   -> SV1.2
run_sv_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_evidence_and_request_writes_test.sql 2>&1
}
sv_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_sv_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: passport-writes negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: SV[0-9.]*' | head -1))"
}
echo "==> Running Passport evidence/request write-path assertions"
set +e
SV_OUT="$(run_sv_suite)"; SV_RC=$?
set -e
SV_PASSED="$(echo "$SV_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$SV_RC" -ne 0 ]; then
  echo "$SV_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the passport-writes suite exited with code ${SV_RC}." >&2
  exit 1
fi
[ "$SV_PASSED" -ge 29 ] || { echo "$SV_OUT"; echo "FAIL: passport-writes assertion shortfall: $SV_PASSED (floor 29)" >&2; exit 1; }
echo "    ok  $SV_PASSED passport-writes assertions passed (cross-holder plant reproduced pre-fix, refused post-fix)"
# 20270114090000 (P1-E) later added a table-level invariant that refuses the
# same cross-holder rows. These controls prove THIS migration's layers, so the
# later invariant is lifted while they run and restored afterwards.
psql_q -d "$TEST_DB" -f supabase/rollback/20270114090000_sp_passport_target_holder_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20270106090000_sp_evidence_and_request_writes_rpc_only_rollback.sql >/dev/null
sv_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270106090000_sp_evidence_and_request_writes_rpc_only.sql >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
DROP POLICY sp_evidence_self ON public.sp_evidence;
CREATE POLICY sp_evidence_self ON public.sp_evidence FOR ALL TO authenticated
  USING (holder_user_id = auth.uid()) WITH CHECK (holder_user_id = auth.uid());
CREATE POLICY sp_vr_self_insert ON public.sp_verification_requests FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND status = 'pending' AND decided_by IS NULL);
SQL
sv_nc_expect_fail "NC2 write policies back, grants revoked"
psql_q -d "$TEST_DB" -f supabase/migrations/20270106090000_sp_evidence_and_request_writes_rpc_only.sql >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
GRANT INSERT, UPDATE ON public.sp_evidence TO authenticated;
GRANT INSERT (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status)
  ON public.sp_verification_requests TO authenticated;
SQL
sv_nc_expect_fail "NC3 write grants back, policies SELECT-only"
psql_q -d "$TEST_DB" -f supabase/migrations/20270106090000_sp_evidence_and_request_writes_rpc_only.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20270114090000_sp_passport_target_holder.sql >/dev/null
# 20270114's re-apply restores its own sp_attach_evidence body; 20270126
# builds on it, so it goes back on top.
psql_q -d "$TEST_DB" -f supabase/migrations/20270126090000_sp_evidence_change_under_review.sql >/dev/null
set +e
SV_OUT="$(run_sv_suite)"; SV_RC=$?
set -e
[ "$SV_RC" -eq 0 ] || { echo "$SV_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: passport-writes suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  passport-writes migration re-applied (postflight proved); suite passes again"
# 20270107090000: a panel reviewer sees no other reviewer's assessment before
# the reveal (P1-5 of the 2026-10-02 audit). The suite reproduces all three
# pre-reveal reads on the pre-fix policies and bodies themselves (PR0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> PR1.1
#   NC2  assessments hidden, case events still case-access only         -> PR1.4
#   NC3  both tables hidden, the pre-fix preview restored               -> PR2.1
run_pr_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_iv_panel_reveal_boundary_test.sql 2>&1
}
pr_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_pr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: panel-reveal negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: PR[0-9.]*' | head -1))"
}
echo "==> Running Interview panel reveal-boundary assertions"
set +e
PR_OUT="$(run_pr_suite)"; PR_RC=$?
set -e
PR_PASSED="$(echo "$PR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$PR_RC" -ne 0 ]; then
  echo "$PR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the panel-reveal suite exited with code ${PR_RC}." >&2
  exit 1
fi
[ "$PR_PASSED" -ge 22 ] || { echo "$PR_OUT"; echo "FAIL: panel-reveal assertion shortfall: $PR_PASSED (floor 22)" >&2; exit 1; }
echo "    ok  $PR_PASSED panel-reveal assertions passed (pre-reveal reads reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f supabase/rollback/20270107090000_scp_iv_panel_reveal_boundary_rollback.sql >/dev/null
# The suite calls the helper by name (PR5.2); restore it alone so NC1 fails on
# behaviour, not on a missing function.
psql_q -d "$TEST_DB" -c "$(sed -n '/^CREATE OR REPLACE FUNCTION public.scp_iv_panel_hides_others/,/^\$function\$;/p' supabase/migrations/20270107090000_scp_iv_panel_reveal_boundary.sql)" >/dev/null
psql_q -d "$TEST_DB" -c "REVOKE ALL ON FUNCTION public.scp_iv_panel_hides_others(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.scp_iv_panel_hides_others(uuid) TO authenticated" >/dev/null
pr_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f supabase/migrations/20270107090000_scp_iv_panel_reveal_boundary.sql >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
DROP POLICY scp_interview_case_events_read ON public.scp_interview_case_events;
CREATE POLICY scp_interview_case_events_read ON public.scp_interview_case_events
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));
SQL
pr_nc_expect_fail "NC2 case events still case-access only"
psql_q -d "$TEST_DB" -f supabase/migrations/20270107090000_scp_iv_panel_reveal_boundary.sql >/dev/null
PR_NC3_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.scp_iv_preview_report/,/^END; \$function\$/p' supabase/rollback/20270107090000_scp_iv_panel_reveal_boundary_rollback.sql)"
grep -qF 'END; $function$' <<<"$PR_NC3_SQL" && ! grep -q "scp_iv_panel_hides_others" <<<"$PR_NC3_SQL" \
  || { echo "FAIL: panel-reveal NC3 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$PR_NC3_SQL" >/dev/null
pr_nc_expect_fail "NC3 pre-fix preview"
psql_q -d "$TEST_DB" -f supabase/migrations/20270107090000_scp_iv_panel_reveal_boundary.sql >/dev/null
set +e
PR_OUT="$(run_pr_suite)"; PR_RC=$?
set -e
[ "$PR_RC" -eq 0 ] || { echo "$PR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: panel-reveal suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  panel-reveal migration re-applied (postflight proved); suite passes again"

# 20270108090000: employer reports and assessment reads require an ACTIVE
# organisation through the canonical has_active_employer_role (P1-B 1/4 of the
# 2026-10-02 re-audit). The suite reproduces the suspended-employer reads on
# the pre-fix state itself (AR0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (primitive kept, so the suite can call it)  -> AR1.1
#   NC2  only scp_report_snapshot_readable back on its pre-fix body     -> AR1.1
#   NC3  only the four row policies back on their pre-fix predicates    -> AR1.1
#   NC4  a deny-list primitive that refuses only 'suspended'            -> AR2.1
run_ar_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_active_reads_test.sql 2>&1
}
ar_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ar_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: employer-active-reads negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: AR[0-9.]*' | head -1))"
}
AR_MIG=supabase/migrations/20270108090000_employer_active_reads.sql
AR_RB=supabase/rollback/20270108090000_employer_active_reads_rollback.sql
ar_primitive() {
  sed -n '/^CREATE OR REPLACE FUNCTION public.has_active_employer_role/,/^\$function\$/p' "$AR_MIG"
}
echo "==> Running employer active-reads assertions"
# Earlier blocks roll back and re-apply their own migrations, and two of them
# (20270102 and 20270104) redefine functions this migration also rewrites.
# Re-apply it first so the suite tests the final state, not theirs.
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
set +e
AR_OUT="$(run_ar_suite)"; AR_RC=$?
set -e
AR_PASSED="$(echo "$AR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$AR_RC" -ne 0 ]; then
  echo "$AR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the employer active-reads suite exited with code ${AR_RC}." >&2
  exit 1
fi
[ "$AR_PASSED" -ge 24 ] || { echo "$AR_OUT"; echo "FAIL: employer active-reads assertion shortfall: $AR_PASSED (floor 24)" >&2; exit 1; }
echo "    ok  $AR_PASSED employer active-reads assertions passed (suspended reads reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$AR_RB" >/dev/null
# The suite calls the primitive by name (AR5) and its own rollback drops it
# (AR0); restore the primitive alone so NC1 fails on behaviour.
psql_q -d "$TEST_DB" -c "$(ar_primitive)" >/dev/null
psql_q -d "$TEST_DB" -c "REVOKE ALL ON FUNCTION public.has_active_employer_role(uuid,uuid,text[]) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.has_active_employer_role(uuid,uuid,text[]) TO authenticated, service_role" >/dev/null
ar_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
# The audience predicate has a second overload since 20270203090000 (it knows the attempt), and the policy
# and the functions call THAT one. The pre-fix body is planted as the four-argument overload (it ignores the
# attempt, as it always did), so the planted defect is on the path the suite reads.
AR_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable/,/^\$function\$/p' "$AR_RB" \
  | sed 's/^\(CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable(.*_issuer_organization_id uuid\))$/\1, _attempt_id uuid)/')"
grep -q "_issuer_organization_id uuid, _attempt_id uuid)" <<<"$AR_NC2_SQL" \
  || { echo "FAIL: employer-active-reads NC2 could not plant its defect on the four-argument overload" >&2; exit 1; }
grep -q "employer_memberships" <<<"$AR_NC2_SQL" && ! grep -q "has_active_employer_role" <<<"$AR_NC2_SQL" \
  || { echo "FAIL: employer-active-reads NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$AR_NC2_SQL" >/dev/null
ar_nc_expect_fail "NC2 pre-fix report-snapshot helper"
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
AR_NC3_SQL="$(sed -n '/^ALTER POLICY scp_assessment_invitations_employer_read/,/^DO \$\$/p' "$AR_RB" | sed '$d')"
[ "$(grep -c '^ALTER POLICY' <<<"$AR_NC3_SQL")" -eq 4 ] && ! grep -q "has_active_employer_role" <<<"$AR_NC3_SQL" \
  || { echo "FAIL: employer-active-reads NC3 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$AR_NC3_SQL" >/dev/null
ar_nc_expect_fail "NC3 pre-fix row policies"
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.has_active_employer_role(_user_id uuid, _employer_id uuid, _roles text[] DEFAULT NULL::text[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(public.has_employer_role(_user_id, _employer_id, _roles), false)
     AND coalesce((SELECT status <> 'suspended' FROM public.employers WHERE id = _employer_id), false);
$function$;
SQL
ar_nc_expect_fail "NC4 deny-list primitive (suspended only)"
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
set +e
AR_OUT="$(run_ar_suite)"; AR_RC=$?
set -e
[ "$AR_RC" -eq 0 ] || { echo "$AR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: employer active-reads suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  employer active-reads migration re-applied (postflight proved); suite passes again"
# 20270114090000: a Passport request or evidence row names exactly one entry,
# and it is the holder's own (P1-E of the 2026-10-02 re-audit). The suite
# reproduces the cross-holder attach / review / approve / revoke chain on the
# pre-fix functions and tables itself (TH0), and proves the table layer alone
# (TH3).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> TH1.1
#   NC2  only the four functions back on their pre-fix bodies           -> TH1.1
#   NC3  only the table constraints dropped (functions kept)            -> TH3.3
run_th_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_passport_target_holder_test.sql 2>&1
}
th_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_th_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: passport-target-holder negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: TH[0-9.]*' | head -1))"
}
TH_MIG=supabase/migrations/20270114090000_sp_passport_target_holder.sql
TH_RB=supabase/rollback/20270114090000_sp_passport_target_holder_rollback.sql
echo "==> Running Passport target-holder assertions"
set +e
TH_OUT="$(run_th_suite)"; TH_RC=$?
set -e
TH_PASSED="$(echo "$TH_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$TH_RC" -ne 0 ]; then
  echo "$TH_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the passport target-holder suite exited with code ${TH_RC}." >&2
  exit 1
fi
[ "$TH_PASSED" -ge 20 ] || { echo "$TH_OUT"; echo "FAIL: passport target-holder assertion shortfall: $TH_PASSED (floor 20)" >&2; exit 1; }
echo "    ok  $TH_PASSED passport target-holder assertions passed (cross-holder chain reproduced pre-fix, refused post-fix by each layer)"
psql_q -d "$TEST_DB" -f "$TH_RB" >/dev/null
th_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$TH_MIG" >/dev/null
TH_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.sp_attach_evidence/,$p' "$TH_RB" | sed '/^DO \$\$/,$d')"
[ "$(grep -c '^CREATE OR REPLACE FUNCTION' <<<"$TH_NC2_SQL")" -eq 4 ] && ! grep -q "SP_TARGET_AMBIGUOUS" <<<"$TH_NC2_SQL" \
  || { echo "FAIL: passport-target-holder NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$TH_NC2_SQL" >/dev/null
th_nc_expect_fail "NC2 pre-fix functions, constraints kept"
psql_q -d "$TEST_DB" -f "$TH_RB" >/dev/null
psql_q -d "$TEST_DB" -f "$TH_MIG" >/dev/null
TH_NC3_SQL="$(sed -n '/^ALTER TABLE public.sp_verification_requests/,/^ALTER TABLE public.sp_claims DROP/p' "$TH_RB")"
[ "$(grep -c 'DROP CONSTRAINT' <<<"$TH_NC3_SQL")" -eq 8 ] \
  || { echo "FAIL: passport-target-holder NC3 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$TH_NC3_SQL" >/dev/null
th_nc_expect_fail "NC3 constraints dropped, functions kept"
psql_q -d "$TEST_DB" -f "$TH_RB" >/dev/null
psql_q -d "$TEST_DB" -f "$TH_MIG" >/dev/null
# As above: 20270126 goes back on top of 20270114's sp_attach_evidence.
psql_q -d "$TEST_DB" -f supabase/migrations/20270126090000_sp_evidence_change_under_review.sql >/dev/null
set +e
TH_OUT="$(run_th_suite)"; TH_RC=$?
set -e
[ "$TH_RC" -eq 0 ] || { echo "$TH_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: passport target-holder suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  passport target-holder migration re-applied (postflight proved); suite passes again"

# 20270109090000: candidate identity, interview notes and candidate
# notifications require an ACTIVE organisation (P1-B 2/5 of the 2026-10-02
# re-audit). The suite reproduces the suspended-employer reads and writes on the
# pre-fix state itself (CI0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> CI1.1
#   NC2  only jase_notification_payload back on its pre-fix body        -> CI1.1
#   NC3  only the scp_interview_notes read policy back on its predicate -> CI1.1
#   NC4  only scp_record_interview_note back on its pre-fix body        -> CI1.3
run_ci_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/candidate_identity_active_employer_test.sql 2>&1
}
ci_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ci_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: candidate-identity negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: CI[0-9.]*' | head -1))"
}
CI_MIG=supabase/migrations/20270109090000_candidate_identity_active_employer.sql
CI_RB=supabase/rollback/20270109090000_candidate_identity_active_employer_rollback.sql
ci_rb_fn() {
  sed -n "/^CREATE OR REPLACE FUNCTION public.$1(/,/^\\\$function\\\$/p" "$CI_RB"
}
echo "==> Running candidate identity active-employer assertions"
psql_q -d "$TEST_DB" -f "$CI_MIG" >/dev/null
set +e
CI_OUT="$(run_ci_suite)"; CI_RC=$?
set -e
CI_PASSED="$(echo "$CI_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$CI_RC" -ne 0 ]; then
  echo "$CI_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the candidate identity suite exited with code ${CI_RC}." >&2
  exit 1
fi
[ "$CI_PASSED" -ge 19 ] || { echo "$CI_OUT"; echo "FAIL: candidate identity assertion shortfall: $CI_PASSED (floor 19)" >&2; exit 1; }
echo "    ok  $CI_PASSED candidate identity assertions passed (suspended reads and writes reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$CI_RB" >/dev/null
ci_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$CI_MIG" >/dev/null
CI_NC2_SQL="$(ci_rb_fn jase_notification_payload)"
grep -q "employer_memberships" <<<"$CI_NC2_SQL" && ! grep -q "has_active_employer_role" <<<"$CI_NC2_SQL" \
  || { echo "FAIL: candidate-identity NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$CI_NC2_SQL" >/dev/null
ci_nc_expect_fail "NC2 pre-fix notification payload"
psql_q -d "$TEST_DB" -f "$CI_MIG" >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
ALTER POLICY scp_interview_notes_employer_read ON public.scp_interview_notes
  USING (EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = scp_interview_notes.employer_id
                    AND m.user_id = auth.uid() AND m.status = 'active'));
SQL
ci_nc_expect_fail "NC3 pre-fix interview-notes read policy"
psql_q -d "$TEST_DB" -f "$CI_MIG" >/dev/null
CI_NC4_SQL="$(ci_rb_fn scp_record_interview_note)"
grep -q "employer_memberships" <<<"$CI_NC4_SQL" && ! grep -q "has_active_employer_role" <<<"$CI_NC4_SQL" \
  || { echo "FAIL: candidate-identity NC4 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$CI_NC4_SQL" >/dev/null
ci_nc_expect_fail "NC4 pre-fix note recording"
psql_q -d "$TEST_DB" -f "$CI_MIG" >/dev/null
set +e
CI_OUT="$(run_ci_suite)"; CI_RC=$?
set -e
[ "$CI_RC" -eq 0 ] || { echo "$CI_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: candidate identity suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  candidate identity migration re-applied (postflight proved); suite passes again"

# 20270110090000: assessment actions require an ACTIVE organisation (P1-B 3/5
# of the 2026-10-02 re-audit). The suite reproduces a suspended employer
# reviewing, releasing, deciding, cancelling and recording setups on the
# pre-fix state itself (AA0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> AA1.1
#   NC2  only scp_can_review_for back on its pre-fix body               -> AA1.1
#   NC3  only scp_release_attempt_report back on its pre-fix body       -> AA1.3
#   NC4  only the assessment-setups read policy back on its predicate   -> AA1.1
run_aa_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/assessment_actions_active_employer_test.sql 2>&1
}
aa_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_aa_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: assessment-actions negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: AA[0-9.]*' | head -1))"
}
AA_MIG=supabase/migrations/20270110090000_assessment_actions_active_employer.sql
AA_RB=supabase/rollback/20270110090000_assessment_actions_active_employer_rollback.sql
aa_rb_fn() {
  sed -n "/^CREATE OR REPLACE FUNCTION public.$1(/,/^\\\$function\\\$/p" "$AA_RB"
}
echo "==> Running assessment actions active-employer assertions"
psql_q -d "$TEST_DB" -f "$AA_MIG" >/dev/null
set +e
AA_OUT="$(run_aa_suite)"; AA_RC=$?
set -e
AA_PASSED="$(echo "$AA_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$AA_RC" -ne 0 ]; then
  echo "$AA_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the assessment actions suite exited with code ${AA_RC}." >&2
  exit 1
fi
[ "$AA_PASSED" -ge 18 ] || { echo "$AA_OUT"; echo "FAIL: assessment actions assertion shortfall: $AA_PASSED (floor 18)" >&2; exit 1; }
echo "    ok  $AA_PASSED assessment actions assertions passed (suspended actions reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$AA_RB" >/dev/null
aa_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$AA_MIG" >/dev/null
AA_NC2_SQL="$(aa_rb_fn scp_can_review_for)"
grep -q "employer_memberships" <<<"$AA_NC2_SQL" && ! grep -q "has_active_employer_role" <<<"$AA_NC2_SQL" \
  || { echo "FAIL: assessment-actions NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$AA_NC2_SQL" >/dev/null
aa_nc_expect_fail "NC2 pre-fix reviewer authority"
psql_q -d "$TEST_DB" -f "$AA_MIG" >/dev/null
AA_NC3_SQL="$(aa_rb_fn scp_release_attempt_report)"
grep -q "employer_memberships" <<<"$AA_NC3_SQL" && ! grep -q "has_active_employer_role" <<<"$AA_NC3_SQL" \
  || { echo "FAIL: assessment-actions NC3 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$AA_NC3_SQL" >/dev/null
aa_nc_expect_fail "NC3 pre-fix release"
psql_q -d "$TEST_DB" -f "$AA_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "ALTER POLICY scp_assessment_setups_member_read ON public.scp_assessment_setups USING (public.has_employer_role(auth.uid(), employer_id, ARRAY['owner','admin','member']))" >/dev/null
aa_nc_expect_fail "NC4 pre-fix setups read policy"
psql_q -d "$TEST_DB" -f "$AA_MIG" >/dev/null
set +e
AA_OUT="$(run_aa_suite)"; AA_RC=$?
set -e
[ "$AA_RC" -eq 0 ] || { echo "$AA_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: assessment actions suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  assessment actions migration re-applied (postflight proved); suite passes again"

# 20270111090000: Interview Intelligence and BESKT require an ACTIVE
# organisation (P1-B 4/5 of the 2026-10-02 re-audit). The suite reproduces a
# suspended employer reading and working an interview case on the pre-fix
# state itself (IB0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> IB1.1
#   NC2  only scp_iv_can_read_case back on its pre-fix body             -> IB1.1
#   NC3  only scp_iv_case_row_visible back on its pre-fix body          -> IB1.1
#   NC4  only the internal-test-activation read policy back             -> IB1.1
#   (The candidate-corrections policy reads its case through the cases table's
#   own row policy, which scp_iv_case_row_visible already gates, so planting
#   it alone is not observable; NC3 covers that path.)
#   NC5  only scp_iv_finalise_report back on its pre-fix body           -> IB1.3
run_ib_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/interview_beskt_active_employer_test.sql 2>&1
}
ib_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ib_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: interview-beskt negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: IB[0-9.]*' | head -1))"
}
IB_MIG=supabase/migrations/20270111090000_interview_beskt_active_employer.sql
IB_RB=supabase/rollback/20270111090000_interview_beskt_active_employer_rollback.sql
ib_rb_fn() {
  sed -n "/^CREATE OR REPLACE FUNCTION public.$1(/,/^\\\$function\\\$/p" "$IB_RB"
}
ib_plant_fn() {
  local sql; sql="$(ib_rb_fn "$1")"
  grep -q "has_employer_role(" <<<"$sql" && ! grep -q "has_active_employer_role" <<<"$sql" \
    || { echo "FAIL: interview-beskt control could not plant the pre-fix $1" >&2; exit 1; }
  psql_q -d "$TEST_DB" -c "$sql" >/dev/null
}
echo "==> Running Interview Intelligence and BESKT active-employer assertions"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
set +e
IB_OUT="$(run_ib_suite)"; IB_RC=$?
set -e
IB_PASSED="$(echo "$IB_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$IB_RC" -ne 0 ]; then
  echo "$IB_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the interview-beskt suite exited with code ${IB_RC}." >&2
  exit 1
fi
[ "$IB_PASSED" -ge 18 ] || { echo "$IB_OUT"; echo "FAIL: interview-beskt assertion shortfall: $IB_PASSED (floor 18)" >&2; exit 1; }
echo "    ok  $IB_PASSED interview-beskt assertions passed (suspended case access reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$IB_RB" >/dev/null
ib_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
ib_plant_fn scp_iv_can_read_case
ib_nc_expect_fail "NC2 pre-fix case read helper"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
ib_plant_fn scp_iv_case_row_visible
ib_nc_expect_fail "NC3 pre-fix case row visibility"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
ALTER POLICY bcp_ita_party_read ON public.bcp_internal_test_activations
  USING (public.is_platform_admin(auth.uid())
         OR public.has_employer_role(auth.uid(), employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));
SQL
ib_nc_expect_fail "NC4 pre-fix test-activation read policy"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
ib_plant_fn scp_iv_finalise_report
ib_nc_expect_fail "NC5 pre-fix finalise"
psql_q -d "$TEST_DB" -f "$IB_MIG" >/dev/null
set +e
IB_OUT="$(run_ib_suite)"; IB_RC=$?
set -e
[ "$IB_RC" -eq 0 ] || { echo "$IB_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: interview-beskt suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  interview-beskt migration re-applied (postflight proved); suite passes again"

# 20270112090000: employer attestation in the Security Passport requires an
# ACTIVE organisation (P1-B 5/5 of the 2026-10-02 re-audit). The suite
# reproduces a suspended employer seeing its queue and verifying a holder's
# employment on the pre-fix state itself (PA0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> PA1.1
#   NC2  only sp_employer_attestation_queue back on its pre-fix body    -> PA1.1
#   NC3  only sp_verifier_decide back on its pre-fix body               -> PA1.2
run_pa_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/passport_attestation_active_employer_test.sql 2>&1
}
pa_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_pa_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: passport-attestation negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: PA[0-9.]*' | head -1))"
}
PA_MIG=supabase/migrations/20270112090000_passport_attestation_active_employer.sql
PA_RB=supabase/rollback/20270112090000_passport_attestation_active_employer_rollback.sql
pa_plant_fn() {
  # BSD sed does not implement GNU BRE's optional \? operator. Stop at the
  # function terminator so an isolated mutation cannot execute the rollback's
  # unrelated policy changes or whole-state postflight.
  local sql; sql="$(awk -v fn="$1" '
    index($0, "CREATE OR REPLACE FUNCTION public." fn "(") == 1 { copying = 1 }
    copying { print }
    copying && ($0 == "END; $function$" || $0 == "$function$") { exit }
  ' "$PA_RB")"
  grep -q "has_employer_role(" <<<"$sql" && ! grep -q "has_active_employer_role" <<<"$sql" \
    || { echo "FAIL: passport-attestation control could not plant the pre-fix $1" >&2; exit 1; }
  psql_q -d "$TEST_DB" -c "$sql" >/dev/null
}
echo "==> Running Passport attestation active-employer assertions"
psql_q -d "$TEST_DB" -f "$PA_MIG" >/dev/null
set +e
PA_OUT="$(run_pa_suite)"; PA_RC=$?
set -e
PA_PASSED="$(echo "$PA_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$PA_RC" -ne 0 ]; then
  echo "$PA_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the passport attestation suite exited with code ${PA_RC}." >&2
  exit 1
fi
[ "$PA_PASSED" -ge 16 ] || { echo "$PA_OUT"; echo "FAIL: passport attestation assertion shortfall: $PA_PASSED (floor 16)" >&2; exit 1; }
echo "    ok  $PA_PASSED passport attestation assertions passed (suspended attestation reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$PA_RB" >/dev/null
pa_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$PA_MIG" >/dev/null
pa_plant_fn sp_employer_attestation_queue
pa_nc_expect_fail "NC2 pre-fix attestation queue"
psql_q -d "$TEST_DB" -f "$PA_MIG" >/dev/null
pa_plant_fn sp_verifier_decide
pa_nc_expect_fail "NC3 pre-fix decision"
psql_q -d "$TEST_DB" -f "$PA_MIG" >/dev/null
set +e
PA_OUT="$(run_pa_suite)"; PA_RC=$?
set -e
[ "$PA_RC" -eq 0 ] || { echo "$PA_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: passport attestation suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  passport attestation migration re-applied (postflight proved); suite passes again"

# 20270113090000: only an ACTIVE (approved, not suspended) organisation assigns,
# invites, schedules, trains or binds people (P1-D of the 2026-10-02
# re-audit). The suite reproduces a pending organisation doing all six on the
# pre-fix bodies itself (PE0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> PE1.1
#   NC2  only scp_employer_assign back on its pre-fix body              -> PE1.1
#   NC3  only scp_claim_assessment_invitations back on its pre-fix body -> PE3.1
#   NC4  only scp_bind_employee_subject back on its pre-fix body        -> PE1.1
run_pe_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/pending_employer_actions_test.sql 2>&1
}
pe_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_pe_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: pending-employer negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: PE[0-9.]*' | head -1))"
}
PE_MIG=supabase/migrations/20270113090000_pending_employer_actions.sql
PE_RB=supabase/rollback/20270113090000_pending_employer_actions_rollback.sql
pe_plant_fn() {
  # BSD sed does not implement GNU BRE's optional \? operator. Stop at the
  # function terminator so an isolated mutation cannot execute the rollback's
  # unrelated policy changes or whole-state postflight.
  local sql; sql="$(awk -v fn="$1" '
    index($0, "CREATE OR REPLACE FUNCTION public." fn "(") == 1 { copying = 1 }
    copying { print }
    copying && ($0 == "END; $function$" || $0 == "$function$") { exit }
  ' "$PE_RB")"
  grep -q "^CREATE OR REPLACE FUNCTION public.$1(" <<<"$sql" && ! grep -q "20270113090000" <<<"$sql" \
    || { echo "FAIL: pending-employer control could not plant the pre-fix $1" >&2; exit 1; }
  psql_q -d "$TEST_DB" -c "$sql" >/dev/null
}
echo "==> Running pending-employer actions assertions"
psql_q -d "$TEST_DB" -f "$PE_MIG" >/dev/null
set +e
PE_OUT="$(run_pe_suite)"; PE_RC=$?
set -e
PE_PASSED="$(echo "$PE_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$PE_RC" -ne 0 ]; then
  echo "$PE_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the pending-employer suite exited with code ${PE_RC}." >&2
  exit 1
fi
[ "$PE_PASSED" -ge 14 ] || { echo "$PE_OUT"; echo "FAIL: pending-employer assertion shortfall: $PE_PASSED (floor 14)" >&2; exit 1; }
echo "    ok  $PE_PASSED pending-employer assertions passed (pending actions reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$PE_RB" >/dev/null
pe_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$PE_MIG" >/dev/null
pe_plant_fn scp_employer_assign
pe_nc_expect_fail "NC2 pre-fix assign"
psql_q -d "$TEST_DB" -f "$PE_MIG" >/dev/null
pe_plant_fn scp_claim_assessment_invitations
pe_nc_expect_fail "NC3 pre-fix invitation claim"
psql_q -d "$TEST_DB" -f "$PE_MIG" >/dev/null
pe_plant_fn scp_bind_employee_subject
pe_nc_expect_fail "NC4 pre-fix bind"
psql_q -d "$TEST_DB" -f "$PE_MIG" >/dev/null
set +e
PE_OUT="$(run_pe_suite)"; PE_RC=$?
set -e
[ "$PE_RC" -eq 0 ] || { echo "$PE_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: pending-employer suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  pending-employer migration re-applied (postflight proved); suite passes again"
# 20270115090000: a holder cannot set or change a claim's verification stamp
# (P1-F of the 2026-10-02 re-audit). The suite reproduces the forged
# verified_at on the pre-fix trigger and policy itself (VS0), and proves each
# layer alone (VS3).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> VS1.1
#   NC2  only the trigger back on its pre-fix body (policy kept)        -> VS1.1
#   NC3  a trigger that guards verified_at but not verified_by_user_id  -> VS1.2
run_vs_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_claim_verification_stamp_test.sql 2>&1
}
vs_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_vs_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: verification-stamp negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: VS[0-9.]*' | head -1))"
}
VS_MIG=supabase/migrations/20270115090000_sp_claim_verification_stamp.sql
VS_RB=supabase/rollback/20270115090000_sp_claim_verification_stamp_rollback.sql
echo "==> Running Passport verification-stamp assertions"
psql_q -d "$TEST_DB" -f "$VS_MIG" >/dev/null
set +e
VS_OUT="$(run_vs_suite)"; VS_RC=$?
set -e
VS_PASSED="$(echo "$VS_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$VS_RC" -ne 0 ]; then
  echo "$VS_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the verification-stamp suite exited with code ${VS_RC}." >&2
  exit 1
fi
[ "$VS_PASSED" -ge 20 ] || { echo "$VS_OUT"; echo "FAIL: verification-stamp assertion shortfall: $VS_PASSED (floor 20)" >&2; exit 1; }
echo "    ok  $VS_PASSED verification-stamp assertions passed (forged stamp reproduced pre-fix, refused post-fix by each layer)"
psql_q -d "$TEST_DB" -f "$VS_RB" >/dev/null
vs_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$VS_MIG" >/dev/null
VS_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable/,/^\$function\$/p' "$VS_RB")"
grep -q "SP_TRUST_FIELD_IMMUTABLE" <<<"$VS_NC2_SQL" && ! grep -q "verified_at" <<<"$VS_NC2_SQL" \
  || { echo "FAIL: verification-stamp NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$VS_NC2_SQL" >/dev/null
vs_nc_expect_fail "NC2 pre-fix trigger, new policy"
psql_q -d "$TEST_DB" -f "$VS_MIG" >/dev/null
VS_NC3_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable/,/^\$function\$/p' "$VS_MIG" \
  | sed 's/        OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id)/        )/')"
grep -q "verified_at IS DISTINCT FROM OLD.verified_at" <<<"$VS_NC3_SQL" && ! grep -q "verified_by_user_id IS DISTINCT" <<<"$VS_NC3_SQL" \
  || { echo "FAIL: verification-stamp NC3 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$VS_NC3_SQL" >/dev/null
vs_nc_expect_fail "NC3 verified_by_user_id unguarded"
psql_q -d "$TEST_DB" -f "$VS_MIG" >/dev/null
set +e
VS_OUT="$(run_vs_suite)"; VS_RC=$?
set -e
[ "$VS_RC" -eq 0 ] || { echo "$VS_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: verification-stamp suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  verification-stamp migration re-applied (postflight proved); suite passes again"
# 20270116090000: only an owner or admin reviews an interview finding, only
# its review columns, and the database records who (P1-C of the 2026-10-02
# re-audit). The suite reproduces a plain member settling, rewriting and
# misattributing findings on the pre-fix grants and policy itself (FR0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> FR1.1
#   NC2  table-level UPDATE granted back (policy kept)                  -> FR1.3
#   NC3  the update policy back on case access alone (grants kept)      -> FR1.1
#   NC4  the attribution trigger dropped                                -> FR2.2
run_fr_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_iv_findings_review_writes_test.sql 2>&1
}
fr_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_fr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: findings-review negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: FR[0-9.]*' | head -1))"
}
FR_MIG=supabase/migrations/20270116090000_scp_iv_findings_review_writes.sql
FR_RB=supabase/rollback/20270116090000_scp_iv_findings_review_writes_rollback.sql
echo "==> Running Interview findings review-writes assertions"
psql_q -d "$TEST_DB" -f "$FR_MIG" >/dev/null
set +e
FR_OUT="$(run_fr_suite)"; FR_RC=$?
set -e
FR_PASSED="$(echo "$FR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$FR_RC" -ne 0 ]; then
  echo "$FR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the findings review-writes suite exited with code ${FR_RC}." >&2
  exit 1
fi
[ "$FR_PASSED" -ge 16 ] || { echo "$FR_OUT"; echo "FAIL: findings review-writes assertion shortfall: $FR_PASSED (floor 16)" >&2; exit 1; }
echo "    ok  $FR_PASSED findings review-writes assertions passed (member rewrites reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$FR_RB" >/dev/null
fr_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$FR_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "GRANT UPDATE ON public.scp_interview_findings TO authenticated" >/dev/null
fr_nc_expect_fail "NC2 table-level UPDATE back"
psql_q -d "$TEST_DB" -f "$FR_MIG" >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
ALTER POLICY scp_interview_findings_update ON public.scp_interview_findings
  USING (public.scp_iv_can_write_case(case_id))
  WITH CHECK (public.scp_iv_can_write_case(case_id));
SQL
fr_nc_expect_fail "NC3 policy on case access alone"
psql_q -d "$TEST_DB" -f "$FR_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "DROP TRIGGER scp_interview_findings_review_stamp ON public.scp_interview_findings" >/dev/null
fr_nc_expect_fail "NC4 no attribution trigger"
psql_q -d "$TEST_DB" -f "$FR_MIG" >/dev/null
set +e
FR_OUT="$(run_fr_suite)"; FR_RC=$?
set -e
[ "$FR_RC" -eq 0 ] || { echo "$FR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: findings review-writes suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  findings review-writes migration re-applied (postflight proved); suite passes again"

# 20270118090000: an employer creates an assessment assignment as an invitation
# only and cannot write its result (P1-L of the 2026-10-02 final audit). The
# suite reproduces an already-completed assignment with an invented
# engine_result on the pre-fix grant itself (FA0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback (table-level INSERT back)                     -> FA1.1
#   NC2  only INSERT (status, engine_result) granted back                -> FA1.2
run_fa_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/assessment_assignment_insert_columns_test.sql 2>&1
}
fa_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_fa_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: assignment insert-columns negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: FA[0-9.]*' | head -1))"
}
FA_MIG=supabase/migrations/20270118090000_assessment_assignment_insert_columns.sql
FA_RB=supabase/rollback/20270118090000_assessment_assignment_insert_columns_rollback.sql
echo "==> Running assessment assignment insert-columns assertions"
psql_q -d "$TEST_DB" -f "$FA_MIG" >/dev/null
set +e
FA_OUT="$(run_fa_suite)"; FA_RC=$?
set -e
FA_PASSED="$(echo "$FA_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$FA_RC" -ne 0 ]; then
  echo "$FA_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the assignment insert-columns suite exited with code ${FA_RC}." >&2
  exit 1
fi
[ "$FA_PASSED" -ge 11 ] || { echo "$FA_OUT"; echo "FAIL: assignment insert-columns assertion shortfall: $FA_PASSED (floor 11)" >&2; exit 1; }
echo "    ok  $FA_PASSED assignment insert-columns assertions passed (forged completed result reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$FA_RB" >/dev/null
fa_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$FA_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "GRANT INSERT (status, engine_result) ON public.assessment_assignments TO authenticated" >/dev/null
fa_nc_expect_fail "NC2 status and engine_result insertable again"
psql_q -d "$TEST_DB" -f "$FA_MIG" >/dev/null
set +e
FA_OUT="$(run_fa_suite)"; FA_RC=$?
set -e
[ "$FA_RC" -eq 0 ] || { echo "$FA_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: assignment insert-columns suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  assignment insert-columns migration re-applied (postflight proved); suite passes again"

# 20270119090000: a Passport entry under review cannot change underneath the
# reviewer (P1-H of the 2026-10-02 final audit). The suite reproduces a pending
# period rewritten by its holder and then verified (ER0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> ER1.1
#   NC2  only the claims trigger dropped                                -> ER2.1
#   NC3  the helper never returns a clarification to review             -> ER3.2
run_er_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_entry_frozen_under_review_test.sql 2>&1
}
er_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_er_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: entry-under-review negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: ER[0-9.]*' | head -1))"
}
ER_MIG=supabase/migrations/20270119090000_sp_entry_frozen_under_review.sql
ER_RB=supabase/rollback/20270119090000_sp_entry_frozen_under_review_rollback.sql
echo "==> Running Passport entry-under-review assertions"
psql_q -d "$TEST_DB" -f "$ER_MIG" >/dev/null
set +e
ER_OUT="$(run_er_suite)"; ER_RC=$?
set -e
ER_PASSED="$(echo "$ER_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$ER_RC" -ne 0 ]; then
  echo "$ER_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the entry-under-review suite exited with code ${ER_RC}." >&2
  exit 1
fi
[ "$ER_PASSED" -ge 15 ] || { echo "$ER_OUT"; echo "FAIL: entry-under-review assertion shortfall: $ER_PASSED (floor 15)" >&2; exit 1; }
echo "    ok  $ER_PASSED entry-under-review assertions passed (edit-while-pending verification reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$ER_RB" >/dev/null
er_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$ER_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "DROP TRIGGER sp_claims_frozen_under_review ON public.sp_claims" >/dev/null
er_nc_expect_fail "NC2 claims unguarded"
psql_q -d "$TEST_DB" -f "$ER_MIG" >/dev/null
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.sp_entry_review_on_holder_edit(_claim_id uuid, _period_id uuid)
 RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.sp_verification_requests r
                            WHERE r.status = 'pending' AND (r.claim_id = _claim_id OR r.period_id = _period_id))
              THEN 'pending' END;
$f$;
SQL
er_nc_expect_fail "NC3 clarification never returns to review"
psql_q -d "$TEST_DB" -f "$ER_MIG" >/dev/null
set +e
ER_OUT="$(run_er_suite)"; ER_RC=$?
set -e
[ "$ER_RC" -eq 0 ] || { echo "$ER_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: entry-under-review suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  entry-under-review migration re-applied (postflight proved); suite passes again"

# 20270120090000: an access-request approval admits a person; it cannot make an
# owner or change a live member's role (P1-G of the 2026-10-02 final audit).
# The suite reproduces an admin approving their own request as owner (AR0).
# Negative controls, each of which MUST make the suite fail on an assertion.
# NC2-NC4 each drop exactly one rule (marked "-- rule:<name>" in the file):
#   NC1  the real rollback                                              -> AR1.1
#   NC2  without rule:owner (the organisation may grant owner)          -> AR2.1
#   NC3  without rule:self (self-approval allowed)                      -> AR1.2
#   NC4  without rule:live (a live member's role may be rewritten)      -> AR3.1
run_ar_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/access_request_no_role_escalation_test.sql 2>&1
}
ar_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ar_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: access-request negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: AR[0-9.]*' | head -1))"
}
ar_without_rule() {
  sed "/-- rule:$1/,/^    END IF;/d" "$AR_MIG" | sed '/^DO \$\$$/,$d'
}
AR_MIG=supabase/migrations/20270120090000_access_request_no_role_escalation.sql
AR_RB=supabase/rollback/20270120090000_access_request_no_role_escalation_rollback.sql
echo "==> Running access-request role-escalation assertions"
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
set +e
AR_OUT="$(run_ar_suite)"; AR_RC=$?
set -e
AR_PASSED="$(echo "$AR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$AR_RC" -ne 0 ]; then
  echo "$AR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the access-request suite exited with code ${AR_RC}." >&2
  exit 1
fi
[ "$AR_PASSED" -ge 12 ] || { echo "$AR_OUT"; echo "FAIL: access-request assertion shortfall: $AR_PASSED (floor 12)" >&2; exit 1; }
echo "    ok  $AR_PASSED access-request assertions passed (admin self-promotion reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$AR_RB" >/dev/null
ar_nc_expect_fail "NC1 full rollback"
for _rule in owner self live; do
  psql_q -d "$TEST_DB" -c "$(ar_without_rule "$_rule")" >/dev/null
  ar_nc_expect_fail "rule:${_rule} removed"
done
psql_q -d "$TEST_DB" -f "$AR_MIG" >/dev/null
set +e
AR_OUT="$(run_ar_suite)"; AR_RC=$?
set -e
[ "$AR_RC" -eq 0 ] || { echo "$AR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: access-request suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  access-request migration re-applied (postflight proved); suite passes again"

# 20270121090000: only the security function erases material on a security
# vetting (P1-K of the 2026-10-02 final audit). The suite reproduces an owner
# who cannot read a vetting case erasing its material (VE0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> VE1.1
#   NC2  bcp_case_access_ok answering true for everyone                 -> VE-F
run_ve_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_iv_erase_vetting_boundary_test.sql 2>&1
}
ve_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ve_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: vetting-erase negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: VE[0-9.A-Z-]*' | head -1))"
}
VE_MIG=supabase/migrations/20270121090000_scp_iv_erase_vetting_boundary.sql
VE_RB=supabase/rollback/20270121090000_scp_iv_erase_vetting_boundary_rollback.sql
echo "==> Running vetting erase-boundary assertions"
psql_q -d "$TEST_DB" -f "$VE_MIG" >/dev/null
set +e
VE_OUT="$(run_ve_suite)"; VE_RC=$?
set -e
VE_PASSED="$(echo "$VE_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$VE_RC" -ne 0 ]; then
  echo "$VE_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the vetting erase-boundary suite exited with code ${VE_RC}." >&2
  exit 1
fi
[ "$VE_PASSED" -ge 6 ] || { echo "$VE_OUT"; echo "FAIL: vetting erase-boundary assertion shortfall: $VE_PASSED (floor 6)" >&2; exit 1; }
echo "    ok  $VE_PASSED vetting erase-boundary assertions passed (owner erasure of vetting material reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$VE_RB" >/dev/null
ve_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -f "$VE_MIG" >/dev/null
VE_ACCESS_OK="$(psql -tAq -d "$TEST_DB" -c "SELECT pg_get_functiondef('public.bcp_case_access_ok(uuid)'::regprocedure)")"
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.bcp_case_access_ok(_case_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT true $f$;
SQL
ve_nc_expect_fail "NC2 vetting helper always true"
psql_q -d "$TEST_DB" -c "$VE_ACCESS_OK" >/dev/null
psql_q -d "$TEST_DB" -f "$VE_MIG" >/dev/null
set +e
VE_OUT="$(run_ve_suite)"; VE_RC=$?
set -e
[ "$VE_RC" -eq 0 ] || { echo "$VE_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: vetting erase-boundary suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  vetting erase-boundary migration re-applied (postflight proved); suite passes again"

# 20270122090000: a BESKT position cannot be reopened once the others are
# readable (P1-J of the 2026-10-02 final audit). The regression lives in the
# conduct suite, which already builds a two-assessor session: C7.9 reproduces
# the reopen on the pre-fix body, C7.10-C7.12 refuse it.
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> C7.10
#   NC2  the guard applies only once a panel exists                     -> C7.10
run_cr_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/bcp_interview_conduct_test.sql 2>&1
}
cr_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_cr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: conduct-reopen negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: C[0-9.]*' | head -1))"
}
CR_MIG=supabase/migrations/20270122090000_bcp_conduct_reopen_after_exposure.sql
CR_RB=supabase/rollback/20270122090000_bcp_conduct_reopen_after_exposure_rollback.sql
echo "==> Running BESKT conduct reopen-after-exposure assertions"
psql_q -d "$TEST_DB" -f "$CR_MIG" >/dev/null
set +e
CR_OUT="$(run_cr_suite)"; CR_RC=$?
set -e
if [ "$CR_RC" -ne 0 ] || ! echo "$CR_OUT" | grep -q "ok  C7.10 " || ! echo "$CR_OUT" | grep -q "ok  C7.9 REPRODUCTION"; then
  echo "$CR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the conduct suite does not prove the reopen-after-exposure boundary (rc ${CR_RC})." >&2
  exit 1
fi
echo "    ok  conduct suite passes with the reopen reproduced pre-fix (C7.9) and refused post-fix (C7.10-C7.12)"
# 20270124090000 enforces the same refusal durably (an exposure record), so
# each control takes it down first; it is re-applied with this migration.
psql_q -d "$TEST_DB" -f supabase/rollback/20270124090000_bcp_conduct_exposure_is_durable_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f "$CR_RB" >/dev/null
cr_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -c "$(sed 's/  IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions o$/  IF EXISTS (SELECT 1 FROM public.bcp_conduct_panels pp WHERE pp.session_id = _p.session_id) AND EXISTS (SELECT 1 FROM public.bcp_conduct_positions o/' "$CR_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
cr_nc_expect_fail "NC2 guard only with a panel"
psql_q -d "$TEST_DB" -f "$CR_MIG" >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20270124090000_bcp_conduct_exposure_is_durable.sql >/dev/null
set +e
CR_OUT="$(run_cr_suite)"; CR_RC=$?
set -e
[ "$CR_RC" -eq 0 ] || { echo "$CR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: conduct suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  conduct reopen-after-exposure migration re-applied (postflight proved); suite passes again"

# 20270123090000: an approved organisation that changes its identity goes back
# to review (P1-I of the 2026-10-02 final audit; owner decision: re-review).
# The suite reproduces an approved organisation taking another one's name and
# number and staying approved (EI0).
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> EI1.1
#   NC2  the organisation number dropped from the material fields       -> EI2.2
run_ei_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_identity_rereview_test.sql 2>&1
}
ei_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_ei_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: identity re-review negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: EI[0-9.]*' | head -1))"
}
EI_MIG=supabase/migrations/20270123090000_employer_identity_rereview.sql
EI_RB=supabase/rollback/20270123090000_employer_identity_rereview_rollback.sql
echo "==> Running employer identity re-review assertions"
psql_q -d "$TEST_DB" -f "$EI_MIG" >/dev/null
set +e
EI_OUT="$(run_ei_suite)"; EI_RC=$?
set -e
EI_PASSED="$(echo "$EI_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$EI_RC" -ne 0 ]; then
  echo "$EI_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the identity re-review suite exited with code ${EI_RC}." >&2
  exit 1
fi
[ "$EI_PASSED" -ge 13 ] || { echo "$EI_OUT"; echo "FAIL: identity re-review assertion shortfall: $EI_PASSED (floor 13)" >&2; exit 1; }
echo "    ok  $EI_PASSED identity re-review assertions passed (unreviewed identity takeover reproduced pre-fix, returned to review post-fix)"
psql_q -d "$TEST_DB" -f "$EI_RB" >/dev/null
ei_nc_expect_fail "NC1 full rollback"
psql_q -d "$TEST_DB" -c "$(grep -v 'coalesce(NEW.registration_number' "$EI_MIG" | sed '/^DO \$\$$/,$d')" >/dev/null
ei_nc_expect_fail "NC2 organisation number not material"
psql_q -d "$TEST_DB" -f "$EI_MIG" >/dev/null
set +e
EI_OUT="$(run_ei_suite)"; EI_RC=$?
set -e
[ "$EI_RC" -eq 0 ] || { echo "$EI_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: identity re-review suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  identity re-review migration re-applied (postflight proved); suite passes again"

# 20270124090000: once a BESKT position has been readable by the others it is
# never reopened, whoever joins later. The regression lives in the conduct
# suite: C7.13 reproduces the bypass (a third assessor joins with an open
# position, and A reopens the position B has read), C7.14-C7.21 refuse it,
# keep the newcomer's independence and let an unread position be corrected.
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> C7.15
#   NC2  the exposure is never recorded (AFTER trigger dropped)         -> C7.15
#   NC3  the guard no longer consults the exposure record               -> C7.15
# Then a real two-connection race (lock vs reopen, and lock vs join+reopen),
# whose control removes the session lock from the guard.
BX_MIG=supabase/migrations/20270124090000_bcp_conduct_exposure_is_durable.sql
BX_RB=supabase/rollback/20270124090000_bcp_conduct_exposure_is_durable_rollback.sql
echo "==> Running BESKT conduct durable-exposure assertions"
psql_q -d "$TEST_DB" -f "$BX_MIG" >/dev/null
set +e
BX_OUT="$(run_cr_suite)"; BX_RC=$?
set -e
if [ "$BX_RC" -ne 0 ] || ! echo "$BX_OUT" | grep -q "ok  C7.13 REPRODUCTION" || ! echo "$BX_OUT" | grep -q "ok  C7.21 "; then
  echo "$BX_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the conduct suite does not prove the durable exposure boundary (rc ${BX_RC})." >&2
  exit 1
fi
echo "    ok  conduct suite passes with the late-join reopen reproduced (C7.13) and refused (C7.15-C7.21)"
psql_q -d "$TEST_DB" -f "$BX_RB" >/dev/null
cr_nc_expect_fail "BX NC1 full rollback"
psql_q -d "$TEST_DB" -f "$BX_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "DROP TRIGGER bcp_conduct_positions_exposure_record ON public.bcp_conduct_positions;" >/dev/null
cr_nc_expect_fail "BX NC2 exposure never recorded"
psql_q -d "$TEST_DB" -f "$BX_MIG" >/dev/null
psql_q -d "$TEST_DB" -c "$(sed -n '/^CREATE OR REPLACE FUNCTION public.bcp_conduct_position_exposure_guard()/,/^\$\$;/p' "$BX_MIG" \
  | sed 's/     AND EXISTS (SELECT 1 FROM public.bcp_conduct_position_exposures x/     AND false AND EXISTS (SELECT 1 FROM public.bcp_conduct_position_exposures x/')" >/dev/null
cr_nc_expect_fail "BX NC3 guard ignores the exposure record"
psql_q -d "$TEST_DB" -f "$BX_MIG" >/dev/null

# The race: two real connections on committed synthetic rows in a clone.
# Race 1: B's lock (the one that exposes A) holds its transaction open while A
# reopens. Race 2: the same, while C's join and A's reopen run in one
# transaction. A must be refused in both, after waiting on the session lock.
bx_race() {
  local db="$1" out1 out2 rc=0 t0 t1 a_state n
  psql_q -d "$db" >/dev/null <<'SQL'
SET session_replication_role = replica;
DELETE FROM public.bcp_conduct_position_exposures;
INSERT INTO auth.users (id, email) VALUES
  ('b7000000-0000-4000-8000-0000000000f1', 'race-a@bx.test'),
  ('b7000000-0000-4000-8000-0000000000f2', 'race-b@bx.test'),
  ('b7000000-0000-4000-8000-0000000000f3', 'race-c@bx.test')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.bcp_conduct_positions WHERE session_id IN ('b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-0000000000a2');
DELETE FROM public.bcp_conduct_sessions WHERE id IN ('b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-0000000000a2');
INSERT INTO public.bcp_conduct_sessions (id, link_id, case_id, employer_id, assignment_id, bound_response_id,
  bound_response_version, bound_method_version_id, bound_content_hash, bound_answers_content_hash, state,
  opened_by, opened_at, open_operation_id, revision, created_at)
SELECT s, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1,
       gen_random_uuid(), repeat('a', 64), repeat('b', 64), 'open', 'b7000000-0000-4000-8000-0000000000f1', now(),
       gen_random_uuid(), 1, now()
  FROM unnest(ARRAY['b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-0000000000a2']::uuid[]) s;
INSERT INTO public.bcp_conduct_positions (id, session_id, assessor_id, position_role, state, locked_at,
  lock_operation_id, reopen_count, revision, created_by, created_at)
VALUES
 ('b7000000-0000-4000-8000-0000000001a1', 'b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-0000000000f1', 'assessor', 'locked', now(), gen_random_uuid(), 0, 2, 'b7000000-0000-4000-8000-0000000000f1', now()),
 ('b7000000-0000-4000-8000-0000000001b1', 'b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-0000000000f2', 'assessor', 'open', NULL, NULL, 0, 1, 'b7000000-0000-4000-8000-0000000000f2', now()),
 ('b7000000-0000-4000-8000-0000000001a2', 'b7000000-0000-4000-8000-0000000000a2', 'b7000000-0000-4000-8000-0000000000f1', 'assessor', 'locked', now(), gen_random_uuid(), 0, 2, 'b7000000-0000-4000-8000-0000000000f1', now()),
 ('b7000000-0000-4000-8000-0000000001b2', 'b7000000-0000-4000-8000-0000000000a2', 'b7000000-0000-4000-8000-0000000000f2', 'assessor', 'open', NULL, NULL, 0, 1, 'b7000000-0000-4000-8000-0000000000f2', now());
SQL
  for sfx in 1 2; do
    psql -v ON_ERROR_STOP=1 -tAq -d "$db" >/dev/null 2>&1 <<SQL &
BEGIN;
UPDATE public.bcp_conduct_positions SET state = 'locked', locked_at = now(), lock_operation_id = gen_random_uuid(),
       revision = revision + 1 WHERE id = 'b7000000-0000-4000-8000-0000000001b${sfx}';
SELECT pg_sleep(2);
COMMIT;
SQL
    local pid=$!
    sleep 0.5
    local join_sql=""
    [ "$sfx" = "2" ] && join_sql="INSERT INTO public.bcp_conduct_positions (session_id, assessor_id, position_role, created_by) VALUES ('b7000000-0000-4000-8000-0000000000a2', 'b7000000-0000-4000-8000-0000000000f3', 'assessor', 'b7000000-0000-4000-8000-0000000000f3');"
    t0=$(date +%s%N)
    set +e
    out2="$(psql -v ON_ERROR_STOP=1 -tAq -d "$db" 2>&1 <<SQL
BEGIN;
SET LOCAL session_replication_role = origin;
${join_sql}
UPDATE public.bcp_conduct_positions SET state = 'open', locked_at = NULL, lock_operation_id = NULL,
       reopened_at = now(), reopened_by = assessor_id, reopen_reason = 'race reopen',
       reopen_count = reopen_count + 1, revision = revision + 1
 WHERE id = 'b7000000-0000-4000-8000-0000000001a${sfx}';
COMMIT;
SQL
)"
    set -e
    t1=$(date +%s%N)
    wait "$pid" || true
    a_state="$(psql -tAq -d "$db" -c "select state from public.bcp_conduct_positions where id = 'b7000000-0000-4000-8000-0000000001a${sfx}'")"
    n="$(psql -tAq -d "$db" -c "select count(*) from public.bcp_conduct_position_exposures where session_id = 'b7000000-0000-4000-8000-0000000000a${sfx}'")"
    if echo "$out2" | grep -q "BCP_CONDUCT_POSITIONS_ALREADY_SEEN" && [ "$a_state" = "locked" ] && [ "$n" = "2" ] \
       && [ $(( (t1 - t0) / 1000000 )) -ge 1000 ]; then
      echo "    ok  race ${sfx}: A's reopen waited $(( (t1 - t0) / 1000000 )) ms on the session lock and was refused; A stays locked, 2 exposures"
    else
      echo "    race ${sfx}: reopen='$(echo "$out2" | grep -oE 'BCP_[A-Z_]+' | head -1)' a_state=${a_state} exposures=${n} waited=$(( (t1 - t0) / 1000000 ))ms" >&2
      rc=1
    fi
  done
  return $rc
}
echo "==> Running BESKT conduct join/lock/reopen race"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB}_bx_race;" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB}_bx_race TEMPLATE ${TEST_DB};" >/dev/null
if ! bx_race "${TEST_DB}_bx_race"; then
  echo "FAIL: the durable-exposure race did not settle on the refusal." >&2
  exit 1
fi
psql_q -d "${TEST_DB}_bx_race" -c "$(sed -n '/^CREATE OR REPLACE FUNCTION public.bcp_conduct_position_exposure_guard()/,/^\$\$;/p' "$BX_MIG" \
  | sed '/pg_advisory_xact_lock/d')" >/dev/null
# bx_race toggles set -e itself, so its status is read in a condition.
if bx_race "${TEST_DB}_bx_race" >/dev/null 2>&1; then BX_RACE_NC=0; else BX_RACE_NC=1; fi
if [ "$BX_RACE_NC" -eq 0 ]; then
  echo "FAIL: race negative control (guard without the session lock): the race still passed -- it proves nothing" >&2
  exit 1
fi
echo "    ok  NC BX-RACE guard without the session lock: the race lets the exposed position reopen"
psql_q -d postgres -c "DROP DATABASE ${TEST_DB}_bx_race;" >/dev/null
set +e
BX_OUT="$(run_cr_suite)"; BX_RC=$?
set -e
[ "$BX_RC" -eq 0 ] || { echo "$BX_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: conduct suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  durable-exposure migration re-applied (postflight proved); suite passes again"

# 20270125090000: a Security Passport review decision is bound to the content
# the reviewer saw. SR0 reproduces a stale approval verifying content the
# reviewer never saw; SR1-SR5 refuse it and keep the legitimate flows.
# Negative controls, each of which MUST make the suite fail on an assertion:
#   NC1  the real rollback                                              -> SR1.a
#   NC2  the decision ignores the version it names                      -> SR1.1
#   NC3  a bare call on an answered request is let through              -> SR2.1
# Then a real two-connection race: the holder's clarification answer holds
# the request row while the reviewer decides from the page loaded before it.
SR_MIG=supabase/migrations/20270125090000_sp_decision_bound_to_reviewed_content.sql
SR_RB=supabase/rollback/20270125090000_sp_decision_bound_to_reviewed_content_rollback.sql
run_sr_suite() {
  psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_decision_bound_to_reviewed_content_test.sql 2>&1
}
sr_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_sr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED"; then
    echo "FAIL: reviewed-content negative control '${label}': the suite PASSED -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: SR[0-9a-z.]*' | head -1))"
}
sr_plant_decide() {
  psql_q -d "$TEST_DB" -c "$(sed -n '/^CREATE OR REPLACE FUNCTION public.sp_verifier_decide(_request_id uuid/,/^END; \$function\$$/p' "$SR_MIG" | sed "$1")" >/dev/null
}
echo "==> Running Passport reviewed-content decision assertions"
psql_q -d "$TEST_DB" -f "$SR_MIG" >/dev/null
set +e
SR_OUT="$(run_sr_suite)"; SR_RC=$?
set -e
SR_PASSED="$(echo "$SR_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$SR_RC" -ne 0 ] || ! echo "$SR_OUT" | grep -q "ok  SR0.1 REPRODUCTION"; then
  echo "$SR_OUT" | grep -E "ERROR|FAILED" >&2 || true
  echo "FAIL: the reviewed-content suite exited with code ${SR_RC}." >&2
  exit 1
fi
[ "$SR_PASSED" -ge 25 ] || { echo "$SR_OUT"; echo "FAIL: reviewed-content assertion shortfall: $SR_PASSED (floor 25)" >&2; exit 1; }
echo "    ok  $SR_PASSED reviewed-content assertions passed (stale approval reproduced pre-fix, refused post-fix)"
psql_q -d "$TEST_DB" -f "$SR_RB" >/dev/null
sr_nc_expect_fail "SR NC1 full rollback"
psql_q -d "$TEST_DB" -f "$SR_MIG" >/dev/null
sr_plant_decide 's/    IF _seen::timestamptz IS DISTINCT FROM _r.submitted_at THEN/    IF false THEN/'
sr_nc_expect_fail "SR NC2 version ignored"
psql_q -d "$TEST_DB" -f "$SR_MIG" >/dev/null
sr_plant_decide 's/  ELSIF _r.answered_at IS NOT NULL THEN/  ELSIF false THEN/'
sr_nc_expect_fail "SR NC3 bare call let through"
psql_q -d "$TEST_DB" -f "$SR_MIG" >/dev/null

echo "==> Running Passport answer/decision race"
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('b8000000-0000-4000-8000-0000000000a1', 'race-holder@sr.test'),
  ('b8000000-0000-4000-8000-0000000000c1', 'race-verifier@sr.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('b8000000-0000-4000-8000-0000000000c1', 'passport_verifier')
ON CONFLICT DO NOTHING;
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('b8000000-0000-4000-8000-0000000000a1', 'SR Race Holder', 'SE') ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
  employment_type, started_on, assertion_level, lifecycle_state)
VALUES ('b8000000-4444-4000-8000-0000000000a1', 'b8000000-0000-4000-8000-0000000000a1', 'SR Race AB', 'Väktare',
  'SE', 'full_time', current_date - 400, 'self_declared', 'active');
INSERT INTO public.sp_verification_requests (id, holder_user_id, period_id, request_kind, status, submitted_at,
  decided_at, decided_by, holder_message)
VALUES ('b8000000-5555-4000-8000-0000000000a1', 'b8000000-0000-4000-8000-0000000000a1',
  'b8000000-4444-4000-8000-0000000000a1', 'cqrityjob_review', 'clarification_requested', now() - interval '1 hour',
  now() - interval '30 minutes', 'b8000000-0000-4000-8000-0000000000c1', 'Ange korrekt roll.');
SQL
SR_SEEN="$(psql -tAq -d "$TEST_DB" -c "select submitted_at from public.sp_verification_requests where id = 'b8000000-5555-4000-8000-0000000000a1'")"
psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" >/dev/null 2>&1 <<'SQL' &
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-0000000000a1', true);
SET LOCAL ROLE authenticated;
UPDATE public.sp_experience_periods SET role_title = 'Säkerhetschef', started_on = current_date - 3000
 WHERE id = 'b8000000-4444-4000-8000-0000000000a1';
SELECT pg_sleep(2);
COMMIT;
SQL
SR_PID=$!
sleep 0.5
SR_T0=$(date +%s%N)
set +e
SR_RACE_OUT="$(psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" 2>&1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-0000000000c1', true);
SET LOCAL ROLE authenticated;
SELECT public.sp_verifier_decide_reviewed('b8000000-5555-4000-8000-0000000000a1', '${SR_SEEN}',
  'approved', 'document_review', 'race', NULL, NULL, NULL);
COMMIT;
SQL
)"
set -e
SR_T1=$(date +%s%N)
wait "$SR_PID" || true
SR_AFTER="$(psql -tAq -d "$TEST_DB" -c "select p.assertion_level || '|' || r.status || '|' || (r.answered_at is not null) from public.sp_experience_periods p join public.sp_verification_requests r on r.period_id = p.id where r.id = 'b8000000-5555-4000-8000-0000000000a1'")"
SR_WAIT=$(( (SR_T1 - SR_T0) / 1000000 ))
psql_q -d "$TEST_DB" >/dev/null <<'SQL'
SET session_replication_role = replica;
DELETE FROM public.sp_verification_decisions WHERE request_id = 'b8000000-5555-4000-8000-0000000000a1';
DELETE FROM public.sp_verification_requests WHERE id = 'b8000000-5555-4000-8000-0000000000a1';
DELETE FROM public.sp_passport_events WHERE holder_user_id = 'b8000000-0000-4000-8000-0000000000a1';
DELETE FROM public.sp_experience_periods WHERE id = 'b8000000-4444-4000-8000-0000000000a1';
DELETE FROM public.sp_passport_profiles WHERE holder_user_id = 'b8000000-0000-4000-8000-0000000000a1';
DELETE FROM public.user_roles WHERE user_id = 'b8000000-0000-4000-8000-0000000000c1';
DELETE FROM auth.users WHERE id IN ('b8000000-0000-4000-8000-0000000000a1', 'b8000000-0000-4000-8000-0000000000c1');
SQL
if echo "$SR_RACE_OUT" | grep -q "SP_REVIEW_STALE" && [ "$SR_AFTER" = "self_declared|pending|true" ] && [ "$SR_WAIT" -ge 1000 ]; then
  echo "    ok  the stale decision waited ${SR_WAIT} ms on the request row, then was refused; the answer stands unverified and in review"
else
  echo "FAIL: the answer/decision race did not settle on the refusal (out='$(echo "$SR_RACE_OUT" | grep -oE 'SP_[A-Z_]+' | head -1)' state=${SR_AFTER} waited=${SR_WAIT}ms)." >&2
  exit 1
fi
set +e
SR_OUT="$(run_sr_suite)"; SR_RC=$?
set -e
[ "$SR_RC" -eq 0 ] || { echo "$SR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: reviewed-content suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  reviewed-content migration re-applied (postflight proved); suite passes again"

# 20270126090000: evidence attached while a review is open binds the decision
# too (SR6 of the same suite). Negative controls, each of which MUST make the
# suite fail on an assertion:
#   EV NC1  the real rollback                                      -> SR6.1
#   EV NC2  the attachment no longer moves the request's version    -> SR6.1
EV_MIG=supabase/migrations/20270126090000_sp_evidence_change_under_review.sql
EV_RB=supabase/rollback/20270126090000_sp_evidence_change_under_review_rollback.sql
ev_nc_expect_fail() {
  local label="$1"
  set +e
  local out; out="$(run_sr_suite)"; local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: SR6"; then
    echo "FAIL: evidence-under-review negative control '${label}': the suite did not fail at SR6 -- it proves nothing" >&2
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o 'ASSERTION FAILED: SR[0-9a-z.]*' | head -1))"
}
echo "==> Running Passport evidence-under-review assertions"
SR_OUT="$(run_sr_suite)"
echo "$SR_OUT" | grep -q "ok  SR6.3 " || { echo "$SR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: SR6 did not pass with 20270126090000 applied" >&2; exit 1; }
echo "    ok  SR6 passes: a page loaded before a new document is refused, the reload approves"
psql_q -d "$TEST_DB" -f "$EV_RB" >/dev/null
ev_nc_expect_fail "EV NC1 full rollback"
psql_q -d "$TEST_DB" -f "$EV_MIG" >/dev/null
EV_NC2_SQL="$(sed -n '/^CREATE OR REPLACE FUNCTION public.sp_attach_evidence/,/^END; \$function\$$/p' "$EV_MIG" \
  | sed 's/^   WHERE r\.status IN (/   WHERE false AND r.status IN (/')"
grep -q "WHERE false AND r.status IN" <<<"$EV_NC2_SQL" \
  || { echo "FAIL: evidence-under-review NC2 could not plant its defect" >&2; exit 1; }
psql_q -d "$TEST_DB" -c "$EV_NC2_SQL" >/dev/null
ev_nc_expect_fail "EV NC2 attachment leaves the version"
psql_q -d "$TEST_DB" -f "$EV_MIG" >/dev/null
set +e
SR_OUT="$(run_sr_suite)"; SR_RC=$?
set -e
[ "$SR_RC" -eq 0 ] || { echo "$SR_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: evidence-under-review suite does not pass after re-apply" >&2; exit 1; }
echo "    ok  evidence-under-review migration re-applied (postflight proved); suite passes again"
# ---------------------------------------------------------------------------
# The access model, proved once more on the state the older migrations' cycles left behind
#
# The suites at the top ran on the freshly replayed chain. Since then dozens of older migrations were
# rolled back and re-applied, and the three access migrations re-applied after each of those that
# overlaps them. The same four suites must still pass, unchanged, on what is left: this is the last
# point before the Passport, Security Work and BESKT rollback blocks tear parts of the schema down (which
# is also why it cannot run at the very end). The BESKT stand-down cycles further down are deliberately
# NOT restored: their migrations pin function bodies, so the model is not applied inside them, and the
# suites that run there hold on both sides of the model.
# ---------------------------------------------------------------------------
echo "==> Re-running the access model suites on the state the older migrations left behind"
ac_restore_model
ac_expect_pass "employer membership standing (after the cycles)" employer_membership_standing_test.sql 43
ac_expect_pass "employer report access matrix (after the cycles)" employer_report_access_matrix_test.sql 63
ac_expect_pass "employer report access model (after the cycles)" employer_report_access_model_test.sql 66
ac_expect_pass "interview case access model (after the cycles)" interview_case_access_model_test.sql 43

# Preserve an empty, fully migrated database for destructive historical rollback
# proofs. Later suites legitimately adopt international credentials; a rollback
# of their catalogue must refuse, not erase those fixtures to make a test pass.
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB}_pristine;" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB}_pristine TEMPLATE ${TEST_DB};" >/dev/null

# Programme extension (20270117090000) depends on the analysis contract and
# the foundation, so it is proven and stood down first. Its rollback must
# refuse adopted programme records and restore the previous lifecycle body.
echo "==> Running Security Work programme assertions"
SWP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_programme_test.sql 2>&1)" || { echo "$SWP_OUT"; exit 1; }
SWP_PASSED="$(printf '%s\n' "$SWP_OUT" | grep -c 'NOTICE:  ok  SW-PROG ' || true)"
[ "$SWP_PASSED" -ge 56 ] || { echo "$SWP_OUT"; echo "FAIL: Security Work programme assertion shortfall: $SWP_PASSED (floor 56)"; exit 1; }
echo "    ok  $SWP_PASSED Security Work programme assertions passed"
SWP_LOG="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -v sw_programme_keep_fixture=true -d "$TEST_DB" -f supabase/tests/security_work_programme_test.sql -c 'RESET ROLE;' -f supabase/rollback/20270117090000_security_work_programme_rollback.sql >"$SWP_LOG" 2>&1; then
  cat "$SWP_LOG"; rm -f "$SWP_LOG"; echo 'FAIL: adopted programme rollback succeeded'; exit 1
fi
grep -q 'SW_PROGRAMME_ROLLBACK_DATA_PRESENT' "$SWP_LOG" || { cat "$SWP_LOG"; rm -f "$SWP_LOG"; exit 1; }
rm -f "$SWP_LOG"
echo '    ok  programme rollback preserves adopted work'
SWP_LIFECYCLE_BEFORE="$(psql_q -d "$TEST_DB" -Atc "SELECT md5(pg_get_functiondef('sw_private.guard_lifecycle()'::regprocedure))")"
psql_q -d "$TEST_DB" -f supabase/rollback/20270117090000_security_work_programme_rollback.sql >/dev/null
SWP_LEFT="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sw_security_mandates','sw_protected_assets','sw_risk_assets','sw_baseline_assessments','sw_baseline_answers','sw_gaps','sw_evidence_links','sw_ai_suggestions','sw_programme_plans','sw_management_reports')) + (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='sw_risks' AND column_name IN ('owner_id','threat_scenario','source_kind')) OR (table_name='sw_actions' AND column_name IN ('gap_id','asset_id','source_kind','approval_required','approval_note'))))")"
[ "$SWP_LEFT" = 0 ] || { echo "FAIL: programme rollback left $SWP_LEFT object(s)"; exit 1; }
SWP_LIFECYCLE_AFTER="$(psql_q -d "$TEST_DB" -Atc "SELECT md5(pg_get_functiondef('sw_private.guard_lifecycle()'::regprocedure))")"
[ "$SWP_LIFECYCLE_BEFORE" != "$SWP_LIFECYCLE_AFTER" ] || { echo "FAIL: programme rollback did not restore the previous lifecycle body"; exit 1; }
echo '    ok  programme stood down; previous lifecycle body restored'

# Analysis/document extension rolls back before its foundation dependency.
echo "==> Running Security Work analysis contract assertions"
SWA_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_analysis_contract_test.sql 2>&1)" || { echo "$SWA_OUT"; exit 1; }
SWA_PASSED="$(printf '%s\n' "$SWA_OUT" | grep -c 'NOTICE:  ok ' || true)"
[ "$SWA_PASSED" -ge 69 ] || { echo "$SWA_OUT"; echo 'FAIL: analysis assertion shortfall'; exit 1; }
echo "    ok  $SWA_PASSED analysis assertions passed"
SWA_LOG="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -v sw_analysis_keep_fixture=true -d "$TEST_DB" -f supabase/tests/security_work_analysis_contract_test.sql -f supabase/rollback/20261211090000_security_work_analysis_contract_rollback.sql >"$SWA_LOG" 2>&1; then
  cat "$SWA_LOG"; rm -f "$SWA_LOG"; echo 'FAIL: adopted analysis rollback succeeded'; exit 1
fi
grep -q 'SW_ANALYSIS_ROLLBACK_DATA_PRESENT' "$SWA_LOG" || { cat "$SWA_LOG"; rm -f "$SWA_LOG"; exit 1; }
rm -f "$SWA_LOG"
echo '    ok  analysis rollback preserves adopted work'
psql_q -d "$TEST_DB" -c 'CREATE VIEW public.sw_analysis_dependency_probe AS SELECT id FROM public.sw_documents;' >/dev/null
SWA_LOG="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -d "$TEST_DB" -f supabase/rollback/20261211090000_security_work_analysis_contract_rollback.sql >"$SWA_LOG" 2>&1; then
 cat "$SWA_LOG"; rm -f "$SWA_LOG"; echo 'FAIL: dependent analysis rollback succeeded'; exit 1
fi
grep -q '2BP01' "$SWA_LOG" || { cat "$SWA_LOG"; rm -f "$SWA_LOG"; exit 1; }
rm -f "$SWA_LOG"
psql_q -d "$TEST_DB" -c 'DROP VIEW public.sw_analysis_dependency_probe;' >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261211090000_security_work_analysis_contract_rollback.sql >/dev/null
echo '    ok  analysis dependency refusal is atomic; pre-adoption rollback succeeds'

# Security Work is an independent workspace boundary. Execute its real-role
# suite before and after an actual stand-down, and prove the protections fail
# under the transaction-local planted defects. No adopted work is discarded.
for sw_round in before after; do
  echo "==> Running Security Work foundation assertions (${sw_round} rollback/reapply)"
  SW_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_foundation_test.sql 2>&1)" || { echo "$SW_OUT"; exit 1; }
  SW_PASSED="$(printf '%s\n' "$SW_OUT" | grep -c 'NOTICE:  ok  ' || true)"
  [ "$SW_PASSED" -ge 322 ] || { echo "$SW_OUT"; echo "FAIL: Security Work foundation assertion shortfall: $SW_PASSED (floor 322)"; exit 1; }
  echo "    ok  $SW_PASSED Security Work foundation assertions passed"

  if [ "$sw_round" = before ]; then
    echo "==> Proving Security Work planted defects are detected"
    SW_NC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_negative_controls.sql 2>&1)" || { echo "$SW_NC_OUT"; exit 1; }
    SW_NC_PASSED="$(printf '%s\n' "$SW_NC_OUT" | grep -c 'NOTICE:  ok  SW-NC ' || true)"
    [ "$SW_NC_PASSED" -ge 12 ] || { echo "$SW_NC_OUT"; echo "FAIL: Security Work negative-control shortfall: $SW_NC_PASSED (floor 12)"; exit 1; }
    echo "    ok  $SW_NC_PASSED Security Work mutations detected by their original assertions"

    echo "==> Proving Security Work rollback preserves adopted work"
    SW_ADOPTED_OUT="$(mktemp)"
    if psql -v ON_ERROR_STOP=1 -v sw_keep_fixture=true -d "$TEST_DB" \
      -f supabase/tests/security_work_foundation_test.sql -c 'RESET ROLE;' \
      -f supabase/rollback/20261210090000_security_work_foundation_rollback.sql >"$SW_ADOPTED_OUT" 2>&1; then
      cat "$SW_ADOPTED_OUT"; rm -f "$SW_ADOPTED_OUT"
      echo "FAIL: Security Work rollback accepted an adopted workspace"; exit 1
    fi
    if ! grep -q 'ERROR:  SW_ROLLBACK_DATA_PRESENT:' "$SW_ADOPTED_OUT"; then
      cat "$SW_ADOPTED_OUT"; rm -f "$SW_ADOPTED_OUT"
      echo "FAIL: adopted Security Work rollback failed for the wrong reason"; exit 1
    fi
    rm -f "$SW_ADOPTED_OUT"
    echo "    ok  rollback refused adopted work; its synthetic transaction was discarded"

    # A future dependency must block the entire rollback, never be removed by
    # CASCADE or leave half the foundation standing after a later DROP fails.
    psql_q -d "$TEST_DB" -c 'CREATE VIEW public.sw_rollback_dependency_probe AS SELECT id FROM public.sw_sources;' >/dev/null
    SW_DEPENDENCY_OUT="$(mktemp)"
    if psql -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -d "$TEST_DB" \
      -f supabase/rollback/20261210090000_security_work_foundation_rollback.sql >"$SW_DEPENDENCY_OUT" 2>&1; then
      cat "$SW_DEPENDENCY_OUT"; rm -f "$SW_DEPENDENCY_OUT"
      echo "FAIL: Security Work rollback silently removed a planted dependency"; exit 1
    fi
    if ! grep -q '2BP01' "$SW_DEPENDENCY_OUT"; then
      cat "$SW_DEPENDENCY_OUT"; rm -f "$SW_DEPENDENCY_OUT"
      echo "FAIL: Security Work dependency refusal failed for the wrong reason"; exit 1
    fi
    rm -f "$SW_DEPENDENCY_OUT"
    SW_PRESERVED="$(psql_q -d "$TEST_DB" -Atc "SELECT (to_regclass('public.sw_rollback_dependency_probe') IS NOT NULL) AND (to_regclass('public.sw_record_versions') IS NOT NULL) AND (to_regprocedure('public.sw_create_personal_workspace(text)') IS NOT NULL)")"
    [ "$SW_PRESERVED" = t ] || { echo "FAIL: dependency refusal left a partial Security Work rollback"; exit 1; }
    psql_q -d "$TEST_DB" -c 'DROP VIEW public.sw_rollback_dependency_probe;' >/dev/null
    echo "    ok  dependency refused the whole rollback; earlier drops were rolled back"

    psql_q -d "$TEST_DB" -f supabase/rollback/20261210090000_security_work_foundation_rollback.sql >/dev/null
    SW_LEFT="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='sw_private') + (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'sw\_%') + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sw\_%')")"
    [ "$SW_LEFT" = 0 ] || { echo "FAIL: Security Work rollback left $SW_LEFT object(s)"; exit 1; }
    echo "    ok  Security Work stood down: no private schema, public relation or RPC remains"
    psql_q -d "$TEST_DB" -f supabase/migrations/20261210090000_security_work_foundation.sql >/dev/null
    echo "    ok  Security Work foundation reapplied"
  fi
done

psql_q -d "$TEST_DB" -f supabase/migrations/20261211090000_security_work_analysis_contract.sql >/dev/null
SWA_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_analysis_contract_test.sql -f supabase/tests/security_work_foundation_test.sql 2>&1)" || { echo "$SWA_OUT"; exit 1; }
echo '    ok  analysis reapplied; extension and foundation assertions pass together'
psql_q -d "$TEST_DB" -f supabase/migrations/20270117090000_security_work_programme.sql >/dev/null
SWP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_work_programme_test.sql -f supabase/tests/security_work_analysis_contract_test.sql -f supabase/tests/security_work_foundation_test.sql 2>&1)" || { echo "$SWP_OUT"; exit 1; }
echo '    ok  programme reapplied; programme, analysis and foundation assertions pass together'

# Race fixtures commit to coordinate independent sessions. Give them their own
# clone so no persistent synthetic workspace can affect later rollback proofs.
echo "==> Running Security Work two-connection concurrency proofs"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB}_sw_race;" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB}_sw_race TEMPLATE ${TEST_DB}_pristine;" >/dev/null
PGDATABASE="${TEST_DB}_sw_race" bash scripts/security-work-concurrency-test.sh
PGDATABASE="${TEST_DB}_sw_race" bash scripts/security-work-analysis-concurrency-test.sh
psql_q -d postgres -c "DROP DATABASE ${TEST_DB}_sw_race;" >/dev/null

# International Passport: test fixtures roll back; rollback refuses adoption.
for passport_round in before after; do
  for passport_suite in international_foundation international_wallet credential_sharing_v2 closed_catalogue organisation_roles pilot_scope catalogue_completeness hayat_assessments india_national_qualifications public_pilot_availability open_uk_dubai catalogue_research; do
    passport_output="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "supabase/tests/security_passport_${passport_suite}_test.sql" 2>&1)" || { echo "$passport_output"; exit 1; }
    passport_count="$(printf '%s\n' "$passport_output" | grep -c 'NOTICE:  ok ' || true)"
    echo "    $passport_count assertions passed: Passport $passport_suite ($passport_round rollback/reapply)"
  done
  if [ "$passport_round" = before ]; then
    # 20270212090000 / 20270213090000 / 20270214090000 (the certification research
    # integration: foundation, import, publication) are the newest Passport units
    # and stand down FIRST, publication, then import, then foundation. The
    # publication only withdraws the definitions from NEW registration; the import
    # removes exactly what it added; the foundation refuses while anything depends
    # on it. Each must leave nothing behind and the suite must notice.
    psql_q -d "$TEST_DB" -f "supabase/rollback/20270214090000_sp_catalogue_research_publish_rollback.sql" >/dev/null
    rs_active="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM public.sp_credential_types WHERE code LIKE 'INTL\_%' AND is_active")"
    [ "$rs_active" = "14" ] || { echo "FAIL: 20270214090000 rollback left $rs_active active international definitions, expected the original 14"; exit 1; }
    echo "    ok  the research publication withdrawn: only the original 14 international definitions are selectable"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_catalogue_research_test.sql >/dev/null 2>&1; then
      echo "FAIL: the research suite passed WITHOUT its publication -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the research suite refuses to pass without the publication (negative control)"
    if psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/rollback/20270212090000_sp_catalogue_research_foundation_rollback.sql" >/dev/null 2>&1; then
      echo "FAIL: the foundation rollback ran while the import still existed" >&2
      exit 1
    fi
    echo "    ok  the foundation rollback refuses while the import exists, and changes nothing"
    psql_q -d "$TEST_DB" -f "supabase/rollback/20270213090000_sp_catalogue_research_import_rollback.sql" >/dev/null
    rs_import_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_catalogue_research_records) + (SELECT count(*) FROM public.sp_credential_types WHERE code LIKE 'INTL\_%') - 14 + (SELECT count(*) FROM public.sp_certification_issuers) - 5 + (SELECT count(*) FROM public.sp_certification_definitions) - 14")"
    [ "$rs_import_left" = "0" ] || { echo "FAIL: 20270213090000 rollback left a residue ($rs_import_left)"; exit 1; }
    echo "    ok  the research import stood down: no record, definition or issuer it added remains"
    psql_q -d "$TEST_DB" -f "supabase/rollback/20270212090000_sp_catalogue_research_foundation_rollback.sql" >/dev/null
    rs_found_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (to_regclass('public.sp_catalogue_research_records') IS NOT NULL)::int + (to_regclass('public.sp_catalogue_requests') IS NOT NULL)::int + (to_regclass('public.sp_certification_definition_aliases') IS NOT NULL)::int + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_catalogue_unavailable_matches','sp_request_catalogue_definition','sp_list_my_catalogue_requests','sp_admin_resolve_catalogue_request','sp_admin_review_research_record','sp_catalogue_research_provenance_immutable')) + (SELECT count(*) FROM public.sp_credential_classes) - 8")"
    [ "$rs_found_left" = "0" ] || { echo "FAIL: 20270212090000 rollback left $rs_found_left object(s) behind"; exit 1; }
    echo "    ok  the research foundation stood down: no table, function or class remains"
    # 20261221090000 (the UK and Dubai opened as a public pilot) is DATA only
    # and the newest Passport migration: it stands down FIRST, returning the
    # three markets and their 44 definitions to internal pilot and touching no
    # claim and no grant. It must refuse a second run, and the suite that
    # proves the opened state must fail without it.
    ou_out="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql" 2>&1)" || { echo "$ou_out"; exit 1; }
    printf '%s' "$ou_out" | grep -q 'SP_OPEN_UK_DUBAI_ROLLBACK ok' || { echo "FAIL: 20261221090000 rollback did not prove itself: $ou_out"; exit 1; }
    ou_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_market_packs WHERE pilot_state='public_pilot') + (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state='public_pilot') || '/' || (SELECT count(*) FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU') AND pilot_state='internal_pilot') || '/' || (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU') AND pilot_state='internal_pilot')")"
    [ "$ou_left" = "0/3/44" ] || { echo "FAIL: 20261221090000 rollback left public_pilot/internal counts $ou_left, expected 0/3/44"; exit 1; }
    echo "    ok  the UK and Dubai stood down to internal pilot: no public_pilot row left, 3 packs and 44 definitions members-only again"
    if psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql" >/dev/null 2>&1; then
      echo "FAIL: the 20261221090000 rollback ran twice" >&2
      exit 1
    fi
    echo "    ok  and it refuses to run a second time"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_open_uk_dubai_test.sql >/dev/null 2>&1; then
      echo "FAIL: the open-UK-and-Dubai suite passed WITHOUT its migration -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the open-UK-and-Dubai suite refuses to pass without the migration (negative control)"
    # 20261220090000 (public-pilot availability) stands down next: it replaces the view, the claim rules,
    # the read policy and sp_market_access() that India left, and widens the two
    # pilot_state CHECKs. Its rollback must REFUSE while any market is
    # public_pilot (narrowing the CHECK under those rows would abort half-way),
    # then restore every body verbatim.
    pp_refused="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "BEGIN;" \
      -c "UPDATE public.sp_market_packs SET pilot_state='public_pilot' WHERE code='GB';" \
      -f "supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql" 2>&1)" \
      && { echo "FAIL: 20261220090000 rollback ran while a market was public_pilot"; exit 1; }
    printf '%s' "$pp_refused" | grep -q 'ROLLBACK REFUSED' || { echo "FAIL: 20261220090000 rollback failed for another reason: $pp_refused"; exit 1; }
    pp_intact="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT pilot_state FROM public.sp_market_packs WHERE code='GB') || '/' || (position('public_pilot' IN pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)) > 0)::int")"
    [ "$pp_intact" = "internal_pilot/1" ] || { echo "FAIL: the refused 20261220090000 rollback changed something ($pp_intact)"; exit 1; }
    echo "    ok  the public-pilot rollback refuses while a market is public_pilot, and changes nothing"
    psql_q -d "$TEST_DB" -f "supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql" >/dev/null
    pp_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (position('public_pilot' IN pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)) > 0)::int + (SELECT count(*) FROM pg_policies WHERE policyname='sp_credential_types_read' AND position('public_pilot' IN qual) > 0) + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_market_access','sp_claims_credential_rules') AND (position('public_pilot' IN prosrc) > 0 OR position('_asserts' IN prosrc) > 0)) + (SELECT count(*) FROM pg_constraint WHERE conname IN ('sp_market_pack_pilot_state_known','sp_credential_type_pilot_state_known') AND position('public_pilot' IN pg_get_constraintdef(oid)) > 0)")"
    [ "$pp_left" = "0" ] || { echo "FAIL: 20261220090000 rollback left $pp_left public-pilot clause(s) behind"; exit 1; }
    echo "    ok  public-pilot availability stood down: no public_pilot state, branch or operation policy remains"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_public_pilot_availability_test.sql >/dev/null 2>&1; then
      echo "FAIL: the public-pilot suite passed WITHOUT its migration -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the public-pilot suite refuses to pass without the migration (negative control)"
    # 20261214090000 (India national qualifications) stands down next: it replaces the catalogue view, the claim
    # rules, the details guard, the save RPC and the reviewer detail, and every
    # rollback below restores the text IT restored. It must restore them
    # verbatim, and leave no Indian row, scope, class or version behind.
    psql_q -d "$TEST_DB" -f "supabase/rollback/20261214090000_sp_india_national_qualifications_rollback.sql" >/dev/null
    india_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_credential_types WHERE jurisdiction_code='IN') + (SELECT count(*) FROM public.sp_jurisdictions WHERE code='IN') + (SELECT count(*) FROM public.sp_credential_scopes WHERE code='national_qualification') + (SELECT count(*) FROM public.sp_credential_classes WHERE code='vocational_qualification') + (to_regclass('public.sp_credential_definition_versions') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_credential_details' AND column_name='definition_version') + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_save_international_credential','sp_claims_credential_rules','sp_closed_catalogue_details_guard','sp_verifier_request_detail') AND (prosrc LIKE '%national_qualification%' OR prosrc LIKE '%definition_version%')) + (position('national_qualification' IN pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)) > 0)::int")"
    [ "$india_left" = "0" ] || { echo "FAIL: 20261214090000 rollback left $india_left India object(s) or clause(s) behind"; exit 1; }
    echo "    ok  India national qualifications stood down: no IN row, scope, class, version table, version key or national_qualification clause remains"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_india_national_qualifications_test.sql >/dev/null 2>&1; then
      echo "FAIL: the India suite passed WITHOUT its migration -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the India suite refuses to pass without the migration (negative control)"
    # 20261204090000 (HAYAT assessments) stands down next: its triggers sit on sp_claims and sp_evidence, and every
    # rollback below must run against a database that no longer carries them.
    psql_q -d "$TEST_DB" -f "supabase/rollback/20261204090000_sp_hayat_assessments_rollback.sql" >/dev/null
    hayat_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (to_regclass('public.sp_hayat_assessments') IS NOT NULL)::int + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sp\_hayat\_%') + (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'sp\_hayat\_%')")"
    [ "$hayat_left" = "0" ] || { echo "FAIL: 20261204090000 rollback left $hayat_left HAYAT object(s) behind"; exit 1; }
    echo "    ok  HAYAT assessments rollback stood down: no table, function or trigger left"
    # 20261126090000 (scoped + document-issuer definitions, Dubai roles) is the
    # newest and rolls back first. It must STAND DOWN too: the view withholds
    # scoped definitions again, the RPC knows no scope key, the Dubai rows go.
    psql_q -d "$TEST_DB" -f "supabase/rollback/20261126090000_sp_catalogue_scope_and_document_issuer_rollback.sql" >/dev/null
    cat_view="$(psql_q -d "$TEST_DB" -Atc "SELECT pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)")"
    printf '%s' "$cat_view" | grep -q 'document_specific' && { echo "FAIL: 20261126090000 rollback left the document-issuer clause in sp_approved_credential_catalogue"; exit 1; }
    printf '%s' "$cat_view" | grep -q 'requires_scope' || { echo "FAIL: 20261126090000 rollback did not restore NOT requires_scope in sp_approved_credential_catalogue"; exit 1; }
    save_fn="$(psql_q -d "$TEST_DB" -Atc "SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'sp_save_international_credential' AND pronamespace = 'public'::regnamespace")"
    printf '%s' "$save_fn" | grep -q 'authorisation_scope' && { echo "FAIL: 20261126090000 rollback left the scope key in sp_save_international_credential"; exit 1; }
    du_roles="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM public.sp_credential_organisation_roles r JOIN public.sp_credential_types t ON t.code = r.credential_code WHERE t.market_pack_code = 'AE-DU'")"
    [ "$du_roles" = "0" ] || { echo "FAIL: 20261126090000 rollback left $du_roles Dubai organisation-role rows"; exit 1; }
    echo "    ok  catalogue-completeness rollback stood down: scoped definitions withheld, no scope key, no Dubai role rows"
    # DEPLOYMENT COMPATIBILITY: this is the database the owner project has BEFORE
    # 20261126090000. The new application must not be able to lose a required
    # scope or issuer against it: the old RPC refuses such a request whole.
    compat_output="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_catalogue_old_rpc_compat_test.sql 2>&1)" || { echo "$compat_output"; exit 1; }
    compat_count="$(printf '%s\n' "$compat_output" | grep -c 'NOTICE:  ok ' || true)"
    [ "$compat_count" -ge 5 ] || { echo "old-RPC compatibility assertion shortfall: $compat_count"; exit 1; }
    echo "    $compat_count assertions passed: new application against the OLD save RPC (nothing silently discarded)"
    # The two pilot-finish rollbacks go first, and must STAND THE CHANGE DOWN,
    # not merely run: no pilot membership in the catalogue view, no scope_code
    # in the payload. Checked HERE, before 20261121090000's rollback drops the
    # view and 20261120090000's drops the payload function altogether.
    for passport_migration in 20261125090000_sp_disclosure_definition_scope 20261124090000_sp_pilot_member_catalogue; do
      psql_q -d "$TEST_DB" -f "supabase/rollback/${passport_migration}_rollback.sql" >/dev/null
    done
    pilot_view="$(psql_q -d "$TEST_DB" -Atc "SELECT pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)")"
    printf '%s' "$pilot_view" | grep -q 'sp_is_pilot_member' && { echo "FAIL: 20261124090000 rollback left pilot membership in sp_approved_credential_catalogue"; exit 1; }
    scope_fn="$(psql_q -d "$TEST_DB" -Atc "SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'sp_credential_payload_v2' AND pronamespace = 'public'::regnamespace")"
    printf '%s' "$scope_fn" | grep -q 'scope_code' && { echo "FAIL: 20261125090000 rollback left scope_code in sp_credential_payload_v2"; exit 1; }
    echo "    ok  pilot-finish rollbacks stood down: catalogue view without pilot membership, payload without scope_code"
    for passport_migration in 20261123090000_sp_credential_organisation_roles 20261121090000_sp_closed_credential_catalogue 20261120090000_sp_credential_selective_sharing_v2 20261119090000_sp_international_credential_wallet 20261118100000_sp_international_passport_foundation; do
      psql_q -d "$TEST_DB" -f "supabase/rollback/${passport_migration}_rollback.sql" >/dev/null
    done
    for passport_migration in 20261118100000_sp_international_passport_foundation 20261119090000_sp_international_credential_wallet 20261120090000_sp_credential_selective_sharing_v2 20261121090000_sp_closed_credential_catalogue 20261123090000_sp_credential_organisation_roles 20261124090000_sp_pilot_member_catalogue 20261125090000_sp_disclosure_definition_scope 20261126090000_sp_catalogue_scope_and_document_issuer; do
      psql_q -d "$TEST_DB" -f "supabase/migrations/${passport_migration}.sql" >/dev/null
    done
    pilot_view="$(psql_q -d "$TEST_DB" -Atc "SELECT pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)")"
    printf '%s' "$pilot_view" | grep -q 'sp_is_pilot_member' || { echo "FAIL: 20261124090000 reapply did not restore pilot membership in sp_approved_credential_catalogue"; exit 1; }
    scope_fn="$(psql_q -d "$TEST_DB" -Atc "SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'sp_credential_payload_v2' AND pronamespace = 'public'::regnamespace")"
    printf '%s' "$scope_fn" | grep -q 'scope_code' || { echo "FAIL: 20261125090000 reapply did not restore scope_code in sp_credential_payload_v2"; exit 1; }
    echo "    ok  pilot-finish migrations reapplied: catalogue view with pilot membership, payload with scope_code"
    cat_view="$(psql_q -d "$TEST_DB" -Atc "SELECT pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)")"
    printf '%s' "$cat_view" | grep -q 'document_specific' || { echo "FAIL: 20261126090000 reapply did not restore the document-issuer clause"; exit 1; }
    save_fn="$(psql_q -d "$TEST_DB" -Atc "SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'sp_save_international_credential' AND pronamespace = 'public'::regnamespace")"
    printf '%s' "$save_fn" | grep -q 'authorisation_scope' || { echo "FAIL: 20261126090000 reapply did not restore the scope key"; exit 1; }
    du_roles="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM public.sp_credential_organisation_roles r JOIN public.sp_credential_types t ON t.code = r.credential_code WHERE t.market_pack_code = 'AE-DU'")"
    [ "$du_roles" = "104" ] || { echo "FAIL: 20261126090000 reapply seeded $du_roles Dubai organisation-role rows, expected 104"; exit 1; }
    echo "    ok  catalogue-completeness migration reapplied: document-issuer clause, scope key, 104 Dubai role rows"
    psql_q -d "$TEST_DB" -f "supabase/migrations/20261204090000_sp_hayat_assessments.sql" >/dev/null
    hayat_back="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'sp\_hayat\_%') || '/' || has_function_privilege('service_role','public.sp_hayat_record_assessment(uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer)','EXECUTE')::int || has_function_privilege('authenticated','public.sp_hayat_record_assessment(uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer)','EXECUTE')::int || has_function_privilege('anon','public.sp_hayat_current_assessment(uuid)','EXECUTE')::int")"
    [ "$hayat_back" = "3/100" ] || { echo "FAIL: 20261204090000 reapply: expected 3 triggers and the writer granted to service_role only, got $hayat_back"; exit 1; }
    echo "    ok  HAYAT assessments reapplied: 3 triggers, writer executable by service_role only, reader closed to anon"
    psql_q -d "$TEST_DB" -f "supabase/migrations/20261214090000_sp_india_national_qualifications.sql" >/dev/null
    india_back="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_credential_types WHERE jurisdiction_code='IN' AND scope_code='national_qualification' AND is_active) || '/' || (SELECT count(*) FROM public.sp_market_packs WHERE jurisdiction_code='IN') || '/' || has_table_privilege('anon','public.sp_credential_definition_versions','SELECT')::int")"
    [ "$india_back" = "4/0/0" ] || { echo "FAIL: 20261214090000 reapply: expected 4 active national qualifications, no IN market pack and no anon read, got $india_back"; exit 1; }
    echo "    ok  India national qualifications reapplied: 4 approved, no IN market pack, versions closed to anon"
    pp_back="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/migrations/20261220090000_sp_public_pilot_availability.sql" 2>&1)" || { echo "$pp_back"; exit 1; }
    printf '%s' "$pp_back" | grep -q 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF ok' || { echo "FAIL: 20261220090000 did not re-apply on top of its rollback"; exit 1; }
    echo "    ok  public-pilot availability reapplied on top of India: proof ok, nothing moved"
    ou_back="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/migrations/20261221090000_sp_open_uk_dubai_public_pilot.sql" 2>&1)" || { echo "$ou_back"; exit 1; }
    printf '%s' "$ou_back" | grep -q 'SP_OPEN_UK_DUBAI_PROOF ok' || { echo "FAIL: 20261221090000 did not re-apply on top of its rollback"; exit 1; }
    echo "    ok  the UK and Dubai reopened as a public pilot on top of the availability model: proof ok"
    # The certification research integration, back on top: foundation, import, publication.
    for rs_migration in 20270212090000_sp_catalogue_research_foundation 20270213090000_sp_catalogue_research_import 20270214090000_sp_catalogue_research_publish; do
      psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/migrations/${rs_migration}.sql" >/dev/null 2>&1 || { echo "FAIL: ${rs_migration} did not re-apply on top of its rollback"; exit 1; }
    done
    rs_back="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_catalogue_research_records) || '/' || (SELECT count(*) FROM public.sp_credential_types WHERE code LIKE 'INTL\_%' AND is_active)")"
    [ "$rs_back" = "170/154" ] || { echo "FAIL: the research integration re-applied to $rs_back, expected 170 records and 154 active international definitions"; exit 1; }
    echo "    ok  the research integration reapplied from nothing: 170 records, 154 active international definitions"
  fi
done

# Negative controls for the certification research suite. Each plants ONE defect in
# a throwaway clone of the finished database and requires the suite to fail on a
# NAMED assertion; a control that changes nothing, or that fails elsewhere, proves
# nothing and stops the run. Nothing needs restoring: the clone is dropped.
RS_FOUNDATION=supabase/migrations/20270212090000_sp_catalogue_research_foundation.sql
RS_SUITE=supabase/tests/security_passport_catalogue_research_test.sql
rs_fn() { sed -n "/^CREATE OR REPLACE FUNCTION public.$1(/,/^END \$fn\$;/p" "$RS_FOUNDATION"; }
rs_nc_expect_fail() {
  local label="$1" expect="$2" mutation="$3"
  local ncdb="${TEST_DB}_rs_nc"
  psql_q -d postgres -c "DROP DATABASE IF EXISTS ${ncdb};" >/dev/null
  psql_q -d postgres -c "CREATE DATABASE ${ncdb} TEMPLATE ${TEST_DB};" >/dev/null
  psql_q -d "$ncdb" -c "$mutation" >/dev/null
  set +e
  local out; out="$(psql -v ON_ERROR_STOP=1 -d "$ncdb" -f "$RS_SUITE" 2>&1)"; local rc=$?
  set -e
  psql_q -d postgres -c "DROP DATABASE ${ncdb};" >/dev/null
  if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: ${expect} "; then
    echo "FAIL: research negative control '${label}': the suite did not fail on ${expect} -- it proves nothing" >&2
    echo "$out" | grep -E "ERROR|FAILED" | head -3 >&2 || true
    exit 1
  fi
  echo "    ok  NC ${label}: the suite fails (ASSERTION FAILED: ${expect})"
}
rs_planted() {
  local fn="$1" from="$2" to="$3" orig mutated
  orig="$(rs_fn "$fn")"
  mutated="$(printf '%s' "$orig" | sed "s/$from/$to/")"
  if [ -z "$orig" ] || [ "$mutated" = "$orig" ]; then
    echo "FAIL: research negative control anchor not found in $fn: $from" >&2
    exit 1
  fi
  printf '%s' "$mutated"
}
echo "==> Running the certification research negative controls"
rs_nc_expect_fail "RS NC1 a holder may decide a research record" RS9.2 "$(rs_planted sp_admin_review_research_record 'IF NOT public.is_platform_admin(_caller) THEN' 'IF false THEN')"
rs_nc_expect_fail "RS NC2 a holder may resolve a request" RS9.1 "$(rs_planted sp_admin_resolve_catalogue_request 'IF NOT public.is_platform_admin(_caller) THEN' 'IF false THEN')"
rs_nc_expect_fail "RS NC3 an in-app decision may approve" RS9.13 "$(rs_planted sp_admin_review_research_record "NOT IN ('pending', 'needs_information', 'excluded')" "NOT IN ('pending', 'needs_information', 'excluded', 'approved')")"
rs_nc_expect_fail "RS NC4 a published record may be withdrawn in-app" RS9.14 "$(rs_planted sp_admin_review_research_record 'IF _r.credential_code IS NOT NULL THEN' 'IF false THEN')"
rs_nc_expect_fail "RS NC5 a request may carry a non-https link" RS7.8 "$(rs_planted sp_request_catalogue_definition '_url !~ ' 'false AND _url !~ ')"
rs_nc_expect_fail "RS NC6 the unavailable search lists available awards" RS8.2 "$(rs_planted sp_catalogue_unavailable_matches 'r.credential_code IS NULL' 'true' | sed "s/r.reconciliation_outcome IN ('retained_for_review', 'excluded')/true/")"
rs_nc_expect_fail "RS NC7 the researched facts may be edited" RS1.11 "DROP TRIGGER sp_catalogue_research_provenance_immutable_trg ON public.sp_catalogue_research_records;"
rs_nc_expect_fail "RS NC8 every holder may read the research records" RS9.3 "DROP POLICY sp_catalogue_research_records_admin_read ON public.sp_catalogue_research_records; CREATE POLICY sp_catalogue_research_records_admin_read ON public.sp_catalogue_research_records FOR SELECT TO authenticated USING (true);"
rs_nc_expect_fail "RS NC9 a double submit is not refused by the database" RS7.5 "DROP INDEX public.sp_catalogue_requests_one_open;"
rs_nc_expect_fail "RS NC10 a holder may write a request row directly" RS9.7 "GRANT INSERT ON public.sp_catalogue_requests TO authenticated;"
rs_nc_expect_fail "RS NC11 a retained record may lose its issue" RS1.15 "ALTER TABLE public.sp_catalogue_research_records DROP CONSTRAINT sp_research_retained_is_actionable;"
rs_nc_expect_fail "RS NC12 a new definition infers lifetime validity" RS3.3 "UPDATE public.sp_credential_types SET allows_no_expiry = true WHERE code = 'INTL_NEBOSH_IGC';"
rs_nc_expect_fail "RS NC13 a new definition is given a country" RS3.2 "UPDATE public.sp_credential_types SET jurisdiction_code = 'GB', scope_code = 'national_regulated' WHERE code = 'INTL_CII_DIPLOMA_INSURANCE';"
rs_nc_expect_fail "RS NC14 an administrator may reopen past the allowance" RS9.28 "$(rs_planted sp_admin_resolve_catalogue_request "IF _status = 'open' AND _q.status <> 'open' AND" 'IF false AND')"
echo "    ok  fourteen planted defects, each caught on its named assertion"

# The ten-open allowance under real concurrency: two sessions at once, for two
# distinct requests and for a request racing an administrator's reopen, then
# the same races against the functions with the per-holder lock stripped (the
# negative control must reproduce the overrun). In a throwaway clone: the
# fixtures are committed and the control replaces two functions.
echo "==> Running the catalogue request allowance race (two sessions)"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB}_rs_race;" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB}_rs_race TEMPLATE ${TEST_DB};" >/dev/null
PGDATABASE="${TEST_DB}_rs_race" bash scripts/catalogue-request-race-test.sh
psql_q -d postgres -c "DROP DATABASE ${TEST_DB}_rs_race;" >/dev/null

# Proof case K: the administrator's diagnosis (catalogue-diagnostics.ts, the
# code behind /admin/passport-catalogue) against what the database actually
# offers and saves -- for an ordinary holder with no grant, and, with the UK
# and Dubai pinned to internal pilot, for a holder with a valid grant as well.
# The TypeScript half diagnoses every definition and prints the SQL; this runs
# it against the replayed database, as the rds-v1 parity below does.
echo "==> Running the Passport availability agreement (administrator vs holder)"
for agreement_mode in "" "--pin-route-a"; do
  AGREE_SQL="$(PASSPORT_MATRIX_DB_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-postgres}@127.0.0.1:${PGPORT:-5432}/${TEST_DB}" bun run scripts/passport-availability-agreement.ts $agreement_mode)" \
    || { echo "FAIL: the availability agreement could not be generated ($agreement_mode)"; exit 1; }
  AGREE_OUT="$(printf '%s\n' "$AGREE_SQL" | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)" || { echo "$AGREE_OUT" | grep -E 'AGREEMENT FAILED|ERROR' | head -5; exit 1; }
  printf '%s\n' "$AGREE_OUT" | grep 'passport availability agreement' | sed 's/^.*NOTICE:  /    /' || { echo "FAIL: the availability agreement printed no result"; exit 1; }
done

# The United States as a stated country and a wanted destination
# (20270218090000): run on the fully migrated database, stand down ALONE (the
# rows gone, the five-value destination CHECK back), prove the suite cannot
# pass without it, reapply, run again. Runs BEFORE the 20261215090000 block
# below, which re-creates candidate_job_preferences with its original CHECK and
# therefore re-applies this migration on top (see there).
for us_round in before after; do
  us_output="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_united_states_jurisdiction_test.sql 2>&1)" || { echo "$us_output"; exit 1; }
  us_count="$(printf '%s\n' "$us_output" | grep -c 'NOTICE:  ok ' || true)"
  [ "$us_count" -ge 23 ] || { echo "United States jurisdiction assertion shortfall: $us_count"; exit 1; }
  echo "    $us_count assertions passed: the United States as a stated country and destination ($us_round rollback/reapply)"
  if [ "$us_round" = before ]; then
    us_rb="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/rollback/20270218090000_sp_united_states_jurisdiction_and_destinations_rollback.sql 2>&1)" || { echo "$us_rb"; exit 1; }
    printf '%s' "$us_rb" | grep -q 'SP_UNITED_STATES_JURISDICTION_ROLLBACK ok' || { echo "FAIL: the 20270218090000 rollback did not prove itself: $us_rb"; exit 1; }
    us_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM public.sp_jurisdictions WHERE code='US') + (SELECT count(*) FROM public.sp_credential_jurisdictions WHERE code='US') + (SELECT count(*) FROM pg_constraint WHERE conname='candidate_job_preferences_desired_destinations_check' AND pg_get_constraintdef(oid) LIKE '%''US''%')")"
    [ "$us_left" = "0" ] || { echo "FAIL: 20270218090000 rollback left $us_left trace(s) of the United States behind"; exit 1; }
    echo "    ok  the United States stood down alone: no jurisdiction row, no credential jurisdiction, five destinations again"
    if psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "supabase/rollback/20270218090000_sp_united_states_jurisdiction_and_destinations_rollback.sql" >/dev/null 2>&1; then
      echo "FAIL: the 20270218090000 rollback ran twice" >&2
      exit 1
    fi
    echo "    ok  and it refuses to run a second time"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_united_states_jurisdiction_test.sql >/dev/null 2>&1; then
      echo "FAIL: the United States jurisdiction suite passed WITHOUT its migration -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the suite refuses to pass without the migration (negative control)"
    us_back="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/migrations/20270218090000_sp_united_states_jurisdiction_and_destinations.sql 2>&1)" || { echo "$us_back"; exit 1; }
    printf '%s' "$us_back" | grep -q 'SP_UNITED_STATES_JURISDICTION_PROOF ok' || { echo "FAIL: 20270218090000 did not re-apply on top of its rollback"; exit 1; }
    echo "    ok  the United States reapplied on top of its rollback: proof ok"
  fi
done

# Candidate current location and desired destinations (20261215090000): run,
# stand down ALONE (no table, helper or funnel name left; the anonymisation
# function restored), prove the suite cannot pass without it, reapply, run again.
# Its reapply re-creates candidate_job_preferences with the ORIGINAL five-value
# CHECK, so 20270218090000 (which widens that CHECK) is reapplied after it, and
# the database the later suites see is the real frontier.
for loc_round in before after; do
  loc_output="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/candidate_location_and_destinations_test.sql 2>&1)" || { echo "$loc_output"; exit 1; }
  loc_count="$(printf '%s\n' "$loc_output" | grep -c 'NOTICE:  ok ' || true)"
  [ "$loc_count" -ge 21 ] || { echo "candidate location assertion shortfall: $loc_count"; exit 1; }
  echo "    $loc_count assertions passed: candidate location and destinations ($loc_round rollback/reapply)"
  if [ "$loc_round" = before ]; then
    psql_q -d "$TEST_DB" -f supabase/rollback/20261215090000_candidate_location_and_destinations_rollback.sql >/dev/null
    loc_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (to_regclass('public.candidate_current_location') IS NOT NULL)::int + (to_regclass('public.candidate_job_preferences') IS NOT NULL)::int + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('candidate_destinations_distinct','candidate_preferences_touch')) + (SELECT count(*) FROM unnest(public.cd_v31_funnel_event_names()) n WHERE n LIKE 'india\_%' OR n LIKE 'passport\_%') + (SELECT count(*) FROM pg_proc WHERE proname='admin_anonymise_user' AND prosrc LIKE '%candidate_%')")"
    [ "$loc_left" = "0" ] || { echo "FAIL: 20261215090000 rollback left $loc_left object(s) behind"; exit 1; }
    echo "    ok  candidate location and destinations stood down alone; anonymisation and funnel names restored"
    if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/candidate_location_and_destinations_test.sql >/dev/null 2>&1; then
      echo "FAIL: the candidate location suite passed WITHOUT its migration -- it proves nothing" >&2
      exit 1
    fi
    echo "    ok  and the suite refuses to pass without the migration (negative control)"
    psql_q -d "$TEST_DB" -f supabase/migrations/20261215090000_candidate_location_and_destinations.sql >/dev/null
    # The destination CHECK is the 20261215090000 one again; 20270218090000
    # widens it back to the frontier. Its own postflight proves the rest.
    us_reapply="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/rollback/20270218090000_sp_united_states_jurisdiction_and_destinations_rollback.sql 2>&1)" || { echo "$us_reapply"; exit 1; }
    printf '%s' "$us_reapply" | grep -q 'SP_UNITED_STATES_JURISDICTION_ROLLBACK ok' || { echo "FAIL: the 20270218090000 rollback did not stand down before the 20261215090000 reapply chain: $us_reapply"; exit 1; }
    us_reapply="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/migrations/20270218090000_sp_united_states_jurisdiction_and_destinations.sql 2>&1)" || { echo "$us_reapply"; exit 1; }
    printf '%s' "$us_reapply" | grep -q 'SP_UNITED_STATES_JURISDICTION_PROOF ok' || { echo "FAIL: 20270218090000 did not re-apply after the 20261215090000 reapply"; exit 1; }
    echo "    ok  the United States reapplied after the candidate-location reapply: the frontier CHECK is back"
  fi
done


# Saved-CV application submission must work as authenticated, not just postgres.
for cv_round in before after; do
  cv_output="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cv_owned_application_snapshot_test.sql 2>&1)" || { echo "$cv_output"; exit 1; }
  cv_count="$(printf '%s\n' "$cv_output" | grep -c 'NOTICE:  ok ' || true)"
  [ "$cv_count" -ge 19 ] || { echo "CV snapshot assertion shortfall: $cv_count"; exit 1; }
  echo "    $cv_count assertions passed: authenticated CV submission ($cv_round rollback/reapply)"
  if [ "$cv_round" = before ]; then
    # 20261230090000's insert policy calls cv_owned_application_snapshot, so
    # it stands down first and comes back last.
    psql_q -d "$TEST_DB" -f supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql >/dev/null
    psql_q -d "$TEST_DB" -f supabase/rollback/20261122090000_cv_owned_application_snapshot_rollback.sql >/dev/null
    psql_q -d "$TEST_DB" -f supabase/migrations/20261122090000_cv_owned_application_snapshot.sql >/dev/null
    psql_q -d "$TEST_DB" -f supabase/migrations/20261230090000_job_application_insert_boundary.sql >/dev/null
  fi
done

# ---------------------------------------------------------------------------
# 3b. Walk back to the phase-1 CV state.
#
# The replay above ends in the FINAL schema, which on this branch includes
# 20261103090000_cv_documents_lockdown.sql. That is correct as a replay and
# wrong as a starting point for the suites: the CV suites and
# cv_documents_privacy_test assert the phase-1 contract, in which the
# published application still writes cv_documents directly.
#
# So the run walks the release rather than assuming one end of it. The
# lockdown is stood down here, the phase-1 suites run against the phase-1
# state, and the lockdown block further down applies it, proves both halves of
# it, and stands it down again.
#
# Skipped silently where the file does not exist, so this script is identical
# on a branch that does not carry phase 3.
# ---------------------------------------------------------------------------
# Stand down the later owner-snapshot entry point before testing the historical
# four-entry-point CV contract. Its final authenticated contract and its own
# rollback/reapply have already run above, against the fully replayed schema.
# 20261230090000's insert policy depends on it, so that stands down first; its
# own suite and controls have already run above as well.
psql_q -d "$TEST_DB" -f supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261122090000_cv_owned_application_snapshot_rollback.sql >/dev/null
if [ -f supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql ]; then
  echo "==> Standing the CV lockdown down to reach the phase-1 state"
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
    -f supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql >/dev/null
  echo "    ok  cv_documents is at the phase-1 grants for the suites below"
fi

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
# + scp_review_rubric_scores from the governed evidence model (20260823090000).
# + scp_training_assignments and scp_training_module_progress from #47 training
#   delivery (20260826090000). Two tables, both hanging off the existing spine:
#   an assignment references a governed programme VERSION and a subject, and
#   progress references that assignment and a module version. No parallel
#   content, item, form or attempt model was introduced.
# + scp_form_blocks, scp_interview_guide_prompts and scp_interview_notes from the
#   flagship recruitment assessment (20260830091000 / 20260830093000). Three
#   tables, all hanging off the existing spine: a form's declared sections, an
#   authored interview-question library keyed by competency and facet, and an
#   append-only record of what an interview established. No second assessment
#   engine, no second report model and no second evidence ledger.
# + scp_assessment_invitations (20260831091000): an intent to assess somebody
#   the platform does not know yet. Deliberately not an assignment -- it holds
#   no subject and creates no attempt until the invited person claims it.
# + the 13 Role Interview Pack tables of Interview Intelligence Phase 1
#   (20260918090000): scp_interview_packs, _pack_versions, _pack_competencies,
#   _pack_competency_map, _core_questions, _question_competencies,
#   _approved_probes, _evidence_dimensions, _rating_anchors,
#   _verification_rules, _prohibited_areas, _pack_reviews and _pack_events.
#   A separate governed CONTENT domain, not a second assessment engine: it holds
#   no candidate, no attempt and no result, and it leaves the two similarly
#   named assessment tables (scp_interview_guide_prompts, scp_interview_notes)
#   exactly as they were.
# + the Interview Intelligence Phase 2 layers (20260919090000 / 20260920090000):
#   7 governed-knowledge tables (scp_research_sources / _claims / _implications,
#   scp_interview_methods / _method_practices, scp_ai_tasks, scp_intel_edges)
#   and 21 runtime tables (cases, sources, passages, AI runs and retrievals,
#   extracted requirements and facts, prep plans and items, sessions, session
#   questions, session notes, probe usages, evidence proposals, confirmed
#   evidence, findings, assessments, reports, case events, plus the AI config
#   and pilot-grant tables). The runtime holds candidate interview material and
#   is tenant-scoped; the knowledge layer is platform content.
# + scp_interview_candidate_corrections: a candidate's statement that a FACT in
#   their own material is wrong. Read by a human, never applied automatically,
#   and structurally unable to reach an assessment or a report.
# + 3 TRUST conduct layer: the six-step conduct sequence, the named prohibited
#   techniques, and the Target/Ready/Trace guidance. Deterministic governed
#   content read by a human -- the Understand stage still permits zero AI tasks.
# + scp_recruitment_setups: the library choice (method, role group, role
#   profile, work environment) a case or BESKT assignment was started with.
# + scp_assessment_setups and scp_interview_starts: the setup a candidate test
#   was sent with, and which case each intended interview start led to.
# + scp_recruitment_role_profiles and scp_recruitment_content_links: which
#   governed guide and test belong to each library role profile and work
#   environment, so the start can verify a setup against its content.
if [ "$SCP_TABLES" -ne 132 ]; then
  echo "FAIL: expected 132 scp_ tables (23 PR-A + 15 graph + 23 Academy + 1 report snapshot + 1 fixture access + 1 test grants + 1 follow-up prompts + 1 employer decisions + 1 review rubric scores + 2 training delivery + 1 employer response reviewers + 1 form blocks + 1 interview guide prompts + 1 interview notes + 1 participant invitations + 13 role interview pack + 7 interview knowledge layer + 21 interview runtime + 1 candidate corrections + 2 panel review + 4 CQrity TRUST + 3 TRUST conduct layer + 1 report computation manifest + 1 content role audit + 1 recruitment setup + 2 interview starts + 2 recruitment content links), found $SCP_TABLES" >&2
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
echo "==> Running Career Discovery release-control assertions (cd_access_policy)"
set +e
CDAP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_access_policy_test.sql 2>&1)"
CDAP_RC=$?
set -e
echo "$CDAP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CDAP_PASSED="$(echo "$CDAP_OUT" | grep -c "ok  " || true)"
if [ "$CDAP_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Career Discovery release-control suite exited with code ${CDAP_RC}." >&2
  echo "$CDAP_OUT" | grep -E "ERROR|FAILED" >&2 || true
  exit 1
fi
[ "$CDAP_PASSED" -ge 32 ] || { echo "$CDAP_OUT"; echo "FAIL: Career Discovery release-control assertion shortfall: $CDAP_PASSED (floor 32)" >&2; exit 1; }
echo "    ok  $CDAP_PASSED Career Discovery release-control assertions passed"

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
# 5f. Career analysis AVAILABILITY matrix (docs/release/2026-10-03-career-
# analysis-availability.md): the database half of state x actor, in all three
# states of cd_access_policy, for an admin, a tester, a plain candidate and an
# anonymous visitor, plus the claim path. It runs here, where the schema is
# final, and its readiness script (supabase/readiness/) is executed by it.
#
# Planted controls, each of which MUST make the suite fail on the named
# assertion (each runs inside a transaction the suite's own ROLLBACK ends, so
# nothing is left behind):
#   NC1  cd_v31_may_start answers true for everyone           -> M1.2
#   NC2  the anonymous entrance never reads paused            -> M2.2
#   NC3  the allowlist is ignored under internal_test         -> M1.2
#   NC4  any signed-in account may change the state           -> M4.1
# ---------------------------------------------------------------------------
echo "==> Running Career Discovery availability matrix (state x actor)"
set +e
CDAV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_availability_matrix_test.sql 2>&1)"
CDAV_RC=$?
set -e
echo "$CDAV_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CDAV_PASSED="$(echo "$CDAV_OUT" | grep -c "NOTICE:  ok  " || true)"
if [ "$CDAV_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the Career Discovery availability matrix exited with code ${CDAV_RC}." >&2
  echo "$CDAV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Career Discovery availability matrix"
elif [ "$CDAV_PASSED" -lt 36 ]; then
  echo "FAIL: Career Discovery availability matrix assertion shortfall: ${CDAV_PASSED} (floor 36)" >&2
  suite_failed "Career Discovery availability matrix (assertion shortfall: floor 36)"
else
  echo "    ok  ${CDAV_PASSED} Career Discovery availability assertions passed (three states x admin, tester, plain candidate, anonymous; claim; opening and rollback)"
  cdav_nc_expect_fail() {
    local label="$1" expect="$2" mutation="$3"
    set +e
    local out
    out="$(printf 'BEGIN;\n%s\n\\i supabase/tests/cd_availability_matrix_test.sql\n' "$mutation" \
      | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ] || ! echo "$out" | grep -q "ASSERTION FAILED: ${expect}"; then
      echo "FAIL: availability matrix negative control '${label}': the suite did not fail on ${expect} -- it proves nothing" >&2
      echo "$out" | grep -E "ERROR|FAILED" | head -3 >&2 || true
      exit 1
    fi
    echo "    ok  NC ${label}: the suite fails ($(echo "$out" | grep -o "ASSERTION FAILED: M[0-9A-Za-z.]*" | head -1))"
  }
  cdav_nc_expect_fail "NC1 cd_v31_may_start admits everyone" "M1.2" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.cd_v31_may_start(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL;
$$;
SQL
)"
  cdav_nc_expect_fail "NC2 the anonymous entrance never closes" "M2.2" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.cd_access_state()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN current_setting('role', true) = 'anon' AND p.state = 'paused' THEN 'internal_test' ELSE p.state END
    FROM public.cd_access_policy p WHERE p.singleton;
$$;
SQL
)"
  cdav_nc_expect_fail "NC3 the allowlist is ignored under internal_test" "M1.2" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.cd_v31_may_start(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND CASE public.cd_access_state()
    WHEN 'public'        THEN true
    WHEN 'internal_test' THEN public.is_platform_admin(_user_id)
    ELSE                      public.is_platform_admin(_user_id)
  END;
$$;
SQL
)"
  cdav_nc_expect_fail "NC4 any signed-in account may change the state" "M4.1" "$(cat <<'SQL'
CREATE OR REPLACE FUNCTION public.cd_set_access_state(_state text, _note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cd_access_policy SET state = _state, note = _note, changed_by = auth.uid(), changed_at = now() WHERE singleton;
  RETURN _state;
END $$;
SQL
)"
  # The mutations ran inside transactions the suite's ROLLBACK ended; prove the
  # real functions are the ones still in place.
  cdav_back="$(psql_q -d "$TEST_DB" -Atc "SELECT pg_get_functiondef('public.cd_v31_may_start(uuid)'::regprocedure) LIKE '%cd_is_internal_tester%'")"
  [ "$cdav_back" = "t" ] || { echo "FAIL: a planted control leaked: cd_v31_may_start no longer consults the allowlist function" >&2; exit 1; }
  echo "    ok  every planted control was rolled back (the real functions are intact)"
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
# 5b-bis. Career Discovery calibration access boundary
#
# Proves the scoring-IP decision: candidates and employers cannot enumerate the
# calibration tables, the narrow accessor is DEFINER and search_path-pinned, the
# internal path still works, and stored reports stay reproducible.
# ---------------------------------------------------------------------------
echo "==> Running Career Discovery calibration access assertions"
set +e
CAL_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_calibration_access_test.sql 2>&1)"
CAL_RC=$?
set -e
echo "$CAL_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CAL_PASSED="$(echo "$CAL_OUT" | grep -c "ok  " || true)"
if [ "$CAL_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the CD calibration access suite exited with code ${CAL_RC}." >&2
  echo "$CAL_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "CD calibration access"
else
  echo "    ok  ${CAL_PASSED} CD calibration access assertions passed"
  if [ "$CAL_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 CD calibration access assertions, only ${CAL_PASSED} ran." >&2
    suite_failed "CD calibration access (assertion shortfall: floor 18)"
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
    suite_failed "Phase 1F content (assertion shortfall: floor 45)"
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
# 5l-d2. Recruitment brief and interview guide, on three personas.
#
# The one that proves the product's central claim: a candidate who DESCRIBES
# themselves well and a candidate who ANSWERS well must not produce the same
# brief. Persona C says exactly what Persona A says and answers the scenarios
# like somebody who has not done the job; several assertions are stated as
# absences on C, because an absence is what no accidental finding can satisfy.
#
# It also holds the recruitment guard: the assessment is DESIGNED for
# recruitment and is still refused in a recruitment context, because the
# content is draft and selection_support is unpublished.
# ---------------------------------------------------------------------------
echo "==> Running recruitment brief + interview guide assertions"
set +e
RBRIEF_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_recruitment_brief_test.sql 2>&1)"
RBRIEF_RC=$?
set -e

echo "$RBRIEF_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
RBRIEF_PASSED="$(echo "$RBRIEF_OUT" | grep -c "ok  " || true)"

if [ "$RBRIEF_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the recruitment brief suite exited with code ${RBRIEF_RC}." >&2
  echo "$RBRIEF_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Recruitment brief + interview guide"
else
  echo "    ok  ${RBRIEF_PASSED} recruitment brief assertions passed"
  if [ "$RBRIEF_PASSED" -lt 50 ]; then
    echo "FAIL: expected at least 50 recruitment brief assertions, only ${RBRIEF_PASSED} ran." >&2
    suite_failed "Recruitment brief (assertion shortfall: floor 45)"
  fi
fi

# ---------------------------------------------------------------------------
# 5l-d3. The recruitment journey around the assessment.
#
# One human from job application to released report: the same subject
# throughout, an assessment started from an application without retyping an
# address, somebody with no account invited and later bound to their own
# identity, and a second organisation that sees none of it. Four properties are
# asserted as ABSENCES, because each wrong outcome would look plausible in a
# demo -- a fake employment record, a duplicate person, an assignment created
# by a pending invitation, or one tenant reading another's pipeline.
# ---------------------------------------------------------------------------
echo "==> Running recruitment journey assertions"
set +e
RJOURNEY_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_recruitment_journey_test.sql 2>&1)"
RJOURNEY_RC=$?
set -e

echo "$RJOURNEY_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
RJOURNEY_PASSED="$(echo "$RJOURNEY_OUT" | grep -c "ok  " || true)"

if [ "$RJOURNEY_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the recruitment journey suite exited with code ${RJOURNEY_RC}." >&2
  echo "$RJOURNEY_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Recruitment journey"
else
  echo "    ok  ${RJOURNEY_PASSED} recruitment journey assertions passed"
  if [ "$RJOURNEY_PASSED" -lt 40 ]; then
    echo "FAIL: expected at least 40 recruitment journey assertions, only ${RJOURNEY_PASSED} ran." >&2
    suite_failed "Recruitment journey (assertion shortfall: floor 40)"
  fi
fi

# ---------------------------------------------------------------------------
# 5l-d3b. Retry-safe recruitment assignment, including two real connections.
# The old body must fail the new suite; restore the migration afterwards.
# ---------------------------------------------------------------------------
echo "==> Running recruitment assignment idempotency assertions"
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/assessment_draft_authoring_test.sql
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_assignment_idempotency_test.sql
psql_q -d "$TEST_DB" -f supabase/rollback/20261209090000_recruitment_assignment_idempotency_rollback.sql >/dev/null
ASSIGN_OLD_OUT="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_assignment_idempotency_test.sql >"$ASSIGN_OLD_OUT" 2>&1; then
  rm -f "$ASSIGN_OLD_OUT"
  echo "FAIL: assignment idempotency suite accepted the old function" >&2
  exit 1
fi
if ! grep -q 'SCP_ASSIGNMENT_ALREADY_OPEN' "$ASSIGN_OLD_OUT"; then
  cat "$ASSIGN_OLD_OUT" >&2
  rm -f "$ASSIGN_OLD_OUT"
  echo "FAIL: old body failed for a reason other than the intended retry regression" >&2
  exit 1
fi
rm -f "$ASSIGN_OLD_OUT"
psql_q -d "$TEST_DB" -f supabase/migrations/20261209090000_recruitment_assignment_idempotency.sql >/dev/null
bash scripts/recruitment-assignment-race-test.sh

# ---------------------------------------------------------------------------
# 5l-d3c. A test is sent only to a candidate still in the process (AS-01).
# 20261225090000 replaces scp_employer_assign() on top of 20261209090000, so
# it is re-applied here after the idempotency rollback/re-apply above. The
# old body must accept a closed application (the suite must fail on it), and
# the migration must re-apply cleanly afterwards.
# ---------------------------------------------------------------------------
echo "==> Running assignment application-state assertions (AS-01)"
psql_q -d "$TEST_DB" -f supabase/migrations/20261225090000_assessment_assign_requires_open_application.sql >/dev/null
set +e
AS01_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_assign_requires_open_application_test.sql 2>&1)"
AS01_RC=$?
set -e
echo "$AS01_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
AS01_PASSED="$(echo "$AS01_OUT" | grep -c "ok  " || true)"
if [ "$AS01_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the assignment application-state suite exited with code ${AS01_RC}." >&2
  echo "$AS01_OUT" | grep -E "ERROR|FAILED" >&2 || true
  exit 1
fi
[ "$AS01_PASSED" -ge 14 ] || { echo "$AS01_OUT"; echo "FAIL: assignment application-state assertion shortfall: $AS01_PASSED (floor 14)" >&2; exit 1; }
echo "    ok  $AS01_PASSED assignment application-state assertions passed"
psql_q -d "$TEST_DB" -f supabase/rollback/20261225090000_assessment_assign_requires_open_application_rollback.sql >/dev/null
AS01_OLD_OUT="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_assign_requires_open_application_test.sql >"$AS01_OLD_OUT" 2>&1; then
  rm -f "$AS01_OLD_OUT"
  echo "FAIL: the application-state suite accepted the old scp_employer_assign body" >&2
  exit 1
fi
if ! grep -q 'unexpectedly SUCCEEDED' "$AS01_OLD_OUT"; then
  cat "$AS01_OLD_OUT" >&2
  rm -f "$AS01_OLD_OUT"
  echo "FAIL: old body failed the application-state suite for a reason other than accepting a closed application" >&2
  exit 1
fi
rm -f "$AS01_OLD_OUT"
psql_q -d "$TEST_DB" -f supabase/migrations/20261225090000_assessment_assign_requires_open_application.sql >/dev/null
echo "    ok  the old body accepts a closed application; 20261225090000 re-applied"

# ---------------------------------------------------------------------------
# 5l-d4. The P0 lifecycle bridges.
#
# Application-scoped Passport disclosure, and hired -> employee against the
# same subject. Both are asserted mostly as ABSENCES, because both failure
# modes look like success: an employer who can read a Passport merely because
# somebody applied still renders a page, and a hire that mints a second person
# still fills the workforce directory. The two assertions that cannot be
# faked are L1.1/L1.2 -- a Passport holder and a non-holder produce the
# identical response -- and H2.2, the employment record carrying the subject
# the assessment already ran against.
# ---------------------------------------------------------------------------
echo "==> Running lifecycle bridge assertions"
set +e
LBRIDGE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_lifecycle_bridges_test.sql 2>&1)"
LBRIDGE_RC=$?
set -e

echo "$LBRIDGE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
LBRIDGE_PASSED="$(echo "$LBRIDGE_OUT" | grep -c "ok  " || true)"

if [ "$LBRIDGE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the lifecycle bridge suite exited with code ${LBRIDGE_RC}." >&2
  echo "$LBRIDGE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Lifecycle bridges"
else
  echo "    ok  ${LBRIDGE_PASSED} lifecycle bridge assertions passed"
  # The floor matters more than usual here: almost every assertion in this
  # suite is a denial, and a denial suite that stops early passes silently.
  if [ "$LBRIDGE_PASSED" -lt 60 ]; then
    echo "FAIL: expected at least 60 lifecycle bridge assertions, only ${LBRIDGE_PASSED} ran." >&2
    suite_failed "Lifecycle bridges (assertion shortfall: floor 60)"
  fi
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
# #51 -- response review as an employer capability, proven across two tenants.
# The old model gated review on scp_can_author, a global content-governance
# capability, so this suite exists to keep the two apart and to keep the
# cross-tenant boundary honest with a second organisation in the fixture.
# ---------------------------------------------------------------------------
echo "==> Running employer response-reviewer assertions"
set +e
REV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_employer_reviewer_test.sql 2>&1)"
REV_RC=$?
set -e

echo "$REV_OUT" | grep -E "ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
REV_PASSED="$(echo "$REV_OUT" | grep -c "ok  " || true)"

if [ "$REV_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer response-reviewer suite exited with code ${REV_RC}." >&2
  echo "$REV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${REV_PASSED} employer response-reviewer assertions passed"

if [ "$REV_PASSED" -lt 70 ]; then
  echo "FAIL: expected at least 70 employer response-reviewer assertions, only ${REV_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# #51 -- one human, one professional identity. The decisive assertion is that
# assessment history survives an email change, which is exactly what the old
# email-string join could not do.
# ---------------------------------------------------------------------------
echo "==> Running person identity spine assertions"
set +e
SPINE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_person_spine_test.sql 2>&1)"
SPINE_RC=$?
set -e

echo "$SPINE_OUT" | grep -E "ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPINE_PASSED="$(echo "$SPINE_OUT" | grep -c "ok  " || true)"

if [ "$SPINE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the person identity spine suite exited with code ${SPINE_RC}." >&2
  echo "$SPINE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${SPINE_PASSED} person identity spine assertions passed"

if [ "$SPINE_PASSED" -lt 36 ]; then
  echo "FAIL: expected at least 36 person identity spine assertions, only ${SPINE_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# #51 -- the employer self-service workforce lifecycle, end to end. Every
# transition runs through the governed function the product calls; nothing sets
# a status by hand after setup.
# ---------------------------------------------------------------------------
echo "==> Running workforce lifecycle E2E assertions"
set +e
E2E_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_workforce_e2e_test.sql 2>&1)"
E2E_RC=$?
set -e

echo "$E2E_OUT" | grep -E "ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
E2E_PASSED="$(echo "$E2E_OUT" | grep -c "ok  " || true)"

if [ "$E2E_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the workforce lifecycle E2E exited with code ${E2E_RC}." >&2
  echo "$E2E_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${E2E_PASSED} workforce lifecycle E2E assertions passed"

if [ "$E2E_PASSED" -lt 36 ]; then
  echo "FAIL: expected at least 36 workforce lifecycle E2E assertions, only ${E2E_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-e. The durable Assessment & Training Library (#47)
#
# Tenancy, lifecycle normalisation, library eligibility, versioning, grants --
# and the locked Product Owner rule that training completion never moves
# measured maturity. That last group asserts the BEFORE/AFTER identity on the
# real function AND proves the counterfactual, so removing the exclusion turns
# the suite red rather than making it vacuously pass.
#
# Runs BEFORE the rollback step: it reads the SCP content spine, which the
# rollback drops.
# ---------------------------------------------------------------------------
echo "==> Running standard recruitment availability assertions"
set +e
STDR_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_standard_recruitment_availability_test.sql 2>&1)"
STDR_RC=$?
set -e

STDR_PASSED="$(echo "$STDR_OUT" | grep -c "ok  " || true)"

if [ "$STDR_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the standard recruitment availability suite exited with code ${STDR_RC}." >&2
  echo "$STDR_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "standard recruitment availability"
else
  echo "    ok  ${STDR_PASSED} standard recruitment availability assertions passed"
  if [ "$STDR_PASSED" -lt 16 ]; then
    echo "FAIL: expected at least 16 standard recruitment availability assertions, only ${STDR_PASSED} ran." >&2
    suite_failed "standard recruitment availability (assertion shortfall: floor 16)"
  fi
fi

# ---------------------------------------------------------------------------
# Väktare option-order integrity (PR-V1, 20261021090000).
#
# randomise_options was authored true on all 22 scenario items and honoured by
# nothing; the preferred option is authored first on every one of them. The
# suite proves the per-attempt permutation is stable within an attempt,
# differs across attempts, never touches an ordered scale, leaves a NULL-seed
# attempt in authored order, and that one fixed set of chosen option ids
# produces a row-for-row identical evidence ledger under three permutations.
#
# Runs BEFORE the rollback step: it reads the SCP content spine, which the
# rollback drops.
# ---------------------------------------------------------------------------
echo "==> Running Väktare option-order integrity assertions"
set +e
OOI_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_option_order_integrity_test.sql 2>&1)"
OOI_RC=$?
set -e

echo "$OOI_OUT" | grep -E "diag  " | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
OOI_PASSED="$(echo "$OOI_OUT" | grep -c "ok  " || true)"

if [ "$OOI_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the option-order integrity suite exited with code ${OOI_RC}." >&2
  echo "$OOI_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "option-order integrity"
else
  echo "    ok  ${OOI_PASSED} option-order integrity assertions passed"
  if [ "$OOI_PASSED" -lt 50 ]; then
    echo "FAIL: expected at least 50 option-order integrity assertions, only ${OOI_PASSED} ran." >&2
    suite_failed "option-order integrity (assertion shortfall: floor 50)"
  fi
fi

# ---------------------------------------------------------------------------
# Option-order proof scope (20261021090000). The migration's content proof
# resolves THE Väktare form through definition slug -> version 1 -> (version,
# form slug), all unique keys. Production carries a second, historical form
# with the same slug under another assessment version (the retired project's
# restore), which made the slug-scoped count read 100. Reproduced here with a
# VALID twin (its own definition, version and form), committed, then:
#   1. the migration re-applies (idempotent) and its proof passes -- the twin
#      is ignored; runtime sources and content digests are unchanged;
#   2. a malformed LIVE form still fails the proof; a malformed TWIN does not;
#   3. the twin is removed exactly.
# Runs BEFORE the destructive rollback step.
# ---------------------------------------------------------------------------
echo "==> Option-order proof scope: building the historical same-slug twin"
OOPS_BEFORE="$(psql -tAq -d "$TEST_DB" -c \
  "select md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_get_attempt_items') || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_item_options t) || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_item_texts t) || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_form_items t join public.scp_forms f on f.id=t.form_id join public.scp_assessment_versions av on av.id=f.assessment_version_id and av.version_number=1 join public.scp_assessment_definitions d on d.id=av.definition_id and d.slug='security-officer-recruitment') || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_attempts t));")"
set +e
OOPS_SETUP="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/tests/scp_option_order_proof_scope_setup.sql 2>&1)"
OOPS_SETUP_RC=$?
set -e
if [ "$OOPS_SETUP_RC" -ne 0 ]; then
  echo "FAIL: the option-order proof-scope setup exited with code ${OOPS_SETUP_RC}." >&2
  echo "$OOPS_SETUP" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "option-order proof scope (setup)"
fi
echo "    ok  two assessment versions carry a form with the Väktare slug (100 items by slug)"

echo "==> Option-order proof scope: the migration re-applies and ignores the twin"
set +e
OOPS_APPLY="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/migrations/20260905053344_scp_option_order_per_attempt.sql 2>&1)"
OOPS_APPLY_RC=$?
set -e
if [ "$OOPS_APPLY_RC" -ne 0 ]; then
  echo "FAIL: 20261021090000 did not re-apply with a same-slug historical form present." >&2
  echo "$OOPS_APPLY" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "option-order proof scope (re-apply with twin)"
else
  echo "    ok  20261021090000 re-applied: its proof resolved the live form by version and ignored the twin"
fi
OOPS_AFTER="$(psql -tAq -d "$TEST_DB" -c \
  "select md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_get_attempt_items') || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_item_options t) || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_item_texts t) || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_form_items t join public.scp_forms f on f.id=t.form_id join public.scp_assessment_versions av on av.id=f.assessment_version_id and av.version_number=1 join public.scp_assessment_definitions d on d.id=av.definition_id and d.slug='security-officer-recruitment') || '|' || (select md5(string_agg(t::text, '|' order by t.id)) from public.scp_attempts t));")"
if [ "$OOPS_BEFORE" != "$OOPS_AFTER" ]; then
  echo "FAIL: the re-apply changed the delivery function, an option, an item text, the live form or an attempt." >&2
  suite_failed "option-order proof scope (runtime/content changed)"
else
  echo "    ok  delivery function, options, item texts, live form items and attempts are byte-identical after the re-apply"
fi

echo "==> Option-order proof scope: a malformed live form still fails; a malformed twin does not"
OOPS_MAL="$(psql -q -d "$TEST_DB" -f supabase/tests/scp_option_order_proof_scope_malformed.sql 2>&1)"
if ! echo "$OOPS_MAL" | grep -q "SCP_OPTION_ORDER_ITEM_COUNT: expected 50 Väktare items on form .* found 49"; then
  echo "FAIL: removing one item from the LIVE form did not fail the proof with 'found 49'." >&2
  echo "$OOPS_MAL" | grep -iE "ERROR:|FEL:|CASE" | head -8 >&2
  suite_failed "option-order proof scope (malformed live form not refused)"
else
  echo "    ok  the live form with 49 items is refused: SCP_OPTION_ORDER_ITEM_COUNT ... found 49"
fi
if ! echo "$OOPS_MAL" | grep -q "CASE_B_APPLIED"; then
  echo "FAIL: removing one item from the historical twin made the proof fail -- it is being counted." >&2
  echo "$OOPS_MAL" | grep -iE "ERROR:|FEL:|CASE" | head -8 >&2
  suite_failed "option-order proof scope (twin counted)"
else
  echo "    ok  the twin with 49 items is ignored: the migration still applies"
fi
OOPS_LIVE_ITEMS="$(psql -tAq -d "$TEST_DB" -c \
  "select count(*) from public.scp_form_items fi join public.scp_forms f on f.id=fi.form_id join public.scp_assessment_versions av on av.id=f.assessment_version_id and av.version_number=1 join public.scp_assessment_definitions d on d.id=av.definition_id and d.slug='security-officer-recruitment' where f.slug='security-officer-recruitment-form-a';")"
if [ "$OOPS_LIVE_ITEMS" != "50" ]; then
  echo "FAIL: the malformed cases did not roll back -- the live form has ${OOPS_LIVE_ITEMS} items." >&2
  suite_failed "option-order proof scope (rollback of malformed cases)"
fi

echo "==> Option-order proof scope: removing the twin"
set +e
OOPS_CLEAN="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/tests/scp_option_order_proof_scope_cleanup.sql 2>&1)"
OOPS_CLEAN_RC=$?
set -e
if [ "$OOPS_CLEAN_RC" -ne 0 ]; then
  echo "FAIL: the option-order proof-scope cleanup exited with code ${OOPS_CLEAN_RC}." >&2
  echo "$OOPS_CLEAN" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "option-order proof scope (cleanup)"
else
  echo "    ok  the twin is gone; one Väktare form remains"
fi

# ---------------------------------------------------------------------------
# The assessment LANGUAGE contract (PR-V2).
#
# The employer picks sv or en when assigning and it is stored on
# assessment_assignments.language; the candidate runner used to ignore it and
# read the site-wide toggle instead, while the released report froze the
# ASSIGNED language into its context -- so a report could name a language the
# run was never delivered in. This suite proves the database half: both
# languages are complete (an English run is not a shorter form), delivery is
# identical in item ids, option ids and served order with only the words
# differing, no response or scoring path can be told a language, the candidate
# can read their own assigned language under their own RLS, and a released
# report never names a language other than the one assigned.
#
# Runs BEFORE the rollback step: it reads the SCP content spine, which the
# rollback drops.
# ---------------------------------------------------------------------------
echo "==> Running assessment language contract assertions"
set +e
LANG_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_language_contract_test.sql 2>&1)"
LANG_RC=$?
set -e

echo "$LANG_OUT" | grep -E "diag  " | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
LANG_PASSED="$(echo "$LANG_OUT" | grep -c "ok  " || true)"

if [ "$LANG_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the language contract suite exited with code ${LANG_RC}." >&2
  echo "$LANG_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "assessment language contract"
else
  echo "    ok  ${LANG_PASSED} language contract assertions passed"
  if [ "$LANG_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 language contract assertions, only ${LANG_PASSED} ran." >&2
    suite_failed "assessment language contract (assertion shortfall: floor 18)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running content library and maturity-isolation assertions"
set +e
LIB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_content_library_test.sql 2>&1)"
LIB_RC=$?
set -e

echo "$LIB_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
LIB_PASSED="$(echo "$LIB_OUT" | grep -c "ok  " || true)"

if [ "$LIB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the content library suite exited with code ${LIB_RC}." >&2
  echo "$LIB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${LIB_PASSED} content library assertions passed"

if [ "$LIB_PASSED" -lt 40 ]; then
  echo "FAIL: expected at least 40 content library assertions, only ${LIB_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-f. The training delivery journey (#47)
#
# Assign, discover, start, answer, get feedback, LEAVE AND RESUME, complete a
# module, complete the programme, record history -- and the boundaries around
# all of it. Group T3 asserts that measured maturity is byte-identical before
# and after completion, and T3.5 asserts the evidence really was written, so
# T3.3 cannot pass vacuously by the completion having done nothing.
#
# Runs BEFORE the rollback step: it reads the SCP content spine.
# ---------------------------------------------------------------------------
echo "==> Running training delivery journey assertions"
set +e
TRJ_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_training_journey_test.sql 2>&1)"
TRJ_RC=$?
set -e

echo "$TRJ_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
TRJ_PASSED="$(echo "$TRJ_OUT" | grep -c "ok  " || true)"

if [ "$TRJ_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the training journey suite exited with code ${TRJ_RC}." >&2
  echo "$TRJ_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${TRJ_PASSED} training journey assertions passed"

if [ "$TRJ_PASSED" -lt 45 ]; then
  echo "FAIL: expected at least 45 training journey assertions, only ${TRJ_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5l-bis. The employer lifecycle, phases 1-3
#
# Two database rules, each run TWICE around a rollback/reapply cycle of its own
# migration. Running the suite once would prove the rules hold; running it
# either side of the stand-down proves the migrations are the reason they do,
# and that standing them down restores exactly the previous behaviour rather
# than a similar-looking one.
#
# Runs BEFORE the rollback step: it reads scp_subjects, scp_training_assignments
# and the employer training read model, all of which that step drops.
# ---------------------------------------------------------------------------
for elf_round in before after; do
  echo "==> Running employer lifecycle phase 1-3 assertions (${elf_round} rollback/reapply)"
  set +e
  ELF_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_lifecycle_phase1_3_test.sql 2>&1)"
  ELF_RC=$?
  set -e

  echo "$ELF_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  ELF_PASSED="$(echo "$ELF_OUT" | grep -c "ok  " || true)"

  if [ "$ELF_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the employer lifecycle suite exited with code ${ELF_RC} (${elf_round} rollback/reapply)." >&2
    echo "$ELF_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    exit 1
  fi

  echo "    ok  ${ELF_PASSED} employer lifecycle assertions passed (${elf_round} rollback/reapply)"

  if [ "$ELF_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 employer lifecycle assertions, only ${ELF_PASSED} ran." >&2
    exit 1
  fi

  if [ "$elf_round" = before ]; then
    # Newest first. Each rollback must STAND THE CHANGE DOWN -- the assertions
    # below read the resulting state rather than trusting that the file ran.
    psql_q -d "$TEST_DB" -f supabase/rollback/20261206090000_scp_training_assignment_person_context_rollback.sql >/dev/null
    elf_args="$(psql_q -d "$TEST_DB" -Atc "SELECT coalesce(string_agg(pg_get_function_arguments(p.oid), '|'), 'none') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='scp_assign_training'")"
    case "$elf_args" in
      *_employee_id*) echo "FAIL: 20261206090000 rollback left _employee_id on scp_assign_training"; exit 1 ;;
      *\|*) echo "FAIL: 20261206090000 rollback left more than one scp_assign_training definition"; exit 1 ;;
    esac
    echo "    ok  training person-context rollback stood down: one definition, no _employee_id"

    psql_q -d "$TEST_DB" -f supabase/rollback/20261205090000_employer_workforce_active_only_rollback.sql >/dev/null
    elf_gate="$(psql_q -d "$TEST_DB" -Atc "SELECT (pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%employer_is_active_status%')::int FROM pg_policy pol WHERE pol.polrelid='public.employees'::regclass AND pol.polname='employees_employer_insert'")"
    elf_guard="$(psql_q -d "$TEST_DB" -Atc "SELECT (prosrc LIKE '%EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE%')::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='employer_operational_guard'")"
    [ "${elf_gate}${elf_guard}" = "00" ] || { echo "FAIL: 20261205090000 rollback left the workforce gate in place (policy=$elf_gate guard=$elf_guard)"; exit 1; }
    echo "    ok  workforce active-only rollback stood down: policy and guard back to the pending-permitted shape"

    # THE NEGATIVE CONTROL.
    #
    # With the gate down the refusal must genuinely disappear. Without this,
    # the "after" round would pass just as happily if the refusal came from
    # somewhere else entirely and these migrations did nothing.
    #
    # It creates its OWN actor rather than looking for one: every suite in this
    # script ends in ROLLBACK, so auth.users is empty here, and a control that
    # silently skips is not a control. The row outlives the reapply on purpose
    # -- 20261205090000's own apply-time proof needs an author to exist, and
    # skips its executed half when there is none.
    elf_actor='e1f00000-8888-0000-0000-000000000001'
    psql_q -d "$TEST_DB" -c "INSERT INTO auth.users (id, email) VALUES ('${elf_actor}','rollback-control@lifecycle.test');" >/dev/null
    psql_q -d "$TEST_DB" -c "INSERT INTO public.employers (id, name, slug, status) VALUES ('e1f00000-9999-0000-0000-000000000001','Rollback Proof AB','rollback-proof-elf','pending');" >/dev/null
    psql_q -d "$TEST_DB" -c "INSERT INTO public.employees (employer_id, first_name, last_name, created_by) VALUES ('e1f00000-9999-0000-0000-000000000001','Utan','Grind','${elf_actor}');" >/dev/null \
      || { echo "FAIL: with 20261205090000 rolled back, a pending organisation was still refused an employment record -- the refusal is coming from somewhere else, so the 'after' round proves nothing"; exit 1; }
    psql_q -d "$TEST_DB" -c "DELETE FROM public.employees WHERE employer_id='e1f00000-9999-0000-0000-000000000001';" >/dev/null
    echo "    ok  with the gate down a pending organisation CAN create an employment record (negative control)"

    psql_q -d "$TEST_DB" -f supabase/migrations/20261205090000_employer_workforce_active_only.sql >/dev/null
    psql_q -d "$TEST_DB" -f supabase/migrations/20261206090000_scp_training_assignment_person_context.sql >/dev/null
    echo "    ok  both employer lifecycle migrations reapplied"

    # The same insert, now refused. Proves the reapply restored the rule rather
    # than merely running, and does it from the shell so the assertion survives
    # this suite's own ROLLBACK.
    if psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
         -c "INSERT INTO public.employees (employer_id, first_name, last_name, created_by) VALUES ('e1f00000-9999-0000-0000-000000000001','Med','Grind','${elf_actor}');" >/dev/null 2>&1; then
      echo "FAIL: after reapplying 20261205090000 a pending organisation could still create an employment record"; exit 1
    fi
    echo "    ok  and refused again once the migration is back (positive control)"
    psql_q -d "$TEST_DB" -c "DELETE FROM public.employees WHERE employer_id='e1f00000-9999-0000-0000-000000000001'; DELETE FROM public.employers WHERE id='e1f00000-9999-0000-0000-000000000001'; DELETE FROM auth.users WHERE id='${elf_actor}';" >/dev/null
  fi
done

# ---------------------------------------------------------------------------
# 5l-bis-2. The candidate list read by the database (20261212090000)
#
# Proved with 5 200 applications on one vacancy -- more than the old
# in-memory read could see -- as the roles that really call it. Runs with
# the migration applied, then the migration is stood down ALONE and the two
# functions must be gone (the rollback drops nothing else), so that 5l-ter's
# own rollback of the EXPAND half below still finds zero rec_* functions.
# It is reapplied, and the suite run again, right after 5l-ter.
# ---------------------------------------------------------------------------
run_candidate_view_suite() {
  echo "==> Running recruitment candidate view assertions ($1)"
  set +e
  RCV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_candidate_view_test.sql 2>&1)"
  RCV_RC=$?
  set -e
  echo "$RCV_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  RCV_PASSED="$(echo "$RCV_OUT" | grep -c "ok  " || true)"
  if [ "$RCV_RC" -ne 0 ]; then
    echo "FAIL: the recruitment candidate view suite exited with code ${RCV_RC} ($1)." >&2
    echo "$RCV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    exit 1
  fi
  if [ "$RCV_PASSED" -lt 47 ]; then
    echo "FAIL: expected at least 47 recruitment candidate view assertions, only ${RCV_PASSED} ran." >&2
    exit 1
  fi
  echo "    ok  ${RCV_PASSED} recruitment candidate view assertions passed"
}
run_candidate_view_suite "before rollback"

# ---------------------------------------------------------------------------
# 5l-bis-3. Automatic receipts for received applications (20261213090000)
#
# Proved as the roles that meet it (owner, responsible person, plain member,
# the other organisation, three candidates, anon). Runs with the migration
# applied, then stands it down ALONE and must leave no function, trigger,
# index or column behind, so 5l-ter's own rollback count still sees zero
# rec_* functions. Reapplied, and run again, after 5l-ter.
# ---------------------------------------------------------------------------
run_receipts_suite() {
  echo "==> Running recruitment application receipts assertions ($1)"
  set +e
  RCP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_application_receipts_test.sql 2>&1)"
  RCP_RC=$?
  set -e
  echo "$RCP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  RCP_PASSED="$(echo "$RCP_OUT" | grep -c "ok  " || true)"
  if [ "$RCP_RC" -ne 0 ]; then
    echo "FAIL: the recruitment receipts suite exited with code ${RCP_RC} ($1)." >&2
    echo "$RCP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    exit 1
  fi
  if [ "$RCP_PASSED" -lt 80 ]; then
    echo "FAIL: expected at least 80 recruitment receipts assertions, only ${RCP_PASSED} ran." >&2
    exit 1
  fi
  echo "    ok  ${RCP_PASSED} recruitment receipts assertions passed"
}
run_receipts_suite "before rollback"
psql_q -d "$TEST_DB" -f supabase/rollback/20261213090000_recruitment_application_receipts_rollback.sql >/dev/null
rcp_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('rec_receipt_default','rec_render_receipt','rec_set_receipt_settings','rec_claim_receipt_send','rec_settle_receipt_send','rec_receipt_actor','rec_create_application_receipt','rec_receipt_window_open','rec_receipt_provider_key','rec_receipt_take_attempt','rec_claim_due_receipts','rec_receipts_needing_attention')) + (SELECT count(*) FROM pg_trigger WHERE tgname='job_applications_zz_receipt') + (SELECT count(*) FROM pg_indexes WHERE indexname IN ('recruitment_messages_receipt_once_idx','recruitment_messages_email_attempt_idx','recruitment_messages_receipt_due_idx')) + (SELECT count(*) FROM information_schema.columns WHERE table_name='recruitment_settings' AND column_name LIKE 'receipt\_%') + (SELECT count(*) FROM information_schema.columns WHERE table_name='recruitment_messages' AND column_name IN ('email_attempt_id','email_provider_id','email_recipient','email_key_generation','email_key_first_used_at','email_settled_at')) + (SELECT CASE WHEN pg_get_functiondef('public.rec_settle_message_send(uuid,text,text)'::regprocedure) LIKE '%''unknown''%' THEN 1 ELSE 0 END)")"
[ "$rcp_left" = "0" ] || { echo "FAIL: 20261213090000 rollback left $rcp_left receipt object(s) behind"; exit 1; }
echo "    ok  receipts stood down alone; nothing left behind"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_application_receipts_test.sql >/dev/null 2>&1; then
  echo "FAIL: the receipts suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the receipts suite refuses to pass without the migration (negative control)"

psql_q -d "$TEST_DB" -f supabase/rollback/20261212090000_recruitment_candidate_view_rollback.sql >/dev/null
rcv_left="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('rec_candidate_view','rec_job_counts')")"
[ "$rcv_left" = "0" ] || { echo "FAIL: 20261212090000 rollback left $rcv_left candidate view function(s) behind"; exit 1; }
rcv_rest="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\_%'")"
[ "$rcv_rest" != "0" ] || { echo "FAIL: 20261212090000 rollback took the workspace's own rec_* functions with it"; exit 1; }
echo "    ok  candidate view stood down alone; the workspace functions are intact"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_candidate_view_test.sql >/dev/null 2>&1; then
  echo "FAIL: the candidate view suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite refuses to pass without the migration (negative control)"

# 20261223090000 (JB-02 EXPAND: the employer's and the admin's note reads)
# adds two rec_* functions on top of the workspace and re-creates
# rec_submit_application with named fields. Stood down ALONE here so 5l-ter's
# own rollback count still sees zero rec_* functions; reapplied, and its
# suite run, after 5l-ter.
# 20261226090000 (JB-02 CONTRACT: the two note columns leave the authenticated
# grant) is stood down FIRST -- its rollback restores the table grants -- so
# the EXPAND rollback below can drop the functions with the notes readable
# again, and 5l-ter's suites run against the grants they were written for.
psql_q -d "$TEST_DB" -f supabase/rollback/20261226090000_application_notes_column_privileges_rollback.sql >/dev/null
jb02c_left="$(psql_q -d "$TEST_DB" -Atc "SELECT CASE WHEN has_column_privilege('authenticated','public.job_applications','employer_note','SELECT') AND has_column_privilege('authenticated','public.job_application_status_events','note','SELECT') THEN 0 ELSE 1 END")"
[ "$jb02c_left" = "0" ] || { echo "FAIL: 20261226090000 rollback did not restore the note columns to authenticated"; exit 1; }
echo "    ok  application note column privileges stood down alone; the notes are granted again"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/application_notes_column_privileges_test.sql >/dev/null 2>&1; then
  echo "FAIL: the application note column privileges suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite refuses to pass without the migration (negative control)"
psql_q -d "$TEST_DB" -f supabase/rollback/20261223090000_application_notes_employer_only_rollback.sql >/dev/null
jb02_left="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('rec_application_status_events','rec_application_employer_note')")"
[ "$jb02_left" = "0" ] || { echo "FAIL: 20261223090000 rollback left $jb02_left employer read function(s) behind"; exit 1; }
jb02_rest="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\_%'")"
[ "$jb02_rest" != "0" ] || { echo "FAIL: 20261223090000 rollback took the workspace's own rec_* functions with it"; exit 1; }
echo "    ok  application note privacy stood down alone; the workspace functions are intact"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/application_notes_employer_only_test.sql >/dev/null 2>&1; then
  echo "FAIL: the application note privacy suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite refuses to pass without the migration (negative control)"

# 20261224090000 (JB-01, the candidate's application context) adds one
# SECURITY DEFINER read on top of the workspace. Stood down ALONE here so
# 5l-ter's own rollback count still sees zero rec_* functions; reapplied, and
# its suite run, after 5l-ter.
psql_q -d "$TEST_DB" -f supabase/rollback/20261224090000_candidate_application_context_rollback.sql >/dev/null
jb01_left="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='rec_my_application_context'")"
[ "$jb01_left" = "0" ] || { echo "FAIL: 20261224090000 rollback left rec_my_application_context behind"; exit 1; }
jb01_rest="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\_%'")"
[ "$jb01_rest" != "0" ] || { echo "FAIL: 20261224090000 rollback took the workspace's own rec_* functions with it"; exit 1; }
echo "    ok  candidate application context stood down alone; the workspace functions are intact"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/candidate_application_context_test.sql >/dev/null 2>&1; then
  echo "FAIL: the candidate application context suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite refuses to pass without the migration (negative control)"

# 20270205090000 (the employer's e-mail on a new application) adds a table named
# recruitment_* and six rec_* functions on top of the workspace. Stood down ALONE
# here, like the two above, so 5l-ter's own rollback count still sees zero;
# reapplied after the chain below, with its suite run again. (Its own planted
# controls, its rollback cycle and its races ran earlier, where the schema is
# final: "employer new-application notice".)
en_psql -d "$TEST_DB" -f "$EN_RB" >/dev/null
en_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='recruitment_employer_notices') + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('rec_employer_notice_recipients','rec_enqueue_employer_new_application_notices','rec_claim_employer_notices','rec_settle_employer_notice','rec_employer_notice_backoff','rec_purge_employer_notices'))")"
[ "$en_left" = "0" ] || { echo "FAIL: 20270205090000 rollback left $en_left employer-notice object(s) behind"; exit 1; }
en_rest="$(psql_q -d "$TEST_DB" -Atc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\_%'")"
[ "$en_rest" != "0" ] || { echo "FAIL: 20270205090000 rollback took the workspace's own rec_* functions with it"; exit 1; }
echo "    ok  employer new-application notices stood down alone; the workspace functions are intact"
if psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f "$EN_SUITE" >/dev/null 2>&1; then
  echo "FAIL: the employer-notice suite passed WITHOUT its migration -- it proves nothing" >&2
  exit 1
fi
echo "    ok  and the suite refuses to pass without the migration (negative control)"

# ---------------------------------------------------------------------------
# 5l-ter. The recruitment workspace: EXPAND (20261207090000) and CONTRACT
# (20261208090000, the job_applications backstops)
#
# Run TWICE around a rollback/reapply cycle of both migrations, like 5l-bis.
# Between the rounds the CONTRACT half is stood down ALONE and the transition
# suite runs in the state the OLD application meets twice in a release --
# between the schema and application releases, and after an application
# rollback: its apply dialog and decision buttons must work as before, and the
# new application's own path must still hold both rules. The transition
# suite's X3 (a plain member CAN reject through set_application_status once
# the backstops are down) is also the negative control for the backstops
# suite's K5: the refusal it asserts comes from 20261208090000 and nothing else.
#
# Runs BEFORE the rollback step: its fixture reads nothing that step drops,
# but it must see the full schema the application will run against.
# ---------------------------------------------------------------------------
for rw_round in before after; do
  echo "==> Running recruitment workspace assertions (${rw_round} rollback/reapply)"
  set +e
  RW_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_workspace_test.sql 2>&1)"
  RW_RC=$?
  set -e
  echo "$RW_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  RW_PASSED="$(echo "$RW_OUT" | grep -c "ok  " || true)"
  if [ "$RW_RC" -ne 0 ]; then
    echo "FAIL: the recruitment workspace suite exited with code ${RW_RC} (${rw_round:-})." >&2
    echo "$RW_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    exit 1
  fi
  if [ "$RW_PASSED" -lt 73 ]; then
    echo "FAIL: expected at least 73 recruitment workspace assertions, only ${RW_PASSED} ran." >&2
    exit 1
  fi
  echo "    ok  ${RW_PASSED} recruitment workspace assertions passed"
  set +e
  RWK_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_workspace_backstops_test.sql 2>&1)"
  RWK_RC=$?
  set -e
  echo "$RWK_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  RWK_PASSED="$(echo "$RWK_OUT" | grep -c "ok  " || true)"
  if [ "$RWK_RC" -ne 0 ]; then
    echo "FAIL: the recruitment backstops suite exited with code ${RWK_RC} (${rw_round:-})." >&2
    echo "$RWK_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    exit 1
  fi
  if [ "$RWK_PASSED" -lt 8 ]; then
    echo "FAIL: expected at least 8 recruitment backstops assertions, only ${RWK_PASSED} ran." >&2
    exit 1
  fi
  echo "    ok  ${RWK_PASSED} recruitment backstops assertions passed"

  if [ "$rw_round" = before ]; then
    psql_q -d "$TEST_DB" -f supabase/rollback/20261208090000_recruitment_workspace_backstops_rollback.sql >/dev/null
    rw_bs="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND tgname IN ('job_applications_required_answers','job_applications_decision_guard'))::text || '/' || (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\\_%')::text")"
    case "$rw_bs" in
      0/0) echo "FAIL: the backstops rollback took the EXPAND functions with it"; exit 1 ;;
      0/*) echo "    ok  backstops stood down alone; the EXPAND half is intact" ;;
      *) echo "FAIL: 20261208090000 rollback left a backstop trigger behind ($rw_bs)"; exit 1 ;;
    esac
    echo "==> Running recruitment transition assertions (EXPAND only: the old application)"
    set +e
    RWT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/recruitment_workspace_transition_test.sql 2>&1)"
    RWT_RC=$?
    set -e
    echo "$RWT_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
    RWT_PASSED="$(echo "$RWT_OUT" | grep -c "ok  " || true)"
    if [ "$RWT_RC" -ne 0 ]; then
      echo "FAIL: the recruitment transition suite exited with code ${RWT_RC} (${rw_round:-})." >&2
      echo "$RWT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
      exit 1
    fi
    if [ "$RWT_PASSED" -lt 9 ]; then
      echo "FAIL: expected at least 9 recruitment transition assertions, only ${RWT_PASSED} ran." >&2
      exit 1
    fi
    echo "    ok  ${RWT_PASSED} recruitment transition assertions passed"

    psql_q -d "$TEST_DB" -f supabase/rollback/20261207090000_recruitment_workspace_rollback.sql >/dev/null
    rw_left="$(psql_q -d "$TEST_DB" -Atc "SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND (relname LIKE 'recruitment\_%' OR relname='job_application_answers')) + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'rec\_%') + (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND tgname IN ('job_applications_window_guard','job_applications_required_answers','job_applications_decision_guard'))")"
    [ "$rw_left" = "0" ] || { echo "FAIL: 20261207090000 rollback left $rw_left recruitment object(s) behind"; exit 1; }
    echo "    ok  recruitment workspace rollback stood down: no table, function or trigger left"

    psql_q -d "$TEST_DB" -f supabase/migrations/20261207090000_recruitment_workspace.sql >/dev/null
    psql_q -d "$TEST_DB" -f supabase/migrations/20261208090000_recruitment_workspace_backstops.sql >/dev/null
    echo "    ok  recruitment workspace migrations reapplied (EXPAND, then CONTRACT)"
  fi
done

# The candidate list read, back on top of the reapplied workspace.
psql_q -d "$TEST_DB" -f supabase/migrations/20261212090000_recruitment_candidate_view.sql >/dev/null
echo "    ok  recruitment candidate view migration reapplied"
run_candidate_view_suite "after reapply"
# And the receipts, on top of that.
psql_q -d "$TEST_DB" -f supabase/migrations/20261213090000_recruitment_application_receipts.sql >/dev/null
echo "    ok  recruitment application receipts migration reapplied"
run_receipts_suite "after reapply"
# And the employer's and the admin's note reads, on top of that.
psql_q -d "$TEST_DB" -f supabase/migrations/20261223090000_application_notes_employer_only.sql >/dev/null
echo "    ok  application note reads (JB-02 EXPAND) migration reapplied"
# And the candidate's application context, on top of that.
psql_q -d "$TEST_DB" -f supabase/migrations/20261224090000_candidate_application_context.sql >/dev/null
echo "    ok  candidate application context migration reapplied"
# And the column boundary on top of the reads.
psql_q -d "$TEST_DB" -f supabase/migrations/20261226090000_application_notes_column_privileges.sql >/dev/null
echo "    ok  application note column privileges (JB-02 CONTRACT) migration reapplied"
# And the employer's new-application e-mail, on top of all of it.
en_psql -d "$TEST_DB" -f "$EN_MIG" >/dev/null
echo "    ok  employer new-application notices migration reapplied"
set +e
EN_OUT="$(en_run_suite)"; EN_RC=$?
set -e
[ "$EN_RC" -eq 0 ] || { echo "$EN_OUT" | grep -E "ERROR|FAILED" >&2; echo "FAIL: the employer-notice suite does not pass after the workspace rollback cycle" >&2; exit 1; }
echo "    ok  employer-notice suite passes on the reapplied workspace ($(echo "$EN_OUT" | grep -c "NOTICE:  ok  " || true) assertions)"

# ---------------------------------------------------------------------------
# 5l-bis-4. The receipt e-mail under a REAL race: two sessions, two processes
#
# The suite above runs in one transaction and cannot contend with itself.
# Here session A claims a receipt's e-mail and sleeps inside its transaction;
# session B, started a second later, asks for the same receipt. B must WAIT
# on the row lock (not fail) and then be told the send is in progress: one
# active attempt, whatever the concurrency. Then the recovery: A takes the
# due receipt and sleeps; B's recovery must come back at once with nothing
# (FOR UPDATE SKIP LOCKED), never a second copy of the same receipt.
# Committed synthetic fixture, removed afterwards.
# ---------------------------------------------------------------------------
echo "==> Running recruitment receipt concurrent-claim race"
RCR_FAILED=0
RCR_APP="ce000000-4444-3333-0000-000000000001"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('ce000000-4444-0000-0000-00000000000a', 'race-owner@rc.test', now(), '{"display_name":"Race Owner"}'::jsonb),
  ('ce000000-4444-0000-0000-0000000000ad', 'race-mod@rc.test',   now(), '{"display_name":"Race Mod"}'::jsonb),
  ('ce000000-4444-0000-0000-000000000c01', 'race-cand@rc.test',  now(), '{"display_name":"Race Kandidat"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('ce000000-4444-0000-0000-0000000000ad', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO public.employers (id, name, slug, status)
VALUES ('ce000000-4444-1111-0000-00000000000a', 'Race AB', 'race-ab', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('ce000000-4444-1111-0000-00000000000a', 'ce000000-4444-0000-0000-00000000000a', 'owner', 'active') ON CONFLICT DO NOTHING;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ce000000-4444-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
VALUES ('ce000000-4444-2222-0000-000000000001', 'race-job', 'RACE001', 'ce000000-4444-1111-0000-00000000000a', 'Väktare, Race', 'Guard, Race', 'internal', 'draft');
SELECT public.rec_set_receipt_settings('ce000000-4444-2222-0000-000000000001', true);
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ce000000-4444-0000-0000-0000000000ad', true);
SET LOCAL ROLE authenticated;
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day', expires_at = now() + interval '30 days'
 WHERE id = 'ce000000-4444-2222-0000-000000000001';
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ce000000-4444-0000-0000-000000000c01', true);
SET LOCAL ROLE authenticated;
SELECT public.rec_submit_application('ce000000-4444-3333-0000-000000000001', 'ce000000-4444-2222-0000-000000000001',
  NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb);
COMMIT;
SQL
RCR_ROW="$(psql -tAq -d "$TEST_DB" -c "SELECT email_status || '/' || email_attempts FROM public.recruitment_messages WHERE application_id='${RCR_APP}' AND kind='receipt'")"
if [ "$RCR_ROW" != "not_attempted/0" ]; then
  echo "FAIL: the race fixture did not get its receipt at the commit (got '${RCR_ROW}')." >&2
  suite_failed "recruitment receipt race fixture"
fi

RCR_A="$(mktemp)"; RCR_B="$(mktemp)"
cat > "$RCR_A" <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT 'OUT=' || outcome || ' ATT=' || coalesce(attempt_id::text, '-') FROM public.rec_claim_receipt_send('${RCR_APP}');
SELECT pg_sleep(2);
COMMIT;
SQL
cat > "$RCR_B" <<SQL
SELECT 'T0=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
BEGIN;
SET LOCAL ROLE service_role;
SELECT 'OUT=' || outcome || ' ATT=' || coalesce(attempt_id::text, '-') FROM public.rec_claim_receipt_send('${RCR_APP}');
COMMIT;
SELECT 'T1=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
SQL
psql -tAq -d "$TEST_DB" -f "$RCR_A" > /tmp/rcr_a.out 2>&1 &
RCR_PID=$!
sleep 1
psql -tAq -d "$TEST_DB" -f "$RCR_B" > /tmp/rcr_b.out 2>&1
wait "$RCR_PID" || true
RCR_A_OUT="$(grep -oE 'OUT=[a-z_]+' /tmp/rcr_a.out | head -1 | cut -d= -f2)"
RCR_B_OUT="$(grep -oE 'OUT=[a-z_]+' /tmp/rcr_b.out | head -1 | cut -d= -f2)"
RCR_A_ATT="$(grep -oE 'ATT=[0-9a-f-]{36}' /tmp/rcr_a.out | head -1 | cut -d= -f2)"
RCR_T0="$(grep -oE 'T0=[0-9]+' /tmp/rcr_b.out | cut -d= -f2)"
RCR_T1="$(grep -oE 'T1=[0-9]+' /tmp/rcr_b.out | cut -d= -f2)"
RCR_B_MS=$(( ${RCR_T1:-0} - ${RCR_T0:-0} ))
RCR_AFTER="$(psql -tAq -d "$TEST_DB" -c "SELECT email_status || '/' || email_attempts || '/' || coalesce(email_attempt_id::text,'-') FROM public.recruitment_messages WHERE application_id='${RCR_APP}' AND kind='receipt'")"
if [ "$RCR_A_OUT" != "claimed" ] || [ "$RCR_B_OUT" != "in_progress" ]; then
  echo "FAIL: two concurrent claims answered '${RCR_A_OUT}' and '${RCR_B_OUT}'; expected exactly one 'claimed' and one 'in_progress'." >&2
  head -5 /tmp/rcr_a.out /tmp/rcr_b.out >&2
  RCR_FAILED=1
else
  echo "    ok  two concurrent claims: one 'claimed', the other 'in_progress'"
fi
if [ "$RCR_B_MS" -lt 800 ]; then
  echo "FAIL: session B answered after ${RCR_B_MS} ms; it did not wait on the row lock, so this was not a race." >&2
  RCR_FAILED=1
else
  echo "    ok  the second claim WAITED on the first (${RCR_B_MS} ms) rather than failing or guessing"
fi
if grep -qiE "ERROR:|FEL:" /tmp/rcr_b.out; then
  echo "FAIL: the second claim errored instead of waiting." >&2
  head -5 /tmp/rcr_b.out >&2
  RCR_FAILED=1
fi
if [ "$RCR_AFTER" != "sending/1/${RCR_A_ATT}" ]; then
  echo "FAIL: after the race the row is '${RCR_AFTER}', expected sending/1/${RCR_A_ATT}: one active attempt, the first one's." >&2
  RCR_FAILED=1
else
  echo "    ok  one active attempt on the row, and it is the first claim's"
fi

# The recovery, twice at once: A takes the due receipt and sleeps; B must
# come back with nothing, at once, and never take the same receipt.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "UPDATE public.recruitment_messages SET email_status='not_attempted', email_attempt_id=NULL, email_attempts=0, email_claimed_at=NULL, created_at=now() - interval '5 minutes' WHERE application_id='${RCR_APP}' AND kind='receipt'" >/dev/null
cat > "$RCR_A" <<SQL
BEGIN;
SET LOCAL ROLE service_role;
SELECT 'N=' || count(*) FROM public.rec_claim_due_receipts(10);
SELECT pg_sleep(2);
COMMIT;
SQL
cat > "$RCR_B" <<SQL
SELECT 'T0=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
BEGIN;
SET LOCAL ROLE service_role;
SELECT 'N=' || count(*) FROM public.rec_claim_due_receipts(10);
COMMIT;
SELECT 'T1=' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
SQL
psql -tAq -d "$TEST_DB" -f "$RCR_A" > /tmp/rcr_a.out 2>&1 &
RCR_PID=$!
sleep 1
psql -tAq -d "$TEST_DB" -f "$RCR_B" > /tmp/rcr_b.out 2>&1
wait "$RCR_PID" || true
RCR_A_N="$(grep -oE 'N=[0-9]+' /tmp/rcr_a.out | head -1 | cut -d= -f2)"
RCR_B_N="$(grep -oE 'N=[0-9]+' /tmp/rcr_b.out | head -1 | cut -d= -f2)"
RCR_T0="$(grep -oE 'T0=[0-9]+' /tmp/rcr_b.out | cut -d= -f2)"
RCR_T1="$(grep -oE 'T1=[0-9]+' /tmp/rcr_b.out | cut -d= -f2)"
RCR_B_MS=$(( ${RCR_T1:-0} - ${RCR_T0:-0} ))
RCR_AFTER="$(psql -tAq -d "$TEST_DB" -c "SELECT email_status || '/' || email_attempts FROM public.recruitment_messages WHERE application_id='${RCR_APP}' AND kind='receipt'")"
if [ "$RCR_A_N" != "1" ] || [ "$RCR_B_N" != "0" ]; then
  echo "FAIL: two concurrent recoveries took ${RCR_A_N:-?} and ${RCR_B_N:-?} receipts; expected 1 and 0." >&2
  head -5 /tmp/rcr_a.out /tmp/rcr_b.out >&2
  RCR_FAILED=1
else
  echo "    ok  two concurrent recoveries: the first took the receipt, the second took nothing"
fi
if [ "$RCR_B_MS" -ge 1500 ]; then
  echo "FAIL: the second recovery waited ${RCR_B_MS} ms on the first; SKIP LOCKED should have let it pass at once." >&2
  RCR_FAILED=1
else
  echo "    ok  and the second did not wait for the first (${RCR_B_MS} ms)"
fi
if [ "$RCR_AFTER" != "sending/1" ]; then
  echo "FAIL: after the recovery race the row is '${RCR_AFTER}', expected sending/1." >&2
  RCR_FAILED=1
else
  echo "    ok  exactly one attempt was made"
fi
RCR_LATER="$(psql -tAq -d "$TEST_DB" -c "BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.rec_claim_due_receipts(10); COMMIT;" | grep -E '^[0-9]+$' | head -1)"
if [ "$RCR_LATER" != "0" ]; then
  echo "FAIL: a recovery run after the first one committed took ${RCR_LATER} receipt(s) that were already in flight." >&2
  RCR_FAILED=1
else
  echo "    ok  a later recovery leaves the attempt in flight alone"
fi
rm -f "$RCR_A" "$RCR_B"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
DELETE FROM public.recruitment_messages WHERE application_id = 'ce000000-4444-3333-0000-000000000001';
DELETE FROM public.job_applications WHERE id = 'ce000000-4444-3333-0000-000000000001';
DELETE FROM public.jobs WHERE id = 'ce000000-4444-2222-0000-000000000001';
DELETE FROM public.employers WHERE id = 'ce000000-4444-1111-0000-00000000000a';
DELETE FROM auth.users WHERE id IN ('ce000000-4444-0000-0000-000000000c01', 'ce000000-4444-0000-0000-0000000000ad', 'ce000000-4444-0000-0000-00000000000a');
SQL
if [ "$RCR_FAILED" -ne 0 ]; then
  suite_failed "recruitment receipt concurrent claims"
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

echo "==> Employer onboarding: registration, review and decision"
set +e
ONB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_onboarding_approval_test.sql 2>&1)"
ONB_RC=$?
set -e

echo "$ONB_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ONB_PASSED="$(echo "$ONB_OUT" | grep -c "ok  " || true)"

if [ "$ONB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer onboarding suite exited with code ${ONB_RC}." >&2
  echo "$ONB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  exit 1
fi

echo "    ok  ${ONB_PASSED} employer onboarding assertions passed"

if [ "$ONB_PASSED" -lt 26 ]; then
  echo "FAIL: expected at least 26 employer onboarding assertions, only ${ONB_PASSED} ran." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5n. Interview Intelligence Phase 1 -- the Role Interview Pack domain
#
# Runs BEFORE the rollback step: it reads scp_roles, scp_role_versions and
# scp_competency_versions, all of which the rollback drops.
# ---------------------------------------------------------------------------
echo "==> Running Role Interview Pack governance assertions"
set +e
IIP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_role_pack_test.sql 2>&1)"
IIP_RC=$?
set -e

echo "$IIP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
IIP_PASSED="$(echo "$IIP_OUT" | grep -c "ok  " || true)"

if [ "$IIP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Role Interview Pack suite exited with code ${IIP_RC}." >&2
  echo "$IIP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Role Interview Pack"
fi

echo "    ok  ${IIP_PASSED} Role Interview Pack assertions passed"

if [ "$IIP_PASSED" -lt 70 ]; then
  echo "FAIL: expected at least 70 Role Interview Pack assertions, only ${IIP_PASSED} ran." >&2
  suite_failed "Role Interview Pack (assertion shortfall: floor 70)"
fi

# ---------------------------------------------------------------------------
# 5n-b. Interview Intelligence Phase 2 -- the employer runtime, end to end
#
# Drives the WHOLE product journey against the governed pack: case, sources,
# AI run, preparation, human approval, interview, AI-proposed evidence, human
# confirmation, assessment and an immutable report -- then proves the
# boundaries around it. Runs BEFORE the rollback step, like the Phase 1 suite.
# ---------------------------------------------------------------------------
echo "==> Running Interview Intelligence runtime assertions"
set +e
IVR_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_runtime_test.sql 2>&1)"
IVR_RC=$?
set -e

echo "$IVR_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
IVR_PASSED="$(echo "$IVR_OUT" | grep -c "ok  " || true)"

if [ "$IVR_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Interview Intelligence runtime suite exited with code ${IVR_RC}." >&2
  echo "$IVR_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Interview Intelligence runtime"
fi

echo "    ok  ${IVR_PASSED} Interview Intelligence runtime assertions passed"

if [ "$IVR_PASSED" -lt 70 ]; then
  echo "FAIL: expected at least 70 runtime assertions, only ${IVR_PASSED} ran." >&2
  suite_failed "Interview Intelligence runtime (assertion shortfall: floor 70)"
fi

# ---------------------------------------------------------------------------
# 5n-c. Interview Intelligence -- integrity hardening
#
# The three honesty controls, tested as negatives: research cannot outrun its
# sources, the knowledge graph states its own assurance instead of implying
# certainty, and a pilot grant is a time-boxed authorisation rather than a way
# around publication review. Also runs BEFORE the rollback step.
# ---------------------------------------------------------------------------
echo "==> Running Interview Intelligence integrity assertions"
set +e
IVI_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_integrity_test.sql 2>&1)"
IVI_RC=$?
set -e

echo "$IVI_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
IVI_PASSED="$(echo "$IVI_OUT" | grep -c "ok  " || true)"

if [ "$IVI_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Interview Intelligence integrity suite exited with code ${IVI_RC}." >&2
  echo "$IVI_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Interview Intelligence integrity"
fi

echo "    ok  ${IVI_PASSED} Interview Intelligence integrity assertions passed"

if [ "$IVI_PASSED" -lt 98 ]; then
  echo "FAIL: expected at least 98 integrity assertions, only ${IVI_PASSED} ran." >&2
  suite_failed "Interview Intelligence integrity (assertion shortfall: floor 98)"
fi

# ---------------------------------------------------------------------------
# 5n-d. CQrity TRUST -- the five-stage method contract
#
# TRUST is the binding orchestration model: five stages, each with the AI tasks
# it permits, the human gate that follows each one, what may not be concluded
# there, and which research claim grounds it AND which one limits it. The suite
# is deterministic -- no AI is invoked and no network is touched.
# ---------------------------------------------------------------------------
echo "==> Running CQrity TRUST method assertions"
set +e
TRUST_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_method_test.sql 2>&1)"
TRUST_RC=$?
set -e

echo "$TRUST_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
TRUST_PASSED="$(echo "$TRUST_OUT" | grep -c "ok  " || true)"

if [ "$TRUST_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the CQrity TRUST suite exited with code ${TRUST_RC}." >&2
  echo "$TRUST_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "CQrity TRUST method"
fi

echo "    ok  ${TRUST_PASSED} CQrity TRUST assertions passed"

if [ "$TRUST_PASSED" -lt 74 ]; then
  echo "FAIL: expected at least 74 TRUST assertions, only ${TRUST_PASSED} ran." >&2
  suite_failed "CQrity TRUST method (assertion shortfall: floor 74)"
fi

# ---------------------------------------------------------------------------
# 5g. Open pilot entitlement (owner decision 2026-08-28)
#
# An ACTIVE employer uses openly available pilot content directly — no
# per-employer grant. The suite proves the new rule and that every boundary
# around it survived: suspended employers, withdrawn/retired content,
# production governance, tenant isolation, candidates, and the grant
# instrument that remains for restricted cohorts. Registered BEFORE the
# destructive rollback step, like every non-destructive suite.
# ---------------------------------------------------------------------------
echo "==> Running open pilot entitlement assertions"
set +e
OPILOT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_open_pilot_test.sql 2>&1)"
OPILOT_RC=$?
set -e

echo "$OPILOT_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
OPILOT_PASSED="$(echo "$OPILOT_OUT" | grep -c "ok  " || true)"

if [ "$OPILOT_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the open pilot entitlement suite exited with code ${OPILOT_RC}." >&2
  echo "$OPILOT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "open pilot entitlement"
fi

echo "    ok  ${OPILOT_PASSED} open pilot entitlement assertions passed"

if [ "$OPILOT_PASSED" -lt 50 ]; then
  echo "FAIL: expected at least 50 open pilot assertions, only ${OPILOT_PASSED} ran." >&2
  suite_failed "open pilot entitlement (assertion shortfall: floor 50)"
fi

# ---------------------------------------------------------------------------
# 5h. The start contract (P0, owner UAT 2026-08-28)
#
# The new-interview selector and scp_iv_create_case must answer the SAME
# question. They did not: the selector was built from the READ entitlement,
# whose pinned-case branch is continuity access, so a withdrawn pack with an
# existing case was offered and then refused on submit. Every assertion here
# uses one employer identity and one pack version id across BOTH calls.
# ---------------------------------------------------------------------------
echo "==> Running interview start-contract assertions"
set +e
START_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_startable_contract_test.sql 2>&1)"
START_RC=$?
set -e

echo "$START_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
START_PASSED="$(echo "$START_OUT" | grep -c "ok  " || true)"

if [ "$START_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the interview start-contract suite exited with code ${START_RC}." >&2
  echo "$START_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "interview start contract"
fi

echo "    ok  ${START_PASSED} interview start-contract assertions passed"

if [ "$START_PASSED" -lt 32 ]; then
  echo "FAIL: expected at least 32 start-contract assertions, only ${START_PASSED} ran." >&2
  suite_failed "interview start contract (assertion shortfall: floor 32)"
fi

# ---------------------------------------------------------------------------
# 5i. The AI execution gate and model provenance
#
# ai_enabled was documented as THE gate and enforced nowhere, and the run row
# recorded the provider NAME in its model column. Both are database-boundary
# facts, so both are tested here rather than in the UI: the gate holds at run
# start, at settlement and at the table, the deterministic engine keeps
# working, and the structured interview stays reachable with AI off.
# ---------------------------------------------------------------------------
echo "==> Running AI gate and provenance assertions"
set +e
AIG_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_ai_gate_test.sql 2>&1)"
AIG_RC=$?
set -e

echo "$AIG_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
AIG_PASSED="$(echo "$AIG_OUT" | grep -c "ok  " || true)"

if [ "$AIG_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the AI gate suite exited with code ${AIG_RC}." >&2
  echo "$AIG_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "AI gate and provenance"
fi

echo "    ok  ${AIG_PASSED} AI gate and provenance assertions passed"

if [ "$AIG_PASSED" -lt 27 ]; then
  echo "FAIL: expected at least 27 AI gate assertions, only ${AIG_PASSED} ran." >&2
  suite_failed "AI gate and provenance (assertion shortfall: floor 27)"
fi

# ---------------------------------------------------------------------------
# 5j. Interview Copilot -- the first real AI vertical
#
# An AI may read what a recruiter wrote, organise it and PROPOSE evidence, and
# only in the TRUST stage that permits the task. Everything after that is a
# human's. These assertions are the difference between that claim and a story:
# every active task refused during the live interview, evidence tasks confined
# to Structure, the original note byte-identical after extraction/edit/reject,
# no proposal becoming evidence without a named human, and no scoring
# vocabulary anywhere in the schema.
# ---------------------------------------------------------------------------
echo "==> Running Interview Copilot assertions"
set +e
CP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_copilot_test.sql 2>&1)"
CP_RC=$?
set -e

echo "$CP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CP_PASSED="$(echo "$CP_OUT" | grep -c "ok  " || true)"

if [ "$CP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Interview Copilot suite exited with code ${CP_RC}." >&2
  echo "$CP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Interview Copilot"
fi

echo "    ok  ${CP_PASSED} Interview Copilot assertions passed"

if [ "$CP_PASSED" -lt 63 ]; then
  echo "FAIL: expected at least 63 Copilot assertions, only ${CP_PASSED} ran." >&2
  suite_failed "Interview Copilot (assertion shortfall: floor 63)"
fi

# ---------------------------------------------------------------------------
# The TRUST conduct layer: six ordered conduct steps, eight named prohibited
# techniques, Target/Ready/Trace guidance, Understand still permitting zero AI
# tasks, notes staying notes until a human confirms, and no score, ranking,
# credibility judgement or employment recommendation anywhere in the schema.
# ---------------------------------------------------------------------------
echo "==> Running TRUST conduct layer assertions"
set +e
CD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_conduct_test.sql 2>&1)"
CD_RC=$?
set -e

echo "$CD_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CD_PASSED="$(echo "$CD_OUT" | grep -c "ok  " || true)"

if [ "$CD_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the TRUST conduct suite exited with code ${CD_RC}." >&2
  echo "$CD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "TRUST conduct layer"
fi

echo "    ok  ${CD_PASSED} TRUST conduct layer assertions passed"

if [ "$CD_PASSED" -lt 62 ]; then
  echo "FAIL: expected at least 62 conduct assertions, only ${CD_PASSED} ran." >&2
  suite_failed "TRUST conduct layer (assertion shortfall: floor 62)"
fi

# ---------------------------------------------------------------------------
# Tenant isolation, tested deliberately rather than observed by accident: two
# employers, a candidate with a login and no seat, and every cross-boundary
# read and write a multi-tenant product has to refuse -- case, notes,
# proposals, confirmed material, assessments, report, AI provenance, audit.
# ---------------------------------------------------------------------------
echo "==> Running tenant isolation assertions"
set +e
TI_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_tenant_isolation_test.sql 2>&1)"
TI_RC=$?
set -e

echo "$TI_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
TI_PASSED="$(echo "$TI_OUT" | grep -c "ok  " || true)"

if [ "$TI_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the tenant isolation suite exited with code ${TI_RC}." >&2
  echo "$TI_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "tenant isolation"
fi

echo "    ok  ${TI_PASSED} tenant isolation assertions passed"

if [ "$TI_PASSED" -lt 24 ]; then
  echo "FAIL: expected at least 24 tenant isolation assertions, only ${TI_PASSED} ran." >&2
  suite_failed "tenant isolation (assertion shortfall: floor 24)"
fi

# ---------------------------------------------------------------------------
# Interview-method library tenant read (20261115090000). The pilot-blocking
# finding: draft interview-method design content was readable by every active
# employer member of every employer, because five employer read policies
# decided on membership alone. Two employers, a suspended employer, an invited
# member, a candidate, a governance reader, a platform admin and anon; the
# approved contract; the case-linked continuity; forged JWT metadata; direct
# reads and direct RPCs; the SECURITY DEFINER allowlist; and four in-suite
# controls that plant the defect back and require the same assertions to fail.
#
# Then the rollback runs for real, the suite is run AGAINST the rolled-back
# schema and is REQUIRED TO FAIL -- a denial suite that cannot fail is not a
# guard -- and the migration is re-applied over it with its own proof.
# ---------------------------------------------------------------------------
echo "==> Running interview-method library tenant-read assertions"
set +e
ML_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_method_library_tenant_read_test.sql 2>&1)"
ML_RC=$?
set -e

echo "$ML_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ML_PASSED="$(echo "$ML_OUT" | grep -c "ok  " || true)"
ML_FAILED=0

if [ "$ML_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the interview-method library tenant-read suite exited with code ${ML_RC}." >&2
  echo "$ML_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  ML_FAILED=1
else
  echo "    ok  ${ML_PASSED} interview-method library tenant-read assertions passed"
  if [ "$ML_PASSED" -lt 120 ]; then
    echo "FAIL: expected at least 120 tenant-read assertions, only ${ML_PASSED} ran." >&2
    echo "      A denial suite that silently stops running assertions passes silently." >&2
    ML_FAILED=1
  fi
fi

# The harness-level negative control: the original defect, planted in
# place while the predicate still exists -- the method policy decides on
# membership alone -- and the suite MUST fail, and fail on an assertion.
# (Not "against the rolled-back schema": there the predicate is gone, and a
# suite failing on a missing function has detected nothing about the
# boundary.) The migration is then re-applied below, which restores the
# policy and proves the re-apply path in the same breath.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods USING (EXISTS (SELECT 1 FROM public.employer_memberships em WHERE em.user_id = auth.uid() AND em.status = 'active'));"
set +e
ML_WEAK="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_method_library_tenant_read_test.sql 2>&1)"
ML_WEAK_RC=$?
set -e
if [ "$ML_WEAK_RC" -eq 0 ] || ! echo "$ML_WEAK" | grep -q "ASSERTION FAILED"; then
  echo "FAIL: the tenant-read suite PASSED with the membership-only method policy planted back." >&2
  echo "      The suite cannot tell the fixed boundary from the original defect, so it guards nothing." >&2
  echo "$ML_WEAK" | grep -iE "ERROR:|FEL:" | head -3 >&2
  ML_FAILED=1
else
  echo "    ok  the suite FAILS with the original defect planted back: $(echo "$ML_WEAK" | grep -o 'ASSERTION FAILED: ML[0-9.]*' | head -1)"
fi

set +e
ML_RB="$(psql -v ON_ERROR_STOP=1 -1 -d "$TEST_DB" \
  -f supabase/rollback/20261115090000_scp_interview_method_library_tenant_read_rollback.sql 2>&1)"
ML_RB_RC=$?
set -e
if [ "$ML_RB_RC" -ne 0 ] || ! echo "$ML_RB" | grep -q "SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK ok"; then
  echo "FAIL: the interview-method library tenant-read rollback did not verify." >&2
  echo "$ML_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  ML_FAILED=1
else
  echo "    ok  the rollback restores the five membership-only predicates verbatim and drops the predicate"
fi

set +e
ML_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261115090000_scp_interview_method_library_tenant_read.sql 2>&1)"
ML_RE_RC=$?
set -e
if [ "$ML_RE_RC" -ne 0 ] || ! echo "$ML_RE" | grep -q "SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok"; then
  echo "FAIL: the interview-method library tenant-read migration does not re-apply over the rolled-back state." >&2
  echo "$ML_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ML_FAILED=1
else
  echo "    ok  and the migration re-applies cleanly over it, with its postflight proof"
fi

if [ "$ML_FAILED" -ne 0 ]; then
  suite_failed "interview-method library tenant read"
fi

# ---------------------------------------------------------------------------
# Outstanding review gates are operator-only (20261116090000).
#
# public.cd_outstanding_reviews lost its security_invoker option to a bare
# CREATE OR REPLACE VIEW in 20260731100000 -- that statement RESETS reloptions
# -- and silently became a definer view, so every signed-in user read the
# governance gates of every definition version. The owner's decision of
# 2026-09-14 is that only platform administrators and internal testers may.
#
# The planted defect below is the ORIGINAL one: the view re-declared with no
# reloptions and no operator predicate, exactly as it stood on main. The suite
# MUST fail on an assertion. Restoring only the flag would not be the original
# defect -- and, as the suite's CDO13/CDO14 pair shows, would not be a fix
# either, because the permissive "live readable" policy is OR-ed in.
# ---------------------------------------------------------------------------
echo "==> Running outstanding-reviews operator-only assertions"
set +e
CDO_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_outstanding_reviews_operator_only_test.sql 2>&1)"
CDO_RC=$?
set -e

echo "$CDO_OUT" | grep -E "ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /' || true
CDO_PASSED="$(echo "$CDO_OUT" | grep -c "ok  " || true)"
CDO_FAILED=0

if [ "$CDO_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the outstanding-reviews operator-only suite exited with code ${CDO_RC}." >&2
  echo "$CDO_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  CDO_FAILED=1
else
  echo "    ok  ${CDO_PASSED} outstanding-reviews operator-only assertions passed"
  if [ "$CDO_PASSED" -lt 16 ]; then
    echo "FAIL: expected at least 16 operator-only assertions, only ${CDO_PASSED} ran." >&2
    echo "      A denial suite that silently stops running assertions passes silently." >&2
    CDO_FAILED=1
  fi
fi

# The harness-level negative control: the original definer view, planted back.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" <<'PLANT' >/dev/null
DROP VIEW public.cd_outstanding_reviews;
CREATE VIEW public.cd_outstanding_reviews AS
SELECT dv.definition_version, dv.lifecycle_status, g.key AS review_gate,
       (g.value = 'true'::jsonb) AS cleared
FROM public.cd_definition_versions dv
CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
WHERE g.value <> 'true'::jsonb;
REVOKE ALL ON public.cd_outstanding_reviews FROM anon;
GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;
PLANT
set +e
CDO_WEAK="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_outstanding_reviews_operator_only_test.sql 2>&1)"
CDO_WEAK_RC=$?
set -e
if [ "$CDO_WEAK_RC" -eq 0 ] || ! echo "$CDO_WEAK" | grep -q "ASSERTION FAILED"; then
  echo "FAIL: the operator-only suite PASSED with the original definer view planted back." >&2
  echo "      The suite cannot tell the corrected view from the finding, so it guards nothing." >&2
  echo "$CDO_WEAK" | grep -iE "ERROR:|FEL:" | head -3 >&2
  CDO_FAILED=1
else
  echo "    ok  the suite FAILS with the original defect planted back: $(echo "$CDO_WEAK" | grep -o 'ASSERTION FAILED: CDO[0-9]*' | head -1)"
fi

# Rollback, over the planted state, must reproduce that same pre-migration
# shape and verify it.
set +e
CDO_RB="$(psql -v ON_ERROR_STOP=1 -1 -d "$TEST_DB" \
  -f supabase/rollback/20261116090000_cd_outstanding_reviews_operator_only_rollback.sql 2>&1)"
CDO_RB_RC=$?
set -e
if [ "$CDO_RB_RC" -ne 0 ] || ! echo "$CDO_RB" | grep -q "CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_ROLLBACK ok"; then
  echo "FAIL: the outstanding-reviews operator-only rollback did not verify." >&2
  echo "$CDO_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  CDO_FAILED=1
else
  echo "    ok  the rollback restores the definer-mode, ungated view verbatim"
fi

set +e
CDO_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261116090000_cd_outstanding_reviews_operator_only.sql 2>&1)"
CDO_RE_RC=$?
set -e
if [ "$CDO_RE_RC" -ne 0 ] || ! echo "$CDO_RE" | grep -q "CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_PROOF ok"; then
  echo "FAIL: the outstanding-reviews migration does not re-apply over the rolled-back state." >&2
  echo "$CDO_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CDO_FAILED=1
else
  echo "    ok  and the migration re-applies cleanly over it, with its postflight proof"
fi

# And the suite passes again on the re-applied schema, so the run does not
# leave a planted defect behind for every later suite.
set +e
CDO_AGAIN="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cd_outstanding_reviews_operator_only_test.sql 2>&1)"
CDO_AGAIN_RC=$?
set -e
if [ "$CDO_AGAIN_RC" -ne 0 ]; then
  echo "FAIL: the operator-only suite does not pass again after rollback and re-apply." >&2
  echo "$CDO_AGAIN" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -5 >&2
  CDO_FAILED=1
else
  echo "    ok  the suite passes again on the re-applied schema"
fi

if [ "$CDO_FAILED" -ne 0 ]; then
  suite_failed "outstanding reviews operator only"
fi

# ---------------------------------------------------------------------------
# Interview evidence reliability (20261020090000): evidence stays bound to its
# case, question, application and employer; the writers are idempotent under
# double-click and retry; an assessment covers the material that existed when
# it was made and the report waits when newer material arrives; the finalised
# report is unchanged by everything that happens afterwards; and every
# cross-tenant and cross-case attempt is refused at the database.
# ---------------------------------------------------------------------------
echo "==> Running interview evidence reliability assertions"
set +e
ER_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_evidence_reliability_test.sql 2>&1)"
ER_RC=$?
set -e

echo "$ER_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ER_PASSED="$(echo "$ER_OUT" | grep -c "ok  " || true)"

if [ "$ER_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the interview evidence reliability suite exited with code ${ER_RC}." >&2
  echo "$ER_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "interview evidence reliability"
fi

echo "    ok  ${ER_PASSED} interview evidence reliability assertions passed"

if [ "$ER_PASSED" -lt 45 ]; then
  echo "FAIL: expected at least 45 interview evidence reliability assertions, only ${ER_PASSED} ran." >&2
  suite_failed "interview evidence reliability (assertion shortfall: floor 45)"
fi

# ---------------------------------------------------------------------------
# TRUST Evidence Report -- PR-R0 characterisation and safety contract.
#
# Pins what the report chain does TODAY before the TRUST Evidence Report is
# built on it: self-report never counts as observed evidence (c07/c19
# included), SCC-08's single observed item reads as limited evidence and never
# as a weakness, a safety finding changes no number (proven on identical
# answers with and without the finding), free text becomes evidence only
# through a completed human rubric review, only owner/admin can release and
# only one routine can write a snapshot, released snapshots survive item edits,
# new templates, interview notes and decisions byte-for-byte, and no snapshot
# can carry a score, rank, match, suitability, pass/fail, hire/reject or radar
# key or phrase in either language.
#
# The assertions suffixed X are PINNED EXPOSURES: audience-boundary gaps that
# exist today (derivation_input on the audience-readable row, the evidence
# ledger readable by its subject, mean/spread in the employer brief). They are
# asserted as they stand so that PR-R2 has to change them on purpose.
# ---------------------------------------------------------------------------
echo "==> Running TRUST evidence report R0 characterisation assertions"
set +e
TR0_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_evidence_report_r0_test.sql 2>&1)"
TR0_RC=$?
set -e

echo "$TR0_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
TR0_PASSED="$(echo "$TR0_OUT" | grep -c "ok  " || true)"

if [ "$TR0_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the TRUST evidence report R0 suite exited with code ${TR0_RC}." >&2
  echo "$TR0_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "TRUST evidence report R0 characterisation"
fi

echo "    ok  ${TR0_PASSED} TRUST evidence report R0 assertions passed"

if [ "$TR0_PASSED" -lt 185 ]; then
  echo "FAIL: expected at least 185 TRUST evidence report R0/R2A/R1 assertions, only ${TR0_PASSED} ran." >&2
  suite_failed "TRUST evidence report R0/R2A/R1 (assertion shortfall: floor 185)"
fi

# ---------------------------------------------------------------------------
# Facet resolution (20261026093000, carried into R1): the guide facet resolves
# by (competency_id, slug) bound to the prompt. Valid relational fixtures:
# a second real competency receives the form's facet slugs with wrong-facet
# prompts, and the released documents must equal the clean control.
# Runs BEFORE the rollback step (it reads the SCP content spine).
# ---------------------------------------------------------------------------
echo "==> Running facet-resolution assertions"
set +e
FR_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_release_facet_resolution_test.sql 2>&1)"
FR_RC=$?
set -e

echo "$FR_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
FR_PASSED="$(echo "$FR_OUT" | grep -c "ok  " || true)"

if [ "$FR_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the facet-resolution suite exited with code ${FR_RC}." >&2
  echo "$FR_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "facet resolution"
fi

echo "    ok  ${FR_PASSED} facet-resolution assertions passed"

if [ "$FR_PASSED" -lt 20 ]; then
  echo "FAIL: expected at least 20 facet-resolution assertions, only ${FR_PASSED} ran." >&2
  suite_failed "facet resolution (assertion shortfall: floor 20)"
fi

# ---------------------------------------------------------------------------
# PR-R3A (20261029090000): the Report V3 data contract, employer audience.
# scp_employer_report_v3 is a projection of the released employer document;
# the suite releases three Väktare attempts and proves the V3 document is
# the locked shape, equals the frozen document conclusion for conclusion,
# keeps SCC-08 limited, keeps self-report apart, reaches nothing internal,
# is NULL for every wrong principal, composes with interview notes without
# touching the report, and survives the orphaned-template and pre-R1 shapes.
# Runs BEFORE the rollback step (it reads the SCP content spine).
# ---------------------------------------------------------------------------
echo "==> Running TRUST evidence report R3A (Report V3 contract) assertions"
set +e
R3A_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_evidence_report_r3a_contract_test.sql 2>&1)"
R3A_RC=$?
set -e

echo "$R3A_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
R3A_PASSED="$(echo "$R3A_OUT" | grep -c "ok  " || true)"

if [ "$R3A_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the TRUST evidence report R3A suite exited with code ${R3A_RC}." >&2
  echo "$R3A_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "TRUST evidence report R3A contract"
fi

echo "    ok  ${R3A_PASSED} TRUST evidence report R3A assertions passed"

if [ "$R3A_PASSED" -lt 75 ]; then
  echo "FAIL: expected at least 75 TRUST evidence report R3A assertions, only ${R3A_PASSED} ran." >&2
  suite_failed "TRUST evidence report R3A contract (assertion shortfall: floor 75)"
fi
for REQUIRED in \
  "V3.1 SCC-08 = {observed_pattern not_established, evidence_sufficiency limited" \
  "V3.4 sufficiency follows the observed count exactly" \
  "V8.1b TEST E / F: every protected field appears only at its approved path" \
  "V8.1c TEST H: coverage_status is internal only" \
  "V9.2b TEST F: with addenda present every path is still allowlisted" \
  "V11.3 TEST A: after the template text" \
  "V13.1 TEST D: the shared core holds no safety finding" \
  "V4.2 no competency lists self_report as a source" \
  "V7.1 clearest support needs an established consistent pattern AND sufficient evidence" \
  "V7.6 TEST 1: a consistent pattern on limited evidence is never clearest support" \
  "V8.1 TEST 8 / E: every key path at every depth of the employer document is on the locked path allowlist" \
  "V8.2 TEST 8: no author id, no e-mail, no manifest field" \
  "V8.5 the participant gets NULL from the employer V3 contract" \
  "V9.3 TEST 6 / G: after the addenda, frozen_report is byte-identical" \
  "V10.2 TEST 2: with two report-level contexts" \
  "V11.2 TEST 4: after the rubric editions are retired" \
  "V12.1 TEST 7: human_review.completed is true" \
  "V13.2 the core's human-review, provenance and sufficiency-definition blocks"; do
  if ! echo "$R3A_OUT" | grep -qF "$REQUIRED"; then
    echo "FAIL: the mandatory R3A contract assertion did not run: ${REQUIRED}" >&2
    suite_failed "R3A contract (missing: ${REQUIRED})"
  fi
done

# ---------------------------------------------------------------------------
# rds-v1 parity: the TypeScript next-step rule and scp_report_next_step must
# agree on every point of the state matrix. The TypeScript half generates
# the SQL assertions; this executes them against the replayed database.
# ---------------------------------------------------------------------------
echo "==> Running rds-v1 next-step parity (SQL half)"
set +e
PARITY_SQL="$(bun run scripts/trust-next-step-parity-check.ts --sql 2>/dev/null)"
PARITY_GEN_RC=$?
set -e
if [ "$PARITY_GEN_RC" -ne 0 ] || [ -z "$PARITY_SQL" ]; then
  echo "FAIL: the parity matrix could not be generated (rc ${PARITY_GEN_RC})." >&2
  suite_failed "rds-v1 parity (generation)"
else
  set +e
  PARITY_OUT="$(echo "$PARITY_SQL" | psql -v ON_ERROR_STOP=1 -d "$TEST_DB" 2>&1)"
  PARITY_RC=$?
  set -e
  if [ "$PARITY_RC" -ne 0 ] || ! echo "$PARITY_OUT" | grep -q "rds-v1 parity"; then
    echo "FAIL: rds-v1 parity between TypeScript and SQL failed." >&2
    echo "$PARITY_OUT" | grep -iE "PARITY FAILED|ERROR:|FEL:" | head -5 >&2
    suite_failed "rds-v1 parity (SQL half)"
  else
    echo "$PARITY_OUT" | grep "rds-v1 parity" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /'
  fi
fi

# ---------------------------------------------------------------------------
# PR-R3A rollback. The V3 contract stands on PR-R1 (it reads the snapshot's
# manifest link as a fact), so it is rolled back BEFORE R1 below and
# re-applied AFTER R1 is back. Its rollback drops one function and must leave
# the audience contracts, the release function and the snapshots alone.
# ---------------------------------------------------------------------------
echo "==> Rolling PR-R3A (Report V3 contract) back"
set +e
R3A_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261029090000_scp_trust_evidence_report_r3a_contract_rollback.sql 2>&1)"
R3A_BACK_RC=$?
set -e
if [ "$R3A_BACK_RC" -ne 0 ]; then
  echo "FAIL: the R3A rollback exited with code ${R3A_BACK_RC}." >&2
  echo "$R3A_BACK" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "R3A contract rollback"
fi
R3A_GONE="$(psql -tAq -d "$TEST_DB" -c \
  "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('scp_employer_report_v3','scp_report_next_step'))
        + (2 - (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('scp_participant_report','scp_employer_report') and p.prosrc like '%scp_audience_brief%'));")"
if [ "$R3A_GONE" != "0" ]; then
  echo "FAIL: after the R3A rollback the V3 contract survived or an audience contract is gone (${R3A_GONE})." >&2
  suite_failed "R3A contract rollback (state not restored)"
else
  echo "    ok  R3A rolled back -- scp_employer_report_v3 gone, audience contracts untouched"
fi

# ---------------------------------------------------------------------------
# PR-R1 (20261027090000, REPRODUCIBLE PROVENANCE) rollback and re-apply.
#
# The R0 suite above released three attempts and rolled its transaction back,
# so no manifest row exists here and the rollback's data-loss guard does not
# engage. Roll R1 back, prove the pre-R1 release function and the absence of
# every R1 object, re-apply R1, prove it is back. That proves the documented
# rollback works on a database that has the state it reverses, and that R1 is
# safe to re-apply after a rollback.
# ---------------------------------------------------------------------------
echo "==> Rolling PR-R1 provenance back"
set +e
R1_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261027090000_scp_trust_evidence_report_r1_provenance_rollback.sql 2>&1)"
R1_BACK_RC=$?
set -e
if [ "$R1_BACK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the R1 provenance rollback exited with code ${R1_BACK_RC}." >&2
  echo "$R1_BACK" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "R1 provenance rollback"
fi
R1_GONE="$(psql -tAq -d "$TEST_DB" -c \
  "select (select count(*) from information_schema.tables where table_schema='public' and table_name='scp_report_computation_manifests')
        + (select count(*) from information_schema.columns where table_schema='public' and table_name='scp_report_snapshots' and column_name in ('manifest_id','canonical_sha256'))
        + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('scp_report_manifest_hash','scp_report_manifest_computation','scp_verify_report_manifest','scp_guard_manifest_immutable'))
        + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_release_attempt_report' and p.prosrc like '%scp_report_computation_manifests%');")"
if [ "$R1_GONE" != "0" ]; then
  echo "FAIL: after the R1 rollback, ${R1_GONE} R1 object(s) or reference(s) survived." >&2
  suite_failed "R1 provenance rollback (objects survived)"
else
  echo "    ok  R1 rolled back -- no manifest table, no link columns, no R1 routine, pre-R1 release function restored"
fi

echo "==> R3A must refuse on a database without PR-R1"
set +e
R3A_REFUSE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260906125945_scp_trust_evidence_report_r3a_contract.sql 2>&1)"
R3A_REFUSE_RC=$?
set -e
if [ "$R3A_REFUSE_RC" -eq 0 ] || ! echo "$R3A_REFUSE" | grep -q "SCP_R3A_PRECONDITION: scp_report_snapshots.manifest_id is missing"; then
  echo "FAIL: R3A applied (or failed for another reason) without PR-R1 underneath." >&2
  echo "$R3A_REFUSE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "R3A precondition (PR-R1)"
else
  echo "    ok  R3A refused: SCP_R3A_PRECONDITION (PR-R1) -- nothing installed"
fi

# The restored pre-R1 function must be the CORRECTED one (20261026093000),
# never the slug-only 20260830093000 body.
R1_RESTORED_SCOPED="$(psql -tAq -d "$TEST_DB" -c \
  "select (p.prosrc ~ 'EXISTS \\(SELECT 1 FROM public\\.scp_competency_facets f2\\s+WHERE f2\\.id = p\\.facet_id\\s+AND f2\\.competency_id = c\\.id\\s+AND f2\\.slug = g\\.facet_slug\\)' and p.prosrc !~ 'WHERE f2\\.slug = g\\.facet_slug')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_release_attempt_report';")"
if [ "$R1_RESTORED_SCOPED" != "true" ]; then
  echo "FAIL: the R1 rollback restored a release function without the competency-scoped facet lookup." >&2
  suite_failed "R1 provenance rollback (restored the slug-only release function)"
else
  echo "    ok  the R1 rollback restored the corrected pre-R1 release function (facet by competency + slug)"
fi

# ── The facet prerequisite: rollback, R1 must refuse, re-apply ────────────
echo "==> Rolling the facet-resolution prerequisite (20261026093000) back"
set +e
FR_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261026093000_scp_release_facet_resolution_rollback.sql 2>&1)"
FR_BACK_RC=$?
set -e
if [ "$FR_BACK_RC" -ne 0 ]; then
  echo "FAIL: the facet-resolution rollback exited with code ${FR_BACK_RC}." >&2
  echo "$FR_BACK" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "facet-resolution rollback"
fi
FR_SLUG_ONLY="$(psql -tAq -d "$TEST_DB" -c \
  "select (p.prosrc ~ 'WHERE f2\\.slug = g\\.facet_slug' and p.prosrc !~ 'f2\\.competency_id = c\\.id')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_release_attempt_report';")"
if [ "$FR_SLUG_ONLY" != "true" ]; then
  echo "FAIL: after the facet rollback the release function is not the 20260830093000 body." >&2
  suite_failed "facet-resolution rollback (state not restored)"
else
  echo "    ok  facet prerequisite rolled back -- the 20260830093000 slug-only body is back (the defect, by design)"
fi

echo "==> R1 must refuse while the release function resolves facets by slug alone"
set +e
R1_REFUSE_FACET="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260905054603_scp_trust_evidence_report_r1_provenance.sql 2>&1)"
R1_REFUSE_FACET_RC=$?
set -e
if [ "$R1_REFUSE_FACET_RC" -eq 0 ] || ! echo "$R1_REFUSE_FACET" | grep -q "SCP_R1_PRECONDITION: scp_release_attempt_report still resolves guide facets by slug alone"; then
  echo "FAIL: R1 applied (or failed for another reason) on top of the slug-only release function." >&2
  echo "$R1_REFUSE_FACET" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "R1 precondition (facet resolution)"
else
  echo "    ok  R1 refused: SCP_R1_PRECONDITION (facet resolution) -- nothing installed"
fi

echo "==> Re-applying the facet-resolution prerequisite"
set +e
FR_FWD="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260905053809_scp_release_facet_resolution.sql 2>&1)"
FR_FWD_RC=$?
set -e
if [ "$FR_FWD_RC" -ne 0 ]; then
  echo "FAIL: re-applying the facet-resolution prerequisite exited with code ${FR_FWD_RC}." >&2
  echo "$FR_FWD" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "facet-resolution re-application"
else
  echo "    ok  facet prerequisite re-applied; its apply-time proof passed"
fi

# ── Hosted-shaped refusal: no option_order_seed, R1 must refuse ───────────
# The column is renamed, not dropped, so nothing that depends on it is lost;
# a plpgsql body is resolved at run time and sees only the current name.
echo "==> R1 must refuse on a database without scp_attempts.option_order_seed"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c \
  "ALTER TABLE public.scp_attempts RENAME COLUMN option_order_seed TO option_order_seed_hidden_for_test;" >/dev/null
set +e
R1_REFUSE_SEED="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260905054603_scp_trust_evidence_report_r1_provenance.sql 2>&1)"
R1_REFUSE_SEED_RC=$?
set -e
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c \
  "ALTER TABLE public.scp_attempts RENAME COLUMN option_order_seed_hidden_for_test TO option_order_seed;" >/dev/null
if [ "$R1_REFUSE_SEED_RC" -eq 0 ] || ! echo "$R1_REFUSE_SEED" | grep -q "SCP_R1_PRECONDITION: scp_attempts.option_order_seed is missing"; then
  echo "FAIL: R1 applied (or failed for another reason) on a schema without option_order_seed." >&2
  echo "$R1_REFUSE_SEED" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "R1 precondition (option_order_seed)"
else
  echo "    ok  R1 refused: SCP_R1_PRECONDITION (option_order_seed) -- nothing installed"
fi
R1_NOTHING="$(psql -tAq -d "$TEST_DB" -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_name='scp_report_computation_manifests';")"
if [ "$R1_NOTHING" != "0" ]; then
  echo "FAIL: a refused R1 apply left the manifest table behind." >&2
  suite_failed "R1 precondition (partial apply)"
fi

echo "==> Re-applying PR-R1 provenance"
set +e
R1_FWD="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260905054603_scp_trust_evidence_report_r1_provenance.sql 2>&1)"
R1_FWD_RC=$?
set -e
if [ "$R1_FWD_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: re-applying R1 exited with code ${R1_FWD_RC}." >&2
  echo "$R1_FWD" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "R1 provenance re-application"
fi
R1_BACK_AGAIN="$(psql -tAq -d "$TEST_DB" -c \
  "select (select count(*) from information_schema.tables where table_schema='public' and table_name='scp_report_computation_manifests')
        + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scp_release_attempt_report' and p.prosrc like '%scp_report_computation_manifests%');")"
if [ "$R1_BACK_AGAIN" != "2" ]; then
  echo "FAIL: after re-applying R1 the manifest table or the release function is not back (${R1_BACK_AGAIN}/2)." >&2
  suite_failed "R1 provenance re-application (state not restored)"
else
  echo "    ok  R1 re-applied -- manifest table and release function back; apply-time proof passed"
fi

echo "==> Re-applying PR-R3A (Report V3 contract)"
set +e
R3A_FWD="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260906125945_scp_trust_evidence_report_r3a_contract.sql 2>&1)"
R3A_FWD_RC=$?
set -e
if [ "$R3A_FWD_RC" -ne 0 ]; then
  echo "FAIL: re-applying R3A exited with code ${R3A_FWD_RC}." >&2
  echo "$R3A_FWD" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "R3A contract re-application"
else
  echo "    ok  R3A re-applied -- scp_employer_report_v3 back; apply-time proof passed"
fi

# ---------------------------------------------------------------------------
# PR-R2A-1 (EXPAND, 20261024090000) compatibility contract.
#
# The audience entry points exist and the application on main still reads
# scp_report_snapshots directly. Both must work at once, because this is the
# state the hosted database sits in from the moment EXPAND is applied until
# PR-R2A-2 (the application cutover) is live -- and, deliberately, for as long
# after that as anyone likes. PR-R2A-3 (CONTRACT) is what ends it, and this
# suite is what R2A-3 has to reach by rolling itself back.
# ---------------------------------------------------------------------------
# PR-R2A-3 (20261026090000, CONTRACT) withdraws the direct read that this
# suite asserts is still present, so the suite is run in the state it
# describes: roll CONTRACT back, run it, re-apply CONTRACT. That proves the
# rollback works on a database that has the state it reverses, and that
# CONTRACT is safe to re-apply -- which is what happens if a sequencing
# mistake is corrected by rolling back and rolling forward again.
echo "==> Rolling PR-R2A-3 CONTRACT back to reach the post-EXPAND state"
set +e
R2A3_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261026090000_scp_trust_evidence_report_r2a_contract_rollback.sql 2>&1)"
R2A3_BACK_RC=$?
set -e
if [ "$R2A3_BACK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the R2A-3 contract rollback exited with code ${R2A3_BACK_RC}." >&2
  echo "$R2A3_BACK" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "R2A-3 contract rollback (reaching the post-expand state)"
else
  echo "    ok  R2A-3 contract rolled back -- the database is now in the post-EXPAND state"
fi

echo "==> Running PR-R2A-1 expand-phase compatibility assertions"
set +e
R2A_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_evidence_report_r2a_expand_test.sql 2>&1)"
R2A_RC=$?
set -e

echo "$R2A_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
R2A_PASSED="$(echo "$R2A_OUT" | grep -c "ok  " || true)"

if [ "$R2A_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the R2A expand-phase suite exited with code ${R2A_RC}." >&2
  echo "$R2A_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "R2A expand phase compatibility"
else
  echo "    ok  ${R2A_PASSED} R2A expand-phase assertions passed"

  # E1 is "the deployed code still works" and E2 is "the new code already
  # works". Half of that is indistinguishable from a race.
  for REQUIRED in \
    "E1.1 main's direct participant read (getAcademyReport) still returns the participant row after EXPAND" \
    "E1.2 main's direct employer read (getAcademyReport and the interview bridge) still returns the employer row after EXPAND" \
    "E2.1 the participant entry point already returns the participant document, and only that one" \
    "E2.2 the employer entry point already returns the employer document without mean/spread or internal ids"; do
    if ! echo "$R2A_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: the mandatory R2A expand-phase assertion did not run: ${REQUIRED}" >&2
      suite_failed "R2A expand phase compatibility (missing: ${REQUIRED})"
    fi
  done

  if [ "$R2A_PASSED" -lt 14 ]; then
    echo "FAIL: expected at least 14 R2A expand-phase assertions, only ${R2A_PASSED} ran." >&2
    suite_failed "R2A expand phase compatibility (assertion shortfall: floor 14)"
  fi
fi

echo "==> Re-applying PR-R2A-3 CONTRACT"
set +e
R2A3_FWD="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20260904174903_scp_trust_evidence_report_r2a_contract.sql 2>&1)"
R2A3_FWD_RC=$?
set -e
if [ "$R2A3_FWD_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: re-applying the R2A-3 CONTRACT exited with code ${R2A3_FWD_RC}." >&2
  echo "$R2A3_FWD" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "R2A-3 contract re-application"
else
  echo "    ok  R2A-3 contract re-applied -- a corrected sequencing mistake rolls forward cleanly"
fi
ac_restore_model # the contract migration re-creates the snapshot policies the access model replaced
R2A3_LEFT="$(psql -tAq -d "$TEST_DB" -c "
  SELECT count(*) FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
     AND grantee IN ('authenticated', 'anon', 'PUBLIC')")"
if [ "$R2A3_LEFT" != "0" ]; then
  echo "FAIL: an audience role still holds ${R2A3_LEFT} privilege(s) on scp_report_snapshots after re-applying CONTRACT." >&2
  suite_failed "R2A-3 contract re-application (direct read still open)"
fi

# ---------------------------------------------------------------------------
# PR-R2A-2 hotfix: report-version continuity (20261025090000).
#
# A released snapshot whose scp_report_versions row is missing must still
# reach its audience. On production 16 released reports were withheld by the
# INNER JOIN that 20261024090000 used to fetch template limitations, while the
# candidate's own history still offered them -- the contradiction this suite
# asserts away. It also proves the other half: a report released TODAY cannot
# become an orphan, because the release path only stores an id it selected,
# the foreign key refuses a dangling one, ON DELETE RESTRICT protects the
# template, and the immutability trigger refuses to repoint a released row.
# ---------------------------------------------------------------------------
echo "==> Running PR-R2A-2 report-version continuity assertions"
set +e
R2AC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_evidence_report_r2a_continuity_test.sql 2>&1)"
R2AC_RC=$?
set -e

echo "$R2AC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
R2AC_PASSED="$(echo "$R2AC_OUT" | grep -c "ok  " || true)"

if [ "$R2AC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the R2A continuity suite exited with code ${R2AC_RC}." >&2
  echo "$R2AC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "R2A report-version continuity"
else
  echo "    ok  ${R2AC_PASSED} R2A continuity assertions passed"

  # The two halves of the contract. Losing either one silently would return
  # the product to the state this hotfix exists to end.
  for REQUIRED in \
    "C1.2 (A) the participant still receives their released report with the template row missing" \
    "C1.3 (B) the employer still receives the released employer report" \
    "C3.3 the foreign key refuses a snapshot pointing at a template that does not exist" \
    "C4.2 (I) THE REGRESSION: whenever the history offers the report, the participant contract returns it"; do
    if ! echo "$R2AC_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: the mandatory R2A continuity assertion did not run: ${REQUIRED}" >&2
      suite_failed "R2A report-version continuity (missing: ${REQUIRED})"
    fi
  done

  if [ "$R2AC_PASSED" -lt 25 ]; then
    echo "FAIL: expected at least 25 R2A continuity assertions, only ${R2AC_PASSED} ran." >&2
    suite_failed "R2A report-version continuity (assertion shortfall: floor 25)"
  fi
fi

# ---------------------------------------------------------------------------
# PR-R2A-3 CONTRACT (20261026090000): the audience boundary, closed.
#
# Every audience reads only through its entry point; the table refuses the
# role; the subject reads no ledger row; the 16 historical orphans stay
# readable; the Interview Intelligence bridge still finds what it needs; anon
# and the wrong tenant get nothing from any path.
# ---------------------------------------------------------------------------
echo "==> Running PR-R2A-3 contract assertions"
set +e
R2A3_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_trust_evidence_report_r2a_contract_test.sql 2>&1)"
R2A3_RC=$?
set -e

echo "$R2A3_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
R2A3_PASSED="$(echo "$R2A3_OUT" | grep -c "ok  " || true)"

if [ "$R2A3_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the R2A-3 contract suite exited with code ${R2A3_RC}." >&2
  echo "$R2A3_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "R2A-3 contract"
else
  echo "    ok  ${R2A3_PASSED} R2A-3 contract assertions passed"
  for REQUIRED in \
    "K1.3 the participant cannot SELECT the snapshot table at all" \
    "K1.5 the participant reads zero evidence-ledger rows" \
    "K2.3 the employer cannot SELECT the snapshot table at all" \
    "K3.2 the orphaned employer report is still returned through the contract"; do
    if ! echo "$R2A3_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: the mandatory R2A-3 contract assertion did not run: ${REQUIRED}" >&2
      suite_failed "R2A-3 contract (missing: ${REQUIRED})"
    fi
  done
  if [ "$R2A3_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 R2A-3 contract assertions, only ${R2A3_PASSED} ran." >&2
    suite_failed "R2A-3 contract (assertion shortfall: floor 30)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Rollback verification (destructive -- must run last)
# ---------------------------------------------------------------------------
echo "==> Verifying job lifecycle, Annat taxonomy and candidate notification"
set +e
LIFE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/employer_job_lifecycle_test.sql 2>&1)"
LIFE_RC=$?
set -e

LIFE_PASSED="$(echo "$LIFE_OUT" | grep -c "ok  " || true)"

if [ "$LIFE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer job lifecycle suite exited with code ${LIFE_RC}." >&2
  echo "$LIFE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "employer job lifecycle"
else
  echo "    ok  ${LIFE_PASSED} job lifecycle assertions passed"
  if [ "$LIFE_PASSED" -lt 28 ]; then
    echo "FAIL: expected at least 28 job lifecycle assertions, only ${LIFE_PASSED} ran." >&2
    suite_failed "employer job lifecycle (assertion shortfall: floor 28)"
  fi
fi

# NOTE ON PLACEMENT: this suite runs BEFORE the rollback verification on
# purpose. jobs_delete_draft() reads public.scp_assessment_invitations, and the
# documented rollback removes the scp_ schema -- so after that point the
# function raises "relation does not exist" and the suite would be testing the
# teardown rather than the product.
# NOTE ON PLACEMENT: this suite must run BEFORE the rollback suite below,
# which really does DROP the Security Competency tables. Everything after
# that point runs against a schema those tables no longer exist in.
# ---------------------------------------------------------------------------
echo "==> Verifying Admin Control Center lifecycle and safe data management"
set +e
ACC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/admin_lifecycle_test.sql 2>&1)"
ACC_RC=$?
set -e

ACC_PASSED="$(echo "$ACC_OUT" | grep -c "ok  " || true)"

if [ "$ACC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Admin Control Center suite exited with code ${ACC_RC}." >&2
  echo "$ACC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Admin Control Center lifecycle"
else
  echo "    ok  ${ACC_PASSED} admin lifecycle assertions passed"
  if [ "$ACC_PASSED" -lt 144 ]; then
    echo "FAIL: expected at least 144 admin lifecycle assertions, only ${ACC_PASSED} ran." >&2
    suite_failed "Admin Control Center lifecycle (assertion shortfall: floor 144)"
  fi
fi

# ---------------------------------------------------------------------------
# Canonical Professional Profile: one home for the current profession.
#
# Runs BEFORE the rollback step, like every non-destructive suite: it reads
# sp_passport_profiles and cig_professions, both of which the SCP rollback
# drops. It also re-executes its own migration and rollback INSIDE its
# transaction, over seeded conflicting rows -- see the suite header for why
# reconciliation cannot otherwise be observed doing anything at all.
# ---------------------------------------------------------------------------
echo "==> Running canonical Professional Profile assertions"
set +e
CPP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/canonical_professional_profile_test.sql 2>&1)"
CPP_RC=$?
set -e

echo "$CPP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CPP_PASSED="$(echo "$CPP_OUT" | grep -c "ok  " || true)"

if [ "$CPP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the canonical Professional Profile suite exited with code ${CPP_RC}." >&2
  echo "$CPP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "canonical Professional Profile"
else
  echo "    ok  ${CPP_PASSED} canonical Professional Profile assertions passed"
  if [ "$CPP_PASSED" -lt 65 ]; then
    echo "FAIL: expected at least 65 canonical Professional Profile assertions, only ${CPP_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "canonical Professional Profile (assertion shortfall: floor 65)"
  fi
fi

# ---------------------------------------------------------------------------
# Canonical Professional Profile CONTRACT phase.
#
# The expand suite asserts the compatibility window behaves as designed; this
# one asserts it CLOSES, and that what remains is the one-way mirror the
# product's architecture claims. Runs immediately after the expand suite and
# before the rollback step, for the same reason.
# ---------------------------------------------------------------------------
echo "==> Running canonical Professional Profile contract assertions"
set +e
CPC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/canonical_professional_profile_contract_test.sql 2>&1)"
CPC_RC=$?
set -e

echo "$CPC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CPC_PASSED="$(echo "$CPC_OUT" | grep -c "ok  " || true)"

if [ "$CPC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the canonical Professional Profile contract suite exited with code ${CPC_RC}." >&2
  echo "$CPC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "canonical Professional Profile contract"
else
  echo "    ok  ${CPC_PASSED} canonical Professional Profile contract assertions passed"
  if [ "$CPC_PASSED" -lt 15 ]; then
    echo "FAIL: expected at least 15 contract assertions, only ${CPC_PASSED} ran." >&2
    suite_failed "canonical Professional Profile contract (assertion shortfall: floor 15)"
  fi
fi

# ---------------------------------------------------------------------------
# CV documents + Professional Identity privacy and isolation.
#
# Registered BEFORE the rollback step deliberately: the rollback suite drops
# tables this one reads, so a suite placed after it fails on "does not exist"
# for a reason that has nothing to do with what it asserts.
#
# It proves the two things a source-level guard structurally cannot. First,
# that a caller using the Professional Identity seam learns nothing about
# anybody else -- the seam is one read across five products, which is exactly
# where a boundary quietly stops holding. Second, that the Supabase
# default-privilege trap did not ship on cv_documents: a new table arrives
# already granted to anon, TRUNCATE included, and TRUNCATE is not something
# RLS constrains, so the suite executes the statements rather than reading
# the policies.
# ---------------------------------------------------------------------------
echo "==> Running CV documents and Professional Identity privacy assertions"
set +e
CVP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cv_documents_privacy_test.sql 2>&1)"
CVP_RC=$?
set -e

echo "$CVP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CVP_PASSED="$(echo "$CVP_OUT" | grep -c "ok  " || true)"

if [ "$CVP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the CV documents privacy suite exited with code ${CVP_RC}." >&2
  echo "$CVP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "CV documents privacy"
else
  echo "    ok  ${CVP_PASSED} CV documents privacy assertions passed"
  if [ "$CVP_PASSED" -lt 35 ]; then
    echo "FAIL: expected at least 35 CV privacy assertions, only ${CVP_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "CV documents privacy (assertion shortfall: floor 24)"
  fi
fi

# ---------------------------------------------------------------------------
# Applying with a CQrityjob CV.
#
# Registered BEFORE the rollback step, like every non-destructive suite: it
# reads cv_documents, job_applications and jobs, and the rollback drops tables
# underneath them.
#
# It proves what a source guard structurally cannot. The eligibility rule and
# the rendered document are asserted in TypeScript
# (scripts/cv-application-source-check.tsx); the BOUNDARIES are asserted here,
# by executing them: one candidate cannot attach another's CV, one employer
# cannot read another's application, an application that claims a CV it does
# not hold is refused by the table itself, and -- the reason the application
# stores a copy rather than a join -- editing or deleting the saved CV
# afterwards leaves the employer's copy exactly where it was.
# ---------------------------------------------------------------------------
echo "==> Running CQrityjob CV application source assertions"
set +e
CVS_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/job_application_cv_source_test.sql 2>&1)"
CVS_RC=$?
set -e

echo "$CVS_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CVS_PASSED="$(echo "$CVS_OUT" | grep -c "ok  " || true)"

if [ "$CVS_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the CQrityjob CV application source suite exited with code ${CVS_RC}." >&2
  echo "$CVS_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "CQrityjob CV application source"
else
  echo "    ok  ${CVS_PASSED} CQrityjob CV application source assertions passed"
  if [ "$CVS_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 CV application source assertions, only ${CVS_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "CQrityjob CV application source (assertion shortfall: floor 45)"
  fi
fi

# ---------------------------------------------------------------------------
# cv_documents controlled write path (phase 1) — the negative controls.
#
# 20261010090000 granted `authenticated` INSERT and UPDATE on cv_documents with
# RLS that checked ownership and nothing else, so a signed-in holder could POST
# an invented employment history straight to the Data API -- and
# sp_submit_application_with_cv_source would copy it onto an employer-readable
# job application.
#
# Phase 1 does NOT revoke that: the published application still depends on it,
# and revoking before the new application ships would break CV saving on the
# live site. So Group N proves the hole is still open -- it writes an
# employment that never happened and shows it landing -- and then proves the
# document cannot be SENT, because every fact is compared against the holder's
# own live records by VALUE. A real id with a rewritten employer name fails the
# same check, which is the attack an existence test would have missed.
#
# Runs BEFORE the rollback step: it depends on cv_documents, sp_claims and
# sp_experience_periods, and the rollback drops the tables the fixtures need.
# ---------------------------------------------------------------------------
echo "==> Running cv_documents controlled-write-path assertions"
set +e
CVO_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cv_documents_controlled_writes_test.sql 2>&1)"
CVO_RC=$?
set -e

echo "$CVO_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CVO_PASSED="$(echo "$CVO_OUT" | grep -c "ok  " || true)"

if [ "$CVO_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the cv_documents controlled-write-path suite exited with code ${CVO_RC}." >&2
  echo "$CVO_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "cv_documents controlled write path"
else
  echo "    ok  ${CVO_PASSED} cv_documents controlled-write-path assertions passed"
  # Raised from 55 with groups T (profession parity) and U (the refresh path
  # after the phase-3 lockdown). A floor that stays behind the suite lets a
  # whole group be deleted without anything going red.
  if [ "$CVO_PASSED" -lt 75 ]; then
    echo "FAIL: expected at least 75 controlled-write-path assertions, only ${CVO_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "cv_documents controlled write path (assertion shortfall: floor 75)"
  fi
fi

# ---------------------------------------------------------------------------
# Two processes, one operation id, exactly one CV.
#
# The in-suite idempotency assertions run in ONE session, where the second
# call simply reads what the first one wrote. That proves the replay contract
# and says nothing about the race, because a single session never contends
# with itself.
#
# The interesting case is a client that retried while the first request was
# still open -- a double submit, a flaky connection, a mobile browser
# reconnecting. So A opens a transaction, creates the CV, and sits inside it;
# B arrives with the same operation id and the same request and blocks on the
# conflicting tuple. When A commits, B's ON CONFLICT DO NOTHING inserts
# nothing, B reads the committed ledger row, and both callers are told the
# same cvId.
#
# The assertion that matters is the row count: exactly one.
# ---------------------------------------------------------------------------
# A holder with a real, committed career, and one CV written through the new
# function. Needed by both blocks below: the race needs somebody to create a
# second CV as, and the rollback proof needs a committed row so that
# "no CV was lost" compares something with something.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
INSERT INTO auth.users (id, email)
VALUES ('60000000-0000-0000-0000-00000000000c', 'race@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, display_name, country, locale)
VALUES ('60000000-0000-0000-0000-00000000000c', 'Rut Racelund', 'SE', 'sv')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.security_career_profiles (user_id, current_status, years_of_experience)
VALUES ('60000000-0000-0000-0000-00000000000c', 'working_in_industry', '1-3')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on)
VALUES ('e0000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-00000000000c',
        'Racelunds Bevakning AB', 'Väktare', DATE '2023-01-01')
ON CONFLICT (id) DO NOTHING;

BEGIN;
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000c', true);
SET LOCAL ROLE authenticated;
SELECT public.cv_create(
  'aaaa0000-0000-4000-8000-000000000001'::uuid,
  'Ruts CV', 'sv', 'general', NULL, false,
  ARRAY['e0000000-0000-0000-0000-0000000000c1']::uuid[],
  '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
  '{}'::jsonb);
COMMIT;
SQL

echo "==> Running cv_documents concurrent-creation proof"
CVRACE_FAILED=0
CVRACE_OP="aaaa0000-0000-4000-8000-000000000002"
CVRACE_A="$(mktemp)"; CVRACE_B="$(mktemp)"

cat > "$CVRACE_A" <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000c', true);
SET LOCAL ROLE authenticated;
-- Marked so the cvId cannot be confused with the holder id that set_config
-- echoes back one line earlier; without the marker the comparison below was
-- satisfied by two copies of the SAME holder uuid and proved nothing.
SELECT 'CVID=' || (public.cv_create(
  '${CVRACE_OP}'::uuid, 'Race CV', 'sv', 'general', NULL, false,
  ARRAY['e0000000-0000-0000-0000-0000000000c1']::uuid[],
  '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
  '{}'::jsonb) ->> 'cv_id') AS marked;
SELECT pg_sleep(2);
COMMIT;
SQL

cat > "$CVRACE_B" <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000c', true);
SET LOCAL ROLE authenticated;
-- Marked so the cvId cannot be confused with the holder id that set_config
-- echoes back one line earlier; without the marker the comparison below was
-- satisfied by two copies of the SAME holder uuid and proved nothing.
SELECT 'CVID=' || (public.cv_create(
  '${CVRACE_OP}'::uuid, 'Race CV', 'sv', 'general', NULL, false,
  ARRAY['e0000000-0000-0000-0000-0000000000c1']::uuid[],
  '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
  '{}'::jsonb) ->> 'cv_id') AS marked;
COMMIT;
SQL

CVRACE_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents where owner_user_id='60000000-0000-0000-0000-00000000000c';")"

psql -tAq -d "$TEST_DB" -f "$CVRACE_A" > /tmp/cvrace_a.out 2>&1 &
CVRACE_PID=$!
# Long enough for A to be inside its transaction and holding the tuple.
sleep 1
psql -tAq -d "$TEST_DB" -f "$CVRACE_B" > /tmp/cvrace_b.out 2>&1
wait "$CVRACE_PID" || true

CVRACE_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents where owner_user_id='60000000-0000-0000-0000-00000000000c';")"
CVRACE_ID_A="$(grep -oE 'CVID=[0-9a-f-]{36}' /tmp/cvrace_a.out | head -1 | cut -d= -f2)"
CVRACE_ID_B="$(grep -oE 'CVID=[0-9a-f-]{36}' /tmp/cvrace_b.out | head -1 | cut -d= -f2)"

if [ "$(( CVRACE_AFTER - CVRACE_BEFORE ))" -ne 1 ]; then
  echo "FAIL: two concurrent creations under one operation id produced $(( CVRACE_AFTER - CVRACE_BEFORE )) CVs, not 1." >&2
  head -5 /tmp/cvrace_a.out /tmp/cvrace_b.out >&2
  CVRACE_FAILED=1
else
  echo "    ok  two concurrent processes, one operation id, exactly one CV"
fi

if [ -z "$CVRACE_ID_A" ] || [ "$CVRACE_ID_A" != "$CVRACE_ID_B" ]; then
  echo "FAIL: the two callers were told different cvIds ('${CVRACE_ID_A}' vs '${CVRACE_ID_B}')." >&2
  CVRACE_FAILED=1
else
  echo "    ok  and both callers were told the same cvId (${CVRACE_ID_A})"
fi

# The loser must WAIT, not fail. A caller that got a serialisation error here
# would retry, and the retry is the thing being protected against.
if grep -qiE "ERROR:|FEL:" /tmp/cvrace_b.out; then
  echo "FAIL: the second caller errored instead of waiting for the first." >&2
  head -5 /tmp/cvrace_b.out >&2
  CVRACE_FAILED=1
else
  echo "    ok  the second caller waited for the first rather than failing"
fi

rm -f "$CVRACE_A" "$CVRACE_B"
if [ "$CVRACE_FAILED" -ne 0 ]; then
  suite_failed "cv_documents concurrent creation"
fi

# ---------------------------------------------------------------------------
# The cv_documents controlled-write-path rollback, and back again.
#
# A rollback file that nobody runs is a promise, not a plan -- and this one
# REOPENS a security defect, so it had better do exactly what it says. Run
# against a database that already holds CVs written THROUGH the new functions,
# because the property that matters is not "the drop succeeds": it is that
# dropping the write path loses no holder data and restores the previous
# submission contract.
#
# Then the migration is re-applied over that state, which is what a real
# re-apply would meet.
# ---------------------------------------------------------------------------
echo "==> Running cv_documents controlled-write-path rollback and reapply proof"
CVRB_FAILED=0

CVRB_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents;")"
if [ "${CVRB_BEFORE:-0}" -lt 1 ]; then
  echo "FAIL: no committed CV exists, so the data-safety assertion would be vacuous." >&2
  CVRB_FAILED=1
fi

set +e
CVRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261102090000_cv_documents_controlled_writes_rollback.sql 2>&1)"
CVRB_RC=$?
set -e

if [ "$CVRB_RC" -ne 0 ]; then
  echo "FAIL: the cv_documents controlled-write-path rollback did not run cleanly." >&2
  echo "$CVRB_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CVRB_FAILED=1
else
  echo "    ok  the rollback ran cleanly"
fi

CVRB_GONE="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cv\\_%') + (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='cv_document_operations');")"
if [ "${CVRB_GONE:-1}" -ne 0 ]; then
  echo "FAIL: the rollback left CV write functions or the operations ledger behind (${CVRB_GONE})." >&2
  CVRB_FAILED=1
else
  echo "    ok  every controlled write function and the operations ledger are gone"
fi

CVRB_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents;")"
if [ "$CVRB_BEFORE" != "$CVRB_AFTER" ]; then
  echo "FAIL: the rollback changed the number of saved CVs (${CVRB_BEFORE} -> ${CVRB_AFTER})." >&2
  CVRB_FAILED=1
else
  echo "    ok  no CV was lost (${CVRB_AFTER} rows before and after)"
fi

# The defect really is reopened. Asserted, so nobody reads the rollback file
# as a safe cleanup.
# Phase 1 revoked nothing, so the direct-write grant is untouched on both
# sides of the rollback. Asserted so that a future phase-3 change that
# accidentally lands in THIS migration is caught here rather than in
# production.
CVRB_OPEN="$(psql -tAq -d "$TEST_DB" -c "select has_table_privilege('authenticated','public.cv_documents','INSERT')::text;")"
if [ "$CVRB_OPEN" != "true" ]; then
  echo "FAIL: phase 1 or its rollback changed a grant. It is supposed to be additive." >&2
  CVRB_FAILED=1
else
  echo "    ok  the published application's direct writes are untouched by both"
fi

set +e
CVRA_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261102090000_cv_documents_controlled_writes.sql 2>&1)"
CVRA_RC=$?
set -e

if [ "$CVRA_RC" -ne 0 ]; then
  echo "FAIL: the migration did not re-apply after its own rollback." >&2
  echo "$CVRA_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CVRB_FAILED=1
else
  echo "    ok  the migration re-applies cleanly over the rolled-back state"
fi

CVRA_FNS="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cv\\_%';")"
if [ "${CVRA_FNS:-0}" -lt 12 ]; then
  echo "FAIL: after re-applying, only ${CVRA_FNS} controlled functions are present." >&2
  CVRB_FAILED=1
else
  echo "    ok  and all ${CVRA_FNS} controlled write functions are back"
fi

if [ "$CVRB_FAILED" -ne 0 ]; then
  suite_failed "cv_documents controlled-write-path rollback/reapply"
fi

# ---------------------------------------------------------------------------
# Admin assignment cancellation — the refusal contract.
#
# Runs BEFORE the rollback step: it assigns a legacy assessment version and
# reads assessment_assignments, and the rollback drops content the fixture
# depends on.
#
# The suite exists because five unrelated conditions inside
# admin_cancel_assessment_assignment() all raised SQLSTATE 23514, so the wrapper
# collapsed them into one constant that an admin was then shown verbatim. The
# TypeScript guard (admin-error-contract:check) proves the client can NAME every
# identifier; only this suite proves the database RAISES them, and that a
# refusal leaves the row and the audit log untouched.
# ---------------------------------------------------------------------------
echo "==> Running admin assignment cancellation contract assertions"
set +e
ACX_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/admin_assignment_cancellation_test.sql 2>&1)"
ACX_RC=$?
set -e

echo "$ACX_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
ACX_PASSED="$(echo "$ACX_OUT" | grep -c "ok  " || true)"

if [ "$ACX_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the admin assignment cancellation suite exited with code ${ACX_RC}." >&2
  echo "$ACX_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "admin assignment cancellation"
else
  echo "    ok  ${ACX_PASSED} admin assignment cancellation assertions passed"
  if [ "$ACX_PASSED" -lt 27 ]; then
    echo "FAIL: expected at least 27 admin assignment cancellation assertions, only ${ACX_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "admin assignment cancellation (assertion shortfall: floor 27)"
  fi
fi

# ---------------------------------------------------------------------------
# E2 — the employer reads the document the CANDIDATE received.
#
# 20261105090000 adds one read (scp_participant_report_for_issuer) and the
# predicate behind it. The suite proves it is a copy of the participant read
# rather than a re-rendering of it, that it returns strictly less than the
# employer read the same caller already has, and that release authority --
# owner or admin, active seat -- is exactly what it requires.
#
# It also asserts the rollback: both functions drop cleanly and the audience
# contracts they were added beside survive untouched.
# ---------------------------------------------------------------------------
echo "==> Running E2 issuer participant-preview assertions"
set +e
E2PP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/scp_participant_report_issuer_preview_test.sql 2>&1)"
E2PP_RC=$?
set -e

echo "$E2PP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
E2PP_PASSED="$(echo "$E2PP_OUT" | grep -c "ok  " || true)"
E2PP_FAILED=0

if [ "$E2PP_RC" -ne 0 ]; then
  echo "FAIL: the E2 issuer-preview suite exited with code ${E2PP_RC}." >&2
  echo "$E2PP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  E2PP_FAILED=1
else
  echo "    ok  ${E2PP_PASSED} E2 issuer participant-preview assertions passed"
  if [ "$E2PP_PASSED" -lt 26 ]; then
    echo "FAIL: expected at least 26 E2 issuer-preview assertions, only ${E2PP_PASSED} ran." >&2
    E2PP_FAILED=1
  fi
fi

# The rollback, on a throwaway copy of the schema state: dropping the two
# functions must leave the audience contracts they were added beside intact.
# Run LAST of the E2 checks, and in its own transaction, so nothing after it
# reads a schema with the preview removed.
# NOT `psql -c "... \i ..."`: backslash commands are a psql client feature and
# -c does not run them. The rollback is applied for real and the migration is
# re-applied afterwards, which also proves the migration is re-appliable -- the
# property a rollback is worth nothing without.
set +e
E2PP_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261105090000_scp_participant_report_issuer_preview_rollback.sql 2>&1)"
E2PP_RB_RC=$?
set -e
if [ "$E2PP_RB_RC" -ne 0 ] || ! echo "$E2PP_RB" | grep -q "SCP_ISSUER_PREVIEW_ROLLBACK ok"; then
  echo "FAIL: the E2 issuer-preview rollback did not verify." >&2
  echo "$E2PP_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  E2PP_FAILED=1
else
  echo "    ok  the E2 issuer-preview rollback drops both functions and leaves the audience contracts"
fi

set +e
E2RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261105090000_scp_participant_report_issuer_preview.sql 2>&1)"
E2RE_RC=$?
set -e
if [ "$E2RE_RC" -ne 0 ] || ! echo "$E2RE" | grep -q "SCP_ISSUER_PREVIEW_PROOF ok"; then
  echo "FAIL: the E2 migration does not re-apply over the rolled-back state." >&2
  echo "$E2RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  E2PP_FAILED=1
else
  echo "    ok  and the E2 migration re-applies cleanly over the rolled-back state"
fi

if [ "$E2PP_FAILED" -ne 0 ]; then
  suite_failed "E2 issuer participant-preview"
fi

# ---------------------------------------------------------------------------
# The employer final report — a provable basis and a governed readback.
#
# 20261107090000 replaces the md5 content hash with core sha256, records which
# algorithm produced it, names the recruitment and the assessment material the
# report belongs to, classifies every evidence item by what KIND of thing it
# is, and adds the two governed reads that prove which version was finalised.
#
# The suite walks a real case to a finalised report with a level, a rationale
# and an uncertainty note, corrects it into a second version, and proves the
# first survives byte-for-byte. It also proves the candidate cannot reach the
# employer report by any route.
#
# It also applies the rollback for real and re-applies the migration, which is
# the property a rollback is worth nothing without.
# ---------------------------------------------------------------------------
echo "==> Running employer final-report basis assertions"
set +e
BI_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/scp_iv_report_basis_integrity_test.sql 2>&1)"
BI_RC=$?
set -e

echo "$BI_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
BI_PASSED="$(echo "$BI_OUT" | grep -c "ok  " || true)"
BI_FAILED=0

if [ "$BI_RC" -ne 0 ]; then
  echo "FAIL: the employer final-report basis suite exited with code ${BI_RC}." >&2
  echo "$BI_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  BI_FAILED=1
else
  echo "    ok  ${BI_PASSED} employer final-report basis assertions passed"
  if [ "$BI_PASSED" -lt 90 ]; then
    echo "FAIL: expected at least 45 basis assertions, only ${BI_PASSED} ran." >&2
    BI_FAILED=1
  fi
fi

# NOT `psql -c "... \i ..."`: backslash commands are a psql client feature and
# -c does not run them. Applied for real, then the migration re-applied.
set +e
BI_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql 2>&1)"
BI_RB_RC=$?
set -e
if [ "$BI_RB_RC" -ne 0 ] || ! echo "$BI_RB" | grep -q "SCP_IV_REPORT_BASIS_ROLLBACK ok"; then
  echo "FAIL: the employer final-report basis rollback did not verify." >&2
  echo "$BI_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  BI_FAILED=1
else
  echo "    ok  the basis rollback drops both reads and keeps the algorithm column"
fi

set +e
BI_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql 2>&1)"
BI_RE_RC=$?
set -e
if [ "$BI_RE_RC" -ne 0 ] || ! echo "$BI_RE" | grep -q "SCP_IV_REPORT_BASIS_PROOF ok"; then
  echo "FAIL: the basis migration does not re-apply over the rolled-back state." >&2
  echo "$BI_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BI_FAILED=1
else
  echo "    ok  and the basis migration re-applies cleanly over the rolled-back state"
fi
ac_restore_model # 20261107090000 re-creates scp_employer_report_identity

if [ "$BI_FAILED" -ne 0 ]; then
  suite_failed "employer final-report basis"
fi


# ---------------------------------------------------------------------------
# BESKT PR 2 — governed method content, deterministic routing and publication
# gates (20261108090000).
#
# The suite plants a clearly synthetic BESKT method inside its own
# transaction and executes real operations against it: the role-interview
# flow is byte-for-byte compatible and closed to BESKT; every child belongs
# to its own version; every mandatory field, evidence state, anchor component
# and security-vetting gate blocks publication on its own; routing is
# deterministic and neutral to omission; five hash-bound human gates,
# separation of duties, stale approvals, atomic publication, immutability;
# idempotent replay before compare-and-swap; and the whole RLS/grant/definer
# matrix. Everything rolls back.
#
# It then applies the rollback for real and re-applies the migration, which
# is the property a rollback is worth nothing without.
# ---------------------------------------------------------------------------
echo "==> Running BESKT governed-content assertions"
set +e
BG_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/beskt_governed_content_test.sql 2>&1)"
BG_RC=$?
set -e

echo "$BG_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
BG_PASSED="$(echo "$BG_OUT" | grep -c "ok  " || true)"
BG_FAILED=0

if [ "$BG_RC" -ne 0 ]; then
  echo "FAIL: the BESKT governed-content suite exited with code ${BG_RC}." >&2
  echo "$BG_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  BG_FAILED=1
else
  echo "    ok  ${BG_PASSED} BESKT governed-content assertions passed"
  if [ "$BG_PASSED" -lt 435 ]; then
    echo "FAIL: expected at least 435 BESKT governed-content assertions, only ${BG_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    BG_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# BESKT PR 7 -- the governed content-authoring doors.
#
# The suite's first block is the claim the whole PR exists for: an editor
# holding only the platform content role, acting through the authenticated
# role, authors a COMPLETE method -- profiles, sections, items with options,
# sixteen prompts, routing, the seven evidence anchors and the ten observation
# fields -- and submits it to the five gates. No service_role, no table owner,
# no migration. Everything after it proves the doors did not become a way
# around beskt_guard_child_row().
# ---------------------------------------------------------------------------
echo "==> Running BESKT content-authoring assertions"
set +e
AUT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/beskt_governed_content_authoring_test.sql 2>&1)"
AUT_RC=$?
set -e
AUT_PASSED="$(echo "$AUT_OUT" | grep -c "ok  " || true)"
AUT_FAILED=0
if [ "$AUT_RC" -ne 0 ]; then
  echo "FAIL: the BESKT content-authoring suite exited with code ${AUT_RC}." >&2
  echo "$AUT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  AUT_FAILED=1
else
  echo "    ok  ${AUT_PASSED} BESKT content-authoring assertions passed"
  if [ "$AUT_PASSED" -lt 55 ]; then
    echo "FAIL: expected at least 55 BESKT content-authoring assertions, only ${AUT_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    AUT_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# The PR 7 rollback, for real, then the migration re-applied over it.
#
# The suite above rolls back, so no authoring event is committed and the clean
# path is the expected one. The REFUSAL path -- a rollback that will not
# discard the doors once the append-only ledger records authoring through them
# -- is proved by the suite itself and by the source guard, because an
# append-only event cannot be planted and then removed here.
# ---------------------------------------------------------------------------
echo "==> Running BESKT PR 7 rollback and re-apply"
set +e
AUT_RB="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261118090000_beskt_governed_content_authoring_rollback.sql 2>&1)"
AUT_RB_RC=$?
set -e
if [ "$AUT_RB_RC" -ne 0 ] || ! echo "$AUT_RB" | grep -q "BESKT_GOVERNED_CONTENT_AUTHORING_ROLLBACK ok"; then
  if echo "$AUT_RB" | grep -q "BESKT_CONTENT_AUTHORING_ROLLBACK"; then
    echo "    ok  the PR 7 rollback refuses by name rather than discarding doors the ledger records"
  else
    echo "FAIL: the BESKT content-authoring rollback did not verify." >&2
    echo "$AUT_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
    AUT_FAILED=1
  fi
else
  echo "    ok  the PR 7 rollback removes the nine doors and leaves every authored row and guard standing"
fi

set +e
AUT_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261118090000_beskt_governed_content_authoring.sql 2>&1)"
AUT_RE_RC=$?
set -e
if [ "$AUT_RE_RC" -ne 0 ] || ! echo "$AUT_RE" | grep -q "BESKT_GOVERNED_CONTENT_AUTHORING_PROOF ok"; then
  echo "FAIL: the BESKT PR 7 migration does not re-apply over the rolled-back state." >&2
  echo "$AUT_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  AUT_FAILED=1
else
  echo "    ok  and the PR 7 migration re-applies cleanly over it"
fi

if [ "$AUT_FAILED" -ne 0 ]; then
  suite_failed "BESKT content authoring"
fi


# ---------------------------------------------------------------------------
# One open version per method, under a REAL race: two sessions, two
# operation ids, one method, genuinely in flight at once. Session A creates
# the version and holds its transaction open; session B starts while A is
# uncommitted, so a plain "is there an open version?" check would see none.
# The per-method advisory lock is taken BEFORE that check, so B waits for A
# to commit and is then refused with BESKT_OPEN_VERSION_EXISTS. Exactly one
# version exists afterwards. The elapsed time of B proves it waited rather
# than ran after A; a sequential imitation would answer in milliseconds.
# ---------------------------------------------------------------------------
echo "==> Running BESKT one-open-version race"
BGR_FAILED=0
BGR_PASSED=0
BGR_EDITOR="b2000000-0000-4000-8000-00000000cc01"
BGR_A="$(mktemp)"; BGR_B="$(mktemp)"

set +e
BGR_SETUP="$(psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" <<SQL 2>&1
INSERT INTO auth.users (id, email) VALUES ('${BGR_EDITOR}', 'beskt-race-editor@test.local') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.scp_content_roles (user_id, role) VALUES ('${BGR_EDITOR}', 'editor') ON CONFLICT (user_id, role) DO NOTHING;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGR_EDITOR}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGR_EDITOR}', true);
SET LOCAL ROLE authenticated;
SELECT 'PACK=' || (public.beskt_create_method(gen_random_uuid(), 'beskt-race-method', 'SYNTETISK racemetod', 'Syntetiskt testinnehåll. Inte en produktmetod.') ->> 'pack_id');
COMMIT;
SQL
)"
BGR_SETUP_RC=$?
set -e
BGR_PACK="$(echo "$BGR_SETUP" | grep -oE 'PACK=[0-9a-f-]{36}' | head -1 | cut -d= -f2 || true)"
if [ "$BGR_SETUP_RC" -ne 0 ] || [ -z "$BGR_PACK" ]; then
  echo "FAIL: the BESKT race setup failed." >&2
  echo "$BGR_SETUP" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BGR_FAILED=1
else
  cat > "$BGR_A" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGR_EDITOR}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGR_EDITOR}', true);
SET LOCAL ROLE authenticated;
SELECT 'VID=' || (public.beskt_create_method_version(gen_random_uuid(), '${BGR_PACK}'::uuid, 'recruitment_support',
  'synthetic-race', 'race-1', 'cqrity_design_hypothesis') ->> 'method_version_id') AS marked;
SELECT pg_sleep(3);
COMMIT;
SQL
  cat > "$BGR_B" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGR_EDITOR}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGR_EDITOR}', true);
SET LOCAL ROLE authenticated;
SELECT 'VID=' || (public.beskt_create_method_version(gen_random_uuid(), '${BGR_PACK}'::uuid, 'recruitment_support',
  'synthetic-race', 'race-2', 'cqrity_design_hypothesis') ->> 'method_version_id') AS marked;
COMMIT;
SQL

  psql -tAq -d "$TEST_DB" -f "$BGR_A" > /tmp/bgr_a.out 2>&1 &
  BGR_PID=$!
  # Long enough for A to be inside its transaction, holding the method lock
  # with its version inserted but uncommitted.
  sleep 1
  BGR_B_START="$(date +%s%N)"
  psql -tAq -d "$TEST_DB" -f "$BGR_B" > /tmp/bgr_b.out 2>&1 || true
  BGR_B_END="$(date +%s%N)"
  wait "$BGR_PID" || true
  BGR_B_MS=$(( (BGR_B_END - BGR_B_START) / 1000000 ))

  BGR_COUNT="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.beskt_method_versions where pack_id = '${BGR_PACK}';")"
  # B is expected to carry NO version id; under set -e / pipefail an empty
  # grep must not end the run.
  BGR_ID_A="$(grep -oE 'VID=[0-9a-f-]{36}' /tmp/bgr_a.out | head -1 | cut -d= -f2 || true)"
  BGR_ID_B="$(grep -oE 'VID=[0-9a-f-]{36}' /tmp/bgr_b.out | head -1 | cut -d= -f2 || true)"

  if [ -z "$BGR_ID_A" ]; then
    echo "FAIL: session A did not create the first version." >&2
    head -5 /tmp/bgr_a.out >&2
    BGR_FAILED=1
  else
    echo "    ok  session A created the method's first open version and held its transaction"
    BGR_PASSED=$(( BGR_PASSED + 1 ))
  fi
  if [ -n "$BGR_ID_B" ] || ! grep -q "BESKT_OPEN_VERSION_EXISTS" /tmp/bgr_b.out; then
    echo "FAIL: session B was not refused with BESKT_OPEN_VERSION_EXISTS while A's version was uncommitted." >&2
    head -5 /tmp/bgr_b.out >&2
    BGR_FAILED=1
  else
    echo "    ok  session B, started while A was uncommitted, was refused with BESKT_OPEN_VERSION_EXISTS"
    BGR_PASSED=$(( BGR_PASSED + 1 ))
  fi
  if [ "$BGR_B_MS" -lt 1500 ]; then
    echo "FAIL: session B answered after ${BGR_B_MS} ms; it did not wait on the method lock, so this was not a race." >&2
    BGR_FAILED=1
  else
    echo "    ok  session B waited ${BGR_B_MS} ms on the per-method lock taken before the open-version check"
    BGR_PASSED=$(( BGR_PASSED + 1 ))
  fi
  if [ "$BGR_COUNT" != "1" ]; then
    echo "FAIL: two concurrent version creations produced ${BGR_COUNT} versions, not 1." >&2
    BGR_FAILED=1
  else
    echo "    ok  exactly one version exists for the method"
    BGR_PASSED=$(( BGR_PASSED + 1 ))
  fi
fi
rm -f "$BGR_A" "$BGR_B"
if [ "$BGR_FAILED" -ne 0 ]; then
  BG_FAILED=1
fi

# ---------------------------------------------------------------------------
# A child write versus publication, under a REAL race. The child guard locks
# the owning version row (FOR SHARE) before it reads the status; publication
# locks it FOR UPDATE before it hashes. So the two serialise, and only two
# outcomes exist:
#   (A) the child commits first -> publication waits, then sees a stale hash
#       and is refused (BESKT_CONTENT_HASH_STALE);
#   (B) publication commits first -> the child waits, then sees a frozen
#       version and is refused (BESKT_PUBLISHED_IMMUTABLE).
# In neither case can the published bytes differ from the approved hash.
# The complete method with five approvals is planted from the shared
# synthetic fixture and committed; the BESKT rollback below removes it.
# ---------------------------------------------------------------------------
echo "==> Running BESKT child-write versus publication race"
BGP_FAILED=0
BGP_PASSED=0
BGP_PUBLISHER="b2000000-0000-4000-8000-0000000000b1"
BGP_SETUP_SQL="$(mktemp)"; BGP_A="$(mktemp)"; BGP_B="$(mktemp)"
cat > "$BGP_SETUP_SQL" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
\i supabase/tests/beskt_governed_content_fixture.sql
SELECT pg_temp.build_method('beskt-race-publish', 'recruitment_support');
SELECT pg_temp.submit((SELECT rec_v FROM bk));
SELECT pg_temp.approve_all((SELECT rec_v FROM bk));
SELECT 'VID=' || rec_v || ' ITEM=' || rec_i1 || ' HASH=' || (SELECT content_hash FROM public.beskt_method_versions WHERE id = rec_v) AS marked FROM bk;
COMMIT;
SQL
set +e
BGP_SETUP="$(psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" -f "$BGP_SETUP_SQL" 2>&1)"
BGP_SETUP_RC=$?
set -e
BGP_VID="$(echo "$BGP_SETUP" | grep -oE 'VID=[0-9a-f-]{36}' | head -1 | cut -d= -f2 || true)"
BGP_ITEM="$(echo "$BGP_SETUP" | grep -oE 'ITEM=[0-9a-f-]{36}' | head -1 | cut -d= -f2 || true)"
BGP_HASH="$(echo "$BGP_SETUP" | grep -oE 'HASH=[0-9a-f]{64}' | head -1 | cut -d= -f2 || true)"
if [ "$BGP_SETUP_RC" -ne 0 ] || [ -z "$BGP_VID" ] || [ -z "$BGP_ITEM" ] || [ -z "$BGP_HASH" ]; then
  echo "FAIL: the child-versus-publication race setup failed." >&2
  echo "$BGP_SETUP" | grep -iE "ERROR:|FEL:|ASSERTION" | head -5 >&2
  BGP_FAILED=1
else
  BGP_REV="$(psql -tAq -d "$TEST_DB" -c "select revision from public.beskt_method_versions where id = '${BGP_VID}';")"
  # (A) the child edit is in flight, uncommitted, when publication arrives.
  cat > "$BGP_A" <<SQL
BEGIN;
UPDATE public.beskt_items SET wording_en = wording_en || ' (racing edit)' WHERE id = '${BGP_ITEM}';
SELECT 'EDITED=' || count(*) FROM public.beskt_items WHERE id = '${BGP_ITEM}' AND wording_en LIKE '% (racing edit)';
SELECT pg_sleep(3);
COMMIT;
SQL
  cat > "$BGP_B" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGP_PUBLISHER}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGP_PUBLISHER}', true);
SET LOCAL ROLE authenticated;
SELECT 'PUB=' || (public.beskt_publish_version(gen_random_uuid(), '${BGP_VID}'::uuid, ${BGP_REV}, 'race A') ->> 'content_status') AS marked;
COMMIT;
SQL
  psql -tAq -d "$TEST_DB" -f "$BGP_A" > /tmp/bgp_a.out 2>&1 &
  BGP_PID=$!
  sleep 1
  BGP_B_START="$(date +%s%N)"
  psql -tAq -d "$TEST_DB" -f "$BGP_B" > /tmp/bgp_b.out 2>&1 || true
  BGP_B_END="$(date +%s%N)"
  wait "$BGP_PID" || true
  BGP_B_MS=$(( (BGP_B_END - BGP_B_START) / 1000000 ))
  BGP_STATUS="$(psql -tAq -d "$TEST_DB" -c "select content_status || ' ' || content_hash || ' ' || (public.beskt_method_content_hash(id) = content_hash)::text from public.beskt_method_versions where id = '${BGP_VID}';")"
  if ! grep -q "EDITED=1" /tmp/bgp_a.out; then
    echo "FAIL: session A did not apply its child edit." >&2; head -5 /tmp/bgp_a.out >&2; BGP_FAILED=1
  else
    echo "    ok  (A) session A edited a governed item of the in-review version and held its transaction"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if grep -q "PUB=" /tmp/bgp_b.out || ! grep -q "BESKT_CONTENT_HASH_STALE" /tmp/bgp_b.out; then
    echo "FAIL: (A) publication was not refused with BESKT_CONTENT_HASH_STALE after the child edit committed." >&2
    head -5 /tmp/bgp_b.out >&2; BGP_FAILED=1
  else
    echo "    ok  (A) publication, started while the edit was uncommitted, waited for it and was refused: the reviewed hash no longer names the bytes"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if [ "$BGP_B_MS" -lt 1500 ]; then # (A) publication waited on the child's lock
    echo "FAIL: (A) publication answered after ${BGP_B_MS} ms; it did not wait on the version lock, so this was not a race." >&2; BGP_FAILED=1
  else
    echo "    ok  (A) publication waited ${BGP_B_MS} ms on the version row the child guard had locked"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if [ "$BGP_STATUS" != "in_review ${BGP_HASH} false" ]; then
    echo "FAIL: (A) expected the version to stay in_review at the approved hash with the stored bytes now differing, got '${BGP_STATUS}'." >&2; BGP_FAILED=1
  else
    echo "    ok  (A) the version is still in_review, the stored hash is the approved one, and the bytes now differ from it: nothing was published"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  # Restore the reviewed bytes. Approvals bind to the hash, the review
  # cycle AND the revision, so restoring the hash does not revive the
  # earlier ones; this version is re-approved below before (B) publishes.
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "UPDATE public.beskt_items SET wording_en = replace(wording_en, ' (racing edit)', '') WHERE id = '${BGP_ITEM}';"
  # (B) publication is in flight, uncommitted, when the child edit arrives.
  cat > "$BGP_A" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGP_PUBLISHER}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGP_PUBLISHER}', true);
SET LOCAL ROLE authenticated;
SELECT 'PUB=' || (public.beskt_publish_version(gen_random_uuid(), '${BGP_VID}'::uuid, ${BGP_REV}, 'race B') ->> 'content_status') AS marked;
SELECT pg_sleep(3);
COMMIT;
SQL
  cat > "$BGP_B" <<SQL
BEGIN;
UPDATE public.beskt_items SET wording_en = wording_en || ' (late edit)' WHERE id = '${BGP_ITEM}';
SELECT 'EDITED=' || count(*) FROM public.beskt_items WHERE id = '${BGP_ITEM}' AND wording_en LIKE '% (late edit)';
COMMIT;
SQL
  psql -tAq -d "$TEST_DB" -f "$BGP_A" > /tmp/bgp_a.out 2>&1 &
  BGP_PID=$!
  sleep 1
  BGP_B_START="$(date +%s%N)"
  psql -tAq -d "$TEST_DB" -f "$BGP_B" > /tmp/bgp_b.out 2>&1 || true
  BGP_B_END="$(date +%s%N)"
  wait "$BGP_PID" || true
  BGP_B_MS=$(( (BGP_B_END - BGP_B_START) / 1000000 ))
  BGP_STATUS="$(psql -tAq -d "$TEST_DB" -c "select content_status || ' ' || content_hash || ' ' || (public.beskt_method_content_hash(id) = content_hash)::text from public.beskt_method_versions where id = '${BGP_VID}';")"
  BGP_LATE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.beskt_items where id = '${BGP_ITEM}' and wording_en like '% (late edit)';")"
  if ! grep -q "PUB=published" /tmp/bgp_a.out; then
    echo "FAIL: (B) session A did not publish." >&2; head -5 /tmp/bgp_a.out >&2; BGP_FAILED=1
  else
    echo "    ok  (B) session A published the version and held its transaction"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if grep -q "EDITED=1" /tmp/bgp_b.out || ! grep -q "BESKT_PUBLISHED_IMMUTABLE" /tmp/bgp_b.out; then
    echo "FAIL: (B) the child edit was not refused with BESKT_PUBLISHED_IMMUTABLE after publication committed." >&2
    head -5 /tmp/bgp_b.out >&2; BGP_FAILED=1
  else
    echo "    ok  (B) the child edit, started while publication was uncommitted, waited for it and was refused: the version is frozen"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if [ "$BGP_B_MS" -lt 1500 ]; then # (B) the child waited on publication's lock
    echo "FAIL: (B) the child edit answered after ${BGP_B_MS} ms; it did not wait on the publication lock, so this was not a race." >&2; BGP_FAILED=1
  else
    echo "    ok  (B) the child edit waited ${BGP_B_MS} ms on the version row publication had locked"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  if [ "$BGP_STATUS" != "published ${BGP_HASH} true" ] || [ "$BGP_LATE" != "0" ]; then
    echo "FAIL: (B) expected a published version whose bytes hash to the approved hash and no late edit, got '${BGP_STATUS}' / late=${BGP_LATE}." >&2; BGP_FAILED=1
  else
    echo "    ok  (B) the published bytes hash to exactly the approved stored hash; the late edit left no trace"
    BGP_PASSED=$(( BGP_PASSED + 1 ))
  fi
  # Retire the published race version under governance so the rollback below
  # is not (correctly) refused for a live publication.
  BGP_REV="$(psql -tAq -d "$TEST_DB" -c "select revision from public.beskt_method_versions where id = '${BGP_VID}';")"
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" > /dev/null <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BGP_PUBLISHER}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BGP_PUBLISHER}', true);
SET LOCAL ROLE authenticated;
SELECT public.beskt_retire_version(gen_random_uuid(), '${BGP_VID}'::uuid, ${BGP_REV}, 'race fixture retired');
COMMIT;
SQL
fi
rm -f "$BGP_SETUP_SQL" "$BGP_A" "$BGP_B"
if [ "$BGP_FAILED" -ne 0 ]; then
  BG_FAILED=1
fi

# ---------------------------------------------------------------------------
# The rollback refuses a planted OUTSIDE dependency -- a view on a BESKT
# table, then a function whose signature names a BESKT row type -- before it
# drops anything. Run in one transaction (-1), exactly as the file requires,
# so a refusal leaves the schema untouched: still thirteen tables, still
# every function, still pack_kind.
# ---------------------------------------------------------------------------
# BESKT PR 3 -- candidate preparation.
#
# The runtime built on top of the PR 2 content spine: assignment, notice and
# acknowledgement, versioned responses, typed answers, idempotency,
# compare-and-swap and the immutable submitted snapshot. Everything the suite
# plants is synthetic and lives inside its own transaction, which is rolled
# back, so it seeds nothing.
# ---------------------------------------------------------------------------
echo "==> Running BESKT candidate-preparation assertions"
set +e
BCP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_candidate_preparation_test.sql 2>&1)"
BCP_RC=$?
set -e
BCP_PASSED="$(echo "$BCP_OUT" | grep -c "ok  " || true)"
BCP_FAILED=0
if [ "$BCP_RC" -ne 0 ]; then
  echo "FAIL: the BESKT candidate-preparation suite exited with code ${BCP_RC}." >&2
  echo "$BCP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  BCP_FAILED=1
else
  echo "    ok  ${BCP_PASSED} BESKT candidate-preparation assertions passed"
  if [ "$BCP_PASSED" -lt 230 ]; then
    echo "FAIL: expected at least 230 BESKT candidate-preparation assertions, only ${BCP_PASSED} ran." >&2
    BCP_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# BESKT PR 4 -- the bridge to the existing interview case.
#
# Runs BEFORE the PR 3 rollback below, because it is built on PR 3's tables:
# bcp_case_links carries foreign keys into bcp_assignments and bcp_responses,
# so PR 3 cannot be unwound while PR 4 stands. Everything the suite plants is
# synthetic and lives inside its own transaction, which is rolled back.
# ---------------------------------------------------------------------------
echo "==> Running BESKT interview-case bridge assertions"
set +e
BRG_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_interview_case_bridge_test.sql 2>&1)"
BRG_RC=$?
set -e
BRG_PASSED="$(echo "$BRG_OUT" | grep -c "ok  " || true)"
BRG_FAILED=0
if [ "$BRG_RC" -ne 0 ]; then
  echo "FAIL: the BESKT interview-case bridge suite exited with code ${BRG_RC}." >&2
  echo "$BRG_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  BRG_FAILED=1
else
  echo "    ok  ${BRG_PASSED} BESKT interview-case bridge assertions passed"
  if [ "$BRG_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 BESKT interview-case bridge assertions, only ${BRG_PASSED} ran." >&2
    BRG_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# BESKT PR 5A -- the governed conduct of the BESKT interview.
#
# Runs BEFORE PR 4 is stood down, because it is built on PR 4's tables:
# bcp_conduct_sessions carries foreign keys into bcp_case_links, so PR 4 cannot
# be unwound while PR 5A stands.
# ---------------------------------------------------------------------------
echo "==> Running BESKT interview-conduct assertions"
set +e
CND_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_interview_conduct_test.sql 2>&1)"
CND_RC=$?
set -e
CND_PASSED="$(echo "$CND_OUT" | grep -c "ok  " || true)"
CND_FAILED=0
if [ "$CND_RC" -ne 0 ]; then
  echo "FAIL: the BESKT interview-conduct suite exited with code ${CND_RC}." >&2
  echo "$CND_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  CND_FAILED=1
else
  echo "    ok  ${CND_PASSED} BESKT interview-conduct assertions passed"
  if [ "$CND_PASSED" -lt 90 ]; then
    echo "FAIL: expected at least 90 BESKT interview-conduct assertions, only ${CND_PASSED} ran." >&2
    CND_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# BESKT PR 6 -- the governed prompts and the report chain.
#
# Runs immediately after PR 5A and before anything is stood down: it is built
# on PR 5A's tables (bcp_conduct_reports carries a foreign key into
# bcp_conduct_sessions), so PR 5A cannot be unwound while PR 6 stands.
# ---------------------------------------------------------------------------
echo "==> Running BESKT prompts-and-report assertions"
set +e
RPT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_conduct_prompts_and_report_test.sql 2>&1)"
RPT_RC=$?
set -e
RPT_PASSED="$(echo "$RPT_OUT" | grep -c "ok  " || true)"
RPT_FAILED=0
if [ "$RPT_RC" -ne 0 ]; then
  echo "FAIL: the BESKT prompts-and-report suite exited with code ${RPT_RC}." >&2
  echo "$RPT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  RPT_FAILED=1
else
  echo "    ok  ${RPT_PASSED} BESKT prompts-and-report assertions passed"
  if [ "$RPT_PASSED" -lt 60 ]; then
    echo "FAIL: expected at least 60 BESKT prompts-and-report assertions, only ${RPT_PASSED} ran." >&2
    RPT_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# BESKT -- the report preview obeys the independence rule (20261124090000).
#
# Runs straight after the PR 6 suite, on the same replayed schema, because it
# is about the very functions PR 6 shipped. It proves the boundary through
# REAL authenticated sessions rather than through a screen: an assessor whose
# own position is open is refused the document by name, the colleague's words
# appear nowhere in anything that caller can still read, and the same caller
# gets the whole document once they lock.
# ---------------------------------------------------------------------------
echo "==> Running BESKT report independence boundary assertions"
set +e
RIB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_conduct_report_independence_test.sql 2>&1)"
RIB_RC=$?
set -e
RIB_PASSED="$(echo "$RIB_OUT" | grep -c "ok  " || true)"
RIB_FAILED=0
if [ "$RIB_RC" -ne 0 ]; then
  echo "FAIL: the BESKT report independence suite exited with code ${RIB_RC}." >&2
  echo "$RIB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  RIB_FAILED=1
else
  echo "    ok  ${RIB_PASSED} BESKT report independence assertions passed"
  if [ "$RIB_PASSED" -lt 24 ]; then
    echo "FAIL: expected at least 24 BESKT report independence assertions, only ${RIB_PASSED} ran." >&2
    RIB_FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# And the way back. A security fix whose rollback does not work is a fix
# nobody can safely deploy, so the rollback is run for real and then the
# migration is re-applied -- with the hole PROVED open in between, because a
# rollback that quietly left the boundary in place would pass a weaker check
# while being broken.
# ---------------------------------------------------------------------------
echo "==> Running BESKT report independence rollback and re-apply"
RIB_RB_FAILED=0
set +e
RIB_RB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261127090000_bcp_conduct_report_independence_boundary_rollback.sql 2>&1)"
RIB_RB_RC=$?
set -e
if [ "$RIB_RB_RC" -ne 0 ]; then
  echo "FAIL: the report independence rollback did not run." >&2
  echo "$RIB_RB_OUT" | head -10 >&2
  RIB_RB_FAILED=1
else
  RIB_OPEN="$(psql -tAq -d "$TEST_DB" -c \
    "SELECT (position('bcp_conduct_may_see_others' in prosrc) = 0) FROM pg_proc WHERE proname = 'bcp_conduct_preview_report';")"
  if [ "$RIB_OPEN" != "t" ]; then
    echo "FAIL: the rollback ran but the independence check is still in place -- it restored nothing." >&2
    RIB_RB_FAILED=1
  else
    echo "    ok  the rollback restores the pre-fix definitions (the boundary is measurably gone)"
  fi
  set +e
  RIB_RE_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
    -f supabase/migrations/20261127090000_bcp_conduct_report_independence_boundary.sql 2>&1)"
  RIB_RE_RC=$?
  set -e
  if [ "$RIB_RE_RC" -ne 0 ]; then
    echo "FAIL: the report independence migration did not re-apply after its rollback." >&2
    echo "$RIB_RE_OUT" | head -10 >&2
    RIB_RB_FAILED=1
  else
    RIB_BACK="$(psql -tAq -d "$TEST_DB" -c \
      "SELECT (position('bcp_conduct_may_see_others' in prosrc) > 0) FROM pg_proc WHERE proname = 'bcp_conduct_preview_report';")"
    if [ "$RIB_BACK" != "t" ]; then
      echo "FAIL: the migration re-applied but the independence check is not back." >&2
      RIB_RB_FAILED=1
    else
      echo "    ok  and the migration re-applies cleanly, closing the boundary again"
    fi
  fi
fi

if [ "$RIB_FAILED" -ne 0 ] || [ "$RIB_RB_FAILED" -ne 0 ]; then
  suite_failed "BESKT report independence boundary"
fi

# ---------------------------------------------------------------------------
# 20261128090000: scp_iv_create_case binds a candidate ACCOUNT only as the
# bound application's own applicant. Proved through real authenticated
# sessions: the applicant is accepted; a stranger, another employer's
# applicant, another employer's application and a user id with no
# application are each refused; an external reference is unchanged.
# ---------------------------------------------------------------------------
echo "==> Running interview-case candidate binding assertions"
CBD_FAILED=0
set +e
CBD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/scp_iv_case_candidate_binding_test.sql 2>&1)"
CBD_RC=$?
set -e
CBD_PASSED="$(echo "$CBD_OUT" | grep -c "ok  " || true)"
if [ "$CBD_RC" -ne 0 ]; then
  echo "FAIL: the candidate binding suite exited with code ${CBD_RC}." >&2
  echo "$CBD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  CBD_FAILED=1
else
  echo "    ok  ${CBD_PASSED} candidate binding assertions passed"
  if [ "$CBD_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 candidate binding assertions, only ${CBD_PASSED} ran." >&2
    CBD_FAILED=1
  fi
fi

# The way back, for real, with the hole PROVED open in between -- a rollback
# that quietly left the rule in place would otherwise pass -- and then the
# migration re-applied.
echo "==> Running interview-case candidate binding rollback and re-apply"
set +e
CBD_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261128090000_scp_iv_case_candidate_binding_rollback.sql 2>&1)"
CBD_RB_RC=$?
set -e
CBD_OPEN="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT position('SCP_IV_CANDIDATE_NOT_APPLICANT' in prosrc) = 0 FROM pg_proc WHERE proname = 'scp_iv_create_case';")"
if [ "$CBD_RB_RC" -ne 0 ] || ! echo "$CBD_RB" | grep -q "SCP_IV_CANDIDATE_BINDING_ROLLBACK ok" || [ "$CBD_OPEN" != "t" ]; then
  echo "FAIL: the candidate binding rollback did not restore the 20261108090000 body." >&2
  echo "$CBD_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CBD_FAILED=1
else
  echo "    ok  the rollback restores the 20261108090000 body, and the binding rule is measurably gone"
fi
set +e
CBD_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261128090000_scp_iv_case_candidate_binding.sql 2>&1)"
CBD_RE_RC=$?
set -e
if [ "$CBD_RE_RC" -ne 0 ] || ! echo "$CBD_RE" | grep -q "SCP_IV_CANDIDATE_BINDING_PROOF ok"; then
  echo "FAIL: the candidate binding migration does not re-apply over its rollback." >&2
  echo "$CBD_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CBD_FAILED=1
else
  echo "    ok  and the migration re-applies over it"
fi
if [ "$CBD_FAILED" -ne 0 ]; then
  suite_failed "Interview-case candidate binding"
fi

# ---------------------------------------------------------------------------
# 20261129090000: the owner's internal test activation. Proved through real
# sessions: only a platform admin records it, only for complete recruitment
# content, for one employer, pinned by content hash; no review row is ever
# written; another employer is refused; a revocation stops new starts but
# never strands a started test; changed content is no longer covered.
# ---------------------------------------------------------------------------
echo "==> Running BESKT internal test activation assertions"
ITA_FAILED=0
set +e
ITA_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_internal_test_activation_test.sql 2>&1)"
ITA_RC=$?
set -e
ITA_PASSED="$(echo "$ITA_OUT" | grep -c "ok  " || true)"
if [ "$ITA_RC" -ne 0 ]; then
  echo "FAIL: the internal test activation suite exited with code ${ITA_RC}." >&2
  echo "$ITA_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  ITA_FAILED=1
else
  echo "    ok  ${ITA_PASSED} internal test activation assertions passed"
  if [ "$ITA_PASSED" -lt 33 ]; then
    echo "FAIL: expected at least 33 internal test activation assertions, only ${ITA_PASSED} ran." >&2
    ITA_FAILED=1
  fi
fi

if [ "$ITA_FAILED" -ne 0 ]; then
  suite_failed "BESKT internal test activation"
fi

# ---------------------------------------------------------------------------
# 20261130090000: BESKT as a complete product. Proved through real sessions:
# the security function and its boundary (a plain member, and another
# employer, see nothing of a vetting); a security vetting started with the
# employer's attestation, lawful basis and owner, answered with
# security-vetting-only content, supplemented, linked, conducted with the
# whole FAKTA chain and finalised only after a human stance; a standalone
# invitation bound to the confirmed invited account with no application;
# the disclosed topic with its rule; and that the legacy paths kept their
# meaning. Its rollback runs before 20261129090000's, because that one
# restores functions this one extends.
# ---------------------------------------------------------------------------
echo "==> Standing 20270111090000 down before the 20261203090000 rollback"
# 20270111090000 (P1-B 4/5) re-creates scp_iv_confirm_transcript_basis and
# scp_iv_case_row_visible, whose 20261203090000 bodies that rollback pins. It
# comes down here; its own block above re-applied and proved it already, and
# every suite from here on is an older one that predates it.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20270111090000_interview_beskt_active_employer_rollback.sql >/dev/null
echo "==> Standing 20261203090000 down before 20261202090000"
# It re-creates scp_interview_cases' read policy on 20261130090000's BESKT
# predicates, so it comes down before the 20261202/20261201/20261130 cycles
# and goes back up with 20261202090000 below.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261203090000_scp_interview_case_vetting_read_rollback.sql >/dev/null
echo "==> Standing 20261202090000 down before 20261201090000"
# It calls functions 20261201090000 creates, so it comes down first and is
# cycled on its own once 20261201090000 is back.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261202090000_scp_interview_starts_rollback.sql >/dev/null
echo "==> Standing 20261201090000 down before the 20261130090000 cycles"
LD_FAILED=0
# 20261201090000 re-creates functions 20261130090000 created and changes the
# listing's return type, so 20261130's rollback cannot run beneath it. It is
# rolled back here and cycled on its own below, over the re-applied 20261130.
set +e
LD_DOWN="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261201090000_scp_library_direct_access_rollback.sql 2>&1)"
LD_DOWN_RC=$?
set -e
if [ "$LD_DOWN_RC" -ne 0 ] || ! echo "$LD_DOWN" | grep -q "SCP_LIBRARY_ROLLBACK ok"; then
  echo "FAIL: 20261201090000 could not be stood down." >&2
  echo "$LD_DOWN" | grep -iE "ERROR:|FEL:" | head -5 >&2
  LD_FAILED=1
fi

echo "==> Re-synchronising 20261130090000 after the earlier rollback cycles"
BC_FAILED=0
# The 20261127 and 20261128 cycles above restore and re-apply functions this
# migration extends, so they leave some of its bodies behind. Rolling it back
# and re-applying it puts every body back to the repository's -- and its
# md5 preconditions only admit that when every pinned body is main's again.
set +e
BC_SYNC="$( { psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/rollback/20261130090000_bcp_beskt_complete_rollback.sql \
  && psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f supabase/migrations/20261130090000_bcp_beskt_complete.sql; } 2>&1)"
BC_SYNC_RC=$?
set -e
if [ "$BC_SYNC_RC" -ne 0 ] || ! echo "$BC_SYNC" | grep -q "BCP_BESKT_COMPLETE_PROOF ok"; then
  echo "FAIL: 20261130090000 could not be re-synchronised." >&2
  echo "$BC_SYNC" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BC_FAILED=1
fi
echo "==> Running BESKT complete-product assertions"
set +e
BC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/bcp_beskt_complete_test.sql 2>&1)"
BC_RC=$?
set -e
BC_PASSED="$(echo "$BC_OUT" | grep -c "ok  " || true)"
if [ "$BC_RC" -ne 0 ]; then
  echo "FAIL: the complete-product suite exited with code ${BC_RC}." >&2
  echo "$BC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  BC_FAILED=1
else
  echo "    ok  ${BC_PASSED} complete-product assertions passed"
  if [ "$BC_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 complete-product assertions, only ${BC_PASSED} ran." >&2
    BC_FAILED=1
  fi
fi

echo "==> Running BESKT complete-product rollback"
set +e
BC_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261130090000_bcp_beskt_complete_rollback.sql 2>&1)"
BC_RB_RC=$?
set -e
BC_GONE="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT to_regclass('public.bcp_security_officers') IS NULL AND to_regclass('public.bcp_invitations') IS NULL AND position('bcp_case_access_ok' in (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_can_read_case')) = 0;")"
if [ "$BC_RB_RC" -ne 0 ] || ! echo "$BC_RB" | grep -q "BCP_BESKT_COMPLETE_ROLLBACK ok" || [ "$BC_GONE" != "t" ]; then
  echo "FAIL: the complete-product rollback did not restore the previous schema." >&2
  echo "$BC_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BC_FAILED=1
else
  echo "    ok  the rollback restores every extended function exactly, and the new objects are gone"
fi

echo "==> Running BESKT internal test activation rollback and re-apply"
set +e
ITA_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261129090000_bcp_internal_test_activation_rollback.sql 2>&1)"
ITA_RB_RC=$?
set -e
ITA_GONE="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT to_regclass('public.bcp_internal_test_activations') IS NULL AND position('bcp_internal_test_activation_active' in (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_assign')) = 0;")"
if [ "$ITA_RB_RC" -ne 0 ] || ! echo "$ITA_RB" | grep -q "BCP_INTERNAL_TEST_ACTIVATION_ROLLBACK ok" || [ "$ITA_GONE" != "t" ]; then
  echo "FAIL: the internal test activation rollback did not restore the gates." >&2
  echo "$ITA_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ITA_FAILED=1
else
  echo "    ok  the rollback restores the four gates exactly, and the activation path is measurably gone"
fi
set +e
ITA_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261129090000_bcp_internal_test_activation.sql 2>&1)"
ITA_RE_RC=$?
set -e
if [ "$ITA_RE_RC" -ne 0 ] || ! echo "$ITA_RE" | grep -q "BCP_INTERNAL_TEST_ACTIVATION_PROOF ok"; then
  echo "FAIL: the internal test activation migration does not re-apply over its rollback." >&2
  echo "$ITA_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ITA_FAILED=1
else
  echo "    ok  and the migration re-applies over it"
fi
if [ "$ITA_FAILED" -ne 0 ]; then
  suite_failed "BESKT internal test activation rollback"
fi
echo "==> Re-applying BESKT complete product over the restored 20261129090000"
set +e
BC_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261130090000_bcp_beskt_complete.sql 2>&1)"
BC_RE_RC=$?
set -e
if [ "$BC_RE_RC" -ne 0 ] || ! echo "$BC_RE" | grep -q "BCP_BESKT_COMPLETE_PROOF ok"; then
  echo "FAIL: the complete-product migration does not re-apply over its rollback." >&2
  echo "$BC_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BC_FAILED=1
else
  echo "    ok  and the migration re-applies over it"
fi
if [ "$BC_FAILED" -ne 0 ]; then
  suite_failed "BESKT complete product"
fi

# ---------------------------------------------------------------------------
# 20261201090000: the library's direct access. Proved through real sessions:
# a NEW active organisation and an EXISTING one reach published content, and
# content the publisher made available, with no grant, activation, content
# role or install of their own; a pending organisation and another
# organisation reach nothing; availability is governed, idempotent and frozen
# and reviews nothing; withdrawal stops new starts but not started work; the
# security function still owns a vetting; and the recruitment setup is
# recorded once, readable only where its case or assignment is.
# ---------------------------------------------------------------------------
echo "==> Applying the library's direct access over 20261130090000"
set +e
LD_UP="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261201090000_scp_library_direct_access.sql 2>&1)"
LD_UP_RC=$?
set -e
if [ "$LD_UP_RC" -ne 0 ] || ! echo "$LD_UP" | grep -q "SCP_LIBRARY_DIRECT_ACCESS_PROOF ok"; then
  echo "FAIL: 20261201090000 does not apply over 20261130090000." >&2
  echo "$LD_UP" | grep -iE "ERROR:|FEL:" | head -5 >&2
  LD_FAILED=1
fi
echo "==> Running library direct-access assertions"
set +e
LD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/scp_library_direct_access_test.sql 2>&1)"
LD_RC=$?
set -e
LD_PASSED="$(echo "$LD_OUT" | grep -c "ok  " || true)"
if [ "$LD_RC" -ne 0 ]; then
  echo "FAIL: the library direct-access suite exited with code ${LD_RC}." >&2
  echo "$LD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  LD_FAILED=1
else
  echo "    ok  ${LD_PASSED} library direct-access assertions passed"
  if [ "$LD_PASSED" -lt 34 ]; then
    echo "FAIL: expected at least 34 library direct-access assertions, only ${LD_PASSED} ran." >&2
    LD_FAILED=1
  fi
fi
echo "==> Running library direct-access rollback and re-apply"
set +e
LD_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261201090000_scp_library_direct_access_rollback.sql 2>&1)"
LD_RB_RC=$?
set -e
LD_GONE="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT to_regclass('public.scp_recruitment_setups') IS NULL AND position('bcp_pilot_grant_active' in (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_check_start')) > 0;")"
if [ "$LD_RB_RC" -ne 0 ] || ! echo "$LD_RB" | grep -q "SCP_LIBRARY_ROLLBACK ok" || [ "$LD_GONE" != "t" ]; then
  echo "FAIL: the library direct-access rollback did not restore the previous gates." >&2
  echo "$LD_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  LD_FAILED=1
else
  echo "    ok  the rollback restores every gate exactly, and the per-employer grant is required again"
fi
set +e
LD_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261201090000_scp_library_direct_access.sql 2>&1)"
LD_RE_RC=$?
set -e
if [ "$LD_RE_RC" -ne 0 ] || ! echo "$LD_RE" | grep -q "SCP_LIBRARY_DIRECT_ACCESS_PROOF ok"; then
  echo "FAIL: the library direct-access migration does not re-apply over its rollback." >&2
  echo "$LD_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  LD_FAILED=1
else
  echo "    ok  and the migration re-applies over it"
fi
if [ "$LD_FAILED" -ne 0 ]; then
  suite_failed "Library direct access"
fi

# ---------------------------------------------------------------------------
# 20261202090000: one interview per intended start. Proved through real
# sessions: the start follows its source (the exact test, a BESKT assignment,
# or an explicitly chosen setup); the case is bound to the applicant's own
# account; TRUST and BESKT stay apart; another organisation neither reads nor
# reuses a start; a cancelled case releases it. Then two real connections
# start the same interview at the same instant, a third retries, and exactly
# one case exists.
# ---------------------------------------------------------------------------
echo "==> Applying interview starts over 20261201090000"
ST_FAILED=0
set +e
ST_UP="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261202090000_scp_interview_starts.sql 2>&1)"
ST_UP_RC=$?
set -e
if [ "$ST_UP_RC" -ne 0 ] || ! echo "$ST_UP" | grep -q "SCP_INTERVIEW_STARTS_PROOF ok"; then
  echo "FAIL: 20261202090000 does not apply over 20261201090000." >&2
  echo "$ST_UP" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ST_FAILED=1
fi
# 20261203090000 goes up with it: the start suite reads the vetting case row.
set +e
CV_UP="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261203090000_scp_interview_case_vetting_read.sql 2>&1)"
CV_UP_RC=$?
set -e
if [ "$CV_UP_RC" -ne 0 ] || ! echo "$CV_UP" | grep -q "SCP_CASE_VETTING_READ_PROOF ok"; then
  echo "FAIL: 20261203090000 does not apply over 20261202090000." >&2
  echo "$CV_UP" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ST_FAILED=1
fi
echo "==> Running interview start assertions"
set +e
ST_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_starts_test.sql 2>&1)"
ST_RC=$?
set -e
ST_PASSED="$(echo "$ST_OUT" | grep -c "ok  " || true)"
if [ "$ST_RC" -ne 0 ]; then
  echo "FAIL: the interview start suite exited with code ${ST_RC}." >&2
  echo "$ST_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  ST_FAILED=1
else
  echo "    ok  ${ST_PASSED} interview start assertions passed"
  if [ "$ST_PASSED" -lt 80 ]; then
    echo "FAIL: expected at least 80 interview start assertions, only ${ST_PASSED} ran." >&2
    ST_FAILED=1
  fi
fi

echo "==> Running interview start concurrent-creation race"
# Committed fixtures: the race needs rows both connections can see. They are
# removed again below, so nothing after this block meets them.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('bf100000-0000-4000-8000-0000000000d1', 'st-race-owner@synthetic.test'),
  ('bf100000-0000-4000-8000-0000000000c1', 'st-race-cand@synthetic.test');
INSERT INTO public.employers (id, name, slug, status)
VALUES ('bf100000-0000-4000-8000-0000000000e1', 'SYNTETISK Race AB', 'synthetic-st-race', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('bf100000-0000-4000-8000-0000000000e1', 'bf100000-0000-4000-8000-0000000000d1', 'owner', 'active');
INSERT INTO public.jobs (id, slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
VALUES ('bf100000-0000-4000-8000-0000000000f1', 'st-race-job', 'STRACE', 'bf100000-0000-4000-8000-0000000000e1',
        'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)', 'published', now(), now() + interval '90 days');
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('bf100000-0000-4000-8000-0000000000a1', 'bf100000-0000-4000-8000-0000000000f1',
        'bf100000-0000-4000-8000-0000000000e1', 'bf100000-0000-4000-8000-0000000000c1', now());
COMMIT;
SQL
ST_RACE_SQL="SELECT 'CASEID=' || (public.scp_iv_start_interview('bf100000-0000-4000-8000-0000000000e1', 'bf100000-0000-4000-8000-0000000000a1', 'chosen_setup', NULL, 'trust', NULL, 'operational', 'vaktare', 'general') ->> 'case_id') AS marked;"
ST_A="$(mktemp)"; ST_B="$(mktemp)"; ST_C="$(mktemp)"
cat > "$ST_A" <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bf100000-0000-4000-8000-0000000000d1', true);
SET LOCAL ROLE authenticated;
${ST_RACE_SQL}
SELECT pg_sleep(2);
COMMIT;
SQL
cat > "$ST_B" <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bf100000-0000-4000-8000-0000000000d1', true);
SET LOCAL ROLE authenticated;
${ST_RACE_SQL}
COMMIT;
SQL
cp "$ST_B" "$ST_C"
ST_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.scp_interview_cases where application_id='bf100000-0000-4000-8000-0000000000a1';")"
psql -tAq -d "$TEST_DB" -f "$ST_A" > /tmp/strace_a.out 2>&1 &
ST_PID=$!
# Long enough for A to be inside its transaction, holding the start's lock.
sleep 1
psql -tAq -d "$TEST_DB" -f "$ST_B" > /tmp/strace_b.out 2>&1
wait "$ST_PID" || true
# A retry after the response was lost: a fresh connection, after both committed.
psql -tAq -d "$TEST_DB" -f "$ST_C" > /tmp/strace_c.out 2>&1
ST_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.scp_interview_cases where application_id='bf100000-0000-4000-8000-0000000000a1';")"
ST_STARTS="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.scp_interview_starts where application_id='bf100000-0000-4000-8000-0000000000a1';")"
ST_ID_A="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/strace_a.out || true; } | head -1 | cut -d= -f2)"
ST_ID_B="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/strace_b.out || true; } | head -1 | cut -d= -f2)"
ST_ID_C="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/strace_c.out || true; } | head -1 | cut -d= -f2)"
if [ "$(( ST_AFTER - ST_BEFORE ))" -ne 1 ] || [ "$ST_STARTS" -ne 1 ]; then
  echo "FAIL: two concurrent starts and a retry produced $(( ST_AFTER - ST_BEFORE )) cases and ${ST_STARTS} starts, not 1 and 1." >&2
  head -5 /tmp/strace_a.out /tmp/strace_b.out /tmp/strace_c.out >&2
  ST_FAILED=1
else
  echo "    ok  two concurrent starts and a retry: exactly one case and one start row"
fi
if [ -z "$ST_ID_A" ] || [ "$ST_ID_A" != "$ST_ID_B" ] || [ "$ST_ID_A" != "$ST_ID_C" ]; then
  echo "FAIL: the callers were told different cases ('${ST_ID_A}' / '${ST_ID_B}' / '${ST_ID_C}')." >&2
  ST_FAILED=1
else
  echo "    ok  and all three callers were told the same case (${ST_ID_A})"
fi
if grep -qiE "ERROR:|FEL:" /tmp/strace_b.out /tmp/strace_c.out; then
  echo "FAIL: a later caller errored instead of waiting for, or reusing, the first." >&2
  head -5 /tmp/strace_b.out /tmp/strace_c.out >&2
  ST_FAILED=1
else
  echo "    ok  the second caller waited for the first, and the retry reused its case"
fi
rm -f "$ST_A" "$ST_B" "$ST_C"
# The race's committed rows go again, every row that names its case first.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" >/dev/null <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica;
DO $clean$
DECLARE _t record; _cases uuid[];
BEGIN
  SELECT array_agg(id) INTO _cases FROM public.scp_interview_cases
   WHERE employer_id = 'bf100000-0000-4000-8000-0000000000e1';
  FOR _t IN SELECT c.table_name FROM information_schema.columns c
             JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.column_name IN ('case_id', 'interview_case_id')
              AND t.table_type = 'BASE TABLE' LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', _t.table_name,
      (SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = _t.table_name AND column_name IN ('case_id', 'interview_case_id') LIMIT 1))
      USING _cases;
  END LOOP;
  DELETE FROM public.scp_interview_cases WHERE id = ANY(_cases);
END $clean$;
DELETE FROM public.job_applications WHERE id = 'bf100000-0000-4000-8000-0000000000a1';
DELETE FROM public.jobs WHERE id = 'bf100000-0000-4000-8000-0000000000f1';
DELETE FROM public.employer_memberships WHERE employer_id = 'bf100000-0000-4000-8000-0000000000e1';
DELETE FROM public.employers WHERE id = 'bf100000-0000-4000-8000-0000000000e1';
DELETE FROM auth.users WHERE id IN ('bf100000-0000-4000-8000-0000000000d1', 'bf100000-0000-4000-8000-0000000000c1');
COMMIT;
SQL

echo "==> Running BESKT interview start race (application-bound preparation)"
# The same guarantee for BESKT, whose start also writes the governed link.
# Its committed world is heavy (method, assignment, answers, ledger), so it
# lives in a THROWAWAY copy of the test database and is dropped with it.
ST_RACE_DB="${TEST_DB}_start_race"
psql -q -d postgres -c "DROP DATABASE IF EXISTS ${ST_RACE_DB};" > /dev/null
psql -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE ${ST_RACE_DB} TEMPLATE ${TEST_DB};" > /dev/null
set +e
BR_SETUP_OUT="$(printf 'BEGIN;\n\\set ON_ERROR_STOP on\n\\i supabase/tests/scp_interview_start_beskt_race_fixture.sql\nCOMMIT;\n' \
  | psql -v ON_ERROR_STOP=1 -tAq -d "$ST_RACE_DB" 2>&1)"
BR_SETUP_RC=$?
set -e
BR_EMP="$(echo "$BR_SETUP_OUT" | { grep -oE 'EMP=[0-9a-f-]{36}' || true; } | head -1 | cut -d= -f2)"
BR_APP="$(echo "$BR_SETUP_OUT" | { grep -oE 'APP=[0-9a-f-]{36}' || true; } | head -1 | cut -d= -f2)"
BR_ASSIGN="$(echo "$BR_SETUP_OUT" | { grep -oE 'ASSIGN=[0-9a-f-]{36}' || true; } | head -1 | cut -d= -f2)"
BR_OWNER="$(echo "$BR_SETUP_OUT" | { grep -oE 'OWNER=[0-9a-f-]{36}' || true; } | head -1 | cut -d= -f2)"
if [ "$BR_SETUP_RC" -ne 0 ] || [ -z "$BR_ASSIGN" ] || [ -z "$BR_OWNER" ]; then
  echo "FAIL: the BESKT start race fixture could not be committed." >&2
  echo "$BR_SETUP_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ST_FAILED=1
else
  BR_SQL="SELECT 'CASEID=' || (public.scp_iv_start_interview('${BR_EMP}', '${BR_APP}', 'beskt_assignment', '${BR_ASSIGN}', 'beskt') ->> 'case_id') AS marked;"
  BR_A="$(mktemp)"; BR_B="$(mktemp)"; BR_C="$(mktemp)"
  cat > "$BR_A" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BR_OWNER}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BR_OWNER}', true);
SET LOCAL ROLE authenticated;
${BR_SQL}
SELECT pg_sleep(2);
COMMIT;
SQL
  cat > "$BR_B" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${BR_OWNER}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${BR_OWNER}', true);
SET LOCAL ROLE authenticated;
${BR_SQL}
COMMIT;
SQL
  cp "$BR_B" "$BR_C"
  psql -tAq -d "$ST_RACE_DB" -f "$BR_A" > /tmp/brace_a.out 2>&1 &
  BR_PID=$!
  sleep 1
  psql -tAq -d "$ST_RACE_DB" -f "$BR_B" > /tmp/brace_b.out 2>&1
  wait "$BR_PID" || true
  psql -tAq -d "$ST_RACE_DB" -f "$BR_C" > /tmp/brace_c.out 2>&1
  BR_COUNTS="$(psql -tAq -d "$ST_RACE_DB" -c "select (select count(*) from public.scp_interview_cases where employer_id = '${BR_EMP}') || '/' || (select count(*) from public.scp_interview_starts where employer_id = '${BR_EMP}') || '/' || (select count(*) from public.bcp_case_links where assignment_id = '${BR_ASSIGN}' and unlinked_at is null) || '/' || (select count(*) from public.scp_recruitment_setups where beskt_assignment_id = '${BR_ASSIGN}');")"
  BR_ID_A="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/brace_a.out || true; } | head -1 | cut -d= -f2)"
  BR_ID_B="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/brace_b.out || true; } | head -1 | cut -d= -f2)"
  BR_ID_C="$( { grep -oE 'CASEID=[0-9a-f-]{36}' /tmp/brace_c.out || true; } | head -1 | cut -d= -f2)"
  BR_LINKED="$(psql -tAq -d "$ST_RACE_DB" -c "select count(*) from public.bcp_case_links where assignment_id = '${BR_ASSIGN}' and case_id::text = '${BR_ID_A}' and unlinked_at is null;")"
  if [ "$BR_COUNTS" != "1/1/1/1" ]; then
    echo "FAIL: two concurrent BESKT starts and a retry left cases/starts/links/setups = ${BR_COUNTS}, not 1/1/1/1." >&2
    head -5 /tmp/brace_a.out /tmp/brace_b.out /tmp/brace_c.out >&2
    ST_FAILED=1
  else
    echo "    ok  two concurrent BESKT starts and a retry: one case, one start, one live link, one setup"
  fi
  if [ -z "$BR_ID_A" ] || [ "$BR_ID_A" != "$BR_ID_B" ] || [ "$BR_ID_A" != "$BR_ID_C" ] || [ "$BR_LINKED" != "1" ]; then
    echo "FAIL: the BESKT callers were told different cases ('${BR_ID_A}' / '${BR_ID_B}' / '${BR_ID_C}'), or it is not the linked one." >&2
    ST_FAILED=1
  else
    echo "    ok  and all three callers were told the same, linked case (${BR_ID_A})"
  fi
  if grep -qiE "ERROR:|FEL:" /tmp/brace_b.out /tmp/brace_c.out; then
    echo "FAIL: a later BESKT caller errored instead of waiting for, or reusing, the first." >&2
    head -5 /tmp/brace_b.out /tmp/brace_c.out >&2
    ST_FAILED=1
  else
    echo "    ok  the second BESKT caller waited for the first, and the retry reused its case"
  fi
  rm -f "$BR_A" "$BR_B" "$BR_C" /tmp/brace_a.out /tmp/brace_b.out /tmp/brace_c.out
fi
psql -q -d postgres -c "DROP DATABASE IF EXISTS ${ST_RACE_DB};" > /dev/null

# ---------------------------------------------------------------------------
# 20261203090000: a security vetting's case ROW is the security function's.
# Proved by DIRECT reads of scp_interview_cases as real sessions (member,
# owner, admin, security officer, candidate, other organisation, anon), plus
# lists, related rows, the view and the RPCs -- and then the same suite is run
# against the OLD membership policy (the rollback) and must FAIL there. The
# rollback reintroduces the gap; it runs only here, in the disposable replay.
# ---------------------------------------------------------------------------
echo "==> Running security-vetting case-row access assertions"
CV_FAILED=0
set +e
CV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_case_vetting_read_test.sql 2>&1)"
CV_RC=$?
set -e
CV_PASSED="$(echo "$CV_OUT" | grep -c "ok  " || true)"
if [ "$CV_RC" -ne 0 ]; then
  echo "FAIL: the case-row access suite exited with code ${CV_RC}." >&2
  echo "$CV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  CV_FAILED=1
else
  echo "    ok  ${CV_PASSED} case-row access assertions passed"
  if [ "$CV_PASSED" -lt 23 ]; then
    echo "FAIL: expected at least 23 case-row access assertions, only ${CV_PASSED} ran." >&2
    CV_FAILED=1
  fi
fi
echo "==> Negative control: the same suite against the old membership policy must fail"
set +e
CV_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261203090000_scp_interview_case_vetting_read_rollback.sql 2>&1)"
CV_RB_RC=$?
CV_OLD="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/scp_interview_case_vetting_read_test.sql 2>&1)"
CV_OLD_RC=$?
set -e
if [ "$CV_RB_RC" -ne 0 ] || ! echo "$CV_RB" | grep -q "SCP_CASE_VETTING_READ_ROLLBACK ok"; then
  echo "FAIL: the case-row access rollback did not restore the previous policy exactly." >&2
  echo "$CV_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CV_FAILED=1
elif [ "$CV_OLD_RC" -eq 0 ] || ! echo "$CV_OLD" | grep -q "ASSERTION FAILED: CV1.1"; then
  echo "FAIL: the access suite did NOT fail against the old membership policy -- it would not catch the gap." >&2
  echo "$CV_OLD" | grep -iE "ASSERTION FAILED|ERROR:" | head -3 >&2
  CV_FAILED=1
else
  echo "    ok  with the old membership policy restored the suite fails at CV1.1: a plain member reads the vetting row"
fi
# 20261203090000 stays down for 20261202090000's own rollback cycle below,
# and is re-applied after it.

echo "==> Running interview start rollback and re-apply"
set +e
ST_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261202090000_scp_interview_starts_rollback.sql 2>&1)"
ST_RB_RC=$?
ST_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261202090000_scp_interview_starts.sql 2>&1)"
ST_RE_RC=$?
set -e
if [ "$ST_RB_RC" -ne 0 ] || ! echo "$ST_RB" | grep -q "SCP_INTERVIEW_STARTS_ROLLBACK ok"; then
  echo "FAIL: the interview start rollback did not run cleanly." >&2
  echo "$ST_RB" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ST_FAILED=1
elif [ "$ST_RE_RC" -ne 0 ] || ! echo "$ST_RE" | grep -q "SCP_INTERVIEW_STARTS_PROOF ok"; then
  echo "FAIL: the interview start migration does not re-apply over its rollback." >&2
  echo "$ST_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  ST_FAILED=1
else
  echo "    ok  the rollback removes it and the migration re-applies over it"
fi
if [ "$ST_FAILED" -ne 0 ]; then
  suite_failed "Interview starts"
fi
set +e
CV_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261203090000_scp_interview_case_vetting_read.sql 2>&1)"
CV_RE_RC=$?
set -e
if [ "$CV_RE_RC" -ne 0 ] || ! echo "$CV_RE" | grep -q "SCP_CASE_VETTING_READ_PROOF ok"; then
  echo "FAIL: 20261203090000 does not re-apply over its rollback." >&2
  echo "$CV_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CV_FAILED=1
else
  echo "    ok  and 20261203090000 re-applies over its rollback: the case row is protected again"
fi
if [ "$CV_FAILED" -ne 0 ]; then
  suite_failed "Security-vetting case-row access"
fi

# ---------------------------------------------------------------------------
# Two people press "lock my position" at the same instant, in two real
# connections. Exactly one lock must land and the other must be refused by
# name -- not both, not neither, and not a torn row. The suite above runs in
# one transaction and cannot prove this; only two connections can.
# ---------------------------------------------------------------------------
echo "==> Running BESKT conduct concurrent-lock race"
CNDR_SETUP="$(mktemp)"; CNDR_A="$(mktemp)"; CNDR_B="$(mktemp)"
CNDR_FAILED=0
CNDR_REC="b6000000-0000-4000-8000-0000000000d1"
cat > "$CNDR_SETUP" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
\i supabase/tests/bcp_conduct_race_fixture.sql
COMMIT;
SQL
set +e
CNDR_SETUP_OUT="$(psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" -f "$CNDR_SETUP" 2>&1)"
CNDR_SETUP_RC=$?
set -e
CNDR_POS="$(echo "$CNDR_SETUP_OUT" | grep -oE 'POS=[0-9a-f-]{36}' | head -1 | cut -d= -f2 || true)"
CNDR_REV="$(echo "$CNDR_SETUP_OUT" | grep -oE 'REV=[0-9]+' | head -1 | cut -d= -f2 || true)"
if [ "$CNDR_SETUP_RC" -ne 0 ] || [ -z "$CNDR_POS" ] || [ -z "$CNDR_REV" ]; then
  echo "FAIL: the conduct concurrent-lock race setup failed." >&2
  echo "$CNDR_SETUP_OUT" | grep -iE "ERROR:|FEL:|ASSERTION" | head -5 >&2
  CNDR_FAILED=1
else
  # Both name the SAME expected revision, which is what makes this a race
  # rather than two ordered calls.
  for W in A B; do
    eval "F=\$CNDR_$W"
    cat > "$F" <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${CNDR_REC}', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '${CNDR_REC}', true);
SET LOCAL ROLE authenticated;
SELECT 'LOCKED=' || (public.bcp_conduct_lock_position(gen_random_uuid(), '${CNDR_POS}'::uuid, ${CNDR_REV}) ->> 'state') AS marked;
COMMIT;
SQL
  done
  set +e
  psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" -f "$CNDR_A" > /tmp/cndr_a.out 2>&1 &
  CNDR_PID=$!
  psql -v ON_ERROR_STOP=1 -tAq -d "$TEST_DB" -f "$CNDR_B" > /tmp/cndr_b.out 2>&1
  wait "$CNDR_PID" || true
  set -e
  CNDR_WON="$(cat /tmp/cndr_a.out /tmp/cndr_b.out | grep -c 'LOCKED=locked' || true)"
  CNDR_REFUSED="$(cat /tmp/cndr_a.out /tmp/cndr_b.out | grep -cE 'BCP_CONDUCT_ALREADY_LOCKED|BCP_STALE_REVISION' || true)"
  CNDR_ROWS="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.bcp_conduct_positions where id = '${CNDR_POS}' and state = 'locked';")"
  if [ "$CNDR_WON" -ne 1 ] || [ "$CNDR_REFUSED" -ne 1 ]; then
    echo "FAIL: the concurrent lock did not settle deterministically (won=${CNDR_WON}, refused=${CNDR_REFUSED})." >&2
    cat /tmp/cndr_a.out /tmp/cndr_b.out | head -10 >&2
    CNDR_FAILED=1
  else
    echo "    ok  exactly one of two simultaneous locks landed, and the other was refused by name"
  fi
  if [ "$CNDR_ROWS" != "1" ]; then
    echo "FAIL: after the race the position is not in exactly one locked state (${CNDR_ROWS})." >&2
    CNDR_FAILED=1
  else
    echo "    ok  and the position ended locked exactly once"
  fi
  rm -f /tmp/cndr_a.out /tmp/cndr_b.out
fi
rm -f "$CNDR_SETUP" "$CNDR_A" "$CNDR_B"
if [ "$CNDR_FAILED" -ne 0 ]; then CND_FAILED=1; fi

# ---------------------------------------------------------------------------
# The PR 5A rollback, for real, then the migration re-applied over it.
# ---------------------------------------------------------------------------
echo "==> Running BESKT PR 5A rollback and re-apply"
# The race above committed a real session; the rollback correctly REFUSES while
# one exists, which is itself the contract. Prove that refusal, then clear the
# synthetic rows deliberately -- exactly what the refusal message asks for.
set +e
CND_REFUSE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261113090000_bcp_interview_conduct_rollback.sql 2>&1)"
CND_REFUSE_RC=$?
set -e
if [ "$CND_REFUSE_RC" -eq 0 ] || ! echo "$CND_REFUSE" | grep -q "BCP_CONDUCT_ROLLBACK"; then
  echo "FAIL: the PR 5A rollback did not refuse while a real conduct session existed." >&2
  echo "$CND_REFUSE" | grep -iE "ERROR:|NOTICE" | head -5 >&2
  CND_FAILED=1
else
  echo "    ok  the rollback REFUSES to discard a recorded interview, and says so by name"
fi

# Remove the race fixture's whole synthetic world.
#
# The suite above runs in one transaction and is rolled back; the race fixture
# cannot, because two connections need committed rows. So everything it planted
# is removed here by its own b6 prefix -- the conduct rows, the PR 4 link and
# its case source, the ledger rows, and the people and records underneath.
#
# The append-only guards are disabled around the ledger deletes. That is
# cleanup of SYNTHETIC rows in a disposable replay database, not a licence
# anything holds in production: nothing but this harness can reach these
# statements, and the guards are re-enabled immediately.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" > /dev/null <<'SQL'
DELETE FROM public.bcp_conduct_panel_resolutions;
DELETE FROM public.bcp_conduct_panels;
DELETE FROM public.bcp_conduct_verifications;
ALTER TABLE public.bcp_conduct_entries DISABLE TRIGGER bcp_conduct_entries_guard;
DELETE FROM public.bcp_conduct_entries;
ALTER TABLE public.bcp_conduct_entries ENABLE TRIGGER bcp_conduct_entries_guard;
ALTER TABLE public.bcp_conduct_positions DISABLE TRIGGER bcp_conduct_positions_guard;
DELETE FROM public.bcp_conduct_positions;
ALTER TABLE public.bcp_conduct_positions ENABLE TRIGGER bcp_conduct_positions_guard;
ALTER TABLE public.bcp_conduct_sessions DISABLE TRIGGER bcp_conduct_sessions_guard;
DELETE FROM public.bcp_conduct_sessions;
ALTER TABLE public.bcp_conduct_sessions ENABLE TRIGGER bcp_conduct_sessions_guard;

ALTER TABLE public.bcp_case_links DISABLE TRIGGER bcp_case_links_guard;
ALTER TABLE public.bcp_case_topics DISABLE TRIGGER bcp_case_topics_guard;
DELETE FROM public.bcp_case_topics
 WHERE link_id IN (SELECT id FROM public.bcp_case_links
                    WHERE employer_id::text LIKE 'b6000000%');
DELETE FROM public.bcp_case_links WHERE employer_id::text LIKE 'b6000000%';
ALTER TABLE public.bcp_case_topics ENABLE TRIGGER bcp_case_topics_guard;
ALTER TABLE public.bcp_case_links ENABLE TRIGGER bcp_case_links_guard;

ALTER TABLE public.bcp_events DISABLE TRIGGER ALL;
DELETE FROM public.bcp_events WHERE employer_id::text LIKE 'b6000000%';
ALTER TABLE public.bcp_events ENABLE TRIGGER ALL;

DELETE FROM public.scp_interview_case_sources
 WHERE case_id IN (SELECT id FROM public.scp_interview_cases
                    WHERE employer_id::text LIKE 'b6000000%');
DELETE FROM public.scp_interview_cases WHERE employer_id::text LIKE 'b6000000%';

ALTER TABLE public.bcp_answers DISABLE TRIGGER ALL;
ALTER TABLE public.bcp_responses DISABLE TRIGGER ALL;
ALTER TABLE public.bcp_assignments DISABLE TRIGGER ALL;
ALTER TABLE public.bcp_notice_acknowledgements DISABLE TRIGGER ALL;
DELETE FROM public.bcp_answers WHERE response_id IN (
  SELECT r.id FROM public.bcp_responses r JOIN public.bcp_assignments a ON a.id = r.assignment_id
   WHERE a.employer_id::text LIKE 'b6000000%');
DELETE FROM public.bcp_notice_acknowledgements WHERE assignment_id IN (
  SELECT id FROM public.bcp_assignments WHERE employer_id::text LIKE 'b6000000%');
DELETE FROM public.bcp_responses WHERE assignment_id IN (
  SELECT id FROM public.bcp_assignments WHERE employer_id::text LIKE 'b6000000%');
DELETE FROM public.bcp_assignments WHERE employer_id::text LIKE 'b6000000%';
ALTER TABLE public.bcp_notice_acknowledgements ENABLE TRIGGER ALL;
ALTER TABLE public.bcp_assignments ENABLE TRIGGER ALL;
ALTER TABLE public.bcp_responses ENABLE TRIGGER ALL;
ALTER TABLE public.bcp_answers ENABLE TRIGGER ALL;

ALTER TABLE public.bcp_pilot_grants DISABLE TRIGGER ALL;
DELETE FROM public.bcp_pilot_grants WHERE employer_id::text LIKE 'b6000000%';
ALTER TABLE public.bcp_pilot_grants ENABLE TRIGGER ALL;

DELETE FROM public.job_applications WHERE employer_id::text LIKE 'b6000000%';
DELETE FROM public.jobs WHERE employer_id::text LIKE 'b6000000%';
DELETE FROM public.employer_memberships WHERE employer_id::text LIKE 'b6000000%';
DELETE FROM public.employers WHERE id::text LIKE 'b6000000%';
DELETE FROM auth.users WHERE id::text LIKE 'b6000000%';

-- The governed method the race fixture built and COMMITTED. It is authored by
-- the shared fixture's b2 editor, so leaving it here makes the pre-existing
-- BESKT cleanup further down fail: deleting that editor would SET NULL on the
-- pack's created_by, which the identity guard correctly refuses.
ALTER TABLE public.scp_interview_packs DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_method_versions DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_item_options DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_items DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_sections DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_exposure_profiles DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_method_events DISABLE TRIGGER ALL;
ALTER TABLE public.beskt_method_reviews DISABLE TRIGGER ALL;
DELETE FROM public.beskt_item_options WHERE item_id IN (
  SELECT i.id FROM public.beskt_items i JOIN public.beskt_method_versions v ON v.id = i.method_version_id
   JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_items WHERE method_version_id IN (
  SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_sections WHERE method_version_id IN (
  SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_exposure_profiles WHERE method_version_id IN (
  SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_method_events WHERE method_version_id IN (
  SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_method_reviews WHERE method_version_id IN (
  SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'race-synthetic');
DELETE FROM public.beskt_method_versions WHERE pack_id IN (
  SELECT id FROM public.scp_interview_packs WHERE slug = 'race-synthetic');
DELETE FROM public.scp_interview_packs WHERE slug = 'race-synthetic';
ALTER TABLE public.beskt_method_reviews ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_method_events ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_exposure_profiles ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_sections ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_items ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_item_options ENABLE TRIGGER ALL;
ALTER TABLE public.beskt_method_versions ENABLE TRIGGER ALL;
ALTER TABLE public.scp_interview_packs ENABLE TRIGGER ALL;
SQL

# Prove the cleanup was complete rather than assuming it: anything the fixture
# left behind would break the PR 4 and PR 3 sections below in a way that is
# hard to read from here.
CNDR_LEFT="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from public.bcp_conduct_sessions) + (select count(*) from public.bcp_case_links where employer_id::text like 'b6000000%') + (select count(*) from public.bcp_events where employer_id::text like 'b6000000%') + (select count(*) from public.employers where id::text like 'b6000000%') + (select count(*) from public.scp_interview_packs where slug = 'race-synthetic');")"
if [ "$CNDR_LEFT" != "0" ]; then
  echo "FAIL: the conduct race fixture left ${CNDR_LEFT} synthetic row(s) behind." >&2
  CND_FAILED=1
else
  echo "    ok  and the race fixture's synthetic world is removed completely"
fi

# ---------------------------------------------------------------------------
# The PR 6 rollback, for real, then the migration re-applied over it.
#
# Runs BEFORE PR 5A's own rollback: bcp_conduct_reports holds a foreign key
# into bcp_conduct_sessions, and neither rollback uses CASCADE, so dropping
# the conduct layer while PR 6 still stands on it would refuse -- correctly.
# ---------------------------------------------------------------------------
echo "==> Running BESKT PR 6 rollback and re-apply"

# It must REFUSE while a finalised report exists -- that document is the one
# thing the design says nobody may remove, the owner included.
set +e
RPT_RB_REFUSAL="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261117090000_bcp_conduct_prompts_and_report_rollback.sql 2>&1)"
RPT_RB_RC=$?
set -e
if [ "$RPT_RB_RC" -eq 0 ]; then
  # No report was finalised by the suite above (it rolls back), so a clean
  # rollback here is the expected path and nothing was destroyed.
  echo "    ok  the PR 6 rollback runs cleanly when no report has been finalised"
else
  if echo "$RPT_RB_REFUSAL" | grep -q "BCP_CONDUCT_REPORT_ROLLBACK"; then
    echo "    ok  the PR 6 rollback refuses by name rather than discarding a signed report"
  else
    echo "FAIL: the PR 6 rollback failed for an unexpected reason." >&2
    echo "$RPT_RB_REFUSAL" | grep -iE "ERROR:|FEL:" | head -5 >&2
    RPT_FAILED=1
  fi
fi

# Whatever happened above, PR 6's objects must be gone or intact -- never half
# of each. Re-applying proves the way back is real rather than asserted.
set +e
RPT_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261117090000_bcp_conduct_prompts_and_report.sql 2>&1)"
RPT_RE_RC=$?
set -e
if [ "$RPT_RE_RC" -ne 0 ]; then
  echo "FAIL: the BESKT PR 6 migration does not re-apply over the rolled-back state." >&2
  echo "$RPT_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  RPT_FAILED=1
else
  echo "    ok  and the PR 6 migration re-applies cleanly over it"
fi

# ---------------------------------------------------------------------------
# ...and then 20261127090000 goes back ON TOP, because PR 6's migration
# CREATE OR REPLACEs the two report readers to their ORIGINAL, UNGUARDED
# definitions. Re-applying PR 6 without re-applying the boundary fix leaves
# the replayed schema in a state the repository no longer describes: the
# independence check silently gone, the blocker reader answering anyone.
#
# Nothing after this point asserts the boundary today, so nothing is falsely
# green right now -- which is exactly why this is worth writing down before
# something is. It is the same trap PR #264 found in the Passport rollback
# loop, where a newer migration was stood down by an older rollback and never
# restored, and every later suite ran without it while CI stayed green.
# ---------------------------------------------------------------------------
set +e
RIB_RE2="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261127090000_bcp_conduct_report_independence_boundary.sql 2>&1)"
RIB_RE2_RC=$?
set -e
if [ "$RIB_RE2_RC" -ne 0 ]; then
  echo "FAIL: the report independence boundary does not re-apply over the re-applied PR 6." >&2
  echo "$RIB_RE2" | grep -iE "ERROR:|FEL:" | head -5 >&2
  RPT_FAILED=1
else
  RIB_BACK2="$(psql -tAq -d "$TEST_DB" -c \
    "SELECT (position('bcp_conduct_may_see_others' in prosrc) > 0) FROM pg_proc WHERE proname = 'bcp_conduct_preview_report';")"
  if [ "$RIB_BACK2" != "t" ]; then
    echo "FAIL: PR 6 was re-applied and the independence boundary did NOT come back with it." >&2
    RPT_FAILED=1
  else
    echo "    ok  and the independence boundary is re-applied on top, so the schema still matches the repository"
  fi
fi

if [ "$RPT_FAILED" -ne 0 ]; then
  suite_failed "BESKT prompts and report"
fi

# 20261203090000 comes down first: its policy uses 20261130090000's predicates.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261203090000_scp_interview_case_vetting_read_rollback.sql >/dev/null
# 20261202090000 comes down before them: it calls 20261201090000's functions.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261202090000_scp_interview_starts_rollback.sql >/dev/null
# 20270124090000 comes down first: its exposure record and triggers carry the
# bcp_conduct_ prefix, and PR 5A's rollback correctly proves that no conduct
# object survives it.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20270124090000_bcp_conduct_exposure_is_durable_rollback.sql >/dev/null

# 20261201090000, 20261130090000 and then 20261129090000 come down first: the activation table holds a foreign key
# into beskt_method_versions and its functions call beskt_method_validate, so
# the BESKT domain rollbacks below correctly refuse while it stands. It is not
# re-applied afterwards, exactly like PR 6 and the report boundary.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261201090000_scp_library_direct_access_rollback.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261130090000_bcp_beskt_complete_rollback.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261129090000_bcp_internal_test_activation_rollback.sql >/dev/null

# Stand PR 6 down so PR 5A can be unwound below: bcp_conduct_reports holds a
# foreign key into bcp_conduct_sessions.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261117090000_bcp_conduct_prompts_and_report_rollback.sql >/dev/null

set +e
CND_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261113090000_bcp_interview_conduct_rollback.sql 2>&1)"
CND_RB_RC=$?
set -e
if [ "$CND_RB_RC" -ne 0 ] || ! echo "$CND_RB" | grep -q "BESKT_INTERVIEW_CONDUCT_ROLLBACK ok"; then
  echo "FAIL: the BESKT interview-conduct rollback did not verify." >&2
  echo "$CND_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  CND_FAILED=1
else
  echo "    ok  the PR 5A rollback drops only the conduct layer and restores PR 4's vocabulary verbatim"
fi

set +e
CND_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261113090000_bcp_interview_conduct.sql 2>&1)"
CND_RE_RC=$?
set -e
if [ "$CND_RE_RC" -ne 0 ] || ! echo "$CND_RE" | grep -q "BESKT_INTERVIEW_CONDUCT_PROOF ok"; then
  echo "FAIL: the BESKT PR 5A migration does not re-apply over the rolled-back state." >&2
  echo "$CND_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CND_FAILED=1
else
  echo "    ok  and the PR 5A migration re-applies cleanly over it"
fi

if [ "$CND_FAILED" -ne 0 ]; then
  suite_failed "BESKT interview conduct"
fi

# Stand PR 5A down so PR 4 can be unwound below: bcp_conduct_sessions holds
# foreign keys into bcp_case_links, and PR 4's rollback correctly refuses to
# leave a dangling one.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261113090000_bcp_interview_conduct_rollback.sql >/dev/null

# ---------------------------------------------------------------------------
# The PR 4 rollback, for real, then the migration re-applied over it. The
# rollback restores two governed vocabularies verbatim -- the interview
# source kinds and the BESKT event names -- which the migration's own
# postflight then re-proves.
# ---------------------------------------------------------------------------
echo "==> Running BESKT PR 4 rollback and re-apply"
set +e
BRG_RB="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261112090000_bcp_interview_case_bridge_rollback.sql 2>&1)"
BRG_RB_RC=$?
set -e
if [ "$BRG_RB_RC" -ne 0 ] || ! echo "$BRG_RB" | grep -q "BESKT_INTERVIEW_CASE_BRIDGE_ROLLBACK ok"; then
  echo "FAIL: the BESKT interview-case bridge rollback did not verify." >&2
  echo "$BRG_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  BRG_FAILED=1
else
  echo "    ok  the PR 4 rollback drops only the bridge and restores both governed vocabularies verbatim"
fi

set +e
BRG_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261112090000_bcp_interview_case_bridge.sql 2>&1)"
BRG_RE_RC=$?
set -e
if [ "$BRG_RE_RC" -ne 0 ] || ! echo "$BRG_RE" | grep -q "BESKT_INTERVIEW_CASE_BRIDGE_PROOF ok"; then
  echo "FAIL: the BESKT PR 4 migration does not re-apply over the rolled-back state." >&2
  echo "$BRG_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BRG_FAILED=1
else
  echo "    ok  and the PR 4 migration re-applies cleanly over it"
fi

if [ "$BRG_FAILED" -ne 0 ]; then
  suite_failed "BESKT interview-case bridge"
fi

# Stand PR 4 down so PR 3 can be unwound below. Same reason as the PR 3/PR 2
# ordering further down: the foreign keys are real, and the rollback scripts
# correctly refuse to leave a dangling one.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261112090000_bcp_interview_case_bridge_rollback.sql >/dev/null

# ---------------------------------------------------------------------------
# The PR 3 rollback, for real, in one transaction -- then the migration
# re-applied over the rolled-back state. It restores PR #218's three read
# contracts verbatim, which the migration's own postflight then re-proves.
# ---------------------------------------------------------------------------
echo "==> Running BESKT PR 3 rollback and re-apply"
set +e
BCP_RB="$(psql -1 -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql 2>&1)"
BCP_RB_RC=$?
set -e
if [ "$BCP_RB_RC" -ne 0 ] || ! echo "$BCP_RB" | grep -q "BESKT_CANDIDATE_PREPARATION_ROLLBACK ok"; then
  echo "FAIL: the BESKT candidate-preparation rollback did not verify." >&2
  echo "$BCP_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  BCP_FAILED=1
else
  echo "    ok  the PR 3 rollback drops only its own domain and restores the PR #218 read contracts verbatim"
fi

set +e
BCP_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261110090000_bcp_candidate_preparation.sql 2>&1)"
BCP_RE_RC=$?
set -e
if [ "$BCP_RE_RC" -ne 0 ] || ! echo "$BCP_RE" | grep -q "BESKT_CANDIDATE_PREPARATION_PROOF ok"; then
  echo "FAIL: the BESKT PR 3 migration does not re-apply over the rolled-back state." >&2
  echo "$BCP_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BCP_FAILED=1
else
  echo "    ok  and the PR 3 migration re-applies cleanly over it"
fi

if [ "$BCP_FAILED" -ne 0 ]; then
  suite_failed "BESKT candidate preparation"
fi

# Stand PR 3 down again so PR 2 can be unwound below. This ordering is not a
# convention: bcp_assignments holds an ON DELETE RESTRICT foreign key into
# beskt_method_versions, so PR 2's own rollback REFUSES while PR 3 exists.
# The dependency itself is asserted in the PR 3 suite (C11), where it is a
# catalogue fact rather than a comment.
psql -1 -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql >/dev/null

# ---------------------------------------------------------------------------
echo "==> Running BESKT rollback planted-dependency refusal"
BGD_FAILED=0
BGD_PASSED=0
BGD_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'beskt\\_%') || '/' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'beskt\\_%') || '/' || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'scp_interview_packs' and column_name = 'pack_kind') || '/' || (select count(*) from public.scp_interview_packs where pack_kind = 'beskt_method');")"
for BGD_KIND in view function; do
  if [ "$BGD_KIND" = "view" ]; then
    psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "CREATE VIEW public.probe_beskt_dependency_view AS SELECT id, content_status FROM public.beskt_method_versions;"
    BGD_EXPECT="BESKT_ROLLBACK BLOCKED: catalogue objects outside the domain depend on it"
  else
    psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "CREATE FUNCTION public.probe_beskt_dependency_fn() RETURNS SETOF public.beskt_method_versions LANGUAGE sql AS 'SELECT * FROM public.beskt_method_versions';"
    BGD_EXPECT="BESKT_ROLLBACK BLOCKED: objects outside the domain depend on a BESKT row type"
  fi
  set +e
  BGD_OUT="$(psql -1 -v ON_ERROR_STOP=1 -d "$TEST_DB" \
    -f supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql 2>&1)"
  BGD_RC=$?
  set -e
  BGD_AFTER="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'beskt\\_%') || '/' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'beskt\\_%') || '/' || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'scp_interview_packs' and column_name = 'pack_kind') || '/' || (select count(*) from public.scp_interview_packs where pack_kind = 'beskt_method');")"
  if [ "$BGD_RC" -eq 0 ] || ! echo "$BGD_OUT" | grep -q "${BGD_EXPECT}"; then
    echo "FAIL: the rollback did not refuse the planted ${BGD_KIND} dependency." >&2
    echo "$BGD_OUT" | grep -iE "ERROR:|FEL:|NOTICE" | head -5 >&2
    BGD_FAILED=1
  else
    echo "    ok  the rollback refuses a planted outside ${BGD_KIND} dependency (BESKT_ROLLBACK BLOCKED)"
    BGD_PASSED=$(( BGD_PASSED + 1 ))
  fi
  case "$BGD_BEFORE" in 13/*/1/*) BGD_SHAPE_OK=1 ;; *) BGD_SHAPE_OK=0 ;; esac
  if [ "$BGD_AFTER" != "$BGD_BEFORE" ] || [ "$BGD_SHAPE_OK" -ne 1 ]; then
    echo "FAIL: the refused rollback changed the schema (before ${BGD_BEFORE}, after ${BGD_AFTER})." >&2
    BGD_FAILED=1
  else
    echo "    ok  and dropped nothing: tables/functions/pack_kind/identities unchanged (${BGD_AFTER})"
    BGD_PASSED=$(( BGD_PASSED + 1 ))
  fi
  if [ "$BGD_KIND" = "view" ]; then
    psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "DROP VIEW public.probe_beskt_dependency_view;"
  else
    psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "DROP FUNCTION public.probe_beskt_dependency_fn();"
  fi
done
if [ "$BGD_FAILED" -ne 0 ]; then
  BG_FAILED=1
fi

# Stand PR 7 down so the BESKT domain can be unwound below. Its nine doors are
# named beskt_*, and the domain rollback's own postflight refuses while ANY
# beskt_ function survives -- correctly: an authoring door onto a domain that
# no longer exists would be a function pointing at nothing.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261118090000_beskt_governed_content_authoring_rollback.sql >/dev/null

# Applied for real, in one transaction as the file requires, then the
# migration re-applied (-f, never -c "\i").
set +e
BG_RB="$(psql -1 -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql 2>&1)"
BG_RB_RC=$?
set -e
if [ "$BG_RB_RC" -ne 0 ] || ! echo "$BG_RB" | grep -q "BESKT_GOVERNED_CONTENT_ROLLBACK ok"; then
  echo "FAIL: the BESKT governed-content rollback did not verify." >&2
  echo "$BG_RB" | grep -iE "ERROR:|FEL:|EXCEPTION" | head -5 >&2
  BG_FAILED=1
else
  echo "    ok  the BESKT rollback drops the domain, removes pack_kind and restores the five role-interview functions"
fi

set +e
BG_RE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/migrations/20261108090000_beskt_governed_method_content.sql 2>&1)"
BG_RE_RC=$?
set -e
if [ "$BG_RE_RC" -ne 0 ] || ! echo "$BG_RE" | grep -q "BESKT_GOVERNED_CONTENT_PROOF ok"; then
  echo "FAIL: the BESKT migration does not re-apply over the rolled-back state." >&2
  echo "$BG_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  BG_FAILED=1
else
  echo "    ok  and the BESKT migration re-applies cleanly over the rolled-back state"
fi

# The BESKT PR 2 rollback restores scp_iv_create_case to its pre-BESKT body,
# and re-applying PR 2 restores the 20261108090000 body -- WITHOUT the
# candidate binding. 20261128090000 goes back on top, and the run fails if
# the binding is not in the body afterwards: the same false-green shape as the
# report readers above.
set +e
CBD_RE2="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261128090000_scp_iv_case_candidate_binding.sql 2>&1)"
CBD_RE2_RC=$?
set -e
CBD_BACK="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT position('SCP_IV_CANDIDATE_NOT_APPLICANT' in prosrc) > 0 FROM pg_proc WHERE proname = 'scp_iv_create_case';")"
if [ "$CBD_RE2_RC" -ne 0 ] || [ "$CBD_BACK" != "t" ]; then
  echo "FAIL: BESKT PR 2 was re-applied and the interview-case candidate binding did NOT come back with it." >&2
  echo "$CBD_RE2" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "Interview-case candidate binding (after the BESKT PR 2 re-apply)"
else
  echo "    ok  and the candidate binding is re-applied on top, so scp_iv_create_case still matches the repository"
fi

# The database ends the BESKT block in the release state: PR 2, then PR 3,
# then PR 4 -- the same order the frontier applies them in, and the reverse of
# the order they were stood down in above.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261110090000_bcp_candidate_preparation.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261112090000_bcp_interview_case_bridge.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261113090000_bcp_interview_conduct.sql >/dev/null
# PR 6 is deliberately NOT restored here: the documented rollback procedure
# that runs next (scp_a_rollback_test.sql) starts from PR 5A. What must hold
# is that no UNGUARDED report reader survives the block -- a later change that
# restores PR 6 here without 20261127090000 on top would end the run with both
# readers answering past the independence rule. Either they are absent, or
# they carry the boundary.
RIB_END="$(psql -tAq -d "$TEST_DB" -c \
  "SELECT coalesce(bool_and(CASE p.proname WHEN 'bcp_conduct_preview_report' THEN position('bcp_conduct_may_see_others' in p.prosrc) > 0 ELSE position('scp_iv_can_read_case' in p.prosrc) > 0 END), true) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('bcp_conduct_preview_report', 'bcp_conduct_report_blockers');")"
if [ "$RIB_END" != "t" ]; then
  echo "FAIL: the BESKT block ended with a report reader that does not carry the independence boundary." >&2
  suite_failed "BESKT report independence boundary (end state)"
else
  echo "    ok  the BESKT block ends with no unguarded report reader"
fi

# The race fixtures: the rollback above dropped their versions with the
# domain and deleted their identities; the planted principals go too.
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" <<SQL
DELETE FROM public.scp_content_roles WHERE user_id = '${BGR_EDITOR}';
DELETE FROM auth.users WHERE id = '${BGR_EDITOR}';
DELETE FROM public.employer_memberships WHERE employer_id IN ('b2000000-0000-4000-8000-00000000ee01', 'b2000000-0000-4000-8000-00000000ee02');
DELETE FROM public.employers WHERE id IN ('b2000000-0000-4000-8000-00000000ee01', 'b2000000-0000-4000-8000-00000000ee02');
DELETE FROM public.scp_content_roles WHERE user_id::text LIKE 'b2000000-0000-4000-8000-0000000000%';
DELETE FROM public.user_roles WHERE user_id::text LIKE 'b2000000-0000-4000-8000-0000000000%';
DELETE FROM auth.users WHERE id::text LIKE 'b2000000-0000-4000-8000-0000000000%';
SQL

if [ "$BG_FAILED" -ne 0 ]; then
  suite_failed "BESKT governed content"
fi


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
  if [ "$ROLLBACK_PASSED" -lt 28 ]; then
    echo "FAIL: expected at least 28 rollback assertions, only ${ROLLBACK_PASSED} ran." >&2
    suite_failed "rollback verification (assertion shortfall: floor 28)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running application note read assertions (JB-02 EXPAND)"
set +e
JB02_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/application_notes_employer_only_test.sql 2>&1)"
JB02_RC=$?
set -e
echo "$JB02_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
JB02_PASSED="$(echo "$JB02_OUT" | grep -c "ok  " || true)"
if [ "$JB02_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the application note privacy suite exited with code ${JB02_RC}." >&2
  echo "$JB02_OUT" | grep -E "ERROR|FAILED" >&2 || true
  exit 1
fi
[ "$JB02_PASSED" -ge 22 ] || { echo "$JB02_OUT"; echo "FAIL: application note privacy assertion shortfall: $JB02_PASSED (floor 22)" >&2; exit 1; }
echo "    ok  $JB02_PASSED application note privacy assertions passed"
echo "==> Running candidate application context assertions (JB-01)"
set +e
JB01_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/candidate_application_context_test.sql 2>&1)"
JB01_RC=$?
set -e
echo "$JB01_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
JB01_PASSED="$(echo "$JB01_OUT" | grep -c "ok  " || true)"
if [ "$JB01_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the candidate application context suite exited with code ${JB01_RC}." >&2
  echo "$JB01_OUT" | grep -E "ERROR|FAILED" >&2 || true
  exit 1
fi
[ "$JB01_PASSED" -ge 14 ] || { echo "$JB01_OUT"; echo "FAIL: candidate application context assertion shortfall: $JB01_PASSED (floor 14)" >&2; exit 1; }
echo "    ok  $JB01_PASSED candidate application context assertions passed"

# ---------------------------------------------------------------------------
echo "==> Running application note column privilege assertions (JB-02 CONTRACT)"
set +e
JB02C_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/application_notes_column_privileges_test.sql 2>&1)"
JB02C_RC=$?
set -e
echo "$JB02C_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
JB02C_PASSED="$(echo "$JB02C_OUT" | grep -c "ok  " || true)"
if [ "$JB02C_RC" -ne 0 ]; then
  echo ""; echo "FAIL: the application note column privileges suite exited with code ${JB02C_RC}." >&2
  echo "$JB02C_OUT" | grep -E "ERROR|FAILED" >&2 || true
  exit 1
fi
[ "$JB02C_PASSED" -ge 18 ] || { echo "$JB02C_OUT"; echo "FAIL: application note column privileges assertion shortfall: $JB02C_PASSED (floor 18)" >&2; exit 1; }
echo "    ok  $JB02C_PASSED application note column privilege assertions passed"
# The CONTRACT refuses to apply without the EXPAND: drop the reads, expect the precondition.
psql_q -d "$TEST_DB" -f supabase/rollback/20261226090000_application_notes_column_privileges_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261223090000_application_notes_employer_only_rollback.sql >/dev/null
set +e
JB02C_PRE="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/migrations/20261226090000_application_notes_column_privileges.sql 2>&1)"
JB02C_PRE_RC=$?
set -e
if [ "$JB02C_PRE_RC" -eq 0 ] || ! echo "$JB02C_PRE" | grep -q "JB02_CONTRACT_PRECONDITION"; then
  echo "FAIL: 20261226090000 applied without 20261223090000 (expected JB02_CONTRACT_PRECONDITION)" >&2; exit 1
fi
echo "    ok  the CONTRACT refuses to apply without the EXPAND (JB02_CONTRACT_PRECONDITION)"
psql_q -d "$TEST_DB" -f supabase/migrations/20261223090000_application_notes_employer_only.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/migrations/20261226090000_application_notes_column_privileges.sql >/dev/null
echo "    ok  both halves re-applied in order"

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
echo "==> Verifying employer self-publication and bilingual requirements"
set +e
SPUB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/jobs_self_publish_test.sql 2>&1)"
SPUB_RC=$?
set -e

SPUB_PASSED="$(echo "$SPUB_OUT" | grep -c "ok  " || true)"

if [ "$SPUB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer self-publication suite exited with code ${SPUB_RC}." >&2
  echo "$SPUB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "employer self-publication"
else
  echo "    ok  ${SPUB_PASSED} self-publication assertions passed"
  if [ "$SPUB_PASSED" -lt 47 ]; then
    echo "FAIL: expected at least 47 self-publication assertions, only ${SPUB_PASSED} ran." >&2
    suite_failed "employer self-publication (assertion shortfall: floor 47)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport application-disclosure assertions"
set +e
SPAP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_application_passport_test.sql 2>&1)"
SPAP_RC=$?
set -e

echo "$SPAP_OUT" | grep -E "sp_application_passport_test:" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPAP_PASSED="$(echo "$SPAP_OUT" | sed -n 's/.*sp_application_passport_test: \([0-9]*\) assertions.*/\1/p' | head -1)"
SPAP_SURF="$(echo "$SPAP_OUT" | sed -n 's/.*sp_application_passport_test: \([0-9]*\) surface.*/\1/p' | head -1)"
SPAP_PASSED=$(( ${SPAP_PASSED:-0} + ${SPAP_SURF:-0} ))

if [ "$SPAP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport application-disclosure suite exited with code ${SPAP_RC}." >&2
  echo "$SPAP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport application disclosure"
else
  echo "    ok  ${SPAP_PASSED} application-disclosure assertions passed"
  # A short run means the leak and authorisation cases did not execute, which
  # is the whole reason an employer may read a candidate's Passport at all.
  if [ "$SPAP_PASSED" -lt 34 ]; then
    echo "FAIL: expected at least 34 application-disclosure assertions, only ${SPAP_PASSED} ran." >&2
    suite_failed "Security Passport application disclosure (assertion shortfall: floor 34)"
  fi
fi

# ---------------------------------------------------------------------------
# This is a schema-state contract: a failed rollback or restoration stops CI.
# The canonical test rolls back its own transaction, leaving F09 installed.
echo "==> Verifying Security Passport application guard rollback and restoration"
psql_q -d "$TEST_DB" -f supabase/tests/sp_application_passport_guard_rollback_test.sql

# ---------------------------------------------------------------------------
echo "==> Running Security Passport skill/language taxonomy assertions"
set +e
SPSK_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/sp_skill_taxonomy_test.sql 2>&1)"
SPSK_RC=$?
set -e

echo "$SPSK_OUT" | grep -E "sp_skill_taxonomy_test:" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
# The suite reports one aggregate count rather than per-line "ok"; read it back
# so a suite that silently stops iterating the taxonomy cannot pass quietly.
SPSK_PASSED="$(echo "$SPSK_OUT" | sed -n 's/.*sp_skill_taxonomy_test: \([0-9]*\) assertions.*/\1/p' | head -1)"
SPSK_PASSED="${SPSK_PASSED:-0}"

if [ "$SPSK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport skill taxonomy suite exited with code ${SPSK_RC}." >&2
  echo "$SPSK_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport skill/language taxonomy"
else
  echo "    ok  ${SPSK_PASSED} skill/language taxonomy assertions passed"
  # The floor is the taxonomy's own size: 19 languages and 5 practical skills,
  # each saved, read back and trust-checked, plus every value on every scale.
  # A short run means the loop stopped covering the vocabulary, which is the
  # exact blindness that let the allowed_levels defect ship.
  if [ "$SPSK_PASSED" -lt 250 ]; then
    echo "FAIL: expected at least 250 skill taxonomy assertions, only ${SPSK_PASSED} ran." >&2
    suite_failed "Security Passport skill/language taxonomy (assertion shortfall: floor 250)"
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
echo "==> Running Security Passport three-market foundation assertions"
set +e
SP3M_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_three_market_foundation_test.sql 2>&1)"
SP3M_RC=$?
set -e

echo "$SP3M_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SP3M_PASSED="$(echo "$SP3M_OUT" | grep -c "ok  " || true)"

if [ "$SP3M_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport three-market foundation suite exited with code ${SP3M_RC}." >&2
  echo "$SP3M_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport three-market foundation"
else
  echo "    ok  ${SP3M_PASSED} three-market foundation assertions passed"
  # Every market rule is asserted by mutation and paired with a positive
  # control, so a short run means the suite stopped attempting the things the
  # schema is supposed to refuse -- which reads identically to success.
  if [ "$SP3M_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 three-market assertions, only ${SP3M_PASSED} ran." >&2
    suite_failed "Security Passport three-market foundation (assertion shortfall: floor 30)"
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
  # Raised from 40 when GROUP 10 was added: the guard that refuses a rejection
  # or a clarification request carrying no candidate-facing reason. Thirteen
  # assertions, including the crafted direct-RPC calls that bypass every layer
  # above the database.
  #
  # The floor is 60 against 67 actual, and deliberately above the 54 this suite
  # ran before GROUP 10 existed. A floor of 53 would have left the whole new
  # group deletable without the shortfall detector noticing, which is the one
  # thing a floor is for.
  if [ "$SP10_PASSED" -lt 60 ]; then
    echo "FAIL: expected at least 60 Phase 10 assertions, only ${SP10_PASSED} ran." >&2
    suite_failed "Security Passport Phase 10 (assertion shortfall: floor 60)"
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
echo "==> Running Security Passport Swedish truth model assertions"
set +e
SPSE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_sweden_truth_model_test.sql 2>&1)"
SPSE_RC=$?
set -e

echo "$SPSE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPSE_PASSED="$(echo "$SPSE_OUT" | grep -c "ok  " || true)"

if [ "$SPSE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Swedish truth model suite exited with code ${SPSE_RC}." >&2
  echo "$SPSE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Swedish truth model"
else
  echo "    ok  ${SPSE_PASSED} Swedish truth model assertions passed"
  # The narrow-result and scope rules are asserted by attempting the forbidden
  # write. A short run means those attempts did not happen, which reads exactly
  # like a schema that forbids nothing.
  if [ "$SPSE_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 Swedish truth model assertions, only ${SPSE_PASSED} ran." >&2
    suite_failed "Security Passport Swedish truth model (assertion shortfall: floor 18)"
  fi
fi

# ---------------------------------------------------------------------------
# 6b. The three-market rollback actually reverses the three-market migration
# ---------------------------------------------------------------------------
# Runs LAST, after every Passport suite, because it is destructive: it drops
# the eight foundation tables and the columns they added. A rollback file that
# has never been executed is a hope, not a procedure -- and the one property
# that matters is asserted inside it, namely that Sweden survives.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport UK (SIA) market pack assertions"
set +e
SPUK_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_uk_market_pack_test.sql 2>&1)"
SPUK_RC=$?
set -e

echo "$SPUK_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPUK_PASSED="$(echo "$SPUK_OUT" | grep -c "ok  " || true)"

if [ "$SPUK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the UK market pack suite exited with code ${SPUK_RC}." >&2
  echo "$SPUK_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport UK market pack"
else
  echo "    ok  ${SPUK_PASSED} UK market pack assertions passed"
  # The suite switches the pack ON to test it and OFF again at the end. A short
  # run means it may have stopped in between -- leaving an unreviewed market
  # live in the replayed database, which is the one outcome the pack exists to
  # make impossible.
  if [ "$SPUK_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 UK market pack assertions, only ${SPUK_PASSED} ran." >&2
    suite_failed "Security Passport UK market pack (assertion shortfall: floor 18)"
  fi
fi

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# The UK title-rule contract. Migration 3 was rewritten by Lovable on its way
# to the hosted project, dropping six local_eligibility rules; the correction
# 20260907092500 restores the canonical 19. This suite asserts the shape of
# that contract and proves, by installing the generated set, that it actually
# fails against the defect.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport UK title rule contract assertions"
set +e
SPUKT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/security_passport_uk_title_rules_test.sql 2>&1)"
SPUKT_RC=$?
set -e

echo "$SPUKT_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPUKT_PASSED="$(echo "$SPUKT_OUT" | grep -c "ok  " || true)"

if [ "$SPUKT_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the UK title rule contract suite exited with code ${SPUKT_RC}." >&2
  echo "$SPUKT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport UK title rule contract"
elif [ "$SPUKT_PASSED" -lt 15 ]; then
  echo "FAIL: expected at least 15 UK title rule assertions, only ${SPUKT_PASSED} ran." >&2
  suite_failed "Security Passport UK title rule contract (assertion shortfall: floor 15)"
fi

echo "==> Running Security Passport disclosure holder jurisdiction assertions"
set +e
SPDHJ_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_disclosure_holder_jurisdiction_test.sql 2>&1)"
SPDHJ_RC=$?
set -e

echo "$SPDHJ_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPDHJ_PASSED="$(echo "$SPDHJ_OUT" | grep -c "ok  " || true)"

if [ "$SPDHJ_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the disclosure holder jurisdiction suite exited with code ${SPDHJ_RC}." >&2
  echo "$SPDHJ_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport disclosure holder jurisdiction"
else
  echo "    ok  ${SPDHJ_PASSED} disclosure holder jurisdiction assertions passed"
  if [ "$SPDHJ_PASSED" -lt 11 ]; then
    echo "FAIL: expected at least 11 disclosure holder jurisdiction assertions, only ${SPDHJ_PASSED} ran." >&2
    suite_failed "Security Passport disclosure holder jurisdiction (assertion shortfall: floor 11)"
  fi
fi

echo "==> Running Security Passport pilot bug fix #1 assertions"
set +e
SPBF1_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_pilot_bugfix_1_test.sql 2>&1)"
SPBF1_RC=$?
set -e

echo "$SPBF1_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPBF1_PASSED="$(echo "$SPBF1_OUT" | grep -c "ok  " || true)"

if [ "$SPBF1_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the pilot bug fix #1 suite exited with code ${SPBF1_RC}." >&2
  echo "$SPBF1_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport pilot bug fix #1"
else
  echo "    ok  ${SPBF1_PASSED} pilot bug fix #1 assertions passed"
  # One floor per defect plus the two "what this did not do" groups. A suite
  # that silently stops running half its cases is a suite that stopped
  # defending four real, reported failures.
  if [ "$SPBF1_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 pilot bug fix #1 assertions, only ${SPBF1_PASSED} ran." >&2
    suite_failed "Security Passport pilot bug fix #1 (assertion shortfall: floor 45)"
  fi
fi

echo "==> Running Security Passport work country assertions"
set +e
SPWC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_profile_work_country_test.sql 2>&1)"
SPWC_RC=$?
set -e

echo "$SPWC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPWC_PASSED="$(echo "$SPWC_OUT" | grep -c "ok  " || true)"

if [ "$SPWC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the work country suite exited with code ${SPWC_RC}." >&2
  echo "$SPWC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport work country"
else
  echo "    ok  ${SPWC_PASSED} work country assertions passed"
  if [ "$SPWC_PASSED" -lt 15 ]; then
    echo "FAIL: expected at least 15 work country assertions, only ${SPWC_PASSED} ran." >&2
    suite_failed "Security Passport work country (assertion shortfall: floor 15)"
  fi
fi

echo "==> Running Security Passport internal-pilot entitlement assertions"
set +e
SPPILOT_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_market_pilot_test.sql 2>&1)"
SPPILOT_RC=$?
set -e

echo "$SPPILOT_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPPILOT_PASSED="$(echo "$SPPILOT_OUT" | grep -c "ok  " || true)"

if [ "$SPPILOT_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the internal-pilot entitlement suite exited with code ${SPPILOT_RC}." >&2
  echo "$SPPILOT_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport internal-pilot entitlement"
else
  echo "    ok  ${SPPILOT_PASSED} internal-pilot entitlement assertions passed"
  # The cross-jurisdiction group is the reason this suite exists. A short run
  # that stopped before GROUP 6 would report success having proved nothing
  # about whether pilot access is a bypass.
  if [ "$SPPILOT_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 pilot entitlement assertions, only ${SPPILOT_PASSED} ran." >&2
    suite_failed "Security Passport internal-pilot entitlement (assertion shortfall: floor 30)"
  fi
fi

echo "==> Running Security Passport pilot catalogue visibility assertions"
# 20261109090000. The taxonomy's SELECT policy was USING (is_active) while
# every pilot credential type is inactive, so an entitled member received
# open_pilot and read ZERO catalogue rows (and the SECURITY INVOKER claim
# trigger refused their claim with SP_CREDENTIAL_CODE_UNKNOWN). This suite
# reads and claims as SET LOCAL ROLE authenticated -- what PostgREST does --
# which the older pilot suite, running as the owner, never exercised.
set +e
SPCV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_pilot_catalogue_visibility_test.sql 2>&1)"
SPCV_RC=$?
set -e

echo "$SPCV_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPCV_PASSED="$(echo "$SPCV_OUT" | grep -c "ok  " || true)"

if [ "$SPCV_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the pilot catalogue visibility suite exited with code ${SPCV_RC}." >&2
  echo "$SPCV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport pilot catalogue visibility"
else
  echo "    ok  ${SPCV_PASSED} pilot catalogue visibility assertions passed"
  # GROUP 3 (the entitled member reads 13 rows and files a claim as
  # authenticated), GROUP 6 (revocation closes the read again), GROUP 8 (a
  # holder cannot read the entitlement table) and GROUP 9 (holder A cannot
  # inspect holder B's membership) are the reason the suite exists. A run
  # that stopped before them proved nothing.
  if [ "$SPCV_PASSED" -lt 50 ]; then
    echo "FAIL: expected at least 50 pilot catalogue visibility assertions, only ${SPCV_PASSED} ran." >&2
    suite_failed "Security Passport pilot catalogue visibility (assertion shortfall: floor 50)"
  fi
fi

# The rollback must REINSTATE the defect, verifiably, and the forward file
# must re-apply on top of it: rollback -> policy is USING (is_active) again
# and the suite's read assertion fails -> re-apply -> the suite passes again.
echo "==> Running Security Passport pilot write-path assertions"
# The hotfix after 20261109090000 made the catalogues visible. This suite is
# the other half: a visible catalogue nobody can SAVE into is the same outage
# with a friendlier screen. Every INSERT is built the way the application's
# own `credentialClaimFields` builds it -- market from the definition -- and
# the shapes the old write path produced (a British licence filed in Sweden,
# a Dubai card with no emirate) are asserted to be refused in the same run.
set +e
SPWP_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_pilot_write_path_test.sql 2>&1)"
SPWP_RC=$?
set -e

echo "$SPWP_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPWP_PASSED="$(echo "$SPWP_OUT" | grep -c "ok  " || true)"

if [ "$SPWP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the pilot write-path suite exited with code ${SPWP_RC}." >&2
  echo "$SPWP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport pilot write path"
else
  echo "    ok  ${SPWP_PASSED} pilot write-path assertions passed"
  # GROUP 1 (the old rows are refused) and GROUP 2 (every GB and Dubai
  # credential saves) are the reason this suite exists. A short run that
  # stopped before them would report success having proved nothing.
  if [ "$SPWP_PASSED" -lt 25 ]; then
    echo "FAIL: expected at least 25 pilot write-path assertions, only ${SPWP_PASSED} ran." >&2
    suite_failed "Security Passport pilot write path (assertion shortfall: floor 25)"
  fi
fi

echo "==> Verifying the pilot catalogue visibility rollback round-trips"
set +e
SPCVRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261109090000_sp_pilot_catalogue_visibility_rollback.sql 2>&1)"
SPCVRB_RC=$?
set -e
SPCVRB_QUAL="$(psql -tAq -d "$TEST_DB" -c "SELECT qual FROM pg_policies WHERE tablename = 'sp_credential_types' AND policyname = 'sp_credential_types_read'")"
if [ "$SPCVRB_RC" -ne 0 ] || [ "$SPCVRB_QUAL" != "is_active" ]; then
  echo "FAIL: the pilot catalogue visibility rollback did not restore USING (is_active) (rc ${SPCVRB_RC}, qual '${SPCVRB_QUAL}')." >&2
  echo "$SPCVRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "pilot catalogue visibility rollback"
else
  echo "    ok  the rollback restores the 20260817160000 policy verbatim"
fi
set +e
SPCVRB_NEG="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_pilot_catalogue_visibility_test.sql 2>&1)"
SPCVRB_NEG_RC=$?
set -e
if [ "$SPCVRB_NEG_RC" -eq 0 ]; then
  echo "FAIL: the visibility suite passed against the rolled-back policy; it detects nothing." >&2
  suite_failed "pilot catalogue visibility rollback (suite blind to the defect)"
else
  echo "    ok  and the suite refuses the rolled-back policy (the defect is detectable)"
fi
set +e
SPCVRA_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261109090000_sp_pilot_catalogue_visibility.sql 2>&1)"
SPCVRA_RC=$?
set -e
if [ "$SPCVRA_RC" -ne 0 ] || ! echo "$SPCVRA_OUT" | grep -q "SP_PILOT_CATALOGUE_VISIBILITY_PROOF ok"; then
  echo "FAIL: 20261109090000 did not re-apply after its rollback." >&2
  echo "$SPCVRA_OUT" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "pilot catalogue visibility re-apply"
else
  echo "    ok  the forward migration re-applies on top of its rollback"
fi

echo "==> Running Security Passport global professional certification assertions"
# 20261111090000. The governed international-certification foundation: an
# explicit `global_professional` scope, a separate issuer registry, the exact
# 14 reviewed definitions, a lifecycle model that is not `valid_until`, and the
# rule that keeps a portable certification portable
# (SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION).
#
# Every claim is filed as SET LOCAL ROLE authenticated with a JWT subject --
# what PostgREST does -- so the isolation and catalogue-write groups mean
# something. The forged shapes a browser could send are filed too and asserted
# to be refused, because a suite that only proves the fix works cannot tell you
# the defect was real.
set +e
SPGC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_global_certification_test.sql 2>&1)"
SPGC_RC=$?
set -e

echo "$SPGC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPGC_PASSED="$(echo "$SPGC_OUT" | grep -c "ok  " || true)"

if [ "$SPGC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the global certification suite exited with code ${SPGC_RC}." >&2
  echo "$SPGC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport global professional certification"
else
  echo "    ok  ${SPGC_PASSED} global certification assertions passed"
  # GROUP 6 (a forged client cannot give a CPP a country), GROUP 8b (a holder
  # cannot forge WHO established their standing), GROUP 8c (nor ERASE one
  # somebody else established), GROUP 12 (the private reference reaches no
  # disclosure), GROUP 13 (free text is never upgraded) and GROUP 14 (PR #222's
  # SE/GB/AE-DU behaviour is unchanged) are the reason this suite exists. A short run that stopped before them would report
  # success having proved nothing.
  #
  # RAISED 100 -> 130 when GROUP 8b was added, 130 -> 150 when GROUP 8c was.
  # The floor is not decoration: both trust-boundary defects those groups exist
  # for passed a full green CI, and the cheapest way to make a security suite
  # green is to delete the assertion that is failing.
  # passport-global-certification:check names the 8b and 8c assertions
  # individually as well, so both a deletion and a short run are caught.
  if [ "$SPGC_PASSED" -lt 150 ]; then
    echo "FAIL: expected at least 150 global certification assertions, only ${SPGC_PASSED} ran." >&2
    suite_failed "Security Passport global certification (assertion shortfall: floor 100)"
  fi
fi

# ---------------------------------------------------------------------------
# The governed issuer (20261114090000).
#
# This suite exists because of a defect that was REPRODUCED, not imagined: as
# an ordinary holder -- SET ROLE authenticated with their own auth.uid() --
# INTL_ASIS_CPP could be stored with claimed_issuer_name = 'Fake Corporation',
# and the issuer could be changed to anything afterwards by an UPDATE touching
# only that column. sp_disclosure_payload emits it to a RECIPIENT.
#
# Every write below runs as that same principal. A suite proving the rule only
# under a superuser would prove nothing about the caller who can actually
# reach these rows.
# ---------------------------------------------------------------------------
echo "==> Running the Security Passport governed-issuer suite"
set +e
SPGI_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_governed_issuer_test.sql 2>&1)"
SPGI_RC=$?
set -e

echo "$SPGI_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPGI_PASSED="$(echo "$SPGI_OUT" | grep -c "ok  " || true)"

if [ "$SPGI_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the governed-issuer suite exited with code ${SPGI_RC}." >&2
  echo "$SPGI_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport governed issuer"
else
  echo "    ok  ${SPGI_PASSED} governed-issuer assertions passed"
  # The floor is not decoration. The cheapest way to make a security suite
  # green is to delete the assertion that is failing, and GROUP 1.2 (a forged
  # issuer on a DRAFT) is the one that caught a rule placed one block too low.
  if [ "$SPGI_PASSED" -lt 26 ]; then
    echo "FAIL: expected at least 26 governed-issuer assertions, only ${SPGI_PASSED} ran." >&2
    suite_failed "Security Passport governed issuer (assertion shortfall: floor 26)"
  fi
fi

echo "==> Verifying the global certification rollback preserves every holder row"
# This proof starts before catalogue adoption in a separate local database.
# The main suite database keeps all earlier holder records and the final schema.
PASSPORT_MAIN_TEST_DB="$TEST_DB"
TEST_DB="${PASSPORT_MAIN_TEST_DB}_global_rollback"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB} TEMPLATE ${PASSPORT_MAIN_TEST_DB}_pristine;" >/dev/null
psql_q -d postgres -c "DROP DATABASE ${PASSPORT_MAIN_TEST_DB}_pristine;" >/dev/null
# Newest Passport unit first. 20261221090000 (the UK and Dubai opened as a
# public pilot) puts the fixture's markets back in internal pilot, where the
# grants the fixture plants below are still a thing an administrator can
# give; 20261220090000 (public-pilot availability) then restores the view, the
# claim rules and the review queue it replaced. Then 20261214090000 (India
# national qualifications): it replaced the view, the claim rules, the details
# guard, the save RPC and the reviewer detail, and its metadata rows would read
# as adoption to 20261118100000's rollback. Then 20261204090000 (HAYAT
# assessments), whose triggers sit on sp_claims and sp_evidence. This database
# is discarded at the end of the block, so none is reapplied here.
# The certification research integration (20270212090000, 20270213090000,
# 20270214090000) is newer than all of these and stands down first, in its own
# reverse order: publication, import, foundation.
psql_q -d "$TEST_DB" -f supabase/rollback/20270214090000_sp_catalogue_research_publish_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20270213090000_sp_catalogue_research_import_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20270212090000_sp_catalogue_research_foundation_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261214090000_sp_india_national_qualifications_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261204090000_sp_hayat_assessments_rollback.sql >/dev/null
# 20261126090000 first: its catalogue view reads sp_credential_organisation_roles.
for passport_migration in 20261126090000_sp_catalogue_scope_and_document_issuer 20261123090000_sp_credential_organisation_roles 20261121090000_sp_closed_credential_catalogue 20261120090000_sp_credential_selective_sharing_v2 20261119090000_sp_international_credential_wallet 20261118100000_sp_international_passport_foundation; do
  psql_q -d "$TEST_DB" -f "supabase/rollback/${passport_migration}_rollback.sql" >/dev/null
done
# The rollback contract is not "the objects disappear". It is "the objects
# disappear AND every row a holder ever wrote is byte-for-byte what it was",
# and after real adoption "the rollback REFUSES rather than deleting one".
# All three are exercised here against a representative pre-migration fixture:
# free-text rows named after real certifications, a Swedish credential, a
# British licence and a Dubai cadre card.
set +e
SPGCF_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_global_certification_rollback_fixture.sql 2>&1)"
SPGCF_RC=$?
set -e
if [ "$SPGCF_RC" -ne 0 ]; then
  echo "FAIL: the rollback fixture could not be planted (rc ${SPGCF_RC})." >&2
  echo "$SPGCF_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "global certification rollback fixture"
else
  echo "    ok  a representative pre-rollback database is planted"
fi

set +e
SPGCRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261111090000_sp_global_professional_certifications_rollback.sql 2>&1)"
SPGCRB_RC=$?
set -e
if [ "$SPGCRB_RC" -ne 0 ]; then
  echo "FAIL: the global certification rollback did not apply (rc ${SPGCRB_RC})." >&2
  echo "$SPGCRB_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "global certification rollback"
else
  echo "    ok  the rollback applies"
fi

set +e
SPGCRA_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" \
  -f supabase/tests/security_passport_global_certification_rollback_assert.sql 2>&1)"
SPGCRA_RC=$?
set -e
SPGCRA_PASSED="$(echo "$SPGCRA_OUT" | grep -c "ok  " || true)"
if [ "$SPGCRA_RC" -ne 0 ] || [ "$SPGCRA_PASSED" -lt 15 ]; then
  echo "FAIL: the rollback did not preserve the fixture (rc ${SPGCRA_RC}, ${SPGCRA_PASSED} assertions)." >&2
  echo "$SPGCRA_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "global certification rollback data safety"
else
  echo "    ok  ${SPGCRA_PASSED} rollback data-safety assertions passed"
fi

# The suite must FAIL against the rolled-back schema. A suite that passes
# either way detects nothing, which is the failure mode a rollback test is
# most likely to have.
set +e
SPGCRN_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_global_certification_test.sql 2>&1)"
SPGCRN_RC=$?
set -e
if [ "$SPGCRN_RC" -eq 0 ]; then
  echo "FAIL: the global certification suite passed against the rolled-back schema; it detects nothing." >&2
  suite_failed "global certification rollback (suite blind to the removal)"
else
  echo "    ok  and the suite refuses the rolled-back schema (the removal is detectable)"
fi

set +e
SPGCRF_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261111090000_sp_global_professional_certifications.sql 2>&1)"
SPGCRF_RC=$?
set -e
if [ "$SPGCRF_RC" -ne 0 ] || ! echo "$SPGCRF_OUT" | grep -q "SP_GLOBAL_CERTIFICATION_PROOF ok"; then
  echo "FAIL: 20261111090000 did not re-apply after its rollback." >&2
  echo "$SPGCRF_OUT" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "global certification re-apply"
else
  echo "    ok  the forward migration re-applies on top of its rollback, with holder data present"
fi

# And the documented limitation: once a holder records an international
# certification, the rollback REFUSES rather than deleting it.
set +e
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_global_certification_rollback_refusal_fixture.sql >/dev/null 2>&1
SPGCX_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261111090000_sp_global_professional_certifications_rollback.sql 2>&1)"
SPGCX_RC=$?
set -e
SPGCX_LEFT="$(psql -tAq -d "$TEST_DB" -c "SELECT count(*) FROM public.sp_credential_types WHERE code LIKE 'INTL\_%'")"
if [ "$SPGCX_RC" -eq 0 ] || ! echo "$SPGCX_OUT" | grep -q "SP_GLOBAL_CERT_ROLLBACK_REFUSED" \
   || [ "$SPGCX_LEFT" != "14" ]; then
  echo "FAIL: the rollback did not refuse once a holder's certification referenced it (rc ${SPGCX_RC}, ${SPGCX_LEFT} definitions left)." >&2
  suite_failed "global certification rollback refusal"
else
  echo "    ok  and it REFUSES once a holder's certification references it, removing nothing"
fi

psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_global_certification_rollback_cleanup.sql >/dev/null

# Restore the latest issuer guard and all dependent Passport units, then prove
# the closed contract again before discarding this isolated rollback database.
psql_q -d "$TEST_DB" -f supabase/migrations/20261114090000_sp_global_certification_governed_issuer.sql >/dev/null
for passport_migration in 20261118100000_sp_international_passport_foundation 20261119090000_sp_international_credential_wallet 20261120090000_sp_credential_selective_sharing_v2 20261121090000_sp_closed_credential_catalogue 20261123090000_sp_credential_organisation_roles; do
  psql_q -d "$TEST_DB" -f "supabase/migrations/${passport_migration}.sql" >/dev/null
done
psql_q -d "$TEST_DB" -f supabase/tests/security_passport_closed_catalogue_test.sql >/dev/null
psql_q -d postgres -c "DROP DATABASE ${TEST_DB};" >/dev/null
TEST_DB="$PASSPORT_MAIN_TEST_DB"

echo "==> Running Security Passport Dubai (SIRA) market pack assertions"
set +e
SPAE_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_uae_dubai_market_pack_test.sql 2>&1)"
SPAE_RC=$?
set -e

echo "$SPAE_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPAE_PASSED="$(echo "$SPAE_OUT" | grep -c "ok  " || true)"

if [ "$SPAE_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Dubai market pack suite exited with code ${SPAE_RC}." >&2
  echo "$SPAE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport Dubai market pack"
else
  echo "    ok  ${SPAE_PASSED} Dubai market pack assertions passed"
  # The suite opens the pack to test it and closes it again. A short run may
  # have stopped in between, leaving an unreviewed market live -- which the
  # independent check below would then catch, but late and confusingly.
  if [ "$SPAE_PASSED" -lt 18 ]; then
    echo "FAIL: expected at least 18 Dubai market pack assertions, only ${SPAE_PASSED} ran." >&2
    suite_failed "Security Passport Dubai market pack (assertion shortfall: floor 18)"
  fi
fi

# ---------------------------------------------------------------------------
# Security hardening — the five Lovable/Supabase advisor findings.
#
# NOTE ON PLACEMENT: this suite runs BEFORE the rollback chain, deliberately.
# It asks whole-schema questions ("no repository-owned function in public has a
# mutable search_path", "no trigger function is executable by anon"), and the
# rollback chain drops most of the schema those questions are about. Run after
# it, the suite would keep passing while proving progressively less — the worst
# possible failure mode for a security guard.
#
# It also runs against the FULLY migrated database on purpose: the grant
# assertions are only answerable because 20260817190000, 20260817210000 and
# 20260916090000 reproduce Supabase's ALTER DEFAULT PRIVILEGES locally.
# ---------------------------------------------------------------------------
echo "==> Running security hardening assertions"
set +e
SECH_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_hardening_test.sql 2>&1)"
SECH_RC=$?
set -e

echo "$SECH_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SECH_PASSED="$(echo "$SECH_OUT" | grep -c "ok  " || true)"

if [ "$SECH_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the security hardening suite exited with code ${SECH_RC}." >&2
  echo "$SECH_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "security hardening"
else
  echo "    ok  ${SECH_PASSED} security hardening assertions passed"

  # GROUP S6 is the reason this suite is a guard rather than a snapshot: it
  # reintroduces each violation and proves the property-based query catches it.
  # A run that stopped before S6 proves only that today is clean.
  for REQUIRED in \
    "S6.2 a new definer function is anon-executable BY DEFAULT" \
    "S6.3 S3.1's query DOES break when an unreviewed definer function appears" \
    "S6.5 S1.2's query DOES see a reintroduced WITH CHECK (true) INSERT policy" \
    "S6.6 S2.1's query DOES see a restored direct anon INSERT grant"; do
    if ! echo "$SECH_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: the mandatory self-test assertion did not run: ${REQUIRED}" >&2
      suite_failed "security hardening (missing: ${REQUIRED})"
    fi
  done

  if [ "$SECH_PASSED" -lt 55 ]; then
    echo "FAIL: expected at least 55 security hardening assertions, only ${SECH_PASSED} ran." >&2
    echo "      A security suite that silently stops asserting is worse than one that fails." >&2
    suite_failed "security hardening (assertion shortfall: floor 55)"
  fi
fi

# ---------------------------------------------------------------------------
# The expand/contract release sequence.
#
# 20260916090000 (EXPAND) and 20260916091000 (CONTRACT) exist as two migrations
# so that neither ordering of "apply the migration" and "deploy the code" can
# break production. A canonical replay applies both, so the state IN BETWEEN --
# the one the hosted database actually sits in while the code catches up -- does
# not exist at the end of it and would otherwise never be tested.
#
# This reaches it deliberately: roll CONTRACT back, assert the transitional
# contract, then re-apply CONTRACT. Three things get proved at once --
#
#   * the post-EXPAND state is safe for BOTH the old and the new code
#   * the contract rollback actually works, on a database that has the state
#     it is meant to reverse rather than one every suite has already cleaned up
#   * CONTRACT is safe to re-apply, which is what happens if a sequencing
#     mistake is corrected by rolling back and rolling forward again
#
# It runs BEFORE the rollback chain, which drops most of the schema it reads.
# ---------------------------------------------------------------------------
echo "==> Verifying the expand/contract release sequence"

set +e
XC_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260916091000_security_hardening_contract_rollback.sql 2>&1)"
XC_BACK_RC=$?
set -e

if [ "$XC_BACK_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the contract rollback exited with code ${XC_BACK_RC}." >&2
  echo "$XC_BACK" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "contract rollback (reaching the post-expand state)"
else
  echo "    ok  contract rolled back — the database is now in the post-EXPAND state"

  set +e
  XC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_hardening_expand_test.sql 2>&1)"
  XC_RC=$?
  set -e

  echo "$XC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  XC_PASSED="$(echo "$XC_OUT" | grep -c "ok  " || true)"

  if [ "$XC_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the expand-phase suite exited with code ${XC_RC}." >&2
    echo "$XC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    suite_failed "expand phase contract"
  else
    echo "    ok  ${XC_PASSED} expand-phase assertions passed"

    # E1 is "the deployed code still works" and E2 is "the new code already
    # works". A run that skipped either proves only half of what makes the
    # split safe, and half is indistinguishable from a race.
    for REQUIRED in \
      "E1.1 main's direct funnel INSERT still succeeds after EXPAND" \
      "E1.2 main's direct feedback INSERT still succeeds after EXPAND" \
      "E2.1 the governed funnel entry point already works for anon after EXPAND" \
      "E2.2 the governed feedback entry point already works for anon after EXPAND"; do
      if ! echo "$XC_OUT" | grep -qF "$REQUIRED"; then
        echo "FAIL: the mandatory expand-phase assertion did not run: ${REQUIRED}" >&2
        suite_failed "expand phase contract (missing: ${REQUIRED})"
      fi
    done

    if [ "$XC_PASSED" -lt 20 ]; then
      echo "FAIL: expected at least 20 expand-phase assertions, only ${XC_PASSED} ran." >&2
      suite_failed "expand phase contract (assertion shortfall: floor 20)"
    fi
  fi

  # Roll forward again, so the rollback chain below starts from the real end
  # state rather than from halfway through the release.
  set +e
  XC_FWD="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
    -f supabase/migrations/20260916091000_security_hardening_contract.sql 2>&1)"
  XC_FWD_RC=$?
  set -e

  if [ "$XC_FWD_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: re-applying CONTRACT exited with code ${XC_FWD_RC}." >&2
    echo "$XC_FWD" | grep -iE "ERROR:|FEL:" | head -10 >&2
    suite_failed "contract re-application"
  else
    echo "    ok  contract re-applied — a corrected sequencing mistake rolls forward cleanly"
  fi

  # And the end state is genuinely back. Asserted here rather than trusting the
  # migration's own post-conditions, because a re-application that silently did
  # nothing would have raised nothing either.
  XC_LEFT="$(psql -tAq -d "$TEST_DB" -c "
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('cd_v31_funnel_events','cd_test_feedback')
       AND cmd = 'INSERT'")"
  if [ "$XC_LEFT" != "0" ]; then
    echo "FAIL: ${XC_LEFT} legacy INSERT policy/policies survive after re-applying CONTRACT." >&2
    suite_failed "contract re-application (legacy path still open)"
  fi
fi

# ---------------------------------------------------------------------------
# Runs BEFORE the rollback chain, and creates the data the chain would destroy.
# db-test.sh executes every rollback, which proves they RUN — it cannot prove
# they REFUSE, because by then every suite has cleaned up and there is nothing
# left to destroy. That is precisely how the blind DELETE survived review.
echo "==> Running Security Passport rollback data-safety assertions"
set +e
SPRDS_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_rollback_data_safety_test.sql 2>&1)"
SPRDS_RC=$?
set -e

echo "$SPRDS_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPRDS_PASSED="$(echo "$SPRDS_OUT" | grep -c "ok  " || true)"

if [ "$SPRDS_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the rollback data-safety suite exited with code ${SPRDS_RC}." >&2
  echo "$SPRDS_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport rollback data safety"
else
  echo "    ok  ${SPRDS_PASSED} rollback data-safety assertions passed"
  if [ "$SPRDS_PASSED" -lt 7 ]; then
    echo "FAIL: expected at least 7 rollback data-safety assertions, only ${SPRDS_PASSED} ran." >&2
    suite_failed "Security Passport rollback data safety (assertion shortfall: floor 7)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport scope disclosure boundary assertions"
set +e
SPSDB_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_scope_disclosure_boundary_test.sql 2>&1)"
SPSDB_RC=$?
set -e

# "ok  4." is listed explicitly: 4.1 and 4.2 are the two named mandatory
# assertions, and only 4.2's text happens to contain the word GROUP. Without
# this, a passing 4.1 is invisible in the log while 4.2 is shown, which reads
# like the boundary assertion was skipped.
echo "$SPSDB_OUT" | grep -E "GROUP |ok  4\.|ASSERTION FAILED|NOT COVERED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPSDB_PASSED="$(echo "$SPSDB_OUT" | grep -c "ok  " || true)"

if [ "$SPSDB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the scope disclosure boundary suite exited with code ${SPSDB_RC}." >&2
  echo "$SPSDB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport scope disclosure boundary"
else
  echo "    ok  ${SPSDB_PASSED} scope disclosure boundary assertions passed"

  # A skipped assertion must never be mistaken for a passing one. The suite
  # itself no longer emits "NOT COVERED", but asserting it here too means a
  # future edit cannot reintroduce the escape hatch quietly.
  if echo "$SPSDB_OUT" | grep -q "NOT COVERED"; then
    echo "FAIL: the scope boundary suite reported NOT COVERED. An untested privacy" >&2
    echo "      boundary must fail, not emit a line beginning \"ok\"." >&2
    suite_failed "Security Passport scope disclosure boundary (NOT COVERED path)"
  fi

  # 4.1 and 4.2 are the assertions that distinguish an application disclosure
  # from a link share — the whole point of the boundary. Named explicitly so a
  # run that skipped exactly those two cannot pass on count alone.
  for REQUIRED in \
    "4.1 an application disclosure carries the scope on the SAME package" \
    "4.2 which GROUP 2 proved withholds it when shared by link"; do
    if ! echo "$SPSDB_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: the mandatory application-scope assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport scope disclosure boundary (missing: ${REQUIRED})"
    fi
  done

  # Every exclusion is paired with the inclusion proving the payload COULD have
  # carried the scope. A short run means those contrasts did not execute, which
  # reads exactly like a boundary that holds.
  if [ "$SPSDB_PASSED" -lt 12 ]; then
    echo "FAIL: expected at least 12 scope boundary assertions, only ${SPSDB_PASSED} ran." >&2
    suite_failed "Security Passport scope disclosure boundary (assertion shortfall: floor 12)"
  fi
fi

# ---------------------------------------------------------------------------
echo "==> Running Security Passport legacy scope correction assertions"
set +e
SPLSC_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_legacy_scope_correction_test.sql 2>&1)"
SPLSC_RC=$?
set -e

echo "$SPLSC_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPLSC_PASSED="$(echo "$SPLSC_OUT" | grep -c "ok  " || true)"

if [ "$SPLSC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the legacy scope correction suite exited with code ${SPLSC_RC}." >&2
  echo "$SPLSC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport legacy scope correction"
else
  echo "    ok  ${SPLSC_PASSED} legacy scope correction assertions passed"
  # This suite exists because one production row was frozen: readable,
  # withdrawable, uncorrectable. A short run means the correction attempts did
  # not happen, which reads exactly like a fixed defect. The floor is the full
  # count (24 + group 8's 10): group 8 is the only proof that a VERIFIED
  # scopeless record can be corrected through the governed save, and a
  # shortfall there would otherwise hide under the older groups' passes.
  if [ "$SPLSC_PASSED" -lt 34 ]; then
    echo "FAIL: expected at least 34 legacy scope assertions, only ${SPLSC_PASSED} ran." >&2
    suite_failed "Security Passport legacy scope correction (assertion shortfall: floor 34)"
  fi
fi

# ---------------------------------------------------------------------------
# Independently of the suite above: the replayed database must never end with
# an unreviewed market switched on. Asserted here rather than only inside the
# suite, because a suite that aborted early cannot assert its own cleanup.
echo "==> Verifying no unreviewed market pack is active"
psql_q -d "$TEST_DB" -c "
DO \$mp\$
DECLARE _bad text;
BEGIN
  SELECT string_agg(code, ', ') INTO _bad FROM public.sp_market_packs
   WHERE is_active AND legal_review_state NOT IN ('approved', 'grandfathered');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'unreviewed market pack(s) are ACTIVE: %', _bad;
  END IF;
END \$mp\$;" >/dev/null
echo "    ok  every active market pack has a recorded review state"

# ---------------------------------------------------------------------------
# The jurisdiction-first catalogue. Registered HERE, before the rollback chain:
# the chain drops sp_market_packs and sp_regulated_roles, so a suite placed
# after it would fail on "relation does not exist" rather than on anything it
# asserts.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport jurisdiction catalogue assertions"
set +e
SPJC_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_jurisdiction_catalogue_test.sql 2>&1)"
SPJC_RC=$?
set -e

echo "$SPJC_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true

if [ "$SPJC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the jurisdiction catalogue suite exited with code ${SPJC_RC}." >&2
  echo "$SPJC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport jurisdiction catalogue"
fi

# ---------------------------------------------------------------------------
# The trust boundaries: WHO may create trust, ON WHAT object, UNDER WHICH
# conditions. Registered HERE, before the rollback chain, because the chain
# drops sp_credential_types and the market packs the fixtures build claims
# from -- a suite placed after it would fail on "relation does not exist"
# rather than on anything it asserts.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport trust boundary assertions"
set +e
SPTB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_trust_boundary_test.sql 2>&1)"
SPTB_RC=$?
set -e

echo "$SPTB_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPTB_PASSED="$(echo "$SPTB_OUT" | grep -c "ok  " || true)"

if [ "$SPTB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the trust boundary suite exited with code ${SPTB_RC}." >&2
  echo "$SPTB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport trust boundaries"
else
  echo "    ok  ${SPTB_PASSED} trust boundary assertions passed"

  # Named explicitly, not merely counted. These four are the boundaries a
  # crafted PostgREST call ran through, and a run that happened to skip exactly
  # them would otherwise pass on count alone -- which is the shape of failure
  # this whole suite exists to make impossible.
  for REQUIRED in \
    "1.2 an employer cannot be asked to attest to a VU1 credential" \
    "1.5 a direct INSERT of employer attestation on a claim is refused by the table" \
    "2.1 an employer cannot approve a legacy attestation aimed at a credential" \
    "4.1 an approval with a null method is refused"; do
    if ! echo "$SPTB_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory trust boundary assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport trust boundaries (missing: ${REQUIRED})"
    fi
  done

  if [ "$SPTB_PASSED" -lt 38 ]; then
    echo "FAIL: expected at least 38 trust boundary assertions, only ${SPTB_PASSED} ran." >&2
    suite_failed "Security Passport trust boundaries (assertion shortfall: floor 38)"
  fi
fi

# ---------------------------------------------------------------------------
# Trust-source containment: the METHOD an approval records must belong to the
# party deciding (20261030090000). A CQrityjob review is document_review and
# nothing else; an employer attestation is employer_confirmation and nothing
# else; issuer_confirmation is refused everywhere until an issuer can act.
# The suite also RE-APPLIES the migration over manufactured legacy rows to
# prove it is prospective and rewrites nothing.
#
# Registered BEFORE the rollback chain, like every other Passport suite.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport trust-source containment assertions"
set +e
SPTSC_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_trust_source_containment_test.sql 2>&1)"
SPTSC_RC=$?
set -e

echo "$SPTSC_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPTSC_PASSED="$(echo "$SPTSC_OUT" | grep -c "ok  " || true)"

if [ "$SPTSC_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the trust-source containment suite exited with code ${SPTSC_RC}." >&2
  echo "$SPTSC_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport trust-source containment"
else
  echo "    ok  ${SPTSC_PASSED} trust-source containment assertions passed"

  # Named explicitly, not merely counted: the six method/kind combinations the
  # owner decision fixes, and the re-apply over legacy rows.
  for REQUIRED in \
    "1.1 a CQrityjob review cannot be approved as employer_confirmation" \
    "1.2 a CQrityjob review cannot be approved as issuer_confirmation" \
    "1.5 cqrityjob_review + document_review reaches VERIFIED for an authorised verifier" \
    "2.1 an employer attestation cannot be approved as document_review" \
    "2.2 an employer attestation cannot be approved as issuer_confirmation" \
    "2.5 employer_attestation + employer_confirmation reaches VERIFIED for the employer's owner" \
    "7.3 the legacy holder's record is byte-for-byte unchanged by the migration"; do
    if ! echo "$SPTSC_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory trust-source containment assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport trust-source containment (missing: ${REQUIRED})"
    fi
  done

  if [ "$SPTSC_PASSED" -lt 34 ]; then
    echo "FAIL: expected at least 34 trust-source containment assertions, only ${SPTSC_PASSED} ran." >&2
    suite_failed "Security Passport trust-source containment (assertion shortfall: floor 34)"
  fi
fi

# ---------------------------------------------------------------------------
# Security Passport number, founder rule and public social share
# (20270217090000). Executed assertions, then three REAL races between two
# psql processes: one holder numbered twice at once, two holders numbered at
# once, and one share request key submitted twice at once. A sequential test
# cannot show these: its second call reads a committed row whether or not
# anything blocked, so each race times the second session and requires that it
# WAITED while the first held its transaction open.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport number and social share assertions"
set +e
SPNS_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/sp_passport_number_and_social_share_test.sql 2>&1)"
SPNS_RC=$?
set -e

echo "$SPNS_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPNS_PASSED="$(echo "$SPNS_OUT" | grep -c "ok  " || true)"

if [ "$SPNS_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Passport number and social share suite exited with code ${SPNS_RC}." >&2
  echo "$SPNS_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport number and social share"
else
  echo "    ok  ${SPNS_PASSED} Passport number and social share assertions passed"
  if [ "$SPNS_PASSED" -lt 90 ]; then
    echo "FAIL: expected at least 90 Passport number and social share assertions, only ${SPNS_PASSED} ran." >&2
    suite_failed "Security Passport number and social share (assertion shortfall: floor 90)"
  fi
fi

echo "==> Running Security Passport number and social share races"
SPNR_FAILED=0
SPNR_USERS="'5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000003'"
psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >/dev/null <<SQL
INSERT INTO auth.users (id, email) VALUES
  ('5e000000-0000-4000-8000-000000000001', 'num-race-1@example.test'),
  ('5e000000-0000-4000-8000-000000000002', 'num-race-2@example.test'),
  ('5e000000-0000-4000-8000-000000000003', 'num-race-3@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, onboarding_state, jurisdiction_code, work_location_confirmed_at)
SELECT u, 'Race ' || u::text, 'in_progress', 'SE', now()
  FROM unnest(ARRAY[${SPNR_USERS}]::uuid[]) AS u
ON CONFLICT DO NOTHING;
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, credential_code, claimed_issuer_name, issued_on)
VALUES ('5e00c000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000003',
        'certification', 'Certified Protection Professional (CPP)', 'INTL_ASIS_CPP',
        'ASIS International', DATE '2024-01-01')
ON CONFLICT DO NOTHING;
SQL

# spnr_wait_lock <sql-fragment-for-pg_locks> : wait until A holds its lock.
spnr_held() {
  local held=0
  for _ in $(seq 1 200); do
    held="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_locks where locktype='advisory' and granted and pid <> pg_backend_pid();" 2>/dev/null || echo 0)"
    [ "${held:-0}" -gt 0 ] && break
    sleep 0.05
  done
  echo "${held:-0}"
}

# --- Race 1: ONE holder numbered by two sessions at once -------------------
SPNR_H1='5e000000-0000-4000-8000-000000000001'
SPNR_A="$(mktemp)"; SPNR_B="$(mktemp)"
(
  psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_A" 2>&1 <<SQL
BEGIN;
UPDATE public.sp_passport_profiles SET onboarding_state='completed', declared_accurate_at=now() WHERE holder_user_id='${SPNR_H1}';
SELECT 'A=' || passport_number FROM public.sp_passport_numbers WHERE holder_user_id='${SPNR_H1}';
SELECT pg_sleep(3);
COMMIT;
SQL
  echo "RC=$?" >>"$SPNR_A"
) &
SPNR_PID=$!
SPNR_HELD="$(spnr_held)"
SPNR_T0="$(date +%s)"
set +e
psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_B" 2>&1 <<SQL
SELECT 'B=' || public.sp_assign_passport_number('${SPNR_H1}');
SQL
SPNR_B_RC=$?
set -e
SPNR_WAITED=$(( $(date +%s) - SPNR_T0 ))
wait "$SPNR_PID" || true
SPNR_NA="$(grep -o '^A=[0-9]*' "$SPNR_A" | cut -d= -f2)"
SPNR_NB="$(grep -o '^B=[0-9]*' "$SPNR_B" | cut -d= -f2)"
SPNR_ROWS="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_passport_numbers where holder_user_id='${SPNR_H1}'")"
if [ "$SPNR_HELD" -eq 0 ]; then
  echo "FAIL: session A never held its lock; the sessions were not concurrent." >&2; SPNR_FAILED=1
elif [ "$SPNR_B_RC" -ne 0 ] || [ -z "$SPNR_NA" ] || [ "$SPNR_NA" != "$SPNR_NB" ] || [ "$SPNR_ROWS" != "1" ]; then
  echo "FAIL: one holder numbered twice at once gave A=${SPNR_NA:-?} B=${SPNR_NB:-?} rows=${SPNR_ROWS}." >&2
  cat "$SPNR_A" "$SPNR_B" >&2; SPNR_FAILED=1
elif [ "$SPNR_WAITED" -lt 2 ]; then
  echo "FAIL: the second numbering returned after ${SPNR_WAITED}s without waiting." >&2; SPNR_FAILED=1
else
  echo "    ok  one holder numbered by two sessions at once: one row, number ${SPNR_NA} twice, B waited ${SPNR_WAITED}s"
fi

# --- Race 2: TWO holders numbered at once get two different numbers --------
rm -f "$SPNR_A" "$SPNR_B"; SPNR_A="$(mktemp)"; SPNR_B="$(mktemp)"
(psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" -c "select 'N=' || public.sp_assign_passport_number('5e000000-0000-4000-8000-000000000002')" >"$SPNR_A" 2>&1) &
SPNR_P1=$!
(psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" -c "select 'N=' || public.sp_assign_passport_number('5e000000-0000-4000-8000-000000000003')" >"$SPNR_B" 2>&1) &
SPNR_P2=$!
wait "$SPNR_P1" || true; wait "$SPNR_P2" || true
# Holders 2 and 3 are still in_progress, so neither qualifies: the answer must be
# NULL for both and no number may be consumed or invented.
SPNR_UNQ="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_passport_numbers where holder_user_id in ('5e000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000003')")"
if [ "$SPNR_UNQ" != "0" ]; then
  echo "FAIL: an unfinished Passport was numbered." >&2; SPNR_FAILED=1
else
  echo "    ok  two unfinished holders raced and neither was numbered"
fi
# Now complete both at the same moment: each completion fires the trigger.
rm -f "$SPNR_A" "$SPNR_B"
for H in 5e000000-0000-4000-8000-000000000002 5e000000-0000-4000-8000-000000000003; do
  (psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" -c "UPDATE public.sp_passport_profiles SET onboarding_state='completed', declared_accurate_at=now() WHERE holder_user_id='${H}'" >/dev/null 2>&1) &
done
wait
SPNR_DISTINCT="$(psql -tAq -d "$TEST_DB" -c "select count(*) || '/' || count(distinct passport_number) from public.sp_passport_numbers where holder_user_id in ('5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000003')")"
SPNR_MIN="$(psql -tAq -d "$TEST_DB" -c "select min(passport_number) from public.sp_passport_numbers where holder_user_id in ('5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000003')")"
if [ "$SPNR_DISTINCT" != "3/3" ] || [ "${SPNR_MIN:-0}" -lt 2 ]; then
  echo "FAIL: three holders did not receive three distinct ordinary numbers (got ${SPNR_DISTINCT}, min ${SPNR_MIN})." >&2; SPNR_FAILED=1
else
  echo "    ok  holders completed at the same moment received 3 distinct numbers, none below 2"
fi

# --- Race 3: ONE share request key submitted twice at once -----------------
SPNR_U3='5e000000-0000-4000-8000-000000000003'
SPNR_KEY='5e00e000-0000-4000-8000-0000000000aa'
SPNR_CALL="select 'S=' || (public.sp_create_social_share(ARRAY['5e00c000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'full_name', '${SPNR_KEY}'::uuid)->>'status')"
rm -f "$SPNR_A" "$SPNR_B"; SPNR_A="$(mktemp)"; SPNR_B="$(mktemp)"
(
  psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_A" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SPNR_U3}', true);
${SPNR_CALL};
SELECT pg_sleep(3);
COMMIT;
SQL
  echo "RC=$?" >>"$SPNR_A"
) &
SPNR_PID=$!
SPNR_HELD="$(spnr_held)"
SPNR_T0="$(date +%s)"
set +e
psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_B" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SPNR_U3}', true);
${SPNR_CALL};
COMMIT;
SQL
SPNR_B_RC=$?
set -e
SPNR_WAITED=$(( $(date +%s) - SPNR_T0 ))
wait "$SPNR_PID" || true
SPNR_SROWS="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_social_shares where holder_user_id='${SPNR_U3}' and request_key='${SPNR_KEY}'")"
if [ "$SPNR_HELD" -eq 0 ]; then
  echo "FAIL: session A never held its lock; the share sessions were not concurrent." >&2; SPNR_FAILED=1
elif [ "$SPNR_B_RC" -ne 0 ] || ! grep -q '^S=already_created' "$SPNR_B" || ! grep -q '^S=created' "$SPNR_A" || [ "$SPNR_SROWS" != "1" ]; then
  echo "FAIL: one share request key submitted twice at once did not give created + already_created + 1 row (rows=${SPNR_SROWS})." >&2
  cat "$SPNR_A" "$SPNR_B" >&2; SPNR_FAILED=1
elif [ "$SPNR_WAITED" -lt 2 ]; then
  echo "FAIL: the second share returned after ${SPNR_WAITED}s without waiting." >&2; SPNR_FAILED=1
else
  echo "    ok  one share request key submitted twice at once: one share, B waited ${SPNR_WAITED}s and was told already_created"
fi
rm -f "$SPNR_A" "$SPNR_B"

# --- Race 4: the cap of 25 holds under concurrency -------------------------
# The holder already has 1 active share. Raise it to 24, then submit two
# creates with DIFFERENT request keys at once: exactly one may succeed.
psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >/dev/null <<SQL
INSERT INTO public.sp_social_shares (public_id, holder_user_id, locale, expires_at, holder_label, request_key, request_fingerprint)
SELECT translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '${SPNR_U3}', 'sv', now() + interval '30 days',
       'full_name', gen_random_uuid(), 'cap-fixture-' || g
  FROM generate_series(1, 23) g;
SQL
SPNR_CAP_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_social_shares where holder_user_id='${SPNR_U3}' and revoked_at is null and expires_at > now()")"
SPNR_CAP_CALL() { echo "select 'S=' || (public.sp_create_social_share(ARRAY['5e00c000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'full_name', '$1'::uuid)->>'status')"; }
SPNR_A="$(mktemp)"; SPNR_B="$(mktemp)"
(
  psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_A" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SPNR_U3}', true);
$(SPNR_CAP_CALL 5e00e000-0000-4000-8000-0000000000b1);
SELECT pg_sleep(3);
COMMIT;
SQL
  echo "RC=$?" >>"$SPNR_A"
) &
SPNR_PID=$!
SPNR_HELD="$(spnr_held)"
SPNR_T0="$(date +%s)"
set +e
psql -tAq -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SPNR_B" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SPNR_U3}', true);
$(SPNR_CAP_CALL 5e00e000-0000-4000-8000-0000000000b2);
COMMIT;
SQL
SPNR_B_RC=$?
set -e
SPNR_WAITED=$(( $(date +%s) - SPNR_T0 ))
wait "$SPNR_PID" || true
SPNR_CAP_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_social_shares where holder_user_id='${SPNR_U3}' and revoked_at is null and expires_at > now()")"
if [ "$SPNR_HELD" -eq 0 ] || [ "$SPNR_CAP_BEFORE" != "24" ]; then
  echo "FAIL: cap race setup is not as intended (held=${SPNR_HELD}, before=${SPNR_CAP_BEFORE})." >&2; SPNR_FAILED=1
elif ! grep -q '^S=created' "$SPNR_A" || [ "$SPNR_B_RC" -eq 0 ] || ! grep -q 'SP_TOO_MANY_SOCIAL_SHARES' "$SPNR_B" || [ "$SPNR_CAP_AFTER" != "25" ]; then
  echo "FAIL: two creates at 24 shares must give exactly one success and one refusal (after=${SPNR_CAP_AFTER})." >&2
  cat "$SPNR_A" "$SPNR_B" >&2; SPNR_FAILED=1
elif [ "$SPNR_WAITED" -lt 2 ]; then
  echo "FAIL: the second create returned after ${SPNR_WAITED}s without waiting." >&2; SPNR_FAILED=1
else
  echo "    ok  two concurrent creates at 24 shares: exactly one succeeded, one was refused, total 25 (B waited ${SPNR_WAITED}s)"
fi
rm -f "$SPNR_A" "$SPNR_B"

if [ "$SPNR_FAILED" -ne 0 ]; then
  suite_failed "Security Passport number and social share races"
fi

# ---------------------------------------------------------------------------
# The internal reviewer note, against a crafted read.
#
# `decision_note` is reviewer reasoning; `holder_message` is what the candidate
# is told. Before 20261014090000 the holder read the note straight off the
# table over PostgREST -- the RLS policy matched their row and the grant
# included every column. This suite runs as `authenticated` with a JWT subject
# set, which is exactly that principal, and never through a TypeScript
# function: the defect did not need one.
#
# Registered BEFORE the rollback chain, like every other Passport suite: the
# chain drops the tables it reads.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport internal note privacy assertions"
set +e
SPNP_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_note_privacy_test.sql 2>&1)"
SPNP_RC=$?
set -e

echo "$SPNP_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPNP_PASSED="$(echo "$SPNP_OUT" | grep -c "ok  " || true)"

if [ "$SPNP_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the internal note privacy suite exited with code ${SPNP_RC}." >&2
  echo "$SPNP_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport internal note privacy"
else
  echo "    ok  ${SPNP_PASSED} internal note privacy assertions passed"

  # Named, not merely counted. Each denial below is paired with a positive
  # read proving the row was reachable, so a suite that silently lost its
  # fixtures would fail rather than report a boundary that holds. A run that
  # skipped exactly these would otherwise pass on count alone.
  for REQUIRED in \
    "1.1 the holder reads holder_message" \
    "2.1 the holder cannot read decision_note on their own REQUEST" \
    "2.2 the holder cannot read decision_note on their own DECISION" \
    "2.7 the holder cannot PLANT an internal note on their own request" \
    "4.1 the reviewer still reads the internal note, through the verifier RPC"; do
    if ! echo "$SPNP_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory note-privacy assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport internal note privacy (missing: ${REQUIRED})"
    fi
  done

  if [ "$SPNP_PASSED" -lt 30 ]; then
    echo "FAIL: expected at least 30 note privacy assertions, only ${SPNP_PASSED} ran." >&2
    suite_failed "Security Passport internal note privacy (assertion shortfall: floor 30)"
  fi
fi

# ---------------------------------------------------------------------------
# Security Passport dedicated reviewer role + least privilege.
#
# Registered HERE, next to the other Passport privacy suites and well after
# the Phase 2 suite, deliberately. This suite creates Passport profiles of
# its own, and security_passport_phase2_test asserts a GLOBAL
# `count(*) FROM sp_passport_profiles = 1` -- so a profile-creating suite
# placed before it fails Phase 2 on a row that is not Phase 2's business.
# Every Passport suite that creates a holder is registered after it for the
# same reason.
#
# It proves two things a source-level guard structurally cannot. First, that
# the dedicated `passport_verifier` capability separates reviewing from
# platform administration in BOTH directions -- the reviewer can decide a
# real request, and is refused by the admin surfaces -- which the previous
# model, where sp_is_verifier WAS is_platform_admin, could not express.
# Second, that the Supabase default-privilege trap is closed on the Passport
# tables: they arrived granted to authenticated in full, TRUNCATE included,
# and TRUNCATE is not something RLS constrains, so the suite EXECUTES the
# statements as the authenticated principal rather than reading the policies.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport reviewer role and least-privilege assertions"
set +e
RRL_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_reviewer_role_test.sql 2>&1)"
RRL_RC=$?
set -e

echo "$RRL_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
RRL_PASSED="$(echo "$RRL_OUT" | grep -c "ok  " || true)"

if [ "$RRL_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Passport reviewer role suite exited with code ${RRL_RC}." >&2
  echo "$RRL_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Passport reviewer role and least privilege"
else
  echo "    ok  ${RRL_PASSED} Passport reviewer role assertions passed"
  if [ "$RRL_PASSED" -lt 50 ]; then
    echo "FAIL: expected at least 50 reviewer-role assertions, only ${RRL_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "Passport reviewer role (assertion shortfall: floor 50)"
  fi
fi

# ---------------------------------------------------------------------------
# Security Passport employer employment verification (PR 8).
#
# Registered HERE, after the Phase 2 suite and beside the other Passport
# privacy suites, for the reason the reviewer-role block above records: this
# suite creates Passport profiles of its own, and security_passport_phase2_test
# asserts a GLOBAL `count(*) FROM sp_passport_profiles = 1`.
#
# Registered BEFORE the rollback step, like every non-destructive suite.
#
# What it proves that a source-level guard structurally cannot: that the
# employer receives ONE employment period and a name and can reach nothing
# else -- asserted by EXECUTING the reads as the employer principal, not by
# reading policies -- that an unrelated organisation is refused rather than
# shown an empty list, that a candidate who also owns the employer cannot
# confirm their own employment, and that an employer who says the dates are
# wrong still cannot change them. The last one is the whole correction model:
# the employer asks, the candidate edits, and the database is what makes that
# true rather than a convention the interface follows.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport employer employment verification assertions"
set +e
EEV_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_employer_verification_test.sql 2>&1)"
EEV_RC=$?
set -e

echo "$EEV_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
EEV_PASSED="$(echo "$EEV_OUT" | grep -c "ok  " || true)"

if [ "$EEV_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer employment verification suite exited with code ${EEV_RC}." >&2
  echo "$EEV_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport employer employment verification"
else
  echo "    ok  ${EEV_PASSED} employer employment verification assertions passed"

  # The assertions that are the POINT of the release. A suite that stops
  # running one of these and still reports a healthy total is the failure mode
  # a floor alone does not catch.
  for REQUIRED in \
    "2.4 the payload is exactly the fourteen employment fields" \
    "2.5 the employer reads none of the candidate's evidence" \
    "2.11 an unrelated employer's owner is refused Company X's queue" \
    "4.2 a candidate who owns the employer cannot confirm their own employment" \
    "6.5 the employer cannot change the holder's employment period" \
    "7.3 the decision records the CONFIRMING ORGANISATION by name" \
    "7.4 and it is not CQrityjob -- CQrityjob decided nothing here" \
    "8.4 the employment stays self-declared -- a refusal verifies nothing"; do
    if ! echo "$EEV_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory employment-verification assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport employer employment verification (missing: ${REQUIRED})"
    fi
  done

  if [ "$EEV_PASSED" -lt 45 ]; then
    echo "FAIL: expected at least 45 employment verification assertions, only ${EEV_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "Security Passport employer employment verification (assertion shortfall: floor 45)"
  fi
fi

# ---------------------------------------------------------------------------
# Which organisation may be asked to confirm an employment (PR 17).
#
# Registered HERE, beside the other Passport privacy suites and BEFORE the
# rollback step, for the reason every one of them records: it creates Passport
# profiles of its own, and the rollback block drops the sp_ tables a later
# registration would then be running against.
#
# What it proves that a source-level guard structurally cannot: that
# sp_submit_for_verification REFUSES an employer attestation addressed to an
# organisation CQrityjob has not approved -- asserted by EXECUTING the call as
# the candidate for every one of the five ineligible statuses, and by counting
# the request table before and after, because "it raised an error" and "it
# wrote nothing" are different claims. It also proves the two halves of the
# self-verification rule do different jobs: a candidate who owns an unapproved
# company cannot ASK it, and cannot DECIDE its answer once the company is
# approved. And it proves the picker's narrowing did not widen anything -- what
# a candidate can read is still what employers'' own policies return, checked by
# reading the table as a candidate principal rather than by reading the policy.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport employer matching and eligibility assertions"
set +e
EMM_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_employer_matching_test.sql 2>&1)"
EMM_RC=$?
set -e

echo "$EMM_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
EMM_PASSED="$(echo "$EMM_OUT" | grep -c "ok  " || true)"

if [ "$EMM_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the employer matching and eligibility suite exited with code ${EMM_RC}." >&2
  echo "$EMM_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport employer matching and eligibility"
else
  echo "    ok  ${EMM_PASSED} employer matching and eligibility assertions passed"

  # The assertions that are the POINT of the release. A suite that stops
  # running one of these and still reports a healthy total is the failure mode
  # a floor alone does not catch.
  for REQUIRED in \
    "1.1 an approved organisation can still be asked to confirm employment" \
    "1.2 a pending organisation cannot be asked to confirm employment" \
    "1.3 a suspended organisation cannot be asked to confirm employment" \
    "1.9 a CQrityjob document review with no employer is unaffected" \
    "2.1 a second open request on the same employment is refused" \
    "2.3 a candidate cannot open a request on somebody else's employment" \
    "3.2 but cannot ask their own unapproved organisation to confirm their employment" \
    "3.4 the holder cannot decide their own employment confirmation" \
    "4.1 a candidate sees no organisation they are unrelated to and that has no live job" \
    "5.1 a suspended organisation's owner no longer reads its attestation queue (20270112090000)" \
    "5.4 and the request placed before suspension is back in the reactivated employer's queue"; do
    if ! echo "$EMM_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory employer-matching assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport employer matching and eligibility (missing: ${REQUIRED})"
    fi
  done

  if [ "$EMM_PASSED" -lt 25 ]; then
    echo "FAIL: expected at least 25 employer matching assertions, only ${EMM_PASSED} ran." >&2
    echo "      A suite that silently stops running assertions is worse than one that fails." >&2
    suite_failed "Security Passport employer matching and eligibility (assertion shortfall: floor 25)"
  fi
fi

# ---------------------------------------------------------------------------
# The concurrent decision, run as two real processes.
#
# This cannot live inside a suite file. One psql session holds one transaction,
# so two calls from it are sequential, and a sequential test passes identically
# against the broken function and the fixed one: the second call sees a
# COMMITTED row and takes the already-decided branch whether or not a lock was
# ever held. Two OPEN transactions on one request is the whole experiment.
#
# Session A decides and then sleeps inside its transaction, holding the row.
# B is started only once A is OBSERVED holding it, and is expected to be
# refused only after having WAITED -- a B that returns instantly would mean it
# never contended, and the run is then not evidence of anything.
#
# Runs immediately after the trust boundary suite, whose reviewer identities it
# reuses, and before the rollback chain like every other Passport suite.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport concurrent-decision regression"
set +e
RACE_SETUP="$(psql -tAq -v ON_ERROR_STOP=1 -v phase=setup -d "$TEST_DB" \
  -f supabase/tests/security_passport_decision_race_test.sql 2>&1)"
RACE_SETUP_RC=$?
set -e
RACE_REQ="$(echo "$RACE_SETUP" | tail -1)"

if [ "$RACE_SETUP_RC" -ne 0 ] || ! echo "$RACE_REQ" | grep -qE '^[0-9a-f-]{36}$'; then
  echo "FAIL: the concurrent-decision setup phase did not produce a request id." >&2
  echo "$RACE_SETUP" | grep -iE "ASSERTION FAILED|ERROR:|FEL:|FAIL" | head -10 >&2
  suite_failed "Security Passport concurrent decision (setup)"
else
  RACE_V1="cb000000-0000-0000-0000-000000000009"
  RACE_V2="cb000000-0000-0000-0000-00000000000a"
  RACE_A_LOG="$(mktemp)"; RACE_B_LOG="$(mktemp)"

  # A: decide, then hold the row for three seconds without committing.
  (
    psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$RACE_A_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${RACE_V1}', true);
SELECT public.sp_verifier_decide('${RACE_REQ}', 'approved', 'document_review',
  'A granskade underlaget', 'Godkand.', NULL, NULL);
SELECT pg_sleep(3);
COMMIT;
SQL
    echo "RC=$?" >>"$RACE_A_LOG"
  ) &
  RACE_A_PID=$!

  # Wait for A to actually hold the row, so B starts into real contention.
  RACE_HELD=0
  for _ in $(seq 1 200); do
    RACE_HELD="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'sp_verification_requests' and l.mode = 'RowExclusiveLock' and l.granted;" 2>/dev/null || echo 0)"
    [ "${RACE_HELD:-0}" -gt 0 ] && break
    sleep 0.05
  done

  RACE_B_START="$(date +%s)"
  set +e
  psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$RACE_B_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${RACE_V2}', true);
SELECT public.sp_verifier_decide('${RACE_REQ}', 'approved', 'document_review',
  'B granskade underlaget', 'Godkand.', NULL, NULL);
COMMIT;
SQL
  RACE_B_RC=$?
  set -e
  RACE_B_WAITED=$(( $(date +%s) - RACE_B_START ))
  wait "$RACE_A_PID" || true

  RACE_FAILED=0

  if [ "${RACE_HELD:-0}" -eq 0 ]; then
    echo "FAIL: session A never took a lock on sp_verification_requests, so the two" >&2
    echo "      sessions were never concurrent and this run proves nothing." >&2
    RACE_FAILED=1
  else
    echo "    ok  session A held the request row while B attempted the same decision"
  fi

  if ! grep -q "^RC=0" "$RACE_A_LOG"; then
    echo "FAIL: the first decider did not succeed." >&2
    cat "$RACE_A_LOG" >&2
    RACE_FAILED=1
  else
    echo "    ok  one decider succeeded"
  fi

  if [ "$RACE_B_RC" -eq 0 ]; then
    echo "FAIL: BOTH deciders succeeded on one request. The decision path is racy." >&2
    RACE_FAILED=1
  elif ! grep -q "SP_REQUEST_ALREADY_DECIDED" "$RACE_B_LOG"; then
    echo "FAIL: the second decider was refused, but not as an already-decided request." >&2
    grep -iE "ERROR:|FEL:" "$RACE_B_LOG" | head -5 >&2
    RACE_FAILED=1
  else
    echo "    ok  the other was refused: SP_REQUEST_ALREADY_DECIDED"
  fi

  # The timing is what separates "the lock serialised them" from "they happened
  # to run in order". B was started while A held the row and A held it for 3s,
  # so a B that returned in under 2s did not wait on anything.
  if [ "$RACE_B_WAITED" -lt 2 ]; then
    echo "FAIL: the second decider returned after ${RACE_B_WAITED}s without waiting for" >&2
    echo "      the row lock. It was not blocked, so the refusal is not evidence" >&2
    echo "      that concurrent decisions are serialised." >&2
    RACE_FAILED=1
  else
    echo "    ok  the refused decider WAITED ${RACE_B_WAITED}s on the row lock"
  fi

  rm -f "$RACE_A_LOG" "$RACE_B_LOG"

  set +e
  RACE_OUT="$(psql -v ON_ERROR_STOP=1 -q -v phase=verify -d "$TEST_DB" \
    -f supabase/tests/security_passport_decision_race_test.sql 2>&1)"
  RACE_RC=$?
  set -e

  echo "$RACE_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  RACE_PASSED="$(echo "$RACE_OUT" | grep -c "ok  " || true)"

  if [ "$RACE_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the concurrent-decision verification exited with code ${RACE_RC}." >&2
    echo "$RACE_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    RACE_FAILED=1
  elif [ "$RACE_PASSED" -lt 8 ]; then
    echo "FAIL: expected at least 8 concurrent-decision assertions, only ${RACE_PASSED} ran." >&2
    RACE_FAILED=1
  else
    echo "    ok  ${RACE_PASSED} concurrent-decision assertions passed"
  fi

  if [ "$RACE_FAILED" -ne 0 ]; then
    suite_failed "Security Passport concurrent decision"
  fi
fi

# ---------------------------------------------------------------------------
# The first merit — one transaction, one merit, one declaration
# (20261031090000). The deterministic half: atomicity, idempotency on the
# operation id, the server-side declaration refusal, the five merit kinds, the
# legacy completed profile, and two NEGATIVE CONTROLS that take a guard away
# and show the defect coming back inside a rolled-back transaction.
#
# Registered BEFORE the rollback chain, like every other Passport suite: the
# chain drops the objects it reads.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport first-merit assertions"
set +e
SPFM_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_first_merit_test.sql 2>&1)"
SPFM_RC=$?
set -e

echo "$SPFM_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPFM_PASSED="$(echo "$SPFM_OUT" | grep -c "ok  " || true)"

if [ "$SPFM_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Security Passport first-merit suite exited with code ${SPFM_RC}." >&2
  echo "$SPFM_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport first merit"
else
  echo "    ok  ${SPFM_PASSED} first-merit assertions passed"

  # Named, not merely counted. Each of these is one of the properties the
  # first-run journey is sold on, and a suite that quietly stopped running one
  # of them would still report a healthy total.
  for REQUIRED in \
    "1.6 the first merit is self_declared" \
    "1.9 the country is the one the holder stated, not the column default" \
    "2.1 the retry returns the SAME merit id" \
    "2.8 the same operation id carrying different facts is refused" \
    "3.1 completion without an explicit declaration is refused" \
    "3.5 the refusal created no audit event" \
    "4.3 an employment with no stated country is refused, not defaulted" \
    "5.1 education can be the first merit" \
    "5.2 course can be the first merit" \
    "5.3 custom certification first merit is prohibited" \
    "5.4 custom licence first merit is prohibited" \
    "6.1 a legacy completed profile can still record its first merit" \
    "12.4 the body names no trust column, so the merit takes the defaults" \
    "2.12 NEGATIVE CONTROL: a planted audit event cannot impersonate a completed operation" \
    "2.15 a replay whose subject no longer exists is refused, not reported as saved" \
    "6.2 the NEW declaration is stamped now, not with the legacy timestamp" \
    "8.2 a SECOND first-merit operation is refused once a current merit exists" \
    "9.5 a failing creation event aborts the whole call" \
    "9.8 a legacy profile with no receipt is repaired, not re-created" \
    "10.4 nor TRUNCATE the table" \
    "11.2 the older save matches nothing" \
    "12.5 idempotency reads the private receipts, not the client-writable log" \
    "12.8 and the lock is taken before the receipt is claimed and before the current-merit check" \
    "13.1 NEGATIVE CONTROL: reading the audit log returns a subject the holder invented" \
    "13.2 NEGATIVE CONTROL: without the tightened policy a holder can mint an operation event"; do
    if ! echo "$SPFM_OUT" | grep -qF "$REQUIRED"; then
      echo "FAIL: a mandatory first-merit assertion did not run: ${REQUIRED}" >&2
      suite_failed "Security Passport first merit (missing: ${REQUIRED})"
    fi
  done

  if [ "$SPFM_PASSED" -lt 115 ]; then
    echo "FAIL: expected at least 115 first-merit assertions, only ${SPFM_PASSED} ran." >&2
    suite_failed "Security Passport first merit (assertion shortfall: floor 115)"
  fi
fi

# ---------------------------------------------------------------------------
# Two identical first-merit submissions, genuinely in flight at once.
#
# Same three-phase shape as the concurrent-decision race above, and for the
# same reason: one psql session cannot demonstrate a race, because its second
# call reads a committed row and takes the replay branch whether or not
# anything ever blocked.
#
# The expected outcome here is NOT a refusal. Both callers submitted the same
# operation, so both must be told the same thing -- one merit, one id, twice.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport concurrent first-merit assertions"
FMR_FAILED=0
FMR_PASSED=0
set +e
FMR_SETUP="$(psql -q -v ON_ERROR_STOP=1 -v phase=setup -d "$TEST_DB" \
  -f supabase/tests/security_passport_first_merit_race_test.sql 2>&1)"
FMR_SETUP_RC=$?
set -e

if [ "$FMR_SETUP_RC" -ne 0 ]; then
  echo "FAIL: the concurrent first-merit setup phase failed." >&2
  echo "$FMR_SETUP" | grep -iE "ASSERTION FAILED|ERROR:|FEL:|FAIL" | head -10 >&2
  suite_failed "Security Passport concurrent first merit (setup)"
else
  FMR_HOLDER="fe000000-0000-0000-0000-000000000001"
  FMR_OP="fe000000-0000-0000-0000-0000000000aa"
  FMR_A_LOG="$(mktemp)"; FMR_B_LOG="$(mktemp)"

  # A: complete the first merit, then hold the transaction open for three
  # seconds without committing.
  (
    psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$FMR_A_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${FMR_HOLDER}', true);
INSERT INTO public.sp_first_merit_race_out (session, subject_kind, subject_id, created)
SELECT 'A', subject_kind, subject_id, created
  FROM public.sp_passport_complete_first_merit(
    '${FMR_OP}'::uuid, 'employment', 'Vaktare', 'Bevakning AB (fiktiv)', 'SE',
    DATE '2024-03-01', NULL, true);
SELECT pg_sleep(3);
COMMIT;
SQL
    echo "RC=$?" >>"$FMR_A_LOG"
  ) &
  FMR_A_PID=$!

  # Wait until A actually holds a write lock, so B starts into real contention.
  FMR_HELD=0
  for _ in $(seq 1 200); do
    FMR_HELD="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'sp_passport_operations' and l.mode = 'RowExclusiveLock' and l.granted;" 2>/dev/null || echo 0)"
    [ "${FMR_HELD:-0}" -gt 0 ] && break
    sleep 0.05
  done

  FMR_B_START="$(date +%s)"
  set +e
  psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$FMR_B_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${FMR_HOLDER}', true);
INSERT INTO public.sp_first_merit_race_out (session, subject_kind, subject_id, created)
SELECT 'B', subject_kind, subject_id, created
  FROM public.sp_passport_complete_first_merit(
    '${FMR_OP}'::uuid, 'employment', 'Vaktare', 'Bevakning AB (fiktiv)', 'SE',
    DATE '2024-03-01', NULL, true);
COMMIT;
SQL
  FMR_B_RC=$?
  set -e
  FMR_B_WAITED=$(( $(date +%s) - FMR_B_START ))
  wait "$FMR_A_PID" || true

  if [ "${FMR_HELD:-0}" -eq 0 ]; then
    echo "FAIL: session A never took a write lock on sp_passport_operations, so the two" >&2
    echo "      sessions were never concurrent and this run proves nothing." >&2
    FMR_FAILED=1
  else
    echo "    ok  session A held its transaction open while B submitted the same operation"
  fi

  if ! grep -q "^RC=0" "$FMR_A_LOG"; then
    echo "FAIL: the first submission did not succeed." >&2
    cat "$FMR_A_LOG" >&2
    FMR_FAILED=1
  else
    echo "    ok  the first submission succeeded"
  fi

  # B must SUCCEED. It submitted the same operation, so it is owed the same
  # answer -- not an error, and not a second merit.
  if [ "$FMR_B_RC" -ne 0 ]; then
    echo "FAIL: the concurrent identical submission errored instead of returning the" >&2
    echo "      merit the first one made." >&2
    grep -iE "ERROR:|FEL:" "$FMR_B_LOG" | head -5 >&2
    FMR_FAILED=1
  else
    echo "    ok  the concurrent identical submission also succeeded"
  fi

  # The timing separates "the index serialised them" from "they ran in order".
  if [ "$FMR_B_WAITED" -lt 2 ]; then
    echo "FAIL: the second submission returned after ${FMR_B_WAITED}s without waiting." >&2
    echo "      It was never blocked, so its answer is no evidence that concurrent" >&2
    echo "      identical submissions are serialised." >&2
    FMR_FAILED=1
  else
    echo "    ok  the second submission WAITED ${FMR_B_WAITED}s on the operation key"
  fi

  rm -f "$FMR_A_LOG" "$FMR_B_LOG"

  set +e
  FMR_OUT="$(psql -v ON_ERROR_STOP=1 -q -v phase=verify -d "$TEST_DB" \
    -f supabase/tests/security_passport_first_merit_race_test.sql 2>&1)"
  FMR_RC=$?
  set -e

  echo "$FMR_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  FMR_PASSED="$(echo "$FMR_OUT" | grep -c "ok  " || true)"

  if [ "$FMR_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the concurrent first-merit verification exited with code ${FMR_RC}." >&2
    echo "$FMR_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    FMR_FAILED=1
  elif [ "$FMR_PASSED" -lt 11 ]; then
    echo "FAIL: expected at least 11 concurrent first-merit assertions, only ${FMR_PASSED} ran." >&2
    FMR_FAILED=1
  else
    echo "    ok  ${FMR_PASSED} concurrent first-merit assertions passed"
  fi

  if [ "$FMR_FAILED" -ne 0 ]; then
    suite_failed "Security Passport concurrent first merit"
  fi
fi

# ---------------------------------------------------------------------------
# Two DIFFERENT first-merit operations for one holder, genuinely at once.
#
# The same-id race above proves one canonical answer for one operation. This
# proves the other property: two operations with different ids -- two tabs,
# or a retry that minted a fresh key -- produce ONE first merit and ONE
# refusal. Without the per-holder advisory lock in
# sp_passport_complete_first_merit, each inserts its own receipt, each sees
# no committed merit, and each creates one.
#
# Run TWICE: once against the real function (B must WAIT, then be refused),
# and once as a NEGATIVE CONTROL against a copy of the function with the lock
# stripped out (B must NOT be refused, and two merits must exist). The control
# copy is derived from the live definition in pg_proc rather than kept as a
# second file, so it cannot drift from the thing it is a control for. The real
# migration is re-applied afterwards and the lock's presence asserted.
# ---------------------------------------------------------------------------
run_two_ops_race() {
  local MODE="$1" HOLDER="$2" LABEL="$3"
  local OP_A OP_B A_LOG B_LOG A_PID HELD B_START B_RC B_WAITED SETUP SETUP_RC FAILED=0
  # Operation ids in a prefix space nothing else in the suite uses. `fb...`
  # collided with the main suite's merit-kind loop: B was then refused as a
  # cross-holder replay (SP_OPERATION_ID_CONFLICT) -- correct behaviour, wrong
  # proof.
  OP_A="$(echo "$HOLDER" | sed 's/^........-/fe100000-/')"
  OP_B="$(echo "$HOLDER" | sed 's/^........-/fe200000-/')"

  set +e
  SETUP="$(psql -q -v ON_ERROR_STOP=1 -v phase=setup -v holder="$HOLDER" -d "$TEST_DB" \
    -f supabase/tests/security_passport_first_merit_two_ops_race_test.sql 2>&1)"
  SETUP_RC=$?
  set -e
  if [ "$SETUP_RC" -ne 0 ]; then
    echo "FAIL: the two-ops race setup phase failed (${LABEL})." >&2
    echo "$SETUP" | grep -iE "ERROR:|FEL:|FAIL" | head -10 >&2
    return 1
  fi

  A_LOG="$(mktemp)"; B_LOG="$(mktemp)"

  # A: operation A, an employment. Then hold the transaction open for 3s.
  (
    psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$A_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${HOLDER}', true);
INSERT INTO public.sp_first_merit_two_ops_out (session, subject_kind, subject_id, created, refused_with)
SELECT 'A', subject_kind, subject_id, created, NULL
  FROM public.sp_passport_complete_first_merit(
    '${OP_A}'::uuid, 'employment', 'Vaktare', 'Forsta Bolaget AB (fiktiv)', 'SE',
    DATE '2024-03-01', NULL, true);
SELECT pg_sleep(3);
COMMIT;
SQL
    echo "RC=$?" >>"$A_LOG"
  ) &
  A_PID=$!

  # Wait until A holds its locks: the holder advisory lock (real function) or,
  # for the control, at least its write lock on the receipts table.
  HELD=0
  for _ in $(seq 1 200); do
    HELD="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_locks l left join pg_class c on c.oid = l.relation where l.granted and ((l.locktype = 'advisory') or (c.relname = 'sp_passport_operations' and l.mode = 'RowExclusiveLock'));" 2>/dev/null || echo 0)"
    [ "${HELD:-0}" -gt 0 ] && break
    sleep 0.05
  done

  # B: operation B, a DIFFERENT id and DIFFERENT facts. Its own refusal is
  # caught and recorded so the verify phase can read it -- and the exception
  # block is a subtransaction, so a refused B leaves no receipt behind.
  B_START="$(date +%s)"
  set +e
  psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$B_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${HOLDER}', true);
DO \$\$
BEGIN
  INSERT INTO public.sp_first_merit_two_ops_out (session, subject_kind, subject_id, created, refused_with)
  SELECT 'B', subject_kind, subject_id, created, NULL
    FROM public.sp_passport_complete_first_merit(
      '${OP_B}'::uuid, 'course', 'Kurs B', 'Andra Utbildaren (fiktiv)', NULL,
      DATE '2023-01-01', NULL, true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.sp_first_merit_two_ops_out (session, subject_kind, subject_id, created, refused_with)
  VALUES ('B', NULL, NULL, false, SQLERRM);
END \$\$;
COMMIT;
SQL
  B_RC=$?
  set -e
  B_WAITED=$(( $(date +%s) - B_START ))
  wait "$A_PID" || true

  if [ "${HELD:-0}" -eq 0 ]; then
    echo "FAIL: session A never took a lock, so the two sessions were never concurrent (${LABEL})." >&2
    FAILED=1
  else
    echo "    ok  session A held its transaction open while B submitted a different operation (${LABEL})"
  fi
  if ! grep -q "^RC=0" "$A_LOG"; then
    echo "FAIL: the first operation did not succeed (${LABEL})." >&2
    cat "$A_LOG" >&2
    FAILED=1
  fi
  if [ "$B_RC" -ne 0 ]; then
    echo "FAIL: session B's transaction itself errored (${LABEL}); the refusal should have been caught." >&2
    grep -iE "ERROR:|FEL:" "$B_LOG" | head -5 >&2
    FAILED=1
  fi
  rm -f "$A_LOG" "$B_LOG"

  local MERITS
  MERITS="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from public.sp_experience_periods where holder_user_id='${HOLDER}') + (select count(*) from public.sp_claims where holder_user_id='${HOLDER}');")"
  # What each session actually recorded. Printed always: when this proof
  # fails, the answer B got is the whole diagnosis.
  psql -tAq -d "$TEST_DB" -c "select '      ' || session || ' -> subject=' || coalesce(subject_id::text, '(none)') || ' created=' || coalesce(created::text, '?') || ' refused_with=' || coalesce(refused_with, '(none)') from public.sp_first_merit_two_ops_out order by session;" 2>/dev/null || true
  local REFUSED
  REFUSED="$(psql -tAq -d "$TEST_DB" -c "select coalesce(refused_with,'') from public.sp_first_merit_two_ops_out where session='B';")"

  if [ "$MODE" = "real" ]; then
    # B must have WAITED for A's lock. A B that returned at once never met it.
    if [ "$B_WAITED" -lt 2 ]; then
      echo "FAIL: the second operation returned after ${B_WAITED}s without waiting on the holder lock (${LABEL})." >&2
      FAILED=1
    else
      echo "    ok  the second operation WAITED ${B_WAITED}s on the holder lock"
    fi
    set +e
    local OUT RC
    OUT="$(psql -v ON_ERROR_STOP=1 -q -v phase=verify -v holder="$HOLDER" -d "$TEST_DB" \
      -f supabase/tests/security_passport_first_merit_two_ops_race_test.sql 2>&1)"
    RC=$?
    set -e
    echo "$OUT" | grep -E "ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
    TWO_OPS_PASSED="$(echo "$OUT" | grep -c "ok  " || true)"
    if [ "$RC" -ne 0 ]; then
      echo "FAIL: the two-ops race verification exited with code ${RC}." >&2
      echo "$OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
      FAILED=1
    elif [ "$TWO_OPS_PASSED" -lt 14 ]; then
      echo "FAIL: expected at least 14 two-ops race assertions, only ${TWO_OPS_PASSED} ran." >&2
      FAILED=1
    else
      echo "    ok  ${TWO_OPS_PASSED} two-ops race assertions passed"
    fi
  else
    # NEGATIVE CONTROL: with the lock gone the defect must come back, visibly.
    if [ "${MERITS:-0}" -ne 2 ]; then
      echo "FAIL: NEGATIVE CONTROL did not reproduce the defect -- ${MERITS} merit(s), expected 2 (${LABEL})." >&2
      echo "      The two-ops race test would then pass without the lock, and proves nothing." >&2
      FAILED=1
    elif echo "$REFUSED" | grep -q "SP_FIRST_MERIT_ALREADY_EXISTS"; then
      echo "FAIL: NEGATIVE CONTROL still refused the second operation (${LABEL})." >&2
      FAILED=1
    else
      echo "    ok  NEGATIVE CONTROL: without the holder lock, two operations made ${MERITS} first merits"
    fi
  fi
  return $FAILED
}

echo "==> Running Security Passport two-operation first-merit race"
TWO_OPS_PASSED=0
if ! run_two_ops_race real "fe000000-0000-0000-0000-000000000002" "real function"; then
  suite_failed "Security Passport two-operation first-merit race"
fi

# --- the negative control: strip the lock out of the LIVE definition --------
echo "==> Running Security Passport two-operation race NEGATIVE CONTROL (lock removed)"
set +e
CTL_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" 2>&1 <<'SQL'
DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit';
  _def := regexp_replace(_def,
    'PERFORM pg_advisory_xact_lock\(\s*hashtextextended\([^;]*\);',
    '-- NEGATIVE CONTROL: per-holder lock removed', 'g');
  IF _def LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'CONTROL_SETUP: the lock statement was not stripped';
  END IF;
  EXECUTE _def;
END $$;
SQL
)"
CTL_RC=$?
set -e
if [ "$CTL_RC" -ne 0 ]; then
  echo "FAIL: could not build the unlocked control function." >&2
  echo "$CTL_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "Security Passport two-operation race (control setup)"
else
  if ! run_two_ops_race control "fe000000-0000-0000-0000-000000000003" "lock removed"; then
    suite_failed "Security Passport two-operation first-merit race (negative control)"
  fi
fi

# --- restore the real function and prove the lock is back -------------------
set +e
RESTORE_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261031090000_sp_passport_first_merit.sql 2>&1)"
RESTORE_RC=$?
set -e
if [ "$RESTORE_RC" -ne 0 ]; then
  echo "FAIL: the migration could not be re-applied after the negative control." >&2
  echo "$RESTORE_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "Security Passport two-operation race (restore)"
else
  LOCK_BACK="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sp_passport_complete_first_merit' and p.prosrc like '%pg_advisory_xact_lock%';")"
  if [ "${LOCK_BACK:-0}" -ne 1 ]; then
    echo "FAIL: the real function was not restored after the negative control." >&2
    suite_failed "Security Passport two-operation race (restore)"
  else
    echo "    ok  the real function is back, with the holder lock"
  fi
fi

# ---------------------------------------------------------------------------
# Selected-merit sharing. Registered HERE, before the rollback chain begins:
# from the next section onwards migrations are being reverted, and a suite
# placed after them runs against a schema its own migration has been undone
# from.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport selected-merit sharing assertions"
set +e
SPSEL_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_selected_sharing_test.sql 2>&1)"
SPSEL_RC=$?
set -e

echo "$SPSEL_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPSEL_PASSED="$(echo "$SPSEL_OUT" | grep -c "ok  " || true)"

if [ "$SPSEL_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the selected-merit sharing suite exited with code ${SPSEL_RC}." >&2
  echo "$SPSEL_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport selected-merit sharing"
else
  echo "    ok  ${SPSEL_PASSED} selected-merit sharing assertions passed"
  if [ "$SPSEL_PASSED" -lt 95 ]; then
    echo "FAIL: expected at least 95 selected-merit sharing assertions, only ${SPSEL_PASSED} ran." >&2
    suite_failed "Security Passport selected-merit sharing (assertion shortfall: floor 95)"
  fi
fi

# ---------------------------------------------------------------------------
# Supabase -> Lovable share gateway. This is the schema-only half: the current
# link flow remains active until this suite is hosted and independently
# verified, after which the application can switch to the fragment entry.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport share-gateway assertions"
set +e
SPGW_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/security_passport_share_gateway_test.sql 2>&1)"
SPGW_RC=$?
set -e

echo "$SPGW_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPGW_PASSED="$(echo "$SPGW_OUT" | grep -c "ok  " || true)"

if [ "$SPGW_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the share-gateway suite exited with code ${SPGW_RC}." >&2
  echo "$SPGW_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport share gateway"
else
  echo "    ok  ${SPGW_PASSED} share-gateway assertions passed"
  if [ "$SPGW_PASSED" -lt 25 ]; then
    echo "FAIL: expected at least 25 share-gateway assertions, only ${SPGW_PASSED} ran." >&2
    suite_failed "Security Passport share gateway (assertion shortfall: floor 25)"
  fi
fi

# The schema foundation must be independently reversible without touching an
# existing disclosure, then safely re-applicable for the remaining suites.
# Newest Passport unit first. 20261221090000 (the UK and Dubai opened as a
# public pilot) returns its markets to internal pilot, without which the next
# rollback refuses. 20261220090000 (public-pilot availability) replaced the
# review queue, which reads sub_jurisdiction_code, and no older rollback
# restores it; left in place it would read a column the market-pack rollbacks
# further down drop. Then 20261214090000 (India): it replaced the view, the
# claim rules, the details guard, the save RPC and the reviewer detail that the
# rollbacks below restore, and its rows would read as adoption to the
# foundation rollback further down. None is re-applied: none of the remaining
# suites reads them.
# The certification research integration (20270212090000, 20270213090000,
# 20270214090000) is newer than all of these and stands down first, in its own
# reverse order: publication, import, foundation.
psql_q -d "$TEST_DB" -f supabase/rollback/20270214090000_sp_catalogue_research_publish_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20270213090000_sp_catalogue_research_import_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20270212090000_sp_catalogue_research_foundation_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261214090000_sp_india_national_qualifications_rollback.sql >/dev/null
# 20261126090000's catalogue view reads sp_credential_organisation_roles, so it
# stands down first or the table below cannot be dropped.
psql_q -d "$TEST_DB" -f supabase/rollback/20261126090000_sp_catalogue_scope_and_document_issuer_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261123090000_sp_credential_organisation_roles_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261120090000_sp_credential_selective_sharing_v2_rollback.sql >/dev/null
echo "==> Proving share-gateway rollback and re-apply"
SPGW_DISCLOSURE_BEFORE="$(psql -Atq -d "$TEST_DB" -c "SELECT count(*) FROM public.sp_disclosures WHERE id='e7100000-0000-4000-8000-000000000001'")"
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261104090000_passport_share_gateway_rollback.sql

SPGW_ROLLBACK_STATE="$(psql -Atq -d "$TEST_DB" -c "SELECT (to_regclass('public.sp_share_handoffs') IS NULL)::int || '|' || (to_regclass('public.sp_share_sessions') IS NULL)::int || '|' || (to_regprocedure('public.sp_share_gateway_issue(text,text)') IS NULL)::int || '|' || (to_regprocedure('public.sp_share_gateway_consume(text,text)') IS NULL)::int || '|' || (to_regprocedure('public.sp_get_disclosure_session(text)') IS NULL)::int")"
SPGW_DISCLOSURE_AFTER="$(psql -Atq -d "$TEST_DB" -c "SELECT count(*) FROM public.sp_disclosures WHERE id='e7100000-0000-4000-8000-000000000001'")"

if [ "$SPGW_ROLLBACK_STATE" != "1|1|1|1|1" ]; then
  echo "FAIL: share-gateway rollback left schema objects behind: ${SPGW_ROLLBACK_STATE}" >&2
  suite_failed "Security Passport share gateway rollback"
fi
if [ "$SPGW_DISCLOSURE_BEFORE" != "1" ] || [ "$SPGW_DISCLOSURE_AFTER" != "1" ]; then
  echo "FAIL: share-gateway rollback changed the existing disclosure." >&2
  suite_failed "Security Passport share gateway rollback data preservation"
fi

psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261104090000_passport_share_gateway.sql
SPGW_REAPPLY_STATE="$(psql -Atq -d "$TEST_DB" -c "SELECT (to_regclass('public.sp_share_handoffs') IS NOT NULL)::int || '|' || (to_regclass('public.sp_share_sessions') IS NOT NULL)::int || '|' || (to_regprocedure('public.sp_share_gateway_issue(text,text)') IS NOT NULL)::int || '|' || (to_regprocedure('public.sp_share_gateway_consume(text,text)') IS NOT NULL)::int || '|' || (to_regprocedure('public.sp_get_disclosure_session(text)') IS NOT NULL)::int")"
if [ "$SPGW_REAPPLY_STATE" != "1|1|1|1|1" ]; then
  echo "FAIL: share-gateway migration did not re-apply completely: ${SPGW_REAPPLY_STATE}" >&2
  suite_failed "Security Passport share gateway re-apply"
else
  echo "    ok  rollback preserved the disclosure and re-apply restored all five objects"
fi


# ---------------------------------------------------------------------------
# Two callers, one request key.
#
# The sequential replay is asserted in the suite above; this is the case that
# actually happens — two tabs, a double submit, a client retrying a slow
# request. A holds its transaction open after creating; B arrives with the same
# key while A is uncommitted.
#
# THE POLL LOOKS FOR AN ADVISORY LOCK SPECIFICALLY, and that is the point: the
# unique index alone would also make B wait (its INSERT would block on A's
# uncommitted duplicate key), so "B waited" is not evidence that the intended
# protection is present. Removing pg_advisory_xact_lock from the create makes
# this section fail on the very first assertion.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport selected-sharing concurrency proof"
SELR_FAILED=0

set +e
SELR_SETUP="$(psql -v ON_ERROR_STOP=1 -q -v phase=setup -d "$TEST_DB" \
  -f supabase/tests/security_passport_selected_sharing_race_test.sql 2>&1)"
SELR_SETUP_RC=$?
set -e

if [ "$SELR_SETUP_RC" -ne 0 ]; then
  echo "FAIL: the selected-sharing concurrency setup failed." >&2
  echo "$SELR_SETUP" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport selected-sharing concurrency (setup)"
else
  SELR_HOLDER="d2000000-0000-4000-8000-000000000001"
  SELR_CLAIM="d2c00000-0000-4000-8000-000000000001"
  SELR_KEY="d2a00000-0000-4000-8000-000000000001"
  SELR_A_LOG="$(mktemp)"; SELR_B_LOG="$(mktemp)"

  # A: create the share, then hold the transaction open for three seconds.
  (
    PGAPPNAME=sp_selected_share_race_a \
      psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SELR_A_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SELR_HOLDER}', true);
INSERT INTO public.sp_share_race_out (session, status, disclosure_id, has_token)
SELECT 'A', r ->> 'status', (r ->> 'disclosure_id')::uuid, (r ->> 'token') IS NOT NULL
  FROM public.sp_create_selected_disclosure(
    ARRAY['${SELR_CLAIM}']::uuid[], NULL, 30, NULL, NULL, 'sv',
    '${SELR_KEY}'::uuid) AS r;
SELECT pg_sleep(3);
COMMIT;
SQL
    echo "RC=$?" >>"$SELR_A_LOG"
  ) &
  SELR_A_PID=$!

  # Wait until A's backend holds THE advisory lock for this holder/request
  # pair. Polling "any advisory lock" can be satisfied by unrelated work and
  # makes the race appear concurrent when these two sessions never overlapped.
  SELR_HELD=0
  for _ in $(seq 1 200); do
    SELR_HELD="$(psql -tAq -d "$TEST_DB" -c "
      select count(*)
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
       where l.locktype = 'advisory'
         and l.granted
         and l.objsubid = 1
         and a.application_name = 'sp_selected_share_race_a'
         and l.classid::bigint = ((hashtextextended(
               'sp_share:${SELR_HOLDER}:${SELR_KEY}', 0) >> 32) & 4294967295)
         and l.objid::bigint = (hashtextextended(
               'sp_share:${SELR_HOLDER}:${SELR_KEY}', 0) & 4294967295);" \
      2>/dev/null || echo 0)"
    [ "${SELR_HELD:-0}" -gt 0 ] && break
    sleep 0.05
  done

  SELR_B_START="$(date +%s)"
  set +e
  psql -q -v ON_ERROR_STOP=1 -d "$TEST_DB" >"$SELR_B_LOG" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${SELR_HOLDER}', true);
INSERT INTO public.sp_share_race_out (session, status, disclosure_id, has_token)
SELECT 'B', r ->> 'status', (r ->> 'disclosure_id')::uuid, (r ->> 'token') IS NOT NULL
  FROM public.sp_create_selected_disclosure(
    ARRAY['${SELR_CLAIM}']::uuid[], NULL, 30, NULL, NULL, 'sv',
    '${SELR_KEY}'::uuid) AS r;
COMMIT;
SQL
  SELR_B_RC=$?
  set -e
  SELR_B_WAITED=$(( $(date +%s) - SELR_B_START ))
  wait "$SELR_A_PID" || true

  if [ "${SELR_HELD:-0}" -eq 0 ]; then
    echo "FAIL: no session ever held an advisory lock, so the two callers were never" >&2
    echo "      serialised on the request key and this run proves nothing." >&2
    SELR_FAILED=1
  else
    echo "    ok  the first caller held an advisory lock on its request key"
  fi

  if ! grep -q "^RC=0" "$SELR_A_LOG"; then
    echo "FAIL: the first create did not succeed." >&2
    cat "$SELR_A_LOG" >&2
    SELR_FAILED=1
  else
    echo "    ok  the first create succeeded"
  fi

  if [ "$SELR_B_RC" -ne 0 ]; then
    echo "FAIL: the simultaneous identical create ERRORED instead of being handed" >&2
    echo "      the answer the winner produced." >&2
    grep -iE "ERROR:|FEL:" "$SELR_B_LOG" | head -5 >&2
    SELR_FAILED=1
  else
    echo "    ok  the simultaneous identical create also succeeded"
  fi

  # No unique-violation leakage: a constraint name must never reach a caller.
  if grep -qiE "duplicate key|unique constraint|sp_disclosures_request_key_uidx" "$SELR_B_LOG"; then
    echo "FAIL: the losing caller was shown a constraint violation." >&2
    grep -iE "duplicate key|unique constraint|uidx" "$SELR_B_LOG" | head -3 >&2
    SELR_FAILED=1
  else
    echo "    ok  and it was never shown an index name or a duplicate-key error"
  fi

  if [ "$SELR_B_WAITED" -lt 2 ]; then
    echo "FAIL: the second create returned after ${SELR_B_WAITED}s without waiting." >&2
    echo "      It was never blocked, so its answer is no evidence of serialisation." >&2
    SELR_FAILED=1
  else
    echo "    ok  the second create WAITED ${SELR_B_WAITED}s on the request key"
  fi

  rm -f "$SELR_A_LOG" "$SELR_B_LOG"

  set +e
  SELR_OUT="$(psql -v ON_ERROR_STOP=1 -q -v phase=verify -d "$TEST_DB" \
    -f supabase/tests/security_passport_selected_sharing_race_test.sql 2>&1)"
  SELR_RC=$?
  set -e

  echo "$SELR_OUT" | grep -E "ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
  SELR_PASSED="$(echo "$SELR_OUT" | grep -c "ok  " || true)"

  if [ "$SELR_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the selected-sharing concurrency verification exited with code ${SELR_RC}." >&2
    echo "$SELR_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
    SELR_FAILED=1
  elif [ "$SELR_PASSED" -lt 7 ]; then
    echo "FAIL: expected at least 7 concurrency assertions, only ${SELR_PASSED} ran." >&2
    SELR_FAILED=1
  fi

  if [ "$SELR_FAILED" -ne 0 ]; then
    suite_failed "Security Passport selected-sharing concurrency"
  fi
fi

# ---------------------------------------------------------------------------
# The first-merit rollback, and back again.
#
# A rollback file that nobody runs is a promise, not a plan. This one is run
# against a database that already holds merits created THROUGH the function,
# because the property that matters is not "the drop succeeds" -- it is that
# dropping the operation loses no holder data. Then the migration is
# re-applied, over events that already carry an operation_id, which is the
# state a real re-apply would meet.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# cv_documents lockdown (phase 3) — the door is shut, and the room still works.
#
# The lockdown is a SEPARATE migration on a separate branch because phase 1
# had to be applicable on its own, with the currently published application
# still writing the table directly. Here it is applied on top of phase 1 and
# both halves are proved: a signed-in holder can no longer INSERT, UPDATE,
# DELETE or TRUNCATE cv_documents -- the last of which no policy could have
# constrained -- and the same holder can still create, edit and delete their
# own CV through the controlled functions.
#
# It is then ROLLED BACK, because everything after this point in the run
# (the rollback chain, and any suite that writes a CV directly) expects the
# phase-1 grants.
# ---------------------------------------------------------------------------
echo "==> Running cv_documents lockdown assertions"
CVLD_FAILED=0

set +e
CVLD_APPLY="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261103090000_cv_documents_lockdown.sql 2>&1)"
CVLD_RC=$?
set -e
if [ "$CVLD_RC" -ne 0 ]; then
  echo "FAIL: the lockdown migration did not apply." >&2
  echo "$CVLD_APPLY" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CVLD_FAILED=1
else
  echo "    ok  the lockdown applied on top of the controlled write path"
fi

set +e
CVLD_OUT="$(psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/tests/cv_documents_lockdown_test.sql 2>&1)"
CVLD_TRC=$?
set -e

echo "$CVLD_OUT" | grep -E "GROUP |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
CVLD_PASSED="$(echo "$CVLD_OUT" | grep -c "ok  " || true)"

if [ "$CVLD_TRC" -ne 0 ]; then
  echo "FAIL: the cv_documents lockdown suite exited with code ${CVLD_TRC}." >&2
  echo "$CVLD_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  CVLD_FAILED=1
else
  echo "    ok  ${CVLD_PASSED} cv_documents lockdown assertions passed"
  # Raised from 15 with groups R (the refresh path, which is SECURITY INVOKER
  # and survives only by delegating), O (owner and identity refusals), F (the
  # function surface, PUBLIC included) and I (idempotency after the revoke).
  if [ "$CVLD_PASSED" -lt 32 ]; then
    echo "FAIL: expected at least 32 lockdown assertions, only ${CVLD_PASSED} ran." >&2
    CVLD_FAILED=1
  fi
fi

# ── THE RACE, UNDER THE REVOKE ─────────────────────────────────────────
#
# The lost-response contract is proved elsewhere against the phase-1 state.
# It has to hold on the far side of the lockdown too, and two sessions cannot
# contend inside one transaction, so it is raced here with two real psql
# processes while `authenticated` holds no direct write privilege at all.
echo "==> Running cv_documents post-lockdown concurrent-creation proof"
CVLR_OP="cccc0000-0000-4000-8000-000000000001"
CVLR_A="$(mktemp)"; CVLR_B="$(mktemp)"
for f in "$CVLR_A" "$CVLR_B"; do
  cat > "$f" <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000c', true);
SET LOCAL ROLE authenticated;
SELECT 'CVID=' || (public.cv_create(
  '${CVLR_OP}'::uuid, 'Locked race', 'sv', 'general', NULL, false,
  ARRAY['e0000000-0000-0000-0000-0000000000c1']::uuid[],
  '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
  '{}'::jsonb) ->> 'cv_id') AS marked;
COMMIT;
SQL
done
# A holds its transaction open briefly so B genuinely contends.
sed -i.bak 's/^COMMIT;$/SELECT pg_sleep(2);\nCOMMIT;/' "$CVLR_A" && rm -f "$CVLR_A.bak"

CVLR_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents where owner_user_id='60000000-0000-0000-0000-00000000000c';")"
psql -tAq -d "$TEST_DB" -f "$CVLR_A" > /tmp/cvlr_a.out 2>&1 &
CVLR_PID=$!
sleep 1
psql -tAq -d "$TEST_DB" -f "$CVLR_B" > /tmp/cvlr_b.out 2>&1
wait "$CVLR_PID" || true
CVLR_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents where owner_user_id='60000000-0000-0000-0000-00000000000c';")"
CVLR_ID_A="$(grep -oE 'CVID=[0-9a-f-]{36}' /tmp/cvlr_a.out | head -1 | cut -d= -f2)"
CVLR_ID_B="$(grep -oE 'CVID=[0-9a-f-]{36}' /tmp/cvlr_b.out | head -1 | cut -d= -f2)"

if [ "$(( CVLR_AFTER - CVLR_BEFORE ))" -ne 1 ]; then
  echo "FAIL: post-lockdown, one operation id produced $(( CVLR_AFTER - CVLR_BEFORE )) CVs, not 1." >&2
  head -5 /tmp/cvlr_a.out /tmp/cvlr_b.out >&2
  CVLD_FAILED=1
elif [ -z "$CVLR_ID_A" ] || [ "$CVLR_ID_A" != "$CVLR_ID_B" ]; then
  echo "FAIL: post-lockdown the two callers were told different cvIds ('${CVLR_ID_A}' vs '${CVLR_ID_B}')." >&2
  CVLD_FAILED=1
elif grep -qiE "ERROR:|FEL:" /tmp/cvlr_b.out; then
  echo "FAIL: post-lockdown the second caller errored instead of waiting." >&2
  head -5 /tmp/cvlr_b.out >&2
  CVLD_FAILED=1
else
  echo "    ok  and under the revoke too: two processes, one operation id, one CV (${CVLR_ID_A})"
fi
rm -f "$CVLR_A" "$CVLR_B"

# The rows themselves must survive the whole cycle. A lockdown that emptied
# the table would pass every privilege assertion above.
CVLD_ROWS_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents;")"

# Back to the phase-1 state for the rest of the run.
set +e
CVLD_BACK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql 2>&1)"
CVLD_BRC=$?
set -e
if [ "$CVLD_BRC" -ne 0 ]; then
  echo "FAIL: the lockdown rollback did not run cleanly." >&2
  echo "$CVLD_BACK" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CVLD_FAILED=1
else
  echo "    ok  and the lockdown rolls back to the phase-1 grants"
fi

CVLD_OPEN="$(psql -tAq -d "$TEST_DB" -c "select has_table_privilege('authenticated','public.cv_documents','INSERT')::text;")"
if [ "$CVLD_OPEN" != "true" ]; then
  echo "FAIL: the lockdown rollback did not restore the phase-1 grant." >&2
  CVLD_FAILED=1
fi
CVLD_TRUNC="$(psql -tAq -d "$TEST_DB" -c "select has_table_privilege('authenticated','public.cv_documents','TRUNCATE')::text;")"
if [ "$CVLD_TRUNC" != "false" ]; then
  echo "FAIL: the lockdown rollback restored TRUNCATE, which was never granted." >&2
  CVLD_FAILED=1
else
  echo "    ok  without restoring TRUNCATE, which was never granted"
fi

CVLD_ROWS_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.cv_documents;")"
if [ "$CVLD_ROWS_BEFORE" != "$CVLD_ROWS_AFTER" ]; then
  echo "FAIL: the lockdown cycle changed the row count (${CVLD_ROWS_BEFORE} -> ${CVLD_ROWS_AFTER})." >&2
  CVLD_FAILED=1
else
  echo "    ok  and no CV was lost across apply and rollback (${CVLD_ROWS_AFTER} rows)"
fi

# ── AND IT GOES BACK ON ────────────────────────────────────────────────
#
# A migration that applies once and refuses the second time is a migration
# nobody can re-run after a rollback, which is the situation a rollback exists
# to make survivable. Applied again here, then stood back down so the rest of
# the run continues from the phase-1 state it expects.
set +e
CVLD_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261103090000_cv_documents_lockdown.sql 2>&1)"
CVLD_RERC=$?
set -e
if [ "$CVLD_RERC" -ne 0 ]; then
  echo "FAIL: the lockdown did not re-apply after its rollback." >&2
  echo "$CVLD_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  CVLD_FAILED=1
else
  CVLD_REOPEN="$(psql -tAq -d "$TEST_DB" -c "select has_table_privilege('authenticated','public.cv_documents','INSERT')::text;")"
  if [ "$CVLD_REOPEN" != "false" ]; then
    echo "FAIL: the re-applied lockdown did not close the direct write again." >&2
    CVLD_FAILED=1
  else
    echo "    ok  and it re-applies after a rollback, closing the door again"
  fi
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
    -f supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql >/dev/null
fi

if [ "$CVLD_FAILED" -ne 0 ]; then
  suite_failed "cv_documents lockdown"
fi

# ---------------------------------------------------------------------------
# Stand the CV write path down before the Passport rollback chain.
#
# cv_source_bundle reads sp_passport_profiles.sub_jurisdiction_code, and the
# market-pack rollbacks below drop that column. A function left behind would
# then fail at RUN time rather than at definition time, which is exactly what
# security_passport_rollback_correction_test GROUP 4 exists to catch -- and it
# caught this one.
#
# The rollback has already been proved, and re-proved by re-applying, further
# up. This run is the dependency order a real rollback would follow: the
# consumer goes before the thing it consumes.
# ---------------------------------------------------------------------------
psql_q -d "$TEST_DB" -f supabase/rollback/20261121090000_sp_closed_credential_catalogue_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261119090000_sp_international_credential_wallet_rollback.sql >/dev/null
psql_q -d "$TEST_DB" -f supabase/rollback/20261118100000_sp_international_passport_foundation_rollback.sql >/dev/null
echo "==> Standing the CV write path down ahead of the Passport rollbacks"
set +e
CVSD_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261102090000_cv_documents_controlled_writes_rollback.sql 2>&1)"
CVSD_RC=$?
set -e
if [ "$CVSD_RC" -ne 0 ]; then
  echo "FAIL: the CV write path could not be stood down before the Passport rollbacks." >&2
  echo "$CVSD_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  suite_failed "cv_documents rollback (pre-Passport ordering)"
else
  echo "    ok  the CV write path is rolled back, in dependency order"
fi

echo "==> Running Security Passport first-merit rollback proof"
FMRB_FAILED=0

FMRB_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from public.sp_experience_periods) || '/' || (select count(*) from public.sp_claims) || '/' || (select count(*) from public.sp_passport_events);")"

set +e
FMRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261031090000_sp_passport_first_merit_rollback.sql 2>&1)"
FMRB_RC=$?
set -e

if [ "$FMRB_RC" -ne 0 ]; then
  echo "FAIL: the first-merit rollback did not run cleanly." >&2
  echo "$FMRB_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  FMRB_FAILED=1
else
  echo "    ok  the first-merit rollback ran cleanly"
fi

FMRB_GONE="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sp_passport_complete_first_merit') + (select count(*) from pg_indexes where schemaname='public' and indexname='sp_events_one_per_operation');")"
if [ "${FMRB_GONE:-1}" -ne 0 ]; then
  echo "FAIL: the rollback left the function or the index behind." >&2
  FMRB_FAILED=1
else
  echo "    ok  the function and the index are gone"
fi

FMRB_AFTER="$(psql -tAq -d "$TEST_DB" -c "select (select count(*) from public.sp_experience_periods) || '/' || (select count(*) from public.sp_claims) || '/' || (select count(*) from public.sp_passport_events);")"
if [ "$FMRB_BEFORE" != "$FMRB_AFTER" ]; then
  echo "FAIL: the rollback changed holder data: ${FMRB_BEFORE} -> ${FMRB_AFTER}." >&2
  echo "      A rollback of an operation must never delete what the operation wrote." >&2
  FMRB_FAILED=1
else
  echo "    ok  no holder row was touched (periods/claims/events ${FMRB_AFTER})"
fi

set +e
FMRB_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261031090000_sp_passport_first_merit.sql 2>&1)"
FMRB_RE_RC=$?
set -e

if [ "$FMRB_RE_RC" -ne 0 ]; then
  echo "FAIL: the first-merit migration could not be re-applied over its own data." >&2
  echo "$FMRB_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  FMRB_FAILED=1
else
  echo "    ok  re-applied cleanly over events that already carry an operation_id"
fi

if [ "$FMRB_FAILED" -ne 0 ]; then
  suite_failed "Security Passport first-merit rollback"
fi


# ---------------------------------------------------------------------------
# The selected-merit sharing rollback, and back again — and then reverted for
# good.
#
# It runs FIRST in the chain because 20261101090000 is the newest migration in
# it, and because sp_selected_merits_payload reads two columns the chain below
# drops (sp_claims.authorisation_scope and sub_jurisdiction_code). A function
# left behind that reads a dropped column fails at RUN time, not at definition
# time, which is exactly the class of breakage the correction suite's group 4
# exists to catch.
#
# Three steps, and the middle one is the point: a rollback that can only be
# run once is not reversible, so the migration is re-applied over the item
# rows the forward run wrote and asserted live again, before being reverted a
# final time so the chain below meets the schema its own migrations expect.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport selected-merit sharing rollback proof"
SELRB_FAILED=0

SELRB_ITEMS_BEFORE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_disclosure_items;")"

set +e
SELRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261101090000_sp_selected_merit_sharing_rollback.sql 2>&1)"
SELRB_RC=$?
set -e

if [ "$SELRB_RC" -ne 0 ]; then
  echo "FAIL: the selected-merit sharing rollback did not run cleanly." >&2
  echo "$SELRB_OUT" | grep -iE "ERROR:|FEL:" | head -5 >&2
  SELRB_FAILED=1
else
  echo "    ok  the rollback ran cleanly"
fi

SELRB_GONE="$(psql -tAq -d "$TEST_DB" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('sp_create_selected_disclosure','sp_preview_selected_disclosure','sp_selected_merits_payload');")"
if [ "${SELRB_GONE:-1}" -ne 0 ]; then
  echo "FAIL: the rollback left a selected-sharing function behind." >&2
  SELRB_FAILED=1
else
  echo "    ok  no holder can create, preview or resolve a selected share"
fi

SELRB_ITEMS_AFTER="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_disclosure_items;")"
if [ "$SELRB_ITEMS_BEFORE" != "$SELRB_ITEMS_AFTER" ]; then
  echo "FAIL: the rollback destroyed the holders' own sharing decisions: ${SELRB_ITEMS_BEFORE} -> ${SELRB_ITEMS_AFTER}." >&2
  SELRB_FAILED=1
else
  echo "    ok  every selected-merit row survives (${SELRB_ITEMS_AFTER}), so re-applying restores each share"
fi

SELRB_CHECK="$(psql -tAq -d "$TEST_DB" -c "select pg_get_constraintdef(oid) like '%selected_merits%' from pg_constraint where conrelid='public.sp_disclosures'::regclass and conname='sp_disclosures_package_code_check';")"
if [ "${SELRB_CHECK:-t}" != "f" ]; then
  echo "FAIL: 'selected_merits' is still an accepted package after the rollback." >&2
  SELRB_FAILED=1
else
  echo "    ok  the package set is back to five, and existing rows were not rewritten"
fi

# The direction of failure, which is the whole reason the restored function
# carries one added guard: a share whose scope can no longer be evaluated must
# show NOTHING. Without the guard it would render active-with-empty-arrays --
# a live page telling a recipient this person holds no verified merits.
SELRB_DARK="$(psql -tAq -d "$TEST_DB" -c "select coalesce((select public.sp_disclosure_payload(id) ->> 'status' from public.sp_disclosures where package_code='selected_merits' order by created_at limit 1),'NO-FIXTURE');")"
if [ "${SELRB_DARK}" != "unavailable" ]; then
  echo "FAIL: a rolled-back selected share resolves as '${SELRB_DARK}', not 'unavailable'." >&2
  echo "      An empty-but-active payload would tell a recipient this holder has nothing." >&2
  SELRB_FAILED=1
else
  echo "    ok  a selected share fails CLOSED while the migration is reverted"
fi

set +e
SELRB_RE="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/migrations/20261101090000_sp_selected_merit_sharing.sql 2>&1)"
SELRB_RE_RC=$?
set -e

if [ "$SELRB_RE_RC" -ne 0 ]; then
  echo "FAIL: the migration could not be re-applied over its own item rows." >&2
  echo "$SELRB_RE" | grep -iE "ERROR:|FEL:" | head -5 >&2
  SELRB_FAILED=1
else
  echo "    ok  re-applied cleanly over shares that already carry a selection"
fi

SELRB_BACK="$(psql -tAq -d "$TEST_DB" -c "select count(*) from public.sp_disclosure_items i join public.sp_disclosures d on d.id=i.disclosure_id where d.package_code='selected_merits';")"
SELRB_LIVE="$(psql -tAq -d "$TEST_DB" -c "select coalesce((select public.sp_disclosure_payload(id) ->> 'status' from public.sp_disclosures where package_code='selected_merits' order by created_at limit 1),'NO-FIXTURE');")"
if [ "${SELRB_BACK:-0}" -lt 1 ] || [ "${SELRB_LIVE}" != "active" ]; then
  echo "FAIL: after re-applying, the shares do not resolve again (items ${SELRB_BACK:-0}, status ${SELRB_LIVE})." >&2
  SELRB_FAILED=1
else
  echo "    ok  the shares created before the rollback resolve again, from the rows that survived"
fi

set +e
SELRB_FINAL="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261101090000_sp_selected_merit_sharing_rollback.sql 2>&1)"
SELRB_FINAL_RC=$?
set -e

if [ "$SELRB_FINAL_RC" -ne 0 ]; then
  echo "FAIL: the rollback is not repeatable." >&2
  echo "$SELRB_FINAL" | grep -iE "ERROR:|FEL:" | head -5 >&2
  SELRB_FAILED=1
else
  echo "    ok  reverted again, and left reverted for the chain below"
fi

if [ "$SELRB_FAILED" -ne 0 ]; then
  suite_failed "Security Passport selected-merit sharing rollback"
fi


# ---------------------------------------------------------------------------
# The correction path, phase 1 of 2: with Phase A applied, immediately before
# the rollback chain. Creates the holder and the two claims the "after" phase
# depends on, so claim B is a row that genuinely predates the rollback.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport rollback correction assertions (before)"
set +e
SPRCB_OUT="$(psql -v ON_ERROR_STOP=1 -v phase=before -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_rollback_correction_test.sql 2>&1)"
SPRCB_RC=$?
set -e

echo "$SPRCB_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true

if [ "$SPRCB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the correction path is broken BEFORE any rollback ran (code ${SPRCB_RC})." >&2
  echo "$SPRCB_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport rollback correction (before)"
fi

# ---------------------------------------------------------------------------
# The jurisdiction-first catalogue rolls back FIRST, newest to oldest: Abu
# Dhabi (20260914092000), the Dubai cadre catalogue (20260914091000), then
# Northern Ireland (20260914090000).
#
# The order is enforced, not conventional. The Swedish rollback further down
# restores the original 16-character limit on credential codes, and
# AE_AZ_PSBD_LICENCE_SUPERVISOR is 29 characters while UK_SIA_LICENCE_VI is 17.
# Leaving any of the three in place aborts the Swedish file with
# ROLLBACK BLOCKED naming the count.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# The security hardening rolls back FIRST, and in two steps: 20260916091000
# (CONTRACT) then 20260916090000 (EXPAND). The chain runs in reverse migration
# order so each rollback sees the schema its forward migration left behind, and
# here that ordering is enforced by the files themselves rather than assumed --
# the expand rollback DROPs the governed entry points, so running it while
# CONTRACT is still applied would leave both telemetry tables with no anonymous
# write path at all. It refuses.
#
# It is also the one rollback in this chain that deliberately reinstates a
# VULNERABILITY -- WITH CHECK (true) on the two telemetry tables, EXECUTE on
# save_career_report back to PUBLIC. That is what a rollback IS, and the file
# says so at the top. What it must not do is lose the 13 archived rows in the
# legacy backup table, which is the whole reason that table was kept rather
# than deleted; the file asserts the count itself and this step surfaces it.
# ---------------------------------------------------------------------------
echo "==> Verifying the security hardening rollbacks (contract, then expand)"
set +e
SECHRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260916091000_security_hardening_contract_rollback.sql 2>&1
psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260916090000_security_hardening_expand_rollback.sql 2>&1)"
SECHRB_RC=$?
set -e

if [ "$SECHRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: a security hardening rollback exited with code ${SECHRB_RC}." >&2
  echo "$SECHRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "security hardening rollback"
else
  echo "    ok  both phases reverse cleanly, legacy backup rows intact"
fi

# Independently of the file's own assertion: the reversal must be REAL. If the
# two entry points survived, the rollback silently did nothing and the "ok"
# above would be reporting a no-op as a success.
SECHRB_FUNCS="$(psql -tAq -d "$TEST_DB" -c "
  SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_record_funnel_event','cd_submit_test_feedback')")"
if [ "$SECHRB_FUNCS" != "0" ]; then
  echo "FAIL: the security hardening rollback left ${SECHRB_FUNCS} entry point(s) behind." >&2
  suite_failed "security hardening rollback (entry points survived)"
fi

# ---------------------------------------------------------------------------
# The pilot entitlement rolls back BEFORE any of the market packs.
# sp_pilot_members.market_pack_code references sp_market_packs(code), and the
# three-market rollback further down does DROP TABLE sp_market_packs, which
# Postgres refuses while a dependent table exists.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# The pilot catalogue visibility policy rolls back BEFORE the entitlement.
# 20261109090000's policy calls sp_market_access(), which the entitlement
# rollback DROPs; Postgres refuses that drop while the policy depends on it.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# The Passport number and public social share (20270217090000) roll back FIRST
# in this chain, as the newest migration does in a real rollback:
# sp_get_social_share reads sp_sub_jurisdictions, which the far-end three-market
# rollback drops. The suite proves the refusal without confirmation and the
# byte-equal restore of sp_network_stats(); here the DATA the races left behind
# is destroyed on purpose, with the confirmation the rollback demands.
# ---------------------------------------------------------------------------
echo "==> Verifying the Passport number and social share rollback"
set +e
SPNSRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -c "SET app.sp_rollback_confirm = 'drop-numbers-and-shares';" \
  -f supabase/rollback/20270217090000_sp_passport_number_and_social_share_rollback.sql 2>&1)"
SPNSRB_RC=$?
set -e
SPNSRB_LEFT="$(psql -tAq -d "$TEST_DB" -c "SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_passport_numbers','sp_passport_numbers_retired','sp_social_shares','sp_social_share_items','sp_passport_number_seq')) + (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_get_social_share','sp_create_social_share','sp_revoke_social_share','sp_list_my_social_shares','sp_my_passport_number','sp_designate_founder','sp_assign_passport_number','sp_network_counts_holder'))")"
if [ "$SPNSRB_RC" -ne 0 ] || [ "$SPNSRB_LEFT" != "0" ]; then
  echo "FAIL: the Passport number and social share rollback exited with code ${SPNSRB_RC}, ${SPNSRB_LEFT} object(s) left." >&2
  echo "$SPNSRB_OUT" | grep -iE "ERROR:|FEL:" | head -10 >&2
  suite_failed "Passport number and social share rollback"
else
  echo "    ok  the Passport number and social share objects roll back cleanly"
fi

echo "==> Verifying the pilot catalogue visibility rollback"
set +e
SPCVF_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261109090000_sp_pilot_catalogue_visibility_rollback.sql 2>&1)"
SPCVF_RC=$?
set -e

if [ "$SPCVF_RC" -ne 0 ] || ! echo "$SPCVF_OUT" | grep -q "SP_PILOT_CATALOGUE_VISIBILITY_ROLLBACK ok"; then
  echo ""
  echo "FAIL: the pilot catalogue visibility rollback exited with code ${SPCVF_RC}." >&2
  echo "$SPCVF_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "pilot catalogue visibility rollback"
else
  echo "    ok  the taxonomy read policy is USING (is_active) again; the entitlement can now drop"
fi

echo "==> Verifying the internal-pilot entitlement rollback"
set +e
SPPRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260915090000_sp_market_pilot_entitlement_rollback.sql 2>&1)"
SPPRB_RC=$?
set -e

if [ "$SPPRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the internal-pilot entitlement rollback exited with code ${SPPRB_RC}." >&2
  echo "$SPPRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "internal-pilot entitlement rollback"
else
  echo "    ok  the pilot entitlement rolls back cleanly, Sweden still the only open market"
fi

echo "==> Verifying the Abu Dhabi market pack rollback"
set +e
SPAZRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260914092000_sp_uae_abu_dhabi_market_pack_rollback.sql 2>&1)"
SPAZRB_RC=$?
set -e

if [ "$SPAZRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Abu Dhabi market pack rollback exited with code ${SPAZRB_RC}." >&2
  echo "$SPAZRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "Abu Dhabi market pack rollback"
else
  echo "    ok  Abu Dhabi rolls back cleanly, Dubai and Sweden intact"
fi

echo "==> Verifying the Dubai cadre catalogue rollback"
set +e
SPDCRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260914091000_sp_uae_dubai_cadre_catalogue_rollback.sql 2>&1)"
SPDCRB_RC=$?
set -e

if [ "$SPDCRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Dubai cadre catalogue rollback exited with code ${SPDCRB_RC}." >&2
  echo "$SPDCRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "Dubai cadre catalogue rollback"
else
  echo "    ok  the added cadre categories roll back, the original three survive"
fi

echo "==> Verifying the UK vehicle immobilisation rollback"
set +e
SPNIRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260914090000_sp_uk_vehicle_immobilisation_rollback.sql 2>&1)"
SPNIRB_RC=$?
set -e

if [ "$SPNIRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the UK vehicle immobilisation rollback exited with code ${SPNIRB_RC}." >&2
  echo "$SPNIRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "UK vehicle immobilisation rollback"
else
  echo "    ok  Northern Ireland rolls back cleanly, Great Britain intact"
fi

# The UK title-rule correction is versioned between migrations 3 and 4, so in
# reverse order it unwinds before them. It restores the pre-correction hosted
# rule set on purpose: a rollback puts back what was there, not what should
# have been.
echo "==> Verifying the UK title rule correction rollback"
set +e
SPUKTRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260907092500_sp_uk_title_rules_correction_rollback.sql 2>&1)"
SPUKTRB_RC=$?
set -e

if [ "$SPUKTRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the UK title rule correction rollback exited with code ${SPUKTRB_RC}." >&2
  echo "$SPUKTRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "UK title rule correction rollback"
else
  echo "    ok  the UK title rule correction rolls back to the pre-correction set"
fi

# FIRST in the chain, because it is the newest migration. It adds
# sp_passport_profiles.sub_jurisdiction_code with a foreign key to
# sp_sub_jurisdictions, and the three-market rollback at the far end of this
# chain DROPS that table — so leaving this one out made the whole chain fail
# with "cannot drop table sp_sub_jurisdictions because other objects depend on
# it". Reverse migration order is not a stylistic preference here; it is what
# makes the chain reversible at all.
# FIRST in the chain: 20260910090000 is the newest migration, and the chain runs
# in reverse migration order so each rollback sees the schema its forward
# migration left behind.
# The holder-message guard's rollback runs FIRST in the chain: 20261012090000 is
# the newest Security Passport migration, and the chain runs in reverse
# migration order so each rollback sees the schema its forward migration left.
# It only replaces one function body, so it depends on nothing and destroys
# nothing -- but an unexecuted rollback is a rollback nobody knows works, which
# is what this whole section exists to prevent.
echo "==> Verifying the decision holder-message rollback"
set +e
SPHMRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20261012090000_sp_decision_requires_holder_message_rollback.sql 2>&1)"
SPHMRB_RC=$?
set -e

if [ "$SPHMRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the decision holder-message rollback exited with code ${SPHMRB_RC}." >&2
  echo "$SPHMRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "decision holder-message rollback"
else
  # A reversal, not a demolition: the guard goes, the function stays, every
  # other guard in it stays, and anon still cannot execute it.
  set +e
  SPHMRBQ="$(psql -tAq -d "$TEST_DB" -c "
    SELECT
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide')
      || '|' ||
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide'
          AND p.prosrc LIKE '%SP_DECISION_REQUIRES_HOLDER_MESSAGE%')
      || '|' ||
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide'
          AND p.prosrc LIKE '%SP_SELF_VERIFICATION_FORBIDDEN%')
      || '|' ||
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide'
          AND array_to_string(coalesce(p.proacl, '{}'), ',') LIKE '%anon=%')
  " 2>&1)"
  set -e
  if [ "$SPHMRBQ" = "1|0|1|0" ]; then
    echo "    ok  the guard rolls back, the function and its other guards stay, anon gains nothing"
  else
    echo "FAIL: after the holder-message rollback expected '1|0|1|0'" >&2
    echo "      (function present | guard gone | self-verification bar intact | no anon grant)," >&2
    echo "      got '${SPHMRBQ}'." >&2
    suite_failed "decision holder-message rollback (reversal, not demolition)"
  fi
fi

echo "==> Verifying the pilot bug fix #1 rollback"
set +e
SPBF1RB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260910090000_sp_pilot_bugfix_1_rollback.sql 2>&1)"
SPBF1RB_RC=$?
set -e

if [ "$SPBF1RB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the pilot bug fix #1 rollback exited with code ${SPBF1RB_RC}." >&2
  echo "$SPBF1RB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "pilot bug fix #1 rollback"
else
  echo "    ok  the pilot bug fix #1 rolls back cleanly"
fi

# And it is a REVERSAL, not a demolition. The three functions go; the data the
# feature wrote stays, including entries archived through sp_archive_claim and
# disputes closed through sp_resolve_dispute -- both of which land in lifecycle
# states the schema has understood since Phase 2.
set +e
SPBF1RBQ="$(psql -tAq -d "$TEST_DB" -c "
  SELECT
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('sp_dispute_queue','sp_resolve_dispute','sp_archive_claim'))
    || '|' ||
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = 'bf100000-0000-0000-0000-000000000001')
    || '|' ||
    (SELECT count(*) FROM public.sp_passport_events
      WHERE event_type = 'dispute_resolved')" 2>&1)"
set -e
SPBF1RB_FUNCS="${SPBF1RBQ%%|*}"
SPBF1RB_REST="${SPBF1RBQ#*|}"
SPBF1RB_CLAIMS="${SPBF1RB_REST%%|*}"
SPBF1RB_EVENTS="${SPBF1RB_REST##*|}"

if [ "$SPBF1RB_FUNCS" != "0" ]; then
  echo "FAIL: the pilot bug fix #1 rollback left ${SPBF1RB_FUNCS} of its functions behind." >&2
  suite_failed "pilot bug fix #1 rollback (functions not removed)"
else
  echo "    ok  all three new functions are gone after the rollback"
fi

if [ "${SPBF1RB_CLAIMS:-0}" -lt 1 ] || [ "${SPBF1RB_EVENTS:-0}" -lt 1 ]; then
  echo "FAIL: the rollback destroyed data (claims=${SPBF1RB_CLAIMS}, dispute events=${SPBF1RB_EVENTS})." >&2
  suite_failed "pilot bug fix #1 rollback (data loss)"
else
  echo "    ok  every claim and every dispute-resolution event survived the rollback"
fi

echo "==> Verifying the disclosure holder jurisdiction rollback"
set +e
SPDHJRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260908094000_sp_disclosure_holder_sub_jurisdiction_rollback.sql 2>&1)"
SPDHJRB_RC=$?
set -e

if [ "$SPDHJRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the disclosure holder jurisdiction rollback exited with code ${SPDHJRB_RC}." >&2
  echo "$SPDHJRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "disclosure holder jurisdiction rollback"
else
  echo "    ok  the disclosure holder jurisdiction rolls back cleanly"
fi

echo "==> Verifying the profile work country rollback"
set +e
SPPWCRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260908093000_sp_profile_work_country_rollback.sql 2>&1)"
SPPWCRB_RC=$?
set -e

if [ "$SPPWCRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the profile work country rollback exited with code ${SPPWCRB_RC}." >&2
  echo "$SPPWCRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "profile work country rollback"
else
  echo "    ok  the profile work country rolls back cleanly"
fi

echo "==> Verifying the disclosure scope boundary rollback"
set +e
SPSDBRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260908092000_sp_disclosure_scope_boundary_rollback.sql 2>&1)"
SPSDBRB_RC=$?
set -e

if [ "$SPSDBRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the disclosure scope boundary rollback exited with code ${SPSDBRB_RC}." >&2
  echo "$SPSDBRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "disclosure scope boundary rollback"
else
  echo "    ok  the disclosure scope boundary rolls back cleanly"
fi

# Reverse migration order: 20260908092000 above, then this, then
# 20260908090000 below. It touches only two label columns, but running the
# chain in anything other than reverse order is how an ordering assumption
# stops being tested.
echo "==> Verifying the title label rollback"
set +e
SPTLRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260908091000_sp_title_country_and_training_label_rollback.sql 2>&1)"
SPTLRB_RC=$?
set -e

if [ "$SPTLRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the title label rollback exited with code ${SPTLRB_RC}." >&2
  echo "$SPTLRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "title label rollback"
else
  # Executing without error proves nothing about whether it put the labels
  # back. Assert the values it claims to restore.
  set +e
  SPTLRB_CHECK="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "
    DO \$tl\$
    DECLARE _v text; _o text; _n integer;
    BEGIN
      SELECT name_en INTO _v FROM public.sp_professional_titles
       WHERE code = 'SE_VAKTARE_COMPETENCE';
      IF _v IS DISTINCT FROM 'Security Guard · Sweden' THEN
        RAISE EXCEPTION 'label not restored: SE_VAKTARE_COMPETENCE is %', _v;
      END IF;

      SELECT name_en INTO _o FROM public.sp_professional_titles
       WHERE code = 'SE_ORDNINGSVAKT_TITLE';
      IF _o IS DISTINCT FROM 'Public Order Guard (Ordningsvakt) · Sweden' THEN
        RAISE EXCEPTION 'label not restored: SE_ORDNINGSVAKT_TITLE is %', _o;
      END IF;

      -- The whole point of the forward migration was that the country printed
      -- twice. Rolling back must bring the suffixes back on every pack, or the
      -- rollback is only partially reversing what it claims to reverse.
      SELECT count(*) INTO _n FROM public.sp_professional_titles
       WHERE name_en ~ '(Sweden|United Kingdom|UAE)\\s*\$';
      IF _n < 10 THEN
        RAISE EXCEPTION 'only % title(s) regained a country suffix; expected at least 10', _n;
      END IF;
    END \$tl\$;" 2>&1)"
  SPTLRB_CHECK_RC=$?
  set -e

  if [ "$SPTLRB_CHECK_RC" -ne 0 ]; then
    echo ""
    echo "FAIL: the title label rollback ran but did not restore the labels." >&2
    echo "$SPTLRB_CHECK" | grep -iE "ERROR:|FEL:" | head -5 >&2
    suite_failed "title label rollback (labels not restored)"
  else
    echo "    ok  the title labels roll back, and the previous values are restored"
  fi
fi

# The legacy-scope rollback runs first of all: it restores the trigger to the
# version the UK pack left, which the Dubai/UK/Sweden chain below then unwinds
# in turn.
echo "==> Verifying the legacy scope correction rollback"
set +e
SPLSCRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260908090000_sp_legacy_scope_correctable_rollback.sql 2>&1)"
SPLSCRB_RC=$?
set -e

if [ "$SPLSCRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the legacy scope rollback exited with code ${SPLSCRB_RC}." >&2
  echo "$SPLSCRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "legacy scope correction rollback"
else
  echo "    ok  the legacy scope correction rolls back cleanly"
fi

# Dubai first. The Swedish rollback restores a 16-character limit on credential
# codes and AE_DU_PEOPLE_OF_DETERMINATION is 30 -- so running these out of
# order aborts with ROLLBACK BLOCKED rather than corrupting anything, which is
# how the ordering was established in the first place.
echo "==> Verifying the Dubai market pack rollback"
set +e
SPAERB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260907093000_sp_uae_dubai_market_pack_rollback.sql 2>&1)"
SPAERB_RC=$?
set -e

if [ "$SPAERB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Dubai market pack rollback exited with code ${SPAERB_RC}." >&2
  echo "$SPAERB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "Dubai market pack rollback"
else
  echo "    ok  the Dubai market pack rolls back cleanly, Sweden and the UK intact"
fi

# The UK rollback runs before the Swedish one, which runs before the
# three-market one. Each restores the claim trigger to the version the previous
# migration left, so the chain only unwinds correctly in this order.
echo "==> Verifying the UK market pack rollback"
set +e
SPUKRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260907092000_sp_uk_market_pack_rollback.sql 2>&1)"
SPUKRB_RC=$?
set -e

if [ "$SPUKRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the UK market pack rollback exited with code ${SPUKRB_RC}." >&2
  echo "$SPUKRB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "UK market pack rollback"
else
  echo "    ok  the UK market pack rolls back cleanly, Sweden untouched"
fi

# The Swedish rollback must run FIRST: it restores the claim trigger to the
# three-market version that the next step then replaces with the pre-market
# one. The other order leaves a trigger describing a schema that is gone.
# The adopted verification history must not be deleted by an old rollback.
# Preserve the suite database; use a disposable clone for pre-adoption reversal.
PASSPORT_ROLLBACK_SOURCE_DB="$TEST_DB"
TEST_DB="${PASSPORT_ROLLBACK_SOURCE_DB}_sweden_rollback"
psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
psql_q -d postgres -c "CREATE DATABASE ${TEST_DB} TEMPLATE ${PASSPORT_ROLLBACK_SOURCE_DB};" >/dev/null
# Only generated local fixture accounts owning types removed by this rollback.
# Account erasure honours all cascade/append-only guards; none are disabled.
psql_q -d "$TEST_DB" -c "SELECT 'local fixture accounts removed from rollback clone' AS operation, count(*) FROM auth.users WHERE id IN (SELECT holder_user_id FROM public.sp_claims WHERE credential_code IN ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL'));"
# Holders go before the accounts that verified their claims: erasing a
# verifier first would null verified_by_user_id on a surviving claim, which
# the 20270115090000 stamp guard rightly refuses. Row order inside one DELETE
# is not defined, so the order is made explicit here.
psql_q -d "$TEST_DB" -c "DO \$fixture\$ DECLARE _n int; BEGIN
  CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT DISTINCT holder_user_id AS id FROM public.sp_claims WHERE credential_code IN ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL');
  LOOP
    DELETE FROM auth.users u WHERE u.id IN (SELECT id FROM _gone)
       AND NOT EXISTS (SELECT 1 FROM public.sp_claims c WHERE c.verified_by_user_id = u.id AND c.holder_user_id <> u.id);
    GET DIAGNOSTICS _n = ROW_COUNT;
    EXIT WHEN _n = 0;
  END LOOP;
  DELETE FROM auth.users WHERE id IN (SELECT id FROM _gone);
END \$fixture\$;" >/dev/null
echo "==> Verifying the Swedish truth model rollback"
set +e
# The Swedish rollback REFUSES while any holder row records what an
# authorisation is limited to — dropping authorisation_scope would erase every
# one of them silently. Suite fixtures leave such rows behind, so the refusal
# fires here, correctly.
#
# This database is disposable and recreated from empty on every run, so the
# destruction is both intended and harmless. The override is set explicitly
# rather than by weakening the guard, because that is exactly what it is for:
# a conscious act, visible in the script, rather than a silent side effect.
#
# The refusal itself is proven separately, against real data, by
# supabase/tests/security_passport_rollback_data_safety_test.sql above.
SPSERB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -c "SET sp.rollback_may_delete_holder_claims = 'yes';" \
  -f supabase/rollback/20260907091000_sp_sweden_truth_model_rollback.sql 2>&1)"
SPSERB_RC=$?
set -e

if [ "$SPSERB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the Swedish truth model rollback exited with code ${SPSERB_RC}." >&2
  echo "$SPSERB_OUT" | grep -iE "ROLLBACK|ERROR:|FEL:" | head -10 >&2
  suite_failed "Swedish truth model rollback"
else
  echo "    ok  the Swedish truth model rolls back cleanly, launch credentials intact"
fi

echo "==> Verifying the three-market rollback"
set +e
SP3MRB_OUT="$(psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" \
  -f supabase/rollback/20260907090000_sp_three_market_foundation_rollback.sql 2>&1)"
SP3MRB_RC=$?
set -e

if [ "$SP3MRB_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: the three-market rollback exited with code ${SP3MRB_RC}." >&2
  echo "$SP3MRB_OUT" | grep -iE "ROLLBACK INCOMPLETE|ROLLBACK DAMAGED|ERROR:|FEL:" | head -10 >&2
  suite_failed "three-market rollback"
else
  echo "    ok  the three-market foundation rolls back cleanly, Sweden intact"
  # And a Swedish credential still writes afterwards -- the rollback restored a
  # working trigger, not merely a syntactically valid one.
  set +e
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -c "
    DO \$rb\$
    DECLARE _h uuid := '00000000-0000-0000-0000-00000000fb01';
    BEGIN
      INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;
      INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
      VALUES (_h, 'training', 'VU1 after rollback', 'VU1');
      DELETE FROM public.sp_claims WHERE holder_user_id = _h;
    END \$rb\$;" >/dev/null 2>&1
  SP3MRB_WRITE_RC=$?
  set -e
  if [ "$SP3MRB_WRITE_RC" -ne 0 ]; then
    echo "FAIL: after rollback a Swedish VU1 can no longer be written." >&2
    suite_failed "three-market rollback (post-rollback write)"
  else
    echo "    ok  a Swedish VU1 still writes through the restored trigger"
  fi
fi

# ---------------------------------------------------------------------------
# The correction path, phase 2 of 2: after all 7 rollbacks. This is the
# assertion the original 35 shape assertions could not make -- they proved the
# columns were gone while holder correction was silently broken.
# ---------------------------------------------------------------------------
echo "==> Running Security Passport rollback correction assertions (after)"
set +e
SPRCA_OUT="$(psql -v ON_ERROR_STOP=1 -v phase=after -q -d "$TEST_DB" \
  -f supabase/tests/security_passport_rollback_correction_test.sql 2>&1)"
SPRCA_RC=$?
set -e

echo "$SPRCA_OUT" | grep -E "GROUP |ok  |ASSERTION FAILED" | sed 's/^.*NOTICE:  /    /;s/^.*NOTIS:  /    /' || true
SPRC_PASSED="$(echo "$SPRCA_OUT" | grep -c "ok  " || true)"

if [ "$SPRCA_RC" -ne 0 ]; then
  echo ""
  echo "FAIL: after the rollback chain a holder can no longer correct a claim (code ${SPRCA_RC})." >&2
  echo "$SPRCA_OUT" | grep -iE "ASSERTION FAILED|ERROR:|FEL:" | head -10 >&2
  suite_failed "Security Passport rollback correction (after)"
elif [ "$SPRC_PASSED" -lt 4 ]; then
  echo "FAIL: expected at least 4 post-rollback correction assertions, only ${SPRC_PASSED} ran." >&2
  suite_failed "Security Passport rollback correction (assertion shortfall: floor 4)"
fi

# ---------------------------------------------------------------------------
# 7. Tidy up
# ---------------------------------------------------------------------------
if [ "${KEEP_TEST_DB:-0}" = "1" ]; then
  echo "==> Keeping ${TEST_DB} (KEEP_TEST_DB=1)"
else
  psql_q -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
fi

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
echo "              ${MS_PASSED} employer membership standing assertions,"
echo "              ${RM_PASSED} employer report access matrix assertions,"
echo "              ${RA_PASSED} employer report access model assertions,"
echo "              ${IC_PASSED} interview case access model assertions,"
echo "              ${SW_PASSED} Security Work assertions in each rollback round,"
echo "              ${SW_NC_PASSED} Security Work planted-defect controls,"
echo "              ${CD_PASSED} Career Discovery assertions,"
echo "              ${CD31_PASSED} Career Discovery v3.1 assertions,"
echo "              ${CDC_PASSED} v3.1 completion + stability assertions,"
echo "              ${PUB_PASSED} public v3.1 flow assertions,"
echo "              ${CDAV_PASSED} Career Discovery availability matrix assertions (4 planted controls),"
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
echo "              ${RBRIEF_PASSED} recruitment brief + interview guide assertions,"
echo "              ${RJOURNEY_PASSED} recruitment journey assertions,"
echo "              ${LBRIDGE_PASSED} lifecycle bridge assertions,"
echo "              ${GATE_PASSED} pilot security-gate assertions,"
echo "              ${REV_PASSED} employer response-reviewer assertions,"
echo "              ${SPINE_PASSED} person identity spine assertions,"
echo "              ${E2E_PASSED} workforce lifecycle E2E assertions,"
echo "              ${LIB_PASSED} content library + maturity-isolation assertions,"
echo "              ${TRJ_PASSED} training delivery journey assertions,"
echo "              ${PM_PASSED} employer people model assertions,"
echo "              ${IIP_PASSED} Role Interview Pack governance assertions,"
echo "              ${IVR_PASSED} Interview Intelligence runtime assertions,"
echo "              ${IVI_PASSED} Interview Intelligence integrity assertions,"
echo "              ${TRUST_PASSED} CQrity TRUST method assertions,"
echo "              ${ROLLBACK_PASSED} rollback assertions,"
echo "              ${SPAP_PASSED} application-disclosure assertions,"
echo "              ${SPSK_PASSED} skill/language taxonomy assertions,"
echo "              ${ARCH_PASSED} job archive assertions,"
echo "              ${ACC_PASSED} admin lifecycle assertions,"
echo "              ${ACX_PASSED} admin assignment cancellation assertions,"
echo "              ${LIFE_PASSED} job lifecycle + notification assertions,"
echo "              ${STDR_PASSED} standard recruitment availability assertions,"
echo "              ${OOI_PASSED} option-order integrity assertions,"
echo "              ${SP3M_PASSED} three-market foundation assertions,"
echo "              ${SPSE_PASSED} Swedish truth model assertions,"
echo "              ${SPUK_PASSED} UK market pack assertions,"
echo "              ${SPUKT_PASSED} UK title rule assertions,"
echo "              ${SPAE_PASSED} Dubai market pack assertions,"
echo "              ${SPPILOT_PASSED} internal-pilot entitlement assertions,"
echo "              ${SPGC_PASSED} global certification assertions,"
echo "              ${SPGCRA_PASSED} global certification rollback data-safety assertions,"
echo "              ${SPLSC_PASSED} legacy scope correction assertions,"
echo "              ${SPSDB_PASSED} scope disclosure boundary assertions,"
echo "              ${SPRDS_PASSED} rollback data-safety assertions"
echo "              ${SPBF1_PASSED} pilot bug fix #1 assertions,"
echo "              ${SPTB_PASSED} trust boundary assertions,"
echo "              ${SPTSC_PASSED} trust-source containment assertions,"
echo "              ${SPNS_PASSED} Passport number and social share assertions,"
echo "              ${EEV_PASSED} employer employment verification assertions,"
echo "              ${RACE_PASSED} concurrent-decision assertions,"
echo "              ${SPFM_PASSED} first-merit assertions,"
echo "              ${FMR_PASSED} concurrent first-merit assertions,"
echo "              ${TWO_OPS_PASSED} two-operation first-merit race assertions,"
echo "              ${SPRC_PASSED} rollback correction assertions,"
echo "              ${E2PP_PASSED} E2 issuer participant-preview assertions,
              ${BI_PASSED} employer final-report basis assertions,
              ${BG_PASSED} BESKT governed-content assertions,
              ${AUT_PASSED} BESKT content-authoring assertions,
              ${BGR_PASSED} BESKT one-open-version race assertions,
              ${BGP_PASSED} BESKT child-write versus publication race assertions,
              ${BGD_PASSED} BESKT rollback planted-dependency assertions,
              ${BCP_PASSED} BESKT candidate-preparation assertions,
              ${BRG_PASSED} BESKT interview-case bridge assertions,
              ${CND_PASSED} BESKT interview-conduct assertions,
              ${RPT_PASSED} BESKT prompts-and-report assertions"
echo "===================================================="
