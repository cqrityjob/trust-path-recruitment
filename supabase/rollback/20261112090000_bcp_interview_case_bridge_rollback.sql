-- ROLLBACK for 20261112090000_bcp_interview_case_bridge.
--
-- Drops the bridge and restores the two governed vocabularies to exactly the
-- members they had before it. One transaction, child-first, no CASCADE: a
-- CASCADE here would silently take whatever else had come to depend on these
-- tables, and "what else depends on this" is the question a rollback most
-- needs answered rather than suppressed.
--
-- ── WHAT THIS DELIBERATELY REFUSES ──────────────────────────────────────
--
-- It refuses to run while any link exists, live or unlinked. A link is the
-- record that a candidate's submitted preparation was attached to a named
-- interview; dropping the table would destroy that record for every case that
-- has one. If the intent really is to discard them, unlink them through the
-- governed RPC first and delete them deliberately -- but that is an owner
-- decision about real recruitment history, not something a rollback script
-- should make on everyone's behalf.
--
-- It also refuses while any scp_interview_case_sources row still carries the
-- 'beskt_preparation' kind, because restoring the narrower CHECK constraint
-- would fail on that row anyway, and failing with a clear sentence beats
-- failing with a constraint violation.

BEGIN;

DO $$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.bcp_case_links;
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'BCP_BRIDGE_ROLLBACK: % case link(s) exist. Each one records that a candidate''s '
      'submitted preparation was attached to a named interview. Remove them deliberately '
      'before rolling back; this script will not discard recruitment history.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_case_sources
   WHERE source_kind = 'beskt_preparation';
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'BCP_BRIDGE_ROLLBACK: % case source(s) still carry source_kind = beskt_preparation. '
      'Restoring the original constraint would refuse them. Resolve them first.', _n;
  END IF;
END $$;

-- ---- the read and write surface ------------------------------------------
DROP FUNCTION IF EXISTS public.bcp_my_preparation_link(uuid);
DROP FUNCTION IF EXISTS public.bcp_case_preparation_basis(uuid);
DROP FUNCTION IF EXISTS public.bcp_linkable_interview_cases(uuid);
DROP FUNCTION IF EXISTS public.bcp_unlink_preparation_from_case(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_link_preparation_to_case(uuid, uuid, uuid, integer);

-- ---- triggers before the functions they call ------------------------------
DROP TRIGGER IF EXISTS bcp_case_topics_guard ON public.bcp_case_topics;
DROP TRIGGER IF EXISTS bcp_case_links_guard ON public.bcp_case_links;
DROP FUNCTION IF EXISTS public.bcp_guard_case_topic();
DROP FUNCTION IF EXISTS public.bcp_guard_case_link();

-- ---- child first ----------------------------------------------------------
DROP TABLE IF EXISTS public.bcp_case_topics;
DROP TABLE IF EXISTS public.bcp_case_links;

-- ---- the vocabularies, restored verbatim ----------------------------------
ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
ALTER TABLE public.bcp_events
  ADD CONSTRAINT bcp_events_event_check
  CHECK (event IN (
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked'));

ALTER TABLE public.scp_interview_case_sources
  DROP CONSTRAINT IF EXISTS scp_interview_case_sources_source_kind_check;
ALTER TABLE public.scp_interview_case_sources
  ADD CONSTRAINT scp_interview_case_sources_source_kind_check
  CHECK (source_kind IN (
    'job_description',
    'employer_requirements',
    'candidate_cv',
    'application_answers',
    'interviewer_notes',
    'transcript',
    'passport_disclosure'));

DO $proof$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('bcp_case_links', 'bcp_case_topics');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_BRIDGE_ROLLBACK: % bridge table(s) survive.', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_link_preparation_to_case', 'bcp_unlink_preparation_from_case',
                       'bcp_linkable_interview_cases', 'bcp_case_preparation_basis',
                       'bcp_my_preparation_link', 'bcp_guard_case_link', 'bcp_guard_case_topic');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_BRIDGE_ROLLBACK: % bridge function(s) survive.', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.scp_interview_case_sources'::regclass
                AND pg_get_constraintdef(oid) LIKE '%beskt_preparation%') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_ROLLBACK: the source vocabulary still admits beskt_preparation.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.bcp_events'::regclass
                AND pg_get_constraintdef(oid) LIKE '%case_linked%') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_ROLLBACK: the event vocabulary still admits case_linked.';
  END IF;

  RAISE NOTICE 'BESKT_INTERVIEW_CASE_BRIDGE_ROLLBACK ok';
END $proof$;

COMMIT;
