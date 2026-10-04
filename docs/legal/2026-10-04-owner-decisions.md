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
| 3 | Lagringsplanen är godkänd som produktbeslut. **Rutinerna kontrolleras och genomförs innan tiderna publiceras som fungerande åtaganden.** Ingen massradering eller annan destruktiv produktionsåtgärd ingår. | Policyns avsnitt 9 byggs rad för rad från planen i `src/lib/legal/retention-plan.ts`. Varje rad anger vad som gör den sann, och policyn kan inte bli slutgiltig medan någon rad saknar verifierad rutin. Manuella rutiner med ansvarig (Mostafa), intervall och logg finns i `retention-runbook-v1.md`. Raden `account` är `live`: stängning på begäran (R1) är provad i produktion 2026-10-04 med ett syntetiskt konto med Passport-underlag (förbehåll: en kvarvarande Storage-fil prövades inte). Övriga rader är `pending`, så policyn är fortfarande ett utkast. Ingen destruktiv körning har gjorts av den här PR:en. Tider som beslutades senare samma dag står i beslut 8. | `retention-plan.ts`, `status.ts` (`RETENTION_READY`), vaktskriptets grupp 6, `retention-execution-log.md` |
| 4 | Generativa AI-funktioner förblir avstängda i version 1. Version 2 erbjuder dem som separata betaltjänster med uttrycklig beställning, prisinformation och aktivering. Betalmodellen byggs inte nu. | Villkor §6 och §10, och policy §5, säger det. Ingen betalmodell är byggd, och det finns ingen betalintegration i koden. Texten är sann genom koden: spärren är en konstant (`src/lib/ai/generative-ai-gate.ts`) som ingen miljövariabel eller databasrad kan öppna, och `generative-ai-gate:check` visar att inget anrop lämnar appen ens med en syntetisk nyckel. De texter som fortfarande nämnde AI oavsett spärren är rättade, se resultat 2 nedan. | `documents.ts`, matrisen rad B1–B4 |
| 5 | Internationell drift är godkänd som inriktning. Inget generellt krav på EU-lagring. Faktiska mottagarländer, leverantörsavtal och lagligt överföringsstöd dokumenteras. Köp av AI-tjänst eller godkännande av villkoren ersätter inte kraven. | Policy §8 säger att ingen EU-regel finns och att stöd krävs för varje överföring, och §6 har en tabell med plats och stöd per leverantör. Allt som inte är verifierat är en synlig öppen punkt. Bara Supabases region (Frankfurt) är verifierad. | `vendors.ts`, policy §6 och §8 |
| 6 | Inför den uppdaterade integritetspolicyn och ändringarna i användarvillkoren. Färdigställ dessutom ett separat personuppgiftsbiträdesavtal med behandlingsbilaga, säkerhetsåtgärder och underbiträdesförteckning för företagskunder. | Policyn och villkoren är uppdaterade och finns som utkast (banner, `noindex`, inte i sitemapen). Biträdesavtalet är ett utkast med Bilaga 1 (behandlingen), Bilaga 2 (säkerhetsåtgärder, med underlag per punkt) och Bilaga 3 (underbiträden, samma lista som policyn). | `docs/legal/personuppgiftsbitradesavtal-utkast.md` |
| 7 | Samla kvarstående faktauppgifter i en kort lista. | Listan finns. | `docs/legal/open-facts-2026-10-04.md` |
| 8 | **Tillägg senare 2026-10-04** (ägarens besked, förmedlat av release-sessionen, med ägarens egna ord för de fyra rättelserna): (a) jobbmejl: gallring sker först när rekryteringens avslutsdatum är känt och 24 månader har passerat; saknas avslutsdatum sker ingen automatisk radering; (b) lagringstider: rekryteringsmaterial 24 månader efter avslutad process (enligt arbetsgivarens fastställda instruktioner), säkerhets- och åtkomstloggar högst 12 månader med dokumenterat behov, vanliga tekniska loggar 90 dagar; övriga auditposter klassificeras innan en gallringsregel bestäms; (c) de 339 gamla mätraderna behålls tills de har klassificerats och radering har beslutats, ingen radering är godkänd nu, ingen ny insamling; (d) hosting och kakor: Lovables Visitor analytics är avstängd och verifierad live 2026-10-04 (deployment 7b19bf27), de observerade driftkakorna `__cf_bm` (Cloudflare, bot management, HttpOnly, Secure, 30 minuter) och `__dpl` (Lovable, ser till att besökaren får den senast publicerade versionen, värdet är deployment-id:t, ej HttpOnly, ca 24 timmar) nämns i §11, och texten är ett daterat konstaterande med löftet att kontrollen görs igen efter varje publicering (release-sessionen gör den; runbook R8, lanseringsstatus B6); (e) de uppdaterade juridiska utkasten får visas med tydlig utkastbanner, `OWNER_APPROVED` förblir `false` och detta är inte ett slutligt juridik- eller lanseringsgodkännande; (f) de inloggade sluttesterna (steg 11 och 15 med flera) är **uppskjutna, inte godkända**. | (a): runbook R6. (b): raderna `recruitment`, `admin-audit`, `other-audit`, `platform-logs`, `mail-logs` i `retention-plan.ts`, policyns avsnitt 9, biträdesavtalets 10.1, runbook R6–R8; tiderna frågas inte om igen. (c): `usage-statistics` och `funnel-measurement-off`-dokumentet ("inte beslutat; kräver klassificering först"). (d): policy §11, Cloudflare som öppen punkt i leverantörstabellen, vaktskriptets 1.10b och 1.14. (e): sammanslagning av #417 får ske när granskningsfynden är rättade och CI är grön. (f): launch status B4. | `retention-plan.ts`, `documents.ts`, `vendors.ts`, `launch-legal-check.ts` |

