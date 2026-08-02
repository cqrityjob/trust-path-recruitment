# Expert-review package — Security Guard baseline, 18 items

**Status: every item `draft`. No review is marked completed. Nothing is published,
assignable or employer-visible.**

This document is the reviewer-facing companion to the database. Full scenario text,
options, scores and rationales live in the `scp_*` tables; this package carries the
structure a reviewer needs to decide, plus the empty decision fields to fill.

**Reviewers:** the internal scoring rationale and the professional-error classification
are shown here because this is an admin document. They are **not** part of any
candidate-facing payload — asserted by F5.1–F5.6 and F6.1–F6.2.

---

## How to use this package

For each item below, a reviewer records:

| Field | To be filled by |
|---|---|
| Reviewer decision | `accept` / `accept_with_changes` / `reject` |
| Reviewer comment | free text |
| Reviewer identity or role | e.g. "BYA-instruktör", "verksjurist" |
| Review date | ISO date |
| Next content status | `expert_review` / `legal_review` / `cognitive_review` / stays `draft` |

**Do not set any item to a review status until its decision is recorded here and the
owner approves the transition.** Phase 1G deliberately leaves all 96+ requirements
`outstanding`.

---

## Item register

| ID | Format | Primary construct | Tests | Employer-instruction dependent | Safety-critical | Learning counterpart | Reviews required |
|---|---|---|---|---|---|---|---|
| sg-b-01 | SJT best | situational_judgement | judgement | yes | — | covered_by_module_instruction | 5 |
| sg-b-02 | SJT best | situational_judgement | **mandate** | **yes** | — | separate required | **6 (incl. legal)** |
| sg-b-03 | SJT best | situational_judgement | judgement | — | **yes** | separate required | 5 |
| sg-b-04 | SJT best | situational_judgement | judgement | **yes** | **yes** | separate required | **6 (incl. legal)** |
| sg-b-05 | SJT best | mandate_and_escalation | **mandate** | **yes** | — | separate required | **6 (incl. legal)** |
| sg-b-06 | SJT best | mandate_and_escalation | **mandate** | **yes** | — | separate required | **6 (incl. legal)** |
| sg-b-07 | SJT best | operational_communication | judgement | — | **yes** | covered_by_module_instruction | 5 |
| sg-b-08 | SJT best | operational_communication | judgement | — | — | covered_by_module_instruction | 5 |
| sg-b-09 | SJT best | situational_judgement | judgement | — | **yes** | separate required | 5 |
| sg-b-10 | SJT best | prioritisation | judgement | — | **yes** | separate required | 5 |
| sg-b-11 | SJT best | prioritisation | judgement | — | **yes** | separate required | 5 |
| sg-b-12 | SJT best | mandate_and_escalation | **mandate** | **yes** | **yes** | separate required | 5 |
| sg-b-13 | Best/worst | situational_judgement | judgement | — | **yes** | separate required | 5 |
| sg-b-14 | Best/worst | situational_judgement | judgement | — | **yes** | separate required | 5 |
| sg-b-15 | Best/worst | mandate_and_escalation | **mandate** | **yes** | **yes** | separate required | **6 (incl. legal)** |
| sg-b-16 | Constructed | prioritisation | judgement | — | **yes** | separate required | 5 |
| sg-b-17 | Constructed | factual_reporting | judgement | — | — | separate required | 5 |
| sg-b-18 | Constructed | mandate_and_escalation | **mandate** | **yes** | **yes** | separate required | **6 (incl. legal)** |

**No item is classified `tests_what = legal_knowledge`.** Where an item touches mandate,
the necessary rule is stated in the scenario, so the item tests the decision to follow or
verify procedure — not knowledge of law. A database trigger
(`SCP_CONSTRUCT_MISLABELLED`) refuses any future item that classifies itself as
situational judgement while testing legal knowledge.

---

## The six legally sensitive items

Each carries `legal_assumption_sv` and `overgeneralisation_guard_sv` in the database.
Summarised:

