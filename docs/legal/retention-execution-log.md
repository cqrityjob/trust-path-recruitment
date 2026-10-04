# Genomförandelogg för gallring

En rad per körning, även när inget var förfallet. Raden är beviset för att kontrollen gjordes. Ändra aldrig en
gammal rad; rätta med en ny rad som hänvisar till den. Rutinerna: `docs/legal/retention-runbook-v1.md`.

| Datum | Rutin | Utförd av | Torrkörning (förfallet) | Raderat | Anteckning |
|---|---|---|---|---|---|
| 2026-10-04 | (underlag, ingen körning) | Claude, skrivskyddad läsning | R3: 0 + 0 förfallna. R2: 0 inaktiva konton av 22 (äldsta skapat 2026-07-17). R4: 0 avslutade notiser äldre än 90 dagar. | ingenting | Utgångsläge inför lanseringen, läst med exakt de torrkörningsfrågor som rutinerna använder. Inget raderades. Detta är inte en körning av rutinerna, så ingen rad i planen är därmed `live`. 339 användningshändelser (äldsta 2026-08-15) väntar på ägarens beslut. |
| 2026-10-04 08:00 UTC | R1 (stängning av konto på begäran), första körningen i produktion | Superadmin (administratörsgränssnittet). Efterkontroll skrivskyddad. | – | 1 syntetiskt kandidatkonto med Passport-underlag raderat som `erasure` (1 `sp_credential_details` borttagen; 3 spärrade delningslänkar, 1 ansökan med statushändelse och 1 avbruten tilldelning avidentifierade och behållna; 1 fil i Storage köad men redan borta) | Efterkontrollen (0 identiteter, sessioner, anspråk, underlag, profil-, CV-, erfarenhets- och rollrader; 1 gravsten i `deleted_accounts`; adressen avidentifierad; ingen annan rad rörd) står i `docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5. Det som inte prövades: borttagning av en fil som fortfarande finns i Storage. |
