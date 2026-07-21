# Public Assessment v2.0 — Question Authoring Specification

**Internal document. Not shown to candidates** — per Question Library Document 04 ("do not expose internal scoring logic to candidates"). Candidate-facing content lives in `src/lib/assessment-content.ts`; dimension mappings in `src/lib/career-assessment/question-mappings.ts`.

**Scoping decision (reported explicitly, not silent):** questions are authored against Assessment DNA's Competency/Dimension reasoning, but **mapped onto the existing, frozen 14-`DimensionId` legacy model** (`src/lib/career-assessment/types.ts`), not the new 12-Dimension Assessment DNA model, which remains reserved for the Blueprint Engine. This keeps the change scoped to "redesign the 16 questions" rather than "redesign the scoring engine," per the smallest-safe-product instruction. One consequence, reported as a known limitation (§ "Coverage trade-off" below): `leadership_orientation`, `strategic_orientation`, `technical_orientation`, and `investigation_orientation` receive option-level (Q16 multi-select) rather than dedicated primary-item coverage in this version.

**Version metadata (applies to all 16):** Assessment: `career-guidance` (`assessments.id`, unchanged). Version: new `assessment_versions` row, `model_version = '2026.07-v2.0'`, `disclaimer_version = 'v2'`, later `published_at` than the existing `2026.07.1` row (see migration `20260721090000_public_assessment_v2.sql`). Engine: unchanged, `cie-v1.0`. Author: Claude (AI-assisted authoring, per Question Library Document 09 — human-equivalent final review performed in this session; **not yet through a genuine multi-reviewer Expert Review or Psychometric Validation pass**, see Known Limitations).

**Bias & accessibility review (applies to all 16, general statement):** no item references protected characteristics, medical information, political belief, ethnicity, religion, or family status. No item's scenario setting implies a specific demographic. Reading level kept to plain, professional English/Swedish, no idioms. No color-only or purely visual cues used (text-only). Time-pressure content (e.g. Q7, Q9) reflects genuine job-relevant judgement constructs, not an arbitrary difficulty add per Question Library Document 03 §9.

**Interpretation boundary (applies to all 16):** every question produces *evidence*, not a verdict. No single question's response should be read in isolation — results are only meaningful in aggregate, per dimension, across multiple items (Assessment DNA Document 06 §1).

---

### Q1 — Reliability
**Category:** Behavioural (frequency-anchored). **Format:** single-select (4 options).
**Competency:** Domain C (Integrity & Ethical Conduct)-adjacent / Domain E (Documentation & Structured Thinking). **Dimension:** `structure_documentation` (primary), `risk_awareness` (secondary).
**Evidence Signal intent:** self-reported behavioral pattern for unsupervised task follow-through — the closest available proxy for Assessment DNA's C1 (Rule Adherence When Unobserved), given the legacy model has no dedicated integrity dimension.
**Why included:** directly answers the brief's "reliability" theme; frequency-anchored options (Question Library Document 01 §2.1) are a stronger evidence class than a bare Likert self-rating for this construct.
**Known limitations:** self-report ceiling effect applies (Assessment DNA Document 04) — treated as provisional evidence, not verified conduct.

### Q2 — Everyday integrity
**Category:** Ethical Dilemma. **Format:** single-select (4 options, graded).
**Competency:** Integrity & Ethical Conduct (Domain C). **Dimension:** `structure_documentation` (primary), `conflict_management` (secondary).
**Evidence Signal intent:** forced trade-off between reporting/raising a minor rule deviation vs. tolerating or adopting it — models Assessment DNA Document 00 §5's "normalization of deviance" precursor pattern.
**Why included:** directly answers the "integrity and professional responsibility" theme; a dilemma format (not self-rating) per Assessment DNA Document 04's explicit caution that self-report is weakest for integrity.
**Known limitations:** the response key (which option is "most effective") is author-derived, not yet through a genuine multi-reviewer Expert Review (Question Library Document 05, Stage 3) — flagged for follow-up validation, not presented as fully validated.

