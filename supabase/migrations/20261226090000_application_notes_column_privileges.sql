-- =============================================================================
-- Applications -- the employer's note is the employer's (JB-02), CONTRACT half
-- =============================================================================
--
-- Resolves JB-02 of docs/release/2026-09-28-release-uat-report.md together
-- with 20261223090000_application_notes_employer_only (the EXPAND half, which
-- must be applied first and whose functions the application must already be
-- reading through -- see "release order" in that file). This half is the
-- boundary itself: the two note columns stop being granted to `authenticated`.
--
-- ── PRECONDITION ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.rec_application_status_events(uuid)') IS NULL
     OR to_regprocedure('public.rec_application_employer_note(uuid)') IS NULL THEN
    RAISE EXCEPTION 'JB02_CONTRACT_PRECONDITION: 20261223090000 (the employer read functions) is not applied; revoking the columns now would leave the notes readable by nobody';
  END IF;
  -- rec_submit_application must already read named fields, not SELECT *:
  -- the EXPAND half re-created it so. A wildcard read would fail for the
  -- candidate the moment the grant below narrows.
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.rec_submit_application(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean,jsonb)'))
     LIKE '%SELECT * INTO _existing%' THEN
    RAISE EXCEPTION 'JB02_CONTRACT_PRECONDITION: rec_submit_application still reads the whole row; apply 20261223090000 first';
  END IF;
END $$;

-- ── 1. job_applications: everything but employer_note ───────────────────
REVOKE SELECT ON public.job_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, job_id, employer_id, applicant_user_id, status, phone, cover_note,
  cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
  consent_given_at, withdrawn_at, created_at, updated_at, cv_source,
  cv_document_id, cv_document_snapshot
) ON public.job_applications TO authenticated;

COMMENT ON COLUMN public.job_applications.employer_note IS
  'INTERNAL to the employer. Written by set_application_status() with an '
  'employer note; not granted to authenticated. Employer members and platform '
  'admins read it through rec_application_employer_note(); the applicant never does.';

-- ── 2. job_application_status_events: everything but note ───────────────
REVOKE SELECT ON public.job_application_status_events FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, application_id, job_id, employer_id, actor_user_id, actor_role,
  previous_status, new_status, created_at, notified_at, notify_error,
  notify_attempts
) ON public.job_application_status_events TO authenticated;

COMMENT ON COLUMN public.job_application_status_events.note IS
  'INTERNAL to the employer. The note given with a stage change; not granted '
  'to authenticated. Employer members and platform admins read it through '
  'rec_application_status_events(); the applicant sees the stage, never the note.';

-- ── 3. Postflight ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.job_applications', 'employer_note', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: authenticated can still read job_applications.employer_note';
  END IF;
  IF has_column_privilege('authenticated', 'public.job_application_status_events', 'note', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: authenticated can still read job_application_status_events.note';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.job_application_status_events', 'new_status', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: a candidate-visible column lost its grant';
  END IF;
  IF has_table_privilege('anon', 'public.job_applications', 'SELECT')
     OR has_table_privilege('anon', 'public.job_application_status_events', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: anon can read an application table';
  END IF;
  IF has_function_privilege('anon', 'public.rec_application_status_events(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: anon may execute the employer read';
  END IF;
  RAISE NOTICE 'JB02_PROOF ok: notes are not granted to authenticated; employer reads are membership-or-admin checked';
END $$;
