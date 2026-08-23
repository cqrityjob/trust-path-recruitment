# Flagship item diff — BEFORE → AFTER

Generated from `assessment-foundation-p0-before.json` (a clean replay of `origin/main` at `c224934`) and from the repaired database after `20260907093000_scp_flagship_answer_mechanics_repair.sql`.

The owner should be able to confirm one thing from this file above all others: **no scenario was rewritten**. Every "stem changed" row below reads NO. What changed is the option mechanics.

## Summary

| | Before | After |
|---|---|---|
| Items on the form | 50 | 56 |
| Scenario (SJT) items | 22 | 28 |
| Options per scenario item | 3 | 4 |
| Scoring levels | 3 / 1 / 0 | 3 / 2 / 1 / 0 |
| Scenario stems rewritten | — | **0 of 22 (0%)** |

The "no mass rewrite" rule set a stop-and-report threshold at 25% of stems substantively rewritten. The actual figure is 0%.

## Per-item diff

### `so-rj-a01` — SCC-11 / proportionalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Det är morgon och kö vid spärrarna. En person utan passerkort säger att hen ska till ett möte på plan 6, är sen, och visar ett mejl med möteskallelsen på telefonen. Enligt instruktionen ska besökare anmälas i receptionen och hämtas av den de ska träffa.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Registrera besöket och ring upp mötesvärden direkt så att hen kan komma ner — och säg till personen att det tar ett par minuter. | **preferred** |
| b | 2 | 1 | Släppa in personen eftersom möteskallelsen styrker ärendet, och notera det i loggen. | excessive_informal_trust |
| c | 3 | 0 | Be personen lämna entrén och boka om mötet, eftersom hen inte är anmäld. | poor_proportionality |

| key | pos | score | new option (sv) |
|---|---|---|---|
| a | 1 | 3 | Registrera besöket, ring mötesvärden direkt och säg till personen att det tar ett par minuter. **(preferred)** |
| d | 2 | 0 | Be personen lämna entrén och boka om mötet en annan dag, eftersom hen inte är anmäld i förväg.  _`poor_proportionality`_ |
| c | 3 | 1 | Släpp in personen eftersom möteskallelsen styrker ärendet, och notera tid och namn i besöksloggen.  _`excessive_informal_trust`_ |
| b | 4 | 2 | Hänvisa personen till receptionsdisken för anmälan och fortsätt bemanna spärren under rusningen.  _`weak_communication`_ |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 1
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a02` — SCC-07 / respektfullt-bemotande

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** En kund höjer rösten mot dig i entrén till ett köpcentrum. Hen är arg över att en butik nekat en retur och menar att du som väktare ska "göra något åt det". Ett par personer har stannat och tittar.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Lyssna klart, gå några steg åt sidan från kön och säg vad du kan hjälpa till med — och vad som är butikens beslut. | **preferred** |
| b | 2 | 1 | Förklara direkt att det inte är din sak och hänvisa till centrumledningen. | weak_communication |
| c | 3 | 0 | Säga att om personen inte sänker rösten får hen lämna centrumet. | premature_escalation |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Säg till personen att sänka rösten omedelbart, annars får hen lämna köpcentrumet på en gång.  _`premature_escalation`_ |
| b | 2 | 3 | Lyssna färdigt, gå några steg åt sidan från kön och säg vad du kan göra och vad som är butikens beslut. **(preferred)** |
| c | 3 | 1 | Gå in i butiken och be personalen göra ett undantag den här gången så att det löser sig.  _`outside_mandate`_ |
| a | 4 | 2 | Följ med personen till centrumledningens kontor och lämna över ärendet till den som kan besluta.  _`weak_communication`_ |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a03` — SCC-04 / prioritering

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Du är ensam väktare på ett industriområde. Samtidigt får du två saker: ett dörrlarm på ett kallförråd i utkanten, och ett samtal från en anställd som säger att en person hen inte känner igen står inne i personalutrymmet vid omklädningsrummen.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Åk till personalutrymmet först, be den anställde stanna kvar på telefon, och meddela larmcentralen att dörrlarmet inte är kontrollerat än. | **preferred** |
| b | 2 | 1 | Åk till dörrlarmet först eftersom det är ett bekräftat larm, och ta personalutrymmet direkt efteråt. | tunnel_vision |
| c | 3 | 0 | Be den anställde fråga personen vad hen gör där, medan du åker till dörrlarmet. | delayed_escalation |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Be den anställde fråga personen vad hen gör där, medan du själv åker vidare till dörrlarmet.  _`delayed_escalation`_ |
| b | 2 | 1 | Åk till dörrlarmet först eftersom det är ett bekräftat larm, och ta personalutrymmet direkt efteråt när du är klar där.  _`tunnel_vision`_ |
| c | 3 | 3 | Åk till personalutrymmet först, be den anställde stanna på telefon och meddela larmcentralen om larmet. **(preferred)** |
| a | 4 | 2 | Ring larmcentralen och be om en andra enhet till dörrlarmet medan du själv åker till personalutrymmet.  _`insufficient_information`_ |

