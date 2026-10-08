# RI v0.3: framåtriktad domänkonflikt- och låsordningsrelease

Schemaimplementation `b4c86120ce97ebd43d5bcc6ba41241158676f089`, main-bas `c1d154420c4477c56f1fbeeecf7933e0171bf5e1`. Detta är en ny migration20270307100000 efter faktiskt installerad snapshot20270307090000. Ingen tidigare applicerad migrationsfil ändras. Ägarens liveuppdrag2026-10-08 auktoriserar normal merge/officiell installation efter godkända kontroller. Lokalt Colima-I/O har blockerat vissa slutprov; de får inte uppgraderas tillPASS av dokumentationen.

## Problem och resulterande beteende

En andra flik med föråldrad processrevision ska få ett ändligt versionskonfliktsvar. PostgREST14 upprepade tidigare den avsiktliga40001-grenen utan att returnera till klienten. Det riktiga lokala provet gav618fel inom fyra sekunder. Ett parallellt statebyte låste session före eventets case-FK medan processsparning tog case före session, vilket gav faktisk40P01. [Bevarat fel och orsak](../assessment/recruiter-intelligence/2026-10-08-domain-conflict-transport.md), [Supabases primärdokumentation](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

Exakt tre intervju-CAS och sju befintliga rekryterings-/receipt-CAS returnerar nuPT409/HTTP409 med samma domänmeddelanden. Riktig PostgreSQL40001 lämnas kvar för verkliga serialiseringsfel. Förväntad domängren måste matcha exakt en gång; migrationen vägrar vid avvikande installerad definition. Signaturer, defaults, ägare, ACL och konfigurationer bevaras.

Session-state och processsave tar case före session medFOR NO KEY UPDATE. Det serialiserar samma ärendes process/state men tillåter child-FK:sKEY SHARE. Direkt manuell findingreview och review-RPC tar kompatiblaKEY SHARE på case, medan findingraden och revisionen förblir exklusiva. Rapportfinaliseringens uttryckligaFOR UPDATE väntar på pågående review. Skapandets idempotens/exklusiva case-lås bevaras. Inga kandidatbeslut, livscykelregler, snapshots, använda innehållslås eller fastställda rapportbytes ändras.

## Grindar före installation och apppublicering

1. Exakt huvud ska passera samtliga obligatoriska CI-jobb: strict full canonical PG17replay, ny current-schema-domänsvit31, P0foundation/snapshot, äldre deadlocknegativkontroll, forward session/process/findingrace, faktiskPostgREST14 med begränsade anrop, engine40001 och exakt rollback/reapply. De gamla historiska40001-förväntningarna finns kvar och körs på återställda gamla definitioner. Ingen historisk assertion försvagas.
2. Schemafirst bekräftar att PR:n inte innehåller src-konsumenter. Normal merge gör att officiell Supabase GitHubintegration installerar endast07100000 på `wrygicdfxwjnrugduxnt`. Ledger384 är redan installerad och körs inte igen.
3. Läsande hostedbevis ska visa endast en ny kanonisk ledgeridentitet, oförändrade tidigare384,12 berörda function-SHA256/defaults/owner/ACL/config och privat definitionsjournal medRLS/inga anon-auth-service-läsrättigheter. Jämför med exakt CI-replay. Snapshot20funkatalogen ska också matcha den nya fulla replayn, inklusive ändrad acknowledge-body. Befintliga ärende-/rapport-/snapshot-/ACK-aggregat redovisas separat.
4. Först efter detta uppdateras07100000 tillapplied med bevis och tas bort frånexpectedPending. Snapshot-app#452 uppdateras mot main och kör obligatorisk CI på sitt nya exakta huvud.
5. Färskt riktigt GoTrue/Storage/14-browserprov måste verifiera tvåflikskonflikten utan retryloop/deadlock, senaste sparade data och fortsatt manuellt rapportflöde före apppublicering. LinuxCI används om delad lokal Colima är otillgänglig. Publicerad commit/sourcehash läses faktiskt på cqrityjob.com. HostedAuth/Storagedriftprov kräver dessutom bounded syntetiska konton; fysisk telefon redovisas separat.

## Återställning

Bevara den additiva privata definitionsjournalen, snapshots, rapporter och audit. Återställ i första hand app till senaste kompatibla version och rätta schema framåt med en ny granskad migration. [Capabilityrollback](../../supabase/rollback/20270307100000_recruiter_domain_conflict_transport_rollback.sql) återställer exakt12 gamla definitionskroppar utan kandidat-DML, men återinför kända custom40001-/låsordningsfel på14. Den är testad som regressionsbevis och är ingen säker standardåterställning för samtidiga intervjuskrivningar. Ingen omstart/prune av delad Colima eller radering av test-/verkliga databaser ingår i denna release.

Källor: [migration](../../supabase/migrations/20270307100000_recruiter_domain_conflict_transport.sql), [mandatory runner](../../scripts/recruiter-domain-conflict-check.mjs), [läsande katalog](../../supabase/tests/recruiter_domain_conflict_catalog.sql), [faktiskt installerad450](2026-10-08-interview-content-snapshot-hosted-verification.json), [full aktuell/historisk svit](../../scripts/db-test.sh).
