-- Security Passport — HAYAT assessments, as the database enforces them.
--
--   1. ONLY the service boundary can record an assessment. A holder, another
--      holder and an anonymous caller cannot write, update, delete or truncate.
--   2. An assessment is bound to the fields that were assessed: recording
--      against a claim whose fields have since changed is refused.
--   3. Changing a relevant field, or withdrawing the assessed document,
--      INVALIDATES the assessment -- it stays as history and is never current.
--   4. Another account cannot read it. Nor can a verifier or an employer:
--      nobody but the holder has a read path.
--   5. It never moves assertion_level and never reaches a disclosure.
--   6. History is append-only, and an outage is never stored as a result.
--
-- Everything is inside one transaction and rolled back; the fixture claim is
-- saved through the real RPC and the document attached through the real one.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('fa7a0000-0000-4000-8000-000000000001','hayat-holder@fixture.invalid'),
 ('fa7a0000-0000-4000-8000-000000000002','hayat-other@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES
 ('fa7a0000-0000-4000-8000-000000000001'),('fa7a0000-0000-4000-8000-000000000002');

-- ── the holder saves a credential and attaches a document, the real way ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential(
  '{"definition_code":"INTL_ASIS_CPP","identifier":"7741-2291-86","issued_on":"2024-03-12","valid_until":"2027-03-31"}'::jsonb) AS claim_id \gset
SELECT public.sp_attach_evidence(:'claim_id'::uuid, NULL,
  'fa7a0000-0000-4000-8000-000000000001/hayat-fixture.png', 'badge.png', 'image/png', 2048, repeat('ab',32));
SELECT id AS evidence_id FROM public.sp_evidence WHERE claim_id = :'claim_id'::uuid \gset
SELECT public.sp_hayat_claim_fingerprint(:'claim_id'::uuid) AS fp \gset
SELECT pg_temp.ok(:'fp' ~ '^[a-f0-9]{64}$', 'the holder can read the fingerprint of their own claim');
SELECT pg_temp.ok((SELECT is_current IS NULL FROM (SELECT (SELECT is_current FROM public.sp_hayat_current_assessment(:'claim_id'::uuid)) AS is_current) s),
  'a credential nobody has checked has no assessment');

-- 1. a holder has no write path at all
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'x','hosted_open_badge','https://www.credly.com/badges/x','r','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', :'fp'), 'permission denied', 'a holder cannot call the writer');
SELECT pg_temp.refused(format($q$INSERT INTO public.sp_hayat_assessments(claim_id,holder_user_id,claim_version_no,fields_fingerprint,adapter,source_kind,source_reference,rule_version,status,checks,binding_level,checked_at)
  VALUES(%L,auth.uid(),1,%L,'x','hosted_open_badge','https://x.example/','r','verified','{}','email_control',now())$q$, :'claim_id', :'fp'),
  'permission denied', 'a holder cannot insert a row directly');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'x','hosted_open_badge','https://x.example/','r','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', :'fp'), 'permission denied', 'an anonymous caller cannot call the writer');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.sp_hayat_assessments$q$, 'permission denied', 'an anonymous caller cannot read the table');
SELECT pg_temp.refused(format($q$SELECT * FROM public.sp_hayat_current_assessment(%L)$q$, :'claim_id'), 'permission denied', 'nor the read function');
RESET ROLE;

-- ── the service boundary records a check ────────────────────────────────
SET LOCAL ROLE service_role;
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'a','hosted_open_badge','https://www.credly.com/badges/x','r','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000002', :'claim_id', :'fp'), 'SP_HAYAT_NOT_HOLDER', 'the writer refuses a claim that is not the named holder''s');
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'a','hosted_open_badge','https://www.credly.com/badges/x','r','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', repeat('0',64)), 'SP_HAYAT_STALE_ASSESSMENT', 'the writer refuses fields that are not the claim''s current fields');
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'a','hosted_open_badge','https://www.credly.com/badges/x','r','verified','{ok}','{}'::jsonb,'none','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', :'fp'), 'SP_HAYAT_VERIFIED_REQUIRES_BINDING', 'verified without a holder binding cannot be stored');
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'a','hosted_open_badge','https://www.credly.com/badges/x','r','temporarily_unavailable','{source_unavailable}','{}'::jsonb,'none','{}',now(),NULL)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', :'fp'), 'check constraint', 'an outage is never stored as a result');
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'a','signed_credential',NULL,'r','cannot_verify_automatically','{issuer_not_trusted}','{}'::jsonb,'none','{}',now(),NULL)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id', :'fp'), 'check constraint', 'a file-bound assessment must name its file');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.sp_hayat_assessments$q$, 'permission denied', 'even the service role reads and writes only through the function');

