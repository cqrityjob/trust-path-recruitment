# Beta test data — labelling convention and cleanup

H3.4 (Closed Beta Readiness) does not create any real accounts, employers,
jobs, or applications in Lovable Cloud — every fixture used to validate
this phase lived only in disposable, local Postgres 16 clusters
(`tests/database/phase-h3-4a/`, `tests/database/phase-h3-4b/`), which were
torn down after each test run. **No beta test data exists in the live
project as a result of this phase.**

This document defines the convention beta testers/operators should follow
*going forward*, so that whatever real test data does get created during
the actual closed beta can always be identified and safely removed
afterward, without touching real candidate, employer, or job data.

## Convention

Any account, employer, or job created specifically to test the platform
(as opposed to a real candidate/employer/admin using it) must be
identifiable by **all** of the following:

1. **Email domain**: use `+beta-test@` in the local part or a dedicated
   test domain, e.g. `firstname+beta-test@example.com` or
   `firstname@betatest.cqrityjob.invalid`. Never reuse a real personal or
   company email for test data.
2. **Employer name prefix**: `[BETA TEST] ` prepended to the company name,
   e.g. `[BETA TEST] Fictional Security AB`.
3. **Job title prefix**: `[BETA TEST] ` prepended to both `title_sv` and
   `title_en`, e.g. `[BETA TEST] Väktare`.
4. **Application cover note marker**: test applications should include the
   literal string `BETA-TEST-DATA` somewhere in the cover note, so a
   cleanup query can find them even if the job/employer prefix is missed.

This mirrors the exact synthetic-fixture convention already used
throughout this repository's own local database tests (`example.invalid`
email domains, `Fictional ...` employer names) — the same discipline,
applied to the live environment instead of a disposable local cluster.

## Safe cleanup queries

Run these against Lovable Cloud's SQL editor (or via the Supabase CLI)
**only after confirming with the beta operator that the listed rows are
genuinely test data** — always `SELECT` first, never jump straight to
`DELETE`.

```sql
-- 1. Find candidate test data via applications.
SELECT id, job_id, applicant_user_id, cover_note, created_at
FROM public.job_applications
WHERE cover_note ILIKE '%BETA-TEST-DATA%';

-- 2. Find test employers.
SELECT id, slug, name, created_at
FROM public.employers
WHERE name ILIKE '[BETA TEST]%';

-- 3. Find test jobs.
SELECT id, slug, title_sv, title_en, employer_id, created_at
FROM public.jobs
WHERE title_sv ILIKE '[BETA TEST]%' OR title_en ILIKE '[BETA TEST]%';

-- 4. Find test auth accounts (requires the Auth Admin API or the
--    Supabase dashboard's Users view -- auth.users is not directly
--    queryable via the SQL editor in the same way).
--    Filter by email LIKE '%+beta-test@%' OR email LIKE '%@betatest.%'.
```

**Deletion order matters** (foreign keys cascade from `jobs`/`employers`
down to `job_applications`/`job_application_status_events`, but not
upward):

1. Delete matching `job_applications` rows first (or rely on
   `ON DELETE CASCADE` from step 3, which will remove them automatically).
2. Delete matching `jobs` rows.
3. Delete matching `employers` rows (cascades to `employer_memberships`,
   `jobs`, `job_admin_meta`).
4. Delete the corresponding `auth.users` rows last, via the Supabase
   dashboard's Auth → Users panel (or `supabaseAdmin.auth.admin.deleteUser`)
   — never via a raw SQL `DELETE` against `auth.users`.
5. Storage cleanup: any CV uploaded by a test application lives at
   `job-application-cvs/<applicant_user_id>/<application_id>/<filename>`.
   Once the owning `job_applications` row is identified (step 1), its
   `cv_storage_path` column gives the exact object path to remove via the
   Storage dashboard or `supabaseAdmin.storage.from('job-application-cvs').remove([path])`.
   Deleting the `job_applications` row does **not** delete the underlying
   file automatically (this repository's pre-existing
   `sweep_application_retention()` maintenance function returns storage
   paths for exactly this reason — see its use in the beta operator
   guide's retention section).

## What NOT to do

- Do not bulk-delete by date range alone — real candidates and employers
  may have signed up during the same window.
- Do not delete any row that doesn't match the naming/email convention
  above, even if it looks like test data — confirm with the operator
  first.
- Do not modify or delete `employer_moderation_events` or
  `job_application_status_events` rows even for confirmed test data — the
  audit trail should remain intact for as long as the parent row exists,
  and both cascade automatically when the parent is deleted.
