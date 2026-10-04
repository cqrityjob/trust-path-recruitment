-- R3, step 1: beta and test feedback older than 12 months. Counts only; changes nothing.
-- Run in the Supabase dashboard, SQL Editor. Write the two numbers in the execution log.
select 'beta_feedback' as source, count(*) as due, min(created_at) as oldest
  from public.beta_feedback
 where created_at < now() - interval '12 months'
union all
select 'cd_test_feedback', count(*), min(submitted_at)
  from public.cd_test_feedback
 where submitted_at < now() - interval '12 months';
