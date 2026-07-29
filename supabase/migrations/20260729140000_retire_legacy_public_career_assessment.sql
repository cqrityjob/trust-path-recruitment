-- Retire the legacy 16-question instrument for NEW runs.
--
-- ADDITIVE. No legacy row is deleted, no legacy answer is modified, no
-- legacy run is rescored, and no legacy dimension is mapped to a v3 axis.
-- Reads keep working exactly as before, so every historical report stays
-- readable and exactly reproducible at /my-career/reports/$runId.
--
-- ── WHY A TRIGGER, NOT A HIDDEN LINK ───────────────────────────────────
--
-- Removing the CTA only stops a well-behaved browser. An outdated client, a
-- cached bundle, a bookmarked deep link or a direct API call would still
-- create a v2.1 run. The retirement therefore lives at the database layer,
-- exactly as `security-guard-foundation` was retired in PR-A, and it is a
-- TRIGGER rather than an RLS policy so it also binds service_role and any
-- other BYPASSRLS caller.
--
-- ── HOW ACTIVATION WORKS ───────────────────────────────────────────────
--
-- The gate reads `retired_at` on the catalog version. This migration SETS
-- it, so retirement is live on apply. Reversing it is one UPDATE — see the
-- rollback note in the PR — which is why the guard reads data rather than
-- hard-coding the assessment id in a CHECK constraint.

-- =========================================================================
-- 0. Re-assert: no payload-free completion path may survive a clean replay
-- =========================================================================
--
-- 20260729090000 drops the one-argument cd_complete_session stub, but Cloud
-- re-issued that migration under an EARLIER timestamp (20260729075534), so
-- on a clean replay Cloud's copy runs first and the authored file aborts on
-- "cd_internal_testers already exists" BEFORE reaching the drop. The stub
-- then survives, leaving a completion path that writes no report.
--
-- Re-asserted here, in a migration that applies cleanly, so the guarantee
-- holds regardless of which copy of 20260729090000 won the race.
DROP FUNCTION IF EXISTS public.cd_complete_session(uuid);

-- =========================================================================
-- 1. Mark the legacy versions retired in the catalog
-- =========================================================================

UPDATE public.assessment_versions
SET retired_at = now()
WHERE assessment_id = 'public-career-assessment'
  AND retired_at IS NULL;

-- =========================================================================
-- 2. Block new runs, allow every read
-- =========================================================================

CREATE OR REPLACE FUNCTION public.assessment_runs_block_retired_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _live int;
BEGIN
  -- A definition is startable while it still has at least one version that
  -- has not been retired. Positive proof: we count what is ALLOWED, so an
  -- empty or missing catalog fails closed rather than open.
  SELECT count(*) INTO _live
  FROM public.assessment_versions av
  WHERE av.assessment_id = NEW.assessment_id
    AND av.retired_at IS NULL;

  IF _live = 0 THEN
    RAISE EXCEPTION
      'ASSESSMENT_RETIRED_FOR_NEW_RUNS: "%" has been retired and cannot start a new run. Existing runs and their reports remain readable.',
      NEW.assessment_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

COMMENT ON FUNCTION public.assessment_runs_block_retired_definition() IS
  'Blocks NEW assessment_runs for any catalog definition whose versions are '
  'all retired. Reads, updates and deletes are untouched, so historical runs '
  'and their reports stay readable and reproducible. A trigger rather than an '
  'RLS policy so it binds BYPASSRLS callers too.';

-- INSERT only. Updating or reading an existing legacy run must keep working
-- — that is the whole point of retiring rather than deleting.
DROP TRIGGER IF EXISTS assessment_runs_block_retired_definition_trg ON public.assessment_runs;
CREATE TRIGGER assessment_runs_block_retired_definition_trg
  BEFORE INSERT ON public.assessment_runs
  FOR EACH ROW EXECUTE FUNCTION public.assessment_runs_block_retired_definition();

-- =========================================================================
-- 3. Prove the intent on apply
-- =========================================================================

DO $$
DECLARE _legacy_live int; _v3_rows int; _legacy_runs int;
BEGIN
  SELECT count(*) INTO _legacy_live FROM public.assessment_versions
   WHERE assessment_id = 'public-career-assessment' AND retired_at IS NULL;
  IF _legacy_live <> 0 THEN
    RAISE EXCEPTION 'LEGACY_RETIREMENT_INCOMPLETE: % live version(s) remain', _legacy_live;
  END IF;

  -- Career Discovery must NOT be retired by this migration.
  SELECT count(*) INTO _v3_rows FROM public.assessment_versions
   WHERE assessment_id = 'security-career-discovery-v3' AND retired_at IS NULL;
  IF _v3_rows < 1 THEN
    RAISE EXCEPTION 'V3_UNEXPECTEDLY_RETIRED: Career Discovery must remain startable';
  END IF;

  -- Historical runs must still be present and readable.
  SELECT count(*) INTO _legacy_runs FROM public.assessment_runs
   WHERE assessment_id = 'public-career-assessment';
  RAISE NOTICE 'Legacy retired for new runs. % historical run(s) preserved and readable.', _legacy_runs;
END $$;
