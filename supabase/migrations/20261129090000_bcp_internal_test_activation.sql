-- ===========================================================================
-- BESKT — an explicit, employer-scoped INTERNAL TEST ACTIVATION
--
-- 20261129090000
--
-- ── WHY ────────────────────────────────────────────────────────────────
--
-- The owner decided (2026-09-18) to test BESKT end to end on the live site,
-- for the organisation cqrityjob only, with test data, before the method has
-- been reviewed. The existing release path cannot do that without faking
-- what it certifies: a method is assignable only when PUBLISHED, and it is
-- published only after five named reviewers each approve their own gate.
--
-- This migration adds a SEPARATE path that certifies nothing about the
-- method. It records the owner's decision to let ONE employer use ONE exact
-- piece of content for internal testing:
--
--   bcp_internal_test_activations   who decided, when, why, until when, for
--                                   which employer, and the content hash that
--                                   decision covers. It never touches
--                                   beskt_method_reviews, the version's
--                                   status or its validation label.
--
-- A test activation is usable only while ALL of these hold:
--   - it is unrevoked and today is before its expiry;
--   - the version's content hash is exactly the pinned hash (an edit, even
--     one that restores identical text, stops it at the next hash change);
--   - the version is recruitment_support and holds no security-vetting
--     profile, item or access class (the same structural test as
--     bcp_version_is_candidate_safe, without "published");
--   - the version is draft, in_review or published — never suspended or
--     retired.
-- Granting also requires the validator to report no blocking content
-- finding, so incomplete content cannot be activated.
--
-- ── WHAT IS EXTENDED, AND ONLY THAT ─────────────────────────────────────
--
-- The four gates that decide who may start and read a preparation accept
-- EITHER the existing path (published + candidate-safe + live pilot grant)
-- OR a live test activation for that same employer:
--   bcp_assign, bcp_assignable_exposure_profiles,
--   bcp_assignable_method_versions, bcp_party_can_read_method_version.
-- Their bodies are the current ones (md5-pinned below, verified identical in
-- production) with only those conditions changed. Nothing else in the
-- interview, conduct, panel or report chain changes: assessor independence
-- (20261127090000), case authority and tenant isolation are untouched.
--
-- ── CONTENT ROLES ──────────────────────────────────────────────────────
--
-- beskt_set_content_role lets a platform admin grant or withdraw the
-- platform content roles (editor, reviewer, publisher) through a governed,
-- audited RPC, keyed by the person's e-mail. There was no governed path at
-- all; the activation checklist already assumed one.
-- ===========================================================================

DO $pre$
DECLARE _n integer; _md5 text;
BEGIN
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_party_can_read_method_version';
  IF _n <> 1 OR _md5 <> '10873ada27198366eafa06e708fb7edf' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PRECONDITION: bcp_party_can_read_method_version is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assign';
  IF _n <> 1 OR _md5 <> '17fe1068d9bc3df2bbe8714db5933173' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PRECONDITION: bcp_assign is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_exposure_profiles';
  IF _n <> 1 OR _md5 <> 'd9b541a310219692fe9073c58e25aa07' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PRECONDITION: bcp_assignable_exposure_profiles is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_method_versions';
  IF _n <> 1 OR _md5 <> '000658663cb432406dc1a56128faa796' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PRECONDITION: bcp_assignable_method_versions is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
END $pre$;

-- ---- the owner's decision, recorded ----------------------------------------
CREATE TABLE public.bcp_internal_test_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  pinned_content_hash text NOT NULL CHECK (pinned_content_hash ~ '^[0-9a-f]{64}$'),
  decision_reference text NOT NULL CHECK (length(btrim(decision_reference)) >= 10),
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  expires_on date NOT NULL,
  grant_operation_id uuid NOT NULL UNIQUE,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revoke_reason text,
  revoke_operation_id uuid UNIQUE,
  CONSTRAINT bcp_ita_revocation_whole CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT bcp_ita_revocation_reason CHECK (revoked_at IS NULL OR length(btrim(coalesce(revoke_reason, ''))) > 0)
);

