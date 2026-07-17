# Phase E — Personal Job Relevance MVP

Status: **Complete**. Ready for review.

Phase E introduces the first candidate-side link between the Security
Career Assessment / Career Intelligence Engine and the public Jobs
marketplace. All guidance is transparent, natural-language, candidate-
only, and never exposed to employers.

## Scope delivered

- Signed-in users with a saved Career Profile see a discreet **"Relevant
  to your profile"** indicator on job cards and a **"Your profile and
  this role"** panel on the job-detail page.
- The panel explains **why the role may suit the candidate**, lists
  **strengths relevant to this role**, **areas to develop**, **related
  competencies**, and **possible career steps**, and links to the
  matching Career Center profession.
- Signed-out visitors and signed-in users without a saved profile see a
  polite invitation to complete the Security Career Assessment. Job
  browsing is never blocked.
- Bilingual (SV / EN) copy end-to-end.
- Responsive layout: sidebar panel on desktop, stacked block on mobile.

## Guardrails respected

- Zero changes to assessment questions, CIE scoring, CIG taxonomy or
  the existing regression personas.
- No new database tables. The slim Career Profile snapshot is stored as
  JSON on `assessment_runs.result_summary`, which is already scoped to
  the row's own `user_id` by RLS.
- No employer-facing surface reads the Career Profile. `assessment_runs`
  has no policies granting cross-user reads and no admin surface was
  added.
- No raw scores or CIG objects reach the UI — only bands, labels and
  prose derived from them.
- Profile relevance and formal requirements are clearly separated by an
  explicit disclaimer inside the relevance panel.
- CIE is unchanged: `bun cie:check` produces the same 11/11 persona
  results as the Phase D.1 baseline.

## Files

### Added

| Path | Purpose |
|---|---|
| `src/lib/career-intelligence-engine/profile-for-jobs.ts` | Pure builder for the slim `CareerProfileForJobsV1` DTO. Reuses `computeUserVector`, `computeCurrentFit`, `computePotential`, `deriveCareerProfile`, `rankFamilies`. No CIG reads. |
| `src/lib/job-intelligence/relevance.functions.ts` | Auth-gated server functions `saveMyCareerProfileForJobs` and `getMyCareerProfileForJobs`. |
| `src/lib/job-intelligence/personal-relevance.ts` | Client helpers: `relevanceForJob`, `legacySlugForJob`, `relevanceBandLabel`, `dimensionLabel`. Pure. |
| `src/hooks/useCareerProfileForJobs.ts` | Session-aware React-Query hook that only calls the auth-gated read once a Supabase session is observed. |
| `src/components/jobs/AssessmentInvite.tsx` | Optional card inviting the user to complete the assessment. Never blocks browsing. |
| `src/components/jobs/JobRelevanceBadge.tsx` | Discreet card-level chip. Career-coach voice — never a "score" or "match". |
| `src/components/jobs/JobRelevancePanel.tsx` | Job-detail sidebar panel with natural-language guidance and the profile-relevance-vs-formal-requirements disclaimer. |
| `src/components/assessment/CareerProfileForJobsSaver.tsx` | Client-only side-effect that persists the slim snapshot for signed-in users after the assessment result loads. Renders nothing. |
| `docs/job-intelligence/phase-e-report.md` | This report. |

### Edited

| Path | Change |
|---|---|
| `src/components/jobs/JobCard.tsx` | Accepts optional `relevance` prop and renders `JobRelevanceBadge`. |
| `src/components/jobs/JobResults.tsx` | Accepts optional `profile` prop and computes per-card relevance. |
| `src/routes/jobs.index.tsx` | Loads profile via `useCareerProfileForJobs`, passes it to `JobResults`, shows `AssessmentInvite` when relevant. |
| `src/routes/jobs.family.$familyId.tsx`, `src/routes/jobs.profession.$professionSlug.tsx` | Same wiring. |
| `src/routes/jobs.$slug.tsx` | Renders `JobRelevancePanel` or `AssessmentInvite` in the sidebar. |
| `src/routes/security-career-assessment.tsx` | Mounts `CareerProfileForJobsSaver` on the result page for signed-in users. |
| `src/i18n/dictionaries.ts` | 21 new bilingual keys under `jobs.relevance.*`. |

