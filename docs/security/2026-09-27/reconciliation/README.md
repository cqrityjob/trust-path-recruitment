# Verifierad migrationsavstämning 2026-09-27

Main: `0b937ed4cde7a9c16cdb70365c3764139050e586`. Produktion:
`wrygicdfxwjnrugduxnt`. Denna PR ändrar bara bokföring, kontroller och bevis.

## Genomförd produktionskorrigering

Ägaren godkände minsta historikkorrigering efter backup och isolerat test.
[history-repair.sql](history-repair.sql) applicerades en gång: en INSERT av
`20261218090000 / client_table_privilege_hardening` med NULL statements.
Originalposten `20260927124146` behölls. Ingen migrations-SQL kördes igen.

Hela historiken sparades före ändringen: 320 poster inklusive statements och övriga
fält. Originalposternas full-row MD5 före/efter är identisk:
`7b6bca527143c518199d6991669674d0`, beräknad med
`md5(string_agg(to_jsonb(m)::text,E'\n' ORDER BY version))`.
Full backup har SHA256 `426941064ced5df503f2017ffb1acdc3cffb4657fa4ae9f95e395ecbee89f404`.
Efter att den temporära katalogen försvann återlästes de oförändrade 320 posterna
och sparades privat i huvudcheckoutens
`.git/security-audit-backups/20260927-before-alias.json` (0600).
Publicerade ledger-before/after.json innehåller bara version, namn och kroppshash.

Isolerat PG17-test före produktionsändringen: transaktionen lyckas en gång,
bevarar alla 320 originalposter och avvisar en andra körning. Den kontrollerar
hela snapshotens digest under lås och avbryter vid drift. Produktionskontrollen
visade 321 poster med oförändrad originaldigest och tom kanonisk aliaspost.
Efterkontroller visade oförändrade 357 relationsdefinitioner/RLS, 573 policyer,
41 kolumn-ACL, 24 default-ACL, 671 funktionsdefinitioner/ACL och 4284 DML-grants.
Klienternas administrativa grants är fortsatt noll. Verifierings-SQL finns i
[production-apply/verify.sql](../production-apply/verify.sql).

De två äldre migrationerna `20261216090000` och `20261217090000` fanns redan i
produktionshistoriken före säkerhetsfixen. De har inte körts i uppföljningen.
Release-state är nu applied baserat på faktisk ledger; det är inte ett nytt
verksamhetsdatatest av innehåll eller aktiveringsstatus.

## Faktisk deployplan

Supabase CLI 2.111.0 `db push --dry-run`, mot isolerad kopia av aktuell produktionsledger:

| Filer | Resultat |
| --- | --- |
| Aktuell main | Stopp: 20260927124146 saknar lokal fil; inga migrationer körs |
| Denna PR | upToDate=true, migrations=[], seeds=[], roles=[] |

Loggarna i denna mapp är riktiga CLI-resultat. Ingen produktions-CLI push kördes.
Den genererade identitetsfilen är endast kommentarer; kanonisk SQL behåller rätt
replayordning. En dokumenterad alias utan riktig historikrad vore otillräcklig.
Regressionerna i deploy-plan-negative-control tar bort marker respektive alias
och bevisar att kontrollerna då stoppar deployment eller SQL-replay.

Reproduktion: skapa en TOM lokal databas med tabellen
`supabase_migrations.schema_migrations(version text primary key, statements text[],
name text, created_by text, idempotency_key text, rollback text[])`.
Återläs privata backupen med jsonb_populate_recordset (exekvera ALDRIG lagrade
statements). Kör history-repair.sql lokalt; verifiera originaldigest och nekad
andra körning. För enbart CLI:s migrationsurval räcker version/name från
ledger-after.json. Kör från main respektive PR:

```sh
supabase db push --dry-run --db-url '<LOCAL_DATABASE_URL>?sslmode=disable'
bun run deploy-plan-negative:check
bun run deploy-plan:gate
bun run release-parity:gate
bun run migrations:check
bun run release-frontier:check
```

Återställ inte säkerhetsfixen för bokföringens skull. Aliaset kan ligga kvar även
om PR fördröjs. Originalhistoriken ska aldrig tas bort.

## Edge Functions och konfiguration

Dashboardkontroll: working directory `.`, Deploy to production AV, Automatic
branching AV, Save changes inaktiverad. Ingen inställning ändrad. PR-workflows
kör test/build, ingen produktionsdeploy; schemalagda verksamhetsjobb dispatchas inte.

Main config.toml anger bara project_id samt `[functions.passport-share]`
`verify_jwt=false`. Inga buckets eller produktionsspecifika overrides.
Live list_edge_functions: endast passport-share, ACTIVE version 2, verify_jwt=false.
get_edge_function gav byte-identisk index.ts som main, SHA256
`4f089a39965591d6a0f63924b13054c0f370c0c427891c0e19f69f3cf4134df9`.
Filen har inga importer. Integration kan återpaketera samma funktion, men ingen
ny funktionskälla, JWT-inställning eller bucket väntar. Inga secrets ändras.

[Supabases dokumentation](https://supabase.com/docs/guides/deployment/branching/github-integration#deploying-changes-to-production)
anger migrationer, deklarerade Edge Functions och buckets som produktionsytor;
API/Auth och seed ignoreras som standard. CLI:s DB dry-run är inte en utförd
funktionsdeploy; därför redovisas kod-/konfigurationsjämförelsen separat.

## Två beslut

**Deploy to production:** lämna AV tills denna bokförings-PR är granskad och
mergad med grön CI. Därefter kan ägaren slå på den, förutsatt att ingen annan
supabase/-ändring tillkommer på main. Vid ny main-commit kontrollera diff och
ledger igen. Ingen annan SQL väntar i den verifierade filuppsättningen.

**Publik lansering:** separat beslut. [handoff.md](handoff.md) beskriver öppna
säkerhetsfrågor som inte får kallas lösta. De ändrar inte den ovan verifierade
Supabase-deployplanen. Ingen merge, publicering eller återaktivering har gjorts.
