# Granskningsförslag: TRUST – strategiska och ledande roller (Säkerhetschef)

> **UTKAST FÖR GRANSKNING.** Inget i detta dokument är granskat, godkänt eller validerat innehåll. Det är genererat från migrationen `20261216090000_scp_security_manager_recruitment_content.sql` som den ser ut i en lokal databas (`bun run scripts/strategic-review-proposal.ts`), så att granskarna läser exakt de rader de tar ställning till. Innehållet är AI-författat mot produktens egna konstruktregler och ägarens specifikation (`docs/product/trust-beskt-content-gaps-2026-09-19.md` §3.1). Ingen psykometrisk egenskap påstås.

## 0. Status och vad som begärs

| | Värde |
|---|---|
| Kandidattest | Säkerhetschef – Recruitment Assessment / Security Manager – Recruitment Assessment — version 1, `draft`/`design` |
| Designerat som standardinnehåll för rekrytering | **NEJ** (kräver ägarbeslut) |
| Intervjuguide | Säkerhetschef v1 — `draft`, `pilot_hypothesis`, pilot **restricted**, innehållshash i den här databasen `7ee072ee2f9647a54924bbd8eb9c03b6` |
| Utestående granskningsgrindar på uppgifterna | 185 (37 uppgifter × 5 grindar) |

**Begäran:** ett samlat innehållsgodkännande av (1) kravprofilen, (2) kandidattestet med poängsättning och rubriker, (3) intervjuguiden, (4) rapportavsnittets intervjufrågor, och därefter (5) ett uttryckligt beslut om aktivering: designation av testet som standardinnehåll och öppen pilot för guiden. Exakt aktivering: `docs/release/2026-09-26-strategic-level-content-approval.md`.

Syfte (programförklaring, sv): Rollspecifik bedömning för rekrytering till strategiska och ledande säkerhetsroller. Ger strukturerat evidens- och intervjuunderlag om riskbaserad prioritering, styrning och mandat, incident- och krisledning, samverkan, regelefterlevnad och självrapporterat ledarbeteende. Resultatet är beslutsstöd inför en strukturerad intervju. Det fattar inget anställningsbeslut, rangordnar inga kandidater och uttalar sig inte om lämplighet. Utkast under granskning -- inte validerat.

Mäter INTE: Personlighet; Ärlighet som personlighetsdrag; Emotionell stabilitet; Psykisk hälsa; Motivation; Framtida arbetsprestation; Ledarskapsstil som egenskap; Formell auktorisation; Laglig behörighet; Bakgrundskontroll; Säkerhetsprövning; Lämplighet för anställning.

## 1. Kravprofil: sex observerbara beteenden

Roll `security-manager-se` (Säkerhetschef / Security Manager), version 1, utkast. Varje beteende är mappat till en kanonisk SCC-kompetens; mappningen är författarens läsning och granskas i expertgrinden.

### risk_based_prioritisation → SCC-11 Professionellt omdöme och proportionalitet

- **Beteende (sv):** Prioriterar åtgärder och resurser efter skyddsvärde, sannolikhet och konsekvens -- inte efter vem som frågar högst.
- **Behaviour (en):** Prioritises measures and resources by asset value, likelihood and consequence -- not by who asks loudest.
- **Positiva indikatorer:** Namnger vad som skyddas och mot vad; Väger konsekvens mot kostnad öppet; Säger vad som INTE prioriteras och varför
- **Kontraindikationer:** Reagerar på senaste nyhet eller starkaste röst; Köper åtgärder utan att kunna säga vilken risk de minskar

### governance_and_mandate → SCC-09 Ansvarstagande och tillförlitlighet

- **Beteende (sv):** Klargör mandat, ansvar och beslutsvägar innan hen delegerar, och följer upp det som delegerats.
- **Behaviour (en):** Clarifies mandate, responsibility and decision paths before delegating, and follows up what was delegated.
- **Positiva indikatorer:** Skriver ner vem som beslutar vad; Följer upp delegerade uppgifter på utsatt tid; Tar ansvar för utfallet av egna beslut
- **Kontraindikationer:** Delegerar utan att säga vad som får beslutas; Låter en avvikelse passera för att undvika friktion

### incident_and_crisis_leadership → SCC-04 Beslutsfattande under press

- **Beteende (sv):** Leder en incident genom att skapa en gemensam lägesbild, sätta beslutspunkter och återgå till normalläge kontrollerat.
- **Behaviour (en):** Leads an incident by building a shared picture, setting decision points and returning to normal in a controlled way.
- **Positiva indikatorer:** Skiljer bekräftat från antaget under händelsen; Bestämmer i förväg vad som utlöser eskalering; Avslutar med en genomgång i stället för att bara gå vidare
- **Kontraindikationer:** Fattar stora beslut på obekräftad uppgift; Håller kvar krisläge längre än läget kräver

### cross_functional_collaboration → SCC-08 Samarbete och samordning

- **Beteende (sv):** Samordnar säkerhetsarbetet med verksamheten, andra funktioner, myndigheter och leverantörer utan att lämna ifrån sig ansvaret.
- **Behaviour (en):** Coordinates security work with the business, other functions, authorities and suppliers without handing over the responsibility.
- **Positiva indikatorer:** Klargör vem som gör vad innan något händer; Delar information med dem som behöver den; Löser problem tillsammans i stället för att peka
- **Kontraindikationer:** Agerar ensam när andra funktioner berörs; Låter en leverantör definiera vad som är tillräckligt

### compliance_and_follow_up → SCC-01 Integritet och etik

- **Beteende (sv):** Följer upp att krav, rutiner och beslut faktiskt efterlevs, och för fel vidare öppet även när det är obekvämt.
- **Behaviour (en):** Follows up that requirements, procedures and decisions are actually complied with, and reports failures openly even when it is uncomfortable.
- **Positiva indikatorer:** Rapporterar en brist uppåt utan att förminska den; Skiljer en avvikelse från vem som orsakade den; Står emot påtryckning att tona ner ett fynd
- **Kontraindikationer:** Anpassar ett fynd till vad ledningen vill höra; Låter ett krav vara känt men ouppfyllt utan plan

### people_leadership → SCC-06 Kommunikation och informationskvalitet

- **Beteende (sv):** Leder personal genom tydliga förväntningar, lyssnande, dokumenterad uppföljning och likvärdig behandling.
- **Behaviour (en):** Leads people through clear expectations, listening, documented follow-up and equal treatment.
- **Positiva indikatorer:** Säger vad som förväntas innan hen bedömer; Lyssnar färdigt innan hen beslutar; Ger återkoppling på handling, inte person
- **Kontraindikationer:** Bedömer utan att ha sagt vad som gäller; Behandlar samma avvikelse olika beroende på person

## 2. Kandidattest: sektioner, uppgifter och poängsättning

Poängsättning: varje scenariouppgift har ett föredraget svar (3 poäng), ett delvis svar (1) och ett svar som visar ett namngivet feltyp (0). Självskattningar poängsätts 0–3 längs frekvensskalan, hälften omvänt kodade, och redovisas ALLTID som självrapporterat. Reflektioner poängsätts inte av maskin: en människa läser dem mot rubriken i avsnitt 3. Inga totalpoäng, ingen rangordning, inget gränsvärde. Rapporten redovisar evidens per kompetensområde, och otillräckligt underlag som otillräckligt.

### Riskbaserad prioritering och styrning / Risk-based prioritisation and governance (8 uppgifter, what_you_would_do)

_Åtta situationer ur en säkerhetschefs vardag: budget, kontroller, mandat och rapportering till ledningen. Det finns sällan ett självklart rätt svar -- välj det du faktiskt skulle göra utifrån det som står i situationen._

#### 1. `sm-rj-a01` — SCC-11 Professionellt omdöme och proportionalitet · konsekvensanalys · risk_based_prioritisation

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `prioritisation`, testar `judgement`
- Observerbart: Prioriterar en minskning efter vilken förlust varje åtgärd förebygger.
- Övergeneraliseringsskydd: Ett svar i ett budgetscenario säger något om resonemanget här, inte om personens allmänna ekonomiska omdöme.
- **Scenario (sv):** Ledningen meddelar att säkerhetsbudgeten ska minskas med 15 procent från nästa kvartal. De största posterna är bevakningstimmar på huvudkontoret, service och underhåll av passersystemet på tre anläggningar, och ett planerat byte av kameraövervakningen i lagret. Ledningen vill ha ditt förslag i morgon.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** Management announces that the security budget is to be cut by 15 percent from next quarter. The largest items are guarding hours at head office, service and maintenance of the access-control system at three sites, and a planned replacement of the CCTV in the warehouse. Management wants your proposal tomorrow.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Går igenom vilken förlust varje post förebygger, föreslår var minskningen gör minst skada och skriver ut vilken risk som ökar med förslaget. | Work through which loss each item prevents, propose where the cut does the least harm, and state which risk increases with the proposal. | Prioriterar efter konsekvens och gör den risk som ökar synlig för den som beslutar. |
| b | 1 |  |  | poor_proportionality | Fördelar minskningen lika över alla tre posterna så att ingen del av verksamheten drabbas mer än någon annan. | Spread the cut equally over all three items so that no part of the business is hit harder than another. | Lika fördelning är inte riskbaserad: den skyddar relationer, inte skyddsvärden. |
| c | 0 |  |  | tunnel_vision | Behåller bevakningstimmarna oförändrade eftersom synlig bevakning är det ledningen märker, och stryker underhållet av passersystemet. | Keep the guarding hours unchanged because visible guarding is what management notices, and drop the maintenance of the access-control system. | Väljer efter vad som syns i stället för efter vad som skyddar; ett passersystem utan underhåll försämras tyst. |

