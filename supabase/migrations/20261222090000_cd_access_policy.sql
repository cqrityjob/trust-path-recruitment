-- =============================================================================
-- Career Discovery -- the release control (internal_test / public / paused)
-- =============================================================================
--
-- Resolves CI-01 of docs/release/2026-09-28-release-uat-report.md.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────
--
-- Since 20260814 the signed-in Career Discovery journey has been gated on the
-- internal-tester allowlist: a signed-in person may START and SAVE a run only
-- if cd_is_internal_tester() says so (a row in cd_internal_testers, or a
-- platform admin). That gate was a deliberate hold while the recommendation
-- layer was mid-build, and it was enforced in the application server
-- (src/lib/career-discovery/v31-public.functions.ts) on top of the lifecycle
-- gate the database already carries.
--
-- Production today: cd_internal_testers is empty. An anonymous visitor can
-- complete the analysis and claim the result at signup; a signed-in candidate
-- sees "Karriäranalysen är inte öppen just nu" and My Career hides every
-- assessment door. That is the right shape for an internal test and the
-- wrong shape for a public launch.
--
-- ── WHAT THIS ADDS, AND WHAT IT DOES NOT ────────────────────────────────
--
-- One single-row policy table with three states, read through one function,
-- changed through one admin-only function:
--
--   internal_test  today's behaviour: signed-in access for allowlisted testers
--                  and platform admins only. Anonymous completion and the
--                  claim-at-signup path are unchanged.
--   public         every signed-in user may start and save a run. The tester
--                  allowlist is not consulted (it is kept, and can be
--                  consulted again by returning to internal_test).
--   paused         nobody but a platform admin may start or save, and the
--                  availability read says the analysis is closed, so the
--                  anonymous entrance closes too. The way to close the
--                  product again without touching governance.
--
-- The row ships as internal_test, so applying this migration changes NOTHING
-- for anyone. Opening the product is an owner action:
--
--   SELECT public.cd_set_access_state('public', 'Public launch 2026-…');
--   -- as a signed-in platform admin (auth.uid() must resolve), or, from the
--   -- SQL editor as the database owner:
--   UPDATE public.cd_access_policy SET state = 'public', note = '…', changed_at = now();
--
-- This is TECHNICAL AVAILABILITY only. It is separate from, and never edits:
--   * cd_definition_versions.lifecycle_status (content readiness; the
--     database still refuses a session against a non-administrable version,
--     CD_VERSION_NOT_ADMINISTRABLE);
--   * cd_definition_versions.review_status (the seven governance gates);
--   * content_version / scoring_version labels;
--   * the internal-tester allowlist and cd_grant_internal_tester().
-- Scoring, snapshot freezing, the claim flow and every privacy boundary are
-- untouched: this file adds no policy on any candidate table and grants
-- nothing on one.
--
-- The application reads cd_access_state() in getV31Availability (paused ->
-- closed for everyone) and cd_v31_may_start() in getV31TesterStatus and the
-- save path; My Career derives its assessment doors from those same two
-- functions (scripts/my-career-assessment-gate-check.ts).
-- =============================================================================