- **Preferred key:** `a` → `c`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a04` — SCC-03 / avvikelseigenkanning

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** På en logistikterminal ser du en person i arbetskläder utan synlig ID-bricka gå längs lastkajen och fotografera portnummer och lastluckor med sin telefon. Terminalen har entreprenörer på plats den här veckan.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Gå fram, presentera dig och fråga vad fotograferingen gäller och vem hen arbetar för — och stäm av med terminalansvarig. | **preferred** |
| b | 2 | 1 | Notera tid, signalement och vad personen gör, och fortsätt ronden. | insufficient_information |
| c | 3 | 0 | Larma polis om misstänkt rekognosering inför inbrott. | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 0 | Larma polis om misstänkt rekognosering inför ett inbrott, och håll personen under uppsikt tills de kommer.  _`unsupported_assumption`_ |
| b | 2 | 1 | Notera tid, signalement och vad personen gör i loggen, och fortsätt ronden som planerat.  _`insufficient_information`_ |
| a | 3 | 2 | Ring terminalansvarig och fråga om entreprenörslistan för veckan innan du går fram och talar med personen på kajen.  _`delayed_escalation`_ |
| d | 4 | 3 | Presentera dig och fråga vad fotograferingen gäller och vem hen arbetar för — och stäm av med terminalansvarig. **(preferred)** |

- **Preferred key:** `a` → `d`
- **Preferred position:** 1 → 4
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a05` — SCC-09 / agarskap

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Du går nattpass med en mer erfaren kollega. På tredje ronden märker du att hen kvitterar kontrollpunkter i systemet utan att gå till två av dem. Kollegan säger att "de punkterna är alltid låsta, det är slöseri med tid".

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Säg till kollegan att du går punkterna, gör det, och ta upp med arbetsledaren att kvitteringen inte stämmer med vad som gjorts. | **preferred** |
| b | 2 | 1 | Gå punkterna själv och låt saken bero eftersom du inte är kollegans chef. | failure_to_document |
| c | 3 | 0 | Kvittera punkterna i eget namn så att loggen i alla fall blir rätt. | outside_mandate |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Kvittera de två punkterna i eget namn så att loggen i alla fall stämmer med verkligheten.  _`outside_mandate`_ |
| a | 2 | 3 | Säg till kollegan att du går punkterna, gör det, och ta upp med arbetsledaren att loggen inte stämmer. **(preferred)** |
| c | 3 | 1 | Gå punkterna själv och låt saken bero den här natten, eftersom du inte är kollegans arbetsledare.  _`failure_to_document`_ |
| b | 4 | 2 | Gå punkterna själv och be kollegan sluta kvittera det ni inte gjort, utan att ta det vidare den här gången.  _`delayed_escalation`_ |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a06` — SCC-01 / regel-och-syfteslojalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Uppdragsgivarens platschef ber dig ta bort en notering ur incidentloggen. Noteringen gäller att en dörr till serverrummet stått uppställd i två timmar. Platschefen säger att det redan är åtgärdat, att noteringen "bara skapar problem i revisionen" och att hen tar ansvar för beslutet.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Säg att loggen inte kan ändras i efterhand, erbjud att platschefen får lägga till sin egen kommentar om åtgärden, och rapportera begäran till din arbetsledare. | **preferred** |
| b | 2 | 1 | Säg nej till platschefen och lämna det därhän eftersom du ändå inte tänker göra det. | delayed_escalation |
| c | 3 | 0 | Ta bort noteringen eftersom platschefen är ansvarig på plats och säger sig ta ansvaret. | excessive_informal_trust |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Ta bort noteringen eftersom platschefen är ansvarig på plats, säger att felet redan är åtgärdat och tar ansvaret.  _`excessive_informal_trust`_ |
| c | 2 | 1 | Säg nej till platschefen och lämna det därhän, eftersom du ändå inte tänker göra det hen ber om.  _`failure_to_document`_ |
| b | 3 | 3 | Säg att loggen inte kan ändras i efterhand, erbjud platschefen att lägga till en egen kommentar, och rapportera begäran. **(preferred)** |
| a | 4 | 2 | Säg nej och föreslå att platschefen själv tar upp noteringen med din arbetsledare om den skapar problem.  _`delayed_escalation`_ |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a07` — SCC-03 / aktiv-scanning

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Du åker på ett inbrottslarm i en fastighet med flera hyresgäster. Larmcentralen kan bara säga att en sektion har löst ut, inte vilken. När du kommer fram står ytterdörren olåst men stängd, och belysningen i trapphuset är släckt trots att den ska vara på nattetid.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Gå ett varv runt fastigheten och kontrollera fönster och baksida, meddela larmcentralen vad du ser och begär vilken sektion det gäller innan du går in. | **preferred** |
| b | 2 | 1 | Gå in genom ytterdörren och kontrollera trapphuset våning för våning. | insufficient_information |
| c | 3 | 0 | Utgå från att det är ett tekniskt fel eftersom dörren är stängd, och avsluta med en notering. | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Utgå från att det är ett tekniskt fel eftersom dörren är stängd och inget syns, och avsluta ärendet med en notering i loggen.  _`unsupported_assumption`_ |
| b | 2 | 1 | Gå in genom ytterdörren och kontrollera trapphuset våning för våning med ficklampa tills du hittar sektionen.  _`tunnel_vision`_ |
| a | 3 | 2 | Begär sektionsuppgift av larmcentralen och vänta vid ytterdörren tills du har fått den innan du går in.  _`insufficient_information`_ |
| c | 4 | 3 | Gå ett varv runt fastigheten, meddela larmcentralen vad du ser och begär vilken sektion det gäller innan du går in. **(preferred)** |

