# Public Assessment v2.0 — Question Authoring Specification

**Status: locked for MVP.** This is the final refinement pass following the Security Assessment Quality Review (9-role expert panel review against the Security Decision Model and the golden rule "how are they likely to think and behave," not "who do you think you are"). Future changes should be driven by real candidate/employer feedback, not further theoretical redesign.

**Internal document. Not shown to candidates** — per Question Library Document 04 ("do not expose internal scoring logic to candidates"). Candidate-facing content lives in `src/lib/assessment-content.ts`; dimension mappings in `src/lib/career-assessment/question-mappings.ts`.

**Scoping decision (reported explicitly, not silent):** questions are authored against Assessment DNA's Competency/Dimension reasoning, but **mapped onto the existing, frozen 14-`DimensionId` legacy model** (`src/lib/career-assessment/types.ts`), not the new 12-Dimension Assessment DNA model, which remains reserved for the Blueprint Engine. Same 16 question IDs, same flow, same result engine, same Career Intelligence integration as the initial v2.0 release — only wording, response format and evidence classification were revised in this pass.

**Version metadata (applies to all 16):** Assessment: `career-guidance` (`assessments.id`, unchanged). Version: `assessment_versions` row, `model_version = '2026.07-v2.0'`, `disclaimer_version = 'v2'` (migration `20260721090000_public_assessment_v2.sql`). Engine: unchanged, `cie-v1.0`. Author: Claude (AI-assisted authoring, per Question Library Document 09 — human-equivalent final review performed across two sessions, including a dedicated adversarial expert-panel review; **still not a genuine multi-reviewer human Expert Review or Psychometric Validation pass**, see Known Limitations).

**Bias & accessibility review (applies to all 16, general statement):** no item references protected characteristics, medical information, political belief, ethnicity, religion, or family status. No item's scenario setting implies a specific demographic. Reading level kept to plain, professional English/Swedish, no idioms. No color-only or purely visual cues used (text-only). Time-pressure content reflects genuine job-relevant judgement constructs, not an arbitrary difficulty add per Question Library Document 03 §9.

**Interpretation boundary (applies to all 16):** every question produces *evidence*, not a verdict. No single question's response should be read in isolation — results are only meaningful in aggregate, per dimension, across multiple items (Assessment DNA Document 06 §1).

**Result-model boundary (new in this revision):** `service_orientation`, `leadership_orientation`, `strategic_orientation`, `technical_orientation` and `investigation_orientation` are sourced only from preference-framed items (Q15, Q16) and are treated by the Employer Report and, going forward, the candidate result, as **stated interest/fit signals, never as competency evidence**. Preference is never presented as competence; confidence is never presented as ability.

---

### Q1 — Reliability
**Category:** Behavioural scenario (end-of-shift temptation). **Format:** single-select (4 options, graded).
**Competency:** Domain C (Integrity & Ethical Conduct)-adjacent / Domain E (Documentation & Structured Thinking). **Dimension:** `structure_documentation` (primary), `risk_awareness` (secondary).
**Evidence Signal intent:** behavioural response to an unsupervised, low-stakes-seeming final check at the point of maximum temptation to skip it — the closest available proxy for Assessment DNA's C1 (Rule Adherence When Unobserved).
**Review disposition:** REVISE. Converted from an abstract "think about your general pattern" self-report into a single concrete end-of-shift scenario — a candidate answering about a specific moment produces more honest evidence than one characterizing their own general reliability.
**Known limitations:** still a single hypothetical scenario, not observed conduct — treated as provisional evidence.

### Q2 — Everyday integrity
**Category:** Ethical dilemma. **Format:** single-select (4 options, graded).
**Competency:** Integrity & Ethical Conduct (Domain C). **Dimension:** `structure_documentation` (primary), `conflict_management` (secondary).
**Evidence Signal intent:** forced trade-off between reporting/raising a minor rule deviation vs. tolerating or adopting it — models Assessment DNA Document 00 §5's "normalization of deviance" precursor pattern.
**Review disposition:** REVISE (minor). The lowest-integrity option ("adopt_it") was softened from an openly self-incriminating phrasing ("I'll start doing the same since it clearly works") to a more plausible, less telegraphed rationalisation — the previous wording was obvious enough that a candidate could identify and avoid it purely on social-desirability grounds rather than genuine judgement, which weakened its discriminating power.
**Known limitations:** the response key is author-derived, not yet through a genuine multi-reviewer Expert Review (Question Library Document 05, Stage 3).