#### 2. `sm-rj-a02` — SCC-11 Professionellt omdöme och proportionalitet · faktabaserad-bedomning · risk_based_prioritisation

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Väger extern rapport mot egen incidenthistorik innan prioritering.
- Övergeneraliseringsskydd: Ett scenario om prioritering säger inget om personens förhållande till konsulter i allmänhet.
- **Scenario (sv):** En extern granskning har lämnat 40 fynd. Det som markerats som mest kritiskt är en saknad staketsektion runt en av anläggningarna. Er egen incidentlogg för de senaste två åren visar att nio av tio förluster är interna stölder från lagret, som inte nämns i rapporten.
- **Fråga (sv):** Vad prioriterar du först?
- **Scenario (en):** An external review has delivered 40 findings. The one marked most critical is a missing section of perimeter fence at one site. Your own incident log for the last two years shows that nine out of ten losses are internal thefts from the warehouse, which the report does not mention.
- **Prompt (en):** What do you prioritise first?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Ställer rapportens fynd mot den egna incidenthistoriken och prioriterar utifrån båda: lagret först, staketet i planen med motivering. | Set the findings of the report against your own incident history and prioritise from both: the warehouse first, the fence in the plan with the reasoning stated. | Faktabaserat: två underlag ställs mot varandra och båda får plats i planen med motivering. |
| b | 1 |  |  | unsupported_assumption | Följer rapportens prioritering rakt av eftersom konsulten har sett fler anläggningar än du. | Follow the prioritisation of the report as it stands, since the consultant has seen more sites than you. | Överlåter bedömningen till rapporten trots att egna data pekar åt ett annat håll. |
| c | 0 |  |  | insufficient_information | Beställer en ny och större utredning innan något åtgärdas, eftersom underlagen pekar åt olika håll. | Commission a new and larger investigation before anything is done, since the two sources point in different directions. | Skjuter upp åtgärder som egna data redan motiverar. |

#### 3. `sm-rj-a03` — SCC-09 Ansvarstagande och tillförlitlighet · agarskap · governance_and_mandate

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `mandate`
- Observerbart: Klargör mandat och beslutsvägar i stället för att improvisera dem.
- Övergeneraliseringsskydd: Ett svar om mandat i ett scenario säger inget om hur personen leder i allmänhet.
- **Scenario (sv):** Platscheferna på era anläggningar har i praktiken beviljat tillträdesbehörigheter var och en på sitt sätt. En ny platschef frågar dig vad hon egentligen får besluta om själv och vad som ska gå via dig.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** The site managers at your sites have in practice granted access rights each in their own way. A new site manager asks you what she is actually allowed to decide herself and what has to go through you.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Skriver ner vad platschefer får besluta om tillträde, vad som kräver ditt godkännande, och går igenom det med henne och de andra platscheferna. | Write down what site managers may decide about access, what needs your approval, and go through it with her and the other site managers. | Sätter mandatet skriftligt och lika för alla, och äger beslutet om var gränsen går. |
| b | 1 |  |  | weak_communication | Säger att hon kan göra som de andra platscheferna brukar, och att du hör av dig om något blir fel. | Tell her she can do as the other site managers usually do, and that you will be in touch if something goes wrong. | Lämnar mandatet odefinierat och ansvaret hos den som frågade. |
| c | 0 |  |  | poor_proportionality | Tar över alla behörighetsbeslut själv tills vidare så att inget blir fel. | Take over all access decisions yourself for now so that nothing goes wrong. | Centraliserar i stället för att styra; skalar inte och löser inte otydligheten. |

#### 4. `sm-rj-a04` — SCC-09 Ansvarstagande och tillförlitlighet · sparbar-uppfoljning · governance_and_mandate

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `foundational`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Följer upp det som delegerats utan att ta tillbaka ansvaret.
- Övergeneraliseringsskydd: Ett scenario om uppföljning säger inget om personens tålamod eller kontrollbehov i allmänhet.
- **Scenario (sv):** Du gav en erfaren medarbetare i uppdrag att uppdatera utrymningsplanerna för två byggnader till månadsskiftet. Det har gått en vecka sedan dess och du har inte hört något.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** You asked an experienced member of staff to update the evacuation plans for two buildings by the end of the month. A week has passed since then and you have heard nothing.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Frågar efter läget samma dag, tar reda på vad som hindrat, sätter ett nytt datum tillsammans och noterar det. | Ask for the status the same day, find out what got in the way, set a new date together and note it down. | Spårbar uppföljning: läget efterfrågas, hindret klarläggs, ett nytt datum sätts och noteras. |
| b | 1 |  |  | delayed_escalation | Väntar till nästa månadsmöte. Personen är erfaren och hör av sig om det behövs. | Wait until the next monthly meeting. The person is experienced and will get in touch if needed. | Uppföljningen lämnas till slumpen; erfarenhet ersätter inte uppföljning. |
| c | 0 |  |  | poor_proportionality | Gör klart planerna själv under helgen och nämner det inte. Det går snabbast. | Finish the plans yourself over the weekend and do not mention it. It is quickest. | Tar tillbaka ansvaret och döljer missen; inget lärs och inget följs upp. |

#### 5. `sm-rj-a05` — SCC-06 Kommunikation och informationskvalitet · faktabaserad-bedomning · factual_reporting

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Rapporterar vad måtten faktiskt visar, skilt från vad som önskas.
- Övergeneraliseringsskydd: Ett svar om rapportering i ett scenario säger inget om personens ärlighet som egenskap.
- **Scenario (sv):** VD vill att kvartalsrapporten ska visa att antalet incidenter minskat. Den faktiska bilden är att antalet rapporterade incidenter ökat, eftersom ni infört ett enklare sätt att rapportera. Antalet allvarliga incidenter är oförändrat.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** The CEO wants the quarterly report to show that the number of incidents has fallen. The actual picture is that the number of reported incidents has risen, because you introduced an easier way to report. The number of serious incidents is unchanged.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Redovisar att antalet rapporterade incidenter ökat, förklarar att det beror på bättre rapportering, och visar vilka mått som faktiskt säger något om risknivån. | Report that the number of reported incidents has risen, explain that this is due to better reporting, and show which measures actually say something about the level of risk. | Faktabaserat: ökningen redovisas, förklaras, och rätt mått för risknivån pekas ut. |
| b | 1 |  |  | weak_communication | Byter mått till allvarliga incidenter, som är oförändrade, och nämner inte ökningen i den totala rapporteringen. | Switch the measure to serious incidents, which are unchanged, and do not mention the rise in overall reporting. | Byter mått i tysthet; sant i detalj men vilseledande som helhet. |
| c | 0 |  |  | unsupported_assumption | Skriver att incidenterna minskat i förhållande till vad som kunde förväntas, eftersom ledningen ändå behöver ett tydligt budskap. | Write that incidents have fallen relative to what could be expected, since management needs a clear message anyway. | Skriver det som önskas i stället för det som är; underlaget stöder inte påståendet. |

#### 6. `sm-rj-a06` — SCC-11 Professionellt omdöme och proportionalitet · proportionalitet · risk_based_prioritisation

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Väljer åtgärd i proportion till en egen bedömning av hotet mot den egna verksamheten.
- Övergeneraliseringsskydd: Ett scenario om proportion säger inget om personens riskvilja i allmänhet.
- **Scenario (sv):** Nyheterna rapporterar om en drönarattack mot en industrianläggning i ett annat land. Styrelseordföranden ringer och vill att ni skaffar ett system mot drönare omgående.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** The news reports a drone attack on an industrial facility in another country. The chair of the board calls and wants you to acquire a counter-drone system immediately.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Bedömer vad en drönare faktiskt skulle kunna åstadkomma mot er verksamhet, redovisar det för styrelsen och föreslår åtgärd i proportion till bedömningen. | Assess what a drone could actually achieve against your business, report that to the board, and propose action in proportion to the assessment. | Bedömer hotet mot den egna verksamheten först och föreslår i proportion till den bedömningen. |
| b | 1 |  |  | premature_escalation | Beställer offert på ett motmedelssystem direkt, så att styrelsen ser att frågan tas på allvar. | Request a quote for a counter-drone system straight away, so that the board sees the matter is taken seriously. | Åtgärden föregår bedömningen; signalvärde ersätter riskbedömning. |
| c | 0 |  |  | tunnel_vision | Avfärdar frågan eftersom inget sådant har hänt hos er, och går vidare med den ordinarie planen. | Dismiss the matter because nothing of the kind has happened to you, and carry on with the ordinary plan. | Avfärdar utan bedömning; att inget hänt är inte en riskbedömning. |

#### 7. `sm-rj-a07` — SCC-01 Integritet och etik · regel-och-syfteslojalitet · compliance_and_follow_up

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Åtgärdar en känd brist nu och rapporterar den, i stället för att planera bort den.
- Övergeneraliseringsskydd: Ett scenario om en revisionsbrist säger inget om personens regelefterlevnad i allmänhet.
- **Scenario (sv):** Internrevisionen har konstaterat att behörigheter för personer som slutat inte stängs i tid. Verksamheten har en viktig lansering om två veckor och vill inte ha störningar i arbetet innan dess.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** Internal audit has found that access rights for people who have left are not closed in time. The business has an important launch in two weeks and does not want disruption before then.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Ser till att avslutade konton stängs nu, sätter en tillfällig kontroll tills rutinen fungerar, och rapporterar bristen och planen till ledningen. | Make sure closed accounts are shut now, put a temporary control in place until the routine works, and report the finding and the plan to management. | Bristen stängs nu, en tillfällig kontroll täcker tiden fram till en fungerande rutin, och ledningen får veta. |
| b | 1 |  |  | delayed_escalation | Planerar in en ny rutin efter lanseringen så att den inte stör produktionen, och svarar revisionen att åtgärd är planerad. | Schedule a new routine after the launch so that it does not disrupt production, and reply to audit that action is planned. | En känd brist lämnas öppen av bekvämlighet; revisionen får ett löfte i stället för en åtgärd. |
| c | 0 |  |  | failure_to_document | Löser det tyst genom att be IT göra en engångsrensning, utan att ta upp bristen vidare. | Fix it quietly by asking IT to do a one-off clean-up, without raising the finding further. | Löser symptomet i tysthet; bristen och dess orsak förs inte vidare. |

