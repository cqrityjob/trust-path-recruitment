# Document 01 — CQrityjob Assessment Science Philosophy

**Derives from:** [Document 00 — Security Excellence Model](./00-security-excellence-model.md).
**Scope note:** these principles govern every future CQrityjob capability built on assessment evidence — recruitment, career guidance, annual review, promotion, supplier validation, workforce intelligence, and AI coaching — not only the assessment product itself.

## 1. Why CQrityjob exists

Most commercial assessment products are built for generic
white-collar hiring and retrofitted to specialized industries by
relabeling generic personality and cognitive-ability constructs.
Security work is a distinct occupational class (Document 00, §1): high
consequence, trust-dependent, vigilance-heavy, and governed by
regulation and use-of-force authority in many roles. CQrityjob exists
because that class deserves a purpose-built scientific model, not a
relabeled generic one — and because the security industry currently
has no shared, defensible, evidence-based standard for what
professional excellence looks like across its own enormous range of
sub-professions (Document 07).

## 2. What should be measured

Only constructs that satisfy all three of the following:

1. **Job-relevant** — traceable to an observable behavior that affects
   real outcomes in security work (Document 00, §5), not a trait that
   is merely interesting or common in personality assessment.
2. **Evidence-supported** — measurable through a method with known,
   documented reliability and validity characteristics for that
   construct (Document 04), not assumed to work because it "feels"
   diagnostic.
3. **Actionable** — the result changes a real decision: who to hire,
   what to develop, what to promote toward, what an employer's
   Requirement Profile should weight. A measurement that cannot
   plausibly change a decision should not be collected (data
   minimisation, §5).

## 3. What should never be measured

- **Protected characteristics and their proxies** — age, sex, race,
  religion, national origin, disability status, and questions
  constructed to correlate with them indirectly (a known failure mode
  in poorly-designed situational judgement tests, where scenario
  framing can leak demographic proxies).
- **Personality as identity rather than behavior.** CQrityjob measures
  work-relevant behavioral tendencies, not who a person "is" as a
  human being. A dimension framed as "this person is untrustworthy" is
  a category error; "this person's documented pattern shows X" is the
  correct frame (Document 03).
- **Anything without a plausible job-relevance chain to Document 00's
  construct cluster.** Assessment scope creep — adding a measure
  because it is popular or because a competitor has it — is
  explicitly rejected as a design principle, not merely discouraged.
- **Clinical or diagnostic constructs.** CQrityjob is not a clinical
  instrument and must never be presented, marketed, or used as one
  (no mental-health diagnosis, no medical fitness-for-duty
  determination — those remain the province of licensed
  professionals under separate, appropriate governance).
- **Anything that functions as a lie-detection or interrogation
  device.** Consistency checks (Document 04) exist to improve
  measurement quality, not to accuse or trap candidates.

## 4. What employers actually need

Not a score in isolation — a **defensible basis for a decision they
remain accountable for.** Interviews and reference checks with
practitioners in this domain (implicit throughout the Blueprint
Engine's own design, e.g. the (A)/(B) Standard Result vs. Requirement
Match separation) converge on the same three needs:

1. **Comparability** — a way to compare candidates or employees on the
   same basis, not an idiosyncratic gut impression per interviewer.
2. **Explainability** — a result they can defend to a candidate, a
   regulator, or their own leadership if challenged; a black-box score
   satisfies none of these audiences.
3. **Fit to their specific context** — a Datacenter operator and a
   public-sector procurement office do not have identical priorities
   even when hiring for similar job titles (Document 07); the same
   Standard Competency Result must support both without being
   re-measured, via the Requirement Profile overlay the architecture
   already provides for exactly this reason.

## 5. Limitations of assessment

Stated plainly, because overclaiming is itself an ethical failure:

- **An assessment is a sample of behavior, not a certification of a
  person.** It measures responses to a bounded set of stimuli at one
  point in time. It does not, and cannot, guarantee future conduct.
- **No assessment eliminates false positives or false negatives.**
  Every method in Document 04 has a documented error rate; the
  platform's obligation is to minimize and disclose that error, not
  claim it away.
