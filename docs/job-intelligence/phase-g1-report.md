# Phase G1 — Employer Identity Foundation

**Status:** Implemented, unapplied. Migration reviewed but not run against
any database. Feature flags unchanged (all remain `false`). This
revision incorporates three required corrections from the final Phase G1
security review (verdict: APPROVE WITH REQUIRED CHANGES) — see "Final
active owner protection" (race-condition fix), "No-op update handling",
and "removed_at semantics" below.

## Purpose

CQrityjob uses one shared authentication system (`auth.users`) for every
person on the platform. Phase G1 is the minimum secure backend required
for that same, single identity to also belong to zero, one, or several
employer organisations — without a second login system, without a
candidate/employer account-type split, and without a parallel
"organisations" table. It builds directly on the already-delivered Job
Intelligence foundation (`docs/job-intelligence/phase-a-report.md`
through `phase-f2-report.md`), which this phase does not modify except
where explicitly noted below.

Phase G1 is backend-only. No employer portal UI, context switcher,
navigation entry, invitation flow, or job-publishing UI is built in this
phase — see "Must not be built in G1" in the originating brief and
"Deferred functionality" below.

## Architecture

```
auth.users                                — unchanged, single identity
  └─ profiles                              — unchanged
  └─ user_roles → app_role → has_role()    — unchanged, PLATFORM roles only
  └─ employer_memberships (NEW)            — EMPLOYER-scoped roles
       → employers (EXISTING, reused as the organisation entity)
            → jobs (EXISTING, unchanged FK: jobs.employer_id)
```

`public.employers` (delivered in the Phase A — Job Intelligence
Foundation migration, `supabase/migrations/20260717113432_....sql`) is
reused as-is as the organisation entity. It is not renamed and no
parallel `organisations` table is created. `employer_memberships` is the
one new table, linking `auth.users.id` to `employers.id` with a role and
a status — the same shape as every other ownership relationship already
in this schema (`assessment_runs.user_id`, `saved_jobs.user_id`,
`user_roles.user_id`, all FK directly to `auth.users(id)`, never to
`profiles`).

Active organisational "context" is not persisted anywhere server-side in
this phase — there is no UI to select a context yet, and every
authorisation check in this phase already re-derives access from
`employer_id` + `auth.uid()` on each request, never from any client-
asserted state. This is a deliberate, forward-compatible property, not
an oversight: when a context switcher UI ships in a later phase, it can
be added as pure client-side convenience state without changing any
security boundary described here.

## Schema changes

### `public.employers` — one additive column

```sql
ALTER TABLE public.employers
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'suspended', 'archived'));
```

Every existing row becomes `status = 'active'` on migration — correct,
since every row that exists today is a live, admin-managed employer with
no prior lifecycle concept. No backfill logic beyond the column default;
no existing column, constraint, index, trigger, or grant on `employers`
is touched.

### `public.employer_memberships` — new table

```sql
CREATE TABLE public.employer_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employer_id, user_id)
);
```

| Field | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `employer_id` | uuid | no | — | FK → `employers(id)` `ON DELETE CASCADE` |
| `user_id` | uuid | no | — | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `role` | text | no | — | `CHECK IN ('owner','admin','member')` |
| `status` | text | no | `'active'` | `CHECK IN ('invited','active','suspended','removed')` |
| `created_by` | uuid | yes | — | FK → `auth.users(id)` `ON DELETE SET NULL` |
| `invited_by` | uuid | yes | — | FK → `auth.users(id)` `ON DELETE SET NULL` |
| `invited_at` / `accepted_at` / `removed_at` | timestamptz | yes | — | lifecycle timestamps, set by the server functions, not user-supplied |
| `created_at` / `updated_at` | timestamptz | no | `now()` | `updated_at` maintained by the existing `public.set_updated_at()` trigger, reused unchanged |

**Deletion behaviour rationale:** `employer_id`/`user_id` use `ON DELETE
CASCADE` — deleting an employer or a user removes their membership rows,
matching the existing precedent for NOT NULL, non-optional ownership
columns in this schema (e.g. `saved_jobs.user_id`). `created_by`/
`invited_by` use `ON DELETE SET NULL` because the brief specified it
explicitly and because they are provenance metadata, not the row's
identity — the same pattern already used by `employer_admin_meta.
{created_by,updated_by}` and `job_admin_meta.{created_by,updated_by,
reviewed_by}`.

**Constraints:** `UNIQUE(employer_id, user_id)` — one row per person per
organisation; a role or status change updates the existing row, it never
inserts a second one for the same pair. This is the actual "no duplicate
memberships" enforcement mechanism (a DB constraint, not application
logic).

**Indexes:** `employer_memberships_employer_idx (employer_id)`,
`employer_memberships_user_idx (user_id)`,
`employer_memberships_status_idx (status)`, and one composite,
`employer_memberships_user_status_idx (user_id, status)` — justified as
the one genuinely distinct common lookup ("this user's active
memberships across every employer," the exact pattern
`listMyEmployerMemberships` and `has_employer_role()` both exercise) not
already covered by the single-column indexes or by the
`UNIQUE(employer_id, user_id)` index. A second composite
(`employer_id, status`) was considered and **not** added — it would
largely overlap the unique index plus a status filter and has no
distinct caller in this phase.

**Trigger:** `set_employer_memberships_updated_at`, reusing the existing,
unmodified `public.set_updated_at()` function — the same trigger already
attached to `employers`, `jobs`, `job_admin_meta`, `assessment_runs`, and
every other timestamped table in this schema.

## Role model

