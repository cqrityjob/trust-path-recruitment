#!/usr/bin/env bash
# Negative controls for supabase/tests/security_work_supplier_cycle_test.sql.
#
# Each control opens a transaction, weakens exactly one protection of
# 20270330090000 (rewriting a live function body with replace() on its own
# definition, dropping a trigger, index or policy), then runs the positive
# suite inside that same transaction. The control passes only if the suite
# fails on the ONE assertion that names that protection. The session ends on
# the error, so the transaction -- weakened schema included -- is discarded.
# A replace() that matches nothing is itself a failure.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) echo 'REFUSING: local disposable database only' >&2; exit 2;; esac
: "${TEST_DB:?TEST_DB must name the disposable current-schema database}"
case "$TEST_DB" in *ci_test*) ;; *) echo 'FAIL: isolated ci_test database required' >&2; exit 1;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUITE="$ROOT/supabase/tests/security_work_supplier_cycle_test.sql"
LOG="$(mktemp "${TMPDIR:-/tmp}/sw-supplier-nc.XXXXXX")"
trap 'rm -f "$LOG"' EXIT

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
  echo "    ok  SW-SUP-NC $name detected by '$label'"
}

control 'only the sharing right releases' 'an editor without the sharing right cannot release anything externally' \
  "$(mutate 'sw_private.approve_supplier_share(uuid,uuid,uuid,integer,text,text)' "IF NOT sw_private.can_share(_workspace_id) THEN" "IF false THEN")"
control 'the external version is minimised' 'the sharing right approves an exact external version: reference, task, clause; no internal criteria or risk' \
  "$(mutate 'sw_private.supplier_share_content(public.sw_supplier_requests)' "'responseInstruction', _r.response_instruction," "'responseInstruction', _r.response_instruction, 'verificationCriteria', _r.verification_criteria,")"
control 'edited content makes the share stale' 'changing the external content withdraws the approval and marks the shared version stale' \
  "$(mutate 'sw_private.save_supplier_request(uuid,uuid,uuid,integer,jsonb)' "share_stale = share_version IS NOT NULL" "share_stale = false")"
control 'dispatch needs an approved version' 'nothing is sent before an approved external version exists' \
  "$(mutate 'sw_private.record_supplier_dispatch(uuid,uuid,uuid,integer,text,text,timestamptz)' "IF r.share_version IS NULL OR r.share_stale THEN" "IF false THEN")"
control 'an obligation must be confirmed' 'an unconfirmed obligation is not a contractual basis' \
  "$(mutate 'sw_private.check_supplier_basis(public.sw_supplier_requests)' "AND o.confirmed AND o.status = 'active' AND c.verified" "AND o.status = 'active'")"
control 'a confirmed obligation is history' 'a confirmed obligation is history: its content cannot change' \
  "$(mutate 'sw_private.guard_obligation()' "IF OLD.confirmed THEN" "IF false THEN")"
control 'an order needs a scope and cost decision' 'another kind of decision does not authorise an order' \
  "$(mutate 'sw_private.check_supplier_basis(public.sw_supplier_requests)' "AND d.decision = 'scope_cost'" "")"
control 'approvals for risk, cost and deviation' 'accepting a risk needs the approval right' \
  "$(mutate 'sw_private.guard_decision()' "IF NEW.decision IN ('accept_risk', 'scope_cost', 'close_with_deviation') AND NOT" "IF false AND NOT")"
control 'done does not complete the action' "the supplier's \"done\" does not complete the action" \
  'DROP TRIGGER sw_27_supplier_work ON public.sw_actions;'
control 'only the verifier right accepts' 'an editor without the verifier right cannot accept' \
  "$(mutate 'sw_private.verify_supplier_response(uuid,uuid,uuid,integer,uuid,text,text,text,text)' "IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'" "IF false THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'")"
control 'only the latest done is verified' 'only the latest "done" of the cycle can be verified' \
  "$(mutate 'sw_private.verify_supplier_response(uuid,uuid,uuid,integer,uuid,text,text,text,text)' "IF _resp.id IS NULL OR _resp.id <> _response_id THEN" "IF _resp.id IS NULL THEN")"
control 'concurrent verifiers conflict' 'a second verifier on the same version gets a conflict, not a second outcome' \
  "$(mutate 'sw_private.supplier_request_locked(uuid,uuid,integer)' "IF _expected_version IS NOT NULL AND r.version <> _expected_version THEN" "IF false THEN")"
control 'one acceptance per cycle' 'at most one acceptance per cycle, whatever runs concurrently' \
  'DROP INDEX public.sw_supplier_verifications_one_acceptance;'
control 'an operation id is one command' 'an operation id cannot be reused for another command' \
  "$(mutate 'sw_private.supplier_replayed(uuid,uuid,uuid,text)' "IF e.event <> _event OR (_request_id IS NOT NULL AND e.request_id <> _request_id) OR e.actor_user_id IS DISTINCT FROM auth.uid() THEN" "IF false THEN")"
control 'a separate verifier for critical requests' 'a critical request needs a verifier other than its internal owner' \
  "$(mutate 'sw_private.verify_supplier_response(uuid,uuid,uuid,integer,uuid,text,text,text,text)' "IF r.requires_separate_verifier AND" "IF false AND")"
control 'reopening needs an approver' 'reopening needs the approval right' \
  "$(mutate 'sw_private.reopen_supplier_request(uuid,uuid,uuid,integer,text)' "IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'" "IF false THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'")"
control 'responses are history' 'responses are history: they cannot be rewritten' \
  'DROP TRIGGER sw_00_immutable ON public.sw_supplier_responses;'
control 'requests follow the restricted action' 'an editor outside the restricted circle reads nothing of its supplier request, decisions or their history' \
  'DROP POLICY sw_member_read ON public.sw_supplier_requests; CREATE POLICY sw_member_read ON public.sw_supplier_requests FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'
control 'request history follows the action' 'an editor outside the restricted circle reads nothing of its supplier request, decisions or their history' \
  "$(mutate 'sw_private.can_see_supplier_request(uuid,uuid)' "AND sw_private.can_see_record(_workspace_id, 'action', r.action_id));" "AND true);")"
control 'commands follow the restricted action' 'nor can act on it' \
  "$(mutate 'sw_private.supplier_request_locked(uuid,uuid,integer)' "IF r.id IS NULL OR NOT sw_private.can_read(_workspace_id) OR NOT sw_private.can_see_record(_workspace_id, 'action', r.action_id) THEN" "IF r.id IS NULL THEN")"
control 'a replay re-checks current access' 'after leaving the circle, a retry of the earlier operation reveals nothing of the updated request' \
  "$(mutate 'sw_private.supplier_replayed(uuid,uuid,uuid,text)' "    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN e.request_id;" "    NULL;
  END IF;
  RETURN e.request_id;")"
control 'the separate-verifier requirement is locked' 'an ordinary edit cannot lower the separate-verifier requirement' \
  "$(mutate 'sw_private.save_supplier_request(uuid,uuid,uuid,integer,jsonb)' "RAISE EXCEPTION 'SW_SEPARATE_VERIFIER_LOCKED'" "RAISE NOTICE 'SW_SEPARATE_VERIFIER_LOCKED'")"

[ "$passed" -ge 22 ] || { echo "FAIL: supplier-cycle negative-control shortfall: $passed (floor 22)"; exit 1; }
echo "    ok  $passed supplier-cycle negative controls detected by their original assertions"
