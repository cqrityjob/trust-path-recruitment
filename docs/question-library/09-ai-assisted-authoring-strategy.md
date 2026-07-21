# Document 09 — AI-assisted Authoring Strategy

**Derives from:** [Assessment DNA — Future AI Assessment Strategy §1](../assessment-science/08-ai-assessment-strategy.md).
**Governing boundary, inherited wholesale, not re-derived:** AI explains and assists. Deterministic rules score. Humans decide and approve. Applied here specifically to the authoring and review workflow (Document 05), not to assessment delivery.

## 1. Why authoring is a distinct AI use case from the ones Assessment DNA Document 08 already covers

Assessment DNA Document 08 governs AI's role toward assessment
*results* (explanation, coaching, career guidance). This document
governs a different surface: AI assisting *content creation itself*,
before any respondent ever sees an item. The same non-negotiable
boundary applies (AI never decides), but the specific permitted
assistance and specific risks differ, which is why this document
exists separately rather than folding into Document 08 of that set.

## 2. What AI may do

**Suggest wording.** Propose phrasing improvements for clarity (Document
03 §1) or readability (§6) — a drafting aid, always presented as a
suggestion an author accepts, edits, or rejects, never auto-applied
without author review.

**Identify ambiguity.** Flag places where an item's stem or response
options could plausibly be read more than one way, or where expert
raters might disagree (Document 03 §7) — a detection aid, surfacing a
concern for a human reviewer to resolve, not resolving it itself.

**Improve readability.** Suggest simplifications where reading level
(Document 03 §6) exceeds what is appropriate for the target
respondent population, without stripping the professional realism
Document 03 §2 requires — a genuine tension AI suggestions must be
checked against by a human author, since an AI optimizing purely for
simplicity could flatten realism.

**Suggest evidence coverage.** Given the current state of the library
(Document 06's coverage-gap monitoring, Document 02's diversity
principle), identify where a proposed new item would fill or fail to
fill a genuine gap — a research/analysis aid over existing metadata
(Document 04), not a judgement about whether the item is good.

**Identify duplicates.** Flag items whose content is substantively
similar to an existing library item (Document 02 §7's near-duplicate
concern) — a detection aid supporting the redundancy-avoidance
principle, with the human author or reviewer deciding whether the
similarity is a genuine duplicate or a legitimately distinct variant
(Document 06 §4's shared-family model depends on deliberate,
reviewed variants existing — an AI flagging every family member as a
"duplicate" would be a false positive the workflow must guard against).

## 3. What AI must never do

- **Independently approve content at any Lifecycle stage** (Document
  05) — every gate (Scientific Review, Expert Review, Psychometric
  Validation, Production) requires human sign-off; AI may prepare
  material for that review (a draft summary, a flagged concern list)
  but never substitutes for the reviewer's own judgement, and never
  advances an item's `content_status`/review status on its own
  authority.
- **Author an item's scientific rationale without human verification**
  — the Scientific Reference metadata (Document 04 §13) and Evidence
  Mapping traceability (Document 02) must be confirmed by a human
  reviewer even if AI proposed them, because an incorrect but
  plausible-sounding construct justification is a more dangerous
  failure mode than an obviously wrong one.
- **Generate an expert-derived key** for SJT/Ranking/Forced-Choice
  items (Document 05 Stage 3) independently — the key's authority
  comes specifically from genuine subject-matter-expert judgement
  (Document 03 §7); an AI-suggested key is, at most, a draft starting
  point for that expert review, never a substitute for it.
- **Make a retirement or revision decision** (Document 05 Stages 8–9)
  autonomously, even when monitoring data (Document 05 Stage 7)
  clearly suggests one is warranted — AI may surface the monitoring
  finding; a human makes the call.
- **Blur provenance.** Every instance of AI assistance must be
  recorded in the item's Author metadata (Document 04 §11) — an item
  should never appear to be purely human-authored when AI materially
  contributed content, nor purely AI-generated in a way that obscures
  which human is accountable for the final approved version.

## 4. Why this boundary matters more for authoring than it might first appear

Assessment results have a single human decision-maker per use (an
employer reviewing one report). Authoring content that AI assisted
with can, once approved, be administered to potentially thousands of
respondents across many future Blueprints (Document 00 §6's "core
intellectual asset" framing) — an unreviewed error introduced by AI at
the authoring stage has vastly more leveraged impact than an error in
a single explanation output. This is the specific reason authoring
requires its own, explicitly stated version of the AI boundary rather
than assuming Assessment DNA Document 08's general statement
obviously covers it.

## 5. Relationship to the Lifecycle

Every permitted AI assistance in §2 maps to Stage 1 (Draft) or as
preparatory input to Stages 2–3 (Scientific/Expert Review) of Document
05's Lifecycle — AI accelerates getting a well-formed candidate item
*to* human review faster and with fewer obvious defects; it does not
participate in any gate itself. This is a deliberate design choice:
the Lifecycle's gates exist specifically to catch what unaided
authoring might miss, and AI assistance should reduce how often gates
catch avoidable problems, not reduce how rigorously the gates
themselves are applied.
