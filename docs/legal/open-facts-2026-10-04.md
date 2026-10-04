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
| 3 | **Supabase:** är återställning till tidpunkt på (annars dagliga kopior i 7 dagar, enligt Supabases dokumentation för plan Pro)? Hur många dagars loggar (beslutet är 90 dagar, bekräfta att inställningen inte är längre)? Vilka inställningar för sessioners tidsgräns? Är biträdesavtalet accepterat? | Fyller tre öppna punkter i policy §9 och Bilaga 2. Region Frankfurt är verifierad. |
| 4 | **Lovable:** driftregion, avtalspart, biträdesavtal accepterat? Körs appen mot ert eget Supabase-projekt (inte Lovable Cloud)? Och: **Cloudflare** (CDN och skydd i driftens leveranskedja): plats, överföringsstöd och Lovables avtal med dem | Policy §6, Bilaga 3 och §11. Besöksstatistiken är avstängd och kontrollerad live 2026-10-04 (deployment 7b19bf27: inget skript, inga analysanrop, ingen `session-id`-kaka). Det som återstår på driftens sida är de två kakorna `__cf_bm` (Cloudflare) och `__dpl` (Lovable), som policyn nu nämner, och att Cloudflare finns i leveranskedjan. Delningslänkar för Security Passport är byggda så att nyckeln aldrig syns i en sidladdning (`share-transport.ts`). |
| 5 | **Resend:** avtalspart, sändningsregion, biträdesavtal, loggtid (beslutet är 90 dagar, bekräfta att inställningen inte är längre). **E-postleverantören för inloggningsmejl och brevlådorna `info@` och `job@`: namn, region, avtal.** **Google (inloggning):** självständigt ansvarig eller underbiträde, vad visar samtyckesskärmen? | Policy §6 och §9, Bilaga 3. Namnet på e-postleverantören saknas helt. |
| 6 | **Överföringsstöd per leverantör** (mottagarland, och om stödet är certifiering under EU–U.S. Data Privacy Framework, standardavtalsklausuler eller annat) | Kräver leverantörernas avtal och DPF-listan, som är blockerade här. Ett köp eller ett godkännande av villkoren ersätter inte stödet. |
| 7 | **Biträdesavtalets frister** enligt tabellen i `personuppgiftsbitradesavtal-utkast.md` (30 dagar och 14 dagar för underbiträden, 3 arbetsdagar och 48 timmar, 30 dagar för radering, en revision per år med 30 dagars förvarning). **Finns ett företagsavtal?** Jag har tagit bort hänvisningarna till ett som inte finns. | Förslag med motivering ligger i avtalsutkastet. Ansvarsbegränsningen bör avgöras av en jurist. |
| 8 | **Mostafas första körningar i loggen:** brevlådorna `info@` och `job@` (månadsvis) och leverantörsinställningarna (kvartalsvis). Bekräfta även vem som ersätter vid frånvaro | `docs/legal/retention-runbook-v1.md` och `mailbox-and-gdpr-routine.md`. En rutin räknas som körd först när den står i `retention-execution-log.md`. |
| 9 | **Läs de engelska texterna** i denna PR (startsidan, intervjusidan) och bekräfta att startsidans andra mening ("Rekryteringsverktyg för arbetsgivare – på samma plats.") ska stå kvar | Jag har skrivit den engelska versionen. |
| 10 | **Godkännande och datum:** `OWNER_APPROVED` ändras inte av mig. När ni godkänner sätts datumen och alla konton godkänner villkoren igen | Besluten 2026-10-04 är ett godkännande av inriktningen, inte av slutversionen. Ni har godkänt att de uppdaterade utkasten visas med utkastbanner tills dess. |

Borttagna ur listan eftersom de är beslutade eller gjorda 2026-10-04 (se `2026-10-04-owner-decisions.md`, beslut 8): lagringstiderna för
rekryteringsmaterial, säkerhets- och åtkomstloggar och tekniska loggar, klassificeringen före beslut om övriga granskningsposter och de 339
mätraderna (ingen radering är godkänd, ingen ny insamling), visningen av utkasttexterna med banner, avstängningen av Lovables besöksstatistik
(gjord av ägaren och kontrollerad live 2026-10-04) och produktionsprovet av kontoradering (gjort,
`docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5).

Valfritt: svepningens hemligheter (`RECRUITMENT_SWEEP_URL`, `RECRUITMENT_SWEEP_TOKEN`) ersätter månadskörningen av notisrensningen (R4).
AI-miljövariablerna behöver inte längre bekräftas för att texten ska vara sann (spärren är en konstant i koden), men det är bra att de är tomma.

Regel för listan: en uppgift som inte kan läsas i koden eller i produktionen ska inte fyllas i av någon annan än den som kan styrka den.
