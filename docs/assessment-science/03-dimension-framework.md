# Document 03 — Assessment Dimension Framework

**Derives from:** [Document 00](./00-security-excellence-model.md), [Document 02](./02-competency-framework.md).
**Scope note:** Dimensions are the latent-construct layer beneath every competency and every future CQrityjob product — assessment, Career Intelligence matching, and workforce mapping all read from the same dimension layer.

## 1. What a Dimension is, and how it differs from a Competency

A **Competency** (Document 02) is an observable, job-relevant behavior
cluster — something you can watch someone do and judge against
indicators. A **Dimension** is the underlying psychological construct
that, combined with knowledge and skill, produces that behavior. This
is a standard distinction in competency-modeling practice (comparable
to how frameworks like SHL's "Great Eight" sit on top of underlying
ability and personality constructs) — the reason CQrityjob keeps the
two layers separate rather than collapsing them:

- **Competencies are role-contextual and combinable.** "Documentation
  Accuracy & Timeliness" (E1) draws on Conscientiousness (a Dimension)
  *and* Documentation technique (learned skill) *and* the specific
  procedural knowledge of the role. Two people with identical
  Conscientiousness can differ in E1 purely on trained skill.
- **Dimensions are the stable measurement target; Evidence Signals are
  how they get measured.** In the locked architecture, an Evidence
  Signal is an atomic, weighted, polarity-signed observation a
  Question Version can produce (Phase 1, `evidence_signals`). Signals
  are the *instrument-level* unit; Dimensions are what a *cluster* of
  signals, properly weighted, is meant to estimate. This is the
  correct place in the model for "what does this question actually
  measure" to be answered precisely, rather than left implicit.
- **This separation is what makes cross-purpose reuse possible.** The
  same Dimension estimate can feed a Standard Competency Result
  (recruitment), a career-guidance narrative (career), and a
  development recommendation (annual review) — three different
  *applications* of one *measurement*, exactly the platform's stated
  "operating system" goal.

Per Document 01 §3, Dimensions describe **work-relevant behavioral
tendencies**, never "who a person is." A Dimension score is never
presented as an identity claim.

## 2. The dimension set

Twelve dimensions, grouped by whether they are foundational (present
in nearly every security role's requirements) or advanced (load-bearing
mainly for specific roles/levels, per Document 07). Each links back to
the Document 00 construct cluster and the Document 02 domains it
underlies.

### Foundational dimensions

**D1. Attentional Control** — capacity for sustained, self-directed
attention without external cueing. Underlies Domain A (Vigilance &
Situational Awareness). Evidence: behavioral/performance-based
measures are markedly stronger than self-report here (self-rated
vigilance correlates poorly with measured sustained-attention
performance in the vigilance-task literature) — see Document 04.

**D2. Judgement Under Uncertainty** — the style and quality of
decisions made with incomplete information. Underlies Domain B.
Evidence: situational judgement and dilemma-based methods outperform
self-rating substantially for this dimension (Document 04) — people
are poor predictors of their own decision quality under conditions
they haven't faced yet.

**D3. Integrity Orientation** — disposition toward honest, rule-
consistent conduct when unobserved. Underlies Domain C. Evidence: the
single dimension with the widest published gap between self-report
validity (weak) and behavioral/situational-evidence validity
(comparatively strong) — Document 04 treats this as the dimension
requiring the most deliberate evidence-method choice.

**D4. Conscientiousness / Rule Orientation** — disposition toward
order, thoroughness, and dependable follow-through. Underlies Domain E
(Documentation & Structured Thinking) and contributes to Domain H.
Corresponds to the well-established Conscientiousness factor in the
Five-Factor Model of personality — one of the most consistently
validated predictors across the general personnel-selection literature,
not a CQrityjob-specific claim.

**D5. Emotional Stability & Stress Resilience** — capacity to
maintain functional judgement and controlled behavior under acute and
chronic stress. Underlies Domain F. Corresponds to (low) Neuroticism
in Five-Factor terms; in security-specific contexts this dimension is
better measured through scenario/behavioral evidence than the generic
personality-inventory item pool, because generic items were not
written against this population's actual stressors.

**D6. Communication Clarity & Style** — capacity to convey information
accurately and appropriately calibrated to audience and urgency.
Underlies Domain D.

### Advanced / role-weighted dimensions

**D7. Leadership Orientation** — disposition toward taking
responsibility for others' outcomes and exercising influence
appropriately (not mere dominance). Underlies Domain G. Advanced
because it is load-bearing primarily for supervisory/management roles,
though a baseline is relevant everywhere (informal leadership,
willingness to speak up).

