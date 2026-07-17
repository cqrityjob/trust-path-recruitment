# Phase D Plan (Revised) — Career Intelligence Engine v1

Revision adds: Career Profile, Current Fit vs Potential, Career Family framing, Evidence Score, Career Journey-ready output. No DB redesign, no assessment change, deterministic scoring preserved.

## Objective

Connect the unchanged assessment to the Phase C-seeded CIG and produce a layered, explainable, source-backed career result: **Career Profile → Career Family → Professions → supporting content**. Deterministic. No generative AI in ranking or scoring.

## 1. Current-state mapping (unchanged from prior plan)

- Assessment content, dimensions, mappings, user-vector math untouched.
- Legacy `profession-profiles.ts` (TS hypotheses) is replaced by CIG-derived signals (`cig_assessment_dimensions`, `cig_assessment_signals`, `cig_profession_assessment_signals`) for live matching.
- Live matching restricted to `content_status = 'published'`.
- Result page keeps its layout; data source swaps to CIG.

## 2. Career Intelligence Engine v1 — layered deterministic flow

```text
answers
  → computeUserVector(answers)                        [existing]
  → dimensionScores {dim, normalized, observed, evidence}

  → deriveCareerProfile(dimensionScores, background)  [NEW, layer 1]
      behavioural archetype(s), motivation signals,
      development capacity, working-style tags

  → computeCurrentFit(profile, backgroundEvidence)    [NEW, layer 2a]
  → computePotential(profile)                          [NEW, layer 2b]

  → rankFamilies(currentFit, potential)                [NEW, layer 3]
      aggregate profession scores per cig_profession_families
      → top family + runner-up families

  → rankProfessions(currentFit, potential, families)   [layer 4]
      published cig_professions only
      per-profession: gate, similarity, distinguishing,
      mismatch penalty, evidence scale, confidence cap
      family-diversity guard on top-3

  → enrich(perMatch)                                    [layer 5]
      formal requirements, disclaimers, related,
      transitions, education, certifications, sources

  → composeStructuredExplanations                       [layer 6]
  → attachEvidenceScore + Confidence                    [layer 7]
  → EngineResultV1 (Journey-ready envelope)
```

Layers 1–2 are new; layers 4–6 are the previously approved flow. Scoring math is unchanged: `currentFit` uses today's `computeUserVector` similarity; `potential` uses the same vector with importance re-weighted toward behavioural / development-capacity dimensions and no experience-evidence penalty. Both remain pure functions.

## 3. Career Profile (new, layer 1)

Derived deterministically from the dimension vector plus optional background inputs already collected. Structure:

```
CareerProfile {
  archetypes: [{ key, label_sv/en, strength 0..100 }]      // e.g. operational_guardian, strategic_leader, analytical_investigator, technical_specialist, service_communicator, risk_crisis_responder
  motivationSignals: [{ key, label, strength }]            // service, autonomy, impact, mastery, structure
  workingStyle: { independence, teamwork, structurePreference, riskTolerance }   // 0..100
  developmentCapacity: 0..100                              // from learning_development + coverage
  evidenceCoverage: 0..1
  profileVersion: "cp-v1"
}
```

Archetype mapping is a fixed table (dimension weights → archetype strengths) checked in code, not in DB. Reusable foundation for later AI services (chat coach, roadmap generation) — but not consumed by AI in Phase D. Rendered in the result page as an opening summary block before family/profession sections.

## 4. Current Fit vs Potential (new, layer 2)

Both are computed per profession and per family and returned side-by-side:

- **Current Fit (0–100):** existing similarity math against CIG target vector, evidence-scaled. Reflects today's answered signals and (when present) background/experience inputs.
- **Potential (0–100):** same similarity math against the same target vector, with:
  - importance re-weighted toward behavioural + `learning_development` + motivation-aligned dimensions,
  - evidence-scale penalty removed for unobserved important dims (missing experience does not depress potential),
  - gate result reported but does not cap potential (it still caps current fit).

