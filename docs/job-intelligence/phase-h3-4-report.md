# H3.4 — Closed Beta Readiness

Status: H3.4A and H3.4B both implemented and tested locally (disposable
Postgres 16, real migration history). Not yet verified against Lovable
Cloud — see §12 for the handoff. No live Supabase Cloud data was touched
by this phase; every fixture used lived only in disposable local test
clusters and was torn down afterward.

## 1. Ground-truth audit (confirmed before writing any code)

- **`job_applications` already existed** (Jobs MVP v1 H1,
  `20260719173615_a71beb5d-e303-4dcb-8938-d87c1d982bd4.sql`), with:
  `status CHECK (status IN ('submitted','viewed','withdrawn'))`; a flat
  `UNIQUE (job_id, applicant_user_id)` (blocked re-applying after
  withdrawal); owner SELECT/INSERT RLS; employer SELECT RLS (active
  employers only); admin SELECT RLS; **no UPDATE grant/policy for
  `authenticated` at all** beyond one (structurally unreachable, see
  below) admin-only UPDATE policy; a `BEFORE INSERT` trigger
  (`job_applications_stamp_employer_id`) that already derived
  `employer_id` from the job but did **not** validate the job's own
  status/method.
- **The entire candidate-side submission path did not exist.** Grepped
  the whole repo for `submitApplication`/`createApplication`/
  `applyToJob`/`insertApplication` — zero hits. `applications.functions.ts`
  had `withdrawMyApplication`, `updateApplicationAsEmployer`,
  `listApplicationsForEmployer`, `getApplicationCvSignedUrl` — all
  employer/candidate *state-change* or *read* functions, none of which
  create an application.
- **The employer-side applications UI was already complete** (H3.2):
  `/employer/$employerSlug/applications` — full, functioning page, not a
  stub. Only the candidate-side apply flow was missing.
- **`jobs.$slug.tsx`'s `ApplySidebar`** had branches for
  `application_method='external'` and `'email'` only — no `'internal'`
  branch — even though the DB schema and `jobs_validate_before_write()`
  trigger already fully permit publishing an `internal` job (the
  `'internal' is now allowed` comment dates to the same H1 migration).
  Publishing an internal job today would silently show "not available."
