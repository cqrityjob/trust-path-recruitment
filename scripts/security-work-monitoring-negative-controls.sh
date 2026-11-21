#!/usr/bin/env bash
# Negative controls for supabase/tests/security_work_monitoring_impact_test.sql.
#
# Each control opens a transaction, weakens exactly one protection of
# 20270328090000 (rewriting a live function body with replace() on its own
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
SUITE="$ROOT/supabase/tests/security_work_monitoring_impact_test.sql"
LOG="$(mktemp "${TMPDIR:-/tmp}/sw-monitoring-nc.XXXXXX")"
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
  echo "    ok  SW-MON-NC $name detected by '$label'"
}

control 'health cannot be claimed' 'nobody can claim coverage by writing source health' \
  "$(mutate 'sw_private.guard_feed_source()' "IF NOT _in_fetch AND (" "IF false AND (")"
control 'host allowlist' 'an official feed on an unapproved host is refused' \
  "$(mutate 'sw_private.guard_feed_source()' "RAISE EXCEPTION 'SW_FEED_HOST_NOT_APPROVED' USING ERRCODE = '23514';" "NULL;")"
control 'fetched items need a signed run' 'a client cannot forge a fetched item' \
  'ALTER TABLE public.sw_source_items DISABLE TRIGGER sw_07_fetched_item;'
control 'receipt signature' 'an unsigned fetch receipt is refused' \
  "$(mutate 'sw_private.record_fetch(uuid,uuid,uuid,text,text,text)' "PERFORM sw_private.check_receipt('fetch', _run_id, _source_id, _key_id, _payload, _signature);" "")"
control 'copies are not corroboration' 'a copied story joins its cluster without adding an independent source' \
  "$(mutate 'sw_private.record_fetch(uuid,uuid,uuid,text,text,text)' "least(count(DISTINCT si.publisher), count(DISTINCT si.content_hash))" "count(DISTINCT si.publisher)")"
control 'new evidence flags approved briefs' 'new evidence in a cited story raises a review flag' \
  "$(mutate 'sw_private.record_fetch(uuid,uuid,uuid,text,text,text)' "AND EXISTS (SELECT 1 FROM public.sw_cluster_items ci WHERE ci.cluster_id = _cluster AND ci.source_item_id = ANY(b.evidence_item_ids))" "AND false")"
control 'evidence built by the database' 'evidence is built by the database from the cited item; a supplied one is discarded' \
  "$(mutate 'sw_private.guard_change_brief()' "NEW.evidence := _evidence;" "NULL;")"
control 'approval needs an approver' 'an editor cannot approve an impact brief' \
  "$(mutate 'sw_private.guard_change_brief()' "IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'" "IF false THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED'")"
control 'approved briefs are final' 'an approved brief is immutable' \
  "$(mutate 'sw_private.guard_change_brief()' "        RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;" "        NULL;
      END IF;
      RETURN NEW;")"
control 'applied once' 'a brief is applied once' \
  "$(mutate 'sw_private.apply_change_brief(uuid,uuid,integer,uuid,jsonb)' "IF a.id = _request_id AND a.request_hash = _hash AND a.applied_by = auth.uid() THEN RETURN a; END IF;
    RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409';" "IF a.id = _request_id AND a.request_hash = _hash AND a.applied_by = auth.uid() THEN RETURN a; END IF;")"
control 'need-to-know for briefs' 'a brief in a restricted mission is invisible outside its circle' \
  'DROP POLICY sw_brief_read ON public.sw_change_briefs; CREATE POLICY sw_brief_read ON public.sw_change_briefs FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));'

[ "$passed" -ge 11 ] || { echo "FAIL: monitoring negative-control shortfall: $passed (floor 11)"; exit 1; }
echo "    ok  $passed monitoring negative controls detected by their original assertions"
