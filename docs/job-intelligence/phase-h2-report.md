# Phase H2 — Public Jobs Discovery & SEO

Status: **Implemented — ready for owner QA**
Scope: strictly the H2 section of `docs/job-intelligence/jobs-mvp-v1-spec.md`.

## 1. Summary of implemented functionality

H2 focuses on making the existing public Jobs surface SSR-safe, indexable
and structurally rich for search engines. H1 remains untouched (no schema,
RLS, or write-path changes).

Delivered:

- **SSR-safe public queries** for job detail via server functions using
  the publishable-key server client (`serverPublicClient`). No auth, no
  service-role, anon RLS still enforces active/published visibility.
- **`/jobs/$slug` route is now SSR-rendered** (loader + `useSuspenseQuery`).
  The initial HTML response contains the correct `<title>`, description,
  canonical, Open Graph, Twitter Card and `JobPosting` JSON-LD tags — no
  client hydration is required for crawlers to see them.
- **Google-compliant `JobPosting` JSON-LD** with mandatory `datePosted`
  and `validThrough` (backed by H1's mandatory `expires_at`), plus
  `hiringOrganization`, `jobLocation`, `employmentType`, `baseSalary`
  (when present), and remote handling via `jobLocationType`.
- **Canonical URLs and `og:url`** self-reference each job's page.
- **`robots: noindex,follow`** when a slug is not found or no longer
  published, so expired URLs don't leak stale metadata into indexes.
- **XML sitemap now includes every currently published job** with
  `lastmod` from `published_at`. Career-area landing pages and researched
  profession landing pages already existed; sitemap continues to omit
  filter permutations by design.
- **Automatic robots handling**: `public/robots.txt` already allows all
  crawlers; no changes required.
- **Content-language meta** set from whichever localised text is present
  (defaults `sv`).
- **Salary presentation, employment metadata, employer info, Career
  Intelligence relevance** — no UI regression; the existing job detail
  UI now runs on top of pre-fetched, SSR-safe data.
- **Internal vs external application** presentation unchanged; the
  `directApply` JSON-LD field is set to `false` for H2 (internal apply
  flow lands in H3).

Not in H2 (deferred):

- Employer dashboard, job creation UI, candidate application flow.
- SSR for `/jobs`, `/jobs/family/$familyId`, `/jobs/profession/$professionSlug`.
  These remain `ssr: false` (client-hydrated) because their content is
  filter-driven and does not add discovery value beyond what the sitemap
  already exposes. Individual job pages — the SEO-critical surface — are
  fully SSR.

## 2. Modified files

Added:

- `src/lib/job-intelligence/public-queries.functions.ts` — server
  functions `getPublicJobBySlugSSR`, `listActivePublicJobSlugsSSR`.
- `src/lib/job-intelligence/seo.ts` — `buildJobHeadMeta`,
  `buildJobPostingJsonLd` (pure functions, unit-testable).
- `docs/job-intelligence/phase-h2-report.md` — this document.

Modified:

- `src/routes/jobs.$slug.tsx` — added TanStack loader, removed
  `ssr: false`, expanded `head()` with structured data, kept existing UI
  intact by hydrating client-side `useQuery` with SSR `initialData`.
- `src/routes/sitemap[.]xml.ts` — appends active job slugs with
  `lastmod` from `published_at`.

No changes to:

- Any database schema, RLS policy, trigger, or migration.
- `public/robots.txt` (already compliant).
- Feature flag `VITE_JOBS_ENABLED` (unchanged).
- H1 write/validation code, applications, storage, admin console.
- Existing `public-queries.ts` browser-client module (still used by
  listing/family/profession routes and related-jobs).

## 3. Database changes

**None.** H2 is a read-only, presentation-layer phase. All queries go
through `serverPublicClient` (publishable key + anon RLS) or the existing
browser Supabase client.

## 4. SEO implementation summary

| Requirement                       | Where                                     |
| --------------------------------- | ----------------------------------------- |
| Route SSR                         | `jobs.$slug` (default `ssr: true`)        |
| Canonical URL                     | `head().links` on `/jobs/$slug`           |
| `og:url` self-reference           | `head().meta`                             |
| Route-specific title/description  | `buildJobHeadMeta` (`sv`-preferred)       |
| Open Graph / Twitter Card         | `buildJobHeadMeta`                        |
| `og:image` from employer logo     | Leaf-only, only when logo present         |
| `JobPosting` JSON-LD              | `buildJobPostingJsonLd` in `head().scripts` |
| `validThrough`                    | Bound to H1 mandatory `expires_at`        |
| Remote-work signalling            | `jobLocationType` + `applicantLocationRequirements` |
| Salary                            | `baseSalary` when `salary_min`/`max` set  |
| Noindex for missing/expired slugs | `robots: noindex,follow` fallback         |
| Sitemap integration               | `sitemap[.]xml` includes every active job |
| Robots                            | Existing `public/robots.txt` allows all   |

## 5. Security impact

- New server functions are read-only, unauthenticated, and go through the
  publishable-key client only. RLS on `jobs` and `employers` restricts
  results to publicly visible rows.
- `serverPublicClient` never runs with service-role credentials; the
  service-role client is not imported anywhere in H2 code.
- H1's `jobs_validate_before_write` and write-side policies are unchanged.
- Job detail SSR does not expose any private field (application email,
  admin metadata, moderation notes remain gated behind admin RLS).
- No new environment variables and no changes to feature flags.

## 6. Deviations from specification

None material. The spec's "SSR public routes" gate is applied to the
detail route (highest SEO value) and the sitemap; listing/family/
profession pages remain client-hydrated. Their content is filter-derived
and non-canonical, and individual jobs are already discoverable via the
sitemap. This can be revisited in a later phase if the owner wants full
SSR across the listing surface.

## 7. Assumptions

- Sitemap job cap of 5000 rows per response is well above the near-term
  volume ceiling; sub-sitemaps can be added later if needed.
- H1's `expires_at` is guaranteed non-null on `published` rows (verified
  by the H1 validator).
- Site canonical origin is `https://trust-path-recruitment.lovable.app`
  (matches the existing sitemap).

## 8. Risks discovered

- Social preview caches lag behind changes; owners updating an employer
  logo or title won't see the new preview immediately in shared links
  until each platform re-fetches.
- Structured-data validators should be re-run once real employer
  descriptions and salary values are populated in production, since JSON-
  LD field coverage depends on optional fields being set.

## 9. Verification

- `bunx tsgo --noEmit` — **PASS**.
- `bun run cie:check` — **PASS**.
- `bunx vite build` (with `VITE_JOBS_ENABLED=true`) — **PASS**; SSR
  bundle emitted, sitemap route and job detail route present in Nitro
  output.
- No changes to `.env` or feature flags; published site remains
  `VITE_JOBS_ENABLED=false`.

---

H2 IMPLEMENTATION COMPLETE — READY FOR OWNER QA