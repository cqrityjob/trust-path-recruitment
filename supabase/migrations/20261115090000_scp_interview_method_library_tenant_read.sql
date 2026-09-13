-- ============================================================================
-- INTERVIEW METHOD LIBRARY -- the employer read entitlement (pilot blocker 2)
-- ============================================================================
--
-- THE FINDING, reproduced on 2026-09-13 against a full replay of the canonical
-- history and against the five hosted policy predicates (byte-identical):
--
--   Draft interview-method design content is readable by every active
--   employer member of every employer organisation.
--
-- The five employer read policies below were written with a MEMBERSHIP
-- predicate only -- "the caller holds an active membership somewhere" -- and
-- no approval-state and no entitlement predicate at all:
--
--   scp_interview_methods_employer_read           (20260920090000)
--   scp_interview_method_practices_employer_read  (20260920090000)
--   scp_interview_conduct_steps_read              (20261002090000)
--   scp_interview_conduct_prohibitions_read       (20261002090000)
--   scp_interview_conduct_guidance_read           (20261003090000)
--
-- The runtime migration's own comment above the first two says "Approved
-- methods only, and read only"; the predicate never implemented the first
-- half. Every method in the library is approval_state = 'draft' (the six
-- seeded rows, CQrity TRUST included, which 20260922090000 records as an
-- owner-approved DESIGN HYPOTHESIS and not an approved method), so the whole
-- library -- purpose, supported behaviours, product implementation, practice
-- statements, conduct guidance -- is visible to any employer principal, with
-- no case, no grant and no governed availability decision behind it. A
-- candidate reads nothing and anon holds no grant; the gap is exactly the
-- employer tenant boundary.
--
-- THE CONTRACT this migration makes real is the one the product already
-- applies to governed pack content (20260920090000, 20260921090000 and the
-- owner decision of 2026-08-28 in 20260925090000), and the one PR #123's
-- owner review applied to the TRUST stage tables (20260923090000): an
-- employer reaches platform method content through its APPROVED contract, or
-- through a CASE the employer itself owns that pins the method. Nothing else.
--
--   usable-to-read = (method is APPROVED  AND caller holds an active membership)
--                  OR (a case of the caller's employer pins this method
--                      -- continuity access to work that exists, deliberately
--                      NOT re-gated on employer status, exactly as the pack
--                      read entitlement's pinned-case branch is not)
--
-- Governance readers (platform content roles and platform admins) keep their
-- own policies untouched: they govern the content and read every state.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * No table, column, grant, trigger or RPC signature changes. Five policy
--     predicates change, through ALTER POLICY, so no policy is ever absent.
--   * No beskt_*, bcp_* or sp_* object is touched. The BESKT read contract
--     (beskt_can_read_version and its PR 3 widening) and the Security
--     Passport domain are outside this migration.
--   * No pack content policy changes: scp_iv_employer_may_read_pack() already
--     carries published / open-pilot / grant / pinned-case, and is left as is.
--   * No approval is granted. Nothing here publishes a method; the only path
--     to "approved" remains the governed content roles.
--
-- CONSEQUENCE FOR THE LIVE WORKSPACE, stated rather than hidden: a case pinned
-- to CQrity TRUST keeps rendering its conduct steps, prohibitions and stage
-- guidance (they are pinned per method and the workspace already reads them
-- per pinned method). The PEACE/ORBIT practice statements belong to five
-- library methods that no case pins and that are not approved, so they stop
-- rendering for employers until a content role approves those methods. That
-- is the governed path becoming the only path, which is the point.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. The one predicate. SECURITY DEFINER is genuinely necessary: the policy
--     on scp_interview_methods must read scp_interview_methods (its approval
--     state) and scp_interview_cases, and an invoker-rights read of the
--     policy's own table recurses. So: pinned search_path, auth.uid() checked
--     first, membership resolved inside from employer_memberships (never from
--     a JWT claim), no execute for PUBLIC or anon.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_employer_may_read_method(_method_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _method_id IS NOT NULL
     AND (
       -- Approved platform content, for anyone with an active employer
       -- membership. The approved contract, and only the approved contract.
       (EXISTS (SELECT 1 FROM public.scp_interview_methods m
                 WHERE m.id = _method_id AND m.approval_state = 'approved')
        AND EXISTS (SELECT 1 FROM public.employer_memberships em
                     WHERE em.user_id = auth.uid() AND em.status = 'active'))
       -- Or a case this user's employer already pinned to it. CONTINUITY
       -- access to work that exists: deliberately not gated on
       -- employer_is_active_status(), exactly as the pack read entitlement's
       -- pinned-case branch is not. Continuity is not permission to start
       -- anything new; creation is refused for inactive employers in
       -- scp_iv_create_case().
       OR EXISTS (SELECT 1 FROM public.scp_interview_cases c
                   JOIN public.employer_memberships em ON em.employer_id = c.employer_id
                  WHERE c.trust_method_id = _method_id
                    AND em.user_id = auth.uid() AND em.status = 'active')
     );
$$;

REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_method(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_employer_may_read_method(uuid) IS
  'May the calling employer principal read this interview-method library row '
  'and the practice, conduct-step, prohibition and stage-guidance rows keyed to '
  'it? Approved method + any active membership; or a case of the caller''s own '
  'employer pinned to it (continuity, deliberately not re-gated on employer '
  'status). A draft, in-review or retired method that no case of the caller''s '
  'employer pins is invisible to every employer principal. Governance readers '
  'have their own policies and are not routed through here. Membership is '
  'resolved from employer_memberships, never from a JWT claim.';


-- ────────────────────────────────────────────────────────────────────────────
-- S2. Route the five employer read policies through it. ALTER POLICY keeps
--     each policy in place throughout: there is never a window without one,
--     and no policy name changes, so nothing that names them moves.
-- ────────────────────────────────────────────────────────────────────────────
ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods
  USING (public.scp_iv_employer_may_read_method(id));

ALTER POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices
  USING (public.scp_iv_employer_may_read_method(method_id));

ALTER POLICY scp_interview_conduct_steps_read ON public.scp_interview_conduct_steps
  USING (public.scp_interview_can_read(auth.uid())
         OR public.scp_iv_employer_may_read_method(method_id));

ALTER POLICY scp_interview_conduct_prohibitions_read ON public.scp_interview_conduct_prohibitions
  USING (public.scp_interview_can_read(auth.uid())
         OR public.scp_iv_employer_may_read_method(method_id));

ALTER POLICY scp_interview_conduct_guidance_read ON public.scp_interview_conduct_guidance
  USING (public.scp_interview_can_read(auth.uid())
         OR public.scp_iv_employer_may_read_method(method_id));

COMMENT ON POLICY scp_interview_methods_employer_read ON public.scp_interview_methods IS
  'Employer read of the method library: approved contract or the caller''s own '
  'pinned case, decided in scp_iv_employer_may_read_method(). Membership alone '
  'is not authorisation.';


-- ────────────────────────────────────────────────────────────────────────────
-- S3. Postflight. The migration refuses to complete unless the database it
--     leaves behind has the properties this file claims, read from the
--     catalogue and exercised for real -- never assumed from the text above.
-- ────────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  _fn    oid;
  _t     text;
  _p     text;
  _qual  text;
  _n     integer;
  _tables text[] := ARRAY[
    'scp_interview_methods',
    'scp_interview_method_practices',
    'scp_interview_conduct_steps',
    'scp_interview_conduct_prohibitions',
    'scp_interview_conduct_guidance'];
  _policies text[] := ARRAY[
    'scp_interview_methods_employer_read',
    'scp_interview_method_practices_employer_read',
    'scp_interview_conduct_steps_read',
    'scp_interview_conduct_prohibitions_read',
    'scp_interview_conduct_guidance_read'];
BEGIN
  -- The predicate: SECURITY DEFINER, search_path pinned, closed to PUBLIC
  -- and anon, open to authenticated and service_role and nothing else.
  SELECT p.oid INTO _fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method'
     AND pg_get_function_identity_arguments(p.oid) = '_method_id uuid';
  IF _fn IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate does not exist.';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = _fn) THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate is not SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
                  WHERE p.oid = _fn AND c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate does not pin search_path.';
  END IF;
  IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: anon can execute the predicate.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              WHERE p.oid = _fn AND a.grantee = 0) THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: PUBLIC can execute the predicate.';
  END IF;
  IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: authenticated or service_role cannot execute the predicate, so every policy below would refuse everyone.';
  END IF;
  -- The body resolves membership from the membership table, never a claim.
  IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid = _fn) ~* '(raw_user_meta_data|user_metadata|app_metadata|jwt\.claims)' THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate reads a JWT claim for authorisation.';
  END IF;

  -- Every one of the five policies is routed through the predicate and no
  -- longer carries the bare membership subquery; no policy on these tables
  -- is unconditional; the governance-reader policies are still present.
  FOR _n IN 1 .. array_length(_policies, 1) LOOP
    _p := _policies[_n];
    _t := _tables[_n];
    SELECT pol.qual INTO _qual FROM pg_policies pol
     WHERE pol.schemaname = 'public' AND pol.tablename = _t AND pol.policyname = _p
       AND pol.cmd = 'SELECT';
    IF _qual IS NULL THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: policy % on % is missing.', _p, _t;
    END IF;
    IF position('scp_iv_employer_may_read_method(' IN _qual) = 0 THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: policy % on % is not routed through the predicate: %', _p, _t, _qual;
    END IF;
    IF _qual ILIKE '%employer_memberships%' THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: policy % on % still decides on bare membership: %', _p, _t, _qual;
    END IF;
  END LOOP;
  FOREACH _t IN ARRAY _tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = _t AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: % does not carry ROW LEVEL SECURITY.', _t;
    END IF;
    -- An INSERT policy carries no USING clause, so "unconditional" is judged
    -- on whichever clause the policy actually has.
    IF EXISTS (SELECT 1 FROM pg_policies pol
                WHERE pol.schemaname = 'public' AND pol.tablename = _t
                  AND (pol.qual = 'true' OR pol.with_check = 'true'
                       OR (pol.cmd IN ('SELECT', 'ALL') AND pol.qual IS NULL))) THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: % carries an unconditional policy.', _t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies pol
                    WHERE pol.schemaname = 'public' AND pol.tablename = _t AND pol.cmd = 'SELECT'
                      AND pol.qual LIKE '%scp_interview_can_read(auth.uid())%') THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: % lost its governance-reader read.', _t;
    END IF;
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: anon can read %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public' AND g.table_name = _t AND g.grantee = 'PUBLIC') THEN
      RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: PUBLIC holds a grant on %.', _t;
    END IF;
  END LOOP;

  -- Exercised, not just inspected: with no signed-in principal the predicate
  -- refuses every method in the library, so it fails closed at the door.
  IF coalesce((SELECT bool_or(public.scp_iv_employer_may_read_method(m.id))
                 FROM public.scp_interview_methods m), false) THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate admits a caller with no auth.uid().';
  END IF;
  IF public.scp_iv_employer_may_read_method(NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: the predicate does not answer false for a null method.';
  END IF;

  RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok';
END $proof$;
