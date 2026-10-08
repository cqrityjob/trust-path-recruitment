# Fryst native Supabase-bevis: CI-körning 8

Detta är ett faktiskt PASS från [GitHub-körning 37771406577](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37771406577), jobb `113291628817`, den 8 oktober 2026. Dokumentationscommitten ändrar inte den testade koden.

- Test-/evidenskod: `885038898564c428adc83d1f0399fa83ed816d6a`.
- Separat release-schema: `250623cfb677c931caf70a2354daf774f72f443a`.
- Separat applikation: `0eab408debbe660d22825c2ffaa8fcc60de0b68c`.
- Artefakt: `11548333208`, ZIP-SHA256 `5b7a43459173781d724809f4bc373633d0d95dcadb198347acc99dc8261e2c1e`.

`manifest.json` och `errors.json` är oförändrade från GitHub-artefakten. `witness.json` sammanställer dess versioner, räknare och resultat samt anger verifieringsgränser. Samtliga 385 migrationshashar har jämförts med det exakta release-schemahuvudet. Alla 36 kuraterade syntetiska PNG i originalarkivet har kontrollerats mot manifestets storlek och SHA256. Två oförändrade exempel ingår här; manifestet beskriver hela originalarkivet, inte enbart denna dokumentationskatalog. Arkivet innehåller endast manifest, tom fellista och dessa 36 bilder.

## Utfört

Officiell CLI 2.111.0 skapade en ny, egen lokal stack på GitHub-hosted Linux. Faktiska versioner var Node 22.23.3, Bun 1.3.14, PostgreSQL 17.6, GoTrue 2.194.0, Storage 1.67.20 och PostgREST 14.15. Alla 385 kanoniska migrationer kördes med strikt felstopp och exakt ledgerkontroll.

Åtta syntetiska konton skapades via riktig GoTrue och loggades in med lösenord. Sju caller-autentiserade Storage-/metadata-adapterprov passerade: preflight som förhindrar upload, verklig SQL-nekning med bekräftad städning, injicerat DELETE503 med pending/orphan, verklig commit följd av klientens svarsförlust, readback401 med unknown utan blind delete, normal success och riktig sessionåterkallning efter preflight. Egen uttrycklig städning bekräftades efter varje prov.

Tolv kompletta intervjuflöden passerade på dator och emulerad mobil 375/390, för båda rollerna samt ansökningskopplad/fristående start och svenska/engelska. Alla åtta frågor kontrollerades genom egen autentiserad REST-återläsning efter paus, slutförande och inför evidensgranskning: exakt Q1–Q8, en icke-tom sparad anteckning per fråga och förväntad syntetisk textmarkör. Vald fråga och bekräftad evidens kontrollerades i respektive frågas artikel. Både notesparande och processreflektion prövades med ny text medan föregående sparande pågick. Två tvåfliksprov passerade. Båda browsergrupperna hade noll unexpected, flaky eller skipped.

Direkt process-CAS med riktig GoTrue-session returnerade HTTP 409, `PT409`, `SCP_IV_SESSION_PROCESS_STALE` på 6,85 ms mot en klientgräns på 8 000 ms. Slutläsningen visade 14 intervjuärenden och 12 rapporter. AI och transkribering var avstängda; kvitton, meddelanden, email attempts, AI-runs, erasure/storage-köer och cron-jobb var noll. Den egna app-processen och den egna namngivna stacken stoppades. Gränsen för redigerat manifest, fasta felkoder och namngivna syntetiska bilder passerade.

## Gränser och historik

Detta bevis gäller exakt schema-/app-/testversionerna ovan i den färska isolerade CI-stacken. Det bevisar inte hosted drift, fysisk mobil, app-HTTP-fault-injection för upload, OP09:s bestående upload-journal/resume/fence, P1:s 100 ansökningar eller omedelbar generell JWT-ogiltigförklaring. Den senare rättningen `55d6b543d371aed7ec684a9e4bbe36c3ccfc36e8` för fel vid uttrycklig hämtning av lagrad anteckning ingår inte i app-pinnen `0eab…`; den har separat lokal regression och kräver en ny exakt integrerad pin för native bevis.

Tidigare PASS vid `16d8…` och FAIL vid `439c…`, `8b78…` och `b6d8…` bevaras separat. `b6d8…` på den äldre app-pinnen `a68…` visade faktisk tom Q8 efter paus i samtliga tolv flöden. Denna körning behåller och passerar samma förstärkta återläsningskontroller med de granskade produktfixarna i `0eab…`. Den ändrar inga historiska resultat och hävdar inte en instrumenterad exakt förfrågningssekvens för det äldre felet.
