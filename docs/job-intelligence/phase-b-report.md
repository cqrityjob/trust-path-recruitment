# Phase B — Admin Moderation MVP · Implementation Report

## Scope delivered

A private, admin-only moderation console for Job Intelligence, mounted under
`/admin/*` inside the existing `_authenticated` layout. The console lets a
user with the `admin` role create employers, create and edit jobs, and drive
jobs through the lifecycle (`draft` → `pending_review` → `published` /
`rejected` → `archived`). All state changes are captured in
`job_audit_events`.

No public surface is added. `VITE_JOBS_ENABLED` remains `false`; `/jobs`
continues to render the "Coming soon" page.

## Files added

- `src/lib/job-intelligence/admin.functions.ts` — server functions:
  `adminWhoAmI`, `adminListJobs`, `adminGetJob`, `adminSaveJobDraft`,
  `adminTransitionJob`, `adminListEmployers`, `adminUpsertEmployer`.
- `src/routes/_authenticated.admin.tsx` — role-gated layout (Jobs / Employers
  tabs, `noindex, nofollow`).
- `src/routes/_authenticated.admin.index.tsx` — redirect to `/admin/jobs`.
- `src/routes/_authenticated.admin.jobs.tsx` — jobs subtree layout.
- `src/routes/_authenticated.admin.jobs.index.tsx` — filterable job list.
- `src/routes/_authenticated.admin.jobs.$id.tsx` — new / edit job form with
  lifecycle actions.
- `src/routes/_authenticated.admin.employers.tsx` — employer list + create.
- `docs/job-intelligence/phase-b-report.md` — this document.

## Files modified

- `docs/job-intelligence/README.md` — Phase B status flipped to Delivered.

## Files NOT modified

CIE, assessment logic, CIG, existing routes, existing components, migrations,
RLS policies, database functions, feature flag default, or public `/jobs`
route. Type generator `src/integrations/supabase/types.ts` unchanged.

## Access control

Every server function follows this order:

1. `requireSupabaseAuth` middleware validates the bearer token.
2. `assertAdmin(ctx)` calls `has_role(auth.uid(), 'admin')` — a
   security-definer function reading `public.user_roles`. A non-admin caller
   receives `Forbidden: admin role required` and no data is returned.
3. RLS on `jobs`, `employers`, `job_admin_meta`, and `employer_admin_meta`
   independently enforces the same rule; the explicit check is defence in
   depth and gives a clean error before hitting the database.

The route layout additionally guards the UI with `adminWhoAmI`: a non-admin
authenticated user is redirected to `/journey` before any admin data is
fetched. Unauthenticated users are already redirected to `/auth` by the outer
`_authenticated` layout.

## Audit trail

`job_audit_events` receives one row per state-changing action:

| Server action | Audit `action` |
|---|---|
| Create job (draft) | `created` |
| Update job | `updated` |
| Submit for review | `submitted` |
| Publish | `published` |
| Reject | `rejected` |
| Archive | `archived` |
| Unpublish (back to draft) | `updated` |

Each row captures `job_id`, `job_slug_snapshot` (denormalised in case the job
is later hard-deleted), `actor_id`, `before`/`after` JSON, and `created_at`.
Writes go through `supabaseAdmin` (service_role) because RLS forbids
anon/authenticated writes to the audit table.

`reviewed_by` / `reviewed_at` in `job_admin_meta` are set on publish and
reject. `created_by` / `updated_by` are set on job draft create/update.

## Publication rules (enforced by the DB trigger from Phase A)

The admin UI surfaces the raw error from `jobs_validate_before_write`. On
publish, the trigger rejects:

- missing / future `published_at` (server sets `published_at = now()` on
  publish if not set),
- `deadline_at < published_at`,
- `application_method = 'unavailable'`,
- `application_method = 'internal'` (out of scope in v1),
- `application_method = 'external'` without `application_url`,
- `application_method = 'email'` without a syntactically valid
  `application_email`,
- non-canonical `family_id` or non-existent `profession_slug`.

No trigger, function, or policy was modified in Phase B.

## Admin-only metadata never reaches public callers

The admin UI is the only surface that reads `job_admin_meta` or
`employer_admin_meta`. It reads those tables through `requireSupabaseAuth`
with an admin role check. `moderation_notes`, `reviewed_by`, `reviewed_at`,
`created_by`, `updated_by`, `imported_at`, `duplicate_of`, `verified`, and
`verification_notes` are never sent to unauthenticated clients or to
non-admin authenticated clients.

## Feature flag

`VITE_JOBS_ENABLED` is unchanged (default `false`). It gates the future
public Jobs experience only. Admin routes are intentionally NOT gated by the
flag — moderation must remain usable while the public surface is dark.

## Acceptance tests performed

1. `bunx tsgo --noEmit` — passes with no errors.
2. Route tree regenerates: six `_authenticated.admin*` routes registered.
3. Access matrix (manual):
   - `/admin` unauthenticated → redirected to `/auth`.
   - `/admin` authenticated non-admin → redirected to `/journey`.
   - `/admin` admin → console renders, Jobs tab is default.
4. Jobs list — status pills filter correctly; search matches title / slug /
   `short_id` (`ilike`).
5. Create employer → appears in employer picker on new-job form.
6. Create job draft → row appears in list with `status=draft`; audit event
   `created` written.
7. Edit job → `updated_at` refreshes; audit event `updated` written.
8. Publish draft with a valid external URL → trigger accepts; status becomes
   `published`; `reviewed_by` / `reviewed_at` set; audit event `published`
   written.
9. Publish attempt with `application_method='external'` and no URL → trigger
   raises `check_violation`; UI shows the error verbatim; status does not
   change; no audit row is written for the failed transition.
10. Reject a `pending_review` job → status `rejected`; `moderation_notes`
    stored on `job_admin_meta`.
11. Unpublish a `published` job → status back to `draft`.
12. Archive a job → status `archived`; row hidden from public predicate
    (`public.job_is_active`).
13. `/jobs` still shows the Phase-A "Coming soon" page (flag off).
14. `bun cie:check` — unchanged output (CIE / CIG untouched).

## Deviations

- Rich fields on `jobs` that are not part of the moderation MVP were left out
  of the form: `responsibilities`, `requirements`, `benefits` (jsonb),
  `related_profession_slugs`, `sector`, `employer_type`,
  `language_requirements`, `travel_required`, `shift_work`, `night_work`,
  `regulated`, `formal_requirement_ids`, `security_vetting_mentioned`,
  `driving_licence_required`, `source_id` / `source_url` / `canonical_url`,
  `content_hash`. These retain their defaults and can be edited later without
  a schema change.
- `duplicate_of` and the `duplicate_marked` audit action are supported by the
  schema but not surfaced in the UI. Deferred.
- Employer editing is limited to create; edit-in-place is deferred (the list
  is read-only in v1).

## Known non-goals (still deferred)

No public Jobs UI, no JSON-LD, no sitemap change, no analytics events, no
relevance engine, no employer self-serve, no candidate-facing badges, no
feed importer, no rate limiting on admin actions.

## Rollback

Phase B is a pure additive change on top of Phase A:

1. Delete `src/routes/_authenticated.admin*.tsx` (six files).
2. Delete `src/lib/job-intelligence/admin.functions.ts`.
3. Delete `docs/job-intelligence/phase-b-report.md` and revert the Phase B
   status line in `docs/job-intelligence/README.md`.

No database changes were made in Phase B; Phase A rollback still applies
unchanged.

## Recommended next step

Phase C — Public Jobs discovery (landing, search, filters, listings). Do not
begin until this Phase B report is signed off.
