# Fryst native Supabase-bevis: CI-körning 4

Detta är ett faktiskt PASS från [GitHub-körning 37760660175](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37760660175), jobb `113255976104`, den 8 oktober 2026. Dokumentationscommitten ändrar inte den testade koden.

- Test-/evidenskod: `16d8ea8e73bd6c5c644ca5579a33bd3a8cb03ae9`.
- Separat release-schema: `250623cfb677c931caf70a2354daf774f72f443a`.
- Separat applikation: `a68f22d799769de32230781bba268632e57e796f`.
- Artefakt: `11541898302`, ZIP-SHA256 `3ebd2239c5cb361f6f34909141af648900dbe16d541763be2de1341413ed1e40`.

`manifest.json` och `errors.json` är oförändrade från GitHub-artefakten. `witness.json` sammanställer endast dess offentliga versioner, räknare, resultat och begränsningar. Alla 36 kuraterade syntetiska PNG i originalarkivet har kontrollerats mot manifestets storlek och SHA256. Två oförändrade exempel ingår här; manifestet beskriver fortfarande hela originalarkivet och ska inte tolkas som att samtliga 36 bilder finns i denna dokumentationskatalog.

## Utfört

Officiell CLI 2.111.0 skapade en ny, egen lokal stack på GitHub-hosted Linux. Faktiska versioner: Node 22.23.3, Bun 1.3.14, PostgreSQL 17.6, GoTrue 2.194.0, Storage 1.67.20 och PostgREST 14.15. Samtliga 385 kanoniska migrationer kördes med strikt felstopp och exakt ledgerkontroll.

Åtta syntetiska konton skapades via riktig GoTrue och loggades in med lösenord. Sju verkliga caller-autentiserade Storage-/metadata-adapterprov passerade. De inkluderade förhindrad upload vid saknad target, metadata-nekning, uttryckligen injicerat DELETE503 med pending/orphan, faktisk metadata-commit följd av klientens svarsförlust, readback401 som behöll unknown utan blind delete samt riktig sessionåterkallning efter preflight. Egen uttrycklig städning bekräftades efter varje prov. Ny egen Passport skapades via ordinarie användar-RPC före credential-save; inga privilegierade Passport-aktörer användes.

Tolv kompletta strukturerade intervjuflöden passerade på dator och emulerad mobil 375/390, för båda rollerna samt ansökningskopplad/fristående start och svenska/engelska. Två separata tvåfliksprov passerade. Båda browsergrupperna hade noll unexpected, flaky eller skipped. Direkt process-CAS med riktig GoTrue-session returnerade HTTP 409, `PT409`, `SCP_IV_SESSION_PROCESS_STALE` på 3,75 ms mot en klientgräns på 8 000 ms.

Slutläsningen visade 14 intervjuärenden och 12 rapporter. AI och transkribering var avstängda; kvitton, meddelanden, email attempts, AI-runs, erasure/storage-köer och cron-jobb var noll. Den egna app-processen och den egna namngivna stacken stoppades. Publiceringsgränsen för redigerat manifest, felkoder och namngivna syntetiska bilder passerade.

## Gränser

Detta bevis gäller exakt ovanstående schema-/app-/testversioner i den nya isolerade CI-stacken. Det bevisar inte hosted drift, fysisk mobil, app-HTTP-fault-injection för upload, OP09:s bestående upload-journal/resume/fence, P1:s 100 ansökningar eller att vanliga JWT ogiltigförklaras omedelbart överallt. Produkt- och releasepåståenden måste hålla dessa gränser.

De tre tidigare misslyckade försöken bevaras separat. Deras partiella schema-/Auth-resultat ersätter inte detta fullständiga prov, och detta PASS ändrar inte deras historiska FAIL.
