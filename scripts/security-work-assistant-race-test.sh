#!/usr/bin/env bash
# Two real connections against committed synthetic fixtures in db-test's
# disposable *_sw_race clone (20270326090000):
#   1. a double click: two sessions reserve and dispatch the SAME operation at
#      the same moment -> the second WAITS on the workspace lock, then receives
#      the same job and dispatch=false. Exactly one fence is ever handed out.
#   2. two approvers decide the SAME suggestion at the same moment -> the second
#      WAITS on the suggestion row, then gets SW_CONFLICT; exactly one set of
#      records exists.
# Each race asserts that the second session actually waited (pg_locks), so a
# pass cannot come from the two sessions simply not overlapping.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) exit 2;; esac
case "${PGDATABASE:-}" in *_sw_race) ;; *) echo 'Requires disposable *_sw_race database' >&2; exit 2;; esac
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sw-assistant-race.XXXXXX")"
trap 'rm -rf "$LOG_DIR"' EXIT
q() { psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }
as() { echo "SET ROLE authenticated; SET request.jwt.claim.sub='$1'; SET request.jwt.claims='{\"sub\":\"$1\",\"role\":\"authenticated\",\"is_anonymous\":false}';"; }
EDITOR=56000000-0000-4000-8000-000000000001
OTHER=56000000-0000-4000-8000-000000000002
ACT=56000000-0000-4000-8000-000000000040
q -c "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('$EDITOR','assistant-race-a@example.test',now()),('$OTHER','assistant-race-b@example.test',now());
      INSERT INTO auth.sessions(id,user_id,not_after) VALUES('$EDITOR','$EDITOR',now()+interval '1 day'),('$OTHER','$OTHER',now()+interval '1 day');
      INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('synthetic-assistant-race-key',repeat('synthetic-race-',4)) ON CONFLICT DO NOTHING;"
ws="$(q -c "$(as $EDITOR) SELECT sw_create_personal_workspace('Synthetic assistant concurrency');" | tail -1)"
q -c "SET request.jwt.claim.sub='$EDITOR'; SET request.jwt.claims='{\"sub\":\"$EDITOR\",\"role\":\"authenticated\",\"is_anonymous\":false}';
      INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES('$ws','$OTHER','editor',true);
      INSERT INTO sw_ai_activations(id,workspace_id,environment,purpose,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms)
      VALUES('$ACT','$ws','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','$EDITOR',now()+interval '1 hour',100,1000,2048,10000);"
manifest() { echo "jsonb_build_object('kind','$1','capability','$1','contextKind','workspace','contextId',NULL,'requestText','$2','language','sv','promptVersion','sw-assistant-test','decisionRequired',true,'context','{}'::jsonb,'sources','[]'::jsonb)"; }
waited() { # application name of the session that must be blocked on a lock
  for _ in $(seq 1 100); do
    if [ "$(q -c "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid AND NOT l.granted WHERE a.application_name='$1'")" -ge 1 ]; then return 0; fi
    sleep 0.05
  done
  echo "Race actor $1 never waited on a lock: the sessions did not overlap" >&2; exit 1
}
sleeping() {
  for _ in $(seq 1 100); do
    [ "$(q -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='$1' AND wait_event='PgSleep'")" = 1 ] && return 0
    sleep 0.05
  done
  echo "Race actor $1 did not enter its lock window" >&2; exit 1
}

