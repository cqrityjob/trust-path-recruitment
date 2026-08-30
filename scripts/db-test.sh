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
echo "==> Migration safety policy"
bun run scripts/migration-safety-check.ts

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
if [ "$SCP_TABLES" -ne 125 ]; then
  echo "FAIL: expected 125 scp_ tables (23 PR-A + 15 graph + 23 Academy + 1 report snapshot + 1 fixture access + 1 test grants + 1 follow-up prompts + 1 employer decisions + 1 review rubric scores + 2 training delivery + 1 employer response reviewers + 1 form blocks + 1 interview guide prompts + 1 interview notes + 1 participant invitations + 13 role interview pack + 7 interview knowledge layer + 21 interview runtime + 1 candidate corrections + 2 panel review + 4 CQrity TRUST + 3 TRUST conduct layer), found $SCP_TABLES" >&2
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
  # not happen, which reads exactly like a fixed defect.
  if [ "$SPLSC_PASSED" -lt 14 ]; then
    echo "FAIL: expected at least 14 legacy scope assertions, only ${SPLSC_PASSED} ran." >&2
    suite_failed "Security Passport legacy scope correction (assertion shortfall: floor 14)"
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
echo "              ${LIFE_PASSED} job lifecycle + notification assertions,"
echo "              ${STDR_PASSED} standard recruitment availability assertions,"
echo "              ${SP3M_PASSED} three-market foundation assertions,"
echo "              ${SPSE_PASSED} Swedish truth model assertions,"
echo "              ${SPUK_PASSED} UK market pack assertions,"
echo "              ${SPUKT_PASSED} UK title rule assertions,"
echo "              ${SPAE_PASSED} Dubai market pack assertions,"
echo "              ${SPPILOT_PASSED} internal-pilot entitlement assertions,"
echo "              ${SPLSC_PASSED} legacy scope correction assertions,"
echo "              ${SPSDB_PASSED} scope disclosure boundary assertions,"
echo "              ${SPRDS_PASSED} rollback data-safety assertions"
echo "              ${SPBF1_PASSED} pilot bug fix #1 assertions,"
echo "              ${SPTB_PASSED} trust boundary assertions,"
echo "              ${RACE_PASSED} concurrent-decision assertions,"
echo "              ${SPRC_PASSED} rollback correction assertions"
echo "===================================================="