## Vad som hittades när texten jämfördes med funktionen

Detta är inte beslut utan resultat av kontrollen. Allt är dokumenterat i verifieringsmatrisen. Varje punkt
visar hur den är hanterad i den här PR:en.

1. **CV-utkastet saknade databasens AI-avstängning.** "Skapa nytt AI-utkast" styrdes bara av
   miljövariablerna `INTERVIEW_AI_PROVIDER` och `ANTHROPIC_API_KEY`. **Åtgärdat:** en kodspärr
   (`generative-ai-gate.ts`) stoppar alla AI-anrop före nätverket, och faktabaserat CV-utkast är kvar utan
   modell. Ägaren behöver inte längre bekräfta variablerna för att texten ska vara sann.
2. **Tre texter sa att AI används, och några fler visades oavsett spärren.** Startsidans hero, knappen "Skapa
   nytt AI-utkast" och kandidatens intervjusida är ändrade till ägarens ordval. Efter den oberoende
   granskningen är även Security Work-texterna, den publika sidan om AI-stödet, intervjumetodens text och
   villkorens mening om AI-resultat gjorda villkorliga eller fria från AI, och `generative-ai-texts:check`
   håller dem.
3. **Mätning som texten inte nämnde.** Produkten registrerade användningshändelser (339 rader) och satte en
   markering i webbläsarens sessionslagring. **Åtgärdat:** den egna mätningen är avstängd i koden (en konstant)
   och markeringen skrivs inte. De 339 raderna ligger kvar tills de har klassificerats och radering har
   beslutats (beslut 8c). **Nytt fynd, verifierat på www.cqrityjob.com 2026-10-04:** driftleverantören hade en
   egen besöksstatistik (`/~flock.js`) på varje publicerad sida som registrerade sidvisningar (adress,
   webbläsare, språk, ungefärligt land) och satte kakan `session-id`. **Ägaren har stängt av den**, och
   release-sessionen har kontrollerat live (deployment 7b19bf27): inget skript, inga analysanrop, ingen
   `session-id`-kaka, tom localStorage och sessionStorage. Policy §11 säger därför inte "Vi mäter inte" utan
   att vår egen mätning är avstängd och att Lovables besöksstatistik är avstängd (kontrollerat den 4 oktober
   2026, med löftet att kontrollen görs igen efter varje publicering).
