# Career Intelligence Engine v1 — Specification

Version: `cie-v1.0`  ·  Career profile version: `cp-v1`

## Purpose

Transform the existing security-career assessment answers into an
explainable, source-backed, deterministic career result:
**Career Profile → Career Family → Professions → Enrichment**, with
Current Fit vs Potential and an Evidence Score reported alongside
Confidence. No generative AI is involved in ranking, scoring, or
explanation composition.

## Layered flow

```
answers (AnswerMap)
  → computeUserVector(answers)                        [existing legacy engine]
  → deriveCareerProfile(vector)                       [layer 1]
  → for each TargetVector (from TS profession profiles):
       computeCurrentFit(target, vector)              [layer 2a]
       computePotential(target, vector)               [layer 2b]
  → rankFamilies(scoredMatches)                       [layer 3]
  → sort matches, enforceFamilyDiversity              [layer 4]
  → attach EnrichmentBundle from CIG (published only) [layer 5]
  → explainMatch / explainCareerProfile / explainFamily [layer 6]
  → computeEvidenceScore per match                    [layer 7]
  → EngineResultV1 envelope with journeyHooks
```

## Sources of truth

- **Scoring signals** — `src/lib/career-assessment/profession-profiles.ts`
  (TS) is the single canonical signal source for Phase D. Reused via
  `buildTargetVectorsFromLegacy()`.
- **Enrichment (labels, requirements, transitions, education, certs,
  sources, disclaimers)** — CIG catalogue (`cig_*` tables), published-only,
  read via `serverPublicClient()` in `compute.functions.ts`.
- **Legacy → CIG slug bridge** — `slug-map.ts::LEGACY_TO_CIG_SLUG`. Missing
  entries degrade gracefully (empty enrichment, `dataStatus =
  "cig_enrichment_missing"`).

## Current Fit vs Potential

Both are computed with the same similarity math over the same target
vector. The only differences:

| Behaviour                    | Current Fit | Potential |
|-----------------------------|:-----------:|:---------:|
| Gate caps score at 0.55       | yes         | no (reported only) |
| Mismatch penalty applied      | yes         | no        |
| Evidence-scale penalty        | yes         | no        |
| Behavioural-dim importance × 1.1–1.5 | no  | yes (learning, leadership, strategic, analytical, service, communication, teamwork) |
| `minRelevantEvidence` for confidence | as-defined | `max(2, defined − 1)` |

Guarantees: identical answers → identical `(currentFit, potential)`; neither
implies eligibility.

## Scoring safeguards (mapped to plan §4)

- **No single-profession dominance** — displayed cap by confidence tier
  (65/82/100) plus `enforceFamilyDiversity` on the top-N.
- **Interest vs eligibility** — score is fit; formal requirements are a
  separate `EnrichmentBundle` field with `isLegal` / `isEmployer` flags.
- **Current vs future** — explicit split (§ above).
- **Missing experience ≠ unsuitability** — unobserved important dims
  dampen `evidenceScale` for Current Fit only; Potential is unaffected.
- **Draft exclusion** — every CIG read filters `content_status =
  'published'`. Matching-set filter uses only published CIG slugs when
  `restrictToPublished` is requested.
- **Determinism** — pure functions; tie-break `(displayed desc,
  potential desc, professionKey asc)`; `inputsHash` records the exact
  answer set.

## Evidence Score

```
evidenceScore = round(100 × (
  answeredCoverage      × 0.30 +
  importantObserved     × 0.30 +
  distinguishingCoverage× 0.20 +
  sourceCoverage        × 0.20
))
```
Reported per match and averaged into `overallEvidenceScore`. Does not
affect ranking. Deterministic and monotonic under added evidence.

## Structured explanations

`StructuredExplanation` is a bilingual (sv/en) discriminated union with
kinds: `profile_archetype`, `family_rationale`, `matched_dimension`,
`gap_dimension`, `gate_pass`, `gate_fail`, `formal_requirement`,
`low_evidence`, `why_ranked_lower`, `regulated_notice`,
`current_vs_potential`, `evidence_note`.

Every regulated profession match includes a `regulated_notice` entry,
preferring the CIG `disclaimer_sv/disclaimer_en` verbatim when present.

## Journey readiness

`EngineResultV1.journeyHooks` is a documented extension point
(`developmentRoadmap`, `educationTrack`, `certificationTrack`,
`jobsQuery`, `nextReviewAt`), all `null` in Phase D. `inputsHash`
fingerprints the answer set so a future Career Journey can decide when to
recompute.

## Files

| Path | Role |
|------|------|
| `src/lib/career-intelligence-engine/types.ts` | Public types + `ENGINE_VERSION` |
| `src/lib/career-intelligence-engine/career-profile.ts` | Layer 1 |
| `src/lib/career-intelligence-engine/scoring.ts` | Layer 2 |
| `src/lib/career-intelligence-engine/family-ranking.ts` | Layer 3 + diversity guard |
| `src/lib/career-intelligence-engine/target-vector.ts` | TS profile → TargetVector |
| `src/lib/career-intelligence-engine/slug-map.ts` | Legacy→CIG slug bridge |
| `src/lib/career-intelligence-engine/evidence-score.ts` | Layer 7 |
| `src/lib/career-intelligence-engine/explanations.ts` | Layer 6 |
| `src/lib/career-intelligence-engine/inputs-hash.ts` | Deterministic FNV-1a |
| `src/lib/career-intelligence-engine/index.ts` | Orchestrator + `computeEngineResultV1` |
| `src/lib/career-intelligence-engine/compute.functions.ts` | Server fn `computeCareerIntelligenceMatches` |
| `scripts/cie-check.ts` | Deterministic + regression harness (`bun cie:check`) |

## Consumption

```ts
import { computeCareerIntelligenceMatches } from
  "@/lib/career-intelligence-engine/compute.functions";
import { useServerFn } from "@tanstack/react-start";

const compute = useServerFn(computeCareerIntelligenceMatches);
const result = await compute({ data: { answers, topN: 3, restrictToPublished: true } });
```

The result page is not swapped in Phase D — the existing deterministic
result view remains the primary UI. Result-page integration is a Phase E
task, gated on Career Profile / Family headline UX approval.
