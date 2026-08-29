-- ============================================================================
-- ONE START CONTRACT — the list and the create button must agree
-- ============================================================================
--
-- P0, found in owner UAT: on /interview-intelligence/new the Väktare v1 pack
-- was offered in the selector, and pressing "Skapa intervju" answered
-- "Det här rollpaketet är inte tillgängligt för er just nu."
--
-- ── Why it happened ─────────────────────────────────────────────────────────
--
-- The selector and the button were answering two DIFFERENT questions.
--
--   The list  asked "may this USER READ any pack version?" -- a plain RLS
--             SELECT over scp_interview_pack_versions. listUsablePacks()
--             accepted an employerId and never used it.
--   The button asked "may THIS EMPLOYER START a new case with THIS version?"
--             -- scp_iv_create_case(), which is employer-scoped and stricter.
--
-- Reproduced on the canonical schema with synthetic data, two ways:
--
--   1. CONTINUITY. scp_iv_employer_may_read_pack() deliberately keeps a
--      version readable once a case has pinned it, so finished work stays
--      interpretable after the content is withdrawn. The selector consumed
--      that read grant as if it were permission to start something new --
--      exactly the confusion the open-pilot migration warned about in prose
--      and then left structurally possible. Withdrawn pack + one existing
--      case = listed, and refused on submit with SCP_IV_PACK_NOT_USABLE.
--      This is the reported failure.
--
--   2. MULTI-EMPLOYER. The read entitlement is satisfied by ANY active
--      membership of ANY active employer. A user who belongs to an active
--      employer and a suspended one saw the pack listed inside the SUSPENDED
--      employer's workspace, and got SCP_IV_EMPLOYER_NOT_ACTIVE on submit.
--
-- ── The fix: one definition, used by both ───────────────────────────────────
--
-- scp_iv_case_start_basis(employer, version) is now the single server-side
-- answer to "can this employer start a new case with this pack version now?"
-- It returns the entitlement basis or NULL. scp_iv_create_case() calls it
-- instead of re-deriving the rule, and scp_iv_startable_pack_versions()
-- lists exactly the versions for which it is non-NULL. One rule, two callers,
-- no drift possible.
--
-- RLS is unchanged and remains defence in depth: the lister is SECURITY
-- DEFINER and enforces membership itself, and the read policies still govern
-- every other path to pack content.
--
-- Nothing about the entitlement RULES changes. ACTIVE employer is still
-- required to start; continuity read access is preserved and still is not
-- permission to start; withdrawn content still starts nothing; the grant path
-- for restricted cohorts still works; pilot content is still internal_qa and
-- still pilot_hypothesis; production still requires an approved TRUST method.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. The one definition.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_case_start_basis(
  _employer_id uuid, _pack_version_id uuid, _user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _who uuid := coalesce(_user_id, auth.uid());
BEGIN
  -- Starting anything requires an ACTIVE employer, on every path. This is the
  -- half that continuity read access deliberately does NOT carry.
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN NULL;
  END IF;

  SELECT content_status INTO _status
    FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF _status IS NULL THEN
    RETURN NULL;
  END IF;

  -- Strongest basis first, so the audit trail records the real reason.
  IF _status = 'published' THEN
    RETURN 'published';
  END IF;
  IF public.scp_iv_open_pilot_available(_pack_version_id) THEN
    RETURN 'open_pilot';
  END IF;
  IF public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, _who) THEN
    RETURN 'pilot_grant';
  END IF;

  RETURN NULL;
END; $$;

-- INTERNAL: it answers for an arbitrary (employer, version) pair without
-- checking that the caller belongs to that employer. The membership check
-- lives in the two callers below, both SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) IS
  'INTERNAL and AUTHORITATIVE: the single answer to "can this employer start '
  'a NEW case with this pack version now?". Returns published / open_pilot / '
  'pilot_grant, or NULL. Requires an ACTIVE employer on every path -- unlike '
  'the read entitlement, whose pinned-case branch is continuity access to '
  'existing work and never permission to start. Both scp_iv_create_case() '
  'and scp_iv_startable_pack_versions() call this, so the button and the '
  'list cannot disagree.';


