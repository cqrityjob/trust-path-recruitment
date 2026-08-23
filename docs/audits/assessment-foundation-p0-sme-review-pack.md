# Väktare — Recruitment Assessment: SME review pack

**Status: awaiting review. Nothing in this pack has been reviewed by a human.**

Every item below was written by an AI assistant against the product's own construct rules. `sme_reviewer_count` is 0 on all 56 items, all five review requirements are outstanding on every one of them, and the assessment is `content_status = draft`, `validation_status = design`. It cannot be used for a real recruitment decision and makes no psychometric claim of any kind: no reliability coefficient, no norm group, no percentile, no predictive validity, because no validation work has been done.

## What the assessment may and may not say

It produces **structured decision support** — evidence and interview preparation. It produces no pass, no fail, no hire recommendation, no ranking, no suitability score and no readiness score, and it must not be described as producing any of those.

## How to review

For each item, answer the six questions in its table. A **NO** on "correct strongest response" or a **YES** on "unfair assumption" or "legal concern" blocks the item — please write what you would change.

| Reviewer | | Date | |
|---|---|---|---|
| Name | ____________________ | Reviewed on | ____________ |
| Role / years in security | ____________________ | Employer | ____________ |

---

## Observed items (32)

Self-reported items (block C, 24 of them) are deliberately excluded: they have no correct answer to review. They are listed at the end for completeness.

### `so-rj-a01`  ·  SCC-11 / proportionalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Väljer den minst ingripande åtgärd som löser ett behörighetsproblem. |
| **Must NOT be used to infer** | legal knowledge, formal authorisation, or fitness to hold a licence |
| **Work context** | Reception i kontorshus med passerkontroll, morgonrusning. |
| **Over-generalisation guard** | Ett svar i ett scenario säger något om resonemanget här, inte om personens allmänna regelefterlevnad. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Det är morgon och kö vid spärrarna. En person utan passerkort säger att hen ska till ett möte på plan 6, är sen, och visar ett mejl med möteskallelsen på telefonen. Enligt instruktionen ska besökare anmälas i receptionen och hämtas av den de ska träffa.

**Prompt (sv):** Vad gör du?

**Scenario (en):** It is morning and there is a queue at the barriers. A person with no access card says they are going to a meeting on floor 6, that they are late, and shows a meeting invitation on their phone. The site instruction says visitors are registered at reception and collected by the person they are meeting.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Registrera besöket, ring mötesvärden direkt och säg till personen att det tar ett par minuter. | — (preferred) | Följer instruktionen men löser personens problem parallellt. Minst ingripande åtgärd som ändå håller kontrollen. |
| b | 2 | Hänvisa personen till receptionsdisken för anmälan och fortsätt bemanna spärren under rusningen. | `weak_communication` | Rätt väg genom instruktionen, men personen lämnas ensam med en tidsbrist som kontrollen själv skapade. |
| c | 1 | Släpp in personen eftersom möteskallelsen styrker ärendet, och notera tid och namn i besöksloggen. | `excessive_informal_trust` | Mejlet visar en kallelse, inte att personen är den som kallats. Behörigheten är fortfarande okontrollerad. |
| d | 0 | Be personen lämna entrén och boka om mötet en annan dag, eftersom hen inte är anmäld i förväg. | `poor_proportionality` | Att avvisa någon med ett legitimt ärende utan att pröva den enkla vägen är oproportionerligt och skadar uppdragsgivaren. |

<details><summary>English option texts</summary>

- **a (3):** Register the visit, call the host straight away, and tell the person it will take a couple of minutes.
- **b (2):** Direct the person to the reception desk to register, and stay on the barrier through the rush.
- **c (1):** Let the person through since the invitation supports their errand, and note the time and name in the visitor log.
- **d (0):** Ask the person to leave the entrance and rebook the meeting another day, since they were not registered in advance.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a02`  ·  SCC-07 / respektfullt-bemotande  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Sänker spänningsnivån verbalt utan att ge upp gränsen. |
| **Must NOT be used to infer** | patience as a trait, warmth, temperament, or cultural fit |
| **Work context** | Köpcentrum, kundtjänstdisk, sen eftermiddag. |
| **Over-generalisation guard** | Ett scenario om bemötande säger inget om personens tålamod i allmänhet. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** En kund höjer rösten mot dig i entrén till ett köpcentrum. Hen är arg över att en butik nekat en retur och menar att du som väktare ska "göra något åt det". Ett par personer har stannat och tittar.

**Prompt (sv):** Vad gör du först?

**Scenario (en):** A customer raises their voice at you in the entrance to a shopping centre. They are angry that a shop refused a return and say that you as a security officer should "do something about it". A couple of people have stopped to watch.

**Prompt (en):** What do you do first?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Lyssna färdigt, gå några steg åt sidan från kön och säg vad du kan göra och vad som är butikens beslut. | — (preferred) | Lyssnar färdigt, flyttar samtalet från publiken, och är tydlig med gränsen utan att avfärda personen. |
| a | 2 | Följ med personen till centrumledningens kontor och lämna över ärendet till den som kan besluta. | `weak_communication` | Rätt adress, och personen lämnas inte ensam — men ärendet lämnas över innan någon har lyssnat färdigt. |
| c | 1 | Gå in i butiken och be personalen göra ett undantag den här gången så att det löser sig. | `outside_mandate` | Löser stunden men tar över butikens beslut, vilket varken uppdraget eller butiken har bett om. |
| d | 0 | Säg till personen att sänka rösten omedelbart, annars får hen lämna köpcentrumet på en gång. | `premature_escalation` | Avvisning som första åtgärd mot en arg men laglydig kund är oproportionerligt och gör konflikten större. |

<details><summary>English option texts</summary>

- **b (3):** Hear them out, step aside from the queue, and say what you can do and what is the shop’s decision.
- **a (2):** Walk the person to the centre management office and hand the matter to somebody who can decide.
- **c (1):** Go into the shop and ask the staff to make an exception this once so the matter is settled.
- **d (0):** Tell the person to lower their voice immediately, or they will have to leave the centre right away.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a03`  ·  SCC-04 / prioritering  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Prioriterar mellan samtidiga händelser utifrån tidskritisk risk. |
| **Must NOT be used to infer** | stress tolerance, general decisiveness, or capacity to work alone |
| **Work context** | Industriområde, ensampass, kväll. |
| **Over-generalisation guard** | Prioritering i ett scenario säger inget om personens förmåga att prioritera generellt. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Du är ensam väktare på ett industriområde. Samtidigt får du två saker: ett dörrlarm på ett kallförråd i utkanten, och ett samtal från en anställd som säger att en person hen inte känner igen står inne i personalutrymmet vid omklädningsrummen.

**Prompt (sv):** Vad gör du?

**Scenario (en):** You are the only officer on an industrial site. Two things arrive at once: a door alarm on a cold store at the edge of the site, and a call from an employee saying an unfamiliar person is standing inside the staff area by the changing rooms.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Åk till personalutrymmet först, be den anställde stanna på telefon och meddela larmcentralen om larmet. | — (preferred) | Går till människorna först, håller kvar den andra händelsen genom observation, och lämnar inget obevakat i tysthet. |
| a | 2 | Ring larmcentralen och be om en andra enhet till dörrlarmet medan du själv åker till personalutrymmet. | `insufficient_information` | Rätt prioritering och rätt begäran, men bygger på att en andra enhet finns — vilket ingen har sagt att den gör. |
| b | 1 | Åk till dörrlarmet först eftersom det är ett bekräftat larm, och ta personalutrymmet direkt efteråt när du är klar där. | `tunnel_vision` | Larmet är det tydligaste men inte det mest tidskritiska. En okänd person bland anställda hinner försvinna. |
| d | 0 | Be den anställde fråga personen vad hen gör där, medan du själv åker vidare till dörrlarmet. | `delayed_escalation` | Lägger uppgiften på fel person och lämnar båda händelserna utan väktare på plats. |

<details><summary>English option texts</summary>