#### 8. `sm-rj-a08` — SCC-09 Ansvarstagande och tillförlitlighet · genomforandedisciplin · governance_and_mandate

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `mandate`
- Observerbart: Håller rutinen och löser det verkliga behovet på ett behörigt sätt.
- Övergeneraliseringsskydd: Ett scenario om undantag säger inget om personens flexibilitet i allmänhet.
- **Scenario (sv):** En avdelningschef ber dig godkänna att hennes team får ställa upp en sidodörr till lastgården under en projektvecka, eftersom de bär in och ut material hela dagarna. Dörren ingår i skalskyddet.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** A department head asks you to approve that her team may prop open a side door to the loading yard during a project week, since they carry material in and out all day. The door is part of the perimeter protection.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Säger nej till att sätta rutinen ur spel, tar reda på vad teamet behöver och ordnar en behörig lösning, till exempel tillfälliga passerkort eller bemannad dörr. | Say no to putting the routine aside, find out what the team needs, and arrange an authorised solution, for example temporary access cards or a staffed door. | Rutinen hålls, behovet tas på allvar och löses inom mandat. |
| b | 1 |  |  | excessive_informal_trust | Godkänner undantaget för projektveckan eftersom avdelningschefen ansvarar för sitt team och det är tidsbegränsat. | Approve the exception for the project week, since the department head is responsible for her team and it is time-limited. | Ansvar för ett team är inte mandat över skalskyddet; tidsbegränsning gör inte ett hål mindre. |
| c | 0 |  |  | weak_communication | Hänvisar till policyn och avslutar samtalet. Undantag hanteras inte. | Refer to the policy and end the conversation. Exceptions are not handled. | Rätt slutsats, fel hantering: behovet lämnas olöst och nästa gång frågar ingen. |

### Incident- och krisledning / Incident and crisis leadership (5 uppgifter, what_you_would_do)

_Fem situationer där något har hänt och du leder hanteringen. Det handlar om lägesbild, beslutspunkter, samordning och återgång -- inte om att själv springa först._

#### 9. `sm-rj-b01` — SCC-04 Beslutsfattande under press · prioritering · incident_and_crisis_leadership

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `prioritisation`, testar `judgement`
- Observerbart: Prioriterar människor framför egendom och använder de resurser som finns i stället för att göra allt själv.
- Övergeneraliseringsskydd: Ett prioriteringsscenario säger inget om personens stresstålighet.
- **Scenario (sv):** Klockan 16.40 går inbrottslarmet på ert fjärrlager, som bevakningsbolaget har instruktion att åka till. Samtidigt ringer receptionen på huvudkontoret, där du sitter, och säger att en person hotar personalen. Du är den enda från säkerhetsfunktionen på plats.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** At 16:40 the intruder alarm goes off at your remote warehouse, which the guarding company is instructed to attend. At the same moment reception at head office, where you are, calls to say a person is threatening staff. You are the only member of the security function on site.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Låter bevakningsbolaget hantera larmet enligt instruktion, tar själv hand om hotet i receptionen där människor är i fara, och ber någon hålla dig uppdaterad om larmet. | Let the guarding company handle the alarm as instructed, deal yourself with the threat in reception where people are at risk, and ask someone to keep you updated on the alarm. | Människor i fara först; larmet hanteras av den resurs som är avsedd för det; lägesbilden hålls. |
| b | 1 |  |  | tunnel_vision | Åker till lagret, eftersom inbrott mot lagret är den största ekonomiska risken, och ber receptionen ringa polisen. | Drive to the warehouse, since a break-in there is the largest financial risk, and ask reception to call the police. | Egendom prioriteras framför människor och den egna närvaron lämnas där den behövs minst. |
| c | 0 |  |  | premature_escalation | Utlyser krisläge för hela organisationen och kallar in krisledningsgruppen innan du vet mer. | Declare a crisis for the whole organisation and call in the crisis management team before you know more. | Krisläge utan lägesbild binder resurser och skapar oro utan att lösa något av de två problemen. |

#### 10. `sm-rj-b02` — SCC-04 Beslutsfattande under press · eskalering · incident_and_crisis_leadership

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `judgement`, testar `mandate`
- Observerbart: Eskalerar med bekräftat och misstänkt åtskilt, och sätter nästa beslutspunkt.
- Övergeneraliseringsskydd: Ett eskaleringsscenario säger inget om personens allmänna benägenhet att larma.
- **Scenario (sv):** IT rapporterar att logistiksystemet beter sig konstigt och att det kan vara ett angrepp med utpressningsprogram, men lika gärna ett tekniskt fel. Kundernas leveransfönster stänger om tre timmar. VD och vice VD sitter på ett flyg i två timmar till.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** IT reports that the logistics system is behaving strangely and that it may be a ransomware attack, but equally may be a technical fault. The delivery window for customers closes in three hours. The CEO and deputy CEO are on a flight for another two hours.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Ber IT isolera det misstänkta systemet nu, informerar ställföreträdande ledning med det som är bekräftat respektive misstänkt, och sätter en tid för nästa besked. | Ask IT to isolate the suspected system now, inform the deputising management with what is confirmed and what is suspected kept apart, and set a time for the next update. | Skadebegränsning nu, eskalering till den som faktiskt finns med bekräftat och misstänkt åtskilt, och en satt beslutspunkt. |
| b | 1 |  |  | delayed_escalation | Väntar tills IT har bekräftat att det är ett angrepp innan du informerar någon, för att inte skapa oro i onödan. | Wait until IT has confirmed that it is an attack before informing anyone, so as not to cause unnecessary alarm. | Väntar på visshet som kanske inte kommer i tid; ledningen förlorar beslutstid. |
| c | 0 |  |  | unsupported_assumption | Meddelar kunderna att ni är utsatta för ett angrepp så att de kan förbereda sig. | Tell customers that you are under attack so that they can prepare. | Kommunicerar ett antagande som faktum, utåt, före ledningen och före bekräftelse. |

#### 11. `sm-rj-b03` — SCC-08 Samarbete och samordning · samordnad-problemlosning · cross_functional_collaboration

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Löser problemet över funktionsgränser i stället för att fördela skuld eller dra in allt till sig själv.
- Övergeneraliseringsskydd: Ett samverkansscenario säger inget om personens samarbetsförmåga som egenskap.
- **Scenario (sv):** Efter ett inbrott via en nödutgång visar det sig att kamerabilderna raderats av ett automatiskt gallringsskript innan någon hann spara dem. Fastighetsavdelningen säger att IT-säkerhet ansvarar för lagringen. IT-säkerhet säger att fastighet skulle ha begärt att bilderna sparades.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** After a break-in through an emergency exit it turns out the camera footage was deleted by an automatic retention script before anyone saved it. Facilities says IT security is responsible for storage. IT security says facilities should have requested that the footage be kept.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Samlar berörda funktioner, fastställer händelseförloppet tillsammans, och fördelar åtgärder på vad som ska ändras, inte på vem som hade fel. | Bring the functions concerned together, establish the sequence of events jointly, and assign actions by what needs to change, not by who was at fault. | Samordnad problemlösning: förloppet fastställs gemensamt och åtgärderna fördelas på vad som ska ändras. |
| b | 1 |  |  | weak_communication | Skriver en rapport till ledningen där båda funktionernas brister beskrivs och låter dem avgöra ansvaret. | Write a report to management describing the shortcomings of both functions and let them decide the responsibility. | Delegerar samordningen uppåt; problemet består tills någon annan tar det. |
| c | 0 |  |  | tunnel_vision | Tar över lagringen av kamerabilder till säkerhetsfunktionen så att du inte är beroende av någon annan. | Take over the storage of camera footage into the security function so that you do not depend on anyone else. | Bygger en egen ö i stället för fungerande samverkan; flyttar problemet, löser det inte. |

#### 12. `sm-rj-b04` — SCC-04 Beslutsfattande under press · aterhamtning · incident_and_crisis_leadership

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Återgår till normalläge kontrollerat och stänger händelsen med en genomgång.
- Övergeneraliseringsskydd: Ett återgångsscenario säger inget om personens försiktighet i allmänhet.
- **Scenario (sv):** Byggnaden utrymdes efter ett bombhot. Polisen har sökt igenom lokalerna och friat byggnaden. Personalen är skakad, och VD vill att alla ska tillbaka till sina platser med en gång så att arbetet kommer igång.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** The building was evacuated after a bomb threat. The police have searched the premises and cleared the building. Staff are shaken, and the CEO wants everyone back at their desks at once so that work gets going.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Låter personalen återgå stegvis med tydlig information om vad som hänt och vad som kontrollerats, och bokar en genomgång av hanteringen inom en vecka. | Let staff return in stages with clear information about what happened and what was checked, and book a review of the handling within a week. | Kontrollerad återgång med information, och händelsen avslutas med lärande. |
| b | 1 |  |  | failure_to_document | Låter alla gå tillbaka direkt som ledningen vill, eftersom polisen har friat byggnaden, och går vidare. | Let everyone go back straight away as management wants, since the police have cleared the building, and move on. | Sakligt försvarbart att återgå, men utan information och utan genomgång lärs inget. |
| c | 0 |  |  | poor_proportionality | Håller byggnaden stängd resten av dagen som försiktighetsåtgärd, trots polisens besked. | Keep the building closed for the rest of the day as a precaution, despite the police decision. | Överprövar polisens bedömning utan eget underlag; kostnaden bärs av verksamheten utan riskminskning. |

