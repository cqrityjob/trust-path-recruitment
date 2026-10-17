-- Rollback for 20270322090000: drops the preview function. It stores nothing,
-- so the rollback never refuses. An application release that calls it must be
-- rolled back first.
BEGIN;
DROP FUNCTION IF EXISTS public.sp_preview_application_disclosure();
COMMIT;
