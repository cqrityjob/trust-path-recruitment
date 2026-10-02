-- Rollback of 20270117090000_assessment_assignment_insert_columns.
--
-- !! THIS REOPENS P1-L !! An owner or admin can again create an assignment
-- that is already completed with an invented engine_result. Run it ONLY in an
-- isolated test database (scripts/db-test.sh cycles it), never in production.
REVOKE INSERT ON public.assessment_assignments FROM authenticated;
GRANT INSERT ON public.assessment_assignments TO authenticated;
DO $$ BEGIN RAISE NOTICE 'ASSIGNMENT_INSERT_COLUMNS_ROLLBACK ok: table-level INSERT restored'; END $$;