- **c (3):** Go to the staff area first, keep the employee on the phone, and tell the alarm centre about the alarm.
- **a (2):** Call the alarm centre and ask for a second unit for the door alarm while you go to the staff area yourself.
- **b (1):** Go to the door alarm first since it is a confirmed alarm, and take the staff area straight afterwards when you are done there.
- **d (0):** Ask the employee to question the person themselves, while you go on to the door alarm.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a04`  ·  SCC-03 / avvikelseigenkanning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Skiljer det som faktiskt observerats från det som antas om ett avvikande beteende. |
| **Must NOT be used to infer** | general attentiveness, intelligence, or a diagnosis of any kind |
| **Work context** | Logistikterminal, lastkaj, dagtid. |
| **Over-generalisation guard** | Ett scenario om iakttagelse säger inget om personens allmänna uppmärksamhet. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** På en logistikterminal ser du en person i arbetskläder utan synlig ID-bricka gå längs lastkajen och fotografera portnummer och lastluckor med sin telefon. Terminalen har entreprenörer på plats den här veckan.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At a logistics terminal you see a person in work clothes with no visible ID badge walking along the loading bay photographing gate numbers and loading doors with their phone. The terminal has contractors on site this week.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Presentera dig och fråga vad fotograferingen gäller och vem hen arbetar för — och stäm av med terminalansvarig. | — (preferred) | Frågar om det som faktiskt avviker, utan att förutsätta ett motiv, och kontrollerar mot den som vet. |
| a | 2 | Ring terminalansvarig och fråga om entreprenörslistan för veckan innan du går fram och talar med personen på kajen. | `delayed_escalation` | Kontrollerar mot rätt källa, men personen hinner avsluta och gå medan kontrollen görs på avstånd. |
| b | 1 | Notera tid, signalement och vad personen gör i loggen, och fortsätt ronden som planerat. | `insufficient_information` | Att bara notera lämnar frågan obesvarad medan personen fortsätter, och en notering utan kontroll hjälper ingen. |
| c | 0 | Larma polis om misstänkt rekognosering inför ett inbrott, och håll personen under uppsikt tills de kommer. | `unsupported_assumption` | Att behandla fotograferingen som rekognosering är en slutsats som inte går att dra av det som syns. |

<details><summary>English option texts</summary>

- **d (3):** Introduce yourself and ask what the photography is for and who they work for — then check with the terminal supervisor.
- **a (2):** Call the terminal supervisor about this week’s contractor list before you approach and speak to the person on the bay.
- **b (1):** Note the time, a description and what the person is doing in the log, and continue the round as planned.
- **c (0):** Call the police about suspected reconnaissance ahead of a burglary, and keep the person in sight until they arrive.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a05`  ·  SCC-09 / agarskap  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Agerar på en kollegas avsteg från rutin utan att göra det till en personfråga. |
| **Must NOT be used to infer** | conscientiousness as a trait, or reliability outside this kind of task |
| **Work context** | Bevakat område, nattpass, två väktare. |
| **Over-generalisation guard** | Ett scenario om en kollega säger inget om personens lojalitet mot kollegor i stort. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Du går nattpass med en mer erfaren kollega. På tredje ronden märker du att hen kvitterar kontrollpunkter i systemet utan att gå till två av dem. Kollegan säger att "de punkterna är alltid låsta, det är slöseri med tid".

**Prompt (sv):** Vad gör du?

**Scenario (en):** You are working a night shift with a more experienced colleague. On the third round you notice they are signing off checkpoints in the system without visiting two of them. Your colleague says "those points are always locked, it is a waste of time".

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Säg till kollegan att du går punkterna, gör det, och ta upp med arbetsledaren att loggen inte stämmer. | — (preferred) | Tar upp det med den det gäller, går själv punkterna, och för vidare avsteget som ett rutinfel — inte som en anmälan. |
| b | 2 | Gå punkterna själv och be kollegan sluta kvittera det ni inte gjort, utan att ta det vidare den här gången. | `delayed_escalation` | Rätt samtal med rätt person, men ett systematiskt avsteg som stannar mellan två väktare rättas sällan. |
| c | 1 | Gå punkterna själv och låt saken bero den här natten, eftersom du inte är kollegans arbetsledare. | `failure_to_document` | Att bara göra rätt själv låter en felaktig kvittering ligga kvar i systemet, vilket är den egentliga risken. |
| d | 0 | Kvittera de två punkterna i eget namn så att loggen i alla fall stämmer med verkligheten. | `outside_mandate` | Att kvittera i kollegans ställe gör dig till en del av avsteget och gör spåret sämre, inte bättre. |

<details><summary>English option texts</summary>

- **a (3):** Tell your colleague you will visit those points, do it, and tell the supervisor the log does not match.
- **b (2):** Visit the points yourself and ask your colleague to stop signing off what you have not done, without taking it further this time.
- **c (1):** Visit the points yourself and let it rest for tonight, since you are not your colleague’s supervisor.
- **d (0):** Sign the two points off in your own name so the log at least matches reality.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a06`  ·  SCC-01 / regel-och-syfteslojalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Skiljer en legitim instruktion från en otillbörlig begäran från någon i överordnad ställning. |
| **Must NOT be used to infer** | honesty as a personality trait, general trustworthiness, or how the person would behave under pressure not shown here |
| **Work context** | Kontorsfastighet, uppdragsgivarens platschef, fredag eftermiddag. |
| **Over-generalisation guard** | Ett scenario om press uppifrån säger inget om personens allmänna ryggrad. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | yes |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Uppdragsgivarens platschef ber dig ta bort en notering ur incidentloggen. Noteringen gäller att en dörr till serverrummet stått uppställd i två timmar. Platschefen säger att det redan är åtgärdat, att noteringen "bara skapar problem i revisionen" och att hen tar ansvar för beslutet.

**Prompt (sv):** Vad gör du?

**Scenario (en):** The client's site manager asks you to remove an entry from the incident log. The entry records that a door to the server room stood propped open for two hours. The site manager says it has already been dealt with, that the entry "just creates problems in the audit", and that they take responsibility for the decision.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Säg att loggen inte kan ändras i efterhand, erbjud platschefen att lägga till en egen kommentar, och rapportera begäran. | — (preferred) | Vägrar sakligt, förklarar varför, och tar begäran vidare till den som är ens uppdragsgivare i bevakningsledet. |
| a | 2 | Säg nej och föreslå att platschefen själv tar upp noteringen med din arbetsledare om den skapar problem. | `delayed_escalation` | Rätt svar och rätt väg utpekad, men den som fick begäran är den som behöver rapportera att den gjordes. |
| c | 1 | Säg nej till platschefen och lämna det därhän, eftersom du ändå inte tänker göra det hen ber om. | `failure_to_document` | Rätt svar till platschefen, men en begäran om att ändra en logg är i sig något arbetsledningen behöver veta. |
| d | 0 | Ta bort noteringen eftersom platschefen är ansvarig på plats, säger att felet redan är åtgärdat och tar ansvaret. | `excessive_informal_trust` | Att ta bort noteringen på muntligt ansvarsövertagande gör spåret oanvändbart och flyttar ansvaret till fel person. |

<details><summary>English option texts</summary>

- **b (3):** Say the log cannot be changed after the fact, offer the site manager their own comment, and report the request onward.
- **a (2):** Say no and suggest the site manager raise the entry with your supervisor themselves if it causes problems.
- **c (1):** Say no to the site manager and leave it there, since you are not going to do what they ask anyway.
- **d (0):** Remove the entry, since the site manager is responsible on site, says the fault is already dealt with, and takes responsibility.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a07`  ·  SCC-03 / aktiv-scanning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Skaffar tillräcklig egen lägesbild innan hen binder upp sig vid en tolkning. |
| **Must NOT be used to infer** | general attentiveness, intelligence, or a diagnosis of any kind |
| **Work context** | Utryckning till larm i en fastighet med flera hyresgäster. |
| **Over-generalisation guard** | Ett scenario om ett larm säger inget om personens allmänna beslutsförmåga. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Du åker på ett inbrottslarm i en fastighet med flera hyresgäster. Larmcentralen kan bara säga att en sektion har löst ut, inte vilken. När du kommer fram står ytterdörren olåst men stängd, och belysningen i trapphuset är släckt trots att den ska vara på nattetid.

**Prompt (sv):** Vad gör du först?

**Scenario (en):** You respond to an intruder alarm in a building with several tenants. The alarm centre can only say that one section has triggered, not which. On arrival the main door is unlocked but closed, and the stairwell lighting is off although it should be on at night.

**Prompt (en):** What do you do first?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Gå ett varv runt fastigheten, meddela larmcentralen vad du ser och begär vilken sektion det gäller innan du går in. | — (preferred) | Bygger en egen bild utifrån, delar den, och går inte in i en okänd situation utan att någon vet var man är. |
| a | 2 | Begär sektionsuppgift av larmcentralen och vänta vid ytterdörren tills du har fått den innan du går in. | `insufficient_information` | Rätt att inte gå in oinformerad, men att stå still vid dörren ger ingen bild av baksidan under tiden. |
| b | 1 | Gå in genom ytterdörren och kontrollera trapphuset våning för våning med ficklampa tills du hittar sektionen. | `tunnel_vision` | Inte orimligt, men utan sektion, utan ljus och utan att någon vet var du är ger du bort dina egna marginaler. |
| d | 0 | Utgå från att det är ett tekniskt fel eftersom dörren är stängd och inget syns, och avsluta ärendet med en notering i loggen. | `unsupported_assumption` | Släckt belysning och olåst dörr är två avvikelser samtidigt, vilket är precis det som inte ska avfärdas. |

<details><summary>English option texts</summary>

