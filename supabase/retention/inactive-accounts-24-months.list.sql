-- R2: accounts that have not signed in for 24 months (or never signed in and were
-- created 24 months ago). A list only; changes nothing. Run quarterly in the
-- Supabase dashboard, SQL Editor. For each row: send the reminder from info@, write
-- the date in the execution log, and 30 days later close the account through the
-- admin console if the person has not signed in (runbook R1).
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at,
       coalesce(u.last_sign_in_at, u.created_at) as inactive_since
  from auth.users u
 where coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 months'
 order by inactive_since;
