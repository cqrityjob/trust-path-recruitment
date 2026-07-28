# Current-state audit — why Career Discovery v3.0 exists

**Status:** evidence record. Read-only audit of `origin/main`, conducted before any v3.0 design decision was made.
**Audience:** anyone who wants to know *why* a design choice in this document set was made rather than the obvious alternative.

Every design decision in the v3.0 document set traces back to a finding here. Where a finding is quoted, the file and line are given so it can be re-checked rather than trusted.

> **How this document relates to the others**
> This is the evidence base. [Master Product Blueprint](./master-product-blueprint-v3.0.md) contains the design; this contains the reasons. If a design choice looks arbitrary, its justification is here.

---

## 1. What is live today

| Surface | Where |
|---|---|
| Public assessment | `src/routes/security-career-assessment.tsx` (534 lines), definition `public-career-assessment` |
| Employer-assigned variant | `src/routes/invite/$token.tsx` — a **second, parallel** implementation of the same questionnaire runner |
| Item content | 16 frozen items `q1`–`q16` in `src/lib/assessment-content.ts`, assembled 8 core + 8 profile by `src/lib/question-library/query.ts:20` |
| Scoring | `src/lib/career-assessment/matching-engine.ts` → `src/lib/career-intelligence-engine/index.ts` |
| Candidate report | `src/components/assessment/result/engine-view.tsx` (1857 lines) |
| Hub | `src/routes/_authenticated.my-career.index.tsx` |
| Live data | 13 completed runs — 8 on `career-guidance`, 5 on `public-career-assessment` |

The engineering is genuinely good: pure functions, deterministic, `inputsHash`, versioned envelope, graceful degradation, honest inline comments. The problems below are not sloppiness. They are a measurement model that was never built to carry the weight now being placed on it — and the code says so itself (`question-mappings.ts:3-5`: *"All weights are provisional; the model is a documented hypothesis, not a validated instrument"*).

---

## 2. Measurement findings

### F-1 — Four of fourteen dimensions are decided by a single checkbox question `CRITICAL`

`q16` is one multi-select: *"Which of these environments would genuinely suit how you like to work? (choose up to three)"*. It is the **only** source of evidence for `technical_orientation`, `strategic_orientation`, `leadership_orientation` and `investigation_orientation`.

Computed from the real mapping table (`question-mappings.ts:314-368`):

| Dimension | Observable values | Items |
|---|---|---|
| `technical_orientation` | **100, or unobserved** | 1 (`q16`) |
| `strategic_orientation` | 33.3 · 66.7 · 100 | 1 (`q16`) |
| `leadership_orientation` | 33.3 · 66.7 · 100 | 1 (`q16`) |
| `investigation_orientation` | 33.3 · 66.7 · 100 | 1 (`q16`) |

Because `gateThreshold = 55` (`matching-engine.ts:34-50`), **three of the five hard gates are decided by which boxes a candidate ticks.** `security-manager` and `crisis-continuity-manager` are reachable only by ticking `{corporate, coordination}`. This is visible in the frozen personas: every persona expected to reach leadership includes exactly `q16: ["corporate", "office", "coordination"]` (`test-personas.ts:101, 228, 263`).

**Consequence for v3.0:** a preference item may never be the sole evidence for an axis, and may never feed a gate. Drives design decisions §2 and §7 in the blueprint.

### F-2 — Dimension scales are not comparable `HIGH`

Theoretical spans, computed from the mapping table:

| Dimension | Span | | Dimension | Span |
|---|---|---|---|---|
| `technical_orientation` | **2** | | `risk_awareness` | 11 |
| `strategic_orientation` | 3 | | `independent_decision_making` | 11 |
| `analytical_orientation` | 4 | | `structure_documentation` | **21** |

All are normalised to 0–100 and then compared directly against hand-set targets via `1 − |user − target| / 100` (`matching-engine.ts:281-282`). A "70" on a 2-point scale and a "70" on a 21-point scale are treated as the same quantity. They are not.

### F-3 — Answered-neutral is indistinguishable from never-asked `HIGH`

