# Testbank och Skicka test

## Grundorsak och verifierad preview

Den inloggade Lovable-previewen på `preview--trust-path-recruitment.lovable.app`, organisation Buller o bång, reproducerade bibliotek → TRUST → strategisk roll → Starta ärende → Planera intervju. Ingen intervju eller tilldelning skapades under reproduktionen. Bilderna visar navigation, inte ett misslyckat databasutskick.

En läsning av medlemskapet bekräftade `member`, aktivt medlemskap och aktiv arbetsgivare. Rollpresentationen är korrekt. Medlemsrollen har inte fått tilldelningsrätt och inget konto har ändrats. Tidigare dolde biblioteket testknappen för medlem, medan ansökningslistan använde den vidare regeln för rekryteringsansvariga. Databasen kräver aktiv ägare/administratör.

Previewens identifierbara frontendresurs var `/assets/index-D6mB75gU.js`. Ingen commitstämpel exponeras i sidan; exakt Git-SHA är därför inte verifierad och får inte likställas med aktuell main. Arbetsgrenen utgår från `df7a74a`, merge av #307, och bevarar #304–306 samt säkerhetsfixarna. Inga produktionsskrivningar, rolländringar eller publiceringar ingår.

## Rättningen

Testbanken har egen standardvy med operativt och strategiskt test, verklig tillgänglighet, språk, tidsåtgång och pilotstatus. Intervjuguider öppnas genom en separat länk. Samma dialog används från bank, bedömningsöversikt, kandidatlistans rad och verktygsrad samt ansökans översta åtgärder. Även medlem ser åtgärden och får en serververifierad förklaring om rätt åtkomst.

Bekräftelsen låser vald testversion, språk, mottagare och rekrytering. Valfri sista svarsdag följer med. Massutskick visar varje mottagares resultat och återförsöker bara misslyckade tilldelningar/aviseringar. Den gamla parallella massutskicksdialogen är borttagen. Befintlig databasidempotens och meddelandekanal återanvänds. Meddelande i plattformen och e-postleverantörens svar redovisas var för sig; leverantörens accepterande är inte bevis på leverans till inkorgen.

Mottagarvalet använder rekryteringens sidindelade kandidater. Urval behålls mellan kandidatsidor; byte av rekrytering tömmer urvalet. Jobbväljaren visar de senaste 200 rekryteringarna och anger den gränsen; äldre rekryteringar har utskicksåtgärden i sin egen vy.

## Webbläsarbevis

Endast syntetiska personer, separat lokal Auth/PostgREST/Postgres-miljö. Ingen extern e-postleverantör aktiverad. Spårfiler med sessionsuppgifter publiceras inte.

- [Testbank, svenska](../../artifacts/assessment-dispatch/bank-sv-chromium.png)
- [Testbank, engelska](../../artifacts/assessment-dispatch/bank-en-chromium.png)
- [Bekräftelse, mobil](../../artifacts/assessment-dispatch/confirmation-sv-mobile-375.png)
- [Medlemsförklaring](../../artifacts/assessment-dispatch/member-chromium.png)
- [Delvis misslyckat massutskick](../../artifacts/assessment-dispatch/batch-partial-failure.png)
- [Massutskick efter återförsök](../../artifacts/assessment-dispatch/batch-complete.png)
- [Operativt test inlämnat](../../artifacts/assessment-dispatch/journey/send-test-5-submitted.png)
- [Strategiskt resultat öppnat från ansökan](../../artifacts/assessment-dispatch/journey/strategic/6-results-opened.png)

De befintliga 15 operativa/strategiska webbläsartesterna passerade: 50 respektive 37 svar, avbrott/omladdning, inlämning, strategisk mänsklig granskning och frigivning, rätt resultat, dubbelklick/återförsök och nekad läsning mellan organisationer. Den separata frivilliga intervjuåtgärden testas också, efter avslutat testflöde.

Nya tester provar alla ingångar, svenska/engelska, 375 px mobil och dator, medlem samt massutskick med en tillfälligt saknad adress hos en syntetisk kandidat. Ett lyckat och ett misslyckat utskick följt av återförsök gav exakt två tilldelningar, kvarvarande markeringar och oförändrat antal intervjuer.

## Prova rättningen

1. Använd ett ägar- eller administratörskonto i rätt organisation.
2. Öppna **Rekryteringar → rekryteringen**. Markera en eller flera sökande och välj **Skicka test** bredvid Intervju och Ändra status.
3. Välj testnivå, språk och eventuell sista svarsdag. Välj **Granska utskick**, kontrollera mottagarlistan och välj **Skicka test**.
4. Läs resultatet per mottagare. Öppna ansökan för aktuell teststatus.
5. Kandidaten öppnar **Tester & utveckling**, genomför och lämnar in testet. Efter den granskning och frigivning innehållet kräver öppnar arbetsgivaren **Öppna kandidatunderlag** på samma ansökan.
6. Alternativ ingång: **Tester & bedömningar → Testbank → Skicka test → rekrytering och mottagare**.
7. Med medlemskontot syns åtgärden, men dialogen förklarar att aktiv ägare/administratör krävs. Organisationens ägare måste fatta ett eventuellt åtkomstbeslut; ingen rättighet tillkommer här.

## Administration och driftsbeslut

Den gamla `/admin/assessments` hanterar en annan katalog än SCP-rekryteringstesterna. En separat färdigställd administrationsändring lägger till förhandsgranskning, sammansättning från versionslåsta frågor, nya testdefinitioner och nya utkastversioner. Frågetext, poängnycklar och godkännanden följer fortsatt den styrda innehållsprocessen.

Administrationen kräver migration `20261219090000_assessment_draft_authoring.sql`. Projektets befintliga `scripts/schema-first-release-check.ts` kräver applicerat och verifierat schema före beroende applikationskod. Därför förbereds schema och beroende administration separat från denna körbara utskicksrättning. Ingen kontroll har stängts av för att göra CI grön. Utkast spärras per version även om originaldefinitionen har pilotbeteckning; en särskilt granskad innehållsrelease krävs för att öppna dem. Den befintliga tillåtna versionen förblir tillgänglig och gamla tilldelningar behåller sin version.

Kvarstående beslut: granskning och separat schemautrullning före administrationens merge, eventuellt åtkomstbeslut av organisationens ägare, och separat e-postkonfiguration om extern e-post ska användas. Utskicksrättningen kräver ingen ny migration.
