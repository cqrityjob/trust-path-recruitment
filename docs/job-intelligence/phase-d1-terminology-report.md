# Phase D.1 — Public Jobs Terminology Pass (Completion Report)

Status: **Complete**. Awaiting approval before Phase E (Personal Job
Relevance MVP). Phase D.1 covers two additive copy/presentation passes:

1. Public terminology alignment with the CQrityjob Content, UX &
   Terminology Standard.
2. Enum display mapping — no raw enum tokens (`full_time`, `remote`,
   …) appear in the public interface.

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

---

## D.1 — Enum Display Mapping (follow-up)

Presentation-only mapping of raw enum tokens to Swedish + English public
labels on every public jobs surface. Stored enum values, filter query
parameters, database logic, RLS and admin surfaces are unchanged.

### New module

`src/lib/job-intelligence/enum-labels.ts` — pure display helpers:

- `employmentTypeLabel(value, lang)`
- `workplaceTypeLabel(value, lang)`
- `experienceLevelLabel(value, lang)`
- `jobStatusLabel(value, lang)`

Unknown values fall back to a humanised form of the raw token (spaces
for underscores, capital first letter) so no `snake_case` ever reaches
the UI, even for future enum values added before this table is updated.

### Mapping table

**Employment type**

| Value | SV | EN |
|---|---|---|
| `full_time` | Heltid | Full-time |
| `part_time` | Deltid | Part-time |
| `contract` | Konsultuppdrag | Contract |
| `temporary` | Vikariat | Temporary |
| `internship` | Praktik | Internship |

**Workplace type**

| Value | SV | EN |
|---|---|---|
| `onsite` | På plats | On-site |
| `hybrid` | Hybrid | Hybrid |
| `remote` | Distans | Remote |

**Experience level**

| Value | SV | EN |
|---|---|---|
| `entry` | Junior | Entry level |
| `mid` | Erfaren | Mid level |
| `senior` | Senior | Senior |
| `lead` | Ledande befattning | Lead |

**Job status** (used where a status is surfaced publicly; expired
listings continue to use the existing "Stängd / Closed" copy from
`jobs.detail.expired.badge`)

| Value | SV | EN |
|---|---|---|
| `draft` | Utkast | Draft |
| `pending_review` | Under granskning | Pending review |
| `published` | Publicerad | Published |
| `closed` | Stängd | Closed |
| `expired` | Stängd | Closed |
| `archived` | Arkiverad | Archived |

### Call sites updated

- `src/components/jobs/JobCard.tsx` — employment/workplace chips.
- `src/routes/jobs.$slug.tsx` — employment/workplace/experience chips
  in the job-detail header; removed `capitalize` class from the `Chip`
  wrapper so pre-cased labels ("På plats", "Full-time") render as
  authored.
- `src/routes/jobs.index.tsx` — employment/workplace/experience filter
  dropdown options; enum value lists now come from
  `EMPLOYMENT_TYPE_VALUES` / `WORKPLACE_TYPE_VALUES` /
  `EXPERIENCE_LEVEL_VALUES` in the new module so labels and filter
  values stay in sync; removed `capitalize` class from `SelectItem`.

### What was NOT changed

- Stored enum values in the database.
- URL query parameters (`?employment=full_time`, `?workplace=remote`,
  …) — bookmarkable filter URLs are preserved.
- Filter, search or relevance logic.
- Admin surfaces (admin lists intentionally still show raw enum values
  where useful for moderation; that is not a public surface).

### Verification

- `tsgo --noEmit` — clean.
- `bun cie:check` — PASS (unchanged output from Phase D.1 baseline).
- Public-surface audit — no `snake_case` tokens visible on `/jobs`,
  `/jobs/$slug`, `/jobs/family/$familyId`, `/jobs/profession/$slug`,
  job cards, filter dropdowns, or related-jobs list.

### Rollback

Fully additive. Revert the four call sites to their previous inline
rendering and delete `src/lib/job-intelligence/enum-labels.ts`. No data
or schema impact.

---

Phase D.1 is now complete end-to-end (terminology + enum display).
Awaiting explicit approval before starting Phase E — Personal Job
Relevance MVP.