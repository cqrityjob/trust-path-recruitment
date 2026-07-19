# Candidate / Employer Portal Access Specification v1

**Status:** Final specification for owner review. No code, migrations, environment variables, feature flags, or published state have been changed to produce this document.
**Related:** `docs/architecture/adr-candidate-employer-portal-separation.md` (the locked decisions this spec implements), `docs/job-intelligence/jobs-mvp-v1-spec.md` / `jobs-mvp-v1-data-model.md` (the jobs/application layer this sits beneath and must not weaken).
**Scope boundary:** this resolves the candidate-vs-employer access structure only. It does not begin, redesign, or depend on H4 (job publishing/moderation UI).

---

## 0. Audit findings this spec is built on (verified against the actual repository, not assumed)

Direct inspection of the repo, not the screenshot alone, produced three findings material to this spec:

1. **No `docs/job-intelligence/phase-h*.md` report files exist anywhere in this repository.** The document sequence on disk is A, B, C, D, D1, E, F, F1, F2, G1, G2, G3. The "H1–H3" referenced in the brief's Lovable screenshot must be Lovable's own internal session numbering, not something written up in this repo yet. This spec treats the *actual* current security model — Phase G1's admin-only `employers`/`employer_memberships` writes, `is_platform_admin()`, `has_employer_role()`, `employer_is_active_status()`, and the `update_employer_membership()` atomic-RPC pattern — as the hard constraint, since that is what genuinely exists and is verified.
2. **None of the Jobs MVP v1 spec's own H1 database work has landed yet** (no employer-write RLS or transition-guard trigger on `jobs`, no `job_applications` table, no publish-time `expires_at` enforcement, no scheduled expiry sweep). That work remains planning-doc-only. This matters here because Section 7 (pending-employer permissions) has to specify exactly how a *not-yet-built* jobs-authoring RLS layer interacts with a *newly-defined* employer-status model — addressed explicitly in Section 12, not glossed over.
3. **Self-service employer/company creation does not exist in any form today** — not broken, not partially built, simply absent. `employers` and `employer_memberships` have zero non-admin write policies. This spec's Section 6/12 design that capability from scratch, reusing Phase G1's existing primitives rather than inventing a new authorization model.

---

## 1. Product vision (locked)

Two clearly separated user experiences, one shared identity system:

**Candidate Portal:** registration/login, `/my-career` dashboard, career tests, career profile, job discovery, applications, future learning/career-development content.

**Employer Portal:** registration/login, company account, employer dashboard, publish/manage jobs, receive/manage applications, order assessments (future), invite candidates to tests (future), team/billing/verification/recruitment tools (future).

The current `/auth` page is candidate-oriented by default and gives an employer no dedicated, self-respecting entry point — this is the concrete problem this spec fixes.

---

## 2. Core architecture decision

Two portal experiences, two public entry points, two login/registration presentations, two dashboards, two onboarding journeys, separate navigation and copy — **on top of one shared Supabase Auth backend.** The same email identity may technically reach both portals; candidate and employer *permissions* stay fully separate and are never derived from which portal a user entered through. Choosing "Employer" during sign-in never grants employer permissions by itself; choosing "Candidate" never forecloses later employer access. Full rationale and the locked decision list: `adr-candidate-employer-portal-separation.md`.

---

## 3. Route architecture

### 3.1 Public

| Route | Purpose | Change |
|---|---|---|
| `/` | Homepage | Unchanged |
| `/jobs` | Public job browsing | Unchanged (Jobs MVP v1 spec governs this) |
| `/employers` | Existing employer marketing/landing page | **Modified** — primary CTAs updated to point at `/employer/register` and `/employer/login` (currently has no clear CTA into any employer flow at all, since none existed) |
| `/candidate/login` | Candidate sign-in | **New** |
| `/candidate/register` | Candidate sign-up | **New** |
| `/employer/login` | Employer sign-in | **New** |
| `/employer/register` | Employer sign-up | **New** |

### 3.2 Authenticated — candidate

| Route | Purpose | Change |
|---|---|---|
| `/my-career` | Candidate dashboard (existing, unchanged content) | Unchanged — this spec only changes how a user *arrives* here |

### 3.3 Authenticated — employer

| Route | Purpose | Change |
|---|---|---|
| `/employer` | Smart router: 0 workspaces → `/employer/onboarding`; 1 → auto-select; 2+ → picker | **Modified** — the existing G2 index route's 0-workspace branch currently shows a dead-end "access is assigned by CQrityjob" message; it now redirects into onboarding instead |
| `/employer/onboarding` | Create-a-company or request-access-to-existing-company flow | **New** (Section 6) |
| `/employer/$employerSlug` | Employer dashboard (existing G3 shell) | **Modified** — now also renders the pending/rejected/suspended states from Section 7/8, and its "coming next" action rows start pointing at real routes as the Jobs MVP spec's own H3 work lands (out of scope here — that's tracked by the Jobs MVP spec, not this one) |
| `/employer/$employerSlug/jobs`, `/jobs/new`, `/jobs/$jobId`, etc. | Job authoring (Jobs MVP v1 spec, Part D) | **Not built by this spec** — this spec only confirms these routes slot correctly under the workspace-shell pattern (Section 13); their implementation is the Jobs MVP spec's own H3 phase |
| `/employer/$employerSlug/billing`, `/team`, `/analytics`, `/search`, `/branding`, `/assessments`, `/projects` | Future commercial modules | **Not built** — named here only to confirm the route tree already accommodates them (Section 13) |

### 3.4 Legacy

**`/auth` is retained only as a compatibility redirect route — it never renders its own login/registration form again.**