Guarantees: identical answers → identical (currentFit, potential) pair. Neither implies eligibility. Copy explicitly separates them.

## 5. Career Family framing (new, layer 3)

Before profession list, the result surfaces the **strongest Career Family** with its Current Fit and Potential aggregated from member professions (published-only). Runner-up families appear as compact chips. Then top-3 professions render inside/under the top family, with a "professions in other families" secondary group.

Family aggregate = importance-weighted mean of member-profession scores; ties broken by member count then family slug (deterministic). Family-diversity guard from prior plan still applies to the profession top-3 so a single family cannot fully monopolise if a strong other-family match is within tolerance.

## 6. Match output (per top match)

```
{
  professionId, slug, titleSv/En, family: { slug, title },
  currentFit: 0..100,
  potential:  0..100,
  confidence: limited|moderate|stronger,
  evidenceScore: 0..100,                     // NEW, layer 7
  gatePassed, gateNote?,
  strongestDimensions, developmentAreas,
  formalRequirements, disclaimer?,
  relatedProfessions, transitions,
  educationPathways, certifications, sources,
  reason: StructuredExplanation[]
}
```

## 7. Evidence Score (new, layer 7)

Reported alongside Confidence, not replacing it.

```
evidenceScore = round(100 * weightedMean(
  answeredCoverage,             // fraction of relevant questions answered
  importantDimObservedRatio,    // observed important dims / total important
  sourceCoverageForMatch,       // published sources on the profession
  distinguishingObservedRatio   // distinguishing dims observed
))
```

Pure function of already-computed inputs; deterministic; does not affect ranking. Confidence remains the categorical band; Evidence Score is the transparency metric.

## 8. Scoring safeguards (unchanged, still binding)

Single-profession dominance guard; interest vs eligibility separation; current vs future separation (now explicit via Current Fit / Potential); missing experience ≠ unsuitability; legal/employer requirements not rendered as traits; drafts excluded; determinism preserved.

## 9. Explanation model (structured, no generative AI)

Same as prior plan; add explanation kinds:
- `profile_archetype` — describes derived archetype.
- `current_vs_potential` — "You currently fit X; your behavioural profile suggests strong potential for Y."
- `family_rationale` — why this family ranked highest.
- `evidence_note` — "Evidence Score {n}/100 based on covered questions and available sources."

All bilingual, template-driven.

## 10. Regulated professions

Unchanged: CIG disclaimers verbatim, never "eligible/admitted/approved/cleared", formal-requirements block always precedes next-step suggestions. Applies to both Current Fit and Potential rendering.

## 11. Result-page integration (minimum UI change)

Reuse `src/components/assessment/result/index.tsx`. Additions only:
- **New top block:** `CareerProfileSummary` (archetype + motivation + working-style).
- **New family block:** `CareerFamilyHeadline` (top family, Current Fit, Potential, runner-ups).
- **Existing card `CareerMatchCard` extended:** two score chips (Current Fit / Potential) + Evidence Score chip alongside Confidence.
- **New sub-sections in the card:** formal requirements, transitions.
- No restyle, no new page.

## 12. Career Journey readiness (structural only, not built)

`EngineResultV1` returns a stable envelope so a later Career Journey feature can consume it without redesign:

```
EngineResultV1 {
  engineVersion, computedAt, inputsHash,
  careerProfile,              // reusable foundation
  familyRanking: [...],
  matches: [...],             // top-N with currentFit + potential + evidenceScore
  journeyHooks: {             // structural placeholders, empty in Phase D
    developmentRoadmap: null,
    educationTrack:     null,
    certificationTrack: null,
    jobsQuery:          null,
    nextReviewAt:       null,
  }
}
```

`journeyHooks` is a documented extension point — no logic behind it in Phase D. `inputsHash` is a deterministic hash of the answer set (already deterministic engine) so a future Journey can detect when to recompute. No DB tables required; if persistence is later needed, it can attach to existing user tables without CIG changes.

## 13. Testing

