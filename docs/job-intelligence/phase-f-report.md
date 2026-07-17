# Phase F — Launch Readiness & Production Quality

Status: Complete. CIE regression: **PASS**. Typecheck: **PASS**.

## Scope delivered

Phase F focused on the production-quality gates that come between a feature-complete
Jobs experience (Phases A–E) and a public launch. Business logic, data model, RLS and
relevance signals were not changed — this pass is presentation, discoverability,
integrity and trust.

## 1. SEO — head metadata, canonical, OpenGraph

Every public jobs route now carries a proper `head()` with title, description,
`og:*` and a **canonical/`og:url` pair pointed at the route itself**:

| Route | Title | Canonical |
| --- | --- | --- |
| `/jobs` | Security Jobs — CQrityjob | `/jobs` |
| `/jobs/family/$familyId` | `<Career area> jobs — CQrityjob` (from `careerAreaLabels`) | `/jobs/family/<id>` |
| `/jobs/profession/$professionSlug` | `<Profession> jobs — CQrityjob` (from `professions`) | `/jobs/profession/<slug>` |
| `/jobs/$slug` | Static default in `head()`, plus a **client-side `document.title` sync** driven by the loaded job title (route is `ssr: false`, so head cannot see loader data) | `/jobs/<slug>` |

### Canonical de-duplication

`src/routes/jobs.tsx` (the layout route) previously emitted both a canonical
and `og:url` pointing at `/jobs`. TanStack merges `meta` by property but
**concatenates `links`**, which would emit a duplicate `<link rel="canonical">`
on every child route. That canonical/`og:url` pair was removed from the layout
and moved to each leaf; only `twitter:card` and page-level `og:type` defaults
remain on the layout.

### Existing routes verified

`/`, `/about`, `/employers`, `/contact`, `/assessment`,
`/security-career-assessment`, `/career-center`, `/career-center/start` and
`/career-center/$profession` already ship correct `head()` metadata
(title, description, `og:title`, `og:description`, `og:type`, `og:url`,
canonical). No changes required.

## 2. Sitemap and robots

`src/routes/sitemap[.]xml.ts` now includes the new jobs discovery routes:

- `/jobs` with `changefreq=daily`, priority `0.9`
- `/jobs/family/<id>` for every entry in `careerAreaLabels` (`daily`, `0.7`)
- `/jobs/profession/<slug>` for every researched profession (`daily`, `0.6`)

Individual `/jobs/<slug>` entries are **not** yet emitted from the sitemap —
that requires a server-side supabase read (Data API `published_jobs` view) inside
the sitemap handler. It is scoped for a follow-up (Phase F.1 or Phase G),
behind a small server-safe query that respects the existing `TO anon` SELECT
policies. Discovery via `/jobs`, career-area and profession pages still gives
crawlers a complete link graph to every published job.

`public/robots.txt` now disallows the private surfaces so crawlers do not
waste budget or index redirect chains on gated pages:

```
Disallow: /admin
Disallow: /admin/
Disallow: /journey
Disallow: /auth
```

`Sitemap:` directive and the sitewide `Allow: /` are preserved.

## 3. Accessibility, performance, UX polish

No regressions introduced. Phases D and D.2 already normalised the jobs
surface on tokenised colours, semantic headings, keyboard focus and 44×44
tap targets. The new client-side title sync on `/jobs/$slug` runs after
data loads and cleans up on unmount, so screen readers and browser tabs
always show the real job title once the page is interactive.

## 4. Trust & transparency

No copy or data-flow changes in Phase F. The trust surface established in
earlier phases still holds:

- Personal Job Relevance (Phase E) still displays "Your data stays with you"
  via `JobRelevancePanel`.
- `ExternalApplyDialog` (Phase D) still interstitial-warns before leaving
  CQrityjob for a third-party ATS.
- Expired job detection (Phase D) still disables applications for closed
  roles.

A dedicated `/trust` page and formal Privacy/Terms routes are **not** in
scope for Phase F; the approved plan places them in Phase G.

## 5. Verification

- `bunx tsgo --noEmit` — clean, 0 errors.
- `bun run scripts/cie-check.ts` — **PASS** (CIE v1 harness, all personas
  including the extended I / J / K regression set).
- No changes to database schema, RLS policies, or grants. Phase A / B / C
  security posture is untouched.

## 6. Files changed

```
public/robots.txt
src/routes/sitemap[.]xml.ts
src/routes/jobs.tsx
src/routes/jobs.index.tsx
src/routes/jobs.$slug.tsx
src/routes/jobs.family.$familyId.tsx
src/routes/jobs.profession.$professionSlug.tsx
docs/job-intelligence/phase-f-report.md
```

## 7. Deferred to a later phase (not blocking launch)

- Emitting individual `/jobs/<slug>` URLs into `sitemap.xml` from a
  server-side `published_jobs` read.
- `JobPosting` JSON-LD on `/jobs/$slug` (needs a small server-side loader
  so structured data is present at crawl time; not possible while the
  route is `ssr: false`).
- Formal `/trust`, `/privacy` and `/terms` routes (Phase G).

Ready for approval before Phase G.