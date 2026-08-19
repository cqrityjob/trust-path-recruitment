# SME review pack — SG operational baseline

For a working Swedish security professional (operativ väktarerfarenhet, ideally
also arbetsledning). Four questions. **No SME gate has been moved**;
`sme_review_status` is `pending` on all eighteen item versions and
`security_sme` is `outstanding` on all eighteen register rows.

Scoring key: 3 = preferred · 2 = defensible but weaker · 1 = poor ·
0 = unsafe or outside mandate. Participants never see these.

---

## A. sg-b-13 — is reporting to the larmcentral really worse than watching?

**Scenario (SV).** "En person går fram och tillbaka utanför en nattöppen entré
och tittar upprepat in genom glaset. Personen har inte försökt gå in och har inte
sagt något till dig." Best/worst format, lone guard.

|     | Option (SV)                                                                    | Score | Key       |
| --- | ------------------------------------------------------------------------------ | ----- | --------- |
| A   | Behåll uppsikten och ta lugnt kontakt för att fråga om personen behöver hjälp. | 3     | **BEST**  |
| B   | Fortsätt observera personen på avstånd utan att ta kontakt.                    | 2     |           |
| C   | Kontakta larmcentralen och rapportera personens beteende som misstänkt.        | 1     |           |
| D   | Gå fram till personen och uppmana hen att lämna platsen direkt.                | 0     | **WORST** |

**The question.** Many assignments instruct a lone guard at a night entrance to
notify the larmcentral **before** approaching an unknown person. The scenario
states no instruction either way. Does contacting the control room genuinely
deserve to score _below_ passive observation — or does the current key penalise
compliance with a common standing instruction?

**Also.** The internal rationale for C is _"För tidigt: inget beteende motiverar
ännu en anmälan"_. Is "pacing and repeatedly looking in through the glass at a
night entrance" really below the threshold for a radio notification?

**What depends on it.** The 3/2/1/0 spread on a safety-critical best/worst item,
and whether the scenario must state the site instruction.

---

## B. sg-b-04 — intervention threshold, and C over D

**Scenario (SV).** "Du ser en person stoppa en vara i sin jacka i en butik du
bevakar. Personen går sedan mot kassorna men du tappar bort personen i trängseln
i några sekunder innan du ser hen passera utgången."

|     | Option (SV)                                                 | Score |
| --- | ----------------------------------------------------------- | ----- |
| A   | Avstå från ingripande och dokumentera iakttagelsen.         | **3** |
| B   | Ingrip och uppge att personen tagit varan.                  | 0     |
| C   | Fråga en kollega som tror sig ha sett samma sak och ingrip. | 2     |
| D   | Släpp händelsen utan notering.                              | 1     |

**The questions.**

1. Is "a few seconds' loss of sight in a crowd breaks the observation" the
   threshold a working butiksväktare is actually held to, or is it stricter /
   looser than practice?
2. **C scores above D.** Seeking a colleague's informal corroboration and then
   intervening is currently rated _better_ than dropping the matter without a
   note. Is that professionally defensible, or does it reward a step toward
   intervening on acknowledged-weak evidence?
3. Is A (decline, but document) genuinely the single best action, or would a
   competent guard also notify butikspersonal / the store's own routine?

**Note.** This item is also in the legal pack. The SME question is what practice
is; the legal question is what the law permits. Both are needed.

---

## C. sg-b-08 — should abandoning an active incident be safety-critical?

**Scenario (SV).** "Ditt pass tar slut mitt under en pågående händelse: en dörr
har brutits upp, polis är kallad men inte framme, och du har spärrat av området.
Din avlösare kommer nu."

|     | Option (SV)                                                                      | Score |
| --- | -------------------------------------------------------------------------------- | ----- |
| A   | Redogör för händelsen, vidtagna åtgärder, avspärrningen och att polis är kallad. | **3** |
| B   | Berätta vem du tror ligger bakom.                                                | 1     |
| C   | Säg att polis är kallad.                                                         | 2     |
| D   | Lämna platsen när passet tar slut.                                               | 0     |