SELECT public.sp_hayat_record_assessment(
  'fa7a0000-0000-4000-8000-000000000001', :'claim_id'::uuid, :'fp', :'evidence_id'::uuid,
  'ob3-vc-jwt/1','signed_credential',NULL,'hayat-rules/2','verified','{ok}',
  '{"subject_binding":{"result":"passed","reason":"ok"}}'::jsonb,'email_control',
  '{revocation_not_published}', now(), 30) AS first_id \gset
RESET ROLE;

-- ── the holder reads it back; nobody else can ───────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT status='verified' AND is_current AND binding_level='email_control'
  AND scope_limits = '{revocation_not_published}' AND rule_version='hayat-rules/2'
  FROM public.sp_hayat_current_assessment(:'claim_id'::uuid)), 'the holder reads the saved check back, current, with its scope and rule version');
SELECT pg_temp.ok((SELECT evidence_sha256 = repeat('ab',32) AND claim_version_no >= 1 AND fields_fingerprint = :'fp'
  FROM public.sp_hayat_assessments WHERE id = :'first_id'::uuid), 'it is bound to the exact document and the assessed fields');
SELECT pg_temp.ok((SELECT assertion_level IN ('self_declared','document_provided') FROM public.sp_claims WHERE id = :'claim_id'::uuid),
  'a HAYAT "verified" does NOT move assertion_level');
SELECT pg_temp.refused(format($q$UPDATE public.sp_hayat_assessments SET status='verified' WHERE id=%L$q$, :'first_id'), 'permission denied', 'the holder cannot edit a saved check');
SELECT pg_temp.refused(format($q$DELETE FROM public.sp_hayat_assessments WHERE id=%L$q$, :'first_id'), 'permission denied', 'nor delete one');
SELECT pg_temp.refused($q$TRUNCATE public.sp_hayat_assessments$q$, 'permission denied', 'nor truncate the table');
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_hayat_assessments), 'another account sees no assessment');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_hayat_current_assessment(:'claim_id'::uuid)), 'and the read function returns it nothing');
SELECT pg_temp.ok(public.sp_hayat_claim_fingerprint(:'claim_id'::uuid) IS NULL, 'nor can it fingerprint somebody else''s claim');
RESET ROLE;

-- 5. it reaches no disclosure: no payload builder knows the table exists
SELECT pg_temp.ok((SELECT count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname ~ '(disclosure|payload|share|selected_merits)' AND p.prosrc ~ 'sp_hayat'),
  'no disclosure, payload or share function reads a HAYAT assessment');

-- ── 3. invalidation ─────────────────────────────────────────────────────
-- (a) The holder CORRECTS the credential. The product never edits in place: a
--     correction creates a successor claim and supersedes this one. The successor
--     starts unchecked -- nothing transfers -- and this claim's check is history.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT version_no AS v FROM public.sp_claims WHERE id = :'claim_id'::uuid \gset
SELECT public.sp_save_international_credential(jsonb_build_object('claim_id',:'claim_id','version',:v,
  'definition_code','INTL_ASIS_CPP','identifier','7741-2291-86','issued_on','2024-03-12','valid_until','2030-01-01')) AS successor \gset
SELECT pg_temp.ok(:'successor' <> :'claim_id' AND (SELECT lifecycle_state='superseded' FROM public.sp_claims WHERE id=:'claim_id'::uuid),
  'a correction creates a successor and supersedes the checked claim');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_hayat_current_assessment(:'successor'::uuid)),
  'the corrected credential starts with NO assessment: a check never transfers');