COMMENT ON TABLE public.bcp_internal_test_activations IS
  'The platform owner''s recorded decision to let ONE employer use ONE exact method content (pinned by hash) for INTERNAL FUNCTIONAL TESTING with test data. '
  'It is not a method review, does not publish anything and never changes the version''s status or validation label. '
  'Written only by bcp_grant_internal_test_activation / bcp_revoke_internal_test_activation (20261129090000).';

CREATE UNIQUE INDEX bcp_ita_one_live_idx
  ON public.bcp_internal_test_activations (employer_id, method_version_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.bcp_internal_test_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_internal_test_activations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bcp_internal_test_activations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bcp_internal_test_activations TO authenticated, service_role;

CREATE POLICY bcp_ita_party_read ON public.bcp_internal_test_activations
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid())
         OR public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member']));

CREATE OR REPLACE FUNCTION public.bcp_guard_internal_test_activation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('bcp.test_activation_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_UNGOVERNED_WRITE: written only by bcp_grant_internal_test_activation() and bcp_revoke_internal_test_activation().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_APPEND_ONLY: a test activation is revoked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_ALREADY_REVOKED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id
       OR NEW.pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash
       OR NEW.decision_reference IS DISTINCT FROM OLD.decision_reference
       OR NEW.decided_by IS DISTINCT FROM OLD.decided_by OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
       OR NEW.grant_operation_id IS DISTINCT FROM OLD.grant_operation_id THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_IMMUTABLE: only revocation may change a test activation.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bcp_guard_internal_test_activation() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_ita_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_internal_test_activations
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_internal_test_activation();

-- ---- the predicates --------------------------------------------------------

-- The structural half of bcp_version_is_candidate_safe, without "published".
CREATE OR REPLACE FUNCTION public.bcp_version_is_structurally_candidate_safe(_method_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.beskt_method_versions v
       WHERE v.id = _method_version_id
         AND v.mode = 'recruitment_support'
         AND v.release_scope = 'synthetic_internal_only')
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_exposure_profiles p
       WHERE p.method_version_id = _method_version_id
         AND (p.permitted_mode = 'security_vetting_support'
              OR p.access_class = 'authorised_security_function'
              OR p.retention_class = 'security_vetting_record'))
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_items i
       WHERE i.method_version_id = _method_version_id
         AND (i.permitted_mode = 'security_vetting_support'
              OR i.sensitivity_class = 'security_vetting_only'
              OR i.access_class = 'authorised_security_function'));
$$;

-- May this employer START with this version under a test activation now?
CREATE OR REPLACE FUNCTION public.bcp_internal_test_activation_active(_employer_id uuid, _method_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1
        FROM public.bcp_internal_test_activations t
        JOIN public.beskt_method_versions v ON v.id = t.method_version_id
       WHERE t.employer_id = _employer_id
         AND t.method_version_id = _method_version_id
         AND t.revoked_at IS NULL
         AND current_date < t.expires_on
         AND v.content_hash = t.pinned_content_hash
         AND v.content_status IN ('draft', 'in_review', 'published'))
    AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);
$$;

-- May a PARTY of an existing test preparation keep reading its content? Yes,
-- while the content is exactly what an activation of that employer covered
-- and what the preparation pinned -- even after the activation is revoked,
-- so a started test is never stranded half-way.
CREATE OR REPLACE FUNCTION public.bcp_internal_test_activation_covers(
  _employer_id uuid, _method_version_id uuid, _pinned_content_hash text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1
        FROM public.bcp_internal_test_activations t
        JOIN public.beskt_method_versions v ON v.id = t.method_version_id
       WHERE t.employer_id = _employer_id
         AND t.method_version_id = _method_version_id
         AND t.pinned_content_hash = _pinned_content_hash
         AND v.content_hash = _pinned_content_hash
         AND v.content_status IN ('draft', 'in_review', 'published'))
    AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);
$$;

