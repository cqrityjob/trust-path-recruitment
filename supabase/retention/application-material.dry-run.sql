-- SELECT only. Production caller must wrap in BEGIN TRANSACTION READ ONLY / COMMIT.
-- No lifecycle RPC, inferred dates, candidate content or Storage paths.
-- Snapshot, not approval: rerun immediately before enabling either mechanism.
WITH scopes AS MATERIALIZED (
 SELECT j.id job_id,j.employer_id,coalesce(s.completion_state,'open') completion_state,
  s.completed_at,e.recruitment_retention_months,
  CASE WHEN s.completion_state<>'open' AND s.completed_at IS NOT NULL
   THEN (s.completed_at AT TIME ZONE 'UTC'+make_interval(months=>e.recruitment_retention_months)) AT TIME ZONE 'UTC' END purge_at,
  public.job_is_active(j.status,j.published_at,j.deadline_at,j.expires_at) advertisement_active,
  count(a.id) applications,
  count(a.id) FILTER(WHERE a.status IN('submitted','reviewing','interview')) active_applications,
  s.completed_at IS NULL AND (j.status IN ('expired','archived') OR coalesce(s.completion_state,'open')<>'open') missing_date,
  count(DISTINCT a.cv_storage_path) cv_paths,
  count(DISTINCT a.cv_storage_path) FILTER(WHERE EXISTS(
   SELECT 1 FROM public.job_applications other
   WHERE other.cv_storage_path=a.cv_storage_path AND other.job_id<>j.id)) shared_cv_paths
 FROM public.jobs j JOIN public.employers e ON e.id=j.employer_id
 LEFT JOIN public.recruitment_settings s ON s.job_id=j.id
 LEFT JOIN public.job_applications a ON a.job_id=j.id
 GROUP BY j.id,j.employer_id,j.status,j.published_at,j.deadline_at,j.expires_at,
  s.completion_state,s.completed_at,e.recruitment_retention_months
), eligible AS MATERIALIZED (
 SELECT * FROM scopes s WHERE purge_at<=now() AND applications>0
  AND active_applications=0 AND NOT advertisement_active
  AND NOT EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs q WHERE q.job_id=s.job_id AND q.completed_at IS NULL)
), pending AS MATERIALIZED (
 SELECT q.id,q.employer_id,q.job_id,q.reason,cardinality(q.application_ids) applications,
  q.requested_at,q.next_attempt_at,q.lease_until,q.attempts,q.rows_deleted_at,
  substring(q.last_error from 'RETENTION_[A-Z_]+') error_code,
  (SELECT count(*) FROM public.storage_erasure_queue f
   WHERE f.recruitment_erasure_job_id=q.id AND f.completed_at IS NULL) pending_files,
  (SELECT count(*) FROM public.storage_erasure_queue f
   WHERE f.recruitment_erasure_job_id=q.id AND f.completed_at IS NULL AND f.last_error IS NOT NULL) failed_files
 FROM public.recruitment_erasure_jobs q WHERE q.completed_at IS NULL
), claimable AS MATERIALIZED (
 SELECT * FROM pending WHERE next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())
 ORDER BY next_attempt_at,requested_at LIMIT 10
)
SELECT jsonb_build_object(
 'checkedAt',now(),'timezone',current_setting('TimeZone'),
 'automaticEnabled',(SELECT enabled FROM recruitment_erasure.activation WHERE singleton),
 'summary',jsonb_build_object(
  'recruitments',(SELECT count(*) FROM scopes),'applications',(SELECT coalesce(sum(applications),0) FROM scopes),
  'completedWithDate',(SELECT count(*) FROM scopes WHERE completion_state<>'open' AND completed_at IS NOT NULL),
  'missingCompletionDate',(SELECT count(*) FROM scopes WHERE missing_date),
  'missingDateApplications',(SELECT coalesce(sum(applications),0) FROM scopes WHERE missing_date),
  'dueByDate',(SELECT count(*) FROM scopes WHERE purge_at<=now()),
  'automaticEligible',(SELECT count(*) FROM eligible),
  'pendingManual',(SELECT count(*) FROM pending WHERE reason='employer_request'),
  'pendingAutomatic',(SELECT count(*) FROM pending WHERE reason='automatic_retention'),
  'pendingFiles',(SELECT coalesce(sum(pending_files),0) FROM pending),
  'failedFiles',(SELECT coalesce(sum(failed_files),0) FROM pending),
  'blockedJobs',(SELECT count(*) FROM pending WHERE error_code IN
   ('RETENTION_UNMAPPED_OR_SHARED_DEPENDENCY','RETENTION_SHARED_MATERIAL_REQUIRES_HANDLING','RETENTION_DEPENDENCY_BLOCKED','RETENTION_UNMAPPED_PRIMARY_KEY','RETENTION_GRAPH_TOO_DEEP'))),
 'scopes',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY job_id) FROM scopes s),'[]'::jsonb),
 'pendingJobs',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY next_attempt_at,requested_at) FROM pending p),'[]'::jsonb),
 'manualModeFirstClaims',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY next_attempt_at,requested_at) FROM claimable c),'[]'::jsonb),
 'automaticFirstEnqueueCandidates',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY completed_at) FROM
  (SELECT * FROM eligible ORDER BY completed_at LIMIT 10) c),'[]'::jsonb),
 'dependencyAssessment','Existing blocked jobs only. Eligible scopes need a separate read-only dependency assessment before approval; zero eligible scopes means no first-run dependencies.',
 'workerLimits',jsonb_build_object('enqueue',10,'claims',10,'filesPerClaim',100)
) AS report;
