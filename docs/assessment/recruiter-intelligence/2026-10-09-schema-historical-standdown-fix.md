# #464: avgränsad korrigering av historisk testrekonstruktion

Observation 2026-10-08 22:23 UTC (2026-10-09 svensk tid). Bas är draft-PR:ens
`b7a077b78bf4d64a6ab6aa08d470c6be951aaaf8`. Detta är testharness och
releaseprecision, ingen ändring av produktens schema, innehåll eller app.

## Första faktiska CI-försöket

PostgreSQL17-jobb `113566454394` nådde de nya livscykel-/arbetsytekontrollerna
men föll senare med `cannot drop function
scp_private.interview_content_statement_lock() because other objects depend
on it`. Den oberoende databasen i
[domänrunnern](../../../scripts/recruiter-domain-conflict-check.mjs) klonas från
hela aktuella schemat. Dess historiska 070-DOWN kördes före huvudrunnerns
senare livscykelstanddown. Den nya triggern `ri_pilot_grant_serialise` fanns
därför fortfarande kvar som ett beroende till den gamla låsfunktionen.
Försöket är ett faktiskt CI-fel, inte ett fullständigt DB-PASS.

## Korrigering och bevarade gränser

Domänklonen kör nu samma befintliga
[historikstanddown](../../../supabase/tests/interview_method_lifecycle_historical_standdown.sql)
före 070-DOWN. Den kräver ett `ci_test`-namn och frånvaro av ärenden,
snapshots och permanenta innehållslås. Enbart den kända nya konsumenten tas
ned; ingen `CASCADE` används och ingen produktrollback ändras.

Efter äldre fixture, 070-installation och 071-installation återappliceras
exakt befintlig
[M1-migration](../../../supabase/migrations/20270310090000_interview_method_lifecycle_revocation.sql)
innan någon assertion mot aktuellt schema körs. En ytterligare kontroll
kräver aktiv grant-trigger samt terminal-startspärr. Alla tidigare
domänassertioner, negativa kontroller och faktiska HTTP-prov finns kvar.
Migrationsfiler, rollbackfiler, SQL-sviter och deras assertioner är oförändrade.

## Fokuserat lokalt utfört

Egen `ri_v03_standdown_464_ci_test`, native PostgreSQL16.14 på loopback55710.
Auth-identifiering är SQL-stubb med faktiska databasroller; det är inte riktig
GoTrue eller HTTP. Det redigerade
[läsbeviset](evidence/2026-10-09-schema-historical-standdown/focused-readback.json)
innehåller antal och digests, inga kandidattexter eller hemligheter.

| Kontroll | Faktiskt utfall |
| --- | --- |
| Den ursprungliga utelämnade standdownen | Samma beroendefel reproducerat i rollbackad lokal transaktion. |
| Korrigerad ordning: 071-DOWN → tom standdown → 070-DOWN → äldre fixture → 070 → 071 → M1 | PASS. M1:s fyra funktionskroppar, ägare, ACL och konfiguration återställs exakt. |
| Oförändrade SQL-sviter efter rekonstruktion | Foundation56, snapshot94, domän31, M1 124, workspace36 och äldre P1 95 PASS. M1/workspace kördes även före rekonstruktionen; upprepningar är inte nya unika kontroller. |
| Faktiska tvåsessionsprov | M1:13 assertioner/fyra ordningar PASS. Workspace:14 assertioner för CAS/idempotens och audit/DOWN-race PASS. |
| Återställningsskydd | M1:s osäkra DOWN vägrar både tomt och adopterat schema. Historikstanddown och snapshot-DOWN vägrar adopterad syntetisk historik utan ändrade ärenden, snapshots, lås eller rapporter. |
| Workspace-DOWN/reapply | Icke tom audit vägras; tom DOWN behåller äldre P1-kroppar/ACL/config, exakt återapplicering och samma36 assertioner PASS. |
| Ändrad runner | Node-syntax, repo-ESLint och diff-check PASS. |

Full DB-runner, faktisk PostgREST14.15-transport och ny remote CI är **inte**
utförda i denna lokala körning. Ingen Docker, hosted skrivning, installation,
publicering, riktig Auth/Storage, browser eller fysisk telefon ingår. Ett
fokuserat SQL-PASS ersätter inte slutlig CI på nytt PR-head.

## Schema-merge och installation

[Releaseordningen](../../release/2026-10-03-release-order.md#fyra-regler-som-avgör-ordningen)
säger att schema-merge utlöser officiell installation. Draft-PR, push och CI
innebär ingen sådan installation; PR:en hålls omärgad tills releaseägaren har
fattat installationsbeslut. Installationsordning är `20270310090000` före
`20270310100000`, därefter faktisk katalog-/ledger-/databevarande-verifiering
och bokföring före klientleverans. www-publicering är separat.
