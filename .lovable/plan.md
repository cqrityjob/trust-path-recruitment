## Foundation Readiness Audit — CQrityjob Platform

Nothing has been modified. Findings below reference concrete files and lines.

### 1. Executive summary

The foundation is coherent, well-typed and largely aligned with the approved vision. The Security Career Center data model, the multidimensional matching engine, the calibration mode, the persona diversity tests, and the recently corrected `/assessment` positioning are ready to serve as the substrate for backend and authentication work.

Three product-alignment issues on the home page and one duplicated legacy data model must be cleaned up before the first backend sprint, otherwise the new "two-track assessments" positioning will be contradicted the moment a user lands on `/`.

**Verdict: B — Ready with minor corrections.** A small, scoped Sprint 06C is required before database and authentication planning; no structural rework.

### 2. What is working well

- File-based routing is clean; every content section is its own route with unique metadata and canonical + og:url.
- `src/lib/career-center/*` is a normalized, versioned, verifiable data model (`ContentStatus`, `SourceRef`, `Verifiable`) with runtime integrity checks (`integrity.ts`).
- `src/lib/career-assessment/*` isolates scoring from UI: `matching-engine.ts` reads only questions + mappings + profiles, returns a typed `EngineResult`, and is consumed by result components without leaking scoring logic.
- Confidence, gates, distinguishing coverage, mismatch penalty and unobserved-dimension handling are all in place; 11 personas + validation report keep top-1 diversity honest.
- Calibration route `/dev/career-assessment-calibration` is properly gated (`!import.meta.env.DEV → notFound()`) and `noindex,nofollow`.
- Career Center content status flows all the way into `MatchResult.professionContentStatus` so the results UI can display "in development" for placeholder professions.
- Bilingual coverage (SV/EN) is complete for visible UI copy; language is persisted in `localStorage` and hydration-safe (SSR default `sv`, client effect switches).
- MCP server is intentionally read-only over static content; security memory documents the rule that authenticated data must never be exposed through it.

### 3. Product inconsistencies (P0/P1)

- **Home page still frames the platform as a single-track "Career Assessment" product** (`src/routes/index.tsx` + `home.assessment.*`, `home.platform.*` in `src/i18n/dictionaries.ts`):
  - eyebrow "Första strategiska produkten / First strategic product",
  - a `status.in_development` chip next to the primary CTA even though the assessment is live,
  - a separate "Framtida kapacitet – Bedömningsplattform" band promising individual / group / organization reports as a future product, disconnected from the new "For individuals" vs "For organizations" split codified on `/assessment`.
- Header/footer nav label is now "Tester / Assessments" but the home hero primary CTA reads "Gör karriärbedömningen / Take the Security Career Assessment" (`cta.assessment`), and the featured-assessment section repeats "Karriärbedömning inom säkerhet". Terminology is not consistent across the site.
- `/career-center` hero CTA uses `cc.hero.cta.assessment: "Gör karriärbedömningen"`, same drift.
- `/about` pillar "Bedömning och verifiering" (`about.pillars.assessment.*`) still uses the deprecated word "Bedömning" as a public label. No mention of testing existing security personnel — the second organizational use case is invisible outside `/assessment`.
- `/employers` lists four offerings (recruit, assess, develop, verify) but does not mirror the two equal organization use cases (candidate assessment vs. existing-personnel competence testing) from `/assessment`. Prospective buyers reading `/employers` first will not see workforce testing highlighted.

### 4. UX and navigation issues

- Header nav order is sensible; no hidden journeys. Mobile menu works.
- `EntryPathCard` on `/career-center` links to `/career-center#browse` — hash anchor within the same route is acceptable.
- `professions.slice(0, 6)` for featured is arbitrary — data-model risk, not UX-critical.
- `/assessment` "Explore the solution for organizations" links to `/contact`, correctly non-operational; message chain is clean.
- Result page depends entirely on client state; a page refresh loses answers. Acceptable pre-backend.

### 5. Data-model risks

- **Duplicate profession models** — highest-priority debt:
  - `src/lib/professions.ts` (legacy, 9 items, snake_case ids `security_officer`, `close_protection`, `aml`, `police`, `datacenter`, `emergency`) is used by `src/routes/index.tsx` for the featured-careers grid.
  - `src/lib/career-center/professions/*` (canonical, 20 items, dashed slugs `security-officer`, `close-protection`, `aml-specialist`, `police-officer`, `data-center-security`, `crisis-continuity-manager`, plus researched/placeholder split) is the real model consumed by the assessment engine and career center.
  - The two sets do not agree on ids/slugs. The legacy grid papers over this by linking to `/career-center` root instead of individual slugs. Any migration to a database must consolidate on `career-center/*`.