`matching-engine.ts:174` — `if (contrib[d] === 0) continue;`. A candidate who answered a question, choosing an option that maps to weight 0, contributes **no evidence at all**. "I considered this and landed in the middle" and "I was never asked" become the same state.

### F-4 — Missing evidence is penalised three to four times over `HIGH`

An unobserved important dimension is penalised independently and multiplicatively: dropped from the weighted mean · usually also a `distinguishing` dimension, `−0.08` · lowers `importantWithEvidence`, lowering `evidenceScale` (range 0.4–1.0) · lowers the confidence tier, lowering the display cap.

Compounding, and worse: `importantWithEvidence` (`:293`) counts only dimensions where `normalized >= 50`, so **a candidate observed *below* target is treated identically to one never asked**. Unknown and low share a code path.

### F-5 — Ranking happens on confidence-capped values `HIGH`

`matching-engine.ts:455` sorts on `displayedMatch`, which is `min(raw × 100, displayedCap[confidence])` with caps of 65 / 82 / 100. A well-fitting profession with limited evidence is hard-capped at 65 while a worse-fitting one with fuller coverage shows 90. **The final ordering is partly an ordering of evidence coverage, not of fit.** `rawSimilarity` is computed, returned (`:437`) and never used to rank.

### F-6 — The recommendation rests on unreviewed hand-authored guesses `HIGH`

All 16 profession target vectors are TypeScript literals (`target-vector.ts:16-29` is a pure pass-through). Content status: **10 `provisional`, 6 `placeholder`, 0 `researched`, 0 `reviewed`**. The file header says so (`profession-profiles.ts:3-5`).

The Career Intelligence Graph — 14 families, 67 professions, formal requirements, education pathways, certifications — **contributes zero scoring signal**. It supplies display enrichment only. `cig_profession_assessment_signals`, named in `target-vector.ts:8-10` as the intended home, does not exist.

### F-7 — The frozen regression suite tests an engine production does not call `HIGH`

The 11 personas run through `matching-engine.ts`. Production calls `computeEngineResultV1`. The two apply the gate cap in a different order:

- `matching-engine.ts:418-420` — `min(raw × evidenceScale, 0.55)`
- `scoring.ts:174-183` — `min(raw, 0.55) × evidenceScale`

Equal only when `raw ≤ 0.55` or `evidenceScale = 1`. Since `evidenceScale ∈ [0.4, 1]`, gate-failing professions score strictly lower in production than in the tested path. Both files claim identical maths. **Nothing runs the personas in CI.**

### F-8 — Enrichment is thin exactly where candidates would check

Of the 14 CIG slugs the engine can match: formal requirements for 6, education pathways for 6, **certifications for 1**, sources for 5 — and always exactly one source, so `sourceCoverage` never exceeds 0.33. One profession (`data-center-security`) borrows an **airport security** row as its "closest published proxy" (`slug-map.ts:23`).

---

## 3. Experience findings

### F-9 — Any "Take the assessment" link destroys an in-flight run `CRITICAL — data loss`

Arriving at `landing` clears the sessionStorage the resume logic depends on (`security-career-assessment.tsx:164-167`). There are ~20 such links across the site — homepage, career centre, every profession guide, five on the My Career hub alone. A user who is 12 questions in and clicks any of them loses everything, silently.

### F-10 — A blank assessment can be submitted

The Next button is disabled without an answer (`:422`), but **the finish button never is** (`:416-420`). Every question is skippable. A candidate can answer nothing and receive a report.

### F-11 — The report is unmaintainable and partly untrue

`engine-view.tsx` is 1857 lines with **zero i18n** — every string is an inline `lang === "sv" ? … : …` ternary, so no translator can touch the candidate report. Meanwhile ~120 of 182 `sca.*` keys per language are **orphaned**, describing an earlier report design whose components are unreachable.

Within it:

- A **"Share preview · Upcoming"** section ships to every candidate and then says sharing is not enabled (`:1719-1750`).
- Three further sections carry literal "under construction" copy.
- `Engine version: cie-v1.0` is displayed to candidates (`:1771`).
- Engine jargon is **regex-laundered into plain language at render time** (`:588-611`).
- The hero hides fit percentages as insufficiently evidenced, then the compare cards print the same numbers raw (`:974`).
- The same archetype array is presented three separate times.
- Next-steps cards 2 and 3 point at the same URL.

### F-12 — Two promises the product does not keep

- The intro states data is **"Not stored" / "Sparas inte"** (`dictionaries.ts:2365`). For signed-in users the full report is persisted unconditionally (`CareerProfileForJobsSaver`).
- The Career Journey stepper has five steps; `apply` and `develop` are **hardcoded `false`** (`my-career.index.tsx:260-261`). It is permanently stuck at 3/5 and can never complete.

### F-13 — No adaptive logic exists

A repo-wide search for adaptive, branching or item-selection logic returns nothing in any scoring or content path. The entire extent of branching is one up-front three-way split on self-reported current situation, which selects a fixed pool of 8. The set is fully determined before question 1.

### F-14 — Signing in loses the result

The report's save prompt is a raw `<a href="/auth">` with no return URL (`:1706`). An anonymous candidate who clicks it loses the report they just earned.

---

## 4. Prior-art findings

The repository contains four bodies of design thinking laid down over nine days, each partly superseding the last, **none amended**.

### F-15 — Three incompatible construct models are live, and nothing decides between them `CRITICAL`

| Model | Shape | Status |
|---|---|---|
| Assessment DNA | 10 domains / 30 competencies / **12 Dimensions** | "Constitutional", zero implementation |
| Career Guidance legacy | **14 DimensionIds** / 19 competencies | Live, frozen |
| Security Competency Core | **12 SCC constructs** / 48 facets | Merged, schema live, no content |

Assessment DNA Doc 03 §5 claims to reconcile two of them and declares itself *"the model for everything built from here forward."* Six days later SCC authored a third from scratch, and the ADR authorising it never mentions Assessment DNA.

They are not variants of one thing. The legacy 14 are **orientation vectors for profession matching**; the DNA 12 are **latent psychological constructs**; the SCC 12 are **occupational competences**. Five of the legacy 14 are structurally preference-only. There is **no integrity dimension at all** in the live 14.

**This document set must resolve it explicitly, because it resolves it implicitly whether it means to or not.** See [ADR: construct model](../../architecture/adr-career-discovery-construct-model.md).

### F-16 — The "locked architecture" is a dead branch

Assessment DNA Docs 03–08 and the entire Question Library set cite the Blueprint Engine as their structural anchor. `adr-security-competency-product-separation.md` (Accepted, 2026-07-27) formally rejected and parked it. Every "existing schema home ✓" annotation in Question Library Doc 04 now points at tables nothing writes to.

**No v3.0 document may cite "the locked architecture."**

### F-17 — The rule that was breached the week it was written

Assessment DNA Doc 11 §9: *"Explicitly not part of Phase 2B: any change to the public 16-question assessment."* The same day, `Public_Assessment_MVP_v2.1.md` records: *"All 16 questions rewritten from scratch."* Then v2.1 converted seven more. Then 13 further new items shipped.

Question Library Doc 11 §3 predicted the mechanism and named it *"the most realistic operational risk to this entire framework."* It materialised within a week.

### F-18 — Live content did not pass the gates its own documentation requires

Question Library Doc 05 Stage 6: *"no stage may be skipped for expedience, including under delivery pressure."*

13 questions currently assembled into live candidate runs are AI-authored Swedish first drafts, `status: "draft"`, admitted in `public-career-assessment-v1-spec.md` as *"not yet reviewed by a native speaker or an assessment-science reviewer."* No Scientific Review, no Expert Review, no Pilot, no Psychometric Validation.

### F-19 — The minimum-evidence floor is not met

Assessment DNA Doc 06 §1 requires **≥2 items from ≥2 methodologically distinct evidence classes** for any foundational dimension. Five dimensions are sourced from a single preference item. `Public_Assessment_MVP_v2.1.md` states this plainly: *"Coverage is intentionally uneven across dimensions… a reported design decision, not an oversight."* Honest — but a departure from a stated floor.