**Employer-scoped roles** (`employer_memberships.role`): `owner`,
`admin`, `member`. **All three are functionally read-only in Phase G1** —
there is no self-service write path for any of them yet (see "Must not
be built in G1"). The role column exists as forward-compatible
scaffolding for the self-service phase that follows.

**Deliberate naming note:** the employer-scoped role value `admin` is a
different concept from the platform-scoped `public.app_role` value
`admin` — they live in different tables/columns (`employer_memberships.
role` vs. `user_roles.role`) and are never compared to each other in any
policy or function in this phase. Flagged explicitly here so the shared
word is never mistaken for a shared mechanism during review.

**Membership statuses**: `invited`, `active`, `suspended`, `removed`.
Phase G1's own `adminCreateEmployerMembership` only ever produces
`active` rows directly by default (no invitation-email flow exists yet,
consistent with "Do not build... invitation emails" in scope), but
`invited` is schema-ready for when that ships. `has_employer_role()`
(and therefore every access decision) requires exactly `status =
'active'` — `invited`, `suspended`, and `removed` all grant zero access.

**Platform roles** (`public.user_roles`/`app_role`): unchanged —
`superadmin`, `admin`, `content_editor`, `assessment_editor`, `support`.
Never cross-referenced with employer-scoped roles.

## RLS policies

### New — `employer_memberships`

```sql
CREATE POLICY "employer_memberships_self_select" ON public.employer_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employer_memberships_admin_all" ON public.employer_memberships
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
```

No policy permits a non-admin write of any kind — an ordinary member
(any role, any status) has zero write path to this table. The self-select
policy deliberately has no status filter: a user may always see their own
row(s) in any status (including `suspended`/`removed`), so they can see
their own membership history. This is visibility of one's own record,
not a grant of access — every actual authorisation check elsewhere goes
through `has_employer_role()`, which requires `status = 'active'`
regardless of what a user can see about themselves. **This is an
interpretive judgement call** on ambiguous wording in the originating
brief (which described what an "active member" can read, not what a
suspended one cannot) — flagged for explicit confirmation in "Items
requiring Mostafa's approval."

### New — `employers`

```sql
CREATE POLICY "employers_member_select" ON public.employers
  FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), id, NULL));
```

Purely additive: lets an active member read their own employer's row
even before that employer has any publicly-active job (the existing
public policy requires an active job to exist at all). Never removes or
narrows any existing visibility.

### Modified — public visibility narrowing (2 policies)

**Before** (verbatim, `supabase/migrations/20260717113432_....sql` lines
304–330):
```sql
CREATE POLICY "jobs_public_active_select"
  ON public.jobs FOR SELECT TO anon, authenticated
  USING (public.job_is_active(status, published_at, deadline_at, expires_at));

CREATE POLICY "employers_public_active_select"
  ON public.employers FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
  ));
```

**After** (via `ALTER POLICY`, never `DROP`+`CREATE` — no window without
a policy in place; every original predicate preserved character-for-
character, one `AND` added to each):
```sql
ALTER POLICY "jobs_public_active_select" ON public.jobs
  USING (
    public.job_is_active(status, published_at, deadline_at, expires_at)
    AND EXISTS (SELECT 1 FROM public.employers e WHERE e.id = jobs.employer_id AND e.status = 'active')
  );

ALTER POLICY "employers_public_active_select" ON public.employers
  USING (
    employers.status = 'active'
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at))
  );
```

Effect: an **active** employer's public visibility is completely
unchanged. A **suspended or archived** employer's jobs (and the employer
row itself) stop being publicly visible, even if an individual job is
still internally `status = 'published'`.

## Admin/superadmin correction

The Phase G1 read-only audit identified a real, pre-existing defect:
`assertAdmin()`/`adminWhoAmI()` (`admin.functions.ts`) and 8 existing RLS
policies checked `has_role(auth.uid(),'admin')` only, excluding
`superadmin`. Verified again, freshly, immediately before writing this
migration:
```
$ grep -rn "has_role(auth.uid(), .admin.)" supabase/migrations/*.sql
```
confirmed the same 8 policies, unchanged since the audit, across
`job_import_sources` (2), `employer_admin_meta` (1), `jobs` (2),
`employers` (1), `job_admin_meta` (1), `job_audit_events` (1).

**Fix:** `public.is_platform_admin(uuid)` (`has_role(admin) OR
has_role(superadmin)`, `SECURITY DEFINER`, `SET search_path = public`,
`EXECUTE` granted to `authenticated, service_role` only). Applied via
`ALTER POLICY` to all 8 policies (literal substitution of the predicate
text only — no other clause touched), and to `assertAdmin()`/
`adminWhoAmI()` in `admin.functions.ts` (RPC target swapped, function
names, error messages, and the `{ userId, isAdmin }` return shape all
unchanged, so `_authenticated.admin.tsx`'s route guard needs no changes
at all).

**Explicitly not broadened:** `content_editor`, `assessment_editor`, and
`support` platform roles are untouched — `is_platform_admin()` only ever
returns true for `admin` or `superadmin`. The existing 3-way
`assessment_editor OR admin OR superadmin` policies (assessment-content
domain) and `cig_governance_settings admin read` (CIG-governance domain)
are untouched — out of scope, already correct or unrelated.

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260719100000_employer_memberships.sql` | **New, then updated in place (code-review fix revision) — never a second migration file, since the original was never applied anywhere.** Added section 9: `public.update_employer_membership(uuid, text, text)`, the atomic, race-free RPC, plus its grants/revokes. Sections 1–8 unchanged. **Still not applied.** |
| `src/lib/job-intelligence/membership.functions.ts` | **New, then updated (code-review fix revision).** `listMyEmployerMemberships`, `adminListEmployerMemberships`, `adminCreateEmployerMembership` unchanged from the original implementation. `adminUpdateEmployerMembershipRole`/`adminUpdateEmployerMembershipStatus` rewritten to call `update_employer_membership` instead of a separate `SELECT` + `UPDATE`; the old `assertNotRemovingLastActiveOwner` TS helper removed (superseded by the DB function). |
| `src/lib/job-intelligence/admin.functions.ts` | **Modified, then updated (code-review fix revision).** `assertAdmin()`/`adminWhoAmI()` switched to `is_platform_admin`; new local `writeOrgAudit()` helper; `adminUpsertEmployer` gained an optional `status` field and now writes `employer_created`/`employer_updated`/`employer_status_changed` audit events, plus (this revision) a no-op comparison across all seven mutable fields that skips both the `UPDATE` and the audit write when nothing actually changed. See "Items requiring Mostafa's approval" — this remains a larger touch to this file than a minimal 3-line diff, for the same reason recorded in the original report: auditing `employer_updated`/`employer_status_changed` has no dedicated server function in the approved scope. |
| `docs/job-intelligence/phase-g1-report.md` | **New, then updated (code-review fix revision) — this report.** |

**Not touched, confirmed by `git diff --stat`:** every route file,
`SiteHeader.tsx`, `feature-flag.ts`, every i18n dictionary, every CIE/CIG
file, every candidate-owned table or function, `src/integrations/
supabase/types.ts` (see "Known limitations" — regeneration requires
Lovable Cloud's own workflow, not available from this environment).

## Server functions

All five, in `src/lib/job-intelligence/membership.functions.ts`, follow
this codebase's established conventions exactly: `createServerFn` +
`requireSupabaseAuth` middleware (identity from verified claims, never
client input), a local module-scoped `Ctx`/`assertPlatformAdmin` helper
(mirroring `admin.functions.ts`'s own local pattern rather than a shared
cross-file import), zod input validation, and typed returns.

- **`listMyEmployerMemberships`** — any authenticated user, owner-scoped
  (`user_id = ctx.userId`, backed by `employer_memberships_self_select`
  RLS). No admin gate.
- **`adminListEmployerMemberships`** — admin-gated, lists every
  membership for one specified `employerId`.
- **`adminCreateEmployerMembership`** — admin-gated, confirms the target
  employer exists, inserts a membership row, writes a
  `membership_created` audit event.
- **`adminUpdateEmployerMembershipRole`** — admin-gated, loads the
  existing row, runs the final-active-owner check (below) before
  applying a role change, writes `membership_role_changed`.
- **`adminUpdateEmployerMembershipStatus`** — admin-gated, same
  final-active-owner check before suspending/removing an active owner,
  stamps `accepted_at`/`removed_at` as appropriate, writes
  `membership_status_changed`.

Membership writes go through the caller's own RLS-scoped `ctx.supabase`
(the caller already passes `employer_memberships_admin_all`'s
`is_platform_admin` check at that point) — **not** `supabaseAdmin`. Only
the `audit_logs` write uses `supabaseAdmin` (dynamically imported inside
the handler, the existing pattern already used 4× in `admin.functions.
ts`), because `audit_logs` has zero grant to `authenticated` — this is
the same, already-approved, already-in-production service-role pattern,
reused, not a new dependency.

## Final active owner protection

### Original design and the race condition found by code review

The first implementation was a server-side check-then-act: a plain
`SELECT count(...)` in `membership.functions.ts`, followed by a
*separate* `UPDATE` call, with no lock and no shared transaction between
the two. The final Phase G1 security review identified a concrete,
reproducible race: if two platform admins concurrently changed two
*different* active owners of the *same* employer (e.g. admin 1 demotes
owner A while admin 2, in the same instant, suspends owner B), each
request's count query could see "1 other active owner exists" — each
excluding only itself — and both could pass the check and both proceed
to update, before either committed. Result: the employer ends up with
**zero** active owners, exactly the state this feature exists to
prevent. This was a real gap against an explicit requirement, not a
theoretical one, and applied even within Phase G1's admin-only,
no-self-service scope — it needed two concurrent *admin* actions, not
any self-service surface, to trigger.

### Fix: one atomic database function, not two application-layer steps

`public.update_employer_membership(_membership_id uuid, _new_role text,
_new_status text)` — new in this migration, section 9 — moves the
entire check-then-act sequence into a single Postgres function, so the
count-check and the mutation happen in one transaction, after taking
row locks that force a second concurrent call to wait rather than race.

**Authorization model:** `auth.uid()` only — no actor identity is ever
accepted as a function parameter, so a caller cannot assert someone
else's identity. The function explicitly checks
`public.is_platform_admin(auth.uid())` and raises a clear
`Forbidden: platform admin role required` error otherwise, *in addition
to* RLS itself. The function is `SECURITY INVOKER` (the default), not
`SECURITY DEFINER` — deliberately: the calling platform admin already
has direct RLS-granted access to `employer_memberships` via the
`employer_memberships_admin_all` policy, so a `SECURITY INVOKER`
function runs with the caller's own privileges and RLS keeps applying
inside it exactly as if the caller issued the statements directly. This
means RLS remains the authoritative boundary even if the function's own
explicit admin check were ever accidentally removed in a future edit —
a non-admin's `SELECT ... FOR UPDATE` / `UPDATE` inside the function
would still be denied by RLS, not merely by application logic.
`SECURITY DEFINER` was considered and rejected: nothing in this function
needs to touch data the calling admin doesn't already have direct RLS
access to, so bypassing RLS would only widen the trust boundary for no
benefit.

**Locking strategy — this is the actual race fix:**
```sql
PERFORM 1
FROM public.employer_memberships em
WHERE em.employer_id = _employer_id
  AND (em.id = _membership_id OR (em.role = 'owner' AND em.status = 'active'))
