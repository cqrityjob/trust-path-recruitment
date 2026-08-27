-- =============================================================================
-- Superadmin permanent account deletion
--
-- WHAT CHANGED, AND WHY
--
-- admin_delete_user_if_safe() previously refused any account that had history:
-- an application, a membership, an employment record, assessment or Passport
-- evidence, a platform role, an audit trail, or a record it had acted on. In
-- practice permanent deletion was reachable only for accounts that had never
-- been used, and the administrator's real endings were disable and anonymise.
--
-- The owner's decision is that history must no longer BLOCK a superadmin's
-- permanent deletion. It must be HANDLED, without weakening the schema.
--
--
-- TWO ENDINGS, ONE BUTTON
--
-- The obstacle is not the foreign keys. It is that this schema makes records
-- immutable with triggers -- an interview note, an employer decision, a rubric
-- score, a competency evidence row, a completed review, a Passport event, a
-- verification decision are all append-only, and an assessment assignment and
-- a graph version are fixed at creation -- and several of those records name
-- the person as the ACTOR. A record that may never be rewritten cannot have
-- its actor erased, and a foreign key pointing at that actor cannot be
-- followed by a DELETE.
--
-- So permanent deletion takes one of two forms, chosen by the impact report:
--
--   HARD DELETE     The account has no retained history at all. The auth row
--                   is deleted and every cascade fires, exactly as before.
--
--   ERASURE         The account has retained history. The auth row SURVIVES,
--   (tombstone)     so every foreign key that points at it stays valid and no
--                   dangling actor id is ever created -- but the identity it
--                   carried is destroyed: the address is released, the sign-in
--                   identities are removed, live sessions are revoked, the
--                   account is banned, and every row that was the person's own
--                   data is deleted. What is left is an anonymous tombstone
--                   that satisfies referential integrity and nothing else.
--
-- The person cannot log in, cannot be reopened, and holds no address. The
-- address they held is free for a brand-new registration the moment either
-- form commits, and that registration gets a NEW user id. The difference
-- between the two forms is invisible from outside; it exists only so that
-- retained history keeps its integrity.
--
-- NOTHING in this migration drops a foreign key, relaxes a NOT NULL, or
-- otherwise weakens referential integrity.
--
--
-- SECURITY PASSPORT
--
-- Disable/enable leaves the Passport untouched. Permanent deletion erases the
-- holder's own Passport -- claims, evidence, experience, profile, events,
-- verification requests and decisions -- and a later registration starts with
-- a new, empty Passport. That is the retention rule already written down in
-- docs/passport/privacy-processing-matrix.md, which gives the holder's own
-- Passport "Until holder withdraws" and gives the APPLICATION DISCLOSURE the
-- separate retention "Employer's lawful recruitment record". So the disclosure
-- and its access log survive, detached from the holder.
--
-- The evidence FILES live in the private `passport-evidence` Storage bucket
-- and are not reachable from SQL, and the candidate's CV lives the same way in
-- `job-application-cvs`. This migration does not pretend otherwise: it records
-- the erasure intent for BOTH in storage_erasure_queue in the SAME transaction
-- that removes or clears the rows naming them, and a server-side sweep performs
-- the object deletes afterwards and retries until each one succeeds. See
-- section 6.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The tombstone register
--
-- One row per erased account. It is what makes an erasure irreversible and
-- visible: admin_set_user_disabled() refuses to reopen an account listed here,
-- the administrator's user list hides them, and the person view reports the
-- account as erased rather than pretending it is an ordinary member.
--
-- It references auth.users, so it cannot outlive the row it describes: if that
-- account is ever hard-deleted later, this row goes with it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at  timestamptz NOT NULL DEFAULT now(),
  deleted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  had_history boolean NOT NULL DEFAULT true
);

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM PUBLIC, anon;
GRANT SELECT ON public.deleted_accounts TO authenticated;
GRANT ALL ON public.deleted_accounts TO service_role;

-- Administrators need to know an account is a tombstone; nobody else does, and
-- there is nothing personal left in the row to protect beyond that.
DROP POLICY IF EXISTS deleted_accounts_admin_select ON public.deleted_accounts;
CREATE POLICY deleted_accounts_admin_select ON public.deleted_accounts
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

