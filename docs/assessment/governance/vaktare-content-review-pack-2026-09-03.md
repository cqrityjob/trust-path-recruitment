# Väktare v1 — content review pack (PR-V3, 2026-09-03)

**For:** Mostafa and the named security SME / bilingual reviewer.
**Prepared by:** an AI assistant as content preparer, against a strict replay of `main`
at `3f2d2ad`. **This is not an SME review and moves no SME gate.** Every one of the
250 register rows (50 items × security_sme, cognitive_interview, language,
accessibility, pilot) is still `outstanding`; every `*_review_status` column is still
`pending`.

The full per-item record (texts before/after, options, scores, error patterns,
length ranks, fairness / ambiguity / social-desirability notes, classification) is
`vaktare-v1-item-audit-2026-09-03.json`. This page is the short version.

Scoring key, unchanged everywhere: scenario 3 / 1 / 0 with `is_preferred` on the 3;
self-report 0–3 by scale position (reverse-scored where authored), `self_report`,
never in maturity; free text human-read, 4 dimensions × levels 0–4, `clarity`
style-only. **Scoring change in this PR: none.** Competency change: none.

---

## 1. What changed automatically (32 of 50 items) — and why

| Group | Items | What | Why |
| --- | --- | --- | --- |
| Option-length balance | all 22 scenario items | labels rewritten so the preferred option is the longest on 7/22 (sv) and 7/22 (en), the shortest on 7/22, middle on 8/22 — from 22/22 longest in both languages | form must not reveal the key; PR-V1 fixed position, this fixes size |
| Distractor plausibility | a02, a04, a06, a09, b03, d02, d04 | each distractor now carries its own reasoning ("the onlookers need to see you are in control", "may be one of this week's contractors", "their employee, their premises") | a caricature distractor makes the key obvious by moral contrast, not by judgement |
| Count defect | b01 | "Fyra formuleringar" / "Four ways" → three; there were only three options | plain error |
| Ambiguity | a05 | option c ("sign the points in your own name so the log is correct") could be read as *visiting* the points; now "sign them off in your own name instead, so their sign-offs are not questioned" — what the authored rationale always described | a 0-scored option must be unambiguously the error it is scored as |
| Error-pattern labels | a10 c, b05 c, d06 b | `failure_to_document` / `delayed_escalation` / `insufficient_information` → `weak_communication`; rationales rewritten to match the option | the label did not describe the option (a10: everything *is* in the log; the failure is no spoken handover) |
| Thin scenario | b06 | "an incident during your shift" added; the item previously gave no event | judgement needs something to judge |
| Self-report wording | c01, c04 | "ibland" / "oftast" removed from statements answered on a frequency scale | double quantifier |
| Self-report wording | c09 | "late in a night shift" → "towards the end of a long shift" | night-shift experience proxy |
| Self-report wording | c14 | "tycker jag att det räcker" (opinion) → "nöjer jag mig med att rätta till det" (behaviour) | self-report should describe observable behaviour |
| Self-report wording | c16, c20 | "someone I have never met" → "a stranger"; EN "letting it pass" → "letting it go" | absolute under a frequency scale; EN word collides with the pass/fail vocabulary ban |
| Section intro C | — | "If you have not worked in security, answer from other work you have done." | 24 statements presuppose guarding; new entrants could not answer honestly |
| Free text | e01–e04 | guidance asks for **what happened → your role → what you did → how it ended → what you took from it** in one natural prompt; the four rubric criteria that read "what was done" / "held the line" / "self-observation" / "correcting forward" now name the outcome and the learning; section E intro says the same | concrete behavioural evidence a reviewer can read against the rubric and a recruiter can follow up in the interview |
| English texts | all 50 | reviewed for same scenario, same demand, same key, same plausibility, no Swedish idiom that changes difficulty; UK register kept (stopcock, plant room, on-call); recorded `adaptation_reviewed` with reviewer and notes on the row | "content/language reviewed", **not** validated, **not** approved |

KEEP (18): c02, c03, c05, c06, c07, c08, c10, c11, c12, c13, c15, c17, c18, c19, c21,
c22, c23, c24 — text byte-identical to authored (the guard checks this).

## 2. Left unchanged but flagged

- **a03** — key is "person in the staff area before the confirmed perimeter alarm". Defensible; some sites would key the alarm. Distractor c's label `delayed_escalation` is a weak fit (delegating a confrontation to an employee); the taxonomy has no closer value.
- **a07** — key is "outer check, inform the alarm centre, ask for the section, then enter". Some instructions require a second unit before entry when two anomalies coincide.
- **a08** — foundational; borders on first-aid knowledge rather than judgement. Kept: it is job-relevant and the distractors are real error patterns.
- **b01** — both distractors are `unsupported_assumption` at two degrees. Acceptable for a recognition item.
- **b02, b06** — report-quality items reward careful readers by construction. Job-relevant; flagged for the accessibility reviewer.
- **d01 vs a05** — same preferred behaviour toward a colleague's shortcut (do it, tell them, raise it) under two competencies (SCC-01 / SCC-09). d01 may mostly re-measure a05.
- **d05** — arithmetic load (40 / 30 / 50 minutes, 12 / 3 / 9 points). Kept because prioritisation needs the numbers; flagged for accessibility review.
- **c03** — forced-choice pair introduced as "neither is wrong" but scored 1 / 3.
- **c07** — non-monotonic key (0 / 2 / 3 / 2): "almost never needing to remind myself" scores 0 on the authored theory that not recognising autopilot is itself a flag.
- **c19** — peak-scored key (Sometimes = 3).
- **SCC-08 (Samarbete och samordning)** has exactly one observed item (a10, handover). Not solved by adding items — see §6.

