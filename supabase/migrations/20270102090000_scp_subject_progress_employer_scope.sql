-- =============================================================================
-- P0 -- an employer reads only its own reports in the progress series
-- =============================================================================
--
-- THE DEFECT (2026-10-02 pre-launch hostile-user audit, P0-1, reproduced on
-- hosted production in a rolled-back probe):
--
--   scp_subject_progress(_subject_id) chooses an audience, then returns EVERY
--   snapshot of that audience for the subject. Its employer branch is entered
--   by any active member of ANY organisation that has one released attempt for
--   the subject -- and then it returned the employer-audience snapshots of
--   EVERY organisation, not only the caller's. A member of employer A, not a
--   member of B, read 13 rows of which 4 came from B's employer reports:
--   competency evidence state, observation and safety-flag counts, attempt id
--   and release date. The employer report page calls it in normal use
--   (getSubjectProgress), and two such caller/subject pairs exist on hosted
--   production.
--
--   scp_report_snapshots' own RLS already states the right rule
--   (scp_report_snapshot_readable): an employer document is readable by an
--   active member of THE organisation that commissioned it. The function is
--   SECURITY DEFINER, so that rule was never applied to it.
--
-- THE FIX: every row the function returns passes scp_report_snapshot_readable
-- -- the same predicate the table's policies use -- so the progress series
-- shows exactly the snapshots the caller could read directly, and nothing
-- else. The audience selection, the columns and the ordering are unchanged. A
-- participant still sees their own participant series; an employer member
-- sees only its own organisation's employer series; a member of two
-- organisations sees both of theirs.
--
-- NOT CHANGED: scp_report_snapshot_readable, the snapshot table, its policies,
-- grants, the report RPCs, any row.
--
-- Rollback: supabase/rollback/20270102090000_scp_subject_progress_employer_scope_rollback.sql
-- Suite:    supabase/tests/scp_subject_progress_scope_test.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.scp_subject_progress(uuid)') IS NULL
     OR to_regprocedure('public.scp_report_snapshot_readable(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'SCP_PROGRESS_SCOPE_PRECONDITION: scp_subject_progress or scp_report_snapshot_readable is missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
 RETURNS TABLE(released_at timestamp with time zone, attempt_id uuid, competency_code text, competency_name_sv text, competency_name_en text, evidence_state text, observations integer, safety_flag_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _audience text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_subject_identities si
              WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    _audience := 'participant';
  ELSIF EXISTS (SELECT 1 FROM public.scp_attempts a
                  JOIN public.employer_memberships m
                    ON m.employer_id = a.issuer_organization_id
                   AND m.user_id = auth.uid() AND m.status = 'active'
                 WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL) THEN
    _audience := 'employer';
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'evidence_state', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
     AND s.audience = _audience
     -- 20270102090000: only snapshots the caller could read directly. For the
     -- employer audience that is the caller's own organisations' documents;
     -- another employer's report never leaves through this function.
     AND public.scp_report_snapshot_readable(s.audience, s.subject_id, s.issuer_organization_id)
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$;

COMMENT ON FUNCTION public.scp_subject_progress(uuid) IS
  'Released progress series for a subject. Participant: their own participant '
  'snapshots. Employer member: only the employer snapshots of organisations the '
  'caller is an active member of (scp_report_snapshot_readable, since '
  '20270102090000). Never another organisation''s report.';

REVOKE ALL ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;

DO $$
BEGIN
  IF position('scp_report_snapshot_readable' IN
       (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_subject_progress(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_PROGRESS_SCOPE_PROOF: scp_subject_progress does not filter by scp_report_snapshot_readable';
  END IF;
  IF has_function_privilege('anon', 'public.scp_subject_progress(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_PROGRESS_SCOPE_PROOF: anon may execute scp_subject_progress';
  END IF;
  RAISE NOTICE 'SCP_PROGRESS_SCOPE_PROOF ok: the progress series returns only snapshots the caller may read';
END $$;