### Q3 — Situational awareness
**Category:** Observation. **Format:** single-select (4 options, graded).
**Competency:** Domain A (Operational Vigilance & Situational Awareness). **Dimension:** `risk_awareness`.
**Evidence Signal intent:** self-reported noticing pattern in a familiar environment — a lighter-weight proxy for Assessment DNA's Observation category (Question Library Document 01 §2.7), since a genuine perceptual/image-based item was out of scope for this round.
**Why included:** directly answers "situational awareness."
**Known limitations:** true Observation-category items (Question Library Document 01 §2.7) require an expert-validated embedded signal in a depicted scene; this item is a self-report approximation, not the full-strength version of that category.

### Q4 — Risk recognition
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain B3 (Risk Assessment). **Dimension:** `risk_awareness` (second item for this dimension, satisfying Assessment DNA Document 06 §1's ≥2-items floor with a methodologically distinct format from Q3).
**Why included:** directly answers "risk recognition"; 1–5 chosen per Measurement Framework §2 as the default for self-rating.
**Known limitations:** standard self-report limitations apply; paired with Q3's non-self-rating method for triangulation.

### Q5 — Procedural discipline
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain E2 (Structured Procedural Thinking). **Dimension:** `structure_documentation` (second item, distinct method from Q1/Q2/Q14).
**Why included:** directly answers "procedural discipline."
**Known limitations:** self-report; the item cannot distinguish genuine discipline from a desire to appear compliant.

### Q6 — Communication
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain D1 (Clear Operational Reporting). **Dimension:** `communication`.
**Why included:** directly answers "communication."
**Known limitations:** self-rated communication skill is only moderately reliable (Assessment DNA Document 03 §4); no behavioral communication sample is collected in this version.

### Q7 — Escalation judgement
**Category:** Situational Judgement. **Format:** single-select (4 options, graded).
**Competency:** Domain B1 (Calibrated Escalation). **Dimension:** `conflict_management` (primary), `communication` (secondary).
**Evidence Signal intent:** models Assessment DNA Document 00 §2's calibrated-escalation construct — neither chronic over- nor under-escalation.
**Why included:** directly answers "escalation judgement"; SJT format per Assessment DNA Document 04's standing as the strongest method class for judgement constructs.
**Known limitations:** response key is author-derived pending formal Expert Review, as Q2.

### Q8 — Decision quality
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain B2 (Judgement Under Incomplete Information). **Dimension:** `independent_decision_making` (primary), `analytical_orientation` (secondary).
**Why included:** directly answers "decision quality" (commitment/follow-through aspect, distinct from Q9's uncertainty-handling aspect).
**Known limitations:** self-report; decisiveness under real time pressure is better evidenced by SJT (Q9) than by this self-rating alone — included together deliberately for method diversity.

### Q9 — Judgement under uncertainty
**Category:** Situational Judgement. **Format:** single-select (4 options, graded).
**Competency:** Domain B2. **Dimension:** `independent_decision_making` (second item), `analytical_orientation` (second item).
**Evidence Signal intent:** conflicting-information scenario, modeling genuine ambiguity rather than a single missing fact.
**Why included:** directly answers "judgement under uncertainty" as its own theme, distinct from Q8's decisiveness framing.
**Known limitations:** as Q2/Q7, key pending formal Expert Review.

### Q10 — Adaptability
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain F3 (Adaptability Under Change). **Dimension:** `learning_development` (primary), `operational_orientation` (secondary).
**Why included:** directly answers "adaptability."
**Known limitations:** mapping onto `learning_development`/`operational_orientation` is the closest honest fit within the legacy 14-dimension model, which has no dedicated adaptability/cognitive-flexibility dimension (Assessment DNA's D10 is reserved for the future Blueprint Engine model) — reported as an imperfect-but-reasonable proxy, not a perfect fit.

### Q11 — Learning orientation
**Category:** Confidence Rating (self-assessed). **Format:** rating, **1–10** (the deliberate mixed-scale exception).
**Competency:** Domain J2 (Self-Directed Skill Development). **Dimension:** `learning_development` (second item).
**Why 1–10 specifically:** per Measurement Framework §2, chosen because the item is a self-assessed confidence level, where "out of 10" is an intuitively legible communication convention to the respondent — not a default, the only item in this set using 1–10, deliberately demonstrating the no-universal-scale principle rather than defaulting every item to one scale.
**Known limitations:** `center` for the weighted-contribution formula is explicitly set to 5.5 in `question-mappings.ts` (the type's default of 3 assumes a 1–5 scale) — a real implementation detail future authors must remember for any other non-1–5 item.

### Q12 — Calmness under pressure
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain F1 (Composure Under Acute Threat). **Dimension:** `operational_orientation` (primary), `conflict_management` (secondary).
**Why included:** directly answers "calmness and response under pressure."
**Known limitations:** as Q10, `operational_orientation` is the closest honest legacy-model proxy for composure/resilience, which has no dedicated dimension in the 14-dimension model (Assessment DNA's D5 is reserved for the future model).

### Q13 — Teamwork
**Category:** Self-rating (Likert). **Format:** rating, 1–5.
**Competency:** Domain D (Communication & Interpersonal Influence)-adjacent, Domain G2. **Dimension:** `teamwork` (primary), `independent_decision_making` (secondary, negative cross-load — preserves the original design's finding that strong team-orientation and strong independent-decision preference are in some tension).
**Why included:** directly answers "teamwork and coordination."
**Known limitations:** standard self-report limitations.

### Q14 — Reporting and documentation
**Category:** Behavioural. **Format:** single-select (4 options, graded).
**Competency:** Domain E1 (Documentation Accuracy & Timeliness). **Dimension:** `structure_documentation` (third item — deliberately, using a third distinct method: behavioral-frequency, vs. Q1's frequency self-report and Q5's Likert self-rating).
**Why included:** directly answers "reporting and documentation."
**Known limitations:** `structure_documentation` is now measured by three items (Q1, Q5, Q14) while `investigation_orientation`, `leadership_orientation`, `strategic_orientation`, `technical_orientation` receive only option-level coverage via Q16 — see Coverage trade-off below.

### Q15 — Service orientation
**Category:** Behavioural/preference. **Format:** single-select (4 options, graded).
**Competency:** Domain D-adjacent (service-facing communication). **Dimension:** `service_orientation` (primary), `communication` (secondary).
**Why included:** directly answers "service orientation."
**Known limitations:** preference-based; a genuinely low score here is a fit signal, not a competence deficiency, and should never be interpreted as a negative evidence marker in isolation.

### Q16 — Role and environment preference
**Category:** Multi-select. **Format:** multi (choose up to 3, 8 options).
**Competency:** spans Domain H (Technical & Domain Knowledge), Domain I (Investigative Reasoning), Domain G (Leadership), plus general role/environment fit. **Dimension:** option-level — `analytical_orientation`, `strategic_orientation`, `operational_orientation`, `technical_orientation`, `structure_documentation`, `service_orientation`, `leadership_orientation`, `investigation_orientation` (8 options, each carrying 1–2 dimension loadings).
**Why included:** directly answers "role and environment preference"; expanded from the original 6-option set to 8 (added `casework` and `coordination`) specifically to give `investigation_orientation` and `leadership_orientation` real, if secondary, coverage given they lost a dedicated primary item in this redesign.
**Known limitations:** preference-based, not competence evidence; the four "thin" dimensions (see below) rely substantially on this one item, which is a genuine coverage limitation, not a design oversight — reported explicitly, not hidden.

---

## Coverage trade-off (reported explicitly)

Deliberate consequence of mapping 16 new questions onto 16 user-specified themes rather than onto the 14 legacy dimensions directly: `leadership_orientation`, `strategic_orientation`, `technical_orientation`, and `investigation_orientation` are evidenced only via Q16's multi-select options (secondary, option-level weight), not by a dedicated rating/SJT item as they had in v1. Every dimension still receives non-zero evidence (satisfying the engine's `observed: true` requirement and `computeMatches`'s gate logic), but these four are measured more thinly than the other ten. This is an intentional trade-off favoring the user-specified theme coverage over uniform dimension depth, reported here rather than discovered later. A natural Phase 2B-adjacent follow-up (not undertaken now) would be a 17th–20th question extension specifically strengthening these four.

## What was deliberately not attempted this round

- No genuine multi-reviewer Expert Review (Question Library Document 05, Stage 3) — response keys for the six graded single-select items (Q1–Q3, Q7, Q9, Q14, Q15) are author-derived and should be treated as provisional pending that review.
- No Psychometric Validation (Stage 5) — no real response data exists yet.
- No Ranking-format item — deferred; format diversity is demonstrated via single/multi/rating with varied construction (SJT, dilemma, behavioral, preference) rather than a dedicated ranking widget, which does not exist in the current UI component set.