- **c (3):** Walk the perimeter, tell the alarm centre what you can see, and ask which section triggered before going in.
- **a (2):** Ask the alarm centre for the section and wait at the main door until you have it before going in.
- **b (1):** Go in through the main door and check the stairwell floor by floor with a torch until you find the section.
- **d (0):** Assume it is a technical fault since the door is closed and nothing is visible, and close the job off with a note in the log.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a08`  ·  SCC-04 / prioritering  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Handlar först mot personskada och håller ordning på vad som ska föras vidare. |
| **Must NOT be used to infer** | stress tolerance, general decisiveness, or capacity to work alone |
| **Work context** | Lagerbyggnad, dagtid, personal på plats. |
| **Over-generalisation guard** | Ett scenario om en olycka säger inget om personens fysiska förmåga eller sjukvårdskunskap. |
| **Difficulty hypothesis** | foundational (judgement) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | yes |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Under en rond i en lagerbyggnad hör du ett brak och hittar en person som ligger på golvet vid en pallställning. Personen är vaken, svarar på tilltal men säger att hen inte kan stödja på ena benet. En pall ligger tippad intill.

**Prompt (sv):** Vad gör du?

**Scenario (en):** During a round in a warehouse you hear a crash and find a person on the floor by a pallet rack. They are conscious, responsive, but say they cannot put weight on one leg. A tipped pallet is lying next to them.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Stanna hos personen, larma ambulans, håll andra borta från området och lämna pallen där den ligger. | — (preferred) | Person först, plats säkrad, hjälp larmad, och underlaget för utredningen bevarat — i den ordningen. |
| a | 2 | Stanna hos personen och larma ambulans, och flytta undan pallen så att bårvägen in blir fri. | `failure_to_document` | Rätt i det tidskritiska, men pallen flyttas innan någon dokumenterat hur den låg, och det går inte att återskapa. |
| b | 1 | Hjälp personen upp och in till ett kontor där hen kan sitta ner medan du ringer efter hjälp. | `poor_proportionality` | Att flytta någon som inte kan stödja på benet kan förvärra en skada, och gör platsen svårare att utreda. |
| c | 0 | Leta upp närmaste arbetsledare så att företaget själv får avgöra om ambulans behöver larmas. | `delayed_escalation` | Att söka efter en chef innan hjälp larmas fördröjer det enda som faktiskt är tidskritiskt. |

<details><summary>English option texts</summary>

- **d (3):** Stay with the person, call an ambulance, keep others out of the area, and leave the pallet where it is.
- **a (2):** Stay with the person and call an ambulance, and move the pallet aside so the stretcher route is clear.
- **b (1):** Help the person up and into an office where they can sit down while you call for help.
- **c (0):** Find the nearest supervisor so the company can decide for itself whether an ambulance is needed.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a09`  ·  SCC-06 / dokumentation  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Rapporterar det som observerats skilt från egen tolkning, inklusive det obekväma. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Efter en händelse i en butiksentré, rapportskrivning. |
| **Over-generalisation guard** | Ett scenario om rapportskrivning säger inget om personens allmänna skriftliga förmåga. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | factual_reporting / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Du har avvisat en person från en butiksentré efter att butikspersonal påkallat din hjälp. Personen gick frivilligt men var upprörd och sa att hen skulle anmäla dig. Du ska nu skriva händelserapporten.

**Prompt (sv):** Vilket är viktigast att få med?

**Scenario (en):** You have removed a person from a shop entrance after staff called for your help. They left voluntarily but were upset and said they would report you. You are now writing the incident report.

**Prompt (en):** What matters most to include?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Tid, vad personalen sa, vad du sa och gjorde i ordning, vilka som var där, och personens invändning. | — (preferred) | Tid, förlopp, närvarande och personens egen invändning — det sista utelämnas oftast och betyder mest efteråt. |
| b | 2 | Tidpunkt och plats, vad butikspersonalen begärde, och vad du gjorde i tur och ordning fram till att personen lämnade entrén. | `insufficient_information` | Ett användbart förlopp, men utan personens egen invändning saknas det som en granskning kommer att fråga om. |
| c | 1 | Att en person avvisats från entrén på begäran av butikspersonalen, med tidpunkt och plats angivna. | `failure_to_document` | En korrekt men tunn rapport. Utan förloppet går det inte att bedöma om åtgärden var proportionerlig. |
| d | 0 | Att personen uppträdde hotfullt och sannolikt var påverkad, och att avvisningen därför var befogad. | `unsupported_assumption` | En bedömning av personens sinnestillstånd är en slutsats, inte en iakttagelse, och håller inte om den prövas. |

<details><summary>English option texts</summary>

- **a (3):** The time, what staff said, what you said and did in order, who was present, and the person’s objection.
- **b (2):** The time and place, what the shop staff asked for, and what you did in sequence up to the point the person left the entrance.
- **c (1):** That a person was removed from the entrance at the request of shop staff, with the time and place given.
- **d (0):** That the person behaved threateningly and was probably under the influence, so the removal was justified.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a10`  ·  SCC-08 / informationsdelning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Överlämnar det som nästa pass behöver för att kunna agera. |
| **Must NOT be used to infer** | general co-operativeness or how the person is to work with |
| **Work context** | Skiftbyte på ett bevakat objekt. |
| **Over-generalisation guard** | Ett scenario om överlämning säger inget om personens samarbetsförmåga i stort. |
| **Difficulty hypothesis** | foundational (judgement) |
| **Construct / tests what** | operational_communication / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Ditt pass går mot slut. Under natten har du: hittat en olåst grind mot lastgården som du låst, noterat att en rörelsedetektor i garaget löst ut tre gånger utan att du sett något, och tagit emot ett meddelande om att en entreprenör kommer klockan sju för att arbeta på taket.

**Prompt (sv):** Vad tar du upp vid överlämningen?

**Scenario (en):** Your shift is ending. During the night you have: found an unlocked gate to the loading yard and locked it, noted that a motion detector in the garage triggered three times with nothing visible, and received a message that a contractor is arriving at seven to work on the roof.

**Prompt (en):** What do you raise at the handover?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Alla tre, särskilt att detektorn behöver uppsikt och att entreprenören ska tas emot sju. | — (preferred) | Allt tre, med det som pågår markerat. Nästa pass behöver kunna agera, inte bara veta. |
| a | 2 | Grinden och entreprenören, eftersom det är de två sakerna som faktiskt kräver något av nästa pass rent praktiskt. | `insufficient_information` | Två av tre, men detektorn som löst ut utan orsak är just det som behöver ögon under nästa pass. |
| c | 1 | Grinden, eftersom det var den enda konkreta avvikelsen — de andra två är noterade i systemet. | `tunnel_vision` | Det åtgärdade är det minst brådskande. Det som fortfarande pågår är det nästa pass faktiskt behöver. |
| d | 0 | Inget särskilt — allt finns i loggen och nästa pass läser den när de börjar sitt eget pass. | `failure_to_document` | Att lita på att systemet talar för sig innebär att nästa pass upptäcker sakerna först när de blivit problem. |

<details><summary>English option texts</summary>

- **b (3):** All three, especially that the detector needs watching and the contractor is received at seven.
- **a (2):** The gate and the contractor, since those are the two that actually require something practical of the next shift.
- **c (1):** The gate, since it was the only concrete deviation — the other two are recorded in the system.
- **d (0):** Nothing in particular — it is all in the log and the next shift reads it when they start.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a11`  ·  SCC-07 / losningsorientering  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Håller kvar en gräns samtidigt som det verkliga behovet bakom en upprörd begäran tas på allvar. |
| **Must NOT be used to infer** | patience as a trait, warmth, temperament, or cultural fit |
| **Work context** | Reception i kontorshus, tidig kväll, ensam i receptionen. |
| **Over-generalisation guard** | Ett scenario om en upprörd besökare säger inget om personens allmänna tålamod eller empati. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** En person kommer in i receptionen och är tydligt upprörd. Hen säger att hen måste få tag på en anhörig som arbetar i huset, att det gäller något hemma, och att det är bråttom. Personen har ingen legitimation med sig och vill inte säga mer om vad som hänt.

**Prompt (sv):** Vad gör du?

**Scenario (en):** A person comes into reception clearly distressed. They say they have to reach a family member who works in the building, that it concerns something at home, and that it is urgent. They have no identification with them and will not say more about what has happened.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Be om namnet på den anhöriga, ring upp hen internt och låt de två tala med varandra i receptionen. | — (preferred) | Löser det verkliga behovet — kontakt — utan att släppa in någon okänd. Gränsen hålls utan att avvisa personen. |
| a | 2 | Be personen vänta i receptionen medan du kontaktar den anhöriga och ser om hen vill komma ner. | `weak_communication` | Rätt åtgärd och rätt gräns, men personen lämnas att vänta utan att få veta vad som händer eller hur länge. |
| b | 1 | Förklara att du inte får lämna ut uppgifter om anställda, och be personen ringa den anhöriga själv. | `insufficient_information` | Korrekt om utlämnande, men personen har redan sagt att hen inte når fram, och behovet lämnas olöst i entrén. |
| d | 0 | Släpp in personen och visa vägen till avdelningen, eftersom det uppenbarligen är en nödsituation. | `excessive_informal_trust` | Brådskan är personens egen uppgift och ingen har kontrollerat den. Ett obekräftat skäl är inte en behörighet. |

<details><summary>English option texts</summary>

