-- =============================================================================
-- A platform admin's suspension or removal of a member cannot be undone by the
-- organisation, and a reviewer grant does not outlive the membership it was
-- made to
-- =============================================================================
--
-- THE DEFECTS (finding e and f of docs/release/2026-10-03-report-access-security-
-- finding.md; design: docs/release/2026-10-03-employer-report-access-design.md):
--
--   e. approve_access_request reactivates a SUSPENDED or REMOVED membership
--      (ON CONFLICT ... DO UPDATE SET status = 'active') and refuses only a
--      requester who is already ACTIVE; and the access-request insert policy
--      checks only requester_user_id = auth.uid(), for ANY employer id. So a
--      person a platform administrator suspended or removed files a request at
--      /employer/join?org=<id>, and that organisation's own owner or admin
--      approves them straight back in -- overriding the platform admin. Only
--      the platform-admin function update_employer_membership may do that.
--
--   f. Reviewer grants (scp_employer_reviewers) survive suspension and removal.
--      They are inert while the membership is not active (scp_can_review_for
--      needs an active one) and silently return the moment it is reactivated.
--
-- THE FIX
--   1. A BEFORE INSERT trigger on employer_access_requests refuses a requester
--      whose membership of that organisation is suspended or removed, with a
--      coded error the application maps (ACCESS_REQUEST_MEMBERSHIP_BLOCKED).
--      A trigger rather than a policy, because a policy failure is the
--      generic "violates row-level security" and says nothing a person can act
--      on. BEFORE triggers run before the policy check, so the code wins.
--   2. approve_access_request never moves a suspended or removed membership to
--      active, for ANY caller, a platform admin included
--      (ACCESS_REQUEST_REACTIVATION_REFUSED). A platform admin reactivates
--      through update_employer_membership, which is the audited path. The
--      refusal is made twice: up front, so the request stays pending and can
--      be denied, and again in the ON CONFLICT ... DO UPDATE WHERE itself, so
--      a suspension committed between the check and the write is not
--      overwritten. The body is otherwise exactly the hosted one
--      (20270120090000); the added lines are marked 20270202090000.
--   3. A trigger on employer_memberships marks every live reviewer grant of the
--      user in that organisation revoked, in the same transaction, when the
--      membership becomes anything but active or is deleted. Reactivation then
--      needs a fresh grant by an owner or admin. The grants of memberships that
--      are ALREADY suspended or removed are revoked once, below.
--
-- THE WRITERS OF employer_memberships, audited across the chain: only
-- update_employer_membership (platform admin), the platform-admin policy, the
-- two company-creation functions (a NEW employer; they cannot collide with an
-- existing membership) and approve_access_request. See the design document,
-- section 3.1, for the table and the tests that cover each path.
--
-- NOT CHANGED: denying a request; approving a new or an invited person; the
-- platform admin path; the role rules of 20270120090000; audit logging.
--
-- Rollback: supabase/rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql
-- Suite:    supabase/tests/employer_membership_standing_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.approve_access_request(uuid,text,text)'));
BEGIN
  IF _src IS NULL OR position('20270120090000' IN _src) = 0 THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PRECONDITION: approve_access_request is not the 20270120090000 body this migration builds on';
  END IF;
  IF to_regclass('public.scp_employer_reviewers') IS NULL
     OR to_regclass('public.employer_access_requests') IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PRECONDITION: employer_access_requests or scp_employer_reviewers is missing';
  END IF;
END $$;

-- ── 1. A suspended or removed person cannot file an access request ───────
CREATE OR REPLACE FUNCTION public.employer_access_request_standing_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employer_memberships m
              WHERE m.employer_id = NEW.employer_id
                AND m.user_id = NEW.requester_user_id
                AND m.status IN ('suspended', 'removed')) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_MEMBERSHIP_BLOCKED: your access to this organisation was suspended or ended by a platform administrator, and a request cannot restore it. Contact support.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public.employer_access_request_standing_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employer_access_requests_standing_guard ON public.employer_access_requests;
CREATE TRIGGER employer_access_requests_standing_guard
  BEFORE INSERT ON public.employer_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.employer_access_request_standing_guard();

