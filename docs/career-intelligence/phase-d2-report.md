# Phase D.2 — Candidate Experience Polish — Implementation Report

## Scope

UX / content / presentation sprint. No changes to the assessment
questions, mappings, dimensions, scoring, engine layers, profession
target vectors, family ranking, slug map, database schema, RLS or CIG
architecture.

## Completed changes

### New

- `src/components/assessment/result/labels.ts` — deterministic bilingual
  helpers used across the result view:
  - `careerProfileLabel(profile)` — maps the top archetype to a Career
    Profile label + blurb (e.g. "Analytisk säkerhetsspecialist" /
    "Analytical Security Specialist"), presented as a guiding profile,
    never as a psychological type.
  - `matchStrengthBand(currentFit, confidence)` + `matchStrengthLabel`
    — plain-language bands (Very strong match / Strong match / Relevant
    match / Possible direction / Limited evidence).
  - `confidenceLabelBi`, `levelLabel`, `regulatedLabel`, `scoreTooltips`
    (bilingual help text for Current Fit / Potential / Confidence /
    Evidence).
  - `backgroundOptions` (six candidate backgrounds) and
    `buildActionPlan(match, background)` — deterministic 3-horizon
    action plan (Begin now / Next 3–12 months / Long-term direction).
  - `dimensionBand` / `dimensionBandLabel` — distinguishes observed
    prominent / moderate / develop from insufficient evidence.
  - `emptyEducationCopy`, `emptyCertificationsCopy`,
    `methodologyBullets`.
- `docs/career-intelligence/phase-d2-report.md` — this report.

### Replaced

- `src/components/assessment/result/engine-view.tsx` — full rewrite of
  the engine-driven result view. Same public API
  (`<EngineResultView result lang onRetake />`) and same server data
  (`EngineResultV1`). New composition:

  1. Hero — heading kept ("Din möjliga väg inom säkerhet" /
     "Your possible path in security"), Career Profile label chip with
     blurb, top-profession card with match-strength band label +
     tooltip-carrying scores, guidance disclaimer.
  2. Why this result — three strongest contributing dimensions (dedup'd
     against reasons), contextual explanations filtered to a neutral
     subset (`profile_archetype`, `family_rationale`,
     `current_vs_potential`, gate + regulated notices), then a "where
     evidence is weaker" section that explicitly disclaims judgement.
  3. Broader Career Profile — top archetypes + motivations + working
     style dials (each with an accessible expandable help affordance).
  4. Career Family — description, aggregate Current Fit / Potential,
     top-profession-in-family, adjacent families, deep link to Career
     Center.
  5. Comparison — side-by-side cards for the top three matches: title,
     family, match-strength band label, level, regulated tag, Current
     Fit / Potential, "why it may fit" chips, typical environments (from
     `getProfession(...)`), formal-requirements availability signal,
     possible next role, link to profession guide.
  6. Strengths & development — two columns; strengths from observed
     dimensions only; development uses "Områden att utforska vidare" /
     "Areas to explore further" and "Ytterligare erfarenhet kan stärka
     din profil" / "Additional experience may strengthen your profile".
  7. Guiding profile — archetype bars grouped by band (Prominent /
     Moderate / Areas to explore further); dedup by construction.
  8. Formal requirements — regulated disclaimer preserved, legal vs
     employer badges, empty-state points to the profession guide.
  9. Education & Certifications — compact empty state with the required
     Swedish/English "vi kompletterar löpande" / "we are continuously
     expanding" copy and a link to the profession guide; no fabricated
     providers.
  10. Related & Transitions — hidden when both are empty; otherwise
      compact "being expanded" copy.
  11. Career action plan — three horizons, deterministic templates from
      `buildActionPlan`; each item links to an existing destination when
      one is available; the candidate background selector lives in the
      section header and is annotated as not saved unless logged in.
  12. Next steps — four cards to profession, family, Career Center,
      Jobs (Jobs card carries an "in development" tag).
  13. Save-result prompt — new copy per spec, disclaims non-implemented
      functionality, links to `/auth`.
  14. Share preview — dashed-border block explicitly labelled "Share
      preview · Upcoming", showing only non-sensitive fields (profession,
      family, match-strength band); no raw scores, answers or account
      data.
  15. Aggregated disclaimers + methodology accordion (collapsed by
      default) + footer disclaimer.

### Accessibility & responsiveness

- Progress bars carry `role="progressbar"` with `aria-valuenow / min /
  max`.
- Score help toggles use `aria-expanded` and descriptive `aria-label`.
- Accordion uses `aria-expanded` on a native `<button>`.
- All interactive links / buttons carry `focus-visible:ring-*` states.
- Motion is gated on `motion-safe:` — reduced-motion users get no
  transitions.
- Two-column and comparison layouts use `grid-cols-[minmax(0,1fr)_auto]`
  + `min-w-0` + `shrink-0` patterns; long titles `truncate` on mobile.
- Semantic headings: single `<h1>` in the hero, section `<h2>`s per
  SectionCard, `<h3>`s inside sections.
