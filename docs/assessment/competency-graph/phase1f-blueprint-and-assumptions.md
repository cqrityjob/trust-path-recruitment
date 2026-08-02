# Phase 1F — 18-item blueprint, review register and content assumptions

**Everything below is `content_status = draft`.** Nothing is published, assignable or
employer-visible. No review requirement has been cleared.

---

## 1. The 18-item blueprint

| ID | Format | Module | Primary behaviour | Competency | Difficulty | Cognitive | Safety | Legal review |
|---|---|---|---|---|---|---|---|---|
| sg-b-01 | SJT best | Observation | situational_judgement | SCC-03 | intermediate | judgement | — | — |
| sg-b-02 | SJT best | Observation | situational_judgement | SCC-03 | intermediate | judgement | — | **yes** |
| sg-b-03 | SJT best | Incident response | proportional_decision_making | SCC-04 | advanced | prioritisation | **yes** | — |
| sg-b-04 | SJT best | Observation | proportional_decision_making | SCC-04 | advanced | judgement | **yes** | **yes** |
| sg-b-05 | SJT best | Access | mandate_and_escalation | SCC-09 | intermediate | judgement | — | **yes** |
| sg-b-06 | SJT best | Ethics | mandate_and_escalation | SCC-09 | advanced | judgement | — | **yes** |
| sg-b-07 | SJT best | Incident response | operational_communication | SCC-06 | foundational | prioritisation | **yes** | — |
| sg-b-08 | SJT best | Reporting | operational_communication | SCC-06 | intermediate | synthesis | — | — |
| sg-b-09 | SJT best | De-escalation | de_escalation | SCC-05 | intermediate | judgement | **yes** | — |
| sg-b-10 | SJT best | De-escalation | de_escalation | SCC-05 | advanced | prioritisation | **yes** | — |
| sg-b-11 | SJT best | Incident response | operational_coordination | SCC-08 | intermediate | prioritisation | **yes** | — |
| sg-b-12 | SJT best | Ethics | integrity_and_information_handling | SCC-01 | foundational | judgement | **yes** | — |
| sg-b-13 | Best/worst | De-escalation | proportional_decision_making | SCC-04 | advanced | judgement | **yes** | — |
| sg-b-14 | Best/worst | De-escalation | de_escalation | SCC-05 | advanced | judgement | **yes** | — |
| sg-b-15 | Best/worst | Access | mandate_and_escalation | SCC-09 | advanced | judgement | **yes** | **yes** |
| sg-b-16 | Constructed | Incident response | factual_reporting | SCC-11 | intermediate | prioritisation | **yes** | — |
| sg-b-17 | Constructed | Reporting | factual_reporting | SCC-11 | intermediate | synthesis | — | — |
| sg-b-18 | Constructed | Ethics | integrity_and_information_handling | SCC-01 | advanced | judgement | **yes** | **yes** |

Composition: **12 single-best-response · 3 best/worst · 3 constructed response**. Each
item maps to exactly one primary observable behaviour; the behaviour maps to the SCC
spine. All 18 are `assessment` mode, Swedish jurisdiction, `authored_by_ai = true`.

### Distractor error types used

`premature_escalation` · `delayed_escalation` · `poor_proportionality` ·
`insufficient_information` · `excessive_informal_trust` · `weak_communication` ·
`tunnel_vision` · `failure_to_document` · `unsupported_assumption` · `outside_mandate`

Every non-preferred option names one — asserted by F2.4, so no score is arbitrary.

---

## 2. Rubrics

Three analytic rubrics, one per constructed-response item, each with **four dimensions ×
five levels (0–4)** = 12 dimensions, 60 levels.

| Rubric | Dimensions | Style dimension |
|---|---|---|
| `sg-cr-16-first-actions` | safety_priority · decision_quality · factual_accuracy · clarity | `clarity` |
| `sg-cr-17-handover` | completeness · decision_quality · factual_accuracy · clarity | `clarity` |
| `sg-cr-18-information` | confidentiality · decision_quality · communication · clarity | `clarity` |

Content and writing quality are separated: exactly one dimension per rubric carries
`assesses_writing_quality = true`, and its criteria state that simple language is judged
equal to polished. Anchors include a **simple-language high scorer** and a
**polished-but-substantively-empty borderline** — the pair the brief requires.

Every rubric names at least one `safety_critical_error` anchor and carries a
`must_not_infer` list of eight: personality, honesty, motivation, emotion, intent,
intelligence, future performance, protected characteristics.

---

## 3. Review-readiness register

**96 requirements, all `outstanding`.** Every item requires `security_sme`,
`cognitive_interview`, `language`, `accessibility` and `pilot`. Six additionally require
`swedish_legal`: **sg-b-02, 04, 05, 06, 15, 18** — the items touching mandate, disclosure
or intervention.

Phase 1F clears none. Asserted by F4.8.

---

## 4. Content assumptions requiring CQrityjob approval

These are authoring judgements, not established facts. Each needs a decision before any
item moves to `expert_review`.

1. **The eight dimensions map 1:1 onto SCC competencies** as: situational_judgement→SCC-03,
   proportional_decision_making→SCC-04, mandate_and_escalation→SCC-09,
   operational_communication→SCC-06, de_escalation→SCC-05, factual_reporting→SCC-11,
   integrity_and_information_handling→SCC-01, operational_coordination→SCC-08. Some are
   arguable — `factual_reporting` could sit under SCC-01 rather than SCC-11.
2. **sg-b-02 assumes a guard has no general right to demand ID from a resident.** This is
   the single most legally sensitive assertion in the set and drives the scoring of
   option C. It must be confirmed against Swedish law and BYA practice.
3. **sg-b-04 assumes an unbroken observation is required before intervention.** Widely
   taught, but the exact threshold varies by employer instruction.
4. **sg-b-06 assumes CCTV disclosure to police runs through the supervisor.** Stated in
   the scenario, so the item tests procedure-following rather than law — but confirm this
   matches real client instructions.
5. **sg-b-11 assumes person-risk outranks property-risk** when two alarms compete. Near
   universal, but should be confirmed as employer doctrine rather than assumed.
6. **The 0–3 option scale** is inherited from PR-A's `score_value` constraint. Partial
   credit uses 2 and 1. Whether 2 is the right weight for "defensible but weaker" is a
   calibration question for pilot data.
7. **No Learning Mode counterparts have been authored.** The schema supports them
   (`learning_counterpart_id`, guarded so a counterpart must be a learning item), but
   deciding which of the 18 need one is a content decision I have deliberately left open.
8. **Option labels currently reuse the scoring rationale text.** `scp_item_option_texts`
   is populated from `scoring_rationale_*` so the items are complete and testable — but a
   candidate-facing label and an internal scoring rationale should eventually be written
   separately. **This is the weakest part of the content and should be corrected before
   cognitive interview.**
9. **English is a translation, not an independent adaptation.** `adaptation_status`
   remains `adaptation_pending` on all 36 texts.
10. **Time estimate 30–35 minutes is authored, not measured.**

---

## 5. What was deliberately avoided

No cartoonish options — every worst option is a named professional error (F2.7). No
invented legal authority. No item depends on information it did not provide
(`information_withheld_sv` is authored per item). No unnecessary violence. No action
outside a guard's mandate is ever the preferred response. No wording claims to measure
personality, honesty or stress tolerance.
