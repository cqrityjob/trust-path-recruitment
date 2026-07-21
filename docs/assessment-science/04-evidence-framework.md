# Document 04 — Evidence Framework

**Derives from:** [Document 00](./00-security-excellence-model.md), [Document 03](./03-dimension-framework.md).
**Scope note:** governs how evidence is collected for every future CQrityjob use case (recruitment, career, annual review, supplier validation), not only the public assessment.

## 1. Purpose

Different evidence-collection methods have different, well-documented
reliability and validity characteristics depending on *what* is being
measured — there is no single "best" method in the abstract. This
document compares the methods available to the Blueprint Engine's
Question Library, explains when each is scientifically strongest, and
states how each maps onto the locked architecture's Evidence Signal
concept (`evidence_signals`, `question_version_evidence_signals`,
weighted and polarity-signed). No specific questions are written here.

## 2. Method comparison

### Self-Rating

**What it is:** the respondent rates themselves directly against a
statement or scale ("I remain calm under pressure").
**Strengths:** cheap to produce, fast to complete, useful for
constructs the respondent has genuine privileged access to (e.g.
preferences, interests, self-described work style) — the public
assessment's career-guidance use case leans on this appropriately,
since interest/preference genuinely is self-known.
**Weaknesses:** the weakest method for exactly the constructs that
matter most in security work (Document 03 §4): social desirability
distortion is well-documented and largest for integrity, judgement,
and risk-related items, where the "correct" answer is often obvious to
the respondent. Also vulnerable to self-insight limits — people are
frequently poor predictors of their own behavior in situations they
haven't faced (a robust finding across the judgement-and-
decision-making literature, not specific to security).
**Evidence Signal mapping:** direct — the response value itself is the
signal, typically with a single, low-inferential-distance weight.
**Best use:** preference/interest/career-guidance constructs (Domain J
self-direction, general work-style fit); a *component* of foundational
dimensions but never the sole source for D2, D3, D9 (Document 03 §4).

### Behavioural Questions (Past-Behavior)