- **c (3):** Ask for the family member’s name, call them internally, and let the two speak in reception.
- **a (2):** Ask the person to wait in reception while you contact the family member and see whether they will come down.
- **b (1):** Explain that you may not give out information about employees, and ask the person to call the family member themselves.
- **d (0):** Let the person in and show them to the department, since this is evidently an emergency.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a12`  ·  SCC-07 / granshallning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Står kvar vid ett behörighetsbeslut när det ifrågasätts, utan att göra det till en maktfråga. |
| **Must NOT be used to infer** | patience as a trait, warmth, temperament, or cultural fit |
| **Work context** | Industrikontor, morgon, anställd vid en spärr med begränsad behörighet. |
| **Over-generalisation guard** | Ett scenario om ett ifrågasättande säger inget om personens allmänna auktoritet eller självförtroende. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** En anställd blir stoppad vid en inre spärr eftersom kortet inte öppnar. Hen säger att hen har gått genom den dörren i tre år, att det måste vara ett systemfel, och frågar irriterat om du tänker hindra hen från att göra sitt jobb.

**Prompt (sv):** Vad gör du?

**Scenario (en):** An employee is stopped at an inner barrier because their card will not open it. They say they have gone through that door for three years, that it must be a system fault, and ask irritably whether you intend to stop them doing their job.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Säg att kortet inte öppnar just nu, att du inte kan gå förbi det, och ring den som kan reda ut behörigheten. | — (preferred) | Håller beslutet, gör det till en fråga om systemet snarare än om personen, och startar det som faktiskt kan lösa saken. |
| a | 2 | Säg att kortet inte öppnar och be den anställde själv kontakta sin chef för att få behörigheten kontrollerad. | `delayed_escalation` | Gränsen hålls och vägen vidare pekas ut, men ansvaret för att lösa en spärr på plats läggs på den som stoppades. |
| b | 1 | Förklara att du bara följer instruktionen och att du inte kan göra något åt saken just nu. | `weak_communication` | Beslutet står, men "bara följer instruktionen" lämnar personen utan väg vidare och trappar oftast upp irritationen. |
| c | 0 | Öppna dörren manuellt den här gången och be den anställde höra av sig till supporten om kortet under dagen. | `excessive_informal_trust` | Att öppna manuellt när kortet nekar upphäver hela kontrollen och gör att felet aldrig blir upptäckt. |

<details><summary>English option texts</summary>

- **d (3):** Say the card does not open it right now, that you cannot bypass that, and call whoever can sort the authorisation out.
- **a (2):** Say the card does not open it and ask the employee to contact their own manager to get the authorisation checked.
- **b (1):** Explain that you are only following the instruction and that there is nothing you can do about it right now.
- **c (0):** Open the door manually this once and ask the employee to contact support about the card during the day.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a13`  ·  SCC-07 / likvardighet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Upprätthåller en insläppsregel likvärdigt när det finns en kö och en publik som följer beslutet. |
| **Must NOT be used to infer** | patience as a trait, warmth, temperament, or cultural fit |
| **Work context** | Entré till ett publikt evenemang, kö utanför, två insläppsvärdar. |
| **Over-generalisation guard** | Ett scenario om ett insläpp säger inget om personens allmänna rättvisekänsla. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Vid ett evenemang gäller att väskor större än A4 ska lämnas i garderoben. En besökare i kön har en större väska och säger att hen släpptes in med samma väska förra veckan. Kön bakom har hört samtalet och några börjar kommentera.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At an event the rule is that bags larger than A4 must be left in the cloakroom. A visitor in the queue has a larger bag and says they were let in with the same bag last week. The queue behind has heard the exchange and some are starting to comment.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Säg att regeln gäller alla i kväll, visa var garderoben är, och håll samma besked mot alla i kön efter. | — (preferred) | Likvärdigt besked, en väg som löser besökarens problem, och samma regel för dem som just hörde samtalet. |
| b | 2 | Säg att regeln gäller i kväll och hänvisa till garderoben, utan att gå in på vad som gällde förra veckan. | `weak_communication` | Rätt beslut och rätt hänvisning, men invändningen lämnas obesvarad inför en kö som redan har hört den. |
| c | 1 | Be besökaren stiga åt sidan och vänta medan du kontrollerar med arrangören vad som gäller i kväll. | `delayed_escalation` | Kontroll är rimlig när något är oklart, men här är regeln känd, och kontrollen läser som ett undantag under prövning. |
| d | 0 | Släpp in besökaren med väskan för att lösa situationen, och tillämpa regeln fullt ut på resten av kön. | `poor_proportionality` | Att ge efter för den som protesterar högst gör regeln till en förhandling och drabbar alla som följde den. |

<details><summary>English option texts</summary>

- **a (3):** Say the rule applies to everyone tonight, show where the cloakroom is, and give the same answer to everybody behind.
- **b (2):** Say the rule applies tonight and point to the cloakroom, without going into what applied last week.
- **c (1):** Ask the visitor to step aside and wait while you check with the organiser what applies tonight.
- **d (0):** Let the visitor in with the bag to resolve the situation, and apply the rule in full to the rest of the queue.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a14`  ·  SCC-04 / prioritering  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Väljer ordning mellan två samtidiga uppgifter utifrån vad som inte går att ta igen senare. |
| **Must NOT be used to infer** | stress tolerance, general decisiveness, or capacity to work alone |
| **Work context** | Köpcentrum, ensam väktare på plats, kvart före stängning. |
| **Over-generalisation guard** | Prioritering i ett scenario säger inget om personens förmåga att prioritera generellt. |
| **Difficulty hypothesis** | intermediate (prioritisation) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Kvart före stängning får du två saker samtidigt: butikspersonal i ett kassaområde ber om hjälp med en kund som vägrar lämna butiken, och en larmknapp i lastintaget på baksidan har utlöst utan att någon svarar på radio.

**Prompt (sv):** Vad gör du?

**Scenario (en):** Fifteen minutes before closing two things arrive at once: staff in a till area ask for help with a customer refusing to leave the shop, and a panic button in the goods intake at the rear has been triggered with nobody answering on the radio.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Åk till lastintaget först, be butiken hålla avstånd och återkomma, och meddela larmcentralen båda. | — (preferred) | En larmknapp utan svar kan betyda att någon inte kan svara. Den obesvarade frågan går före den som redan är under uppsikt. |
| a | 2 | Åk till lastintaget först och be butikspersonalen ringa dig igen om kunden fortfarande är kvar. | `insufficient_information` | Rätt ordning, men larmcentralen får inte veta att två saker pågår, vilket är det som kan ge dig hjälp. |
| c | 1 | Gå till butiken först eftersom där finns människor som väntar, och ta lastintaget så snart det är löst. | `tunnel_vision` | Butiken har personal på plats och överblick. Lastintaget har varken svar eller ögon, vilket gör det mer osäkert. |
| d | 0 | Be butikspersonalen ringa polis om kunden själva, och kontrollera lastintaget när butikerna har stängt för dagen. | `delayed_escalation` | Skjuter upp den händelse ingen har kontroll över, och lämnar över en butiksfråga innan den ens är bedömd. |

<details><summary>English option texts</summary>

- **b (3):** Go to the goods intake first, ask the shop to keep back and call again, and report both to the alarm centre.
- **a (2):** Go to the goods intake first and ask the shop staff to call you again if the customer is still there.
- **c (1):** Go to the shop first since there are people waiting there, and take the goods intake as soon as that is resolved.
- **d (0):** Ask the shop staff to call the police about the customer themselves, and check the goods intake once the shops have closed.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a15`  ·  SCC-04 / beslutsbalans  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Fattar ett tillräckligt beslut på ofullständig information i stället för att vänta på fullständig. |
| **Must NOT be used to infer** | stress tolerance, general decisiveness, or capacity to work alone |
| **Work context** | Kontorsfastighet med flera hyresgäster, nattpass, ensam. |
| **Over-generalisation guard** | Ett scenario om osäkerhet säger inget om personens allmänna beslutsförmåga eller stresstålighet. |
| **Difficulty hypothesis** | advanced (prioritisation) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Klockan 02 känner du svag brandlukt i ett trapphus, men brandlarmet har inte löst ut och du hittar ingen källa. Lukten finns i två plan men inte i de andra. Fastighetsjouren svarar inte. Om du larmar räddningstjänsten kan det bli ett kostsamt onödigt utryck.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At 02:00 you notice a faint smell of burning in a stairwell, but the fire alarm has not triggered and you cannot find a source. The smell is on two floors but not the others. The property on-call is not answering. Calling the fire service may mean a costly needless turnout.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Larma räddningstjänsten, beskriv exakt vad du känner och var, och fortsätt söka källan medan du väntar. | — (preferred) | Brandlukt utan källa är precis den osäkerhet som ska lämnas till den som kan bedöma den. Kostnaden vägs inte mot brand. |
| a | 2 | Sök av de två planen systematiskt i tio minuter till, och larma räddningstjänsten om du inte hittar källan. | `delayed_escalation` | En bestämd tidsgräns är bättre än obestämd väntan, men tio minuter är lång tid om lukten kommer från något dolt. |
| b | 1 | Fortsätt ringa fastighetsjouren tills du får svar, så att beslutet fattas av den som ansvarar för fastigheten. | `insufficient_information` | Jouren äger fastigheten men inte tidsfönstret. Att vänta på rätt beslutsfattare är här samma sak som att vänta. |
| d | 0 | Notera lukten i loggen och kontrollera trapphuset igen på nästa rond, eftersom brandlarmet inte har löst ut. | `unsupported_assumption` | Att ett automatlarm är tyst är inget bevis för att det inte brinner; många bränder luktar långt innan de larmar. |

<details><summary>English option texts</summary>