- **`job-application-cvs` storage bucket**: private, **zero**
  `storage.objects` policies (confirmed via migration history — four
  owner-scoped policies were created, then deliberately dropped the same
  day with an explicit rationale documented in
  `docs/job-intelligence/phase-h3-1-correction-report.md`: "Until H4
  introduces a browser upload path, drop the authenticated
  INSERT/UPDATE/DELETE policies... deny-by-default"). This phase *is*
  that anticipated upload path — built as a server-mediated upload
  (service-role), not new client-facing storage policies, per that
  original design intent.
- **`adminTransitionJob`**'s `moderation_notes` was optional even for
  `action: "reject"` — no note requirement existed.
- **Admin job moderation UI** (`_authenticated.admin.jobs.index.tsx`,
  `_authenticated.admin.jobs.$id.tsx`) was almost entirely hardcoded
  English strings — effectively zero `t()` usage.
- **No password-reset landing page existed.** `PortalAuthForm.tsx`
  already called `supabase.auth.resetPasswordForEmail(...)`, but its
  `redirectTo` pointed at `/auth?intent=<portal>` — the existing
  compatibility-redirect route, which (once the recovery link
  establishes a session) immediately bounces the user to their portal
  home without ever presenting a "set new password" form. This is a real
  pre-existing gap, not something this phase introduced.
- **No feedback mechanism existed** anywhere in the codebase.
- **Playwright was not installed** anywhere in the repo; no `e2e/`
  directory existed. `tests/database/` (SQL-only, manually-inspected,
  per-phase directories) was the only test convention. The established
  `00_bootstrap.sql` + full-migration-replay + fixtures + assertions
  pattern (phase-h3-2-1 onward) was reused unchanged for both new phase
  directories added here.
- **Migration-skip list** (5 confirmed duplicate files, unchanged from
  every prior phase): `20260718153627`, `20260719115332`,
  `20260719180509`, `20260719220600`, `20260720072016`. **A 6th was added
  mid-phase**: while finishing this work, `origin/main` had advanced two
  commits ahead (Lovable applying and syncing H3.3 — confirmed via a
  clean `git merge --ff-only`, zero conflicts, since this session had no
  local commits yet). The new commit added
  `20260720124636_c5e57833-aa14-4466-a5ec-03c29424eac0.sql` — Lovable's
  own consolidated snapshot of the exact end-state my two H3.3 migrations
  (`20260720114043...`, `20260720140000...`) already produce (identical
  `employer_moderation_events` table + identical hardened
  `moderate_employer()`/`employers_validate_before_write()` bodies,
  confirmed by direct comparison). Added to the local-replay skip list on
  the same basis as the prior 5 (replaying it verbatim alongside the two
  originals it re-derives would attempt to `CREATE TABLE
  employer_moderation_events` a second time); the full H3.4A test suite
  (§9) was re-run one final time against the complete migration history
  *including* this new file (correctly skipped) to confirm no regression
  — 23/23 passed identically.

## 2. H3.4A — Candidate Application Core

### What was built

1. **Extended `job_applications.status`** to
   `submitted | reviewing | interview | rejected | hired | withdrawn`
   (was `submitted | viewed | withdrawn`; any existing `viewed` row is
   migrated to `reviewing`).
2. **Partial unique index** (`job_applications_active_unique_idx`) on
   `(job_id, applicant_user_id) WHERE status <> 'withdrawn'`, replacing
   the flat `UNIQUE` — blocks a second *active* application, permits
   re-applying after withdrawal.
3. **Extended the existing `job_applications_stamp_employer_id()`
   trigger** to also validate, at the database level, that the
   referenced job is `status='published' AND application_method='internal'`
   — "only published internal jobs are applicable" is now a structural
   invariant, not just a TS-layer convention.
4. **New `job_application_status_events` table** — dedicated,
   append-only audit trail (mirrors `employer_moderation_events`'s
   proven H3.3 design exactly): `application_id`, `job_id`,
   `employer_id`, `actor_user_id`, `actor_role` (`candidate`/`employer`),
   `previous_status`, `new_status`, `note`, `created_at`. Readable by the
   applicant, the owning employer, and platform admins; writable only by
   the RPC below.
5. **New `set_application_status()` RPC** — the sole path an existing
   application's status can ever change through (SECURITY DEFINER, role
   derived server-side, fixed transition allow-list, atomic status
   update + audit insert). See §7 for the full model.
6. **`submitJobApplication`** (new, `applications.functions.ts`) —
   candidate-facing submission: pre-checks job eligibility and duplicate
   status via the caller's own RLS-scoped client (friendly early errors),
   decodes and validates the CV (PDF magic bytes, ≤5MB), uploads via
   `supabaseAdmin.storage` (service-role — the bucket has no client
   policies, by design), then inserts the `job_applications` row via the
   caller's own RLS-scoped client (owner INSERT policy + the trigger's
   own re-validation + the partial unique index are the real,
   database-level boundary). On any insert failure, deletes the
   just-uploaded CV before surfacing a stable error code.
7. **`listMyApplications`** (new) — candidate's own application history,
   RLS-scoped.
8. **`listApplicationStatusEvents`** (new) — per-application audit trail,
   readable by the applicant and the owning employer.
9. **`withdrawMyApplication`** and (renamed from
   `updateApplicationAsEmployer`) **`updateApplicationStatusAsEmployer`**
   — both now call `set_application_status()` instead of writing
   `job_applications` directly via `supabaseAdmin`.
