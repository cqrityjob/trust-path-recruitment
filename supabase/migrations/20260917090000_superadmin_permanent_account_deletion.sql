-- =============================================================================
-- Superadmin permanent account deletion
--
-- WHAT CHANGED, AND WHY
--
-- admin_delete_user_if_safe() previously refused any account that had history:
-- an application, a membership, an employment record, assessment or Passport
-- evidence, a platform role, an audit trail, or a record it had acted on. In
-- practice that meant permanent deletion was reachable only for accounts that
-- had never been used, and the administrator's only real endings were disable
-- and anonymise.
--
-- The owner's decision is that history must no longer BLOCK a superadmin's
-- permanent deletion. It must be HANDLED. This migration does not build a
-- second lifecycle: it keeps the same function, the same impact report and the
-- same anonymisation vocabulary, and changes what happens to the rows that
-- used to be blockers.
--
-- THE RULE THE HANDLING FOLLOWS
--
-- Every row attached to the account is one of three things, and which one it
-- is decides what happens to it:
--
--   DELETE    The person's own data. It exists because they have an account,
--             and it has no meaning without one -- profile, consents, saved
--             jobs, career and discovery work, their Security Passport.
--
--   DETACH    A record another party is the controller of, or that carries
--             accountability for an act. It survives, with the person
--             unlinked and any personal free text pseudonymised -- an
--             employer's application record, an assessment assignment, a
--             disclosure access log, and every "who did this" actor column
--             across the platform.
--
--   PRESERVE  Already pseudonymous, or already unattributable. Nothing to do:
--             the Security Competency spine (scp_attempts and everything
--             hanging off scp_subjects) is keyed on a subject, not a person,
--             so unlinking the identity is the whole of the work. audit_logs
--             keeps its subject_id as text and is never touched.
--
-- SECURITY PASSPORT -- the boundary, stated explicitly
--
-- The holder's own Passport is DELETED with the account. That is not a new
-- policy invented here; it is the retention rule already written down in
-- docs/passport/privacy-processing-matrix.md, which gives the holder's own
-- Passport a retention of "Until holder withdraws" and gives the APPLICATION
-- DISCLOSURE a separate retention of "Employer's lawful recruitment record".
-- So the two halves are treated differently and deliberately:
--
--   sp_claims, sp_evidence, sp_experience_periods, sp_passport_profiles,
--   sp_passport_events, sp_verification_requests, sp_verification_decisions
--     -> DELETE. Permanent account deletion is the terminal withdrawal.
--
--   sp_disclosures, sp_disclosure_accesses
--     -> DETACH and keep. The record that this employer was shown this
--        package for this application, and how often it was opened, is the
--        employer's, not the holder's.
--
-- Nothing about that is silent: admin_user_deletion_impact() now itemises
-- every deleted Passport row by table and count BEFORE the administrator
-- confirms, and the audit row records the same counts afterwards. If the
-- owner's legal review later decides verified evidence must outlive the
-- holder, the change is to move those tables from the delete list to the
-- detach list here -- the function is written so that is the only edit.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Detachable records
--
-- Two tables have to be able to outlive the person they point at. Both keep a
-- NOT NULL invariant in a weaker but still meaningful form: the reference may
-- only be absent once the row has been explicitly marked detached, so a bug
-- that forgets to set an applicant or a holder is still refused.
-- -----------------------------------------------------------------------------

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS applicant_detached_at timestamptz;

