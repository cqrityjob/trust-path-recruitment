-- Read-only. No dates inferred from advertisement archive, viewing or notes.
SELECT j.id job_id,j.employer_id,s.completion_state,s.completed_at,e.recruitment_retention_months,
 CASE WHEN s.completion_state<>'open' AND s.completed_at IS NOT NULL
 THEN (s.completed_at AT TIME ZONE 'UTC'+make_interval(months=>e.recruitment_retention_months)) AT TIME ZONE 'UTC' END purge_at,
 count(a.id) applications,
 count(a.id) FILTER(WHERE a.status IN('submitted','reviewing','interview')) active_applications,
 s.completed_at IS NULL AND (j.status='archived' OR s.completion_state<>'open') missing_date
FROM public.jobs j JOIN public.employers e ON e.id=j.employer_id
LEFT JOIN public.recruitment_settings s ON s.job_id=j.id
LEFT JOIN public.job_applications a ON a.job_id=j.id
GROUP BY j.id,j.employer_id,j.status,s.completion_state,s.completed_at,e.recruitment_retention_months;
SELECT employer_id,job_id,reason,attempts,rows_deleted_at,completed_at,last_error
 FROM public.recruitment_erasure_jobs WHERE completed_at IS NULL ORDER BY requested_at;
SELECT recruitment_erasure_job_id,count(*) FILTER(WHERE completed_at IS NULL) pending_files,
 count(*) FILTER(WHERE completed_at IS NULL AND last_error IS NOT NULL) failed_files
 FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id IS NOT NULL GROUP BY recruitment_erasure_job_id;
