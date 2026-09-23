\set ON_ERROR_STOP on
BEGIN;
\ir recruitment_assignment_fixture.sql

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE first_assignment AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv));
CREATE TEMP TABLE retry_assignment AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv),
  now() + interval '90 days', 'en');
CREATE TEMP TABLE direct_retry AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM rj), (SELECT version_id FROM rjv), 'anna@journey.test',
  NULL, 'sv', 'recruitment', NULL, NULL, (SELECT application FROM rj), NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT row(f.*) = row(r.*) FROM first_assignment f CROSS JOIN retry_assignment r),
  'ID1 wrapper retry returns the same assignment, attempt, subject and governance');
SELECT pg_temp.ok((SELECT row(f.*) = row(r.*) FROM first_assignment f CROSS JOIN direct_retry r),
  'ID2 direct shared RPC cannot create a second attempt');
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments
  WHERE application_id = (SELECT application FROM rj)) = 1,
  'ID3 retries leave exactly one assignment');
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_attempts
  WHERE assignment_id = (SELECT assignment_id FROM first_assignment)) = 1,
  'ID4 retries leave exactly one attempt');
SELECT pg_temp.ok((SELECT language = 'sv' AND expires_at < now() + interval '31 days'
  FROM public.assessment_assignments WHERE id = (SELECT assignment_id FROM first_assignment)),
  'ID5 retries do not change the existing deadline or language');
SELECT pg_temp.ok(NOT has_function_privilege('anon',
  'public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)', 'EXECUTE'),
  'ID6 anonymous callers cannot invoke assignment');

GRANT SELECT ON first_assignment TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000009';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv)),
  'SCP_NOT_AUTHORISED_TO_ASSIGN', 'ID7 other tenant cannot reuse the existing assignment');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv)),
  'SCP_NOT_AUTHORISED_TO_ASSIGN', 'ID8 candidate cannot assign their own test');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid,%L::uuid,%L,NULL,''sv'',''recruitment'',NULL,NULL,%L::uuid,NULL)',
  (SELECT employer FROM rj), (SELECT version_id FROM rjv), 'bo@journey.test', (SELECT application FROM rj)),
  'SCP_APPLICATION_APPLICANT_MISMATCH', 'ID9 retry still checks the recipient');

-- Use the existing cancellation path: its trigger also abandons the attempt.
UPDATE public.assessment_assignments SET status = 'cancelled', cancelled_at = now()
 WHERE id = (SELECT assignment_id FROM first_assignment);
CREATE TEMP TABLE replacement_assignment AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT assignment_id FROM replacement_assignment) <>
  (SELECT assignment_id FROM first_assignment), 'ID10 an abandoned attempt permits a new assignment');
SELECT pg_temp.ok((SELECT status = 'abandoned' FROM public.scp_attempts
  WHERE id = (SELECT attempt_id FROM first_assignment)), 'ID11 cancelled history is retained');
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments
  WHERE application_id = (SELECT application FROM rj)) = 2,
  'ID12 replacement preserves both historical and current assignments');

-- A submitted attempt no longer owns the older "one OPEN attempt" key.
-- This is the regression that a unique-open index alone cannot prevent.
CREATE TEMP TABLE retry_items AS
SELECT iv.id, iv.item_format,
  (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id=iv.id ORDER BY o.display_order LIMIT 1) AS first_option,
  (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id=iv.id ORDER BY o.display_order DESC LIMIT 1) AS last_option
FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id=fi.item_version_id
WHERE fi.form_id=(SELECT form_id FROM public.scp_attempts WHERE id=(SELECT attempt_id FROM replacement_assignment));
GRANT SELECT ON retry_items, replacement_assignment TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';
DO $$
DECLARE item record; attempt uuid := (SELECT attempt_id FROM replacement_assignment);
BEGIN
  FOR item IN SELECT * FROM retry_items LOOP
    IF item.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(attempt,item.id,NULL,NULL,NULL,'Svar.');
    ELSIF item.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(attempt,item.id,NULL,item.first_option,item.last_option,NULL);
    ELSE
      PERFORM public.scp_save_response(attempt,item.id,item.first_option,NULL,NULL,NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(attempt);
END $$;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE submitted_retry AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT assignment_id FROM submitted_retry) =
  (SELECT assignment_id FROM replacement_assignment), 'ID15 submitted work is reused too');
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments
  WHERE application_id=(SELECT application FROM rj))=2, 'ID16 submitted retry creates no further assignment');

-- A newer version of the SAME test does not start a second test on this application.
CREATE TEMP TABLE retry_new_version AS SELECT gen_random_uuid() AS id;
INSERT INTO public.scp_assessment_versions
SELECT (jsonb_populate_record(NULL::public.scp_assessment_versions,
  to_jsonb(v) || jsonb_build_object('id',(SELECT id FROM retry_new_version),
  'version_number',v.version_number+100))).*
FROM public.scp_assessment_versions v WHERE v.id=(SELECT version_id FROM rjv);
CREATE TEMP TABLE retry_new_form AS SELECT gen_random_uuid() AS id;
INSERT INTO public.scp_forms
SELECT (jsonb_populate_record(NULL::public.scp_forms,
  to_jsonb(f) || jsonb_build_object('id',(SELECT id FROM retry_new_form),
  'assessment_version_id',(SELECT id FROM retry_new_version), 'slug','retry-new-version-fixture'))).*
FROM public.scp_forms f WHERE f.assessment_version_id=(SELECT version_id FROM rjv) LIMIT 1;
INSERT INTO public.scp_form_items
SELECT (jsonb_populate_record(NULL::public.scp_form_items,
  to_jsonb(fi) || jsonb_build_object('id',gen_random_uuid(),'form_id',(SELECT id FROM retry_new_form)))).*
FROM public.scp_form_items fi
WHERE fi.form_id=(SELECT form_id FROM public.scp_attempts WHERE id=(SELECT attempt_id FROM replacement_assignment));
GRANT SELECT ON retry_new_version TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE newer_version_retry AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT id FROM retry_new_version));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT assignment_id FROM newer_version_retry) =
  (SELECT assignment_id FROM replacement_assignment), 'ID17 idempotency spans versions of the same test');
SELECT pg_temp.ok((SELECT assessment_version_id FROM public.scp_attempts
  WHERE id=(SELECT attempt_id FROM replacement_assignment))=(SELECT version_id FROM rjv),
  'ID18 existing work keeps its originally pinned assessment version');

-- A second applicant is a separate idempotency scope.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'ea000000-3333-0000-0000-000000000002', job, employer, bo, 'submitted', now() FROM rj;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE second_application_assignment AS
SELECT * FROM public.scp_assign_from_application(
  (SELECT employer FROM rj), 'ea000000-3333-0000-0000-000000000002', (SELECT version_id FROM rjv));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT assignment_id FROM second_application_assignment) <>
  (SELECT assignment_id FROM replacement_assignment), 'ID13 another application gets its own test');
SELECT pg_temp.ok((SELECT count(*) FROM public.employees
  WHERE employer_id = (SELECT employer FROM rj)) = 0, 'ID14 no employment records are invented');

ROLLBACK;
