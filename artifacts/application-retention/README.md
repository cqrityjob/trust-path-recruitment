# Syntetiska komponentbevis för ansökningslivscykeln

Kör `bun run application-retention:browser-check` för att återskapa dessa åtta bilder.
Verklig MaterialLifecycle, router, useServerFn-hook, i18n och produktens CSS; en
in-memory-serverfunktionsseam ersätter backend. Inga konton, tokens eller verkliga
ansökningar ingår. Detta är komponentbevis, inte en inloggad hostad portalverifiering.

Kontroller per vy: arkivera/återställ utan ändrat avslut/gallringsdatum, serverns
simulerade bekräftelseomfattning, delade filer, avbryt, periodval och synligt filfel.
Skärmbilden visar den färdiga, opaka raderingsdialogen vid 375 eller 1440 px.

| Kontext | Svenska mobil | English mobile | Svenska dator | English desktop |
|---|---|---|---|---|
| Rekrytering | [Bild](job-sv-375.png) | [Image](job-en-375.png) | [Bild](job-sv-1440.png) | [Image](job-en-1440.png) |
| Ansökan | [Bild](app-sv-375.png) | [Image](app-en-375.png) | [Bild](app-sv-1440.png) | [Image](app-en-1440.png) |

SQL-sviten verifierar riktig serverbehörighet, organisationsisolering och fysisk
radradering på syntetiska PostgreSQL-data. Worker-sviten verifierar Storage-fel och
återförsök via injicerad klient. Riktiga syntetiska Storage-objekt i separat Supabase-
testprojekt är ett obligatoriskt steg i aktiveringsplanen före produktionsaktivering.
