-- Rollback for 20261010090000_cv_documents.sql.
--
-- ── WHAT THIS DESTROYS ─────────────────────────────────────────────────
--
-- Every saved CV document, permanently.
--
-- That is stated first because it is the only thing about this file worth
-- knowing. A CV is presentation over facts that live elsewhere, so nothing
-- in security_career_profiles, sp_experience_periods, sp_claims or profiles
-- is touched and no person loses a fact about themselves -- but the
-- arrangement, the wording and the purpose they chose are gone, and there
-- is no other copy.
--
-- At the moment this ships that costs nothing: the table has no writer
-- (see the migration's header -- the application half comes in a later
-- release), so a rollback applied before that release drops an empty table.
-- Once the writer exists, running this is a decision about other people's
-- documents and should be taken as one.
--
-- Order matters only in that the trigger goes before the table it is on;
-- DROP TABLE would take it anyway, and dropping it explicitly keeps the
-- file readable as the exact inverse of the migration.

DROP TRIGGER IF EXISTS cv_documents_set_updated_at ON public.cv_documents;

DROP POLICY IF EXISTS "own cv select" ON public.cv_documents;
DROP POLICY IF EXISTS "own cv insert" ON public.cv_documents;
DROP POLICY IF EXISTS "own cv update" ON public.cv_documents;
DROP POLICY IF EXISTS "own cv delete" ON public.cv_documents;

DROP INDEX IF EXISTS public.cv_documents_owner_recent_idx;

-- public.set_updated_at() is NOT dropped: it predates this release and is
-- used by many tables. Removing a shared function to reverse one caller is
-- how a rollback becomes an outage.
DROP TABLE IF EXISTS public.cv_documents;
