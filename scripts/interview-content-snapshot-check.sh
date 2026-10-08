#!/usr/bin/env bash
# Local/CI disposable database only. Proves migration, legacy backfill,
# service writes, rollback preservation and actual two-connection races.
set -Eeuo pipefail
: "${TEST_DB:?Set the disposable fully migrated template database}"
[[ "$TEST_DB" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost|::1) ;; *) exit 2;; esac
case "$TEST_DB" in *ci_test*|ri_snapshot) ;; *) exit 2;; esac
SNAP_DB="${TEST_DB}_content_snapshot"
SNAP_TMP="$(mktemp -d)"
cleanup() {
 psql -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS ${SNAP_DB}" >/dev/null
 rm -rf "$SNAP_TMP"
}
trap 'SNAP_RC=$?; if [ "$SNAP_RC" -ne 0 ]; then tail -n 25 "$SNAP_TMP"/* 2>/dev/null || true; fi; cleanup' EXIT
psql -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE ${SNAP_DB} TEMPLATE ${TEST_DB}" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$SNAP_DB" \
 -f supabase/rollback/20270307090000_interview_content_snapshot_lock_rollback.sql \
 -f supabase/tests/interview_content_snapshot_legacy_fixture.sql \
 -f supabase/migrations/20270307090000_interview_content_snapshot_lock.sql \
 -f supabase/tests/interview_content_snapshot_test.sql >"$SNAP_TMP/suite" 2>&1
[ "$(grep -c 'NOTICE:  ok  SNAP ' "$SNAP_TMP/suite")" -ge 94 ] || exit 1
echo '    ok  94 snapshot/backfill/direct-service/report/labels assertions'
set +e
psql -q -v ON_ERROR_STOP=1 -d "$SNAP_DB" -f supabase/rollback/20270307090000_interview_content_snapshot_lock_rollback.sql >"$SNAP_TMP/rollback" 2>&1
SNAP_ROLLBACK_RC=$?
set -e
[ "$SNAP_ROLLBACK_RC" -ne 0 ] && grep -q 'SCP_IV_CONTENT_ROLLBACK_DATA_PRESENT' "$SNAP_TMP/rollback" || exit 1
[ "$(psql -Atq -d "$SNAP_DB" -c 'SELECT count(*) FROM scp_private.interview_content_snapshots')" = 2 ] || exit 1
echo '    ok  adopted rollback refuses before changing snapshots or permanent locks'
# Three synthetic unused draft versions, populated before being made available.
psql -q -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/setup" 2>&1 <<'SQL'
DO $$ DECLARE _base uuid;_v uuid;_n integer;
BEGIN
 SELECT v.id INTO _base FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1;
 FOR _n IN 1..3 LOOP
  _v:=('b7070000-2222-4000-8000-'||lpad(_n::text,12,'0'))::uuid;
  INSERT INTO public.scp_interview_pack_versions SELECT (jsonb_populate_record(NULL::public.scp_interview_pack_versions,to_jsonb(v)||jsonb_build_object('id',_v,'version_number',300+_n,'pilot_availability','restricted'))).* FROM public.scp_interview_pack_versions v WHERE id=_base;
  INSERT INTO public.scp_interview_core_questions SELECT (jsonb_populate_record(NULL::public.scp_interview_core_questions,to_jsonb(q)||jsonb_build_object('id',gen_random_uuid(),'pack_version_id',_v))).* FROM public.scp_interview_core_questions q WHERE pack_version_id=_base;
  UPDATE public.scp_interview_pack_versions SET content_hash=public.scp_interview_pack_content_hash(id),pilot_availability='open' WHERE id=_v;
 END LOOP;
END $$;
SQL
ready() {
 for _ in $(seq 1 100); do if grep -q '^READY$' "$1"; then return; fi; sleep 0.05; done
 cat "$1"; exit 1
}
# Content edit wins: case start waits and captures the whole committed new copy.
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/edit" 2>&1 <<'SQL' &
BEGIN;
UPDATE public.scp_interview_core_questions SET prompt_en='Synthetic committed before start' WHERE pack_version_id='b7070000-2222-4000-8000-000000000001';
SELECT 'READY';
SELECT pg_sleep(2);
COMMIT;
SQL
SNAP_PID=$!
ready "$SNAP_TMP/edit"
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/start_after_edit" 2>&1 <<'SQL'
SELECT extract(epoch from clock_timestamp()) AS started \gset
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b7070000-0000-4000-8000-000000000001';
SELECT public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Snapshot edit wins','b7070000-2222-4000-8000-000000000001','Synthetic',NULL,'SNAP-RACE');
COMMIT;
SELECT CASE WHEN extract(epoch from clock_timestamp())-:started>1 THEN 'WAITED' ELSE 'DID_NOT_WAIT' END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM scp_private.interview_content_snapshots s JOIN public.scp_interview_cases c ON c.id=s.case_id,jsonb_array_elements(s.manifest#>'{content,questions}') q WHERE c.title='Snapshot edit wins' AND q->>'prompt_en'<>'Synthetic committed before start') THEN 'EXACT' ELSE 'MIXED' END;
SQL
wait "$SNAP_PID"
grep -q '^WAITED$' "$SNAP_TMP/start_after_edit" && grep -q '^EXACT$' "$SNAP_TMP/start_after_edit" || exit 1
echo '    ok  content edit/start race waits and snapshots the committed content'
# Case start wins: a queued service edit must wait, then be refused by the lock.
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/start" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b7070000-0000-4000-8000-000000000001';
SELECT public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Snapshot start wins','b7070000-2222-4000-8000-000000000002','Synthetic',NULL,'SNAP-RACE');
SELECT 'READY';
SELECT pg_sleep(2);
COMMIT;
SQL
SNAP_PID=$!
ready "$SNAP_TMP/start"
set +e
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/edit_after_start" 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.scp_interview_core_questions SET prompt_sv='Synthetic forbidden concurrent change' WHERE pack_version_id='b7070000-2222-4000-8000-000000000002';
COMMIT;
SQL
SNAP_EDIT_RC=$?
set -e
wait "$SNAP_PID"
[ "$SNAP_EDIT_RC" -ne 0 ] && grep -q 'SCP_IV_CONTENT_IN_USE' "$SNAP_TMP/edit_after_start" || exit 1
echo '    ok  case start/service edit race refuses the queued edit after commit'
# Withdrawal wins: a queued start must not use pre-withdrawal eligibility.
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/withdraw" 2>&1 <<'SQL' &
BEGIN;
UPDATE public.scp_interview_pack_versions SET pilot_availability='restricted' WHERE id='b7070000-2222-4000-8000-000000000003';
SELECT 'READY';
SELECT pg_sleep(2);
COMMIT;
SQL
SNAP_PID=$!
ready "$SNAP_TMP/withdraw"
set +e
psql -Atq -v ON_ERROR_STOP=1 -d "$SNAP_DB" >"$SNAP_TMP/start_after_withdraw" 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b7070000-0000-4000-8000-000000000001';
SELECT public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Snapshot withdrawn','b7070000-2222-4000-8000-000000000003','Synthetic',NULL,'SNAP-RACE');
COMMIT;
SQL
SNAP_START_RC=$?
set -e
wait "$SNAP_PID"
[ "$SNAP_START_RC" -ne 0 ] && grep -q 'SCP_IV_PACK_NOT_USABLE' "$SNAP_TMP/start_after_withdraw" || exit 1
echo '    ok  withdrawal/start race refuses the queued start'
