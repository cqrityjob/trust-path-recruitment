-- Restoring the prior definition would re-open new cases on a withdrawn
-- version and again forbid revocation. There is intentionally no unsafe DOWN.
-- Recover a compatible app by an ordinary forward release; repair SQL forward.
-- Preserve grants, audit, immutable snapshots/locks and finalized reports.
DO $$ BEGIN
 RAISE EXCEPTION 'SCP_IV_LIFECYCLE_ROLLBACK_UNSAFE: preserve withdrawal protection and all data; use a reviewed forward correction';
END $$;