Behavior:
- Reads two query params: `intent` (`candidate` | `employer`; anything else, including absent, defaults to `candidate`) and `mode` (`login` | `register`; defaults to `login`). Neither is ever used for anything beyond choosing which page to redirect to.
- Also reads `redirect` (a return path), validated against the allow-list in Section 11 before being forwarded.
- Not signed in → redirects to the matching new route: `candidate`+`login` → `/candidate/login[?redirect=...]`; `candidate`+`register` → `/candidate/register`; `employer`+`login` → `/employer/login[?redirect=...]`; `employer`+`register` → `/employer/register`.
- Already signed in → redirects straight past any login form: `intent=employer` → `/employer` (which itself branches per Section 3.3); `intent=candidate` or absent → `/my-career` (preserves every existing bookmark/indexed link's current behavior exactly).
- This satisfies "retain `/auth` only as a compatibility route... never use `/auth` as the main public login page" without breaking any existing inbound link.

---

## 4. Candidate auth experience

### 4.1 `/candidate/login`

| | Swedish | English |
|---|---|---|
| Heading | Logga in som kandidat | Log in as a candidate |
| Supporting text | Fortsätt till din karriärprofil, dina tester, sparade jobb och ansökningar. | Continue to your career profile, tests, saved jobs, and applications. |
| Primary actions | Fortsätt med Google · E-post · Lösenord · **Logga in** | Continue with Google · Email · Password · **Log in** |
| Secondary | Skapa kandidatkonto · Glömt lösenord? · Är du arbetsgivare? Logga in i arbetsgivarportalen → | Create a candidate account · Forgot password? · Are you an employer? Log in to the employer portal → |

The "Är du arbetsgivare?" link routes to `/employer/login` (carrying forward any `redirect` param only if it's still valid for the employer context; otherwise dropped).

### 4.2 `/candidate/register`

| | Swedish | English |
|---|---|---|
| Heading | Skapa kandidatkonto | Create a candidate account |
| Supporting text | Skapa ett kandidatkonto för att göra tester, bygga din karriärprofil och söka jobb inom säkerhet. | Create a candidate account to take assessments, build your career profile, and apply to security-sector jobs. |
| Fields | Namn (valfritt) · E-post · Lösenord | Name (optional) · Email · Password |
| Primary | Fortsätt med Google · **Skapa konto** | Continue with Google · **Create account** |
| Secondary | Har du redan ett konto? Logga in · Är du arbetsgivare? Skapa arbetsgivarkonto → | Already have an account? Log in · Are you an employer? Create an employer account → |

Field set, validation, and the underlying Google OAuth / email+password logic are **unchanged from the existing `/auth` implementation** — this is a copy/routing change, not a new auth mechanism.

---

## 5. Employer auth experience

### 5.1 `/employer/login`

| | Swedish | English |
|---|---|---|
| Heading | Logga in som arbetsgivare | Log in as an employer |
| Supporting text | Hantera jobbannonser, rekryteringar, kandidater och tester i CQrityjobs arbetsgivarportal. | Manage job listings, recruitment, candidates, and assessments in CQrityjob's employer portal. |
| Primary actions | Fortsätt med Google · E-post · Lösenord · **Logga in** | Continue with Google · Email · Password · **Log in** |
| Secondary | Skapa arbetsgivarkonto · Glömt lösenord? · Är du kandidat? Logga in till Min karriär → | Create an employer account · Forgot password? · Are you a candidate? Log in to My Career → |

### 5.2 `/employer/register`

| | Swedish | English |
|---|---|---|
| Heading | Skapa arbetsgivarkonto | Create an employer account |
| Supporting text | Skapa ett arbetsgivarkonto för att publicera jobb, hantera rekryteringar och beställa tester. | Create an employer account to publish jobs, manage recruitment, and order assessments. |

**Required initial fields:** work email, password, first name, last name, company name, company website, country, job title, acceptance of terms and privacy policy.
**Conditional field:** company registration number — shown when the selected country has a standard registry format CQrityjob recognizes (initially Sweden's organisationsnummer); for other countries, this field is optional free text (Section 6.3 covers the fallback explicitly).
**Optional and minimised:** nothing beyond the above — no phone number, no company size, no industry picker, no address at MVP. Every additional field is deliberately deferred (Section 16).

| | Swedish | English |
|---|---|---|
| Primary | Fortsätt med Google · **Skapa konto** | Continue with Google · **Create account** |
| Secondary | Har du redan ett konto? Logga in · Är du kandidat? Skapa kandidatkonto → | Already have an account? Log in · Are you a candidate? Create a candidate account → |

Creating an *account* (the `auth.users` row) and creating a *company* are two distinct steps. Registration creates the account; the very next screen the new user lands on is `/employer/onboarding` (Section 6), where the company itself is created or an access request is filed. This separation exists because a user may sign up, abandon before naming a company, and return later — the account must not require a company to exist.

---

## 6. Company account creation

User-facing term: **"Företagskonto"** ("Skapa företagskonto" / "Begär åtkomst till befintligt företagskonto"). The word "organisation" is never shown to the user; it remains an internal/technical term only (the `employers` table itself is not renamed — this is a copy decision, not a schema decision).

### 6.A New company does not exist

1. User (freshly registered or an existing employer-intent user with zero companies) lands on `/employer/onboarding`, chooses "Skapa företagskonto," and enters: company name, website, country, registration number (where applicable). Job title carries over from registration.
2. A duplicate-name/website/registration-number check runs first (Section 12) — if a plausible match exists, the UI offers "Begär åtkomst" (6.B) instead of blocking silently.
3. On confirm, one atomic server-side action creates the `employers` row with **`status = 'pending'`** and, in the same transaction, an `employer_memberships` row for the caller with **`role = 'owner'`, `status = 'active'`** (Section 12 — full technical design).
4. **The company is not automatically verified, is not automatically granted any trust badge, and cannot bypass moderation.** `status = 'pending'` is a deliberately unprivileged starting state (Section 7).
5. The creator lands on `/employer/$employerSlug`, which renders the pending-state view (Section 7) rather than a full dashboard.

### 6.B Company already exists

Triggered either from the duplicate-check in 6.A or directly if the user searches for a known company name during onboarding.

1. User selects "Begär åtkomst" against the matched company.
2. This **creates a pending access request only — never a membership.**
3. An existing owner of that company, or a platform admin, must explicitly approve it before any `employer_memberships` row is created.
4. **Organisation takeover is structurally prevented**: the requester never becomes owner through this path (the approver chooses the granted role, default `member`, and only an existing owner can grant `owner`); a company can never be silently "claimed" by a new self-service creation attempt once it exists, because 6.A's duplicate check routes to this path instead of creating a second row.

### 6.C Sole trader, authority, or a company without a standard Swedish organisation number

The registration-number field is **never a hard blocker.** For a country without a recognized registry format, or for a sole trader/authority/NGO, the field is presented as optional free text with helper copy ("Ange organisations- eller registreringsnummer om det finns — annars kan du lämna fältet tomt"). A company created this way still starts at `status = 'pending'` and goes through the identical moderation path as any other new company — the fallback affects *data entry*, not *trust level*. This keeps international expansion open without special-casing every jurisdiction's registry format in v1.

### 6.D Field/status summary

| | Required | Optional | Notes |
|---|---|---|---|
| Employer registration (6.1) | Work email, password, first name, last name, company name, website, country, job title, terms acceptance | Registration number (conditional on country) | — |
| Onboarding — new company (6.A) | Company name, country | Website, registration number | Job title/name already captured at registration, not re-asked |
| Onboarding — request access (6.B) | Target company selection | A short message to the approver | — |
| **Initial company status** | — | — | **`pending`** in every case (6.A, 6.C) — never `active` at creation |
| **What a pending company may do** | — | — | Section 7 |
| **What requires approval** | — | — | Publishing, submitting jobs, application/candidate access, assessment ordering, invites, verified status (Section 7); joining an existing company via 6.B |

---

## 7. Employer permissions during review — one final recommendation

**Recommended MVP model (locked, not one of several options):**

| Pending employer company (`employers.status = 'pending'`) | Active employer company (`employers.status = 'active'`) |
|---|---|
| **May:** access the employer dashboard (in a clearly labeled pending state), complete the company profile, create job drafts, edit job drafts | **May:** submit jobs for moderation, manage published jobs per the existing lifecycle rules, access future employer functions as they release |
| **May not:** submit jobs for publication, publish jobs, access candidate personal data, order live assessments, invite candidates, receive trust/verification status | — |

The UI must state the pending reason plainly wherever it's relevant — the dashboard shows a persistent, dismissible-but-reappearing banner: *"Ditt företagskonto granskas. Du kan förbereda jobbannonser som utkast, men de kan inte publiceras förrän kontot är godkänt."* ("Your company account is under review. You can prepare job listings as drafts, but they can't be published until the account is approved.") Never a silent restriction with no explanation.

**Interaction with the not-yet-built Jobs MVP v1 job-authoring RLS (addressed explicitly, since it would otherwise be a real conflict):** the Jobs MVP v1 data model's planned employer-write policies on `jobs` (`jobs_employer_insert_draft`/`jobs_employer_update_editable`) currently gate *all* employer writes — including draft creation — behind `employer_is_active_status()`, which returns true only for `status = 'active'`. Under that design alone, a `pending` company could never draft a job at all, contradicting this section. **Resolution, to be applied when that RLS is actually implemented (it is not built yet, per Section 0):** split the condition so that draft-level writes (INSERT with `status='draft'`; UPDATE while the job is `draft`/`rejected`) are permitted for `employers.status IN ('active','pending')`, while the submit transition specifically (`draft`/`rejected` → `pending_review`) and every other employer-write path (applications, CVs, employer notes) remain gated on `employer_is_active_status()` exactly as originally specified — unchanged, `status = 'active'` only. `employer_is_active_status()` itself is **not** widened globally (doing so would incorrectly also open application/CV access to pending employers, directly contradicting the restriction list above); the widening is scoped to the two specific job-draft RLS policies only.

---

## 8. Post-login redirect matrix

| # | Scenario | Auth state | Membership/company state | Final destination | UI message | Security check |
|---|---|---|---|---|---|---|
| 1 | Candidate login, candidate-only | Signed in via `/candidate/login` | No employer memberships | `/my-career` (or validated `redirect`) | None needed | `redirect` validated against the allow-list (§11) |
| 2 | Candidate login, also has employer membership | Signed in via `/candidate/login` | ≥1 employer membership exists | `/my-career` — **unchanged by the extra membership** | None | Candidate entry never probes employer state; portal-switch (§10) is the only path to the employer side |
| 3 | Employer login, no company | Signed in via `/employer/login` | 0 memberships | `/employer/onboarding` | Onboarding intro | — |
| 4 | Employer login, one active company | Signed in via `/employer/login` | 1 active membership | `/employer/$employerSlug` | None | Slug independently re-verified against a fresh RLS-scoped query (existing G2 pattern) |
| 5 | Employer login, multiple companies | Signed in via `/employer/login` | ≥2 active memberships | `/employer` (picker) | None | Same |
| 6 | Employer login, pending company | Signed in via `/employer/login` | 1 membership, `employers.status='pending'` | `/employer/$employerSlug` | Pending banner (§7) | Draft-only write access enforced server-side, not just hidden in UI |
| 7 | Employer login, rejected company | Signed in via `/employer/login` | 1 membership, `employers.status` reflects rejection | `/employer/$employerSlug` | Explicit rejection state + next-step/contact copy — never silent | Read-only; no job-write access |
| 8 | Employer login, suspended company | Signed in via `/employer/login` | 1 membership, `employers.status='suspended'` | `/employer/$employerSlug` | Explicit suspended state | Zero access to jobs, applications, or CVs — `employer_is_active_status()` false (matches the Jobs MVP spec's H5 design) |
| 9 | Direct protected employer URL, signed out | Not signed in | — | `/employer/login?redirect=<original path>` | None | `redirect` captured only if it passes the allow-list (§11) |
| 10 | Direct candidate URL, signed out | Not signed in | — | `/candidate/login?redirect=<original path>` | None | Same |
| 11 | Platform admin | Signed in (any entry point) | Admin status is independent of portal choice | Candidate entry → `/my-career`; employer entry → `/employer` (or `/admin/*` if navigated there directly) | None | `is_platform_admin()` is a wholly separate permission dimension, unaffected by portal intent (unchanged from G1) |
| 12 | Invalid `redirect` parameter | Either | — | Falls back to the portal's safe default (`/my-career` or `/employer`) | None — never surfaced as an error | Malformed value is silently discarded, never partially trusted |
| 13 | External redirect attempt (`redirect=https://evil.example`) | Either | — | Same safe-default fallback | None | Rejected by the same allow-list (§11) — this is the concrete open-redirect test |
| 14 | User switches portal after login | Already signed in | Determined fresh at switch time | Candidate→Employer: `/employer` (re-runs the §8 row 3–8 branching); Employer→Candidate: `/my-career` | None | No new auth event; membership state is re-queried live, never read from a cached value (§10) |

---

## 9. Global navigation

### 9.1 Signed out

Desktop header: `Jobb` · `Tester` · `För arbetsgivare` (links to `/employers`) · a **"Logga in" menu** that expands to two explicit rows — *"Logga in som kandidat"* and *"Logga in som arbetsgivare"* — rather than a single ambiguous action; a parallel "Skapa konto" secondary action follows the same two-row split. This directly satisfies "clear split between candidate and employer access" without adding a second permanent header slot.

### 9.2 Candidate logged in

`Min karriär` (primary/active) · `Jobb` · `Tester` · account menu (avatar/name ▾) containing: account settings, **"Gå till Arbetsgivarportalen"** if the user already has ≥1 employer membership, or **"Bli arbetsgivare"** (→ `/employer/register`) if they have none, then "Logga ut."

### 9.3 Employer logged in

`Arbetsgivarportal` (primary/active, links to the single company or opens the picker if 2+) · `Jobb` (employers can still browse public jobs) · `Tester`/`Assessment` (marketing-only until ordering ships) · a **workspace switcher** (company name + list) rendered only when the user has ≥2 companies · account menu containing **"Gå till Min karriär"**, account settings, "Logga ut."

**Candidate and employer dashboards are never blended into one layout under any state above.**

### 9.4 Mobile navigation

The signed-out "Logga in"/"Skapa konto" split renders as two distinct full-width rows in the slide-out sheet, not a nested dropdown (dropdowns are poor mobile UX). Candidate-logged-in and employer-logged-in states render their respective primary links and account-menu contents as a flat vertical list in the same sheet — the workspace switcher (9.3) appears as its own labeled section when applicable, not collapsed into the account menu. The portal-switch action (§10) is always a visible top-level row in the sheet when the other portal is reachable, never buried.

---

## 10. Portal switching

**One explicit mechanism:** an account-menu action — *"Gå till Min karriär"* / *"Gå till Arbetsgivarportalen."*

Rules (all locked, matching the ADR):
- It performs client-side navigation only (`/my-career` or `/employer`) — no server call, no session mutation, no new authentication event.
- **It never grants permissions.** Landing on `/employer` after a switch re-runs the exact same membership/status branching as row 3–8 of the redirect matrix — a candidate with zero employer memberships who somehow reaches this action lands on `/employer/onboarding`, not a dashboard.
- A `localStorage` key (e.g. `cqrityjob:lastPortal`) records which portal the user last used, **purely to decide which option is visually emphasized next time** (e.g., which side of the account menu appears first) — it is never read by any RLS policy, server function, or route guard, and losing it (cleared cache, new device) has zero security consequence, only a cosmetic one.

---

## 11. Security model

**Locked principles, restated precisely:**

- Authentication is shared technically (one `auth.users` identity, one session).
- Candidate and employer routes are separate; no route ever renders both dashboards.
- Portal intent (the `intent`/`mode` query params, the login page chosen, the portal-switch action) controls **only** copy and redirect destination — it is read by zero RLS policies, zero triggers, zero server functions, at any point.
- Employer access depends exclusively on `employer_memberships` (role, status), re-verified per request.
- Active-company checks remain in the database and server functions (`employer_is_active_status()`), never inferred client-side.
- Company creation is server-side and atomic (§12) — no two-step client-orchestrated sequence that could leave a company without an owner or an owner without a company.
- Owner membership is created **only** for the authenticated creator's own `auth.uid()` — never for an arbitrary user id supplied by the client.
- Clients cannot set `role`, `status`, `verified`, billing state, or any admin-owned field on any request — every one of those is either hardcoded by the server function or entirely absent from the function's accepted parameters.
- Return URLs (`redirect`/`next`) use an explicit allow-list: must start with `/`, must not start with `//` (protocol-relative external URL trick), must not contain `://`, capped length, must not equal `/auth` itself (loop prevention). Anything failing any check is discarded silently, never partially honored.
- No slug-based authorisation anywhere — `$employerSlug` is a lookup key only, independently re-verified against the caller's own RLS-scoped membership list on every load (unchanged G2 pattern, now explicitly required of every new route this spec adds).
- No client-side privilege decisions — every "may I do this" question is answered server-side, on every request, never cached as a UI-layer boolean that persists across navigations.
- All sensitive onboarding actions (company created, access requested, access approved/denied) are audited via the existing `audit_logs` table, matching the pattern already established in Phase G1.

### Threat analysis

| Threat | Mitigation |
|---|---|
| URL parameter privilege escalation (`?intent=employer&role=owner`, etc.) | `intent`/`mode`/`redirect` are read only for routing; no server code path ever derives a permission from a query parameter |
| Employer slug manipulation (`/employer/other-companys-slug`) | Unchanged G2 pattern — every load independently re-verifies the slug against a fresh, RLS-scoped `listMyEmployerWorkspaces()`-equivalent result; an inaccessible slug produces the same neutral not-found state regardless of *why* it's inaccessible |
| Forged membership (direct API/table INSERT attempt with `role='owner'`) | No client-writable INSERT policy exists on `employer_memberships`, before or after this spec (§12) — the only INSERT path is a service-role server function that hardcodes the role for the two flows it supports |
| Company takeover | 6.B never creates a membership directly; only an existing owner or platform admin can approve a request, and only they choose the granted role |
| Duplicate company creation | Name/website/registration-number match check runs before creation (§12); a plausible match routes to "request access" instead of creating a second row |
| Unsafe redirects | The allow-list above; verified explicitly by test cases 13 and the abuse-test section (§15) |
| Account confusion | The portal-switch action is always visible when applicable — never a silent auto-switch, never a blended dashboard that could make a user unsure which context they're in |
| Cross-company data access | Unchanged G1 tenant-isolated RLS (`has_employer_role()`), required of every new route without exception |
| Candidate/employer session confusion | There is exactly one identity and one session at all times — "confusion" here reduces to "does any UI ever imply permissions the user doesn't have," mitigated by every employer route re-verifying membership on load rather than trusting a client-cached flag |

---

## 12. Data and backend requirements

**Principle: reuse existing architecture wherever it already fits; add the smallest new surface that makes self-service creation safe.** No new subscription/external service is introduced.

| Item | New or reused | Design |
|---|---|---|
| User portal preference | **New, client-only** | `localStorage` key, never a database column — per §10, it carries zero authorization meaning, so persisting it server-side would be unjustified complexity for a purely cosmetic preference |
| `employers.status` | **Additive migration** | Extend the existing `draft\|active\|suspended\|archived` CHECK to add `pending` and `rejected`: `draft\|pending\|active\|rejected\|suspended\|archived`. `pending` is the self-service creation default (§6); `draft` keeps its existing admin-created meaning and is not reused for this purpose, to avoid conflating two different origins under one value. **Naming note:** deliberately `pending`, not `pending_review` — the Jobs MVP v1 spec already uses `pending_review` for `jobs.status`; reusing that exact string for a different table/concept here would be a needless collision this document specifically avoids. |
| Company creation | **New server function** — `create_my_employer_company({ name, website?, registrationNumber?, country, jobTitle })` | Runs the duplicate-detection check (below) first; on no match, performs an atomic write (single transaction or a `SECURITY DEFINER` RPC, mirroring `update_employer_membership()`'s existing atomicity) creating the `employers` row (`status='pending'`) and an `employer_memberships` row for `auth.uid()` (`role='owner', status='active'`) together — never as two separate client-visible steps. Writes one `audit_logs` row (`action='company_created'`). |
| Access request | **New table** — `employer_access_requests(id, employer_id, requester_user_id, status, message, created_at, decided_by, decided_at)` | RLS: requester can INSERT their own row and SELECT their own rows; an existing owner/admin of `employer_id` can SELECT/UPDATE requests for their company; platform admin sees all. No self-approval path exists — the requester's own role can never satisfy the approver check for their own request. |
| Access request creation | **New server function** — `request_access_to_employer({ employerId, message? })` | Plain RLS-scoped INSERT (owner-write, per the table's own policy) — no service-role needed here, since creating a *pending request* carries no privilege by itself. |
| Access approval | **New server function** — `approve_access_request({ requestId, grantedRole })` | RLS-scoped read to confirm caller is an owner of the request's employer (or `is_platform_admin()`), then a service-role write that atomically creates the `employer_memberships` row with the approver-chosen role (never `owner` unless the approver explicitly grants it, never self-selected by the requester) and marks the request `approved`. Writes an `audit_logs` row. |
| `employers`/`employer_memberships` write access | **No new direct RLS INSERT/UPDATE policy** for `authenticated` on either table | Recommendation, stated once, not left as a choice: both new server functions above authenticate the caller via the existing RLS-scoped client first, then perform their privileged write via the service-role client (`supabaseAdmin`) — the exact two-step pattern already established by `getEmployerDashboardStats` and by the Jobs MVP v1 spec's `job_applications` design (C2). This means `employers`/`employer_memberships` remain exactly as admin-write-only at the RLS layer as they are today; the two new functions are the *only* additional way any row in either table can change, and both are narrow, audited, and column-restricted by construction rather than by an open policy an implementer could later widen by accident. |
| Duplicate detection | **New, inside the creation function** | Case-insensitive match on normalized company name, plus an exact match on website domain or registration number where provided. A match blocks creation and returns the candidate company for the UI to offer §6.B instead — this is a human decision point, never an automatic merge. |
| Jobs-authoring RLS interaction | **Addendum to the not-yet-implemented Jobs MVP v1 C1 design** | §7's resolution above — split the draft-write condition to accept `employers.status IN ('active','pending')`, keep every other employer-write path (submission, applications, CVs) strictly `active`-only. To be applied when that RLS is actually built, not implemented now. |
| Feature flags | **Reused, no new flag** | This entire flow ships behind the existing `VITE_EMPLOYER_PORTAL_ENABLED` flag (currently `false`) — no new flag is introduced; `/auth`'s compatibility-redirect behavior (§3.4) is **not** flag-gated, since it must work correctly regardless of the employer portal's launch state (a candidate hitting `/auth` must always work). |

---

## 13. Extensibility — commercial platform readiness

Restated from the ADR because it constrains this spec's own route/data choices, not just future ones: `/employer/$employerSlug/*` is a nested workspace shell today (jobs, applications) and stays one tomorrow (billing, team, analytics, candidate search, branding, assessment ordering, AI recruitment assistants, enterprise SSO/domain verification). Every future module reuses `has_employer_role()`/`employer_is_active_status()` rather than inventing new authorization; `employers` stays thin, with future commercial data living in its own `employer_id`-keyed tables; `employer_memberships.role` stays an additively-extensible `text`+`CHECK` list. Nothing in this spec's route table, data model, or redirect logic assumes "jobs" is the only thing that will ever live under an employer workspace — this is the concrete, checkable form of the extensibility requirement, not a promise made only in prose.

---

## 14. Acceptance criteria

1. Candidate login is reachable from a clearly labeled, candidate-specific entry point (`/candidate/login`, plus the signed-out header split, §9.1).
2. Employer login is reachable from a clearly labeled, employer-specific entry point (`/employer/login`, plus the same header split).
3. No employer-facing page shows the existing candidate-oriented copy ("Ditt konto sparar dina karriärtestresultat...") as its primary message.
4. Candidate and employer portals have fully separate routes (§3).
5. Candidate and employer portals have fully separate dashboards — `/my-career` and `/employer/$employerSlug` never share a layout or render simultaneously.
6. One technical identity (one `auth.users` row) can hold both a candidate presence and an employer membership without any schema or auth-backend change.
7. Portal switching is an explicit, named UI action (§10) — never automatic, never inferred.
8. Portal switching never grants a permission the user's `employer_memberships` row doesn't already independently establish.
9. A new user can complete employer registration and create a company account end-to-end (§5.2, §6.A).
10. The company creator becomes `owner` only through the atomic server function — never via a client-supplied role value.
11. Gaining access to an *existing* company always requires an explicit approval step (§6.B) — no auto-join path exists.
12. Duplicate company creation is blocked by the pre-creation match check, with "request access" offered as the recovery path.
13. Pending-company restrictions (§7) hold: draft/edit succeeds, submit/publish/candidate-data/assessment/invite access fails, server-side, not just UI-hidden.
14. An active employer can create and submit jobs once the Jobs MVP v1 job-authoring work (out of this spec's scope) lands, without requiring any further change to this spec's routing/redirect layer.
15. A candidate account, with zero employer memberships, cannot reach any employer-scoped data through any route in this spec.
16. An employer member of Company A cannot reach Company B's data through slug manipulation, direct route navigation, or a forged request parameter.
17. Mobile navigation (§9.4) presents the candidate/employer split, the portal switch, and the workspace switcher (where applicable) without relying on hover-only or nested-dropdown interactions.
18. Every user-facing string specified in §4/§5/§6/§7 exists in both Swedish and English in the dictionary system, with no hardcoded fallback string.
19. A full page refresh or browser back/forward navigation at any point in the login → onboarding → dashboard sequence never leaves the user in a state inconsistent with their actual auth/membership state (always re-derived on load, never assumed from history).
20. `/auth` no longer functions as a standalone, candidate-only login page for a new visitor — it only ever redirects (§3.4).
21. No redirect parameter, on any route this spec introduces, can send an authenticated or unauthenticated user to an external origin.
22. No H4 (job publishing/moderation) functionality is implemented, modified, or assumed-available by this spec's own routes.

---

## 15. Test cases

Format: Test ID · Persona · Preconditions · Starting URL · Steps · Expected UI result · Expected redirect · Expected database/security result.

### Positive

| ID | Persona | Preconditions | Starting URL | Steps | Expected UI | Expected redirect | Expected DB/security result |
|---|---|---|---|---|---|---|---|
| P1 | New candidate | None | `/candidate/register` | Fill name/email/password, submit | Confirmation / check-email state | Stays on page (email confirmation flow, unchanged from today) | New `auth.users` row; no `employer_memberships` row created |
| P2 | Existing candidate | Has a password account | `/candidate/login` | Sign in | Loading → dashboard | `/my-career` | Session established; no employer query executed |
| P3 | New employer | None | `/employer/register` | Fill required fields, submit | Confirmation / check-email state | Stays on page | New `auth.users` row; no `employers`/`employer_memberships` row yet (created at onboarding, not registration) |
| P4 | New employer, first sign-in | Just confirmed email | `/employer/login` | Sign in | Onboarding intro | `/employer/onboarding` | 0 memberships confirmed via RLS-scoped query |
| P5 | Employer, creating a company | Signed in, 0 companies | `/employer/onboarding` | Choose "Skapa företagskonto," fill fields, submit | Pending-state dashboard, banner shown | `/employer/$newSlug` | One `employers` row (`status='pending'`) + one `employer_memberships` row (`role='owner'`, `status='active'`), created atomically; `audit_logs` row written |
| P6 | Employer, active company | Signed in, 1 active membership | `/employer/login` | Sign in | Full dashboard | `/employer/$employerSlug` | Membership + active status independently verified |
| P7 | Employer, portal switch | Signed in as employer | `/employer/$employerSlug` | Open account menu → "Gå till Min karriär" | Candidate dashboard | `/my-career` | No new auth event; existing session reused |
| P8 | Employer, multiple companies | Signed in, 2 active memberships | `/employer/login` | Sign in | Workspace picker | `/employer` | Both memberships listed, each independently RLS-verified |

### Negative

| ID | Persona | Preconditions | Starting URL | Steps | Expected UI | Expected redirect | Expected DB/security result |
|---|---|---|---|---|---|---|---|
| N1 | Candidate | Signed in, 0 employer memberships | `/employer/$anySlug` (typed directly) | Navigate | Neutral access-denied / not-found state | Stays or redirects to a neutral state — never reveals whether the slug exists | RLS query returns empty; no data leaked |
| N2 | Employer member of Company A | Signed in | `/employer/company-b-slug` | Navigate directly | Same neutral not-found state as N1 | — | Cross-tenant read blocked by RLS, indistinguishable from a nonexistent slug |
| N3 | Any user | Signed in | Any protected route with `?redirect=https://evil.example` triggered | Trigger a redirect-carrying flow | Lands on the safe default, no external navigation occurs | Falls back per §11 | Allow-list rejects the value before any navigation call is made |
| N4 | Any user | Signed in, mid-onboarding | `/employer/onboarding` | Submit a company name matching an existing company | "Request access" offered instead of a create action | Stays on page pending user choice | No new `employers` row created |
| N5 | Employer member | Signed in, member of Company A only | `/employer/onboarding` (or equivalent UI) | Submit a request-access for Company B | Request submitted, pending state shown | — | `employer_access_requests` row created; **no** `employer_memberships` row created for the requester |
| N6 | Employer, suspended company | Signed in, membership at a `status='suspended'` company | `/employer/$employerSlug/jobs/new` (or any job-write action) | Attempt to create/edit a job | Explicit suspended-state message, write blocked | — | `employer_is_active_status()` false; write rejected server-side regardless of UI state |

### Abuse / security

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| A1 | Forged owner role | Craft a direct API call to create an `employer_memberships` row with `role='owner'` for a company the caller doesn't own | Rejected — no client-writable INSERT policy exists; only the service-role-mediated functions can write this table |
| A2 | Forged active status | Craft a direct API call attempting to set `employers.status='active'` on a `pending` company as a non-admin | Rejected by RLS (no client write path to `employers` at all outside the two narrow functions, neither of which accepts a status parameter from the caller) |
| A3 | Manipulated company ID | Substitute a different `employerId` into the `request_access_to_employer`/job-write payload than the one the UI presented | Server function re-derives every check from the authenticated caller + the supplied id independently — no trust placed in what the UI last rendered |
| A4 | Repeated onboarding submission | Double-submit the create-company form (e.g. rapid double-click, replayed request) | Idempotency: the duplicate-detection check on the second call finds the just-created company and offers "request access" rather than creating a second row |
| A5 | Cross-company read/write via direct API | Authenticated user with a Company A membership issues a direct table query for Company B's `jobs`/`employer_memberships` rows | RLS returns zero rows regardless of client-side code path |
| A6 | Direct API call, no membership at all | Authenticated user with zero employer memberships issues a direct write attempt against any employer-scoped table | Rejected — no policy grants access absent a matching, active `has_employer_role()` result |

### Mobile

| ID | Scenario | Expected result |
|---|---|---|
| M1 | Candidate login on a narrow viewport | Full-width form, no horizontal scroll, "Är du arbetsgivare?" link remains visible without scrolling past the fold on common device sizes |
| M2 | Employer login on a narrow viewport | Same, employer-specific copy |
| M3 | Portal switch from the mobile nav sheet | Switch action is a visible top-level row, not nested in a submenu |
| M4 | Employer onboarding on mobile | Form fields stack vertically, duplicate-match offer ("Begär åtkomst") is clearly tappable, not cramped next to the primary "Skapa" action |
| M5 | Dashboard navigation (workspace switcher, ≥2 companies) on mobile | Switcher renders as its own labeled list section in the sheet, not collapsed into an icon-only control |

---

## 16. MVP boundary

### MUST HAVE BEFORE H4
Separate candidate login page; separate candidate registration page; separate employer login page; separate employer registration page; the shared authentication backend used safely by both (no new auth system); correct redirects per §8; employer onboarding (§6.A); company account creation (atomic, server-side); existing-company access request (§6.B); employer empty/pending/rejected/suspended states (§7, §8); the portal switcher (§10); header/navigation updates (§9); complete Swedish and English copy; the security/abuse test suite (§15); `/auth` migration/compatibility handling (§3.4).

### SHOULD HAVE
Remembered portal preference beyond the pure-cosmetic default already specified (e.g. surfacing it on the homepage for a returning signed-in user); improved company duplicate matching (fuzzy name matching beyond exact/near-exact); email confirmation copy tailored per portal rather than reusing the existing generic confirmation text; a clearer multi-step progress indicator during pending review (beyond the single persistent banner).

### LATER
Team invitations beyond the single-request-at-a-time model in §6.B; domain verification; BankID; enterprise SSO; billing; subscription plans; advanced company settings; automatic company-registry lookup (auto-filling from a national business registry); email automation/drip sequences; the assessment-ordering workflow itself (only its future route slot is reserved, §3.3/§13).

Nothing above the "MUST HAVE" line is implied to exist yet by any route or copy this spec introduces — every future-module reference in §3.3/§13 is a reserved slot, not a built feature.

---

## 17. Lovable BUILD MODE prompt

```
CANDIDATE / EMPLOYER PORTAL ACCESS SEPARATION — BUILD MODE

Repository: cqrityjob/trust-path-recruitment. Implement exactly and
only the specification in docs/auth/candidate-employer-portal-spec-v1.md
and the decisions locked in docs/architecture/adr-candidate-employer-portal-separation.md.
Do not begin H4 (job publishing/moderation UI) or any Jobs MVP v1
job-authoring work — that is tracked separately in
docs/job-intelligence/jobs-mvp-v1-spec.md and is explicitly out of
scope here.

MANDATORY CONSTRAINTS:
- Do not create a separate authentication backend. Reuse the existing
  Supabase Auth / auth.users identity and the existing auth form
  logic (Google OAuth + email/password) underneath every new page.
- Do not treat any URL parameter, form selection, or "portal intent"
  as a permission. Every server-side authorization decision must be
  re-derived from employer_memberships (has_employer_role(),
  employer_is_active_status()) or is_platform_admin() — never from
  how the user navigated to a page.
- Do not weaken, remove, or bypass any existing RLS policy or trigger
  from Phase G1/G2/G3 (is_platform_admin(), has_employer_role(),
  employer_is_active_status(), update_employer_membership()). Reuse
  them; do not reimplement equivalents.
- Do not auto-approve companies, auto-grant verified status, or auto-
  create an employer_memberships row for anyone other than the
  authenticated creator of a new company (owner) or an approver's
  explicit grant (access requests).
- Do not open a new direct RLS INSERT/UPDATE policy on `employers` or
  `employer_memberships` for `authenticated`. Both new write paths
  (company creation, access-request approval) must be service-role-
  mediated server functions that perform their own RLS-scoped
  authorization check first, matching the existing
  getEmployerDashboardStats two-step pattern.
- Do not modify any feature flag's default. This entire flow ships
  behind the existing VITE_EMPLOYER_PORTAL_ENABLED (already false);
  do not flip it. The /auth compatibility-redirect behavior itself is
  NOT flag-gated — it must work regardless of the employer portal's
  launch state.
- Do not silently "fix" any security finding not named in this task —
  if you find one, stop and report it rather than patching it
  unreviewed.
- Do not modify unrelated feature flags, routes, or components.
- Preserve all current /jobs public browsing functionality unchanged.
- Preserve all existing candidate assessment/career-profile data and
  routes unchanged.

DELIVERABLES (per the spec's sections, cited for traceability):
1. New routes: /candidate/login, /candidate/register, /employer/login,
   /employer/register, /employer/onboarding (spec §3, §4, §5, §6).
2. Modified route: /auth becomes a compatibility-redirect-only route
   per spec §3.4 — remove its own form rendering entirely.
3. Modified route: /employer (index) — 0-workspace branch now
   redirects to /employer/onboarding instead of showing a dead-end
   message (spec §3.3).
4. Modified route: /employer/$employerSlug — add the pending/rejected/
   suspended states from spec §7/§8.
5. New server functions: create_my_employer_company(),
   request_access_to_employer(), approve_access_request() (spec §12)
   — service-role-mediated, atomic where specified, each writing an
   audit_logs row.
6. New table: employer_access_requests (spec §12), with RLS exactly
   as specified — requester self-select/self-insert, owner/admin
   select+update for their own company's requests, no self-approval
   path.
7. Additive migration: extend employers.status CHECK to add 'pending'
   and 'rejected' (spec §12) — do NOT reuse 'draft' for this, and do
   NOT name the new value 'pending_review' (that string is reserved
   for jobs.status in the separate Jobs MVP v1 spec — using it here
   would create a cross-document naming collision).
8. SiteHeader changes: signed-out split (spec §9.1), candidate-signed-
   in state (§9.2), employer-signed-in state incl. workspace switcher
   (§9.3), full mobile nav (§9.4).
9. Portal-switch account-menu action (spec §10) — client-side
   navigation + localStorage preference only, no server call.
10. All Swedish and English copy exactly as specified in spec §4, §5,
    §6, §7 — added to the existing i18n dictionary system, no
    hardcoded fallback strings.
11. Return-URL (redirect/next) allow-list validation (spec §11) used
    by every route that accepts one.

REQUIRED BEFORE DONE:
- Provide every changed/added file explicitly in your report.
- Provide the exact SQL for every database change (the additive
  employers.status CHECK migration, the new employer_access_requests
  table + RLS, and the two/three new server functions' definitions).
- Provide the exact redirect rules implemented (a table matching spec
  §8's 14 rows, confirming each is actually wired up).
- Run and report: typecheck, build, lint, bun run cie:check,
  bun run kg:check.
- Run and report the security/route test set from spec §15 — at
  minimum every "Negative" and "Abuse/security" case (N1-N6, A1-A6),
  confirming actual pass/fail, not assumed.
- Confirm no existing /jobs, /my-career assessment/profile data, or
  Phase G1-G3 RLS policy was altered beyond what's listed above.

Write a final implementation report to exactly:
docs/auth/candidate-employer-portal-implementation-report.md

End that report with exactly this line:
CANDIDATE AND EMPLOYER PORTAL ACCESS COMPLETE — READY FOR OWNER QA
```
