# H3.3 — Platform Admin Employer Moderation

Status: implemented and tested locally (disposable Postgres 16, real migration
history). Not yet verified against Lovable Cloud — that verification is the
only remaining step, per the Lovable handoff at the end of this document.

**Final integrity review (this pass)**: closed the `adminUpsertEmployer()`
arbitrary-status-write gap identified in §1's original audit — an existing
employer's status can no longer be changed through that tool at all; see
§16 for the full account (what was found, how it was closed, and the tests
added). No new migration was required — this was an application-layer-only
fix; the database schema and `moderate_employer()` RPC are unchanged from
commit `e2c2dac52b14ea9d21643397557662d081fa76b5`.

## 1. Current-state audit (ground truth confirmed before writing any code)

- **Admin representation** — `is_platform_admin(uuid)` (Phase G1, `SECURITY
  DEFINER`): `has_role(_user_id,'admin') OR has_role(_user_id,'superadmin')`,
  backed by `user_roles`/`app_role`. Unchanged, reused as the single source of
  truth for "is this user an admin" everywhere in H3.3 — server functions,
  the new RPC, the admin login page, and the protected admin layout all call
  the same function, directly or via the existing `adminWhoAmI()` server
  function (Phase B/G1, unchanged).
- **Existing admin routes** — `/admin` (redirect shell) and `/admin/jobs`
  (list + detail) already existed and already gated on `adminWhoAmI()`.
  No employer-moderation admin routes existed. Reused the existing route
  conventions (`_authenticated.admin.*` file naming, `SiteLayout` wrapping)
  rather than inventing a new structure.
- **Employer status values** — `employers.status` CHECK constraint (Phase
  H3.1): `('draft','pending','active','rejected','suspended','archived')`.
  Unchanged. No new status value was invented; H3.3 only adds a validated,
  audited path between four of the existing six values.
- **Employer audit/log tables** — `audit_logs` (Phase A, service-role-write
  only, generic jsonb, best-effort/non-atomic) and `job_audit_events`/
  `job_admin_meta` (job-scoped). Both explicitly **not** reused for employer
  moderation, per this phase's own instruction to replace "current employer/
  job audit technical debt" where appropriate for moderation. A new,
  dedicated, narrowly-columned `employer_moderation_events` table was built
  instead (§7).
- **Membership model** — `employer_memberships` (role, status), with
  `employer_memberships_admin_all` RLS already granting a verified admin
  full `FOR ALL` access. No membership schema change needed.
- **Existing moderation-shaped RPCs** — `approve_access_request()` (Phase
  G-series) approves a *membership request*, not an employer's own status;
  not reusable for this phase's employer-status transitions and left
  untouched.
- **Pre-existing admin employer-write path — found, then closed in the
  final integrity review** — `adminUpsertEmployer()` (`admin.functions.ts`,
  Phase B/G1) could write `employers.status` via the `employers_admin_all`
  RLS policy, with **zero transition validation**: any admin caller could
  set any status via that path, with no note requirement and no audit row
  in `employer_moderation_events`. The original H3.3 pass identified this
  gap and deliberately left it untouched, reasoning it was a separate
  "manually create an employer" tool unrelated to the new moderation
  workflow. On review, that reasoning was correct for *creation* but wrong
  for *updating an existing employer's status through the same tool* — a
  platform admin using this one tool could still silently bypass the new
  validated, audited, note-enforcing moderation path entirely. **This has
  been closed**, not merely documented: `adminUpsertEmployer()` can no
  longer change an existing employer's status under any circumstances
  (it throws a stable `EMPLOYER_STATUS_UPDATE_NOT_ALLOWED` error if a
  caller tries), and a newly created employer now always starts `pending`
  (or `draft`, if explicitly requested) — never `active` — so even
  employer creation can no longer skip the moderation workflow. Full detail
  in §16.
- **`employer_members_can_edit()`** (Phase H3.1 correction, unchanged):
  already returns `status IN ('active','draft','pending')` — a suspended or
  rejected employer's members already lose `jobs_employer_*` draft-write
  access today, with no schema change required to satisfy part of §8 below.
- **`employers_validate_before_write()`** trigger (Phase H3.2, unchanged):
  already exempts `is_platform_admin(auth.uid())` callers from its status/
  slug guard, so the new RPC's `UPDATE` on `employers` passes this trigger
  cleanly for a genuine admin caller.
- **Conclusion**: no existing functionality is duplicated. Everything new
  in this phase closes a real, previously-unvalidated, previously-
  unaudited gap.

## 2. Routes created / changed