-- ────────────────────────────────────────────────────────────────────────────
-- S2. May this employer start interviews at all? Separated so the screen can
--     explain "your account is not active" instead of showing an empty list.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_employer_can_start_interviews(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member'])
     AND coalesce(public.employer_is_active_status(_employer_id), false);
$$;

REVOKE ALL ON FUNCTION public.scp_iv_employer_can_start_interviews(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_can_start_interviews(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_employer_can_start_interviews(uuid) IS
  'Is the caller a member of this employer AND is the employer active? Lets '
  'the new-interview screen say why nothing can be started, rather than '
  'rendering an unexplained empty selector.';


-- ────────────────────────────────────────────────────────────────────────────
-- S3. The list. Exactly the versions this employer can start with, right now.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_startable_pack_versions(_employer_id uuid)
RETURNS TABLE (
  pack_version_id uuid,
  pack_id uuid,
  pack_slug text,
  name_sv text,
  name_en text,
  version_number integer,
  content_status text,
  validation_label text,
  locale text,
  entitlement_basis text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Membership and employer status first: a non-member learns nothing, and a
  -- suspended employer's members see an empty list rather than a list they
  -- cannot act on. Candidates hold no membership and so enumerate nothing.
  IF NOT public.scp_iv_employer_can_start_interviews(_employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, v.version_number,
           v.content_status, v.validation_label, v.locale, b.basis
      FROM public.scp_interview_pack_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      CROSS JOIN LATERAL public.scp_iv_case_start_basis(_employer_id, v.id, auth.uid()) AS b(basis)
     WHERE b.basis IS NOT NULL
     ORDER BY p.name_sv, v.version_number DESC;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_startable_pack_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_startable_pack_versions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_startable_pack_versions(uuid) IS
  'The pack versions this employer can start a NEW interview with right now, '
  'and nothing else. Shares scp_iv_case_start_basis() with '
  'scp_iv_create_case(), so a version offered here is a version the create '
  'call accepts unless the state changed in between. Returns no rows for a '
  'non-member, for an inactive employer, and for anyone holding only '
  'continuity read access to a withdrawn version.';


-- ────────────────────────────────────────────────────────────────────────────
-- S4. Creation now derives its basis from the shared definition.
--
--     Same refusals, same messages, same order as 20260925090000 -- the only
--     change is that the three-way basis decision is no longer written out a
--     second time here, where it could drift from the list.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _method_id uuid;
  _usage text;
  _basis text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'SCP_IV_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start interviews.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- The authoritative decision, shared with the list.
  _basis := public.scp_iv_case_start_basis(_employer_id, _pack_version_id, auth.uid());

  IF _basis IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and is neither published, openly available for pilot use, nor covered by a live pilot grant for you.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _usage := CASE WHEN _pack.content_status = 'published' THEN 'production' ELSE 'internal_qa' END;
  _method_id := public.scp_trust_eligible_method(_usage);

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title,
     created_by, trust_method_id)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid(), _method_id)
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'trust_method_version',
                         (SELECT version_number FROM public.scp_interview_methods WHERE id = _method_id),
                       'trust_usage_mode', _usage,
                       'entitlement_basis', _basis,
                       'used_pilot_grant', _basis = 'pilot_grant'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid) IS
  'Creates an interview case for an ACTIVE employer. The entitlement decision '
  'comes from scp_iv_case_start_basis(), the same function that builds the '
  'selector on the new-interview screen, so a pack that is offered is a pack '
  'that can be started. Pins the pack version, its content hash and the '
  'eligible CQrity TRUST method version, and records which basis admitted it.';


-- ────────────────────────────────────────────────────────────────────────────
-- S5. Self-check: the two callers must agree, on this database, right now.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _n integer;
BEGIN
  -- Every startable version must have a non-NULL basis by construction, and
  -- no version may be startable while its employer path is inactive. Proven
  -- structurally: both read the same function.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_case_start_basis';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_START_CONTRACT: expected exactly one scp_iv_case_start_basis, found %.', _n;
  END IF;

  IF position('scp_iv_case_start_basis' in
        (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_create_case')) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_START_CONTRACT: scp_iv_create_case does not use the shared start contract.';
  END IF;

  IF position('scp_iv_case_start_basis' in
        (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_startable_pack_versions')) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_START_CONTRACT: the startable list does not use the shared start contract.';
  END IF;

  IF has_function_privilege('authenticated', 'public.scp_iv_case_start_basis(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_START_CONTRACT: the internal basis function is executable by authenticated.';
  END IF;

  RAISE NOTICE 'SCP_IV_START_CONTRACT: the new-interview list and scp_iv_create_case share one entitlement definition.';
END $$;