10. **`ApplyInternalDialog`** (new component, `src/components/jobs/`) —
    wired into `jobs.$slug.tsx`'s `ApplySidebar` for
    `application_method === 'internal'`. Session-aware (same
    `getSession()`/`onAuthStateChange` pattern as
    `useCareerProfileForJobs`, since `/jobs/$slug` is a public route):
    shows a "sign in to apply" link with a `redirect` param when
    signed out; a full form (phone, cover note, PDF file input,
    consent checkbox) when signed in.
11. **`/my-career/applications`** (new route) — candidate application
    history: status badges, CV download, withdraw button (only for
    withdrawable statuses).
12. **`/employer/$employerSlug/applications`** (extended) — status
    action buttons computed from `EMPLOYER_NEXT_STATUSES[status]`,
    mirroring the RPC's own allow-list exactly, so the UI never offers a
    transition the database would reject.
13. **Full sv/en i18n** — `jobs.apply.*`, `candidate.applications.*`,
    extended `employer.applications.*` (added `reviewing`/`interview`/
    `rejected`/`hired` status + action labels, removed the now-unused
    `viewed`/`markViewed` keys).
14. **Playwright installed** (`@playwright/test`), `playwright.config.ts`,
    and `e2e/candidate-to-employer-application.spec.ts` — see §9.

### Requirements checklist (verbatim from the brief)

| Requirement | How satisfied |
|---|---|
| Only published internal jobs are applicable | DB trigger (§2.3), tested T3/T4 |
| `employer_id` derived server-side from the job | Trigger, unchanged from H1 origin + re-validated on every insert; tested T5 (a client-supplied wrong value is silently overwritten) |
| Duplicate active applications blocked | Partial unique index, tested T2; re-apply after withdrawal tested T16 |
| Candidate can only withdraw own eligible application | `set_application_status()`'s candidate branch, tested T12/T14/T15 |
| Employer cannot set withdrawn | RPC branch logic explicitly excludes it for employers, tested T13 |
| Candidate cannot set employer-controlled statuses | RPC branch logic, tested T12 |
| One employer cannot see another employer's applications or CVs | RLS, tested T7; CV signed-URL gated on `assertEmployerWorkspaceMember`, unchanged |
| One candidate cannot see another candidate's applications or CVs | RLS, tested T6; CV signed-URL gated on `isApplicant`, unchanged |
| Signed CV URLs remain short-lived | Unchanged, 300 seconds |
| Failed submission cleans up uploaded CV | `submitJobApplication`'s catch branch, code-reviewed |
| No raw Supabase/Postgres errors reach the UI | Every thrown error is a stable `UPPER_SNAKE_CASE` code; `ApplyInternalDialog` translates via a map with a generic fallback |
| No service-role key reaches browser code | `supabaseAdmin` only ever dynamically imported inside server-function handlers, unchanged established pattern |
| No AI candidate decision-making | Nothing AI-related was added |

**H3.4A completed securely — no stop-and-report condition was hit.**

## 3. H3.4B — Closed Beta Completion

1. **Admin job rejection requires a non-empty internal note.**
   `adminTransitionJob`'s `transitionSchema` gained a `.refine()`
   requiring `moderation_notes` to be non-blank when `action === 'reject'`
   (server-side backstop). The primary UX is client-side: the admin job
   editor's "Reject" button now runs `onReject()`, which blocks the
   request and shows an inline error if the note field is empty. This is
   application-layer only (not a database trigger) — judged proportional
   given the brief frames this as a process requirement, not a listed
   H3.4A-style security requirement; documented as a conscious scope
   decision, not an oversight.