- **Preferred key:** `a` → `c`
- **Preferred position:** 1 → 4
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a08` — SCC-04 / prioritering

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Under en rond i en lagerbyggnad hör du ett brak och hittar en person som ligger på golvet vid en pallställning. Personen är vaken, svarar på tilltal men säger att hen inte kan stödja på ena benet. En pall ligger tippad intill.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Stanna hos personen, larma ambulans, se till att ingen annan går in i området och lämna pallen där den ligger tills olyckan är dokumenterad. | **preferred** |
| b | 2 | 1 | Hjälpa personen upp och till ett kontor där hen kan sitta ner medan du ringer. | poor_proportionality |
| c | 3 | 0 | Leta upp närmaste arbetsledare så att företaget själv får avgöra om ambulans behövs. | delayed_escalation |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 3 | Stanna hos personen, larma ambulans, håll andra borta från området och lämna pallen där den ligger. **(preferred)** |
| c | 2 | 0 | Leta upp närmaste arbetsledare så att företaget själv får avgöra om ambulans behöver larmas.  _`delayed_escalation`_ |
| b | 3 | 1 | Hjälp personen upp och in till ett kontor där hen kan sitta ner medan du ringer efter hjälp.  _`poor_proportionality`_ |
| a | 4 | 2 | Stanna hos personen och larma ambulans, och flytta undan pallen så att bårvägen in blir fri.  _`failure_to_document`_ |

- **Preferred key:** `a` → `d`
- **Preferred position:** 1 → 1
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a09` — SCC-06 / dokumentation

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Du har avvisat en person från en butiksentré efter att butikspersonal påkallat din hjälp. Personen gick frivilligt men var upprörd och sa att hen skulle anmäla dig. Du ska nu skriva händelserapporten.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Tidpunkt, vad butikspersonalen sa, vad du sa och gjorde i tur och ordning, vilka som var närvarande, och att personen sa att hen skulle anmäla dig. | **preferred** |
| b | 2 | 1 | Att en person avvisats från entrén på begäran av butikspersonal, med tidpunkt. | insufficient_information |
| c | 3 | 0 | Att personen uppträdde hotfullt och sannolikt var påverkad, samt att avvisningen därför var befogad. | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Att personen uppträdde hotfullt och sannolikt var påverkad, och att avvisningen därför var befogad.  _`unsupported_assumption`_ |
| c | 2 | 1 | Att en person avvisats från entrén på begäran av butikspersonalen, med tidpunkt och plats angivna.  _`failure_to_document`_ |
| a | 3 | 3 | Tid, vad personalen sa, vad du sa och gjorde i ordning, vilka som var där, och personens invändning. **(preferred)** |
| b | 4 | 2 | Tidpunkt och plats, vad butikspersonalen begärde, och vad du gjorde i tur och ordning fram till att personen lämnade entrén.  _`insufficient_information`_ |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a10` — SCC-08 / informationsdelning

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Ditt pass går mot slut. Under natten har du: hittat en olåst grind mot lastgården som du låst, noterat att en rörelsedetektor i garaget löst ut tre gånger utan att du sett något, och tagit emot ett meddelande om att en entreprenör kommer klockan sju för att arbeta på taket.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Alla tre, och särskilt att detektorn i garaget behöver hållas under uppsikt och att entreprenören ska tas emot klockan sju. | **preferred** |
| b | 2 | 1 | Grinden, eftersom det var den enda konkreta avvikelsen — de andra två är noterade i systemet. | insufficient_information |
| c | 3 | 0 | Inget särskilt — allt finns i loggen och nästa pass läser den vid start. | failure_to_document |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Inget särskilt — allt finns i loggen och nästa pass läser den när de börjar sitt eget pass.  _`failure_to_document`_ |
| c | 2 | 1 | Grinden, eftersom det var den enda konkreta avvikelsen — de andra två är noterade i systemet.  _`tunnel_vision`_ |
| a | 3 | 2 | Grinden och entreprenören, eftersom det är de två sakerna som faktiskt kräver något av nästa pass rent praktiskt.  _`insufficient_information`_ |
| b | 4 | 3 | Alla tre, särskilt att detektorn behöver uppsikt och att entreprenören ska tas emot sju. **(preferred)** |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 4
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-a11` — SCC-07 / losningsorientering  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-07 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** En person kommer in i receptionen och är tydligt upprörd. Hen säger att hen måste få tag på en anhörig som arbetar i huset, att det gäller något hemma, och att det är bråttom. Personen har ingen legitimation med sig och vill inte säga mer om vad som hänt.

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Släpp in personen och visa vägen till avdelningen, eftersom det uppenbarligen är en nödsituation.  _`excessive_informal_trust`_ |
| b | 2 | 1 | Förklara att du inte får lämna ut uppgifter om anställda, och be personen ringa den anhöriga själv.  _`insufficient_information`_ |
| a | 3 | 2 | Be personen vänta i receptionen medan du kontaktar den anhöriga och ser om hen vill komma ner.  _`weak_communication`_ |
| c | 4 | 3 | Be om namnet på den anhöriga, ring upp hen internt och låt de två tala med varandra i receptionen. **(preferred)** |