**What it is:** the respondent describes actual past conduct in a
specific, real situation ("Describe a time you noticed something that
turned out to matter").
**Strengths:** grounded in real behavior rather than hypothetical
self-assessment; substantially harder to answer purely by guessing the
"correct" answer than self-rating, because it requires a
constructed, specific account. Long-established in structured-
interview research as more predictive than unstructured or purely
self-rated approaches.
**Weaknesses:** vulnerable to selective/embellished recall; requires
either free-text response (harder to score deterministically at
scale) or well-constructed multiple-choice behavioral-frequency items;
past behavior in one context predicts future behavior in a similar
context better than in a very different one (specificity limits
generalization).
**Evidence Signal mapping:** typically several signals per item
(frequency/quality of the described behavior maps to multiple
dimension-relevant signals), weight calibrated to how directly the
described behavior implicates the target dimension.
**Best use:** D3 (Integrity), D4 (Conscientiousness), D11 (Learning
Orientation) — dimensions where a real behavioral track record is a
meaningfully stronger signal than a hypothetical response.

### Situational Judgement (SJT)

**What it is:** a realistic scenario with several response options,
scored against expert-derived "most/least effective" judgements rather
than a single objectively correct answer.
**Strengths:** one of the best-validated method classes in
personnel-selection research for predicting job performance broadly,
and specifically strong for judgement, decision-making, and
interpersonal constructs (D2, D7, D9, D12) because it presents a
realistic decision context rather than asking about it abstractly;
generally shows smaller subgroup differences than cognitive-ability
testing, a genuine fairness advantage.
**Weaknesses:** construction-intensive (requires real subject-matter
expert input to derive defensible "most/least effective" keys, not
just plausible-sounding options); scenario realism can date quickly if
not maintained; coachability is a known concern if item content
becomes public (mitigated by Document 06's versioning/retirement
principles).
**Evidence Signal mapping:** each response option carries its own
signal weight/polarity combination — this is the method class the
Evidence Signal schema (per-option weighting) was clearly designed to
support well.
**Best use:** the primary method for D2, D7, D9, D12, and the
advanced/operational forms of D8 — CQrityjob's most heavily-weighted
method class for job-relevant judgement constructs, consistent with
its strong standing in the broader selection-method validity
literature (Schmidt & Hunter's meta-analytic work on selection-method
validity ranks structured, job-relevant methods, SJT among them,
considerably above unstructured self-report).

### Dilemma Questions

**What it is:** a forced choice between two or more competing,
genuinely valid considerations (e.g. following procedure exactly vs.
protecting an outcome the procedure didn't anticipate) — distinct from
SJT in that there may be no single "most effective" answer, only a
trade-off the respondent must resolve and, ideally, explain.
**Strengths:** uniquely suited to surfacing D3 (Integrity) and D9
(Risk Perception) trade-off reasoning that a simple "most effective"
key cannot capture, because real ethical and risk trade-offs often
don't have one objectively correct resolution — the value is in
*how* the trade-off is reasoned through.
**Weaknesses:** harder to score deterministically without an
accompanying free-text justification (which then requires either
expert or AI-assisted review, raising the AI-boundary question
addressed directly in Document 08); risk of appearing to have a
"trick" answer if poorly constructed, which damages face validity
(Document 09).
**Evidence Signal mapping:** the forced-choice direction itself
carries a signal; where a justification is captured, that becomes
either a separate, human/AI-assisted-reviewed evidence input (Document
08 boundary) or is reserved for narrative report context rather than
scored.
**Best use:** targeted, deliberately sparing use for D3/D9 trade-off
reasoning — not a high-volume method, per Document 06's diversity
principle, precisely because its scoring is inherently less clean than
SJT's.

### Ranking Exercises

**What it is:** the respondent orders several options by priority,
preference, or effectiveness, forcing relative rather than absolute
judgement.
**Strengths:** removes a well-documented distortion in Likert-type
self-rating — respondents inflating every item ("acquiescence" and
uniformly-high self-ratings) — because ranking forces genuine
differentiation between options; particularly effective for D7
(Leadership/priority-setting) and D9 (Risk Perception, ranking threats
by severity).
**Weaknesses:** more cognitively demanding and slower to complete than
single-item ratings; scoring requires a defensible reference ranking
(same construction burden as SJT); less suited to constructs that
aren't naturally comparative.
**Evidence Signal mapping:** relative position typically maps to a
graded signal (top-ranked item carries a stronger signal than a
mid-ranked one), calibrated against the reference ranking.
**Best use:** D7, D9, and multi-priority decision constructs generally
(triage-style judgement).

### Consistency Checks

**What it is:** not a standalone question type, but a design
discipline — presenting logically or empirically related content more
than once, in different framings, and checking for coherent responses.
**Strengths:** the primary quality-control method for detecting
careless, randomly-inconsistent, or (for the specific case of
integrity-adjacent content) implausibly-clean response patterns;
improves overall measurement reliability without adding a new
construct.
**Weaknesses:** must never be presented or experienced as an
interrogation or "gotcha" device (Document 01 §3) — consistency
checks exist to protect measurement quality, not to accuse; overuse
lengthens the assessment without proportionate benefit (Document 06's
redundancy-avoidance principle governs how much is enough).
**Evidence Signal mapping:** does not itself produce a new dimension
signal; instead flags response-quality/consistency issues that gate
whether other signals from that run should be treated as reliable —
a data-quality layer, not a scoring input.
**Best use:** applied sparingly and strategically across a Blueprint,
concentrated where self-report is weakest (D3, D9) per the Document 03
§4 evidence table, not applied uniformly to every item.

### Confidence Ratings

**What it is:** alongside a substantive response, asking how confident
the respondent is in it.
**Strengths:** confidence-accuracy calibration is itself diagnostic —
well-calibrated confidence (high confidence on correct/effective
answers, appropriate uncertainty on genuinely ambiguous ones) is
evidence of D2 (Judgement Under Uncertainty) and self-awareness more
directly than the substantive answer alone; poorly-calibrated
overconfidence is a documented risk marker in high-consequence
occupational research (overconfident operators under-escalate and
under-verify).
**Weaknesses:** adds respondent burden; only useful where there is a
defensible correct/effective answer to calibrate against (pairs
naturally with SJT, poorly with pure self-rating or preference items).
**Evidence Signal mapping:** a secondary signal derived from the
interaction of stated confidence and response accuracy/effectiveness,
not the raw confidence value alone.
**Best use:** paired with SJT items targeting D2 and D9, used
selectively, not universally.

### Future Adaptive Assessment

**What it is:** dynamically selecting or branching subsequent
questions based on prior responses within a run, rather than a fixed
question set.
**Strengths:** can shorten assessment length without losing
measurement precision (a well-established property of adaptive
testing in ability-testing contexts, item-response-theory-based);
allows deeper probing exactly where a response was ambiguous or
borderline rather than uniformly across all respondents.
**Weaknesses:** requires a substantially larger, calibrated item bank
than a fixed Blueprint before it can be deployed responsibly (an item
pool that is too small produces predictable branching, undermining
both validity and coachability protection); requires historical-
reproducibility handling beyond what a fixed Blueprint Version needs,
since the *set* of questions administered is no longer fixed per
version — this has real implications for the locked architecture's
reproducibility guarantee and should be scoped as a distinct future
capability, not assumed to work identically to fixed Blueprints.
**Evidence Signal mapping:** unchanged at the item level; the novelty
is entirely in selection logic, which sits above the Evidence Signal
layer.
**Best use:** explicitly a **future** capability (Document 10) — not
recommended for Phase 2B. Requires its own validation work (item
banking, calibration) before any production use, flagged as a research
gap in Document 11.

## 3. Cross-method principles

- **No single method should carry a foundational dimension alone.**
  Per Document 06's minimum-evidence principle, every foundational
  dimension (D1–D6) should draw on at least two methodologically
  distinct evidence sources within a Blueprint, precisely because each
  method's weaknesses differ — triangulation is the primary defense
  against any single method's blind spot, not a redundancy to trim.
- **Method choice should follow the evidence table in Document 03 §4,
  not convenience.** Self-rating is the cheapest method to author and
  the temptation to over-rely on it is real; this framework treats
  that temptation as a design risk to guard against explicitly,
  especially for D3 and D9.
- **Every method eventually needs empirical validation against real
  outcomes**, not just face-plausibility (Document 09) — this document
  states the a-priori reasoning from the literature; it does not
  substitute for CQrityjob's own validation work once usage data
  exists (Document 11).