SELECT pg_temp.ok((SELECT status='verified' AND NOT is_current AND not_current_reason='fields_changed'
  FROM public.sp_hayat_current_assessment(:'claim_id'::uuid)), 'the superseded claim keeps its check as HISTORY: verified then, not current now');
SELECT pg_temp.ok((SELECT invalidated_at IS NOT NULL AND invalidated_reason='fields_changed' FROM public.sp_hayat_assessments WHERE id=:'first_id'::uuid),
  'and the row itself records why');

-- (b) The assessed DOCUMENT is withdrawn.
SELECT public.sp_save_international_credential(
  '{"definition_code":"INTL_ASIS_PCI","identifier":"9090-4411-27","issued_on":"2022-01-10","valid_until":"2028-01-09"}'::jsonb) AS doc_claim \gset
SELECT public.sp_attach_evidence(:'doc_claim'::uuid, NULL,
  'fa7a0000-0000-4000-8000-000000000001/hayat-fixture-2.png', 'badge2.png', 'image/png', 2048, repeat('cd',32));
SELECT id AS doc_evidence FROM public.sp_evidence WHERE claim_id = :'doc_claim'::uuid \gset
SELECT public.sp_hayat_claim_fingerprint(:'doc_claim'::uuid) AS dfp \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.sp_hayat_record_assessment(
  'fa7a0000-0000-4000-8000-000000000001', :'doc_claim'::uuid, :'dfp', :'doc_evidence'::uuid,
  'ob3-vc-jwt/1','signed_credential',NULL,'hayat-rules/2','verified','{ok}','{}'::jsonb,'email_control','{}', now(), 30);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT is_current FROM public.sp_hayat_current_assessment(:'doc_claim'::uuid)), 'a document-bound check is current while its document is');
SELECT public.sp_withdraw_evidence(:'doc_evidence'::uuid);
SELECT pg_temp.ok((SELECT status='verified' AND NOT is_current AND not_current_reason='evidence_changed'
  FROM public.sp_hayat_current_assessment(:'doc_claim'::uuid)), 'withdrawing the assessed document makes its check history');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,%L,'ob3-vc-jwt/1','signed_credential',NULL,'hayat-rules/2','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'doc_claim', :'dfp', :'doc_evidence'), 'SP_HAYAT_EVIDENCE_NOT_ACTIVE', 'a withdrawn document cannot be the evidence of a new check');
RESET ROLE;

-- (c) A link-checked credential: re-check, history, and the passage of time.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential(
  '{"definition_code":"INTL_ASIS_PSP","identifier":"5520-1187-03","issued_on":"2023-05-02","valid_until":"2026-12-31"}'::jsonb) AS link_claim \gset
SELECT public.sp_hayat_claim_fingerprint(:'link_claim'::uuid) AS lfp \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.sp_hayat_record_assessment(
  'fa7a0000-0000-4000-8000-000000000001', :'link_claim'::uuid, :'lfp', NULL,
  'credly-ob2-hosted/1','hosted_open_badge','https://www.credly.com/badges/11111111-2222-4333-8444-555555555555','hayat-rules/2',
  'source_verified_binding_missing','{binding_mismatch}','{}'::jsonb,'none','{}', now(), NULL);
SELECT public.sp_hayat_record_assessment(
  'fa7a0000-0000-4000-8000-000000000001', :'link_claim'::uuid, :'lfp', NULL,
  'credly-ob2-hosted/1','hosted_open_badge','https://www.credly.com/badges/11111111-2222-4333-8444-555555555555','hayat-rules/2',
  'verified','{ok}','{}'::jsonb,'email_control','{credential_number_not_published,issue_date_not_compared}', now(), 30) AS second_id \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT status='verified' AND is_current AND source_reference LIKE 'https://www.credly.com/badges/%'
  AND scope_limits @> '{credential_number_not_published}' FROM public.sp_hayat_current_assessment(:'link_claim'::uuid)),
  'the re-check is the current one, with the holder''s link and its scope limits');