- **Preferred key:** — → `c`
- **Preferred position:** — → 4
- **Scores:** — → 3/2/1/0

### `so-rj-a12` — SCC-07 / granshallning  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-07 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** En anställd blir stoppad vid en inre spärr eftersom kortet inte öppnar. Hen säger att hen har gått genom den dörren i tre år, att det måste vara ett systemfel, och frågar irriterat om du tänker hindra hen från att göra sitt jobb.

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 3 | Säg att kortet inte öppnar just nu, att du inte kan gå förbi det, och ring den som kan reda ut behörigheten. **(preferred)** |
| c | 2 | 0 | Öppna dörren manuellt den här gången och be den anställde höra av sig till supporten om kortet under dagen.  _`excessive_informal_trust`_ |
| b | 3 | 1 | Förklara att du bara följer instruktionen och att du inte kan göra något åt saken just nu.  _`weak_communication`_ |
| a | 4 | 2 | Säg att kortet inte öppnar och be den anställde själv kontakta sin chef för att få behörigheten kontrollerad.  _`delayed_escalation`_ |

- **Preferred key:** — → `d`
- **Preferred position:** — → 1
- **Scores:** — → 3/2/1/0

### `so-rj-a13` — SCC-07 / likvardighet  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-07 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** Vid ett evenemang gäller att väskor större än A4 ska lämnas i garderoben. En besökare i kön har en större väska och säger att hen släpptes in med samma väska förra veckan. Kön bakom har hört samtalet och några börjar kommentera.

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Släpp in besökaren med väskan för att lösa situationen, och tillämpa regeln fullt ut på resten av kön.  _`poor_proportionality`_ |
| c | 2 | 1 | Be besökaren stiga åt sidan och vänta medan du kontrollerar med arrangören vad som gäller i kväll.  _`delayed_escalation`_ |
| a | 3 | 3 | Säg att regeln gäller alla i kväll, visa var garderoben är, och håll samma besked mot alla i kön efter. **(preferred)** |
| b | 4 | 2 | Säg att regeln gäller i kväll och hänvisa till garderoben, utan att gå in på vad som gällde förra veckan.  _`weak_communication`_ |

- **Preferred key:** — → `a`
- **Preferred position:** — → 3
- **Scores:** — → 3/2/1/0

### `so-rj-a14` — SCC-04 / prioritering  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-04 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** Kvart före stängning får du två saker samtidigt: butikspersonal i ett kassaområde ber om hjälp med en kund som vägrar lämna butiken, och en larmknapp i lastintaget på baksidan har utlöst utan att någon svarar på radio.

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Be butikspersonalen ringa polis om kunden själva, och kontrollera lastintaget när butikerna har stängt för dagen.  _`delayed_escalation`_ |
| c | 2 | 1 | Gå till butiken först eftersom där finns människor som väntar, och ta lastintaget så snart det är löst.  _`tunnel_vision`_ |
| a | 3 | 2 | Åk till lastintaget först och be butikspersonalen ringa dig igen om kunden fortfarande är kvar.  _`insufficient_information`_ |
| b | 4 | 3 | Åk till lastintaget först, be butiken hålla avstånd och återkomma, och meddela larmcentralen båda. **(preferred)** |

