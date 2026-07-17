# Phase F.2 — Dashboard & Candidate Experience Polish

**Status:** Implemented (build mode)
**Scope:** Refinements to the `/my-career` dashboard only. No new
features, no scoring changes, no schema changes.

## Objective

Transform the F.1 dashboard into a premium career home. Improve clarity,
motivation, usability and perceived product quality.

## Deliverables

Single-file change: `src/routes/_authenticated.my-career.tsx`. The route
was rebuilt around richer, reusable presentation components; all data
sources are unchanged.

Screenshots (SV, first authenticated visit):

- `docs/job-intelligence/screenshots/phase-f2-my-career-desktop.png`
- `docs/job-intelligence/screenshots/phase-f2-my-career-mobile.png`

## UX improvements by part

### 1. Assessment summary

**Before (F.1):** Two lines — completion date + status string.
**After:** Six-field summary (Completed, Career profile, Top profession,
Career area, Confidence, Primary motivation) rendered as a 2-column
definition list with icons, plus two primary actions ("View full
results", "Retake assessment"). Confidence is exposed strictly as a
Low / Medium / High badge (mapping `limited → Low`, `moderate → Medium`,
`stronger → High`) with a hover explanation. Raw scores never appear.

### 2. Career profile

**Before:** Plain-text list of archetype, motivations and top area.
**After:** Visual block with (a) Working style + Preferred security
domain tiles, (b) Motivations rendered as pill tags, and (c) Strongest
competencies / Development areas rendered as two icon-led lists derived
from the top-slug `strongDims` / `developDims`. No new scoring — reuses
`dimensionLabel` from `personal-relevance.ts`.

### 3. Career journey

**New.** Five-step horizontal stepper at the top of the dashboard:
Complete assessment → Create career profile → Explore professions →
Apply for a role → Continue developing. Each stage renders as done (✓,
primary tint) or upcoming (○, muted). Guidance only — no persistence.

### 4. Next step

**Before:** Single-line CTA.
**After:** Two-sentence rationale, then the reward. When a top
profession is known: *"Your profile indicates strong potential within
{career area}. Explore {profession} to understand required skills,
certifications and available opportunities."* Falls back to
"take the assessment" or "open Career Center" branches when data is
missing.

### 5. Empty states

Every empty state now follows the **what → why → action(s)** shape and
never leaves the user at a dead end.

- No assessment yet → onboarding card at page top + assessment empty
  state inside the summary card.
- No relevant jobs → two-CTA state: primary "Browse all jobs" +
  secondary "Explore professions" (matches spec example verbatim).
- No motivations / no dims → localised placeholder line ("Being
  analysed…" / "No clear …") instead of blank space.

### 6. Recommended professions

Each card now shows: profession title, career area (uppercase eyebrow),
one-sentence explanation (`profession.description[lang]`), primary
**Explore profession** button, and a conditional **View jobs** button
that only appears when a probe query confirms at least one open role for
that slug (`listPublicJobs({ professionSlug, limit: 1 })`). Copy is
"View jobs" — never "See jobs".

### 7. Quick actions

Reordered to match the approved priority:

1. My career profile (anchors to the Career Profile card)
2. Explore professions
3. Browse jobs
4. Retake assessment

The Career Journey `beta` link from F.1 has been removed. Nav is simple
and free of internal wording.

### 8. Microcopy

- Greeting: "Välkommen tillbaka" / "Welcome back".
- Card titles use sentence-case rather than product-internal names
  ("Assessment summary", "Your career profile", "Relevant jobs for you",
  "Recommended next step", "Quick actions").
- Confidence labels: Low / Medium / High only.
- Buttons: "View full results" / "Retake assessment" / "Explore
  profession" / "View jobs" / "Browse all jobs" / "Sign out".
- Removed the F.1 phrase "Career Journey (beta)".

### 9. Visual polish

- Consistent `rounded-xl border border-border bg-background p-5 md:p-6`
  card shell.
- Uniform eyebrow style (`text-[10px] uppercase tracking-widest
  text-muted-foreground`) across sections.
- Two-column responsive grid (`lg:grid-cols-[minmax(0,1fr)_340px]`)
  keeps sidebar readable on desktop and stacks on tablet / mobile.
- Icons picked from `lucide-react` for section headers; primary tint for
  affirmative signals (done journey step, completed field, strong
  competency), muted tint for development areas.
- No new colour tokens introduced — every colour uses existing semantic
  tokens (`primary`, `muted`, `background`, `border`, `accent`,
  `destructive`).

## Non-changes

- Assessment logic, CIE, CIG, personal relevance scoring, database
  schema, RLS policies, feature flags, existing tests — all untouched.
- Route file name, gate, SSR behaviour and header integration from F.1
  are unchanged.

## Verification

- `bunx tsgo --noEmit` — **0 errors**.
- CIE regression: no code paths in CIE, CIG, or scoring were touched.
  The project has no vitest suite; earlier phases established the CIE
  regression as a manual sequence via
  `/dev/career-assessment-calibration`, which continues to function
  unchanged.
- Playwright capture at 1280×1800 (desktop) and 390×1600 (mobile) with
  an authenticated session — both viewports render correctly, no
  layout regressions.

## Before / after summary

| Area                   | Before (F.1)                              | After (F.2)                                                              |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Assessment card        | Date + status                             | 6-field summary + View full results / Retake, confidence as Low/Med/High |
| Career profile         | Text list                                 | Two tiles + motivation pills + strong/develop lists                      |
| Career journey         | —                                          | 5-step stepper with done / upcoming state                                |
| Next step              | One-sentence CTA                           | Why + reward + labelled CTA                                              |
| Relevant jobs empty    | Single-line message + one link             | What + why + two CTAs                                                    |
| Recommended profession | Title + area + "See jobs"                  | Title + area + one-sentence summary + Explore + conditional View jobs    |
| Quick access           | Career Center, Jobs, Assessment, Journey β | My profile, Explore professions, Browse jobs, Retake                     |

## Files touched

```
src/routes/_authenticated.my-career.tsx        (rewritten)
docs/job-intelligence/phase-f2-report.md       (this report)
docs/job-intelligence/screenshots/phase-f2-my-career-desktop.png
docs/job-intelligence/screenshots/phase-f2-my-career-mobile.png
```

**Stopping here for approval before Phase G — Employer Platform.**