### Q3 — Situational awareness
**Category:** Observation (concrete described scene). **Format:** single-select (4 options, graded).
**Competency:** Domain A (Operational Vigilance & Situational Awareness). **Dimension:** `risk_awareness`.
**Evidence Signal intent:** noticing behaviour anchored to a specific described scene containing genuine anomalies (misplaced badges, an unexpectedly closed door, an unfamiliar person), rather than an abstract self-report of one's own noticing tendency.
**Review disposition:** REVISE. The previous version asked candidates to self-characterize "what I'd notice" in the abstract; this version gives them an actual scene to react to, which is a materially stronger evidence class for an Observation-category item (Question Library Document 01 §2.7).
**Known limitations:** a genuine expert-validated image-based Observation item remains out of scope; this is a described-scene approximation, not the full-strength version of that category.

### Q4 — Risk recognition
**Category:** Scenario (proactive vs. reactive risk-thinking). **Format:** single-select (4 options, graded).
**Competency:** Domain B3 (Risk Assessment). **Dimension:** `risk_awareness` (second item for this dimension, methodologically distinct from Q3).
**Review disposition:** REPLACE (format). Converted from a Likert self-rating ("I actively think about what could go wrong...") — flagged by the review as high social-desirability, high fakeability, and near-zero security specificity — to a scenario asking what actually goes through the candidate's mind before a routine task, which cannot be answered correctly by simply picking "agree."
**Known limitations:** still self-descriptive rather than a live task; paired with Q3's scene-based method for triangulation.

### Q5 — Procedural discipline
**Category:** Scenario (procedure vs. confident shortcut, under time/fatigue pressure). **Format:** single-select (4 options, graded).
**Competency:** Domain E2 (Structured Procedural Thinking). **Dimension:** `structure_documentation` (second item, distinct method from Q1/Q2/Q14).
**Review disposition:** REPLACE (format). The prior Likert item ("Even when I'm confident I know a better way, I follow procedure...") was flagged as the most obviously "correct-answer" item in the set — nearly everyone will agree, since disagreeing sounds like admitting to rule-breaking. Rebuilt as a concrete end-of-shift scenario with a genuine temptation, which produces real discrimination between response patterns.
**Known limitations:** self-descriptive scenario response, not observed conduct.

### Q6 — Communication
**Category:** Scenario (communication-content judgement under time pressure). **Format:** single-select (4 options, graded).
**Competency:** Domain D1 (Clear Operational Reporting). **Dimension:** `communication`.
**Review disposition:** REPLACE (format). The prior Likert item ("I can explain a complicated situation clearly and calmly...") was flagged as generic HR language that could describe any job. Rebuilt as a scenario testing what a candidate actually leads with when reporting to a supervisor with limited time — tests communication *judgement*, not self-assessed skill.
**Known limitations:** a single scenario response, not an observed communication sample.

### Q7 — Escalation judgement
**Category:** Situational judgement. **Format:** single-select (4 options, graded).
**Competency:** Domain B1 (Calibrated Escalation). **Dimension:** `conflict_management` (primary), `communication` (secondary).
**Evidence Signal intent:** models Assessment DNA Document 00 §2's calibrated-escalation construct — neither chronic over- nor under-escalation.
**Review disposition:** REVISE (minor). The lowest-scoring option ("handle_alone") was reworded from an openly ego-driven framing ("might make me look unable to cope") to a more plausible operational cost-benefit rationalisation — the previous wording telegraphed the "wrong" answer via unflattering social framing rather than letting it compete as a genuine judgement pattern.
**Known limitations:** response key is author-derived pending formal Expert Review, as Q2.

### Q8 — Decision quality
**Category:** Scenario (commitment vs. second-guessing after new, inconclusive information). **Format:** single-select (4 options, graded).
**Competency:** Domain B2 (Judgement Under Incomplete Information). **Dimension:** `independent_decision_making` (primary), `analytical_orientation` (secondary).
**Review disposition:** REPLACE (format and construct sharpening). The prior Likert item ("Once I have enough information to act, I commit...") was both a generic self-report and substantially redundant with Q9. Rebuilt as a scenario distinct from Q9's "conflicting sources before deciding" framing: Q8 now tests what happens *after* a decision is already in motion and new, inconclusive doubt appears — a genuinely different decision point (commitment discipline vs. initial judgement under conflicting information).
**Known limitations:** self-descriptive scenario response; construct boundary with Q9 is deliberate but narrow.

