# Phase H3.2 — Employer Dashboard Completion

**Scope:** turn the employer workspace into a coherent, secure MVP — navigation, account menu/logout, real organisation status, real dashboard statistics, working quick actions, job management, an employer-facing applications view, and an organisation-settings view/edit page.
**Not in scope:** assessment invitations (no backend exists), colleague invitations/role management, any future employer-intelligence functionality (billing, candidate search, analytics, etc).

## 1. Current-state audit (before this phase)

Verified directly against the repository, not against dashboard labels:

| Area | State before H3.2 |
|---|---|
| Employer login/register, onboarding | Fully implemented (H3.1) |
| Employer dashboard shell | Existed (G3), 4 inert "coming next" rows, no chrome, no real status |
| Employer navigation | None — dashboard was a single unlinked page per route |
| Account menu / logout | Did not exist anywhere in the employer workspace |
| Organisation status display | Not read from the backend at all; no UI showed it |
| Dashboard statistics | `activeJobs`/`draftJobs` real; `applications` hardcoded `0` (table didn't exist at write time, then existed but was unused); `assessmentInvitations` hardcoded `0` |
| Quick actions | "Create job"/"Manage jobs" worked; "Organisation settings" and "Invite to assessment" had no destination |
| Job management (list/create/edit/draft/submit/close/duplicate) | **Fully implemented already** (`employer-jobs.functions.ts`), just not reachable from a coherent nav |
| Applications | Backend **fully implemented already** (`job_applications` table + RLS + `applications.functions.ts`, built independently in Jobs MVP v1 H1) — **no employer-facing UI existed** |
| Assessment invitations | **No backend exists anywhere** — no table, no functions, no RPC |
| Organisation settings (view/edit) | **No route existed.** No RLS policy existed allowing an employer member to update their own `employers` row at all — only `employers_admin_all` (platform-admin-only) |
| RLS on `employers` for non-admin write | Did not exist |

This audit is the reason the Applications area changed from "likely defer" to "build the UI now" — the backend was already complete and correctly scoped; only the employer-facing view was missing.

## 2. What was completed

- **Shared employer workspace chrome** (`EmployerWorkspaceChrome`) — organisation name, real status badge + explanation, role label, account menu (email, "Min karriär"/My Career, org switcher if >1 workspace, sign-out), and a 4-item nav (Overview/Jobs/Applications/Settings), reused by all 6 employer routes so the workspace reads as one coherent product, not disconnected pages.
- **Sign-out**: reuses the existing `supabase.auth.signOut()` call (no duplicated auth logic), adds an explicit post-signout redirect to `/candidate/login` (an intentional improvement — the pre-existing My Career sign-out does not redirect).
- **Real organisation status everywhere**: `listMyEmployerWorkspaces()` now returns `employerStatus` straight from `public.employers.status` (additive `select` change only); the dashboard, jobs routes, applications, and settings pages all thread this real value through — nothing infers status from the route or hardcodes it.
- **Dashboard statistics**: active jobs, draft jobs, and applications are now all real, employer-scoped counts (`job_applications` table already existed; the dashboard just wasn't querying it). Assessment invitations is presented as an explicit "Coming soon" panel, never a fabricated `0` presented as a real statistic.
- **Quick actions**: Create job, Manage jobs, and Organisation settings all route to real, working destinations. "Invite to assessment" is visibly disabled with a "Coming soon" label — no dead links, no 404s, no fake flows.
- **Job management**: unchanged functionally (it was already complete) — now reachable through the shared nav, wrapped in the same chrome, using the real role/status.
- **New Applications view** (`/employer/$employerSlug/applications`): lists an employer's applications (job title, applicant name, date, status, cover note), mark-as-viewed action, CV download via the existing signed-URL function. Backed by a new `listApplicationsForEmployer` server function (see §4).
- **New Organisation Settings view/edit** (`/employer/$employerSlug/settings`): name, website, country, registration number, sv/en description fields; owner/admin can edit, plain members see a read-only view; status is always displayed, never editable from this page. Backed by a new server function pair and a new additive RLS policy + trigger guard (see §7).
- **Empty/loading/error states**: loading, access-denied (used uniformly for no-auth/no-membership/invalid-slug/wrong-tenant — deliberately not distinguished, so as not to leak which organisations exist), stats-load error, applications-load error, settings-load/save error, first-time "no jobs yet" guidance panel, applications "no applications yet" empty state.
- **sv/en copy**: ~40 new dictionary keys added in symmetric pairs (nav, account menu, status badges/explanations, dashboard cards/actions, applications list, settings form, empty/error states).
- **Responsive behaviour**: nav scrolls horizontally on narrow viewports rather than wrapping/overflowing; account-menu dropdown and sign-out remain reachable on mobile; stat cards use a 2-column mobile / 4-column desktop grid; applications render as stacked cards (never a fixed-width table) so nothing overflows on mobile.
- **New additive migration + RLS**: gives owner/admin employer members self-service edit rights over their own organisation profile while keeping `status` and `slug` immutable for everyone except platform admins (see §7).

## 3. What was intentionally deferred

- **Assessment invitations** (dashboard stat + quick action): no table, no persistence, no token/expiry model, no assignment logic, no RLS anywhere in this schema. Per the brief's explicit rule, this is not partially built — the UI shows "Coming soon" and nothing is clickable. Fully deferred to a future phase.
- **Colleague invitations / role management**: out of scope per the brief; not touched.
- **Any employer-intelligence functionality** (billing, candidate search, analytics, branding, AI recruitment assistant, etc.): explicitly out of scope per the brief; not started.
- **Direct publication for pending employers**: unchanged. A pending/draft-status employer can create, edit, and save job drafts but cannot publish — enforced by existing RLS/trigger logic (`jobs_validate_before_write`, `employer_members_can_edit`), not weakened or bypassed by this phase.

## 4. Exact routes and files changed

**Routes**
- `/employer/$employerSlug` — dashboard (`src/routes/_authenticated.employer.$employerSlug.index.tsx`, rewritten)
- `/employer/$employerSlug/jobs` — job list (`...jobs.index.tsx`, modified: chrome + role/status props)
- `/employer/$employerSlug/jobs/new` — new draft (`...jobs.new.tsx`, modified: chrome only)
- `/employer/$employerSlug/jobs/$jobId/edit` — edit/view (`...jobs.$jobId.edit.tsx`, modified: chrome only)
- `/employer/$employerSlug/applications` — **new** (`...applications.tsx`)
- `/employer/$employerSlug/settings` — **new** (`...settings.tsx`)

**New files**
- `src/components/employer/EmployerWorkspaceChrome.tsx`
- `src/lib/job-intelligence/employer-settings.functions.ts` (`getEmployerOrganisation`, `updateEmployerOrganisation`)
- `src/routes/_authenticated.employer.$employerSlug.applications.tsx`
- `src/routes/_authenticated.employer.$employerSlug.settings.tsx`
- `supabase/migrations/20260720064743_h3_2_employer_settings.sql`
- `tests/database/phase-h3-2/01_fixtures.sql`, `tests/database/phase-h3-2/02_run_tests.sql`

**Modified files**
- `src/lib/job-intelligence/applications.functions.ts` — added `listApplicationsForEmployer` (new export; existing exports untouched)
- `src/lib/job-intelligence/employer-dashboard.functions.ts` — `applications` count now real (was hardcoded `0`); `assessmentInvitations` stays `0`, now explicitly commented as "no table exists"
- `src/lib/job-intelligence/membership.functions.ts` — `listMyEmployerWorkspaces()` now returns `employerStatus`
- `src/i18n/dictionaries.ts` — ~40 new sv/en key pairs
- `src/routeTree.gen.ts` — auto-regenerated by `bun run build` to register the two new routes (not hand-edited)

## 5. Security and RLS conclusion

All 14 security requirements from the brief were re-verified against the actual, current implementation:

- **Tenant isolation**: every server function scopes by `employer_id` derived from a caller-verified membership row (`listMyEmployerWorkspaces`, `assertActiveEmployerMember`), never from a client-supplied `employerId` alone — the ID is checked against RLS/RPC membership before any privileged read/write.
- **No trust in slug**: the route param is used exclusively as a lookup key into the caller's own fresh `listMyEmployerWorkspaces()` result; an invalid, foreign, or stale slug produces the same neutral "access denied" state as no membership at all.
- **No client-supplied employer ID grants access**: `listApplicationsForEmployer` and `updateEmployerOrganisation` both re-verify membership/role server-side (RPC or RLS) before touching data; the client-sent `employerId` only narrows an already-authorized query.
- **No public dashboard access**: all six routes require `requireSupabaseAuth` and an active membership row; none render workspace content prior to that check succeeding.
- **No pending-employer publication**: unchanged — `jobs_validate_before_write` and the existing `jobs_employer_*` policies still gate `pending_review`/`published` transitions; this phase did not touch that logic.
- **No cross-employer job/application access**: `listApplicationsForEmployer` filters by `employer_id` in the privileged query itself (not just at the UI layer); RLS on `job_applications` (`job_applications_employer_select`) independently backs this for any RLS-scoped path.
- **No employer-controlled status change**: enforced twice — the new `employers_owner_admin_update` RLS policy's `WITH CHECK` doesn't block it alone, so the new `employers_validate_before_write` trigger independently rejects any `status` or `slug` change from a non-platform-admin, verified by tests T3/T4/T8.
- **No service-role credential in client code**: `supabaseAdmin` is only ever lazy-imported inside server function handlers (`.server` module), never sent to the browser; `updateEmployerOrganisation` deliberately uses the caller's own RLS-scoped client, not `supabaseAdmin`, since a genuine RLS policy now exists for this write.
- **Secure logout**: calls the real Supabase sign-out, clears no manually-cached employer data because none is manually cached beyond React Query's own cache (which is process-local and not persisted), redirects away from the now-inaccessible page.
- **RLS on every employer-owned table touched**: `employers` (existing `employers_admin_all`/`employers_member_select`/`employers_public_active_select` unchanged; one new `employers_owner_admin_update` added), `job_applications` (existing policies, unchanged, reused as-is).
- **Candidate data minimisation**: `listApplicationsForEmployer` returns only `display_name` (via the profiles table, service-role-mediated after an app-level membership check, since `profiles` is self-select-only RLS), phone, cover note, and CV *presence* (boolean) — never raw CV bytes or a CV URL directly; CV download goes through the existing, independently-authorized `getApplicationCvSignedUrl`.

No existing policy, function, or table was weakened, dropped, or altered in a way that changes prior behaviour — the migration is purely additive (one new `CREATE POLICY`, one new trigger function + trigger).

## 6. Local test results

- `bunx tsc --noEmit` — **clean** (0 errors)
- `bun run build` — **succeeds**, `routeTree.gen.ts` regenerated with the two new routes
- `bunx eslint` scoped to all 13 H3.2-changed/added TS/TSX files — **16 pre-existing-pattern `@typescript-eslint/no-explicit-any` findings, 0 new issues**. Confirmed via `git diff` that every flagged line is either unchanged from before this phase or uses the same `Ctx = { supabase: any; userId: string }` / `catch (e: any)` convention already established across `admin.functions.ts`/`membership.functions.ts` and the pre-existing job routes.
- `bun run scripts/cie-check.ts` (career-engine isolation harness, 11 personas) — **PASS**, unaffected (no engine code touched)
- `bun run scripts/kg-check.ts` — **OK**, unaffected
- Local disposable Postgres 16 (`tests/database/phase-h3-2/`), migration chained on top of the full existing migration history: **10/10 tests pass** —
  - T1 owner of a pending employer can update name/website/country/registration_number/description
  - T2 plain member cannot update (RLS denies)
  - T3 owner cannot change `status` directly (trigger rejects: *"status is a moderation-owned field and cannot be changed by an employer member"*)
  - T4 owner cannot change `slug` directly (trigger rejects: *"slug cannot be changed by an employer member"*)
  - T5 owner can still change `name` in the same session (guard is field-specific, not a blanket block)
  - T6 owner of a suspended employer cannot update at all (`employer_members_can_edit()` returns false)
  - T7 cross-tenant: owner of company A cannot update company B (RLS denies)
  - T8 platform admin is exempt from the guard and can change `status`
  - T9 anon role denied outright (*"permission denied for table employers"*)
  - T10 final policy/trigger inventory matches exactly what the migration adds, nothing else changed

## 7. Database migration required

**Yes — one new additive migration, already written and locally tested, not yet applied to the connected Lovable Cloud environment:**

`supabase/migrations/20260720064743_h3_2_employer_settings.sql`

Adds exactly two objects to `public.employers`, nothing else:
1. `employers_owner_admin_update` — new `FOR UPDATE` RLS policy: owner/admin members (`has_employer_role`) of an employer whose status still permits editing (`employer_members_can_edit()` — the same helper already gating job-draft edits) may update their own organisation row.
2. `employers_validate_before_write()` trigger function + `employers_validate_before_write_trigger` — independently rejects any change to `status` or `slug` from a non-platform-admin, regardless of what RLS would otherwise allow.

No existing migration was edited. No destructive statements. **This has not been applied to the connected Supabase/Lovable Cloud database — it exists only as a committed file in this repository**, per the working-method constraint not to claim remote application without service-role access.

### Lovable Cloud handoff (exact steps)

1. Pull `main` after this phase's commit.
2. Apply `supabase/migrations/20260720064743_h3_2_employer_settings.sql` through Lovable's normal managed migration workflow (no manual SQL pasting, no reset).
3. Verify in the connected database:
   ```sql
   select policyname, cmd from pg_policies where schemaname='public' and tablename='employers' order by policyname;
   -- expect: employers_admin_all (ALL), employers_member_select (SELECT),
   --         employers_owner_admin_update (UPDATE) [new],
   --         employers_public_active_select (SELECT)

   select tgname from pg_trigger where tgrelid = 'public.employers'::regclass and not tgisinternal;
   -- expect: employers_validate_before_write_trigger [new]
   ```
4. Run the Preview E2E pass covering the manual test checklist in §9 below against the live environment.

## 8. Manual product-owner test checklist

1. Log in as an existing **pending/draft**-status employer owner → dashboard shows "Company account under review" status text and correct copy; drafts can be created/edited; no publish option is offered anywhere.
2. Log in as an **active**-status employer owner → dashboard shows "Company account active"; existing publish/moderation flow behaves exactly as before this phase.
3. Click every nav item (Overview/Jobs/Applications/Settings) and every quick action → none 404, none blank, none show an unauthorised screen; "Invite to assessment" is visibly disabled with "Coming soon", not clickable.
4. Open the account menu (desktop and mobile widths) → shows signed-in email, "Min karriär"/"My Career", org switcher (only if the account has >1 workspace), "Logga ut"/"Sign out" → sign-out actually signs out and redirects.
5. As a **plain member** (not owner/admin), open Organisation settings → fields are visible but disabled/read-only, no save button.
6. As an **owner**, edit and save an organisation settings field → success message appears, refreshed value persists on reload; attempt (via devtools/network, not UI) to submit a `status` or `slug` change → rejected server-side.
7. Open Applications as an employer with existing `job_applications` rows → correct job title, applicant name (or "anonymous candidate" fallback), date, status, cover note; "Mark as viewed" and CV download work and only affect that employer's own rows.
8. Open Applications with zero rows → correct "no applications yet" empty state, single relevant action, no dead buttons.
9. Attempt to reach another employer's `/employer/<foreign-slug>` (typed URL) while a member of a *different* employer → neutral access-denied state, no data leak.
10. Resize to mobile width on every route → nav scrolls horizontally without breaking layout, account menu/logout remain reachable, applications render as stacked cards, no horizontal page overflow.
11. Confirm existing Career Center / assessment flows are visually and functionally unchanged (not touched by this phase).

## 9. Commit and push

Not yet committed as of this report being written — commit and push follow immediately after this report is saved, per the working method (fetch/rebase-check first, then commit, then push). See the final chat response for the resulting commit hash and push result.

## 10. Known limitations

- Assessment invitations remain entirely unbuilt (by design — see §3).
- The applications view has no pagination (`limit(200)`); acceptable for MVP scale, should be revisited before employer volumes grow meaningfully.
- Organisation settings does not yet support logo upload or colleague/team management (both out of scope per the brief).
- `employers.description_sv`/`description_en` are shown in Settings only if the underlying schema already supports them (confirmed present); no new columns were added.

## Rollback instructions

If the migration needs to be reverted in the connected environment:

```sql
DROP TRIGGER IF EXISTS employers_validate_before_write_trigger ON public.employers;
DROP FUNCTION IF EXISTS public.employers_validate_before_write();
DROP POLICY IF EXISTS "employers_owner_admin_update" ON public.employers;
```

This restores `employers` to its exact pre-H3.2 write-permission state (admin-only writes via `employers_admin_all`). No data is affected — the migration adds no columns and no rows. All frontend routes added in this phase (`applications`, `settings`) will then show their existing "could not save / access denied" error states rather than erroring uncleanly, since both server functions surface RLS/trigger denials as a generic user-facing message rather than a raw Postgres error.