#### 13. `sm-rj-b05` — SCC-06 Kommunikation och informationskvalitet · saklig-tydlighet · operational_communication

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Rapporterar bekräftat, okänt, pågående och nästa uppdatering, i den ordningen.
- Övergeneraliseringsskydd: Ett kommunikationsscenario säger inget om personens kommunikationsstil i allmänhet.
- **Scenario (sv):** Fyrtio minuter efter att en extern part visat upp en fil med era kundnamn väntar ledningen på ett besked från dig. Ni vet ännu inte varifrån filen kommer eller hur mycket som läckt.
- **Fråga (sv):** Hur rapporterar du?
- **Scenario (en):** Forty minutes after an external party showed a file containing your customer names, management is waiting to hear from you. You do not yet know where the file came from or how much has leaked.
- **Prompt (en):** How do you report?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Rapporterar exakt vad som är bekräftat, vad som är okänt, vad som görs just nu och när nästa uppdatering kommer. | Report exactly what is confirmed, what is unknown, what is being done right now and when the next update will come. | Saklig tydlighet: bekräftat, okänt, pågående och nästa tidpunkt, utan spekulation. |
| b | 1 |  |  | weak_communication | Väntar med rapporten tills du kan ge en fullständig bild, så att ledningen inte får motstridiga uppgifter. | Hold the report until you can give a complete picture, so that management does not receive conflicting information. | Fullständighet före aktualitet lämnar ledningen utan lägesbild när den behövs. |
| c | 0 |  |  | unsupported_assumption | Rapporterar att läckan sannolikt kommer från en leverantör, eftersom det är det vanligaste, så att ledningen kan agera. | Report that the leak probably comes from a supplier, since that is the most common case, so that management can act. | En sannolik källa presenteras som slutsats; ledningen agerar på ett antagande. |

### Arbetsbeteende som ledare / Leadership work behaviour (16 uppgifter, how_you_usually_work)

_Sexton frågor om hur du brukar arbeta som ledare. Det här är inte ett personlighetstest och det finns inget facit. Svaren redovisas för arbetsgivaren som det du själv beskriver -- aldrig som något vi har observerat. Svara som det faktiskt ser ut, inte som det borde se ut._

#### 14. `sm-rj-c01` — SCC-09 Ansvarstagande och tillförlitlighet · sparbar-uppfoljning · governance_and_mandate

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver hur hen bestämmer uppföljning när hen delegerar.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** När jag delegerat en uppgift bestämmer jag samtidigt när och hur jag följer upp den.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** When I have delegated a task, I decide at the same time when and how I will follow it up.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att uppföljning sällan bestäms vid delegering. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att uppföljning regelmässigt bestäms vid delegering. |

#### 15. `sm-rj-c02` — SCC-09 Ansvarstagande och tillförlitlighet · sparbar-uppfoljning · governance_and_mandate

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om läget för delegerade uppgifter nås först vid fel.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Läget för uppgifter jag delegerat får jag reda på först när något har gått fel.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** I find out the status of tasks I have delegated only once something has gone wrong.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att uppföljningen inte är reaktiv. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att uppföljningen regelmässigt är reaktiv. |

#### 16. `sm-rj-c03` — SCC-09 Ansvarstagande och tillförlitlighet · agarskap · governance_and_mandate

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om hen själv säger till när ett eget beslut visat sig fel.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** När ett beslut jag fattat visar sig vara fel säger jag det själv innan någon annan gör det.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** When a decision I made turns out to be wrong, I say so myself before anyone else does.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att egna felbeslut sällan lyfts av personen själv. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att egna felbeslut regelmässigt lyfts av personen själv. |

#### 17. `sm-rj-c04` — SCC-09 Ansvarstagande och tillförlitlighet · agarskap · governance_and_mandate

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om ansvaret för ett ifrågasatt beslut flyttas till underlaget.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Om ett beslut ifrågasätts i efterhand hänvisar jag i första hand till dem som gav mig underlaget.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** If a decision is questioned afterwards, I refer first of all to the people who gave me the basis for it.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att ansvaret stannar hos personen. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att ansvaret regelmässigt flyttas. |

#### 18. `sm-rj-c05` — SCC-06 Kommunikation och informationskvalitet · aktivt-lyssnande · people_leadership

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om hen låter en medarbetare beskriva färdigt innan hen avgör.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Innan jag avgör en fråga som rör en medarbetare låter jag personen beskriva den färdigt.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** Before I decide a matter concerning a member of staff, I let the person describe it fully.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att medarbetaren sällan får tala till punkt. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att medarbetaren regelmässigt får tala till punkt. |

#### 19. `sm-rj-c06` — SCC-06 Kommunikation och informationskvalitet · aktivt-lyssnande · people_leadership

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om hen bestämt sig innan andra pratat klart.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** I möten med mitt team har jag bestämt mig innan de andra har pratat klart.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** In meetings with my team, I have made up my mind before the others have finished speaking.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att beslutet väntar på att andra talat. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att beslutet regelmässigt föregår lyssnandet. |

#### 20. `sm-rj-c07` — SCC-06 Kommunikation och informationskvalitet · saklig-tydlighet · people_leadership

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om förväntningar sägs innan bedömning.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Mina medarbetare vet vad jag förväntar mig innan jag bedömer hur de har gjort.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** My staff know what I expect before I judge how they have done.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att förväntningar sällan sägs i förväg. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att förväntningar regelmässigt sägs i förväg. |

#### 21. `sm-rj-c08` — SCC-06 Kommunikation och informationskvalitet · saklig-tydlighet · people_leadership

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om återkoppling ges först när något behöver rättas.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Jag ger återkoppling på hur en uppgift gjordes först när något behöver rättas.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** I give feedback on how a task was done only when something needs correcting.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att återkoppling inte bara ges vid fel. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att återkoppling regelmässigt bara ges vid fel. |

#### 22. `sm-rj-c09` — SCC-01 Integritet och etik · transparens · compliance_and_follow_up

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om en egen brist rapporteras i samma form som andras.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** När en brist upptäcks i mitt ansvarsområde rapporterar jag den uppåt i samma form som jag skulle rapportera någon annans.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** When a shortcoming is found in my area of responsibility, I report it upwards in the same form as I would report someone else's.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att egna brister sällan rapporteras likvärdigt. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att egna brister regelmässigt rapporteras likvärdigt. |

#### 23. `sm-rj-c10` — SCC-01 Integritet och etik · transparens · compliance_and_follow_up

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om dåliga nyheter hålls tills en lösning finns.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Dåliga nyheter till ledningen väntar jag med tills jag har en lösning att presentera samtidigt.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** I hold bad news for management until I have a solution to present at the same time.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att dåliga nyheter inte hålls inne. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att dåliga nyheter regelmässigt hålls inne. |

#### 24. `sm-rj-c11` — SCC-01 Integritet och etik · motstand-mot-otillborlig-paverkan · compliance_and_follow_up

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om hen står fast vid underlaget under påtryckning uppifrån.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** När någon med mer makt än jag vill tona ner ett fynd står jag fast vid vad underlaget visar.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** When someone with more power than me wants to play down a finding, I stand by what the evidence shows.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att underlaget sällan försvaras under påtryckning. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att underlaget regelmässigt försvaras under påtryckning. |

#### 25. `sm-rj-c12` — SCC-01 Integritet och etik · motstand-mot-otillborlig-paverkan · compliance_and_follow_up

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om ett ogillat fynd mjukas upp tills det inte sticker ut.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Om ledningen ogillar en slutsats mjukar jag upp den tills fyndet inte längre sticker ut.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** If management dislikes a conclusion, I soften it until the finding no longer stands out.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att fynd inte mjukas upp. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att fynd regelmässigt mjukas upp. |

#### 26. `sm-rj-c13` — SCC-08 Samarbete och samordning · informationsdelning · cross_functional_collaboration

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om information som berör en annan funktion förs vidare samma dag.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** När jag får information som berör en annan funktion ser jag till att den når dit samma dag.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** When I receive information that concerns another function, I make sure it reaches them the same day.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att information sällan förs vidare i tid. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att information regelmässigt förs vidare i tid. |

#### 27. `sm-rj-c14` — SCC-08 Samarbete och samordning · informationsdelning · cross_functional_collaboration

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om säkerhetsinformation hålls inom funktionen tills den är utredd.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Säkerhetsinformation håller jag inom säkerhetsfunktionen tills jag är säker på hur den ska användas, även när andra funktioner berörs.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** I keep security information within the security function until I am sure how it should be used, even when other functions are affected.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att berörda funktioner inte hålls utanför. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att berörda funktioner regelmässigt hålls utanför. |

#### 28. `sm-rj-c15` — SCC-11 Professionellt omdöme och proportionalitet · faktabaserad-bedomning · risk_based_prioritisation

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om egen incidenthistorik konsulteras före prioritering.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Innan jag prioriterar en åtgärd tar jag reda på vad den egna incidenthistoriken säger.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** Before I prioritise a measure, I find out what our own incident history says.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 0 |  |  |  | Nästan aldrig | Almost never | Beskriver att egna data sällan konsulteras. |
| b | 1 |  |  |  | Ibland | Sometimes |  |
| c | 2 |  |  |  | Ofta | Often |  |
| d | 3 |  |  |  | Nästan alltid | Almost always | Beskriver att egna data regelmässigt konsulteras. |

#### 29. `sm-rj-c16` — SCC-11 Professionellt omdöme och proportionalitet · faktabaserad-bedomning · risk_based_prioritisation