- **Preferred key:** — → `b`
- **Preferred position:** — → 4
- **Scores:** — → 3/2/1/0

### `so-rj-a15` — SCC-04 / beslutsbalans  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-04 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** Klockan 02 känner du svag brandlukt i ett trapphus, men brandlarmet har inte löst ut och du hittar ingen källa. Lukten finns i två plan men inte i de andra. Fastighetsjouren svarar inte. Om du larmar räddningstjänsten kan det bli ett kostsamt onödigt utryck.

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 3 | Larma räddningstjänsten, beskriv exakt vad du känner och var, och fortsätt söka källan medan du väntar. **(preferred)** |
| d | 2 | 0 | Notera lukten i loggen och kontrollera trapphuset igen på nästa rond, eftersom brandlarmet inte har löst ut.  _`unsupported_assumption`_ |
| b | 3 | 1 | Fortsätt ringa fastighetsjouren tills du får svar, så att beslutet fattas av den som ansvarar för fastigheten.  _`insufficient_information`_ |
| a | 4 | 2 | Sök av de två planen systematiskt i tio minuter till, och larma räddningstjänsten om du inte hittar källan.  _`delayed_escalation`_ |

- **Preferred key:** — → `c`
- **Preferred position:** — → 1
- **Scores:** — → 3/2/1/0

### `so-rj-a16` — SCC-04 / eskalering  **(NEW ITEM)**

- **Stem changed?** n/a — new item
- **Reason for change:** New coverage item. SCC-04 carried only two observed items, which caps the competency at a maturity level one weak answer can collapse.

**Scenario:** Ett strömavbrott slår ut belysning och passersystem i halva anläggningen. Dörrarna i den delen står nu olåsta. Drifttekniker arbetar med felet och säger att det tar minst en timme. Kvällsskiftet med ett tjugotal anställda är kvar i den andra halvan.

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 0 | Gå extra ronder i den mörka delen under timmen och notera i loggen att passersystemet varit ur funktion.  _`delayed_escalation`_ |
| d | 2 | 3 | Meddela larmcentralen att passerkontrollen är ur funktion, och bemanna den olåsta delens ingång. **(preferred)** |
| b | 3 | 1 | Följ drifttekniker till felet och hjälp till med belysning, eftersom strömmen är orsaken till alltihop.  _`tunnel_vision`_ |
| a | 4 | 2 | Bemanna ingången till den olåsta delen och stanna där tills strömmen och passersystemet är tillbaka.  _`insufficient_information`_ |

- **Preferred key:** — → `d`
- **Preferred position:** — → 2
- **Scores:** — → 3/2/1/0

### `so-rj-b01` — SCC-06 / dokumentation

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Fyra formuleringar om samma person i en entré. Alla fyra är skrivna av väktare.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | "Man, uppskattningsvis 30–40 år, mörk jacka, stod kvar vid dörren i ungefär tre minuter och försökte öppna den två gånger." | **preferred** |
| b | 2 | 1 | "En nervös man i mörk jacka höll till vid dörren en längre stund." | unsupported_assumption |
| c | 3 | 0 | "Mannen såg misstänkt ut och hade sannolikt för avsikt att ta sig in obehörigt." | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 3 | "Man, cirka 30–40 år, mörk jacka, stod vid dörren i tre minuter och drog i den två gånger." **(preferred)** |
| d | 2 | 0 | "Mannen såg misstänkt ut och hade sannolikt för avsikt att ta sig in obehörigt i fastigheten."  _`unsupported_assumption`_ |
| b | 3 | 1 | "En nervös man i mörk jacka höll till vid dörren under en längre stund innan han försvann."  _`unsupported_assumption`_ |
| a | 4 | 2 | "Man i mörk jacka stod kvar vid dörren en längre stund och verkade vilja komma in, men gick sedan mot parkeringen."  _`insufficient_information`_ |

