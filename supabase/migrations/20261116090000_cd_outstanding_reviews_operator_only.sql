-- Outstanding review gates are operator-only.
--
-- ── THE DEFECT, AND HOW IT ARRIVED ───────────────────────────────────────
--
-- 20260731054834 created the view correctly:
--
--     CREATE VIEW public.cd_outstanding_reviews
--     WITH (security_invoker = true) AS ...
--
-- 20260731100000 then re-declared it to survive a re-run:
--
--     CREATE OR REPLACE VIEW public.cd_outstanding_reviews AS ...
--
-- `CREATE OR REPLACE VIEW` with no WITH clause does not preserve the previous
-- reloptions -- it RESETS them. security_invoker was silently dropped, and the
-- view fell back to the PostgreSQL default of definer semantics. Nothing in
-- either migration says this was intended; the second one was re-stating the
-- body, not changing the access model. Its own comment says the view exists so
-- operators can see "which reviews are still open on a live instrument".
--
-- Reproduced on a full replay of the canonical history and confirmed identical
-- on owner production wrygicdfxwjnrugduxnt: pg_class.reloptions IS NULL for
-- this view, while scp_scoring_version_lineage -- which IS deliberately a
-- definer view -- carries its {security_invoker=false,security_barrier=true}
-- explicitly. The contrast is the evidence: one was decided, this one drifted.
--
-- Consequence: the view ran with the owner's rights, so every signed-in user
-- read the outstanding governance gates of EVERY definition version, including
-- internal_test, draft and retired instruments that RLS on
-- cd_definition_versions otherwise hides from them.
--
-- ── WHY security_invoker = true IS NOT SUFFICIENT ON ITS OWN ─────────────
--
-- This is the part a generic linter remediation gets wrong, and it is why this
-- migration adds a predicate rather than only flipping the flag.
--
-- RLS permissive policies are OR-ed. cd_definition_versions carries two:
--
--     cd definition versions admin or tester readable
--         (is_platform_admin(auth.uid()) OR cd_is_internal_tester(auth.uid()))
--     cd definition versions live readable
--         (lifecycle_status = ANY (ARRAY['pilot','active']))      <- anon too
--
-- With invoker semantics alone an ordinary candidate still satisfies the
-- SECOND policy, so they keep reading the outstanding gates of every live
-- instrument. Measured on the replay: 7 rows, not 0. The owner's decision is
-- that ordinary candidates, employers and other authenticated users must not
-- read outstanding review gates AT ALL, so the flag alone does not implement
-- it.
--
-- ── WHAT THIS MIGRATION DOES ─────────────────────────────────────────────
--
--   1. security_invoker = true, stated in the SAME statement that declares the
--      body, so it cannot be reset by a later bare CREATE OR REPLACE the way
--      it was in 20260731100000. RLS on the base table now applies to the
--      caller instead of to the view owner.
--
--   2. An explicit operator predicate in the view body:
--      public.cd_is_internal_tester(auth.uid()). That function already encodes
--      exactly the set the owner named -- it returns true for a platform admin
--      (via is_platform_admin, covering admin and superadmin) OR for a row in
--      cd_internal_testers. It is reused rather than reimplemented: a second
--      definition of "who is an operator" is a second thing to keep in step.
--
--   3. security_barrier = true. Now that the view HAS a qual, this stops a
--      caller-supplied function in an outer WHERE from being evaluated against
--      rows before the operator predicate has filtered them. Same reasoning as
--      20260801100000 section 1, and here it is load-bearing rather than
--      pre-emptive.
--
-- The two layers are deliberate and independent: the predicate refuses the
-- rows, and invoker-mode RLS refuses them again. Either alone would close the
-- finding; both together mean a future change to one is not silently a breach.
--
-- ── WHAT IS NOT CHANGED ──────────────────────────────────────────────────
--
-- No table, column, RLS policy, function, trigger or row. The view's column
-- list and types are byte-for-byte what they were, so nothing that selects
-- from it needs to change. anon held no privilege before and holds none now.
-- scp_scoring_version_lineage is NOT touched: its definer semantics are a
-- reviewed decision recorded in 20260801100000 and guarded there.

CREATE OR REPLACE VIEW public.cd_outstanding_reviews
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  dv.definition_version,
  dv.lifecycle_status,
  g.key   AS review_gate,
  (g.value = 'true'::jsonb) AS cleared
FROM public.cd_definition_versions dv
CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
WHERE g.value <> 'true'::jsonb
  AND public.cd_is_internal_tester(auth.uid());

COMMENT ON VIEW public.cd_outstanding_reviews IS
  'Reviews not yet cleared, per definition version. OPERATOR-ONLY by owner '
  'decision of 2026-09-14: platform administrators and internal testers only. '
  'Two independent gates enforce that -- the cd_is_internal_tester(auth.uid()) '
  'predicate in the body, and security_invoker = true so RLS on '
  'cd_definition_versions applies to the caller. Do NOT re-declare this view '
  'with a bare CREATE OR REPLACE VIEW: that RESETS reloptions and is exactly '
  'how 20260731100000 silently dropped security_invoker. Do NOT rely on '
  'security_invoker alone either: the permissive "live readable" policy is '
  'OR-ed in and would still expose every pilot/active instrument. '
  'See migration 20261116090000.';

-- The access model, restated so this file alone documents it.
REVOKE ALL ON public.cd_outstanding_reviews FROM PUBLIC;
REVOKE ALL ON public.cd_outstanding_reviews FROM anon;
GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;

-- ---------------------------------------------------------------------------
-- Postflight
-- ---------------------------------------------------------------------------
-- Structural, plus one behavioural check that needs no fixture: this migration
-- runs with NO JWT subject, so auth.uid() is NULL, cd_is_internal_tester(NULL)
-- is false, and the view must therefore be empty even though the session is
-- the table owner and RLS would not otherwise constrain it. That single
-- assertion proves the predicate is actually wired into the body rather than
-- merely present in the text.

DO $$
DECLARE _opts text; _rows bigint; _def text;
BEGIN
  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO _opts
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'cd_outstanding_reviews';

  IF _opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_NOT_INVOKER: expected security_invoker=true, found "%"', _opts;
  END IF;

  IF _opts NOT LIKE '%security_barrier=true%' THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_NOT_BARRIER: expected security_barrier=true, found "%"', _opts;
  END IF;

  SELECT pg_get_viewdef('public.cd_outstanding_reviews'::regclass, true) INTO _def;
  IF _def NOT LIKE '%cd_is_internal_tester%' THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_NO_OPERATOR_PREDICATE: the operator gate is absent from the body';
  END IF;

  IF has_table_privilege('anon', 'public.cd_outstanding_reviews', 'SELECT') THEN
    RAISE EXCEPTION 'CD_OUTSTANDING_REVIEWS_ANON_READABLE: anon must hold nothing on this view';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.cd_outstanding_reviews', 'SELECT') THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_OPERATOR_LOCKED_OUT: authenticated needs SELECT or no operator can read it';
  END IF;

  -- No principal -> not an operator -> no rows, owner session notwithstanding.
  SELECT count(*) INTO _rows FROM public.cd_outstanding_reviews;
  IF _rows <> 0 THEN
    RAISE EXCEPTION
      'CD_OUTSTANDING_REVIEWS_LEAKS_WITHOUT_PRINCIPAL: % row(s) readable with no authenticated subject', _rows;
  END IF;

  RAISE NOTICE 'CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_PROOF ok';
END $$;
