-- Rollback of 20270120090000_access_request_no_role_escalation.
--
-- !! THIS REOPENS P1-G !! An organisation admin can again approve their own
-- access request as owner. Run it ONLY in an isolated test database
-- (scripts/db-test.sh cycles it), never in production. Restores the hosted
-- body exactly (md5(prosrc) 1a4bfdb83919585be20282413c93f5c6).
CREATE OR REPLACE FUNCTION public.approve_access_request(_request_id uuid, _decision text, _granted_role text DEFAULT 'member'::text)
 RETURNS TABLE(request_id uuid, employer_id uuid, status text, membership_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _request public.employer_access_requests;
  _new_membership_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;
  IF _decision = 'approved' AND _granted_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT * INTO _request
  FROM public.employer_access_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF _request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF _request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  -- Authorisation check happens here, inside the function, against the
  -- request's actual employer_id -- never trusted from any parameter the
  -- caller supplies about who they are or what they're allowed to do.
  IF NOT (
    public.has_employer_role(_caller, _request.employer_id, ARRAY['owner', 'admin'])
    OR public.is_platform_admin(_caller)
  ) THEN
    RAISE EXCEPTION 'Forbidden: owner, admin, or platform admin required';
  END IF;

  UPDATE public.employer_access_requests
  SET status = _decision,
      granted_role = CASE WHEN _decision = 'approved' THEN _granted_role ELSE NULL END,
      decided_by = _caller,
      decided_at = _now
  WHERE id = _request_id;

  IF _decision = 'approved' THEN
    -- ON CONFLICT handles the case where the requester previously had a
    -- removed/suspended membership at this employer (UNIQUE(employer_id,
    -- user_id) already exists on employer_memberships) -- reactivates
    -- rather than erroring. Targeted by constraint NAME rather than a bare
    -- (employer_id, user_id) column list deliberately: this function's own
    -- RETURNS TABLE declares an out-parameter also named `employer_id`,
    -- and plpgsql's identifier resolution treats a bare column list in
    -- ON CONFLICT as ambiguous between that variable and the real table
    -- column (verified locally — this exact form raised "column reference
    -- employer_id is ambiguous" against a real Postgres 16 instance).
    -- ON CONFLICT ON CONSTRAINT sidesteps the ambiguity entirely.
    INSERT INTO public.employer_memberships (
      employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at
    )
    VALUES (
      _request.employer_id, _request.requester_user_id, _granted_role, 'active',
      _caller, _caller, _now, _now
    )
    ON CONFLICT ON CONSTRAINT employer_memberships_employer_id_user_id_key DO UPDATE
      SET role = EXCLUDED.role,
          status = 'active',
          accepted_at = _now,
          removed_at = NULL,
          updated_at = _now
    RETURNING id INTO _new_membership_id;

    INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
    VALUES (
      _caller, 'employer_approver', 'access_request_approved', 'employer_access_request',
      _request_id::text, _request.employer_id,
      jsonb_build_object('requester_user_id', _request.requester_user_id, 'granted_role', _granted_role)
    );
  ELSE
    _new_membership_id := NULL;
    INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
    VALUES (
      _caller, 'employer_approver', 'access_request_denied', 'employer_access_request',
      _request_id::text, _request.employer_id,
      jsonb_build_object('requester_user_id', _request.requester_user_id)
    );
  END IF;

  RETURN QUERY SELECT _request_id, _request.employer_id, _decision, _new_membership_id;
END;
$function$
;

DO $$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.approve_access_request(uuid,text,text)'::regprocedure))
     <> '1a4bfdb83919585be20282413c93f5c6' THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_ESCALATION_ROLLBACK: the restored body is not the hosted one';
  END IF;
  RAISE NOTICE 'ACCESS_REQUEST_ESCALATION_ROLLBACK ok: the pre-fix body is restored';
END $$;
