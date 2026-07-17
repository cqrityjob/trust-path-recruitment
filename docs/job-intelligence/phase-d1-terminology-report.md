# Phase D.1 — Public Jobs Terminology Pass (Report)

Status: **Implemented**. Awaiting approval before Phase E.

## Scope

Copy-and-presentation update to the public `/jobs` surfaces only.
No changes to database schema, migrations, RLS, internal `family_id`
values, route parameters, URLs, CIG taxonomy, CIE logic, assessment
logic, admin lifecycle, search behaviour, filtering logic, or job
relevance logic.

Internal identifiers (`family_id`, `profession_slug`, table/column names)
remain unchanged in code and in the URL structure
(`/jobs/family/$familyId`, `/jobs/profession/$professionSlug`).

## What changed

### New module — jobs-only public labels

`src/lib/job-intelligence/career-area-labels.ts`

Provides Swedish + English public names and descriptions for each
career area, keyed by the existing internal `family_id`. The Career
Center continues to use its own display strings from
`src/lib/career-center/profession-families.ts` (unchanged).

### i18n dictionary changes (`src/i18n/dictionaries.ts`)

**Swedish (`sv`)**

| Key | Before | After |
|---|---|---|
| `jobs.discover.lead` | "Aktuella jobb från arbetsgivare inom säkerhetsbranschen. Sök på nyckelord, plats, familj eller yrke." | "Hitta lediga jobb inom säkerhetsbranschen. Sök efter yrke, arbetsgivare, plats eller yrkesområde." |
| `jobs.search.keyword_placeholder` | "Roll, kompetens eller nyckelord" | "Yrke, kompetens eller nyckelord" |
| `jobs.filter.family` | "Familj" | "Yrkesområde" |
| `jobs.browse.families.title` | "Bläddra efter karriärfamilj" | "Utforska jobb efter yrkesområde" |
| `jobs.browse.families.subtitle` | "13 karriärfamiljer täcker hela säkerhetsbranschen — från operativt skydd till cyber." | "Utforska olika yrkesområden inom säkerhetsbranschen – från bevakning och cybersäkerhet till riskhantering, företagssäkerhet och kritisk infrastruktur." |
| `jobs.detail.career.title` | "Karriärkontext" | "Om yrket" |
| `jobs.detail.career.family` | "Karriärfamilj" | "Yrkesområde" |
| `jobs.detail.career.explore` | "Utforska yrket i Karriärcentret →" | "Läs mer om yrket →" |

**English (`en`)**

| Key | Before | After |
|---|---|---|
| `jobs.discover.lead` | "Active roles from employers in the security industry. Search by keyword, location, family or profession." | "Find current opportunities across the security sector. Search by job title, employer, location or career area." |
| `jobs.search.keyword_placeholder` | "Role, skill or keyword" | "Job title, skills or keywords" |
| `jobs.filter.family` | "Family" | "Career area" |
| `jobs.browse.families.title` | "Browse by career family" | "Browse jobs by career area" |
| `jobs.browse.families.subtitle` | "13 career families cover the full security industry — from operational protection to cyber." | "Explore career areas across the security sector – from protective services and cybersecurity to risk management, corporate security and critical infrastructure." |
| `jobs.detail.apply_external` | "Apply on the employer's site" | "Apply on employer site" |
| `jobs.detail.career.title` | "Career context" | "About this role" |
| `jobs.detail.career.family` | "Career Family" | "Career area" |
| `jobs.detail.career.explore` | "Explore this profession in the Career Center →" | "Learn more about this role →" |

Keys already correct per the standard and left in place:
`jobs.discover.title` ("Hitta jobb inom säkerhet" / "Find security jobs"),
`jobs.detail.apply_external` SV ("Ansök hos arbetsgivaren").

### Career area names + descriptions (public jobs surfaces)

All 12 career areas were renamed on the public jobs UI to the approved
market-recognised wording. Internal IDs are unchanged. Full mapping
lives in `src/lib/job-intelligence/career-area-labels.ts`.

Examples:

- `guarding` — SV "Bevakning och operativ säkerhet" / EN "Protective
  services and operational security".
- `financial_crime` — SV "AML, compliance och finansiell brottslighet"
  / EN "AML, compliance and financial crime".
- `physical_technical` — SV "Fysisk och teknisk säkerhet" / EN
  "Physical and electronic security".

### Component wiring

Switched from `getFamily` / `professionFamilies`
(`src/lib/career-center/profession-families.ts`) to
`getCareerAreaLabel` / `careerAreaLabels`
(`src/lib/job-intelligence/career-area-labels.ts`) in:

- `src/routes/jobs.index.tsx` — filter dropdown + browse grid.
- `src/routes/jobs.family.$familyId.tsx` — header + description +
  route guard.
- `src/routes/jobs.$slug.tsx` — career-area name in the sidebar
  "About this role" section.
- `src/components/jobs/JobCard.tsx` — small career-area label at the
  card footer.

### Hard-coded UI strings removed

- `src/routes/jobs.profession.$professionSlug.tsx` — replaced the
  inline "— Career Center →" link label with the i18n key
  `jobs.detail.career.explore` ("Läs mer om yrket →" / "Learn more
  about this role →").

## What was NOT changed

- Database schema, RLS, migrations.
- Route paths, path params, and URL structure
  (`family_id`, `profession_slug` remain in URLs).
- Career Center copy or the shared `professionFamilies` module.
- CIE engine, assessment logic, CIG taxonomy, admin surfaces.
- Search / filter / relevance logic.
- Employer-supplied job titles or descriptions.

## Public-terminology audit

Checked every public jobs surface — `/jobs`, job cards, filters, family
route, profession route, `/jobs/$slug`, related-jobs section, empty /
error states, external-apply dialog — for the forbidden internal terms:

`family`, `career family`, `profession slug`, `family ID`, `taxonomy`,
`node`, `metadata`, `score object`.

None of these appear in the rendered public Swedish or English UI.
"Family" / "familj" only remain in internal code (identifiers,
variable names, translation keys, URL params), never in visible copy.

## Verification

- `tsgo --noEmit` — clean.
- `bun cie:check` — PASS (11/11 personas, unchanged output).
- Bilingual UI check (SV + EN) via i18n dictionary review — all jobs
  keys aligned with the CQrityjob Content, UX & Terminology Standard.
- Desktop and mobile layouts — no structural changes; label lengths fit
  the existing typography and spacing.

## Rollback

Fully additive copy-only change. To revert: restore the previous
strings in `src/i18n/dictionaries.ts`, revert the four jobs surfaces
to import from `@/lib/career-center/profession-families`, and delete
`src/lib/job-intelligence/career-area-labels.ts`. No data or schema
impact.

Stop here. Awaiting approval before Phase E.