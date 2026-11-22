#!/usr/bin/env bash
# Negative controls for supabase/tests/security_work_restricted_records_test.sql.
#
# Each control opens a transaction, weakens exactly one protection of
# 20270329090000 (rewriting a live function body with replace() on its own
# definition, disabling a trigger or widening a grant), then runs the positive
# suite inside that same transaction. The control passes only if the suite
# fails on the ONE assertion that names that protection. The session ends on
# the error, so the transaction -- weakened schema included -- is discarded.
# A replace() that matches nothing is itself a failure: a control that plants
# no defect proves nothing.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) echo 'REFUSING: local disposable database only' >&2; exit 2;; esac
: "${TEST_DB:?TEST_DB must name the disposable current-schema database}"
case "$TEST_DB" in *ci_test*) ;; *) echo 'FAIL: isolated ci_test database required' >&2; exit 1;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUITE="$ROOT/supabase/tests/security_work_restricted_records_test.sql"
LOG="$(mktemp "${TMPDIR:-/tmp}/sw-restricted-nc.XXXXXX")"
trap 'rm -f "$LOG"' EXIT

# Rewrites one function body inside the open transaction; fails if the text is absent.
mutate() { # regprocedure, search, replacement
  cat <<SQL
DO \$m\$
DECLARE def text := pg_get_functiondef('$1'::regprocedure);
BEGIN
  IF position(\$s\$$2\$s\$ IN def) = 0 THEN RAISE EXCEPTION 'NEGATIVE CONTROL SETUP: pattern not found in $1'; END IF;
  EXECUTE replace(def, \$s\$$2\$s\$, \$r\$$3\$r\$);
END
\$m\$;
SQL
}

passed=0
control() { # name, expected assertion label, defect SQL
  local name="$1" label="$2" defect="$3"
  if { printf 'BEGIN;\n%s\n' "$defect"; cat "$SUITE"; } | psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -f - >"$LOG" 2>&1; then
    cat "$LOG"; echo "NEGATIVE CONTROL FAILED: $name -- the weakened protection escaped the suite"; exit 1
  fi
  if grep -q 'NEGATIVE CONTROL SETUP' "$LOG"; then
    grep 'NEGATIVE CONTROL SETUP' "$LOG"; echo "NEGATIVE CONTROL FAILED: $name planted nothing"; exit 1
  fi
  if ! grep -Fq -e "ASSERTION FAILED: $label" -e "$label unexpectedly succeeded" -e "$label expected" "$LOG"; then
    grep -E 'ERROR|FEL' "$LOG" | head -3; echo "NEGATIVE CONTROL FAILED: $name -- failed for a different reason than '$label'"; exit 1
  fi
  passed=$((passed + 1))
  echo "    ok  SW-RRC-NC $name detected by '$label'"
}

control 'derived records are scoped' "the derived risk and actions carry the restricted mission's scope" \
  "$(mutate 'sw_private.apply_change_brief(uuid,uuid,integer,uuid,jsonb)' "coalesce(_apply->'risk'->>'threatScenario', ''), 'monitoring', b.mission_id)" "coalesce(_apply->'risk'->>'threatScenario', ''), 'monitoring', NULL)")"
control 'scoped risks are need-to-know' 'an editor outside the circle reads nothing of the derived records or what points at them' \
  'DROP POLICY sw_member_read ON public.sw_risks; CREATE POLICY sw_member_read ON public.sw_risks FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'evidence links follow the record' 'an editor outside the circle reads nothing of the derived records or what points at them' \
  'DROP POLICY sw_member_read ON public.sw_evidence_links; CREATE POLICY sw_member_read ON public.sw_evidence_links FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'history follows the record' 'an editor outside the circle reads nothing of the derived records or what points at them' \
  'DROP POLICY sw_member_read ON public.sw_audit_events; CREATE POLICY sw_member_read ON public.sw_audit_events FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'owners do not bypass the circle' 'a workspace owner outside the circle neither reads nor changes them' \
  "$(mutate 'sw_private.can_see_scope(uuid,uuid)' "SELECT _mission_id IS NULL OR" "SELECT sw_private.can_manage(_workspace_id) OR _mission_id IS NULL OR")"