## 3. Items needing an SME decision — the exact questions

1. **a03** Is "go to the unknown person in the staff area before a confirmed door alarm at the perimeter" the answer a working arbetsledare would key, on a site with no other resource?
2. **a05** Does the rewritten option c ("sign the two points off in your own name instead, so their sign-offs are not questioned") describe the error you want scored 0 — participation in the false log?
3. **a07** Is "walk the perimeter, inform the alarm centre, ask for the section, then enter" the standard first step, or do common instructions require waiting for a second unit / police before entry when two anomalies coincide?
4. **b06** Is "chronological with times, observations, actions, own assessments separate" a judgement a new guard is expected to have, or trained knowledge that belongs in a knowledge test?
5. **d01 / a05** Keep both (two contexts, two competencies) or accept that d01 mostly re-measures a05?
6. **c03** Keep the 1 / 3 score on a pair introduced as "neither is wrong" (it only feeds the self-described pattern, never maturity), or make it 2 / 2 and rely on the interview prompt?
7. **c07** Accept the non-monotonic key for a self-description, or make the scale monotonic?
8. **c19** Accept Sometimes = 3 (a threshold that is neither too high nor absent), or make the scale monotonic?

None of these changes a key in this PR. If any answer says the key is wrong, that item is
**PRODUCT OWNER / SME DECISION REQUIRED** and gets its own change.

## 4. Fairness flags (specialist review)

- **Experience proxy** in the 24 self-report statements (kontrollpunkter, passet, larmat). Reduced by the section-C intro sentence and c09; not removed — the constructs are about guarding work. Ask the fairness reviewer whether "answer from other work" is enough for a first-job candidate.
- **Reading burden**: b02 (three reports, ~190 characters each), d05 (numbers), a06 / a07 (three-sentence scenarios). All job-relevant; accessibility reviewer to confirm.
- **Native-language advantage**: `hen` throughout, no idiom that changes difficulty in either language; the English is UK register. A bilingual reviewer with guarding vocabulary should read a03, a07, b02, d05 in both languages side by side.
- No age, gender, ethnicity, religion, disability, education or socioeconomic proxy found in any scenario; b01's "man, 30–40 år, mörk jacka" is the *content* of an observation-vs-conclusion item, not a cue about the candidate.

## 5. Language flags (bilingual reviewer)

- b02 uses UK plant vocabulary (stopcock, plant room, on-call, floor drain). Confirm it is the register the pilot organisation's English-speaking candidates use.
- a03 "skalskyddet" / "the perimeter"; d05 "utrymmen med skyddsvärde" / "areas with protective value" — confirm the English reads as guarding, not as translation.
- e03 English "how it went" (sv "hur det gick") is deliberately looser than "how it ended" — the concentration story has no event to end.

## 6. Keying flags

- No key changed. The four keying questions are §3 items 1–4 and 6–8.
- **SCC-08 with one observed item**: a single handover item cannot establish coordination; it can only open the question. For a shadow pilot this is acceptable **only because** the released report already routes SCC-08 to an authored interview prompt (`scp_interview_guide_prompts`, focus `explore_limited_evidence`) and the report's own language for one observation is "limited evidence". The employer brief must not read one observation as a level. Adding items is a separate, owner-scoped decision.
- **Level 0 on a free-text dimension** is "Inget underlag i svaret för denna dimension" — no evidence, not negative evidence. Note for the owner: the derived contribution still counts a 0 as an observation at contribution 0, so an answer that shows nothing on a dimension pulls the competency toward *limited evidence*, which is the evidence-strength label, not a verdict on the person. Semantics unchanged in this PR; flagged.

## 7. Review gates after this PR — honestly

| Gate | State | Who |
| --- | --- | --- |
| Technical / content review (this PR) | done: 54-assertion guard + migration proof; audit JSON | — |
| en-GB text status | `adaptation_reviewed` (not approved) | — |
| `language` register row | **outstanding** — needs a named bilingual reviewer | human |
| `security_sme` | **outstanding** — §3 questions | named SME |
| `cognitive_interview` | **outstanding** — needs 5–8 candidates thinking aloud | human |
| `accessibility` | **outstanding** — §4 reading-burden flags | human |
| `pilot` | **outstanding** — needs shadow-pilot response data | pilot |
| `sme_review_status` etc. on item versions | `pending`, all 50 | — |

Not claimed anywhere: reliability, validity, norms, percentiles, empirical difficulty,
fairness established, pilot review complete.
