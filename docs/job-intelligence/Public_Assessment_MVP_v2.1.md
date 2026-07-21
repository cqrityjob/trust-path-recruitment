# Public Assessment MVP

**Version:** 2.1

**Status:** LOCKED

This document describes what the Public Assessment is, why it is built the way it is, and what it deliberately does not do. It is written so a future developer, reviewer, or product owner can understand the assessment without reading code.

---

## Purpose

CQrityjob's Public Assessment is a free, anonymous, 16-question career-guidance instrument for the security industry. It exists to answer one question for a candidate: *which security career directions genuinely fit how you think and work?*

It is explicitly **not**:

- A personality test.
- A competence certification or hiring decision.
- A predictor of future job performance.
- A pass/fail eligibility check for any profession, license, or role.

It is a **Security Decision Assessment**: it generates evidence about how someone is likely to observe, interpret, prioritise, decide, communicate, escalate, document, reflect, and learn inside realistic security situations, and turns that evidence into career guidance — never into a verdict on the person.

## Target audience

Security Officers, Security Guards, Corporate Security, Aviation Security, Maritime Security, Critical Infrastructure and Datacenter Security, Crisis Management, Risk Management, Protective Security, Investigations, Intelligence, Emergency Response, and Law Enforcement Support — plus people exploring whether any of these directions could suit them (students, career changers, people already in adjacent fields).

## Estimated completion time

Approximately 5 minutes. 16 questions, no account required, nothing saved unless the candidate is signed in.

---

## Assessment philosophy

**The Golden Rule:** never ask "Who do you think you are?" Always try to discover "How are you likely to think and behave?" Behaviour is more valuable evidence than self-image.

In practice this means the assessment is built almost entirely from concrete scenarios — realistic moments involving unclear instructions, incomplete information, conflicting priorities, policy versus operational reality, suspicious behaviour, shift handovers, client pressure, and escalation uncertainty — rather than abstract self-rating statements ("I am calm under pressure"). A candidate answering a scenario question is reacting to a situation; a candidate answering a self-rating statement is describing their self-image. The two are not equally reliable, and this assessment is built to prefer the former wherever possible.

Every question exists to answer two tests:

1. **The purpose test** — if this question disappeared tomorrow, what evidence would disappear? If the honest answer is "nothing important," the question does not belong.
2. **The result-improvement test** — does this question materially improve at least one of: competency evidence, career recommendations, interview guidance, development advice, or the employer report? If not, it is not worth asking.

Options are constructed so there is no single obviously-correct answer. Each option represents a different, genuinely plausible judgement pattern, so the assessment discriminates between professionals rather than rewarding whoever guesses the "expected" answer.

## Evidence philosophy

Not all answers are the same kind of evidence, and the result model says so explicitly rather than blending everything together.

| Evidence type | What it means | Where it's used |
|---|---|---|
| **Scenario-based** | A response to a concrete, realistic situation | Competency evidence |
| **Behavioural** | A description of an actual past pattern or habit | Competency evidence |
| **Preference** | A stated interest in an environment, role, or type of interaction | Career/role fit only — never competency evidence |

**The hard rule, enforced structurally, not just in wording: preference is never presented as competence, and confidence is never presented as ability.** Concretely:

- `service_orientation`, `leadership_orientation`, `strategic_orientation`, `technical_orientation`, and `investigation_orientation` are sourced only from preference-framed items (environment/role fit, public-interaction fit). They are excluded from every "strength" / "observed evidence" / "development area" list, in both the candidate result and the Employer Report, and shown only in career-fit and interest sections (Career Profile archetypes, motivations, environment fit).
- The remaining nine dimensions (`structure_documentation`, `risk_awareness`, `conflict_management`, `communication`, `independent_decision_making`, `learning_development`, `teamwork`, `operational_orientation`, `analytical_orientation`) are the ones that can appear as competency evidence, because they are backed by scenario or behavioural items.
- A standalone confidence self-rating ("how confident are you...") was deliberately removed (see Change log) because a confidence rating not paired with an actual judgement is weak evidence, and could be misread as ability.

This is an honest, intentionally uneven design. The four/five preference-only dimensions are **not** artificially forced into equal-strength "competency" status just for symmetry — that would be fake precision, not real evidence.

## Security Decision Model

Every question is checked against whether it produces evidence for at least one of ten stages a security professional moves through in a real situation:

1. Observation
2. Interpretation
3. Risk Recognition
4. Prioritisation
5. Decision
6. Communication
7. Escalation
8. Documentation
9. Reflection
10. Learning

