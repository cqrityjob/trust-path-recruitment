# Document 09 — Reliability & Validity Strategy

**Derives from:** [Document 06 §6–7](./06-blueprint-principles.md), [Document 01 §8](./01-science-philosophy.md).
**Scope note:** the scientific quality-assurance framework for every current and future Blueprint, applied continuously as real usage data accumulates, not a one-time certification.

## 1. Why this is a separate document

Document 06 states reliability and validity as *construction*
principles (what a Blueprint must be designed to support). This
document defines how those properties are actually **measured and
monitored** once real data exists — the difference between designing
for quality and verifying it, which commercial vendors typically
publish as technical manuals separate from their product descriptions.
CQrityjob should hold itself to the same separation, not treat design
intent as equivalent to validated performance.

**Positioning against commercial-vendor practice:** established
vendors (SHL, Hogan, Saville, Matrigma, Thomas International, Aon)
typically publish validity evidence as periodic technical-manual
updates against a largely fixed, general-purpose item bank accumulated
over decades. CQrityjob's approach differs deliberately: because the
architecture versions every Question/Module/Blueprint immutably
(Document 06 §6, §8–9), validity evidence can be tied to an exact,
reproducible instrument version rather than to a slowly-drifting
"current form" of a legacy test, and because the platform is
industry-specific rather than general-purpose, validity work is
concentrated on security-relevant criteria (Document 07) from the
outset rather than inherited from unrelated occupational validation
studies and assumed to transfer.

## 2. Validity types and how each applies

**Content validity** — does the item set adequately represent the
construct domain it claims to measure? Assessed at design time via
Document 06 §3's coverage-rationale requirement and, ideally,
independent subject-matter-expert review against Document 02's
competency definitions — a design-time check, not a statistical one.

**Construct validity** — does an item actually measure the dimension
it claims to (Document 03), and not something else entirely (reading
comprehension, test-taking sophistication, translation artifacts)?
Requires statistical analysis once response data exists: item-to-scale
correlation, factor structure checks (do items intended for the same
dimension actually load together), and differential item functioning
analysis across demographic and language subgroups (directly connects
to §8 below).

**Criterion validity** — does the assessment result correlate with an
independent, real-world measure of the same construct collected
separately (e.g. supervisor ratings, documented incident history)?
Requires paired assessment-and-outcome data, which does not exist yet
for this platform — explicitly flagged as a research gap requiring
pilot studies (Document 11), not assumed.

**Predictive validity** — does the assessment result, measured before
employment/promotion, predict later job performance or outcomes?
The single most operationally important validity type for
recruitment and promotion use cases, and the hardest to establish: it
requires longitudinal data (assessment now, outcome months or years
later) and cannot be shortcut. This is the primary reason Document 11
recommends pilot studies before large-scale claims of predictive
power are made.

**Face validity** — does the assessment *appear* relevant and fair to
the people taking it and the organizations using it? Not a
statistical property, but operationally important: poor face validity
damages candidate experience and employer trust even when the
underlying statistics are sound, and Document 04 already flags this as
a specific risk for dilemma questions and consistency checks if
poorly explained.

## 3. Reliability types and how each applies

**Internal consistency** — do items intended to measure the same
dimension correlate with each other (e.g. via Cronbach's alpha or
comparable modern item-response-theory-based reliability estimates)?
Computable as soon as a Blueprint Version has enough completed runs;
should be monitored per Dimension, not only per Blueprint as a whole,
since a Blueprint can be reliable in aggregate while one dimension
within it is not.

**Test-retest reliability** — does the same person produce a similar
result on repeated administration, within an interval short enough
that real change is unlikely? Expected reliability differs by
dimension type (Document 06 §6) — trait-like foundational dimensions
(D3, D4, D5) should show high retest stability; experience-updated
dimensions (D2, D8, D11) legitimately shift and should not be judged
against the same stability bar. Designing the retest study itself
requires care: too short an interval risks practice/memory effects
contaminating the estimate; too long conflates instability with real
change.

**Inter-rater reliability** — relevant specifically wherever a human
or AI-assisted reviewer scores free-text or open-ended content (e.g.
dilemma-question justifications, per Document 04's noted scoring
complexity for that method) — do independent reviewers reach the same
conclusion from the same response? Where this cannot be established at
acceptable levels, the item type should not be scored numerically at
all; it should remain narrative/contextual only, per Document 04's
own caution about that method's scoring difficulty.

## 4. Measurement error

Every score is an estimate with a margin of error, not an exact value
— a Standard Competency Result should eventually be reportable with an
appropriate confidence/precision framing (e.g. a range rather than a
false-precision single number) once enough data exists to estimate
that margin per Dimension. Treating a raw weighted total as
error-free is a face-validity and, more importantly, a scientific
integrity risk this strategy explicitly guards against — a research
gap and roadmap item (Document 11), not solved by this document alone.

## 5. Bias

Two distinct senses, both must be checked, neither implies the other:

- **Statistical bias**: does the instrument systematically
  over- or under-estimate the true construct level for a particular
  subgroup, independent of fairness concerns (a measurement-accuracy
  question).
- **Content/construction bias**: does item wording, scenario framing,
  or response-option construction disadvantage a group for reasons
  unrelated to the construct being measured (e.g. cultural assumptions
  embedded in a scenario, idiom that doesn't translate). Checked via
  structured expert review at authoring time and via differential item
  functioning analysis once data exists (§2, construct validity).

## 6. Fairness

As stated in Document 01 §8: fairness is measured as **comparable
predictive validity across groups**, not merely comparable average
scores or pass rates, both of which can mask or force miscalibration
in the opposite direction. Adverse-impact monitoring (are pass/
selection rates markedly different across protected groups, and if so,
is that difference justified by genuine, validated job-relevance)
should be a standing, recurring analysis once real usage data exists,
not a one-time launch check.

## 7. Cross-cultural and cross-jurisdictional validity

Directly relevant given the platform's stated global ambition and the
international/multi-jurisdictional nature of several environments in
Document 07 (Maritime, Aviation, and multinational Corporate Security
in particular): a construct that is valid and an item that is
well-understood in one country/language/regulatory context is not
automatically valid in another. Required practice, not optional:
professional translation and back-translation (not literal machine
translation) for any content deployed in a new language; local
subject-matter-expert review for regulatory/procedural content that
genuinely differs by jurisdiction (Document 02 H2); re-validation of
statistical properties (§2–3) per major market before treating results
as comparable across markets, rather than assuming a validated
instrument travels automatically.

## 8. How future assessments should be validated — the standing process

1. **Design-time**: content validity via Document 06 §3's coverage
   rationale and expert review; face validity via candidate/employer
   feedback where feasible before wide release.
2. **Early-data stage**: internal consistency and construct validity
   checks per Dimension as soon as a meaningful number of completed
   runs exist; bias/DIF screening as soon as subgroup sample sizes
   allow.
3. **Ongoing**: test-retest and inter-rater reliability monitoring;
   adverse-impact monitoring as a recurring, not one-time, analysis.
4. **Longitudinal (requires dedicated pilot design, Document 11)**:
   criterion and predictive validity studies, the only validity types
   that require outcome data collected after the fact.
5. **Governance consequence**: content whose validity evidence fails
   to support it should be revised or retired (Document 06 §9), with
   the decision driven by evidence, not by sunk authoring cost —
   restated from Document 01 §8 because it is the operational
   conclusion this entire document exists to enable.