**The question.** `sg-b-08` is currently **not** safety-critical. Because of
that, a participant who chooses D is scored deterministically and **no human
ever sees the answer** — even though D's own internal rationale calls it _"en
allvarlig brist"_ and it is arguably the most dangerous single choice in the
eighteen-item bank.

Should leaving an active forced-entry incident at shift end be treated as a
safety-critical response requiring human review?

**What depends on it.** One boolean (`is_safety_critical` on the item version),
which under the current routing rule also adds a fourteenth human review per
participant. The owner has been asked not to change classifications without SME
input, which is why this is a question rather than a change.

**Related, for the same reviewer.** `sg-b-07` (failing to acknowledge a fire
alarm by radio) **is** classified safety-critical. Is an incomplete radio
acknowledgement a safety judgement, or a communication error that is currently
generating a mandatory severity judgement on every participant?

---

## D. Competency mappings

The eight role behaviours attach to the twelve-construct SCC spine. Four of those
attachments are contested. Full reasoning and the current canonical definitions
are in the remediation report; the short form:

| Behaviour                                         | Currently maps to                                 | Contested because                                                                                                                                                                             | Ask                                                                  |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `de_escalation` (items 09, 10, 14)                | SCC-05 Emotionell självreglering                  | The items assess technique directed at another person, not the guard's own impulse control — and the programme's `does_not_measure` explicitly excludes "emotionell stabilitet"               | Confirm the move to **SCC-07 Respektfull service och gränshållning** |
| `factual_reporting` (items 16, 17)                | SCC-11 Professionellt omdöme och proportionalitet | SCC-06 is defined as transferring information "clearly, **factually** and appropriately for the recipient", which is the behaviour verbatim                                                   | Confirm the move to **SCC-06**                                       |
| `proportional_decision_making` (items 03, 04, 13) | SCC-04 Beslutsfattande under press                | SCC-11 is literally named "…och **proportionalitet**"; none of the three scenarios contains time pressure — though all three do contain _limited information_, which SCC-04 also names        | **Decide**: SCC-04 or SCC-11                                         |
| `mandate_and_escalation` (items 05, 06, 15)       | SCC-09 Ansvarstagande och tillförlitlighet        | Mandate limits read closer to SCC-11 ("within mandate") or SCC-01's own facet ("eskalerar när instruktioner kolliderar"); SCC-09's "traceability from assignment to closure" is a partial fit | **Decide**: keep SCC-09 or move                                      |

**The coupling to be aware of before deciding.** `factual_reporting` is the only
behaviour currently on SCC-11. If it moves to SCC-06 and
`proportional_decision_making` stays on SCC-04, **SCC-11 is left with no
behaviour at all** — while `scp_role_competency_map` still lists SCC-11 as a
`core` competency for the väktare role. The role would claim a core competency
with no evidence path. Questions 3 and 4 in the table should therefore be
answered together with question 2, not separately.

**Two item-level questions for the same reviewer.**

- **sg-b-16** carries the `factual_reporting` behaviour, but the task is _"skriv
  dina tre första åtgärder, i prioritetsordning"_ and the rubric leads with
  `safety_priority`. Its own `primary_construct` says `prioritisation`. Is it on
  the right behaviour at all?
- **sg-b-02** carries `situational_judgement` → SCC-03 Situationsmedvetenhet,
  but its own `tests_what` says `mandate`. Which is it?

**Why this is urgent rather than post-pilot.** `scp_competency_evidence` is
append-only and each row is bound to a specific `behaviour_version`. Evidence
written under a mapping the SME later rejects cannot be corrected — only
superseded. It is cheaper to decide now: **no real pilot evidence exists yet**
(four fixture rows, all on `proportional_decision_making`, none safety-critical).