- **`src/lib/assessment-content.ts` `careerMatches`** is dead legacy content (hardcoded 92/87/78% scores). Only `questions`, `pickText`, `pickList` are still used. Remove `careerMatches` and its types before backend to avoid confusion.
- Career paths, education and certifications are typed but sparsely populated in `researched.ts` / `placeholders.ts`; the shape is DB-migratable (surrogate string IDs, foreign-key style references, `Verifiable` metadata). Integrity checker already catches orphan references — good.
- Icons live in a registry (`icon-registry.ts`) rather than hard-coded — good.
- Region scope (`Region = "SE" | "NORDICS" | ...`) is present but only SE data is written. Ready for international scaling; no schema change required to add more.
- No `updatedAt`/`version` per record; add before pushing content into a DB.

### 6. Assessment-model risks

- Scoring is fully isolated from UI (`matching-engine.ts`, `profession-profiles.ts`, `question-mappings.ts`, `dimensions.ts`). Deterministic for given answers.
- Unanswered dimensions are correctly treated as *unobserved*, not neutral evidence; `evidenceScale` dampens under-supported matches; gate failure caps raw similarity.
- Placeholder professions (`status: "placeholder"` in both the profile and the Career Center record) flow through `MatchResult.professionContentStatus`; UI shows a "developing" notice.
- Confidence levels ("limited/moderate/stronger") and reasons are bilingual and deterministic; displayed match is capped per confidence level so results are never over-sold.
- Persona test set is 11 with mixed profiles including an "incomplete" persona and a "conflicting" persona — a `security-manager` domination guard is enforced by `disallowedTop`.

Classification of readiness by profession:
- **Technically stable & suitable for pilot**: security-officer, ordningsvakt, skyddsvakt, security-manager, security-technician, risk-manager, aml-specialist, data-center-security, crisis-continuity-manager, close-protection.
- **Requires subject-matter calibration**: security-coordinator, security-consultant, security-investigator, intelligence-analyst, fraud-investigator, soc-analyst, plus police-officer, military-security-specialist, correctional-officer, customs-officer (all `status: "placeholder"`).
- **Requires research validation before public claims**: any percentage messaging in `careerMatches` (legacy dead), and any regulated-role legal claim (currently only expressed as guidance).

Not-yet-versioned: the engine settings (`gateThreshold`, `mismatchPenalty`, caps) and the target-profile snapshot are not tagged with a version string. Add `MODEL_VERSION` / `DISCLAIMER_VERSION` constants before storing results in a database.

### 7. i18n issues

- Full SV/EN coverage for visible UI. No hardcoded visible strings found in components (spot-checked home, assessment, employers, contact, about, career-center).
- **Metadata is English-only.** Every `head()` returns fixed English titles/descriptions because `head()` cannot read the React `useT` context. Search engines and social previews therefore always see English content for a Swedish-default site. Acceptable pre-launch; must be resolved before WordPress migration (options: per-locale routes `/sv/...` `/en/...`, or a lightweight lang-in-storage fallback resolved through cookies at SSR).
- No URL-based locale routing yet. Deciding this before adding new content pages is cheaper than retrofitting.
- Language persistence: `localStorage["cqrityjob.lang"]`, correctly gated for SSR.
- Terminology drift: "Bedömning" still appears in `home.assessment.*`, `home.platform.title`, `about.pillars.assessment.title`, `cc.hero.cta.assessment`, `cta.assessment`. Consolidating on "Tester / Assessments" needs a one-pass sweep of `dictionaries.ts`.

### 8. SEO and migration gaps

- `src/routes/__root.tsx` sets `og:image`, `og:title`, `og:description` sitewide. Per `head-meta` guidance, a root `og:image` overrides every leaf's `og:image`; this must be moved to leaf routes only. The current root og:image is a Lovable preview screenshot URL — a placeholder that reads worse than no image.
- Canonical/og:url use relative paths (`"/"`, `"/about"`, ...). Domain `https://trust-path-recruitment.lovable.app` is known; make canonical/og:url absolute before public launch.
- `/career-center/$profession` `head()` hardcodes `p.titleEn` / `p.description.en` regardless of user language.
- No `public/sitemap.xml`, no `public/robots.txt`. Only `favicon.ico`.
- Only one JSON-LD (root `/`, Organization). Add `WebSite` sitewide, `BreadcrumbList` on profession pages, and `FAQPage` on `/assessment` (has clear Q&A structure) and profession pages that carry `faqs`.
- No structured migration inventory yet. Before moving `www.cqrityjob.com` off WordPress the following are required and currently missing: old URL inventory, 301 redirect map, content migration path, sitemap generator route, robots.txt, Google Search Console verification, legal pages (Privacy, Terms, Cookies), analytics decision, DNS/domain cutover plan.

### 9. Security and privacy risks

- No accidental PII collection: contact form is inert with an explicit preview notice and no network call.
- Only two client storages used: `localStorage["cqrityjob.lang"]` (i18n) and a shadcn sidebar preference cookie (`sidebar_state`). Neither is PII.
- No hidden fetches, no third-party analytics, no external scripts beyond Google Fonts.
- Dev calibration route is server-gated on `import.meta.env.DEV` and served `noindex,nofollow` — it will not appear on published builds.
- MCP endpoints (`/mcp`, `/.mcp/list-tools`, `/.mcp/invoke-tool/$tool`, `/.well-known/oauth-protected-resource`) are public and unauthenticated. Currently correct — they expose only static career-assessment content already visible on the site. The moment user accounts, results storage or per-user data exist, the MCP surface must be switched to Supabase OAuth *before* it goes live in the same build. Security memory already codifies this rule.
- No profile boundary yet between "individual guidance" and "organization workforce testing" — will require row-level policy design when the DB lands (organization membership, per-organization data separation, seat visibility).

