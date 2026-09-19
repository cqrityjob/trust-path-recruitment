-- Rollback of 20261201090000_scp_library_direct_access.
--
-- Refuses while anything depends on it: a recruitment setup exists, or a BESKT
-- version is available to employers (withdraw it first, with its reason). Then
-- restores the nine re-created bodies verbatim and removes the new objects.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_recruitment_setups) THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK_REFUSED: recruitment setups exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beskt_method_versions WHERE pilot_availability <> 'restricted') THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK_REFUSED: a BESKT version is available to employers; withdraw it first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beskt_method_events
              WHERE event IN ('availability_opened', 'availability_withdrawn')) THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK_REFUSED: availability events are recorded; the ledger is append-only.';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.bcp_accept_invitation(_operation_id uuid, _token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _i public.bcp_invitations%ROWTYPE; _v public.beskt_method_versions%ROWTYPE;
  _email text; _confirmed boolean; _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_accept_invitation',
    'token_digest', public.bcp_invitation_token_digest(_token));
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT lower(u.email), u.email_confirmed_at IS NOT NULL INTO _email, _confirmed
    FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO _i FROM public.bcp_invitations
   WHERE token_digest = public.bcp_invitation_token_digest(_token) FOR UPDATE;
  IF NOT FOUND OR _i.invited_email <> _email THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_AVAILABLE: this invitation is not available to this account.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT _confirmed THEN
    RAISE EXCEPTION 'BCP_EMAIL_NOT_CONFIRMED: confirm your e-mail address first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _i.state <> 'pending' OR _i.expires_at <= now() THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_PENDING: this invitation is no longer open.' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() = _i.created_by OR public.has_employer_role(auth.uid(), _i.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_IS_EMPLOYER_MEMBER: a member of the inviting organisation cannot be its own candidate here.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _i.method_version_id;
  -- The gate is re-checked at acceptance: an activation revoked, or content
  -- changed, since the invitation was sent means there is nothing to accept.
  IF _v.content_hash IS DISTINCT FROM _i.pinned_content_hash
     OR NOT ((_v.content_status = 'published'
              AND public.bcp_version_is_runnable(_v.id)
              AND public.bcp_pilot_grant_active(_i.employer_id, _v.id))
             OR public.bcp_internal_test_activation_active(_i.employer_id, _v.id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: the method this invitation was for is no longer available; ask the employer for a new invitation.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, invitation_id, role_title, candidate_user_id,
     method_version_id, exposure_profile_id, mode, pinned_content_hash, pinned_release_scope,
     notice_version, due_at, assigned_by, responsible_interviewer_id, contact_statement,
     security_owner_id, role_security_attestation, lawful_basis_statement)
  VALUES
    (_i.employer_id, NULL, NULL, _i.id, _i.role_title, auth.uid(),
     _i.method_version_id, _i.exposure_profile_id, _i.mode, _i.pinned_content_hash, _v.release_scope,
     _i.notice_version, _i.due_at, _i.created_by, _i.responsible_interviewer_id, _i.contact_statement,
     _i.security_owner_id, _i.role_security_attestation, _i.lawful_basis_statement)
  RETURNING id INTO _id;

  PERFORM set_config('bcp.invitation_write', 'on', true);
  UPDATE public.bcp_invitations SET state = 'accepted', accepted_by = auth.uid(), accepted_at = now(),
         assignment_id = _id WHERE id = _i.id;
  PERFORM set_config('bcp.invitation_write', 'off', true);

  _result := jsonb_build_object('assignment_id', _id, 'invitation_id', _i.id, 'mode', _i.mode);
  PERFORM public.bcp_record_event(_id, NULL, _i.employer_id, _i.method_version_id, 'invitation_accepted',
    'pending', 'accepted', NULL, _i.pinned_content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END $function$;

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
$function$;

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
              AND public.bcp_version_is_runnable(_method_version_id))
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
               AND (i.permitted_mode = 'recruitment_support'
                    OR p.permitted_mode = 'security_vetting_support'))
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = (SELECT v.mode FROM public.beskt_method_versions v
                                WHERE v.id = _method_version_id)
     ORDER BY p.display_order, p.profile_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_check_start(_employer_id uuid, _mode text, _method_version_id uuid, _exposure_profile_id uuid, _expected_content_hash text, _responsible_interviewer_id uuid, _contact_statement text, _security_owner_id uuid, _role_security_attestation text, _lawful_basis_statement text)
 RETURNS beskt_method_versions
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE; _p public.beskt_exposure_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting BESKT requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RAISE EXCEPTION 'BCP_MODE_UNKNOWN: "%".', _mode USING ERRCODE = 'check_violation';
  END IF;
  IF _mode = 'security_vetting_support' AND NOT public.bcp_is_security_officer(_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_SECURITY_OFFICER: only the employer''s appointed security function starts a security vetting.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> _mode THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: this method version is for %, not %.', _v.mode, _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT ((_v.content_status = 'published'
           AND public.bcp_version_is_runnable(_method_version_id)
           AND public.bcp_pilot_grant_active(_employer_id, _method_version_id))
          OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant or activation for this BESKT method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> _mode THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is for %.', _p.permitted_mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _responsible_interviewer_id IS NULL
     OR NOT public.has_employer_role(_responsible_interviewer_id, _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_MEMBER: the responsible interviewer must be an active member of this employer.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_contact_statement, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONTACT_REQUIRED: tell the candidate how to reach you.' USING ERRCODE = 'check_violation';
  END IF;

  IF _mode = 'security_vetting_support' THEN
    IF NOT public.bcp_is_security_officer(_employer_id, _responsible_interviewer_id) THEN
      RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_SECURITY_OFFICER: in a security vetting the responsible interviewer belongs to the appointed security function.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.bcp_is_security_officer(_employer_id, _security_owner_id) THEN
      RAISE EXCEPTION 'BCP_SECURITY_OWNER_REQUIRED: name the appointed security officer who owns this vetting.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_role_security_attestation, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_ATTESTATION_REQUIRED: attest, in your own words, that this role is security-sensitive.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_lawful_basis_statement, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_LAWFUL_BASIS_REQUIRED: state the lawful basis your organisation relies on.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _security_owner_id IS NOT NULL OR _role_security_attestation IS NOT NULL OR _lawful_basis_statement IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_VETTING_FIELDS_OUT_OF_MODE: an attestation and a security owner belong to a security vetting only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN _v;
END $function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_topic_prompts(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority. A caller who cannot read the case cannot
  -- learn anything here, including whether the session exists in a readable
  -- state -- the refusal above is reached only for a session id that is not
  -- a session at all.
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;

  -- A version that is no longer published stops answering. Not an error: the
  -- interview's own record is unaffected and the screen says the wordings are
  -- unavailable, which is true and is different from inventing them.
  -- 20261129090000: unless it is the exact content an internal test
  -- activation of the assignment's employer covered -- the same rule as the
  -- party read, so a started test keeps its wordings after a revocation.
  IF _v.id IS NULL
     OR (_v.content_status <> 'published'
         AND NOT public.bcp_internal_test_activation_covers(_a.employer_id, _v.id,
                                                             _a.pinned_content_hash))
     OR _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RETURN jsonb_build_object(
      'session_id', _session_id,
      'method_version_id', _s.bound_method_version_id,
      'available', false,
      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'
                     WHEN _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN 'mode_not_permitted'
                     ELSE 'version_not_published' END,
      'topics', '[]'::jsonb,
      'stage_prompts', '[]'::jsonb,
      'produces_score', false,
      'interpretation', 'none');
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'method_version_id', _v.id,
    'content_hash', _s.bound_content_hash,
    'available', true,
    'reason', NULL,

    -- Per frozen topic: the item's own governed wording and purpose, and the
    -- prompts that name that item. Ordered by the method's own display order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'prompts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'prompt_key', pr.prompt_key,
                'display_order', pr.display_order,
                'prompt_kind', pr.prompt_kind,
                'peace_stage', pr.peace_stage,
                'addressee', pr.addressee,
                'question_form', pr.question_form,
                'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
                'wording_sv', pr.wording_sv,
                'wording_en', pr.wording_en)
              ORDER BY pr.display_order, pr.prompt_key)
              FROM public.beskt_prompts pr
              JOIN public.beskt_items pi ON pi.id = pr.item_id
             WHERE pr.method_version_id = _v.id
               AND pr.item_id = t.item_id
               AND pr.exposure_profile_id = _a.exposure_profile_id
               AND pr.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id
         AND i.permitted_mode IN ('recruitment_support', _v.mode)
         AND i.access_class <> 'authorised_security_function'), '[]'::jsonb),

    -- The method's own structure for the conversation, which belongs to no
    -- single item.
    'stage_prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key,
          'display_order', pr.display_order,
          'prompt_kind', pr.prompt_kind,
          'peace_stage', pr.peace_stage,
          'addressee', pr.addressee,
          'question_form', pr.question_form,
          'wording_sv', pr.wording_sv,
          'wording_en', pr.wording_en)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
       WHERE pr.method_version_id = _v.id
         AND pr.item_id IS NULL
         AND pr.exposure_profile_id = _a.exposure_profile_id
         AND pr.permitted_mode IN ('recruitment_support', _v.mode)), '[]'::jsonb),

    -- Said in the payload itself, as every BESKT read says it.
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_method_preview(_employer_id uuid, _method_version_id uuid, _exposure_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE; _officer boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND OR NOT ((_v.content_status = 'published'
           AND public.bcp_version_is_runnable(_v.id)
           AND public.bcp_pilot_grant_active(_employer_id, _v.id))
          OR public.bcp_internal_test_activation_active(_employer_id, _v.id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beskt_exposure_profiles p
                  WHERE p.id = _exposure_profile_id AND p.method_version_id = _v.id) THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION' USING ERRCODE = 'check_violation';
  END IF;
  _officer := public.bcp_is_security_officer(_employer_id, auth.uid());
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'mode', _v.mode, 'content_hash', _v.content_hash,
    'content_status', _v.content_status, 'validation_label', _v.validation_label,
    'wording_visible', _v.mode = 'recruitment_support' OR _officer,
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'title_sv', s.title_sv, 'title_en', s.title_en,
          'item_count', (SELECT count(*) FROM public.beskt_items i
                          WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                            AND i.exposure_profile_id = _exposure_profile_id),
          'items', CASE WHEN _v.mode = 'recruitment_support' OR _officer THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', i.item_key, 'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
                'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
                'answer_type', i.answer_type, 'requiredness', i.requiredness,
                'discuss_orally_allowed', i.discuss_orally_allowed,
                'is_follow_up', EXISTS (SELECT 1 FROM public.beskt_routing_rules r
                                         WHERE r.target_item_id = i.id AND r.action = 'show'
                                           AND r.condition_kind <> 'always'),
                'sensitivity_class', i.sensitivity_class)
              ORDER BY i.display_order, i.item_key)
              FROM public.beskt_items i
             WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
               AND i.exposure_profile_id = _exposure_profile_id), '[]'::jsonb)
            ELSE '[]'::jsonb END)
        ORDER BY s.display_order, s.section_key)
        FROM public.beskt_sections s
       WHERE s.method_version_id = _v.id
         AND EXISTS (SELECT 1 FROM public.beskt_items i
                      WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                        AND i.exposure_profile_id = _exposure_profile_id)), '[]'::jsonb));