ORDER BY em.id
FOR UPDATE;
```
One statement locks the target row **and** every row that is currently
an active owner for the same employer, together, ordered by `id`. Two
concurrent calls touching the same employer always request that same
lock set in that same order, so the second call simply blocks on
ordinary lock contention until the first call's transaction commits or
rolls back — it can never observe a stale, pre-change count. Locking the
full candidate set in one, consistently-ordered statement (rather than
two separate lock statements, e.g. "lock my row" then "lock the other
owners") is also what avoids a deadlock between the two concurrent
calls — both always acquire locks in the same relative order, so one
simply waits for the other rather than each holding a lock the other
needs.

The count-check and the `UPDATE` happen after this lock, inside the same
function invocation (one implicit transaction) — no other transaction
can have changed any locked row in between, so the final-owner
evaluation is against genuinely current data, not a stale read.

**Scope:** covers `adminUpdateEmployerMembershipRole` and
`adminUpdateEmployerMembershipStatus`, both of which now call this one
RPC (with only `_new_role` or only `_new_status` set, respectively) in
place of their old separate `SELECT` + `UPDATE`. Not called from
`adminCreateEmployerMembership`, since creation only ever adds capacity
and structurally cannot violate the invariant. Still not enforced for
every conceivable write path — a platform admin issuing a raw SQL
statement outside this RPC could still violate the invariant — but this
is the same trust level already extended to platform admins for direct
database access everywhere else in this schema, and is a materially
smaller residual risk than the original app-level-only race, since every
*normal* write path (this RPC, called by both of the only two functions
that ever change role/status) is now race-free.

**No-op detection moved into the same function:** if the resolved
`role`/`status` equal the row's current values, the function returns
immediately with `changed = false` and performs no `UPDATE` — no
`updated_at` bump, no state change of any kind. See "No-op update
handling" below for how the TypeScript callers use this.

**`removed_at` semantics, enforced inside the same `UPDATE`:**
`removed_at = CASE WHEN _final_status = 'removed' THEN now() ELSE NULL
END` — set exactly when the resulting status is `'removed'`, and
explicitly cleared to `NULL` for every other resulting status (`active`,
`invited`, `suspended`). A membership can no longer carry a stale
`removed_at` timestamp after being reactivated or otherwise changed
following a prior removal. See "removed_at semantics" below.

**Test coverage:** scenarios 1–5 and 9–10 in "Additional tests from the
code-review fix" below.

## No-op update handling

Three write paths now compare the requested value against the current
value before doing anything, and skip both the write and the audit
event when they're identical — an unconditional update on a no-op save
would otherwise be a misleading audit row (`before === after`).

- **`update_employer_membership`** (database function, used by both
  `adminUpdateEmployerMembershipRole` and
  `adminUpdateEmployerMembershipStatus`): compares the resolved
  role/status against the row's current values immediately after
  locking it; returns `changed = false` with no `UPDATE` if identical.
  The two TypeScript callers only call `writeMembershipAudit(...)` when
  `row.changed` is `true`.
- **`adminUpsertEmployer`'s update branch** (`admin.functions.ts`):
  compares `name`, `slug`, `website`, `country`, `description_sv`,
  `description_en`, and the resolved `status` against the existing row
  before doing anything; if every field matches, the function returns
  `{ id: data.id }` immediately with no `UPDATE` and no `employer_updated`
  (or `employer_status_changed`) audit write.

In all three cases, the "no change" response returns the existing
record's identity safely (the caller gets a normal success response,
just with `changed: false` or no side effect) — it is not treated as an
error.

## removed_at semantics

| Transition | `removed_at` |
|---|---|
| any status → `removed` | set to `now()` |
| any status → `active` / `invited` / `suspended` | explicitly set to `NULL` (not just left as-is) |
| no-op (status unchanged) | untouched — no `UPDATE` runs at all |

Enforced unconditionally inside `update_employer_membership`'s single
`UPDATE` statement (see SQL above) — there is exactly one code path that
can change `status`, so there is exactly one place this rule needs to be
correct.

## Audit logging

All six required event types write to the existing, previously-unused
`public.audit_logs` table (`actor_id, actor_role, action, subject_type,
subject_id, org_id, metadata jsonb, at` — schema unchanged, already
`service_role`-only grant):

| Action | Written from |
|---|---|
| `employer_created` | `admin.functions.ts` → `adminUpsertEmployer` (create branch) |
| `employer_updated` | `admin.functions.ts` → `adminUpsertEmployer` (update branch) |
| `employer_status_changed` | `admin.functions.ts` → `adminUpsertEmployer` (update branch, only when `status` differs) |
| `membership_created` | `membership.functions.ts` → `adminCreateEmployerMembership` |
| `membership_role_changed` | `membership.functions.ts` → `adminUpdateEmployerMembershipRole` |
| `membership_status_changed` | `membership.functions.ts` → `adminUpdateEmployerMembershipStatus` |

**Written only on a real state change** (code-review fix — see "No-op
update handling" above): `employer_updated`/`employer_status_changed`
are skipped entirely when `adminUpsertEmployer`'s no-op comparison finds
no field differs; `membership_role_changed`/`membership_status_changed`
are skipped when `update_employer_membership` returns `changed: false`.
`membership_created` has no no-op case — creation is always a real
state change by definition.

`metadata` contains only non-sensitive operational data: names, slugs,
role/status before/after values, and bare `uuid` actor/target references
(never an email, never assessment content, never a token or secret) —
the same precedent already established by `job_audit_events.actor_id`
being a bare uuid, resolved to a human identity only inside an
admin-gated UI.

## Generated types

**Not regenerated — explicit limitation, not silently worked around.**
`src/integrations/supabase/types.ts` is Lovable Cloud–generated
(`// This file is automatically generated. Do not edit it directly.`)
and this environment has no connection to the Lovable Cloud project, so
codegen cannot run here. It was **not** hand-edited. Every new
`.from("employer_memberships")`/`.rpc("is_platform_admin", ...)`/
`.rpc("has_employer_role", ...)` call type-checks today only because
`Ctx.supabase` is already typed `any` throughout this codebase's
`*.functions.ts` files (the same reason `report.functions.ts` casts to
`any` for `save_career_report` before its own migration was applied —
see that file's own comment). **Regenerating types via Lovable Cloud's
own workflow is a required step before or immediately after this
migration is applied**, so the `any` typing can be narrowed back to the
generated `Database` type.

## Tests run and results

**Run in this environment, twice — once for the original implementation
and again after the three code-review fixes (results below are the
second, current run; both were real, not assumed):**

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | Clean, 0 errors |
| `bun run cie:check` | `CIE v1 harness: PASS`, 11/11 personas, byte-identical to the pre-Phase-G1 baseline |
| `bun run kg:check` | `kg:check OK` |
| `grep` isolation (`employer_memberships`/`has_employer_role`/`is_platform_admin`/`update_employer_membership` must not appear under `src/lib/career-intelligence-engine/`) | Empty — clean |
| `bun run lint` | Non-blocking per CI configuration and this task's instructions. Findings on touched files are `@typescript-eslint/no-explicit-any`, matching this codebase's own pre-existing `Ctx = { supabase: any }` / `as any`-cast convention already used throughout every `*.functions.ts` file (including the pre-existing `writeAudit()` this phase's `writeOrgAudit()`/`writeMembershipAudit()` mirror), plus one pre-existing, untouched-by-this-phase prettier formatting item. No new lint *category* introduced; no formatting debt fixed, per instruction. |

**Cannot be run from this environment (no connected database — the same
constraint present throughout this entire project, confirmed repeatedly
across every prior phase of this session):** every RLS/live-database
scenario. These are fully specified below as ready-to-run validation SQL
and a 20-scenario test matrix, for execution in Lovable Cloud's connected
environment before this migration is applied to any real database —
matching this project's established Claude-drafts / Lovable-verifies
division of labour.

### Validation SQL (to run in the connected environment)

```sql
-- Before/after for all 10 touched policies
SELECT policyname, qual, with_check FROM pg_policies
WHERE tablename IN ('jobs','employers','employer_admin_meta','job_admin_meta','job_audit_events','job_import_sources')
  AND policyname IN ('jobs_public_active_select','employers_public_active_select',
    'job_import_sources_admin_all','job_import_sources admin read','employer_admin_meta_admin_all',
    'jobs_admin_select','jobs_admin_write','employers_admin_all','job_admin_meta_admin_all',
    'job_audit_events_admin_select');

SELECT * FROM information_schema.role_table_grants
WHERE table_name IN ('employers','employer_memberships') ORDER BY grantee;

SELECT public.is_platform_admin('<admin-only test user id>');       -- expect true
SELECT public.is_platform_admin('<superadmin-only test user id>');  -- expect true
SELECT public.is_platform_admin('<neither role test user id>');     -- expect false

SELECT public.has_employer_role('<user>', '<employer X>');                    -- active member -> true
SELECT public.has_employer_role('<user>', '<employer Y>');                    -- not a member -> false
SELECT public.has_employer_role('<suspended user>', '<their employer>');      -- suspended -> false
```

### Test matrix (20 scenarios required by the brief)

| # | Scenario | Mechanism / expected result |
|---|---|---|
| 1 | Unauthenticated user | No grant path reaches `employer_memberships` or the new functions without a valid bearer token (`requireSupabaseAuth` rejects before any handler runs); anon has zero policy on `employer_memberships` |
| 2 | Candidate, no employer | `listMyEmployerMemberships` returns `[]`; `employer_memberships_self_select` returns zero rows; every candidate table/flow untouched |
| 3 | Active member | Sees own row(s) via self-select; sees own employer via `employers_member_select`; zero write access |
| 4 | Employer admin (role) | Same read access as any active member in G1 — role recorded, not yet functionally differentiated (no self-service ships in G1) |
| 5 | Employer owner (role) | Same as above; additionally protected by the final-active-owner check when their own row is the last active owner |
| 6 | Platform admin | Full access via `is_platform_admin` — unchanged from pre-G1 behaviour |
| 7 | Superadmin | **Now** full access via `is_platform_admin` — this is the corrected defect; previously locked out |
| 8 | User in two employers | Two independent `UNIQUE(employer_id,user_id)` rows; each `has_employer_role` check is scoped to one specific `employer_id`; no shared state between them |
| 9 | Suspended membership | `has_employer_role` excludes it (`status='active'` required); `employers_member_select` access lost immediately, no cache to invalidate |
| 10 | Removed membership | Same exclusion as suspended; `removed_at` stamped by `adminUpdateEmployerMembershipStatus` |
| 11 | Cross-employer read attempt | `has_employer_role(auth.uid(), <other employer>, NULL)` evaluates false for that specific id; denied |
| 12 | Cross-employer write attempt | No write policy exists for non-admins on any employer; denied at the grant/policy layer regardless of target |
| 13 | Forged caller `user_id` | Every function derives identity from `ctx.userId` (verified `requireSupabaseAuth` claims) exclusively; no function parameter accepts a caller-identity override |
| 14 | Employer admin attempts platform-role escalation | Structurally impossible — `employer_memberships` and `user_roles` are different tables with no write path between them; no function in this phase writes `user_roles` |
| 15 | Employer owner attempts superadmin escalation | Same structural impossibility as #14 |
| 16 | Attempt to remove/downgrade the final active owner | `update_employer_membership` raises before any update is applied, called by both `adminUpdateEmployerMembershipRole` and `adminUpdateEmployerMembershipStatus` — see "Additional tests from the code-review fix" below for the race-specific variant of this scenario |
| 17 | Existing assessment flow | Zero files under `career-intelligence-engine`/`career-assessment` touched; `bun cie:check` 11/11 confirms no behavioural change |
| 18 | Existing saved-report flow | Zero files under the Phase 2 saved-report surface touched; unaffected by construction |
| 19 | Public jobs for active employer | `jobs_public_active_select`/`employers_public_active_select`'s added condition (`employers.status='active'`) is satisfied by every existing row (default `'active'`) — behaviour unchanged |
| 20 | Public jobs for suspended employer | Same policies' added condition excludes it — the new, intended behaviour |

Scenarios 1–16 and 19–20 require the connected environment to execute
against real rows; 17–18 are confirmed today by the automated checks
above plus the fact that no file in either surface appears in this
branch's diff.

### Additional tests from the code-review fix

The 12 tests explicitly requested by the final security review, each
marked with what's actually been done versus what still requires the
connected environment.

| # | Test | Status |
|---|---|---|
| 1 | Final owner role downgrade blocked | **Prepared, not executed.** `update_employer_membership(target, _new_role := 'member')` where target is the sole active owner → expect `RAISE EXCEPTION 'Cannot change this membership...'`. Requires a live database. |
| 2 | Final owner suspension blocked | **Prepared, not executed.** Same function, `_new_status := 'suspended'` → same expected exception. Requires a live database. |
| 3 | Final owner removal blocked | **Prepared, not executed.** Same function, `_new_status := 'removed'` → same expected exception. Requires a live database. |
| 4 | Two owners, one downgrade succeeds | **Prepared, not executed.** With two active owners, downgrading one succeeds (`changed: true`, no exception) and the other owner's row is unaffected. Requires a live database. |
| 5 | Concurrent downgrade/removal of two owners cannot leave zero active owners | **Prepared, not executed — the concurrency test procedure above.** This is the direct validation of the H1 fix and can only be observed against a real Postgres instance with two genuinely concurrent sessions; cannot be simulated meaningfully outside a connected environment. |
| 6 | No-op role update writes no audit event | **Logic verified by code inspection + typecheck; not executed against a live database.** `adminUpdateEmployerMembershipRole` only calls `writeMembershipAudit` when `row.changed` is `true`, and `update_employer_membership` returns `changed: false` without updating when the resolved role equals the existing role. |
| 7 | No-op status update writes no audit event | Same mechanism and same verification status as #6, for `adminUpdateEmployerMembershipStatus`. |
| 8 | No-op employer update writes no misleading audit event | **Logic verified by code inspection + typecheck; not executed against a live database.** `adminUpsertEmployer`'s `isNoOp` comparison (all seven mutable fields) short-circuits before any `UPDATE` or `writeOrgAudit` call. |
| 9 | `removed → active` clears `removed_at` | **Prepared, not executed.** `update_employer_membership`'s `UPDATE` sets `removed_at = CASE WHEN _final_status = 'removed' THEN now() ELSE NULL END` unconditionally on every real (non-no-op) status change — a transition to `active` always results in `removed_at IS NULL`. Requires a live database to observe the actual column value. |
| 10 | `active → removed` sets `removed_at` | **Prepared, not executed.** Same `CASE` expression, `removed_at = now()` when `_final_status = 'removed'`. Requires a live database. |
| 11 | Non-platform user cannot call the RPC successfully | **Prepared, not executed.** Two independent layers both deny it: (a) the function's own `IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION` runs before any table access; (b) even if that check were removed, RLS's `employer_memberships_admin_all` (the only policy permitting `UPDATE`) would still deny the underlying `SELECT ... FOR UPDATE`/`UPDATE` for a non-admin caller, because the function is `SECURITY INVOKER` and therefore fully subject to RLS. Requires a live database to observe both layers directly; verified by code/migration inspection here. |
| 12 | Forged actor identity is impossible | **Verified by code inspection, confirmed structurally, no live database needed.** `update_employer_membership` takes no actor/user-id parameter of any kind — its only identity input is `auth.uid()`, resolved server-side from the session's own verified JWT. There is no argument a caller could pass to assert a different identity. Same property holds for every other function in both files: `ctx.userId` (TypeScript) and `auth.uid()`/`context.userId` (SQL/middleware) are always derived from `requireSupabaseAuth`'s verified claims, never from request-body input. |

## Rollback procedure

Exact SQL, restoring every touched object's original definition
verbatim:

```sql
-- Revert the 8 admin-equivalence policies to their pre-G1 predicate
ALTER POLICY "job_import_sources_admin_all" ON public.job_import_sources
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_import_sources admin read" ON public.job_import_sources
  USING (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "employer_admin_meta_admin_all" ON public.employer_admin_meta
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "jobs_admin_select" ON public.jobs
  USING (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "jobs_admin_write" ON public.jobs
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "employers_admin_all" ON public.employers
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_admin_meta_admin_all" ON public.job_admin_meta
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_audit_events_admin_select" ON public.job_audit_events
  USING (public.has_role(auth.uid(), 'admin'));

-- Revert the public-visibility narrowing to its pre-G1 predicate. This
-- MUST run before dropping employer_is_active_status() below --
-- jobs_public_active_select's current (post-fix) definition calls that
-- function, and Postgres refuses to drop a function a live policy still
-- depends on. Reverting the policy first removes the dependency.
ALTER POLICY "jobs_public_active_select" ON public.jobs
  USING (public.job_is_active(status, published_at, deadline_at, expires_at));
ALTER POLICY "employers_public_active_select" ON public.employers
  USING (EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
  ));

-- Remove every new object (functions before the table/policies that
-- reference them, so drop order is self-explanatory and, for
-- employer_is_active_status specifically, actually required given the
-- policy revert above already removed its only remaining dependent).
DROP FUNCTION IF EXISTS public.employer_is_active_status(uuid);
DROP FUNCTION IF EXISTS public.update_employer_membership(uuid, text, text);
DROP POLICY IF EXISTS "employers_member_select" ON public.employers;
DROP POLICY IF EXISTS "employer_memberships_admin_all" ON public.employer_memberships;
DROP POLICY IF EXISTS "employer_memberships_self_select" ON public.employer_memberships;
DROP FUNCTION IF EXISTS public.has_employer_role(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.is_platform_admin(uuid);
DROP TABLE IF EXISTS public.employer_memberships;
ALTER TABLE public.employers DROP COLUMN IF EXISTS status;
```

Application code rollback: revert `admin.functions.ts`'s changes
(`assertAdmin`/`adminWhoAmI` RPC target back to `has_role`/`{_role:
"admin"}`; remove `writeOrgAudit` and its call sites; remove the
`status` field and no-op comparison from `adminUpsertEmployer`); delete
`membership.functions.ts`. No other file requires any change to fully
roll back.

**Rollback drill (to run in the connected environment before production
application):** apply forward → run the `pg_policies` query above,
capture output → apply rollback → re-run the same query, confirm it
matches the pre-migration original text exactly; also confirm
`update_employer_membership` no longer exists
(`SELECT 1 FROM pg_proc WHERE proname = 'update_employer_membership'`
returns zero rows) → re-apply forward → confirm the resulting state
matches the first post-apply capture exactly.

**Concurrency test procedure (to run in the connected environment,
after the forward migration is applied — this is the test that directly
validates the race-condition fix):**
1. Seed one employer with exactly two `employer_memberships` rows,
   both `role = 'owner'`, both `status = 'active'` (owners A and B).
2. From two separate connections/sessions, both authenticated as a
   platform admin, simultaneously call
   `update_employer_membership(A.id, _new_status := 'suspended')` and
   `update_employer_membership(B.id, _new_status := 'suspended')` —
   e.g. via `pg_sleep` injected into one session between the lock and
   the count-check to force the interleaving deterministically, or via
   two concurrent application requests fired at the same instant.
3. Expected result: exactly one call succeeds; the other either blocks
   until the first commits and then correctly fails the final-owner
   check (because the first call's change is now visible), or the two
   calls' lock-ordering causes the second to simply wait its turn — in
   no observed outcome do both succeed and leave the employer with zero
   active owners.
4. Confirm via `SELECT count(*) FROM employer_memberships WHERE
   employer_id = ... AND role = 'owner' AND status = 'active'` that the
   count is never `0` after both calls have completed (one succeeded,
   one failed, or one is still correctly blocked/retried).

## Local database validation (Phase G1 — final pre-production pass)

This section supersedes every earlier "cannot be verified without a
connected database" caveat in this report where noted below — the
validation described here was actually executed against a real
PostgreSQL 16 instance, not simulated or assumed.

### Security mode discrepancy — resolved

A discrepancy was raised: Claude's own prior reports stated
`update_employer_membership` uses `SECURITY INVOKER`; a separate Lovable
migration-workflow review reported `SECURITY DEFINER` for the same
function. Resolution: the actual migration file on this branch, inspected
directly before any other action, at commit `d614a152a2eceb14b782af6d86e538c918b47b47`
(the HEAD of `phase-g1-employer-memberships` at the time this validation
began), reads verbatim:

```sql
CREATE OR REPLACE FUNCTION public.update_employer_membership(
  _membership_id uuid,
  _new_role text DEFAULT NULL,
  _new_status text DEFAULT NULL
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
```

**`SECURITY INVOKER`, confirmed, verbatim, at the source of truth.** No
basis was found for the `SECURITY DEFINER` claim by inspecting the
committed file itself — it may reflect a stale cache, a different
commit, or a parsing artifact on Lovable's side, but this cannot be
determined from this repository alone. Per the decision tree for the
`SECURITY INVOKER` case, the required follow-up was to verify that the
`authenticated` role has all RLS permissions needed for the RPC to
complete successfully under the existing policies — this is exactly what
the local database validation below empirically confirms (§ RLS and
authorization results): a platform-admin `authenticated` caller
successfully completes every `update_employer_membership` operation
end-to-end, entirely through RLS-granted access (`employer_memberships_
admin_all`), with no `SECURITY DEFINER`/service-role escalation anywhere
in the call path.

### Local database environment

No Postgres or Docker was available in this sandbox at the start of this
task. Installed disposable, non-production tooling:

```
brew install postgresql@16          # 16.14, matches the target production major version
initdb -D <scratch-dir>/phase-g1-pgdata -U postgres -E UTF8 --locale=C
LC_ALL=C pg_ctl -D <scratch-dir>/phase-g1-pgdata -o "-p 55432 -h 127.0.0.1" start
```

A fresh cluster and database (`phase_g1_test`), entirely outside the
project repository (scratch directory), never connected to Lovable Cloud,
any external Supabase project, or any credential from `.env`. Torn down
completely at the end of this task (`pg_ctl stop` + `rm -rf` the data
directory) — nothing from this environment persists.

The mock schema (`tests/database/phase-g1/00_mock_schema.sql`)
reconstructs, with synthetic data only, the pre-existing production
objects this migration depends on or `ALTER POLICY`s: `auth.users`,
a local `auth.uid()` stand-in (reads a session GUC set via
`set_config('request.jwt.claim.sub', ...)`, the standard local-RLS-test
pattern), `profiles`, `app_role`/`user_roles`/`has_role()`, `employers`
(pre-G1 shape), `employer_admin_meta`, `jobs`, `job_is_active()`,
`job_admin_meta`, `job_import_sources`, `job_audit_events`, `audit_logs`
— verbatim column lists and policy text copied from the real migrations,
so the **actual, unmodified** `20260719100000_employer_memberships.sql`
could be applied byte-for-byte, exactly as it would be applied in
production. `anon`/`authenticated`/`service_role` Postgres roles created
to match Supabase's own role model.

### Migration apply result

**First attempt: two real, previously-undetected bugs found — both
fixed on this branch, both re-verified.** This is the central finding
of this validation pass.

**Bug 1 — RLS mutual recursion (critical).** The migration's own section
7 (public-visibility narrowing) added a plain `EXISTS (SELECT 1 FROM
public.employers e WHERE ...)` inside `jobs_public_active_select`'s
`USING` clause. Combined with `employers_public_active_select`'s
pre-existing (unchanged) subquery into `jobs`, this created a genuine
mutual dependency between the two tables' RLS policies. Applying the
migration succeeded, but the very first `SELECT` against `jobs` or
`employers` under RLS — by *any* role, anon, authenticated member, or
even platform admin — failed with:
```
ERROR:  infinite recursion detected in policy for relation "employers"
ERROR:  infinite recursion detected in policy for relation "jobs"
```
This would have broken the entire public jobs/employers surface and the
existing admin console's job/employer listings the moment this migration
was applied to any real database — a severity this report was
specifically designed to catch before that could happen. **Fixed** by
adding `public.employer_is_active_status(uuid)`, a `SECURITY DEFINER`
helper whose internal lookup does not re-trigger `employers`' own RLS
(the same "avoids RLS recursion" technique this codebase's own `has_role`/
`is_platform_admin`/`has_employer_role` already use, per their own
comments), and changing `jobs_public_active_select` to call it instead
of querying `employers` directly. Full before/after/rationale is now in
the migration file itself (section 7).

**Bug 2 — ambiguous column reference inside `update_employer_membership`
(critical).** `RETURNS TABLE (id uuid, ...)` implicitly declares `id` as
a PL/pgSQL variable in scope for the whole function body. One internal
query — `SELECT * INTO _existing FROM public.employer_memberships WHERE
id = _membership_id;` — was missing the table alias every *other*
reference in the function correctly used, making `id` ambiguous between
that variable and the table column. This line runs on **every** call to
the function, no-op or not, so this bug would have broken 100% of calls
to `update_employer_membership` — i.e. both `adminUpdateEmployerMembership
Role` and `adminUpdateEmployerMembershipStatus` would have failed on
every invocation. **Fixed** by aliasing the query (`FROM
public.employer_memberships em WHERE em.id = _membership_id`).

Both bugs were invisible to static code review and to `bunx tsc --noEmit`
(TypeScript has no visibility into PL/pgSQL variable scoping or
cross-policy RLS evaluation) — they only surfaced through actual
execution against a real PostgreSQL engine, which is the direct
justification for this validation phase existing at all.

**After both fixes, the migration was dropped, the database rebuilt from
scratch, and the corrected file reapplied — clean, zero errors, all 20
statements (10 `ALTER POLICY` + table/function/index/trigger/grant
creation) succeeded.** Schema tests 1–5 below reflect this corrected,
re-verified state.

### RLS and authorization test results

All against the real database, switching identity via
`SET ROLE`/`set_config('request.jwt.claim.sub', ...)` per Supabase's
own local-testing convention:

| # | Test | Result |
|---|---|---|
| 2 | `employers.status`: default `'active'`, `CHECK IN (draft,active,suspended,archived)` | **PASS** — confirmed via `information_schema.columns` + `pg_get_constraintdef` |
| 3 | `employer_memberships`: 12 columns, 4 FKs (2× `ON DELETE CASCADE`, 2× `ON DELETE SET NULL`), `UNIQUE(employer_id,user_id)`, role/status `CHECK`s, 5 indexes incl. the `(user_id,status)` composite, `set_updated_at` trigger, grants, RLS enabled | **PASS** — every element confirmed present via `pg_constraint`/`pg_indexes`/`pg_trigger`/`information_schema.role_table_grants`/`pg_class.relrowsecurity` |
| 4 | `is_platform_admin`/`has_employer_role` `SECURITY DEFINER=true`; `update_employer_membership` `SECURITY DEFINER=false` (i.e. `INVOKER`, confirmed a second, independent way via `pg_proc.prosecdef`); `anon` denied execute on all three, `authenticated`/`service_role` granted | **PASS** |
| 5 | 5 expected policies exist (`employer_memberships_admin_all`, `employer_memberships_self_select`, `employers_admin_all`, `employers_member_select`, `employers_public_active_select`) with correct `cmd`/`roles` | **PASS** |
| 6 | Unauthenticated (`anon`): zero visible rows, `INSERT` denied (`insufficient_privilege`) | **PASS** |
| 7 | Candidate, no membership: `0` visible rows | **PASS** |
| 8 | Active member: exactly 1 membership row (own), exactly 1 employer (own) | **PASS** |
| 9 | Member of employer A querying employer B directly: `0` rows | **PASS** |
| 10 | Dual-org user: exactly 2 employer_ids, exactly 2 employers, both correct | **PASS** |
| 11 | Suspended member: own row visible (by the self-select design, any status), but `employers_member_select` access `= 0`; removed/invited: `has_employer_role = false` | **PASS** |
| 12 | Platform admin: `is_platform_admin = true`, sees all membership rows | **PASS** |
| 13 | **Superadmin-only** (no `admin` role): `is_platform_admin = true`, sees all membership rows — the corrected defect, directly confirmed | **PASS** |
| 14 | `content_editor`/`assessment_editor`/`support`: `is_platform_admin = false` for all three; `content_editor` sees `0` membership rows | **PASS** |
| 15 | Employer-scoped "admin"-role user (not a platform role): `is_platform_admin = false`; direct `INSERT` into `user_roles` denied (`insufficient_privilege`) | **PASS** |
| 16 | Forged actor identity: `update_employer_membership`'s signature (`_membership_id uuid, _new_role text, _new_status text`) confirmed to contain no actor/user-id parameter of any kind — structurally impossible, not merely untested | **PASS** |

### Owner-protection and concurrency results

| # | Test | Result |
|---|---|---|
| 17 | Sole active owner, role downgrade attempt | **PASS** — raised `Cannot change this membership: it is the only active owner...` |
| 18 | Sole active owner, suspension attempt | **PASS** — same exception |
| 19 | Sole active owner, removal attempt | **PASS** — same exception; employer retained exactly 1 active owner after all 3 blocked attempts |
| 20 | Two active owners, one changed | **PASS** — `changed=true`, role updated, employer correctly left with exactly 1 active owner |
| 21 | **Concurrency** — two genuinely concurrent `psql` processes (not simulated), each demoting a different active owner of the same employer | **PASS** — see exact evidence below |

**Test 21 evidence (real timestamps, real two-process concurrency):**
Session 1 began at `13:37:56.984`, its `update_employer_membership` call
completed (inside its own still-open transaction) at `13:37:56.988`,
then held the transaction open via `pg_sleep(3)`, committing at
`13:37:59.991`. Session 2 began independently, 0.5s later, at
`13:37:57.510` — while session 1's transaction was still open and
holding its row locks. Session 2's call did not return a row at all; it
raised `Cannot change this membership: it is the only active owner for
this employer...` and rolled back. This outcome is only explicable by
session 2's internal `SELECT ... FOR UPDATE` genuinely blocking on
session 1's held locks until session 1 committed, then re-evaluating
against the now-current (post-session-1) data — under Postgres's
documented `FOR UPDATE` semantics, this is the only way session 2 could
have observed session 1's committed change despite session 2's own
transaction having started before that commit. Final state, verified
directly: owner A's row → `member` (session 1's change persisted);
owner B's row → unchanged, still `owner`/`active` (session 2's change
correctly never applied); **`employer_memberships` active-owner count
for this employer = `1` — never `0`, at any point.** Scripts:
`tests/database/phase-g1/04_concurrency_session1.sql` /
`04_concurrency_session2.sql`.

### State-integrity results

| # | Test | Result |
|---|---|---|
| 22 | No-op role update | **PASS** — `changed=false`, confirmed via the RPC's own return value |
| 23 | No-op status update | **PASS** — `changed=false` |
| 24 | `active → removed` | **PASS** — `changed=true`, `status=removed`, `removed_at IS NOT NULL` |
| 25 | `removed → active` | **PASS** — `changed=true`, `status=active`, `removed_at IS NULL` (confirmed cleared, not stale) |
| 26–28 | Employer no-op/real-update audit correctness, audit metadata sensitivity | Verified structurally (code inspection of the no-op comparison and the metadata payloads, both unchanged from the prior code-review-fix pass) plus a live confirmation that `audit_logs` itself is unreadable/unwritable by `authenticated` (`insufficient_privilege`) — the actual application-layer no-op-skips-audit behavior lives in TypeScript (`adminUpsertEmployer`, `writeMembershipAudit` call sites), which this SQL-only validation environment does not execute; unchanged, previously-typechecked code, not re-exercised here |

### Public-visibility results

| # | Test | Result |
|---|---|---|
| 29 | Active employer with active job, anon read | **PASS** — employer and job both visible |
| 30 | Suspended employer, anon read | **PASS** — `0` rows |
| 31 | Archived employer, anon read | **PASS** — `0` rows |
| 32 | Jobs of suspended/archived employers, anon read | **PASS** — `0` rows both |

### Regression results

| # | Test | Result |
|---|---|---|
| 33 | Existing admin: sees all jobs (3) and all employers (4) | **PASS** |
| 34 | Superadmin: same counts, confirming equivalent access | **PASS** |
| 35 | Candidate-owned data models unaltered | **PASS by construction** — no candidate-owned table exists in this migration's diff; nothing to alter |
| 36 | Migration performs no write to `assessment_runs`/`assessment_run_reports` | **PASS** — `grep -c "assessment_run" supabase/migrations/20260719100000_employer_memberships.sql` → `0` |

### Rollback and reapply results

Executed `tests/database/phase-g1/05_rollback.sql` — copied verbatim
from this report's own "Rollback procedure" section (updated to add the
`employer_is_active_status` drop found necessary by this same
validation pass; see that section).

