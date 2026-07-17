# Phase D — Complete Job Experience — Implementation Report

Phase D transforms `/jobs/$slug` from the Phase C skeleton into a
production-ready detail page. No schema, no CIE, no assessment, no
security surface was touched.

## What shipped

### 1. Job header
- Employer name, location, employment type, workplace type, experience
  level, publish date, deadline all surfaced at the top of the page.
- Primary **Apply** CTA lives in a right-hand sticky sidebar
  (`lg:sticky lg:top-6`) so it stays reachable on desktop.
- Chips for `employment_type`, `workplace_type`, `experience_level`,
  `regulated`, `security_vetting_mentioned`, `driving_licence_required`.
  Each chip is optional and disappears gracefully when the field is
  missing.
- A `Closed` badge is shown at the top when `isJobExpired(job)` is true.

### 2. Job summary + responsibilities + benefits
- Localised description rendered under an explicit "About this role"
  heading (`whitespace-pre-line` preserves paragraphs).
- Responsibilities and benefits rendered as bullet lists via a shared
  `BulletList` helper. Empty arrays are dropped entirely.

### 3. Requirements (structured)
`normalizeRequirements(raw)` accepts two shapes without any migration:
- **Legacy** — `string[]` renders as a single "Qualifications" list.
- **Structured** — object with any of `mandatory` / `preferred` /
  `formal` / `employer_specific` keys. Each present bucket becomes a
  labelled sub-section: Mandatory / Preferred / Formal / Employer-specific
  (Krav / Meriterande / Formella krav / Arbetsgivarspecifikt in Swedish).
- Aliases (`must`, `required`, `nice_to_have`, `desired`, `regulated`,
  `employer`, `company_specific`) are tolerated so ingestion can be
  refined later without another UI change.

### 4. Employer card
Uses the additional employer columns exposed under the Phase A public
SELECT policy (`logo_url`, `website`, `country`, `description_sv/en`).
No verification/moderation metadata is fetched — those live in
`employer_admin_meta`, which anon cannot read.

### 5. Career context
Career Family + Profession displayed as a `<dl>` grid with:
- Links back to `/jobs/family/$familyId` and
  `/jobs/profession/$professionSlug` (Phase C routes).
- A direct deep-link to the Career Center profession page
  (`/career-center/$profession`).

### 6. Related jobs
New `listRelatedPublicJobs({ excludeId, professionSlug, familyId })`
helper. Runs two RLS-backed queries (profession first, then family
fallback) and deduplicates. All returned rows are already active-published
— RLS is the sole source of truth.

### 7. Application flow
- **External URL**: opens `ExternalApplyDialog` (shadcn `AlertDialog`),
  which explicitly tells the user they are leaving CQrityjob, shows the
  destination host name, and provides Cancel / Continue actions. The
  Continue action carries `target="_blank" rel="noopener noreferrer nofollow"`.
- **Email**: renders a `mailto:` button.
- **Unavailable / invalid config**: replaced with an inline
  "not currently available" line.
- **Expired**: the entire Apply button is replaced with a destructive
  closed-state panel — there is no code path that renders a working
  Apply CTA when `isJobExpired(job)` is true.

### 8. Missing data
Every optional field is guarded before rendering. If a job has only a
title and an application URL the layout still holds — headers, bullet
lists, chips, career-context tiles, and the employer card each return
`null` when their content is empty.

### 9. Responsive layout
- Desktop: 2-column grid `[minmax(0,1fr)_300px]`, sidebar sticky.
- Tablet/mobile: collapses to a single column; sidebar drops beneath
  the article body.
- Header meta row is `flex-wrap` with `shrink-0` icons and `truncate`
  on the employer name (mobile-safe per the responsive-layout rule).

## Files changed
- `src/routes/jobs.$slug.tsx` — full rewrite of the detail page.
- `src/components/jobs/ExternalApplyDialog.tsx` — new leaving-CQrityjob
  interstitial.
- `src/lib/job-intelligence/public-queries.ts` — expanded
  `PublicEmployer` shape, added `listRelatedPublicJobs`, added
  `isJobExpired`.
- `src/routes/jobs.index.tsx` — relaxed `validateSearch` return to
  `Partial<JobSearch>` so `<Link to="/jobs">` call sites elsewhere
  (assessment result, Career Center) no longer need to supply an empty
  search object. Behaviour of the jobs discovery page is unchanged
  (empty string → omitted → identical query).
- `src/i18n/dictionaries.ts` — added `jobs.detail.*` keys for summary,
  requirement sub-sections, employer, career context, related, chips,
  and the leaving-CQrityjob dialog (Swedish + English).

## Not touched (guarded reuse)
- Phase A schema, RLS, triggers.
- Phase B admin console.
- Phase C list/family/profession routes, `JobCard`, `JobResults`.
- CIE, assessment, CIG, Career Center content.
- No new migrations, no changes to `auth-middleware`, `client.server`,
  `types.ts`, `.env`, or generated files.

## Acceptance results

| Criterion | Result |
|---|---|
| Job page complete enough for production | ✅ header + summary + responsibilities + structured requirements + benefits + employer + career context + related |
| Candidate understands the role immediately | ✅ header meta + summary at top of article column |
| Apply flow works | ✅ external (with leaving-CQrityjob dialog), email (mailto), or explicit unavailable |
| Expired jobs cannot be applied for | ✅ `isJobExpired` short-circuits the sidebar before any Apply CTA is rendered; RLS additionally hides expired jobs from anon reads |
| Related jobs work | ✅ profession-first then family fallback, dedup, RLS-scoped |
| Career Center integration works | ✅ deep-link to `/career-center/$profession` + Phase C family/profession routes |
| Responsive layout | ✅ verified 1280 desktop, 390 mobile |
| Accessibility maintained | ✅ semantic `<section>`/`<h2>`/`<dl>`, `aria-hidden` on decorative icons, `AlertDialog` provides focus trap + Esc, external links `rel="noopener noreferrer nofollow"` |
| Typecheck clean | ✅ `bunx tsgo --noEmit` exits 0 |
| Security unchanged | ✅ no schema, no policies, no server functions; only anon-visible columns are read |
| CIE regression green | ✅ `bun cie:check` — all personas pass |

## Screenshots
- `screenshots/phase-d-01-desktop.png` — full desktop detail
- `screenshots/phase-d-02-leaving-dialog.png` — external apply interstitial
- `screenshots/phase-d-03-mobile.png` — mobile detail at 390px

## Implementation notes
1. **Expired vs hidden.** Phase A's `job_is_active` predicate already
   filters expired jobs out of anon SELECT. The client-side
   `isJobExpired` guard is a *defensive* second layer for the edge case
   where the deadline crosses `now()` after the row was fetched, and it
   is what enforces "Apply must never render on an expired job".
2. **Requirements shape.** The `jobs.requirements` column is `jsonb`
   with no schema constraint, so both legacy arrays and the new
   structured shape can coexist. UI degrades gracefully in either
   direction — no migration required.
3. **`/jobs` search-param typecheck.** Making the Route's search
   fields optional was the smallest change compatible with the
   existing `<Link to="/jobs">` call sites. Existing filter behaviour
   is preserved.
4. **No new dependencies.** All UI reuses existing shadcn primitives
   (`AlertDialog`, `Button`).
