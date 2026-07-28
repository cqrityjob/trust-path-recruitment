# ADR: The adaptive candidate experience is a framing layer, not a measurement layer

**Status:** Accepted — implemented in Phase 1
**Date:** 2026-07-28
**Related:** [`adr-career-discovery-construct-model.md`](./adr-career-discovery-construct-model.md) · [Question Blueprint v3.0](../assessment/career-discovery/question-blueprint-v3.0.md) · [Implementation Roadmap](../assessment/career-discovery/implementation-roadmap-v3.0.md)

## Context

Security Career Discovery must feel personally adapted to each candidate while producing measurement that is comparable across every candidate. Those two goals pull against each other, and the previous build resolved them the wrong way.

In the live v2.1 `public-career-assessment`, the "Current Situation" answer selects which 8 of 16 questions a person receives. Two people therefore sit **structurally different instruments** and receive results that cannot be compared. Audit finding F-1 records the consequence: four dimensions ended up driven by a single multi-select item, and three of five hard eligibility gates were decided by checkboxes.

The v3.0 design must not repeat that. It must also not swing to the opposite extreme — an identical, impersonal questionnaire — because the product's whole thesis is that the candidate should feel understood.

A second, narrower problem: the owner has issued locked wording for **two** context questions with five options each, while [Question Blueprint v3.0 §2](../assessment/career-discovery/question-blueprint-v3.0.md) drafted **three** (C1–C3) with different wording and different stable values. Both cannot be the instrument.

## Decision

### 1. Personalisation is a framing layer that sits before and around the measurement, never inside it

Every candidate answers **the same 20 core items, in the same wording, in the same order**, regardless of context answer or adaptive path. Personalisation is delivered by four additional path-specific items and by report framing — never by changing which core items are administered.

This is the exact inversion of the v2.1 mistake. There, context changed the instrument. Here, context changes the voice.

The 26-question session is therefore:

| Block | Count | Scored | Varies by path |
|---|---|---|---|
| Context (C1, C2) | 2 | No | No — same two for everyone |
| Core (S1–S8, T1–T8, B1–B4) | 20 | **Yes** | **No** — identical for everyone |
| Adaptive | 4 | No | Yes — 4 of a 20-item bank |

### 2. The scoring boundary is structural, not procedural

Adaptive and context answers carry `evidence_class = 'contextual_self_report'` and **no axis loadings**. `isScoredItem()` derives from the evidence class, so contextual evidence is invisible to anything reading scoring evidence. It is not a convention that a reviewer must remember to check.

The same rule is enforced independently in the database by `cd_guard_evidence_scoring_boundary()`, which derives `is_scored` rather than trusting the caller, and refuses any attempt to store an adaptive or context answer under a scoring evidence class. It is a **trigger, not an RLS policy**, so it also fires for `service_role` and other `BYPASSRLS` callers — proven in the test suite's Group 7.

Contextual evidence **may** influence: report wording · recommended learning · next steps · examples · career guidance.

Contextual evidence **must not** influence: Security Career DNA · Security Career Area ranking · report-generation inputs · the recommendation engine · candidate scoring · confidence · coverage.

### 3. Adaptive answers are never required inputs

A result is generatable from the 20 core items alone. `cd_guard_snapshot_requires_core_complete()` counts scored evidence and requires exactly 20; it does not look at adaptive answers at all. The test suite proves a report generates with 1 of 4 adaptive items answered.

This matters beyond tidiness: if adaptive answers were required, a candidate who abandoned an adaptive question would lose their result, and the adaptive layer would have become load-bearing for measurement.

### 4. The path is resolved once, from one input, and frozen

`assembleSession()` is a pure function of the C1 answer alone — no C2, no core answers, no clock, no randomness. `cd_guard_adaptive_path_immutable()` then freezes both `adaptive_path` and the `context_status` that determines it, for every caller including `service_role`.

Refresh-stability and "changing C2 does not change the path" are therefore true **by construction**. The tests confirm the construction rather than sampling the behaviour.

### 5. The owner's two locked context questions supersede the blueprint's C1–C3

The blueprint's C1–C3 draft is superseded in full. Nothing is migrated, because nothing was ever administered — the blueprint block never left `design`.

What is lost is C2's tenure question (`lt1` / `1_3` / `3_10` / `gt10`), which was to calibrate action-plan time horizons. The new C1 partially recovers this: `exploring_security` versus `working_in_security` versus `security_leader` distinguishes the cases that most affect horizon language. Finer tenure calibration is available later as a report-framing input if pilot shows it is needed, and is recorded here as a deliberate reduction rather than an oversight.

### 6. Behavioural signals stay out of matching, as already decided

B1–B4 carry no axis loadings and `evidence_class = 'behavioural_signal'`. They are held in a structure separate from the orientation axes so that a function iterating "all constructs" cannot pick them up. This implements, rather than revisits, §5 of the construct-model ADR.

## Consequences

**Positive.** The comparability guarantee is mechanically checkable, and is checked: the guard script asserts that all five paths receive an identical core item set, and fails if a single item moves. The `q16`-class failure — a preference item reaching an eligibility decision — cannot recur through the adaptive layer, because contextual evidence has no path into scoring in either the type system or the database. Personalisation can grow (more paths, more items per path, richer framing) without any of it touching measurement.

**Negative / accepted.** Every candidate answers 4 questions whose answers never affect their DNA or their recommended areas, which is a real cost in session length (~2 minutes) paid for perceived relevance. The adaptive bank is 20 authored items of which any candidate sees 4, so 80% of the authoring effort is unused per session — inherent to path-based personalisation, and the reason the bank is not larger. The tenure signal noted in §5 is genuinely reduced.

**Explicitly not claimed.** The adaptive items are **not** validated psychometric measures, are **not** used for employer decisions, and produce **no** pass/fail or suitability outcome. Path E (`security_leader`) in particular remains Career Discovery: nothing derived from it may claim that leadership effectiveness has been measured or validated.

## Alternatives considered

**Let context select core items, as v2.1 does.** Rejected: it is the defect this design exists to remove. It destroys comparability, and it is how four dimensions came to rest on one checkbox.

**Let adaptive answers adjust axis scores with a small weight.** Rejected: "small" is not a stable property. Once contextual evidence has any path into the score, every future change to that weight is a silent change to what the instrument measures, and the boundary becomes a matter of vigilance rather than structure. A weight of zero is the only weight that can be enforced.

**Drop the context questions and infer the path from core answers.** Rejected: inference would make the path a function of scored answers, so it could not be resolved before the session begins, could change mid-session, and would couple framing to measurement in exactly the direction this ADR forbids. Asking is cheaper, more stable and more honest.

**Keep the blueprint's three context questions alongside the owner's two.** Rejected: five context questions for a 12–15 minute session is a poor trade, and two competing definitions of "the first question" is precisely the ambiguity that produced the three-construct-model contradiction the previous ADR had to resolve.