- **Self-report has known ceiling effects for exactly the constructs
  that matter most** (integrity, honesty, ethical steadiness) —
  self-report of these constructs is the most susceptible to social
  desirability distortion in the personnel-selection literature. This
  is a primary reason Document 04 treats behavioral and situational
  evidence as stronger than self-rating for these specific constructs.
- **An assessment result decays.** People change, roles change,
  environments change. A three-year-old result should not be presented
  with the same confidence as a fresh one — this is a direct input to
  the Annual Competency Review use case and to retention/re-assessment
  policy (a research gap flagged in Document 11).
- **Assessment cannot substitute for reference checks, background
  verification, regulatory vetting, or trial performance where those
  exist.** It is one input among several, always.

## 6. Ethical principles

- **Proportionality.** Collect only what a specific, stated decision
  requires (data minimisation) — a direct extension of the "what
  should be measured" test in §2.
- **Non-discrimination.** No measure, question, or scoring rule may
  have a disparate, unjustified impact on a protected group; adverse
  impact must be actively monitored once real-world data exists
  (Document 09, Document 11).
- **Dignity.** No question or exercise may be designed to embarrass,
  entrap, or coerce a candidate. Consistency checks are quality
  controls, never "gotcha" traps (§3).
- **Right to explanation.** A candidate or employee is entitled to a
  meaningful explanation of a result that affects them — this is why
  the architecture's report contract snapshots explanatory labels at
  generation time (Phase 1, finding I5) rather than leaving results
  unexplained.
- **No permanent record without purpose.** Retention must be tied to
  an active, disclosed purpose, not indefinite by default (GDPR
  alignment; retention duration remains an explicit open Product Owner
  decision per the locked architecture, not resolved here).

## 7. Privacy principles

Assessment data is sensitive personal data by nature (it supports
employment decisions and, in some jurisdictions, may touch special
categories indirectly). Governing principles: purpose limitation (data
collected for recruitment is not silently repurposed for, say,
insurance underwriting); storage limitation tied to the retention
decision above; access limitation matching the architecture's existing
posture (organisation-scoped visibility, platform-admin governance of
sensitive content, per the locked RLS model); and candidate awareness
of what is collected and why, in plain language, before assessment
begins.

## 8. Fairness principles

Fairness in assessment science has a specific, technical meaning
beyond good intentions: a fair instrument produces comparable
predictive validity across demographic groups, not merely comparable
average scores (which can mask genuine group differences in job
requirements) or identical pass rates (which can force miscalibration
in the opposite direction). CQrityjob commits to differential validity
and differential item functioning analysis as data accumulates
(Document 09) rather than to a single fairness metric asserted without
evidence. Where evidence and organizational need conflict, evidence
governs — Document 06 states directly that content should be revised
or retired when validity evidence fails to support it, not defended
because it is already built.

## 9. Human decision responsibility

Restated from the locked architecture, in explicit assessment-science
terms: **the platform produces evidence; humans make decisions.**
No employment, promotion, or supplier-compliance decision is ever
emitted by CQrityjob as an automatic output. The Standard Competency
Result and Organisation Requirement Match (the architecture's (A)/(B)
separation) are decision-support artifacts. The employer, not the
platform, is accountable for what they decide to do with them. This is
not a legal disclaimer bolted onto a scoring system — it is a design
principle that shaped the schema itself (no decision-outcome field
exists anywhere in the locked data model) and must shape every future
product built on it, including AI-assisted ones (Document 08).

## 10. AI principles

Stated in full in Document 08; the governing sentence, repeated here
because it is foundational rather than merely a feature constraint:

**AI explains. Deterministic rules score. Humans decide.**

AI may never compute, adjust, or influence a Standard Competency
Result or Organisation Requirement Match. AI may never output an
approve/reject/compliant recommendation framed as a decision, only as
information a human decision-maker may consider. This boundary is
non-negotiable and applies to every future AI capability built on this
platform — coaching, interview preparation, career guidance, a future
Security Manager Assistant, and any partner or white-label product.
