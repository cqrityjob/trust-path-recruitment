-- ===========================================================================
-- Interview cases — a candidate ACCOUNT is bound only as the application's
-- own applicant
--
-- 20261128090000
--
-- ── WHAT IS WRONG TODAY ────────────────────────────────────────────────
--
-- public.scp_iv_create_case is SECURITY DEFINER and granted to
-- `authenticated`. Its latest definition (20261108090000, byte-identical on
-- main, on this branch and on wrygicdfxwjnrugduxnt) checks that the caller
-- is a member of an ACTIVE employer, that the pack is startable, and that a
-- given job or application belongs to that employer. It never checks
-- _candidate_user_id. Proved by calling it as a real employer member: a case
-- bound to a stranger's account was created both on the member's own
-- application and with no application at all.
--
-- That stranger then IS the case's candidate: scp_iv_is_case_candidate says
-- so, scp_iv_candidate_interview_status shows them "interview offered" by
-- that employer, and the BESKT preparation bridge matches on it.
--
-- The application path never did this -- createInterviewCase derives the
-- applicant server-side -- so this closes the direct-call route only.
--
-- ── WHAT THIS MIGRATION DOES ───────────────────────────────────────────
--
-- Re-creates exactly that one function with exactly one rule added, after
-- the existing check that the application belongs to the employer:
--
--   a non-NULL _candidate_user_id requires a non-NULL _application_id of the
--   same employer whose applicant_user_id IS that account.
--
-- Nothing else changes: no signature, grant, table, policy or row. A case
-- whose candidate is identified by an external reference is unchanged.
--
-- ── WHY THE PRECONDITION PINS THE CURRENT BODY ─────────────────────────
--
-- This file carries a full copy of the function. Replaying it over a NEWER
-- definition would silently undo whatever that newer migration improved. So
-- it refuses to run unless the live body is exactly the 20261108090000 body
-- it was written against (md5 of prosrc, verified identical in production).
-- A later change to this function must be merged into this migration, not
-- papered over by it.
-- ===========================================================================

DO $pre$
DECLARE _n integer; _md5 text;
BEGIN
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_create_case';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PRECONDITION: expected exactly one scp_iv_create_case, found %.', _n;
  END IF;
  IF to_regclass('public.job_applications') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'job_applications'
                       AND column_name = 'applicant_user_id') THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PRECONDITION: job_applications.applicant_user_id is missing.';
  END IF;
  IF _md5 <> '24cfc8e7f612df1cb3bd6e97af6e805a' THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PRECONDITION: scp_iv_create_case is not the 20261108090000 body this migration extends (md5 %). Merge the newer definition into this migration instead of replaying over it.', _md5;
  END IF;
END $pre$;

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

  -- BESKT PR 2: a case is started with a role-interview pack version only.
  -- A BESKT method version cannot exist in this table, and if a pack of
  -- another kind ever reaches here it is refused before any entitlement.
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _pack.pack_id AND p.pack_kind = 'role_interview') THEN
    RAISE EXCEPTION 'SCP_IV_PACK_KIND_NOT_STARTABLE: only a role-interview pack version can start an interview case.'
      USING ERRCODE = 'insufficient_privilege';
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

  -- 20261128090000: a case names a candidate ACCOUNT only as the applicant
  -- of the application it is bound to. Without this, any member of any
  -- active employer could bind an arbitrary user to a case of theirs, and
  -- that user would be treated as the case's candidate everywhere
  -- (scp_iv_is_case_candidate, the candidate's own interview status, and the
  -- BESKT preparation bridge, which matches on it). A case without an
  -- account -- a candidate identified by an external reference -- is
  -- unchanged. The employer's authority over the application is the check
  -- directly above; this one binds the person to it.
  IF _candidate_user_id IS NOT NULL THEN
    IF _application_id IS NULL THEN
      RAISE EXCEPTION 'SCP_IV_CANDIDATE_REQUIRES_APPLICATION: a candidate account can be named only through the application that account applied with.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
         SELECT 1 FROM public.job_applications a
          WHERE a.id = _application_id
            AND a.employer_id = _employer_id
            AND a.applicant_user_id = _candidate_user_id) THEN
      RAISE EXCEPTION 'SCP_IV_CANDIDATE_NOT_APPLICANT: that account is not the applicant of this application.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
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
  'eligible CQrity TRUST method version, and records which basis admitted it. '
  'A candidate account may be named only as the applicant of the bound '
  'application (20261128090000).';

DO $proof$
DECLARE _p record; _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_create_case';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: % overloads of scp_iv_create_case.', _n;
  END IF;
  SELECT p.* INTO _p FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_create_case';
  IF position('SCP_IV_CANDIDATE_NOT_APPLICANT' IN _p.prosrc) = 0
     OR position('SCP_IV_CANDIDATE_REQUIRES_APPLICATION' IN _p.prosrc) = 0
     OR position('a.applicant_user_id = _candidate_user_id' IN _p.prosrc) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: the binding rule is not in the function body.';
  END IF;
  -- Every earlier rule is still there.
  IF position('SCP_IV_CROSS_TENANT_APPLICATION' IN _p.prosrc) = 0
     OR position('SCP_IV_PACK_KIND_NOT_STARTABLE' IN _p.prosrc) = 0
     OR position('scp_iv_case_start_basis' IN _p.prosrc) = 0
     OR position('SCP_IV_EMPLOYER_NOT_ACTIVE' IN _p.prosrc) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: an earlier rule of scp_iv_create_case was lost.';
  END IF;
  IF NOT _p.prosecdef OR NOT ('search_path=public' = ANY (_p.proconfig)) THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: SECURITY DEFINER or the fixed search_path was lost.';
  END IF;
  IF pg_get_function_identity_arguments(_p.oid)
     <> '_employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text, _candidate_user_id uuid, _candidate_external_ref text, _job_id uuid, _application_id uuid' THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: the signature changed.';
  END IF;
  IF has_function_privilege('anon', _p.oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', _p.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_BINDING_PROOF: the privilege set changed.';
  END IF;
  RAISE NOTICE 'SCP_IV_CANDIDATE_BINDING_PROOF ok';
END $proof$;
