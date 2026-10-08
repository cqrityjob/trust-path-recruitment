# Rekryteringskonflikter och låsordning, framåtriktad korrigering

Bas: `c1d154420c4477c56f1fbeeecf7933e0171bf5e1`. Migration: `20270307100000_recruiter_domain_conflict_transport.sql`, skapad via Supabase CLI och omnumrerad från `20261008074656` till nästa kanoniska plats. Den installerade innehållsmigrationen `20270307090000` ändras inte.

Det tidigare tvåfliksfelet är bevarat i [den ursprungliga felbevisningen](evidence/2026-10-08-real-cas-deadlock-cycle.txt). En avsiktlig domänkonflikt skickade SQLSTATE `40001`; faktisk PostgREST14.15 gjorde fortsatta transaktionsförsök och klienten stannade i ”Sparar…”. Samtidigt tog session-state sessionraden före ärendet, medan process-save tog ärendet före sessionen. Eventets främmande nyckel begärde KEY SHARE på ärendet och fullbordade låscykeln. Cykeln innehöll inget nytt innehållsadvisory-lås. Leverantörens [felsökningsanvisning för PostgREST14](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) beskriver samma problem med egna `40001`-fel.

Korrigeringen behåller alla felmeddelanden, argument, defaults, ägare, ACL, granskning, livscykel och mänskliga beslut. Exakt tio befintliga RPC:s avsiktliga CAS-grenar returnerar `PT409`, vilket ger HTTP409 utan serialiseringsretry:

- `scp_iv_save_session_process`: `SCP_IV_SESSION_PROCESS_STALE`.
- `scp_iv_review_manual_finding`: `SCP_IV_FINDING_STALE`.
- `scp_iv_acknowledge_observed_content`: `SCP_IV_CONTENT_STALE`.
- `rec_set_recruitment_responsible`, `rec_complete_recruitment`, `rec_set_application_responsible`, `rec_save_booking`, `rec_set_booking_status`, `rec_set_receipt_settings`: `STALE_VERSION`.
- `rec_set_application_stage`: `STALE_APPLICATION_STAGE`.

Anteckningars tidsstämpel-CAS sker i den befintliga klientens direkta villkorade UPDATE och skapar inget serverfel `40001`. Rapportpreview/finalisering använder redan `23514` för sina inaktuella underlag. De behöver ingen SQLSTATE-ändring. Verkliga serialiseringsfel, Sentinel och CV-funktioner ändras inte. Ny P1 har sin separata ännu inte installerade korrigering och ingår inte i denna migration.

Session-state och process-save tar först ärendet och därefter sessionen med FOR NO KEY UPDATE. Låsen serialiserar dessa skrivningar och blockerar finaliseringens FOR UPDATE, men är förenliga med KEY SHARE från barnens främmande nycklar. Manuell RPC-review och befintlig direkt owner/admin-review tar ett delat FOR KEY SHARE på ärendet och exklusivt lås på kontrollpunkten. Det bevarar revision/tidsstämpel/aktör och blockerar finalisering utan motsatt låscykel. Skapande behåller ärendets exklusiva lås för sin befintliga idempotens. Inga bredare skrivrättigheter införs.

## Obligatorisk verifiering

[db-test.sh](../../../scripts/db-test.sh) registrerar [den nya fristående kontrollen](../../../scripts/recruiter-domain-conflict-check.mjs) direkt efter strikt full replay. Kontrollen använder en egen databas, kör P0:s befintliga åtkomst-/rapportsvit med tre uttryckliga PT409-förväntningar och innehållssvitens enda motsvarande förväntning, samt [31 nya SQL-assertioner](../../../supabase/tests/recruiter_domain_conflict_transport_test.sql). De gamla testfilerna behåller sina historiska40001-förväntningar. På den tomma huvudtestdatabasen återställs framåtkorrigeringen innan hela den gamla historiska rollbackkedjan körs.