COMMENT ON TABLE public.deleted_accounts IS
  'One row per permanently erased account whose auth row had to survive so '
  'that retained history keeps its foreign keys. The account holds no address, '
  'no identity and no session, cannot sign in and cannot be reopened. See '
  'migration 20260917090000.';


-- -----------------------------------------------------------------------------
-- 2. Storage erasure queue
--
-- A Storage object delete is an HTTP call to another service. It cannot be
-- part of this transaction, and pretending otherwise would mean an erasure
-- that reports success while the file is still there.
--
-- So the intent is recorded transactionally and the work is done afterwards:
--
--   * the erasure INSERTs one row here per evidence object, in the same
--     transaction that deletes the evidence rows. If the erasure rolls back,
--     so does the queue -- there is never an order to delete a file that still
--     has a live row, and never a deleted row whose file was not queued;
--   * a server-side sweep, running with the service key, deletes the objects
--     and marks each row done;
--   * a failure is RECORDED, not swallowed: attempts is incremented and
--     last_error is kept, the row stays pending, and the next sweep retries it.
--
-- A pending row is therefore the visible, recoverable state, and
-- admin_storage_erasure_backlog() is how an administrator sees it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_erasure_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id       text NOT NULL,
  object_path     text NOT NULL,
  reason          text NOT NULL,
  -- Deliberately NOT a foreign key: the whole point is that this outlives the
  -- rows, and in the hard-delete form it outlives the account itself.
  subject_user_id uuid,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  requested_by    uuid,
  attempts        integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error      text,
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS storage_erasure_queue_pending_idx
  ON public.storage_erasure_queue (requested_at)
  WHERE completed_at IS NULL;

ALTER TABLE public.storage_erasure_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_erasure_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.storage_erasure_queue TO service_role;

COMMENT ON TABLE public.storage_erasure_queue IS
  'Objects that must be removed from Storage because the rows that referenced '
  'them were erased. Written transactionally by the erasure; drained by a '
  'server-side sweep that retries. A row with completed_at IS NULL and a '
  'non-null last_error is a failure that is visible and still owed.';


