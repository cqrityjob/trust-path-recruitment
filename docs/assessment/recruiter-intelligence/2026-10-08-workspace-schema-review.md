# Recruiter Intelligence v0.3: schema för volymarbetsytan

Observation och lokal verifiering 2026-10-08. Den här leveransen är en
**schema-först-kandidat**, inte ett installations- eller publiceringsbevis.
Bas: `8c9b3138bcb801ac69aa44b14e9cb592da5ea50a`, med normal merge av
livscykelkorrigeringen `f74e7901280dc006596a1fcf5a000b4bb1a703ee` och dess
pending-bokföring `62344fc3032ae04d3fe45491f25cbe799952d0be`.

### Integration efter portalens slut-CI

Den 2026-10-09, svensk tid, integrerades mergad main
`55db1e3b83ace033450899a93ca0961edde05217` med vanlig merge
`8dfec6c47e42074d808c30939cebf0c63defce55`. #463:s granskade huvud
`254005dd655371baa81188026b75ec8758f0c37e` hade 24 körda SUCCESS,
fyra avsiktliga villkorsskip och inga väntande eller misslyckade jobb.
Detta återanvänder portalens schemaoberoende kod och registerbegränsade
image-retry; ingen ny klientfunktion införs i denna schema-gren.

De nya SQL-, rollback-, fixture- och racefilerna är oförändrade från den
lokalt verifierade kandidaten ovan. De tidigare SQL-resultaten är fortsatt
lokala versionsbundna bevis, inte en ny full replay eller ett hostedprov.
Efter integrationen passerade migrationspolicy, normal release-parity,
release-frontier, SQL-säkerhet och dubblettkontroll. Båda migrationerna är
fortfarande ärligt `pending`. Full remote CI på PR:s slut-SHA återstår;
ingen produktionsinstallation eller publicering har utförts.

## Förändring och kontrakt

[20270310100000](../../../supabase/migrations/20270310100000_recruiter_profile_change_review.sql)
lägger till sex autentiserade RPC:er och en privat historiktabell. Migrationen
är samma SQL som arbetsytans förberedda schema; klientkod ingår inte här.
CLI-filen skapades som `20261008181238` och fick den reserverade kanoniska
slotten. Föregångaren `20270310090000` ska installeras först. Båda är markerade
`pending`; tidigare installerade identiteter och ledger har inte ändrats.

