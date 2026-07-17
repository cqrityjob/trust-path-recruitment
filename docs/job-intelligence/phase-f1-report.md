# Phase F.1 — Launch Experience & User Dashboard

**Status:** Implemented (build mode)
**Scope:** Personal authenticated landing page at `/my-career`, post-login
routing to that page, and navigation-item swap in the site header.

## Objective

Ensure every authenticated user immediately understands where they are,
what they have completed, and what they should do next. Replace the
generic "Sign in" affordance with a persistent "My Career" entry point
for signed-in users.

## Deliverables

### 1. `/my-career` — personal dashboard

File: `src/routes/_authenticated.my-career.tsx` (new).

Composed entirely from existing surfaces — no new scoring, no schema
changes:

| Section              | Data source                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| Greeting             | `supabase.auth.getUser()` — display name / email                        |
| Latest assessment    | `listAssessmentRuns` (`src/lib/journey/journey.functions.ts`)           |
| Career profile       | `useCareerProfileForJobs` (Phase E) — archetype, motivations, top area  |
| Recommended professions | Top 3 `slugScores` from the saved `CareerProfileForJobsV1`           |
| Relevant jobs        | `listPublicJobs({ familyId: topFamily, limit: 3 })`                     |
| Job-relevance summary | Explains how relevance works, deep-links to `/jobs`                    |
| Recommended next step | Deterministic branch (no assessment → take it; else → top profession) |
| Quick access         | Career Center, Jobs, Assessment, Journey (beta)                        |
| Account              | Display name, email, sign-out, language pointer                        |

Onboarding path: when the user has no assessment (or no persisted
`CareerProfileForJobs`) the top of the page shows an "Start with the
assessment" card. Every empty-state card uses the *what + why + CTA*
shape approved in Phase D.

SEO: `robots: noindex, nofollow` (private surface).
SSR: `ssr: false` (matches the `_authenticated` gate).

### 2. Post-login routing

File: `src/routes/auth.tsx`.

- Email/password sign-in now navigates to `/my-career`.
- Already-signed-in guard on `/auth` bounces to `/my-career`.
- Google OAuth: `redirect_uri` intentionally left at
  `window.location.origin` per the platform rule against pointing OAuth
  callbacks at protected routes. The public landing page (`/`) now
  auto-forwards signed-in visitors to `/my-career` client-side, so the
  observed flow is: `/auth` → Google → `/` → `/my-career`.

File: `src/routes/index.tsx`.

- Added a `useEffect` that reads the current session client-side and
  redirects authenticated users to `/my-career` with `replace: true`.
- SSR-rendered HTML is unchanged, so crawlers and signed-out visitors
  still receive the public landing page.

### 3. Navigation — "My Career" replaces "Sign in"

File: `src/components/site/SiteHeader.tsx`.

- When signed in: header shows a "My career" pill linking to
  `/my-career` (both desktop and mobile menus).
- When signed out: header shows the existing "Sign in" pill linking to
  `/auth`.
- Sign-out is intentionally moved off the top nav and into the dashboard
  Account card — signed-in users now have a clear home rather than a
  destructive top-level action.

### 4. i18n

File: `src/i18n/dictionaries.ts`.

- Added `nav.my_career` — `"Min karriär"` / `"My career"`.
- Dashboard body copy is kept as inline bilingual strings (same
  pattern as `career-area-labels.ts`) to avoid inflating the dictionary
  with one-off strings.

## Non-changes

- `_authenticated.tsx` gate unchanged. Sign-out still triggers
  `onAuthStateChange` → redirect to `/auth`.
- `_authenticated.journey.tsx` retained and linked from the dashboard as
  "Career Journey (beta)". No content migration.
- No changes to backend schema, RLS, feature flags, or SEO for public
  surfaces.

## Verification

- `bunx tsgo --noEmit` — **0 errors**.
- CIE regression suite: no vitest test files defined in this project;
  earlier phase reports established that the CIE regression is a manual
  sequence via `dev.career-assessment-calibration`. Nothing in this
  phase touches CIE engine code or scoring, so behaviour is unchanged.
- Manual routes reviewed: `/`, `/auth`, `/my-career`,
  `/career-center`, `/jobs`, `/security-career-assessment`.

## Files touched

```
src/routes/_authenticated.my-career.tsx   (new)
src/routes/auth.tsx                        (redirect targets)
src/routes/index.tsx                        (signed-in bounce)
src/components/site/SiteHeader.tsx          (nav swap)
src/i18n/dictionaries.ts                    (nav.my_career keys)
docs/job-intelligence/phase-f1-report.md    (this report)
```

**Stopping here for approval before Phase F.2 / Phase G.**