# Job Intelligence — Rollback

## Phase A rollback

Phase A introduces new tables, functions, and triggers. It does not modify
any existing table, policy, function, or GRANT. Rollback is therefore a pure
drop of Phase A objects and is safe at any time.

Apply as a Supabase migration in the same account that owns the forward
migration:

```sql
-- Drop in reverse dependency order.
DROP TABLE IF EXISTS public.job_audit_events;
DROP TABLE IF EXISTS public.saved_jobs;
DROP TABLE IF EXISTS public.job_admin_meta;
DROP TRIGGER  IF EXISTS jobs_validate_before_write_tg ON public.jobs;
DROP FUNCTION IF EXISTS public.jobs_validate_before_write();
DROP TABLE IF EXISTS public.jobs;
DROP TABLE IF EXISTS public.employer_admin_meta;
DROP TABLE IF EXISTS public.employers;
DROP TABLE IF EXISTS public.job_import_sources;
DROP FUNCTION IF EXISTS public.assert_cig_family_id(text);
DROP FUNCTION IF EXISTS public.job_is_active(text, timestamptz, timestamptz, timestamptz);
```

After rolling back:

1. Set `VITE_JOBS_ENABLED=false` (default) — the `/jobs` route already falls
   back to the "Coming soon" page.
2. Delete `src/lib/job-intelligence/*` if desired (optional; unused code is
   harmless).
3. Regenerate `src/integrations/supabase/types.ts` after the drop migration
   applies.

## Rollback drill

To verify rollback safety before shipping subsequent phases:

1. Apply the forward migration on a dev database.
2. Apply the rollback migration above.
3. Query `pg_tables`, `pg_proc`, `pg_trigger` to confirm zero remaining
   Phase A objects.
4. Re-apply the forward migration. State should be identical.

## Data safety

Rollback drops all Phase A tables and their contents. Before rolling back a
production database, export any moderation history from `job_audit_events`
that must be retained — the audit rows go away with the table.