ALTER TABLE public.job_applications ALTER COLUMN applicant_user_id DROP NOT NULL;

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_applicant_user_id_fkey;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_applicant_user_id_fkey
  FOREIGN KEY (applicant_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_applicant_present_chk;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_applicant_present_chk
  CHECK (applicant_user_id IS NOT NULL OR applicant_detached_at IS NOT NULL);

COMMENT ON COLUMN public.job_applications.applicant_detached_at IS
  'Set when the applicant account was permanently deleted. The application '
  'itself is the employer''s recruitment record and survives; the candidate''s '
  'personal fields are cleared at the same moment.';


ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS holder_detached_at timestamptz;

ALTER TABLE public.sp_disclosures ALTER COLUMN holder_user_id DROP NOT NULL;

ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_holder_user_id_fkey;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_holder_user_id_fkey
  FOREIGN KEY (holder_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- The disclosure points at a live claim. Deleting the holder's Passport must
-- not take the employer's access record with it, so the pointer is released
-- rather than followed.
ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_focus_claim_id_fkey;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_focus_claim_id_fkey
  FOREIGN KEY (focus_claim_id) REFERENCES public.sp_claims(id) ON DELETE SET NULL;

ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_holder_present_chk;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_holder_present_chk
  CHECK (holder_user_id IS NOT NULL OR holder_detached_at IS NOT NULL);

COMMENT ON COLUMN public.sp_disclosures.holder_detached_at IS
  'Set when the holder account was permanently deleted. The disclosure and its '
  'access log are the receiving employer''s record and survive the holder.';


-- -----------------------------------------------------------------------------
-- 2. Actor columns
--
-- Roughly forty-five "who did this" columns across the schema are already
-- nullable with ON DELETE SET NULL. Seven were not, and they were the real
-- reason a working account could not be deleted: an employer administrator who
-- had ever invited a candidate, recorded an interview note, approved a
-- publication or created an employee record was permanently undeletable.
--
-- The NOT NULL is dropped so the actor can be released. The RESTRICT and
-- NO ACTION delete rules are deliberately KEPT: a stray DELETE against
-- auth.users still refuses, and the only thing that may release an actor is
-- the deletion function below, which does it explicitly and counts it into the
-- audit record. A new actor column added later and forgotten will make that
-- function fail loudly rather than quietly lose the attribution.
-- -----------------------------------------------------------------------------

ALTER TABLE public.assessment_assignments        ALTER COLUMN assigned_by  DROP NOT NULL;
ALTER TABLE public.employees                     ALTER COLUMN created_by   DROP NOT NULL;
ALTER TABLE public.scp_assessment_invitations    ALTER COLUMN invited_by   DROP NOT NULL;
ALTER TABLE public.scp_employer_report_decisions ALTER COLUMN decided_by   DROP NOT NULL;
ALTER TABLE public.scp_interview_notes           ALTER COLUMN recorded_by  DROP NOT NULL;
ALTER TABLE public.scp_publication_approvals     ALTER COLUMN approved_by  DROP NOT NULL;
ALTER TABLE public.scp_training_assignments      ALTER COLUMN assigned_by  DROP NOT NULL;


-- -----------------------------------------------------------------------------
-- 2b. Records that are never edited, and the actor named on them
--
-- This schema does not defend its records with foreign keys alone. Triggers
-- make an interview note, an employer decision, a rubric score, a competency
-- evidence row, a completed human review, a Passport event and a verification
-- decision APPEND-ONLY, and make an assessment assignment and a graph version
-- fixed at creation. Those guards are the real reason a working account could
-- not be deleted -- not the foreign keys.
--
-- Two of the existing guards already answer the question this migration is
-- asking. sp_guard_events_append_only() and sp_guard_decisions_append_only()
-- both permit a DELETE precisely when the holder's auth.users row is already
-- gone, and permit an UPDATE never. That is the schema's own rule, written
-- before this migration existed:
--
--     an append-only record is deleted with the person, never edited.
--
-- This migration follows that rule rather than inventing a second one.
--
--   * Where the person is the SUBJECT of an append-only record, the record is
--     deleted with them. Nothing here is needed -- the cascade does it, and
--     the two guards above already let it through.
--
--   * Where the person is merely the ACTOR named on a record that BELONGS TO
--     SOMEBODY ELSE, the record must survive and must not be rewritten. So the
--     foreign key is dropped and the actor's id stays on the row exactly as it
--     was written. The account it referred to no longer exists, which is what
--     makes the id pseudonymous; the audit row for the deletion is the only
--     place that still maps it to a person, which is precisely where an
--     accountability record belongs.
--
-- The alternative -- teaching ten guards to allow the actor to be nulled --
-- was rejected. It would mean editing append-only records to erase who acted,
-- which is the one thing every one of those guards exists to prevent, and it
-- would lose the attribution rather than pseudonymise it.
--
-- Only the columns below are affected. Every other actor column in the schema
-- keeps its foreign key and is released to NULL as before, because the record
-- it sits on is editable and dropping the attribution there is the existing,
-- already-tested behaviour.
-- -----------------------------------------------------------------------------

ALTER TABLE public.assessment_assignments
  DROP CONSTRAINT IF EXISTS assessment_assignments_assigned_by_fkey;
ALTER TABLE public.graph_versions
  DROP CONSTRAINT IF EXISTS graph_versions_created_by_fkey;
ALTER TABLE public.scp_competency_evidence
  DROP CONSTRAINT IF EXISTS scp_competency_evidence_assessor_actor_id_fkey;
ALTER TABLE public.scp_employer_report_decisions
  DROP CONSTRAINT IF EXISTS scp_employer_report_decisions_decided_by_fkey;
ALTER TABLE public.scp_employer_reviewers
  DROP CONSTRAINT IF EXISTS scp_employer_reviewers_granted_by_fkey;
ALTER TABLE public.scp_employer_reviewers
  DROP CONSTRAINT IF EXISTS scp_employer_reviewers_revoked_by_fkey;
ALTER TABLE public.scp_human_reviews
  DROP CONSTRAINT IF EXISTS scp_human_reviews_reviewer_actor_id_fkey;
ALTER TABLE public.scp_interview_notes
  DROP CONSTRAINT IF EXISTS scp_interview_notes_recorded_by_fkey;
ALTER TABLE public.scp_review_rubric_scores
  DROP CONSTRAINT IF EXISTS scp_review_rubric_scores_scored_by_fkey;
ALTER TABLE public.sp_passport_events
  DROP CONSTRAINT IF EXISTS sp_passport_events_actor_user_id_fkey;
ALTER TABLE public.sp_verification_decisions
  DROP CONSTRAINT IF EXISTS sp_verification_decisions_decided_by_fkey;

-- The register of what that decision covers.
--
-- Dropping a foreign key makes those columns invisible to the catalogue scan
-- the impact report and the deletion function both run, which is convenient --
-- neither tries to touch them any more -- but it would also make them
-- invisible to the ADMINISTRATOR, and "preserved, verbatim, with the actor id
-- intact" is exactly the sort of thing the confirmation dialog must say out
-- loud. So the set is written down here, counted in the impact report, and
-- recorded in the audit row.
--
-- Adding a row here is also the deliberate step a future immutable table has
-- to take. Skipping it does not cause silent data loss: the new table's own
-- guard refuses, and the deletion rolls back.
CREATE TABLE IF NOT EXISTS public.account_deletion_preserved_actors (
  table_name  text NOT NULL,
  column_name text NOT NULL,
  rationale   text NOT NULL,
  PRIMARY KEY (table_name, column_name)
);

ALTER TABLE public.account_deletion_preserved_actors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_preserved_actors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_preserved_actors TO service_role;

COMMENT ON TABLE public.account_deletion_preserved_actors IS
  'The actor columns that survive a permanent account deletion with their value '
  'intact, because the record they sit on is append-only or fixed at creation '
  'and must not be rewritten. Read by admin_user_deletion_impact() so the '
  'administrator sees them before confirming. See migration 20260917090000.';

INSERT INTO public.account_deletion_preserved_actors (table_name, column_name, rationale) VALUES
  ('assessment_assignments','assigned_by','an assignment is fixed at creation'),
  ('graph_versions','created_by','governance archive, never edited or deleted'),
  ('scp_competency_evidence','assessor_actor_id','evidence is append-only'),
  ('scp_employer_report_decisions','decided_by','an employer decision is append-only'),
  ('scp_employer_reviewers','granted_by','a reviewer grant records who granted it'),
  ('scp_employer_reviewers','revoked_by','a reviewer grant records who revoked it'),
  ('scp_human_reviews','reviewer_actor_id','a completed review is immutable'),
  ('scp_interview_notes','recorded_by','an interview note is append-only'),
  ('scp_review_rubric_scores','scored_by','a recorded rubric level is append-only'),
  ('sp_passport_events','actor_user_id','passport history is append-only'),
  ('sp_verification_decisions','decided_by','a verification decision is append-only')
ON CONFLICT (table_name, column_name) DO UPDATE SET rationale = EXCLUDED.rationale;


-- -----------------------------------------------------------------------------
-- 2c. The one guard that does need to change
--
-- An assessment assignment is the employer's record of having assessed
-- someone, and it survives the person. But unlike the records above, the
-- person is its SUBJECT, not its actor: recipient_email is their address, and
-- leaving it in place would leave personal data behind on a retained record.
-- It has to be pseudonymised, and the immutability guard has to be told that
-- this specific change is allowed.
--
-- The exception is narrow on three counts, all of which must hold at once:
--
--   1. a permanent deletion is running in THIS transaction and names exactly
--      the account the row points at -- a transaction-local setting, set
--      nowhere else in the schema, which cannot leak into another statement or
--      another session;
--   2. the caller is a superadmin, checked here again rather than assumed;
--   3. nothing moved except the recipient columns.
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
  'True only while admin_delete_user_if_safe() is deleting exactly this '
  'account, in this transaction, for a caller who is a superadmin. The setting '
  'it reads is transaction-local and is set nowhere else in the schema.';

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

-- Re-declared with its original security posture: SECURITY INVOKER, pinned
-- search_path, EXECUTE revoked from PUBLIC. Only the exception at the top is
-- new. The privilege it needs is inside account_deletion_releases(), which is
-- SECURITY DEFINER precisely so this guard does not have to be.
CREATE OR REPLACE FUNCTION public.assessment_assignments_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Permanent deletion of the person this assignment was sent to, and nothing
  -- else, may pseudonymise the address it was sent to.
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


-- -----------------------------------------------------------------------------
-- 3. The impact report, re-cut along the three outcomes
--
-- Same function, same caller, same read-only contract. What changes is that
-- the report no longer exists to say "no": it exists to say what will happen.
-- The catalogue-driven scan is kept exactly as it was -- both halves are still
-- read from pg_constraint at call time, so the report cannot drift from the
-- schema -- and is now split three ways instead of two.
--
--   deleted     rows that go, by table and count
--   detached    rows that survive with the person released, by table and count
--   preserved   named spines that are untouched, with their counts
--   blockers    RETAINED, and still computed exactly as before, but now
--               ADVISORY. The UI shows it as "this is what history exists";
--               'deletable' is what it always was, and no longer gates
--               anything. Removing either would silently change what an older
--               deployed client renders.
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

  -- Every FK to auth.users that REFUSES the delete (NO ACTION / RESTRICT).
  -- These are the actor columns, and they are what the deletion function
  -- releases by hand. Read from the catalogue so the report cannot drift.
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
      _detached := _detached || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- Every FK that RELEASES the person (SET NULL): the record survives without
  -- them. Same catalogue, same guarantee.
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

  -- Every FK that CASCADES: the row goes with the person.
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
      _deleted := _deleted || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- The pseudonymous spine. Nothing here is keyed on the person, so nothing
  -- here is deleted or rewritten -- but the administrator should see that it
  -- is what survives, and how much of it there is.
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

  -- The append-only records that keep the actor id they were written with.
  -- Their foreign keys were dropped deliberately, so the catalogue scans above
  -- cannot see them; this is the only place they are counted.
  FOR _rec IN
    SELECT r.table_name AS tbl, r.column_name AS col
      FROM public.account_deletion_preserved_actors r
     WHERE to_regclass('public.' || r.table_name) IS NOT NULL
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', _rec.tbl, _rec.col)
      INTO _n USING _user_id;
    IF _n > 0 THEN
      _preserved := _preserved || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
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
    -- Kept for an older deployed client. A superadmin's permanent deletion no
    -- longer consults either of these.
    'deletable', jsonb_array_length(_blockers) = 0,
    'blockers', _blockers,
    'acted_on', _acted,
    'removed_on_delete', _removed,
    -- The three outcomes the confirmation dialog actually renders.
    'deleted', _deleted,
    'detached', _detached,
    'preserved', _preserved,
    'has_history', jsonb_array_length(_blockers) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_deletion_impact(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_user_deletion_impact(uuid) IS
  'Platform-admin-only, read-only. Reports what a permanent deletion would do '
  'to this account, split three ways: deleted, detached and preserved. Every '
  'one of the three is read from pg_constraint at call time, so the report '
  'cannot drift from the schema. blockers/deletable are retained for older '
  'clients and are advisory only -- a superadmin''s deletion no longer '
  'consults them.';


-- -----------------------------------------------------------------------------
-- 4. Permanent deletion
--
-- Superadmin only, irreversible, and now unconditional on history. The whole
-- sequence is one function and therefore one transaction: if any step raises,
-- Postgres rolls the entire operation back and the account is exactly as it
-- was. There is no partial state to clean up and no second call for a client
-- to get wrong.
--
-- ORDER, and why it is this order:
--   1  authenticate, authorise, refuse self-deletion
--   2  lock the account row, so two concurrent deletions cannot interleave
--   3  require the typed address, unchanged
--   4  compute the impact -- now for the RECORD, not for permission
--   5  detach and pseudonymise the records that must survive
--   6  release every actor column, from the catalogue
--   7  write the audit row, while the account still exists to be described
--   8  unlink the pseudonymous subject and drop it only if it is orphaned
--   9  delete the account; every DELETE-side cascade fires here
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
  _pseudonym text;
  _rec record;
  _n bigint;
  _released jsonb := '{}'::jsonb;
  _anonymised jsonb := '{}'::jsonb;
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

  -- The last active superadmin cannot be deleted, for the same reason they
  -- cannot be disabled: it would lock the platform out of its own role
  -- management. This is the only remaining refusal on the data.
  IF public.is_superadmin(_user_id) THEN
    IF (SELECT count(*) FROM public.user_roles r
          JOIN auth.users u ON u.id = r.user_id
         WHERE r.role = 'superadmin' AND r.user_id <> _user_id
           AND (u.banned_until IS NULL OR u.banned_until < now())) < 1 THEN
      RAISE EXCEPTION 'LAST_SUPERADMIN_PROTECTED: cannot delete the only remaining active superadmin.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- For the record, not for permission. Computed before anything is touched,
  -- so the audit row describes the account as it was at the moment of the
  -- decision.
  _impact := public.admin_user_deletion_impact(_user_id);

  _pseudonym := 'raderad+' || _user_id::text || '@removed.invalid';

  -- Announce the deletion to the immutability guards, transaction-locally.
  -- Nothing else in the schema sets this, and it disappears when the
  -- transaction ends however it ends.
  PERFORM set_config('trustpath.deleting_account', _user_id::text, true);

  -- ── Detach and pseudonymise what must survive ────────────────────────────

  -- The employer's recruitment record. The application, its status history and
  -- any disclosure made for it stay; the candidate's own contribution to it --
  -- their phone number, covering note and CV -- does not. The CV FILE itself
  -- lives in Storage and is not reachable from SQL; the path is cleared here
  -- so nothing points at it, and the object is swept separately.
  WITH upd AS (
    UPDATE public.job_applications
       SET applicant_user_id = NULL,
           applicant_detached_at = now(),
           phone = NULL,
           cover_note = NULL,
           cv_storage_path = NULL,
           cv_original_filename = NULL,
           cv_mime_type = NULL,
           cv_size_bytes = NULL,
           updated_at = now()
     WHERE applicant_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('job_applications', _n); END IF;

  -- The disclosure and its access log belong to the employer that received it.
  WITH upd AS (
    UPDATE public.sp_disclosures
       SET holder_user_id = NULL,
           holder_detached_at = now(),
           recipient_hint = NULL
     WHERE holder_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('sp_disclosures', _n); END IF;

  -- An assessment assignment is the employer's record of having assessed
  -- someone. recipient_user_id is released by the foreign key; the address it
  -- was sent to is the remaining identifier and is pseudonymised here.
  WITH upd AS (
    UPDATE public.assessment_assignments
       SET recipient_email = _pseudonym
     WHERE recipient_user_id = _user_id
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('assessment_assignments', _n); END IF;

  -- The same for a Security Competency invitation, which additionally carries
  -- the name the employer typed.
  WITH upd AS (
    UPDATE public.scp_assessment_invitations i
       SET email = _pseudonym, invited_name = NULL
     WHERE i.bound_subject_id IN
             (SELECT subject_id FROM public.scp_subject_identities WHERE user_id = _user_id)
        OR lower(i.email) = lower(_email)
    RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  IF _n > 0 THEN _anonymised := _anonymised || jsonb_build_object('scp_assessment_invitations', _n); END IF;

  -- ── Release every actor column ───────────────────────────────────────────
  --
  -- Read from pg_constraint, exactly as the impact report reads it, so the two
  -- can never disagree and a newly added actor column is handled the day it
  -- appears. A column that is still NOT NULL raises here and rolls the whole
  -- deletion back -- which is the intended outcome, not a bug to work around.
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
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', _rec.tbl, _rec.col, _rec.col)
      USING _user_id;
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN
      _released := _released || jsonb_build_object(_rec.tbl || '.' || _rec.col, _n);
    END IF;
  END LOOP;

  -- ── The record of the deletion ───────────────────────────────────────────
  -- Written while the account still exists, and keyed on the old id as text so
  -- it survives the account it describes.
  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', 'user_deleted', 'user', _user_id::text,
          jsonb_build_object(
            'email', _email,
            'reason', _clean_reason,
            'deleted', _impact -> 'deleted',
            'detached', _impact -> 'detached',
            'preserved', _impact -> 'preserved',
            'anonymised', _anonymised,
            'actors_released', _released,
            'had_history', _impact -> 'has_history',
            -- Retained under its old name so an existing audit reader keeps
            -- working; it is the same thing as 'deleted'.
            'removed', _impact -> 'deleted'));

  -- ── The pseudonymous spine ───────────────────────────────────────────────
  -- The identity link goes. The subject and everything hanging off it stays,
  -- now unattributable -- unless the subject would be left with nothing at
  -- all, in which case it is an orphan and is removed too.
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

  -- ── The account ──────────────────────────────────────────────────────────
  -- Every remaining cascade fires here: the profile, the consents, the saved
  -- jobs, the career and discovery work, and the holder's own Security
  -- Passport. The address is free the moment this returns.
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'deleted', true,
    'email_released', _email,
    'removed', _impact -> 'deleted',
    'detached', _impact -> 'detached',
    'preserved', _impact -> 'preserved',
    'anonymised', _anonymised,
    'actors_released', _released,
    'orphan_subjects_removed', coalesce(array_length(_orphan_subjects, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_delete_user_if_safe(uuid, text, text) IS
  'Superadmin-only, irreversible, atomic. Permanently deletes an account '
  'REGARDLESS of history: records the person owns are deleted, records another '
  'party controls are detached and pseudonymised, and the pseudonymous '
  'Security Competency spine and the audit log are preserved untouched. '
  'Requires the account email as typed confirmation. Refuses only self-deletion '
  'and the last active superadmin. The account''s email address is free for a '
  'brand-new registration the moment it returns. The name is historical -- see '
  'the 20260917090000 migration for the delete/detach/preserve rule.';
