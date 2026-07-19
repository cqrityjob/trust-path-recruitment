# Phase H3 — Employer Self-Service (Implementation Report)

Status: Implementation complete. Behind `VITE_JOBS_ENABLED` + `VITE_EMPLOYER_PORTAL_ENABLED`. Nothing published.

## Scope delivered

End-to-end employer job authoring, aligned to spec Part D/F/J and the flows 10, 11, 12, 15, 17. Admin publication (flows 13/14) is unchanged from Phase B.

## Server functions (`src/lib/job-intelligence/employer-jobs.functions.ts`)

All functions:

- Use `requireSupabaseAuth` middleware — `ctx.userId` sourced from the verified bearer only.
- Re-verify an active membership on an active employer through `ctx.supabase` before any read/write (`assertActiveMembership`). The `has_employer_role` + `employer_is_active_status` + `jobs_validate_before_write` layers in the database remain the authoritative boundary; the TS check is defense-in-depth plus friendlier error messages.
- Never touch `published_at` or admin-only fields.
- Write to `job_audit_events` through lazily-loaded `supabaseAdmin` (audit table has no authenticated grant, matching the admin.functions.ts pattern).

| Function | Purpose | Trigger path exercised |
|---|---|---|
| `listEmployerJobs` | Own employer's jobs (all statuses) | RLS `jobs_employer_select_own` |
| `getEmployerJob` | Single job read | RLS `jobs_employer_select_own` |
| `saveEmployerJobDraft` | Insert (status `draft`) or update `draft`/`rejected` | RLS `jobs_employer_insert_draft` / `jobs_employer_update_editable`; trigger C1 |
| `submitEmployerJob` | `draft`/`rejected` → `pending_review` with client-side MVP field gate (title, description, application method, expires_at) | Trigger C1 transition allow-list |
| `closeEmployerJob` | `published` → `archived`, status-only write | Trigger C1 (no other column may change) |
| `duplicateEmployerJob` | Copy content into fresh `draft` (never touches source) | RLS `jobs_employer_insert_draft` |

Slugs on insert follow the existing `<employer-slug>-<title>-<short_id>` convention from `admin.functions.ts`. `short_id` is a 10-char base32 random ID (crypto.getRandomValues).

## Routes

All under the `_authenticated` gate, `ssr: false` (the parent workspace shell was already `ssr: false`):

- `/employer/$employerSlug` (index, previously the leaf, moved to `.index.tsx`; layout file now renders `<Outlet />`).
- `/employer/$employerSlug/jobs` — list with status pill, expires-at column, actions (Edit for editable statuses, Duplicate always, Close for `published`).
- `/employer/$employerSlug/jobs/new` — create form; "Save draft" (stays on edit page) and "Submit for review".
- `/employer/$employerSlug/jobs/$jobId/edit` — editable when `draft`/`rejected`; read-only view otherwise, with Duplicate and Close (when `published`) actions and a public-page link.

The dashboard's "Create new job" and "Manage jobs" quick actions are now real links to these routes; the other two remain "coming next" placeholders unchanged from G3.

## Shared UI

`src/components/employer/EmployerJobForm.tsx` — presentation-only form (basics / location / application / classification sections). Handles `datetime-local` ↔ ISO conversion. `expires_at` is marked required with an explanatory hint about the 90-day cap.

## Not in scope (per spec)

- `/employer/$employerSlug/jobs/$jobId/preview` — deferred; the read-only edit view combined with the "View public page" link on `published` jobs covers the current MVP need.
- Applications and assessment invitations remain 0-counter placeholders on the dashboard (H4/later).
- No `published → pending_review` transition (spec Part F).

## Security notes

- No new RLS policies or new grants. Everything runs on the H1 employer surface (`jobs_employer_select_own`, `jobs_employer_insert_draft`, `jobs_employer_update_editable`) plus the `jobs_validate_before_write` trigger.
- No new use of `supabaseAdmin` except for audit-log writes (identical pattern to `admin.functions.ts::writeAudit`).
- Every mutation invalidates both the job list cache and the dashboard-stats cache so the overview counters reflect changes.

## Verification

- `bunx tsgo --noEmit` — PASS
- `bun run cie:check` — CIE v1 harness PASS
- `bun run kg:check` — OK
- Feature flags on tracked `.env`: `VITE_JOBS_ENABLED="false"`, `VITE_EMPLOYER_PORTAL_ENABLED="false"` (unchanged).

## Files changed

- Added: `src/lib/job-intelligence/employer-jobs.functions.ts`
- Added: `src/components/employer/EmployerJobForm.tsx`
- Added: `src/routes/_authenticated.employer.$employerSlug.jobs.index.tsx`
- Added: `src/routes/_authenticated.employer.$employerSlug.jobs.new.tsx`
- Added: `src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.edit.tsx`
- Renamed: `src/routes/_authenticated.employer.$employerSlug.tsx` → `.index.tsx` (dashboard leaf)
- Added: `src/routes/_authenticated.employer.$employerSlug.tsx` (new `<Outlet />` layout for the subtree)
- Edited: `src/routes/_authenticated.employer.$employerSlug.index.tsx` (Quick Actions now link to jobs list / create-new)
- Edited: `src/i18n/dictionaries.ts` (SV + EN i18n keys for the new surfaces)

H3 IMPLEMENTATION COMPLETE — READY FOR OWNER QA