-- ── 2. An approval never reactivates a suspended or removed membership ───
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
  --     ON CONFLICT below exists to admit an invited membership, never to
  --     rewrite a live one's role.
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

  -- 20270202090000: an approval NEVER moves a suspended or removed membership
  -- back to active, for any caller -- a platform admin included. Only
  -- update_employer_membership (platform admin, audited) may. Refused before
  -- the request is touched, so it stays pending and can still be denied.
  IF _decision = 'approved' AND EXISTS (SELECT 1 FROM public.employer_memberships m  -- rule:standing
                                         WHERE m.employer_id = _request.employer_id
                                           AND m.user_id = _request.requester_user_id
                                           AND m.status IN ('suspended', 'removed')) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_REACTIVATION_REFUSED: this person''s access was suspended or ended by a platform administrator; an approval cannot restore it. Only a platform administrator can.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.employer_access_requests
  SET status = _decision,
      granted_role = CASE WHEN _decision = 'approved' THEN _granted_role ELSE NULL END,
      decided_by = _caller,
      decided_at = _now
  WHERE id = _request_id;

  IF _decision = 'approved' THEN
    -- ON CONFLICT admits a requester whose membership row already exists as
    -- 'invited' (UNIQUE(employer_id, user_id)). Targeted by constraint NAME
    -- rather than a bare (employer_id, user_id) column list deliberately:
    -- this function's own RETURNS TABLE declares an out-parameter also named
    -- `employer_id`, and plpgsql's identifier resolution treats a bare column
    -- list in ON CONFLICT as ambiguous between that variable and the real
    -- table column (verified locally -- this exact form raised "column
    -- reference employer_id is ambiguous" against a real Postgres 16
    -- instance). ON CONFLICT ON CONSTRAINT sidesteps the ambiguity entirely.
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
      -- 20270202090000: the same refusal, made by the write itself, so a
      -- suspension that commits after the check above is not overwritten.
      WHERE public.employer_memberships.status NOT IN ('suspended', 'removed')
    RETURNING id INTO _new_membership_id;

    IF _new_membership_id IS NULL THEN
      RAISE EXCEPTION 'ACCESS_REQUEST_REACTIVATION_REFUSED: this person''s access was suspended or ended by a platform administrator; an approval cannot restore it. Only a platform administrator can.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

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

REVOKE ALL ON FUNCTION public.approve_access_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, text, text) TO authenticated, service_role;

-- ── 3. A reviewer grant does not outlive the membership it was made to ───
CREATE OR REPLACE FUNCTION public.employer_membership_revoke_reviewer_grants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid; _user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _employer := OLD.employer_id; _user := OLD.user_id;
  ELSIF NEW.status IS DISTINCT FROM 'active' THEN
    _employer := NEW.employer_id; _user := NEW.user_id;
  ELSE
    RETURN NULL;
  END IF;

  -- Marked revoked, never deleted: the row is the record that the grant
  -- existed and who ended it (the table's own design, scp_revoke_employer_
  -- reviewer). Reactivating the membership does not clear it; a fresh grant
  -- by an owner or admin is a new, deliberate act.
  UPDATE public.scp_employer_reviewers r
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE r.employer_id = _employer
     AND r.user_id = _user
     AND r.revoked_at IS NULL;
  RETURN NULL;
END;
$function$
;

REVOKE ALL ON FUNCTION public.employer_membership_revoke_reviewer_grants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employer_memberships_revoke_reviewer_grants ON public.employer_memberships;
CREATE TRIGGER employer_memberships_revoke_reviewer_grants
  AFTER UPDATE OF status OR DELETE ON public.employer_memberships
  FOR EACH ROW EXECUTE FUNCTION public.employer_membership_revoke_reviewer_grants();

-- The grants of memberships that are ALREADY not active: inert today, and
-- they would return on reactivation. Revoked once; nothing else is touched.
DO $$
DECLARE _n int;
BEGIN
  UPDATE public.scp_employer_reviewers r
     SET revoked_at = now()
   WHERE r.revoked_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                      WHERE m.employer_id = r.employer_id
                        AND m.user_id = r.user_id
                        AND m.status = 'active');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE 'MEMBERSHIP_STANDING: % reviewer grant(s) of a suspended, removed or missing membership revoked', _n;
END $$;

-- ── 4. Apply-time proof ──────────────────────────────────────────────────
DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.approve_access_request(uuid,text,text)'::regprocedure);
BEGIN
  IF position('rule:standing' IN _src) = 0
     OR position('ACCESS_REQUEST_REACTIVATION_REFUSED' IN _src) = 0
     OR position('only a platform admin can grant the owner role' IN _src) = 0
     OR position('cannot approve your own access request' IN _src) = 0
     OR position('cannot change an existing member' IN _src) = 0 THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PROOF: approve_access_request does not carry the standing rule and the 20270120090000 rules';
  END IF;
  IF has_function_privilege('anon', 'public.approve_access_request(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.approve_access_request(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PROOF: approve_access_request grants moved';
  END IF;
  IF has_function_privilege('anon', 'public.employer_access_request_standing_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.employer_access_request_standing_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.employer_membership_revoke_reviewer_grants()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.employer_membership_revoke_reviewer_grants()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PROOF: a trigger function is executable by a client role';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
        AND ((tgrelid = 'public.employer_access_requests'::regclass AND tgname = 'employer_access_requests_standing_guard')
          OR (tgrelid = 'public.employer_memberships'::regclass AND tgname = 'employer_memberships_revoke_reviewer_grants'))) <> 2 THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PROOF: a trigger is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_employer_reviewers r
              WHERE r.revoked_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                                 WHERE m.employer_id = r.employer_id AND m.user_id = r.user_id AND m.status = 'active')) THEN
    RAISE EXCEPTION 'MEMBERSHIP_STANDING_PROOF: a live reviewer grant of a non-active membership survives';
  END IF;
  RAISE NOTICE 'MEMBERSHIP_STANDING_PROOF ok: no request can restore a suspended or removed membership; reviewer grants end with the membership';
END $$;
