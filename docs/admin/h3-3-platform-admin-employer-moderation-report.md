# H3.3 — Platform Admin Employer Moderation

Status: implemented and tested locally (disposable Postgres 16, real migration
history). Not yet verified against Lovable Cloud — that verification is the
only remaining step, per the Lovable handoff at the end of this document.

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
- **Pre-existing admin employer-write path** — `adminUpsertEmployer()`
  (`admin.functions.ts`, Phase B/G1) can already write `employers.status`
  via the `employers_admin_all` RLS policy, but with **zero transition
  validation** — any admin caller could set any status via that path today,
  and its zod schema was missing `pending`/`rejected` from the allowed
  status enum. This gap is **intentionally not touched or fixed** in this
  phase; it is a separate "manually create/edit an employer record" tool
  that continues to exist unchanged (see §9, "Kept, not duplicated"). All
  new transition validation for the *formal moderation workflow* lives
  exclusively inside the new `moderate_employer()` RPC (§5–§7), which is
  the only path the new UI calls.
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
- `adminUpsertEmployer()`'s pre-existing gap (arbitrary status write, no
  transition validation, zod enum missing `pending`/`rejected`) was
  intentionally left as-is — it back a different, still-useful "manually
  create an employer" tool that this phase did not touch. A future phase
  could tighten or retire that tool if it's judged redundant with the new
  moderation UI.
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

1. **Sync** the final commit (`feat: add platform admin employer
   moderation`) to the Lovable Cloud project.
2. **Apply the named migration**:
   `supabase/migrations/20260720114043_h3_3_platform_admin_employer_moderation.sql`
   — additive only, no down-migration needed, no existing migration edited.
3. **Run this exact Preview checklist**:
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
4. **Report pass/fail** against the checklist above. No product or
   implementation decisions are left open for this phase.
