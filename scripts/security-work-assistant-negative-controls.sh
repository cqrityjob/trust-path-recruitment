#!/usr/bin/env bash
# Negative controls for supabase/tests/security_work_assistant_dispatch_test.sql.
#
# Each control opens a transaction, weakens exactly one protection of
# 20270326090000 (rewriting a live function body with replace() on its own
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
SUITE="$ROOT/supabase/tests/security_work_assistant_dispatch_test.sql"
LOG="$(mktemp "${TMPDIR:-/tmp}/sw-assistant-nc.XXXXXX")"
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
  echo "    ok  SW-AST-NC $name detected by '$label'"
}

control 'single dispatch fence' 'a second dispatch of the same operation is never granted' \
  "$(mutate 'sw_private.dispatch_processing(uuid,uuid)' "IF j.status<>'reserved' THEN RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',false); END IF;" "")"
control 'revocation checked at dispatch' 'a revoked activation cannot dispatch an earlier reservation' \
  "$(mutate 'sw_private.dispatch_processing(uuid,uuid)' "IF j.kind='assistant' THEN" "IF false THEN")"
control 'operation bound to its input' 'the same operation id with a different input is refused' \
  "$(mutate 'sw_private.reserve_assistant(uuid,uuid,uuid,jsonb)' "OR j.input_hash <> h" "")"
control 'shared daily budget' 'the workspace daily budget stops the next reservation' \
  "$(mutate 'sw_private.reserve_assistant(uuid,uuid,uuid,jsonb)' "+ cfg.max_cost_micros > cfg.daily_budget_micros" "> cfg.daily_budget_micros * 100")"
control 'assistant output stored' 'a signed assistant result is stored with its measured cost' \
  "$(mutate 'sw_private.complete_processing(uuid,uuid,uuid,text,text,text)' "output=CASE WHEN j.kind IN ('ai','assistant') THEN" "output=CASE WHEN j.kind='ai' THEN")"
control 'suggestion requires a succeeded job' 'no suggestion from an outcome_unknown job' \
  'ALTER TABLE public.sw_ai_suggestions DISABLE TRIGGER sw_15_suggestion_job;'
control 'suggestion equals signed output' 'content other than the signed result is refused' \
  "$(mutate 'sw_private.require_suggestion_job()' "OR NEW.content IS DISTINCT FROM j.output" "")"
control 'all-or-nothing application' 'a failing third record aborts the whole application' \
  "$(mutate 'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)' "INSERT INTO public.sw_protected_assets(workspace_id, name, description, category, business_importance, status)
        VALUES (_workspace_id, _item->>'name', _item->>'description', _item->>'category', 'medium', 'active')
        RETURNING id INTO _id;" "BEGIN
        INSERT INTO public.sw_protected_assets(workspace_id, name, description, category, business_importance, status)
        VALUES (_workspace_id, _item->>'name', _item->>'description', _item->>'category', 'medium', 'active')
        RETURNING id INTO _id;
        EXCEPTION WHEN check_violation THEN CONTINUE;
        END;")"
control 'one decision per suggestion' 'a second approver cannot apply the same suggestion again' \
  "$(mutate 'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)' "s.decided_by = auth.uid() AND " "")"
control 'target version enforced' 'a stale mandate version conflicts' \
  "$(mutate 'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)' "WHERE workspace_id = _workspace_id AND version = (_apply->>'version')::integer" "WHERE workspace_id = _workspace_id")"
control 'rejection applies nothing' 'a rejection cannot apply anything' \
  "$(mutate 'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)' "OR (_status = 'rejected' AND _kind <> 'none')" "")"
control 'no anonymous execution' 'two new RPCs are executable by authenticated only' \
  'GRANT EXECUTE ON FUNCTION public.sw_decide_suggestion(uuid,uuid,integer,text,text,jsonb) TO anon;'

[ "$passed" -ge 12 ] || { echo "FAIL: assistant negative-control shortfall: $passed (floor 12)"; exit 1; }
echo "    ok  $passed assistant negative controls detected by their original assertions"