2. **Admin job moderation UI now fully uses sv/en i18n.**
   `_authenticated.admin.jobs.index.tsx` and
   `_authenticated.admin.jobs.$id.tsx` were fully converted from
   hardcoded English strings to `t()` calls — status labels, column
   headers, field labels, placeholders, action button labels, error/
   success messages. Also added the previously-missing `internal` option
   to the admin job editor's application-method selector (reusing the
   existing `employer.jobs.form.applicationMethod.*` keys, adding the
   one missing `unavailable` value to that same family) — without this,
   an admin could never create/edit a job with `application_method=internal`
   through this UI, which would have undermined H3.4A's own candidate
   application feature for any admin-managed job. Date formatting
   switched from `new Date(...).toLocaleString()` to the established
   `formatDateTime()` helper for locale consistency.
3. **Secure password-reset route** (`/reset-password`, new) using
   Supabase Auth's own recovery flow
   (`resetPasswordForEmail`/`updateUser`) — no custom password-handling
   code. `PortalAuthForm.tsx`'s `redirectTo` now points here instead of
   `/auth?intent=<portal>`, closing the gap where a recovery link
   previously bounced the user straight to their portal home without
   ever presenting a "set new password" form. Also added a "forgot
   password?" link to `/admin/login` (previously had none at all) using
   the same flow with `intent=admin`. After a successful reset, redirects
   through the existing `/auth?intent=<intent>` compatibility route
   (reused, not duplicated) to the correct portal home.
4. **Minimal beta feedback mechanism.** New `beta_feedback` table
   (category, message, page_path, owner-insert-only + admin-select-only
   RLS), `submitBetaFeedback`/`listBetaFeedback` server functions, a new
   `/feedback` route (authenticated, any role) linked from the site
   footer on every page, and a new `/admin/feedback` route (admin nav
   section) so submissions are actually readable, not a write-only void.
5. **Beta test data labelling and cleanup** —
   `docs/beta/beta-test-data.md`: email/employer-name/job-title/cover-note
   conventions, safe `SELECT`-first cleanup queries in correct
   foreign-key order, explicit "what not to do" section.
6. **Beta operator guide** — `docs/beta/beta-operator-guide.md`: initial
   admin provisioning, invite flow, day-to-day moderation workflow, exact
   candidate/employer capability summary, explicit beta-scope boundaries
   (payments/ATS/AI decisions/etc. — do not build), data hygiene,
   troubleshooting.
7. **Full end-to-end verification** — see §9/§10.
8. **Mobile and desktop usability checks** — see §10.
9. **Account-switching / stale-cache** — see §10.
10. **Security review of beta-critical paths** — see §11.

### Do-not-build list — confirmed untouched

Payments, subscriptions, an advanced ATS, employer assessment invitations,
AI hiring decisions, advanced analytics, new assessment scoring, new
Career Intelligence algorithms, unrelated redesign — none of these were
built or modified. `git status` confirms no file under
`src/lib/career-intelligence-engine/`, `src/lib/knowledge-graph/`, or any
assessment-scoring path was touched, and `cie:check`/`kg:check` both pass
unchanged.

## 4. Migrations, in exact order

1. `supabase/migrations/20260720150000_h3_4a_candidate_application_core.sql`
   — additive. Extends `job_applications.status` CHECK, replaces its
   unique constraint with a partial unique index, extends
   `job_applications_stamp_employer_id()` (`CREATE OR REPLACE`, does not
   edit the original H1 migration file), adds
   `job_application_status_events` + RLS, adds `set_application_status()`.
2. `supabase/migrations/20260720160000_h3_4b_beta_feedback.sql` —
   additive. Adds `beta_feedback` + RLS.

Neither migration edits any already-applied migration file. Both were
tested by applying the **complete real migration history** (bootstrap →
every file in `supabase/migrations/` in chronological order, skipping the
5 confirmed-duplicate files, through both files above) against a fresh
disposable Postgres 16 cluster.

## 5. Routes and files changed

