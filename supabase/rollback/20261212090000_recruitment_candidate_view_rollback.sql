-- Rollback of 20261212090000_recruitment_candidate_view.sql.
--
-- Drops the two read functions and nothing else: the migration changed no
-- table and no row, so there is nothing to restore. The application code
-- that calls them must be rolled back first (or the case page reads fail
-- with "function does not exist"), which is the schema-first order in
-- reverse.

DROP FUNCTION IF EXISTS public.rec_candidate_view(uuid, text, text, text, jsonb, text, text, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.rec_job_counts(uuid, uuid);
