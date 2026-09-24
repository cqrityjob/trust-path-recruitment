-- Synthetic direct PostgreSQL role/receipt/lifecycle proofs. Never private data.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok %',label; RETURN; END; RAISE EXCEPTION 'unexpected success: %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',u,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true); END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('53000000-0000-4000-8000-000000000001','analysis-owner@example.test',now()),
 ('53000000-0000-4000-8000-000000000002','analysis-other@example.test',now()),
 ('53000000-0000-4000-8000-000000000003','analysis-viewer@example.test',now());
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('53000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Synthetic analysis') AS w \gset
SELECT pg_temp.login('53000000-0000-4000-8000-000000000002');
SELECT sw_create_personal_workspace('Other analysis') AS otherw \gset
SELECT pg_temp.login('53000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT definition->'matrix'->3->>2='orange' AND definition->'matrix'->2->>3='orange' AND definition->'matrix'->4->>2='red' AND jsonb_array_length(definition->'matrix')=5 FROM sw_method_versions WHERE id='rsa-v1'),'explicit owner matrix cells');
INSERT INTO sw_sources(workspace_id,name) VALUES(:'w','Synthetic observation') RETURNING id AS source \gset
INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract) VALUES(:'w',:'source','one','Synthetic facts','Synthetic service dependency interrupted.') RETURNING id AS item \gset
SELECT pg_temp.fail(format('INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract,retrieval_status) VALUES(%L,%L,''forged'',''forged'',''forged'',''extracted'')',:'w',:'source'),'42501','client cannot forge extracted provenance');
SELECT pg_temp.fail(format('INSERT INTO sw_sources(workspace_id,name,source_type) VALUES(%L,''forged'',''document'')',:'w'),'42501','client cannot forge document source');
INSERT INTO sw_assessments(workspace_id,title,analysis_type,method_version_id,purpose,scope,horizon,professional_conclusion) VALUES(:'w','Synthetic RSA','rsa','rsa-v1','Plan improvements','Synthetic service','Next review period','Human judgement with unknown values') RETURNING id AS a \gset
INSERT INTO sw_assessments(workspace_id,title,analysis_type,method_version_id) VALUES(:'w','Synthetic monitoring','monitoring','monitoring-v1') RETURNING id AS monitoring \gset
INSERT INTO sw_risks(workspace_id,assessment_id,title) VALUES(:'w',:'monitoring','Unknown monitoring risk');
SELECT pg_temp.ok((SELECT likelihood IS NULL AND consequence IS NULL FROM sw_risks WHERE assessment_id=:'monitoring'),'monitoring unknown remains unknown');
INSERT INTO sw_risks(workspace_id,assessment_id,title) VALUES(:'w',:'a','Unknown risk') RETURNING id AS risk \gset
SELECT pg_temp.ok((SELECT likelihood IS NULL AND consequence IS NULL FROM sw_risks WHERE id=:'risk'),'unknown proposed RSA risk remains null');
SELECT pg_temp.fail(format('UPDATE sw_risks SET likelihood=1,consequence=1 WHERE id=%L',:'risk'),'23514','uncalibrated RSA rating rejected');
INSERT INTO sw_analysis_inputs(workspace_id,assessment_id,source_item_id,review_status) VALUES(:'w',:'a',:'item','accepted');
INSERT INTO sw_analysis_questions(workspace_id,assessment_id,question,answer) VALUES(:'w',:'a','What is unknown?','Recovery duration') RETURNING id AS question \gset
INSERT INTO sw_citations(workspace_id,assessment_id,source_item_id,claim,excerpt) VALUES(:'w',:'a',:'item','Interruption observed','Synthetic service dependency interrupted.');
INSERT INTO sw_reports(workspace_id,assessment_id,title,report_type,template_version_id,sections) VALUES(:'w',:'a','Synthetic report','risk_report','rsa-report-v1','{"introduction":"Scope","method":"RSA","context":"Service","risk_analysis":"Unknown","vulnerability":"Dependency","conclusions_actions":"Review"}') RETURNING id AS report \gset
INSERT INTO sw_citations(workspace_id,report_id,source_item_id,claim,excerpt) VALUES(:'w',:'report',:'item','Interruption observed','Synthetic service dependency interrupted.');
SELECT sw_preview_report(:'w',:'report')->>'bundle_hash' AS hash \gset
UPDATE sw_analysis_questions SET answer='Updated duration gap' WHERE id=:'question';
SELECT pg_temp.fail(format('SELECT sw_approve_report(%L,%L,1,%L)',:'w',:'report',:'hash'),'PT409','dependency change invalidates reviewed bundle');
SELECT pg_temp.fail(format('UPDATE sw_reports SET status=''approved'' WHERE id=%L',:'report'),'42501','direct typed approval cannot skip reviewed bundle');
SELECT sw_preview_report(:'w',:'report')->>'bundle_hash' AS hash \gset
SELECT (sw_approve_report(:'w',:'report',1,:'hash')).id AS approval \gset
SELECT pg_temp.ok((SELECT status='approved' FROM sw_assessments WHERE id=:'a'),'approval atomically finalizes assessment');
SELECT pg_temp.ok((SELECT bundle->'risks'->0->'likelihood'='null'::jsonb AND bundle->'questions'->0->>'answer'='Updated duration gap' AND jsonb_array_length(bundle->'sources')=1 FROM sw_report_approvals WHERE id=:'approval'),'approval freezes complete source/risk/question bundle');
SELECT pg_temp.ok((sw_export_report(:'w',:'report',:'approval','53000000-0000-4000-8000-000000000095')).id=:'approval','export returns exact approved version');
SELECT pg_temp.ok((sw_export_report(:'w',:'report',:'approval','53000000-0000-4000-8000-000000000095')).id=:'approval','export retry returns same snapshot');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_report_exports WHERE approval_id=:'approval'),'exactly one export receipt');
SELECT pg_temp.fail(format('UPDATE sw_analysis_questions SET answer=''rewrite'' WHERE id=%L',:'question'),'23514','approved questions immutable');
SELECT pg_temp.fail(format('UPDATE sw_risks SET description=''rewrite'' WHERE id=%L',:'risk'),'23514','approved risk facts immutable');
SELECT pg_temp.fail(format('UPDATE sw_risks SET status=''accepted'',decision_rationale=''guess'' WHERE id=%L',:'risk'),'23514','unknown risk cannot be accepted as rated');
SELECT sw_revise_analysis(:'w',:'a',3,'53000000-0000-4000-8000-000000000090') AS revision \gset
SELECT pg_temp.ok(sw_revise_analysis(:'w',:'a',3,'53000000-0000-4000-8000-000000000090')=:'revision','revision retry returns same new draft');
SELECT pg_temp.ok((SELECT status='draft' AND supersedes_id=:'a' AND supersedes_version=3 FROM sw_assessments WHERE id=:'revision'),'explicit revision preserves lineage');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_analysis_inputs WHERE assessment_id=:'revision' AND review_status='pending'),'revision requires fresh source review');
SELECT pg_temp.fail(format('UPDATE sw_report_approvals SET bundle=''{}'' WHERE id=%L',:'approval'),'42501','approval ledger has no client write grant');
SELECT pg_temp.login('53000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_report_approvals WHERE workspace_id=:'w'),'other workspace cannot read approved bundle');
SELECT pg_temp.fail(format('SELECT sw_revise_analysis(%L,%L,3,gen_random_uuid())',:'w',:'a'),'42501','other workspace cannot revise');
SELECT pg_temp.login('53000000-0000-4000-8000-000000000001');
SELECT (sw_reserve_document(:'w','53000000-0000-4000-8000-000000000020','synthetic.pdf','application/pdf',100,repeat('a',64))).id AS doc \gset
SELECT pg_temp.ok((sw_reserve_document(:'w',:'doc','synthetic.pdf','application/pdf',100,repeat('a',64))).id=:'doc','document reservation is idempotent');
SELECT pg_temp.fail(format('SELECT sw_reserve_document(%L,%L,''changed.pdf'',''application/pdf'',100,repeat(''a'',64))',:'w',:'doc'),'23514','document retry binds facts');
INSERT INTO storage.objects(bucket_id,name) SELECT 'sw-documents',object_path FROM sw_documents WHERE id=:'doc';
SELECT pg_temp.fail(format('INSERT INTO storage.objects(bucket_id,name) VALUES(''sw-documents'',%L)',:'otherw'||'/forged/original.pdf'),'42501','storage requires registered workspace object');
SELECT (sw_reserve_processing(:'w','53000000-0000-4000-8000-000000000030','extraction',NULL,:'doc',NULL,NULL)).id AS extractjob \gset
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'w',:'extractjob'),'42501','worker remains disabled without provisioned receipt key');
RESET ROLE;
INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('synthetic-test-key',repeat('synthetic-only-',4));
SET LOCAL ROLE authenticated;
SELECT sw_dispatch_processing(:'w',:'extractjob')->'job'->>'fence' AS fence \gset
SELECT pg_temp.ok((sw_dispatch_processing(:'w',:'extractjob')->>'dispatch')::boolean=false,'second dispatch never replays');
SELECT jsonb_build_object('status','succeeded','sha256',repeat('a',64),'parserVersion','synthetic-parser-1','segments',jsonb_build_array(jsonb_build_object('id','53000000-0000-4000-8000-000000000031','text','Synthetic extracted paragraph.','locator','Page 1','pageNumber',1)))::text AS payload \gset
SELECT pg_temp.fail(format('SELECT sw_complete_processing(%L,%L,%L,''synthetic-test-key'',%L,repeat(''0'',64))',:'w',:'extractjob',:'fence',:'payload'),'42501','unsigned completion rejected');
RESET ROLE;
SELECT sw_private.receipt_mac('extraction'||E'\n'||:'extractjob'||E'\n'||:'fence'||E'\n'||sw_private.hash_text(:'payload'),repeat('synthetic-only-',4)) AS signature \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((sw_complete_processing(:'w',:'extractjob',:'fence','synthetic-test-key',:'payload',:'signature')).status='succeeded','signed extraction completes');
SELECT pg_temp.ok((sw_complete_processing(:'w',:'extractjob',:'fence','synthetic-test-key',:'payload',:'signature')).status='succeeded','same completion receipt idempotent');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_extraction_segments WHERE document_id=:'doc'),'exactly one immutable extraction segment');
SELECT pg_temp.ok((SELECT retrieval_status='extracted' FROM sw_source_items WHERE id='53000000-0000-4000-8000-000000000031'),'source preserved as verified extraction');
INSERT INTO sw_citations(workspace_id,assessment_id,source_item_id,claim,excerpt,locator) VALUES(:'w',:'revision','53000000-0000-4000-8000-000000000031','Synthetic paragraph','Synthetic extracted paragraph.','forged page 999') RETURNING id AS verifiedcitation \gset
SELECT pg_temp.ok((SELECT locator='Page 1' FROM sw_citations WHERE id=:'verifiedcitation'),'direct-role citation cannot forge signed page locator');
SELECT pg_temp.fail(format('INSERT INTO sw_citations(workspace_id,assessment_id,source_item_id,claim,excerpt,locator) VALUES(%L,%L,''53000000-0000-4000-8000-000000000031'',''forged'',''Not in original'',''Page 1'')',:'w',:'revision'),'23514','direct-role citation cannot forge extracted quotation');
SELECT pg_temp.fail(format('SELECT sw_reserve_processing(%L,gen_random_uuid(),''ai'',%L,NULL,1,gen_random_uuid())',:'w',:'revision'),'42501','AI activation deny by default');
RESET ROLE;
INSERT INTO sw_ai_activations(id,workspace_id,environment,purpose,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms)
VALUES('53000000-0000-4000-8000-000000000040',:'w','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','53000000-0000-4000-8000-000000000001',now()+interval '1 hour',100,200,2048,10000);
SET LOCAL ROLE authenticated;
UPDATE sw_analysis_inputs SET review_status='accepted' WHERE assessment_id=:'revision';
-- The signed extraction exists, but is excluded from the reserved AI input.
INSERT INTO sw_analysis_inputs(workspace_id,assessment_id,source_item_id,review_status) VALUES(:'w',:'revision','53000000-0000-4000-8000-000000000031','rejected');
SELECT (sw_reserve_processing(:'w','53000000-0000-4000-8000-000000000041','ai',:'revision',NULL,1,'53000000-0000-4000-8000-000000000040')).id AS aijob \gset
SELECT pg_temp.ok((sw_reserve_processing(:'w',:'aijob','ai',:'revision',NULL,1,'53000000-0000-4000-8000-000000000040')).id=:'aijob','AI retry reuses reservation and charge');
SAVEPOINT newly_accepted_dispatch;
UPDATE sw_analysis_inputs SET review_status='accepted' WHERE assessment_id=:'revision' AND source_item_id='53000000-0000-4000-8000-000000000031';
SELECT pg_temp.ok((SELECT version=1 FROM sw_assessments WHERE id=:'revision'),'new source acceptance leaves assessment version unchanged before dispatch');
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'w',:'aijob'),'PT409','AI dispatch rejects newly accepted source outside reserved manifest');
SELECT pg_temp.ok((SELECT status='reserved' AND fence IS NULL FROM sw_processing_jobs WHERE id=:'aijob'),'stale source set consumes no dispatch attempt');
ROLLBACK TO SAVEPOINT newly_accepted_dispatch;
SAVEPOINT replaced_dispatch_source;
UPDATE sw_analysis_inputs SET review_status=CASE WHEN source_item_id=:'item' THEN 'rejected' ELSE 'accepted' END WHERE assessment_id=:'revision';
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_analysis_inputs WHERE assessment_id=:'revision' AND review_status='accepted'),'replacement keeps accepted source cardinality unchanged');
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'w',:'aijob'),'PT409','AI dispatch rejects source replacement with equal cardinality');
ROLLBACK TO SAVEPOINT replaced_dispatch_source;
SAVEPOINT changed_dispatch_review;
UPDATE sw_analysis_inputs SET review_note='Additional human review' WHERE assessment_id=:'revision' AND source_item_id=:'item';
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'w',:'aijob'),'PT409','AI dispatch rejects changed review version with unchanged source IDs');
ROLLBACK TO SAVEPOINT changed_dispatch_review;
SELECT sw_dispatch_processing(:'w',:'aijob')->'job'->>'fence' AS aifence \gset
SELECT '{"status":"outcome_unknown","errorCode":"PROVIDER_RESPONSE_LOST"}' AS unknownpayload \gset
RESET ROLE;
SELECT sw_private.receipt_mac('ai'||E'\n'||:'aijob'||E'\n'||:'aifence'||E'\n'||sw_private.hash_text(:'unknownpayload'),repeat('synthetic-only-',4)) AS unknownsig \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((sw_complete_processing(:'w',:'aijob',:'aifence','synthetic-test-key',:'unknownpayload',:'unknownsig')).status='outcome_unknown','ambiguous provider outcome is explicit');
SELECT pg_temp.ok((sw_dispatch_processing(:'w',:'aijob')->>'dispatch')::boolean=false,'unknown outcome cannot redispatch');
SELECT pg_temp.ok((SELECT actual_cost_micros IS NULL AND reserved_cost_micros=100 FROM sw_processing_jobs WHERE id=:'aijob'),'unknown outcome retains cost reservation');
SELECT pg_temp.ok((sw_reserve_processing(:'w','53000000-0000-4000-8000-000000000049','ai',:'revision',NULL,1,'53000000-0000-4000-8000-000000000040')).id=:'aijob','new request UUID cannot replay identical unknown-cost input');
UPDATE sw_assessments SET uncertainty='Intentional next input version' WHERE id=:'revision';
SELECT sw_reserve_processing(:'w','53000000-0000-4000-8000-000000000042','ai',:'revision',NULL,2,'53000000-0000-4000-8000-000000000040');
SAVEPOINT new_input;
UPDATE sw_assessments SET uncertainty='Third input version' WHERE id=:'revision';
SELECT pg_temp.fail(format('SELECT sw_reserve_processing(%L,gen_random_uuid(),''ai'',%L,NULL,3,''53000000-0000-4000-8000-000000000040'')',:'w',:'revision'),'23514','workspace quota reservation is bounded');
ROLLBACK TO SAVEPOINT new_input;
SELECT sw_dispatch_processing(:'w','53000000-0000-4000-8000-000000000042')->'job'->>'fence' AS successfence \gset
SELECT jsonb_build_object('kind','source_fact','statement','Synthetic dependency observed','citations',jsonb_build_array(jsonb_build_object('segmentId',:'item','sourceItemId',:'item','quote','Synthetic service dependency interrupted.')),'userInputIds','[]'::jsonb,'uncertainty','') AS fact \gset
SELECT jsonb_build_object('kind','ai_proposal','statement','Review the dependency','citations','[]'::jsonb,'userInputIds','[]'::jsonb,'uncertainty','') AS proposal \gset
SELECT jsonb_build_object('status','succeeded','provider','synthetic','model','synthetic-model','inputTokens',100,'outputTokens',100,'costMicros',NULL,
 'output',jsonb_build_object('schemaVersion','sw-analysis-output-1.0.0','facts',jsonb_build_array(:'fact'::jsonb),'userInterpretations','[]'::jsonb,'assumptions','[]'::jsonb,'proposals',jsonb_build_array(:'proposal'::jsonb),'uncertainty','Unknown recovery time','contradictions','[]'::jsonb,'followups',jsonb_build_array(:'proposal'::jsonb),
 'risks',jsonb_build_array(jsonb_build_object('title','Proposed risk','description',:'fact'::jsonb,'likelihood',NULL,'consequence',NULL,'rationale',:'proposal'::jsonb,'currentControls','[]'::jsonb,'proposedActions',jsonb_build_array(:'proposal'::jsonb))),
 'report',jsonb_build_object('kind','rsa','sections',jsonb_build_array(jsonb_build_object('key','introduction','content',jsonb_build_array(:'fact'::jsonb),'missingInformation','')))))::text AS successpayload \gset
