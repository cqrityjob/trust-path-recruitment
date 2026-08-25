-- Rollback for 20260913091000_cd_career_context_other_profession.sql.
--
-- Drops the constraint and the column.
--
-- THIS DESTROYS DATA. Any free-text profession a candidate supplied after
-- the migration is lost with the column -- it exists nowhere else, by
-- design (see the migration's header on why it is not a cig_professions
-- row). Revert the application code first so nothing is still writing it,
-- and take the loss deliberately rather than as a side effect.
--
-- The rest of the career-context columns are untouched: a session that
-- recorded "not listed" still says so afterwards, it just no longer says
-- what the profession was.

ALTER TABLE public.cd_sessions
  DROP CONSTRAINT IF EXISTS cd_sessions_current_profession_other_check;

ALTER TABLE public.cd_sessions
  DROP COLUMN IF EXISTS current_profession_other;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cd_sessions'
       AND column_name = 'current_profession_other') THEN
    RAISE EXCEPTION 'CD_CTX_OTHER_ROLLBACK_INCOMPLETE: the column is still present';
  END IF;
END $$;
