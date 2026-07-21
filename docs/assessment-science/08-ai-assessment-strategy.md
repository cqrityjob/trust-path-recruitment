# Document 08 — Future AI Assessment Strategy

**Derives from:** [Document 01 §9–10](./01-science-philosophy.md), the locked architecture's non-negotiable principles.
**Scope note:** governs every future AI capability built on assessment evidence — explanation, coaching, career guidance, a future Security Manager Assistant, and partner/white-label/API products — not a single feature.

## 1. The governing boundary, stated once and applied everywhere below

**AI explains. Deterministic rules calculate. Humans decide.**

Concretely, and without exception:

- AI never computes, adjusts, weights, or influences a Standard
  Competency Result or an Organisation Requirement Match. Those are
  produced exclusively by the deterministic Scoring Profile pipeline
  (locked architecture).
- AI never outputs an approve/reject/hire/promote/compliant
  recommendation framed as a decision. It may summarize evidence a
  human decision-maker should weigh; it may never resolve the
  weighing itself.
- AI has no code path, in any product built on this framework, that
  writes to a score or result field. This is already structurally true
  in the locked schema (no AI dependency exists in Phase 1; the
  reserved `ai_narrative` column is additive and separate from
  `standard_result`/`requirement_match`) and must remain true as AI
  capability is added.
- Every AI output that touches an assessment result must be
  traceable to the deterministic evidence underlying it — an AI
  explanation that cannot be traced back to specific Evidence Signals
  and Dimension results is not an explanation, it is a hallucination
  risk, and must not ship.

This is not a policy layered on top of the science — it is the same
principle Document 01 states as an ethical commitment and the locked
architecture enforces structurally. This document is where it becomes
concrete per use case.

## 2. Use case: Explanation

**What AI may do:** translate a Standard Competency Result and
Organisation Requirement Match into plain-language narrative — why a
particular Dimension result looks the way it does, in terms of the
evidence that produced it, at a reading level appropriate to the
audience (candidate vs. employer vs. HR/compliance reviewer).
**What AI must not do:** introduce any evaluative claim not
traceable to the deterministic result (e.g. speculating about causes
not evidenced in the data); soften or amplify a result's framing in a
way that changes its practical meaning to the reader.
**Validation requirement:** explanation text should be checkable
against the underlying Evidence Signal/Dimension data it claims to
describe — a concrete, testable property, not merely a style
guideline.

## 3. Use case: Coaching and development plans

**What AI may do:** given a Standard Competency Result, suggest
development activities targeted at the specific competencies/
dimensions where evidence indicates room for growth — critically,
respecting the trainable-vs-largely-fixed distinction from Document 00
§4. An AI coaching output that recommends "practice" for a largely
fixed disposition (e.g. treating an Integrity Orientation concern as
something a training module fixes) is a scientific error the strategy
must guard against explicitly, not merely a suboptimal suggestion.
**What AI must not do:** present a development plan as a guarantee of
future result improvement; recommend development activity unconnected
to the actual evidence pattern (generic filler coaching).
**Design implication:** the AI coaching layer needs access to the
trainability classification per competency (Document 00 §4, Document
02's per-competency development-potential field) as a hard input, not
just the raw result.

## 4. Use case: Learning recommendations

**What AI may do:** connect a development need to specific,
appropriately-scoped learning content or activities (future content
partnerships, internal learning modules) — a recommendation, not an
assignment.
**What AI must not do:** imply the learning content itself is
validated to close the gap without evidence of that (a research gap,
Document 11) — recommendations should be framed with appropriate
epistemic humility until the platform has outcome data connecting
specific learning content to measured improvement.

## 5. Use case: Career guidance

**What AI may do:** connect a Career Profile's Dimension/competency
pattern to profession fit, consistent with the existing Career
Intelligence Engine's evidence-based matching approach (Current Fit +
Potential) — the AI's role is explanation and narrative framing of a
match the deterministic engine already computed, not the matching
decision itself.
**What AI must not do:** generate profession recommendations
independent of the deterministic matching pipeline; present potential
match strength with false precision beyond what the underlying
evidence supports.

## 6. Use case: Interview preparation

**What AI may do:** help a candidate understand the kind of judgement
and evidence a given role's Blueprint is designed to surface, and
practice articulating relevant experience — genuinely useful, and
distinct from "teaching the test" if scoped correctly (see coachability
note below).
**What AI must not do:** reveal specific scored item content, keys, or
weighting in a way that would compromise the instrument's validity for
future candidates (directly connects to Document 06's versioning/
retirement principle — compromised content should be retired, not
silently tolerated because AI-assisted prep made it common knowledge).

## 7. Use case: Employer insights (workforce/organisational intelligence)

**What AI may do:** aggregate patterns across an organization's
assessed population (e.g. "this site shows a concentration of lower
D1 vigilance results in the overnight shift" — an organizational-design
signal, foreshadowed in Document 03 §3) into narrative insight for
employer decision-makers.
**What AI must not do:** identify or imply conclusions about specific
identifiable individuals outside the access controls and purpose
limitations already governing individual results (Document 01 §7);
aggregate-level insight must respect the same privacy/purpose
boundaries as individual results, not become a workaround for them.

## 8. Use case: Future Security Manager Assistant / partner and white-label products

Not built now (explicitly out of scope for the current build, per the
locked architecture's MVP boundary). The strategic requirement stated
here for when it is scoped: any future AI assistant that touches
assessment evidence inherits every boundary in §1–§7 without
exception, regardless of product surface (first-party, partner API, or
white-label) — the boundary travels with the data, not with the
product name.

## 9. What makes this trustworthy over the standard "AI in HR" concern

The reason this boundary is credible rather than a marketing claim: it
is enforced at the schema level (no field for AI to write a decision
into exists, verified in the locked architecture, not merely
promised), and every use case above is defined as narrative/explanatory
output *layered on top of* an already-complete deterministic result,
never as an input to computing that result. This is the same
structural discipline — process is code, content is data — that
governs the rest of the platform, applied to AI as one more kind of
"process" that must never be allowed to become a hidden decision
point.