### sg-b-02 — access control in a stairwell *(rewritten in Phase 1G)*

- **Assumption:** the assignment includes access control; **no general power to demand ID
  or detain is assumed.** The condition is handled by explanation, voluntary verification
  and escalation.
- **Employer-dependent:** yes — the access condition is stated in the scenario.
- **Tests:** mandate.
- **Guard against overgeneralisation:** the answer does not hold without such a condition
  and describes no universal authority.
- **Must approve:** verksjurist or BYA-competent reviewer, plus security SME.
- **Open question:** is "explain the condition, request voluntary verification, escalate"
  the correct doctrine across contract-security employers, or does practice vary?

### sg-b-04 — broken shoplifting observation
- **Assumption:** intervention requires a sufficiently secure own observation. No criminal-law test is applied.
- **Employer-dependent:** yes — shop procedure varies.
- **Open question:** is "unbroken observation" the right threshold, or is it employer-specific?

### sg-b-05 — access request outside instruction
- **Assumption:** access to another party's premises requires verification per assignment.
- **Open question:** should the preferred response name a specific verification route?

### sg-b-06 — CCTV request from police
- **Assumption:** the disclosure route is stated in the scenario, so no data-protection judgement is required of the participant.
- **Open question:** does "via the supervisor" match real client instructions widely enough to be the preferred response?

### sg-b-15 — task outside the instruction
- **Assumption:** the instruction bounds the assignment. No legal rule assumed.
- **Open question:** is declining-and-checking always right, or do some contracts permit discretion?

### sg-b-18 — unverified request for incident information
- **Assumption:** confidentiality arises from employment and assignment, not a named statute.
- **Open question:** what is the correct referral route for a person claiming to be affected?

---

## Rubrics

Three analytic rubrics, 12 dimensions, 60 levels, **all four anchor types present on each**
(`positive`, `borderline`, `contraindication`, `safety_critical_error`).

Each rubric separates content from writing: exactly one dimension carries
`assesses_writing_quality`, and its criteria state that simple language is judged equal to
polished. Anchors demonstrate both directions — a terse three-line answer scoring 4, and a
well-written but substantively empty answer scoring 2.

Each rubric lists eight things reviewers and AI must not infer: personality, honesty,
motivation, emotion, intent, intelligence, future performance, protected characteristics.

**Reviewer question:** are the four dimensions genuinely independent, or does
`decision_quality` overlap `safety_priority` in `sg-cr-16`?

---

## Learning Mode

14 counterparts authored as **separate item versions** in learning mode, each a different
situation for the same behaviour and professional error — never a reworded copy of the
protected item (asserted by F6.11). 4 items are covered by module instruction instead.

No Learning Mode item appears on the assessment form (F6.15).

---

## English

All 36 texts remain `adaptation_pending`. The English is a **translation, not an
independent adaptation**. Role terminology follows the existing `scp_professions` seed:
*security guard* (väktare), *public order officer* (ordningsvakt), *protective security
officer* (skyddsvakt) — the last two do not appear in this programme.

Every item carries `jurisdiction_id = SE`, so the English version is never presented as
globally applicable.

**Reviewer question:** should the English retain Swedish role names in parentheses, given
that "security guard" carries different powers in other jurisdictions?

---

## Remaining questions for legal, BYA or SME approval

1. **sg-b-02's access-control doctrine** — the single most consequential rewrite. Confirm.
2. **The "unbroken observation" threshold in sg-b-04.**
3. **Whether CCTV disclosure via the supervisor (sg-b-06) is representative.**
4. **Whether person-risk outranks property-risk (sg-b-11)** as employer doctrine.
5. **Whether the 0–3 partial-credit weighting is defensible** before pilot data.
6. **Whether `decision_quality` and `safety_priority` are independent** in sg-cr-16.
7. **English role terminology** for non-Swedish readers.
8. **Whether 30–35 minutes is realistic** — authored, not measured.
