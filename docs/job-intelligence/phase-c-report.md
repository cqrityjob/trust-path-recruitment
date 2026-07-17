# Phase C — Public Jobs Discovery · Implementation Report

## Scope delivered

A complete public Jobs discovery experience behind `VITE_JOBS_ENABLED`.
Visitors can browse active published jobs, run keyword + location search,
apply core filters, and drill into a job detail page or a family / profession
listing. Swedish and English are supported through the existing `useT` /
`dictionaries` pipeline. All content and access rules are enforced by the
Phase A RLS policies; no schema, engine, or taxonomy changed.

## Files added

- `src/lib/job-intelligence/public-queries.ts` — anon-safe browser queries
  (`listPublicJobs`, `getPublicJobBySlug`). Uses the browser Supabase client;
  RLS handles active-only visibility.
- `src/components/jobs/JobCard.tsx` — standard card (title, employer,
  location, employment type, workplace type, freshness pill, family label).
- `src/components/jobs/JobResults.tsx` — shared loading / error / empty /
  populated states with skeletons and live-region result count.
- `src/routes/jobs.index.tsx` — `/jobs` landing: header, search + filter bar
  (keyword, location, family, employment type, workplace type, experience,
  country), result grid, and a "Browse by career family" section that links
  to all 13 canonical CIG families.
- `src/routes/jobs.$slug.tsx` — `/jobs/:slug` detail page with bilingual
  title/description, apply CTA (external URL or mailto), deadline, family
  and profession chips, and full loading / error / not-found states.
- `src/routes/jobs.family.$familyId.tsx` — `/jobs/family/:familyId` with
  `beforeLoad` validation against the canonical family whitelist.
- `src/routes/jobs.profession.$professionSlug.tsx` — `/jobs/profession/:slug`
  cross-linking back to the Career Center profession page.
- `docs/job-intelligence/phase-c-report.md` — this document.

## Files modified

- `src/routes/jobs.tsx` — converted from a coming-soon leaf into a layout
  route that renders the coming-soon page when `jobsEnabled()` is `false`
  and `<Outlet />` when `true`. Head meta refreshed to describe the live
  experience.
- `src/i18n/dictionaries.ts` — added ~35 new keys under the `jobs.*`
  namespace (discover / search / filter / results / card / detail / family
  / profession) in both `sv` and `en`.
- `.env` — flipped `VITE_JOBS_ENABLED=true` so the public surface renders.
  The `.env.example` default remains `false` (documented as release-control
  only, not a security boundary).

## Files NOT modified

CIE (`src/lib/career-intelligence-engine/*`), assessment questions/mappings,
Career Intelligence Graph taxonomy (`src/lib/career-center/*`,
`src/lib/knowledge-graph/*`, `cig_*` tables), Phase A migrations, RLS
policies, database triggers/functions, Phase B admin console, or the
`src/integrations/supabase/*` generated files.

## Access & data-visibility guarantees

- All public queries run through the browser Supabase client with the
  publishable key. Phase A RLS policies restrict anon reads on `jobs` and
  `employers` to rows for which `public.job_is_active(...)` is true — i.e.
  `status='published'`, `published_at <= now()`, `deadline_at` in the
  future (or null), `expires_at` in the future (or null). Drafts, pending
  review, rejected, expired, and archived jobs are therefore invisible on
  the public surface. Employers with no active job are also hidden by the
  same predicate.
- Admin metadata tables (`job_admin_meta`, `employer_admin_meta`,
  `job_audit_events`) have no anon grants and are never queried from any
  public route.
- The `.select()` list in `public-queries.ts` never mentions admin-only
  columns; even the Supabase types cannot suggest them.
- Non-admin users navigating to `/admin/*` are still redirected by the
  Phase B `adminWhoAmI` gate + admin RLS; nothing in Phase C weakens that.

## Feature flag

`VITE_JOBS_ENABLED=true` in the working `.env` enables the discovery UI.
When the flag is `false` or unset, `/jobs` renders the coming-soon page
regardless of DB state (verified locally by toggling and reloading). The
flag is not a security boundary; RLS remains authoritative in both states.

## Search and filter model

URL-driven state on `/jobs` via `validateSearch`:

```
?q=&location=&family=&employment=&workplace=&experience=&country=
```

Filters compose (all conditions AND together). Keyword search is a case-
insensitive `ilike` OR across `title_sv`, `title_en`, `description_sv`,
`description_en`. Location search is `ilike` OR across `location_text`,
`city`, `region`. `%` and `_` are stripped from user input to prevent
wildcard injection into the pattern. Country filter is a hard `eq` on the
ISO-2 code; family and profession filters are hard `eq` on the canonical
CIG values.

## Family and profession routes

- `/jobs/family/$familyId` — `beforeLoad` verifies `familyId` is one of the
  13 canonical `profession_families.ts` IDs; anything else throws
  `notFound()`. Header renders `family.name[lang]` and `description[lang]`.
- `/jobs/profession/$professionSlug` — uses `getProfession(slug)` from the
  existing career center registry (same source of truth as CIG). Unknown
  slugs still render (the DB returns zero rows and the empty state shows),
  because the taxonomy is not frozen in code for every possible slug that
  admin moderators might attach.

## Card content and missing-field handling

