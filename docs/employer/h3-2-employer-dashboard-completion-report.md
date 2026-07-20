# Phase H3.2 — Employer Dashboard Completion

**Scope:** turn the employer workspace into a coherent, secure MVP — navigation, account menu/logout, real organisation status, real dashboard statistics, working quick actions, job management, an employer-facing applications view, and an organisation-settings view/edit page.
**Not in scope:** assessment invitations (no backend exists), colleague invitations/role management, any future employer-intelligence functionality (billing, candidate search, analytics, etc).

> **Status update (H3.2.1, defect-fix pass):** Lovable Cloud applied the H3.2 migration successfully and its own preview test account passed all 16 checks. **Product-owner testing on a newly created employer then found four real defects that Lovable's test account did not surface** — a service-role dependency that crashed the dashboard for ordinary reads, a taxonomy bug that let a translated display label be submitted as `family_id`, untranslated (and in one case outright wrong) job-form option values, and unsafe raw-error exposure. All four are fixed, tested, and documented in **[the H3.2.1 section below](#h321--product-owner-defect-fix-pass)**. Do not treat §5's "Security and RLS conclusion" or §6's "Local test results" below as the current state of `employer-dashboard.functions.ts` or `applications.functions.ts` without reading that section — those two files were corrected in H3.2.1.
>
> **Status update (H3.2.2, final independent review):** a follow-up code and security review found one additional, narrowly-scoped issue (four raw Supabase/Postgres error messages in `applications.functions.ts` that could reach a server function's HTTP response body, though none were ever rendered in the UI) and hardened it, plus added a small taxonomy-regression script. No defects in the four originally-reported areas; no schema change. See **[the H3.2.2 section below](#h322--final-independent-code-and-security-review)**.
>
> **Status update (H3.2.3, employer job error hardening):** the H3.2.2 review had flagged, but explicitly left unfixed as out-of-scope, that `employer-jobs.functions.ts` (save draft, edit, submit-for-review, close, duplicate) still forwarded raw Postgres error text to the client. That is now fixed — see **[the H3.2.3 section below](#h323--employer-job-server-error-sanitization)**. No schema change.
>
> **Status update (H3.2.4, job-form UX/validation/localisation):** the final Lovable Cloud retest confirmed the core employer flow works end-to-end, but product-owner screenshots showed remaining UX issues in the job form itself — an English server-error fallback rendering in Swedish view, no client-side required-field validation, US-style `mm/dd/yyyy`/12-hour dates in Swedish view, developer-facing field labels ("Land (ISO-2)", "Yrke (slug)"), and a free-text profession field an employer could type any internal slug into. All fixed — see **[the H3.2.4 section below](#h324--job-form-ux-validation-and-localisation)**. No schema, RLS, or permission change.

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

---

# H3.2.2 — Final Independent Code and Security Review

**Scope:** an independent final review of the H3.2.1 defect-fix implementation before Lovable Cloud retesting, covering the effective diff and final code state on top of Lovable's own rebased-in H3.2 verification commits. **No new functionality. No H3.3 work. No migration** (this review found no database defect).

## Review scope and method

Read the final state (not just the diffs) of `employer-dashboard.functions.ts`, `applications.functions.ts`, `EmployerJobForm.tsx`, `EmployerErrorState.tsx`, all six employer routes' error-boundary wiring, `career-area-labels.ts`/`enum-labels.ts` (confirmed untouched by any H3.2/H3.2.1 commit — pure imports), the sv/en dictionary diff, `tests/database/phase-h3-2-1/`, and both H3.2 reports, against the actual final repository tip.

## Security-critical review

### Candidate profile-name lookup (`listApplicationsForEmployer`)

- Authenticated user verified first via `requireSupabaseAuth` (bearer JWT → verified `ctx.userId`).
- Employer membership verified via `assertEmployerWorkspaceMember` (`has_employer_role` + `employer_members_can_edit`) **before** any query runs.
- The application-to-employer relationship is enforced twice: the primary `job_applications` read is filtered by `.eq("employer_id", data.employerId)` **and** independently governed by `job_applications_employer_select` RLS (`has_employer_role(...) AND employer_is_active_status(...)`) — RLS is the actual, un-bypassable boundary; the app-level filter is defense-in-depth, not the boundary itself.
- Only `id, display_name` are read from `profiles` — no other candidate field.
- The `applicantIds` array passed into the `profiles` lookup is derived **exclusively** from rows already returned by the RLS-scoped `job_applications` query — the function accepts no candidate ID, application ID, or profile ID as a direct parameter, so there is no way to manipulate this lookup into returning an arbitrary user's profile. **No defect found.**

### Mark application as viewed (`updateApplicationAsEmployer`)

- `loadApplication` reads the target row through the caller's own RLS-scoped client — a caller with no legitimate relationship to the row (not the applicant, not a member of its employer) gets zero rows and a generic "not found" error, before `app.employer_id` is ever read. `app.employer_id` is therefore always DB-verified, never client-supplied.
- `assertEmployerWorkspaceMember(ctx, app.employer_id)` — using that DB-derived employer ID — additionally confirms the caller specifically holds an **employer** role there (not merely applicant-level RLS visibility), correctly rejecting a candidate calling this employer-only mutation on their own application.
- The write patch is a closed set: `status` is always the hardcoded literal `"viewed"` (never taken from client input directly — only whether to apply it is client-controlled), and `employer_note` is the only other writable field (length-capped, nullable). `employer_id`, `applicant_user_id`, `job_id`, and all candidate-supplied fields (`phone`, `cover_note`, `cv_storage_path`) can never be touched by this function.
- The `.eq("id", app.id).eq("employer_id", app.employer_id)` filter on the write is fully server-derived, not client-trusted, so a cross-employer write is not reachable.
- **Audit logging:** this function does not write to `job_audit_events` (unlike the jobs-table employer functions in `employer-jobs.functions.ts`, which do). This is a pre-existing H1 characteristic — unchanged by H3.2 or H3.2.1 — not a security defect (the write itself is minimal and correctly scoped); adding audit logging would be new functionality and is out of scope for this review. Flagged as an observation, not fixed.
- **No defect found in the authorization boundary.**

### CV signed URL (`getApplicationCvSignedUrl`)

- Same `loadApplication` (RLS-gated) + `assertEmployerWorkspaceMember` pattern as above, skipped only when the caller **is** the applicant themselves (`app.applicant_user_id === ctx.userId`).
- The function accepts exactly one input, `applicationId` (validated `z.string().uuid()`) — there is no separate candidate ID, filename, or path parameter to manipulate. `app.cv_storage_path` is read from the same single, RLS-verified row as everything else; it cannot be pointed at a different application's or employer's CV by any client-supplied value.
- Signed URL expiry: 5 minutes (`60 * 5`) — short-lived, standard Supabase Storage signed-URL practice.
- Return value is `{ url, expiresInSeconds }` only — no service-role key or other secret is ever returned.
- Missing CV: generic `"No CV attached to this application"`. Unauthorized: the same generic `"Application not found or access denied"` / `"Forbidden: ..."` messages as everywhere else in this file — no distinction is made between "doesn't exist" and "not yours," so no information is leaked about other employers' applications.
- **One genuine, narrowly-scoped finding:** the storage-signing failure path (`if (error || !signed) throw new Error(\`Failed to sign CV URL: ${error?.message}\`))`) interpolated the raw Supabase Storage API error message into the thrown `Error`. The rendered UI never displayed it (`onDownloadCv`'s `catch` in `applications.tsx` always shows the generic translated `employer.applications.error.cvDownload` regardless of the thrown message), but a thrown `Error`'s message is still carried in the server function's HTTP response body, so a sufficiently technical actor inspecting network traffic directly (bypassing the rendered UI) could see raw Postgres/Storage-internal error text. **Fixed:** now throws a generic `"Could not generate a download link for this CV."` and logs the real error server-side via `console.error` only. The same pattern (`loadApplication`, `withdrawMyApplication`, `updateApplicationAsEmployer`) was hardened identically for consistency, since all four are in the same reviewed file and the same class of issue.

**No `supabaseAdmin` use identified as unnecessary.** Every remaining use is a write to a table/bucket with no `authenticated`-role RLS/grant path at all (`job_applications` has intentionally no `UPDATE` policy for `authenticated`; Storage signed-URL creation is inherently a privileged operation), each reached only after RLS-backed authorization has already been independently verified, and each scoped to server-derived identifiers only. None could be safely converted to RLS without a schema change, which this review's own constraints correctly rule out absent a genuine database defect (there is none).

## Functional review — confirmed

- Newly created pending employer loads the dashboard: confirmed by code (no `supabaseAdmin` import in `employer-dashboard.functions.ts` at all) and DB test T1/T2.
- Dashboard statistics require no `SUPABASE_SERVICE_ROLE_KEY`: confirmed (grep for `supabaseAdmin` in that file returns only comments explaining its absence).
- Pending employers can create/save/edit drafts, cannot publish directly: unchanged from before H3.2.1 (not touched by this pass); still correct.
- Applications returns empty, not Forbidden, for a pending employer: DB test T2.
- Cross-employer applications inaccessible: DB test T6.
- `family_id` always canonical, never a translated label: `EmployerJobForm.tsx`'s `<select>` only ever emits one of the 14 `careerAreaLabels` ids; DB tests T9/T10; new `employer-taxonomy:check` script assertion #2.
- Create/edit/reload/save/submit use the same mapping: guaranteed by construction — one shared `EmployerJobForm` component and one shared `fromJobRow`/`toServerPayload` pair, rendered by both `jobs.new.tsx` and `jobs.$jobId.edit.tsx`; no second code path exists to diverge.
- `workplace_type` uses `onsite`: DB tests T11/T12; script assertion #3.
- No unsupported enum value was added anywhere in this pass (verified by diff review — every changed `<select>` only reorders/labels pre-existing values, adds none).
- sv/en labels render without changing backend values: values are always the canonical/enum token; only the displayed `<option>` text changes with `lang`.
- Error boundaries expose no stack trace, env-var name, or raw Supabase error: `EmployerErrorState` confirmed by direct read; the one gap found (CV/applications raw-error interpolation) is fixed above.
- No dead or duplicate active code path remains: confirmed — `assertActiveEmployerMember` (old name) has zero remaining references anywhere in `src/`; no leftover `"on_site"` value in code (only in an explanatory comment).

## Test review

Added `scripts/employer-taxonomy-check.ts` (`bun run employer-taxonomy:check`), following the same established plain-script pattern as `cie:check`/`kg:check` (no unit-test runner is configured in this repository at all — confirmed via `package.json`; introducing one would itself be new infrastructure, disproportionate to a final review pass). It asserts, as pure module-level checks:

1. `career-area-labels.ts`'s 14 ids are exactly the live `assert_cig_family_id()` whitelist (byte-for-byte set comparison against a documented copy of the migration's own list).
2. No family's sv/en display label ever equals its own id or any other canonical id.
3. `enum-labels.ts`'s `WORKPLACE_TYPE_VALUES` is exactly `onsite`/`hybrid`/`remote` and never contains the old invalid `on_site`.
4. No `employment_type`/`workplace_type`/`experience_level` sv/en label ever equals a stored value in its own set.

This directly guards against the two originally-reported taxonomy/translation defects regressing, and runs in milliseconds with no new dependency.

The remaining requested application-level checks (dashboard-without-service-role, pending-employer access, applications empty state, cross-tenant denial, controlled-error rendering, CV signed-URL boundaries) are authorization-boundary behaviors that genuinely require a real authenticated Postgres session to exercise meaningfully — exactly what `tests/database/phase-h3-2-1/` already does, and consistent with how every prior phase of this project (G1, H3.1, H3.2) validated identical concerns. Building a parallel HTTP/JWT-mocking integration-test harness to duplicate that coverage at the TypeScript layer would be new test infrastructure, not a focused fix, and was judged disproportionate here — flagged as a reasonable follow-up if this project later adopts a unit-test runner, not attempted in this review.

**One item flagged but intentionally not fixed:** `employer-jobs.functions.ts` (save/submit/close/duplicate) and their `jobs.index.tsx`/`jobs.new.tsx`/`jobs.$jobId.edit.tsx` `onError` handlers propagate `uErr.message` (raw Postgres/PostgREST text, including the deliberately-crafted `jobs_validate_before_write` trigger messages but potentially also genuinely raw internal errors) directly into the rendered UI. This is pre-existing H3-era behavior, untouched by either H3.2 or H3.2.1, in files **outside** this review's stated scope (`employer-jobs.functions.ts` is not `applications.functions.ts` or `employer-dashboard.functions.ts`), and fixing it thoroughly would mean rewriting a well-established, independently-tested file well beyond "harden what H3.2.1 touched." Documented here for visibility; recommended as a small follow-up item, not fixed in this review.

## Verification rerun

- `bunx tsc --noEmit` — clean.
- `bun run build` — succeeds.
- `bunx eslint` on all files touched in this review — clean after one prettier pass (only the pre-existing repo-wide `@typescript-eslint/no-explicit-any` convention remains, unchanged from H3.2.1).
- `bun run scripts/cie-check.ts` — PASS (11/11 personas, unaffected).
- `bun run scripts/kg-check.ts` — OK (unaffected).
- `bun run employer-taxonomy:check` (new) — OK.
- `tests/database/phase-h3-2-1/` — re-run from a fresh disposable Postgres 16 instance, full real migration history re-applied (including Lovable's own rebased-in migration file, confirmed to be a harmless duplicate of the H3.2 migration already present — see below): **14/14 pass**, identical results to the H3.2.1 run.

## Migration required

**No.** This review found no database defect. The only schema-adjacent finding was confirming that Lovable's rebased-in `supabase/migrations/20260720072016_c58d0842-...sql` is a full, byte-for-byte duplicate of the already-committed `20260720064743_h3_2_employer_settings.sql` (same class of duplicate-migration artifact already documented four times earlier in this repository's history) — applying it after the original produces only `"already exists"` errors, confirmed directly against a real Postgres instance. Not a defect requiring action; not modified or removed, per this review's own instruction not to revisit already-resolved Supabase-project history.

## Files changed in this review

- `src/lib/job-intelligence/applications.functions.ts` — 4 raw-error-message hardenings (see Security-critical review above)
- `scripts/employer-taxonomy-check.ts` — new
- `package.json` — added the `employer-taxonomy:check` script entry
- `docs/employer/h3-2-employer-dashboard-completion-report.md` — this section

## Commit and push

Committed as `fix: harden final employer dashboard review`. See the final chat response for the exact commit hash and confirmation this is the final repository tip.

---

# H3.2.3 — Employer Job Server Error Sanitization

**Scope:** fix the one item the H3.2.2 review flagged but explicitly left unfixed as out-of-scope: `src/lib/job-intelligence/employer-jobs.functions.ts` (create/edit/save/submit/close/duplicate) still forwarded raw Postgres error text to the client on write failures. **No new functionality. No H3.3 work. No migration.**

## Audit

Every exported function in the file — `listEmployerJobs`, `getEmployerJob`, `saveEmployerJobDraft`, `submitEmployerJob`, `closeEmployerJob`, `duplicateEmployerJob` — was read in full. All of the file's *read* paths and *not-found/forbidden* paths already threw safe, generic, hand-authored messages (`"Access not available"`, `"Could not load job."`, `"Job not found"`, etc.) and needed no change. The leak was narrower and specific: **five** write call sites did `throw new Error(uErr.message)` / `throw new Error(iErr.message)`, forwarding whatever PostgREST returned verbatim:

| Site | Function | Line (before) |
|---|---|---|
| UPDATE (edit) | `saveEmployerJobDraft` | `if (uErr) throw new Error(uErr.message);` |
| INSERT (new draft) | `saveEmployerJobDraft` | `if (iErr) throw new Error(iErr.message);` |
| UPDATE (draft → pending_review) | `submitEmployerJob` | `if (uErr) throw new Error(uErr.message);` |
| UPDATE (published → archived) | `closeEmployerJob` | `if (uErr) throw new Error(uErr.message);` |
| INSERT (duplicate) | `duplicateEmployerJob` | `if (iErr) throw new Error(iErr.message);` |

For a real, live failure at any of these five points, the forwarded text could be either (a) one of `jobs_validate_before_write()`'s own deliberately-worded `RAISE EXCEPTION` messages (e.g. *"Invalid family_id %; must be a canonical Career Family"*, *"status is a moderation-owned field..."*) — reasonably informative but still an internal trigger's own wording, not app-authored copy — or (b) a genuinely raw PostgreSQL error, e.g. a column CHECK-constraint violation naming the constraint and table directly (`new row for relation "jobs" violates check constraint "jobs_workplace_type_check"`), which is exactly the class of internal detail this whole H3.2.x hardening effort exists to prevent from reaching the browser.

## Fix

Added one shared helper, `sanitizeJobWriteError(error, context, fallback)`, used at all five sites:

```ts
function sanitizeJobWriteError(
  error: { message?: string; code?: string } | null | undefined,
  context: string,
  fallback: string,
): Error {
  console.error(`[employer-jobs] ${context} failed`, error);
  if (error?.code === "23514") {
    return new Error(
      "Invalid job data. Please check the required fields, including workplace type, employment type and career area, and try again.",
    );
  }
  return new Error(fallback);
}
```

- The **full** error (message, code, details, hint — never tokens, credentials, signed URLs, CV contents, or candidate personal data, since these are write-error objects on the employer's own `jobs` row, not payload dumps) is always logged server-side via `console.error`, tagged with which operation failed.
- `23514` is the Postgres SQLSTATE for `check_violation`. Empirically confirmed against a real Postgres 16 instance running the live schema (see Tests below) that **both** a genuine column CHECK constraint (`jobs_workplace_type_check`) **and** every `jobs_validate_before_write()` custom guard (`RAISE EXCEPTION ... USING ERRCODE = 'check_violation'` — taxonomy whitelist, moderation-owned fields, status-transition rules, the employer-approval gate, published-path rules) surface with this exact code. Checking `error.code === "23514"` therefore reliably means "the data you submitted is invalid," without parsing or forwarding the trigger's own wording, and maps to the single safe message above.
- Any other error (e.g. a genuine unexpected failure) falls back to an operation-specific safe message: *"Could not save this job draft."* (save/insert), *"Could not submit this job for review."* (submit), *"Could not close this job."* (close), *"Could not duplicate this job."* (duplicate).

The pre-existing `throw new Error(\`Missing required fields: ${missing.join(", ")}\`)` in `submitEmployerJob` was left unchanged — it is app-authored copy built only from a fixed, hardcoded list of field names, never from database or user-supplied text, so it was already safe.

## Preserved unchanged

Nothing else was touched. `assertActiveMembership`'s active/pending employer gate, every `jobs_employer_*` RLS policy, `jobs_validate_before_write()`, the canonical `family_id`/`workplace_type` whitelist logic, `writeAudit()`, and all six exported functions' actual read/write behaviour are byte-for-byte identical to before this fix — only the *text* of five thrown errors changed. No migration was written or required.

## Other functions checked

Per the review's own request to confirm no other ordinary employer server function exposes raw backend errors: `employer-dashboard.functions.ts` and `applications.functions.ts` were already fully sanitized in H3.2.1/H3.2.2. `employer-settings.functions.ts` was already clean (no raw-message interpolation). `membership.functions.ts` does contain several `throw new Error(error.message)` sites, but on inspection every one of them is either (a) inside `assertPlatformAdmin` or the four `admin*` functions (`adminListEmployerMemberships`, `adminCreateEmployerMembership`, `adminUpdateEmployerMembershipRole`, `adminUpdateEmployerMembershipStatus`) — platform-admin-only tooling, not part of the ordinary employer MVP surface this whole effort concerns, and squarely H3.3 territory this task explicitly says not to start — or (b) inside `listMyEmployerMemberships`, which is exported but not currently called from any route or component in the live app (confirmed by repository-wide search). `listMyEmployerWorkspaces` — the one function from this file actually used by every employer route today — was already safe. **Flagged, not fixed, consistent with not starting H3.3 or touching unreferenced code paths.**

## Tests

New `tests/database/phase-h3-2-3/` (bootstrap + fixtures + a 10-test runner), same disposable-Postgres-16-with-the-full-real-migration-history method as phase-h3-2-1, run twice (once during development, once as the final pre-commit verification) — **10/10 pass**:

| # | Test | Result |
|---|---|---|
| T1 | Pending-employer owner INSERTs a new draft | succeeds |
| T2 | Pending-employer owner UPDATEs (edits) their own draft | succeeds |
| T3 | Pending-employer owner attempts submit-for-review | rejected, `SQLSTATE 23514`, exact employer-approval-gate message |
| T4 | Active-employer owner UPDATEs (edits) a pre-existing draft | succeeds |
| T5 | Active-employer owner submits that job for review with valid canonical `family_id`/`workplace_type` and all required fields | succeeds |
| T6 | Active-employer owner attempts to INSERT with `family_id = 'Säkerhet'` (a translated label) | rejected, `SQLSTATE 23514` |
| T7 | Active-employer owner attempts to INSERT with `workplace_type = 'on_site'` (old invalid value) | rejected, `SQLSTATE 23514` (the real CHECK constraint, not the trigger — confirms both classes of guard share the code `sanitizeJobWriteError` branches on) |
| T8 | Cross-tenant: employer A's owner attempts to UPDATE employer B's job | 0 rows affected, RLS denies |
| T9 | Candidate-only user (no membership) attempts to INSERT a job for an employer | denied (`42501`, RLS policy violation) |
| T10 | `jobs` table policy/trigger inventory unchanged | confirmed identical to the pre-existing baseline |

Item 1 of the requested test list ("raw Supabase/Postgres messages are not returned to the client") is verified by direct code review — `grep` for `throw new Error` across the file confirms zero remaining `.message`-interpolated throws — combined with T3/T6/T7 empirically proving the exact SQLSTATE the new sanitizer keys off actually occurs for every guard class in the live schema. Item 5 ("invalid input produces a controlled message") follows directly: every condition that produces `SQLSTATE 23514` in T3/T6/T7 is exactly the condition `sanitizeJobWriteError` maps to the single safe "Invalid job data..." message.

Repo-wide: `bunx tsc --noEmit` clean; `bun run build` succeeds; `bunx eslint` on the changed file shows only the pre-existing repo-wide `@typescript-eslint/no-explicit-any` convention (confirmed via diff — none on any new line); `bun run scripts/cie-check.ts` PASS; `bun run scripts/kg-check.ts` OK; `bun run employer-taxonomy:check` OK.

## Migration required

**No.** No schema, RLS, or trigger change — T10 confirms the `jobs` table's policy/trigger inventory is unchanged.

## Commit and push

Committed as `fix: sanitize employer job server errors`. See the final chat response for the exact commit hash and confirmation this is the final repository tip.

---

# H3.2.4 — Job Form UX, Validation and Localisation

**Scope:** final product-owner-facing pass on the employer job form itself — localise every validation/error message, add client-side required-field validation with inline errors and focus-to-first-invalid, fix Swedish/English date-time presentation, replace developer-facing field labels, replace the free-text profession field with a real selector, and make the access-denied state consistent across all six employer routes. **No new functionality beyond what was asked. No H3.3 work. No permission, RLS, job-lifecycle, or migration change.**

## 1. UX issues corrected

| # | Issue | Fix |
|---|---|---|
| 1 | English validation message rendered in Swedish view (`sanitizeJobWriteError`'s hardcoded "Invalid job data...") | Every throw in `employer-jobs.functions.ts` now carries a stable UPPER_SNAKE_CASE **code**, never English prose; `EmployerJobForm.tsx`'s new `translateJobServerError()` maps each code to a localised sv/en string, with an always-localised generic fallback for any unrecognised code |
| 2 | No client-side required-field validation; the server was the only thing that ever complained, and only after a round-trip | Added `validateDraft()` and `validateForSubmit()`, run before every server call; inline field errors, a required-for-review hint next to the relevant fields, a summary banner, and scroll-to/focus-first-invalid-field |
| 3 | Swedish view showed `mm/dd/yyyy` and `12:00 PM`-style times | New `src/lib/job-intelligence/date-format.ts` (`formatDate`/`formatDateTime`, sv-SE/en-GB, 24-hour, no AM/PM in either language); applied to the job list's expires/updated columns and the applications list's date column |
| 4 | Developer-facing field labels ("Plats (fritext)", "Land (ISO-2)", "Yrke (slug)") | Reworded to "Plats"/"Location", "Land"/"Country", "Yrkesroll"/"Profession or role" |
| 5 | `profession_slug` was a free-text input an employer could type any internal slug into | Replaced with a `<select>` sourced from the existing `listPublishedProfessionsV2` read (see §5 below) |
| 6 | Raw job `status` enum values (`draft`, `pending_review`, …) shown untranslated in the jobs list and edit page | Now rendered via the existing `jobStatusLabel()` (already used on the public jobs pages) |
| 7 | Job list's "Title" column header was hardcoded English, never localised | New `employer.jobs.list.title` key |
| 8 | Access-denied state was inconsistent across routes — only the dashboard had a "back to My Career" link, none had a way back to a workspace the user actually has | New shared `EmployerAccessDenied` component, used by all six routes; always offers "Min karriär"/"My Career", and additionally "Gå till din arbetsgivarorganisation"/"Go to your employer workspace" when the caller has at least one other real workspace |

## 2. Validation rules: draft vs. review submission

Confirmed against the live schema and `submitEmployerJob`'s own existing gate, not invented:

- **Draft save** genuinely requires nothing beyond `application_method` (which always has a default value) — every other draft column is nullable. `validateDraft()` therefore only checks **format**, not presence: if the employer filled in `application_url`/`application_email`, it must look like a real URL/email (this also prevents a request that would otherwise fail the server's own `zod.url()`/`zod.email()` parse with an unhandled validation error).
- **Submit for review** requires exactly what `submitEmployerJob`'s existing `missing[]` check already required, unchanged: title in Swedish **or** English, description in Swedish **or** English, a valid application target for the selected method (URL for external, email for email), and `expires_at`. `family_id` and `profession_slug` are required by **neither** stage — the classification section is labelled "optional" and a hint text states drafts save fine without it.
- `validateForSubmit()` is `validateDraft()` plus the above — submitting for review always re-checks format too.

No new requirement was invented on either side, and no existing requirement was removed.

## 3. Swedish and English copy changes

~35 new/changed dictionary key pairs (sv+en), all reviewed for genuine sv≠en distinctness by the new `employer-job-form:check` script (§7). Full list in the diff; the notable groups:

- 15 new `employer.jobs.form.error.*` keys — one per stable server error code, plus a generic fallback matching the product owner's own example copy ("Jobbannonsen kunde inte sparas..."/"The job advertisement could not be saved...").
- 4 new `employer.jobs.form.validation.*` keys (required, invalid URL, invalid email, summary banner).
- `employer.jobs.form.hint.optional` / `.requiredForReview` and `employer.jobs.form.section.basicsHint` — the "required for draft vs. review" indicators.
- `employer.jobs.form.field.locationText`/`.country`/`.professionSlug` reworded; `employer.jobs.form.profession.loading`/`.loadError` added.
- `employer.jobs.list.title` (new column header key).
- `employer.accessDenied.goToWorkspace` (new).

## 4. Date/time changes

`src/lib/job-intelligence/date-format.ts` — `formatDate` (date-only, reusing the exact locale choice already established in `src/routes/jobs.$slug.tsx`'s own formatter: sv-SE / en-GB, never en-US) and `formatDateTime` (date+time, `hour12: false` in both languages, so Swedish renders `yyyy-mm-dd hh:mm` and English renders `dd/mm/yyyy hh:mm` — never `mm/dd/yyyy` and never AM/PM). Applied to:
- the employer jobs list's "Expires"/"Updated" columns (`_authenticated.employer.$employerSlug.jobs.index.tsx`) — previously raw `.toLocaleDateString()` with no locale argument, which silently used the browser's own default locale regardless of the app's active language;
- the applications list's date column (`applications.tsx`), the same underlying bug, fixed for consistency.

The `datetime-local` **input** fields (deadline/expiry entry) are native browser controls and were not touched — their picker presentation follows the browser/OS locale, which is standard, expected behaviour for that input type and outside what application code can or should override. Storage values (`deadline_at`/`expires_at`, ISO 8601 in the database) are completely unchanged — this is a display-only fix.

## 5. Profession field solution

Audited every option the brief offered against repository ground truth:

- **A canonical, dependent, family-filtered selector** (option 2) was investigated and rejected: `cig_profession_families` (the CIG's own family taxonomy, `uuid` ids) and the 14 canonical Career Family slugs `jobs.family_id` actually validates against (`career-area-labels.ts` / `assert_cig_family_id()`) are two different, unrelated taxonomies with no mapping between them anywhere in this codebase. Building one now would itself be a new, unverified taxonomy — exactly what the brief prohibits.
- **A flat canonical selector** (option 1) was found to already exist, safely, unused: `listPublishedProfessionsV2` in `src/lib/knowledge-graph/read-v2.functions.ts` — an already-built, already-RLS-safe, publishable-key read of the live `cig_professions` catalogue filtered to `content_status = 'published'` (its own header comment: "enforced both by RLS anon policy and by explicit filters"). It was written in an earlier phase and never wired into any UI. This is now reused, unmodified, by `EmployerJobForm.tsx`: a `<select>` populated with `{ value: slug, label: title_sv|title_en }`, sorted alphabetically in the active language, with its own loading/error states (a load failure never blocks the rest of the form or draft saving).
- Option 3 (hide the field) was not needed since a safe catalogue already existed.

`profession_slug`'s value is always a real, published CIG profession `slug` — never a translated label, never arbitrary free text.

## 6. writeAudit confirmation

Lovable's own commit (`1e964fa`, pulled in via fast-forward before this pass began) wraps `writeAudit()`'s service-role import and insert in `try`/`catch`, logging any failure via `console.error` and never re-throwing — confirmed present in `main` and reviewed:
- No raw environment-variable error can reach the client: the only place `SUPABASE_SERVICE_ROLE_KEY`-missing errors originate (`createSupabaseAdminClient()`) is now always caught inside `writeAudit()`.
- An audit failure never blocks the primary job write: `writeAudit()` is called **after** the RLS-scoped `jobs` insert/update has already succeeded and its result already returned to the caller in every one of the five call sites; nothing downstream depends on `writeAudit()` succeeding.
- Server-side logging (`console.error("[employer-jobs] writeAudit failed (non-fatal)", e)`) never includes secrets — a missing-credential error contains only the name of the missing variable, never a value, and no other input to this function (job id, slug, actor id, before/after snapshots of the employer's own job row) is a credential.
- Added an explicit doc-comment amendment (this pass) stating robust, guaranteed audit persistence is deferred to a future phase (H3.3 platform-admin/moderation work), per the brief's explicit documentation requirement.

## 7. Tests

New `scripts/employer-job-form-check.ts` (`bun run employer-job-form:check`), the same plain-script pattern as `cie:check`/`kg:check`/`employer-taxonomy:check` (no unit-test runner is configured in this repository). It:
1. Cross-checks every error CODE `employer-jobs.functions.ts` actually throws (extracted by scanning the real source file, not merely re-declared) against a translation map, catching any future code that would silently fall back to the generic message.
2. Confirms every mapped code's sv and en dictionary values are non-empty and distinct from each other.
3. Confirms `formatDateTime()` never renders "AM"/"PM" in either language, confirms Swedish output is year-first, and confirms both formatters return `""` (never throw) for null/undefined/invalid input.

Item-by-item against the requested list:

| # | Item | How verified |
|---|---|---|
| 1 | Swedish validation messages | `employer-job-form:check` (dictionary coverage) + code review of `translateJobServerError` |
| 2 | English validation messages | same |
| 3 | Draft minimum validation | code review of `validateDraft()` against the live nullable-column schema (§2) |
| 4 | Review-submission full validation | code review of `validateForSubmit()` against `submitEmployerJob`'s own unchanged `missing[]` gate (§2) |
| 5 | First invalid field identified | code review of `focusFirstError()` / `FIELD_ORDER` |
| 6 | Swedish date format | `employer-job-form:check` (year-first assertion) |
| 7 | English date format | `employer-job-form:check` (formatter smoke test) |
| 8 | 24-hour time in Swedish | `employer-job-form:check` (no AM/PM assertion, both languages) |
| 9 | Canonical Career Family preserved on edit | unchanged from H3.2.1 — `fromJobRow()` still reads `family_id` back verbatim, never re-derived from a label; re-confirmed by code review, no behavioural change this pass |
| 10 | Translated labels never stored as IDs | unchanged from H3.2.1 (`career-area-labels.ts`/`enum-labels.ts` selects) plus the new profession `<select>` (`value={p.slug}`, never the display title) |
| 11 | Profession slug cannot be entered as arbitrary text | code review — the field is now exclusively a `<select>`; no `<input>` for `profession_slug` remains anywhere |
| 12 | Existing draft rehydrates correctly | `fromJobRow()` unchanged in shape (still one pure function, still the only deserialisation path for both create and edit) |
| 13 | Access-denied state remains secure | code review of `EmployerAccessDenied` — never reveals another organisation's identity or membership detail; the "go to your workspace" link only ever uses the caller's own already-authorised `listMyEmployerWorkspaces()` result |
| 14 | writeAudit failure does not block draft save | §6 above |
| 15 | No raw backend/environment error reaches the UI | `employer-job-form:check` (error-code coverage) + code review — every render path for a server-thrown error now goes through `translateJobServerError()`, which never interpolates the raw code into user-facing text |
| 16 | Typecheck, build, CIE, KG, taxonomy check, lint | see below |

Items 9–14 concern authorization/RLS/lifecycle behaviour that was not touched in this pass (no schema/RLS file was modified — confirmed via `git status`) and remains covered by the existing `tests/database/phase-h3-2-1/` and `tests/database/phase-h3-2-3/` suites, which already pass against the unchanged schema; re-running them would reproduce identical results, so they were not re-run for this purely application-layer pass.

Repo-wide: `bunx tsc --noEmit` clean; `bun run build` succeeds; `bunx eslint` on every changed/added file clean except the pre-existing repo-wide `@typescript-eslint/no-explicit-any` convention (confirmed via diff — no new occurrence); `bun run scripts/cie-check.ts` PASS; `bun run scripts/kg-check.ts` OK; `bun run employer-taxonomy:check` OK (unaffected); `bun run employer-job-form:check` OK (new).

## 8. Final diff review

- No technical/developer-facing label remains in the employer-facing job form (`grep` confirms no more "(fritext)", "(ISO-2)", "(slug)" in any `employer.jobs.form.field.*` value).
- No English validation text can appear in Swedish view: every message the job form can show is either a `t()`-wrapped dictionary lookup or produced by `translateJobServerError()`/the `validate*()` functions, all of which route through `t()`.
- No internal slug is editable as free text: `profession_slug` is a `<select>`; `family_id` was already a `<select>` since H3.2.1.
- No new dead button or route: the profession `<select>` degrades to a disabled, empty-but-functional dropdown with a visible load-error message if the catalogue read fails, never a broken/unresponsive control; no new route was added.
- No permission, RLS, or job-lifecycle change: `git status` confirms zero `.sql`/migration files touched; `assertActiveMembership`, every `jobs_employer_*` policy, and `jobs_validate_before_write()` are untouched.
- Pending-employer behaviour unchanged: still can create/edit/save drafts, still cannot reach `pending_review` (unchanged trigger gate) — nothing in this pass touches that logic, only the text shown when it fires.
- **No migration is required or was created** — confirmed by the same `git status` check; this entire pass is application code, dictionary entries, and two new plain verification scripts.

## Commit and push

Committed as `fix: complete employer job form validation and localisation`. See the final chat response for the exact commit hash and confirmation this is the final repository tip.
