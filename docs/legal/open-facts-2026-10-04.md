# Frågor till ägaren (2026-10-04, uppdaterad)

En enda kort lista. Allt som går att göra utan svaren är gjort; det som står här är kontospecifika fakta och beslut som
bara ägaren kan ge. En punkt är klar först när uppgiften är ifylld i texten och vaktskriptet
(`bun run launch-legal:check`) har uppdaterats med den.

Offentlig leverantörsdokumentation har hämtats där det går. Från den här miljön nådde jag Supabases dokumentation
(genom Supabases dokumentationsverktyg) och plattformsverktygen för Supabase och Lovable (skrivskyddat). Leverantörernas
webbplatser för avtal, underbiträden och överföringsstöd är blockerade här, så de fakta som kräver dem står kvar.

| # | Fråga eller beslut | Varför, och vad jag redan vet |
|---|---|---|
| 1 | **Bolagets adress** (säte) | Visas som öppen punkt i villkor, policy och biträdesavtal. Behövs också för domstol i biträdesavtalet. |
| 2 | **Vilken juridisk person är avtalspart hos Supabase och Lovable?** | Supabase-organisationen heter "mostafa@salvusgroup.se's Org" (plan Pro) och Lovable-arbetsytan "s2503017's Lovable" (plan Pro). Läst 2026-10-04. Är det inte Cqrityjobb AB måste biträdeskedjan och policyns leverantörstabell säga rätt part. |
| 3 | **Supabase:** är återställning till tidpunkt på (annars dagliga kopior i 7 dagar, enligt Supabases dokumentation för plan Pro)? Hur många dagars loggar? Vilka inställningar för sessioners tidsgräns? Är biträdesavtalet accepterat? | Fyller tre öppna punkter i policy §9 och Bilaga 2. Region Frankfurt är verifierad. |
| 4 | **Lovable:** driftregion, avtalspart, biträdesavtal accepterat? Körs appen mot ert eget Supabase-projekt (inte Lovable Cloud)? **Hostingen lägger själv in ett sidvisningsskript (`/~flock.js`, rapporterar till `/~api/analytics`) på alla publicerade sidor: behandlar det personuppgifter, sätter det kakor eller läser enheten, och kan det stängas av i projektets inställningar?** | Policy §6, Bilaga 3 och §11 (en öppen punkt). Skriptet ligger utanför applikationen och går inte att ta bort därifrån; delningslänkar för Security Passport är byggda så att nyckeln aldrig syns i en sidladdning (`share-transport.ts`). |
| 5 | **Resend:** avtalspart, sändningsregion, biträdesavtal, loggtid. **E-postleverantören för inloggningsmejl och brevlådorna `info@` och `job@`: namn, region, avtal.** **Google (inloggning):** självständigt ansvarig eller underbiträde, vad visar samtyckesskärmen? | Policy §6 och §9, Bilaga 3. Namnet på e-postleverantören saknas helt. |
| 6 | **Överföringsstöd per leverantör** (mottagarland, och om stödet är certifiering under EU–U.S. Data Privacy Framework, standardavtalsklausuler eller annat) | Kräver leverantörernas avtal och DPF-listan, som är blockerade här. Ett köp eller ett godkännande av villkoren ersätter inte stödet. |
| 7 | **Beslut om tre lagringstider som jag föreslår men inte får anse beslutade:** standardtid för rekryteringsmaterial (förslag: 24 månader efter avslutad rekrytering, därefter anonymisering), granskningsloggar (förslag: 24 månader) och användningsstatistik (förslag: 13 månader, men mätningen är av). **Och:** vill ni att granskningsloggen slutar spara en raderad persons e-postadress (kräver en senare migration)? | Policyn visar öppna punkter tills ni beslutar. Biträdesavtalets punkt 10.1 följer samma beslut. |
| 8 | **Godkänn att de 339 gamla användningshändelserna raderas** (satsen är förberedd i `docs/release/2026-10-04-funnel-measurement-off.md`) | Mätningen är avstängd i denna PR. Raderna ligger kvar tills ni säger till. Ingen destruktiv körning utan ert godkännande. |
| 9 | **Beslut om sammanslagning och publicering av utkasttexterna.** Villkor och policy är utkast (banner, `noindex`). Efter en sammanslagning och en publicering syns den nya utkasttexten på `/villkor` och `/integritetspolicy` medan datumet är oförändrat. Slå samman men publicera först när ni godkänner (rekommenderas), eller publicera nu med bannern som enda skydd? | Ni sade att inga juridiska texter ska publiceras före godkännande. Kontoraderingen är inte längre en fråga: den är provad i produktion 2026-10-04 (`docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5). |
| 10 | **Mostafas första körningar i loggen:** brevlådorna `info@` och `job@` (månadsvis) och leverantörsinställningarna (kvartalsvis). Bekräfta även vem som ersätter vid frånvaro | `docs/legal/retention-runbook-v1.md` och `mailbox-and-gdpr-routine.md`. En rutin räknas som körd först när den står i `retention-execution-log.md`. |
| 11 | **Biträdesavtalets frister** enligt tabellen i `personuppgiftsbitradesavtal-utkast.md` (30 dagar och 14 dagar för underbiträden, 3 arbetsdagar och 48 timmar, 30 dagar för radering, en revision per år med 30 dagars förvarning). **Finns ett företagsavtal?** Jag har tagit bort hänvisningarna till ett som inte finns. | Förslag med motivering ligger i avtalsutkastet. Ansvarsbegränsningen bör avgöras av en jurist. |
| 12 | **Läs de engelska texterna** i denna PR (startsidan, intervjusidan) och bekräfta att startsidans andra mening ("Rekryteringsverktyg för arbetsgivare – på samma plats.") ska stå kvar | Jag har skrivit den engelska versionen. |
| 13 | **Godkännande och datum:** `OWNER_APPROVED` ändras inte av mig. När ni godkänner sätts datumen och alla konton godkänner villkoren igen | Besluten 2026-10-04 är ett godkännande av inriktningen, inte av slutversionen. |

Valfritt: svepningens hemligheter (`RECRUITMENT_SWEEP_URL`, `RECRUITMENT_SWEEP_TOKEN`) ersätter månadskörningen av notisrensningen (R4).
AI-miljövariablerna behöver inte längre bekräftas för att texten ska vara sann (spärren är en konstant i koden), men det är bra att de är tomma.

Regel för listan: en uppgift som inte kan läsas i koden eller i produktionen ska inte fyllas i av någon annan än den som kan styrka den.