RESET ROLE;
SELECT sw_private.receipt_mac('ai'||E'\n'||'53000000-0000-4000-8000-000000000042'||E'\n'||:'successfence'||E'\n'||sw_private.hash_text(:'successpayload'),repeat('synthetic-only-',4)) AS successsig \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((sw_complete_processing(:'w','53000000-0000-4000-8000-000000000042',:'successfence','synthetic-test-key',:'successpayload',:'successsig')).status='succeeded','signed AI result persists without invented financial charge');
SAVEPOINT stale_apply;
UPDATE sw_analysis_questions SET answer='New human context' WHERE assessment_id=:'revision';
SELECT pg_temp.fail(format('SELECT sw_apply_ai_draft(%L,''53000000-0000-4000-8000-000000000042'',2,gen_random_uuid())',:'w'),'PT409','AI application rejects changed human context');
ROLLBACK TO SAVEPOINT stale_apply;
SAVEPOINT newly_accepted_apply;
UPDATE sw_analysis_inputs SET review_status='accepted' WHERE assessment_id=:'revision' AND source_item_id='53000000-0000-4000-8000-000000000031';
SELECT pg_temp.ok((SELECT version=2 FROM sw_assessments WHERE id=:'revision'),'new source acceptance leaves assessment version unchanged before application');
SELECT pg_temp.fail(format('SELECT sw_apply_ai_draft(%L,''53000000-0000-4000-8000-000000000042'',2,gen_random_uuid())',:'w'),'PT409','AI application rejects newly accepted source outside reserved manifest');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_ai_draft_applications WHERE job_id='53000000-0000-4000-8000-000000000042') AND (SELECT version=2 FROM sw_assessments WHERE id=:'revision'),'stale source set creates no application receipt or assessment change');
ROLLBACK TO SAVEPOINT newly_accepted_apply;
SAVEPOINT replaced_apply_source;
UPDATE sw_analysis_inputs SET review_status=CASE WHEN source_item_id=:'item' THEN 'rejected' ELSE 'accepted' END WHERE assessment_id=:'revision';
SELECT pg_temp.fail(format('SELECT sw_apply_ai_draft(%L,''53000000-0000-4000-8000-000000000042'',2,gen_random_uuid())',:'w'),'PT409','AI application rejects source replacement with equal cardinality');
ROLLBACK TO SAVEPOINT replaced_apply_source;
SAVEPOINT changed_apply_review;
UPDATE sw_analysis_inputs SET review_note='Additional human review' WHERE assessment_id=:'revision' AND source_item_id=:'item';
SELECT pg_temp.fail(format('SELECT sw_apply_ai_draft(%L,''53000000-0000-4000-8000-000000000042'',2,gen_random_uuid())',:'w'),'PT409','AI application rejects changed review version with unchanged source IDs');
ROLLBACK TO SAVEPOINT changed_apply_review;
SELECT (sw_apply_ai_draft(:'w','53000000-0000-4000-8000-000000000042',2,'53000000-0000-4000-8000-000000000080')).id AS applied \gset
SELECT pg_temp.ok((sw_apply_ai_draft(:'w','53000000-0000-4000-8000-000000000042',2,'53000000-0000-4000-8000-000000000081')).id=:'applied','AI application retry cannot duplicate draft effects');
SELECT pg_temp.ok((SELECT cardinality(risk_ids)=1 AND cardinality(action_ids)=1 AND cardinality(question_ids)=1 AND report_id IS NOT NULL FROM sw_ai_draft_applications WHERE id=:'applied'),'AI application records all structured draft identities');
SELECT pg_temp.ok((SELECT status='draft' AND approved_by IS NULL FROM sw_assessments WHERE id=:'revision'),'AI application never approves');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_ai_draft_applications WHERE job_id='53000000-0000-4000-8000-000000000042'),'AI application is exactly once per saved result');
SELECT pg_temp.login('53000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_ai_activations),'provider approvals hidden across workspaces');
SELECT pg_temp.fail(format('SELECT sw_reserve_processing(%L,gen_random_uuid(),''ai'',gen_random_uuid(),NULL,1,''53000000-0000-4000-8000-000000000040'')',:'otherw'),'42501','activation cannot cross workspace');
RESET ROLE;
SELECT pg_temp.login('53000000-0000-4000-8000-000000000001');
INSERT INTO sw_workspace_memberships(workspace_id,user_id,role) VALUES(:'w','53000000-0000-4000-8000-000000000003','viewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('53000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((sw_export_report(:'w',:'report',:'approval','53000000-0000-4000-8000-000000000096')).id=:'approval','active viewer can export approved snapshot');
SELECT pg_temp.fail(format('SELECT sw_reserve_document(%L,gen_random_uuid(),''viewer.pdf'',''application/pdf'',1,repeat(''a'',64))',:'w'),'42501','viewer cannot reserve document');
RESET ROLE;
SELECT pg_temp.login('53000000-0000-4000-8000-000000000001');
UPDATE sw_workspace_memberships SET active=false WHERE workspace_id=:'w' AND user_id='53000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('53000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_export_report(%L,%L,%L,gen_random_uuid())',:'w',:'report',:'approval'),'42501','revoked viewer cannot reuse export capability');
SELECT pg_temp.ok((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='sw-documents'),'revoked viewer cannot read original objects');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.fail('SELECT * FROM sw_documents','42501','generic service role cannot read documents');
SELECT pg_temp.fail('SELECT * FROM sw_processing_jobs','42501','generic service role cannot read jobs');
SELECT pg_temp.fail('SELECT * FROM sw_private.worker_keys','42501','generic service role cannot read signing key');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.fail('SELECT * FROM sw_documents','42501','anonymous cannot read documents');
SELECT pg_temp.fail('SELECT * FROM sw_report_approvals','42501','anonymous cannot read approval bundles');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
\if :{?sw_analysis_keep_fixture}
-- Caller executes preservation refusal in this still-open transaction.
\else
ROLLBACK;
\endif