| Route | Status | Access |
|---|---|---|
| `/admin/login` | new | public (signed-out reachable); redirects a verified admin straight through |
| `/admin` | rewritten (was a bare redirect to `/admin/jobs`) | `_authenticated` + server-verified `is_platform_admin()` |
| `/admin/employers` | rewritten (was "manually create an employer" only) | same |
| `/admin/employers/$employerId` | new | same |
| `/admin/jobs`, `/admin/jobs/$id` | unchanged logic, re-wrapped in the new shared chrome | same |
| `/auth?intent=admin` | extended (compatibility redirect, Phase H3.1's existing mechanism) | reused, not duplicated |

No canonical admin login route existed before this phase, so `/admin/login`
is new rather than a duplicate of anything.

## 3. Database changes

One additive migration:
`supabase/migrations/20260720114043_h3_3_platform_admin_employer_moderation.sql`

- `employer_moderation_events` table — `employer_id`, `action` (CHECK: one
  of `approved`/`rejected`/`suspended`/`reactivated`), `previous_status`,
  `new_status`, `admin_user_id`, `note` (CHECK ≤ 2000 chars), `created_at`.
  Index on `(employer_id, created_at DESC)`. RLS enabled with **exactly one**
  policy: `employer_moderation_events_admin_select` (`SELECT`, `TO
  authenticated`, `USING (is_platform_admin(auth.uid()))`). No `INSERT`/
  `UPDATE`/`DELETE` grant or policy exists for `authenticated` at all — the
  table can only ever be written by the RPC below, which runs as the
  function owner.
- `moderate_employer(_employer_id uuid, _action text, _note text)` —
  `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL ... FROM
  PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated, service_role`. See §5–7.

No existing table, column, policy, function, or trigger was altered.

**Final integrity review**: no additional migration was needed. The
`adminUpsertEmployer()` fix (§16) is entirely application-layer (TypeScript
zod schema + handler logic) — the database schema, `moderate_employer()`,
and `employer_moderation_events` from the migration above are unchanged.

## 4. Status-transition model

Fixed, hard-coded allow-list inside `moderate_employer()` — no other
`(from, action)` pair is accepted:

| Action | Required current status | Resulting status | Note |
|---|---|---|---|
| `approved` | `pending` | `active` | optional |
| `rejected` | `pending` | `rejected` | **required** |
| `suspended` | `active` | `suspended` | **required** |
| `reactivated` | `suspended` | `active` | optional |

An employer's own client never supplies `previous_status` — the RPC reads
and row-locks (`FOR UPDATE`) the current value itself, so a concurrent
double-moderation attempt on the same employer cannot both read the same
"before" state and both succeed. Any other transition (e.g. approving an
already-rejected employer, suspending a pending employer) is rejected with
`ERRCODE = 'check_violation'` (SQLSTATE 23514) before any write happens.

Approval never auto-publishes existing job drafts — the RPC only updates
`employers.status`; job-level publish state is untouched and continues to
follow the existing H3.x submission/publication rules.

## 5–7. Moderation actions, decision notes, audit logging

Implemented as a single atomic operation (§3's `moderate_employer()`):

1. `auth.uid()` is read server-side inside the function — never trusts a
   client-supplied admin id.
2. `is_platform_admin(auth.uid())` is re-verified inside the RPC itself
   (independent of, and in addition to, the TS-layer `assertAdmin()`
   pre-check in `admin-employer-moderation.functions.ts`) — the RPC, not
   the TS wrapper, is the real authorization boundary. An employer's own
   owner/member calling this RPC for their own employer is rejected the
   same way any other non-admin caller is (verified in test T13, §10).
3. A note is required (non-blank after `btrim`) for `rejected` and
   `suspended`; optional for `approved` and `reactivated`. Enforced with
   `ERRCODE = 'check_violation'` before any state change.
4. The `employers.status` `UPDATE` and the `employer_moderation_events`
   `INSERT` happen inside the same PL/pgSQL function body — standard
   Postgres function-body transactional semantics mean if either statement
   fails, the whole call rolls back; the moderation action can never
   "succeed" without its audit row, and the audit row can never exist
   without the underlying employer update having actually happened.
5. Internal notes are stored only in `employer_moderation_events.note`,
   readable exclusively via the admin-only RLS policy in §3 — never exposed
   to any employer-facing query, page, or server function in this phase.
   No separate user-facing rejection-reason field was built (deferred, see
   §"Known limitations").
6. No outbound email/notification system was built or modified — no
   complete existing notification system was found during the audit (§1),
   so per this phase's explicit instruction, none was added.

## 8. Employer-facing status result

- **After approval**: `employers.status = 'active'`. Dashboard/employer
  routes already read `employers.status` directly (Phase H3.1/H3.2, no
  change here), so it shows `active` immediately. Drafts are untouched and
  remain drafts — approval does not publish anything. Submission/
  publication continues to follow the existing H3.x moderation rules
  (out of scope for this phase to alter).
- **After rejection**: status becomes `rejected`. `employer_members_can_edit()`
  (§1, unchanged) already excludes `rejected` from its writable-status set,
  so members immediately lose `jobs_employer_*` draft-write access — this
  is the "clear, documented rule" the brief asks for, and it required no
  new code because the H3.1 correction already implements it correctly.
  No employer data is deleted.
- **After suspension**: same mechanism — `employer_members_can_edit()`
  already excludes `suspended`. Members cannot create/edit jobs. Public
  job visibility for a suspended employer's existing jobs follows whatever
  H3.x already does for non-`active` employers (unchanged, not touched by
  this phase). Cross-tenant isolation is unaffected (verified in test T18).
  No employer data is deleted.

## 9. Admin UX

- Shared chrome (`AdminShellChrome.tsx`, mirrors the existing
  `EmployerWorkspaceChrome.tsx` pattern): nav (Overview / Employers / Jobs),
  a live pending-employer-count badge on the Employers tab
  (`adminCountPendingEmployers`, 30s stale time), an account-identity menu
  (email, My Career, Employer Portal, Sign out).
- Shared error boundary (`AdminErrorState.tsx`, mirrors
  `EmployerErrorState.tsx`).
- Employer list (`/admin/employers`): status filter (default **pending**,
  matching the brief's "default view should prioritise pending
  employers"), free-text search (company name, registration number),
  results table (company, status badge, country, created date, owner name,
  member count, draft-job count, latest moderation action). The pre-
  existing "manually create an employer" tool (`adminUpsertEmployer`-backed)
  is **kept, not deleted or duplicated** — collapsed into a
  `ManualCreateEmployerSection` on the same page, unchanged internally.
- Employer detail (`/admin/employers/$employerId`): company-supplied
  section (name, country, registration number, website, description) is
  visually and structurally separated from the internal/admin section
  (status, created date, owner, memberships, jobs, moderation history) —
  satisfying the brief's "make clear which information was supplied by the
  employer vs. internal CQrityjob data."
- Moderation actions render as buttons computed from the current status via
  `availableActions(status)` (only the transitions in §4's table are ever
  offered), each opening a shared `Dialog` (shadcn) confirmation flow with
  a `Textarea` for the note (client-side required-note validation as UX
  sugar; the RPC's own check in §6 is the actual enforcement — a client
  bypass still gets a clean, safe error).
  All error codes are translated through a code→i18n-key map with a
  generic safe fallback (`admin.employers.action.error.*`), never surfacing
  raw Supabase/Postgres error text.
- Loading, empty, and error states are handled explicitly at each level
  (route error boundary, query `isLoading`/`isError`, empty result sets).
- All new copy exists in both `sv` and `en` (§"Swedish/English copy" below).

## 10. Security requirements — verification summary

| Requirement | How verified |
|---|---|
| Only platform admins can list/view/change employer status | RLS (`employers_admin_all`, `employer_memberships_admin_all`, `employer_moderation_events_admin_select`) + independent `assertAdmin()` TS check + independent `is_platform_admin()` check inside the RPC — three layers, tested (T1–T5, T13) |
| Admin status verified server-side | `auth.uid()` read inside the `SECURITY DEFINER` function body; never a parameter |
| Employer ID from browser never sufficient authorisation | every read/write is additionally gated by RLS/RPC admin checks, not just an id match |
| Status transitions validated in the database | fixed `CASE` allow-list inside `moderate_employer()`, not just in the TS/UI layer (T7–T12) |
| Employer users cannot modify audit rows | no `INSERT`/`UPDATE`/`DELETE` grant or policy exists for `authenticated` on `employer_moderation_events` at all (T19) |
| Employer users cannot view internal notes | single admin-only `SELECT` policy; verified an owner sees 0 rows for their own employer post-decision (T17) |
| No cross-tenant data exposed | unrelated employer RLS unchanged; verified (T18) |
| No service-role key required in client | server functions run server-side only (TanStack `createServerFn`); `supabaseAdmin` used narrowly for profile/email reads, never sent to the browser |
| No raw Supabase/Postgres errors reach the UI | all server functions throw stable `UPPER_SNAKE_CASE` codes; client translates via a map with a generic fallback |
| No admin action trusts URL slug alone | `$employerId` param is validated (`z.string().uuid()`) and every read re-checked against RLS/admin status, not treated as pre-authorized |
| Suspended employers remain restricted | `employer_members_can_edit()` (pre-existing, unchanged) already excludes `suspended` |
| Platform-admin actions are auditable | every `moderate_employer()` call inserts an `employer_moderation_events` row atomically with the status change |
| Candidate scoring / assessments / Career Intelligence untouched | confirmed via `git status` (§"Files changed") and a clean `cie:check` run showing unchanged persona outputs |

## 11. Storage security finding — conclusion

Audited `storage.objects` policies for the `job-application-cvs` bucket.
Confirmed via migration history (`20260719181557_...sql`): all four
`job_cvs_*` policies were explicitly dropped in an earlier H3.x correction
and **never re-added** — RLS is enabled on `storage.objects` with **zero**
permissive policies for that bucket, i.e. deny-by-default for every normal
client role (`anon`, `authenticated`), including candidates and employers.
All CV access goes exclusively through the pre-existing
`getApplicationCvSignedUrl` server function
(`src/lib/job-intelligence/applications.functions.ts`), which runs
server-side, independently verifies the caller's employer/application
authorization, and issues a short-lived signed URL — no arbitrary
client-supplied storage path is ever trusted.

**Conclusion: the `storage_objects_no_policies` scanner finding is not a
blocker for H3.3.** Per this phase's explicit instruction, Storage policies
were **not** broadened to silence the scanner — doing so would have
*weakened* security by adding a client-reachable read path where none
should exist. No Storage change was made in this phase.

## 12. Tests performed

### Database (disposable local Postgres 16, full real migration history)

Applied `tests/database/phase-h3-3/00_bootstrap.sql` (minimal `anon`/
`authenticated`/`service_role` roles + `auth.uid()` GUC stand-in), then
every real file in `supabase/migrations/` in chronological order — skipping
five files already confirmed in earlier phases to be exact duplicates of
earlier-timestamped migrations (`20260718153627`, `20260719115332`,
`20260719180509`, `20260719220600`, `20260720072016`) — through this
phase's own `20260720114043_h3_3_platform_admin_employer_moderation.sql`,
then `01_fixtures.sql` (1 admin, 1 candidate-only user, 5 employer owners,
5 employers covering pending/active/suspended/rejected/pending-#2), then
`02_run_tests.sql`. **All 19 assertions passed** on the first full run
after one fixture fix (an `auth.users` insert trigger already
auto-creates a `public.profiles` row — fixtures now `UPDATE` display names
instead of `INSERT`ing a second row):

| Test | Result |
|---|---|
| T1 — admin lists pending employers via RLS | 2 pending visible, as expected |
| T2 — non-admin owner sees only their own employer | 1, as expected |
| T3 — candidate-only user sees zero employers | 0, as expected |
| T4 — admin can view any employer's detail regardless of status | confirmed (suspended employer) |
| T5 — non-admin owner cannot read `employer_moderation_events` at all | 0 rows, as expected |
| T7 — reject with a note succeeds | status → `rejected`, audit row correct |
| T8 — suspend with a note succeeds | status → `suspended`, audit row correct |
| T9 — reactivate succeeds (note optional) | status → `active` |
| T10 — invalid transition blocked (approve an already-rejected employer) | SQLSTATE 23514, status unchanged |
| T11 — reject without a note fails | SQLSTATE 23514, status unchanged |
| T12 — suspend without a note fails | SQLSTATE 23514, status unchanged |
| T13 — employer owner cannot moderate their own employer | `Forbidden: platform admin role required`, status unchanged |
| T6/T14/T15/T16 — approve succeeds; audit row records the real calling admin, correct previous/new status, exactly one new row | all confirmed |
| T17 — audit note invisible to the employer it describes, even after a real decision exists | 0 rows visible to the owner |
| T18 — cross-tenant isolation reconfirmed | 0 rows visible across tenants |
| T19 — final policy inventory on `employer_moderation_events` | exactly one policy, `SELECT`-only, admin-gated |

Disposable cluster torn down after the run.

### Static / build checks

- `bunx tsc --noEmit` — zero errors.
- `bun run build` — succeeds.
- `bunx eslint` on all new/changed files — no unresolved issues (only
  pre-existing-convention `@typescript-eslint/no-explicit-any` usages
  matching the codebase's established `Ctx = { supabase: any }` pattern).
- `bun run scripts/cie-check.ts` — PASS, persona outputs unchanged
  (confirms no candidate-scoring logic was touched).
- `bun run scripts/kg-check.ts` — OK.

### Authentication flow (addendum) — coverage

DB/RLS-testable pieces (admin-status verification server-side, non-admin
rejection) are covered by T1–T5/T13 above, since they exercise the same
`is_platform_admin()` primitive the login flow depends on. Pure client-side
session/redirect behaviors (redirect to `/admin/login` on session expiry,
cache-clear on identity change, protected routes inaccessible post-logout,
desktop/mobile rendering) have no component-test runner in this repo
(consistent with how earlier H3.x phases handled this same gap) and were
verified by code review instead:
- Session-expiry redirect: `_authenticated.tsx`'s existing session-check
  effect and `onAuthStateChange` handler (extended, not replaced, in this
  phase) already redirect to `/auth?intent=admin` → `/admin/login` for any
  `/admin/*` path.
- Cache-clear on identity change: the existing root-level
  `onAuthStateChange` listener in `src/routes/__root.tsx` (pre-existing,
  Lovable's commit `95f5bee`, unmodified) already calls
  `queryClient.cancelQueries()` + `queryClient.clear()` on sign-out or on
  any user-id change — this already covers admin sessions with no new code
  needed.
- Post-logout inaccessibility: `_authenticated.admin.tsx` re-runs
  `adminWhoAmI()` on every render via `useQuery`; once signed out, the
  parent `_authenticated` layout's own redirect fires first.
- No admin data during loading/transitions: `AdminLayout`'s `q.isLoading`
  branch renders only a generic loading string, never partial admin data.

### Regression

`git status` confirms no file under `src/lib/job-intelligence/*.functions.ts`
(other than the new `admin-employer-moderation.functions.ts`) or any
`assessment`/`career-intelligence`-related path was touched. `cie-check`
output is byte-identical in structure to pre-existing runs. Existing H3.1/
H3.2 employer routes (`login`, `register`, dashboard, settings) were not
modified. The two pre-existing `/admin/jobs*` routes had only additive
JSX wrapping applied (see "Files changed") — their internal logic is
untouched.

## 13. Security review conclusion (final pass, before commit)

Reviewed the complete diff. Every platform-admin authorization path
(`assertAdmin()` in the TS layer, the RLS policies, the RPC's own
`is_platform_admin()` check, `_authenticated.admin.tsx`'s `adminWhoAmI()`
gate, `/admin/login`'s post-auth check) independently re-verifies admin
status rather than trusting an earlier check or client state. The one
`SECURITY DEFINER` function (`moderate_employer`) sets `search_path =
public` explicitly, has `PUBLIC`/`anon` execute revoked and only
`authenticated`/`service_role` granted, validates its transition allow-list
before any write, and performs its status update and audit insert in one
atomic function body. No unrelated file was changed (`git status`
reviewed — see §"Files changed"). Full local test suite (§12) re-run and
passing at the time of this review. No issue required a fix before commit.

## 14. Known limitations / deferred work

- No outbound email/notification system was built (no complete existing
  system was found to hook into — deferred, per explicit instruction).
- No separate user-facing rejection-reason field exists yet — only the
  internal admin note. If a future phase needs to show employers *why*
  they were rejected/suspended, that should be a new, explicitly
  employer-visible field, kept separate from the internal note (as the
  brief anticipates), not a relaxation of the current note's RLS.
- ~~`adminUpsertEmployer()`'s pre-existing gap...~~ **Closed in the final
  integrity review, no longer a limitation.** See §16.
- A genuine platform admin can still change `employers.status` via a raw,
  direct database/client call that bypasses the application entirely
  (`employers_admin_all` RLS + `employers_validate_before_write()` both
  already exempt platform admins, by design, since Phase G1/H3.2). This is
  **pre-existing infrastructure, unchanged by H3.3 or this integrity
  pass**, requires the caller to already hold a real platform-admin
  session, and is out of scope for an application-code-path fix — see
  §16's "Audit completeness" for the full reasoning on why this was
  documented rather than closed.
- `admin.employers.status.*` i18n keys were kept **separate** from the
  pre-existing `employer.status.*.badge` keys rather than reused, after
  reviewing both: `employer.status.*.badge` is phrased from the employer's
  own first-person dashboard perspective ("Företagskonto aktivt" / "Company
  account active") and has no `draft` entry, while the admin list/detail
  views need a neutral third-person label ("Aktivt" / "Active") and do need
  a `draft` entry. Kept separate deliberately, not an oversight.
- Authentication-flow tests that require a real browser session/component
  test runner were verified by code review rather than an automated test
  (see §12) — consistent with how this gap has been handled in every prior
  H3.x phase in this repo, since no such runner exists yet.

## 15. Lovable Cloud handoff

1. **Sync** the final commit (`fix: enforce canonical employer moderation
   paths`, tip of `main` — see §16 for the exact hash) to the Lovable
   Cloud project.
2. **Apply the named migration**:
   `supabase/migrations/20260720114043_h3_3_platform_admin_employer_moderation.sql`
   — additive only, no down-migration needed, no existing migration edited.
   **No new migration was introduced by the final integrity review** — the
   `adminUpsertEmployer()` fix is application-code-only.
3. **Prerequisite**: an existing user in the target Cloud environment must
   already satisfy `is_platform_admin()` (i.e. already have an `admin` or
   `superadmin` row in `user_roles` for their `auth.users` id) before any
   of the checklist below can run. This is the existing, unchanged
   platform-admin model (Phase G1) — nothing in H3.3 grants admin access
   by email, domain, or any other implicit signal. If no such user exists
   yet in this Cloud environment, Lovable must provision one directly via
   the Cloud database/dashboard (insert a `user_roles` row for a real,
   already-registered user) before Preview testing — this is a one-time
   environment-provisioning step, not application code, and is
   intentionally outside what this phase can do without direct database
   access.
4. **Run this exact Preview checklist**:
   - Sign in as an existing platform admin → confirm `/admin` loads (not
     access-denied).
   - Sign in as a non-admin (candidate or employer) → visit `/admin`
     directly → confirm the access-denied message renders, no employer
     data is visible, no crash.
   - Sign out → visit `/admin/employers` → confirm redirect to
     `/admin/login` (not the candidate/employer login page).
   - From `/admin/employers`, approve one pending employer with an
     optional note → confirm status flips to `active` and a moderation
     history entry appears on its detail page.
   - Attempt to reject a pending employer **without** a note → confirm the
     dialog blocks submission with a note-required message.
   - Reject a pending employer **with** a note → confirm status flips to
     `rejected`.
   - Suspend an active employer with a note, then reactivate it → confirm
     both transitions succeed and both appear in its moderation history.
   - As a signed-in employer owner, confirm no moderation notes or
     `/admin/*` navigation are visible anywhere in their own portal.
   - Confirm the pending-count badge on the Employers nav tab matches the
     actual number of `pending` employers.
   - **New in this pass**: open the collapsible "Manually create an
     employer" section on `/admin/employers`, create a new employer with
     no status field exposed in the form → confirm it appears with status
     `pending` (not `active`) in the moderation list, exactly like a
     self-service-created employer, and requires the same approve action
     to become active.
5. **Report pass/fail** against the checklist above. No product or
   implementation decisions are left open for this phase.

## 16. Final integrity and authentication hardening pass

### 16.1 Every employer-status write path found

Full-repository search for writes to `employers.status`, employer status
RPCs, direct `.update({ status: ... })`, admin employer upsert/create
helpers, and SQL functions modifying employer status:

| Path | Classification | Notes |
|---|---|---|
| `moderate_employer()` RPC (SQL, this phase) | **canonical moderation** | the only function in the entire migration history whose body contains `UPDATE public.employers` (confirmed via `pg_proc` source inspection, test T20) |
| `adminUpsertEmployer()` update branch (`admin.functions.ts`) | **fixed — no longer a status-write path** | previously arbitrary; now throws `EMPLOYER_STATUS_UPDATE_NOT_ALLOWED` if a caller supplies `status` while updating an existing employer (`data.id` set) |
| `adminUpsertEmployer()` create branch (`admin.functions.ts`) | **creation-only, restricted** | zod schema now only accepts `'draft'`/`'pending'` for a brand-new employer; defaults to `'pending'` (`resolveNewEmployerStatus()`) — can never create an employer that starts `active`/`suspended`/`archived`/`rejected` |
| `create_my_employer_company()` RPC (SQL, Phase H3.1) | **creation-only, unchanged** | self-service company creation; explicitly inserts `status = 'pending'`, never touches an *existing* employer |
| `updateEmployerOrganisation()` (`employer-settings.functions.ts`, Phase H3.2) | **safely restricted, unchanged** | zod schema never includes `status`/`slug` at all; `employers_validate_before_write()` trigger independently rejects any attempt regardless |
| `adminSaveJobDraft()` / `adminTransitionJob()` (`admin.functions.ts`) | **not an employer-status path** | writes `jobs.status`, not `employers.status`; the one `.from("employers")` call in these functions is a read-only `.select("slug")` |
| `employer-jobs.functions.ts` `.update({ status: ... })` call sites | **not an employer-status path** | both target `jobs.status` (`pending_review`/`archived`), not `employers.status` |
| All other `.from("employers")` call sites repo-wide (`public-queries.ts`, `public-queries.functions.ts`, `membership.functions.ts`, `employer-onboarding.functions.ts`, `admin-employer-moderation.functions.ts`, `admin.functions.ts` list/get) | **read-only** | confirmed via direct grep — every one is a `.select(...)`, none is a `.update(...)`/`.insert(...)` touching `status` |
| Direct raw client `.update({ status })` against `employers` by a genuine platform-admin session | **platform-maintenance-only capability, documented not closed** | `employers_admin_all` RLS (`FOR ALL`, Phase G1) and `employers_validate_before_write()` (Phase H3.2) both already exempt `is_platform_admin(auth.uid())` — pre-existing, unchanged infrastructure, not a code path introduced by any admin UI. Proven to still work as described via test T21 (write, observe, revert). See "Why this was not closed" below. |

**No undocumented bypass remains.** Every write path is now one of:
canonical moderation, creation-only (with a safe restricted starting
status), platform-maintenance-only (documented), or read-only.

**Why the RLS-level admin capability (last row) was not closed**: the
brief's required-correction options (restrict `adminUpsertEmployer()` to
creation-only / remove status from its update payload / route existing-
employer changes through `moderate_employer()`) are all scoped to that one
application-code path, which is now fully closed. Tightening
`employers_admin_all` or `employers_validate_before_write()` themselves
would be a genuine RLS/trigger redesign reaching every other legitimate
admin write to the `employers` table (name/slug/website fixes, etc.), not
a "safest minimal implementation" — and naively blocking admin status
writes at the trigger level would also block `moderate_employer()`'s own
internal `UPDATE` (triggers fire regardless of the calling role, including
inside a `SECURITY DEFINER` function), which would violate "do not weaken
the new moderation RPC." A correct fix would need a session-scoped marker
so the trigger can distinguish "this UPDATE came from inside
moderate_employer()" from "this UPDATE came directly from a client" —
that is new trigger/RPC infrastructure, i.e. exactly the "second
transition system" the brief says not to build. This capability also
requires the caller to already be a real, authenticated platform admin
choosing to bypass their own admin UI — not a privilege-escalation bug,
and not something introduced or worsened by H3.3 (confirmed pre-existing
in Phase G1/H3.2, unchanged since). Documented here and in §14 rather than
silently assumed.

### 16.2 How `adminUpsertEmployer()` was secured

Three concrete code changes, all in `src/lib/job-intelligence/admin.functions.ts`:

1. `employerPayloadSchema.status` narrowed from
   `z.enum(["draft", "active", "suspended", "archived"])` to
   `z.enum(["draft", "pending"])` — a moderation outcome can no longer even
   parse as a valid creation-time value.
2. The update branch (`if (data.id)`) now calls
   `assertNoExistingEmployerStatusChange(true, data.status)` as its first
   step, which throws a stable `EMPLOYER_STATUS_UPDATE_NOT_ALLOWED` error
   if `status` is present at all — explicit rejection, not a silent drop,
   so no caller can be misled into thinking a status change took effect.
   The old status-aware no-op check and the `employer_status_changed` audit
   branch (both now unreachable, since status can never differ on update)
   were removed.
3. The create branch now calls `resolveNewEmployerStatus(data.status)`,
   which returns `'pending'` unless `'draft'` was explicitly requested —
   replacing the previous implicit reliance on the `employers.status`
   column's bare `DEFAULT 'active'`.

`assertNoExistingEmployerStatusChange` and `resolveNewEmployerStatus` are
exported as small, pure, synchronous functions specifically so they are
directly unit-testable (§16.5) — `createServerFn`-wrapped handlers in this
codebase cannot be invoked outside the TanStack Start server runtime
(confirmed while building this fix: calling one directly throws `"No Start
context found in AsyncLocalStorage"`), so these pure extractions are the
actual testable surface for this integrity fix.

The pre-existing "manually create an employer" UI
(`_authenticated.admin.employers.tsx`, `ManualCreateEmployerSection`) was
not changed — it never sent a `status` field to begin with, so this fix is
fully backward-compatible with it; only its explanatory comment was
updated to reflect the new default.

### 16.3 Admin login architecture — confirmed, one canonical flow

Reviewed `/admin/login`, `/auth?intent=admin`, `_authenticated.admin.tsx`,
the `_authenticated.tsx` redirect logic, logout, session expiry, and React
Query cache clearing (all built/wired in the original H3.3 pass, §9 and
the authentication addendum). **No code change was needed here** — the
architecture already satisfies every requirement in this review:

- **One canonical login form**: `/admin/login` is the only route that
  renders admin sign-in UI. `/auth?intent=admin` is confirmed, by reading
  its current source, to be a pure redirect — it calls
  `destinationFor()` and immediately `navigate()`s away; it never renders
  a form of its own (`AuthCompatibilityRedirect` renders only a
  "redirecting…" message while the redirect resolves). There are not two
  competing login implementations.
- **Non-admin denial**: `/admin/login`'s post-auth `adminWhoAmI()` check
  shows a controlled "not an admin" message and offers sign-out-and-retry,
  never granting access. `_authenticated.admin.tsx` independently
  re-verifies the same way for direct navigation, showing a safe
  access-denied page.
- **Already-signed-in admin routed to `/admin`**: both `/admin/login`'s
  mount-time session check and `destinationFor()`'s `alreadySignedIn`
  branch route a verified admin straight to `/admin` (or a validated
  `redirect` target).
- **Expired session → `/admin/login`**: `_authenticated.tsx`'s session
  check and `onAuthStateChange` handler detect an `/admin/*` path and
  redirect through `/auth?intent=admin`, which resolves to `/admin/login`.
- **Logout removes admin access**: `AdminShellChrome`'s sign-out calls
  `supabase.auth.signOut()` then navigates to `/admin/login`;
  `_authenticated.admin.tsx` re-runs `adminWhoAmI()` via `useQuery` on
  every render, so any remaining admin page immediately re-denies access
  once the session is gone.
- **No protected data before authorization completes**: `AdminLayout`'s
  `q.isLoading` branch renders only a generic loading string — never the
  `<Outlet />` (nested admin content) until `adminWhoAmI()` has resolved
  and confirmed admin status.
- **Cache clearing on identity switch**: the pre-existing root-level
  `onAuthStateChange` listener (`src/routes/__root.tsx`, Lovable's own
  commit, unmodified) calls `queryClient.cancelQueries()` +
  `queryClient.clear()` on sign-out or any user-id change — already covers
  admin sessions.
- **No public admin link**: confirmed via repository-wide grep — no
  `to="/admin"` reference exists outside `_authenticated.admin*` route
  files and `src/components/admin/*` — no site header, footer, or public
  nav surfaces an admin link to any signed-out or non-admin user.

**Conclusion**: exactly one canonical admin entry flow exists today; no
architectural change was required by this review.

### 16.4 Initial admin availability

The first Lovable Cloud test admin is identified exactly the same way any
platform admin is identified anywhere in this application: a row in
`public.user_roles` with `role IN ('admin', 'superadmin')` for that user's
`auth.users.id`, which `is_platform_admin(uuid)` (Phase G1) checks. There
is no email-based, domain-based, or otherwise implicit bypass anywhere in
H3.3 or this integrity pass — confirmed via repository-wide search for
hardcoded admin emails/domains (none found). **An existing user must
already satisfy `is_platform_admin()`, provisioned directly in the target
Cloud environment's database, before any Preview test in §15 can run.**
This is unchanged, pre-existing infrastructure from Phase G1 — this phase
neither weakens nor bypasses it.

### 16.5 Tests added/updated and results

**Database** (`tests/database/phase-h3-3/02_run_tests.sql`, 2 new
assertions appended, disposable Postgres 16, full real migration history,
same methodology as §12):

- **T20** — static inventory: exactly one function in the entire schema
  (`moderate_employer`) contains `UPDATE public.employers` in its body.
  **Passed.** (A looser two-substring match was tried first and produced
  one false positive — `jobs_validate_before_write`, which only *reads*
  `employers.status` to gate job edits, never writes it — the query was
  tightened to an exact-phrase match instead; documented directly in the
  test file's own comment.)
- **T21** — documents, rather than closes, the pre-existing RLS-level
  admin capability (§16.1's last row): a genuine admin session performs a
  raw `UPDATE employers SET status = 'suspended'`, it succeeds (proving
  the documented capability is real, not assumed), then is immediately
  reverted to its prior value. **Passed** (both the write and the revert).

Both new assertions were run together with the full original T1–T19 suite
against a freshly reset database (bootstrap → full migration history,
skipping the same 5 confirmed-duplicate files as §12 → fixtures → all 21
assertions in one pass) — **all 21 passed**, including the original T1–T19
regression set, confirming this fix introduced no regression in the
moderation RPC's own behaviour.

**Application-level** (new:
`scripts/admin-employer-status-guard-check.ts`, run via
`bun run admin-employer-status-guard:check`, matching the established
`employer-taxonomy:check` / `employer-job-form:check` plain-importable-
module pattern — no test-runner framework is configured in this repo):

- `employerPayloadSchema` accepts `status: 'draft'` and `status: 'pending'`,
  and **rejects** `'active'`/`'suspended'`/`'archived'`/`'rejected'` at
  parse time (schema-level, before any handler code runs).
- `resolveNewEmployerStatus(undefined)` returns `'pending'`;
  `resolveNewEmployerStatus('draft')` returns `'draft'`.
- `assertNoExistingEmployerStatusChange(true, <any status>)` throws
  `EMPLOYER_STATUS_UPDATE_NOT_ALLOWED`;
  `assertNoExistingEmployerStatusChange(true, undefined)` (ordinary
  metadata-only edit) and `assertNoExistingEmployerStatusChange(false,
  'pending')` (creation) do not throw.
- **Result: `admin-employer-status-guard:check OK`.**

**Requirement-to-test mapping** (the 18 items requested for this pass):

| # | Requirement | Covered by |
|---|---|---|
| 1 | Existing employer status cannot change via `adminUpsertEmployer()` | `admin-employer-status-guard:check` (`assertNoExistingEmployerStatusChange`) |
| 2 | New manual creation receives only the approved initial status | `admin-employer-status-guard:check` (`employerPayloadSchema`, `resolveNewEmployerStatus`) |
| 3 | Every existing-employer status change requires `moderate_employer()` | T20 (static inventory) + #1 above |
| 4 | Invalid transitions remain blocked | T10, T12 (re-run, unchanged) |
| 5 | Required notes remain enforced | T11, T12 (re-run, unchanged) |
| 6 | Audit rows remain atomic with moderation decisions | T6/T14/T15/T16 (re-run, unchanged) |
| 7 | No other direct employer-status write path exists | §16.1 full repository audit + T20 |
| 8 | Admin login is the canonical entry flow | §16.3 code review (no runner available — see item below) |
| 9 | Signed-in non-admin cannot enter `/admin` | T13 (RLS/RPC-level) + §16.3 code review of `_authenticated.admin.tsx` |
| 10 | Admin session expiry redirects safely | §16.3 code review of `_authenticated.tsx` |
| 11 | Logout removes admin access | §16.3 code review of `AdminShellChrome`/`_authenticated.admin.tsx` |
| 12 | Identity switching clears cached admin data | §16.3 code review of `src/routes/__root.tsx` (pre-existing, unmodified) |
| 13 | Typecheck passes | `bunx tsc --noEmit` — zero errors |
| 14 | Production build passes | `bun run build` — succeeds |
| 15 | Relevant lint passes | `bunx eslint` on all changed files — zero new issues (only pre-existing-convention `any` usages outside the changed lines) |
| 16 | CIE and KG checks pass | `cie:check` PASS (persona outputs unchanged), `kg:check` OK |
| 17 | H3.3 database tests pass | all 21 assertions (T1–T21) passed on one full run |
| 18 | H3.1/H3.2 employer regressions unchanged | `employer-taxonomy:check` OK, `employer-job-form:check` OK; `updateEmployerOrganisation()` (H3.2) untouched; no H3.1/H3.2 route or migration file modified |

Items 8–12 have no browser/component test runner available in this repo
(same, previously documented gap as §12) — covered by direct source
re-inspection of the exact current file contents instead of being assumed
from the original H3.3 pass. **Still requires Lovable Preview verification
for real-browser confirmation** of the redirect/logout/cache-clear
behavior end-to-end, per §15's checklist.

### 16.6 Final code review (before this commit)

Re-read the complete effective H3.3 code (both the original commit and
this pass's diff on top of it). Re-inspected every status-write path
(§16.1's table) and every admin authorization path (§16.3). Re-verified:
`moderate_employer()`'s `search_path = public`, its `REVOKE ALL ... FROM
PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated, service_role` —
unchanged by this pass. Audit-note confidentiality — unchanged
(`employer_moderation_events`'s single admin-only `SELECT` policy was not
touched). No raw database error or secret reaches the UI in the new code
(`EMPLOYER_STATUS_UPDATE_NOT_ALLOWED` is a stable application-level
message, not a forwarded Postgres error). `git status` reviewed — only
`src/lib/job-intelligence/admin.functions.ts`,
`src/routes/_authenticated.admin.employers.tsx` (comment only),
`tests/database/phase-h3-3/02_run_tests.sql`,
`scripts/admin-employer-status-guard-check.ts` (new), `package.json` (one
new script entry), and this report were changed — no unrelated file, no
candidate/assessment code, touched. Full local test suite (§16.5) re-run
and passing at the time of this review. No further issue required a fix
before commit.
