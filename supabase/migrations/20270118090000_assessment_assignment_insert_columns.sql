-- =============================================================================
-- P1-L -- an employer creates an assessment assignment as an invitation only;
-- it cannot write the result
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-L, reproduced on production with a
-- rolled-back probe):
--
--   authenticated held table-level INSERT on assessment_assignments, and the
--   only row rule (assignments_employer_insert) is "owner/admin of an active
--   employer". So an owner or admin could create, straight through PostgREST,
--   a row that is already status = 'completed' with any engine_result,
--   answers, completion_id and completed_at it liked -- skipping the server
--   computation (completeAssessmentAssignment -> computeEngineResultV1). The
--   employer and admin result views show it as a real result, and
--   getMyLinkableAssignments offers it to whoever owns recipient_email;
--   claimAssessmentAssignment then writes the invented report into that
--   person's My Career reports with the service role.
--
-- THE FIX: INSERT on the table is revoked from client roles and granted back
-- on exactly the columns the application sets when it creates an assignment
-- (createAssessmentAssignment in
-- src/lib/job-intelligence/assessment-assignments.functions.ts). status
-- therefore takes its default 'invited'; the lifecycle and result columns
-- (status, opened_at, started_at, completed_at, completion_id, answers,
-- engine_result, assessment_run_id, cancelled_*, email_*, scp_*) are written
-- only by the server's service-role paths and the SECURITY DEFINER SCP
-- functions, which are unaffected by client grants.
--
-- NOT CHANGED: the insert policy; UPDATE (already only status, cancelled_at);
-- SELECT; the service-role completion path; any row. Production holds 0
-- completed legacy assignments without a run, so nothing to repair.
--
-- Rollback: supabase/rollback/20270118090000_assessment_assignment_insert_columns_rollback.sql
-- Suite:    supabase/tests/assessment_assignment_insert_columns_test.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.assessment_assignments') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'assessment_assignments'
                     AND policyname = 'assignments_employer_insert') THEN
    RAISE EXCEPTION 'ASSIGNMENT_INSERT_COLUMNS_PRECONDITION: the assignments table or its insert policy is missing';
  END IF;
END $$;

REVOKE INSERT ON public.assessment_assignments FROM PUBLIC, anon, authenticated;
GRANT INSERT (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
              job_id, application_id, employee_id, recipient_email, recipient_user_id,
              assigned_by, language, employer_message, invitation_token_hash, expires_at)
  ON public.assessment_assignments TO authenticated;

DO $$
DECLARE _c text;
BEGIN
  IF has_table_privilege('authenticated', 'public.assessment_assignments', 'INSERT')
     OR has_table_privilege('anon', 'public.assessment_assignments', 'INSERT') THEN
    RAISE EXCEPTION 'ASSIGNMENT_INSERT_COLUMNS_PROOF: a client role still holds table-level INSERT';
  END IF;
  FOREACH _c IN ARRAY ARRAY['employer_id','assessment_id','assessment_version_id','profile_id','use_case',
                            'job_id','application_id','employee_id','recipient_email','recipient_user_id',
                            'assigned_by','language','employer_message','invitation_token_hash','expires_at'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.assessment_assignments', _c, 'INSERT') THEN
      RAISE EXCEPTION 'ASSIGNMENT_INSERT_COLUMNS_PROOF: authenticated cannot set %', _c;
    END IF;
  END LOOP;
  FOREACH _c IN ARRAY ARRAY['id','status','invited_at','opened_at','started_at','completed_at','cancelled_at',
                            'completion_id','answers','engine_result','assessment_run_id','created_at',
                            'updated_at','cancellation_reason','cancelled_by','email_delivery_status',
                            'email_delivery_error','email_sent_at','scp_assessment_version_id','scp_open'] LOOP
    IF has_column_privilege('authenticated', 'public.assessment_assignments', _c, 'INSERT')
       OR has_column_privilege('anon', 'public.assessment_assignments', _c, 'INSERT') THEN
      RAISE EXCEPTION 'ASSIGNMENT_INSERT_COLUMNS_PROOF: a client role may set % on creation', _c;
    END IF;
  END LOOP;
  RAISE NOTICE 'ASSIGNMENT_INSERT_COLUMNS_PROOF ok: an employer creates an invitation; the lifecycle and result columns are the server''s';
END $$;