- Background `<select>` has an associated `<label htmlFor="cq-bg">`.

## Files changed

- Added: `src/components/assessment/result/labels.ts`
- Replaced: `src/components/assessment/result/engine-view.tsx`
- Added: `docs/career-intelligence/phase-d2-report.md`

No changes to:

- `src/lib/career-intelligence-engine/**`
- `src/lib/career-assessment/**`
- `src/lib/career-center/**`
- `supabase/**`
- `src/routes/security-career-assessment.tsx`
- any RLS / migrations / database types

## Database changes

None.

## Tests performed

- `bunx tsgo --noEmit` — clean, no diagnostics.
- `bun cie:check` — 11/11 personas pass with unchanged scores; the
  determinism, monotonicity and regression assertions remain green.
- Playwright smoke test end-to-end (English locale, 16 questions, first
  option per question):
  - Result page renders with `<h1>Your possible path in security</h1>`.
  - Detected sections: Career guidance badge, Your career profile label
    ("People-Focused Security Professional" for the test path), Why
    this result, Career profile, Career plan, Areas to explore further,
    Share preview, How the guidance works accordion. No page errors, no
    runtime exceptions in the console.
- Manual desktop screenshot review (1280×1800): sections align, mobile-
  responsive header patterns hold, tokens/colors match the existing
  design system.

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Clear narrative from result to action | Met — 15-step hierarchy |
| 2 | Career Profile + Career Family understandable and prominent | Met — both surfaced in hero and immediately after "why" |
| 3 | Plain-language explanations for all scores | Met — tooltip/help toggle per score, bilingual copy |
| 4 | Missing evidence not shown as low ability | Met — `dimensionBand("insufficient")` + "not a judgement" copy |
| 5 | No fabricated education/certifications/jobs | Met — empty states use the required copy and link to guides |
| 6 | Top three professions comparable consistently | Met — `CompareCard` renders identical field set |
| 7 | Swedish and English complete | Met — every string in `labels.ts` and `engine-view.tsx` is bilingual |
| 8 | Mobile and desktop layouts usable | Met — responsive grids + `min-w-0` / `shrink-0` |
| 9 | All safeguards remain intact | Met — regulated disclaimer, aggregated disclaimers, methodology bullets |
| 10 | No engine / scoring / DB changes | Met — presentation-only diff |
| 11 | Regression tests pass | Met — `bun cie:check` PASS |
| 12 | Type-check clean | Met — `bunx tsgo --noEmit` clean |
| 13 | No new security findings | Met — no new server code, no new dependencies, no RLS changes |

## Deviations

- The candidate background selector is UI-only and is not persisted for
  guest users (per spec). Persistence for logged-in users is not
  wired — this is left to the Career Journey follow-up and clearly
  disclaimed inline.
- The Jobs card in Next Steps links to `/jobs` with an "In development"
  tag rather than showing any job list; per spec no fake or placeholder
  jobs are rendered.
- The Career Family "Top profession in family" link uses a plain
  anchor (`<a href="/career-center/{slug}">`) rather than TanStack
  `<Link>` because the profession slugs are dynamic at runtime and
  TanStack's typed `params` inference otherwise fights the generic
  `Match["legacySlug"]` string. This keeps type-check clean without
  fabricating routes.

## Remaining content gaps (not blockers)

- CIG enrichment coverage still varies by profession; the empty-state
  copy handles this, but formal-requirements / education / certification
  data will fill in as CIG curation continues.
- The "adjacent families" chips still show family keys as human labels
  via `getFamily(...)` but not descriptive tooltips; can be added later.
- The methodology accordion is deliberately collapsed; if analytics
  show low engagement we may promote a summary line into the hero.

## Remaining technical debt

- `src/components/assessment/result/index.tsx` (legacy result view) is
  no longer imported by the assessment route but remains for MCP tool
  and test compatibility. It should be retired in the D-consolidation
  pass along with `src/lib/career-assessment/result-session.ts` if no
  external caller remains.
- `labels.ts` currently duplicates the archetype-to-label mapping table
  in code; if the taxonomy grows this could move to the engine's
  Career Profile module for a single source.

## Rollback procedure

1. `git checkout HEAD~ -- src/components/assessment/result/engine-view.tsx`
2. `git rm src/components/assessment/result/labels.ts`
3. `git rm docs/career-intelligence/phase-d2-report.md`
4. Nothing to migrate; no DB / engine / route changes involved.

## Recommendations before Phase E

- Retire the legacy `src/components/assessment/result/index.tsx` and
  the `result-session` module once MCP tools no longer import them,
  then trim `career-assessment/matching-engine.ts` references.
- Extend the CIG "top profession in family" enrichment so the family
  block can show a `titleSv/titleEn` from the engine result rather than
  falling back to the profession-key from the compare card.
- Consider promoting the Career Profile label mapping into
  `career-intelligence-engine/career-profile.ts` so the label is part
  of the engine envelope (would be a small additive change to
  `CareerProfile`, not a redesign).
