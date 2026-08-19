# Swedish legal review pack — SG operational baseline

For a Swedish lawyer with security-industry (bevakningsbransch) familiarity.

**Nothing in this pack is a legal conclusion.** No legal gate has been moved.
`legal_review_status` is `pending` on `sg-b-04`, `sg-b-05`, `sg-b-06` and
`not_required` on `sg-b-02`, `sg-b-15`, `sg-b-18` — a disagreement with
`scp_review_requirements`, which lists all six as requiring `swedish_legal`.
Reconciling that is a separate approved migration; this pack covers all six.

**Priority before pilot: `sg-b-04` and `sg-b-06`.** The other four can be
reviewed in parallel but do not block.

Scoring key: 3 = preferred · 2 = defensible but weaker · 1 = poor ·
0 = unsafe or outside mandate. The participant never sees these values, the
rationales, or which option is preferred.

---

## PRIORITY 1 — sg-b-04 · Osäker snatteriiakttagelse

**Scenario (SV, as delivered).** "Du ser en person stoppa en vara i sin jacka i
en butik du bevakar. Personen går sedan mot kassorna men du tappar bort personen
i trängseln i några sekunder innan du ser hen passera utgången."
**Prompt.** "Vad gör du?"

|     | Option (SV, as delivered)                                   | Score |
| --- | ----------------------------------------------------------- | ----- |
| A   | Avstå från ingripande och dokumentera iakttagelsen.         | **3** |
| B   | Ingrip och uppge att personen tagit varan.                  | 0     |
| C   | Fråga en kollega som tror sig ha sett samma sak och ingrip. | 2     |
| D   | Släpp händelsen utan notering.                              | 1     |

**What the item depends on.** That an intervention requires a sufficiently
certain, _unbroken_ personal observation, and that a few seconds' loss of sight
in a crowd breaks it. Stored as `legal_assumption_sv`: _"Bygger på att ingripande
kräver ett tillräckligt säkert eget iakttagelseunderlag. Ingen straffrättslig
bedömning görs i scenariot."_ The item is classified `tests_what = 'judgement'`,
not `legal_knowledge`, and the scenario does **not** state the rule.

**What the scoring key currently assumes.** (i) That declining to intervene is
the single best action. (ii) That intervening on a broken observation is
_outside mandate / unsafe_ (score 0). (iii) That seeking a colleague's informal
corroboration and then intervening is **better** than dropping the matter
entirely (2 vs 1).

**Questions for the reviewer.**

1. Is "unbroken personal observation" an accurate statement of the threshold a
   väktare must meet before intervening on suspected shoplifting under Swedish
   law and BYA practice — or is it employer procedure that varies by assignment?
2. If it is practice rather than law, may the item still key on it while
   claiming to test judgement rather than legal knowledge, given the scenario
   never states the rule?
