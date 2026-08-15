# AI Experience Layer — Architecture (foundation only, not built)

Written per Master Completion Mandate item 13 ("build the foundation
correctly... do not build the chatbot yet"). This is a design document: it
defines the contract a future AI layer must honor and the read-model it
would consume, so that when it is built, it slots onto the existing
deterministic engine rather than becoming a second, competing intelligence
layer. No AI code, no new tables, no new server functions exist yet — this
document is the thing to implement against later.

## 1. The non-negotiable boundary

The deterministic engine (Career DNA → Profession Affinity → Recommendation
Priority → stage/pathway) is authoritative, full stop. Nothing in this
architecture changes that. Concretely:

| May do | May NOT do |
|---|---|
| Turn a `ProfessionAffinityDiagnostic` + `ProfessionMatch` into natural-language explanation | Change which professions are recommended |
| Write a personalised pathway narrative from real CIG pathway edges | Invent a career-path edge CIG doesn't have |
| Compare two of the candidate's own recommended professions | Compare a profession NOT in the candidate's `matches` |
| Explain a development option using real `cig_profession_*_requirements` rows | Invent a requirement, certification, or eligibility rule |
| Summarise "why this stage" using `stageBeforePivotCheck`/`finalStage`/`priorityChangedByPivot` | Reclassify or reorder a stage/priority itself |
| Power a future "Career Coach" conversation grounded in the candidate's own frozen snapshot | Score, rank, or gate anything (hiring, ranking, eligibility) |
| Run entirely offline-safe: if the AI call fails or is disabled, the page still renders every number/label above | Be the only source of any candidate-facing fact |

The product must work correctly with **zero** generative AI calls today —
every existing report, Career Card, and admin diagnostic already does. The
AI layer, whenever built, is a strictly additive explanation layer on top.

## 2. What the AI layer would consume — the read-model

A future AI call's input is assembled entirely from data the deterministic
engine already computed and would have shown the candidate anyway,
structured as **reason codes and reviewed facts**, not free text:

```ts
interface AiExplanationContext {
  // Career DNA — already candidate-facing, never raw answers.
  readonly leadingPattern: { id: string; name: string };
  readonly dimensionHighlights: readonly { id: DimensionId; name: string; band: "high" | "moderate" }[];

  // Profession Affinity + Recommendation Priority — from
  // ProfessionMatch/ProfessionAffinityDiagnostic, already qualitative.
  readonly profession: {
    readonly professionId: string;
    readonly title: string;
    readonly stage: ProfessionStage;               // "explore_now" | ... | "career_pivot"
    readonly fitTier: ProfessionFitTier;            // "strong" | "moderate" — never fitScore
    readonly alignedDimensionNames: readonly string[];
    readonly contextCorroborated: boolean;
  };

  // Reviewed CIG facts only — the same data getProfessionDetails already
  // serves to the candidate, never invented.
  readonly cigFacts: {
    readonly requirements: readonly ProfessionRequirement[];
    readonly education: readonly ProfessionLearningItem[];
    readonly pathway: readonly ProfessionPathwayEdge[];
  };

  // Contextual self-report — Mandate item 2/6, never scoring evidence.
  readonly careerContext?: { experienceBand: ExperienceBand | null };
  readonly discoveryTags: readonly string[];

  readonly locale: "sv" | "en";
}
```

Deliberately excluded from this shape, always: raw Career DNA answers
(option ids, Likert values), account identifiers, email, employer, `fitScore`
or any other raw number, and anything from `matchProfessionsDiagnostics`
beyond what a candidate could already see or what the admin-only diagnostic
already treats as internal (`centralFitScore` etc. stay server-side, never
sent to a model — they are review tooling, not explanation input).

This context object is derivable purely from `ReportSnapshot` +
`ProfessionDetail` + `CareerContext` — all data that already exists on the
frozen report page today. No new database read is required to build it.

## 3. Where it would plug in

```
ReportSnapshot (frozen)  ──┐
ProfessionDetail (live CIG) ─┼──> AiExplanationContext ──> [AI call] ──> AiExplanation
CareerContext (self-report) ┘                                                │
                                                                              ▼
                                                          ProfessionRecommendations
                                                          (rendered ALONGSIDE explainMatch's
                                                           deterministic sentence, never
                                                           replacing it)
```

`explainMatch` (`profession-explanations.ts`) stays the deterministic
baseline — it must keep working with zero AI involvement. An
`AiExplanation` would be an *additional*, clearly-labelled enrichment
rendered near it (e.g. "AI-written summary" badge), never a silent
replacement of the deterministic `rationale`/`stageSentence`.

## 4. Audit trail (required before any real call is made)

Every AI call must be logged with, at minimum:

- `model` / `provider` (e.g. `claude-sonnet-5`, `anthropic`)
- `promptTemplateVersion` (the prompt template is versioned like everything
  else in this system — `DEFINITION_VERSION`, `CONTENT_VERSION` etc. — so a
  stored AI explanation can be traced back to exactly what asked for it)
- `inputDataClasses` (which of the `AiExplanationContext` fields were
  actually sent — not the values, the *shape*, for a lightweight privacy
  audit trail)
- `outputVersion` / response hash
- `timestamp`

This mirrors the versioning discipline `SnapshotVersions` already applies
to the deterministic engine (`professionCalibrationVersion` etc.) — the AI
layer should not be the one place in this product without a version trail.

## 5. Future "Career Coach" — architected for, not built

A conversational Career Coach is explicitly a future feature (Mandate item
13/§25 of the prior phase's mandate). The read-model above is deliberately
shaped so a coach conversation can reuse it directly: each turn would
resolve to the same `AiExplanationContext` (possibly extended with a
`conversationHistory` array of past turns), never a second query path into
raw assessment data. No separate "coach intelligence layer" — one read-model,
two front-ends (inline report explanation now, conversational later).

## 6. Explicit non-goals (avoid over-engineering)

Per the mandate's own anti-over-engineering list: no vector database (the
CIG graph and profession catalogue are both small, relational, and already
queried directly), no elaborate agent/orchestration framework (a single
structured prompt call per explanation request is sufficient), no
speculative "AI reranking" mode behind a feature flag, no separate AI-only
data store — `AiExplanationContext` is assembled from existing tables at
request time, not pre-computed and persisted.

## 7. Status

Architecture only. No `ai-explanation.functions.ts`, no prompt templates,
no UI badge, no database columns exist yet. This document is the contract
the next implementation phase should build against.