-- -----------------------------------------------------------------------------
-- 3. The immutability guards, and the one exception they recognise
--
-- Two of the existing guards already answer the question this migration asks.
-- sp_guard_events_append_only() and sp_guard_decisions_append_only() permit a
-- DELETE precisely when the holder's auth.users row is already gone, and
-- permit an UPDATE never. That is the schema's own rule:
--
--     an append-only record is deleted with the person, never edited.
--
-- The erasure form honours that rule but cannot satisfy its test, because the
-- auth row deliberately survives. So the condition is widened from "the holder
-- is gone" to "the holder is gone, OR this holder is being erased right now",
-- which is the same intent expressed for a form of erasure those guards were
-- written before.
--
-- The exception is narrow on three counts, all of which must hold at once:
--
--   1. a permanent erasure is running in THIS transaction and names exactly
--      the account the row belongs to -- a transaction-local setting, set
--      nowhere else in the schema, which cannot leak into another statement or
--      another session;
--   2. the caller is a superadmin, checked here again rather than assumed;
--   3. for an UPDATE, nothing moved except the named column.
--
-- A guard that has not been taught the exception still refuses, and that
-- refusal rolls the whole erasure back. That is deliberate: it is how a newly
-- protected table announces that somebody has to decide what erasure means for
-- it, instead of the erasure quietly skipping it.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_releases(_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _actor IS NOT NULL
     AND nullif(current_setting('trustpath.deleting_account', true), '') = _actor::text
     AND public.is_superadmin(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.account_deletion_releases(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_releases(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.account_deletion_releases(uuid) IS
  'True only while admin_delete_user_if_safe() is erasing exactly this account, '
  'in this transaction, for a caller who is a superadmin. The setting it reads '
  'is transaction-local and is set nowhere else in the schema.';

CREATE OR REPLACE FUNCTION public.account_deletion_only_released(
  _old jsonb, _new jsonb, _cols text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
            FROM jsonb_each(_old) AS e
           WHERE e.key <> ALL (_cols) AND e.key <> 'updated_at')
       = (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
            FROM jsonb_each(_new) AS e
           WHERE e.key <> ALL (_cols) AND e.key <> 'updated_at');
$$;

REVOKE ALL ON FUNCTION public.account_deletion_only_released(jsonb, jsonb, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_only_released(jsonb, jsonb, text[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.account_deletion_only_released(jsonb, jsonb, text[]) IS
  'True when an UPDATE changed nothing but the named columns (updated_at aside). '
  'Paired with account_deletion_releases() so the exception cannot widen into '
  '"a superadmin may edit an immutable row".';


-- An assignment's recipient is fixed at creation. It survives the person as
-- the employer's record of having assessed someone, so the address it was sent
-- to -- the person's own -- has to be pseudonymised rather than left behind.
-- Re-declared with its original security posture: SECURITY INVOKER, pinned
-- search_path, EXECUTE revoked from PUBLIC. The privilege the exception needs
-- lives in account_deletion_releases(), which is SECURITY DEFINER precisely so
-- this guard does not have to be.
CREATE OR REPLACE FUNCTION public.assessment_assignments_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.account_deletion_releases(OLD.recipient_user_id)
     AND public.account_deletion_only_released(
           to_jsonb(OLD), to_jsonb(NEW), ARRAY['recipient_email','recipient_user_id'])
  THEN
    RETURN NEW;
  END IF;

  IF NEW.employer_id               IS DISTINCT FROM OLD.employer_id
     OR NEW.assessment_id             IS DISTINCT FROM OLD.assessment_id
     OR NEW.assessment_version_id     IS DISTINCT FROM OLD.assessment_version_id
     OR NEW.scp_assessment_version_id IS DISTINCT FROM OLD.scp_assessment_version_id
     OR NEW.profile_id                IS DISTINCT FROM OLD.profile_id
     OR NEW.recipient_email           IS DISTINCT FROM OLD.recipient_email
     OR NEW.assigned_by               IS DISTINCT FROM OLD.assigned_by
     OR NEW.invitation_token_hash     IS DISTINCT FROM OLD.invitation_token_hash
  THEN
    RAISE EXCEPTION
      'ASSESSMENT_ASSIGNMENT_IMMUTABLE: an assignment''s employer, assessment '
      'lineage, recipient, assigner and invitation token are fixed at creation.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_assignments_immutable_guard() FROM PUBLIC;


-- Passport history: still never updated, still only deleted once the holder is
-- gone -- where "gone" now also means "being erased in this transaction".
CREATE OR REPLACE FUNCTION public.sp_guard_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SP_EVENTS_APPEND_ONLY: passport history cannot be updated'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id)
     AND NOT public.account_deletion_releases(OLD.holder_user_id) THEN
    RAISE EXCEPTION 'SP_EVENTS_APPEND_ONLY: passport history cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_guard_events_append_only() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sp_guard_decisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SP_DECISIONS_APPEND_ONLY: a verification decision cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id)
     AND NOT public.account_deletion_releases(OLD.holder_user_id) THEN
    RAISE EXCEPTION 'SP_DECISIONS_APPEND_ONLY: a verification decision cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_guard_decisions_append_only() FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- 4. One retention change, and it is not an integrity change
--
-- sp_disclosures.focus_claim_id pointed at the holder's claim with ON DELETE
-- CASCADE, so erasing the holder's Passport would have taken the EMPLOYER's
-- disclosure record with it -- the one Passport row the privacy matrix says
-- has a different retention and must survive. The pointer is released instead
-- of followed.
--
-- This drops no foreign key and creates no dangling id: SET NULL is the exact
-- opposite of a dangling reference, and the column was already nullable.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_focus_claim_id_fkey;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_focus_claim_id_fkey
  FOREIGN KEY (focus_claim_id) REFERENCES public.sp_claims(id) ON DELETE SET NULL;


-- -----------------------------------------------------------------------------
-- 5. The impact report, re-cut along the three outcomes
--
-- Same function, same caller, same read-only contract. What changes is that
-- the report no longer exists to say "no": it exists to say what will happen.
-- The catalogue-driven scan is kept exactly as it was -- every half is still
-- read from pg_constraint at call time, so the report cannot drift from the
-- schema -- and is now cut three ways instead of two.
--
--   deleted     rows that go, by table and column
--   detached    rows that survive with the person released or anonymised
--   preserved   spines and records that are not touched at all
--   blockers    RETAINED and still computed exactly as before, but now
--               ADVISORY. 'deletable' is what it always was, and is what
--               chooses between the hard-delete and erasure forms.
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
  _deleted jsonb := '{}'::jsonb;
  _detached jsonb := '{}'::jsonb;
  _preserved jsonb := '{}'::jsonb;
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
  _subject uuid;
  _retained constant text[] := ARRAY['job_applications', 'sp_disclosures'];
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

  -- Every FK to auth.users that REFUSES a delete (NO ACTION / RESTRICT). These
  -- are actor references on records that must not be rewritten. In the erasure
  -- form they are left exactly as they are, pointing at the tombstone.
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
      _preserved := _preserved || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- Every FK that RELEASES the person (SET NULL): the record survives without
  -- them.
  FOR _rec IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.confdeltype = 'n'
       AND c.connamespace = 'public'::regnamespace
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', _rec.tbl, _rec.col)
      INTO _n USING _user_id;
    IF _n > 0 THEN
      _detached := _detached || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- Every FK that CASCADES: the person's own data. It goes in both forms --
  -- by cascade in the hard-delete form, by explicit delete in the erasure
  -- form -- except the two tables whose retention belongs to somebody else.
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
      IF _rec.tbl = ANY (_retained) THEN
        _detached := _detached || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
      ELSE
        _deleted := _deleted || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
      END IF;
    END IF;
  END LOOP;

  -- The pseudonymous spine. Nothing here is keyed on the person, so nothing is
  -- deleted or rewritten -- but the administrator should see that it survives,
  -- and how much of it there is.
  SELECT subject_id INTO _subject
    FROM public.scp_subject_identities WHERE user_id = _user_id LIMIT 1;

  IF _subject IS NOT NULL THEN
    _preserved := _preserved
      || jsonb_build_object('scp_attempts',
           (SELECT count(*) FROM public.scp_attempts WHERE subject_id = _subject))
      || jsonb_build_object('scp_competency_evidence',
           (SELECT count(*) FROM public.scp_competency_evidence WHERE subject_id = _subject))
      || jsonb_build_object('scp_report_snapshots',
           (SELECT count(*) FROM public.scp_report_snapshots WHERE subject_id = _subject))
      || jsonb_build_object('employees',
           (SELECT count(*) FROM public.employees WHERE subject_id = _subject));
  END IF;

  _preserved := _preserved || jsonb_build_object('audit_logs',
    (SELECT count(*) FROM public.audit_logs WHERE subject_id = _user_id::text));

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
    -- True when the account has no history at all. It no longer refuses
    -- anything; it chooses which FORM the permanent deletion takes.
    'deletable', jsonb_array_length(_blockers) = 0,
    'form', CASE WHEN jsonb_array_length(_blockers) = 0 THEN 'hard_delete' ELSE 'erasure' END,
    'blockers', _blockers,
    'acted_on', _acted,
    'removed_on_delete', _removed,
    'deleted', _deleted,
    'detached', _detached,
    'preserved', _preserved,
    'has_history', jsonb_array_length(_blockers) > 0,
    'already_erased', EXISTS (SELECT 1 FROM public.deleted_accounts WHERE user_id = _user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_deletion_impact(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_user_deletion_impact(uuid) IS
  'Platform-admin-only, read-only. Reports what a permanent deletion would do '
  'to this account, split three ways -- deleted, detached, preserved -- and '
  'which form it would take. Every part is read from pg_constraint at call '
  'time, so the report cannot drift from the schema.';


-- -----------------------------------------------------------------------------
-- 6. Permanent deletion
--
-- Superadmin only, irreversible, and unconditional on history. The whole
-- sequence is one function and therefore one transaction: if any step raises,
-- Postgres rolls the entire operation back and the account is exactly as it
-- was. There is no partial state and no second call for a client to get wrong.
--
--   1  authenticate, authorise, refuse self-deletion
--   2  lock the account row, so two concurrent deletions cannot interleave
--   3  require the typed address, unchanged
--   4  refuse an account already erased, and the last active superadmin
--   5  compute the impact -- for the RECORD, and to choose the form
--   6  queue the Storage objects the erasure orphans
--   7  anonymise the records that survive
--   8  delete the person's own data
--   9  write the audit row, while the account still exists to be described
--  10  either delete the auth row, or tombstone it
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
  _hard boolean;
  _pseudonym text;
  _rec record;
  _n bigint;
  _queued int := 0;
  _anonymised jsonb := '{}'::jsonb;
  _orphan_subjects uuid[];
  _pass int;
  _progress boolean;
  _retained constant text[] := ARRAY['job_applications', 'sp_disclosures'];
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

  IF EXISTS (SELECT 1 FROM public.deleted_accounts WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_ALREADY_ERASED: this account has already been permanently deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF btrim(coalesce(_confirm_email, '')) <> coalesce(_email, '') THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: the typed address does not match this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same invariant that protects disable: deleting the only remaining
  -- active superadmin would lock the platform out of its own role management.
  IF public.is_superadmin(_user_id) THEN
    IF (SELECT count(*) FROM public.user_roles r
          JOIN auth.users u ON u.id = r.user_id
         WHERE r.role = 'superadmin' AND r.user_id <> _user_id
           AND (u.banned_until IS NULL OR u.banned_until < now())) < 1 THEN
      RAISE EXCEPTION 'LAST_SUPERADMIN_PROTECTED: cannot delete the only remaining active superadmin.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  _impact := public.admin_user_deletion_impact(_user_id);
  _hard   := (_impact ->> 'deletable')::boolean;
  _pseudonym := 'raderad+' || _user_id::text || '@removed.invalid';

  -- Announce the erasure to the immutability guards, transaction-locally.
  PERFORM set_config('trustpath.deleting_account', _user_id::text, true);

  -- ── Storage: record the intent before removing the only rows that name it ──
  --
  -- Two buckets, one queue. Both are the PERSON's own uploads, and in both
  -- cases the database row that names the object is about to disappear or be
  -- cleared -- so the path has to be captured here, first, or it is lost and
  -- the file becomes unreachable rubbish nobody can find again.
  --
  --   passport-evidence    the holder's own credential documents. The rows go
  --                        with the account (see the header), so the files do
  --                        too.
  --
  --   job-application-cvs  the candidate's CV. The employer's application
  --                        record SURVIVES this erasure, but the document the
  --                        candidate uploaded is theirs, and the governed
  --                        retention rule is explicit that the row and its CV
  --                        object are erased together, never partially
  --                        (docs/job-intelligence/jobs-mvp-v1-spec.md, Part M).
  --                        That same document anticipated this exact case --
  --                        "cascade delete alone never removes a Storage
  --                        object" -- which is what this block is for.
  --
  -- Only paths read from THIS person's own rows are queued. Nothing is
  -- constructed from a prefix or a pattern, so no other applicant's document
  -- and no employer-owned file can be reached from here.
  INSERT INTO public.storage_erasure_queue
    (bucket_id, object_path, reason, subject_user_id, requested_by)
  SELECT 'passport-evidence', e.storage_path, 'account_permanently_deleted', _user_id, _caller
    FROM public.sp_evidence e
   WHERE e.holder_user_id = _user_id AND e.storage_path IS NOT NULL;
  GET DIAGNOSTICS _queued = ROW_COUNT;

  INSERT INTO public.storage_erasure_queue
    (bucket_id, object_path, reason, subject_user_id, requested_by)
  SELECT 'job-application-cvs', a.cv_storage_path, 'account_permanently_deleted', _user_id, _caller
    FROM public.job_applications a
   WHERE a.applicant_user_id = _user_id AND a.cv_storage_path IS NOT NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _queued := _queued + _n;

  -- ── Anonymise what survives ───────────────────────────────────────────────
  -- The employer's recruitment record stays, and stays attached to the account
  -- row, which is exactly why that row must survive. What goes is the
  -- candidate's own contribution to it -- including the CV, whose Storage
  -- object was queued above BEFORE this statement clears the only pointer to
  -- it. Reversing those two would strand the file permanently.
  WITH upd AS (
    UPDATE public.job_applications
       SET phone = NULL, cover_note = NULL, cv_storage_path = NULL,
           cv_original_filename = NULL, cv_mime_type = NULL, cv_size_bytes = NULL,
           updated_at = now()
     WHERE applicant_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('job_applications', _n); END IF;

  WITH upd AS (
    UPDATE public.sp_disclosures SET recipient_hint = NULL
     WHERE holder_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('sp_disclosures', _n); END IF;

  -- An assessment assignment is the employer's record of having assessed
  -- someone. The address it was sent to is the person's own and is replaced.
  WITH upd AS (
    UPDATE public.assessment_assignments
       SET recipient_email = _pseudonym
     WHERE recipient_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('assessment_assignments', _n); END IF;

  WITH upd AS (
    UPDATE public.scp_assessment_invitations i
       SET email = _pseudonym, invited_name = NULL
     WHERE i.bound_subject_id IN
             (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id)
        OR lower(i.email) = lower(_email)
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('scp_assessment_invitations', _n); END IF;

  -- ── The record of the erasure ─────────────────────────────────────────────
  -- Written while the account still describes something, and keyed on the id
  -- as text so it survives whichever form follows.
  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', 'user_deleted', 'user', _user_id::text,
          jsonb_build_object(
            'email', _email,
            'reason', _clean_reason,
            'form', _impact ->> 'form',
            'deleted', _impact -> 'deleted',
            'detached', _impact -> 'detached',
            'preserved', _impact -> 'preserved',
            'anonymised', _anonymised,
            'storage_objects_queued', _queued,
            'had_history', _impact -> 'has_history',
            'removed', _impact -> 'deleted'));

  IF _hard THEN
    -- ── Form 1: hard delete ────────────────────────────────────────────────
    -- Nothing is attached, so every cascade is safe and the row itself goes.
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

    DELETE FROM public.scp_subject_identities WHERE user_id = _user_id;
    DELETE FROM public.scp_subjects WHERE id = ANY (_orphan_subjects);
    DELETE FROM auth.users WHERE id = _user_id;

  ELSE
    -- ── Form 2: erasure, with the auth row kept as a tombstone ─────────────
    --
    -- Delete the person's own data by hand, because the cascade that would
    -- normally do it is never going to fire. The set is read from the
    -- catalogue rather than listed here, so it is exactly the set the
    -- hard-delete form removes and cannot drift from the schema -- minus the
    -- two tables whose retention belongs to somebody else.
    --
    -- Repeated passes rather than a hand-maintained order: some of these
    -- tables reference each other, and sp_claims and sp_experience_periods
    -- reference THEMSELVES with RESTRICT through supersedes_id, so a
    -- superseded chain has to be unwound from the newest end. A pass that
    -- deletes nothing means everything reachable is gone.
    FOR _pass IN 1 .. 10 LOOP
      _progress := false;
      FOR _rec IN
        SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
          FROM pg_constraint c
          JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.contype = 'f'
           AND c.confrelid = 'auth.users'::regclass
           AND c.confdeltype = 'c'
           AND c.connamespace = 'public'::regnamespace
           AND c.conrelid::regclass::text <> ALL (_retained)
         ORDER BY 1, 2
      LOOP
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _rec.tbl, _rec.col)
            USING _user_id;
          GET DIAGNOSTICS _n = ROW_COUNT;
          IF _n > 0 THEN _progress := true; END IF;
        EXCEPTION WHEN foreign_key_violation THEN
          -- Something still references these rows. A later pass, having
          -- removed the referrer, will get them.
          NULL;
        END;
      END LOOP;
      EXIT WHEN NOT _progress;
    END LOOP;

    -- Anything left is a row this function does not know how to erase, and
    -- saying so loudly is better than reporting a completed erasure.
    FOR _rec IN
      SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
        FROM pg_constraint c
        JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND c.confrelid = 'auth.users'::regclass
         AND c.confdeltype = 'c'
         AND c.connamespace = 'public'::regnamespace
         AND c.conrelid::regclass::text <> ALL (_retained)
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', _rec.tbl, _rec.col)
        INTO _n USING _user_id;
      IF _n > 0 THEN
        RAISE EXCEPTION 'ERASURE_INCOMPLETE: % row(s) remain in %.% after erasure.',
          _n, _rec.tbl, _rec.col USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    -- The identity itself. After this the account holds no address, no
    -- sign-in identity and no session, and can never be reopened.
    DELETE FROM auth.identities WHERE user_id = _user_id;

    IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
      EXECUTE 'DELETE FROM auth.refresh_tokens WHERE user_id = $1' USING _user_id::text;
    END IF;
    IF to_regclass('auth.sessions') IS NOT NULL THEN
      EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING _user_id;
    END IF;

    UPDATE auth.users
       SET email = _pseudonym,
           raw_user_meta_data = '{}'::jsonb,
           banned_until = now() + interval '100 years'
     WHERE id = _user_id;

    INSERT INTO public.deleted_accounts (user_id, deleted_by, reason, had_history)
    VALUES (_user_id, _caller, _clean_reason, true);
  END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'deleted', true,
    'form', _impact ->> 'form',
    'email_released', _email,
    'removed', _impact -> 'deleted',
    'detached', _impact -> 'detached',
    'preserved', _impact -> 'preserved',
    'anonymised', _anonymised,
    'storage_objects_queued', _queued,
    'orphan_subjects_removed', coalesce(array_length(_orphan_subjects, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) IS
  'Superadmin-only, irreversible, atomic. Permanently deletes an account '
  'REGARDLESS of history. An account with no history is hard-deleted; an '
  'account with retained history is ERASED -- its auth row survives so that '
  'retained records keep their foreign keys, but the address is released, the '
  'sign-in identities and sessions are destroyed, the account is banned and '
  'registered in deleted_accounts, and every row that was the person''s own '
  'data is deleted. Either way the address is free for a brand-new '
  'registration and the account can never be reopened. Passport evidence '
  'objects are queued in storage_erasure_queue for the server-side sweep.';


-- -----------------------------------------------------------------------------
-- 7. An erased account can never be reopened
--
-- The one guarantee that would otherwise be a comment. Everything else about
-- the tombstone -- no address, no identity, no session, banned a century out --
-- is a fact about rows; this is the rule that stops an administrator undoing
-- it with the button next to the one they just used.
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

  -- A permanently deleted account is not a disabled one. There is no identity
  -- left to restore, so neither direction is offered.
  IF EXISTS (SELECT 1 FROM public.deleted_accounts WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_ERASED: this account was permanently deleted and cannot be reopened.'
      USING ERRCODE = 'check_violation';
  END IF;

  _target_is_admin := public.is_platform_admin(_user_id);
  _target_is_superadmin := public.is_superadmin(_user_id);

  IF _target_is_admin AND NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: disabling an administrator account is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  'requires superadmin to disable an administrator, refuses to disable the last '
  'active superadmin, and refuses either direction on a permanently deleted '
  'account. Writes one audit_logs row in the same transaction.';


-- -----------------------------------------------------------------------------
-- 8. The Storage backlog, for the administrator and for the sweep
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_storage_erasure_backlog()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  RETURN jsonb_build_object(
    'pending',  (SELECT count(*) FROM public.storage_erasure_queue WHERE completed_at IS NULL),
    'failed',   (SELECT count(*) FROM public.storage_erasure_queue
                  WHERE completed_at IS NULL AND attempts > 0),
    'completed',(SELECT count(*) FROM public.storage_erasure_queue WHERE completed_at IS NOT NULL),
    'oldest_pending_at', (SELECT min(requested_at) FROM public.storage_erasure_queue
                           WHERE completed_at IS NULL),
    'recent_errors', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'bucket', q.bucket_id, 'attempts', q.attempts, 'error', q.last_error)
               ORDER BY q.last_attempt_at DESC)
        FROM (SELECT * FROM public.storage_erasure_queue
               WHERE completed_at IS NULL AND last_error IS NOT NULL
               ORDER BY last_attempt_at DESC LIMIT 5) q), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_storage_erasure_backlog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_erasure_backlog() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_storage_erasure_backlog() IS
  'Platform-admin-only, read-only. How much Storage erasure is still owed, how '
  'much has failed at least once, and the most recent errors. A non-zero '
  'failed count means objects that should be gone are still there.';