- Format `biq_frequency`, evidens `self_report`, svårighet `foundational`, kognitivt krav `recognition`, testar `judgement`
- Observerbart: Beskriver om prioritering sker på magkänsla snarare än underlag.
- Övergeneraliseringsskydd: Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.
- **Scenario (sv):** Jag prioriterar åtgärder utifrån magkänsla och erfarenhet snarare än utifrån underlag.
- **Fråga (sv):** Hur ofta stämmer det?
- **Scenario (en):** I prioritise measures on gut feeling and experience rather than on evidence.
- **Prompt (en):** How often is that true?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 |  | ja |  | Nästan aldrig | Almost never | Beskriver att underlag går före magkänsla. |
| b | 2 |  | ja |  | Ibland | Sometimes |  |
| c | 1 |  | ja |  | Ofta | Often |  |
| d | 0 |  | ja |  | Nästan alltid | Almost always | Beskriver att magkänsla regelmässigt går före underlag. |

### Integritet, samverkan och regelefterlevnad / Integrity, collaboration and compliance (5 uppgifter, what_you_would_do)

_Fem situationer där ledning, kund, leverantör eller ett krav drar åt olika håll._

#### 30. `sm-rj-d01` — SCC-01 Integritet och etik · motstand-mot-otillborlig-paverkan · compliance_and_follow_up

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Står emot påtryckning att ta bort ett fynd, och erbjuder saklig form i stället.
- Övergeneraliseringsskydd: Ett scenario om påtryckning säger inget om personens mod som egenskap.
- **Scenario (sv):** VD ber dig ta bort ett fynd om en avdelningschefs område ur sammanfattningen till styrelsen, eftersom det "ändå är på gång att lösas" och skulle "ta onödigt fokus".
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** The CEO asks you to remove a finding about the area of one department head from the summary to the board, since it is "being resolved anyway" and would "take unnecessary focus".
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Behåller fyndet, erbjuder dig att formulera det sakligt och med den åtgärd som pågår, och säger varför det inte kan tas bort. | Keep the finding, offer to word it factually and with the action under way, and say why it cannot be removed. | Fyndet behålls, formen erbjuds sakligt med pågående åtgärd, och skälet sägs. |
| b | 1 |  |  | weak_communication | Flyttar fyndet till en bilaga som styrelsen kan läsa om de vill, så att sammanfattningen blir som VD önskar. | Move the finding to an appendix the board can read if they wish, so that the summary is as the CEO wants. | Tekniskt kvar, praktiskt gömt: styrelsen får inte det den ska ha där den läser. |
| c | 0 |  |  | excessive_informal_trust | Tar bort fyndet. VD ansvarar inför styrelsen och får avgöra vad som rapporteras. | Remove the finding. The CEO answers to the board and may decide what is reported. | Undanhåller information från det organ den är avsedd för; VD:s roll ger inte mandat över vad styrelsen får veta om risk. |

#### 31. `sm-rj-d02` — SCC-01 Integritet och etik · etisk-konsekvens · integrity_and_information_handling

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Delar det avtalet ger rätt till, men inte personuppgifter utan rättslig grund, och säger det.
- Övergeneraliseringsskydd: Ett informationsscenario säger inget om personens diskretion i allmänhet.
- **Scenario (sv):** En stor kund begär den fullständiga incidentrapporten från en händelse på deras anläggning, inklusive namn på era medarbetare som var inblandade, och hänvisar till avtalets klausul om insyn. Klausulen ger kunden rätt till uppgifter om händelsen och åtgärderna.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** A major client requests the full incident report from an event at their site, including the names of your staff involved, citing the transparency clause of the contract. The clause entitles the client to information about the event and the measures taken.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Lämnar det avtalet ger rätt till om händelsen och åtgärderna, men inte personuppgifter om enskilda medarbetare utan rättslig grund, och säger det till kunden. | Provide what the contract entitles the client to about the event and the measures, but not personal data about individual staff without a legal basis, and tell the client so. | Skiljer vad avtalet ger från personuppgifter om enskilda, och är öppen med gränsen. |
| b | 1 |  |  | excessive_informal_trust | Skickar hela rapporten eftersom kunden är viktig och har en klausul om insyn. | Send the whole report, since the client is important and has a transparency clause. | Kundens vikt är inte en rättslig grund; klausulen omfattar händelsen, inte personerna. |
| c | 0 |  |  | weak_communication | Avböjer att lämna något alls tills juristerna har uttalat sig, och låter kunden vänta. | Decline to provide anything at all until the lawyers have spoken, and let the client wait. | Lämnar inte ens det kunden har rätt till; skjuter en enkel gränsdragning till andra. |

#### 32. `sm-rj-d03` — SCC-08 Samarbete och samordning · rollklarhet · cross_functional_collaboration

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Håller isär relation och avtal: avvikelser dokumenteras och hanteras formellt.
- Övergeneraliseringsskydd: Ett leverantörsscenario säger inget om personens relationsförmåga i allmänhet.
- **Scenario (sv):** Er bevakningsleverantör har vid fem tillfällen den senaste månaden skickat ersättare utan den objektsutbildning avtalet kräver. Leverantörens kundansvarige är hjälpsam och ber om ursäkt varje gång.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** Your guarding supplier has on five occasions in the last month sent substitutes without the site training the contract requires. The account manager of the supplier is helpful and apologises every time.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Dokumenterar avvikelserna, tar upp dem formellt mot avtalet med krav på åtgärd inom en bestämd tid, och behåller den goda relationen på det sättet. | Document the deviations, raise them formally against the contract with a requirement for action within a set time, and keep the good relationship that way. | Rollklarhet: avtalet hanteras formellt med tidsatt krav; relationen bevaras genom tydlighet, inte i stället för den. |
| b | 1 |  |  | delayed_escalation | Fortsätter ta det med kundansvarige varje gång. Relationen är god och det brukar lösa sig. | Keep raising it with the account manager each time. The relationship is good and it usually gets resolved. | Relationen ersätter styrningen; avvikelsen fortsätter. |
| c | 0 |  |  | poor_proportionality | Säger upp avtalet direkt vid nästa avvikelse för att markera. | Terminate the contract at the next deviation to make a point. | Oproportionerligt utan att först ha ställt ett formellt krav; skapar ett nytt problem. |

#### 33. `sm-rj-d04` — SCC-01 Integritet och etik · transparens · compliance_and_follow_up

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Rapporterar en försummad skyldighet öppet, inklusive förseningen och orsaken.
- Övergeneraliseringsskydd: Ett scenario om en missad anmälan säger inget om personens noggrannhet i allmänhet.
- **Scenario (sv):** Er verksamhet är skyldig att anmäla vissa säkerhetsincidenter till en tillsynsmyndighet inom en viss tid. Du upptäcker att en incident för fyra månader sedan, under din tid som chef, aldrig anmäldes. Ingen har frågat efter den.
- **Fråga (sv):** Vad gör du?
- **Scenario (en):** Your organisation is obliged to report certain security incidents to a supervisory authority within a set time. You discover that an incident four months ago, during your time as manager, was never reported. Nobody has asked about it.
- **Prompt (en):** What do you do?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Anmäler händelsen till myndigheten nu, informerar ledningen om förseningen och orsaken, och ändrar rutinen så att det inte upprepas. | Report the incident to the authority now, inform management of the delay and its cause, and change the routine so that it does not happen again. | Transparens: anmälan görs nu, förseningen och orsaken redovisas, och rutinen ändras. |
| b | 1 |  |  | delayed_escalation | Anmäler händelsen men beskriver den som nyupptäckt, så att förseningen inte behöver förklaras. | Report the incident but describe it as newly discovered, so that the delay does not have to be explained. | Anmälan görs men förseningen döljs; det som rapporteras är inte sant i sin helhet. |
| c | 0 |  |  | failure_to_document | Låter bli att anmäla eftersom det gått så lång tid och ingen har frågat. | Do not report it, since so much time has passed and nobody has asked. | En känd skyldighet lämnas ouppfylld medvetet. |

#### 34. `sm-rj-d05` — SCC-09 Ansvarstagande och tillförlitlighet · fel-och-avvikelseansvar · mandate_and_escalation

- Format `sjt_best_response`, evidens `assessment_response`, svårighet `intermediate`, kognitivt krav `judgement`, testar `judgement`
- Observerbart: Tar chefsansvaret för en avvikelse och håller isär det från hanteringen av medarbetaren.
- Övergeneraliseringsskydd: Ett ansvarsscenario säger inget om personens lojalitet som egenskap.
- **Scenario (sv):** En medarbetare i din funktion missade en låskontroll, vilket ledde till en stöld med betydande förlust. Styrelsen frågar dig vad som hände.
- **Fråga (sv):** Vad säger du?
- **Scenario (en):** A member of your function missed a lock check, which led to a theft with a significant loss. The board asks you what happened.
- **Prompt (en):** What do you say?

| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |
|---|---|---|---|---|---|---|---|
| a | 3 | ja |  |  | Redogör för vad som hände och vad som brast i rutin och uppföljning, tar ansvaret som chef, och hanterar medarbetaren separat. | Explain what happened and what failed in routine and follow-up, take the responsibility as manager, and deal with the member of staff separately. | Fel- och avvikelseansvar: händelsen, bristen i rutin och uppföljning, chefsansvaret, och medarbetaren separat. |
| b | 1 |  |  | weak_communication | Redogör för att en medarbetare missade en kontroll, och att medarbetaren har fått en tillsägelse. | Explain that a member of staff missed a check, and that the member of staff has been reprimanded. | Sant men ofullständigt: ansvaret placeras helt hos medarbetaren och systemfrågan lämnas obesvarad. |
| c | 0 |  |  | unsupported_assumption | Beskriver händelsen som ett systemfel utan att nämna att en kontroll missades. | Describe the event as a system failure without mentioning that a check was missed. | Döljer den faktiska orsaken bakom en oprecis förklaring. |

