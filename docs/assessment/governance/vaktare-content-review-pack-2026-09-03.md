# Väktare v1 — content review pack (PR-V3, revision 4, 2026-09-03)

**For:** Mostafa and the named security SME / bilingual reviewer.
**Status:** the final human content check returned **APPROVE WITH SPECIFIC CORRECTION**;
revision 3 applied the eight corrections; revision 4 applies three exact copy corrections (a03, d06 b EN, e03 guidance) and nothing else. Prepared by an AI assistant as
content preparer against a strict replay of `main`. **Not an SME review; no SME gate
moved.** All 250 register rows (50 items × security_sme, cognitive_interview, language,
accessibility, pilot) are still `outstanding`; every `*_review_status` column is still
`pending`.

Full per-item record: `vaktare-v1-item-audit-2026-09-03.json`.
Think-aloud protocol for 5–8 candidates: `vaktare-think-aloud-protocol.md`.

Scoring key, unchanged everywhere: scenario 3 / 1 / 0 with `is_preferred` on the 3;
self-report 0–3 by scale position (reverse-scored where authored), `self_report`, never
in maturity; free text human-read, 4 dimensions × levels 0–4, `clarity` style-only.
**Scoring change in this PR: none. Competency change: none.**

---

## 1. Revisions 3 and 4 — the eight corrections, then three exact copy corrections (a03, d06 b EN, e03 guidance)