Prior persona suite plus:
- Career Profile snapshot per persona (archetype stability).
- Current Fit vs Potential divergence test: student-no-experience must have Potential > Current Fit for at least one appropriate family.
- Experienced officer: Current Fit ≥ Potential in own family.
- Family ranking test: leadership persona → corporate/management family top.
- Evidence Score monotonicity: adding more answered questions never lowers Evidence Score for the same profile.
- Determinism snapshot on full `EngineResultV1` envelope (including `inputsHash`).
- Regression against existing `test-personas.ts` expected-top-family assertions.

## 14. Data-quality handling

Unchanged from prior plan. Additionally: if a family has zero published members, it is excluded from family ranking (never surfaced empty). Career Profile is always computable — it depends only on the dimension vector, not on CIG completeness.

## 15. Scope protection

Still out of Phase D: adaptive questions, AI chat coach, employer intelligence, job matching, new auth, payments, major UI redesign, new DB architecture, publication workflow, content curation UI. `journeyHooks` is a shape, not a feature.

## 16. Deliverables

**New files:**
- `src/lib/career-intelligence-engine/index.ts` — public API, `ENGINE_VERSION = "cie-v1"`.
- `.../types.ts` — `EngineResultV1`, `CareerProfile`, `FamilyRanking`, `StructuredExplanation`.
- `.../career-profile.ts` — archetype/motivation/working-style derivation.
- `.../scoring.ts` — Current Fit + Potential (reuses `computeUserVector`).
- `.../family-ranking.ts`.
- `.../target-vector.ts` — CIG signals → target vector.
- `.../evidence-score.ts`.
- `.../enrich.ts` — related, transitions, education, certs, sources.
- `.../explanations.ts` — bilingual template registry.
- `.../compute.functions.ts` — server fn `computeCareerIntelligenceMatches({ answers, topN? })`.
- `docs/career-intelligence/engine-v1.md`.

**Affected files:**
- `src/components/assessment/result/index.tsx` — data-source swap + Career Profile block + Family headline + Current Fit/Potential/Evidence chips.
- `src/components/assessment/CareerMatchCard.tsx` — new chips + structured `reason`.
- `src/routes/assessment.tsx` — call new server fn.
- `src/lib/mcp/tools/compute-career-matches.ts` — return v1 envelope (backwards-compatible superset).

**DB reads:** as prior plan (all `cig_*` tables, published-only, anon RLS in place).
**Required DB changes:** none. Additive migrations only if a Phase C signal audit turns up gaps (data-only, not schema).

**Implementation stages:**
1. Types + `CareerProfile` derivation + unit tests.
2. Target-vector build from CIG signals.
3. Current Fit + Potential scoring; determinism snapshots.
4. Family ranking + diversity guard.
5. Evidence Score.
6. Server fn + published-only guard.
7. Enrichment.
8. Structured explanations (bilingual).
9. Result-page integration (Profile block, Family headline, new chips, formal-req + transitions sub-sections).
10. Regulated-profession disclaimer wiring.
11. Regression + graph-integrity update.

**Acceptance criteria:**
- Assessment unchanged and functional.
- `EngineResultV1` deterministic; identical answers → identical envelope including `inputsHash`.
- Career Profile rendered before family and professions.
- Top family shown before profession list.
- Each match shows Current Fit, Potential, Confidence, Evidence Score.
- Regulated matches render CIG disclaimer verbatim; no eligibility language anywhere.
- Draft professions excluded.
- All persona tests + regression pass.
- `journeyHooks` present but null.
- Type-check + security linter clean.

**Rollback:** additive; `CIE_V1_ENABLED` feature flag toggles the result page between legacy and v1 engine. `GRAPH_ACTIVATION_STATE` remains authoritative for CIG activation. Rollback steps appended to `docs/career-intelligence/rollback.md`.

**Estimated complexity:** Medium (was Medium). Added layers are pure functions over existing data. Estimated credits: ~50–65.

## Stop point

Stop after this revised plan. Do not implement until approval.
