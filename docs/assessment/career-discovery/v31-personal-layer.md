# v3.1 personal layer — the frozen 26-question MVP

**Status:** implemented · **Owner decision:** MVP v1.0, recorded 2026-07-31

> How this document relates to the others
> [Adaptive experience implementation](./adaptive-experience-implementation.md) records the v3.0 adaptive layer this reuses. [Question blueprint](./question-blueprint-v3.0.md) holds the item content. [ADR: adaptive experience](../../architecture/adr-career-discovery-adaptive-experience.md) records why the adaptive layer is framing-only. This document records **what changed to make v3.1 serve 26 questions**, and — more importantly — what deliberately did not.

---

## 1. The frozen structure

```
Stage 1 ·  2 Career Context questions   → decides the Discovery Path
Stage 2 · 20 Career DNA questions       → the only scored items
Stage 3 ·  4 Discovery Path questions   → contextual, never scored
                                          ────
                                            26
```

This is final. It is asserted, not assumed: `MVP_QUESTION_COUNT` in
[`v31/personal-layer.ts`](../../../src/lib/career-discovery/v31/personal-layer.ts)
throws at import if the banks no longer add up to 26.

---

## 2. What this change actually was

**A registration, not a rebuild.** Every question already existed in this
repository and was already registered for v3.0. None was re-authored.

| Artefact | Where it already lived | Status |
|---|---|---|
| C1 `CTX_CURRENT_STATUS`, C2 `CTX_DISCOVERY_GOAL` | `src/lib/career-discovery/context-items.ts` | reused verbatim |
| 20 adaptive items, 4 per path | `src/lib/career-discovery/adaptive-items.ts` | reused verbatim |
| C1 → path mapping | `PATH_BY_CONTEXT_STATUS` + `cd_derive_adaptive_path()` | reused, not duplicated |
| 20 Career DNA items | `src/lib/career-discovery/v31/core-items.ts` | untouched |

The only database change is
[`20260801090000_career_discovery_v31_personal_layer.sql`](../../../supabase/migrations/20260801090000_career_discovery_v31_personal_layer.sql):
22 INSERT rows into `cd_definition_items`, taking v3.1's registry from 20 items
to 42 — the same 42 v3.0 has held since `20260728130000`. No table, constraint,
trigger or function was altered.

**Rollback:** delete the 22 rows for `2026-scd-v3.1.0` where
`evidence_class = 'contextual_self_report'`.

---

## 3. The Excel is the engine, not the question bank

Owner decision, MVP v1.0:

> The adaptive question bank already implemented in the repository is the
> canonical adaptive question bank for MVP v1.0. The Excel is NOT the
> assessment question bank. The Excel is the Career Intelligence Engine. It is
> used AFTER the assessment.

`CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx` sheet `12_Discovery_Path_Items`
carries a different, six-per-path wording set. It is **deliberately not used**
for the questions. The Excel supplies profession profiles, career areas,
dimensions, weighting, matching, career stage and recommendation logic — read
after a run completes.

The adaptive answers produce **Career Context Signals**: the `reportTags` on
each option, stored on `cd_evidence.answer_tags`. Those are what the Excel model
consumes. The database refuses `answer_tags` on any non-adaptive item
(`CD_REPORT_TAGS_ONLY_ON_ADAPTIVE`), so a Career DNA answer cannot smuggle a
signal into the matching engine.

---

## 4. Why Career DNA cannot have moved

Four independent mechanisms, in order of how hard they are to bypass:

1. **A table CHECK constraint.** `cd_definition_items_scoring_boundary` makes
   `is_scored = (evidence_class <> 'contextual_self_report')` structurally
   true. Registering a context item as scored is not possible — attempting it
   fails the migration, verified by mutation.
2. **The completion validator's own filter.**
   `cd_v31_validate_session_evidence` counts expected answers with
   `WHERE is_scored AND item_kind IN ('scale','single_choice')`. The 22 new
   rows are excluded twice over.
3. **The migration's own assertion.** It raises `CD_V31_SCORED_SET_CHANGED`
   unless the scored count is exactly 20 after it runs.
4. **The type split in the server function.** Only `byItem` — which
   `CORE_ITEM_BY_ID` gates — reaches `buildValidatedSnapshot`. A `personal`
   answer carries neither a scale value nor an option id and cannot enter it.

Proven at the database level by `L5.4`: deleting all six personal-layer answers
from a completed session leaves the report path raising no validation failure
at all.

---

## 5. What the database does and does not guarantee

**Does:** the Discovery Path is *derived* from C1 and overwrites any
client-supplied value; an adaptive answer from another path is refused
(`CD_ADAPTIVE_PATH_MISMATCH`); an adaptive answer before routing is refused
(`CD_ADAPTIVE_BEFORE_PATH_ASSIGNED`); routing is immutable once set
(`CD_CONTEXT_STATUS_IMMUTABLE`).

**Does not:** the database does not require all 26 answers. Its scored
requirement is still 20, and a 20-answer session validates — asserted
explicitly in `L5.2` so nobody later reads the suite as guaranteeing 26. The
26-question requirement is a product rule, enforced in the buffer
(`isComplete`) and again in `persistPublicV31Run` before any row is written.

---

## 6. Verification

| Suite | Assertions | Covers |
|---|---|---|
| `scripts/public-assessment-auth-check.ts` | 124 (was 75) | buffer shape, the 26-question sequence, path distinctness, re-routing, registry↔code parity |
| `supabase/tests/career_discovery_v31_personal_layer_test.sql` | 25 | registry shape, routing derivation, all 26 answers persisting, negative cases, the unchanged completion contract |
| `scripts/career-discovery-check.ts` | unchanged | the v3.0 side of the same banks |

Every new guard was mutation-tested: the check was made to fail by deliberately
introducing the defect it exists to catch. Two mutations initially survived and
were closed — losing the C2 answer on re-route, and a duplicated item id
letting a path serve three questions while the row count still read twenty.

### Deployment note

The migration must be applied before the flow is used against a given database.
Until it is, a candidate can answer all 26 questions but persistence fails with
`CD_UNKNOWN_ITEM` on the first context answer — the buffer is retained and
nothing is lost, but the run cannot be saved.