**New files:**
- `supabase/migrations/20260720150000_h3_4a_candidate_application_core.sql`
- `supabase/migrations/20260720160000_h3_4b_beta_feedback.sql`
- `src/components/jobs/ApplyInternalDialog.tsx`
- `src/routes/_authenticated.my-career.applications.tsx`
- `src/lib/job-intelligence/beta-feedback.functions.ts`
- `src/routes/_authenticated.feedback.tsx`
- `src/routes/_authenticated.admin.feedback.tsx`
- `src/routes/reset-password.tsx`
- `playwright.config.ts`
- `e2e/candidate-to-employer-application.spec.ts`
- `tests/database/phase-h3-4a/{00_bootstrap,01_fixtures,02_run_tests}.sql`
- `tests/database/phase-h3-4b/{00_bootstrap,01_fixtures,02_run_tests}.sql`
- `docs/beta/beta-test-data.md`
- `docs/beta/beta-operator-guide.md`
- `docs/job-intelligence/phase-h3-4-report.md` (this file)
- `.claude/launch.json` (local dev-server preview config, used only for
  this phase's own mobile/desktop visual check — see §10)

**Modified files:**
- `src/lib/job-intelligence/applications.functions.ts` — rewritten (see §2)
- `src/routes/jobs.$slug.tsx` — added the `internal` apply branch
- `src/routes/_authenticated.employer.$employerSlug.applications.tsx` —
  status-control buttons, extended status labels
- `src/routes/_authenticated.my-career.index.tsx` — added a "My
  applications" quick link
- `src/lib/job-intelligence/admin.functions.ts` — rejection-note `.refine()`
- `src/routes/_authenticated.admin.jobs.index.tsx` — full i18n conversion
- `src/routes/_authenticated.admin.jobs.$id.tsx` — full i18n conversion +
  client-side reject-note guard + `internal` application-method option
- `src/components/admin/AdminShellChrome.tsx` — added "feedback" nav section
- `src/components/auth/PortalAuthForm.tsx` — `redirectTo` now points at
  `/reset-password`
- `src/routes/admin.login.tsx` — added forgot-password link/handler
- `src/components/site/SiteFooter.tsx` — added the "Beta feedback" link
- `src/i18n/dictionaries.ts` — ~150 new key pairs (sv + en)
- `.gitignore` — Playwright output directories
- `package.json` / `bun.lock` — `@playwright/test` devDependency, `e2e` script
- `src/routeTree.gen.ts` — auto-regenerated

## 6. RLS and server-authorization model

`job_applications`: unchanged grants (`SELECT, INSERT` to `authenticated`,
no `UPDATE`/`DELETE` beyond one structurally-unreachable-by-clients
admin-only UPDATE policy — this table never had a client-side raw-update
path, before or after this phase). `job_application_status_events`:
`SELECT` only (`authenticated` + `service_role` for writes), three
policies (applicant-own, employer-own, admin-all). `beta_feedback`:
`INSERT, SELECT` to `authenticated` (SELECT grant is required for the
admin-only RLS policy to be reachable at all — non-admins pass the grant
check but match zero rows via RLS, proven in T4/T5/T6), no
`UPDATE`/`DELETE` for anyone but `service_role`.

Every status change (application or otherwise) goes through a single
SECURITY DEFINER RPC that derives the caller's role from `auth.uid()` and
independently-verified membership/ownership checks — never from a
client-supplied flag. This mirrors H3.3's `moderate_employer()` design
exactly, and was applied from day one here rather than retrofitted after
a bypass was found (as happened with employer moderation across H3.3's
multiple hardening passes).

## 7. Application status-transition model

| Action | Actor | Required current status | Resulting status |
|---|---|---|---|
| (submission) | candidate | — (job must be published+internal, no active duplicate) | `submitted` |
| `reviewing` | employer | `submitted` | `reviewing` |
| `interview` | employer | `reviewing` | `interview` |
| `rejected` | employer | `submitted` or `reviewing` or `interview` | `rejected` |
| `hired` | employer | `interview` | `hired` |
| `withdrawn` | candidate (own application only) | `submitted`, `reviewing`, or `interview` | `withdrawn` |

`rejected`, `hired`, `withdrawn` are terminal — no further transition is
accepted from any of them, for any actor. Every transition is atomic with
exactly one `job_application_status_events` row.

## 8. CV storage and cleanup behaviour

- Bucket: `job-application-cvs` (private, unchanged). Zero client-facing
  `storage.objects` policies — deny-by-default, unchanged and
  **deliberately not widened** by this phase.
- Upload path (new, H3.4A): `submitJobApplication()` decodes a base64
  payload server-side, validates PDF magic bytes (`%PDF-`) and a 5MB size
  cap, then writes via `supabaseAdmin.storage` (service-role) to
  `<applicant_user_id>/<application_id>/<sanitised_filename>` —
  exactly the path convention anticipated in the H3.1-correction report.
- Download path (unchanged): `getApplicationCvSignedUrl`, 5-minute signed
  URLs, gated on applicant ownership or active employer membership.
- **Cleanup on failed submission**: if the `job_applications` INSERT
  fails for any reason (duplicate race, job became unpublished
  mid-flight, unexpected DB error), the just-uploaded object is deleted
  via `supabaseAdmin.storage...remove([storagePath])` before the error is
  surfaced — no orphaned file is left behind for an application that
  doesn't exist.
- Long-lived retention cleanup (`sweep_application_retention()`,
  pre-existing, H1) is **not** wired to a scheduler in this phase — see
  §13 deferred items.

## 9. Test results

### Database (disposable Postgres 16, full real migration history)

**H3.4A** (`tests/database/phase-h3-4a/`) — 23/23 assertions passed
(T1–T23): submission succeeds for a published+internal job with
server-derived `employer_id`; duplicate-active blocked; wrong-method and
wrong-status jobs blocked; cross-candidate and cross-employer isolation
on both `job_applications` and `job_application_status_events`; no direct
authenticated UPDATE path for either role (`42501` permission-denied at
the grant layer, before RLS is even reached); the full employer funnel
(submitted→reviewing→interview→hired) and candidate withdrawal both work
end-to-end through `set_application_status()`; invalid transitions
blocked; re-application after withdrawal works; audit-row counts exact
(one per successful transition, zero for failed attempts); admin
visibility spot-checked; final grant/policy inventory confirmed.

**H3.4B** (`tests/database/phase-h3-4b/`) — 8/8 assertions passed (T1–T8):
owner-insert succeeds; a forged `user_id` is blocked by `WITH CHECK`; an
empty message is blocked by the `CHECK` constraint; neither the submitter
nor an unrelated user can read any submission back; a platform admin can
read every submission; no one (including admin) can `UPDATE`/`DELETE` via
a raw client call; final grant inventory confirmed (`INSERT, SELECT` for
`authenticated`, `SELECT` required for the admin RLS policy to be
reachable at all — this was caught and corrected mid-pass, see the
migration's own comment for the reasoning).

Both suites were also re-run against the *other* phase's full migration
history (H3.4A tests re-run on top of the H3.4B migration and vice versa)
to confirm neither migration regresses the other.

### Application-level / static

`bunx tsc --noEmit` — zero errors. `bun run build` — succeeds. `bunx
eslint` on every new/changed file — zero new issues (only pre-existing-
convention `@typescript-eslint/no-explicit-any` usages, matching the
established `Ctx = { supabase: any }` pattern used throughout this
codebase). `cie:check` — PASS, persona outputs byte-identical to before
this phase. `kg:check` — OK. `employer-taxonomy:check` /
`employer-job-form:check` / `admin-employer-status-guard:check` — all OK
(H3.1–H3.3 regression confirmation).

### Playwright — candidate-to-employer smoke test

`@playwright/test` installed; `playwright.config.ts` and
`e2e/candidate-to-employer-application.spec.ts` written — a real,
selector-accurate spec covering: candidate signs in → applies to a
published internal job with a PDF CV → sees it in their own history as
`Submitted` → employer signs in → sees it, marks it `Reviewing` →
candidate sees the updated status. Confirmed the file loads and the
skip-gate itself works (`bunx playwright test` → `1 skipped`, zero
network calls, zero data created).

**This spec is deliberately NOT executed against real data in this
session.** This repository has no local Supabase stack (no Docker/CLI
available), so the only backend reachable from a browser session driven
against `bun run dev` is the live, connected Lovable Cloud project
(confirmed via `.env`) — running it would create real signups,
applications, and CV uploads in a shared environment. The spec is gated
behind `E2E_RUN_LIVE=1` plus five fixture env vars and skips itself
(not fails) otherwise. Actually executing it against real (clearly
labelled, per `docs/beta/beta-test-data.md`) beta accounts is left to
Lovable/the beta operator, per this repository's established pattern of
not autonomously mutating shared cloud state.

## 10. Mobile and desktop usability checks

Verified visually via the in-app Browser tool against a local
`bun run dev` server (desktop 1280×800 and mobile 375×812 viewports),
without submitting any form (read-only page loads only, no live data
created):

- `/reset-password` (invalid-link state) — renders correctly, no layout
  overflow, at both sizes.
- Site footer — the new "Beta feedback" link renders correctly in the
  "Legal" column at desktop width.
- `/feedback`, `/my-career/applications` — both correctly redirect an
  unauthenticated visitor to `/candidate/login` with no crash, at mobile
  width.
- `/admin/login` — the new "Glömt lösenord?" (forgot password) link
  renders correctly above the submit button at mobile width. (Pre-existing,
  unrelated to this phase: the page's `<h1>` text overflows the 375px
  viewport at this font size — noted for awareness, not fixed here, since
  it predates H3.4 and touching it would be an unrelated redesign.)
- Zero console errors across every page checked.

Full interactive verification of the candidate apply dialog, employer
status-control buttons, and admin job editor's new fields on both mobile
and desktop requires a live authenticated session with real (or
Preview-provisioned) test accounts — deferred to Lovable Preview
verification, consistent with why the Playwright spec itself was not
executed live (§9).

## 11. Account-switching and stale-cache

No new code was needed. The pre-existing root-level
`supabase.auth.onAuthStateChange` listener (`src/routes/__root.tsx`,
Lovable's own commit, unmodified, first confirmed sufficient during
H3.3) calls `queryClient.cancelQueries()` + `queryClient.clear()` on
sign-out or on any user-id change — this is a blanket clear covering
every query key, so it automatically covers every new query key this
phase introduces (`["my-career","applications"]`,
`["employer", employerId, "applications"]`,
`["admin","beta-feedback"]`, etc.) with no phase-specific wiring
required.

## 12. Security review of beta-critical paths (final pass, before commit)

Re-read the complete H3.4A/H3.4B diff. Re-inspected: the `set_application_status()`
RPC's role-derivation and transition allow-list; the extended
`job_applications_stamp_employer_id()` trigger's job-eligibility check;
the partial unique index; every RLS policy on both new tables;
`submitJobApplication`'s CV validation and cleanup-on-failure path;
confirmed `supabaseAdmin` is only ever dynamically imported inside
server-function handlers (never in client-bundled code) across every new
file; confirmed every thrown error across both new server-function files
is a stable code string, never a forwarded Postgres/Supabase error;
confirmed the admin job rejection note requirement is enforced both
client-side (primary UX) and server-side (zod `.refine()` backstop).
`git status` reviewed — no file under `src/lib/career-intelligence-engine/`,
`src/lib/knowledge-graph/`, or any candidate-assessment path was touched.
Full local test suite (§9) re-run and passing at the time of this review.
No issue required a fix before commit beyond the mid-pass grant
correction already documented in §9/the migration's own comments.

## 13. Known limitations

- Admin job rejection's non-empty-note requirement is enforced at the
  application layer (zod `.refine()` + client-side guard), not by a
  database trigger — a deliberate, documented proportionality decision
  (see §3.1), not an oversight.
- `employer_note` on `job_applications` remains readable by the candidate
  it describes if they query their own row's full column set directly
  (pre-existing behaviour from H1, unrelated to and unchanged by this
  phase — no note-confidentiality requirement was made for applications,
  unlike the explicit confidentiality requirement for employer-moderation
  notes in H3.3).
- The Playwright smoke test is written but not executed against a live
  backend in this session (§9) — genuine end-to-end confirmation is
  deferred to Lovable Preview.
- Mobile/desktop usability was visually spot-checked for
  unauthenticated/public surfaces only (§10); authenticated interactive
  flows (apply dialog, status-control buttons, admin job editor) were
  verified by code review and the database/static test suites, not a
  live authenticated browser session.

## 14. Deferred items (explicitly out of scope for H3.4, per the brief)

Payments, subscriptions, an advanced ATS, employer assessment
invitations, AI hiring decisions, advanced analytics, new assessment
scoring, new Career Intelligence algorithms. Additionally, not built in
this phase (not requested, flagged for future consideration):

- A separate, employer-visible rejection-reason field for applications
  (distinct from the internal `employer_note`).
- Scheduling `sweep_application_retention()` / `sweep_analytics_retention()`
  to actually run (both pre-existing, service-role-only, currently
  callable but not wired to any cron).
- A read/reply/triage workflow for `beta_feedback` beyond the minimal
  admin-readable list at `/admin/feedback`.
- Fixing the pre-existing `/admin/login` heading overflow at narrow
  mobile widths (noted in §10, predates this phase).

## 15. Lovable Cloud handoff

1. **Sync** the final commit (`feat: add H3.4 closed beta candidate
   application core and completion items`, tip of `main`) to the Lovable
   Cloud project.
2. **Apply both migrations, in order**:
   1. `supabase/migrations/20260720150000_h3_4a_candidate_application_core.sql`
   2. `supabase/migrations/20260720160000_h3_4b_beta_feedback.sql`
   Both additive only; no existing migration edited.
3. **Prerequisite**: at least one existing user must already satisfy
   `is_platform_admin()` (see `docs/beta/beta-operator-guide.md` §1) —
   unchanged, pre-existing Phase G1 model.
4. **Run this Preview checklist**:
   - As an admin, create (or find) a published, `application_method=internal`
     job.
   - As a candidate (new or existing), open that job → confirm "Apply via
     CQrityjob" renders → apply with a PDF CV → confirm the success
     dialog → confirm it appears at `/my-career/applications` as
     `Submitted`.
   - Attempt to apply to the same job again → confirm a clean "already
     applied" error, not a raw database error.
   - As the owning employer, open `/employer/$slug/applications` →
     confirm the application appears → advance it through Reviewing →
     Interview → Hired, confirming only the valid next-step buttons are
     ever shown.
   - As the candidate, withdraw a *different* application (still
     `submitted`/`reviewing`/`interview`) → confirm it becomes
     `Withdrawn` and re-applying to that same job now succeeds.
   - As an admin, attempt to reject a pending job **without** a note →
     confirm it's blocked with an inline message; reject **with** a note
     → confirm it succeeds.
   - Confirm the admin job list/detail pages render entirely in Swedish
     when the language switcher is set to `SV`, and entirely in English
     when set to `EN` — no leftover hardcoded strings.
   - As any signed-in user, submit beta feedback via the footer link →
     confirm it appears at `/admin/feedback` for an admin.
   - As a signed-out visitor, request a password reset from
     `/candidate/login` → confirm the email link lands on
     `/reset-password` and successfully updating the password signs the
     user in and redirects to `/my-career`.
5. **Report pass/fail** against the checklist above. No product or
   implementation decisions are left open for this phase.
