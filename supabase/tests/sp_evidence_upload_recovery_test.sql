-- OP09: real SQL/RLS, synthetic metadata, transaction rollback. This is NOT a
-- proof of physical Storage bytes or GoTrue; the runtime probe covers those.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(_value boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF _value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',_label; END IF; RAISE NOTICE 'ok %',_label; END $$;
CREATE FUNCTION pg_temp.as_actor(_actor text,_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _result text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',_actor,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 SET LOCAL ROLE authenticated;
 BEGIN EXECUTE _sql INTO _result; EXCEPTION WHEN OTHERS THEN _result:='err:'||SQLSTATE||':'||SQLERRM; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claim.role','',true);
 RETURN _result;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('a7090000-0000-4000-8000-000000000001','op09-a@synthetic.invalid'),
 ('a7090000-0000-4000-8000-000000000002','op09-b@synthetic.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,display_name,jurisdiction_code) VALUES
 ('a7090000-0000-4000-8000-000000000001','OP09 A','SE'),
 ('a7090000-0000-4000-8000-000000000002','OP09 B','SE') ON CONFLICT DO NOTHING;
INSERT INTO public.sp_claims(id,holder_user_id,claim_type,credential_code,title,claimed_issuer_name,issued_on,valid_until,assertion_level,lifecycle_state,jurisdiction_code) VALUES
 ('a7090000-1000-4000-8000-000000000001','a7090000-0000-4000-8000-000000000001','licence','OV','OP09 licence','Synthetic',current_date-10,current_date+30,'self_declared','active','SE');
INSERT INTO public.sp_experience_periods(id,holder_user_id,employer_name,role_title,jurisdiction_code,employment_type,started_on,assertion_level,lifecycle_state) VALUES
 ('a7090000-2000-4000-8000-000000000001','a7090000-0000-4000-8000-000000000001','Synthetic','Guard','SE','full_time',current_date-20,'self_declared','active'),
 ('a7090000-2000-4000-8000-000000000002','a7090000-0000-4000-8000-000000000002','Synthetic','Guard','SE','full_time',current_date-20,'self_declared','active');
CREATE FUNCTION pg_temp.begin_attempt(_n integer,_target text DEFAULT 'claim',_size integer DEFAULT 4,_hash text DEFAULT repeat('a',64)) RETURNS text LANGUAGE sql AS $$
 SELECT pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',format(
 'SELECT public.sp_begin_evidence_upload(%L,%s,%s,''proof.pdf'',''application/pdf'',%s,%L)',
 'a7090000-3000-4000-8000-'||lpad(_n::text,12,'0'),
 CASE WHEN _target='claim' THEN quote_literal('a7090000-1000-4000-8000-000000000001') ELSE 'NULL' END,
 CASE WHEN _target='period' THEN quote_literal('a7090000-2000-4000-8000-000000000001') WHEN _target='other' THEN quote_literal('a7090000-2000-4000-8000-000000000002') ELSE 'NULL' END,_size,_hash));
$$;
CREATE FUNCTION pg_temp.attach(_n integer) RETURNS text LANGUAGE sql AS $$
 SELECT pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',format(
 'SELECT public.sp_attach_evidence(''a7090000-1000-4000-8000-000000000001'',NULL,%L,''proof.pdf'',''application/pdf'',4,%L)',
 'a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-'||lpad(_n::text,12,'0')||'.pdf',repeat('a',64)));
