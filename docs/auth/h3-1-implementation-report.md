# H3.1 — Candidate and Employer Portal Foundation: Implementation Report

**Status:** Implemented, tested, ready for owner QA.
**Source specs:** `docs/auth/candidate-employer-portal-spec-v1.md`, `docs/architecture/adr-candidate-employer-portal-separation.md`.
**Scope:** exactly the items marked MUST in the approved spec's §16 for this phase — candidate/employer route separation, `/auth` compatibility handling, secure self-service employer company creation, secure database foundation for existing-company access requests, and the required database changes. H4 (job publishing/moderation) is untouched and unstarted.

## Post-implementation product-owner clarification (applied before commit)

After the initial implementation and report below, the product owner clarified that **public self-service "request access to an existing employer" must not be an active, user-facing MVP action.** Access to an existing workspace should only ever come from an authorised employer admin/owner (a future colleague-invitation flow) or a platform admin — never from any signed-in user searching for a company and filing a request themselves. This section states precisely what changed and what didn't; the rest of this report describes the original implementation and remains accurate for everything **except** the `/employer/onboarding` UI, which this section supersedes.

**Distinguishing exactly what's true after this adjustment:**

| Layer | Status |
|---|---|
| `employer_access_requests` table, its RLS, the partial-unique duplicate-request index | **Backend foundation — implemented, kept, unchanged.** Never exposed a way for an unauthorised actor to gain access even while the UI offered it (see the T16–T18/T24–T25 tests below) — retaining it is zero additional risk and avoids rework when a future invitation/review flow needs the same primitives. |
| `create_my_employer_company()` / `approve_access_request()` (`SECURITY DEFINER` functions) | **Backend foundation — implemented, kept, unchanged.** `approve_access_request()` remains available for a platform admin or a future employer-admin review UI to call; nothing about it required the public request-creation UI to exist. |
| `requestAccessToEmployer()`, `findMatchingEmployers()`, `listAccessRequestsForMyEmployer()`, `decideAccessRequest()` (TS server-function wrappers, `employer-onboarding.functions.ts`) | **Backend foundation — implemented, kept, unchanged, currently unreferenced by any route.** Left in place for the same future-reuse reason; each remains individually authorised and tested regardless of whether a UI calls it. |
| The public `/employer/onboarding` "Request access" choice, its search UI, and its submission form (previously `RequestAccessForm`) | **Removed from the MVP interface.** This is the only thing this adjustment actually deletes — a React component and its call site, not a security control. |
| Employer-side "review incoming requests" dashboard | **Not built — deferred**, unchanged from the original report (was already listed as deferred there; this adjustment doesn't change that, it only removes the requester-side entry point that would have fed such a dashboard). |
| Colleague invitations (employer-admin invites a teammate directly) | **Deferred — future phase**, per the product owner's stated preferred future model. Not started in H3.1. |
| Job applications, assessment invitations | **Not touched, not conflated with this feature at any point** — `employer_access_requests` was never modeled as either of these, and nothing in this phase's UI, copy, or schema presents workspace access as a job application, a candidate application, or an assessment invitation. |

**What an employer now sees at `/employer/onboarding`:** exactly one active action — "Create a company account" — plus a static, non-actionable guidance panel: *"Finns ditt företag redan på CQrityjob? Kontakta oss eller företagets administratör för att få tillgång."* / *"Is your company already registered on CQrityjob? Contact us or your company administrator to receive access."* — linking to the existing `/contact` page. Selecting or reading this panel creates no record of any kind. The same guidance (not a "request access" button) now appears in the company-creation form's duplicate-detected state too.

**Files touched by this adjustment:** `src/routes/_authenticated.employer.onboarding.tsx` (removed `RequestAccessForm` and the "request" choice branch entirely; added a static `ContactGuidancePanel`; simplified the `Choice` type to `"create" | null`), `src/i18n/dictionaries.ts` (removed the now-dead `choice.request.*`, `request.*`, and `create.duplicateRequestAccess` keys in both `sv` and `en`; added `contact.heading`/`contact.body`/`contact.cta`; revised `intro` and `create.duplicateBody` copy to match). No database migration, RLS policy, or `SECURITY DEFINER` function was touched — the 26 database-security tests in `tests/database/phase-h3-1/02_run_tests.sql` were re-run unchanged against a fresh disposable Postgres instance and all still pass, confirming the backend was genuinely untouched, not just assumed unaffected.

---

## Objective

Separate the candidate and employer authentication/onboarding journeys into two distinct user experiences while keeping one shared Supabase Auth identity underneath, and give employers a working self-service path to create or join a company account — none of which existed before this phase (company creation was previously platform-admin-only, with no self-service path at all).

## Repository re-check performed before implementation

Per the working method, the actual current repository state was re-verified directly (not assumed from prior planning) before writing any code:

- **No `docs/job-intelligence/phase-h*.md` files exist anywhere in this repo.** The "H1–H3" naming in the originating brief does not correspond to any committed phase report here — per product owner decision 2, this is not a blocker; the current code/schema/migrations were used as ground truth throughout.
- **Confirmed via direct migration inspection:** `employers`/`employer_memberships` writes were admin-only (`employers_admin_all`, `employer_memberships_admin_all`, both `is_platform_admin()`-gated) with zero self-service write policy on either table. This was the actual starting point — self-service company creation is genuinely new work, not a fix to an existing broken flow.
- **Confirmed:** `/auth` had no `intent`/`redirect` handling of any kind, hardcoded candidate-only copy, and three separate hardcoded `navigate({ to: "/my-career" })` call sites.
- **Confirmed:** no `employer_access_requests` table, no self-service company-creation function, no `/employer/onboarding` route existed anywhere in the codebase.

## Files changed

**New:**
- `supabase/migrations/20260719190845_h3_1_candidate_employer_portal.sql`
- `src/lib/job-intelligence/employer-onboarding.functions.ts`
- `src/lib/auth/safe-redirect.ts`
- `src/components/auth/PortalAuthForm.tsx`
- `src/routes/candidate.login.tsx`
- `src/routes/candidate.register.tsx`
- `src/routes/employer.login.tsx`
- `src/routes/employer.register.tsx`
- `src/routes/_authenticated.employer.onboarding.tsx`
- `tests/database/phase-h3-1/01_fixtures.sql`
- `tests/database/phase-h3-1/02_run_tests.sql`

**Modified:**
- `src/routes/auth.tsx` — rewritten as a compatibility redirect only (no longer renders a login form).
- `src/routes/_authenticated.employer.index.tsx` — the zero-workspace branch now redirects to `/employer/onboarding` instead of rendering a dead-end empty state.
- `src/components/site/SiteHeader.tsx` — signed-out and signed-in nav states now offer an explicit candidate/employer split.
- `src/i18n/dictionaries.ts` — ~68 new keys added to both the `sv` and `en` blocks.
- `src/routeTree.gen.ts` — auto-regenerated by the TanStack Start Vite plugin as part of `bun run build`; not hand-edited.

**Untouched, confirmed by `cie:check`/`kg:check` passing byte-identically to baseline:** `src/lib/career-intelligence-engine/*`, `src/lib/knowledge-graph/*`, `src/lib/career-center/*`, assessment questions/scoring/gates, `jobs`/`employer_memberships`(pre-existing columns)/`employers`(pre-existing columns), `job_is_active()`, `is_platform_admin()`, `has_employer_role()`, `employer_is_active_status()`, `update_employer_membership()`.

## Migrations added

One additive migration, `20260719190845_h3_1_candidate_employer_portal.sql`:

1. `employers.registration_number` (new nullable column, free text — product owner decision 1: no jurisdiction-specific validation in this phase). `country` (already existed) is reused as the jurisdiction field — no separate jurisdiction column was added.
2. `employers.status` CHECK extended additively: `draft|active|suspended|archived` → `draft|pending|active|rejected|suspended|archived`. `pending` is the self-service creation default; deliberately not named `pending_review` (reserved for `jobs.status` in the separate Jobs MVP v1 spec — this avoids a cross-document naming collision).
3. `employer_memberships.job_title` (new nullable column — the member's stated role at that specific company).
4. `employer_access_requests` (new table) — `id, employer_id, requester_user_id, status, message, granted_role, decided_by, decided_at, created_at, updated_at`. A partial unique index (`employer_id, requester_user_id) WHERE status='pending'` prevents duplicate active requests at the database level, not just in application code. RLS: requester self-select/self-insert; employer owner/admin can select (review) requests for their own company; platform admin has full access; **no UPDATE policy exists for any non-admin role** — approval/denial is function-mediated only.
5. `public.create_my_employer_company(...)` — `SECURITY DEFINER`, atomically creates the `employers` row (`status='pending'`) and the caller's `owner`/`active` `employer_memberships` row in one transaction. Performs its own duplicate-name/registration-number/website check and raises a structured `DUPLICATE_EMPLOYER:<id>` error rather than creating a duplicate. Validates and trims every input server-side.
6. `public.approve_access_request(...)` — `SECURITY DEFINER`, checks the caller is an owner/admin of the request's actual employer (or a platform admin) and, on approval, atomically updates the request and creates (or reactivates, via `ON CONFLICT`) the membership.

Both functions are `REVOKE ALL ... FROM PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated, service_role` — callable by any signed-in user, but every authorization decision happens inside the function body against real data, never trusted from a parameter.

**Every existing RLS policy, function, and grant from Phase G1 (or earlier) is unchanged** — this migration only adds new objects and additive columns/CHECK values.

**Rollback:** see "Rollback procedure" below.

## Routes added or changed

| Route | Change |
|---|---|
| `/candidate/login`, `/candidate/register` | New — public, candidate-specific copy, shared `PortalAuthForm` internals |
| `/employer/login`, `/employer/register` | New — public, employer-specific copy. Static top-level routes, verified (build + generated route tree) not to collide with the existing dynamic `_authenticated/employer/$employerSlug` route |
| `/employer/onboarding` | New — authenticated. Two explicit choices (create company / request access), a pending-requests status view, all states listed in the spec (loading, validation error, auth error, duplicate company, request already pending, unauthorised — via the function's own rejection, success for both flows) |
| `/auth` | Changed — compatibility redirect only, reads `intent`/`mode`/`redirect`, never renders a form |
| `/employer` (index) | Changed — zero-workspace branch now auto-redirects to `/employer/onboarding` (was a dead-end empty state) |

## Security controls implemented

- **Portal intent never a permission.** `intent`/`mode`/`redirect` on `/auth` and the new auth routes control only which page renders and where the browser navigates — no server function or RLS policy reads any of them.
- **No unrestricted client-side write access to `employers`/`employer_memberships`.** Confirmed by direct inspection of the applied migration's own RLS policy list (`T5` in the test suite, below): the only policies on either table are the pre-existing `*_admin_all`/`*_self_select`/`*_member_select` ones — nothing new was added there. All self-service writes go through the two `SECURITY DEFINER` functions.
- **Company creation and access-request approval are server-side, authenticated-identity-only.** Both functions read `auth.uid()` internally; neither ever accepts a client-supplied user id.
- **Duplicate company creation handled safely** — a real, tested check (name/registration-number/website) inside the creation function, not merely a UI-layer suggestion.
- **Duplicate active access requests prevented at the database level** — a partial unique index, not an application-layer check-then-insert (which would have a TOCTOU race).
- **No open redirects.** `safeReturnPath()` (`src/lib/auth/safe-redirect.ts`) rejects protocol-relative URLs, absolute URLs, embedded `://`, and anything routing back to `/auth` itself.
- **No cross-tenant access.** Tested directly: a user cannot INSERT a membership at a company they don't belong to, cannot UPDATE `employers.status`, and cannot approve another company's access request — all via RLS/authorization checks inside the `SECURITY DEFINER` functions, not client trust.
- **Service-role credentials never reach the client.** Both new `SECURITY DEFINER` functions are called via the caller's own RLS-scoped Supabase client (`ctx.supabase`, from `requireSupabaseAuth`) — no `supabaseAdmin`/service-role client is used anywhere in `employer-onboarding.functions.ts` for the privileged writes (only the existing audit-log helper pattern uses it, matching `membership.functions.ts`'s established convention).
- **"Approved" is never claimed without a real membership.** The UI only ever shows employer-portal content after `listMyEmployerWorkspaces()` (existing, RLS-scoped) independently confirms an active membership — the same re-verification principle already established in Phase G2, applied unchanged to every new route.

## Tests performed and results

### Database/RLS/function tests (`tests/database/phase-h3-1/`, run against a real disposable local Postgres 16 instance — reused methodology from Phase G1's own test suite: `LC_ALL=C` startup workaround, `tests/database/phase-g1/00_mock_schema.sql` as the pre-migration baseline, then the real G1 migration, then this phase's migration, applied byte-for-byte as they exist in `supabase/migrations/`)

26 tests, all passing on the final run:

| # | What it verifies | Result |
|---|---|---|
| T1–T6 | Schema/constraint/index/RLS/grant shape matches this report's description exactly | Pass |
| T7 | Unauthenticated caller cannot call `create_my_employer_company` | Pass — rejected |
| T8 | Self-service creation succeeds: `employers.status='pending'`, membership `role='owner'/status='active'` | Pass |
| T9 | Creating a company with an identical name a second time is blocked (`DUPLICATE_EMPLOYER`), no duplicate row | Pass |
| T10 | A different user with a slug-colliding (not name-colliding) company gets a unique slug, not blocked | Pass |
| T11 | Blank company name rejected server-side | Pass |
| T12–T13 | Access request created; a second pending request to the same company is blocked by the partial unique index | Pass |
| T14 | A user cannot read another user's request row (RLS self-scope) | Pass |
| T15 | The target company's owner CAN read the pending request against their own company | Pass |
| T16–T17 | Neither an unrelated user nor the owner themself can approve/deny via a direct UPDATE — no UPDATE grant/policy exists for this table beyond admin | Pass — both blocked (`permission denied for table`) |
| T18 | An unrelated user calling the approval RPC directly is rejected (`Forbidden`) | Pass |
| T19 | The actual owner approves via the RPC — membership created correctly, request marked `approved` | Pass |
| T20 | Approving the same request twice fails (`already decided`) | Pass |
| T21 | A new request to a *different* company is not blocked by the first company's partial index | Pass |
| T22 | A platform admin can approve a request for a company they are not a member of | Pass |
| T23 | Reactivation: a removed member re-requests and is re-approved with a different role — same underlying membership row reused (`ON CONFLICT`), not duplicated | Pass |
| T24 | Cross-tenant privilege escalation — direct INSERT of an owner membership at a company the caller doesn't belong to | Pass — blocked by RLS |
| T25 | Forged active status — direct UPDATE of `employers.status` to `active` by a non-admin owner | Pass — blocked (`UPDATE 0`) |
| T26 | `audit_logs` rows exist for `company_created` (×2) and `access_request_approved` (×3) | Pass |

One real bug was found and fixed during this testing (not merely a test-script issue): the original `approve_access_request()` used `ON CONFLICT (employer_id, user_id)`, which Postgres/plpgsql treats as ambiguous against the function's own `RETURNS TABLE` out-parameter of the same name (`employer_id`) — confirmed against a real Postgres 16 instance (`ERROR: column reference "employer_id" is ambiguous`). Fixed by targeting the constraint by name (`ON CONFLICT ON CONSTRAINT employer_memberships_employer_id_user_id_key`) instead of a bare column list, verified by re-running the full suite afterward.

### Static/build verification

- `bunx tsc --noEmit` — clean, exit 0.
- `bun run build` — clean, exit 0. Full production build including all new routes and the regenerated route tree.
- `bun run lint` — no new prettier/formatting issues in any changed file (fixed during implementation). Remaining `@typescript-eslint/no-explicit-any` findings in `employer-onboarding.functions.ts` and the onboarding route match this codebase's own pre-existing, established convention (confirmed: `membership.functions.ts`, an unmodified pre-existing file, has the identical `Ctx = { supabase: any; ... }` pattern and the same lint findings) — not a new regression, and `lint` is non-blocking in this repo's own CI configuration.
- `bun run cie:check` — PASS, 11/11 personas, confirming the Career Intelligence Engine is untouched.
- `bun run kg:check` — OK, confirming the Career Intelligence Graph is untouched.

### Route-collision verification

Confirmed via the generated `src/routeTree.gen.ts` that `/employer/login`, `/employer/register`, and `/employer/onboarding` are registered as distinct route entries, and via a clean production build (which would fail on a genuinely ambiguous route definition) that none of them are captured by the existing dynamic `_authenticated/employer/$employerSlug` route.

### `/auth` compatibility / no-loop verification

`safeReturnPath()` explicitly rejects any value equal to or prefixed with `/auth`, and `destinationFor()` in `auth.tsx` always computes a route outside `/auth` itself (one of `/candidate/login`, `/candidate/register`, `/employer/login`, `/employer/register`, `/my-career`, `/employer`) — traced through both the signed-in and signed-out branches; there is no code path in which `/auth` redirects to itself.

### Not automated in this phase (manual verification steps below cover these)

Per this repository's existing testing conventions (confirmed at the start of this session: no Vitest/Playwright/RTL exists anywhere in this codebase — verification here is the same tsc/lint/cie/kg + direct database testing discipline already established in Phase G1, extended with real Postgres RLS/function tests for the new objects specifically), the following are **not implemented as automated UI tests** and require manual verification:
- End-to-end browser flows (registration → onboarding → dashboard) for both portals.
- Responsive/mobile smoke testing of the new pages.
- Google OAuth sign-in/sign-up for both portals (requires a live Supabase project — untestable against the local disposable cluster used for the RLS/function tests above).

## Known limitations

- Company duplicate-matching is deliberately conservative (exact/near-exact name, registration number, or website match only) — no fuzzy matching, as specified.
- Registration-number validation is free text with length/trim checks only, per product owner decision 1 — no jurisdiction-specific format validation.
- **The public "request access" UI is deliberately not offered in this MVP** (post-implementation clarification, see above) — an employer whose company already exists is directed to `/contact` instead. The `employer_access_requests` backend and its approval function remain fully implemented and tested for a future colleague-invitation or admin-review flow to build on; only the requester-facing self-service UI was removed.
- Consequently, the employer-side "review requests" UI (an owner/admin approving/denying from a page) also remains unbuilt, but is now **not urgently needed** — with no public path to create a new request, an empty review queue is the expected MVP state, not a gap blocking usability. It stays the natural next piece once colleague invitations are scoped.
- The `SiteHeader` candidate/employer split is intentionally minimal (two adjacent links, not a dropdown) — documented as the safest minimal solution per the working method's own instruction, rather than introducing a new Radix dropdown component for this phase.
- No email notification exists for the `/contact` path taken by an employer whose company already exists — this is intentionally a human-mediated (support/admin) path in the MVP, not an automated one.

## Rollback procedure

1. **Application code:** revert the commit(s) containing the files listed under "Files changed" above (`git revert` or restore from the prior commit) — every changed file is additive/isolated; `auth.tsx` and `_authenticated.employer.index.tsx` are the only two pre-existing files with logic changes, both cleanly revertible to their prior versions.
2. **Database:** run the following, in order, against the target environment (mirrors the additive design — every step has an exact inverse):
   ```sql
   DROP FUNCTION IF EXISTS public.approve_access_request(uuid, text, text);
   DROP FUNCTION IF EXISTS public.create_my_employer_company(text, text, text, text, text, text);
   DROP TABLE IF EXISTS public.employer_access_requests;
   ALTER TABLE public.employer_memberships DROP COLUMN IF EXISTS job_title;
   ALTER TABLE public.employers
     DROP CONSTRAINT IF EXISTS employers_status_check,
     ADD CONSTRAINT employers_status_check CHECK (status IN ('draft', 'active', 'suspended', 'archived'));
   ALTER TABLE public.employers DROP COLUMN IF EXISTS registration_number;
   ```
   Note: if any `employers` row already has `status IN ('pending','rejected')` at rollback time, the `ADD CONSTRAINT` step above will fail — resolve those rows first (e.g., set to `draft`) before rolling back the CHECK constraint.
3. **Feature flags:** none were changed by this phase (`VITE_EMPLOYER_PORTAL_ENABLED` remains whatever it was before) — no flag rollback needed.

## Items intentionally deferred (not implemented, per product owner decision 3, and the later clarification)

- **Public self-service "request access to an existing employer" as an active MVP feature** — backend implemented and kept; UI deliberately not offered (see the clarification section above).
- Employer-side review UI for incoming access requests (functions exist and are tested; no route yet — see "Known limitations").
- Colleague-invitation flow (an employer admin/owner inviting a named teammate directly) — the product owner's stated preferred future model; not started.
- Email/push notifications for request submission or decision.
- Fuzzy/improved company duplicate matching.
- Jurisdiction-specific registration-number validation.
- Enterprise SSO, domain verification, BankID, billing, team invitations beyond the single-request model — all explicitly out of this phase's MVP boundary per the approved spec.
- Job applications and assessment invitations — not built, and not modeled as or conflated with `employer_access_requests` at any point.
- Any H4 (job publishing/moderation) functionality — not started, not touched.

---

## Summary for the product owner

**1. What was implemented:** separate candidate/employer login and registration pages, a working employer onboarding flow (create a company; contact CQrityjob/your admin if it already exists — **not** a public self-service request-to-join action), the database and server-function foundation for a future access-request/approval flow (kept, not publicly exposed), and a compatibility-preserving rewrite of `/auth`.

**2. Exact files and migrations changed:** listed in full above (11 new files, 5 modified files, 1 migration) plus the post-clarification adjustment to `_authenticated.employer.onboarding.tsx` and `dictionaries.ts` (no new migration for the clarification — database layer unchanged).

**3. Security review:** every non-negotiable rule from the task brief was implemented and verified against a real Postgres instance — see "Security controls implemented" and the 26-test results above. The clarification strengthens this further: no signed-in user can reach an existing workspace merely by knowing its name, slug, or ID, and now no UI path even invites them to try.

**4. Test and build results:** 26/26 database/security tests pass (re-run after the clarification against a fresh disposable Postgres instance, unchanged results); `tsc`, `build`, `cie:check`, `kg:check` all clean; `lint` shows no new issues beyond this codebase's pre-existing accepted pattern.

**5. Remaining limitations:** listed above — the most significant is that colleague invitations (the product owner's preferred future model) aren't built yet; an owner currently has no in-app way to add a teammate other than contacting CQrityjob.

**6. Manual verification steps for the product owner:**
   - Sign up a new account via `/candidate/register` and confirm it lands on `/my-career`.
   - Sign up a new account via `/employer/register`, confirm it lands on `/employer/onboarding`, create a company, and confirm you land on the new (pending-state) employer dashboard.
   - Revisit `/employer/onboarding` (e.g. with a second, fresh account) and confirm the only active action is "Create a company account" — confirm there is **no** search box, no company picker, and no "request access" button anywhere on the page; confirm the contact-guidance panel is present and its "Kontakta oss"/"Contact us" link goes to `/contact`.
   - Attempt to create a company with the same name as an existing one and confirm the duplicate notice shows the same contact guidance (not a request-access action).
   - Visit an old `/auth` link and confirm it redirects correctly rather than showing a form.
   - Resize the browser to a mobile width and confirm the header's candidate/employer links and the onboarding page both remain usable.

**7. Rollback procedure:** see above — fully additive, cleanly revertible in both application code and database. The post-clarification UI adjustment needs no separate rollback beyond the same file-revert step, since it changed no schema.
