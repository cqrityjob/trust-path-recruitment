# The Competency Library

**Status: implemented (declarative layer, code-only — no DB tables yet).** This document names and describes the platform layer that sits between the Question Library and the frozen 14-`DimensionId` Dimension Model.

## Why this layer exists

Before this refactor, a question's `QuestionMapping` weighted `DimensionId`s directly — there was no named concept of "what is this question actually evidence of," only "which dimension does this option's weight land on." That's fine for one fixed assessment, but it doesn't scale to a platform where many Assessment Definitions need to reuse and compare evidence:

```
Question Library  →  Competency Library  →  Dimension Model  →  Scoring Engine
 ("what was asked")   ("what it measures")   ("what it aggregates into")   (unchanged arithmetic)
```

- **Questions can evolve without redesigning the competency model.** A question's wording can be revised, or a new question authored, without ever touching a `CompetencyDefinition` or the Dimension Model, as long as its tagged competencies still apply.
- **Multiple Assessment Definitions reuse the same competencies with different questions.** `comp-integrity` is measured by `core-01` (Universal Core, every Public Career Assessment candidate) and by `chg-02` (career_changer profile) — two different questions, same competency, same dimension rollup (`structure_documentation`, `conflict_management`).
- **AI coaching, development plans and learning recommendations can operate on competencies, not individual questions.** "Strength in Escalation Judgement, room to grow in Situational Awareness" is a stable, reusable coaching primitive across every product; "scored well on q7" is not.
- **Future organisational assessments can share competencies without sharing identical questions.** A future Datacenter Security definition can author its own environment-specific question and tag it `comp-situational-awareness`, immediately comparable at the competency/dimension level to `security-guard-foundation`'s `sgf-01`, with neither definition's question text depending on the other's.

## What this layer is not

It does **not** change how scoring works. `src/lib/career-assessment/matching-engine.ts` still reads `QuestionMapping.options[].weights[].dimension` directly — the Competency Library sits alongside that, as a **declared, checkable metadata layer**, not a new runtime dependency of the scoring path. A future phase could route scoring through competency-level aggregation instead; that would be a genuine scoring-engine change and is explicitly out of scope here.

## Shape

`src/lib/competency-library/types.ts`:

```ts
interface CompetencyDefinition {
  id: string;
  slug: CompetencySlug;
  name: Bi;
  description: Bi;
  dimensions: DimensionId[]; // which dimension(s) this competency's evidence rolls up into
  status: "provisional" | "published";
}
```

`src/lib/competency-library/competencies.ts` holds the 19 competencies authored for Public Career Assessment v1.0 (full bilingual definitions there); `registry.ts` exposes `ALL_COMPETENCIES`/`byId`/`bySlug`/`getDimensionsForCompetency`; `validate.ts` provides `validateAssetCompetencies()` — given a list of `{id, competencies, dimensions}`, it flags any competency slug that doesn't resolve and any asset `dimensions` entry that isn't declared by at least one of its tagged competencies. Wired into `scripts/question-library-check.ts` (`bun run question-library:check`), which runs clean against all 32 Question Assets in the current library.

## Dimension fan-in (why this isn't 1:1 ceremony)

| Dimension | Fed by these competencies |
|---|---|
| `structure_documentation` | comp-integrity, comp-reliability, comp-procedural-discipline, comp-reporting-quality, comp-work-motivation |
| `conflict_management` | comp-integrity, comp-prioritisation, comp-escalation-judgement, comp-composure-under-pressure |
| `communication` | comp-clear-communication, comp-escalation-judgement, comp-work-environment-preference, comp-service-disposition, comp-composure-under-pressure |
| `independent_decision_making` | comp-judgement, comp-reliability, comp-collaboration, comp-judgement-under-uncertainty |
| `operational_orientation` | comp-prioritisation, comp-adaptability, comp-work-motivation, comp-composure-under-pressure |
| `learning_development` | comp-collaboration, comp-learning-agility, comp-adaptability |
| `risk_awareness` | comp-reliability, comp-risk-recognition, comp-situational-awareness |
| `service_orientation` | comp-work-environment-preference, comp-service-disposition, comp-career-direction-preference |
| `analytical_orientation` | comp-judgement, comp-judgement-under-uncertainty, comp-career-direction-preference |
| `teamwork` | comp-collaboration, comp-career-direction-preference |
| `leadership_orientation`, `strategic_orientation`, `technical_orientation`, `investigation_orientation` | comp-career-direction-preference only (preference-only dimensions — interest signals, never competency evidence, per the platform's existing rule) |

Several dimensions are already fed by 4–5 distinct competencies from a 32-question library — direct evidence this layer is doing real aggregation work, not restating the dimension model under a new name.

## Forward compatibility

This shape is deliberately close to the parked Blueprint Engine schema's `questions`/`question_versions`/`evidence_signals` tables (`docs/architecture/blueprint-engine-db-schema.md`): `category`/`competencies` map onto competency/evidence-signal linkage, `version`/`status` map onto that schema's `version_number`/`content_status` pattern. If the Question Library and Competency Library are ever migrated into the database, the move is additive data migration, not a redesign — consistent with that schema's own deliberately-deferred convergence plan for the public assessment.
