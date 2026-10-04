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
| #412 | **separat, behålls** | databasmigration och releaseordning: publiceringen (`20270214090000`) som gör de 140 definitionerna valbara. Ägs av katalogsessionen och körs först när ägaren vill det |
| #422 | redan sammanslagen (releasepost för `20270212090000` och `20270213090000`) | |

#417 innehåller **ingen migration**. Ordningen mot katalogstacken spelar ingen roll för dess innehåll.

## Fast lista över det som faktiskt blockerar version 1

| # | Blockerare | Vem | Läge |
|---|---|---|---|
| B1 | Juridiken godkänns av ägaren och dateras: `OWNER_APPROVED` för villkor och policy, publiceringsdatum, bolagets adress, leverantörsfakta (avtalspart, region, överföringsstöd, loggtid, backuprotation, sessioner). Villkoren och policyn visas som utkast tills dess (banner, `noindex`, inte i sitemapen). | Ägaren | Öppen. Frågelistan i `docs/legal/open-facts-2026-10-04.md` |
| B2 | Tre lagringstider som ägaren inte har beslutat (standardtid för rekryteringsmaterial, granskningsloggar, de 339 gamla användningshändelserna). Policyn visar öppna punkter. | Ägaren | Öppen |
| B3 | Kontoradering verifierad hela vägen i produktion med testkontot (Lagringssteget). Allt övrigt är bevisat lokalt. Tills dess markeras raden `account` inte som verifierad. | Ägaren | Öppen. Fem steg i `docs/release/2026-10-04-account-erasure-full-path-evidence.md` |
| B4 | Gallringsrutinerna körs och loggas första gången (brevlådorna, leverantörsinställningarna). Policyn kan inte bli slutgiltig före dess. | Mostafa | Dokumenterade och provade. Ej körda |
| B5 | Kärnflöden och åtkomstkontroller som ännu saknar webbläsarbevis: stegen 11 och 15 (ägarens webbläsarprov, korrigerade anvisningar i `docs/release/2026-10-04-access-probes-steps-11-15.md`) och de steg som tidigare redovisats utan bevis. | Ägaren, med Astra | Läget är sist rapporterat, se slutrapporten |
| B6 | De två testliknande publika annonserna (Väktare och Säkerhetschef) ska bestämmas: behållas eller tas bort innan lansering. | Ägaren | Öppen (sist läst tidigare i dag) |
| B7 | Merge av #417 och publicering i den ordning slutrapporten anger, med ägarens godkännande av slutversionen. | Opus (genomför), ägaren (godkänner) | Efter grön CI |

Allt som tidigare stod som blockerare i den här leveransen och nu är löst: CV-utkastet kunde skicka karriäruppgifter till en AI-tjänst
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
- Revoka `anon`-behörigheten på `cd_record_funnel_event` (ingen anropar den längre) och radera funnel-tabellen när ägaren har beslutat.
- Betalmodell och generativ AI som separata betaltjänster med uttrycklig beställning (ägarens riktning för version 2). Spärren öppnas då i en granskad kodändring tillsammans med beställningsflödet och en uppdaterad policy.
- Fler språk än svenska och engelska, och en juridisk granskning av engelska villkor.