### Reflektion / Reflection (3 uppgifter, your_own_experience)

_Tre korta frågor om egna erfarenheter av att leda och besluta. Svaren läses av en människa, inte av en modell. Skriv några meningar -- det behöver inte vara långt._

#### 35. `sm-rj-e01` — SCC-09 Ansvarstagande och tillförlitlighet · agarskap · governance_and_mandate

- Format `constructed_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `synthesis`, testar `judgement`
- Observerbart: Redogör för ett eget säkerhetsbeslut och hur det försvarades.
- Övergeneraliseringsskydd: Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.
- **Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.
- **Fråga (sv):** Beskriv ett säkerhetsbeslut du fattat som du behövde försvara inför ledning, kund eller kollegor. Hur resonerade du, och vad hände?
- **Scenario (en):** This question has no right answer. A person reads what you write.
- **Prompt (en):** Describe a security decision you made that you had to defend to management, a client or colleagues. How did you reason, and what happened?

#### 36. `sm-rj-e02` — SCC-06 Kommunikation och informationskvalitet · saklig-tydlighet · people_leadership

- Format `constructed_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `synthesis`, testar `judgement`
- Observerbart: Redogör för en kontroll som inte fungerade och vad som gjordes med teamet.
- Övergeneraliseringsskydd: Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.
- **Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.
- **Fråga (sv):** Beskriv en gång då en kontroll eller rutin inom ditt ansvar inte fungerade. Vad gjorde du med teamet efteråt?
- **Scenario (en):** This question has no right answer. A person reads what you write.
- **Prompt (en):** Describe a time when a control or routine within your responsibility did not work. What did you do with the team afterwards?

#### 37. `sm-rj-e03` — SCC-11 Professionellt omdöme och proportionalitet · konsekvensanalys · risk_based_prioritisation

- Format `constructed_response`, evidens `assessment_response`, svårighet `advanced`, kognitivt krav `synthesis`, testar `judgement`
- Observerbart: Redogör för en föreslagen åtgärd som valdes bort och vad som vägdes in.
- Övergeneraliseringsskydd: Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.
- **Scenario (sv):** Den här frågan har inget rätt svar. En människa läser ditt svar.
- **Fråga (sv):** Beskriv en gång då du valde att inte genomföra en föreslagen säkerhetsåtgärd. Vad vägde du in, och hur följde du upp beslutet?
- **Scenario (en):** This question has no right answer. A person reads what you write.
- **Prompt (en):** Describe a time when you chose not to implement a proposed security measure. What did you weigh up, and how did you follow up the decision?

## 3. Rubriker för reflektionerna (läses av en människa)

Nivåer per dimension: 0 = Inget underlag i svaret för denna dimension.; 1 = Enstaka relevant inslag, men väsentligt saknas.; 2 = Delvis uppfyllt; minst en väsentlig brist kvarstår.; 3 = Uppfyllt i allt väsentligt utan allvarliga brister.; 4 = Uppfyllt genomgående och konkret.

### `sm-rj-e01` — Försvarat säkerhetsbeslut / Defended security decision

Får inte dra slutsatser om: personlighet, ärlighet som egenskap, motivation, känsloläge, avsikt, intelligens, psykisk hälsa, framtida arbetsprestation, lämplighet för anställning, skyddade personliga egenskaper, språklig elegans, senioritet, ledarstil som egenskap.

- **Konkret situation / Concrete situation**: Ett verkligt, avgränsat beslut beskrivs, med vem det försvarades inför -- inte en princip eller en styrka i förklädnad. / A real, bounded decision is described, with whom it was defended to -- not a principle or a strength in disguise.
- **Redovisat resonemang / Reasoning stated**: Det framgår vilket underlag och vilka avvägningar beslutet vilade på, och vad motparten invände. / The basis and the trade-offs the decision rested on are stated, and what the other party objected.
- **Ägarskap / Ownership**: Beslutet och dess utfall placeras hos personen själv, oavsett om det stod sig eller ändrades. / The decision and its outcome are located with the person, whether it held or was changed.
- **Tydlighet / Clarity** (skrivkvalitet – visas, räknas inte): Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat. / The account can be followed. Simple language is judged equal to polished.

### `sm-rj-e02` — Kontroll som inte fungerade / Control that failed

Får inte dra slutsatser om: personlighet, ärlighet som egenskap, motivation, känsloläge, avsikt, intelligens, psykisk hälsa, framtida arbetsprestation, lämplighet för anställning, skyddade personliga egenskaper, språklig elegans, senioritet, ledarstil som egenskap.

- **Konkret situation / Concrete situation**: En verklig kontroll eller rutin som inte fungerade beskrivs, inom personens eget ansvar. / A real control or routine that failed is described, within the person's own responsibility.
- **Vad som ändrades / What changed**: Det framgår vad som faktiskt ändrades i kontrollen, rutinen eller uppföljningen efteråt. / What actually changed in the control, the routine or the follow-up afterwards is stated.
- **Hantering av teamet / Handling of the team**: Teamet beskrivs som deltagare i lösningen; avvikelsen skiljs från vem som orsakade den. / The team is described as taking part in the solution; the deviation is separated from who caused it.
- **Tydlighet / Clarity** (skrivkvalitet – visas, räknas inte): Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat. / The account can be followed. Simple language is judged equal to polished.

### `sm-rj-e03` — Bortvald åtgärd / Declined measure

Får inte dra slutsatser om: personlighet, ärlighet som egenskap, motivation, känsloläge, avsikt, intelligens, psykisk hälsa, framtida arbetsprestation, lämplighet för anställning, skyddade personliga egenskaper, språklig elegans, senioritet, ledarstil som egenskap.

- **Konkret situation / Concrete situation**: En verklig, föreslagen åtgärd som valdes bort beskrivs, och vem som föreslog den. / A real, proposed measure that was declined is described, and who proposed it.
- **Redovisad avvägning / Weighing stated**: Det framgår vilken risk åtgärden skulle ha minskat, och vad som vägde tyngre. / Which risk the measure would have reduced is stated, and what outweighed it.
- **Konsekvensmedvetenhet / Consequence awareness**: Den risk som kvarstod beskrivs, och hur den följdes upp eller accepterades öppet. / The risk that remained is described, and how it was followed up or openly accepted.
- **Tydlighet / Clarity** (skrivkvalitet – visas, räknas inte): Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat. / The account can be followed. Simple language is judged equal to polished.

## 4. Intervjuguide: Säkerhetschef Role Interview Pack v1

Strukturerad, PEACE-baserad och evidensinformerad pilotintervju för strategiska och ledande säkerhetsroller. Skapa likvärdiga intervjuer som samlar in konkret jobbrelevant evidens om prioritering, styrning, incidentledning, samverkan, regelefterlevnad och ledarskap. AI får förbereda och strukturera; intervjuaren bedömer och beslutar.

Utkast för granskning. Kompetenser, frågor och ankare är ett förslag som måste innehållsvalideras genom dokumenterad arbetsanalys av ledande säkerhetsbefattningar hos pilotkunder och panel med experter innan skarpa urvalsbeslut. Ingen empiriskt validerad prediktionsmodell. Inte godkänt, inte öppnat för pilot.

### Kompetenser och provisorisk mappning

- **C1 Riskbaserad prioritering och resursfördelning** — Prioriterar åtgärder och resurser efter skyddsvärde, sannolikhet och konsekvens, redovisar avvägningar öppet och säger vad som inte prioriteras. Indikatorer: Underlag före åtgärd; Konsekvensanalys; Öppet bortval; Proportion. Mappning: SCC-04 (partial_overlap, provisional), SCC-11 (broader_than_source, provisional).
- **C2 Styrning, mandat och ansvarsfördelning** — Klargör vem som beslutar vad, dokumenterar mandat och beslutsvägar, delegerar med uppföljning och tar ansvar för egna beslut. Indikatorer: Mandatklarhet; Dokumenterad beslutsväg; Uppföljning av delegering; Ägarskap. Mappning: SCC-09 (broader_than_source, provisional).
- **C3 Incident- och krisledning** — Skapar gemensam lägesbild, skiljer bekräftat från antaget, sätter beslutspunkter, samordnar resurser och återgår till normalläge kontrollerat med lärande. Indikatorer: Lägesbild; Beslutspunkter; Samordning; Kontrollerad återgång; Genomgång. Mappning: SCC-03 (partial_overlap, provisional), SCC-04 (broader_than_source, provisional).
- **C4 Samverkan med verksamhet, myndigheter och leverantörer** — Får andra att göra sin del av säkerhetsarbetet genom rollklarhet, informationsdelning och gemensam problemlösning, utan att lämna ifrån sig ansvaret. Indikatorer: Rollklarhet; Informationsdelning; Gemensam lösning; Avtalsstyrning. Mappning: SCC-06 (partial_overlap, provisional), SCC-08 (broader_than_source, provisional).
- **C5 Regelefterlevnad och uppföljning** — Följer upp att krav, rutiner och beslut efterlevs, rapporterar brister sakligt även när de är egna eller obekväma, och står emot påtryckning att tona ner fynd. Indikatorer: Uppföljning; Saklig rapportering; Transparens; Motstånd mot påverkan. Mappning: SCC-01 (broader_than_source, provisional), SCC-09 (partial_overlap, provisional).
- **C6 Ledarskap och uppföljning av personal** — Leder personal genom tydliga förväntningar, lyssnande, återkoppling på handling och likvärdig behandling, och förändrar arbetssätt tillsammans med teamet. Indikatorer: Tydliga förväntningar; Lyssnande; Återkoppling; Likvärdighet; Förändring med teamet. Mappning: SCC-06 (broader_than_source, provisional), SCC-12 (partial_overlap, provisional).

