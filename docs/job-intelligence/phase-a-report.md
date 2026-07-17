# Phase A — Implementation Report

**Status:** delivered. No user-visible UI change. Feature flag off by default.

## What shipped

### Database migration

A single migration created the Phase A foundation. It does NOT alter any
existing table, policy, function, or GRANT.

New tables:
- `public.job_import_sources` — reference table, seeded with `manual` and
  `employer_submission`. No `feed` rows.
- `public.employers` — public employer profile (no admin fields).
- `public.employer_admin_meta` — 1:1 admin-only sibling of `employers`
  holding `verified`, `verification_notes`, `created_by`, `updated_by`.
- `public.jobs` — public job posting.
- `public.job_admin_meta` — 1:1 admin-only sibling of `jobs` holding
  `moderation_notes`, `reviewed_by`, `reviewed_at`, `created_by`,
  `updated_by`, `imported_at`, `duplicate_of`.
- `public.saved_jobs` — composite-PK `(user_id, job_id)`.
- `public.job_audit_events` — immutable moderation history. `job_id` is a
  plain `uuid` with **no FK**, so audit rows survive job deletion.

New functions:
- `public.job_is_active(status, published_at, deadline_at, expires_at)` —
  single source of truth for public visibility; used by RLS on both `jobs`
  and `employers`.
- `public.assert_cig_family_id(text)` — canonical 13-family whitelist,
  mirroring `src/lib/career-center/profession-families.ts`.
- `public.jobs_validate_before_write` — validation trigger enforcing the
  publication rules and CIG taxonomy checks.

`jobs.profession_slug` also has a foreign key to
`public.cig_professions(slug)` (unique constraint verified in Phase A);
the trigger provides a clearer error message but the FK is authoritative.

### RLS matrix (verified)

| Table | anon | authenticated (non-admin) | admin |
|---|---|---|---|
| `job_import_sources` | none | SELECT | ALL |
| `employers` | SELECT active-linked | SELECT active-linked | ALL |
| `employer_admin_meta` | none | none | ALL |
| `jobs` | SELECT active | SELECT active | ALL |
| `job_admin_meta` | none | none | ALL |
| `saved_jobs` | none | SELECT/INSERT/DELETE own rows | ALL (via service_role) |
| `job_audit_events` | none | none | SELECT |

Policy counts: `employers` 2, `employer_admin_meta` 1, `jobs` 3,
`job_admin_meta` 1, `job_audit_events` 1, `job_import_sources` 2,
`saved_jobs` 3.

### User-deletion behaviour

- `saved_jobs.user_id` — `ON DELETE CASCADE`.
- `employer_admin_meta.{created_by,updated_by}`,
  `job_admin_meta.{created_by,updated_by,reviewed_by}`,
  `job_audit_events.actor_id` — `ON DELETE SET NULL`.
- Audit history remains intact after any user or job deletion.

### Application code

- `src/lib/job-intelligence/feature-flag.ts` — `jobsEnabled()` helper reads
  `VITE_JOBS_ENABLED`. Unused in Phase A; ready for Phase C+.
- `src/lib/job-intelligence/types.ts` — TypeScript shapes for `Job`,
  `Employer`, `SavedJob`, `JobAuditEvent`, and their admin-only siblings.
  No logic, no imports from Supabase types.
- `.env.example` — documents the release-control flag; default `false`.

### Documentation

- `docs/job-intelligence/README.md` — phase index and the release-control /
  security-boundary distinction.
- `docs/job-intelligence/schema.md` — table-by-table description, RLS
  matrix, active-job predicate, CIG taxonomy protection, slug format,
  user-deletion behaviour.
- `docs/job-intelligence/rollback.md` — reverse-order drop and rollback
  drill.

### Dev seed

`supabase/seeds/phase_a_dev_seed.sql` — 5 fictional employers (all suffixed
`(demo)`) and 8 fictional jobs (all `[TEST DATA]`). NOT run automatically.
Apply manually against a dev database:

```
psql "$SUPABASE_DB_URL" -f supabase/seeds/phase_a_dev_seed.sql
```

The file header warns against production application; every row is
idempotent via `ON CONFLICT (slug) DO NOTHING`.

## Production-safety check

`rg "INSERT INTO public\\.(employers|jobs)" supabase/migrations/` returns
zero matches for the Phase A migration.

## Acceptance criteria status

All Phase A criteria met. Full matrix in the approved plan; highlights:

- Migration applies cleanly; linter reports no new findings attributable to
  Phase A (two pre-existing findings unchanged: `has_role` SECURITY DEFINER
  warning and an unrelated RLS-no-policy table from before Phase A).
- Anon and non-admin authenticated readers see only active jobs and
  employers with at least one active job; all admin metadata tables reject
  their reads.
- Trigger rejects `application_method='unavailable'` and `'internal'` on
  publish, rejects `external` without URL, rejects `email` without valid
  address, and rejects non-canonical `family_id` / `profession_slug`.
- User deletion cascades saved jobs and nulls admin/audit actor fields;
  audit rows persist.
- `VITE_JOBS_ENABLED=false`; `/jobs` route unchanged.
- CIE and CIG untouched; `bun cie:check` remains the regression gate.

## Rollback

See `rollback.md`. Rollback is a pure drop; no existing surface is
affected.

## Known non-goals (still deferred)

No admin UI, no public Jobs UI change, no JSON-LD/sitemap, no analytics,
no relevance engine, no employer self-serve writes, no badges rendered
anywhere, no feature-flag flip.

## Recommended next step

Phase B — Admin moderation MVP. Do not begin until this report is signed
off.
