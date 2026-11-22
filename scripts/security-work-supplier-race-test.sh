#!/usr/bin/env bash
# Two real connections against committed synthetic fixtures in db-test's
# disposable *_sw_race clone (20270330090000):
#   1. a double click: two sessions record the SAME supplier response operation
#      at the same moment -> the second WAITS on the request row, then gets the
#      same request back; exactly one response exists.
#   2. two verifiers accept the SAME response on the same version at the same
#      moment -> the second WAITS, then gets SW_CONFLICT; exactly one
#      verification exists and it is the first verifier's.
# Each race asserts that the second session actually waited (pg_locks), so a
# pass cannot come from the two sessions simply not overlapping.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) exit 2;; esac
case "${PGDATABASE:-}" in *_sw_race) ;; *) echo 'Requires disposable *_sw_race database' >&2; exit 2;; esac
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sw-supplier-race.XXXXXX")"
trap 'rm -rf "$LOG_DIR"' EXIT
q() { psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }
as() { echo "SET ROLE authenticated; SET request.jwt.claim.sub='$1'; SET request.jwt.claims='{\"sub\":\"$1\",\"role\":\"authenticated\",\"is_anonymous\":false}';"; }
OWNER=5e000000-0000-4000-8000-000000000001
VERIFIER=5e000000-0000-4000-8000-000000000002
q -c "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('$OWNER','supplier-race-a@example.test',now()),('$VERIFIER','supplier-race-b@example.test',now());
      INSERT INTO auth.sessions(id,user_id,not_after) VALUES('$OWNER','$OWNER',now()+interval '1 day'),('$VERIFIER','$VERIFIER',now()+interval '1 day');"
ws="$(q -c "$(as $OWNER) SELECT sw_create_personal_workspace('Synthetic supplier concurrency');" | tail -1)"
q -c "SET request.jwt.claim.sub='$OWNER'; SET request.jwt.claims='{\"sub\":\"$OWNER\",\"role\":\"authenticated\",\"is_anonymous\":false}';
      INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES('$ws','$VERIFIER','editor',true);"
supplier="$(q -c "$(as $OWNER) SELECT sw_set_member_sharing('$ws','$OWNER',true); INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES('$ws','Race supplier','suppliers') RETURNING id;" | tail -1)"
action="$(q -c "$(as $OWNER) INSERT INTO sw_supplier_profiles(workspace_id,asset_id) VALUES('$ws','$supplier'); INSERT INTO sw_actions(workspace_id,source_kind,title) VALUES('$ws','manual','Race action') RETURNING id;" | tail -1)"
fields="{\"actionId\":\"$action\",\"supplierAssetId\":\"$supplier\",\"basisKind\":\"information\",\"internalOwnerId\":\"$OWNER\",\"title\":\"Race\",\"task\":\"Answer\",\"expectedResult\":\"An answer\",\"verificationCriteria\":\"Answered\",\"requestedDue\":\"2030-01-01\"}"
req="$(q -c "$(as $OWNER) SELECT (sw_save_supplier_request('$ws',gen_random_uuid(),NULL,NULL,'$fields')).id;" | tail -1)"
q -c "$(as $OWNER) SELECT sw_approve_supplier_share('$ws',gen_random_uuid(),'$req',1,'Race supplier','Race'); SELECT sw_record_supplier_dispatch('$ws',gen_random_uuid(),'$req',2,'email','race@example.test',now());" >/dev/null
waited() {
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

# 1. Double click on "record response": one operation id, two sessions.
OP=5e000000-0000-4000-8000-000000000100
resp='{"kind":"done","authorName":"Race supplier","origin":"email","body":"Done."}'
PGAPPNAME=sws_click_first q -c "$(as $OWNER) BEGIN; SELECT (sw_record_supplier_response('$ws','$OP','$req',3,'$resp')).status; SELECT pg_sleep(2); COMMIT;" >"$LOG_DIR/first" 2>&1 &
first=$!
sleeping sws_click_first
PGAPPNAME=sws_click_second q -c "$(as $OWNER) SELECT (sw_record_supplier_response('$ws','$OP','$req',3,'$resp')).status;" >"$LOG_DIR/second" 2>&1 &
second=$!
waited sws_click_second
wait "$first"; wait "$second" || { cat "$LOG_DIR/second"; echo 'FAIL: the repeated click failed instead of replaying' >&2; exit 1; }
grep -q '^awaiting_verification$' "$LOG_DIR/second" || { cat "$LOG_DIR/second"; echo 'FAIL: the repeated click did not return the request' >&2; exit 1; }
[ "$(q -c "SELECT count(*) FROM sw_supplier_responses WHERE request_id='$req'")" = 1 ] || { echo 'FAIL: a double click recorded two responses' >&2; exit 1; }
echo '    ok  a concurrent repeated response waited, replayed, and exactly one response exists'

# 2. Two verifiers, one response, one version.
rid="$(q -c "SELECT id FROM sw_supplier_responses WHERE request_id='$req'")"
v="$(q -c "SELECT version FROM sw_supplier_requests WHERE id='$req'")"
PGAPPNAME=sws_verify_first q -c "$(as $OWNER) BEGIN; SELECT (sw_verify_supplier_response('$ws',gen_random_uuid(),'$req',$v,'$rid','accepted','Checked by owner','','')).status; SELECT pg_sleep(2); COMMIT;" >"$LOG_DIR/verify_first" 2>&1 &
first=$!
sleeping sws_verify_first
if PGAPPNAME=sws_verify_second q -c "$(as $VERIFIER) SELECT (sw_verify_supplier_response('$ws',gen_random_uuid(),'$req',$v,'$rid','needs_revision','Checked by verifier','','')).status;" >"$LOG_DIR/verify_second" 2>&1 & second=$!; waited sws_verify_second; wait "$second"; then
  cat "$LOG_DIR/verify_second"; echo 'FAIL: a second verifier recorded an outcome on the same version' >&2; exit 1
fi
wait "$first"
grep -q 'SW_CONFLICT' "$LOG_DIR/verify_second" || { cat "$LOG_DIR/verify_second"; echo 'FAIL: the second verifier failed for the wrong reason' >&2; exit 1; }
[ "$(q -c "SELECT count(*)||':'||max(verified_by::text)||':'||max(outcome) FROM sw_supplier_verifications WHERE request_id='$req'")" = "1:$OWNER:accepted" ] || { echo 'FAIL: concurrent verifications left more than one outcome' >&2; exit 1; }
echo '    ok  a concurrent second verifier waited, was refused, and exactly one verification exists'
