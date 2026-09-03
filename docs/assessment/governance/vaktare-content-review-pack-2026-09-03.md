# Väktare v1 — content review pack (PR-V3, revision 2, 2026-09-03)

**For:** Mostafa and the named security SME / bilingual reviewer.
**Status:** the human content review returned **APPROVE WITH REVISIONS**; this revision
applies those findings. Prepared by an AI assistant as content preparer against a strict
replay of `main`. **Not an SME review; no SME gate moved.** All 250 register rows
(50 items × security_sme, cognitive_interview, language, accessibility, pilot) are still
`outstanding`; every `*_review_status` column is still `pending`.

Full per-item record: `vaktare-v1-item-audit-2026-09-03.json`.
Think-aloud protocol for 5–8 candidates: `vaktare-think-aloud-protocol.md`.

Scoring key, unchanged everywhere: scenario 3 / 1 / 0 with `is_preferred` on the 3;
self-report 0–3 by scale position (reverse-scored where authored), `self_report`, never
in maturity; free text human-read, 4 dimensions × levels 0–4, `clarity` style-only.
**Scoring change in this PR: none. Competency change: none.**

---

## 1. Human review findings applied (revision 2)

| Finding | Item(s) | What was done |
| --- | --- | --- |
| **BLOCKER** — 1-point option restored the extinguisher as a doorstop | b05 | 3 = door closed + recorded + raised at handover · 1 = "Låt dörren vara stängd och gå hem. Problemet är åtgärdat och inget hann inträffa." · 0 = the doorstop restored (`outside_mandate`). Scores 3/1/0 unchanged. |
| Safety / authority | a03 | key keeps the employee at a distance, somewhere safe and in the call ("stanna kvar i samtalet"); nobody is asked to confront; the guard goes first |
| | a05 | 0-option: "Kvittera de två punkterna i ditt eget namn utan att gå dit" |
| | a07 | scenario states lone response, back-up not arrived, and that the site instruction leaves entry to the alarm centre; key = outer check, report, follow the alarm centre's decision; no automatic entry |
| | d03 | severity re-ordered: 1 = call the site now but raise the miss only next time (`failure_to_document`); 0 = trust the next round (`delayed_escalation`, passivity). Scores unchanged, two labels swapped to match |
| | d05 | "säkerhetskänsliga utrymmen" / "security-sensitive areas"; key tells the alarm centre or supervisor before any security-sensitive point goes unchecked, prioritises, signs only what was visited, hands over the rest. No fourth option was added (option count is identity) |
| Precision | b02 | "Ingen synlig elutrustning i kontakt med vattnet" / "No visible electrical equipment in contact with the water"; b: "steps have been taken while awaiting the caretaker" |
| | d06 | key: "inte lämna ut uppgiften utan en behörig begäran … ansvarig chef eller systemägare enligt rutinen" |
| b06 | b06 | kept for the shadow pilot as a recognition-leaning reporting item; poorest option no longer explains why it is poor; mapping unchanged |
| Self-report keys | c03 | pair intro no longer says "neither is wrong"; authored 1/3 key stands as a two-point description. **Not changed:** c06, c18, c24 keep the authored intro with the same shape (not raised by the reviewers) — flagged |
| | c07, c19 | **BLOCKED** — see §3. Text and scores exactly as authored |
| c14 | c14 | "Om jag rättar till ett eget misstag som inte fick någon konsekvens låter jag bli att rapportera det" / "I leave it unreported" |
| Free text | e01–e04, section E | example may come from work, a placement, studies, a club or association, or another situation of responsibility; short sentences or bullet points are fine; what matters is what you did, not how you phrase it. "A few sentences **are** enough." e04: "what the information was about" |
| Tone cue | a02 a04 a05 a06 a07 a08 b01 b03 b06 d01 d02 d04 d06 (+ a01 a09 a10 b04 d05) | every rationalising tail removed ("de som tittar behöver se att du har kontroll", "relationen till uppdragsgivaren är viktig", "varje minut räknas", "sex år utan fel talar för sig", "knappast en säkerhetsrisk", "ju mindre du diskuterar det desto bättre", and their kin); lengths rebalanced with concrete actions instead |
| SV/EN | a03 a09 b02 b05 c04 c20 d01 d05 e01–e04 | "stanna kvar i samtalet"; "i tidsordning / in chronological order"; "I rely on remembering it"; "larmat i onödan / raised an alarm unnecessarily"; "nothing has gone wrong in six years"; "security-sensitive"; "what the information was about" |
| Fairness | c06 c09 c12 c21, section C | "gå igenom ett område du ska kontrollera", "de sista kontrollerna", "ett arbetspass / a shift or working day", "När jag slutar för dagen"; section C still says: answer from other work if you have not guarded |
| Product claim | programme purpose (draft) | "Väktare v1 är ett rollspecifikt bedömnings- och intervjuunderlag som strukturerar scenariorespons, kandidatens egna beskrivningar och fritextsvar inför en mänsklig rekryteringsbedömning." + the three negations. Inputs are never called "observed evidence" collectively |
| SCC-08 | a10 | unchanged; the migration and the guard now assert one observed item and that `developing_evidence` needs two, so one attempt caps at *limited evidence* |