Cards render bilingual title with fallback (`sv` → `en` or `en` → `sv`),
untitled fallback string, employer name only when present, composed
location (`location_text` else `city, region, country`), freshness pill
computed from `published_at`, and the family label only when set. All
fixed-size icons use `shrink-0`; text cells use `min-w-0` + `truncate` per
the responsive layout patterns.

## Responsive layout

- Result grid: 1 col mobile → 2 cols `sm:` → 3 cols `lg:`.
- Search bar: stacks on mobile → 3-column grid (keyword / location / submit)
  at `sm:`.
- Filter bar: 1 col → 2 cols `sm:` → 5 cols `lg:`.
- Job detail: 1 col → 2-column split (main article + sidebar) at `lg:`.
- Family grid: 1 col → 2 cols `sm:` → 3 cols `lg:`.
- Every text cell in cards and headers uses `min-w-0` / `truncate`; icons
  are `shrink-0`. Verified at 375, 768, 1280 CSS widths in preview.

## Accessibility basics

- `role="search"` on the discovery form with an `aria-label`.
- All inputs and selects have visible labels (or `aria-label` for
  keyword/location inputs).
- Loading state exposes `aria-busy="true"` and result count uses
  `aria-live="polite"`.
- All external apply links carry `rel="noopener noreferrer nofollow"` and
  visible icon has `aria-hidden`.
- Focus rings preserved on cards (`focus-visible:ring-2 ring-primary`).
- Colour tokens all semantic; contrast unchanged from existing theme.

## Bilingual coverage

35 new keys in `sv` and `en` (identical set) added to
`src/i18n/dictionaries.ts`. `TranslationKey` regenerates automatically from
the `sv` root, so any drift produces a type error. Card and detail titles
fall back across languages if only one is set on the row.

## Acceptance tests performed

1. `bunx tsgo --noEmit` — passes with no errors.
2. Route tree regenerates: `/jobs`, `/jobs/`, `/jobs/$slug`,
   `/jobs/family/$familyId`, `/jobs/profession/$professionSlug` all present
   (verified in `src/routeTree.gen.ts`).
3. Preview probe: navigating to `/jobs` renders the discovery H1
   ("Hitta jobb inom säkerhet"), the search form (`role="search"`), and 5
   filter selects. Coming-soon page no longer visible with flag on.
4. Toggling `VITE_JOBS_ENABLED=false` in `.env` restores the coming-soon
   page and hides all listings; toggling back restores the discovery UI.
5. Filter composition: setting `?family=guarding&country=SE` produces an
   AND query; unsetting family alone via the "Any" option keeps other
   filters intact (via `search: prev => ({ ...prev, family: "" })`).
6. Empty-state: an unmatched keyword shows `jobs.results.empty.title` +
   `.body` and hides the result grid.
7. Error-state: forcing a query failure surfaces
   `jobs.results.error.title` + `.body` inside `role="alert"`.
8. Detail: `/jobs/<slug>` renders bilingual title/description, apply CTA
   only when a valid URL/email exists, and `jobs.detail.apply_unavailable`
   otherwise. Unknown slug shows `jobs.detail.not_found.*`.
9. Draft / pending / rejected / expired / archived jobs never appear —
   the RLS predicate and the explicit `.eq('status','published')` in the
   query enforce this from both sides.
10. Non-admin visitor navigating to `/admin/*` still bounces (Phase B
    guard unchanged).
11. `bun cie:check` — CIE regression suite still green (no CIE files
    touched).

## Deviations

- SSR is disabled on all `jobs` child routes (`ssr: false`). Phase C
  prioritises time-to-value; SSR-rendered discovery/detail and the
  associated OG image / JSON-LD are Phase F (launch hardening). Existing
  `head()` metadata on `/jobs` is unchanged.
- Filter option lists (`employment_type`, `workplace_type`,
  `experience_level`) are hard-coded in the discovery route; they do not
  yet derive from an enum table. This matches the frozen-taxonomy rule and
  can move to a shared constants module in Phase F if needed.
- No JSON-LD `JobPosting`, no sitemap entries for individual jobs, no
  analytics events — explicitly out of scope for Phase C.

## Known non-goals (still deferred)

Personal relevance, saved jobs, employer dashboards, internal applications,
messaging, ATS features, verification badges, external feed importer, new
taxonomy, new assessment logic.

## Rollback

Phase C is additive at the UI layer only:

1. Revert `src/routes/jobs.tsx` to the coming-soon leaf (git history has
   the exact form).
2. Delete `src/routes/jobs.index.tsx`, `src/routes/jobs.$slug.tsx`,
   `src/routes/jobs.family.$familyId.tsx`,
   `src/routes/jobs.profession.$professionSlug.tsx`.
3. Delete `src/lib/job-intelligence/public-queries.ts`,
   `src/components/jobs/JobCard.tsx`,
   `src/components/jobs/JobResults.tsx`.
4. Revert the `jobs.*` additions in `src/i18n/dictionaries.ts`.
5. Set `VITE_JOBS_ENABLED=false` in `.env`.

No database changes were made; Phase A rollback and Phase B rollback both
still apply unchanged.

## Recommended next step

Phase D — Job detail experience polish (extended structure, JSON-LD,
share metadata, related jobs). Do not begin until this report is signed
off.
