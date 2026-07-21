# Document 10 — Assessment Roadmap

**Derives from:** all preceding documents. **Scope note:** stage boundaries are conceptual and scientific, not implementation schedules — no dates or engineering estimates are given here.

## Stage 0 — Current Public Assessment (existing, unchanged by this work)

**What it is:** the live 16-question public Security Career Assessment,
`assessment-content.ts`, legacy 14-`DimensionId` scoring.
**Exit criteria to leave this stage as the platform's only assessment
capability:** none required — this stage does not need to end; per the
locked architecture's convergence-path decision (Document 03 §5c), it
remains operationally independent, with a defined future adapter path
should convergence ever be undertaken as its own initiative.

## Stage 1 — Assessment DNA (this document set)

**What it is:** Documents 00–09 — the permanent scientific foundation:
excellence model, philosophy, competency framework, dimension
framework, evidence framework, measurement framework, blueprint
principles, profession model, AI strategy, reliability/validity
strategy.
**Entry criteria:** Blueprint Engine architecture locked (satisfied —
Phase 1 complete, commit `9fa5533`).
**Exit criteria:** this document set reviewed and approved as the
binding foundation for all content authoring that follows (Document
11's Phase 2B recommendation is the concrete next action).
**What must never happen after this stage:** any Question Library
content (Stage 2) that cannot trace its target competency/dimension
back to Documents 02–03, or any evidence method/scale choice that
contradicts Documents 04–05's reasoning.

## Stage 2 — Question Library

**What it is:** the first real content built *from* this framework —
actual Question Versions, Evidence Signals, and their weightings,
authored against specific competencies/dimensions per Documents 02–05.
Not written or scoped by this document set (explicitly out of scope,
per the owner's repeated instruction).
**Entry criteria:** Stage 1 approved; a content-authoring team (human,
possibly AI-assisted per Document 08's boundaries) equipped with
Documents 02–06 as binding reference.
**Exit criteria:** a minimum viable set of published Question Versions
covering the foundational dimensions (D1–D6) for at least the initial
launch Role/Environment combination, meeting Document 06's minimum-
evidence and diversity floors.
**Validation checkpoint:** content-validity review (Document 09 §2)
against Documents 02–03 before any Question Version leaves draft
status.

## Stage 3 — Blueprint Library

**What it is:** Modules and Blueprints composed from the Question
Library, per Document 06's construction principles and Document 07's
profession-specific reasoning.
**Entry criteria:** sufficient Question Library coverage (Stage 2 exit)
to satisfy Document 06 §1's minimum-evidence floor for at least one
complete Blueprint.
**Exit criteria:** at least one published, complete Blueprint Version
per initial launch Role × Environment combination, passing the
Document 06 §11 checklist.

## Stage 4 — Employer Assessments

**What it is:** real organizations running real Assessment Runs
against the Blueprint Library — the first point at which this
framework's reasoning is tested against actual behavior at any scale.
**Entry criteria:** Stage 3 exit; the already-locked Recruitment
journey (Phase 3/4 of the architecture) available to deliver it.
**Exit criteria:** enough completed runs per Blueprint Version to begin
the Document 09 §8 "early-data stage" reliability/validity checks
(internal consistency, initial bias screening).
**Validation checkpoint:** this is the first stage where Document 09's
statistical validity work becomes possible at all — prior stages can
only satisfy design-time (content) validity.

## Stage 5 — Career Intelligence

**What it is:** connecting Blueprint-driven results into the existing
Career Intelligence Engine's profession-matching capability, and
extending career-guidance use cases (Document 08 §5) beyond the public
assessment's current scope.
**Entry criteria:** Stage 4 producing results with established
construct validity (Document 09 §2) sufficient to trust as
Career-Intelligence-Engine input.
**Exit criteria:** Blueprint-derived Dimension results demonstrably
usable alongside or in place of the legacy 14-dimension input to
profession matching, without degrading matching quality — an empirical
bar, not an assumed one.

## Stage 6 — Adaptive Assessment

**What it is:** the dynamic, branching assessment capability described
in Document 04's "Future Adaptive Assessment" method — explicitly
gated behind a substantially larger, calibrated item bank than any
earlier stage requires.
**Entry criteria:** a Question Library large and well-calibrated enough
(item-response-theory-grade calibration, per Document 09's ongoing
statistical work) that adaptive branching does not degrade validity or
create predictable, coachable branching patterns.
**Exit criteria:** demonstrated equivalent-or-better measurement
precision at reduced respondent burden compared to fixed Blueprints,
plus a resolved approach to the reproducibility question flagged in
Document 04 (a fixed *item set* per version no longer exists once
branching is dynamic — this must be solved before Stage 6, not
discovered during it).

## Stage 7 — AI Coach

**What it is:** the full realization of Document 08's coaching,
development-plan, and interview-preparation use cases as an ongoing,
personalized capability rather than a one-time report annotation.
**Entry criteria:** Stage 5 (Career Intelligence integration) and
sufficient Document 09 validity evidence per competency to make
trainability-aware coaching (Document 08 §3) trustworthy rather than
speculative.
**Exit criteria:** not a terminal state — this capability is expected
to continue evolving indefinitely under the same AI boundary
(§1 of Document 08), which does not change as the coach's capability
grows.

## Stage 8 — Global Platform (Security Manager Assistant, partner/white-label/API products)

**What it is:** the full realization of the platform's stated
ambition — a Security Manager Assistant, and partner/white-label/API
products, all inheriting the same Assessment DNA.
**Entry criteria:** Stages 1–7 substantially mature; cross-cultural and
cross-jurisdictional validity work (Document 09 §7) completed for each
new market before results in that market are treated as comparable to
others.
**Governing constraint that never lifts:** every product built at this
stage inherits Document 08 §1's AI boundary and Document 01's ethical/
privacy/fairness principles without exception, regardless of who
operates the product surface (first-party, partner, or white-label) —
restated because this is the stage where the temptation to relax the
boundary for a partner's convenience is highest, and where the
consequence of doing so is largest.

## Cross-stage principle

No later stage may contradict an earlier one's scientific foundation.
Where a later stage's real-world data suggests a Document 00–09
assumption was wrong, the correct response is to revise the
foundational document through the same rigor it was created with
(Document 11's recommended validation strategy), not to quietly
override it in a later stage's implementation. This is the practical
meaning of "constitutional document" — amendable by evidence, not by
convenience.