- **c (3):** Call the fire service, describe exactly what you can smell and where, and keep looking for the source while you wait.
- **a (2):** Search the two floors systematically for another ten minutes, and call the fire service if you find no source.
- **b (1):** Keep calling the property on-call until you get an answer, so the decision is made by whoever is responsible.
- **d (0):** Note the smell in the log and check the stairwell again on the next round, since the fire alarm has not triggered.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-a16`  ·  SCC-04 / eskalering  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Skiljer en driftstörning från en säkerhetshändelse när båda inträffar samtidigt. |
| **Must NOT be used to infer** | stress tolerance, general decisiveness, or capacity to work alone |
| **Work context** | Logistikanläggning, kvällspass, en väktare och en drifttekniker på plats. |
| **Over-generalisation guard** | Ett scenario om ett strömavbrott säger inget om personens tekniska kunskap. |
| **Difficulty hypothesis** | intermediate (prioritisation) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Ett strömavbrott slår ut belysning och passersystem i halva anläggningen. Dörrarna i den delen står nu olåsta. Drifttekniker arbetar med felet och säger att det tar minst en timme. Kvällsskiftet med ett tjugotal anställda är kvar i den andra halvan.

**Prompt (sv):** Vad gör du?

**Scenario (en):** A power cut takes out lighting and the access system in half the site. The doors in that half are now unlocked. Technicians are working on the fault and say it will take at least an hour. The evening shift of about twenty staff is still in the other half.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Meddela larmcentralen att passerkontrollen är ur funktion, och bemanna den olåsta delens ingång. | — (preferred) | Ett bortfall av passerkontroll är en säkerhetshändelse i sig. Den ersätts av en person tills tekniken är tillbaka. |
| a | 2 | Bemanna ingången till den olåsta delen och stanna där tills strömmen och passersystemet är tillbaka. | `insufficient_information` | Rätt åtgärd på plats, men ingen utanför anläggningen vet att kontrollen är borta i minst en timme. |
| b | 1 | Följ drifttekniker till felet och hjälp till med belysning, eftersom strömmen är orsaken till alltihop. | `tunnel_vision` | Att arbeta med orsaken är teknikernas uppgift. Konsekvensen — öppna dörrar — är väktarens och lämnas obevakad. |
| c | 0 | Gå extra ronder i den mörka delen under timmen och notera i loggen att passersystemet varit ur funktion. | `delayed_escalation` | Ronder täcker en punkt i taget. En öppen ingång behöver bevakas, inte besökas var tjugonde minut. |

<details><summary>English option texts</summary>

- **d (3):** Tell the alarm centre that access control is down, and staff the entrance to the unlocked half.
- **a (2):** Staff the entrance to the unlocked half and stay there until the power and access system are back.
- **b (1):** Follow the technicians to the fault and help with lighting, since the power is the cause of all of it.
- **c (0):** Walk extra rounds in the dark half during the hour and note in the log that the access system was down.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b01`  ·  SCC-06 / dokumentation  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Skiljer iakttagelse från slutsats i en beskrivning av en person. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Rapportering efter en iakttagelse i en entré. |
| **Over-generalisation guard** | Ett svar om formulering säger inget om personens allmänna språkförmåga. |
| **Difficulty hypothesis** | foundational (recognition) |
| **Construct / tests what** | factual_reporting / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Fyra formuleringar om samma person i en entré. Alla fyra är skrivna av väktare.

**Prompt (sv):** Vilken av dem är en iakttagelse och inte en slutsats?

**Scenario (en):** Four ways of describing the same person in an entrance hall, all written by security officers.

**Prompt (en):** Which of them is an observation rather than a conclusion?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | "Man, cirka 30–40 år, mörk jacka, stod vid dörren i tre minuter och drog i den två gånger." | — (preferred) | Enbart observerbara uppgifter: ålderspann, klädsel, tid, position och handling. Ingen tolkning av avsikt. |
| a | 2 | "Man i mörk jacka stod kvar vid dörren en längre stund och verkade vilja komma in, men gick sedan mot parkeringen." | `insufficient_information` | Mest iakttagelse, men "verkade vilja" är en tolkning som glider in bland det som faktiskt syntes. |
| b | 1 | "En nervös man i mörk jacka höll till vid dörren under en längre stund innan han försvann." | `unsupported_assumption` | "Nervös" är en tolkning av ett beteende. Det som faktiskt syntes borde stå i stället. |
| d | 0 | "Mannen såg misstänkt ut och hade sannolikt för avsikt att ta sig in obehörigt i fastigheten." | `unsupported_assumption` | Avsikt går inte att observera, och en rapport som påstår den håller inte om den prövas. |

<details><summary>English option texts</summary>

- **c (3):** "Male, about 30–40, dark jacket, stood by the door for three minutes and pulled it twice."
- **a (2):** "Man in a dark jacket stood by the door for a good while and seemed to want to get in, then walked off towards the car park."
- **b (1):** "A nervous man in a dark jacket hung around by the door for a good while before disappearing."
- **d (0):** "The man looked suspicious and probably intended to get into the building without authorisation."

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b02`  ·  SCC-06 / dokumentation  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Bedömer vilken rapport som går att arbeta vidare från. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Granskning av en kollegas händelserapport. |
| **Over-generalisation guard** | Ett svar om rapportkvalitet säger inget om personens noggrannhet i allmänhet. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | factual_reporting / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Tre rapporter om samma händelse: en vattenläcka upptäckt i ett teknikutrymme klockan 02.40 under nattrond.

**Prompt (sv):** Vilken rapport går det att arbeta vidare från?

**Scenario (en):** Three reports of the same event: a water leak found in a plant room at 02:40 during a night round.

**Prompt (en):** Which report can somebody actually work from?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | "02.40, teknikutrymme −1. Vatten 2×3 m från genomföring i tak. Jour kontaktad 02.48, på plats 03.20." | — (preferred) | Tid, plats, omfattning, vidtagen åtgärd och vem som kontaktats. En läsare kan fortsätta arbetet utan att ringa. |
| a | 2 | "02.40, teknikutrymme plan −1. Vatten på golvet, kommer från taket. Jouren är kontaktad och är på väg till platsen." | `insufficient_information` | Tid, plats och åtgärd finns. Utan omfattning kan mottagaren ändå inte avgöra hur bråttom det är. |
| b | 1 | "Vattenläcka i teknikutrymmet upptäcktes under nattronden. Jouren är kontaktad enligt instruktionen." | `failure_to_document` | Sant men obrukbart. Ingen tid, ingen omfattning, och ingen uppgift om vad som återstår att göra. |
| c | 0 | "Läckan beror med största sannolikhet på förra veckans rörarbete. Entreprenören bör hållas ansvarig." | `unsupported_assumption` | Orsak och ansvar är slutsatser som inte går att dra på plats, och de tränger undan det som observerades. |

<details><summary>English option texts</summary>

- **d (3):** "02:40, plant room −1. Water 2×3 m from a ceiling penetration. On-call contacted 02:48, on site 03:20."
- **a (2):** "02:40, plant room level −1. Water on the floor, coming from the ceiling. On-call has been contacted and is on the way to site."
- **b (1):** "Water leak in the plant room discovered during the night round. On-call contacted per the instruction."
- **c (0):** "The leak is almost certainly due to last week’s pipework. The contractor should be held responsible."

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b03`  ·  SCC-03 / aktiv-scanning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Identifierar vilken information som saknas för att kunna agera. |
| **Must NOT be used to infer** | general attentiveness, intelligence, or a diagnosis of any kind |
| **Work context** | Mottagande av en muntlig rapport från en kollega. |
| **Over-generalisation guard** | Ett svar om informationsluckor säger inget om personens allmänna analysförmåga. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** En kollega ringer och säger: "Det är någon som har varit i cykelrummet, det ser rörigt ut därinne. Jag åker vidare till nästa objekt nu."

**Prompt (sv):** Vad behöver du veta först?

**Scenario (en):** A colleague calls and says: "Somebody has been in the bike store, it looks messy in there. I am moving on to the next site now."

**Prompt (en):** What do you need to know first?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | När hen var där, vad hen faktiskt såg i rummet, och om dörren var låst eller uppbruten när hen kom. | — (preferred) | Tid och det som faktiskt observerats avgör om detta pågår eller är gammalt. Utan det går ingen åtgärd att välja. |
| b | 2 | Om dörren var låst eller uppbruten, så att du vet om det behöver åtgärdas innan objektet lämnas. | `insufficient_information` | Den viktigaste enskilda uppgiften, men utan tidpunkten går det ändå inte att avgöra hur brådskande det är. |
| c | 1 | Om hen har skrivit en notering om det i systemet, så att händelsen finns dokumenterad någonstans. | `delayed_escalation` | Rimlig fråga, men den säger inget om huruvida något behöver göras nu, vilket är det som avgörs först. |
| d | 0 | Hur många cyklar som saknas i rummet, så att omfattningen på stölden går att bedöma direkt. | `unsupported_assumption` | Antalet hör till en slutsats som ännu inte är dragen; ingen har sagt att något är stulet. |

<details><summary>English option texts</summary>