### Allmänna fördjupningsfrågor (godkända)

- example: Kan du välja en specifik situation?
- own_role: Vad var just ditt ansvar och mandat i den situationen?
- exact_action: Vad gjorde du först, och vad gjorde du därefter?
- reasoning: Vilket underlag vägde du in när du valde den vägen?
- effect: Vad blev resultatet, och hur vet du det?
- reflection: Vad lärde du dig, och vad skulle du göra annorlunda i dag?
- neutral_check: Jag vill kontrollera att jag förstått: menar du att …?
- correction: Är min sammanfattning korrekt, eller vill du ändra något?

### De åtta fasta frågorna, i fast ordning

#### Q1 (behavioural) — C1 (primär)

Berätta om en gång då du behövde prioritera mellan flera säkerhetsåtgärder med begränsade resurser, och där ditt val fick betydelse för verksamheten.

- Evidensdimensioner: Underlag om risk; Redovisad avvägning; Prioritet efter konsekvens; Öppet bortval; Resultat/reflektion
- Fördjupningsfrågor: reasoning: Vilket underlag hade du om riskerna? · reasoning: Vad valde du bort, och hur sa du det? · own_role: Vem beslutade till slut, och vad var din del? · effect: Vad hände med den risk som inte prioriterades? · reflection: Skulle du prioritera likadant i dag?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Prioriterar efter påtryckning eller synlighet; kan inte säga vilken risk en åtgärd minskar; bortval sägs inte.
  - 2 Grundläggande/ojämnt: Har ett underlag men avvägningen är begränsad eller implicit; bortvalet är otydligt eller sägs inte till berörda.
  - 3 Effektivt och säkert: Prioriterar efter skyddsvärde och konsekvens med redovisat underlag, säger öppet vad som inte prioriteras och följer upp den kvarstående risken.
  - 4 Mycket starkt/systematiskt: Ställer flera underlag mot varandra, gör avvägningen begriplig för dem som inte får resurser, bygger in omprövning och delar lärande.

#### Q2 (behavioural) — C2 (primär)

Berätta om en situation där det var oklart vem som fick besluta om en säkerhetsfråga, och hur du hanterade det.

- Evidensdimensioner: Mandatanalys; Klargörande; Dokumenterad beslutsväg; Ägarskap; Uppföljning
- Fördjupningsfrågor: reasoning: Hur tog du reda på var mandatet faktiskt låg? · exact_action: Vad klargjorde du, och för vem? · exact_action: Hur dokumenterades beslutsvägen efteråt? · own_role: Vad tog du själv ansvar för? · effect: Uppstod samma oklarhet igen?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Beslutar utanför mandat eller låter frågan ligga; oklarheten består.
  - 2 Grundläggande/ojämnt: Löser den enskilda frågan men klargör inte mandatet framåt; dokumentation eller uppföljning saknas.
  - 3 Effektivt och säkert: Tar reda på var mandatet ligger, klargör det för berörda, dokumenterar beslutsvägen och tar ansvar för sin del.
  - 4 Mycket starkt/systematiskt: Designar mandat och beslutsvägar så att oklarheten inte uppstår igen, förankrar dem och följer upp att de används.

#### Q3 (behavioural) — C3 (primär)

Berätta om en incident eller kris där du ledde hanteringen. Vad var läget, vad beslutade du, och hur avslutades den?

- Evidensdimensioner: Lägesbild: bekräftat/antaget; Beslutspunkter; Samordning av resurser; Kontrollerad återgång; Genomgång/lärande
- Fördjupningsfrågor: reasoning: Vad visste du säkert, och vad antog du? · exact_action: Vilka beslutspunkter satte du, och när? · own_role: Vem samordnade du med, och vem beslutade vad? · exact_action: Hur gick återgången till normalläge till? · reflection: Vad kom fram i genomgången efteråt?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Agerar på antagande, saknar lägesbild eller beslutspunkter; springer själv i stället för att leda; ingen genomgång.
  - 2 Grundläggande/ojämnt: Leder hanteringen men skiljer inte bekräftat från antaget, samordningen är otydlig eller återgången oplanerad.
  - 3 Effektivt och säkert: Skapar en lägesbild, sätter beslutspunkter, samordnar resurser, återgår kontrollerat och håller en genomgång.
  - 4 Mycket starkt/systematiskt: Håller lägesbilden levande, definierar eskaleringströsklar i förväg, avlastar sig själv medvetet och omsätter genomgången i ändrade rutiner.

#### Q4 (behavioural) — C4 (primär)

Berätta om en gång då du behövde få verksamheten, en annan funktion, en myndighet eller en leverantör att göra sin del av säkerhetsarbetet.

- Evidensdimensioner: Behovsbild; Rollklarhet; Informationsdelning; Gemensam lösning; Behållet ansvar/resultat
- Fördjupningsfrågor: reasoning: Vad behövde den andra parten, som du förstod det? · exact_action: Hur klargjorde du vem som skulle göra vad? · exact_action: Vilken information delade du, och när? · own_role: Vad behöll du ansvaret för själv? · effect: Gjorde de sin del, och hur vet du det?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Agerar ensam eller lämnar ifrån sig ansvaret; pekar på andra; ingen gemensam lösning.
  - 2 Grundläggande/ojämnt: Får till samverkan i sak men rollklarhet, informationsdelning eller uppföljning är begränsad.
  - 3 Effektivt och säkert: Klargör vem som gör vad, delar det andra behöver, löser problemet gemensamt och behåller ansvaret för resultatet.
  - 4 Mycket starkt/systematiskt: Bygger samverkan som håller efter händelsen: avtal, kontaktvägar och gemensamma rutiner, med bevarad relation och styrning.

#### Q5 (behavioural) — C5 (primär)

Berätta om en gång då du upptäckte att ett krav, en rutin eller ett beslut inte efterlevdes, och vad du gjorde med det.

- Evidensdimensioner: Upptäckt; Saklig rapportering; Motstånd mot påverkan; Åtgärd; Förändrad rutin
- Fördjupningsfrågor: exact_action: Hur upptäckte du att det inte efterlevdes? · exact_action: Hur och till vem rapporterade du det? · reasoning: Fanns det något tryck att tona ner det? Hur hanterade du det? · exact_action: Vad ändrades i rutinen eller uppföljningen? · effect: Har det hänt igen?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Accepterar, döljer eller tonar ner en avvikelse; rapporterar selektivt; ingen ändring.
  - 2 Grundläggande/ojämnt: Rapporterar avvikelsen men sent, ofullständigt eller utan åtgärd; hanterar påtryckning osäkert.
  - 3 Effektivt och säkert: Upptäcker, rapporterar sakligt och i tid, står emot påtryckning, åtgärdar och ändrar rutinen.
  - 4 Mycket starkt/systematiskt: Rapporterar egna brister i samma form som andras, bygger uppföljning som upptäcker avvikelser tidigt och gör det tryggt för andra att rapportera.

#### Q6 (behavioural) — C6 (primär)

Berätta om en medarbetare eller ett team vars arbetssätt du behövde förändra. Hur gick du till väga, och vad blev resultatet?

- Evidensdimensioner: Tydliga förväntningar; Lyssnande; Återkoppling på handling; Likvärdig behandling; Resultat/uppföljning
- Fördjupningsfrågor: reasoning: Vad hade du sagt om förväntningarna innan? · exact_action: Hur lyssnade du in deras bild av situationen? · exact_action: Hur gav du återkoppling, och på vad? · reasoning: Hur såg du till att alla behandlades likvärdigt? · effect: Vad blev resultatet, och hur följde du upp det?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Bedömer utan att ha sagt vad som gäller, lyssnar inte, behandlar personer olika eller ger återkoppling på person snarare än handling.
  - 2 Grundläggande/ojämnt: Genomför förändringen men förväntningar, lyssnande eller uppföljning är begränsade; resultatet beror delvis på andra.
  - 3 Effektivt och säkert: Säger vad som förväntas, lyssnar in teamets bild, ger återkoppling på handling, behandlar likvärdigt och följer upp resultatet.
  - 4 Mycket starkt/systematiskt: Gör teamet delaktigt i lösningen, mäter förändringen, justerar sitt eget arbetssätt utifrån återkoppling och beskriver utfallet nyanserat.

#### Q7 (situational) — C1 (primär), C2, C4

Ledningen ska besluta om nästa års säkerhetsbudget om två veckor. Du har en extern granskning med många fynd, en egen incidenthistorik som pekar åt ett annat håll, och tre chefer som var och en vill ha åtgärder i sitt område. Hur tar du fram ditt förslag?

- Evidensdimensioner: Underlagssyntes; Riskprioritering; Öppet bortval; Förankring; Dokumenterat förslag
- Fördjupningsfrågor: reasoning: Hur väger du granskningen mot er egen incidenthistorik? · reasoning: Vad prioriterar du ner, och hur säger du det till de tre cheferna? · exact_action: Hur förankrar du förslaget innan mötet? · exact_action: Vad står i ditt förslag om den risk som inte får pengar? · own_role: Vad beslutar du själv, och vad lämnar du till ledningen?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Följer ett underlag eller en chef rakt av; kan inte säga vad som prioriteras ner eller varför.
  - 2 Grundläggande/ojämnt: Väger underlagen men förankring, öppet bortval eller dokumentation är begränsad.
  - 3 Effektivt och säkert: Ställer granskning mot egen historik, prioriterar efter konsekvens, säger öppet vad som inte får resurser, förankrar och dokumenterar förslaget.
  - 4 Mycket starkt/systematiskt: Gör avvägningen begriplig för alla tre cheferna, bygger in omprövning under året och skiljer eget beslut från ledningens.

