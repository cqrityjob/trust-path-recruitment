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
| #412 | redan sammanslagen i `main` (`3e3a66c6`) | den innehåller migrationen `20270214090000` som gör de 140 definitionerna valbara. Dess läge i `supabase/release-state.json` är `pending` i den hostade databasen: den tillämpas av publiceringen, inte av #417, och ägs av katalogsessionen. #417 har slagit in `main` och rör varken `release-state.json` eller frontier-guarden |
| #422 | redan sammanslagen (releasepost för `20270212090000` och `20270213090000`) | |

#417 innehåller **ingen migration**. Ordningen mot katalogstacken spelar ingen roll för dess innehåll.

## Fast lista över det som faktiskt blockerar version 1

| # | Blockerare | Vem | Läge |
|---|---|---|---|
| B1 | Juridiken godkänns av ägaren och dateras: `OWNER_APPROVED` för villkor och policy, publiceringsdatum, bolagets adress, leverantörsfakta (avtalspart, region, överföringsstöd, loggtid, backuprotation, sessioner). Villkoren och policyn visas som utkast tills dess (banner, `noindex`, inte i sitemapen). | Ägaren | Öppen. Frågelistan i `docs/legal/open-facts-2026-10-04.md` |
| B2 | Tre lagringstider som ägaren inte har beslutat (standardtid för rekryteringsmaterial, granskningsloggar, de 339 gamla användningshändelserna). Policyn visar öppna punkter. | Ägaren | Öppen |
| B3 | Gallringsrutinerna körs och loggas första gången (brevlådorna, leverantörsinställningarna). Policyn kan inte bli slutgiltig före dess. | Mostafa | Dokumenterade och provade. Ej körda |
| B4 | Kärnflöden och åtkomstkontroller som ännu saknar webbläsarbevis: stegen 11 och 15 (ägarens webbläsarprov, korrigerade anvisningar i `docs/release/2026-10-04-access-probes-steps-11-15.md`) och de steg som tidigare redovisats utan bevis. | Ägaren, med Astra | Läget är sist rapporterat, se slutrapporten |
| B5 | De två testliknande publika annonserna (Väktare och Säkerhetschef) ska bestämmas: behållas eller tas bort innan lansering. | Ägaren | Öppen (sist läst tidigare i dag) |
| B6 | **Ägarens beslut före sammanslagning och publicering:** villkoren och policyn är utkast med banner, `noindex` och en öppen punkt. När #417 slås samman och publiceras blir den nya utkasttexten synlig på `/villkor` och `/integritetspolicy` medan `TERMS.date` är oförändrat och `OWNER_APPROVED` är `false`. Ägaren sade att inga juridiska texter ska publiceras innan slutversionen är godkänd. Alternativ: (a) slå samman men publicera först när ägaren godkänner, (b) slå samman och publicera nu, med utkastbannern som enda skydd. Rekommendation: (a). | Ägaren (beslutar), Opus (genomför) | Öppen |
| B7 | Merge av #417 och publicering i den ordning slutrapporten anger, med ägarens godkännande av slutversionen. Katalogsessionen har bett om att dess egen publicering verifieras före annan publicering; #412 är sammanslagen men migrationen `20270214090000` är `pending` i den hostade databasen, så ordningen vid publicering (migrationen, sedan registreringsposten för katalogen) är deras och Opus ansvar, inte #417:s. | Opus (genomför), ägaren (godkänner) | Efter grön CI och B6 |

Allt som tidigare stod som blockerare i den här leveransen och nu är löst: kontoradering hela vägen i produktion (testkontot med Passport-underlag raderades 2026-10-04 08:00 UTC och kontrollerades skrivskyddat, `docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5; raden `account` är `live`; en kvarvarande Storage-fil prövades inte), CV-utkastet kunde skicka karriäruppgifter till en AI-tjänst
(spärrat i koden), tre texter lovade AI (rättade), mätningen sparade statistikmarkeringar (avstängd), policyn nämnde nyhetsbrev och automatisk
vidarebefordran som inte finns (borttaget), biträdesavtalet hänvisade till ett företagsavtal som inte finns (borttaget), gallringsplanen
presenterade tre förslag som beslut (rättat).

## Backlog för version 2 (inte blockerare)

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
