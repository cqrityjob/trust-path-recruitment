-- R3, step 2: delete beta and test feedback older than 12 months.
-- Only after the dry run, and only when its numbers are what you expect.
-- Run in the Supabase dashboard, SQL Editor. Write the two numbers in the execution log.
with b as (
  delete from public.beta_feedback
   where created_at < now() - interval '12 months'
  returning 1
), t as (
  delete from public.cd_test_feedback
   where submitted_at < now() - interval '12 months'
  returning 1
)
select (select count(*) from b) as beta_feedback_deleted,
       (select count(*) from t) as cd_test_feedback_deleted;