control 'actions on a scoped risk are scoped' 'an action added later to the risk inherits its scope' \
  "$(mutate 'sw_private.guard_record_scope()' "      IF TG_OP = 'INSERT' AND NEW.access_mission_id IS NULL THEN NEW.access_mission_id := _risk_scope; END IF;
      IF _risk_scope IS NOT NULL AND NEW.access_mission_id IS DISTINCT FROM _risk_scope THEN" "      IF false THEN")"
control 'the scope is immutable' 'the scope cannot be cleared' \
  "$(mutate 'sw_private.guard_record_scope()' "IF TG_OP = 'UPDATE' AND NEW.access_mission_id IS DISTINCT FROM OLD.access_mission_id THEN" "IF false THEN")"
control 'scoped risks stay out of assessments' 'a scoped risk cannot join an assessment, whose revision would copy it unscoped' \
  "$(mutate 'sw_private.guard_record_scope()' "IF NEW.access_mission_id IS NOT NULL AND NEW.assessment_id IS NOT NULL THEN" "IF false THEN")"
control 'the assistant refuses scoped context' 'the assistant refuses a scoped risk as context' \
  'ALTER TABLE public.sw_processing_jobs DISABLE TRIGGER sw_06_assistant_scope;'
control 'accepting needs an approver' 'an editor without approval rights cannot accept a mission review' \
  "$(mutate 'sw_private.guard_mission()' "IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'" "IF false THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'")"
control 'the stamp is the database''s' 'the acceptance stamp cannot be written by a client' \
  "$(mutate 'sw_private.guard_mission()' "NEW.review_accepted_by := OLD.review_accepted_by; NEW.review_accepted_at := OLD.review_accepted_at;" "")"
control 'changing the brief withdraws acceptance' 'changing the reviewed brief withdraws the acceptance' \
  "$(mutate 'sw_private.guard_mission()' "    NEW.review_state := 'changes_requested';" "")"

control 'history is written with its scope' 'an editor outside the circle reads nothing of the derived records or what points at them' \
  "$(mutate 'sw_private.record_change()' "sw_private.audit_scope(TG_TABLE_NAME, _row));" "'{}'::uuid[]);")"
control 'history scope comes from the row, not a later lookup' "an editor outside the circle reads no history of the restricted record's links, assets, controls or deleted citation" \
  "$(mutate 'sw_private.record_change()' "sw_private.audit_scope(TG_TABLE_NAME, _row));" "array_remove(ARRAY[sw_private.record_scope(_workspace, TG_TABLE_NAME, _entity::text)], NULL));")"
control 'restricted records stay out of reports' "a restricted mission's risk never enters a workspace report, not even from inside the circle" \
  "$(mutate 'sw_private.guard_report_scope()' "IF EXISTS (SELECT 1 FROM unnest(_sources) m WHERE" "IF false AND EXISTS (SELECT 1 FROM unnest(_sources) m WHERE")"
control 'the report scope is the database'"'"'s' "the report's mission list is the database's, not the client's" \
  "$(mutate 'sw_private.guard_report_scope()' "    NEW.mission_scope := OLD.mission_scope;
    RETURN NEW;" "    RETURN NEW;")"
control 'reports follow a restricted mission' 'once the mission is restricted its records, report, assistant result and their history leave the outsiders' \
  'DROP POLICY sw_member_read ON public.sw_management_reports; CREATE POLICY sw_member_read ON public.sw_management_reports FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'assistant results follow a restricted mission' 'once the mission is restricted its records, report, assistant result and their history leave the outsiders' \
  'DROP POLICY sw_member_read ON public.sw_ai_suggestions; CREATE POLICY sw_member_read ON public.sw_ai_suggestions FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'a report scope only grows' "the circle refreshes the facts; the report keeps the restricted mission in its scope" \
  "$(mutate 'sw_private.guard_report_scope()' "FROM unnest(_previous || _sources) m;" "FROM unnest(_sources) m;")"

[ "$passed" -ge 19 ] || { echo "FAIL: restricted-records negative-control shortfall: $passed (floor 19)"; exit 1; }
echo "    ok  $passed restricted-records negative controls detected by their original assertions"