Coverage in the current 16-question set: Observation, Risk Recognition, Decision, Communication, Escalation, Documentation, and Learning all have direct item coverage. Prioritisation is covered by Q12 (the "two simultaneous incidents" scenario). Interpretation and Reflection are the two stages with the thinnest direct coverage in this version — an honestly reported limitation, not a hidden gap (see Known limitations).

## Question structure

- Exactly **16 questions**, IDs `q1`–`q16`, fixed order, ~5 minutes total.
- Formats: `single` (4-option scenario/dilemma, most items), `multi` (Q16 only, choose up to 3), `rating` (none remain as of v2.1 — the last rating-scale item was converted to `single` in this version, see Change log).
- Every item maps to the existing, frozen 14-`DimensionId` legacy model (`src/lib/career-assessment/types.ts`), not Assessment DNA's newer 12-Dimension model, which stays reserved for the future Blueprint Engine. This is a deliberate, reported scoping decision — the Public Assessment inherits from Assessment DNA's principles without adopting its newer vocabulary.
- Full per-question authoring rationale, competency/dimension mapping, evidence-signal intent, and known limitations: [`public-assessment-v2-questions.md`](./public-assessment-v2-questions.md).
- Candidate-facing content: `src/lib/assessment-content.ts`. Dimension mappings: `src/lib/career-assessment/question-mappings.ts`.

## Result philosophy

- Deterministic scoring only. Zero AI/LLM involvement anywhere in the scoring or matching pipeline (`matching-engine.ts`, `scoring.ts`). AI, where used elsewhere in the platform, only ever explains an already-computed deterministic result — it never scores, approves, or rejects.
- The candidate result (`engine-view.tsx`) separates "Areas that stood out in your answers" / "Your observed strengths" / "Where evidence is weaker" (competency evidence only) from the Career Profile's archetypes and motivations (which legitimately include preference signal, framed as interest/fit, not competence).
- Development areas are explicitly labelled as "not a judgement of your ability" — limited evidence, not a deficiency.
- Every result carries an explicit, unavoidable disclaimer: guidance for career choices, not an eligibility, competence, or employment decision. Formal requirements must always be verified separately.
- A completed result is an immutable snapshot (`SavedCareerReportV1`) tied to the `assessment_versions` row active at completion time — future question or mapping changes never retroactively alter a historical result.

## Employer report philosophy

The Employer Report (`EmployerReportView.tsx`, admin-preview route only — see Known limitations) exists purely as **decision support**, never a decision:

- Every report carries a prominent banner: this report never automatically approves, rejects, ranks, or shortlists candidates.
- Competency evidence is shown per dimension with its evidence type (scenario-based / behavioural) attached, so a reader can judge how much weight it deserves.
- Preference/interest signals are shown in a **separate, clearly labelled section** ("Stated interests and preferences"), with an explicit "preference is not competence" statement, never mixed into the strengths or development lists.
- Development areas carry an explicit "this is inferred guidance, not a verified deficiency" note on every item.
- Interview-focus suggestions are generated only from genuine competency evidence, never from preference signals — an employer is never prompted to probe a "gap" that is actually just a stated interest.

## Evidence categories

Per-question evidence-type classification (used by the Employer Report, documented in full per question in `public-assessment-v2-questions.md`):

- **Scenario-based:** Q2–Q10, Q12, Q13 (10 of 16 questions)
- **Behavioural:** Q1, Q11, Q14 (3 of 16 questions)
- **Preference:** Q15, Q16 (2 of 16 questions)
- **Self-report (Likert):** none remain as of v2.1

## Known limitations

- Response keys (which option represents which judgement pattern) are author-derived, refined through an internal adversarial expert-panel review, but **not yet through a genuine external multi-reviewer Expert Review or Psychometric Validation pass.** This is the top open item before any claim of validated scoring can be made.
- `investigation_orientation` remains preference-only (Q16 option-level), with no dedicated scenario item — an honestly reported thin spot, not hidden.
- The Security Decision Model's Interpretation and Reflection stages have no dedicated item; they are touched only incidentally by existing items (e.g. Q9's conflicting-information judgement touches Interpretation).
- The Employer Report is a platform-admin-only content/format preview, not a real employer self-service feature. No candidate-consent/sharing schema exists yet — a genuine, reported gap.
- No Ranking-format question exists; no ranking UI widget exists in the current component set. Format diversity is demonstrated via single/multi construction variety (SJT, dilemma, behavioural, preference) instead.
- Coverage is intentionally uneven across dimensions (`structure_documentation` has 2 dedicated items; five dimensions are preference-only). This is a reported design decision, not an oversight — see Evidence philosophy.

