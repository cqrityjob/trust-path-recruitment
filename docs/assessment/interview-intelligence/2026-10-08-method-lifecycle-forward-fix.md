# Återkallning och nya intervjustarter: avgränsad framåtriktad fix

Underlag: main `8c9b3138bcb801ac69aa44b14e9cb592da5ea50a`, egen gren `codex/method-revocation-v03`. Detta är en lokal schema-/testleverans, inte installerad eller publicerad funktion. Befintliga 387 migrationer bevaras; den nya migrationen är `20270310090000`.

## Bekräftat problem och ändring

Senast effektiva `scp_iv_case_start_basis(uuid,uuid,uuid)` kom från [20261108090000](../../../supabase/migrations/20261108090000_beskt_governed_method_content.sql#L500). Den kontrollerade arbetsgivarens aktivitet och pakettyp, men en giltig individuell pilotgrant kunde bli startgrund även efter `suspended` eller `retired`. [07090000](../../../supabase/migrations/20270307090000_interview_content_snapshot_lock.sql#L253) anropar samma grund vid direkt INSERT och [senaste create-RPC](../../../supabase/migrations/20261130090000_bcp_beskt_complete.sql#L1751) använder den också. 07100000,08090000,09090000 omdefinierade inte denna funktion.

[Ny migration](../../../supabase/migrations/20270310090000_interview_method_lifecycle_revocation.sql#L85) returnerar NULL för saknad, suspenderad eller pensionerad version **före** all grantfallback. Listan över startbara paket, create-RPC och direkt INSERT-bindning använder därmed samma spärr. Ett tillgängligt utkast eller ett begränsat utkast med giltig separat grant är fortsatt möjligt enligt befintlig pilotpolicy. Detta godkänner inte utkastets metodinnehåll.

Den befintliga [grant-triggern](../../../supabase/migrations/20260921090000_scp_interview_integrity_hardening.sql#L486) stoppade även återkallning av en redan existerande grant för publicerat/suspenderat/pensionerat innehåll. Ny trigger tillåter enbart en verklig övergång från NULL till ett `revoked_at`, med `revoked_by` och ett icke blankt `revocation_reason`. Alla andra fält måste vara identiska, inklusive identitet, arbetsgivare, paket, giltighet, kohort, miljö, syfte och ursprunglig tilldelning. Skälet behövs också för det gamla CHECK-villkoret. Ny tilldelning, förlängning och andra ändringar behåller de gamla status- och produktionsgranskningsspärrarna. Befintlig audit skriver återkallningshändelsen; inga gamla händelser ändras.

Inga nya klienträttigheter eller RPC:er införs. Authenticated/anon har fortsatt ingen INSERT/UPDATE-rätt till grants. Återkallning sker genom redan behörig service-/databasadministrationsväg; detta är ingen ny arbetsgivaradministration i UI. Befintliga publisher-RPC:er kräver fortfarande publisher-roll och skäl.

## Samtidighet och historik

Grant INSERT/UPDATE tar samma privata innehållslås före radlås som ny ärendestart. Suspend/retire-RPC:erna behåller behörighetskontrollen först och tar därefter innehållslåset före sitt `FOR UPDATE`. Tidigare kunde dessa två RPC:er ta radlåset före statement-triggerns innehållslås och hamna i motsatt ordning mot create. Inga nya offentligt anropbara lås eller globala användarlås införs.

Befintliga ärendens läsning, fortsatt sessionsarbete och frysta rapporter ändras inte. För två faktiskt skapade ärenden kör sviten det vanliga AI-avstängda flödet, varav ett når fastställd rapport. Återkallningen bevarar deras fulla snapshots, åtta kärnfrågor, sex kompetenser, gamla innehållshash och fastställd rapport. Inga rollfrågor, metodtexter, bedömningar, godkännanden, legacy-hashar eller gamla rapporter uppdateras av migrationen.

## Utförd verifiering

Isolerad native PostgreSQL16 på loopback55710, egen `ri_v03_lifecycle_ci_test`, från den fullständiga 387-migrationsbasen. Auth-identifiering är SQL-teststubb med riktiga SET ROLE/RLS-regler. Den är **inte** riktig GoTrue eller PostgREST.

| Kontroll | Faktiskt utfall |
|---|---|
| Ny migration appliceras efter senaste schema | PASS, i egen lokal databas |
| [Lifecycle SQL](../../../supabase/tests/interview_method_lifecycle_test.sql) | 124 assertioner PASS; alla fixtures ROLLBACK |
| Negativa SQL-kontroller | Samma assertions upptäcker återinförd terminal grantfallback och tillåten co-field-ändring; definitionerna återställs genom savepoints |
| [Tvåsession-race](../../../scripts/interview-method-lifecycle-check.sh) | 13 assertioner PASS, fyra faktiska ordningar |
| Grant återkallas först → ny start | Start väntar på innehållslåset, nekas sedan; inget ärende kvar |
| Ny start först → grant återkallas | Båda avslutas utan deadlock; tidigare ärendes atomiska snapshot kvar |
| Publisher suspenderar först → ny start | Start väntar, nekas sedan; inget ärende kvar |
| Direkt bindning först → publisher pensionerar | Båda avslutas; tidigare snapshot kvar, efterföljande startgrund NULL |
| Befintlig snapshot-installationssvit | 94 PASS, rollbackvägran och tre befintliga races PASS i egen historikkopia |
| Befintlig historisk integrity-svit | 99 PASS, oförändrade assertioner, efter kontrollerat tomt snapshotstanddown |
| Produktens rollbackfil | Vägrar med `SCP_IV_LIFECYCLE_ROLLBACK_UNSAFE`; fyra funktionsdefinitioners digest identisk före/efter |
| Statiska migrations-/dublett-/SQL-säkerhetskontroller | PASS för388 aktiva migrationer; ingen breddad anonym skrivning/definer-åtkomst |
| Shellsyntax/Python AST/git diff-check | PASS |

Race4 använder en syntetisk direkt tabellägar-INSERT med uttryckligen bunden tidigare draftmetod för att isolera ordningen bindning→retire. Det bevisar atomisk bindning och livscykel, inte publiceringsgodkännande eller kommersiellt innehåll. Privat fixture går genom tillåtna statussteg i en disposable databas utan att skapa godkända reviews. Grant-/versionsfixture är inte produktionsdata.

[db-test](../../../scripts/db-test.sh) kör den nya sviten och races efter full replay, före äldre rollbacktester, och kräver minst124 assertioner. [Historikstanddown](../../../supabase/tests/interview_method_lifecycle_historical_standdown.sql) är enbart för tom `ci_test`-databas: den tar bort den nya konsumenten av070:s privata helper inför äldre snapshottest. Den bevarar terminal-startspärr och grantåterkallningsskydd, vägrar vid befintliga cases/snapshots/locks och är ingen produktrollback. Gamla migrations-/rollbackfiler och gamla assertioner ändras inte.

## Återstående och återställning

Fullständig ny migrationsreplay och alla historiska sviter i slutlig CI återstår. Direkt HTTP mot faktisk PostgREST14.15, riktig Auth, browser, hosted parity och installation är ej utförda för denna ändring. Ingen produktionsskrivning, publicering, AI-kostnadsaktivering eller worker/cron ingår.

[Rollbackfilen](../../../supabase/rollback/20270310090000_interview_method_lifecycle_revocation_rollback.sql) återinför inte en tillåtelsebugg. Vid fel används en granskad kompatibel appversion och/eller ny framåtriktad SQL-rättning; snapshots, permanenta lås, rapporter och journaler ska bevaras. En historisk tidigare publicerad app är inte i sig en verifierad återställningsversion med senare data.

Innehållsgodkännande, komplett SV/EN, separat metodkomposition och kommersiella pilotbeslut är andra leveranser. Den här fixen tillverkar inga godkännanden och ändrar inte PEACE/ORBIT/TRUST-innehåll.