REVOKE ALL ON FUNCTION public.bcp_version_is_structurally_candidate_safe(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_internal_test_activation_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_internal_test_activation_covers(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_version_is_structurally_candidate_safe(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bcp_internal_test_activation_active(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bcp_internal_test_activation_covers(uuid, uuid, text) TO service_role;

-- ---- recording and withdrawing the decision --------------------------------

CREATE OR REPLACE FUNCTION public.bcp_grant_internal_test_activation(
  _operation_id uuid, _employer_id uuid, _method_version_id uuid,
  _decision_reference text, _expires_on date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing public.bcp_internal_test_activations%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may record an internal test activation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _existing FROM public.bcp_internal_test_activations WHERE grant_operation_id = _operation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('activation_id', _existing.id, 'replayed', true,
      'pinned_content_hash', _existing.pinned_content_hash, 'expires_on', _existing.expires_on);
  END IF;
  IF length(btrim(coalesce(_decision_reference, ''))) < 10 THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_DECISION_REQUIRED: record the decision -- who decided, why and for what test.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _expires_on IS NULL OR _expires_on <= current_date OR _expires_on > current_date + 90 THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_EXPIRY: an internal test activation ends within 90 days.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers e WHERE e.id = _employer_id) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status NOT IN ('draft', 'in_review', 'published') THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_STATUS: a % version cannot be activated for testing.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.bcp_version_is_structurally_candidate_safe(_method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: only recruitment-support content holding no security-vetting content may be tested with candidates.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_hash IS NULL OR EXISTS (
       SELECT 1 FROM public.beskt_method_validate(_method_version_id, false) f
        WHERE f.severity = 'blocking') THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_INCOMPLETE: the validator still reports blocking findings for this version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_internal_test_activations t
              WHERE t.employer_id = _employer_id AND t.method_version_id = _method_version_id
                AND t.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_EXISTS: this employer already holds an unrevoked activation for this version; revoke it first.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('bcp.test_activation_write', 'on', true);
  INSERT INTO public.bcp_internal_test_activations
    (employer_id, method_version_id, pinned_content_hash, decision_reference, decided_by,
     expires_on, grant_operation_id)
  VALUES (_employer_id, _method_version_id, _v.content_hash, btrim(_decision_reference), auth.uid(),
          _expires_on, _operation_id)
  RETURNING id INTO _id;
  PERFORM set_config('bcp.test_activation_write', 'off', true);

  RETURN jsonb_build_object('activation_id', _id, 'replayed', false,
    'pinned_content_hash', _v.content_hash, 'expires_on', _expires_on);
END $$;

CREATE OR REPLACE FUNCTION public.bcp_revoke_internal_test_activation(
  _operation_id uuid, _activation_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.bcp_internal_test_activations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may revoke an internal test activation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _t FROM public.bcp_internal_test_activations WHERE revoke_operation_id = _operation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('activation_id', _t.id, 'revoked', true, 'replayed', true);
  END IF;
  IF length(btrim(coalesce(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _t FROM public.bcp_internal_test_activations WHERE id = _activation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _t.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_ALREADY_REVOKED' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('bcp.test_activation_write', 'on', true);
  UPDATE public.bcp_internal_test_activations
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(_reason),
         revoke_operation_id = _operation_id
   WHERE id = _activation_id;
  PERFORM set_config('bcp.test_activation_write', 'off', true);
  RETURN jsonb_build_object('activation_id', _activation_id, 'revoked', true, 'replayed', false);
END $$;

-- What the screens need to know about a version: is it being used under a
-- test activation rather than a review? Answered only to people who may read
-- the activation row itself.
CREATE OR REPLACE FUNCTION public.bcp_internal_test_activations_for(
  _employer_id uuid DEFAULT NULL, _method_version_id uuid DEFAULT NULL)
RETURNS TABLE (activation_id uuid, employer_id uuid, employer_name text, method_version_id uuid,
               pinned_content_hash text, decision_reference text, decided_by uuid, decided_at timestamptz,
               expires_on date, revoked_at timestamptz, revoke_reason text, is_live boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.employer_id, e.name, t.method_version_id, t.pinned_content_hash,
         t.decision_reference, t.decided_by, t.decided_at, t.expires_on, t.revoked_at,
         t.revoke_reason,
         public.bcp_internal_test_activation_active(t.employer_id, t.method_version_id)
           AND t.revoked_at IS NULL
    FROM public.bcp_internal_test_activations t
    JOIN public.employers e ON e.id = t.employer_id
   WHERE auth.uid() IS NOT NULL
     AND (_employer_id IS NULL OR t.employer_id = _employer_id)
     AND (_method_version_id IS NULL OR t.method_version_id = _method_version_id)
     AND (public.is_platform_admin(auth.uid())
          OR public.has_employer_role(auth.uid(), t.employer_id, ARRAY['owner', 'admin', 'member'])
          OR EXISTS (SELECT 1 FROM public.bcp_assignments a
                      WHERE a.employer_id = t.employer_id
                        AND a.method_version_id = t.method_version_id
                        AND a.candidate_user_id = auth.uid()))
   ORDER BY t.decided_at DESC;
$$;

REVOKE ALL ON FUNCTION public.bcp_grant_internal_test_activation(uuid, uuid, uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bcp_revoke_internal_test_activation(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bcp_internal_test_activations_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_grant_internal_test_activation(uuid, uuid, uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bcp_revoke_internal_test_activation(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bcp_internal_test_activations_for(uuid, uuid) TO authenticated, service_role;

-- ---- content roles, governed and audited ------------------------------------

CREATE TABLE public.beskt_content_role_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'reviewer', 'publisher')),
  action text NOT NULL CHECK (action IN ('granted', 'withdrawn')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE
);
COMMENT ON TABLE public.beskt_content_role_changes IS
  'Append-only audit of platform content-role grants and withdrawals made through beskt_set_content_role (20261129090000).';
ALTER TABLE public.beskt_content_role_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_content_role_changes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.beskt_content_role_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.beskt_content_role_changes TO authenticated, service_role;
CREATE POLICY beskt_crc_admin_read ON public.beskt_content_role_changes
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.beskt_set_content_role(
  _operation_id uuid, _email text, _role text, _grant boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid; _prior public.beskt_content_role_changes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_PLATFORM_ADMIN: only a platform administrator may change content roles.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _prior FROM public.beskt_content_role_changes WHERE operation_id = _operation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('user_id', _prior.user_id, 'role', _prior.role, 'action', _prior.action, 'replayed', true);
  END IF;
  IF _role IS NULL OR _role NOT IN ('editor', 'reviewer', 'publisher') THEN
    RAISE EXCEPTION 'BESKT_CONTENT_ROLE_UNKNOWN: "%".', _role USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'BESKT_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT u.id INTO _user FROM auth.users u WHERE lower(u.email) = lower(btrim(_email));
  IF _user IS NULL THEN
    RAISE EXCEPTION 'BESKT_USER_NOT_FOUND: no account has that e-mail address.' USING ERRCODE = 'check_violation';
  END IF;
  IF _grant THEN
    INSERT INTO public.scp_content_roles (user_id, role, granted_by)
    VALUES (_user, _role, auth.uid()) ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.scp_content_roles WHERE user_id = _user AND role = _role;
  END IF;
  INSERT INTO public.beskt_content_role_changes (user_id, role, action, reason, changed_by, operation_id)
  VALUES (_user, _role, CASE WHEN _grant THEN 'granted' ELSE 'withdrawn' END, btrim(_reason), auth.uid(), _operation_id);
  RETURN jsonb_build_object('user_id', _user, 'role', _role,
    'action', CASE WHEN _grant THEN 'granted' ELSE 'withdrawn' END, 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION public.beskt_set_content_role(uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_set_content_role(uuid, text, text, boolean, text) TO authenticated, service_role;

-- ---- the four gates, extended ------------------------------------------

CREATE OR REPLACE FUNCTION public.bcp_assign(_operation_id uuid, _application_id uuid, _method_version_id uuid, _exposure_profile_id uuid, _expected_content_hash text, _notice_version text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _ja public.job_applications%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'assign', 'application_id', _application_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'expected_content_hash', _expected_content_hash, 'notice_version', _notice_version,
    'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- ---- the existing spine: application, employer, job, candidate ---------
  SELECT * INTO _ja FROM public.job_applications WHERE id = _application_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_APPLICATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _ja.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting a preparation requires an active membership of the employer that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_ja.employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start preparations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ja.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_APPLICATION_WITHDRAWN: the candidate withdrew this application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _ja.applicant_user_id IS NULL THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_UNKNOWN: this application has no signed-in applicant, so there is nobody to prepare.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = _ja.job_id AND j.employer_id = _ja.employer_id) THEN
    RAISE EXCEPTION 'BCP_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---- the governed method: published, recruitment support, pinned ------
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  -- 20261129090000: or a version covered by this employer's live internal
  -- test activation -- the owner's recorded decision, never a review.
  IF _v.content_status <> 'published'
     AND NOT public.bcp_internal_test_activation_active(_ja.employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED: this method version is "%"; only a published version, or one under this employer''s live internal test activation, may be assigned.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: BESKT PR 3 assigns recruitment-support content only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.bcp_version_is_candidate_safe(_method_version_id)
          OR public.bcp_internal_test_activation_active(_ja.employer_id, _method_version_id)) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: this version holds security-vetting content and can never be put in front of a candidate here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is not recruitment support.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The caller names the content it was looking at; a method edited or
  -- republished since is a different question set and is refused.
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- the explicit release gate ----------------------------------------
  IF NOT (public.bcp_pilot_grant_active(_ja.employer_id, _method_version_id)
          OR public.bcp_internal_test_activation_active(_ja.employer_id, _method_version_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant for this BESKT method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _notice_version IS DISTINCT FROM public.bcp_notice_version() THEN
    RAISE EXCEPTION 'BCP_NOTICE_VERSION_UNKNOWN: the current candidate notice is "%".', public.bcp_notice_version()
      USING ERRCODE = 'check_violation';
  END IF;

  -- One live preparation per application. Serialise so two members cannot
  -- both pass the check.
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_application:' || _application_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.bcp_assignments a
              WHERE a.application_id = _application_id AND a.lifecycle_state <> 'cancelled') THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_EXISTS: this application already has a live BESKT preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, candidate_user_id, method_version_id,
     exposure_profile_id, pinned_content_hash, pinned_release_scope, notice_version,
     due_at, assigned_by)
  VALUES
    (_ja.employer_id, _ja.job_id, _application_id, _ja.applicant_user_id, _method_version_id,
     _exposure_profile_id, _v.content_hash, _v.release_scope, _notice_version,
     _due_at, auth.uid())
  RETURNING id INTO _id;

  _result := jsonb_build_object(
    'assignment_id', _id, 'application_id', _application_id, 'employer_id', _ja.employer_id,
    'job_id', _ja.job_id, 'candidate_user_id', _ja.applicant_user_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'content_hash', _v.content_hash, 'notice_version', _notice_version,
    'lifecycle_state', 'assigned', 'revision', 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_id, NULL, _ja.employer_id, _method_version_id,
    'assignment_created', NULL, 'assigned', NULL, _v.content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_assignable_exposure_profiles(_employer_id uuid, _method_version_id uuid)
 RETURNS TABLE(exposure_profile_id uuid, profile_key text, display_order integer, exposure_area text, duties_sv text, duties_en text, role_relevance_rationale_sv text, role_relevance_rationale_en text, retention_class text, candidate_item_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false)
     OR NOT ((public.bcp_pilot_grant_active(_employer_id, _method_version_id)
              AND public.bcp_version_is_candidate_safe(_method_version_id))
             OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id)) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.profile_key, p.display_order, p.exposure_area,
           p.duties_sv, p.duties_en,
           p.role_relevance_rationale_sv, p.role_relevance_rationale_en,
           p.retention_class,
           (SELECT count(*)::integer FROM public.beskt_items i
             WHERE i.exposure_profile_id = p.id
               AND i.phase = 'candidate_preparation'
               AND i.permitted_mode = 'recruitment_support')
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = 'recruitment_support'
     ORDER BY p.display_order, p.profile_key;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_assignable_method_versions(_employer_id uuid)
 RETURNS TABLE(method_version_id uuid, pack_id uuid, pack_slug text, name_sv text, name_en text, purpose_sv text, version_number integer, mode text, validation_label text, release_scope text, content_hash text, summary_sv text, summary_en text, grant_expires_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, g.expires_on
      FROM public.beskt_method_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      JOIN public.bcp_pilot_grants g
        ON g.method_version_id = v.id AND g.employer_id = _employer_id
     WHERE p.pack_kind = 'beskt_method'
       AND v.content_status = 'published'
       AND v.mode = 'recruitment_support'
       AND public.bcp_version_is_candidate_safe(v.id)
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on
    UNION ALL
    -- 20261129090000: versions this employer may use under a live internal
    -- test activation, and not already under a pilot grant.
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, t.expires_on
      FROM public.bcp_internal_test_activations t
      JOIN public.beskt_method_versions v ON v.id = t.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE t.employer_id = _employer_id
       AND p.pack_kind = 'beskt_method'
       AND public.bcp_internal_test_activation_active(_employer_id, v.id)
       AND t.revoked_at IS NULL
       AND NOT (v.content_status = 'published' AND public.bcp_pilot_grant_active(_employer_id, v.id))
     ORDER BY 4, 7 DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.has_employer_role(auth.uid(), a.employer_id,
                                          ARRAY['owner', 'admin', 'member']))
         -- 20261129090000: a published candidate-safe version, or the exact
         -- content an internal test activation of THIS employer covered.
         AND (public.bcp_version_is_candidate_safe(_method_version_id)
              OR public.bcp_internal_test_activation_covers(a.employer_id, _method_version_id,
                                                             a.pinned_content_hash)));
$function$
;

-- ---- postflight ---------------------------------------------------------------
DO $proof$
DECLARE _fn text;
BEGIN
  IF position('bcp_internal_test_activation_active' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_assign')) = 0
     OR position('bcp_pilot_grant_active' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_assign')) = 0
     OR position('bcp_internal_test_activation_active' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_assignable_exposure_profiles')) = 0
     OR position('bcp_internal_test_activations' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_assignable_method_versions')) = 0
     OR position('bcp_internal_test_activation_covers' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_party_can_read_method_version')) = 0
     OR position('bcp_version_is_candidate_safe' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_party_can_read_method_version')) = 0 THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: a gate does not carry both paths.';
  END IF;
  FOREACH _fn IN ARRAY ARRAY['bcp_assign', 'bcp_assignable_exposure_profiles', 'bcp_assignable_method_versions',
    'bcp_party_can_read_method_version', 'bcp_grant_internal_test_activation', 'bcp_revoke_internal_test_activation',
    'bcp_internal_test_activations_for', 'beskt_set_content_role', 'bcp_internal_test_activation_active',
    'bcp_internal_test_activation_covers', 'bcp_version_is_structurally_candidate_safe'] LOOP
    IF (SELECT count(*) FROM pg_proc WHERE proname = _fn) <> 1 THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: % has % overloads.', _fn, (SELECT count(*) FROM pg_proc WHERE proname = _fn);
    END IF;
    IF NOT (SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE proname = _fn) THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: % is not SECURITY DEFINER with a fixed search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = _fn), 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;
  FOREACH _fn IN ARRAY ARRAY['bcp_internal_test_activation_active', 'bcp_internal_test_activation_covers',
    'bcp_version_is_structurally_candidate_safe', 'bcp_guard_internal_test_activation'] LOOP
    IF has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = _fn), 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: % is internal but executable by authenticated.', _fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.bcp_internal_test_activations', 'INSERT')
     OR has_table_privilege('service_role', 'public.bcp_internal_test_activations', 'INSERT')
     OR has_table_privilege('anon', 'public.bcp_internal_test_activations', 'SELECT')
     OR has_table_privilege('anon', 'public.beskt_content_role_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.beskt_content_role_changes', 'INSERT') THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: a client role can write, or anon can read, a new table.';
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.bcp_internal_test_activations'::regclass)
     OR NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.beskt_content_role_changes'::regclass) THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: FORCE ROW LEVEL SECURITY is missing.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_internal_test_activations) THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_PROOF: the migration must seed nothing.';
  END IF;
  RAISE NOTICE 'BCP_INTERNAL_TEST_ACTIVATION_PROOF ok';
END $proof$;
