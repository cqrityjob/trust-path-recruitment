#!/usr/bin/env bash
# Disposable clone only. No Storage API and no real accounts.
set -Eeuo pipefail
: "${TEST_DB:?Run from the isolated db-test harness}"
[[ "$TEST_DB" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
case "${PGHOST:-127.0.0.1}" in *supabase*|*.rds.amazonaws.com|*.neon.tech) exit 2;; esac
case "$TEST_DB" in *ci_test*|retention_*) ;; *) exit 2;; esac
RETENTION_RACE_DB="${TEST_DB}_retention_race"
RETENTION_RACE_TMP="$(mktemp -d)"
cleanup() {
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE IF EXISTS ${RETENTION_RACE_DB};" >/dev/null
  rm -rf "$RETENTION_RACE_TMP"
}
trap 'RETENTION_CHECK_RC=$?; if [ "$RETENTION_CHECK_RC" -ne 0 ]; then tail -n 35 "$RETENTION_RACE_TMP"/* 2>/dev/null || true; fi; cleanup' EXIT
psql -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE ${RETENTION_RACE_DB} TEMPLATE ${TEST_DB};" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$RETENTION_RACE_DB" >"$RETENTION_RACE_TMP/setup" 2>&1 <<'SQL'
BEGIN;
\i supabase/tests/recruitment_assignment_fixture.sql
UPDATE public.job_applications SET cv_storage_path='synthetic/race.pdf' WHERE id=(SELECT application FROM rj);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status((SELECT application FROM rj),'rejected',NULL);
UPDATE public.jobs SET status='archived' WHERE id=(SELECT job FROM rj);
SELECT public.rec_complete_recruitment((SELECT job FROM rj),'completed',NULL,NULL);
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs(id,slug,short_id,employer_id,title_sv,title_en,application_method,status,published_at,expires_at)
VALUES ('ea000000-2222-0000-0000-000000000009','retention-race-other','RET009','ea000000-1111-0000-0000-000000000009','Syntetisk','Synthetic','internal','published',now()-interval '1 day',now()+interval '30 days');
RESET ROLE;
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at)
VALUES ('ea000000-3333-0000-0000-000000000009','ea000000-2222-0000-0000-000000000009','ea000000-1111-0000-0000-000000000009','ea000000-0000-0000-0000-000000000002','submitted',now());
COMMIT;
SQL
# A confirms and holds its commit. B's late comment must wait, then refuse.
psql -v ON_ERROR_STOP=1 -Atq -d "$RETENTION_RACE_DB" >"$RETENTION_RACE_TMP/request" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.rec_request_erasure('ea000000-2222-0000-0000-000000000001',NULL,
 public.rec_preview_erasure('ea000000-2222-0000-0000-000000000001',NULL)->>'fingerprint');
SELECT 'READY';
SELECT pg_sleep(2);
COMMIT;
SQL
RETENTION_RACE_PID=$!
for _ in $(seq 1 100); do if grep -q '^READY$' "$RETENTION_RACE_TMP/request"; then break; fi; sleep 0.05; done
grep -q '^READY$' "$RETENTION_RACE_TMP/request" || { cat "$RETENTION_RACE_TMP/request"; exit 1; }
set +e
psql -v ON_ERROR_STOP=1 -Atq -d "$RETENTION_RACE_DB" >"$RETENTION_RACE_TMP/comment" 2>&1 <<'SQL'
SELECT 'T0='||extract(epoch from clock_timestamp());
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.rec_add_comment('ea000000-3333-0000-0000-000000000001','Synthetic concurrent late note');
COMMIT;
SQL
RETENTION_RACE_RC=$?
set -e
wait "$RETENTION_RACE_PID"
[ "$RETENTION_RACE_RC" -ne 0 ] && grep -q 'RETENTION_ERASURE_PENDING' "$RETENTION_RACE_TMP/comment" || { cat "$RETENTION_RACE_TMP/comment"; exit 1; }
[ "$(psql -Atq -d "$RETENTION_RACE_DB" -c "SELECT count(*) FROM public.recruitment_comments WHERE body='Synthetic concurrent late note'")" = "0" ] || exit 1
echo '    ok retention race: late note waits for confirmation commit and is refused'
# A acquires the CV for another organisation. B must wait, then keep the file.
RETENTION_CLAIM="$(psql -Atq -d "$RETENTION_RACE_DB" -c "SELECT public.rec_claim_erasure()->>'lease_token';")"
RETENTION_JOB="$(psql -Atq -d "$RETENTION_RACE_DB" -c 'SELECT id FROM public.recruitment_erasure_jobs;')"
psql -v ON_ERROR_STOP=1 -Atq -d "$RETENTION_RACE_DB" >"$RETENTION_RACE_TMP/share" 2>&1 <<'SQL' &
BEGIN;
UPDATE public.job_applications SET cv_storage_path='synthetic/race.pdf' WHERE id='ea000000-3333-0000-0000-000000000009';
SELECT 'READY';
SELECT pg_sleep(2);
COMMIT;
SQL
RETENTION_RACE_PID=$!
for _ in $(seq 1 100); do if grep -q '^READY$' "$RETENTION_RACE_TMP/share"; then break; fi; sleep 0.05; done
grep -q '^READY$' "$RETENTION_RACE_TMP/share" || { cat "$RETENTION_RACE_TMP/share"; exit 1; }
psql -v ON_ERROR_STOP=1 -Atq -d "$RETENTION_RACE_DB" -v erasure="$RETENTION_JOB" -v token="$RETENTION_CLAIM" >"$RETENTION_RACE_TMP/erase" 2>&1 <<'SQL'
SELECT extract(epoch from clock_timestamp()) AS started \gset
SELECT public.rec_erase_rows(:'erasure',:'token');
SELECT CASE WHEN extract(epoch from clock_timestamp())-:started > 1 THEN 'WAITED' ELSE 'DID_NOT_WAIT' END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id=:'erasure')
 AND NOT EXISTS(SELECT 1 FROM public.job_applications WHERE id='ea000000-3333-0000-0000-000000000001')
 AND EXISTS(SELECT 1 FROM public.job_applications WHERE id='ea000000-3333-0000-0000-000000000009' AND cv_storage_path='synthetic/race.pdf')
 THEN 'PRESERVED' ELSE 'FAILED' END;
SQL
wait "$RETENTION_RACE_PID"
grep -q '^WAITED$' "$RETENTION_RACE_TMP/erase" && grep -q '^PRESERVED$' "$RETENTION_RACE_TMP/erase" || { cat "$RETENTION_RACE_TMP/erase"; exit 1; }
echo '    ok retention race: erasure waits for concurrent CV owner and preserves shared file'