### Q9 — Judgement under uncertainty
**Category:** Situational judgement. **Format:** single-select (4 options, graded).
**Competency:** Domain B2. **Dimension:** `independent_decision_making` (second item), `analytical_orientation` (second item).
**Evidence Signal intent:** conflicting-information scenario, modeling genuine ambiguity rather than a single missing fact.
**Review disposition:** KEEP. Identified by the expert review as one of the three strongest items in the set — genuine scenario, forced choice among plausible judgement patterns, no self-rating, no obviously "correct" answer.
**Known limitations:** as Q2/Q7, key pending formal Expert Review.

### Q10 — Adaptability
**Category:** Scenario (security-specific process change). **Format:** single-select (4 options, graded).
**Competency:** Domain F3 (Adaptability Under Change). **Dimension:** `learning_development` (primary), `operational_orientation` (secondary).
**Review disposition:** REPLACE (format and specificity). The prior Likert item ("When a familiar process changes, I adjust...") was flagged as generic enough to describe any office software update, with no security specificity. Rebuilt around a concrete example (a new access-control step introduced mid-shift).
**Known limitations:** mapping onto `learning_development`/`operational_orientation` remains the closest honest fit within the legacy 14-dimension model, which has no dedicated adaptability dimension — reported as an imperfect-but-reasonable proxy, not a perfect fit.

### Q11 — Learning orientation
**Category:** Behavioural-frequency (past experience, not self-assessed confidence). **Format:** single-select (4 options, graded).
**Competency:** Domain J2 (Self-Directed Skill Development). **Dimension:** `learning_development` (second item).
**Review disposition:** REPLACE (format). The prior item was a standalone 1–10 confidence self-rating — the review identified this as a direct contradiction of the platform's own Evidence Framework, which explicitly flags standalone confidence ratings (not paired with an actual judgement/task) as weak evidence. Rather than preserve the 1–10 scale for the sake of format diversity, it was replaced with a behavioural-frequency question about the candidate's most recent actual experience getting up to speed on something unfamiliar — a materially stronger evidence class, at the cost of no longer demonstrating the mixed-scale principle in this question set.
**Known limitations:** still self-reported (a single remembered instance, not observed), but no longer a standalone confidence judgement with no behavioural anchor.

### Q12 — Calmness under pressure / prioritisation
**Category:** Scenario (simultaneous competing incidents). **Format:** single-select (4 options, graded).
**Competency:** Domain F1 (Composure Under Acute Threat), Domain B (Prioritisation). **Dimension:** `operational_orientation` (primary), `conflict_management` (secondary).
**Review disposition:** REPLACE. This was the item the expert review flagged as the literal anti-pattern named in its own guidance ("I stay calm under pressure" — avoid this). Rebuilt exactly as specified: "You are simultaneously handling two urgent situations... what do you actually do first?" This also gives the Security Decision Model's Prioritisation stage its first genuine coverage in the assessment, without adding a 17th question.
**Known limitations:** `operational_orientation` remains the closest honest legacy-model proxy for composure/prioritisation under pressure, which has no single dedicated dimension in the 14-dimension model.

