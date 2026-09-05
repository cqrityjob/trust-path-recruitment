-- Option-order proof scope, step 2 of 3 (driven by scripts/db-test.sh).
--
-- Two negative/positive cases, each in its own rolled-back transaction, with
-- ON_ERROR_STOP OFF so the expected failure can be observed and the
-- transaction still rolled back. db-test.sh greps this file's output.
--
--   A. the LIVE form loses one item -> the migration's proof must fail with
--      SCP_OPTION_ORDER_ITEM_COUNT ... found 49
--   B. the HISTORICAL twin loses one item -> the migration must still apply:
--      the proof does not look at it
\set ON_ERROR_STOP off
\echo === CASE A: malformed live form
BEGIN;
DELETE FROM public.scp_form_items fi
 WHERE fi.form_id = (SELECT f.id FROM public.scp_forms f
                       JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id AND av.version_number = 1
                       JOIN public.scp_assessment_definitions d ON d.id = av.definition_id AND d.slug = 'security-officer-recruitment'
                      WHERE f.slug = 'security-officer-recruitment-form-a')
   AND fi.display_order = 1;
\i supabase/migrations/20261021090000_scp_option_order_per_attempt.sql
ROLLBACK;
\echo === CASE B: malformed historical twin
BEGIN;
DELETE FROM public.scp_form_items fi
 WHERE fi.form_id = 'fe000000-0000-0000-0000-00000000f0f0'::uuid AND fi.display_order = 1;
\i supabase/migrations/20261021090000_scp_option_order_per_attempt.sql
SELECT 'CASE_B_APPLIED' AS marker;
ROLLBACK;