- **Preferred key:** `a` → `c`
- **Preferred position:** 1 → 1
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-b02` — SCC-06 / dokumentation

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Tre rapporter om samma händelse: en vattenläcka upptäckt i ett teknikutrymme klockan 02.40 under nattrond.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | "02.40, teknikutrymme plan −1. Vatten på golvet cirka 2×3 meter, rinner från rörgenomföring i tak. Huvudkran ej åtkomlig. Jour kontaktad 02.48, på plats 03.20. Golvbrunn fri. Ingen elutrustning i vattnet." | **preferred** |
| b | 2 | 1 | "Vattenläcka i teknikutrymmet upptäcktes under nattronden. Jouren är kontaktad." | insufficient_information |
| c | 3 | 0 | "Läckan beror med största sannolikhet på det slarviga rörarbetet i förra veckan. Fastighetsägaren bör hålla entreprenören ansvarig." | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 0 | "Läckan beror med största sannolikhet på förra veckans rörarbete. Entreprenören bör hållas ansvarig."  _`unsupported_assumption`_ |
| d | 2 | 3 | "02.40, teknikutrymme −1. Vatten 2×3 m från genomföring i tak. Jour kontaktad 02.48, på plats 03.20." **(preferred)** |
| b | 3 | 1 | "Vattenläcka i teknikutrymmet upptäcktes under nattronden. Jouren är kontaktad enligt instruktionen."  _`failure_to_document`_ |
| a | 4 | 2 | "02.40, teknikutrymme plan −1. Vatten på golvet, kommer från taket. Jouren är kontaktad och är på väg till platsen."  _`insufficient_information`_ |

- **Preferred key:** `a` → `d`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-b03` — SCC-03 / aktiv-scanning

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** En kollega ringer och säger: "Det är någon som har varit i cykelrummet, det ser rörigt ut därinne. Jag åker vidare till nästa objekt nu."

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | När hen var där, vad hen faktiskt såg, och om dörren var låst eller uppbruten. | **preferred** |
| b | 2 | 1 | Om hen har skrivit en notering i systemet om det. | insufficient_information |
| c | 3 | 0 | Hur många cyklar som saknas. | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Hur många cyklar som saknas i rummet, så att omfattningen på stölden går att bedöma direkt.  _`unsupported_assumption`_ |
| c | 2 | 1 | Om hen har skrivit en notering om det i systemet, så att händelsen finns dokumenterad någonstans.  _`delayed_escalation`_ |
| b | 3 | 2 | Om dörren var låst eller uppbruten, så att du vet om det behöver åtgärdas innan objektet lämnas.  _`insufficient_information`_ |
| a | 4 | 3 | När hen var där, vad hen faktiskt såg i rummet, och om dörren var låst eller uppbruten när hen kom. **(preferred)** |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 4
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-b04` — SCC-06 / eskalering-och-overlamning

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Klockan 03.15 måste du väcka uppdragsgivarens jourhavande. En kylanläggning i en livsmedelslokal har larmat och temperaturen stiger. Du har tio sekunder innan personen är riktigt vaken.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Vem du är, vilket objekt det gäller, att kylan larmat och temperaturen stiger, och vad du behöver att hen gör. | **preferred** |
| b | 2 | 1 | Att det gått ett larm på kylanläggningen och att du ringer enligt instruktionen. | insufficient_information |
| c | 3 | 0 | En redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden. | weak_communication |

| key | pos | score | new option (sv) |
|---|---|---|---|
| b | 1 | 3 | Vem du är, vilket objekt, att kylan larmat och temperaturen stiger, och vad du behöver att hen gör. **(preferred)** |
| d | 2 | 0 | En redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden från början.  _`weak_communication`_ |
| c | 3 | 1 | Att det gått ett larm på kylanläggningen och att du ringer i enlighet med den larminstruktion som gäller för objektet.  _`insufficient_information`_ |
| a | 4 | 2 | Vem du är, vilket objekt det gäller, och att kylanläggningen larmat och att temperaturen stiger just nu.  _`weak_communication`_ |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 1
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-b05` — SCC-09 / fel-och-avvikelseansvar

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** I slutet av passet upptäcker du att en brandcellsdörr stått uppställd med en brandsläckare hela kvällen. Du tar bort släckaren och dörren stängs. Ingen har varit i utrymmet och inget har hänt.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Notera avvikelsen med tid och plats även om inget hände, så att det syns om det upprepas. | **preferred** |
| b | 2 | 1 | Ta bort släckaren och gå hem — problemet är löst. | failure_to_document |
| c | 3 | 0 | Nämna det muntligt till nästa pass om du råkar träffa dem. | delayed_escalation |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Nämna det muntligt till nästa pass om du råkar träffa dem innan du lämnar objektet.  _`delayed_escalation`_ |
| c | 2 | 3 | Notera avvikelsen med tid och plats även om inget hände, så att det syns om samma sak upprepas. **(preferred)** |
| b | 3 | 1 | Ta bort brandsläckaren, kontrollera att dörren går igen, och gå hem — problemet är därmed löst.  _`failure_to_document`_ |
| a | 4 | 2 | Notera att dörren stått uppställd, utan tid och plats, eftersom ingen skada skedde den här gången.  _`insufficient_information`_ |

