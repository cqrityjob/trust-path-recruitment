-- R2: accounts that have not signed in for 24 months (or never signed in and were
-- created 24 months ago). A list only; changes nothing. Run quarterly in the
-- Supabase dashboard, SQL Editor. For each row: send the reminder from info@, write
-- the date in the execution log, and 30 days later close the account through the
-- admin console if the person has not signed in (runbook R1).
-- An account that has already been erased (it stays as a pseudonymised, disabled
-- row, recorded in public.deleted_accounts, address raderad+<id>@removed.invalid)
-- or anonymised (address anonymised+<id>@removed.invalid) is not listed. A suspended
-- account is listed with suspended = true: send no reminder, raise it with the owner.
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at,
       coalesce(u.last_sign_in_at, u.created_at) as inactive_since,
       coalesce(u.banned_until > now(), false) as suspended
  from auth.users u
 where coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 months'
   and not exists (select 1 from public.deleted_accounts d where d.user_id = u.id)
   and coalesce(u.email, '') not like 'raderad+%@removed.invalid'
   and coalesce(u.email, '') not like 'anonymised+%@removed.invalid'
 order by inactive_since;
