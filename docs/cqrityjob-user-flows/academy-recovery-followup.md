# Academy: utgången session och avbruten sparning

## Beteende och orsak

En sessionsutgång kunde tidigare tömma det autentiserade innehållet samtidigt som Academys utgångsspärr hindrade omdirigeringen till inloggningen. Inloggningsomdirigeringarna går nu förbi spärren. Nycklingen per användare och skyddet mot sena sessionssvar är kvar. Bufferten från den gamla användaren kastas; den sparas inte under nästa konto.

När sparningen misslyckas visar testet en uttrycklig varning om att osparade svar kan gå förlorade samt valen **Försök spara igen**, **Stanna kvar** och **Lämna utan att spara**. Valen att stanna och lämna finns även medan en begäran väntar utan svar. Vanlig navigation och webbläsarens Bakåt använder routerns väntande övergång. En sen nätverkskvittens kan inte fullfölja en avbruten utgång eller uppdatera nästa användares sida. Redan sparade svar återkommer när testet öppnas igen.

## Verifiering

Syntetiska webbläsartester i `e2e/academy-user-flow.spec.ts` använder riktiga komponenter, router och Supabase SDK, men ersätter nätverkssvaren. Ingen produktionsdata eller produktionsskrivning används.

- Sessionsutgång: testklockan flyttas förbi den syntetiska sessionens faktiska `expires_at`; refresh avslås. Den riktiga SDK:n skickar sessionsutgången. Inloggningsformuläret visas, därefter loggar konto B in i samma dokument. Inga ytterligare skrivningar från A:s buffert får starta. Samma kontroll görs med en inlämning som väntar på sista svarets kvittens; efter kontobyte får den inte skicka in testet.
- Negativ kontroll: utan `ignoreBlocker` på inloggningsomdirigeringen faller samma test; adressen stannar på Academy med tomt innehåll.
- Sparfel: svenska och engelska, paus och Bakåt, misslyckad omsparning, uttryckligt lämna-val och återöppning med det tidigare serversparade svaret.
- Begäran utan svar: lämna-valet fungerar medan sparningen fortfarande väntar; den sena begäran ändrar inte den återöppnade sidan.
- Befintlig täckning finns kvar för lyckad omsparning, stanna kvar, exakt återupptaget steg, omladdning, inlämning en gång, samt kontobyte utan omladdning.

Kommando: `E2E_BASE_URL=http://127.0.0.1:3104 bunx playwright test e2e/academy-user-flow.spec.ts --project=chromium --project=mobile-375 --project=mobile-390`.

Utfall: hela den ursprungliga matrisen hade 37 godkända fall och två föråldrade testselektorer i 390 px. Båda selektorerna korrigerades och deras omkörning gav 2/2. Efter ytterligare skydd för väntande inlämning gav den riktade slutkörningen 12/12 över desktop, 375 px och 390 px. De 42 aktuella fallens beteenden har därmed verifierats i huvudkörningen och riktade omkörningar. Typkontroll, lint för ändrade komponenter och fyra Academy-/kandidatkontrakt (309 assertioner) passerade.

Avgränsning: transportfel och autentisering är deterministiskt simulerade lokalt. Ingen ändring av frågor, poängsättning, bedömningsregler eller beslutet att spara karriärresultat ingår.
