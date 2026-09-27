\set ON_ERROR_STOP on
BEGIN;
\ir recruitment_assignment_fixture.sql
CREATE TEMP TABLE source_items AS SELECT array_agg(fi.item_version_id ORDER BY fi.display_order) ids
FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id=fi.form_id
WHERE f.assessment_version_id=(SELECT version_id FROM rjv);
GRANT SELECT ON source_items TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE pinned AS SELECT * FROM public.scp_assign_from_application(
 (SELECT employer FROM rj),(SELECT application FROM rj),(SELECT version_id FROM rjv));
SELECT pg_temp.must_fail(format('SELECT public.scp_author_assessment_draft(%L,''notes'',%L::uuid[])',
 (SELECT version_id FROM rjv),(SELECT ids FROM source_items)), 'SCP_AUTHOR_REQUIRED','AD1 employer owner cannot author content');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-0000000000ad';
CREATE TEMP TABLE new_draft AS SELECT public.scp_author_assessment_draft(
 (SELECT version_id FROM rjv),'Synthetic revised composition',(SELECT ids[1:5] FROM source_items)) id;
CREATE TEMP TABLE new_test AS SELECT public.scp_author_assessment_draft(
 (SELECT version_id FROM rjv),'Synthetic new definition',(SELECT ids[1:5] FROM source_items),
 'synthetic-authoring-proof','Syntetiskt test','Synthetic test') id;
SELECT pg_temp.must_fail(format('UPDATE public.scp_assessment_versions SET authoring_release_required=false WHERE id=%L',(SELECT id FROM new_draft)),
 'SCP_CONTENT_RELEASE_REQUIRED','AD2 author cannot release through direct table API');
SELECT pg_temp.must_fail(format('SELECT public.scp_author_assessment_draft(%L,''notes'',ARRAY[gen_random_uuid()])',(SELECT version_id FROM rjv)),
 'SCP_DRAFT_ITEM_NOT_IN_SOURCE','AD3 foreign item IDs cannot enter a snapshot');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT content_status='draft' AND validation_status='design' AND authoring_release_required AND approved_at IS NULL AND published_at IS NULL
 FROM public.scp_assessment_versions WHERE id=(SELECT id FROM new_draft)), 'AD4 draft has no inherited release or approval');
SELECT pg_temp.ok((SELECT NOT d.standard_for_recruitment AND d.display_name_sv IS NULL
 FROM public.scp_assessment_definitions d JOIN public.scp_assessment_versions v ON v.definition_id=d.id WHERE v.id=(SELECT id FROM new_test)), 'AD5 new definition inherits no designation/display-name override');
SELECT pg_temp.ok((SELECT count(*)=5 FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id=fi.form_id WHERE f.assessment_version_id=(SELECT id FROM new_draft)), 'AD6 selected questions copied');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.scp_form_items fresh JOIN public.scp_forms f ON f.id=fresh.form_id
 JOIN public.scp_form_items old ON old.item_version_id=fresh.item_version_id JOIN public.scp_forms source ON source.id=old.form_id
 WHERE f.assessment_version_id=(SELECT id FROM new_draft) AND source.assessment_version_id=(SELECT version_id FROM rjv) AND fresh.display_order<>old.display_order), 'AD14 original question order survives unordered selection input');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.scp_form_blocks b JOIN public.scp_forms f ON f.id=b.form_id WHERE f.assessment_version_id=(SELECT id FROM new_draft)), 'AD7 participant sections copied');
SELECT pg_temp.ok((SELECT aa.scp_assessment_version_id=(SELECT version_id FROM rjv) AND a.assessment_version_id=(SELECT version_id FROM rjv)
 FROM public.assessment_assignments aa JOIN public.scp_attempts a ON a.assignment_id=aa.id WHERE aa.id=(SELECT assignment_id FROM pinned)), 'AD8 existing assignment and attempt retain original version');
GRANT SELECT ON new_draft,new_test,pinned TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok((SELECT NOT assignable AND unassignable_reason='not_permitted' FROM public.scp_employer_content_library((SELECT employer FROM rj)) WHERE item_id=(SELECT id FROM new_draft)), 'AD9 library refuses authored draft despite definition designation');
SELECT pg_temp.ok((SELECT assignable FROM public.scp_employer_content_library((SELECT employer FROM rj)) WHERE item_id=(SELECT version_id FROM rjv)), 'AD10 existing permitted version remains usable');
-- A different recipient avoids the intentional per-application idempotent replay.
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_employer_assign(%L,%L,''bo@journey.test'',NULL,''sv'',''workforce'')',
 (SELECT employer FROM rj),(SELECT id FROM new_draft)), 'SCP_CONTENT_RELEASE_REQUIRED','AD11 direct assignment RPC cannot bypass draft hold');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000009';
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.scp_employer_content_library((SELECT employer FROM rj))), 'AD12 foreign organisation cannot read library');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.scp_author_assessment_draft(uuid,text,uuid[],text,text,text)','EXECUTE'), 'AD13 anonymous cannot author');
ROLLBACK;