| RPC                                                                                            | Ansvar och gräns                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rec_ri_profile_change_impact(job, expected_version)`                                          | Behörig medlems läsning av mottagna, aktiva, arkiverade, återkallade, beslutade och granskade aktiva ansökningar för aktuell profilversion.                                                                          |
| `rec_ri_confirm_reviewed_profile(job, expected_version, operation, start_date, rules, reason)` | Befintlig managerbehörighet; låser annonsraden, kräver skäl, kontrollerar version och sparar tidigare profil samt påverkan tillsammans med den nya profilen. Samma aktör och identiska operation får samma resultat. |
| `rec_ri_profile_change_history(job)`                                                           | Behörig medlem läser historik skapad av den nya wrappern, inklusive aktör, tid, skäl, tidigare profil och påverkan. Ingen fabricerad historik för äldre ändringar.                                                   |
| `rec_ri_compare_applications(job, profile, applications)`                                      | Två eller tre olika ansökningar i samma annons, mot senaste profil. Originalunderlag läses genom befintligt behörighetsbegränsat gransknings-API.                                                                    |
| `rec_ri_next_unreviewed(employer, optional_job)`                                               | Global kö före sidindelning. Återkallade, arkiverade, beslutade och ansökningar i avslutad/arkiverad rekrytering ingår inte i kvarvarande arbete; historiskt uteslutna redovisas separat.                            |
| `rec_ri_page_evidence(job, profile, applications, requirements)`                               | Högst 100 olika ansökningar och tre befintliga krav i senaste profil. Returnerar underlag; en visningskolumn skapar inget krav eller beslut.                                                                         |

Den privata tabellen `recruiter_intelligence.profile_change_reviews` har RLS,
ingen direkt rätt för `PUBLIC`, `anon` eller `authenticated`, och spärrar
ändring, radering och TRUNCATE. Befintliga kontrollerade FK-raderingar och
aktörens kontoradering hanteras separat. Publika RPC:er återanvänder befintlig
medlems-/managerkontroll och ger uttryckligen ingen exekveringsrätt till `anon`
eller `PUBLIC`. Befintliga kravprofiler, livscykelstatusar, rapporter,
innehållssnapshots och permanenta innehållslås skrivs inte om av migrationen.

**Kvarstående releasegrind: äldre `rec_ri_confirm_profile` är fortfarande
exekverbart för befintliga behöriga managerklienter.** Skäl och påverkan är
obligatoriska genom den nya wrappern och den kommande klienten, men är inte en
universell API-spärr under schema-först-rullningen. Ett anrop till det äldre
API:et kan fortfarande skapa en profil utan en rad i den nya historiken.
Klientinstallation och beslut om den äldre skrivvägens fortsatta rättighet/
kompatibilitet måste därför granskas före ett påstående att alla
profiländringar kräver dokumenterad motivering. Den äldre signaturen kan inte
bära ett nytt obligatoriskt skäl utan en separat kompatibilitetsändring.
Ingen AI-adapter får använda någon skrivväg.

Källåterkallning och privat intervjuunderlag följer befintligt
`rec_ri_get_review` och dess källversioner. Här verifieras inga nya löften om
omedelbar cacheinvalidering, kandidatens återkallningsknapp eller gamla
signerade URL:ers upphörande. Bedömning är fortsatt mänsklig. Datum i en
kommande visningskolumn är registrerade datum kopplade till profilens beslutade
startdatum, inte ett påstående om att originalets giltighet har kontrollerats.

## Utförda kontroller

Egen databas `ri_v03_workspace_method_review_ci_test` i den isolerade native
PostgreSQL 16-miljön på loopback `127.0.0.1:55710`. Basen var den redan
replayade 387-migrationsmiljön. Båda nya forward-migrationerna applicerades
lokalt. Auth-identiteter och roller är SQL-fixtures/teststub; detta är inget
GoTrue-, REST-, Storage- eller driftprov.

| Kontroll                                                                                                                                                           | Faktiskt resultat                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ny SQL-svit](../../../supabase/tests/recruiter_workspace_test.sql) med [100 syntetiska ansökningar](../../../supabase/tests/fixtures/recruiter_workspace_100.sql) | 36 assertioner PASS, inklusive versionskonflikt, idempotens, skäl, medlem/outsider, privat historik, gamla profilbindningar och köavgränsning. Fixturen rullas tillbaka.                                |
| Samma SQL-svit efter exakt DOWN/reapply                                                                                                                            | Samma 36 assertioner PASS; dessa är en upprepning, inte 36 ytterligare unika beteenden.                                                                                                                 |
| [Två verkliga PostgreSQL-anslutningar](../../../scripts/recruiter-workspace-race.py)                                                                               | 14 assertioner PASS: konkurrerande owner/admin-confirm ger en profilversion och historikrad, förloraren får `PT409`/`RI_STALE_VERSION`; identisk vinnande operation återanvänds.                        |
| Konkurrerande DOWN                                                                                                                                                 | DOWN väntar på verklig pågående historikskrivning och vägrar efter commit; raden och alla sex RPC:er bevaras. Ingår i de 14 assertionerna.                                                              |
| [Rollback och reapply](../../../scripts/recruiter-workspace-check.sh)                                                                                              | Icke-tom historik vägrar DOWN. Tom DOWN tar bort enbart nya objekt; äldre P1-funktionsdefinitioner, ACL och konfigurationer har samma sammansatta fingerprint före/efter. Exakt forward återappliceras. |
| Oförändrad äldre P1-kravsvit                                                                                                                                       | 95/95 SQL-assertioner PASS efter den nya migrationen.                                                                                                                                                   |
| Lokal statisk migrationskontroll                                                                                                                                   | 389 kanoniska migrationer matchar policy. Release-parity-kontrollen PASS; ingen klient refererar till den nya pending-migrationen i denna gren.                                                         |
| Release-frontier, SQL-säkerhet och dubblettkontroll                                                                                                                | PASS; exakt två pending-migrationer, inga versionkollisioner eller aktiva SQL-dubbletter.                                                                                                               |
| Hård release-parity-grind                                                                                                                                          | Avsiktligt FAIL/exit 1 eftersom de två migrationerna ännu inte är installerade; inget driftsklart-påstående.                                                                                            |

[db-test.sh](../../../scripts/db-test.sh) registrerar den fokuserade SQL-/race-/
rollbackkontrollen efter aktuell P1-svit och före dess historiska DOWN. Den
nya tomma arbetsytans DOWN körs då innan äldre P1-schema tas bort. Befintliga
SQL-testfiler och deras assertioner har inte försvagats.

Full strikt replay/hela DB-runnern är **inte verifierad lokalt**: den gemensamma
miljön stoppades tidigare vid Docker/PostgREST-image-I/O. Fokuserade egna SQL-
och tvåanslutningsprov ovan är genomförda; remote CI och faktisk HTTP/RLS med
riktiga Auth-sessioner återstår. Inga nya browser-, mobil-, telefon-, hosted-
eller AI-prov utfördes för denna schema-leverans. Inga produktionsskrivningar,
meddelanden, retention-worker/cron eller AI-kostnader ingår.

## Installation, klient och återställning

Merge och installation hanteras separat av releaseägaren. Installera schema i
ordning, verifiera ledger, fulla funktioner/defaults/ägare/ACL/config, privata
objekt/guards och tidigare skyddad data genom läsning, och bokför faktisk
installation innan klienten använder RPC:erna. Klientens profilversionsbindning,
skäl-/påverkansvisning, källpanel och visningskolumner behöver egna accepterade
UI/HTTP-prov. Godkännande av metodtexter, draftstatus och engelska innehållsluckor
är separata innehållsbeslut; detta schema godkänner inget metodinnehåll.

[DOWN](../../../supabase/rollback/20270310100000_recruiter_profile_change_review_rollback.sql)
låser den nya tabellen före tomhetskontrollen. Tomt schema kan tas ned i den
isolerade testmiljön; en enda historikrad gör att DOWN vägrar. För använd data
är en kompatibel klientåterställning och framåtriktad schemakorrigering den
avsedda vägen. Ingen återställning får tyst kasta kravhistorik, snapshots,
permanenta lås, rapporter eller upload-journal. Ett äldre publicerat app-head är
inte därmed ett verifierat rollbackmål för den nya datan.