- **Before/after `pg_policies` capture for all 10 touched policies:**
  after rollback, every one of the 10 matched its original, pre-G1 text
  **exactly**, byte-for-byte (`has_role(auth.uid(), 'admin'::app_role)`
  restored for the 8 admin-equivalence policies; the original
  single-predicate `jobs_public_active_select` and original
  `EXISTS`-subquery `employers_public_active_select` restored).
- **New-object removal confirmed directly**, not assumed: `SELECT` from
  `pg_tables`/`pg_proc`/`information_schema.columns` for all six new
  objects (`employer_memberships` table, `is_platform_admin`,
  `has_employer_role`, `update_employer_membership`,
  `employer_is_active_status`, `employers.status` column) — all six
  returned `0`.
- **Reapply:** the corrected forward migration was applied a second time
  to the now-rolled-back database — zero errors, and the resulting
  `pg_policies` state for `jobs_public_active_select`/
  `employers_public_active_select` matched the first post-fix
  application exactly.

**Result: PASS** — rollback is safe, complete, and the forward migration
is idempotent-in-effect across a rollback/reapply cycle.

### Remaining production-only verification

Everything above was executed against a synthetic local database, not
Lovable Cloud. Still required before production application:

- Apply this exact migration to a **Lovable Cloud staging/dev project**
  (never production directly) and repeat the `pg_policies` before/after
  capture and the grant checks against the *actual* connected database,
  per the established Step 1.5 process from earlier in this project.
