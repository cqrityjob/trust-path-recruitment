# Document 08 — Future Adaptive Assessment Strategy

**Derives from:** [Assessment DNA — Evidence Framework §2 (Future Adaptive Assessment)](../assessment-science/04-evidence-framework.md), [Assessment DNA — Roadmap, Stage 6](../assessment-science/10-roadmap.md).
**Scope:** what the Question Library must be able to provide for adaptive assessment to become possible later. No adaptive algorithm, branching logic, or selection engine is designed here — that remains explicitly future, out-of-scope work gated behind the item-bank maturity this document describes.

## 1. What "adaptive" requires from the content layer, conceptually

Adaptive assessment dynamically selects which item to present next
based on prior responses, rather than administering a fixed set. This
capability lives above the Question Library — but it can only be as
good as the content beneath it. Four conceptual requirements the
library must satisfy before adaptive delivery is viable, none of which
involve designing the selection logic itself:

## 2. Requirement: sufficient item-bank depth per Dimension

An adaptive engine needs multiple items of comparable target and
varying difficulty (Document 04 §5) available for each Dimension it
might branch into — a thin item bank produces predictable branching
(the same handful of items shown repeatedly), which undermines both
measurement validity and the coachability protection Assessment DNA
Document 04 explicitly cautions about. This is a direct library-growth
prerequisite: adaptive delivery should not be attempted for any
Dimension until Document 06's coverage-gap monitoring shows genuine
depth, not just Assessment DNA Document 06 §1's minimum floor for a
single fixed Blueprint.

## 3. Requirement: calibrated difficulty/discrimination metadata

Adaptive item selection depends on knowing, in advance, how difficult
and how discriminating each item is (Document 04 §5) — this is exactly
the output of Document 05's Psychometric Validation stage, applied at
scale across a large item pool rather than to a handful of items in a
fixed Blueprint. The conceptual requirement: every item eligible for
adaptive use must have completed Psychometric Validation with a
genuine difficulty/discrimination estimate attached, not merely
Production status — reaching Production (Document 05 Stage 6) is
necessary but not sufficient for adaptive eligibility.

## 4. Requirement: item independence and exposure control

Items selected adaptively for the same respondent must not
inadvertently reveal information relevant to a later item in the same
run (a form of Document 02 §8's conflicting/redundant-evidence concern
applied to *sequencing* rather than static composition) and must be
distributed across the eligible pool with deliberate exposure control
so that no single item is shown to a disproportionate share of
respondents — a genuine content-supply requirement (a large, well-
distributed pool), not an algorithmic one, though the exposure-control
*mechanism* itself belongs to the future adaptive engine, not this
document.

## 5. Requirement: reproducibility model for adaptive runs

Flagged as an open design question in Assessment DNA Document 04 and
restated here as a content-layer implication: because an adaptive
run's actual item *set* is not fixed per Blueprint Version the way a
standard run's is, the locked architecture's reproducibility guarantee
(pin the exact versions used at run-start) must extend to recording
the *exact sequence and set of items actually administered* for that
specific run, not just the Blueprint Version it was drawn from. This
is a conceptual requirement on what metadata an adaptive run must
capture — not a schema design, and explicitly deferred to whoever
designs the adaptive engine itself, flagged here so it is not
overlooked when that work begins.

## 6. What must NOT happen before these requirements are met

- No Purpose (recruitment, annual review, etc.) should be delivered
  adaptively until its target Dimensions individually satisfy §2–3.
- Partial adaptivity (adapting some but not all of a run) should still
  satisfy §2–5 for whichever Dimensions are adaptive, not receive a
  lower bar because the rest of the run is fixed.
- Adaptive delivery must never relax any Assessment DNA principle —
  the non-compensatory treatment of integrity-adjacent competencies
  (Assessment DNA Document 06 §7) and the minimum-evidence floor
  (§1 of that document) apply identically whether the specific items
  satisfying them were fixed or adaptively selected.

## 7. Relationship to Assessment DNA's own Roadmap gating

This document operationalizes, at the content layer, exactly the gate
Assessment DNA Document 10 (Stage 6) already set at the architecture
level: adaptive assessment is a distinctly later capability, entered
only once its prerequisites are genuinely met, not a target to design
toward prematurely. Nothing in this document brings that gate closer
in time — it only specifies, precisely, what "ready" will mean when
the platform eventually approaches it.
