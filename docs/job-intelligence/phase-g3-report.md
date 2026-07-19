# Phase G3 — Employer Dashboard Foundation

## Scope

Transformed `/employer/$employerSlug` from a "Coming soon" placeholder
into a functional dashboard shell for authenticated members of an
employer organisation. No changes to public routes, published jobs, RLS,
or tracked `.env`.

## Changes

### 1. New server function
`src/lib/job-intelligence/employer-dashboard.functions.ts`

`getEmployerDashboardStats({ employerId })` returns `{ activeJobs,
draftJobs, applications, assessmentInvitations }`.

Security model (defense in depth):

1. `requireSupabaseAuth` verifies bearer → `ctx.userId` from verified
   claims (never client-supplied).
2. Re-derives caller's *active* membership on the requested
   `employer_id` through `ctx.supabase` (RLS-scoped). Fails closed with
   `"Access not available"` on any of: not a member, wrong employer,
   status `invited`/`suspended`/`removed`. This mirrors the pattern used
   by `admin.functions.ts` — RLS policy `employer_memberships_self_select`
   is the actual boundary; the explicit `.eq` is clearer intent.
3. Only after (2) does it lazily import `supabaseAdmin` and count
   `jobs` filtered by the already-authorised `employer_id`. Caller
   never controls the filter.

Applications and assessment_invitations tables do not exist yet — those
counters return literal `0` rather than fabricate rows.

### 2. Dashboard shell
`src/routes/_authenticated.employer.$employerSlug.tsx`

- Feature-flag gate (`employerPortalEnabled()`) unchanged.
- Membership resolution still via `listMyEmployerWorkspaces` (Phase G2)
  and shared React Query cache key.
- Header: workspace label, employer name, role, "Switch organisation"
  (only when >1 workspaces), "Back to My Career".
- **Overview cards** (2×2 mobile, 4-up desktop): Active jobs, Drafts,
  Applications, Assessment invitations. Live-region friendly, `—`
  placeholder while loading, translated error message on failure.
- **Quick actions** (2-up grid): Create job, Manage jobs, Invite to
  assessment, Organisation settings. Each action is an accessible
  expandable card revealing a "This action activates in the next phase"
  notice — no destructive click, no navigation to unfinished surfaces.
- **Empty state**: shown only when stats loaded successfully with zero
  jobs/applications; explains the upcoming workflow.

### 3. i18n
`src/i18n/dictionaries.ts` — added 17 new keys under `employer.dashboard.*`
in both `sv` and `en` dictionaries. All UI strings are translated; no
raw enum labels or English literals leak into the Swedish UI.

## Access control matrix

| Caller state                         | `/employer/$slug` result |
| ------------------------------------ | ------------------------ |
| Active member of employer            | Dashboard renders        |
| Suspended / removed / invited member | Access-denied panel      |
| Member of a different employer       | Access-denied panel      |
| Non-member                           | Access-denied panel      |
| Not authenticated                    | Redirect to `/auth`      |
| Feature flag off                     | Coming-soon panel        |

Server function `getEmployerDashboardStats` applies the same check
server-side, so even a hand-crafted RPC call fails closed. The route
shell never surfaces different messages for "no such employer" vs
"suspended" vs "wrong employer" — matches the Phase G2 privacy stance.

## Non-goals (deferred)

- No new tables (applications, assessment_invitations).
- No writes from the dashboard.
- No changes to `jobs` RLS — reads are proxied through
  `supabaseAdmin` gated by a verified membership check, per accepted
  pattern.
- No feature-flag defaults changed. Tracked `.env` untouched.

## Verification

- `bunx tsgo --noEmit` → clean.
- No changes to `jobs` policies, `employers` policies, or public routes.
- Preview: with `VITE_EMPLOYER_PORTAL_ENABLED=true` in `.env.local`,
  `/employer/$slug` renders the dashboard for active members and the
  access-denied panel for everyone else.

## Files touched

- **Added** `src/lib/job-intelligence/employer-dashboard.functions.ts`
- **Modified** `src/routes/_authenticated.employer.$employerSlug.tsx`
- **Modified** `src/i18n/dictionaries.ts` (17 new keys × 2 locales)
- **Added** `docs/job-intelligence/phase-g3-report.md`