$$;
SELECT pg_temp.ok((pg_temp.begin_attempt(1)::jsonb)->>'status'='prepared','intent durable before bytes');
SELECT pg_temp.ok((pg_temp.begin_attempt(1)::jsonb)->>'revision'='1','same operation/intent is idempotent');
SELECT pg_temp.ok(pg_temp.begin_attempt(1,'claim',5) LIKE 'err:23514:SP_UPLOAD_INTENT_MISMATCH%','changed retry never changes intent');
SELECT pg_temp.ok(pg_temp.begin_attempt(2,'other') LIKE 'err:42501:SP_NOT_HOLDER%','other holder target refused');
SELECT pg_temp.ok(pg_temp.begin_attempt(2,'claim',8388609) LIKE 'err:23514:SP_UPLOAD_INVALID_INPUT%','8MiB bound');
SELECT pg_temp.ok(pg_temp.begin_attempt(2,'claim',4,'bad') LIKE 'err:23514:SP_UPLOAD_INVALID_INPUT%','SHA256 shape');
SELECT pg_temp.ok((pg_temp.begin_attempt(2,'period')::jsonb)->>'periodId'='a7090000-2000-4000-8000-000000000001','own period accepted');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000002',$q$SELECT public.sp_reconcile_evidence_upload('a7090000-3000-4000-8000-000000000001')$q$) LIKE 'err:42501:SP_UPLOAD_ATTEMPT_NOT_FOUND%','other holder cannot reconcile');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000002',$q$SELECT count(*) FROM public.sp_evidence_upload_attempts$q$)='0','RLS own journal only');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$UPDATE public.sp_evidence_upload_attempts SET status='cleaned'$q$) LIKE 'err:42501:%','no direct journal update');
SELECT pg_temp.ok(NOT has_table_privilege('anon','public.sp_evidence_upload_attempts','SELECT') AND NOT has_table_privilege('service_role','public.sp_evidence_upload_attempts','SELECT'),'no anon/service table grant');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('sp_begin_evidence_upload','sp_reconcile_evidence_upload','sp_list_my_evidence_upload_attempts','sp_authorize_evidence_upload_cleanup','sp_confirm_evidence_upload_cleanup','sp_evidence_upload_storage_writable')
 AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))),'only authenticated RPC grants');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('sp_evidence_upload_payload','sp_evidence_upload_attachment_guard','sp_evidence_upload_intent_immutable','sp_evidence_upload_erasure_manifest')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')),'no callable private helpers');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_reconcile_evidence_upload('a7090000-3000-4000-8000-000000000001')$q$)::jsonb)->>'status'='prepared','an empty read does not delete or resolve');