### 10. Technical-debt register

**P0 — fix before backend**
1. Remove legacy `src/lib/professions.ts` and switch `src/routes/index.tsx` featured grid to the canonical Career Center list (`researched` subset). Eliminates ID drift and the risk of DB migration cementing two profession identifiers.
2. Delete unused `careerMatches` from `src/lib/assessment-content.ts` (leave `questions`, `pickText`, `pickList`).
3. Rewrite the home-page assessment section (`home.assessment.*`, `home.platform.*` copy and the `status.in_development` chip in `src/routes/index.tsx`) so the sitewide framing matches `/assessment` (two-track assessments; career test is live; organization solution in development).

**P1 — fix before launch**
4. Sweep `dictionaries.ts` to standardize the public label from "Bedömning / Career Assessment" to "Tester / Assessments"; retain "Bedömning" only where it accurately means "assessment activity" in Swedish body copy.
5. Mirror the two organization use cases (candidate assessment + existing-personnel competence testing) in `/employers` and in `about.pillars.assessment.*`.
6. Move `og:image` off `__root.tsx`; add per-leaf `og:image` only where a real cover exists, omit otherwise.
7. Localize `head()` metadata (SV/EN) and localize `/career-center/$profession` title/description via `p.description.sv` / `titleSv` when the visitor language is `sv`.
8. Add `public/robots.txt` and a `src/routes/sitemap[.]xml.ts` server route that reflects `FileRoutesByTo` + Career Center slugs.
9. Add absolute canonical/og:url values using `https://trust-path-recruitment.lovable.app` (or the target production domain once decided).
10. Add `MODEL_VERSION` and `DISCLAIMER_VERSION` constants to `src/lib/career-assessment/index.ts` so future stored results carry a version tag.
11. Add missing legal pages (Privacy, Terms, Cookies) even as placeholders before touching auth.

**P2 — may wait**
12. Add `WebSite`/`BreadcrumbList`/`FAQPage` JSON-LD.
13. Decide URL-locale strategy (`/sv/...` vs cookie-based SSR) before pushing more localized content.
14. Add `updatedAt` and record-level `version` to Career Center entities to make future incremental sync cheap.
15. Introduce a curated `featured` list in Career Center instead of `.slice(0, 6)`.

### 11. Proposed Sprint 06C — Foundation cleanup (scope only, no code changes yet)

Non-negotiable before backend planning starts:

1. **Consolidate profession model** — delete `src/lib/professions.ts`, migrate `src/routes/index.tsx` featured grid to `career-center` professions (`status === "researched"`, linked to real slugs).
2. **Remove dead code** — drop `careerMatches` from `src/lib/assessment-content.ts`.
3. **Home page realignment** — rewrite `home.assessment.*` and `home.platform.*` copy and the surrounding JSX in `src/routes/index.tsx` so the primary framing is two-track ("free career guidance for individuals; role-based competence assessments for organizations, including testing existing personnel"); remove the "in development" chip from the individual-assessment CTA; move the "future capability" narrative to a single organization-solution band.
4. **Terminology sweep** — one-pass rename of user-visible "Bedömning / Career Assessment" labels to "Tester / Assessments" in `dictionaries.ts` and in the `/career-center` and `/about` copy.
5. **`/employers` mirror** — add explicit "Candidate assessment" and "Existing-personnel competence testing" cards with equal prominence; keep responsible-use disclaimer.
6. **SEO scaffolding** — move `og:image` off `__root.tsx`, add `robots.txt`, add `sitemap.xml` server route, and switch canonical/og:url to absolute URLs.
7. **Metadata localization** — either SSR-aware SV/EN metadata or a documented decision to defer until URL-locale strategy is chosen.
8. **Versioning** — add `MODEL_VERSION`, `DISCLAIMER_VERSION`.

Explicitly out of scope for 06C: backend, database, authentication, AI, analytics, employer dashboards, jobs data, WordPress migration execution.

Acceptance:
- All Career Center integrity checks and all 11 assessment personas still pass with zero validation errors.
- No `home.assessment.*` copy contradicts `/assessment` copy.
- Only one profession model in the codebase.
- SEO scan shows unique per-route canonical + no root-inherited `og:image` overriding leaves.

### 12. Final readiness decision

**B — Ready with minor corrections.** Ship Sprint 06C (above) as a small correction sprint. Immediately after 06C is approved, the platform is safe to begin backend architecture and authentication planning on the current data model.

---

If this audit and Sprint 06C scope are approved, switch to build mode to implement Sprint 06C.
