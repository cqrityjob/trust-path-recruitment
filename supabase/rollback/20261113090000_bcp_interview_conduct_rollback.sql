-- ROLLBACK for 20261113090000_bcp_interview_conduct.
--
-- Drops the BESKT conduct layer and restores the one governed vocabulary it
-- widened to exactly the members it had before. One transaction, child-first,
-- no CASCADE: a CASCADE here would silently take whatever else had come to
-- depend on these tables, and "what else depends on this" is the question a
-- rollback most needs answered rather than suppressed.
--
-- ── WHAT THIS DELIBERATELY REFUSES ──────────────────────────────────────
--
-- It refuses while any conduct session exists. A session is the record that a
-- real interview was conducted about a real candidate, and the entries under
-- it are what an interviewer recorded about a named person. Dropping the
-- tables would destroy that. If the intent really is to discard them, that is
-- an owner decision about recruitment history, not something a rollback script
-- makes on everyone's behalf.

BEGIN;

DO $$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.bcp_conduct_sessions;
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ROLLBACK: % conduct session(s) exist. Each one records that a real interview '
      'was conducted about a named candidate, and the entries under it are what an interviewer '
      'recorded about that person. Remove them deliberately before rolling back; this script will '
      'not discard recruitment history.', _n;
  END IF;

END $$;

-- ---- the read and write surface ------------------------------------------
DROP FUNCTION IF EXISTS public.bcp_conduct_entry_history(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_workspace(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_record_resolution(uuid, uuid, integer, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_reveal_panel(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.bcp_conduct_open_panel(uuid, uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_reopen_position(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_lock_position(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.bcp_conduct_record_verification(uuid, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_save_entry(uuid, uuid, integer, jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_join_session(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_start_session(uuid, uuid);

-- ---- triggers before the functions they call ------------------------------
DROP TRIGGER IF EXISTS bcp_conduct_panel_resolutions_append_only ON public.bcp_conduct_panel_resolutions;
DROP TRIGGER IF EXISTS bcp_conduct_verifications_append_only ON public.bcp_conduct_verifications;
DROP TRIGGER IF EXISTS bcp_conduct_panels_guard ON public.bcp_conduct_panels;
DROP TRIGGER IF EXISTS bcp_conduct_entries_guard ON public.bcp_conduct_entries;
DROP TRIGGER IF EXISTS bcp_conduct_positions_guard ON public.bcp_conduct_positions;
DROP TRIGGER IF EXISTS bcp_conduct_sessions_guard ON public.bcp_conduct_sessions;
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_append_only();
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_panel();
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_entry();
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_position();
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_session();

-- ---- the visibility helpers the policies used -----------------------------
-- After the policies are gone with their tables, so nothing is left depending
-- on them.
DROP TABLE IF EXISTS public.bcp_conduct_panel_resolutions;
DROP TABLE IF EXISTS public.bcp_conduct_panels;
DROP TABLE IF EXISTS public.bcp_conduct_verifications;
DROP TABLE IF EXISTS public.bcp_conduct_entries;
DROP TABLE IF EXISTS public.bcp_conduct_positions;
DROP TABLE IF EXISTS public.bcp_conduct_sessions;

DROP FUNCTION IF EXISTS public.bcp_conduct_can_read_session(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_may_see_others(uuid);

-- ---- the vocabulary --------------------------------------------------------
--
-- Restored to PR 4's state ONLY when nothing was ever recorded under it.
--
-- bcp_events is append-only by construction: PR 3's guard refuses a DELETE from
-- every caller, the table owner included. So if a conduct event was ever
-- written, the narrower CHECK cannot be put back -- ADD CONSTRAINT validates
-- existing rows and those rows would refuse it. The only way to "resolve" that
-- would be to delete recruitment history to make a constraint fit, which is not
-- something a rollback does on anyone's behalf.
--
-- Leaving the wider vocabulary in place is safe and honest: the conduct RPCs are
-- gone by this point, so nothing can write those events any more. The
-- vocabulary simply goes on admitting what the ledger already contains, which
-- is what an append-only ledger requires of it.
DO $vocab$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.bcp_events WHERE event LIKE 'conduct\_%';
  IF _n = 0 THEN
    ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
    ALTER TABLE public.bcp_events
      ADD CONSTRAINT bcp_events_event_check
      CHECK (event IN (
        'assignment_created', 'notice_acknowledged', 'response_saved',
        'response_submitted', 'assignment_cancelled', 'assignment_opened',
        'pilot_granted', 'pilot_revoked',
        'case_linked', 'case_unlinked'));
  ELSE
    RAISE NOTICE
      'BCP_CONDUCT_ROLLBACK: % conduct event(s) remain on the append-only ledger, so the event '
      'vocabulary keeps admitting them. Nothing can write them any more -- the conduct RPCs are '
      'gone -- and the history stays readable.', _n;
  END IF;
END $vocab$;

DO $proof$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'bcp\_conduct\_%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: % conduct table(s) survive.', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'bcp\_conduct\_%' OR p.proname LIKE 'bcp\_guard\_conduct\_%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: % conduct function(s) survive.', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'bcp\_conduct\_%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: % conduct policy/policies survive.', _n;
  END IF;

  -- The vocabulary is narrowed only when the ledger holds no conduct history;
  -- see the note above. Prove exactly that, rather than asserting a narrowing
  -- that an append-only ledger can make impossible.
  IF NOT EXISTS (SELECT 1 FROM public.bcp_events WHERE event LIKE 'conduct\_%')
     AND EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bcp_events'::regclass
                    AND pg_get_constraintdef(oid) LIKE '%conduct_%') THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ROLLBACK: no conduct event was ever recorded, so the vocabulary should have '
      'been narrowed, and it still admits a conduct event.';
  END IF;

  -- PR 4's members must survive untouched: this rollback unwinds PR 5A only.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bcp_events'::regclass
                    AND pg_get_constraintdef(oid) LIKE '%case_linked%case_unlinked%') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: the restored vocabulary lost PR 4''s own members.';
  END IF;
  IF to_regclass('public.bcp_case_links') IS NULL OR to_regclass('public.bcp_case_topics') IS NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: PR 4''s tables were dropped; this rollback unwinds PR 5A only.';
  END IF;

  RAISE NOTICE 'BESKT_INTERVIEW_CONDUCT_ROLLBACK ok';
END $proof$;

COMMIT;