Decisions: KEEP 14 / EDIT 36 / REPLACE 0 / RETIRE 0. Option-length: preferred longest 8/22 (sv) · 6/22 (en); shortest 6/22 · 7/22; rank spread 8/8/6 · 6/10/6.

## 2. Left unchanged but flagged

- **a03** — key is "person at a distance first, alarm centre told the perimeter alarm is unchecked". Some sites would key the alarm. c's `delayed_escalation` label is a weak fit for delegating a question to an employee.
- **a07** — key is now "outer check, report, follow the alarm centre". The scenario states the instruction; confirm the wording matches common object instructions.
- **a08** — foundational; borders on first-aid knowledge. Kept.
- **b01** — both distractors `unsupported_assumption` at two degrees; recognition item; preferred is longest by nature of an observation.
- **b02, b06** — report-quality items reward careful readers by construction; b06 now treated as recognition/reporting knowledge in interpretation, mapping unchanged.
- **d01 vs a05** — same preferred behaviour toward a colleague's shortcut under two competencies.
- **d05** — arithmetic load kept; the key is now long by content (coordination + prioritisation + honest sign-off + handover).
- **c06, c18, c24** — authored "Inget av dem är fel" with a 1/3 key, same structure the reviewers objected to on c03.
- **Level 0** on a free-text dimension is "no evidence"; the derived contribution still counts it at 0. Semantics unchanged; flagged for the owner.

## 3. BLOCKED — Product Owner / SME scoring decision required

- **c07** (0 / 2 / 3 / 2): "almost never needing to remind myself" scores 0 on the authored theory that not recognising autopilot is itself a flag. Cannot be made monotonic or descriptive-only without changing score values.
- **c19** ("Ibland" = 3): a peak key whose defensibility is context-dependent. Same constraint.

Why no content-level fix exists: the self-report pattern in the employer brief
(`scp_attempt_self_report_pattern`) is a confidence-weighted mean of stored contributions
per facet, so every stored score is an ordered input to "rarely / mostly / consistently
describes working this way". Changing that interpretation is a report-calculation change;
changing the values is a scoring change. Both are outside this PR. The items are left
exactly as authored, the guard pins that state (K10), and the employer brief's pattern for
the two facets continues to include them until the decision is taken.

Options for the decision: flatten to a constant score (descriptive only), re-key
monotonically, or accept the authored keys with the interview prompt as the only
interpretation.

## 4. SME questions still open (no key changed)

1. **a03** Is "employee at a distance and in the call, guard goes to the person first, alarm centre told the perimeter alarm is unchecked" the answer a working arbetsledare would key?
2. **a05** Does "sign the two points off in your own name without going to them" describe the 0-scored error?
3. **a07** With back-up not arrived and the instruction leaving entry to the alarm centre, is "outer check, report, follow their decision" the keyed first step?
4. **b06** Judgement, or report-writing knowledge that belongs in a knowledge test?
5. **d01 / a05** Keep both, or accept that d01 mostly re-measures a05?
6. **c06 / c18 / c24** Apply the c03 treatment (drop "neither is wrong") or keep the authored intro?
7. **c07, c19** — the scoring decision in §3.

## 5. Fairness flags

- Experience proxy in the self-report block reduced further (c06, c09, c12, c21) and covered by the section-C sentence; the constructs remain about guarding work.
- Reading burden: b02 (three reports), d05 (numbers, and a long key), a07 (four-sentence scenario now that it states the instruction). All job-relevant; accessibility reviewer to confirm.
- Writing-style bias in free text reduced by the short-sentence / bullet-point permission and the "not how you phrase it" sentence; `clarity` stays style-only and excluded from contribution.
- No age, gender, ethnicity, religion, disability, education or socioeconomic proxy found.

## 6. Language flags (bilingual reviewer)

- b02 UK plant vocabulary (stopcock, plant room, on-call, floor drain).
- a07 "objektsinstruktionen" / "site instruction"; d05 "säkerhetskänsliga" / "security-sensitive"; a03 "skalskyddet" / "the perimeter".
- e03 "how it went" is deliberately looser than "how it ended".

## 7. Review gates after this revision — honestly

| Gate | State | Who |
| --- | --- | --- |
| Technical / content review (this PR) | done: 76-assertion guard + migration proof; audit JSON | — |
| en-GB text status | `adaptation_reviewed` (not approved) | — |
| `language` register row | **outstanding** — named bilingual reviewer | human |
| `security_sme` | **outstanding** — §3 and §4 | named SME |
| `cognitive_interview` | **outstanding** — think-aloud protocol prepared, not run | human |
| `accessibility` | **outstanding** — §5 | human |
| `pilot` | **outstanding** — shadow-pilot data | pilot |
| c07 / c19 scoring | **BLOCKED** | Product Owner + SME |

Not claimed anywhere: reliability, validity, norms, percentiles, empirical difficulty,
fairness established, pilot review complete.
