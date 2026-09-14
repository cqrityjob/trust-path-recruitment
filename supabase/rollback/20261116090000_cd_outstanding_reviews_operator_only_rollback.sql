-- ROLLBACK for 20261116090000_cd_outstanding_reviews_operator_only.
--
-- Restores public.cd_outstanding_reviews to the exact shape 20260731100000
-- left it in: the same four columns, no operator predicate, and no reloptions
-- at all -- which is what made it a definer view in the first place.
--
-- WHAT THIS RE-OPENS, stated so that nobody runs it by accident: after this
-- rollback EVERY signed-in user -- candidates, employers, members of any
-- tenant -- can again read the outstanding governance gates of EVERY
-- definition version, including internal_test, draft and retired instruments
-- that RLS on cd_definition_versions otherwise hides from them. That is the
-- finding 20261116090000 closed, and the owner decision of 2026-09-14 that
-- this data is operator-only. Run it only as a deliberate owner decision.
--
-- Run inside the caller's transaction (psql -1 -f ...): a refusal leaves the
-- database exactly as it was.

DO $$
DECLARE _offender text;
BEGIN
  IF to_regclass('public.cd_outstanding_reviews') IS NULL THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_ROLLBACK BLOCKED: the view does not exist; nothing to restore.';
  END IF;

  -- Anything that has come to depend on the operator-gated shape would be
  -- silently widened by this rollback rather than merely reverted.
  SELECT string_agg(DISTINCT dependent.relname, ', ') INTO _offender
    FROM pg_depend d
    JOIN pg_rewrite r      ON r.oid = d.objid
    JOIN pg_class dependent ON dependent.oid = r.ev_class
   WHERE d.refobjid = 'public.cd_outstanding_reviews'::regclass
     AND d.deptype = 'n'
     AND dependent.relname <> 'cd_outstanding_reviews';
  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_ROLLBACK BLOCKED: % now reads this view and would be widened by the revert. Reconcile that first.',
      _offender;
  END IF;
END $$;

-- DROP then CREATE rather than CREATE OR REPLACE: the pre-migration state is
-- "no reloptions", and only a fresh CREATE without a WITH clause reproduces
-- that faithfully. (A bare CREATE OR REPLACE would also reset them -- that is
-- the very bug -- but relying on the bug to undo the fix would leave the
-- rollback silently wrong the day PostgreSQL changes that behaviour.)
DROP VIEW public.cd_outstanding_reviews;

CREATE VIEW public.cd_outstanding_reviews AS
SELECT
  dv.definition_version,
  dv.lifecycle_status,
  g.key   AS review_gate,
  (g.value = 'true'::jsonb) AS cleared
FROM public.cd_definition_versions dv
CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
WHERE g.value <> 'true'::jsonb;

COMMENT ON VIEW public.cd_outstanding_reviews IS
  'Reviews not yet cleared, per definition version. Gates no longer block admission; this is how their real state stays visible.';

REVOKE ALL ON public.cd_outstanding_reviews FROM anon;
GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;

DO $$
DECLARE _opts text;
BEGIN
  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO _opts
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'cd_outstanding_reviews';

  IF _opts <> '' THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_ROLLBACK_INCOMPLETE: expected no reloptions, found "%"', _opts;
  END IF;

  IF pg_get_viewdef('public.cd_outstanding_reviews'::regclass, true) LIKE '%cd_is_internal_tester%' THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_ROLLBACK_INCOMPLETE: the operator predicate is still in the body';
  END IF;

  RAISE NOTICE 'CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_ROLLBACK ok -- the view is definer-mode and ungated again';
END $$;
