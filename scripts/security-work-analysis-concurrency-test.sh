#!/usr/bin/env bash
# Synthetic, committed fixtures only in db-test's disposable race clone.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in 127.0.0.1|localhost) ;; *) exit 2;; esac
case "${PGDATABASE:-}" in *_sw_race) ;; *) echo 'Requires disposable *_sw_race database' >&2; exit 2;; esac
SWA_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sw-analysis-race.XXXXXX")"
trap 'rm -rf "$SWA_LOG_DIR"' EXIT
q() { psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }
login="SET ROLE authenticated; SET request.jwt.claim.sub='54000000-0000-4000-8000-000000000001'; SET request.jwt.claims='{\"sub\":\"54000000-0000-4000-8000-000000000001\",\"role\":\"authenticated\",\"is_anonymous\":false}';"
q -c "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('54000000-0000-4000-8000-000000000001','analysis-race@example.test',now()); INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('synthetic-race-key',repeat('synthetic-',4));"
workspace="$(q -c "$login SELECT sw_create_personal_workspace('Synthetic analysis concurrency');")"
q -c "$login" -f /dev/stdin <<SQL
INSERT INTO sw_sources(id,workspace_id,name) VALUES('54000000-0000-4000-8000-000000000010','$workspace','Synthetic source');
INSERT INTO sw_source_items(id,workspace_id,source_id,deduplication_key,original_title,factual_extract) VALUES('54000000-0000-4000-8000-000000000011','$workspace','54000000-0000-4000-8000-000000000010','race','Synthetic original','Synthetic dependency.');
INSERT INTO sw_assessments(id,workspace_id,title,analysis_type,method_version_id,purpose,scope,horizon,professional_conclusion)
SELECT id,'$workspace','Synthetic analysis','rsa','rsa-v1','Review','Service','Next period','Human conclusion' FROM (VALUES('54000000-0000-4000-8000-000000000020'::uuid),('54000000-0000-4000-8000-000000000021'::uuid)) v(id);
INSERT INTO sw_analysis_questions(id,workspace_id,assessment_id,question,answer) VALUES
('54000000-0000-4000-8000-000000000030','$workspace','54000000-0000-4000-8000-000000000020','Gap?','Original'),
('54000000-0000-4000-8000-000000000031','$workspace','54000000-0000-4000-8000-000000000021','Gap?','Original');
INSERT INTO sw_reports(id,workspace_id,assessment_id,title,report_type,template_version_id,sections)
SELECT id,'$workspace',aid,'Synthetic report','risk_report','rsa-report-v1','{"introduction":"Scope","method":"RSA","context":"Service","risk_analysis":"Unknown","vulnerability":"Dependency","conclusions_actions":"Review"}' FROM (VALUES
('54000000-0000-4000-8000-000000000040'::uuid,'54000000-0000-4000-8000-000000000020'::uuid),
('54000000-0000-4000-8000-000000000041'::uuid,'54000000-0000-4000-8000-000000000021'::uuid)) v(id,aid);
INSERT INTO sw_citations(workspace_id,assessment_id,source_item_id,claim,excerpt) SELECT '$workspace',id,'54000000-0000-4000-8000-000000000011','Dependency','Synthetic dependency.' FROM sw_assessments WHERE workspace_id='$workspace';
INSERT INTO sw_citations(workspace_id,report_id,source_item_id,claim,excerpt) SELECT '$workspace',id,'54000000-0000-4000-8000-000000000011','Dependency','Synthetic dependency.' FROM sw_reports WHERE workspace_id='$workspace';
SQL
wait_for_sleep() {
 for attempt in $(seq 1 100); do
  if [ "$(q -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='$1' AND wait_event='PgSleep'")" = 1 ]; then return; fi
  sleep 0.05
 done
 echo 'Race actor did not enter controlled lock window' >&2; exit 1
}
hash="$(q -c "$login SELECT sw_preview_report('$workspace','54000000-0000-4000-8000-000000000040')->>'bundle_hash';")"
PGAPPNAME=swa_approval_first q -c "$login BEGIN; SELECT (sw_approve_report('$workspace','54000000-0000-4000-8000-000000000040',1,'$hash')).id; SELECT pg_sleep(2); COMMIT;" >"$SWA_LOG_DIR/approve" 2>&1 &
first_pid=$!
wait_for_sleep swa_approval_first
if q -c "$login UPDATE sw_analysis_questions SET answer='Late rewrite' WHERE id='54000000-0000-4000-8000-000000000030';" >"$SWA_LOG_DIR/child" 2>&1; then echo 'Late child rewrite wrongly succeeded' >&2; exit 1; fi
wait "$first_pid"
grep -q SW_APPROVED_INPUTS_IMMUTABLE "$SWA_LOG_DIR/child" || { cat "$SWA_LOG_DIR/child"; exit 1; }
echo '    ok  SWA-R1 approval wins and prevents a waiting child rewrite'
hash="$(q -c "$login SELECT sw_preview_report('$workspace','54000000-0000-4000-8000-000000000041')->>'bundle_hash';")"
PGAPPNAME=swa_child_first q -c "$login BEGIN; UPDATE sw_analysis_questions SET answer='Concurrent correction' WHERE id='54000000-0000-4000-8000-000000000031'; SELECT pg_sleep(2); COMMIT;" >"$SWA_LOG_DIR/child-first" 2>&1 &
first_pid=$!
wait_for_sleep swa_child_first
if q -c "$login SELECT sw_approve_report('$workspace','54000000-0000-4000-8000-000000000041',1,'$hash');" >"$SWA_LOG_DIR/stale" 2>&1; then echo 'Stale approval wrongly succeeded' >&2; exit 1; fi
wait "$first_pid"
grep -q SW_CONFLICT "$SWA_LOG_DIR/stale" || { cat "$SWA_LOG_DIR/stale"; exit 1; }
echo '    ok  SWA-R2 child correction wins and rejects stale reviewed hash'
q -c "$login SELECT sw_reserve_document('$workspace','54000000-0000-4000-8000-000000000050','synthetic.pdf','application/pdf',100,repeat('a',64)); INSERT INTO storage.objects(bucket_id,name) SELECT 'sw-documents',object_path FROM sw_documents WHERE id='54000000-0000-4000-8000-000000000050'; SELECT sw_reserve_processing('$workspace','54000000-0000-4000-8000-000000000051','extraction',NULL,'54000000-0000-4000-8000-000000000050',NULL,NULL);" >/dev/null
PGAPPNAME=swa_dispatch_first q -c "$login BEGIN; SELECT sw_dispatch_processing('$workspace','54000000-0000-4000-8000-000000000051')->>'dispatch'; SELECT pg_sleep(2); COMMIT;" >"$SWA_LOG_DIR/dispatch-first" 2>&1 &
first_pid=$!
wait_for_sleep swa_dispatch_first
q -c "$login SELECT sw_dispatch_processing('$workspace','54000000-0000-4000-8000-000000000051')->>'dispatch';" >"$SWA_LOG_DIR/dispatch-second" 2>&1
wait "$first_pid"
grep -q '^true$' "$SWA_LOG_DIR/dispatch-first"
grep -q '^false$' "$SWA_LOG_DIR/dispatch-second"
echo '    ok  SWA-R3 competing dispatches grant exactly one provider attempt'
