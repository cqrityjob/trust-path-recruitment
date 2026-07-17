# Phase D.1 — Engine-driven Assessment Result (Implementation Report)

Status: **Implemented**. Awaiting approval before Phase E consolidation work.

## Objective

Replace the legacy assessment result experience with the completed Career
Intelligence Engine (`cie-v1.0`). Reuse the existing UI visual language and
layout patterns; drive every result section from `EngineResultV1`.

No database, schema, scoring, or assessment redesign was introduced. The
deterministic engine and CIG catalogue remain unchanged.

## Completed stages

1. Wired the assessment result phase to the server function
   `computeCareerIntelligenceMatches` (topN = 5) via `useServerFn` +
   TanStack Query, keyed on the answer map.
2. Built `EngineResultView` as the single presentation component consuming
   `EngineResultV1`. Reuses tokens (SectionCard, TokenBadge, ScoreDial,
   Bar) matching the existing site language.
3. Rendered every field the engine exposes:
   - Hero with engine version, overall Evidence Score, top match summary
     (Current Fit + Potential).
   - **Career Profile**: top archetypes, top motivations, working-style
     dials (independence / teamwork / structure / risk tolerance),
     development capacity, evidence coverage.
   - **Career Family**: top family headline with Current Fit + Potential
     and adjacent family chips.
   - **Top matches**: cards with Current Fit, Potential, Confidence,
     Evidence Score, regulated + conditional-gate badges, family label.
   - **Match detail** for the selected profession: strongest and
     development dimensions (from engine breakdown), regulated disclaimer,
     structured explanations (with kind-aware iconography), formal
     requirements (legal / employer / kind / jurisdiction badges), related
     professions, career transitions, education pathways, certifications,
     sources with external links.
   - Aggregated regulated-role disclaimers and a footer guidance note.
4. Loading, empty, and error states with retry / retake actions.
5. Legacy `Results` composition, `computeMatches`, `buildResultSession`,
   comparison, action plan, share preview, save-to-journey, sticky nav,
   transparency block: removed from the result flow. Underlying legacy
   modules retained for backward compatibility with tests and the MCP
   tool.

## Affected files

- **New**: `src/components/assessment/result/engine-view.tsx` — end-to-end
  engine-driven result view.
- **Edited**: `src/routes/security-career-assessment.tsx` — replaced
  `Results` implementation with an engine-backed loader.
- **Edited**: `docs/career-intelligence/rollback.md` — added Phase D.1
  rollback block.
- **New**: `docs/career-intelligence/phase-d1-report.md` (this file).

## Database changes

None.

## Tests performed

- `tsgo --noEmit` — clean.
- Engine determinism harness (`bun cie:check`) unchanged and already
  covered by Phase D (11/11 personas passing).
- Legacy assessment engine tests unchanged; not consumed by the new UI
  but remain green for MCP + regression.

Manual verification of the result page (Landing → Intro → Questions →
Results) is recommended before Phase E to confirm the CIG enrichment
lookups return the expected published rows in preview.

## Acceptance criteria status

| Requirement                                    | Status |
|------------------------------------------------|:------:|
| Career Profile displayed                       | ✅     |
| Career Family displayed                        | ✅     |
| Current Fit displayed                          | ✅     |
| Potential displayed                            | ✅     |
| Confidence displayed                           | ✅     |
| Evidence Score displayed (per match + overall) | ✅     |
| Top profession matches                         | ✅     |
| Profession explanations (structured)           | ✅     |
| Formal requirements                            | ✅     |
| Related professions                            | ✅     |
| Career transitions                             | ✅     |
| Education pathways                             | ✅     |
| Certifications                                 | ✅     |
| Reuse of existing UI language                  | ✅     |
| No schema redesign                             | ✅     |
| No new features beyond engine integration      | ✅     |

## Technical debt

Carried forward from Phase D and unchanged by D.1:

- **Slug map coverage** — `LEGACY_TO_CIG_SLUG` covers only the seeded
  professions; matches without a `cigSlug` fall back to empty enrichment
  and are labelled by their legacy title. To be expanded during the
  pre-E consolidation phase.
- **Related professions** — the enrichment loader currently returns an
  empty `relatedProfessions` array; needs a dedicated CIG relation query
  (`cig_profession_family_rel` / adjacency) before Phase E.
- **Career transitions** — `otherSlug` is the raw CIG profession UUID; a
  slug-to-title resolver should be added so the UI shows readable
  transition destinations.
- **Legacy result components** (SaveToJourneyCard, ResultTransparency,
  ShareSummaryPreview, CareerActionPlan, etc.) remain in the codebase but
  are unused by the result flow. They can be pruned in the consolidation
  phase or reintroduced deliberately behind Phase E copy approval.
- **UI copy** — labels are inline SV/EN literals inside
  `engine-view.tsx`; migration to the shared `i18n` dictionary is planned
  for Phase E.

## Rollback procedure

See `rollback.md` → “Rollback: Phase D.1 (engine-driven result page)”.
Summary: restore the previous `Results` function in
`security-career-assessment.tsx`, optionally delete `engine-view.tsx`.
Zero data / schema impact.

## Recommendations before Phase E

1. Address the technical-debt items above (slug-map expansion, related
   professions query, transition title resolver, copy migration).
2. Verify CIG enrichment coverage of the top-ranking matches in preview
   for both `sv` and `en` locales; the engine reports
   `dataStatus = 'cig_enrichment_missing'` when coverage is thin.
3. Confirm removal of the legacy result surface is acceptable before
   deleting the now-unused result modules; keeping them costs no runtime
   but adds bundle weight.
4. Optional: extract the inline UI copy into `dictionaries.ts` so Phase E
   AI-driven blocks can share the same keys.

Stop here. Do not begin Phase E until D.1 is explicitly approved.