- **Preferred key:** `a` → `c`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-b06` — SCC-06 / dokumentation

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Du ska skriva en redogörelse som kan komma att läsas av polis och av uppdragsgivarens försäkringsbolag.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Kronologiskt med klockslag: vad som hände, vad du såg, vad du gjorde — och eventuella egna bedömningar tydligt markerade separat. | **preferred** |
| b | 2 | 1 | Med din slutsats först, så att läsaren vet vad det handlar om, och underlaget efter. | weak_communication |
| c | 3 | 0 | Med det som är relevant för händelsen, och utan detaljer som bara skapar oklarhet. | unsupported_assumption |

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 0 | Med det som är relevant för händelsen, utan detaljer som bara skapar oklarhet för en utomstående.  _`unsupported_assumption`_ |
| b | 2 | 1 | Med din egen slutsats först, så att läsaren vet vad det handlar om, och underlaget därefter.  _`weak_communication`_ |
| d | 3 | 3 | Kronologiskt med klockslag: vad som hände, vad du såg, vad du gjorde — egna bedömningar för sig. **(preferred)** |
| a | 4 | 2 | Kronologiskt med klockslag, med iakttagelser och åtgärder blandade så att förloppet blir lätt att följa.  _`insufficient_information`_ |

- **Preferred key:** `a` → `d`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d01` — SCC-01 / regel-och-syfteslojalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** På ett datacenter ska besökslistan stämmas av mot faktiska besök vid varje passbyte. Din kollega, som arbetat där i sex år, gör avstämningen en gång i veckan i stället och säger att det aldrig har blivit fel på sex år.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Gör avstämningen vid varje passbyte själv, säg till kollegan att du gör det, och ta upp med arbetsledaren att rutinen tillämpas olika. | **preferred** |
| b | 2 | 1 | Följa kollegans arbetssätt eftersom hen känner objektet och det uppenbarligen fungerar. | excessive_informal_trust |
| c | 3 | 0 | Göra rätt själv och inte säga något, eftersom kollegan är mer erfaren än du. | delayed_escalation |

| key | pos | score | new option (sv) |
|---|---|---|---|
| a | 1 | 3 | Gör avstämningen vid varje passbyte, säg det till kollegan, och ta upp rutinen med arbetsledaren. **(preferred)** |
| d | 2 | 0 | Följ kollegans arbetssätt, eftersom hen känner objektet väl och rutinen uppenbarligen har fungerat i sex år utan fel.  _`excessive_informal_trust`_ |
| c | 3 | 1 | Gör avstämningen rätt själv utan att säga något, eftersom kollegan är betydligt mer erfaren än du.  _`delayed_escalation`_ |
| b | 4 | 2 | Gör avstämningen vid varje passbyte och kom överens med kollegan om att ni båda gör den från och med nu.  _`delayed_escalation`_ |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 1
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d02` — SCC-01 / regel-och-syfteslojalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Klockan 22 kommer en anställd du känner igen väl — hen jobbar sent varje vecka och brukar prata med dig. Hen har glömt sitt passerkort och ber dig låsa upp till en avdelning där hen inte normalt har behörighet, för att hämta en pärm åt en kollega.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Säg nej till den avdelningen, förklara att din behörighet inte omfattar den, och erbjud att kontakta den som kan ge tillstånd. | **preferred** |
| b | 2 | 1 | Följa med personen in och stå kvar medan hen hämtar pärmen, och notera det i loggen. | outside_mandate |
| c | 3 | 0 | Låsa upp, eftersom du känner igen personen och ärendet är rimligt. | excessive_informal_trust |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Lås upp avdelningen, eftersom du känner igen personen väl och ärendet i sig verkar helt rimligt.  _`excessive_informal_trust`_ |
| b | 2 | 3 | Säg nej, förklara att din behörighet inte täcker avdelningen, och erbjud att ringa någon som kan. **(preferred)** |
| c | 3 | 1 | Följ med personen in på avdelningen och stå kvar hela tiden medan hen hämtar pärmen, och notera besöket i loggen efteråt.  _`outside_mandate`_ |
| a | 4 | 2 | Säg nej och be personen återkomma i morgon när den som ansvarar för avdelningen är på plats igen.  _`weak_communication`_ |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d03` — SCC-09 / fel-och-avvikelseansvar

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** När du kommit hem inser du att du glömde låsa en dörr till ett förråd vid sista ronden. Passet är slut, nästa väktare är på plats, och ingen har sagt något.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missat den. | **preferred** |
| b | 2 | 1 | Ta upp det när du kommer på jobbet nästa gång, så att det blir sagt. | delayed_escalation |
| c | 3 | 0 | Anta att nästa väktares rond fångar upp det, eftersom förrådet ingår i ronden. | failure_to_document |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Anta att nästa väktares rond fångar upp dörren, eftersom förrådet ändå ingår i den ordinarie ronden.  _`failure_to_document`_ |
| b | 2 | 1 | Ta upp det när du kommer till jobbet nästa gång, så att det i alla fall blir sagt till någon.  _`delayed_escalation`_ |
| c | 3 | 3 | Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missade den. **(preferred)** |
| a | 4 | 2 | Ring objektet direkt så att dörren kontrolleras, och nämn missen vid nästa passbyte i stället för att skriva.  _`failure_to_document`_ |