## What is intentionally NOT measured

- Personality traits in the psychometric-instrument sense (no Big Five, no MBTI-style typing).
- Protected characteristics, medical information, political belief, ethnicity, religion, or family status — no item references any of these, checked per item.
- Intelligence, cognitive ability, or aptitude testing.
- Physical fitness or medical fitness for duty.
- Anything that would function as a pass/fail eligibility gate for a regulated profession — formal requirements (security screening, licensing, etc.) are explicitly called out as separate from the assessment result and must always be verified with the responsible authority or employer.

## Future roadmap

Explicitly **not** planned as a next step: further theoretical redesign, new questions, new dimensions, or new architecture. The next changes to this assessment should be driven by:

1. **Pilot candidate feedback** — completion rate, drop-off point, comprehension issues, felt relevance to real security work.
2. **Pilot employer feedback** — whether the Employer Report content is actually useful for interview preparation.
3. **Real response-pattern data** — once enough completions exist, a genuine Psychometric Validation pass (content, construct, and criterion validity; internal consistency; bias/fairness checks) becomes possible for the first time.
4. **An explicit product decision** to re-open scope, made deliberately, not incrementally.

Longer-horizon, already-scoped-elsewhere work (Assessment Blueprint Engine, Assessment DNA's 12-Dimension model, Question Library's full taxonomy) remains a separate, forward-looking initiative and is not part of this assessment's roadmap — see `docs/architecture/` and `docs/assessment-science/`.

## Change log from previous versions

**v2.0 → v2.1 (this version) — Security Assessment Quality Review finalisation:**
- Converted 7 self-report Likert items (Q4, Q5, Q6, Q8, Q10, Q11, Q13) to concrete scenario/behavioural single-select questions.
- Replaced Q12 outright (was the literal "I stay calm under pressure" anti-pattern) with a "two simultaneous incidents" prioritisation scenario.
- Softened the most obviously-telegraphed "trap" option in Q2 and Q7 so all four options in each represent genuinely plausible judgement patterns.
- Converted Q11 from a standalone 1–10 confidence rating to a behavioural-frequency question about a real past experience (standalone confidence ratings are weak evidence per Assessment DNA Document 04).
- Structurally reclassified `service_orientation`, `leadership_orientation`, `strategic_orientation`, `technical_orientation`, `investigation_orientation` as preference-only across both the Employer Report and the candidate result view — previously these could appear in "strengths"/"observed evidence" sections alongside genuine competency evidence.
- Fixed a text-generation defect where a passed evidence gate could display an incorrect, negative-sounding, and grammatically duplicated ("The The...") explanation instead of the correct positive one.
- Recalibrated all 11 test personas for the new question formats; `cie-check.ts` passes for all 11.
- Same 16 question IDs, same flow, same result engine, same architecture. No new questions, no new dimensions.

**v1 → v2.0 — Full redesign:**
- All 16 questions rewritten from scratch against the Assessment DNA and Question Library frameworks.
- Introduced the Employer Report MVP (admin-preview only).
- New `assessment_versions` row (`model_version = '2026.07-v2.0'`).

## Release notes

- Deployed as: candidate-facing content in `src/lib/assessment-content.ts`, dimension mappings in `src/lib/career-assessment/question-mappings.ts`, result presentation in `src/components/assessment/result/engine-view.tsx` and `EmployerReportView.tsx`.
- Migration `supabase/migrations/20260721090000_public_assessment_v2.sql` (the `assessment_versions` row + admin-read RLS policies) remains committed but **not yet applied to any live Supabase environment** — no cloud credentials exist in the development environment used to build this. Applying it is a prerequisite for the Employer Report route and for new completions to attribute to `model_version = '2026.07-v2.0'` in the database (candidate-facing content and scoring work today regardless, against whichever version row is currently published).
- No database schema, RLS policy, or migration changed in this v2.1 pass — content, mapping, and presentation only.

---

## PUBLIC ASSESSMENT MVP

**STATUS:**

**LOCKED**

Future modifications require:

- Pilot candidate feedback
- Pilot employer feedback
- An explicit product decision

This is deliberate: it prevents unnecessary scope creep after a genuinely thorough review-and-refinement pass. The next edit to this assessment should be justified by real usage data, not by further theoretical re-analysis.
