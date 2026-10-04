# Version 1: slutstatus, fast blockerlista och backlog för version 2 (2026-10-04)

Detta är det enda dokumentet som säger vad som återstår för version 1. **Listan över blockerare är fast.** Ett nytt
förbättringsförslag går till backloggen för version 2 längst ned. Bara ett nytt fel som påverkar säkerhet, lagkrav eller
ett kärnflöde får utöka listan, och då med skäl.

Ingen AI-aktivering och ingen betalmodell ingår. Inget publiceras utan ägarens godkännande. `OWNER_APPROVED` är ändrad av ingen.

## En PR

Allt arbete för version 1 som inte kräver en egen releaseordning ligger i **#417**: AI-spärren, de rättade texterna, den
avstängda funnel-mätningen, gallringsrutinerna, juridiken, JWT-testerna för kontoradering (kom från #423) och beviset för
kontoradering. Ersatta PR är stängda först efter att deras arbete fanns i #417.

| PR | Läge | Skäl |
|---|---|---|
| #417 | **den samlade lanserings-PR:en** | |
| #419, #420, #421, #425, #423, #424 | ersatta av #417 (stängda) | arbetet finns i #417 |
| #410, #411 | redan sammanslagna i `main` (schema och applikation för certifikatkatalogen) | |
| #412 | redan sammanslagen i `main` (`3e3a66c6`) | den innehåller migrationen `20270214090000` som gör de 140 definitionerna valbara. Den är **tillämpad och verifierad i produktion** (ledgern har 373 rader, 140 definitioner aktiva), registrerad av #426 (`a387273f`). #417 har slagit in `main` och rör varken `release-state.json`, `hosted-ledger.json` eller frontier-guarden |
| #422 | redan sammanslagen (releasepost för `20270212090000` och `20270213090000`) | |

#417 innehåller **ingen migration**. Ordningen mot katalogstacken spelar ingen roll för dess innehåll.

## Fast lista över det som faktiskt blockerar version 1

| # | Blockerare | Vem | Läge |
|---|---|---|---|
| B1 | Juridiken godkänns av ägaren och dateras: `OWNER_APPROVED` för villkor och policy, publiceringsdatum, bolagets adress, leverantörsfakta (avtalspart, region, överföringsstöd, loggtid, backuprotation, sessioner). Villkoren och policyn visas som utkast tills dess (banner, `noindex`, inte i sitemapen). | Ägaren | Öppen. Frågelistan i `docs/legal/open-facts-2026-10-04.md` |
| B2 | Lagringstider: rekryteringsmaterial (24 månader efter avslutad rekrytering), säkerhets- och behörighetsloggar (högst 12 månader) och tekniska loggar (normalt 90 dagar) är **beslutade** och införda i planen, policyn, biträdesavtalet och runbooken. Det som återstår är att leverantörernas inställningar läses och bekräftas (R8) och att övriga granskningsposter och de 339 mätraderna klassificeras. Policyn visar öppna punkter tills dess. | Ägaren (R8), Mostafa | Öppen, men inte beslut utan uppgifter och klassificering |
| B3 | Gallringsrutinerna körs och loggas första gången (brevlådorna, leverantörsinställningarna). Policyn kan inte bli slutgiltig före dess. | Mostafa | Dokumenterade och provade. Ej körda |
| B4 | Kärnflöden och åtkomstkontroller som ännu saknar webbläsarbevis: stegen 11 och 15 (ägarens webbläsarprov, korrigerade anvisningar i `docs/release/2026-10-04-access-probes-steps-11-15.md`) och de steg som tidigare redovisats utan bevis. | Ägaren, med Astra | Läget är sist rapporterat, se slutrapporten |
| B5 | De två testliknande publika annonserna (Väktare och Säkerhetschef) ska bestämmas: behållas eller tas bort innan lansering. | Ägaren | Öppen (sist läst tidigare i dag) |
| B6 | **Lovables besöksstatistik** (`/~flock.js`, kakan `session-id`) finns på varje publicerad sida. Policy §11 säger vad den registrerar och att den "håller på att stängas av". Meningen blir sann först när ägaren har stängt av den (Project settings → General → Publishing → Visitor analytics) och det är kontrollerat på den publicerade sidan. Gör ägaren det inte måste policyn beskriva behandlingen fullt ut och samtycke för kakan avgöras. | Ägaren (stänger av), Opus (kontrollerar live) | Öppen |
| B7 | Merge av #417 och publicering i den ordning slutrapporten anger. **Ägaren har beslutat 2026-10-04:** #417 får slås samman när alla granskningsfynd är rättade och den obligatoriska CI:n är grön på slutcommittet, och de uppdaterade juridiska utkasten får visas med tydlig utkastbanner. `OWNER_APPROVED` förblir `false`; det är inte ett slutligt juridik- eller lanseringsgodkännande. | Opus (verifierar och slår samman) | Efter grön CI på slutcommittet |

Allt som tidigare stod som blockerare i den här leveransen och nu är löst: kontoradering hela vägen i produktion (testkontot med Passport-underlag raderades 2026-10-04 08:00 UTC och kontrollerades skrivskyddat, `docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5; raden `account` är `live`; en kvarvarande Storage-fil prövades inte), CV-utkastet kunde skicka karriäruppgifter till en AI-tjänst
(spärrat i koden), tre texter lovade AI (rättade), mätningen sparade statistikmarkeringar (avstängd), policyn nämnde nyhetsbrev och automatisk
vidarebefordran som inte finns (borttaget), biträdesavtalet hänvisade till ett företagsavtal som inte finns (borttaget), gallringsplanen
presenterade tre förslag som beslut (rättat).

## Backlog för version 2 (inte blockerare)

- Rutin för säkerhets- och behörighetsloggar (`audit_logs`, högst 12 månader): torrkörning, radering och logg, skriven och provad före 2027-07-19 (första förfallodag). Klassificera också övriga granskningsposter (`job_audit_events`, `employer_moderation_events`, `sw_audit_events`) innan en tid bestäms.
- Rutin för rekryteringsmaterial (24 månader efter avslutad rekrytering) som kan avgöra varje rekryterings avslutsdatum, före 2028-08.
- Klassificera de 339 mätraderna (`cd_v31_funnel_events`) och besluta därefter om de raderas, behålls en tid eller avidentifieras.
- Granskningsloggen sparar en raderad persons e-postadress (`user_deleted`). Migration som slutar skriva adressen, om ägaren vill det.
- En raderad persons gravsten behåller lösenordshash. Rensa den.
- Automatisera gallringen (feedback, notisutkorg redan byggd men oschemalagd, inaktiva konton, rekryteringsmaterial med beslutad standardtid).
- `sweep_application_retention()` raderar efter 12 månader och körs aldrig. Anpassa den till beslutad tid, eller ta bort den.
- Återställ ett sparat CV till ett faktabaserat utkast (en riktig serverfunktion). I version 1 är knappen en länk till skaparen.
- Självbetjäning för export och radering av konto.
- Ett lokalt Storage-stöd i den lokala stacken, så att filradering kan provas utan produktion.
- Revoka `EXECUTE` på `cd_record_funnel_event` för `anon` och `authenticated` (migration `20260916090000` gav det; applikationen anropar den inte längre, men en klient med den publika nyckeln kan fortfarande skriva en rad direkt via PostgREST) och radera funnel-tabellen när ägaren har beslutat. Detta kräver en migration och är därför inte med i #417.
- Betalmodell och generativ AI som separata betaltjänster med uttrycklig beställning (ägarens riktning för version 2). Spärren öppnas då i en granskad kodändring tillsammans med beställningsflödet och en uppdaterad policy.
- Fler språk än svenska och engelska, och en juridisk granskning av engelska villkor.