# 1. Double click: one operation id, two sessions.
OP=56000000-0000-4000-8000-000000000100
PGAPPNAME=swa_click_first q -c "$(as $EDITOR) BEGIN; SELECT (sw_reserve_assistant('$ws','$OP','$ACT',$(manifest explanation 'Why?'))).id; SELECT sw_dispatch_processing('$ws','$OP')->>'dispatch'; SELECT pg_sleep(2); COMMIT;" >"$LOG_DIR/first" 2>&1 &
first=$!
sleeping swa_click_first
PGAPPNAME=swa_click_second q -c "$(as $EDITOR) SELECT (sw_reserve_assistant('$ws','$OP','$ACT',$(manifest explanation 'Why?'))).id; SELECT sw_dispatch_processing('$ws','$OP')->>'dispatch';" >"$LOG_DIR/second" 2>&1 &
second=$!
waited swa_click_second
wait "$first"; wait "$second"
[ "$(grep -c '^true$' "$LOG_DIR/first" "$LOG_DIR/second" | awk -F: '{s+=$2} END {print s}')" = 1 ] || { cat "$LOG_DIR/first" "$LOG_DIR/second"; echo 'FAIL: a duplicate click was dispatched more than once' >&2; exit 1; }
grep -q '^false$' "$LOG_DIR/second" || { cat "$LOG_DIR/second"; echo 'FAIL: the second click was not refused a fence' >&2; exit 1; }
[ "$(q -c "SELECT count(*) FROM sw_processing_jobs WHERE workspace_id='$ws' AND kind='assistant'")" = 1 ] || { echo 'FAIL: more than one reservation' >&2; exit 1; }
echo '    ok  a concurrent duplicate operation waited, reused the reservation and was refused a second dispatch'

# A succeeded job and its stored suggestion, committed, for the approval race.
SUG=56000000-0000-4000-8000-000000000110
out='{"assets":[{"name":"Control room","category":"facilities","reason":"Synthetic"}]}'
payload="{\"status\": \"succeeded\", \"output\": $out, \"provider\": \"synthetic\", \"model\": \"synthetic-model\", \"inputTokens\": 1, \"outputTokens\": 1, \"costMicros\": 10}"
q -c "$(as $EDITOR) SELECT (sw_reserve_assistant('$ws','$SUG','$ACT',$(manifest asset_suggestions 'Which assets?'))).id;" >/dev/null
fence="$(q -c "$(as $EDITOR) SELECT sw_dispatch_processing('$ws','$SUG')->'job'->>'fence';" | tail -1)"
sig="$(q -c "SELECT sw_private.receipt_mac('assistant'||E'\n'||'$SUG'||E'\n'||'$fence'||E'\n'||sw_private.hash_text(\$p\$$payload\$p\$),repeat('synthetic-race-',4));")"
q -c "$(as $EDITOR) SELECT (sw_complete_processing('$ws','$SUG','$fence','synthetic-assistant-race-key',\$p\$$payload\$p\$,'$sig')).status;
      INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version,decision_required)
      VALUES('$SUG','$ws','$SUG','asset_suggestions','workspace','Which assets?','$out','[]','synthetic','synthetic-model','sw-assistant-test',true);" >/dev/null

# 2. Two approvers, one suggestion.
apply='{"kind":"assets","assets":[{"name":"Control room","description":"","category":"facilities"},{"name":"Visitor register","description":"","category":"information"}]}'
PGAPPNAME=swa_approve_first q -c "$(as $EDITOR) BEGIN; SELECT (sw_decide_suggestion('$ws','$SUG',1,'approved','','$apply')).status; SELECT pg_sleep(2); COMMIT;" >"$LOG_DIR/approve_first" 2>&1 &
first=$!
sleeping swa_approve_first
if PGAPPNAME=swa_approve_second q -c "$(as $OTHER) SELECT (sw_decide_suggestion('$ws','$SUG',1,'approved','','$apply')).status;" >"$LOG_DIR/approve_second" 2>&1 & second=$!; waited swa_approve_second; wait "$second"; then
  cat "$LOG_DIR/approve_second"; echo 'FAIL: a second approver applied the same suggestion' >&2; exit 1
fi
wait "$first"
grep -q 'SW_CONFLICT' "$LOG_DIR/approve_second" || { cat "$LOG_DIR/approve_second"; echo 'FAIL: second approver failed for the wrong reason' >&2; exit 1; }
[ "$(q -c "SELECT count(*) FROM sw_protected_assets WHERE workspace_id='$ws'")" = 2 ] || { echo 'FAIL: concurrent approvals created more than one set of records' >&2; exit 1; }
[ "$(q -c "SELECT decided_by FROM sw_ai_suggestions WHERE id='$SUG'")" = "$EDITOR" ] || { echo 'FAIL: the decision is not the first approver''s' >&2; exit 1; }
echo '    ok  a concurrent second approver waited, was refused, and exactly one set of records exists'