- **Preferred key:** `a` → `c`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d04` — SCC-06 / dokumentation

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Inför en genomgång läser du din egen rapport från förra veckan och ser att du utelämnat att du var ensam på objektet när händelsen inträffade. Rapporten är i övrigt korrekt.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den tillkommit i efterhand. | **preferred** |
| b | 2 | 1 | Nämna det muntligt vid genomgången utan att ändra i rapporten. | insufficient_information |
| c | 3 | 0 | Redigera rapporten så att den blir korrekt från början. | failure_to_document |

| key | pos | score | new option (sv) |
|---|---|---|---|
| c | 1 | 0 | Redigera rapporten så att bemanningen framgår och texten blir korrekt redan från början.  _`failure_to_document`_ |
| b | 2 | 1 | Nämn det muntligt vid genomgången, utan att ändra eller komplettera något i den rapport som redan är inlämnad.  _`insufficient_information`_ |
| a | 3 | 2 | Lägg till en daterad komplettering om bemanningen utan att särskilt nämna den vid genomgången.  _`weak_communication`_ |
| d | 4 | 3 | Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den tillkommit i efterhand. **(preferred)** |

- **Preferred key:** `a` → `d`
- **Preferred position:** 1 → 4
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d05` — SCC-11 / proportionalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** Ett larm har tagit fyrtio minuter av ditt pass. Du har trettio minuter kvar och en rond som normalt tar femtio. Ronden omfattar tolv kontrollpunkter, varav tre är utrymmen med skyddsvärde och nio är allmänna utrymmen.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Gå de tre skyddsvärda punkterna och så många av de övriga du hinner, kvittera bara de du gått, och skriv i överlämningen vilka som inte hanns med. | **preferred** |
| b | 2 | 1 | Gå de tre skyddsvärda punkterna och avsluta passet där. | insufficient_information |
| c | 3 | 0 | Gå så många punkter du hinner och kvittera resten så att ronden ser fullständig ut. | failure_to_document |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Gå så många punkter du hinner och kvittera resten ändå, så att ronden ser fullständig ut i systemet.  _`failure_to_document`_ |
| a | 2 | 3 | Gå de tre skyddsvärda punkterna först, kvittera bara det du gått, och skriv resten i överlämningen. **(preferred)** |
| c | 3 | 1 | Gå så många av de tolv punkterna du hinner i tur och ordning, och kvittera bara dem du faktiskt gått.  _`poor_proportionality`_ |
| b | 4 | 2 | Gå de tre skyddsvärda punkterna och avsluta passet där, och kvittera i systemet bara de punkter du faktiskt har hunnit gå.  _`insufficient_information`_ |

- **Preferred key:** `a` → `a`
- **Preferred position:** 1 → 2
- **Scores:** 3/1/0 → 3/2/1/0

### `so-rj-d06` — SCC-01 / regel-och-syfteslojalitet

- **Stem changed?** **NO**
- **Reason for change:** The preferred option was key `a`, displayed first, and the longest option. Options rewritten for balance; a second-best (score 2) strategy added, which the original 3/1/0 key had no room for.

**Scenario (unchanged):** En anställd hos uppdragsgivaren frågar om du kan kolla i passersystemet vilken tid en viss kollega gick hem i går. Hen säger att det gäller en diskussion om vem som lämnade kaffemaskinen påslagen.

| | Old options (sv) | | | |
|---|---|---|---|---|
| **key** | **pos** | **score** | **text** | |
| a | 1 | 3 | Säg nej och förklara att passerdata bara får användas för säkerhetsändamål — och hänvisa frågan till uppdragsgivarens egen chef. | **preferred** |
| b | 2 | 1 | Säg att du inte får göra det och gå vidare. | insufficient_information |
| c | 3 | 0 | Titta efter, eftersom uppgiften är harmlös och personen ändå kan fråga sin chef. | excessive_informal_trust |

| key | pos | score | new option (sv) |
|---|---|---|---|
| d | 1 | 0 | Titta efter i systemet åt personen, eftersom uppgiften är harmlös och hen ändå kan få den av sin egen chef i morgon.  _`excessive_informal_trust`_ |
| c | 2 | 1 | Säg att du inte får göra det och gå vidare med arbetet utan att förklara varför det är så.  _`weak_communication`_ |
| b | 3 | 3 | Säg nej, förklara att passerdata bara får användas för säkerhetsändamål, och hänvisa till chefen. **(preferred)** |
| a | 4 | 2 | Säg nej och förklara att passerdata bara får användas för säkerhetsändamål, och lämna det därvid.  _`delayed_escalation`_ |

- **Preferred key:** `a` → `b`
- **Preferred position:** 1 → 3
- **Scores:** 3/1/0 → 3/2/1/0