4. **Kakor som texten inte nämnde.** Delningslänkar för Security Passport sätter två kortlivade kakor (en för
   delningsnyckeln och en för delningssessionen, 30 minuter vardera). Driften sätter dessutom `__cf_bm`
   (Cloudflare, 30 minuter) och `__dpl` (Lovable, ungefär 24 timmar). **Åtgärdat:** policy §11 nämner alla fyra
   med ändamål och livslängd, och Cloudflare är en öppen punkt i leverantörstabellen.
5. **Gallringsplanen och koden skiljer sig åt.** En äldre funktion raderar ansökningar efter 12 månader och
   körs aldrig; `cd_sessions` är användarnas egna testkörningar och hör till kontot; notisutkorgens rensning
   körs av en svepning som inte är konfigurerad; kontoradering avbröts för innehavare av
   referensuppgifter. **Åtgärdat:** planen är avstämd, kontoraderingen är rättad (#416, tillämpad) och provad
   i produktion, och manuella rutiner finns (R1–R9).
6. **Meningen om lagring i §9 var omvänd.** "raderas eller anonymiseras därefter, om lag eller rättsliga
   anspråk kräver fortsatt lagring" är ändrad till "såvida inte". Det är den enda ändringen av ägarens
   ordalydelse som inte följer av ett beslut, och den ändrar inte syftet.

## Vad som inte är gjort, och varför

| Inte gjort | Skäl |
|---|---|
| Publicering, `OWNER_APPROVED`, datum på villkor och policy | Besluten är inte ett godkännande av slutversionen. Datumen sätts vid godkännandet, och då ska alla konton godkänna villkoren igen. |
| Bolagets adress i sidfot, kontaktsida, villkor, policy och avtal | Adressen är en öppen uppgift. Villkor och policy visar den som synlig öppen punkt. |
| Automatisering av gallring | Rutinerna är manuella och loggade (R1–R9). Automatisering vore en schema-first-ändring med egna tester, och den får inte köras destruktivt utan ägarens godkännande. Den ligger i backloggen för version 2. |
| Företagsavtalet | Det finns ingen text för ett företagsavtal i repot. Finns ett utanför repot behöver det skickas, så att namnbytet kan göras där. Biträdesavtalet hänvisar till det. |
| Underskrift eller godkännande av biträdesavtalet | Det är ett utkast med öppna punkter. |
| Någon ändring av produktion | Den här PR:en skriver inget till produktion. Allt i produktion som nämns här lästes skrivskyddat 2026-10-04. Raderingen av testkontot 2026-10-04 08:00 UTC gjordes av en superadmin i administratörsgränssnittet, inte av PR:en. |

## Historiska handlingar

De två besluten från 2026-10-03 (`docs/release/2026-10-03-launch-legal-decisions.md` och
`docs/release/2026-10-03-launch-legal-and-contact.md`) beskriver läget då, med Cqrityjob LLC som
leverantör. De är orörda i sak, eftersom de är ett register över vad som beslutades och verifierades
den dagen. Överst har de fått en anteckning med datum som säger att leverantören nu är Cqrityjobb AB
och pekar hit. Vaktskriptet kräver anteckningen.

## Vad som återstår före publicering

Av det som den här anteckningen först föreslog är granskning, AI-spärren, sanna ordval och rutinerna gjorda i
den här PR:en. Det som återstår är ägarens:

1. **Fakta** enligt den korta listan i `open-facts-2026-10-04.md` (adress, avtalsparter, överföringsstöd för
   bland andra Cloudflare, biträdesavtalets frister).
2. **Godkännande** av villkor och policy som slutversion (`OWNER_APPROVED` ändras då, av ägaren), varefter datumen
   sätts och alla konton godkänner villkoren igen.
3. **Publicering.** Texterna visas som utkast (banner, `noindex`, inte i sitemapen) så länge något återstår. Ägaren
   har godkänt att de uppdaterade utkasten visas med tydlig utkastbanner (beslut 8e); det är inte ett slutligt
   godkännande.
