# Phase G2 — Employer Context Experience

**Status:** Implemented on `phase-g2-employer-context`. No database change,
no migration, no `.env` change. Feature flags unchanged, all three still
`false`. Not merged, not deployed, not published.

## Purpose

Phase G1 built the backend for one shared `auth.users` identity to
belong to zero, one, or several employer organisations. Phase G2 builds
the minimum safe *experience* on top of that: a protected `/employer`
surface a signed-in user can reach without a second login, that shows
them exactly their own active memberships and nothing else — no
organisation creation, no settings, no job publishing, no invitations.
The founder decision for this phase is stricter than any prior feature
flag's own precedent: the employer entry point is **completely absent**
(no link rendered, no data fetched) while `VITE_EMPLOYER_PORTAL_ENABLED`
is `false`, not merely gated at the destination page.

## Architecture

```
auth.users (unchanged)
  └─ profiles, user_roles (unchanged, platform roles)
  └─ employer_memberships (Phase G1, unchanged)
       → employers (Phase G1, unchanged)

Phase G2 adds ONE new read path on top of this, no new tables, no new
RLS, no new grants:

  listMyEmployerWorkspaces()
    -> employer_memberships (RLS: employer_memberships_self_select)
         embeds -> employers (RLS: employers_member_select)
    -> active memberships only, joined to employer display fields
```

Every route this phase adds is a pure consumer of that one function.
Nothing in G2 writes to the database.

## Routes

- **`src/routes/_authenticated.employer.tsx`** — pure layout
  (`<Outlet/>`), inherits the existing `_authenticated.tsx` session gate
  transitively. No second auth system, no extra guard logic at this
  level — matches the exact `_authenticated.my-career.tsx` pattern.
- **`src/routes/_authenticated.employer.index.tsx`** — `/employer`.
  Flag off → protected "under development" state (no data fetched,
  route-level `if (!employerPortalEnabled())` short-circuit before any
  query). Flag on: 0 active workspaces → neutral empty state ("access is
  assigned by CQrityjob", link back to My Career, no self-registration
  CTA); 1 → auto-redirect straight into it; 2+ → accessible picker
  (semantic `<Link>`s, name + logo, keyboard-navigable by construction).
  Optional last-visited-slug convenience: if `localStorage`'s stored
  slug matches one of the fresh, RLS-scoped active workspaces, redirect
  there instead of showing the picker again; otherwise ignored.
