# Job Intelligence — Data Model (Phase A)

This document is the authoritative description of the Phase A schema. Every
access-control rule below is enforced at the database via RLS or a trigger.
Application code MUST NOT rely on UI-level hiding for confidentiality.

## Tables

| Table | Audience | Purpose |
|---|---|---|
| `job_import_sources` | authenticated (read), admin (write) | Reference table for ingestion sources (`manual`, `employer`, `feed`). v1 uses `manual` and `employer_submission`. |
| `employers` | anon+authenticated (SELECT via policy), admin (all) | Public employer profile: name, slug, logo, website, country, bilingual descriptions. No admin fields. |
| `employer_admin_meta` | admin only | Sibling row (1:1 with `employers`). Holds `verified`, `verification_notes`, `created_by`, `updated_by`. Never exposed to anon or non-admin users. |
| `jobs` | anon+authenticated (SELECT of active rows), admin (all) | Public job posting: classification, presentation, work context, formal requirements, application, lifecycle. |
| `job_admin_meta` | admin only | Sibling row (1:1 with `jobs`). Holds `moderation_notes`, `reviewed_by`, `reviewed_at`, `created_by`, `updated_by`, `imported_at`, `duplicate_of`. |
| `saved_jobs` | owner only | `(user_id, job_id)` composite key. Cascaded on user or job deletion. |
| `job_audit_events` | admin (SELECT), server-side writes | Immutable moderation history. `job_id` is NOT a FK — history survives job deletion. Actor is `ON DELETE SET NULL`. |

## Active-job predicate

`public.job_is_active(status, published_at, deadline_at, expires_at)` returns
true when:

```
status = 'published'
  AND published_at IS NOT NULL AND published_at <= now()
  AND (deadline_at IS NULL OR deadline_at > now())
  AND (expires_at  IS NULL OR expires_at  > now())
```

This function backs both the public `jobs` SELECT policy and the public
`employers` SELECT policy. An employer is only publicly visible when it has
at least one active job.

## Publication rules (trigger `jobs_validate_before_write`)

When `status = 'published'`:
- `published_at` must be non-null and `<= now()`.
- If `deadline_at` is set it must be `>= published_at`.
- `application_method='unavailable'` is rejected.
- `application_method='internal'` is not supported in v1 and is rejected.
- `application_method='external'` requires a non-empty `application_url`.
- `application_method='email'` requires an `application_email` matching
  a basic `x@y.z` pattern.

Drafts (`status != 'published'`) are not constrained.

## CIG taxonomy protection

- `jobs.family_id` is validated against the canonical 13-family whitelist in
  `public.assert_cig_family_id(text)`. This mirrors
  `src/lib/career-center/profession-families.ts`. The list is enumerated in
  the function body because the canonical taxonomy is frozen and lives in
  code, not a DB reference table.
- `jobs.profession_slug` is a foreign key to `public.cig_professions(slug)`
  (which has a unique constraint). The trigger also checks existence and
  produces a clearer error message. `null` is allowed for jobs that are not
  yet classified.

## Slug format

Job slugs use `{employer-slug}-{title-slug}-{shortId}`:

- `employer-slug`: `employers.slug` (ASCII-folded kebab-case, max 40 chars).
- `title-slug`: ASCII-folded kebab-case of the primary-language title (max 40
  chars).
- `shortId`: 8-character base32 derived from the job's UUID.

`jobs.short_id` is also stored as a standalone unique column so short links
can resolve without parsing the slug.

## User-deletion behaviour

- `saved_jobs.user_id`: `ON DELETE CASCADE`. Saved lists disappear with the
  user.
- `employer_admin_meta.{created_by,updated_by}`,
  `job_admin_meta.{created_by,updated_by,reviewed_by}`,
  `job_audit_events.actor_id`: `ON DELETE SET NULL`. Records survive with a
  null actor.
- `job_audit_events.job_id` has no FK, so history survives hard deletion of
  a job. Hard deletion is discouraged; the moderation flow uses
  `status='archived'`.

## Feature flag

`VITE_JOBS_ENABLED` is a release-control flag only. See `README.md`.