3. Does option C (act on a colleague's "thinks they saw the same") carry a
   materially higher legal risk than option D (drop it), such that scoring C
   above D is defensible?
4. Does option B's rationale — "risks a wrongful intervention" — understate the
   exposure (unlawful detention, ofredande, discrimination claim)?

**What depends on the answer.** If the threshold is not a rule the participant
can be expected to apply, the item must either state the rule in the scenario or
be reclassified as `procedural_knowledge`. If C-over-D is wrong, the key changes.
Both are content migrations that must land before any pilot evidence is written.

---

## PRIORITY 2 — sg-b-06 · Begäran om kameramaterial

**Scenario (SV).** "En polis kommer till bevakningsobjektet och ber att direkt få
se kameramaterial från en händelse tidigare samma dag. Din instruktion säger att
utlämnande sker via arbetsledningen."
**Prompt.** "Vad gör du?"

|     | Option (SV)                                                | Score |
| --- | ---------------------------------------------------------- | ----- |
| A   | Kontakta arbetsledningen och informera polisen om rutinen. | **3** |
| B   | Visa materialet direkt.                                    | 0     |
| C   | Neka utan förklaring.                                      | 1     |
| D   | Be polisen återkomma skriftligen.                          | 2     |

**What the item depends on.** That the assignment's disclosure routine governs,
and that following it is not obstruction. `legal_assumption_sv`: _"Instruktionen
om att utlämnande sker via arbetsledningen anges i scenariot. Ingen bedömning av
dataskyddsrätt krävs av deltagaren."_ The rule **is** stated in the scenario.

**What the scoring key currently assumes.** (i) Immediate disclosure to a police
officer, outside the routine, is the worst available action (score 0). (ii)
Asking for a written request without informing the supervisor is defensible but
weaker (2). (iii) Following the routine while explaining it to the officer is
best.

**Questions for the reviewer.**

1. Is there any circumstance under Swedish law in which a guard **must** hand
   over footage immediately on a police request, such that scoring option B at 0
   would train the wrong behaviour?
2. Does the interaction of kamerabevakningslagen, GDPR and the employer's role
   as personuppgiftsansvarig support "disclosure goes through the supervisor" as
   the correct default for a väktare?
3. Is option D (written request, no supervisor contact) genuinely inferior to A,
   or is it equally defensible?
4. Does anything in the item risk teaching participants to obstruct a lawful
   police request?

**What depends on the answer.** Whether the item ships at all, and whether the
B = 0 key stands. This is the item most likely to be quoted back at CQrityjob if
a pilot participant later acts on it.

---

## sg-b-02 · Okänd person i trapphus

**Scenario (SV).** "Klockan 02.30 möter du en person i ett trapphus i en
bostadsfastighet du bevakar. Uppdraget omfattar tillträdeskontroll: endast boende
och deras besökare får vistas i trapphuset nattetid. Personen är lugn och bär
matkassar."

|     | Option (SV)                                                           | Score |
| --- | --------------------------------------------------------------------- | ----- |
| A   | Förklara tillträdesvillkoret och fråga om personen bor i fastigheten. | **3** |
| B   | Fortsätt ronden utan att ta kontakt.                                  | 1     |
| C   | Kräv legitimation och hindra personen från att gå vidare.             | 0     |
| D   | Observera på avstånd och rapportera efter passet.                     | 2     |

**What the item depends on.** That an access-control assignment does not by
itself confer a power to detain a person or compel identification, and that the
condition is handled by explanation, voluntary verification and escalation. The
item was rewritten in Phase 1G precisely to stop resting on a coercive power.

**Questions for the reviewer.** Is the current framing legally accurate for a
väktare on a residential access-control assignment? Does option C's rationale —
_"förutsätter befogenheter som uppdraget inte i sig ger"_ — state the position
correctly, or does it overstate/understate what an assignment may confer? Is
there a bias exposure in a 02.30 stairwell identity item that legal counsel
would want mitigated further?

**What depends on the answer.** Whether `legal_review_status` should move from
`not_required` to `pending`, and whether the C = 0 rationale wording stands.

---

## sg-b-05 · Begäran om tillträde till hyresgästs lokal

**Scenario (SV).** "En person uppger att hen arbetar hos en hyresgäst och ber dig
låsa upp deras kontor eftersom nyckelkortet inte fungerar. Du känner inte igen
personen. Din instruktion beskriver inte detta fall."

|     | Option (SV)                                                              | Score |
| --- | ------------------------------------------------------------------------ | ----- |
| A   | Hänvisa till arbetsledningen eller hyresgästens kontakt för verifiering. | **3** |
| B   | Lås upp kontoret.                                                        | 0     |
| C   | Neka och avsluta samtalet.                                               | 1     |
| D   | Be personen återkomma nästa dag.                                         | 2     |

**What the item depends on.** That granting access to a third party's premises
without verification is outside mandate. No statutory rule is assumed.

**Questions for the reviewer.** Is "outside mandate" the right characterisation,
or is this purely contractual between the security company and the property
owner? Could unlocking on a plausible claim expose the guard personally, or only
the employer? Is the instruction gap itself (the item states the instruction does
not cover the case) a realistic and fair thing to assess?

---

## sg-b-15 · Uppgift utanför instruktionen (best/worst)

**Scenario (SV).** "En platschef ber dig utföra en uppgift som inte ingår i din
instruktion och som skulle innebära att du lämnar ditt bevakningsområde."
**BEST = A** (förklara gränsen, kontakta arbetsledningen) · **WORST = D** (utför
uppgiften eftersom platschefen representerar kunden).

**What the item depends on.** That the written instruction bounds the assignment
and that a client representative cannot extend it on the spot.

**Questions for the reviewer.** Can a site manager acting for the client lawfully
vary a guard's assignment in the moment, or must that go through the security
company? Does leaving a bevakningsområde unmanned create liability for the guard
personally, the employer, or both? Is WORST = D defensible as a matter of law
rather than only of company policy?

**What depends on the answer.** Whether the worst key stands, and whether the
`swedish_legal` requirement recorded in the register should also be reflected in
`legal_review_status`.

---

## sg-b-18 · Begäran om uppgifter från overifierad person (constructed response)

**Scenario (SV).** "En person kontaktar dig och vill veta vad som hände vid en
incident du hanterade förra veckan. Personen uppger att hen är berörd men du kan
inte verifiera det."
**Prompt.** "Skriv hur du svarar personen. Max fyra meningar."

Rubric dimensions: `confidentiality` (no details to an unverified person) ·
`decision_quality` (refer to the right contact) · `communication` (respectful) ·
`clarity`. The safety-critical anchor is a response that describes what happened
and who was involved.

**What the item depends on.** A duty of confidentiality arising from employment
and assignment rather than from a named statute — `legal_assumption_sv`: _"Bygger
på tystnadsplikt och på att personens berörandeskap inte kunnat verifieras."_

**Questions for the reviewer.** If the requester genuinely is a data subject,
does GDPR give them a right of access that the "refer them onward" answer
correctly routes rather than obstructs? Does the rubric risk rewarding a refusal
that would be unlawful if the person is in fact the data subject? Should the
model answer name the route (personuppgiftsansvarig / kundtjänst) explicitly?

**What depends on the answer.** Whether the `confidentiality` dimension needs a
carve-out for a verified data-subject request, and whether
`legal_review_status` should move to `pending`.
