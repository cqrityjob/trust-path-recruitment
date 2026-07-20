# Phase H3.2 — Employer Dashboard Completion

**Scope:** turn the employer workspace into a coherent, secure MVP — navigation, account menu/logout, real organisation status, real dashboard statistics, working quick actions, job management, an employer-facing applications view, and an organisation-settings view/edit page.
**Not in scope:** assessment invitations (no backend exists), colleague invitations/role management, any future employer-intelligence functionality (billing, candidate search, analytics, etc).

> **Status update (H3.2.1, defect-fix pass):** Lovable Cloud applied the H3.2 migration successfully and its own preview test account passed all 16 checks. **Product-owner testing on a newly created employer then found four real defects that Lovable's test account did not surface** — a service-role dependency that crashed the dashboard for ordinary reads, a taxonomy bug that let a translated display label be submitted as `family_id`, untranslated (and in one case outright wrong) job-form option values, and unsafe raw-error exposure. All four are fixed, tested, and documented in **[the H3.2.1 section below](#h321--product-owner-defect-fix-pass)**. Do not treat §5's "Security and RLS conclusion" or §6's "Local test results" below as the current state of `employer-dashboard.functions.ts` or `applications.functions.ts` without reading that section — those two files were corrected in H3.2.1.

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

Committed as `5b08c23` (`feat: complete employer dashboard MVP (H3.2)`) and pushed to `origin/main` as a fast-forward. **Superseded by the H3.2.1 defect-fix commit below** — see [§H3.2.1 "Commit and push"](#h321--product-owner-defect-fix-pass) for that commit's hash.

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

---

# H3.2.1 — Product-Owner Defect-Fix Pass

**Scope:** fix four confirmed defects found by product-owner testing on a newly created employer, after Lovable Cloud had already applied the H3.2 migration and passed its own 16-point preview checklist. **No new functionality. No schema/RLS change. H3.3 (platform-admin employer moderation) explicitly not started — see "H3.3 deferred" below.**

## Lovable Cloud verification result (as reported)

- Migration `20260720064743_h3_2_employer_settings.sql` applied successfully.
- `employers_owner_admin_update` policy and `employers_validate_before_write_trigger` trigger both present.
- Existing RLS confirmed intact.
- Owner of a pending employer could save organisation settings; `status` stayed `pending`; `slug` stayed unchanged.
- All 16 preview checks passed **on Lovable's own test employer**.
- Repository tip remained `5b08c23` (no drift).

This confirms the H3.2 migration and its RLS/trigger are correct and did not need to change in this pass — see T14 below.

## Product-owner defects found afterward

### Defect 1 — employer dashboard runtime failure on a newly created employer

**Symptom:** `Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud.` Stack pointed at `createSupabaseAdminClient` → `getEmployerDashboardStats` → `employer-dashboard.functions.ts`.

**Root cause:** `getEmployerDashboardStats` verified the caller's membership via the RLS-scoped client, then switched to `supabaseAdmin` (service-role) for the three count reads — even though `jobs_employer_select_own` and `job_applications_employer_select` RLS already grant an employer member exactly the rows those counts need. The service-role client requires `SUPABASE_SERVICE_ROLE_KEY`; Lovable's own test account's environment happened to have that secret attached, so its 16-point check never exercised the failure path, but a newly created employer's session did.

A second, related bug in the same defect: `listApplicationsForEmployer`'s membership gate (`assertActiveEmployerMember`, in `applications.functions.ts`) called `employer_is_active_status()` (active-only), so opening the Applications page as a **pending** employer threw a hard `Forbidden: employer is not active` error — even though a pending employer legitimately has zero applications (it cannot yet have a published job) and the H3.2 spec requires it to be able to *view* that (empty) list without error.

**Fix:**
- `employer-dashboard.functions.ts`: all three count reads (`published`, `draft`, `applications`) now go through the caller's own `ctx.supabase` (RLS-scoped) client. `supabaseAdmin` is no longer imported anywhere in this file.
- `applications.functions.ts`: `assertActiveEmployerMember` renamed to `assertEmployerWorkspaceMember` and now checks `employer_members_can_edit()` (active/draft/pending — the same helper already gating job drafts) instead of `employer_is_active_status()` (active-only). `listApplicationsForEmployer`'s primary `job_applications` + `jobs` read now goes through `ctx.supabase`, not `supabaseAdmin`. The one remaining `supabaseAdmin` use in this function — looking up applicant display names in `public.profiles` — is kept and re-documented: `profiles` is self-select-only RLS by design (candidate data minimisation), so an employer's own RLS-scoped client structurally cannot join to it; this lookup is scoped to exactly the applicant IDs the RLS-scoped query above already authorised, only after `assertEmployerWorkspaceMember` has verified membership. `updateApplicationAsEmployer`'s write and `getApplicationCvSignedUrl`'s signed-URL creation keep their existing, separately-justified `supabaseAdmin` use (no `UPDATE` RLS policy exists on `job_applications` at all — function-mediated only, by original H1 design; signed URLs are inherently a service-role-only storage operation) — both are on-demand actions triggered after the list already loaded, not ordinary dashboard reads, so they are outside this defect's scope.

**Confirmed pending-employer behaviour after the fix:** dashboard loads without error; statistics are real (job counts real, applications count a real `0`, never fabricated); can create/edit/save job drafts (unchanged — already worked); cannot publish directly (unchanged); can view organisation settings; can view Applications (now a real empty list instead of a "Forbidden" error).

### Defect 2 — invalid canonical Career Family value (`family_id`)

**Symptom:** submitting a job for review failed with `Invalid family_id Säkerhet; must be a canonical Career Family`.

**Root cause:** `EmployerJobForm.tsx`'s `family_id` field was a raw free-text `<input>` with **no catalogue binding of any kind** — nothing constrained what an employer typed. The Swedish display label "Säkerhet" was typed directly into the field and submitted verbatim as the stored `family_id`. The database's own trigger (`jobs_validate_before_write` → `assert_cig_family_id()`) correctly rejected it — the schema-level guard was never the problem — but only at save/submit time, with no upfront guidance and a raw-looking error message.

**Canonical source of truth identified:** `assert_cig_family_id()` in the live schema (last redefined by `supabase/migrations/20260717172039_2633ba0f-...sql`, "Narrow the family whitelist to the 14 canonical IDs") accepts exactly:
```
protective_operations, public_safety_justice, corrections_secure_transport,
defence_national_security, corporate_security, critical_infrastructure_security,
risk_management, crisis_management, business_continuity_resilience,
cyber_information_security, financial_crime_compliance, security_technology,
security_leadership_governance, investigations_intelligence
```
This is **exactly** `src/lib/job-intelligence/career-area-labels.ts`'s `careerAreaLabels` array (id + sv/en name per canonical family) — already the source of truth for the public `/jobs` browsing pages. It is also exactly `src/lib/legacy/family-aliases.ts`'s `CANONICAL_FAMILY_IDS`. (Two other, older/adjacent taxonomies exist in the repo — `src/lib/career-center/profession-families.ts`, used only by the career-assessment engine, and the pre-Epic-2 legacy DB whitelist captured in `family-aliases.ts`'s `LEGACY_FAMILY_ALIASES`/`LEGACY_DB_KEBAB_ALIASES` — neither is what `jobs.family_id` validates against today; confirmed by reading the migration history, not assumed.)

**Value before the fix:** free text, unconstrained (any string, including a translated label).
**Value after the fix:** a `<select>` populated from `careerAreaLabels`, `value={f.id}` (canonical snake_case id), option text `{f.name[lang]}` (the sv/en display name) — the employer sees "Säkerhet"/"Security" etc. as a label, never types it, and the value submitted is always one of the 14 canonical ids.

**Migration/backfill assessed and found unnecessary:** `jobs_validate_before_write` fires on every `INSERT`/`UPDATE` of `public.jobs`, including the draft-save step (not only submit-for-review) — so a non-canonical `family_id` could never have been persisted through the employer UI in the first place; the trigger already prevented it, it just did so late and with a confusing error. No existing draft can contain a non-canonical `family_id` via this path. No backfill, no migration.

### Defect 3 — Swedish job-form options showing English/wrong values

**Symptom:** in Swedish view, workplace type and employment type showed raw English backend tokens.

**Root cause and canonical source of truth identified:** `src/lib/job-intelligence/enum-labels.ts` — already the single source of truth for these three fields' display labels on the public `/jobs` filter UI (`src/routes/jobs.index.tsx`) — defines the real, current values and sv/en labels:

| Field | Real DB values | sv label | en label |
|---|---|---|---|
| `workplace_type` (CHECK-constrained: `jobs_workplace_type_check`) | `onsite`, `hybrid`, `remote` | På plats / Hybrid / Distans | On-site / Hybrid / Remote |
| `employment_type` (no DB CHECK, but this is the established, sole set used) | `full_time`, `part_time`, `contract`, `temporary`, `internship` | Heltid / Deltid / Konsultuppdrag / Vikariat / Praktik | Full-time / Part-time / Contract / Temporary / Internship |
| `experience_level` (no DB CHECK) | `entry`, `mid`, `senior`, `lead` | Junior / Erfaren / Senior / Ledande befattning | Entry level / Mid level / Senior / Lead |

`EmployerJobForm.tsx` previously hardcoded its own `<option>` list for all three, showing the raw token as literal text in both languages. **Separately, and more seriously:** the `workplace_type` options used the value `"on_site"` (with an underscore) — the real, live `CHECK (workplace_type IN ('remote','hybrid','onsite'))` constraint only accepts `"onsite"` (no underscore). Selecting "on_site" and saving would have failed with a raw Postgres CHECK-violation error on *any* real save — this was reproduced and confirmed against the live schema (see T12).

**Fix:** the three `<select>`s now render from `enum-labels.ts`'s `*_VALUES` arrays with `*Label(v, lang)` for the option text — the identical module and pattern the public jobs page already uses, so there is one shared mapping, not a second one. `workplace_type`'s value is now the corrected `"onsite"`.

**Audit of the rest of the job form for the same class of bug:** `application_method`'s `<select>` also showed raw English literals (`external`/`email`/`internal`) in both languages — in scope per "audit the rest of the job form for raw English backend values appearing in Swedish mode." No existing sv/en label set for this specific field existed anywhere in the repo (the closest thing, `jobs.detail.apply_external`/`jobs.detail.apply_email`, is public call-to-action copy with different phrasing, not a category label), so three new dictionary key pairs (`employer.jobs.form.applicationMethod.{external,email,internal}`) were added — the real enum values (`external`/`email`/`internal`) are unchanged, no new value was added, `unavailable` remains intentionally excluded from this employer-facing form (unchanged from before this pass). `profession_slug` is free text with no reported or reproduced defect and no static client-side catalogue anywhere in the repo (`cig_professions` is DB-only); building a picker is new functionality, not a fix, and is out of scope here — see "Known limitations."

**Migration/backfill assessed and found unnecessary:** `workplace_type`'s bad value (`on_site`) would have been rejected by the live CHECK constraint on every save attempt, exactly like Defect 2 — no existing draft can contain it. `employment_type`/`experience_level`/`application_method` values were already correct (no DB constraint on those two, or already correct choices) — only their display, not their storage, was wrong. No backfill, no migration.

### Defect 4 — unsafe runtime error exposure

**Root cause:** the employer route tree had no route-level error boundary of its own; only the app-wide root `errorComponent` (English-only, generic "This page didn't load") existed, and it was not reliably reached in every failure mode observed. Defect 1's crash was the concrete instance, but nothing prevented any *other* unhandled failure in an employer route from doing the same.

**Fix:** new shared component `src/components/employer/EmployerErrorState.tsx`, wired as `errorComponent` on all six `/employer/$employerSlug/*` routes (Overview, Jobs list, New job, Edit job, Applications, Settings) — the same file everywhere, no per-route duplication. It never renders `error.message`, `error.stack`, or any internal detail; it shows only the exact required copy —
- sv: *"Arbetsgivarsidan kunde inte laddas. Försök igen eller logga in på nytt."*
- en: *"The employer workspace could not be loaded. Try again or sign in again."*
— with a "Try again" (re-invalidate + reset) and "Sign in again" (→ `/employer/login`) action, and logs the error server/browser-console-side via `console.error` only (no tokens, secrets, or candidate data ever appear in what this route tree can throw — its failures are membership/auth/query errors, not payload dumps).

## Files changed (H3.2.1)

**Modified**
- `src/lib/job-intelligence/employer-dashboard.functions.ts` — removed `supabaseAdmin`, all reads now via `ctx.supabase`
- `src/lib/job-intelligence/applications.functions.ts` — membership gate widened to active/draft/pending; `listApplicationsForEmployer`'s primary read moved to `ctx.supabase`; `profiles` lookup, application write, and CV signed-URL remain service-role, now more precisely documented
- `src/components/employer/EmployerJobForm.tsx` — `family_id` is now a `<select>` from `careerAreaLabels`; `workplace_type`/`employment_type`/`experience_level` now render from `enum-labels.ts` (and `workplace_type`'s value is corrected to `onsite`); `application_method` options translated
- `src/i18n/dictionaries.ts` — added `employer.jobs.form.applicationMethod.{external,email,internal}`, `employer.error.{heading,body,retry,signInAgain}` (sv/en pairs); updated `employer.jobs.form.field.familyId` copy (no longer says "(ID)", since the field is no longer a raw-ID input)
- `src/routes/_authenticated.employer.$employerSlug.index.tsx`, `...jobs.index.tsx`, `...jobs.new.tsx`, `...jobs.$jobId.edit.tsx`, `...applications.tsx`, `...settings.tsx` — each now sets `errorComponent: EmployerErrorState`

**New**
- `src/components/employer/EmployerErrorState.tsx`
- `tests/database/phase-h3-2-1/00_bootstrap.sql`, `01_fixtures.sql`, `02_run_tests.sql`

**Not touched:** no migration file, no RLS policy, no trigger, no other route, no other server function.

## Security impact

Strictly a reduction in privileged-access surface, not an expansion:
- Two read paths (`getEmployerDashboardStats`, the bulk of `listApplicationsForEmployer`) no longer use the service-role client at all — removing, not adding, a privilege dependency.
- The membership-gate widening (`employer_is_active_status` → `employer_members_can_edit`) only changes whether a legitimate, already-verified member of *their own* employer can reach a (possibly empty) result instead of a hard error — it never changes *which* employer's data is reachable. Tenant isolation is unaffected and independently reverified (T6: cross-tenant draft job and applications both still return 0; the one row a cross-tenant caller *does* see is the employer's already-public, published job — identical to what any anonymous visitor to `/jobs` can see, not new exposure).
- No RLS policy, trigger, or grant was added, removed, or altered — T14 confirms the `employers` policy/trigger inventory is byte-for-byte the same as the H3.2 baseline.
- `family_id`/`workplace_type` fixes make the client **stricter** (can now only submit values the server already accepted), not looser.
- The new error boundary strictly reduces information disclosure (no more raw env-var/stack-trace text reaching the browser).

## Tests performed

Local disposable Postgres 16, bootstrapped with only the roles/`auth.users`/`auth.uid()` primitives a real Supabase project supplies outside migration control, then **all 28 real migration files applied in order** (not a synthetic mock schema this time, since these fixes must be proven against the real, current `assert_cig_family_id()` whitelist and `workplace_type` CHECK constraint) — `tests/database/phase-h3-2-1/`. Four already-redundant migration files present in the repo (two full duplicates of earlier migrations under later timestamps, one storage-schema-only migration irrelevant to this schema, confirmed by direct content comparison — not modified, not deleted, simply not re-applied on top of their own already-applied duplicate) were skipped; every migration relevant to `employers`/`jobs`/`job_applications`/`cig_professions` applied cleanly. **14/14 tests pass:**

| # | Test | Result |
|---|---|---|
| T1 | Pending-employer owner reads own jobs via `authenticated` role only (no service_role) | 1 row (the draft) |
| T2 | Pending-employer owner reads own `job_applications` — must be empty, not an error | 0 rows, no error |
| T3 | Active-employer owner reads own jobs (2) and applications (1) — no regression | 2 jobs, 1 application |
| T4 | Candidate-only user (no membership anywhere) reads `employer_memberships` — the exact gate query dashboard/applications use | 0 rows |
| T5 | Candidate-only user cannot see employer B's **draft** job; correctly *can* see its already-**published** job (public visibility, not an employer view) | 0 draft / 1 published |
| T6 | Cross-tenant: employer A's owner cannot see employer B's draft job or applications; correctly *can* see B's published job | 0 draft / 1 published / 0 applications |
| T7 | Suspended-employer owner cannot see own jobs (`employer_members_can_edit` excludes `suspended`) — zero, not an error | 0 rows |
| T8 | Anon cannot see the pending employer's draft job | 0 rows |
| T9 | All 14 canonical `family_id` values (the exact set now in the form's `<select>`) accepted by the live trigger | all 14 succeed |
| T10 | The exact reported bad value, `family_id = 'Säkerhet'`, rejected with the exact reported error; column left unchanged | rejected, unchanged |
| T11 | `workplace_type = 'onsite'` (corrected form value) accepted | accepted |
| T12 | `workplace_type = 'on_site'` (old buggy form value) rejected by the live CHECK constraint | rejected |
| T13 | `employment_type`/`experience_level` values used by the corrected form round-trip cleanly | persisted correctly |
| T14 | `employers` policy/trigger inventory unchanged from the H3.2 baseline — confirms no migration was needed | unchanged (4 policies, 2 triggers, identical to H3.2) |

Plus, repo-wide: `bunx tsc --noEmit` clean; `bun run build` succeeds (`routeTree.gen.ts` unchanged — no new routes this pass); `bunx eslint` scoped to every H3.2.1-changed file shows only the pre-existing repo-wide `@typescript-eslint/no-explicit-any` convention (confirmed via diff that every flagged line is either unchanged or matches the established `Ctx = { supabase: any }` pattern), zero new issues; `bun run scripts/cie-check.ts` PASS (11/11 personas, unaffected — no engine code touched); `bun run scripts/kg-check.ts` OK (unaffected).

Items from the requested 28-point test list not independently automatable in this repo (no JS/TS unit-test runner is configured — verification methodology throughout this project has consistently been DB/RLS tests + tsc/build/lint/cie/kg + manual/code-review checks, not unit tests): session-expiry handling (#7) is unchanged, pre-existing `requireSupabaseAuth` middleware behaviour (an auto-generated integration file, explicitly out of scope to modify) — it already throws a controlled `"Unauthorized: ..."` error, now additionally caught by the new route-level error boundary if it ever surfaces past React Query's own `isError` handling. "No raw stack trace in the UI" (#8) is verified by code review: `EmployerErrorState` never interpolates `error.message`/`error.stack` into rendered output. "Create/edit/save/submit all use the same mapping" (#20) is guaranteed by construction, not merely tested: `EmployerJobForm.tsx` is the single component both `jobs.new.tsx` and `jobs.$jobId.edit.tsx` render, and `fromJobRow`/`toServerPayload` are its only (de)serialisation functions — there is no second, divergent code path to drift out of sync.

## Migration required

**No.** This entire pass is application-code only — no `CREATE`/`ALTER`/`DROP` statement was written, and T14 above directly confirms the live schema's `employers` policy/trigger inventory is unchanged from the H3.2 baseline. Nothing for Lovable to apply beyond syncing the commit.

## Minimal Lovable Cloud retest steps

1. Pull `main` after the H3.2.1 commit (below). **No migration to apply.**
2. As a **newly created (pending) employer** (not the existing Lovable test account — this defect only reproduced on a fresh one): open the dashboard → loads without any error, statistics show real numbers (a real `0` for applications, not dashes/error), Applications page opens with the empty state (no "Forbidden" error).
3. Create a job draft → open the "Yrkesområde"/"Career area" dropdown → confirm it shows real names ("Säkerhet-teknik" etc., not raw ids), save successfully.
4. In the same draft, set workplace type / employment type / experience level in Swedish view → confirm Swedish labels (På plats / Hybrid / Distans, etc.), save, then submit for review → no `family_id`/`workplace_type` error.
5. Switch to English, reload the same draft → same fields now show English labels; underlying saved values unchanged.
6. As a sanity check only (should be unaffected): repeat the existing H3.2 checklist (§8 above) on an **active** employer — dashboard stats, job management, applications list, settings save should all behave exactly as before this pass.
7. Report pass/fail per step — no further investigation, taxonomy work, translation work, or error-handling design should be required on Lovable's side.

## H3.3 deferred

Per instruction, **H3.3 — Platform Admin Employer Moderation is explicitly not started in this commit.** It remains a separate, future phase: a protected admin area to list pending employers, review company details, approve/reject/suspend, and record who made each decision and when, with audit logging — none of that exists yet and nothing in this pass builds toward it beyond what H3.2 already had (the existing `is_platform_admin()`/`employers_admin_all` primitives, unchanged).

## Commit and push

Committed with message `fix: resolve employer dashboard and job form defects` after confirming `origin/main` had not diverged; pushed as a fast-forward. See the final chat response for the exact commit hash.
