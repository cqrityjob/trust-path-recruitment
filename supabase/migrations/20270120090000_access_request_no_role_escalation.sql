-- =============================================================================
-- P1-G -- an access-request approval admits a person; it cannot make an owner
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-G, reproduced on production with a
-- rolled-back probe):
--
--   approve_access_request lets any owner or admin of the organisation approve
--   a request with any granted role, 'owner' included, and its
--   ON CONFLICT ... DO UPDATE SET role rewrites the requester's EXISTING
--   membership. So an admin could file an access request to their own
--   organisation, approve it as 'owner', and become an owner (probe: role
--   admin -> owner, active owners 1 -> 2, no error). Any admin could also make
--   an outsider an owner. Role changes are otherwise platform-admin only
--   (update_employer_membership).
--
-- THE FIX (the function body is otherwise exactly the hosted one; the added
-- block is marked 20270120090000):
--   - only a platform admin grants 'owner';
--   - nobody approves their own request, except a platform admin;
--   - a requester with an ACTIVE membership is refused, so an approval never
--     changes a live member's role; reactivating a removed or suspended
--     membership is unchanged.
--
-- NOT CHANGED: denying a request; approving a new person as admin or member;
-- the platform admin path; the request insert policy; audit logging; any row.
-- Production holds 0 pending requests and 0 approvals that granted 'owner'.
--
-- Rollback: supabase/rollback/20270120090000_access_request_no_role_escalation_rollback.sql
-- Suite:    supabase/tests/access_request_no_role_escalation_test.sql
-- =============================================================================

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

  -- 20270120090000 (P1-G): an approval admits a person; it does not hand over
  -- the organisation or change an existing member's role.
  --   - only a platform admin grants 'owner' (the queue offers no
  --     "approve as owner", EmployerTeamPanel);
  --   - nobody approves their own request, except a platform admin;
  --   - a requester who already holds an ACTIVE membership is refused: the
  --     ON CONFLICT below exists to reactivate a removed or suspended
  --     membership, never to rewrite a live one's role.
  IF _decision = 'approved' AND NOT public.is_platform_admin(_caller) THEN
    IF _granted_role = 'owner' THEN  -- rule:owner
      RAISE EXCEPTION 'Forbidden: only a platform admin can grant the owner role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _request.requester_user_id = _caller THEN  -- rule:self
      RAISE EXCEPTION 'Forbidden: you cannot approve your own access request'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM public.employer_memberships m  -- rule:live
                WHERE m.employer_id = _request.employer_id
                  AND m.user_id = _request.requester_user_id
                  AND m.status = 'active') THEN
      RAISE EXCEPTION 'Already a member: an access request cannot change an existing member''s role'
        USING ERRCODE = 'check_violation';
    END IF;
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

DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.approve_access_request(uuid,text,text)'::regprocedure);
BEGIN
  IF position('20270120090000' IN _src) = 0
     OR position('only a platform admin can grant the owner role' IN _src) = 0
     OR position('cannot approve your own access request' IN _src) = 0
     OR position('cannot change an existing member' IN _src) = 0 THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_ESCALATION_PROOF: approve_access_request does not carry the new rules';
  END IF;
  RAISE NOTICE 'ACCESS_REQUEST_ESCALATION_PROOF ok: an approval admits a person; it cannot make an owner or change a live role';
END $$;