- Repeat the concurrency test (test 21) against that same staging
  environment — local Postgres 16 behaviour is expected to match
  Supabase-managed Postgres exactly for standard row-locking semantics,
  but this has not been independently confirmed on the actual managed
  service.
- Regenerate `src/integrations/supabase/types.ts` via Lovable Cloud's own
  workflow (still not possible from this or any prior environment in
  this project).
- A genuine end-to-end pass through the real TypeScript server functions
  (`membership.functions.ts`, `admin.functions.ts`) against a live
  database — this validation exercised the SQL layer directly; it did
  not execute the TypeScript call sites themselves (no Node/Bun-to-
  Postgres bridge was set up for that, only raw SQL/psql).
- Backup the target staging database before applying, per standing
  project convention.

## Known limitations

- **Types not regenerated** — see "Generated types" above. Required
  before or immediately after this migration is applied anywhere.
- **RLS and concurrency verification (superseded, resolved)** — the
  prior version of this report noted that no live database was
  available to verify RLS/concurrency. This has since been done: see
  "Local database validation" above, executed against a real local
  PostgreSQL 16 instance, including the actual two-process concurrency
  test. Two real, previously-undetected bugs were found this way (an
  RLS mutual-recursion defect between `jobs`/`employers` policies, and
  an ambiguous-column reference inside `update_employer_membership`
  that would have broken every call to it) and both are fixed on this
  branch, re-verified. **Still required**: the same validation repeated
  against an actual Lovable Cloud staging environment before production
  application — see "Remaining production-only verification" above; a
  clean local-Postgres result is strong evidence, not a substitute for
  that.