CREATE TABLE public.cd_access_policy (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  state      text NOT NULL DEFAULT 'internal_test'
             CHECK (state IN ('internal_test', 'public', 'paused')),
  note       text CHECK (note IS NULL OR char_length(note) <= 500),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cd_access_policy IS
  'Career Discovery release control: who may start and save a run right now. '
  'internal_test = allowlisted testers and platform admins; public = every '
  'signed-in user; paused = closed (admins only, anonymous entrance closed too). '
  'Technical availability only -- never the lifecycle, review gates or scoring '
  'of a definition version. Read via cd_access_state(), changed via '
  'cd_set_access_state() by a platform admin.';

ALTER TABLE public.cd_access_policy ENABLE ROW LEVEL SECURITY;
-- No policy: the client roles never read or write the row directly. The
-- hosted project grants new tables to client roles by default, so revoke
-- explicitly rather than assume.
REVOKE ALL ON TABLE public.cd_access_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.cd_access_policy TO service_role;

INSERT INTO public.cd_access_policy (singleton, state, note)
VALUES (true, 'internal_test',
        'Seeded closed by 20261222090000. Opening the analysis to every signed-in user is an owner action: cd_set_access_state(''public'', …).');

-- ── The read ────────────────────────────────────────────────────────────
-- Fails CLOSED: a missing row reads as paused.
CREATE OR REPLACE FUNCTION public.cd_access_state()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT p.state FROM public.cd_access_policy p WHERE p.singleton), 'paused');
$$;
COMMENT ON FUNCTION public.cd_access_state() IS
  'Career Discovery release state: internal_test | public | paused. Reads as '
  'paused when the policy row is missing. Callable by anon so the public '
  'entrance can close.';
REVOKE ALL ON FUNCTION public.cd_access_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_access_state() TO anon, authenticated, service_role;

-- ── May this signed-in person start and save a run? ─────────────────────
CREATE OR REPLACE FUNCTION public.cd_v31_may_start(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND CASE public.cd_access_state()
    WHEN 'public'        THEN true
    WHEN 'internal_test' THEN public.cd_is_internal_tester(_user_id)
    ELSE                      public.is_platform_admin(_user_id)
  END;
$$;
COMMENT ON FUNCTION public.cd_v31_may_start(uuid) IS
  'Whether this signed-in user may start and save a Career Discovery v3.1 run '
  'under the current release state. public: anyone signed in; internal_test: '
  'cd_is_internal_tester (testers and platform admins); paused: platform admins '
  'only. Does not decide the anonymous entrance (cd_access_state does).';
REVOKE ALL ON FUNCTION public.cd_v31_may_start(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_v31_may_start(uuid) TO authenticated, service_role;

-- ── The change: platform admins only, one row, one audit stamp ──────────
CREATE OR REPLACE FUNCTION public.cd_set_access_state(_state text, _note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'CD_ACCESS_REQUIRES_ADMIN: only a platform administrator may change the Career Discovery release state'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _state IS NULL OR _state NOT IN ('internal_test', 'public', 'paused') THEN
    RAISE EXCEPTION 'CD_ACCESS_UNKNOWN_STATE: % is not one of internal_test, public, paused', coalesce(_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.cd_access_policy
     SET state = _state,
         note = nullif(btrim(coalesce(_note, '')), ''),
         changed_by = auth.uid(),
         changed_at = now()
   WHERE singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CD_ACCESS_POLICY_MISSING: the cd_access_policy row is absent'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN _state;
END $$;
COMMENT ON FUNCTION public.cd_set_access_state(text, text) IS
  'Sets the Career Discovery release state (internal_test | public | paused). '
  'Platform administrators only; stamps who and when on the policy row.';
REVOKE ALL ON FUNCTION public.cd_set_access_state(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_set_access_state(text, text) TO authenticated, service_role;

-- ── Postflight: the state this file leaves behind ───────────────────────
DO $$
BEGIN
  IF public.cd_access_state() <> 'internal_test' THEN
    RAISE EXCEPTION 'CD_ACCESS_POLICY_PROOF failed: expected internal_test after apply, got %', public.cd_access_state();
  END IF;
  IF has_table_privilege('authenticated', 'public.cd_access_policy', 'SELECT')
     OR has_table_privilege('anon', 'public.cd_access_policy', 'SELECT') THEN
    RAISE EXCEPTION 'CD_ACCESS_POLICY_PROOF failed: a client role can read the policy table directly';
  END IF;
  IF has_function_privilege('anon', 'public.cd_set_access_state(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cd_v31_may_start(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CD_ACCESS_POLICY_PROOF failed: anon may execute a gated function';
  END IF;
  RAISE NOTICE 'CD_ACCESS_POLICY_PROOF ok: internal_test, table closed to client roles, admin-only change';
END $$;