- **a (3):** When they were there, what they actually saw in the room, and whether the door was locked or forced.
- **b (2):** Whether the door was locked or forced, so you know if it needs attention before the site is left.
- **c (1):** Whether they have written a note about it in the system, so the event is documented somewhere.
- **d (0):** How many bikes are missing from the room, so the scale of the theft can be judged straight away.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b04`  ·  SCC-06 / eskalering-och-overlamning  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Anpassar informationen till vad mottagaren behöver kunna göra. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Larmsamtal till uppdragsgivarens jour mitt i natten. |
| **Over-generalisation guard** | Ett svar om vad man säger i telefon säger inget om personens allmänna kommunikationsförmåga. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | operational_communication / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Klockan 03.15 måste du väcka uppdragsgivarens jourhavande. En kylanläggning i en livsmedelslokal har larmat och temperaturen stiger. Du har tio sekunder innan personen är riktigt vaken.

**Prompt (sv):** Vad säger du först?

**Scenario (en):** At 03:15 you have to wake the client's on-call manager. A refrigeration unit in a food premises has alarmed and the temperature is rising. You have ten seconds before they are properly awake.

**Prompt (en):** What do you say first?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Vem du är, vilket objekt, att kylan larmat och temperaturen stiger, och vad du behöver att hen gör. | — (preferred) | Vem, var, vad, hur brådskande och vad som behövs — i den ordning en nyvaken person kan ta emot den. |
| a | 2 | Vem du är, vilket objekt det gäller, och att kylanläggningen larmat och att temperaturen stiger just nu. | `weak_communication` | Rätt uppgifter i rätt ordning, men utan att säga vad som behövs lämnas beslutet till någon som just vaknat. |
| c | 1 | Att det gått ett larm på kylanläggningen och att du ringer i enlighet med den larminstruktion som gäller för objektet. | `insufficient_information` | Korrekt men otillräckligt: personen vet inte var, hur illa det är, eller vad som förväntas av hen. |
| d | 0 | En redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden från början. | `weak_communication` | Bakgrund först gör att den viktiga uppgiften kommer sist, till någon som inte lyssnar färdigt. |

<details><summary>English option texts</summary>

- **b (3):** Who you are, which site, that the refrigeration alarmed and the temperature is rising, and what you need.
- **a (2):** Who you are, which site it is, and that the refrigeration has alarmed and the temperature is rising now.
- **c (1):** That the refrigeration has alarmed and that you are calling in line with the alarm instruction that applies to the site.
- **d (0):** An account of the round and what you saw up to the alarm, so they get the whole picture from the start.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b05`  ·  SCC-09 / fel-och-avvikelseansvar  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Dokumenterar en avvikelse som inte fick någon konsekvens. |
| **Must NOT be used to infer** | conscientiousness as a trait, or reliability outside this kind of task |
| **Work context** | Slutet av ett pass, ingen skada skedd. |
| **Over-generalisation guard** | Ett svar om dokumentation säger inget om personens allmänna ansvarstagande. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** I slutet av passet upptäcker du att en brandcellsdörr stått uppställd med en brandsläckare hela kvällen. Du tar bort släckaren och dörren stängs. Ingen har varit i utrymmet och inget har hänt.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At the end of your shift you find that a fire door has been propped open with a fire extinguisher all evening. You remove the extinguisher and the door closes. Nobody has been in the space and nothing has happened.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Notera avvikelsen med tid och plats även om inget hände, så att det syns om samma sak upprepas. | — (preferred) | Avvikelsen är värd att notera just för att den kan upprepas — mönstret, inte kvällen, är risken. |
| a | 2 | Notera att dörren stått uppställd, utan tid och plats, eftersom ingen skada skedde den här gången. | `insufficient_information` | Noteringen finns, men utan tid och plats går den inte att lägga bredvid nästa och se ett mönster. |
| b | 1 | Ta bort brandsläckaren, kontrollera att dörren går igen, och gå hem — problemet är därmed löst. | `failure_to_document` | Rätt fysisk åtgärd, men utan notering finns inget mönster att upptäcka nästa gång det händer. |
| d | 0 | Nämna det muntligt till nästa pass om du råkar träffa dem innan du lämnar objektet. | `delayed_escalation` | Att vänta på att någon annan ska upptäcka det gör dig till den som visste och inget gjorde. |

<details><summary>English option texts</summary>

- **c (3):** Record the deviation with time and place even though nothing happened, so it shows if the same recurs.
- **a (2):** Note that the door was propped open, without time or place, since no harm came of it this time.
- **b (1):** Remove the extinguisher, check the door closes, and go home — the problem is dealt with.
- **d (0):** Mention it verbally to the next shift if you happen to run into them before you leave.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-b06`  ·  SCC-06 / dokumentation  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Ordnar en redogörelse så att förloppet går att följa. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Skriftlig redogörelse som kan komma att läsas av utomstående. |
| **Over-generalisation guard** | Ett svar om struktur säger inget om personens allmänna skrivförmåga. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | factual_reporting / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Du ska skriva en redogörelse som kan komma att läsas av polis och av uppdragsgivarens försäkringsbolag.

**Prompt (sv):** Hur bygger du upp den?

**Scenario (en):** You are writing an account that may be read by the police and by the client's insurer.

**Prompt (en):** How do you structure it?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Kronologiskt med klockslag: vad som hände, vad du såg, vad du gjorde — egna bedömningar för sig. | — (preferred) | Kronologi med tidsangivelser, sedan iakttagelser och åtgärder, och egna bedömningar tydligt avskilda. |
| a | 2 | Kronologiskt med klockslag, med iakttagelser och åtgärder blandade så att förloppet blir lätt att följa. | `insufficient_information` | Kronologin bär, men när iakttagelse och bedömning står i samma mening blir de svåra att skilja åt i efterhand. |
| b | 1 | Med din egen slutsats först, så att läsaren vet vad det handlar om, och underlaget därefter. | `weak_communication` | Att inleda med slutsatsen färgar allt som följer och gör det svårare att se vad som faktiskt observerades. |
| c | 0 | Med det som är relevant för händelsen, utan detaljer som bara skapar oklarhet för en utomstående. | `unsupported_assumption` | Att utelämna det som talar emot den egna versionen är det som gör en redogörelse värdelös när den prövas. |

<details><summary>English option texts</summary>

- **d (3):** Chronologically with times: what happened, what you saw, what you did — your own assessments apart.
- **a (2):** Chronologically with times, with observations and actions mixed so the sequence is easy to follow.
- **b (1):** With your own conclusion first so the reader knows what it is about, and the material after that.
- **c (0):** With what is relevant to the event, leaving out details that only create confusion for an outsider.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d01`  ·  SCC-01 / regel-och-syfteslojalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Hanterar en kollegas genväg utan att göra det till en personfråga. |
| **Must NOT be used to infer** | honesty as a personality trait, general trustworthiness, or how the person would behave under pressure not shown here |
| **Work context** | Rondering på ett datacenter, två väktare, kväll. |
| **Over-generalisation guard** | Ett scenario om en kollega säger inget om personens allmänna omdöme om andra. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | mandate_and_escalation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** På ett datacenter ska besökslistan stämmas av mot faktiska besök vid varje passbyte. Din kollega, som arbetat där i sex år, gör avstämningen en gång i veckan i stället och säger att det aldrig har blivit fel på sex år.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At a data centre the visitor list is to be reconciled against actual visits at every shift change. Your colleague, who has worked there for six years, does the reconciliation once a week instead and says nothing has ever gone wrong in six years.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Gör avstämningen vid varje passbyte, säg det till kollegan, och ta upp rutinen med arbetsledaren. | — (preferred) | Gör rätt själv, tar upp det med kollegan, och för frågan vidare som en fråga om rutinen — inte om personen. |
| b | 2 | Gör avstämningen vid varje passbyte och kom överens med kollegan om att ni båda gör den från och med nu. | `delayed_escalation` | Rätt åtgärd och rätt samtal, men en rutin som tillämpas olika på ett datacenter är arbetsledningens fråga. |
| c | 1 | Gör avstämningen rätt själv utan att säga något, eftersom kollegan är betydligt mer erfaren än du. | `delayed_escalation` | Att bara göra rätt själv i tysthet lämnar avsteget kvar och gör dig till den enda som vet om det. |
| d | 0 | Följ kollegans arbetssätt, eftersom hen känner objektet väl och rutinen uppenbarligen har fungerat i sex år utan fel. | `excessive_informal_trust` | Sex år utan fel säger något om sannolikheten, inte om konsekvensen. På ett datacenter styr konsekvensen. |

<details><summary>English option texts</summary>

- **a (3):** Do the reconciliation every shift change, tell your colleague, and raise the procedure with the supervisor.
- **b (2):** Do the reconciliation at every shift change and agree with your colleague that you both do it from now on.
- **c (1):** Do the reconciliation properly yourself without saying anything, since your colleague is far more experienced.
- **d (0):** Follow your colleague’s way of working, since they know the site well and the routine has evidently worked for six years without a fault.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d02`  ·  SCC-01 / regel-och-syfteslojalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Håller en behörighetsgräns när begäran kommer från någon välkänd och sympatisk. |
| **Must NOT be used to infer** | honesty as a personality trait, general trustworthiness, or how the person would behave under pressure not shown here |
| **Work context** | Kontorsfastighet, sen kväll, ensam i receptionen. |
| **Over-generalisation guard** | Ett scenario om social press säger inget om personens allmänna påverkbarhet. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | yes |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Klockan 22 kommer en anställd du känner igen väl — hen jobbar sent varje vecka och brukar prata med dig. Hen har glömt sitt passerkort och ber dig låsa upp till en avdelning där hen inte normalt har behörighet, för att hämta en pärm åt en kollega.

**Prompt (sv):** Vad gör du?

**Scenario (en):** At 22:00 an employee you recognise well arrives — they work late every week and usually chat with you. They have forgotten their access card and ask you to unlock a department where they do not normally have authorisation, to collect a folder for a colleague.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Säg nej, förklara att din behörighet inte täcker avdelningen, och erbjud att ringa någon som kan. | — (preferred) | Behörigheten, inte bekantskapen, avgör. Erbjuder samtidigt en väg som faktiskt kan lösa personens problem. |
| a | 2 | Säg nej och be personen återkomma i morgon när den som ansvarar för avdelningen är på plats igen. | `weak_communication` | Håller gränsen, men skjuter upp ett ärende som kunde ha lösts i kväll om rätt person tillfrågats. |
| c | 1 | Följ med personen in på avdelningen och stå kvar hela tiden medan hen hämtar pärmen, och notera besöket i loggen efteråt. | `outside_mandate` | Att följa med gör inte begäran behörig. Närvaron är en kontroll, inte ett tillstånd. |
| d | 0 | Lås upp avdelningen, eftersom du känner igen personen väl och ärendet i sig verkar helt rimligt. | `excessive_informal_trust` | Att öppna på igenkänning är precis det arbetssätt en behörighetsordning finns för att förhindra. |

<details><summary>English option texts</summary>

- **b (3):** Say no, explain your authorisation does not cover that area, and offer to call somebody who can.
- **a (2):** Say no and ask the person to come back tomorrow when whoever is responsible for the department is back.
- **c (1):** Go in to the department with the person and stay there the whole time while they collect the folder, and note the visit afterwards.
- **d (0):** Unlock the department, since you recognise the person well and the errand itself seems entirely reasonable.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d03`  ·  SCC-09 / fel-och-avvikelseansvar  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Tar ansvar för ett eget fel som ingen annan upptäckt. |
| **Must NOT be used to infer** | conscientiousness as a trait, or reliability outside this kind of task |
| **Work context** | Efter avslutat pass, hemma. |
| **Over-generalisation guard** | Ett scenario om ett eget fel säger inget om personens ärlighet som egenskap. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** När du kommit hem inser du att du glömde låsa en dörr till ett förråd vid sista ronden. Passet är slut, nästa väktare är på plats, och ingen har sagt något.