END $function$;

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
              OR public.bcp_employer_party(a.id))
         -- 20261129090000: a published candidate-safe version, or the exact
         -- content an internal test activation of THIS employer covered.
         AND (public.bcp_version_is_runnable(_method_version_id)
              OR public.bcp_internal_test_activation_covers(a.employer_id, _method_version_id,
                                                             a.pinned_content_hash)));
$function$;

CREATE OR REPLACE FUNCTION public.beskt_content_gate(_method_version_id uuid, _expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The SAME role beskt_touch_draft demands. Authoring content and touching a
  -- draft are the same act of editorship; inventing a second role here would
  -- mean two answers to one question.
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION
      'BESKT_NOT_EDITOR: authoring method content requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'BESKT_PUBLISHED_IMMUTABLE: version is "%" and can no longer be edited. Create a new version instead.',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'pack_id', _v.pack_id,
    'content_status', _v.content_status, 'revision', _v.revision);
END;
$function$;

DROP FUNCTION public.bcp_assignable_method_versions(uuid);
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
       AND public.bcp_version_is_runnable(v.id)
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
$function$;
REVOKE ALL ON FUNCTION public.bcp_assignable_method_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assignable_method_versions(uuid) TO authenticated, service_role;

DROP FUNCTION public.scp_record_recruitment_setup(uuid, text, text, text, text, uuid, uuid);
DROP TABLE public.scp_recruitment_setups;
DROP FUNCTION public.scp_guard_recruitment_setup();
DROP FUNCTION public.beskt_set_pilot_availability(uuid, uuid, boolean, text);
DROP FUNCTION public.bcp_offer_content_covers(uuid, uuid, text);
DROP FUNCTION public.bcp_offer_covers(uuid, uuid);
DROP FUNCTION public.bcp_open_pilot_available(uuid);
ALTER TABLE public.beskt_method_events DROP CONSTRAINT beskt_method_events_event_check;
ALTER TABLE public.beskt_method_events ADD CONSTRAINT beskt_method_events_event_check
  CHECK (event = ANY (ARRAY['method_created', 'version_created', 'new_version_created',
    'draft_touched', 'submitted_for_review', 'review_approved', 'review_rejected',
    'published', 'suspended', 'retired', 'content_upserted', 'content_deleted']));
ALTER TABLE public.beskt_method_versions DROP COLUMN pilot_availability;

DO $rbproof$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_accept_invitation') <> '15fa23a1e8bbf1622b6458146fdca697' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_accept_invitation was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assign') <> '7ea7e1a3925b0ba8a7acfb1b45c17c9a' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_assign was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_exposure_profiles') <> '58024b76b3b1dd97efe50d9c1f925acf' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_assignable_exposure_profiles was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_check_start') <> 'f0b36a8abee41fb46a557b890fdac4be' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_check_start was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts') <> '41aebf0cf4d7a705ad08b249dfd83a12' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_conduct_topic_prompts was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_method_preview') <> '751e1c0e7995907547864a5d2822bb19' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_method_preview was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_party_can_read_method_version') <> 'a54bd6eff5b4df587b9ef362396c1881' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_party_can_read_method_version was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'beskt_content_gate') <> '21eb1c0e2472d2fcf34ed39930f50761' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: beskt_content_gate was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_method_versions') <> '7a832d72a556286c60dbf23d31002060' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_ROLLBACK: bcp_assignable_method_versions was not restored exactly.';
  END IF;
  RAISE NOTICE 'SCP_LIBRARY_ROLLBACK ok';
END $rbproof$;
