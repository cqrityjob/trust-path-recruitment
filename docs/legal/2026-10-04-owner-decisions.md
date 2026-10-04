# Ägarbeslut 2026-10-04: juridik och lansering

> **Uppdatering, andra leveransen (2026-10-04).** Det som den här anteckningen kallade "inte gjort" är nu gjort i egna PR:er:
> AI-spärren, de tre texterna, mätningen av och beviset för kontoradering, allt i den här PR:en (#417, den enda lanserings-PR:en). I den här PR:en
> är retention-planen avstämd mot ägarens beslut (tre rader är förslag, inte beslut), manuella gallringsrutiner med ansvarig,
> intervall och logg finns (`retention-runbook-v1.md`), texterna om nyhetsbrev, mätning och automatisk vidarebefordran är
> borttagna, och biträdesavtalet har förslag på frister och inga hänvisningar till ett företagsavtal som inte finns.
> Beslutet om #7 (kvarstående fakta) är ersatt av den korta frågelistan i `open-facts-2026-10-04.md`.
> Matrisen `2026-10-04-text-function-verification.md` är uppdaterad rad för rad.


**Status: besluten och textinriktningen är godkända av ägaren. Det är inte ett intyg om verifierad drift och
inte ett godkännande av den slutliga publiceringsversionen.** `OWNER_APPROVED` i `src/lib/legal/status.ts`
är fortfarande `false` för både villkor och policy. Texten ska verifieras mot funktionen av en oberoende
granskare innan något publiceras (`docs/legal/2026-10-04-text-function-verification.md`).

Besluten är ägarens egna ord i chatten med Claude-sessionen 2026-10-04. Här står vad varje beslut ändrar
och var.

| # | Beslut | Vad som gjorts i PR:en | Var |
|---|---|---|---|
| 1 | Avtalspart och personuppgiftsansvarig är **Cqrityjobb AB, organisationsnummer 559261-0249**. Varumärket är CQrityjob. Tidigare Cqrityjob LLC ersätts i aktuella utkast, företagsavtal och webbtexter. Historiska handlingar ändras inte utan dokumenterat skäl. | Bolagsuppgifterna står en gång i `src/lib/legal/company.ts` och används av villkoren, policyn, webbtexterna (`legal.provider`, sökmotorbeskrivningen) och biträdesavtalet. Det gamla namnet finns inte kvar i källkod. De två historiska besluten från 2026-10-03 är orörda i sak och har fått en datumad anteckning överst. | `src/lib/legal/`, `src/i18n/dictionaries.ts`, `docs/release/2026-10-03-launch-legal-*.md` |
| 2 | Kontakt är info@cqrityjob.com. job@cqrityjob.com används för rekryteringskommunikation. Mostafa bevakar initialt varje arbetsdag. **Två arbetsdagar är ett internt mål för första svar, inte en offentlig SLA.** GDPR-begäranden hanteras enligt lagens tidsfrister. | Ingen offentlig text lovar en svarstid (vaktskriptet förbjuder ordet "arbetsdag" i villkor och policy). Policyn säger "utan onödigt dröjsmål och senast inom en månad", med möjlig förlängning enligt artikel 12.3. Villkor och policy anger att svar på arbetsgivarens mejl går till job@ och vidarebefordras till arbetsgivaren. | `documents.ts`: villkor §7 och §13, policy §1 och §10 |
| 3 | Lagringsplanen är godkänd som produktbeslut. **Rutinerna kontrolleras och genomförs innan tiderna publiceras som fungerande åtaganden.** Ingen massradering eller annan destruktiv produktionsåtgärd ingår. | Policyns avsnitt 9 byggs rad för rad från planen i `src/lib/legal/retention-plan.ts`. Varje rad anger vad som gör den sann, och policyn kan inte bli slutgiltig medan någon rad saknar verifierad rutin. I dag är ingen rad verifierad. Ingen rutin har byggts eller körts i den här PR:en. | `retention-plan.ts`, `status.ts` (`RETENTION_READY`), vaktskriptets grupp 6 |
| 4 | Generativa AI-funktioner förblir avstängda i version 1. Version 2 erbjuder dem som separata betaltjänster med uttrycklig beställning, prisinformation och aktivering. Betalmodellen byggs inte nu. | Villkor §6 och §10, och policy §5, säger det. Ingen betalmodell är byggd, och det finns ingen betalintegration i koden. **Texten är sann bara om servermiljön inte har AI påslaget för CV-utkastet, se verifieringsmatrisen B2.** | `documents.ts`, matrisen rad B1–B4 |
| 5 | Internationell drift är godkänd som inriktning. Inget generellt krav på EU-lagring. Faktiska mottagarländer, leverantörsavtal och lagligt överföringsstöd dokumenteras. Köp av AI-tjänst eller godkännande av villkoren ersätter inte kraven. | Policy §8 säger att ingen EU-regel finns och att stöd krävs för varje överföring, och §6 har en tabell med plats och stöd per leverantör. Allt som inte är verifierat är en synlig öppen punkt. Bara Supabases region (Frankfurt) är verifierad. | `vendors.ts`, policy §6 och §8 |
| 6 | Inför den uppdaterade integritetspolicyn och ändringarna i användarvillkoren. Färdigställ dessutom ett separat personuppgiftsbiträdesavtal med behandlingsbilaga, säkerhetsåtgärder och underbiträdesförteckning för företagskunder. | Policyn och villkoren är uppdaterade och finns som utkast (banner, `noindex`, inte i sitemapen). Biträdesavtalet är ett utkast med Bilaga 1 (behandlingen), Bilaga 2 (säkerhetsåtgärder, med underlag per punkt) och Bilaga 3 (underbiträden, samma lista som policyn). | `docs/legal/personuppgiftsbitradesavtal-utkast.md` |
| 7 | Samla kvarstående faktauppgifter i en kort lista. | Listan finns. | `docs/legal/open-facts-2026-10-04.md` |

## Vad som hittades när texten jämfördes med funktionen

Detta är inte beslut utan resultat av kontrollen. Allt är dokumenterat i verifieringsmatrisen.

1. **CV-utkastet saknar databasens AI-avstängning.** "Skapa nytt AI-utkast" styrs bara av miljövariablerna
   `INTERVIEW_AI_PROVIDER` och `ANTHROPIC_API_KEY`. Är båda satta skickas personens karriäruppgifter
   (utan namn) till Anthropic. Alla andra AI-vägar har också en databasspärr som är avstängd. Ingen
   sparad CV i produktion har skapats med en modell. Ägaren behöver bekräfta att variablerna inte är satta.
2. **Tre texter säger att AI används.** Startsidans hero ("AI-stöd för ditt säkerhetsarbete"), knappen
   "Skapa nytt AI-utkast" och ett stycke på kandidatens intervjusida ("Ett AI-stöd hjälper
   arbetsgivaren …"). De är inte ändrade här: heron ägs av Lovable och intervjutexten är styrd text med
   egna kontroller. Förslag: en liten separat PR, se nedan.
3. **Mätning som texten inte nämnde.** Produkten registrerar anonyma användningshändelser
   (339 rader, inget användar- eller sessions-id i någon rad) och sätter en markering i
   webbläsarens sessionslagring. Policy §11 beskriver det nu.
4. **En kaka som texten inte nämnde.** Delningslänkar för Security Passport sätter en kortlivad kaka
   (30 minuter). Policy §11 nämner den nu.
5. **Gallringsplanen och koden skiljer sig åt.** En äldre funktion raderar ansökningar efter 12 månader
   (planen säger 24 månader och anonymisering) och körs aldrig. `cd_sessions` står under
   användningshändelser i planen men är användarnas egna testkörningar. Notisutkorgens rensning körs av
   en svepning som inte är konfigurerad. Kontoradering avbryts för 4 innehavare. Se matrisens avsnitt E.
6. **Meningen om lagring i §9 var omvänd.** "raderas eller anonymiseras därefter, om lag eller rättsliga
   anspråk kräver fortsatt lagring" är ändrad till "såvida inte". Det är den enda ändringen av ägarens
   ordalydelse som inte följer av ett beslut, och den ändrar inte syftet.

## Vad som inte är gjort, och varför

| Inte gjort | Skäl |
|---|---|
| Publicering, `OWNER_APPROVED`, datum på villkor och policy | Besluten är inte ett godkännande av slutversionen. Datumen sätts vid godkännandet, och då ska alla konton godkänna villkoren igen. |
| Bolagets adress i sidfot, kontaktsida, villkor, policy och avtal | Adressen är en öppen uppgift. Villkor och policy visar den som synlig öppen punkt. |
| Rutinerna bakom gallringsplanen | De är schema-first-ändringar med egna tester och egen verifiering, och de får inte köras destruktivt utan ägarens uttryckliga godkännande. De byggs i en separat PR och verifieras innan någon rad i planen markeras `live`. |
| Företagsavtalet | Det finns ingen text för ett företagsavtal i repot. Finns ett utanför repot behöver det skickas, så att namnbytet kan göras där. Biträdesavtalet hänvisar till det. |
| Underskrift eller godkännande av biträdesavtalet | Det är ett utkast med öppna punkter. |
| Ändring av startsidans hero, CV-knappen och intervjutexten | Se resultat 2 ovan. De kräver ägarens ordval och en egen PR. |
| Någon ändring av produktion | Inget skrevs till produktion. Allt i produktion som nämns här lästes skrivskyddat 2026-10-04. |

## Historiska handlingar

De två besluten från 2026-10-03 (`docs/release/2026-10-03-launch-legal-decisions.md` och
`docs/release/2026-10-03-launch-legal-and-contact.md`) beskriver läget då, med Cqrityjob LLC som
leverantör. De är orörda i sak, eftersom de är ett register över vad som beslutades och verifierades
den dagen. Överst har de fått en anteckning med datum som säger att leverantören nu är Cqrityjobb AB
och pekar hit. Vaktskriptet kräver anteckningen.

## Förslag på nästa steg, i den ordning de behövs före publicering

1. **Granskning:** den oberoende granskaren går igenom verifieringsmatrisen och avgör varje rad.
2. **En liten PR "AI avstängt i version 1":** (a) en kodspärr som gör att inget externt AI-anrop kan ske
   i version 1 oavsett servermiljö, (b) sanna ordval i CV-knappen, intervjutexten och, efter ägarens
   beslut, startsidan. Den ändrar beteende och kräver ägarens ordval, därför är den inte med här.
3. **Rutinerna bakom gallringsplanen**, en rad i taget i schema-first-ordning, utan massradering. Först
   kontoraderingens rättelse (`20270208090000`) och en konfigurerad svepning, sedan anonymisering av
   rekryteringsmaterial och gallring av loggar och feedback. Varje rad som blir sann verifieras skrivskyddat
   och flyttas till `live` i `retention-plan.ts` i samma ändring.
4. **Ägarens fakta** enligt `open-facts-2026-10-04.md`, därefter godkännande av texterna.