**Prompt (sv):** Vad gör du?

**Scenario (en):** After you get home you realise you forgot to lock a store room door on your last round. Your shift is over, the next officer is on site, and nobody has said anything.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| c ✅ | 3 | Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missade den. | — (preferred) | Åtgärdar risken nu och lämnar spår efter sig. Att någon annan kan upptäcka det är inget skäl att låta bli. |
| a | 2 | Ring objektet direkt så att dörren kontrolleras, och nämn missen vid nästa passbyte i stället för att skriva. | `failure_to_document` | Risken hanteras i tid, men avvikelsen finns bara i ett samtal och kan därmed inte följas upp senare. |
| b | 1 | Ta upp det när du kommer till jobbet nästa gång, så att det i alla fall blir sagt till någon. | `delayed_escalation` | Att vänta till nästa pass innebär att risken står öppen under tiden, av ren bekvämlighet. |
| d | 0 | Anta att nästa väktares rond fångar upp dörren, eftersom förrådet ändå ingår i den ordinarie ronden. | `failure_to_document` | Att lita på nästa rond löser möjligen dörren men lämnar avvikelsen odokumenterad, vilket betyder mest över tid. |

<details><summary>English option texts</summary>

- **c (3):** Call the site straight away so the door gets checked, and write your own deviation report saying you missed it.
- **a (2):** Call the site straight away so the door gets checked, and mention the slip at the next handover rather than writing it.
- **b (1):** Raise it when you next come in to work, so that it at least gets said to somebody.
- **d (0):** Assume the next officer’s round catches the door, since the store room is on the ordinary round anyway.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d04`  ·  SCC-06 / dokumentation  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Rättar en ofullständig dokumentation i efterhand utan att skriva om historien. |
| **Must NOT be used to infer** | general writing ability, education level, or command of Swedish beyond what the item requires |
| **Work context** | Vecka efter en händelse, inför en genomgång. |
| **Over-generalisation guard** | Ett scenario om rättelse säger inget om personens allmänna noggrannhet. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | factual_reporting / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Inför en genomgång läser du din egen rapport från förra veckan och ser att du utelämnat att du var ensam på objektet när händelsen inträffade. Rapporten är i övrigt korrekt.

**Prompt (sv):** Vad gör du?

**Scenario (en):** Ahead of a review you read your own report from last week and see that you left out the fact that you were alone on site when the incident happened. The report is otherwise correct.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| d ✅ | 3 | Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den tillkommit i efterhand. | — (preferred) | Komplettering i efterhand, daterad och märkt som sådan. Originalet står kvar, vilket är poängen med ett spår. |
| a | 2 | Lägg till en daterad komplettering om bemanningen utan att särskilt nämna den vid genomgången. | `weak_communication` | Spåret blir rätt, men de som läser rapporten på mötet får inte veta att en väsentlig uppgift saknades. |
| b | 1 | Nämn det muntligt vid genomgången, utan att ändra eller komplettera något i den rapport som redan är inlämnad. | `insufficient_information` | Muntligt håller för mötet men inte för någon som läser rapporten om ett år. |
| c | 0 | Redigera rapporten så att bemanningen framgår och texten blir korrekt redan från början. | `failure_to_document` | Att redigera originalet gör rapporten oanvändbar som spår, oavsett hur riktig den blir. |

<details><summary>English option texts</summary>

- **d (3):** Add a dated addendum about the staffing and say at the review that it was added afterwards.
- **a (2):** Add a dated addendum about the staffing without specifically mentioning it at the review.
- **b (1):** Mention it verbally at the review, without changing or supplementing anything in the report that has already been filed.
- **c (0):** Edit the report so the staffing is stated and the text is correct from the start.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d05`  ·  SCC-11 / proportionalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Väljer vad som prioriteras bort när tiden inte räcker, och redovisar valet. |
| **Must NOT be used to infer** | legal knowledge, formal authorisation, or fitness to hold a licence |
| **Work context** | Sista ronden, ett larm har tagit tid, passet tar slut om trettio minuter. |
| **Over-generalisation guard** | Ett scenario om tidsbrist säger inget om personens allmänna arbetstempo. |
| **Difficulty hypothesis** | advanced (judgement) |
| **Construct / tests what** | prioritisation / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** Ett larm har tagit fyrtio minuter av ditt pass. Du har trettio minuter kvar och en rond som normalt tar femtio. Ronden omfattar tolv kontrollpunkter, varav tre är utrymmen med skyddsvärde och nio är allmänna utrymmen.

**Prompt (sv):** Vad gör du?

**Scenario (en):** An alarm has taken forty minutes of your shift. You have thirty minutes left and a round that normally takes fifty. The round covers twelve checkpoints, three of which are areas with protective value and nine of which are general areas.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| a ✅ | 3 | Gå de tre skyddsvärda punkterna först, kvittera bara det du gått, och skriv resten i överlämningen. | — (preferred) | Prioriterar efter skyddsvärde, kvitterar bara det som faktiskt gjorts, och lämnar över det som inte hanns med. |
| b | 2 | Gå de tre skyddsvärda punkterna och avsluta passet där, och kvittera i systemet bara de punkter du faktiskt har hunnit gå. | `insufficient_information` | Rimlig prioritering och en sann logg, men utan överlämning vet nästa pass inte vad som står okontrollerat. |
| c | 1 | Gå så många av de tolv punkterna du hinner i tur och ordning, och kvittera bara dem du faktiskt gått. | `poor_proportionality` | Loggen blir sann, men att gå i tur och ordning i tidsbrist betyder att skyddsvärdet inte styrde valet. |
| d | 0 | Gå så många punkter du hinner och kvittera resten ändå, så att ronden ser fullständig ut i systemet. | `failure_to_document` | Att kvittera det som inte gjorts gör loggen osann, vilket är allvarligare än en ogjord rond. |

<details><summary>English option texts</summary>

- **a (3):** Do the three protected points first, sign off only what you visited, and put the rest in the handover.
- **b (2):** Do the three protected points and end the shift there, signing off in the system only the points you actually managed to visit.
- **c (1):** Do as many of the twelve points as you can in order, and sign off only the ones you actually visited.
- **d (0):** Do as many points as you can and sign off the rest anyway, so the round looks complete in the system.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-d06`  ·  SCC-01 / regel-och-syfteslojalitet  ·  sjt_best_response

| | |
|---|---|
| **Intended to measure** | Hanterar en begäran om att använda systeminformation utanför uppdraget. |
| **Must NOT be used to infer** | honesty as a personality trait, general trustworthiness, or how the person would behave under pressure not shown here |
| **Work context** | Personalrum, samtal med en anställd hos uppdragsgivaren. |
| **Over-generalisation guard** | Ett scenario om informationshantering säger inget om personens allmänna diskretion. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | mandate_and_escalation / mandate |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | no |

**Scenario (sv):** En anställd hos uppdragsgivaren frågar om du kan kolla i passersystemet vilken tid en viss kollega gick hem i går. Hen säger att det gäller en diskussion om vem som lämnade kaffemaskinen påslagen.

**Prompt (sv):** Vad gör du?

**Scenario (en):** An employee of the client asks whether you can check in the access system what time a particular colleague went home yesterday. They say it concerns an argument about who left the coffee machine on.

**Prompt (en):** What do you do?

| key | score | response strategy (sv) | error type | why this score |
|---|---|---|---|---|
| b ✅ | 3 | Säg nej, förklara att passerdata bara får användas för säkerhetsändamål, och hänvisa till chefen. | — (preferred) | Nej med skäl, och en anvisning om var frågan hör hemma. Behovet försvinner inte men vägen dit blir den rätta. |
| a | 2 | Säg nej och förklara att passerdata bara får användas för säkerhetsändamål, och lämna det därvid. | `delayed_escalation` | Rätt svar med rätt skäl, men utan en väg vidare kommer samma fråga tillbaka till nästa väktare i receptionen. |
| c | 1 | Säg att du inte får göra det och gå vidare med arbetet utan att förklara varför det är så. | `weak_communication` | Ett nej utan skäl lämnar intrycket att det är godtycke, och frågan kommer tillbaka till nästa väktare. |
| d | 0 | Titta efter i systemet åt personen, eftersom uppgiften är harmlös och hen ändå kan få den av sin egen chef i morgon. | `excessive_informal_trust` | Att uppgiften är harmlös ändrar inte att den hämtats ur ett system som finns för något annat. |

<details><summary>English option texts</summary>

- **b (3):** Say no, explain access data may only be used for security purposes, and refer them to their manager.
- **a (2):** Say no and explain that access data may only be used for security purposes, and leave it at that.
- **c (1):** Say that you are not allowed to and get on with your work without explaining why that is.
- **d (0):** Look it up in the system for them, since the information is harmless and they could get it from their own manager tomorrow.

</details>

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-e01`  ·  SCC-09 / fel-och-avvikelseansvar  ·  constructed_response