### F-20 — Non-compensatory scoring is mandated and nowhere implemented

Assessment DNA Doc 00 §2 and Doc 06 §7 make integrity competencies non-compensatory — *"a direct, permanent constraint on how dimensions may ever be combined."* Every live scoring path is compensatory. There is no integrity dimension in the live 14 to make non-compensatory.

*(For Career Discovery this is largely moot — career fit is legitimately compensatory. It matters for the employer product and is noted so v3.0 does not accidentally inherit an obligation that belongs elsewhere.)*

---

## 5. What is worth keeping

The audit is not an argument for starting over.

- **The layered pure-function architecture.** `computeUserVector` → profile derivation → scoring → ranking → enrichment → explanation is the right decomposition.
- **The `TargetVector` seam and `ScoringQuestionSet` injection point.** Correct extension points, currently fed the wrong data.
- **The separation of enrichment from scoring.** Display data and scoring signal should not be the same pipeline.
- **`deriveCareerProfile`.** Genuinely additive layer; the idea survives even though its inputs need replacing.
- **Determinism, `inputsHash`, the versioned envelope, graceful degradation.**
- **The Career Intelligence Graph itself** — 14 canonical families, 67 professions, real Swedish regulatory grounding, alias discipline, mandatory authority disclaimers for police and defence. Thin in places, but the taxonomy is a genuine asset and hard to rebuild.
- **The `scp_*` platform merged in PR-A** — versioned item bank, per-option scoring keys separated from labels, language as adaptation objects, publication workflow, two-person principle, validation statuses, content hashing, immutability triggers that hold against `BYPASSRLS`. This is the right home for v3.0's content.
- **Eight settled principles** consistent across every prior layer: the AI boundary · no pass/fail or ranking · immutability as a scientific requirement · preference ≠ competence · decision support only · self-report weakest where stakes are highest · the trainable/fixed trichotomy · honest limitation disclosure.

---

## 6. Finding → design-decision map

| Finding | Resolved by |
|---|---|
| F-1, F-19 | Minimum 3 independent items per axis; preference items may never gate — [Blueprint](./master-product-blueprint-v3.0.md) §4, [Question Blueprint](./question-blueprint-v3.0.md) |
| F-2 | Common scale across axes — [DNA Model](./security-career-dna-model-v3.0.md) §5 |
| F-3, F-4 | Unknown and low are distinct states; one principled evidence adjustment — [DNA Model](./security-career-dna-model-v3.0.md) §6–7 |
| F-5 | Rank on fit; communicate uncertainty separately — [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) §4 |
| F-6 | Target vectors become versioned, reviewable data — [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) §3 |
| F-7 | Regression fixtures run against the production path, in CI — [Roadmap](./implementation-roadmap-v3.0.md) |
| F-8 | Honest "we don't have this yet" instead of empty sections — [Experience](./security-career-discovery-experience.md) §2 |
| F-9, F-10, F-14 | Resume, submission and save flows redesigned — [Information Architecture](./information-architecture-v3.0.md) |
| F-11, F-12 | Nothing unbuilt is shown; every claim true at render time — [Experience](./security-career-discovery-experience.md) §2 |
| F-13 | Evidence-driven adaptive discovery — [Evidence Architecture](./evidence-architecture-v3.0.md) §6 |
| F-15 | Construct models separated by purpose — [ADR](../../architecture/adr-career-discovery-construct-model.md) |
| F-16 | No document cites the parked Blueprint Engine |
| F-17, F-18 | Phase gates in the roadmap; no v3.0 content ships without its review gate — [Roadmap](./implementation-roadmap-v3.0.md) |
| F-20 | Noted as belonging to the employer product, not inherited here |

---

## 7. Method

Three independent read-only agents, each given a separate brief and no access to the others' conclusions: candidate-facing UX and i18n · scoring engine and CIG data internals · the 30+ prior design documents. Findings were cross-checked against the source before being recorded here. No code was modified, and no candidate name, email or answer was read at any point — live-database checks were aggregate row counts only.
