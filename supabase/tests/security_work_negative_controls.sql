-- Deliberately weaken one actual database protection at a time. Every control
-- calls the same assertion as the positive suite, catches only its exact
-- assertion failure, then restores the schema and rows via ROLLBACK TO.
-- No regex mutation of source files and no accepted permission/no-op errors.
\set ON_ERROR_STOP on
\set sw_keep_fixture true
\ir security_work_foundation_test.sql
\unset sw_keep_fixture

CREATE OR REPLACE FUNCTION pg_temp.expect_assertion(stmt text, expected_label text, control text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_message text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
    IF actual_state IS DISTINCT FROM 'P0001' OR actual_message NOT IN (
      'ASSERTION FAILED: ' || expected_label,
      'ASSERTION FAILED: ' || expected_label || ' — statement unexpectedly SUCCEEDED'
    ) THEN
      RAISE EXCEPTION 'NEGATIVE CONTROL FAILED: % — wrong failure % (%)',
        control, actual_state, actual_message;
    END IF;
    RAISE NOTICE 'ok  SW-NC % detected the intended regression (%)', control, expected_label;
    RETURN;
  END;
  RAISE EXCEPTION 'NEGATIVE CONTROL FAILED: % — weakened protection escaped the original assertion', control;
END $$;

SAVEPOINT sw_nc_read;
ALTER TABLE public.sw_assessments DISABLE ROW LEVEL SECURITY;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT owner_b FROM sw));
SELECT pg_temp.expect_assertion(
  'SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), ''SW-ISOLATION B cannot read A'')',
  'SW-ISOLATION B cannot read A sw_assessments', '1 tenant read policy');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_read;

SAVEPOINT sw_nc_scope;
ALTER TABLE public.sw_monitoring_profiles DISABLE TRIGGER sw_10_guard;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_workspace_immutable()',
  'SW-IMMUTABLE dual member cannot move record', '2 immutable workspace');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_scope;

SAVEPOINT sw_nc_fk;
ALTER TABLE public.sw_source_items DROP CONSTRAINT sw_source_items_workspace_id_source_id_fkey;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_cross_workspace_fk()',
  'SW-FK dual member cannot attach foreign source', '3 composite foreign key');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_fk;

SAVEPOINT sw_nc_approval;
ALTER TABLE public.sw_assessments DISABLE TRIGGER sw_20_lifecycle;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_illegal_approval()',
  'SW-STATE direct approval and forged stamp are denied', '4 human state transition');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_approval;

SAVEPOINT sw_nc_grounding;
ALTER TABLE public.sw_citations DISABLE TRIGGER sw_20_citation;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_spoofed_citation()',
  'SW-CITATION quoted excerpt must occur in the source', '5 citation grounding');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_grounding;

SAVEPOINT sw_nc_frozen;
ALTER TABLE public.sw_assessments DISABLE TRIGGER sw_20_lifecycle;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT approver FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_approved_content()',
  'SW-FROZEN approved assessment content cannot change', '6 approved content');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_frozen;

SAVEPOINT sw_nc_citation;
ALTER TABLE public.sw_citations DISABLE TRIGGER sw_20_citation;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT approver FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_approved_citation()',
  'SW-FROZEN approved citation cannot be deleted', '7 approved citations');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_citation;

SAVEPOINT sw_nc_audit;
ALTER TABLE public.sw_audit_events DISABLE TRIGGER sw_00_immutable;
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_history_immutable()',
  'SW-HISTORY audit rows resist operator accidental rewrite', '8 immutable audit');
ROLLBACK TO SAVEPOINT sw_nc_audit;

SAVEPOINT sw_nc_source;
ALTER TABLE public.sw_source_items DISABLE TRIGGER sw_00_immutable;
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_source_immutable()',
  'SW-HISTORY source facts resist operator accidental rewrite', '9 immutable source facts');
ROLLBACK TO SAVEPOINT sw_nc_source;

SAVEPOINT sw_nc_service;
GRANT SELECT ON public.sw_assessments TO service_role;
SET LOCAL ROLE service_role;
SELECT pg_temp.login((SELECT owner_a FROM sw));
SELECT pg_temp.expect_assertion('SELECT pg_temp.assert_closed_role(''SW-SERVICE'')',
  'SW-SERVICE read sw_assessments', '10 provider role exposure');
RESET ROLE;
ROLLBACK TO SAVEPOINT sw_nc_service;

-- Prove restoration, not merely successful detection. None of the intentionally
-- removed policies, constraints, grants or triggers survives its savepoint.
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT owner_b FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-RESTORED isolation');
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.assert_workspace_immutable();
SELECT pg_temp.assert_cross_workspace_fk();
SELECT pg_temp.assert_illegal_approval();
SELECT pg_temp.assert_spoofed_citation();
SELECT pg_temp.login((SELECT approver FROM sw));
SELECT pg_temp.assert_approved_content();
SELECT pg_temp.assert_approved_citation();
RESET ROLE;
SELECT pg_temp.assert_history_immutable();
SELECT pg_temp.assert_source_immutable();
ROLLBACK;
