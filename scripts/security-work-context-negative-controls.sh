#!/usr/bin/env bash
# Negative controls for supabase/tests/security_work_context_missions_test.sql.
#
# Each control opens a transaction, weakens exactly one protection of
# 20270327090000 (rewriting a live function body with replace() on its own
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
SUITE="$ROOT/supabase/tests/security_work_context_missions_test.sql"
LOG="$(mktemp "${TMPDIR:-/tmp}/sw-context-nc.XXXXXX")"
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
  echo "    ok  SW-CTX-NC $name detected by '$label'"
}

control 'need-to-know' 'a restricted mission and everything under it is absent for a non-member viewer' \
  "$(mutate 'sw_private.can_see_mission(uuid,uuid)' "AND (NOT m.restricted OR" "AND (true OR")"
control 'next profile version only' 'a second version 1 is a conflict, not a fork' \
  'ALTER TABLE public.sw_operating_profiles DISABLE TRIGGER sw_20_profile;'
control 'mission lifecycle' 'created cannot jump to needs review' \
  "$(mutate 'sw_private.guard_mission()' "WHEN 'created' THEN ARRAY['collecting'," "WHEN 'created' THEN ARRAY['needs_review', 'collecting',")"
control 'completion needs accepted review' 'a mission under review cannot be completed before acceptance' \
  'ALTER TABLE public.sw_missions DROP CONSTRAINT sw_missions_check;'
control 'a completed mission is final' 'a completed mission is final' \
  "$(mutate 'sw_private.guard_mission()' "IF OLD.execution_state IN ('completed', 'cancelled', 'failed', 'outcome_unknown') AND" "IF false AND")"
control 'invitation bound to e-mail' 'the right code from the wrong account is refused' \
  "$(mutate 'sw_private.accept_invitation(text)' "OR i.email IS DISTINCT FROM _email " "")"
control 'last owner protected' 'the last active owner cannot step down' \
  "$(mutate 'sw_private.set_member_role(uuid,uuid,text,boolean,boolean)' "RAISE EXCEPTION 'SW_LAST_OWNER' USING ERRCODE = '23514';" "NULL;")"
control 'ownership transfer is not an editing right' 'an ordinary mission editor cannot make themself the owner' \
  "$(mutate 'sw_private.guard_mission()' "AND NOT sw_private.can_manage(NEW.workspace_id) THEN
      RAISE EXCEPTION 'SW_MISSION_OWNER_REQUIRED'" "AND false THEN
      RAISE EXCEPTION 'SW_MISSION_OWNER_REQUIRED'")"
control 'restricted ownership stays inside the circle' 'ownership of a restricted mission cannot go to someone outside its circle' \
  "$(mutate 'sw_private.guard_mission()' "RAISE EXCEPTION 'SW_OWNER_OUTSIDE_CIRCLE' USING ERRCODE = '23514';" "NULL;")"
control 'no anonymous execution' 'no new function is executable by anon or service_role' \
  'GRANT EXECUTE ON FUNCTION public.sw_accept_invitation(text) TO anon;'

[ "$passed" -ge 10 ] || { echo "FAIL: context negative-control shortfall: $passed (floor 10)"; exit 1; }
echo "    ok  $passed context negative controls detected by their original assertions"