- **Final-owner protection is now DB-enforced and race-free**
  (superseded limitation, resolved in this revision) — the check and
  the mutation both happen inside `update_employer_membership`, under
  row locks, in one transaction, closing the check-then-act race the
  original design had. It is still possible, in principle, for a
  platform admin to violate the invariant via a raw SQL statement that
  bypasses this function entirely (e.g. a direct `UPDATE
  employer_memberships`) — the same trust level already extended to
  platform admins for direct database access everywhere else in this
  schema, and a materially smaller residual risk than the original gap,
  since every *normal* write path is now race-free.
- **`employer_memberships_self_select`'s no-status-filter design** is an
  interpretive resolution of ambiguous source wording — flagged for
  explicit confirmation, not assumed correct.
- **`adminUpsertEmployer`'s diff is larger than a minimal 3-line change**
  — required to satisfy the explicit `employer_updated`/
  `employer_status_changed` audit requirement without inventing an
  unrequested sixth server function. Flagged for review, not hidden.
- **Two pre-existing, unrelated migration files** both create
  `security_career_profiles` (`20260718083056_security_career_profiles.
  sql` and `20260718153627_f2b32c5d-....sql`) — a known issue from an
  earlier phase, still unresolved, confirmed unrelated to and untouched
  by this migration.

## Deferred functionality (G2/G3 and later)

Per the brief's explicit "Must not be built in G1" list, all of the
following remain fully out of scope and untouched: employer dashboard
UI, context switcher, employer navigation entry, employer onboarding,
employer self-registration, invitation emails, invitation acceptance UI,
candidate/employee invitation UI, job posting UI, application flow,
saved-job UI changes, assessment invitation flow, candidate search, ATS,
billing/subscriptions, SSO, organisation hierarchy/departments,
automated candidate approval or rejection. Also deferred: DB-level
final-owner enforcement (see "Known limitations"), richer employer
verification states beyond the existing `employer_admin_meta.verified`
boolean, and any `job_activity`-style event table.

## Feature flags

Confirmed unchanged by this phase, all three still `false`:
`VITE_EMPLOYER_PORTAL_ENABLED=false`, `VITE_JOBS_ENABLED=false`,
`VITE_CIG_LIFECYCLE_ENFORCED=false`. No route, nav entry, or UI reads any
new flag in this phase — there is no UI in this phase at all.
