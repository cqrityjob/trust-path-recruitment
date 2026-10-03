-- =============================================================================
-- 20270124090000 -- BESKT: once a position has been readable by the others,
-- it stays its own recorded view. Exposure is a durable fact, not a state that
-- a later join can undo.
--
-- Follows 20270122090000 (P1-J). That migration refuses a reopen when "every
-- OTHER position is locked NOW". The predicate reads the current states only,
-- so it can be made false after the fact: A and B lock, bcp_conduct_may_see_others
-- opens and each reads the other, then an authorised assessor C joins with an
-- OPEN position. Every-other-is-locked is now false for A, and A reopens and
-- revises a position B had already read -- and that A wrote before reading B's.
--
-- The correction records the exposure itself:
--
--   * bcp_conduct_position_exposures holds one row per position the moment it
--     becomes readable by the others under the sharing rule (every position in
--     the session locked, at least two of them). The row is written by a row
--     trigger, so it holds on every path that locks a position, governed or not.
--   * A locked position with an exposure row is never reopened. The refusal is
--     in a BEFORE UPDATE trigger, so it holds against the RPC, a direct write
--     and the table owner alike, and it uses the code P1-J introduced:
--     BCP_CONDUCT_POSITIONS_ALREADY_SEEN.
--   * Every insert of a position and every change of a position's state takes
--     the session's transaction advisory lock -- the key bcp_conduct_join_session
--     already takes -- before it decides anything. Join, lock and reopen in one
--     session therefore serialise, and each decision reads the committed result
--     of the one before it. A revision-only update (an entry save) takes no
--     lock and is unaffected.
--
-- Unchanged: who may join, lock, reopen or read; the panel and its own reveal
-- guard; entries, corrections and verifications; bcp_conduct_reopen_position's
-- body (its P1-J check stays, and becomes redundant rather than wrong). A
-- position nobody has been able to read is still reopened as before.
--
-- Locking note. The exposure table has no foreign key to the positions on
-- purpose: a key check takes KEY SHARE on the referenced position, which waits
-- on the FOR UPDATE that the reopen RPC holds on its own row while it waits for
-- the session lock -- a deadlock by construction. Positions are never deleted
-- (bcp_guard_conduct_position), so a dangling row cannot arise.
--
-- Rollback: supabase/rollback/20270124090000_bcp_conduct_exposure_is_durable_rollback.sql
-- Suite:    supabase/tests/bcp_interview_conduct_test.sql, C7.13-C7.21
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bcp_conduct_position_exposures (
  position_id uuid PRIMARY KEY,
  session_id  uuid NOT NULL,
  exposed_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  basis       text NOT NULL CHECK (basis IN ('every_position_locked', 'backfill'))
);

CREATE INDEX IF NOT EXISTS bcp_conduct_position_exposures_session_idx
  ON public.bcp_conduct_position_exposures (session_id);

COMMENT ON TABLE public.bcp_conduct_position_exposures IS
  'One row per BESKT conduct position from the moment the other assessors could '
  'read it (every position in the session locked). A position with a row here '
  'is never reopened: it stays the view its assessor recorded independently.';

ALTER TABLE public.bcp_conduct_position_exposures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bcp_conduct_position_exposures FROM PUBLIC, anon, authenticated;

-- The exposure record is append-only: the fact that others have read a
-- position does not stop being true.
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_exposure_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'BCP_CONDUCT_EXPOSURE_APPEND_ONLY: that a position was readable by the others is never undone.'
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.bcp_guard_conduct_exposure_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bcp_conduct_position_exposures_append_only ON public.bcp_conduct_position_exposures;
CREATE TRIGGER bcp_conduct_position_exposures_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_position_exposures
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_exposure_append_only();

-- BEFORE: serialise state changes per session, then refuse reopening an
-- exposed position.
CREATE OR REPLACE FUNCTION public.bcp_conduct_position_exposure_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.session_id::text, 0));
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.state = 'locked' AND NEW.state = 'open'
     AND EXISTS (SELECT 1 FROM public.bcp_conduct_position_exposures x
                  WHERE x.position_id = OLD.id) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_POSITIONS_ALREADY_SEEN: the other assessors have read this position; it cannot be reopened.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bcp_conduct_position_exposure_guard()
  FROM PUBLIC, anon, authenticated, service_role;

-- AFTER: the moment the last position locks, every position in the session is
-- readable by the others; record that for each of them.
CREATE OR REPLACE FUNCTION public.bcp_conduct_position_exposure_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state = 'locked' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'locked')
     AND (SELECT count(*) FROM public.bcp_conduct_positions p
           WHERE p.session_id = NEW.session_id) >= 2
     AND NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
                      WHERE p.session_id = NEW.session_id AND p.state <> 'locked') THEN
    INSERT INTO public.bcp_conduct_position_exposures (position_id, session_id, basis)
    SELECT p.id, p.session_id, 'every_position_locked'
      FROM public.bcp_conduct_positions p
     WHERE p.session_id = NEW.session_id
    ON CONFLICT (position_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.bcp_conduct_position_exposure_record()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bcp_conduct_positions_exposure_guard ON public.bcp_conduct_positions;
CREATE TRIGGER bcp_conduct_positions_exposure_guard
  BEFORE INSERT OR UPDATE ON public.bcp_conduct_positions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_conduct_position_exposure_guard();

DROP TRIGGER IF EXISTS bcp_conduct_positions_exposure_record ON public.bcp_conduct_positions;
CREATE TRIGGER bcp_conduct_positions_exposure_record
  AFTER INSERT OR UPDATE ON public.bcp_conduct_positions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_conduct_position_exposure_record();

-- Sessions already past that moment: every position locked, two or more.
INSERT INTO public.bcp_conduct_position_exposures (position_id, session_id, basis)
SELECT p.id, p.session_id, 'backfill'
  FROM public.bcp_conduct_positions p
 WHERE (SELECT count(*) FROM public.bcp_conduct_positions q WHERE q.session_id = p.session_id) >= 2
   AND NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions q
                    WHERE q.session_id = p.session_id AND q.state <> 'locked')
ON CONFLICT (position_id) DO NOTHING;

-- Postflight.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid = 'public.bcp_conduct_positions'::regclass
        AND tgname IN ('bcp_conduct_positions_exposure_guard', 'bcp_conduct_positions_exposure_record')) <> 2 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_EXPOSURE_PROOF: the exposure triggers are missing';
  END IF;
  IF position('pg_advisory_xact_lock' IN (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.bcp_conduct_position_exposure_guard()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_EXPOSURE_PROOF: the guard does not serialise on the session';
  END IF;
  IF has_table_privilege('authenticated', 'public.bcp_conduct_position_exposures', 'SELECT')
     OR has_table_privilege('anon', 'public.bcp_conduct_position_exposures', 'SELECT') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_EXPOSURE_PROOF: a client role can read the exposure record directly';
  END IF;
  RAISE NOTICE 'BCP_CONDUCT_EXPOSURE_PROOF ok: an exposed position is never reopened, whoever joins later';
END $$;