- **`src/routes/_authenticated.employer.$employerSlug.tsx`** —
  `/employer/$employerSlug`. Same flag-off protected state. When
  enabled: calls the same `listMyEmployerWorkspaces()` (same React
  Query cache key as the index route, so a picker→shell navigation
  doesn't refetch), shows a loading state, then locates the route's
  slug **only** within that fresh result. Not found → the exact same
  neutral "access not available" state for every one of: invalid slug,
  another employer's slug, a suspended membership, a removed
  membership, or a stale `localStorage` selection — deliberately
  undifferentiated, so the UI never reveals whether an inaccessible
  organisation exists. Found → minimal shell: employer name, translated
  role badge, "Employer workspace" heading, a notice that job publishing
  and assessment invitations are coming later, a "switch organisation"
  link (only shown when the user has more than one active membership),
  and a link back to My Career. Persists the slug to `localStorage` as
  the new last-visited value on successful access only.

## Shared-account model

Confirmed, not just claimed: no file in this phase touches
`src/integrations/supabase/client.ts`, `auth-middleware.ts`,
`auth-attacher.ts`, or `_authenticated.tsx`. The same
`requireSupabaseAuth`-gated session that serves `/my-career` serves
`/employer*` — verified manually: an unauthenticated visit to
`/employer` redirects to `/auth` exactly like every other
`_authenticated/*` route, with zero new code path involved.

## Workspace-read function

`listMyEmployerWorkspaces` (`src/lib/job-intelligence/
membership.functions.ts`), added alongside the existing
`listMyEmployerMemberships` (unchanged):

```ts
export const listMyEmployerWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyEmployerWorkspace[]> => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("employer_memberships")
      .select("role, employers(id, slug, name, logo_url)")
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your employer workspaces.");
    // ... defensive mapping of the embedded relationship into
    // { employerId, employerSlug, employerName, employerLogoUrl, role }
  });
```

- **Identity**: `ctx.userId`, sourced only from `requireSupabaseAuth`'s
  verified claims — no parameter accepts a caller-supplied identity.
- **Scope**: `.eq("user_id", ctx.userId).eq("status", "active")` — both
  an application-level filter and, independently, exactly what
  `employer_memberships_self_select`'s RLS policy already enforces; the
  embedded `employers(...)` read is independently authorised by
  `employers_member_select`. Removing the application-level filter
  would not widen access — RLS is the real boundary either way.
- **No writes, no new service-role usage** — uses `ctx.supabase` (the
  caller's own RLS-scoped client), the same client
  `listMyEmployerMemberships` already used, unchanged.
- **No inactive organisation access**: `status = 'active'` excludes
  `invited`/`suspended`/`removed` by construction — the same filter
  Phase G1's own `has_employer_role()` already applies, reused here at
  the application layer for the same guarantee.
- **Deliberately does not filter on `employers.status`** — that's the
  Phase G1 public-visibility lifecycle (draft/active/suspended/
  archived), a different concept from membership validity;
  `employers_member_select` was deliberately designed in Phase G1 to
  let an active member keep reading their own employer regardless of
  its public-visibility status. Not re-litigated here.
- **Typed, stable result**: `MyEmployerWorkspace = { employerId,
  employerSlug, employerName, employerLogoUrl, role }` — the minimum
  fields G2 needs, nothing else (no membership id, no timestamps, no
  internal metadata).
- **Fails safely**: a query error returns a fixed, generic message
  (`"Could not load your employer workspaces."`), never the raw
  PostgREST error text — stricter than this file's other functions
  (which do re-throw `error.message` directly, an established,
  accepted convention elsewhere in this file), justified here because
  this function takes zero input parameters, so there is no legitimate
  caller need for query-specific error detail.
- **No second helper added** — one function serves both the picker
  (index route) and the per-org lookup (detail route, via client-side
  `.find()` on the same result), per the explicit "do not add another
  helper unless genuinely required" instruction.

## Security model

Confirmed by implementation, not merely asserted:
- One shared Supabase auth identity — no new client, no new middleware,
  no second login anywhere in this diff.
- Route params have no authorisation value — `$employerSlug` is used
  only to `.find()` within an already-RLS-scoped result; a forged or
  guessed slug that isn't in that result produces the identical
  "access not available" state as a real-but-inaccessible one.
- Every employer page revalidates active membership on every load —
  no client-side caching of an authorisation *decision* (React Query
  caches the *data*, which is itself always freshly RLS-scoped per
  request; the decision of "does this slug match" is recomputed from
  that data on every render).
- Suspended/removed memberships grant no access — excluded by the
  `status = 'active'` filter, unchanged from Phase G1's own guarantee.
- No cross-employer leakage — `employer_memberships_self_select` scopes
  strictly to `auth.uid()`; nothing in this phase reads or displays
  another user's membership rows under any code path.
- Platform admin/superadmin receive no employer workspace access
  without an actual membership row — `listMyEmployerWorkspaces` has no
  `is_platform_admin`/`has_role` check of any kind; a platform role is
  structurally irrelevant to its result.
- Employer role never becomes a platform role — this phase performs no
  write to `user_roles` or `employer_memberships` at all.
- Feature flags are not security boundaries — `employerPortalEnabled()`
  only controls what renders/fetches; RLS remains authoritative and is
  unchanged by this phase.
- No client-provided `user_id` is trusted anywhere in this diff.
- No new service-role usage — every new code path uses the caller's own
  `ctx.supabase`.
- No candidate or assessment data is exposed — nothing in this phase
  reads `assessment_runs`, `assessment_run_reports`, or
  `security_career_profiles`.

## Feature-flag behaviour

`employerPortalEnabled()` (`src/lib/job-intelligence/feature-flag.ts`),
same pattern as `jobsEnabled()`: dual `import.meta.env`/`process.env`
read, string-compared to `"true"`, explicit "release-control only, not
a security boundary" comment.

- **`/my-career`**: the "Employer workspace" entry point's query is
  `enabled: employerPortalEnabled()` — while false, **no network
  request is made at all**, and the link itself renders nothing
  (`{employerPortalEnabled() && hasEmployerWorkspace && (...)}`).
- **`/employer` and `/employer/$employerSlug`**: both check the flag
  before doing anything else and render an identical "under
  development" state with no membership data fetched or revealed,
  regardless of the caller's real memberships.
- Confirmed manually: a fresh dev server with the current, unmodified
  `.env` (`VITE_EMPLOYER_PORTAL_ENABLED=false`) redirects an
  unauthenticated `/employer` visit to `/auth` with zero console/server
  errors — the same behaviour every other `_authenticated/*` route has
  always had; no new failure mode observed.

## Files changed

```
M  src/lib/job-intelligence/membership.functions.ts   (+listMyEmployerWorkspaces)
M  src/lib/job-intelligence/feature-flag.ts            (+employerPortalEnabled)
M  src/i18n/dictionaries.ts                             (+21 keys × sv/en)
M  src/routes/_authenticated.my-career.index.tsx        (+entry point, +1 query)
A  src/routes/_authenticated.employer.tsx
A  src/routes/_authenticated.employer.index.tsx
A  src/routes/_authenticated.employer.$employerSlug.tsx
A  src/lib/job-intelligence/last-employer-slug.ts       (shared localStorage key constant)
M  src/routeTree.gen.ts                                 (auto-regenerated, not hand-edited)
A  docs/job-intelligence/phase-g2-report.md
```

No migration file, no `types.ts` change (a PostgREST embed needs no new
generated type beyond what Phase G1 already produced), no `.env`
change, no `SiteHeader.tsx` change, no CI change.

## Tests run and results

**Executed in this environment:**

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | Clean, 0 errors |
| `bun run cie:check` | `CIE v1 harness: PASS`, 11/11 personas, byte-identical to baseline |
| `bun run kg:check` | `kg:check OK` |
| Isolation grep (`employer_memberships`/`listMyEmployerWorkspaces`/`employerPortalEnabled` must not appear under `src/lib/career-intelligence-engine/`) | Empty — clean |
| `bun run lint` | Non-blocking. The three genuinely new files (`_authenticated.employer.tsx`, `_authenticated.employer.$employerSlug.tsx`, `last-employer-slug.ts`) have **zero** findings. Remaining findings on touched/adjacent files are either pre-existing lines at shifted positions (this file's own established `Ctx = { supabase: any }` pattern, already present before this phase) or `prettier/prettier` formatting preferences on the new multi-line dictionary strings and one JSX block — the same accepted, non-blocking category as every prior phase. Not fixed, per instruction. |
| Manual smoke (local dev server, unauthenticated) | `/employer` → redirects to `/auth`, identical to every other `_authenticated/*` route, zero console/server errors. Homepage unaffected. |
| Router codegen (`src/routeTree.gen.ts`) | Regenerated via the project's normal Vite dev-server startup (the TanStack Start router plugin's own codegen step) — not hand-edited. Confirmed all three new routes correctly nested under `/_authenticated/employer`. |

**Not executed (requires a real signed-in account and real membership
rows — no test credentials exist in this environment, and creating an
account is outside what this task may do):** the full interactive
matrix of picker/redirect/empty/access-denied states for 0/1/2+
memberships, suspended/removed/invited members, admin/superadmin
without membership, keyboard navigation, and mobile viewport. Every one
of these is verifiable by direct code inspection (the branching logic
is a small, fully-traced set of conditionals against
`listMyEmployerWorkspaces()`'s result) and is fully specified in the
test matrix below for execution once real test accounts exist (Lovable
Cloud environment, matching this project's established division of
labour for anything requiring live data).

### Test matrix (20 scenarios required by the brief)

| # | Scenario | Verification |
|---|---|---|
| 1 | Candidate, 0 memberships | Code-traced: `workspaces.length === 0` → empty state; entry point on `/my-career` hidden (`hasEmployerWorkspace` false) |
| 2 | Candidate opens `/employer` directly | Same empty state reachable via direct nav — no different code path |
| 3 | 1 active membership | Code-traced: auto-`navigate({ replace: true })` to `$employerSlug`, no picker rendered |
| 4 | 2+ active memberships | Code-traced: picker branch, one `<Link>` per workspace |
| 5 | Another employer's slug | Code-traced: `.find()` returns `undefined` → access-not-available state |
| 6 | Suspended member | Excluded by `status='active'` filter → same as scenario 5 |
| 7 | Removed member | Same exclusion, same state |
| 8 | Invited (not yet active) | Same exclusion, same state |
| 9 | Platform admin, no membership | `listMyEmployerWorkspaces` has no role check at all → same as scenario 1/2 |
| 10 | Superadmin, no membership | Same as 9 |
| 11 | Superadmin, real membership | Normal member/owner experience for that org, on top of unrelated admin access |
| 12 | Feature flag false | Code-traced: both routes short-circuit before any query; entry point query has `enabled: false` |
| 13 | Keyboard navigation | Picker items are semantic `<Link>` elements with `focus-visible:ring-2` — native tab/enter behaviour, not custom JS |
| 14 | Mobile viewport | Reuses `SiteLayout`/`Section`, the same responsive primitives every other page uses; no bespoke layout introduced |
| 15 | Stale `localStorage` slug | Code-traced: index route only redirects on a stored slug if `workspaces.some(w => w.employerSlug === stored)`; otherwise falls through to normal picker/empty rendering |
| 16 | Existing My Career behaviour | Manually confirmed unaffected file boundary — only one new conditional block and one new `enabled`-gated query added, no existing logic touched |
| 17 | Existing saved-report behaviour | Zero files under that surface touched |
| 18 | Existing admin routes | Zero files under `_authenticated.admin.*` touched |
| 19 | Existing jobs routes | Zero files under `jobs*`/`job-intelligence/public-queries.ts` touched |
| 20 | Assessment regression | `bun cie:check` 11/11, byte-identical |

## Rollback

No database object exists to roll back — this phase is pure
application code. Revert: delete the three new route files and
`last-employer-slug.ts`; remove `listMyEmployerWorkspaces` from
`membership.functions.ts`; remove `employerPortalEnabled` from
`feature-flag.ts`; remove the one new conditional block + query from
`_authenticated.my-career.index.tsx`; remove the 21 new dictionary key
pairs; regenerate `routeTree.gen.ts` (drops the three route entries
automatically once the files are gone). No flag flip needed — flags are
already `false` and were never changed by this phase.

## Deferred functionality

Everything on the brief's "must not build" list remains untouched:
employer self-registration, organisation creation, organisation
settings editing, team-member management, invitations (of any kind,
candidate or employee), job publishing/editing/applications, candidate
search, ATS, billing, subscriptions, SSO, departments/corporate
hierarchy, automated candidate decisions. Also explicitly deferred per
the G2 audit: a header-level global context indicator (the entry point
lives only in `/my-career`'s Account card, `SiteHeader.tsx` untouched),
realtime mid-session membership-change awareness, and a distinct
"you were removed" message (vs. the current neutral access-not-
available state) for suspended/removed members.

## Known limitations

- **No live multi-membership interactive test performed** — this
  environment has no test account with real `employer_memberships`
  rows. Every state is code-traced and typechecked but not click-tested
  end-to-end. Required before this is considered fully verified: a pass
  through the full test matrix above against a Lovable Cloud
  environment with real fixture accounts (mirroring Phase G1's own
  Step-1.5-equivalent division of labour).
- **`localStorage` convenience is best-effort** — wrapped in `try/catch`
  everywhere it's touched; a browser that blocks storage access simply
  never gets the "skip the picker" convenience, falling back to the
  normal 0/1/2+ behaviour with no error.
- **No distinct messaging for "you used to have access"** — a
  suspended/removed member sees the same neutral state as someone who
  was never a member, a deliberate simplification (see "Deferred
  functionality"), not an oversight.
