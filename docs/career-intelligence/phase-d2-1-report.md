# Phase D.2.1 — Result clarity and interpretation safeguards

Status: **Complete**. Presentation-only refinements on top of Phase D.2.
No engine, scoring, schema, route, question or answer-mapping changes.

## Files changed

- `src/components/assessment/result/labels.ts`
  - Added `overallEvidenceLevel` / `overallEvidenceLabel` /
    `overallEvidenceHelp` (single evidence status for the hero).
  - Added `currentFitBand` / `currentFitLabel`, `potentialBand` /
    `potentialLabel`, and `guidanceSignalHelp` (qualitative fit /
    potential presentation; numeric values remain in tooltips).
  - Added `insufficientEvidenceLabel` / `insufficientEvidenceHelp`.
  - Reworded `regulatedLabel` to `Formal requirements apply` /
    `Formella krav gäller` and added `regulatedHelp` tooltip copy.
- `src/components/assessment/result/engine-view.tsx`
  - Hero: one overall evidence status with an accessible tooltip,
    formal-requirements badge with accessible tooltip, qualitative
    fit/potential labels replacing the dominant `%` presentation,
    numeric values preserved inside the score tooltips.
  - `ScoreWithHelp` extended with an `insufficient` state.
  - `CareerProfileBlock` renders "Insufficient evidence" instead of
    `0%` for working-style dimensions when the value is not observed.
  - `WhyThisResult` rewrites structured explanation text to plain
    guidance language (strips `archetype`, `baseline signal`,
    `supporting profile`, `strongest contributing dimensions`).
  - New action hierarchy in the hero: primary "Explore this
    profession" → `/career-center/<legacySlug>`; secondary "Compare
    career paths" and "View your action plan" (in-page scroll to
    `#compare` / `#action-plan`); tertiary "Retake assessment" text
    link.
- `docs/career-intelligence/phase-d2-1-report.md` (this file).

## Presentation rules introduced

| Concern | Rule |
|---|---|
| Overall evidence | Single hero status: Strong ≥ 70, Moderate ≥ 45, else Limited. Uses existing `overallEvidenceScore`. |
| Current Fit | Qualitative: Strong ≥ 70, Promising ≥ 55, Exploratory ≥ 40, else Limited. Numeric value preserved in tooltip. |
| Potential | Same thresholds, dedicated development-potential wording. |
| Insufficient evidence | Never render `0%`. When `confidence === 'limited'` or the value is ≤ 0, show "Insufficient evidence" with accessible help. |
| Formal requirements badge | "Formal requirements apply" / "Formella krav gäller" with tooltip clarifying that the assessment does not verify the requirements. |
| Language rewriter | `WhyThisResult` softens internal-model terminology out of visible copy. |
| Action hierarchy | Discover → Understand → Grow. Retake is now a tertiary text link. |

All thresholds reuse existing engine confidence and score values —
no new engine parameters were introduced.

## Tests performed

- `bun cie:check` — **11 / 11 personas PASS** with unchanged
  underlying scoring and profession rankings (identical to Phase D.2
  output).
- `bunx tsgo --noEmit` — **clean**, no type errors.
- Playwright smoke, viewport 1280×1800, English and Swedish, landing
  route (`/security-career-assessment`): loads without page errors or
  console errors in either language.

## Confirmation of unchanged scoring

- Engine modules under `src/lib/career-intelligence-engine/` were not
  modified.
- `src/lib/career-assessment/` was not modified.
- Persona regression snapshot is byte-identical to the previous run —
  all 11 personas produce the same top matches with the same
  `currentFit` / `potential` / family ranking.
- No database migrations were issued.
- No route files were added, removed, or renamed.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| Single hero evidence status | ✅ |
| Evidence status has accessible explanation | ✅ (keyboard + `role="tooltip"`) |
| Insufficient evidence never shown as `0%` | ✅ hero + working-style dimensions |
| Fit / potential not presented as probabilities | ✅ qualitative labels dominate, numeric in tooltip |
| Underlying scores unchanged | ✅ |
| Regulated badge replaced with "Formal requirements apply" | ✅ |
| Visible result copy uses plain language | ✅ rewriter + heading changes |
| Primary action leads to top profession | ✅ `/career-center/<legacySlug>` |
| Retake no longer primary action | ✅ tertiary text link |
| Swedish / English consistent | ✅ every new string is bilingual |
| 11 regression personas still pass | ✅ |
| Type-check + smoke tests pass | ✅ |
| No scoring / engine / schema / route / question-mapping changes | ✅ |

## Limitations / deferred work

- Playwright smoke covers only the assessment landing route because
  the results view requires walking through the question flow;
  deeper end-to-end coverage is proposed for the pre-Phase-E
  consolidation sprint.
- The plain-language rewriter in `WhyThisResult` is a targeted
  string transformer. If future structured explanations introduce
  new internal terms, the rewriter needs to be extended.
- Numeric fit / potential values are still displayed inside the
  comparison cards (Compare section) alongside the qualitative
  match-strength label. This is intentional so users can compare
  the top 3 side by side; if we want to hide numbers there too it
  is a one-line change.

## Rollback

All edits are confined to `labels.ts` and `engine-view.tsx` (plus
this report). To revert:

```bash
git checkout HEAD~1 -- \
  src/components/assessment/result/labels.ts \
  src/components/assessment/result/engine-view.tsx
rm docs/career-intelligence/phase-d2-1-report.md
```

No data or schema rollback is required.