-- Option-order proof scope, step 3 of 3 (driven by scripts/db-test.sh).
-- Removes the historical twin exactly; nothing of the live form is touched.
\set ON_ERROR_STOP on
BEGIN;
DELETE FROM public.scp_form_items WHERE form_id = 'fe000000-0000-0000-0000-00000000f0f0'::uuid;
DELETE FROM public.scp_forms WHERE id = 'fe000000-0000-0000-0000-00000000f0f0'::uuid;
DELETE FROM public.scp_assessment_versions WHERE id = 'fe000000-0000-0000-0000-00000000a0a0'::uuid;
DELETE FROM public.scp_assessment_definitions WHERE id = 'fe000000-0000-0000-0000-00000000d0d0'::uuid;
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _n <> 1 THEN RAISE EXCEPTION 'CLEANUP: expected exactly one Väktare form to remain, found %', _n; END IF;
  RAISE NOTICE 'cleanup: the historical twin is gone; one Väktare form remains';
END $$;
COMMIT;