**D8. Analytical & Systematic Reasoning** — disposition and capability
for structured, evidence-based reasoning over complex or ambiguous
information. Underlies Domain I, and the advanced form of Domain B.
Advanced because it is heavily loaded for investigation/intelligence/
risk roles and less differentiating for purely operational roles,
where B1–B2 (calibrated, fast judgement) matter more than I1–I3
(slow, thorough analysis) — these are related but genuinely distinct
performance modes (fast/intuitive vs. slow/analytical), consistent
with dual-process theories of judgement in decision-science research.

**D9. Risk Perception & Threat Sensitivity** — the accuracy and
calibration (not merely the intensity) of a person's risk read on a
situation. Underlies Domain B3 and Domain I. Distinguishes accurate
risk perception from generalized anxiety or generalized recklessness
— both of which *feel* like strong opinions about risk but are poorly
calibrated to actual severity; assessment must be designed to
distinguish these (Document 04, Document 09 on construct validity).

**D10. Cognitive Flexibility & Adaptability** — capacity to update
strategy and expectations as conditions change, without losing the
underlying principle. Underlies Domain F3 and is directly the
Document 00 §3 "adaptability with fidelity" construct at the trait
level.

**D11. Learning Orientation** — disposition toward seeking, using, and
acting on new information and feedback about one's own performance.
Underlies Domain J. Corresponds loosely to Openness to Experience
combined with a growth rather than fixed mindset toward one's own
ability (a distinction with real empirical support in the
motivation/learning literature) — CQrityjob measures the behavioral
form (Domain J indicators), not the abstract trait, per Document 01
§3's rejection of personality-as-identity framing.

**D12. Interpersonal Influence & Diplomacy** — capacity to affect
others' behavior and cooperation without formal authority, and to
navigate cross-functional relationships. Underlies Domain D3 and G2.
Advanced because it differentiates most clearly at coordinator/
corporate/public-sector levels where informal influence is a larger
share of effectiveness than at entry-level operational posts.

## 3. Relationships and interaction effects between dimensions