SELECT pg_temp.ok((SELECT count(*)=2 AND count(*) FILTER (WHERE invalidated_at IS NULL)=1
  AND count(*) FILTER (WHERE invalidated_reason='superseded')=1 FROM public.sp_hayat_assessments WHERE claim_id=:'link_claim'::uuid),
  'history is kept: two checks, exactly one current, the earlier one superseded');
RESET ROLE;
-- a path OTHER than the product's RPC that changes a checked field in place
UPDATE public.sp_claims SET valid_until = DATE '2031-01-01' WHERE id = :'link_claim'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT NOT is_current AND not_current_reason='fields_changed' FROM public.sp_hayat_current_assessment(:'link_claim'::uuid)),
  'an in-place change of a checked field invalidates too');
SELECT public.sp_hayat_claim_fingerprint(:'link_claim'::uuid) AS lfp2 \gset
SELECT pg_temp.ok(:'lfp2' <> :'lfp', 'the fingerprint followed the change');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.refused(format($q$SELECT public.sp_hayat_record_assessment(%L,%L,%L,NULL,'credly-ob2-hosted/1','hosted_open_badge','https://www.credly.com/badges/x','hayat-rules/2','verified','{ok}','{}'::jsonb,'email_control','{}',now(),30)$q$,
  'fa7a0000-0000-4000-8000-000000000001', :'link_claim', :'lfp'), 'SP_HAYAT_STALE_ASSESSMENT', 'a check of the OLD fields can no longer be recorded');
-- time passes: a positive check past its currency window
SELECT public.sp_hayat_record_assessment(
  'fa7a0000-0000-4000-8000-000000000001', :'link_claim'::uuid, :'lfp2', NULL,
  'credly-ob2-hosted/1','hosted_open_badge','https://www.credly.com/badges/11111111-2222-4333-8444-555555555555','hayat-rules/2',
  'verified','{ok}','{}'::jsonb,'email_control','{credential_number_not_published}', now() - interval '40 days', 30);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa7a0000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT status='verified' AND NOT is_current AND not_current_reason='recheck_needed'
  FROM public.sp_hayat_current_assessment(:'link_claim'::uuid)), 'a positive check past its window reads as history until it is re-checked');
RESET ROLE;

-- 6. append-only, even for the table owner's ordinary statements
SELECT pg_temp.refused(format($q$UPDATE public.sp_hayat_assessments SET status='expired' WHERE id=%L$q$, :'second_id'), 'SP_HAYAT_ASSESSMENT_APPEND_ONLY', 'a recorded result cannot be rewritten');
SELECT pg_temp.refused($q$UPDATE public.sp_hayat_assessments SET status='verified', binding_level='email_control' WHERE invalidated_at IS NULL$q$, 'SP_HAYAT_ASSESSMENT_APPEND_ONLY', 'not even the current one');
SELECT pg_temp.refused(format($q$UPDATE public.sp_hayat_assessments SET invalidated_at=NULL, invalidated_reason=NULL WHERE id=%L$q$, :'first_id'), 'SP_HAYAT_ASSESSMENT_APPEND_ONLY', 'an invalidated check cannot be revived');
SELECT pg_temp.refused(format($q$DELETE FROM public.sp_hayat_assessments WHERE id=%L$q$, :'first_id'), 'SP_HAYAT_ASSESSMENT_APPEND_ONLY', 'nor deleted on its own');
-- ...but it goes with its claim and its holder. (Erasure itself is the product's
-- existing path; an international claim's details row is ON DELETE RESTRICT, so
-- the cascade is proved from the constraints rather than by deleting a person.)
SELECT pg_temp.ok((SELECT count(*)=2 FROM pg_constraint
  WHERE conrelid='public.sp_hayat_assessments'::regclass AND contype='f' AND confdeltype='c'
    AND confrelid IN ('public.sp_claims'::regclass,'auth.users'::regclass)),
  'assessments cascade with their claim and with their holder');
SELECT pg_temp.ok((SELECT confdeltype='n' FROM pg_constraint
  WHERE conrelid='public.sp_hayat_assessments'::regclass AND confrelid='public.sp_evidence'::regclass),
  'and outlive their evidence row, keeping the sha256 they were bound to');
ROLLBACK;
