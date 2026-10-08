# Recruiter Intelligence: permanent innehållslås och snapshot

Version 0.3-content-schema-r1, 2026-10-08. Schemaförslag på P0-appens slutbas `0683d5d961b03668e8d4e6fe56d676e07b656566`. Användarens uppdrag 2026-10-08 auktoriserar nödvändiga merge- och produktionsåtgärder efter godkända kontroller. Denna PR innehåller schema, SQL-prov och releasekontrakt. Applikationen som läser snapshoten levereras separat efter verifierad installation.

## Garanti och gräns

P0-manifestet observerar innehållet när det läses. Ett hashvärde upptäcker avvikelser men hindrar inte ändringar mellan två läsningar. Denna migration binder i stället en komplett innehållssnapshot atomiskt till varje nytt intervjuärende. Frågor, kompetenser, frågekopplingar, följdfrågor, ankare, verifieringsregler, förbjudna områden, TRUST/PEACE/ORBIT-vägledning, rollversion och svensk/engelsk klienttext sparas i samma transaktion. Rapportbyggaren läser denna sparade JSON. Den separata appändringen ska läsa samma JSON för intervju och metodstöd; dess tester och publicerade version är ett eget releasebevis.

Bestående lås för paket, paketversion, roll, rollversion och metod överlever ärendets radering och innehållets återkallning. INSERT, UPDATE och DELETE serialiseras med ärendets första bindning. Row-triggers kontrollerar gamla och nya innehållsägare; en flytt får inte bli en alternativ skrivväg. Service-role omfattas. Kontrollerade lifecyclefält får fortfarande återkalla tillgänglighet. Nytt innehåll kräver en ny version. En använd draft är inte ett redigerbart öppet utkast.

Låsen godkänner ingen guide och ingen översättning. Draft-/reviewstatus och pilothypotes kvarstår. Snapshoten kan innehålla en faktiskt saknad engelsk text; appen ska redovisa den ärligt. PEACE beskriver intervjuarens arbetssätt. Mänsklig bedömning mot rollkrav hålls separat; ingen PEACE-poäng, kandidatrangordning eller slutsats om trovärdighet införs.

## Befintliga ärenden

Hosted inventering före installation 2026-10-08 visar 20 ärenden: 9 draft, 5 pågående intervjuer, 3 avslutade intervjuer, 2 evidensgranskningar och 1 assessed. Detta är en aggregerad observation utan kandidatidentiteter. Installationen fryser det innehåll som finns **nu**, med `provenance=observed_now` och faktiskt `frozen_at`; inget äldre hashvärde eller rapportpayload skrivs om. Antalet ska läsas igen vid installation eftersom normal produktanvändning kan ha förändrat populationen.

Fortsättning av ett äldre ärende blockeras tills dess ägare eller administratör uttryckligen granskar det observerade innehållet och bekräftar exakt manifesthash med en motivering. Bekräftelsen är idempotent och auditloggas. Ingen teknisk operatör bekräftar verkliga ärenden för en användares räkning. Rapportläsning, återkallning av källor, kandidatens sakrättelse och radering behåller sina befintliga rättigheter. De oföränderliga snapshotsen innehåller normativt metodinnehåll, inte CV eller kandidatanteckningar; raderade aktörsreferenser kan sättas NULL genom sin Auth-FK.

## Releaseordning och återställning

1. Slutför #448 med obligatorisk CI på dess exakta slut-SHA. Granska denna schema-PR och kör full migrationsreplay, behörighetstester, legacyprov, samtidighet och rollback i isolerad PostgreSQL17.
2. Merge schema med normal mergecommit. Ordinarie Supabase GitHub-integration installerar endast den nya kanoniska migrationen `20270307090000` på `wrygicdfxwjnrugduxnt`. Ingen redan installerad migration körs igen.
3. Kontrollera hosted ledger, installerade funktionskroppar/ACL, samtliga triggers, privata tabeller, snapshotproveniens och oförändrad rapporthistorik läsande. Först med detta bevis ändras `pending` till `applied`, ledger-snapshot uppdateras och endast denna migration tas bort från `expectedPending`.
4. Släpp därefter app-PR som faktiskt läser snapshoten och visar legacygranskningen. Kontrollera publicerad runtime separat från Lovables GitHub-synk. Före kommersiell intervjuanvändning behövs också separata innehållsbeslut och driftprov med riktig Auth/Storage.

Rollback-SQL får endast användas på en **tom, oanvänd installation**. Om ett enda permanent lås eller en snapshot finns vägrar den före första mutation. Produktionens redan existerande ärenden innebär därför normalt att schema måste bevaras. Återställ app till den senaste kompatibla versionen och återställ framåt med en ny granskad migration. Ta aldrig bort lås, rapporthistorik eller snapshots för att få en rollback grön. Den tidigare appen kan läsa den kompatibla manifest-RPC:n men ger inte snapshotens nya användargränssnitt eller legacybekräftelse; stoppa nya intervjustarter vid sådan återställning tills kompatibel app åter är publicerad.

## Versionsbundna källor och prov

- [Kanonisk migration](../../supabase/migrations/20270307090000_interview_content_snapshot_lock.sql), [rollback](../../supabase/rollback/20270307090000_interview_content_snapshot_lock_rollback.sql).
- [Legacyfixture](../../supabase/tests/interview_content_snapshot_legacy_fixture.sql), [snapshotprov](../../supabase/tests/interview_content_snapshot_test.sql), [runner med riktiga anslutningsrace](../../scripts/interview-content-snapshot-check.sh).
- [Release-state](../../supabase/release-state.json), [frontierkontroll](../../scripts/release-frontier-check.ts), [full databassvit](../../scripts/db-test.sh).

Lokala prover bevisar inte hosted installation, faktisk Auth, Storage/CDN, publicerad runtime, innehållsgodkännande eller ett manuellt telefonprov. Dessa dokumenteras med exakta releaseidentiteter i #449.