| Item | Human finding | What was done |
| --- | --- | --- |
| a03 | "Åk dit först / Go there first" ambiguous; "take the staff area" unnatural | key (r4, reviewers' exact wording): "Åk till personalutrymmet först. Be den anställde gå till en säker plats, hålla avstånd och stanna kvar i samtalet. Be personen hålla uppsikt bara om det kan ske säkert och meddela larmcentralen att dörrlarmet inte är kontrollerat." / "Go to the staff area first. Ask the employee to move to a safe place, keep their distance and stay on the call. Ask them to keep watch only if they can do so safely, and tell the alarm centre that the door alarm has not been checked." b: "go straight on to the staff area". Key unchanged |
| a07 | unnatural English | "Back-up is available but has not yet arrived"; key "Check the exterior of the building, report what you see to the alarm centre and follow their decision on what to do next." Swedish unchanged; key unchanged |
| b05 | 1-point option justified itself | 1 = "Låt dörren vara stängd, avsluta passet som vanligt och gå hem." / "Leave the door closed, finish the shift as usual and go home." Action only. 3 and 0 unchanged; scores unchanged |
| b06 | option c mixed relevance with poor chronology | c = "Med det som hände, det du såg och det du gjorde, i den ordning du kommer ihåg det." / "With what happened, what you saw and what you did, in the order you remember it." Error is memory order without a timeline only (`failure_to_document`). b English: "the supporting details after it". Score 0 unchanged |
| d05 | key longest and most complete; prioritisation not coordinated | key: "Meddela larmcentralen eller arbetsledaren att ronden inte hinns med, följ deras besked om vad som prioriteras, kvittera bara de punkter du gått och skriv i överlämningen vilka som återstår." (189) · b prioritises alone, signs honestly, notes the cut in the log (165, `outside_mandate`) · c signs the whole round, mentions the alarm at handover (139). The guard now caps the key at 1.3× the longest distractor for this item |
| d06 | English lacked "enligt rutinen"; c gave itself away | key EN "… according to the established procedure"; c = "Titta efter och säg vilken tid det var, och be personen ta det vidare med sin chef om det behövs mer." — a weaker action, no justification; b English (r4): "Say that you are not allowed to release that kind of information, and return to what you were doing." |
| e01 | "a mistake at work" contradicted the example-source guidance | prompt: "Beskriv en situation där du hade ansvar för en uppgift och något inte gick som det var tänkt. Vad gjorde du efteråt?" / "Describe a situation where you were responsible for a task and something did not go as intended. What did you do afterwards?" Guidance unchanged |
| e03 | "upprepat arbete" unnatural | "… hålla koncentrationen uppe under enformigt eller återkommande arbete" / "stay focused during monotonous or repetitive work"; guidance (r4): "Berätta vad uppgiften eller aktiviteten handlade om, vad som var din roll, vad du gjorde för att hålla koncentrationen, hur det gick och vad du tog med dig." / "Tell us what the task or activity involved, what your role was, what you did to stay focused, how it went and what you took from it." |

No other item, block intro, rubric criterion or programme text changed between revision 2 and 3 (verified document diff: exactly these eight items).

## 2. Product Owner decision — c07 / c19 (locked)

Keep the existing technical keying during the shadow pilot. Both are **methodologically
open self-report items**: they remain `self_report`, never become observed evidence,
never independently support a competency conclusion, and stay subject to pilot-data
review before any future scoring or keying change. Text and scores are exactly as
authored; the migration proves `self_report` + non-maturity (`SCP_V3_C07_C19`) and the
guard pins the authored text (K10, K14).

Documented limitation, not changed: the employer brief's self-report pattern is a mean over
the three items of each facet, so these two items still contribute to the facet's
"rarely / mostly / consistently describes working this way" sentence. That sentence is
self-report, labelled as such, and is not a competency level. Isolating them would be a
report-logic change, out of scope.

## 3. Carried from revision 2 (approved, unchanged)

Blocker b05 structure (3 = closed + recorded + handed over; 0 = doorstop restored);
a05 (signed off without going to them); d03 severity order; b02 observable claim; tone
tails removed from all 22 scenario items; c03 context; c14 concrete; c06/c09/c12/c21
without guard-employment assumptions; free-text guidance (example from work, a placement,
studies, a club or association, or another situation of responsibility; short sentences or
bullet points; what matters is what you did, not how you phrase it); product claim on the
draft programme purpose; SCC-08 cap asserted in migration and guard.

Decisions: KEEP 14 / EDIT 36 / REPLACE 0 / RETIRE 0. Option-length: preferred longest
9/22 (sv) · 7/22 (en); shortest 6/22 · 5/22; rank spread 9/7/6 · 7/10/5; max ratio 1.46 ·
1.54. a03, d05 and d06 keys are the longest option by content of the required elements;
their distractors carry comparable procedural detail.

## 4. Still flagged (unchanged, for the named reviewers)

- a03 person-first over confirmed alarm; a07 outer check as the keyed first step; a08
  foundational; b01 recognition item; b02 and b06 reading burden; d01 vs a05 overlap;
  c06 / c18 / c24 keep the authored "Inget av dem är fel" with a 1/3 key; Level 0 on a
  free-text dimension counts at contribution 0.

## 5. Fairness and language flags

- Experience proxy in self-report reduced (c06, c09, c12, c21) and covered by the
  section-C sentence; e01 now works for any responsibility, e03 for any monotonous work.
- Reading burden: b02 (three reports), d05 (numbers, three longish options), a03 and a07
  (four-clause keys and scenarios). Accessibility reviewer to confirm.
- Bilingual reviewer: b02 UK plant vocabulary; a03 "gå till en säker plats" / "move to a safe place"; a07
  "objektsinstruktionen" / "site instruction"; d05 "säkerhetskänsliga" / "security-sensitive";
  d06 "enligt rutinen" / "according to the established procedure".

## 6. Review gates after this revision — honestly

| Gate | State | Who |
| --- | --- | --- |
| Technical / content review (this PR) | done: 81-assertion guard + migration proof; audit JSON | — |
| en-GB text status | `adaptation_reviewed` (not approved) | — |
| `language` register row | **outstanding** — named bilingual reviewer | human |
| `security_sme` | **outstanding** — named SME sign-off | named SME |
| `cognitive_interview` | **outstanding** — think-aloud protocol prepared, not run | human |
| `accessibility` | **outstanding** — §5 | human |
| `pilot` | **outstanding** — shadow-pilot data | pilot |
| c07 / c19 | keying kept by Product Owner decision; pilot-data review open | PO + pilot |

Not claimed anywhere: reliability, validity, norms, percentiles, empirical difficulty,
fairness established, pilot review complete.
