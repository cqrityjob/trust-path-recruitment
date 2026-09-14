-- ROLLBACK for 20261116090000_bcp_conduct_prompts_and_report.
--
-- Drops the prompt reader and the whole report chain, and narrows the one
-- governed vocabulary this migration widened back to exactly the members it
-- had before. One transaction, child-first, no CASCADE: a CASCADE here would
-- silently take whatever else had come to depend on these objects, and "what
-- else depends on this" is the question a rollback most needs answered rather
-- than suppressed.
--
-- ── WHAT THIS DELIBERATELY REFUSES ──────────────────────────────────────
--
-- It refuses while any BESKT report has been finalised. A finalised report is
-- the document a named human signed about a named candidate, and the whole
-- point of the table is that it cannot be altered afterwards -- by anyone,
-- including the owner. Dropping it would be the one edit the design exists to
-- prevent, performed by the script that is supposed to be the safe way back.
-- If the intent really is to discard those documents, that is an owner
-- decision about recruitment history, not one a rollback makes on everyone's
-- behalf.
--
-- It also refuses to narrow the event vocabulary while a conduct_report_finalised
-- event is on the ledger. bcp_events is append-only against every caller, the
-- table owner included, so those rows cannot be removed first -- a narrower
-- CHECK could not be validated over them and the rollback would fail halfway
-- through, having already dropped the report table. Saying so up front is the
-- difference between a refusal and a half-applied rollback.

BEGIN;

DO $$
DECLARE
  _reports integer;
  _events integer;
BEGIN
  SELECT count(*) INTO _reports FROM public.bcp_conduct_reports;
  IF _reports <> 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_ROLLBACK: % finalised BESKT report(s) exist. Each one is a document a '
      'named person signed about a named candidate, and the table exists precisely so that it '
      'cannot be altered afterwards. Remove them deliberately before rolling back; this script '
      'will not discard recruitment history.', _reports;
  END IF;

  SELECT count(*) INTO _events FROM public.bcp_events WHERE event = 'conduct_report_finalised';
  IF _events <> 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_ROLLBACK: % conduct_report_finalised event(s) are on the append-only '
      'ledger. bcp_events refuses DELETE for every caller including the owner, so the vocabulary '
      'cannot be narrowed back over them. The report objects can be dropped; the vocabulary must '
      'stay as it is. This is an owner decision, not a script''s.', _events;
  END IF;
END $$;

-- ---- the report chain, read surface first --------------------------------
DROP FUNCTION IF EXISTS public.bcp_conduct_report_versions(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_final_report(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_finalise_report(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_conduct_preview_report(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_report_blockers(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_build_report_basis(uuid);
DROP FUNCTION IF EXISTS public.bcp_conduct_basis_hash(jsonb);

DROP TRIGGER IF EXISTS bcp_conduct_reports_immutable ON public.bcp_conduct_reports;
DROP TABLE IF EXISTS public.bcp_conduct_reports;
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_report();

-- ---- the prompt reader ----------------------------------------------------
DROP FUNCTION IF EXISTS public.bcp_conduct_topic_prompts(uuid);

-- ---- the vocabulary, back to its PR 5A members ---------------------------
ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
ALTER TABLE public.bcp_events
  ADD CONSTRAINT bcp_events_event_check
  CHECK (event IN (
    -- PR 3
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked',
    -- PR 4
    'case_linked', 'case_unlinked',
    -- PR 5A
    'conduct_session_started', 'conduct_entry_saved', 'conduct_entry_corrected',
    'conduct_verification_requested', 'conduct_verification_updated',
    'conduct_position_locked', 'conduct_position_reopened',
    'conduct_panel_opened', 'conduct_panel_revealed',
    'conduct_panel_resolution_recorded'));

-- ---- and prove the way back is actually clear ----------------------------
DO $proof$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_class WHERE relname = 'bcp_conduct_reports';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_ROLLBACK: the report table survived.';
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_topic_prompts', 'bcp_conduct_preview_report',
                       'bcp_conduct_finalise_report', 'bcp_conduct_final_report',
                       'bcp_conduct_report_versions', 'bcp_conduct_report_blockers',
                       'bcp_conduct_build_report_basis', 'bcp_conduct_basis_hash',
                       'bcp_guard_conduct_report');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_ROLLBACK: % PR 6 function(s) survived.', _n;
  END IF;

  -- PR 5A is untouched: every one of its thirteen client functions is still
  -- there, because this rollback is about PR 6 and nothing else.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_start_session', 'bcp_conduct_join_session',
                       'bcp_conduct_save_entry', 'bcp_conduct_record_verification',
                       'bcp_conduct_lock_position', 'bcp_conduct_reopen_position',
                       'bcp_conduct_open_panel', 'bcp_conduct_reveal_panel',
                       'bcp_conduct_record_resolution', 'bcp_conduct_workspace',
                       'bcp_conduct_entry_history', 'bcp_conduct_may_see_others',
                       'bcp_conduct_can_read_session');
  IF _n <> 13 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_ROLLBACK: PR 5A should still have all 13 client functions, found %.', _n;
  END IF;

  -- And beskt_prompts is exactly as it was: this migration never touched it.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'beskt_prompts';
  IF _n <> 1 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_ROLLBACK: beskt_prompts should carry exactly its one governance policy, found %.', _n;
  END IF;

  RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_ROLLBACK ok';
END $proof$;

COMMIT;