SELECT pg_temp.ok(pg_temp.attach(1) LIKE 'err:23514:SP_UPLOAD_OBJECT_NOT_FOUND%','new intent cannot register before Storage metadata exists');
INSERT INTO storage.objects(bucket_id,name,owner) VALUES('passport-evidence','a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000001.pdf','a7090000-0000-4000-8000-000000000001');
SELECT pg_temp.ok(pg_temp.attach(1) NOT LIKE 'err:%','existing attach RPC commits journal atomically');
SELECT pg_temp.ok((SELECT status='registered' AND evidence_id IS NOT NULL FROM public.sp_evidence_upload_attempts WHERE id='a7090000-3000-4000-8000-000000000001'),'registered journal bound to old EvidenceRecord');
SELECT pg_temp.ok(pg_temp.attach(1) LIKE 'err:23505:%','duplicate attach aborts atomically');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_evidence WHERE storage_path='a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000001.pdf'),'one metadata row after duplicate');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_reconcile_evidence_upload('a7090000-3000-4000-8000-000000000001')$q$)::jsonb)->'evidence'->>'fileName'='proof.pdf','lost response readback keeps successful shape');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_authorize_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000001')$q$)::jsonb)->>'status'='registered','registered evidence prevents cleanup');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_evidence_upload_storage_writable('a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000001.pdf')$q$)='false','registered bytes cannot be overwritten');
-- Withdrawal remains the original flow and cannot turn a registered object
-- into an unregistered cleanup candidate.
SELECT pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',format('SELECT public.sp_withdraw_evidence(%L)',(SELECT evidence_id FROM public.sp_evidence_upload_attempts WHERE id='a7090000-3000-4000-8000-000000000001')));
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_authorize_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000001')$q$)::jsonb)->'evidence'->>'lifecycleState'='withdrawn','withdrawn metadata also forbids orphan cleanup');
SELECT pg_temp.ok((pg_temp.begin_attempt(3)::jsonb)->>'status'='prepared','second pending intent');
INSERT INTO storage.objects(bucket_id,name,owner) VALUES('passport-evidence','a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000003.pdf','a7090000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_authorize_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000003')$q$)::jsonb)->>'status'='cleanup_pending','explicit cleanup installs durable fence');
SELECT pg_temp.ok(pg_temp.attach(3) LIKE 'err:23514:SP_UPLOAD_CLEANUP_FENCED%','late attach after fence refused');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_evidence_upload_storage_writable('a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000003.pdf')$q$)='false','late Storage upload after fence refused');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_confirm_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000003')$q$) LIKE 'err:23514:SP_UPLOAD_CLEANUP_UNCONFIRMED%','metadata-present Storage cannot claim cleanup');
DELETE FROM storage.objects WHERE name='a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000003.pdf';
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_confirm_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000003')$q$)::jsonb)->>'status'='cleaned','verified absence confirms cleanup');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_confirm_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000003')$q$)::jsonb)->>'revision'='3','confirmed cleanup retry idempotent');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_evidence WHERE storage_path='a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000003.pdf'),'cleanup never inserts evidence');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_evidence_upload_storage_writable('a7090000-0000-4000-8000-000000000001/legacy.pdf')$q$)='true','historical own paths retain policy');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_attach_evidence('a7090000-1000-4000-8000-000000000001',NULL,'a7090000-0000-4000-8000-000000000001/legacy.pdf','legacy.pdf','application/pdf',4,NULL)$q$) NOT LIKE 'err:%','historical attach contract unchanged');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_evidence_upload_attempts WHERE storage_path LIKE '%/legacy.pdf'),'no fabricated historical backfill');
-- A deleted target leaves an unresolved intention discoverable in the global
-- own list; it never silently retries attachment on some other target.
DELETE FROM public.sp_experience_periods WHERE id='a7090000-2000-4000-8000-000000000001';
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_list_my_evidence_upload_attempts(NULL,NULL)$q$)::jsonb) @> '[{"id":"a7090000-3000-4000-8000-000000000002"}]','deleted-target intention still discoverable');
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_list_my_evidence_upload_attempts('a7090000-1000-4000-8000-000000000001','a7090000-2000-4000-8000-000000000001')$q$) LIKE 'err:23514:SP_TARGET_AMBIGUOUS%','ambiguous list refused');
DELETE FROM public.sp_claims WHERE id='a7090000-1000-4000-8000-000000000001';
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_list_my_evidence_upload_attempts(NULL,NULL)$q$)::jsonb) @> '[{"id":"a7090000-3000-4000-8000-000000000001","status":"registered"}]','registered target deletion also retains orphan recovery');
SELECT pg_temp.ok((pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_authorize_evidence_upload_cleanup('a7090000-3000-4000-8000-000000000001')$q$)::jsonb)->>'status'='cleanup_pending','removed registered target can be explicitly fenced without changing original intent');
-- Replayed authenticated JWT with missing live session must fail even though
-- its sub is the holder; this is SQL only, not a GoTrue logout claim.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"a7090000-0000-4000-8000-000000000001","session_id":"a7090000-9000-4000-8000-000000000001"}',true);
SELECT pg_temp.ok(pg_temp.as_actor('a7090000-0000-4000-8000-000000000001',$q$SELECT public.sp_list_my_evidence_upload_attempts(NULL,NULL)$q$) LIKE 'err:42501:SP_UPLOAD_NOT_AUTHENTICATED%','expired/revoked live session refused');
SELECT set_config('request.jwt.claims','',true);
DELETE FROM auth.users WHERE id='a7090000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE bucket_id='passport-evidence' AND object_path='a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000002.pdf' AND completed_at IS NULL),'account erasure retains pending path in existing queue');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE object_path='a7090000-0000-4000-8000-000000000001/a7090000-3000-4000-8000-000000000003.pdf'),'confirmed-clean journal needs no erasure work');
ROLLBACK;