Kontrollen planterar en felaktig SQLSTATE och kräver att den verkliga P0-assertionen misslyckas. Två faktiska SQL-anslutningar återskapar den äldre event-FK-låscykeln med sparade tidigare definitioner, sedan kräver samma förlopp en ändlig PT409 med den nya ordningen. Direkt kontrollpunkts-UPDATE och review-RPC körs samtidigt. Rollback vittnas mot samtliga tolv tidigare funktionsdefinitioner och SHA256 av oförändrade rapporter/snapshots/permanenta lås; reapply kräver identiska funktioner/defaults/ägare/ACL/config.

API-delen kör riktig PostgREST14.15 i en loopbackbunden Docker-container och kräver HTTP409 för samtliga tio CAS-grenar samt samtidiga state/process-anrop. Den verifierar att inga fortsatta inaktuella anrop ligger kvar. CI använder lokala signerade syntetiska fixture-JWT. `00_bootstrap` läser en äldre claims-GUC; en tydligt testlokal pre-request-brygga för över den redan signaturverifierade sub-claimen. Ingen produktfunktion, `auth.uid`, behörighet eller verklig GoTrue-stack ändras av denna brygga. Verklig GoTrue/browser-verifiering är ett separat operativt prov och får inte härledas från CI-fixturetransporten.

Utfört 2026-10-08 i egen PostgreSQL17 på loopback55694: strikt replay av385 migrationer, nuvarande P0-svit56, snapshot94 och domänsvit31 PASS. Den planterade felaktiga SQLSTATE:n får P0.32 att falla. Samtliga12 definitioner återställs exakt; rapporter/snapshots/permanenta lås har samma SHA256; reapply bevarar definitions-/defaults-/owner-/ACL-/configvittnet. Äldre session/case-cykel återskapas som40P01. Forward session/process och direkt finding/RPC-review väntar, får PT409 och saknar deadlock. Produktmigrationen ändrades inte efter dessa prov.

BLOCKERAT: slutlig faktisk API14, real-GoTrue tvåfliksbrowser efter fix, full historisk `db:test` och den senast tillagda verkliga engine40001-racen. Hostdisktryck följdes av Docker-I/O-fel, nekad TCP på egen55694 och ohälsosam real-Auth/Storage-stack. Ingen global Colima-omstart, prune, äldre volymradering eller fixture-reset utfördes. Den slutliga runnerns testlokala claims-brygga och HTTP-overlap är obligatoriska men ännu inte lokalt godkända; CI måste passera dem på exakt slut-SHA. De äldre12/12 real-browser-proven gäller tidigare schema384 och bevisar inte att den nya samtidighetsfixen fungerar. Ingen fysisk telefon har provats.

[Den läsande katalogselektorn](../../../supabase/tests/recruiter_domain_conflict_catalog.sql) ger de12 berörda definitionernas SHA256, argument/defaults, ägare, ACL och config samt återställningsjournalens RLS/åtkomst. Den tidigare snapshotselektorn med20 funktioner behålls; väntad definition för `scp_iv_acknowledge_observed_content` måste nu komma från full kanonisk385-replay.

## Installation och återställning

Schema först, därefter den tidigare granskade snapshot-klienten. Ingen klientändring behövs för de befintliga felmeddelandena. Den nya privata återställningsjournalen lagrar tolv tidigare funktionsdefinitioner, har RLS och saknar klient/service-role-behörighet. [Rollback](../../../supabase/rollback/20270307100000_recruiter_domain_conflict_transport_rollback.sql) återställer dessa exakt och tar bort endast journalen. Den rör inga kandidater, rapporter, innehållslås, snapshots eller godkännanden.

Rollback återinför de kända riskerna med egna40001-fel på PostgREST14 och den gamla låsordningen. Stoppa samtidiga intervju-/rekryteringsskrivningar vid en sådan capability-recovery och föredra en framåtriktad korrigering. Varken installation eller rollback är utförd i hosted miljö av denna granskning.