### Q13 — Teamwork
**Category:** Scenario (shift-coordination disagreement). **Format:** single-select (4 options, graded).
**Competency:** Domain D (Communication & Interpersonal Influence)-adjacent, Domain G2. **Dimension:** `teamwork` (primary), `independent_decision_making` (secondary, negative cross-load — preserves the original design's finding that strong team-orientation and strong independent-decision preference are in some tension).
**Review disposition:** REPLACE (format). The prior Likert item ("I coordinate well with others...") was generic self-report. Rebuilt as a concrete coordination disagreement between the candidate and a colleague.
**Known limitations:** self-descriptive scenario response, not observed team conduct.

### Q14 — Reporting and documentation
**Category:** Behavioural. **Format:** single-select (4 options, graded).
**Competency:** Domain E1 (Documentation Accuracy & Timeliness). **Dimension:** `structure_documentation` (third item — deliberately a distinct method from Q1's scenario and Q5's scenario).
**Review disposition:** REVISE (minor, trigger sharpened). Retitled the trigger from an abstract "after something notable happens" to a concrete end-of-shift moment with a competing pull (eagerness to go home), which puts documentation discipline under a real, specific pressure rather than an abstract habit description. Response options unchanged.
**Known limitations:** `structure_documentation` is measured by three items (Q1, Q5, Q14) — the review confirmed this is a defensible triangulation (three distinct scenario framings), not padding, and left the count as-is per "quality over symmetry."

### Q15 — Service orientation
**Category:** Preference. **Format:** single-select (4 options, graded).
**Competency:** service-facing role fit. **Dimension:** `service_orientation` (primary), `communication` (secondary).
**Review disposition:** KEEP (content unchanged) — **RECLASSIFIED in the result model.** Per the expert review's explicit finding, this item was previously displayed with equal status to genuine competency evidence. It is now treated everywhere (Employer Report, and future candidate-result work) as a **preference/fit signal**, never as competency evidence — a low score here is a fit signal, not a competence deficiency.
**Known limitations:** none beyond the inherent limits of any preference self-report; the limitation this review addresses is in how the result *presents* this item, not in how it is collected.

### Q16 — Role and environment preference
**Category:** Preference. **Format:** multi-select (choose up to 3, 8 options).
**Competency:** spans Domain H (Technical & Domain Knowledge), Domain I (Investigative Reasoning), Domain G (Leadership), plus general role/environment fit. **Dimension:** option-level — `analytical_orientation`, `strategic_orientation`, `operational_orientation`, `technical_orientation`, `structure_documentation`, `service_orientation`, `leadership_orientation`, `investigation_orientation`.
**Review disposition:** KEEP (content unchanged) — **RECLASSIFIED in the result model.** `leadership_orientation`, `strategic_orientation`, `technical_orientation` and `investigation_orientation` have no other evidence source in this 16-question set; the review's explicit instruction was not to force artificial equal coverage by inventing weak "competency" items for these, but to report them honestly. They are now treated as **preference/fit signals only** in the Employer Report (and future candidate result), clearly separated from dimensions with genuine scenario/behavioural evidence.
**Known limitations:** preference-based, not competence evidence — now stated structurally in the result model, not just in this document.

---

## Result-model separation (new in this revision)

Per the Security Assessment Quality Review's explicit finding — the assessment risked presenting preference as if it were competence — the Employer Report (`EmployerReportView.tsx`) now structurally separates:

- **Competency evidence** (`structure_documentation`, `risk_awareness`, `conflict_management`, `communication`, `independent_decision_making`, `learning_development`, `teamwork`, `operational_orientation`, `analytical_orientation`) — shown under "Competency evidence — strengths" / "Development areas", each tagged with its evidence type (scenario-based / behavioural).
- **Stated interests and preferences** (`service_orientation`, `leadership_orientation`, `strategic_orientation`, `technical_orientation`, `investigation_orientation`) — shown in a separate "Stated interests and preferences" section with an explicit "preference is not competence" statement, never mixed into the strengths/development lists.

Interview-focus suggestions are generated only from the competency-evidence set, so an employer is never prompted to probe a "development area" that is actually just a stated preference.

## What was deliberately not attempted this round

- No genuine multi-reviewer human Expert Review (Question Library Document 05, Stage 3) — response keys remain author-derived (now including an adversarial 9-role panel self-review) and should be treated as provisional pending an external review.
- No Psychometric Validation (Stage 5) — no real response data exists yet; this remains the top priority once real candidates use the assessment.
- No new questions were added and the question count was not increased — per the explicit instruction that this is a finalisation pass, not a redesign. Genuine gaps identified by the review (e.g. dedicated Prioritisation and Reflection stage coverage) were addressed by revising existing items (Q12) rather than adding new ones, or left as an honestly reported limitation rather than inflating the question count.
- No Ranking-format item — still deferred; no ranking UI widget exists in the current component set.

## Locked for MVP

This question set, its mappings, and its result-model evidence separation are now considered locked for MVP testing with real candidates and employers. Further changes should be driven by observed response patterns, completion-rate data, and employer feedback — not further theoretical redesign.
