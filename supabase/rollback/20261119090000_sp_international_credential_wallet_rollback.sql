-- Removing this entry point preserves every claim and metadata row.
BEGIN;
DROP FUNCTION public.sp_save_international_credential(jsonb);
COMMIT;
