-- Account erasure: remove the person's credential metadata and document
-- readings before their Passport rows.
--
-- admin_delete_user_if_safe() refused with ERASURE_INCOMPLETE for any holder
-- with a row in sp_credential_details (claim_id ON DELETE RESTRICT) or in
-- sp_evidence_extractions (evidence_id ON DELETE RESTRICT, and an append-only
-- trigger with no exception). Neither table references auth.users, so neither
-- the hard-delete cascade nor the erasure's catalogue-driven passes reached
-- them, and each kept its parent claim or evidence alive. Observed in
-- production on 2026-10-04 for a synthetic test account; 4 holders had
-- credential metadata at the time.
--
-- This migration:
--   1. gives sp_evidence_extractions its own append-only trigger function that
--      releases a DELETE only while admin_delete_user_if_safe() is erasing the
--      evidence holder, for a superadmin caller (account_deletion_releases, the
--      existing primitive). UPDATE stays refused for everyone. The shared
--      function sp_extractions_append_only() is unchanged and still guards the
--      share policy and share events, which belong to retained disclosures.
--   2. replaces admin_delete_user_if_safe() with the 20260917090000 body plus
--      one block: delete the person's own extraction and credential-metadata
--      rows first, and record their counts in the audit row and the result.
-- Nothing else changes: authorisation, confirmation, last-superadmin guard,
-- storage queue, anonymisation, both forms and the completeness check.
--
-- ORDER: must be applied before 20270212090000 (catalogue research, #410) or
-- be renumbered after the catalogue series; it does not depend on it.

BEGIN;

CREATE OR REPLACE FUNCTION public.sp_evidence_extractions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.account_deletion_releases(
       (SELECT e.holder_user_id FROM public.sp_evidence e WHERE e.id = OLD.evidence_id)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'SP_EXTRACTION_APPEND_ONLY';
END $$;
REVOKE ALL ON FUNCTION public.sp_evidence_extractions_append_only() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER sp_extractions_append_only ON public.sp_evidence_extractions;
CREATE TRIGGER sp_extractions_append_only BEFORE UPDATE OR DELETE ON public.sp_evidence_extractions
  FOR EACH ROW EXECUTE FUNCTION public.sp_evidence_extractions_append_only();

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
  _dependents jsonb := '{}'::jsonb;
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

  -- ── Dependents that do not name the account ──────────────────────────────
  -- (20270208090000) Two tables hang off the person's own Passport rows
  -- through ON DELETE RESTRICT and carry no reference to auth.users, so
  -- neither the cascade of the hard-delete form nor the catalogue-driven
  -- passes of the erasure form ever reach them: sp_credential_details (a
  -- credential's metadata, keyed by claim) and sp_evidence_extractions (a
  -- machine reading of an uploaded document, keyed by evidence). Each kept
  -- its parent alive, and the erasure refused with ERASURE_INCOMPLETE for
  -- every holder of a credential with metadata or a read document. They are
  -- the person's own data and go first, read only from THIS person's claims
  -- and evidence. The extraction table's append-only guard releases exactly
  -- this account for exactly this caller (account_deletion_releases).
  WITH del AS (
    DELETE FROM public.sp_evidence_extractions x
     USING public.sp_evidence e
     WHERE x.evidence_id = e.id AND e.holder_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM del;
  IF _n > 0 THEN _dependents := _dependents || jsonb_build_object('sp_evidence_extractions', _n); END IF;

  WITH del AS (
    DELETE FROM public.sp_credential_details d
     USING public.sp_claims c
     WHERE d.claim_id = c.id AND c.holder_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM del;
  IF _n > 0 THEN _dependents := _dependents || jsonb_build_object('sp_credential_details', _n); END IF;

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
            'removed_dependents', _dependents,
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
    'removed_dependents', _dependents,
    'orphan_subjects_removed', coalesce(array_length(_orphan_subjects, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) TO authenticated, service_role;

COMMIT;
