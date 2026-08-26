-- Deleting a draft advertisement, and refusing to delete anything else.
--
-- ── WHY A FUNCTION AND NOT A DELETE POLICY ──────────────────────────────
--
-- A customer asked why "Stäng" put an advertisement in the archive instead of
-- removing it, and why there was no way to get rid of a draft she had created
-- by mistake. There is no way because `jobs` has no DELETE policy for an
-- employer at all -- only jobs_admin_write, which is ALL for administrators.
--
-- The obvious fix is a jobs_employer_delete_own policy. It is also the wrong
-- one, and dangerously so:
--
--     job_applications.job_id  REFERENCES jobs(id) ON DELETE CASCADE
--     job_application_status_events.job_id             ON DELETE CASCADE
--     saved_jobs.job_id                                ON DELETE CASCADE
--
-- A row-level policy grants the verb; it cannot express "only when nothing
-- depends on this". So an employer who deleted a job that had ever received an
-- application would take every application, every status event and every saved
-- bookmark with it, silently, with no error and nothing in the audit trail but
-- the disappearance. That is a candidate's own record of having applied, and
-- it is not the employer's to erase.
--
-- The guard therefore lives in one SECURITY DEFINER function that states every
-- condition out loud, and no broad DELETE policy is introduced.
--
-- ── WHAT MAY BE DELETED ─────────────────────────────────────────────────
--
--   status = 'draft'          it is not, and never became, a live posting
--   published_at IS NULL      and it was never published even once
--   no applications           nothing of anyone else's rides along
--   no assessment assignments nothing was set in motion from it
--   no invitations            likewise
--
-- The published_at test is the one that is easy to leave out and matters most.
-- restoreEmployerJob moves an archived advertisement back to 'draft', so a job
-- that WAS published, collected applications and was later closed can be
-- sitting at status 'draft' with a full history behind it. Status alone would
-- have called that a draft and cascaded the history away.
--
-- Everything else -- published, previously published, pending review, expired,
-- rejected -- is closed instead, which is a status change and loses nothing.
--
-- Forward-only. Remediation: DROP FUNCTION public.jobs_delete_draft(uuid, uuid).
-- No existing row is read or written by this migration itself.

CREATE OR REPLACE FUNCTION public.jobs_delete_draft(
  _employer_id uuid,
  _job_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _job public.jobs%ROWTYPE;
BEGIN
  -- Same membership rule every other employer write uses. Deliberately not
  -- role-restricted beyond active membership: creating a draft needs no
  -- special role, so neither does discarding one.
  IF NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.user_id = auth.uid()
       AND m.employer_id = _employer_id
       AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'JOB_NOT_AUTHORISED: you are not an active member of this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tenant isolation is in the WHERE clause, not in a later check: a job id
  -- from another organisation must not even be loaded.
  SELECT * INTO _job FROM public.jobs
   WHERE id = _job_id AND employer_id = _employer_id;

  IF _job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: no such advertisement in this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  IF _job.status <> 'draft' OR _job.published_at IS NOT NULL THEN
    RAISE EXCEPTION
      'JOB_NOT_DELETABLE: only a draft that was never published can be deleted. Close it instead.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The cascade guard. Each of these would be destroyed by the DELETE below
  -- without raising anything, so each is refused explicitly.
  IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = _job_id) THEN
    RAISE EXCEPTION
      'JOB_HAS_APPLICATIONS: this advertisement has applications and cannot be deleted. Close it instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.assessment_assignments s WHERE s.job_id = _job_id) THEN
    RAISE EXCEPTION
      'JOB_HAS_ASSIGNMENTS: assessments were assigned from this advertisement. Close it instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_assessment_invitations i WHERE i.job_id = _job_id) THEN
    RAISE EXCEPTION
      'JOB_HAS_INVITATIONS: candidates were invited from this advertisement. Close it instead.'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.jobs WHERE id = _job_id AND employer_id = _employer_id;

  RETURN _job_id;
END; $function$;

-- Hosted grants EXECUTE to anon by default on every new public function, so
-- the REVOKE is not optional and is not a tidy-up.
REVOKE ALL ON FUNCTION public.jobs_delete_draft(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jobs_delete_draft(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.jobs_delete_draft(uuid, uuid) IS
  'Permanently deletes a draft advertisement that was never published and has '
  'no applications, assignments or invitations. Every other advertisement is '
  'closed instead. Exists as a function rather than a DELETE policy because '
  'job_applications cascades from jobs, and a policy cannot say "only when '
  'nothing depends on this".';