Dimensions are not independent, and some combinations produce
meaningfully different real-world behavior than either dimension
alone would predict — this is why the platform's Scoring Profile
weighting (locked architecture) operates on *evidence signals* feeding
dimensions, not simple dimension averages, and why interpretation
(Document 08's AI-explanation layer) must be able to reason about
combinations, not just report each dimension in isolation.

- **D9 (Risk Perception) × D5 (Emotional Stability).** High risk
  sensitivity with low emotional stability tends to manifest as
  chronic over-escalation and alarm fatigue in the surrounding team
  (a miscalibration in the *opposite* direction from D9 alone
  predicting good calibration) — the combination, not either dimension
  alone, predicts the B1 (Calibrated Escalation) warning pattern.
- **D7 (Leadership Orientation) × D3 (Integrity Orientation).** High
  leadership orientation with weak integrity orientation is a
  materially different, and higher-risk, profile than either alone —
  this combination is the individual-level precursor to the "team
  standard erodes" failure mode in Domain G1, and deserves specific
  attention in any Requirement Profile for supervisory hiring
  (Document 07), not just a high G1 competency score.
- **D8 (Analytical Reasoning) × D2 (Judgement Under Uncertainty).**
  These can trade off in time-constrained situations: strong D8
  without matching speed can manifest as analysis-paralysis under the
  time pressure B2 actually requires. Roles differ in how much of each
  they need (Document 07) — this is a genuine profile distinction
  ("investigator" vs. "first responder" cognitive style) rather than
  one dimension simply being "better."
- **D10 (Cognitive Flexibility) × D4 (Conscientiousness).** Very high
  flexibility with low conscientiousness risks drift away from
  procedure disguised as "adapting"; very high conscientiousness with
  low flexibility risks rigid failure in novel situations. The
  Document 00 §3 "adaptability with fidelity" construct is precisely
  the *balance* of these two, not either in isolation — a scoring or
  interpretation model that reports them independently without noting
  the interaction would miss this.
- **D1 (Attentional Control) × D5 (Emotional Stability).** Sustained
  vigilance degrades under chronic stress load faster than either
  dimension's baseline level alone would predict — relevant to F2
  (Recovery & Emotional Regulation) and to shift/rotation design,
  which is outside this platform's scope but worth flagging as an
  organizational-design implication of the assessment data (Document
  08, employer insights).

## 4. Evidence quality by dimension (summary; full method comparison in Document 04)

| Dimension | Self-report reliability | Stronger alternative |
|---|---|---|
| D1 Attentional Control | Weak | Performance/behavioral evidence, consistency checks |
| D2 Judgement Under Uncertainty | Weak–moderate | Situational judgement, dilemma questions |
| D3 Integrity Orientation | Weak | Behavioral history, situational judgement, consistency checks |
| D4 Conscientiousness | Moderate | Behavioral evidence strengthens further |
| D5 Emotional Stability | Moderate | Scenario-based and behavioral evidence |
| D6 Communication Clarity | Moderate | Behavioral/exercise-based evidence |
| D7 Leadership Orientation | Moderate | Situational judgement, ranking exercises |
| D8 Analytical Reasoning | Weak | Dilemma/analytical exercises (closer to ability testing than personality) |
| D9 Risk Perception | Weak–moderate | Situational judgement (calibration is hard to self-assess) |
| D10 Cognitive Flexibility | Moderate | Behavioral evidence, scenario variation |
| D11 Learning Orientation | Moderate | Behavioral history stronger where available |
| D12 Interpersonal Influence | Moderate | Situational judgement, ranking exercises |

The general pattern — self-report is weakest exactly where the stakes
are highest (integrity, judgement, risk perception) — is the central
reason Document 04 exists as its own document rather than being
folded into a generic "question types" note.

## 5. Explicit reconciliation with existing systems

This is a genuine, necessary reconciliation, not a formality — three
places in the current repository already use the word "dimension" or
a closely related concept, and this framework must state precisely how
each relates to it.

**(a) The Blueprint Engine (locked architecture, Phase 1).** The
schema's actual aggregation path is Evidence Signal → Scoring Profile
Version weight → weighted total (`compute_standard_result()`); there
is no separate `dimensions` table in Phase 1. This framework's twelve
Dimensions are the **content-authoring organizing layer**: when
Phase 2B content authors design Evidence Signals and their Scoring
Profile weights, they should group and label signals by which
Dimension(s) they estimate, so that (i) authoring stays disciplined
(every signal has a stated measurement target) and (ii) explanation
generation (Document 08) can report results at the Dimension level,
not only as an opaque weighted total. Whether this grouping becomes a
first-class schema table or stays a content-authoring convention is a
Phase 2B/3 implementation decision, not decided here — this document
fixes the *scientific* model; it does not reopen the locked schema.

**(b) The Career Intelligence Graph's `cig_assessment_dimensions` and
`cig_assessment_signals.dimension_id`.** Verified directly against the
schema: `cig_assessment_dimensions` already exists (slug, bilingual
title/description, `content_status`, `graph_version`) and
`cig_assessment_signals` already carries a `dimension_id` foreign key
into it. This is schema-ready, content-empty infrastructure — exactly
the home this framework's twelve Dimensions are intended to
eventually populate, once Phase 2B/3 activation decisions are made.
This document does not assume that activation; it defines what should
go in those rows when it happens.

**(c) The legacy public 16-question assessment's 14 hardcoded
`DimensionId`s** (`src/lib/career-assessment/types.ts`:
`operational_orientation`, `leadership_orientation`,
`analytical_orientation`, `technical_orientation`,
`strategic_orientation`, `risk_awareness`, `communication`,
`service_orientation`, `conflict_management`,
`investigation_orientation`, `structure_documentation`,
`independent_decision_making`, `teamwork`,
`learning_development`). These map recognizably, if approximately,
onto this framework's dimensions (e.g. `risk_awareness` ≈ D9,
`leadership_orientation` ≈ D7, `structure_documentation` ≈ D4,
`independent_decision_making` ≈ D2, `learning_development` ≈ D11) —
which is a useful sanity check that the legacy, intuition-built set
and this framework's more systematically derived set point at similar
underlying reality. **The legacy set is not superseded, replaced, or
touched by this document.** It remains the public assessment's own,
frozen, narrower instance of dimension measurement, exactly as the
locked architecture's convergence-path decision already established
(shared infrastructure later, no forced migration now). This
framework is the model for *everything built from here forward.*

## 6. What this document deliberately does not do

It does not assign Evidence Signals to Dimensions (Phase 2B content
work), does not weight Dimensions by role (Document 07, and even
there: reasoning only, no numbers), and does not specify measurement
scales (Document 05). It fixes what should be measured and why it
holds together as one coherent model.
