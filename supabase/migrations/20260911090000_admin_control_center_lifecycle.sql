-- =============================================================================
-- Admin Control Center — platform lifecycle and safe data management.
--
-- WHAT THIS ADDS
--   1. An employer ARCHIVE transition, plus the operational guard that makes
--      archiving actually mean something for the Security Competency surface.
--   2. Database-computed deletion impact + safe deletion for employers, users
--      and draft jobs. The database decides what is deletable, never the UI.
--   3. Account disable and profile anonymisation for platform identities.
--   4. Read-only identity diagnostics and a disposable-record inventory.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD
--   - No unrestricted DELETE reachable from a browser. Every destructive
--     function is SECURITY DEFINER, revoked from PUBLIC and anon, re-verifies
--     the caller server-side, and refuses with a stable code rather than
--     cascading.
--   - No deletion or mutation of released assessment evidence, verified
--     Passport claims, disclosures, attempts or report snapshots. Those are
--     BLOCKERS here, never targets.
--   - No automatic identity merging. admin_identity_diagnostics() is read-only.
--   - No "delete all" of any kind, and no bulk operation over more than one
--     entity per call.
--
-- ROLE SPLIT (Phase 13)
--   platform admin : archive/suspend, disable an ordinary account, read every
--                    impact report and diagnostic, delete a safe draft job.
--   superadmin     : every irreversible operation on a platform identity —
--                    hard delete of an employer or a user, and anonymisation.
--   The last-superadmin protection in admin_set_platform_role() is untouched;
--   the two functions below that can reach a superadmin add their own
--   equivalent protections rather than modifying it.
--
-- ATOMICITY
--   Every mutating function writes its audit_logs row inside the same
--   transaction as the mutation. A failure in either rolls back both — there
--   is no path that mutates without auditing, and none that audits a mutation
--   that did not happen.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Employer operational guard
--
-- employer_members_can_edit() already gates ten RLS policies on
-- status IN ('active','draft','pending'), so the moment an employer is
-- archived its members lose the jobs / employees / assignments surfaces and
-- its adverts stop being publicly visible (employer_is_active_status()).
--
-- The Security Competency RPCs do NOT check employer status at all —
-- scp_employer_assign(), scp_invite_participant() and scp_assign_training()
-- check active MEMBERSHIP and nothing else. So "an archived employer cannot
-- commission new work" is not true today and cannot be made true by the status
-- transition alone.
--
-- Rather than rewriting three large SECURITY DEFINER functions (and every
-- future one), the invariant is enforced where it cannot be bypassed: a BEFORE
-- INSERT trigger on each table that represents commissioned work. Uniform
-- across every Postgres role, including service_role and platform admins —
-- the same reasoning the H3.3 employer status guard used.
--
-- The predicate is deliberately identical to employer_members_can_edit(), so
-- the platform has ONE definition of "this organisation may operate" rather
-- than two that can drift.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_accepts_operations(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status IN ('active', 'draft', 'pending')
    FROM public.employers
   WHERE id = _employer_id;
$$;

REVOKE ALL ON FUNCTION public.employer_accepts_operations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_accepts_operations(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.employer_accepts_operations(uuid) IS
  'True iff the organisation may have new operational records created for it: '
  'status active, draft or pending. False for suspended, rejected and archived. '
  'Same predicate as employer_members_can_edit(); kept as a separate name so '
  'the trigger guard reads as an operational rule rather than an editing rule.';


CREATE OR REPLACE FUNCTION public.employer_operational_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _employer uuid;
  _status text;
BEGIN
  _employer := NEW.employer_id;
  IF _employer IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO _status FROM public.employers WHERE id = _employer;

  -- An employer row that does not exist is somebody else's foreign key
  -- problem, not this guard's; let the constraint raise its own error.
  IF _status IS NULL THEN
    RETURN NEW;
  END IF;

  IF _status NOT IN ('active', 'draft', 'pending') THEN
    RAISE EXCEPTION
      'EMPLOYER_NOT_OPERATIONAL: organisation status is %, no new % records can be created for it.',
      _status, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.employer_operational_guard() IS
  'BEFORE INSERT guard: refuses new operational records for a suspended, '
  'rejected or archived organisation, for every Postgres role including '
  'service_role and platform admins. Historical rows are never touched.';

DROP TRIGGER IF EXISTS jobs_employer_operational_guard ON public.jobs;
CREATE TRIGGER jobs_employer_operational_guard
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.employer_operational_guard();

DROP TRIGGER IF EXISTS employees_employer_operational_guard ON public.employees;
CREATE TRIGGER employees_employer_operational_guard
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employer_operational_guard();

DROP TRIGGER IF EXISTS assessment_assignments_employer_operational_guard ON public.assessment_assignments;
CREATE TRIGGER assessment_assignments_employer_operational_guard
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.employer_operational_guard();

DROP TRIGGER IF EXISTS scp_assessment_invitations_employer_operational_guard ON public.scp_assessment_invitations;
CREATE TRIGGER scp_assessment_invitations_employer_operational_guard
  BEFORE INSERT ON public.scp_assessment_invitations
  FOR EACH ROW EXECUTE FUNCTION public.employer_operational_guard();

DROP TRIGGER IF EXISTS scp_training_assignments_employer_operational_guard ON public.scp_training_assignments;
CREATE TRIGGER scp_training_assignments_employer_operational_guard
  BEFORE INSERT ON public.scp_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.employer_operational_guard();


-- -----------------------------------------------------------------------------
-- 2. Employer archive / restore
--
-- employers_status_check has allowed 'archived' since 20260719190845, but no
-- transition has ever reached it: moderate_employer()'s allow-list stops at
-- approved / rejected / suspended / reactivated. And because
-- employers_validate_before_write() refuses ANY status change that does not
-- carry the transaction-local marker moderate_employer() sets, the archive
-- transition has to live inside that same function. Adding a second function
-- that sets the same marker would create a second way to change status and
-- weaken the invariant the marker exists to protect.
--
-- Two new actions:
--   archived  — from any status except 'archived'. Note required. Ends the
--               customer relationship: the workspace locks (F1), no new
--               operational records can be created (section 1), history stays.
--   restored  — from 'archived' back to 'suspended', never straight to
--               'active'. Note required. Bringing a customer back is a
--               deliberate two-step: restore, then reactivate.
-- -----------------------------------------------------------------------------
ALTER TABLE public.employer_moderation_events
  DROP CONSTRAINT IF EXISTS employer_moderation_events_action_check;

ALTER TABLE public.employer_moderation_events
  ADD CONSTRAINT employer_moderation_events_action_check
  CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated', 'archived', 'restored'));

CREATE OR REPLACE FUNCTION public.moderate_employer(
  _employer_id uuid,
  _action text,
  _note text DEFAULT NULL
)
RETURNS TABLE (
  employer_id uuid,
  previous_status text,
  new_status text,
  action text,
  admin_user_id uuid,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current_status text;
  _allowed_previous text[];
  _target_status text;
  _clean_note text;
  _event_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  IF _action NOT IN ('approved', 'rejected', 'suspended', 'reactivated', 'archived', 'restored') THEN
    RAISE EXCEPTION 'Invalid moderation action: %', _action;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _action IN ('rejected', 'suspended', 'archived', 'restored') AND _clean_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for action %', _action
      USING ERRCODE = 'check_violation';
  END IF;
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 2000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the row before checking its status, so two concurrent moderation
  -- calls on the same employer can't both read the same "before" state
  -- and both succeed.
  SELECT status INTO _current_status
  FROM public.employers
  WHERE id = _employer_id
  FOR UPDATE;

  IF _current_status IS NULL THEN
    RAISE EXCEPTION 'Employer not found';
  END IF;

  -- Fixed transition allow-list. Every other status value, and every
  -- other requested (from, action) pair, is rejected.
  CASE _action
    WHEN 'approved' THEN
      _allowed_previous := ARRAY['pending'];
      _target_status := 'active';
    WHEN 'rejected' THEN
      _allowed_previous := ARRAY['pending'];
      _target_status := 'rejected';
    WHEN 'suspended' THEN
      _allowed_previous := ARRAY['active'];
      _target_status := 'suspended';
    WHEN 'reactivated' THEN
      _allowed_previous := ARRAY['suspended'];
      _target_status := 'active';
    WHEN 'archived' THEN
      _allowed_previous := ARRAY['draft', 'pending', 'active', 'rejected', 'suspended'];
      _target_status := 'archived';
    WHEN 'restored' THEN
      _allowed_previous := ARRAY['archived'];
      _target_status := 'suspended';
  END CASE;

  IF NOT (_current_status = ANY (_allowed_previous)) THEN
    RAISE EXCEPTION 'Invalid transition: employer status is %, action % requires one of %',
      _current_status, _action, array_to_string(_allowed_previous, '/')
      USING ERRCODE = 'check_violation';
  END IF;

  -- H3.3 database-integrity fix: the ONLY place in the entire codebase
  -- this marker is ever set. Transaction-local (third argument `true`) --
  -- automatically reverts at the end of this transaction, whether commit
  -- or rollback, so it can never leak into a later, unrelated request.
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);

  UPDATE public.employers
  SET status = _target_status, updated_at = _now
  WHERE id = _employer_id;

  INSERT INTO public.employer_moderation_events (
    employer_id, action, previous_status, new_status, admin_user_id, note, created_at
  ) VALUES (
    _employer_id, _action, _current_status, _target_status, _caller, _clean_note, _now
  )
  RETURNING id INTO _event_id;

  RETURN QUERY
    SELECT e.employer_id, e.previous_status, e.new_status, e.action, e.admin_user_id, e.note, e.created_at
    FROM public.employer_moderation_events e
    WHERE e.id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_employer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_employer(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.moderate_employer(uuid, text, text) IS
  'H3.3, hardened by the H3.3 database-integrity fix, extended by the Admin '
  'Control Center with archived/restored. Platform-admin-only. Validates a '
  'fixed transition allow-list, requires a non-empty note for rejected, '
  'suspended, archived and restored, and atomically updates employers.status + '
  'inserts exactly one employer_moderation_events row. Sets a transaction-local '
  'marker (app.employer_moderation_in_progress) immediately before its own '
  'UPDATE -- the ONLY way employers_validate_before_write() will ever allow a '
  'status change through, for any caller, any role. restored deliberately lands '
  'on suspended, never active: bringing a customer back is two deliberate steps.';


-- -----------------------------------------------------------------------------
-- 3. Employer deletion impact
--
-- The database computes whether an employer is disposable. The UI never
-- decides this and never needs to be trusted: admin_delete_employer_if_safe()
-- recomputes exactly the same blockers inside its own transaction, so a stale
-- page, a replayed request or a hand-crafted RPC call all reach the same
-- refusal.
--
-- "Disposable" is defined by EMPTINESS, not by a flag. There is deliberately
-- no employers.is_test column: a mislabelled operational customer would become
-- deletable, and no amount of UI confirmation makes that safe. An organisation
-- that has never had an application, an employee, an assessment record, a
-- Passport relationship, a published advert or a moderation decision is
-- indistinguishable from a manually created test organisation, and is the only
-- thing this function reports as deletable.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_employer_deletion_impact(_employer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _name text;
  _status text;
  _blockers jsonb := '[]'::jsonb;
  _applications bigint;
  _employees bigint;
  _assessment bigint;
  _passport bigint;
  _published_jobs bigint;
  _content bigint;
  _audit bigint;
  _draft_jobs bigint;
  _removed jsonb := '{}'::jsonb;
  _rec record;
  _n bigint;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  SELECT name, status INTO _name, _status FROM public.employers WHERE id = _employer_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'EMPLOYER_NOT_FOUND: no such organisation.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _applications
    FROM public.job_applications WHERE employer_id = _employer_id;

  SELECT count(*) INTO _employees
    FROM public.employees WHERE employer_id = _employer_id;

  -- Every commissioned-assessment edge in one number. Individually they are
  -- a mix of CASCADE and RESTRICT foreign keys; as a blocker they mean the
  -- same thing -- this organisation has assessment history.
  SELECT (SELECT count(*) FROM public.assessment_assignments WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_assessment_invitations WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_attempts WHERE issuer_organization_id = _employer_id)
       + (SELECT count(*) FROM public.scp_competency_evidence WHERE issuer_organization_id = _employer_id)
       + (SELECT count(*) FROM public.scp_report_snapshots WHERE issuer_organization_id = _employer_id)
       + (SELECT count(*) FROM public.scp_training_assignments WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_employer_report_decisions WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_interview_notes WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_employer_reviewers WHERE employer_id = _employer_id)
    INTO _assessment;

  SELECT (SELECT count(*) FROM public.sp_experience_periods WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.sp_verification_requests WHERE target_employer_id = _employer_id)
    INTO _passport;

  SELECT count(*) INTO _published_jobs
    FROM public.jobs
   WHERE employer_id = _employer_id
     AND (status <> 'draft' OR published_at IS NOT NULL);

  SELECT (SELECT count(*) FROM public.scp_assessment_definitions WHERE owner_employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_modules WHERE owner_employer_id = _employer_id)
       + (SELECT count(*) FROM public.scp_programs WHERE owner_employer_id = _employer_id)
    INTO _content;

  SELECT (SELECT count(*) FROM public.employer_moderation_events WHERE employer_id = _employer_id)
       + (SELECT count(*) FROM public.audit_logs
           WHERE org_id = _employer_id
              OR (subject_type = 'employer' AND subject_id = _employer_id::text))
    INTO _audit;

  IF _applications    > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_APPLICATIONS', 'count', _applications); END IF;
  IF _employees       > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_WORKFORCE', 'count', _employees); END IF;
  IF _assessment      > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_ASSESSMENT_HISTORY', 'count', _assessment); END IF;
  IF _passport        > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_PASSPORT_RELATIONSHIPS', 'count', _passport); END IF;
  IF _published_jobs  > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_PUBLISHED_JOBS', 'count', _published_jobs); END IF;
  IF _content         > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_ASSESSMENT_CONTENT', 'count', _content); END IF;
  IF _audit           > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'EMPLOYER_HAS_AUDIT_HISTORY', 'count', _audit); END IF;

  -- What would silently disappear, read from pg_constraint rather than from a
  -- hand-maintained list. This matters concretely: requirement_profiles is a
  -- CASCADE child of employers in the hosted database but does not exist in a
  -- canonical replay (it comes from the parked Blueprint Engine migration), so
  -- a hard-coded reference would be wrong in one environment or the other.
  FOR _rec IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.employers'::regclass
       AND c.confdeltype = 'c'
       AND c.connamespace = 'public'::regnamespace
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', _rec.tbl, _rec.col)
      INTO _n USING _employer_id;
    IF _n > 0 THEN
      _removed := _removed || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- jobs.employer_id is NO ACTION, so drafts are deleted explicitly by
  -- admin_delete_employer_if_safe() and belong in this report too.
  SELECT count(*) INTO _draft_jobs FROM public.jobs
   WHERE employer_id = _employer_id AND status = 'draft' AND published_at IS NULL;
  IF _draft_jobs > 0 THEN
    _removed := _removed || jsonb_build_object('jobs.employer_id', _draft_jobs);
  END IF;

  RETURN jsonb_build_object(
    'employer_id', _employer_id,
    'name', _name,
    'status', _status,
    'deletable', jsonb_array_length(_blockers) = 0,
    'blockers', _blockers,
    'removed_on_delete', _removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_employer_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_employer_deletion_impact(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_employer_deletion_impact(uuid) IS
  'Platform-admin-only, read-only. Reports whether an organisation is safely '
  'deletable and, if not, exactly which stable blocker codes prevent it. '
  '"Disposable" means empty, not flagged: there is no is_test column to '
  'mislabel. admin_delete_employer_if_safe() recomputes these same blockers, '
  'so this report is advisory to the UI and never load-bearing.';


-- -----------------------------------------------------------------------------
-- 4. Employer hard delete — superadmin only
--
-- Follows jobs_delete_draft()'s house pattern: the guard is a series of named
-- refusals, each with a stable CODE: message string, never a raw foreign-key
-- error. The jobs DELETE is explicit because jobs.employer_id is NO ACTION;
-- everything else in removed_on_delete rides the existing ON DELETE CASCADE.
--
-- _confirm_name must match employers.name exactly. The typed confirmation is
-- enforced HERE, not only in the dialog, so it cannot be skipped by calling
-- the RPC directly.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_employer_if_safe(
  _employer_id uuid,
  _reason text,
  _confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _name text;
  _status text;
  _clean_reason text;
  _impact jsonb;
  _removed jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: deleting an organisation is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to delete an organisation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_reason) > 2000 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG: the reason is too long.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT name, status INTO _name, _status
    FROM public.employers WHERE id = _employer_id FOR UPDATE;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'EMPLOYER_NOT_FOUND: no such organisation.' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(_confirm_name, '')) <> _name THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: the typed organisation name does not match.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Recomputed inside this transaction, holding the employer row lock. The
  -- caller's own impact report is never trusted.
  _impact := public.admin_employer_deletion_impact(_employer_id);
  IF NOT (_impact ->> 'deletable')::boolean THEN
    RAISE EXCEPTION 'EMPLOYER_NOT_DELETABLE: %',
      (SELECT string_agg(b ->> 'code', ', ') FROM jsonb_array_elements(_impact -> 'blockers') b)
      USING ERRCODE = 'P0001';
  END IF;

  _removed := _impact -> 'removed_on_delete';

  -- Audit first, inside the same transaction: if the delete fails, this rolls
  -- back with it; if the audit insert fails, the delete never happens.
  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
  VALUES (_caller, 'superadmin', 'employer_deleted', 'employer', _employer_id::text, _employer_id,
          jsonb_build_object('name', _name, 'status', _status, 'reason', _clean_reason, 'removed', _removed));

  -- jobs.employer_id is NO ACTION, so the drafts have to go explicitly. Every
  -- other dependent row is ON DELETE CASCADE and every RESTRICT edge is zero,
  -- which is exactly what the blockers above established.
  DELETE FROM public.jobs WHERE employer_id = _employer_id;
  DELETE FROM public.employers WHERE id = _employer_id;

  RETURN jsonb_build_object(
    'employer_id', _employer_id,
    'name', _name,
    'deleted', true,
    'removed', _removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_employer_if_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_employer_if_safe(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_delete_employer_if_safe(uuid, text, text) IS
  'Superadmin-only, irreversible. Requires a reason and the exact organisation '
  'name as typed confirmation, both enforced here rather than in the dialog. '
  'Recomputes admin_employer_deletion_impact() under the employer row lock and '
  'refuses with EMPLOYER_NOT_DELETABLE listing the blocker codes. Writes one '
  'audit_logs row in the same transaction as the delete.';


-- -----------------------------------------------------------------------------
-- 5. User deletion impact
--
-- auth.users carries roughly a hundred inbound foreign keys. Most CASCADE --
-- including every Security Passport holder table, every assessment run and
-- every job application -- so a naive delete would destroy verified credential
-- evidence and recruitment history without raising anything. A meaningful
-- number are NO ACTION / RESTRICT, so the delete would instead fail with a raw
-- Postgres foreign-key error naming a constraint no administrator can act on.
--
-- Both halves are therefore computed from pg_constraint at call time rather
-- than from a hand-maintained list. A table added to the schema next month is
-- covered by this function the day it exists; a hand-list would have silently
-- stopped being true.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_deletion_impact(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _email text;
  _blockers jsonb := '[]'::jsonb;
  _removed jsonb := '{}'::jsonb;
  _acted jsonb := '[]'::jsonb;
  _rec record;
  _n bigint;
  _applications bigint;
  _memberships bigint;
  _employee bigint;
  _assessment bigint;
  _passport bigint;
  _roles bigint;
  _audit bigint;
  _acted_total bigint := 0;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _applications FROM public.job_applications WHERE applicant_user_id = _user_id;
  SELECT count(*) INTO _memberships FROM public.employer_memberships WHERE user_id = _user_id;

  SELECT count(*) INTO _employee
    FROM public.employees e
   WHERE e.subject_id IN (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id);

  SELECT (SELECT count(*) FROM public.assessment_runs WHERE user_id = _user_id)
       + (SELECT count(*) FROM public.assessment_run_reports WHERE user_id = _user_id)
       + (SELECT count(*) FROM public.assessment_assignments WHERE recipient_user_id = _user_id)
       + (SELECT count(*) FROM public.scp_attempts
           WHERE subject_id IN (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id))
       + (SELECT count(*) FROM public.scp_competency_evidence
           WHERE subject_id IN (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id))
       + (SELECT count(*) FROM public.scp_report_snapshots
           WHERE subject_id IN (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id))
       + (SELECT count(*) FROM public.scp_training_assignments
           WHERE subject_id IN (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id))
    INTO _assessment;

  SELECT (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _user_id)
       + (SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = _user_id)
       + (SELECT count(*) FROM public.sp_disclosures WHERE holder_user_id = _user_id)
       + (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = _user_id)
       + (SELECT count(*) FROM public.sp_verification_requests WHERE holder_user_id = _user_id)
       + (SELECT count(*) FROM public.sp_verification_decisions WHERE holder_user_id = _user_id)
    INTO _passport;

  SELECT count(*) INTO _roles FROM public.user_roles WHERE user_id = _user_id;

  SELECT (SELECT count(*) FROM public.audit_logs WHERE actor_id = _user_id)
       + (SELECT count(*) FROM public.employer_moderation_events WHERE admin_user_id = _user_id)
    INTO _audit;

  -- Every FK to auth.users that would REFUSE the delete (NO ACTION /
  -- RESTRICT), read from the catalogue so it cannot drift from the schema.
  FOR _rec IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.confdeltype IN ('a', 'r')
       AND c.connamespace = 'public'::regnamespace
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', _rec.tbl, _rec.col)
      INTO _n USING _user_id;
    IF _n > 0 THEN
      _acted := _acted || jsonb_build_object('table', _rec.tbl, 'column', _rec.col, 'count', _n);
      _acted_total := _acted_total + _n;
    END IF;
  END LOOP;

  -- Every FK to auth.users that would SILENTLY CASCADE, same source.
  FOR _rec IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.confdeltype = 'c'
       AND c.connamespace = 'public'::regnamespace
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', _rec.tbl, _rec.col)
      INTO _n USING _user_id;
    IF _n > 0 THEN
      _removed := _removed || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  IF _applications > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_APPLICATIONS', 'count', _applications); END IF;
  IF _memberships  > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_EMPLOYER_MEMBERSHIP', 'count', _memberships); END IF;
  IF _employee     > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_IS_EMPLOYEE', 'count', _employee); END IF;
  IF _assessment   > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_ASSESSMENT_EVIDENCE', 'count', _assessment); END IF;
  IF _passport     > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_PASSPORT_EVIDENCE', 'count', _passport); END IF;
  IF _roles        > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HOLDS_PLATFORM_ROLE', 'count', _roles); END IF;
  IF _audit        > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_AUDIT_HISTORY', 'count', _audit); END IF;
  IF _acted_total  > 0 THEN _blockers := _blockers || jsonb_build_object('code', 'USER_HAS_ACTED_ON_RECORDS', 'count', _acted_total); END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'email', _email,
    'deletable', jsonb_array_length(_blockers) = 0,
    'blockers', _blockers,
    'acted_on', _acted,
    'removed_on_delete', _removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_deletion_impact(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_user_deletion_impact(uuid) IS
  'Platform-admin-only, read-only. Reports whether an account is safely '
  'deletable. Both halves of the report -- the foreign keys that would refuse '
  'the delete and the ones that would silently cascade -- are read from '
  'pg_constraint at call time, so the report cannot drift from the schema.';


-- -----------------------------------------------------------------------------
-- 6. Account disable / enable — platform admin
--
-- "Disable" is a Supabase Auth ban, not a row deletion: nothing about the
-- person's history changes, they simply cannot obtain a token. A ban far in
-- the future rather than 'infinity' because GoTrue reads this column into a
-- Go time.Time and 'infinity' is not a value it can parse.
--
-- HONEST LIMITATION, stated in the UI too: an access token already issued
-- stays valid until it expires. The ban takes effect at the next sign-in or
-- token refresh. This is Supabase Auth's behaviour, not something this
-- function can change.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_disabled(
  _user_id uuid,
  _disabled boolean,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _target_is_admin boolean;
  _target_is_superadmin boolean;
  _other_active_superadmins int;
  _until timestamptz;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  IF _user_id = _caller THEN
    RAISE EXCEPTION 'SELF_DISABLE_NOT_ALLOWED: an administrator cannot disable their own account.'
      USING ERRCODE = 'check_violation';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to change account access.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_reason) > 2000 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG: the reason is too long.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  _target_is_admin := public.is_platform_admin(_user_id);
  _target_is_superadmin := public.is_superadmin(_user_id);

  -- An ordinary admin cannot lock out another admin. That is a superadmin
  -- decision, exactly as granting and revoking the role already is.
  IF _target_is_admin AND NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: disabling an administrator account is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same invariant admin_set_platform_role() protects, reached by a
  -- different door: disabling the last superadmin would lock the platform out
  -- of its own role management just as surely as revoking the role would.
  IF _disabled AND _target_is_superadmin THEN
    SELECT count(*) INTO _other_active_superadmins
      FROM public.user_roles r
      JOIN auth.users u ON u.id = r.user_id
     WHERE r.role = 'superadmin'
       AND r.user_id <> _user_id
       AND (u.banned_until IS NULL OR u.banned_until < now());
    IF _other_active_superadmins < 1 THEN
      RAISE EXCEPTION 'LAST_SUPERADMIN_PROTECTED: cannot disable the only remaining active superadmin.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  _until := CASE WHEN _disabled THEN now() + interval '100 years' ELSE NULL END;

  UPDATE auth.users SET banned_until = _until WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller,
          CASE WHEN public.is_superadmin(_caller) THEN 'superadmin' ELSE 'platform_admin' END,
          CASE WHEN _disabled THEN 'user_disabled' ELSE 'user_enabled' END,
          'user', _user_id::text,
          jsonb_build_object('reason', _clean_reason, 'disabled', _disabled));

  RETURN jsonb_build_object('user_id', _user_id, 'disabled', _disabled, 'disabled_until', _until);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_disabled(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_disabled(uuid, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_user_disabled(uuid, boolean, text) IS
  'Platform-admin-only. Bans or unbans an account via auth.users.banned_until, '
  'preserving every row the person is attached to. Blocks self-disable, '
  'requires superadmin to disable an administrator, and refuses to disable the '
  'last active superadmin. Writes one audit_logs row in the same transaction.';


-- -----------------------------------------------------------------------------
-- 7. Anonymisation — superadmin only
--
-- Anonymisation is NOT deletion of evidence. It clears or pseudonymises the
-- PERSONAL PROFILE data the platform holds about a person and disables the
-- account, and deliberately leaves every operational and evidential row in
-- place, because those rows carry non-personal history the platform and its
-- customers rely on.
--
-- WHAT IS CLEARED
--   profiles.display_name, profiles.country
--   sp_passport_profiles.display_name, sp_passport_profiles.headline
--   auth.users.email  -> a per-account pseudonym on an unroutable domain
--   auth.users.raw_user_meta_data -> emptied (it carries the sign-up name)
--   the account is disabled in the same transaction
--
-- WHAT IS DELIBERATELY NOT TOUCHED, AND WHY
--   sp_claims / sp_evidence / sp_verification_* : verified credential
--     evidence a verifier has already relied on. Clearing it would not
--     anonymise the person, it would destroy the verification record.
--     sp_claims.title, claimed_issuer_name, credential_reference and
--     holder_note are holder-entered free text and CAN carry personal data --
--     whether an erasure request reaches them is a legal decision, flagged
--     for owner review, not decided in this function.
--   scp_attempts / scp_competency_evidence / scp_report_snapshots : bound to
--     the pseudonymous subject spine, not to the person, and already
--     re-identifiable only through scp_resolve_participant_identity()'s
--     governed path.
--   employees : the employer is the controller of its own employment record.
--     A platform-side anonymisation must not silently rewrite a customer's
--     workforce list.
--   audit_logs : retention basis is accountability for administrative action.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_anonymise_user(
  _user_id uuid,
  _reason text,
  _confirm_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _email text;
  _pseudonym text;
  _active_memberships int;
  _roles int;
  _cleared jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: anonymising an account is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_id = _caller THEN
    RAISE EXCEPTION 'SELF_ANONYMISE_NOT_ALLOWED: a superadmin cannot anonymise their own account.'
      USING ERRCODE = 'check_violation';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to anonymise an account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(_confirm_email, '')) <> coalesce(_email, '') THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: the typed address does not match this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _roles FROM public.user_roles WHERE user_id = _user_id;
  IF _roles > 0 THEN
    RAISE EXCEPTION 'USER_HOLDS_PLATFORM_ROLE: revoke the platform role before anonymising this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _active_memberships
    FROM public.employer_memberships WHERE user_id = _user_id AND status = 'active';
  IF _active_memberships > 0 THEN
    RAISE EXCEPTION 'USER_HAS_ACTIVE_MEMBERSHIP: remove this person from their organisation before anonymising.'
      USING ERRCODE = 'check_violation';
  END IF;

  _pseudonym := 'anonymised+' || _user_id::text || '@removed.invalid';

  UPDATE public.profiles SET display_name = NULL, country = NULL, updated_at = now()
   WHERE id = _user_id;

  UPDATE public.sp_passport_profiles SET display_name = NULL, headline = NULL, updated_at = now()
   WHERE holder_user_id = _user_id;

  UPDATE auth.users
     SET email = _pseudonym,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   WHERE id = _user_id;

  _cleared := jsonb_build_object(
    'profile', true,
    'passport_profile', EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _user_id),
    'auth_email', true,
    'account_disabled', true
  );

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', 'user_anonymised', 'user', _user_id::text,
          jsonb_build_object('reason', _clean_reason, 'cleared', _cleared,
                             'retained', jsonb_build_array('sp_claims', 'sp_evidence',
                               'scp_attempts', 'scp_competency_evidence', 'employees',
                               'job_applications', 'audit_logs')));

  RETURN jsonb_build_object('user_id', _user_id, 'anonymised', true, 'cleared', _cleared);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_anonymise_user(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_anonymise_user(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_anonymise_user(uuid, text, text) IS
  'Superadmin-only, irreversible. Clears the personal profile data the platform '
  'holds (profiles, sp_passport_profiles, the auth email and sign-up metadata) '
  'and disables the account. Deliberately does NOT touch assessment evidence, '
  'Passport claims, employment records or audit history -- see the migration '
  'comment for the retention reasoning behind each. Requires the account email '
  'as typed confirmation and refuses while a platform role or an active '
  'organisation membership remains.';


-- -----------------------------------------------------------------------------
-- 8. User hard delete — superadmin only
--
-- Reachable only for an account that has no history at all: the impact report
-- above must return zero blockers. Everything that then disappears is
-- profile-shaped, not evidential -- consent records, saved jobs, an empty
-- Career Discovery session -- and is listed back to the caller.
--
-- The pseudonymous subject spine is handled explicitly. scp_subject_identities
-- CASCADEs, which would leave a subject row with no identity and no attempts:
-- an orphan. Such a subject is deleted here; a subject with any dependent row
-- is left alone, and its RESTRICT edges would have blocked the delete anyway.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user_if_safe(
  _user_id uuid,
  _reason text,
  _confirm_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _email text;
  _impact jsonb;
  _orphan_subjects uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: deleting an account is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_id = _caller THEN
    RAISE EXCEPTION 'SELF_DELETE_NOT_ALLOWED: a superadmin cannot delete their own account.'
      USING ERRCODE = 'check_violation';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to delete an account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(_confirm_email, '')) <> coalesce(_email, '') THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: the typed address does not match this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  _impact := public.admin_user_deletion_impact(_user_id);
  IF NOT (_impact ->> 'deletable')::boolean THEN
    RAISE EXCEPTION 'USER_NOT_DELETABLE: %',
      (SELECT string_agg(b ->> 'code', ', ') FROM jsonb_array_elements(_impact -> 'blockers') b)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(i.subject_id), '{}')
    INTO _orphan_subjects
    FROM public.scp_subject_identities i
   WHERE i.user_id = _user_id
     AND NOT EXISTS (SELECT 1 FROM public.scp_subject_identities o
                      WHERE o.subject_id = i.subject_id AND o.user_id <> _user_id)
     AND NOT EXISTS (SELECT 1 FROM public.scp_attempts a WHERE a.subject_id = i.subject_id)
     AND NOT EXISTS (SELECT 1 FROM public.scp_competency_evidence e WHERE e.subject_id = i.subject_id)
     AND NOT EXISTS (SELECT 1 FROM public.scp_report_snapshots s WHERE s.subject_id = i.subject_id)
     AND NOT EXISTS (SELECT 1 FROM public.scp_training_assignments ta WHERE ta.subject_id = i.subject_id)
     AND NOT EXISTS (SELECT 1 FROM public.scp_assessment_invitations inv WHERE inv.bound_subject_id = i.subject_id)
     AND NOT EXISTS (SELECT 1 FROM public.employees em WHERE em.subject_id = i.subject_id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', 'user_deleted', 'user', _user_id::text,
          jsonb_build_object('email', _email, 'reason', _clean_reason,
                             'removed', _impact -> 'removed_on_delete',
                             'orphan_subjects', to_jsonb(_orphan_subjects)));

  DELETE FROM public.scp_subject_identities WHERE user_id = _user_id;
  DELETE FROM public.scp_subjects WHERE id = ANY (_orphan_subjects);
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'deleted', true,
    'removed', _impact -> 'removed_on_delete',
    'orphan_subjects_removed', coalesce(array_length(_orphan_subjects, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) IS
  'Superadmin-only, irreversible. Deletes an account only when '
  'admin_user_deletion_impact() reports zero blockers -- no application, no '
  'membership, no employment, no assessment evidence, no Passport evidence, no '
  'platform role, no audit history and no record the account has acted on. '
  'Requires the account email as typed confirmation. Removes the pseudonymous '
  'subject only when it would otherwise be orphaned. One audit_logs row, same '
  'transaction.';


-- -----------------------------------------------------------------------------
-- 9. Job hard delete — platform admin
--
-- The employer-side equivalent, jobs_delete_draft(), already exists and is
-- unchanged. This is the same rule for an administrator who is not a member of
-- the organisation: a draft that was never published and never attracted an
-- application, an assignment or an invitation. Anything else is closed or
-- archived, never deleted.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_job_if_safe(_job_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _job public.jobs%ROWTYPE;
  _clean_reason text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to delete an advertisement.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF _job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: no such advertisement.' USING ERRCODE = 'P0001';
  END IF;

  IF _job.status <> 'draft' OR _job.published_at IS NOT NULL THEN
    RAISE EXCEPTION
      'JOB_NOT_DELETABLE: only a draft that was never published can be deleted. Archive it instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = _job_id) THEN
    RAISE EXCEPTION 'JOB_HAS_APPLICATIONS: this advertisement has applications and cannot be deleted.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assessment_assignments s WHERE s.job_id = _job_id) THEN
    RAISE EXCEPTION 'JOB_HAS_ASSIGNMENTS: assessments were assigned from this advertisement.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_assessment_invitations i WHERE i.job_id = _job_id) THEN
    RAISE EXCEPTION 'JOB_HAS_INVITATIONS: candidates were invited from this advertisement.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
  VALUES (_caller, 'platform_admin', 'job_deleted', 'job', _job_id::text, _job.employer_id,
          jsonb_build_object('slug', _job.slug, 'reason', _clean_reason));

  DELETE FROM public.jobs WHERE id = _job_id;

  RETURN jsonb_build_object('job_id', _job_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_job_if_safe(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_job_if_safe(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_delete_job_if_safe(uuid, text) IS
  'Platform-admin-only. The administrator equivalent of jobs_delete_draft(): '
  'a never-published draft with no application, assignment or invitation. '
  'Requires a reason. One audit_logs row, same transaction.';


-- -----------------------------------------------------------------------------
-- 10. Identity diagnostics — READ ONLY
--
-- The platform holds four separate notions of "a person": an auth account, a
-- pseudonymous scp_subject, an employer's employee record and an application.
-- They can drift apart. This function makes the drift visible.
--
-- It deliberately does NOT merge anything, and there is no merge function
-- anywhere in this schema to call. Merging identities across a Passport, an
-- assessment history and an employment record is not a mechanical operation
-- and is explicitly out of scope for this phase.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_identity_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _findings jsonb := '[]'::jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  -- NOTE ON WHAT A DUPLICATE CAN ACTUALLY LOOK LIKE HERE.
  -- scp_subject_identities is 1:1 by construction -- subject_id is its primary
  -- key and user_id carries a UNIQUE constraint -- so "one account with two
  -- subjects" and "one subject with two accounts" are both impossible rows,
  -- not undetected ones. A duplicate person on this platform therefore always
  -- shows up as a record that is NOT linked, or linked to the wrong spine.
  -- Those are the four things checked below.

  -- A pseudonymous subject that has been assessed but has no account attached:
  -- the history exists and nobody can reach it.
  SELECT _findings || coalesce(jsonb_agg(f), '[]'::jsonb) INTO _findings
    FROM (
      SELECT jsonb_build_object(
               'code', 'UNCLAIMED_SUBJECT',
               'subject_id', a.subject_id,
               'attempts', count(*)
             ) AS f
        FROM public.scp_attempts a
       WHERE NOT EXISTS (SELECT 1 FROM public.scp_subject_identities i
                          WHERE i.subject_id = a.subject_id)
       GROUP BY a.subject_id
       LIMIT 100
    ) s;

  -- The same person entered twice in one organisation's workforce.
  SELECT _findings || coalesce(jsonb_agg(f), '[]'::jsonb) INTO _findings
    FROM (
      SELECT jsonb_build_object(
               'code', 'DUPLICATE_EMPLOYEE_IN_ORGANISATION',
               'employer_id', e.employer_id,
               'email', lower(e.email),
               'count', count(*)
             ) AS f
        FROM public.employees e
       WHERE e.email IS NOT NULL
       GROUP BY e.employer_id, lower(e.email)
      HAVING count(*) > 1
       LIMIT 100
    ) s;

  -- An employee whose address belongs to a real account, but who has never
  -- been bound to that account's subject: assessments run for this employee
  -- would start a second history.
  SELECT _findings || coalesce(jsonb_agg(f), '[]'::jsonb) INTO _findings
    FROM (
      SELECT jsonb_build_object(
               'code', 'EMPLOYEE_NOT_BOUND_TO_ACCOUNT',
               'employee_id', e.id,
               'employer_id', e.employer_id,
               'email', e.email,
               'user_id', u.id
             ) AS f
        FROM public.employees e
        JOIN auth.users u ON lower(u.email) = lower(e.email)
       WHERE e.email IS NOT NULL
         AND e.subject_id IS NULL
       LIMIT 100
    ) s;

  -- An employee bound to a subject that is NOT the subject of the account
  -- with the same address: the two records disagree about who this is.
  SELECT _findings || coalesce(jsonb_agg(f), '[]'::jsonb) INTO _findings
    FROM (
      SELECT jsonb_build_object(
               'code', 'EMPLOYEE_SUBJECT_MISMATCH',
               'employee_id', e.id,
               'employer_id', e.employer_id,
               'email', e.email,
               'employee_subject_id', e.subject_id,
               'account_subject_id', i.subject_id
             ) AS f
        FROM public.employees e
        JOIN auth.users u ON lower(u.email) = lower(e.email)
        JOIN public.scp_subject_identities i ON i.user_id = u.id
       WHERE e.email IS NOT NULL
         AND e.subject_id IS NOT NULL
         AND e.subject_id <> i.subject_id
       LIMIT 100
    ) s;

  RETURN jsonb_build_object('findings', _findings, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_identity_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_identity_diagnostics() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_identity_diagnostics() IS
  'Platform-admin-only, strictly read-only. Flags possible duplicate or drifted '
  'identities for human review. Performs no merge and no write of any kind: '
  'automatic identity merging is deliberately not built.';


-- -----------------------------------------------------------------------------
-- 11. Disposable-record inventory ("Datahantering")
--
-- The one honest definition of test data this schema can support: records the
-- database itself computes as having no operational history whatsoever. There
-- is no flag to set and therefore no flag to set wrongly.
--
-- A cheap set-based prefilter narrows the candidates, then the full impact
-- function is evaluated for each survivor -- so the inventory and the delete
-- functions can never disagree about what is disposable.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_disposable_records(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _employers jsonb := '[]'::jsonb;
  _users jsonb := '[]'::jsonb;
  _cap int := least(greatest(coalesce(_limit, 50), 1), 200);
  _rec record;
  _impact jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  FOR _rec IN
    SELECT e.id, e.name, e.status, e.created_at
      FROM public.employers e
     WHERE NOT EXISTS (SELECT 1 FROM public.job_applications x WHERE x.employer_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM public.employees x WHERE x.employer_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM public.assessment_assignments x WHERE x.employer_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM public.employer_moderation_events x WHERE x.employer_id = e.id)
     ORDER BY e.created_at DESC
     LIMIT _cap
  LOOP
    _impact := public.admin_employer_deletion_impact(_rec.id);
    IF (_impact ->> 'deletable')::boolean THEN
      _employers := _employers || jsonb_build_object(
        'id', _rec.id, 'name', _rec.name, 'status', _rec.status,
        'created_at', _rec.created_at,
        'removed_on_delete', _impact -> 'removed_on_delete');
    END IF;
  END LOOP;

  FOR _rec IN
    SELECT u.id, u.email, u.created_at
      FROM auth.users u
     WHERE NOT EXISTS (SELECT 1 FROM public.job_applications x WHERE x.applicant_user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.employer_memberships x WHERE x.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.sp_claims x WHERE x.holder_user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.assessment_runs x WHERE x.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.audit_logs x WHERE x.actor_id = u.id)
     ORDER BY u.created_at DESC
     LIMIT _cap
  LOOP
    _impact := public.admin_user_deletion_impact(_rec.id);
    IF (_impact ->> 'deletable')::boolean THEN
      _users := _users || jsonb_build_object(
        'id', _rec.id, 'email', _rec.email, 'created_at', _rec.created_at,
        'removed_on_delete', _impact -> 'removed_on_delete');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'employers', _employers,
    'users', _users,
    'scanned_limit', _cap,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_disposable_records(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_disposable_records(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_disposable_records(int) IS
  'Platform-admin-only, read-only inventory of records the database computes as '
  'having no operational history: the only definition of "test data" this '
  'schema can support without a mislabellable flag. Deleting anything listed '
  'here still goes through the per-entity safe-delete function, which '
  'recomputes the same blockers. There is no bulk delete.';


-- -----------------------------------------------------------------------------
-- 12. Canonical person view
--
-- The platform holds a person in four places (account, profile, pseudonymous
-- subject, employment record) and their history in half a dozen more. An
-- administrator answering "who is this and what is attached to them" currently
-- has to visit four screens and still cannot see the account's disabled state,
-- because auth.users is not reachable from PostgREST at all.
--
-- One governed read returns the whole picture. Counts rather than contents
-- wherever the contents are somebody's evidence: the administrator learns that
-- three Passport claims exist, not what they say.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_person_overview(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _u record;
  _subject uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  SELECT id, email, created_at, last_sign_in_at, email_confirmed_at, banned_until
    INTO _u FROM auth.users WHERE id = _user_id;
  IF _u.id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  SELECT subject_id INTO _subject FROM public.scp_subject_identities WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'account', jsonb_build_object(
      'id', _u.id,
      'email', _u.email,
      'created_at', _u.created_at,
      'last_sign_in_at', _u.last_sign_in_at,
      'email_confirmed_at', _u.email_confirmed_at,
      'disabled', _u.banned_until IS NOT NULL AND _u.banned_until > now(),
      'disabled_until', _u.banned_until
    ),
    'profile', (
      SELECT jsonb_build_object('display_name', p.display_name, 'country', p.country, 'locale', p.locale)
        FROM public.profiles p WHERE p.id = _user_id
    ),
    'roles', coalesce((SELECT jsonb_agg(r.role ORDER BY r.role)
                         FROM public.user_roles r WHERE r.user_id = _user_id), '[]'::jsonb),
    'subject_id', _subject,
    'memberships', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'employer_id', m.employer_id, 'employer_name', e.name,
               'employer_slug', e.slug, 'employer_status', e.status,
               'role', m.role, 'status', m.status) ORDER BY e.name)
        FROM public.employer_memberships m
        JOIN public.employers e ON e.id = m.employer_id
       WHERE m.user_id = _user_id), '[]'::jsonb),
    'employment', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'employee_id', em.id, 'employer_id', em.employer_id,
               'employer_name', e.name, 'employment_status', em.employment_status)
             ORDER BY e.name)
        FROM public.employees em
        JOIN public.employers e ON e.id = em.employer_id
       WHERE _subject IS NOT NULL AND em.subject_id = _subject), '[]'::jsonb),
    'applications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'job_id', a.job_id, 'employer_name', e.name,
               'title_sv', j.title_sv, 'title_en', j.title_en,
               'status', a.status, 'created_at', a.created_at)
             ORDER BY a.created_at DESC)
        FROM public.job_applications a
        JOIN public.jobs j ON j.id = a.job_id
        JOIN public.employers e ON e.id = a.employer_id
       WHERE a.applicant_user_id = _user_id), '[]'::jsonb),
    'assessments', jsonb_build_object(
      'assignments', (SELECT count(*) FROM public.assessment_assignments WHERE recipient_user_id = _user_id),
      'runs', (SELECT count(*) FROM public.assessment_runs WHERE user_id = _user_id),
      'attempts', (SELECT count(*) FROM public.scp_attempts WHERE _subject IS NOT NULL AND subject_id = _subject),
      'released_reports', (SELECT count(*) FROM public.scp_report_snapshots WHERE _subject IS NOT NULL AND subject_id = _subject)
    ),
    'passport', jsonb_build_object(
      'has_profile', EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _user_id),
      'claims', (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _user_id),
      'evidence', (SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = _user_id),
      'active_disclosures', (SELECT count(*) FROM public.sp_disclosures
                              WHERE holder_user_id = _user_id AND revoked_at IS NULL
                                AND (expires_at IS NULL OR expires_at > now())),
      'verification_requests', (SELECT count(*) FROM public.sp_verification_requests WHERE holder_user_id = _user_id)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_person_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_person_overview(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_person_overview(uuid) IS
  'Platform-admin-only, read-only. One canonical view of a person across the '
  'account, profile, pseudonymous subject, memberships, employment, '
  'applications, assessment history and Passport. Evidence is reported as '
  'counts, never as contents: an administrator learns that claims exist, not '
  'what they assert. Includes the account disabled state, which PostgREST '
  'cannot read from auth.users by any other route.';