#### Q8 (situational) — C3 (primär), C4, C5, C6

Klockan 07.15 ringer platschefen på er största anläggning: ett av lagren står öppet, larmet har inte gått, och en person från nattskiftet svarar inte i telefon. Beskriv hur du leder hanteringen under de första två timmarna.

- Evidensdimensioner: Omedelbar säkerhet för människor; Informationsinhämtning; Beslutspunkter/eskalering; Samordning; Lägesrapport
- Fördjupningsfrågor: reasoning: Vilka omedelbara risker identifierar du, i vilken ordning? · reasoning: Vilken information försöker du få innan du beslutar? · own_role: Vem gör vad under de första trettio minuterna? · exact_action: Vilka beslutspunkter sätter du, och vad utlöser eskalering? · exact_action: Vad rapporterar du till ledningen, och när?
- Ankare:
  - 0 Otillräcklig evidens: Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.
  - 1 Riskfyllt/otillräckligt: Antar det värsta eller det bästa utan att ta reda på; glömmer personen som inte svarar; ingen lägesrapport.
  - 2 Grundläggande/ojämnt: Prioriterar personen och lagret men beslutspunkter, samordning eller rapportering är ofullständig.
  - 3 Effektivt och säkert: Sätter människors säkerhet först, hämtar information, fördelar uppgifter, sätter beslutspunkter för eskalering och rapporterar läget i tid.
  - 4 Mycket starkt/systematiskt: Bygger en sammanhängande plan med reservvägar, fortlöpande lägesbild, definierade eskaleringströsklar och en planerad genomgång, utan att exponera sig själv eller andra i onödan.

### Verifieringsgränser

- **Erfarenhet av att leda säkerhetsarbete eller personal** (verified, candidate_declared, partial): Klargör faktisk roll, mandat och ansvar genom beteendeexempel; fråga inte om redan verifierad fakta. Efterföljande: Arbetsgivar- eller referenskontroll efter information och tillämpligt samtycke. Passport: Anställningsfakta i Passport är kandidatens att dela. En intervjuutsaga blir aldrig automatiskt verifierad Passport-evidens.
- **Uppdrag eller utbildning inom säkerhetsskydd** (verified, candidate_declared, no_evidence_yet): Fråga endast om det är ett dokumenterat jobbkrav; klargör vad uppdraget faktiskt innefattade. Efterföljande: Kontroll enligt arbetsgivarens lagliga process. Säkerhetsprövning är en separat process utanför intervjun. Passport: Passport kan visa verifierad utbildning om kandidaten delar den för ändamålet. Intervjun skriver aldrig till Passport.
- **Budget- och personalansvar** (candidate_declared, partial): Använd fråga 1 och 6; sök konkreta exempel på beslut och uppföljning. Efterföljande: Arbetsgivar- eller referenskontroll om rollen kräver det. Passport: Ingen Passport-koppling. Ansvarsomfattning är inte en verifierbar merit i Passport.
- **Relevant certifiering (till exempel inom säkerhetsledning)** (verified, candidate_declared): Bedöm endast dokumenterat jobbkrav; en certifiering bevisar inte arbetsprestation. Efterföljande: Godkänd kontroll mot utfärdaren. Passport: Verifierad certifiering i Passport visar att ett formellt krav är styrkt; den bevisar inte automatiskt kompetens i rollen.
- **Erfarenhet av samverkan med myndigheter** (candidate_declared, no_evidence_yet): Använd fråga 4 utan att kräva uppgifter som omfattas av sekretess. Efterföljande: Ingen verifiering av sekretessbelagda kontakter; bedöm endast jobbrelevant redogörelse. Passport: Ingen Passport-koppling.

### Förbjudna områden

- (capability) Ingen lögndetektor, trovärdighetsbedömning eller bedrägeriskattning.
- (capability) Ingen analys av ansikte, blick, röst, känsloläge eller stressnivå.
- (inference) Ingen personlighetstolkning, ledarstilstypning eller culture fit-modell.
- (inference) Ingen slutsats om skyddade egenskaper från språk, brytning, namn, bild eller beteende.
- (inference) Nervositet, tystnad, språkvariation, funktionsnedsättning eller begärd anpassning får aldrig sänka bedömningen.
- (capability) Ingen automatisk totalpoäng, viktning, rangordning eller anställningsrekommendation.
- (capability) AI får markera evidensgap men aldrig poängsätta, rangordna eller rekommendera anställning.
- (capability) AI får inte skriva om eller ersätta kärnfrågorna, och får inte generera följdfrågor utanför de godkända.
- (capability) Intervjuuppgifter överförs aldrig automatiskt till Security Passport.
- (probe_practice) Ledande följdfrågor är inte tillåtna, till exempel "Du eskalerade väl direkt till ledningen?".
- (probe_practice) Anklagande följdfrågor före klarlagda fakta är inte tillåtna, till exempel "Varför följde du inte upp det?".
- (probe_practice) Trovärdighetsbedömande kommentarer är inte tillåtna, till exempel "Det låter inte sant.".
- (topic) Skyddade eller irrelevanta personuppgifter utan tydlig koppling till arbetet får inte efterfrågas.
- (topic) Sekretessbelagda uppgifter från tidigare arbetsgivare eller myndighetskontakter får inte efterfrågas eller premieras.

## 5. Rapportavsnitt: intervjufrågor för de självrapporterade områdena

Evidensrapporten och intervjuförberedelsen läser kompetensvis; för självskattningar per facett. Åtta rollneutrala frågor lades till för de facetter testet beskriver och som saknade fråga. Observerade områden använder de befintliga kompetensfrågorna, varav några är formulerade för bevakningsarbete – en rollskiktad frågeuppsättning är en uppföljningspunkt, inte en del av detta förslag.

- **SCC-01 · motstand-mot-otillborlig-paverkan:** Du beskriver hur du står fast vid ett fynd under påtryckning. Berätta om en gång då någon över dig ville tona ner något du hade kommit fram till. _Följdfråga:_ Vad ändrade du i formuleringen, och vad ändrade du inte? _Lyssna efter:_ Motparten och påtryckningen är konkreta; Skillnaden mellan form och innehåll beskrivs; Utfallet sägs, även om fyndet till slut tonades ner
- **SCC-01 · transparens:** Du beskriver hur du rapporterar brister öppet. Berätta om det senaste du rapporterade uppåt som var obekvämt för dig själv. _Följdfråga:_ Hur lång tid gick det från att du visste till att du rapporterade? _Lyssna efter:_ Bristen låg i personens eget ansvarsområde; Tidsavståndet nämns och förklaras; Formen jämförs med hur andras brister rapporteras
- **SCC-06 · aktivt-lyssnande:** Du beskriver hur du lyssnar innan du beslutar. Berätta om en gång då det en medarbetare sa ändrade ett beslut du redan lutade åt. _Följdfråga:_ Hur märkte medarbetaren att det hade betydelse? _Lyssna efter:_ En verklig situation med en identifierbar person; Det ursprungliga beslutet och ändringen är båda konkreta; Personen beskriver sitt eget lyssnande, inte bara medarbetarens argument
- **SCC-06 · saklig-tydlighet:** Du beskriver hur du är tydlig med förväntningar. Berätta om en gång då någon i ditt team gjorde fel för att förväntningen inte hade sagts -- vad ändrade du? _Följdfråga:_ Hur ger du återkoppling när något går bra? _Lyssna efter:_ Skiljer på att förväntningen saknades och att personen felade; Ändringen efteråt är konkret; Återkoppling beskrivs även utan fel
- **SCC-08 · informationsdelning:** Du beskriver hur du för information vidare till andra funktioner. Berätta om en gång då säkerhetsinformation nådde en annan funktion för sent, eller inte alls. _Följdfråga:_ Vad avgjorde när du delade och när du väntade? _Lyssna efter:_ En verklig händelse med en identifierbar mottagare; Skälet till fördröjningen beskrivs utan bortförklaring; Vad som ändrades efteråt
- **SCC-09 · agarskap:** Du beskriver hur du tar ansvar för egna beslut. Berätta om ett beslut du fattade som visade sig vara fel -- vem sa det först, och vad gjorde du? _Följdfråga:_ Vad sa du till dem som hade gett dig underlaget? _Lyssna efter:_ Beslutet beskrivs som personens eget; Felet lyftes av personen själv, eller så framgår varför inte; Åtgärden efteråt beskrivs konkret
- **SCC-09 · sparbar-uppfoljning:** Du beskriver hur du följer upp det du delegerat. Berätta om en uppgift du delegerade nyligen -- när och hur följde du upp den? _Följdfråga:_ Vad hände om uppföljningen visade att uppgiften inte var klar? _Lyssna efter:_ Uppföljningen bestämdes när uppgiften gavs; Ett konkret datum eller tillfälle nämns; Utfallet av uppföljningen beskrivs, inte bara avsikten
- **SCC-11 · faktabaserad-bedomning:** Du beskriver hur du prioriterar utifrån underlag. Berätta om en åtgärd du prioriterade upp eller ner för att den egna incidenthistoriken sa något annat än du trodde. _Följdfråga:_ Vad hade du trott, och vad visade underlaget? _Lyssna efter:_ Underlaget nämns konkret; Skillnaden mellan antagande och underlag beskrivs; Beslutet ändrades faktiskt, eller så framgår varför inte

## 6. Granskningsstege

Uppgifter: fem grindar per uppgift (security_sme, cognitive_interview, language, accessibility, pilot), alla utestående. Guide: draft → expert_review → legal_review → cognitive_review → published, med granskning per grind i `scp_interview_pack_reviews` bunden till innehållshashen; en granskare får inte vara författaren. Aktivering är två separata, återkallbara ägarbeslut och görs inte av innehållsmigrationen.