| | |
|---|---|
| **Intended to measure** | Redogör för ett eget misstag och vad som gjordes efteråt. |
| **Must NOT be used to infer** | conscientiousness as a trait, or reliability outside this kind of task |
| **Work context** | — |
| **Over-generalisation guard** | Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | yes — a person reads every response |

**Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.

**Prompt (sv):** Beskriv en situation där du gjorde ett misstag på jobbet. Vad gjorde du efteråt?

**Scenario (en):** This question has no right answer. A person reads what you write.

**Prompt (en):** Describe a situation where you made a mistake at work. What did you do afterwards?

_Constructed response — a person reads the answer against a published rubric. No options._

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-e02`  ·  SCC-07 / granshallning  ·  constructed_response

| | |
|---|---|
| **Intended to measure** | Redogör för hur en gräns hållits när det var socialt obekvämt. |
| **Must NOT be used to infer** | patience as a trait, warmth, temperament, or cultural fit |
| **Work context** | — |
| **Over-generalisation guard** | Ett svar på en reflektionsfråga säger inget om personens allmänna social förmåga. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | yes — a person reads every response |

**Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.

**Prompt (sv):** Beskriv en situation där du behövde säga nej till någon trots att det var socialt obekvämt.

**Scenario (en):** This question has no right answer. A person reads what you write.

**Prompt (en):** Describe a situation where you had to say no to somebody even though it was socially uncomfortable.

_Constructed response — a person reads the answer against a published rubric. No options._

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-e03`  ·  SCC-03 / avvikelseigenkanning  ·  constructed_response

| | |
|---|---|
| **Intended to measure** | Redogör för hur uppmärksamhet hållits uppe under repetitivt arbete. |
| **Must NOT be used to infer** | general attentiveness, intelligence, or a diagnosis of any kind |
| **Work context** | — |
| **Over-generalisation guard** | Ett svar om koncentration säger inget om personens allmänna uthållighet. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | yes — a person reads every response |

**Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar. Arbetet behöver inte ha varit inom säkerhet.

**Prompt (sv):** Beskriv en situation där du behövde hålla koncentrationen uppe under upprepat arbete. Hur gjorde du?

**Scenario (en):** This question has no right answer. A person reads what you write. The work does not have to have been in security.

**Prompt (en):** Describe a situation where you had to maintain concentration during repetitive work. How did you do it?

_Constructed response — a person reads the answer against a published rubric. No options._

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

### `so-rj-e04`  ·  SCC-11 / proportionalitet  ·  constructed_response

| | |
|---|---|
| **Intended to measure** | Redogör för hur en felaktig uppgift upptäcktes och hanterades. |
| **Must NOT be used to infer** | legal knowledge, formal authorisation, or fitness to hold a licence |
| **Work context** | — |
| **Over-generalisation guard** | Ett svar om felaktig information säger inget om personens allmänna kritiska tänkande. |
| **Difficulty hypothesis** | intermediate (judgement) |
| **Construct / tests what** | situational_judgement / judgement |
| **Safety-critical** | no |
| **Legal review required** | no |
| **Human review of the answer** | yes — a person reads every response |

**Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.

**Prompt (sv):** Beskriv en situation där information du fick från början visade sig vara felaktig. Vad gjorde du då?

**Scenario (en):** This question has no right answer. A person reads what you write.

**Prompt (en):** Describe a situation where information you were given initially turned out to be wrong. What did you do then?

_Constructed response — a person reads the answer against a published rubric. No options._

| Review question | YES / NO | Comment |
|---|---|---|
| Is the situation realistic for Swedish guarding work? | | |
| Is the marked option (✅) genuinely the strongest response? | | |
| Is the 2-point option credible as second-best? | | |
| Are all the distractors plausible — would a real officer pick them? | | |
| Does the item rest on an unfair assumption about the candidate? | | |
| Is there a legal concern? | | |
| **Suggested correction** | | |

---

## Self-reported items (24) — for information

These record what the candidate says about their own usual way of working. They are reported to the employer as self-description and never as something the platform observed. There is no correct answer, so there is nothing here for an SME to mark right or wrong — but please flag anything that reads as intrusive, as a personality question, or as something an employer should not be asking.

Two of them (`so-rj-c07`, `so-rj-c19`) score non-monotonically on purpose: the best answer is in the middle of the scale, not at one end. Please confirm that judgement.

| item | competency | facet | statement (sv) |
|---|---|---|---|
| `so-rj-c01` | SCC-09 | genomforandedisciplin | Om en rutin känns onödigt lång och situationen ser okomplicerad ut förenklar jag ibland stegen. |
| `so-rj-c02` | SCC-09 | genomforandedisciplin | När jag avviker från en rutin skriver jag ner varför, även när avvikelsen var uppenbart rimlig. |
| `so-rj-c03` | SCC-09 | genomforandedisciplin | Två sätt att arbeta. Inget av dem är fel. |
| `so-rj-c04` | SCC-03 | aktiv-scanning | När jag lägger märke till något litet som avviker nöjer jag mig oftast med att komma ihåg det. |
| `so-rj-c05` | SCC-03 | aktiv-scanning | Jag antecknar tid och plats direkt när jag ser något, inte i efterhand. |
| `so-rj-c06` | SCC-03 | aktiv-scanning | Två sätt att gå en rond. Inget av dem är fel. |
| `so-rj-c07` | SCC-03 | avvikelseigenkanning | När jag har gjort samma kontroll många gånger behöver jag påminna mig själv om att inte gå på autopilot. |
| `so-rj-c08` | SCC-03 | avvikelseigenkanning | Jag har ett konkret sätt att bryta rutinen när uppmärksamheten börjar svikta, till exempel att byta ordning eller ta en kort paus. |
| `so-rj-c09` | SCC-03 | avvikelseigenkanning | Sent på ett nattpass går jag igenom kontrollpunkterna snabbare än i början av passet. |
| `so-rj-c10` | SCC-01 | regel-och-syfteslojalitet | Jag berättar om händelser från jobbet för familj eller vänner, utan namn men med detaljer. |
| `so-rj-c11` | SCC-01 | regel-och-syfteslojalitet | När jag inte kan lämna ut information förklarar jag varför, i stället för att bara säga att det inte går. |
| `so-rj-c12` | SCC-01 | regel-och-syfteslojalitet | Jag använder min egen telefon för att fotografera eller anteckna sådant jag behöver komma ihåg från passet. |
| `so-rj-c13` | SCC-09 | fel-och-avvikelseansvar | Om jag upptäcker ett litet fel som ingen annan verkar ha sett rapporterar eller dokumenterar jag det ändå. |
| `so-rj-c14` | SCC-09 | fel-och-avvikelseansvar | Om ett misstag inte fick någon konsekvens tycker jag att det räcker att åtgärda det. |
| `so-rj-c15` | SCC-09 | fel-och-avvikelseansvar | När jag gjort ett fel ändrar jag något konkret i hur jag arbetar, inte bara hur noga jag tänker vara. |
| `so-rj-c16` | SCC-07 | granshallning | Det är svårare för mig att säga nej till någon jag känner väl än till någon jag aldrig träffat. |
| `so-rj-c17` | SCC-07 | granshallning | När jag säger nej försöker jag samtidigt erbjuda ett sätt för personen att lösa sitt ärende. |
| `so-rj-c18` | SCC-07 | granshallning | Två sätt att hantera att någon fortsätter tjata efter ett nej. Inget av dem är fel. |
| `so-rj-c19` | SCC-06 | eskalering-och-overlamning | Jag försöker lösa saker själv först, så att jag inte stör någon i onödan. |
| `so-rj-c20` | SCC-06 | eskalering-och-overlamning | Om jag larmat i onödan tar jag upp det efteråt i stället för att låta det passera. |
| `so-rj-c21` | SCC-06 | eskalering-och-overlamning | Vid passets slut säger jag uttryckligen vad jag inte hann med, inte bara vad jag gjorde. |
| `so-rj-c22` | SCC-04 | aterhamtning | Efter en obehaglig ordväxling märker jag att jag är kortare i tonen mot nästa person jag möter. |
| `so-rj-c23` | SCC-04 | aterhamtning | Jag har något jag gör medvetet för att komma tillbaka efter en pressad situation. |
| `so-rj-c24` | SCC-04 | aterhamtning | Två sätt att hantera ett samtal som håller på att gå överstyr. Inget av dem är fel. |

