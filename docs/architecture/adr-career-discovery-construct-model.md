# ADR: Career Discovery measures orientation, not competence

**Status:** Proposed — awaiting owner approval
**Date:** 2026-07-28
**Related:** [`adr-security-competency-product-separation.md`](./adr-security-competency-product-separation.md) · [Security Career Discovery v3.0 document set](../assessment/career-discovery/README.md)
**Resolves:** finding F-15 in the [current-state audit](../assessment/career-discovery/current-state-audit.md)

## Context

Three construct models exist in this repository. All three are real, all three are referenced by live documentation, and **no document decides between them**:

| Model | Shape | Status |
|---|---|---|
| Assessment DNA | 10 domains / 30 competencies / **12 Dimensions (D1–D12)** | Approved "constitutional", zero implementation |
| Career Guidance legacy | **14 `DimensionId`s** / 19 competencies | Live, frozen, 13 completed runs |
| Security Competency Core | **12 SCC constructs** / 48 facets | Merged in PR-A; schema live, no content authored |

Assessment DNA Doc 03 §5 explicitly reconciles the first two and declares itself *"the model for everything built from here forward."* Six days later the Security Competency Platform authored a third set from scratch, and the ADR that authorised it never mentions Assessment DNA. Assessment DNA Doc 10 forbids exactly this: *"No later stage may contradict an earlier one's scientific foundation… revise the foundational document through the same rigor, not quietly override it."*

A specification for Career Discovery v3.0 must pick a construct vocabulary. Whatever it picks resolves this contradiction implicitly. It is better to resolve it explicitly.

The three models are also not variants of one another:

- The legacy 14 are **orientation and preference vectors** used to match professions. Five are structurally preference-only. There is no integrity construct among them.
- The DNA 12 are **latent psychological constructs** intended for competence estimation.
- The SCC 12 are **occupational competences** for employer-facing measurement.

Mapping any one onto another loses the distinction that makes it useful. The failure this produced is concrete: in the live build, one preference item (`q16`) drives four *orientation* dimensions, and three *eligibility gates* then read them. Preference became eligibility because the model had no vocabulary for the difference.

## Decision

**The three models are not competing answers to one question. They answer three different questions, and each owns exactly one.**

### 1. Assessment DNA — the method and ethics reference framework

Assessment DNA governs **how** content is authored and **what may be claimed**: the trainable/fixed trichotomy, the minimum-evidence floor, the evidence-class taxonomy, the fairness definition, the AI boundary, the duty of honest limitation disclosure.

It supplies **vocabulary to neither product**. Its twelve Dimensions remain a reference framework, not a measured construct set. This is a demotion from "the model for everything built from here forward" — and it is deliberate, because in the year since that claim was made no product adopted the vocabulary, while every product adopted the principles.

### 2. Security Competency Core (SCC-01…SCC-12) — occupational competence

Employer-facing, high-stakes. Owns the employer product. Unchanged by this ADR.

### 3. Career Orientation axes (CDA-01…CDA-08) — career direction and fit

**New.** Candidate-facing, low-stakes, self-directed. Owns Career Discovery.

Career Discovery does not measure how *good* someone is at anything. It measures **where they are likely to thrive** — which is a question about fit between a person's orientation and a kind of work, not a question about capability. These are different constructs and they need different names, different items, different scoring and different report language.

The eight axes are defined in the [Career DNA Model](../assessment/career-discovery/security-career-dna-model-v3.0.md).

### 4. The legacy 14 are retired with the instrument, not migrated

`public-career-assessment` is retired for new runs when v3.0 launches. Its 13 historical runs stay readable and exactly reproducible against their original content, mappings and engine version. The legacy 14 `DimensionId`s remain frozen in the codebase for that purpose and for no other. **No v3.0 axis is derived from, mapped to, or named after a legacy dimension.**

### 5. Behavioural signals inform language, never eligibility

Career Discovery collects four behavioural signals alongside the eight orientation axes. They produce **development notes and narrative framing** — "in the situations we showed you, you tended to…" — and are **structurally excluded from the matching computation**. No behavioural signal may gate, rank or exclude a recommendation.

This is the specific guard against repeating the `q16` failure in the opposite direction: last time preference leaked into eligibility; the obvious over-correction is to let behaviour leak into it instead.

### 6. Cross-model evidence flows at item level, with consent, one-directionally

When employer assessment evidence enriches a candidate's Career DNA `[Future]`, it does so **at Evidence Object level** — an item that was reviewed and tagged as loading on a career axis contributes its evidence. An SCC competency score is **never** imported as a career axis value.

Candidate Career DNA never flows to an employer, in any form, aggregated or derived.

## Consequences

**Positive.** The `q16` failure becomes structurally impossible: an item that measures orientation cannot feed a competence claim, because they are different construct sets with different tables and different report vocabulary. Each model can evolve at its own pace — SCC on its psychometric validation track, Career Discovery on its user-value track — without either blocking the other. Assessment DNA stops being cited as an unimplemented authority and starts being used as what it is genuinely good at: authoring discipline and ethical constraint. And the honest answer to "which model won?" becomes "none, because they were never competing."

**Negative / accepted.** Three construct vocabularies now exist deliberately rather than accidentally, and someone reading the repository cold must learn which is which — mitigated by this ADR being the single place that says so. Assessment DNA's authors intended their twelve Dimensions to be measured, and this ADR declines to measure them; that is a real reduction in scope for that work, and it is recorded rather than glossed. Career Discovery cannot reuse a single existing item, so the entire v3.0 bank must be authored from zero.

**Revisit triggers.** If pilot data shows the eight orientation axes are not empirically separable — a risk Assessment DNA Doc 11 §4 names for its own twelve — the axis set is revised through the same rigour, not quietly re-cut. If a psychometric specialist establishes that a specific SCC construct and a specific career axis measure the same thing, that is a documented specialist decision, not a refactor made in passing.

## Alternatives considered

**Adopt the Assessment DNA 12 for Career Discovery.** Rejected: they are latent constructs for competence estimation, and Career Discovery is not measuring competence. It would reproduce the original category error with better vocabulary. It would also require self-report for D1, D3 and D8 — which Assessment DNA's own Doc 03 §4 rates as weak evidence for exactly those.

**Reuse the SCC 12.** Rejected: it would make the candidate's private discovery profile structurally identical to the employer's competence measure, which is precisely the separation `adr-security-competency-product-separation.md` exists to enforce.

**Extend the legacy 14.** Rejected: four of them are single-item artefacts, their scales are incomparable (spans 2 to 21), and they carry no integrity construct. Extending them inherits every defect in audit findings F-1 through F-5.

**Pick one model and map the others onto it.** Rejected: the mapping is lossy in every direction, and a lossy mapping between a preference vector and a competence construct is how the original defect was introduced.