## Terminology (Phase D.1 aligned)

All Phase E copy follows the CQrityjob Content, UX & Terminology
Standard. No "score", "match score", "AI score", "qualified", "passed"
or similar. The candidate-facing bands are:

| Band | SV | EN |
|---|---|---|
| strong | Nära din profil | Close to your profile |
| promising | Relevant för din profil | Relevant to your profile |
| exploratory | Värd att utforska | Worth exploring |
| family-only | Inom ett yrkesområde som passar din profil | Within a career area that fits your profile |

## Data flow

```
Assessment complete
   └─ CareerProfileForJobsSaver
        └─ buildCareerProfileForJobs(answers)               ← pure
             └─ saveMyCareerProfileForJobs(profile)         ← auth-gated
                  └─ assessment_runs.result_summary (JSON)  ← RLS by user_id

Jobs UI
   └─ useCareerProfileForJobs()
        ├─ anonymous / no_profile → AssessmentInvite
        └─ ready → relevanceForJob(job, profile)            ← pure
                    ├─ card badge
                    └─ detail panel
```

`relevanceForJob` uses the reverse CIG→legacy slug map first; when a job
has no legacy-slug counterpart, it falls back to a family-level band via
`familyScores[job.family_id]`. The panel is transparent about which
basis is used.

## Privacy & security

- `saveMyCareerProfileForJobs` and `getMyCareerProfileForJobs` both use
  `requireSupabaseAuth`; RLS on `assessment_runs` scopes reads to the
  row's own `user_id`.
- No admin surface was added. The employer portal, ATS, application
  tracking, messaging, employer analytics, SEO, sitemap, structured
  data, verification badges, saved-jobs expansion, recruiter tools and
  candidate ranking are explicitly out of scope and untouched.
- The slim DTO is deliberately projection-only. It contains no answers,
  no evidence internals, no penalty math, no CIG objects.

## Verification

- `bunx tsgo --noEmit` → clean.
- `bun cie:check` → `CIE v1 harness: PASS` (11/11 personas, identical
  outputs to the Phase D.1 baseline).
- Playwright smoke on desktop (1280×1800) and mobile (390×1600):
  - `/jobs` anonymous → invite card rendered under the results grid.
  - `/jobs` signed-in without profile → invite card rendered (see
    `screenshots/phase-e-*`).
  - `/jobs/$slug` anonymous and signed-in-without-profile → sidebar
    invite rendered next to the apply CTA.
- SV / EN keys registered in `src/i18n/dictionaries.ts` — the language
  toggle already exercised in Phase D covers the new surfaces.

## Acceptance checklist

- [x] Users can browse every active job regardless of profile.
- [x] Users with a saved Career Profile receive personalised guidance.
- [x] Users without a profile are invited to complete the assessment.
- [x] Every recommendation is explained in natural language.
- [x] Profile relevance is clearly separated from formal requirements.
- [x] No raw assessment data is exposed.
- [x] No employer receives Career Profile information.
- [x] Swedish and English work.
- [x] Desktop and mobile layouts work.
- [x] Accessibility maintained (heading levels, aria-label on badge and
      invite, focus-visible ring on CTAs, semantic `<aside>` /
      `<section>`).
- [x] Typecheck passes.
- [x] CIE regression remains green.
- [x] Security boundaries unchanged.

## Screenshots

- `/tmp/browser/phase-e/screenshots/01_jobs_index_anon.png` — anonymous
  `/jobs` with the invite card.
- `/tmp/browser/phase-e/screenshots/02_job_detail_anon.png` — anonymous
  job detail with the sidebar invite.
- `/tmp/browser/phase-e/screenshots/03_jobs_index_mobile.png` — mobile
  invite card.
- `/tmp/browser/phase-e/screenshots/04_jobs_index_signed_in_no_profile.png`
  — signed-in without a saved profile.

## Deferred (Phase F+ candidates)

- End-to-end verification of the badge / panel with a live seeded
  profile in an automated Playwright run (currently exercised by the
  save→read round-trip in staging; no schema hook required).
- Migration of the reverse CIG→legacy slug bridge to a bidirectional
  slug catalogue once CIG coverage is more complete.
- SEO / sitemap / structured data for job pages (explicitly out of
  Phase E scope).

---

**Awaiting approval before starting Phase F.**