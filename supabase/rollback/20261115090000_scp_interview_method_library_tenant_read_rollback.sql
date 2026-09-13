-- ROLLBACK for 20261115090000_scp_interview_method_library_tenant_read.
--
-- Restores the five employer read policies to the exact predicates they
-- carried before (20260920090000 / 20261002090000 / 20261003090000) and drops
-- the predicate function. Through ALTER POLICY, so no policy is ever absent.
--
-- WHAT THIS RE-OPENS, stated so that nobody runs it by accident: after this
-- rollback every active employer member of every employer reads the whole
-- draft method library again. That is the pilot-blocking finding this
-- migration closed. Run it only as a deliberate owner decision.
--
-- It refuses if anything other than the five policies this migration routed
-- has come to depend on the predicate -- another policy, a view, a function --
-- because dropping it would then silently take that dependency with it.
--
-- Run inside the caller's transaction (psql -1 -f ...): a refusal leaves the
-- database exactly as it was.

DO $$
DECLARE _offender text; _fn oid;
BEGIN
  SELECT p.oid INTO _fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method'
     AND pg_get_function_identity_arguments(p.oid) = '_method_id uuid';
  IF _fn IS NULL THEN
    RETURN;  -- already rolled back, or never applied: the ALTERs below are still idempotent
  END IF;

  -- Any policy outside the five that names the predicate.
  SELECT string_agg(pol.tablename || '.' || pol.policyname, ', ') INTO _offender
    FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND (coalesce(pol.qual, '') LIKE '%scp_iv_employer_may_read_method(%'
          OR coalesce(pol.with_check, '') LIKE '%scp_iv_employer_may_read_method(%')
     AND NOT (
       (pol.tablename, pol.policyname) IN (
         ('scp_interview_methods',              'scp_interview_methods_employer_read'),
         ('scp_interview_method_practices',     'scp_interview_method_practices_employer_read'),
         ('scp_interview_conduct_steps',        'scp_interview_conduct_steps_read'),
         ('scp_interview_conduct_prohibitions', 'scp_interview_conduct_prohibitions_read'),
         ('scp_interview_conduct_guidance',     'scp_interview_conduct_guidance_read')));
  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK BLOCKED: % now depends on scp_iv_employer_may_read_method(). Reconcile that first.', _offender;
  END IF;

  -- Any other catalogue dependency on the function (a view, a rule, another
  -- function's signature) from outside the policies above.
  SELECT string_agg(d.classid::regclass::text || ' ' || d.objid::text, ', ') INTO _offender
    FROM pg_depend d
   WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = _fn
     AND d.deptype <> 'i'
     AND d.classid <> 'pg_policy'::regclass;
  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK BLOCKED: % depends on scp_iv_employer_may_read_method(). Reconcile that first.', _offender;
  END IF;
END $$;

-- The five predicates, verbatim as 20260920090000, 20261002090000 and
-- 20261003090000 defined them.
ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods
  USING (EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'));

ALTER POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices
  USING (EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'));

ALTER POLICY scp_interview_conduct_steps_read ON public.scp_interview_conduct_steps
  USING (public.scp_interview_can_read(auth.uid())
         OR EXISTS (SELECT 1 FROM public.employer_memberships em
                     WHERE em.user_id = auth.uid() AND em.status = 'active'));

ALTER POLICY scp_interview_conduct_prohibitions_read ON public.scp_interview_conduct_prohibitions
  USING (public.scp_interview_can_read(auth.uid())
         OR EXISTS (SELECT 1 FROM public.employer_memberships em
                     WHERE em.user_id = auth.uid() AND em.status = 'active'));

ALTER POLICY scp_interview_conduct_guidance_read ON public.scp_interview_conduct_guidance
  USING (public.scp_interview_can_read(auth.uid())
         OR EXISTS (SELECT 1 FROM public.employer_memberships em
                     WHERE em.user_id = auth.uid() AND em.status = 'active'));

COMMENT ON POLICY scp_interview_methods_employer_read ON public.scp_interview_methods IS NULL;

DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_method(uuid);

DO $$
DECLARE _n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method') THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK: the predicate still exists.';
  END IF;
  SELECT count(*) INTO _n FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND pol.policyname IN (
       'scp_interview_methods_employer_read',
       'scp_interview_method_practices_employer_read',
       'scp_interview_conduct_steps_read',
       'scp_interview_conduct_prohibitions_read',
       'scp_interview_conduct_guidance_read')
     AND pol.qual LIKE '%employer_memberships%'
     AND pol.qual NOT LIKE '%scp_iv_employer_may_read_method%';
  IF _n <> 5 THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK: expected five restored membership policies, found %.', _n;
  END IF;
  RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK ok';
END $$;
