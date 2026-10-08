# Versionsbundet förslag: riktig Supabase-verifiering i CI

Datum: 2026-10-08. Detta dokument beskriver en ny obligatorisk körning; det är inte ett bevis på att körningen redan har passerat.

## Versionsbindning och isolering

Den separata workflowen `.github/workflows/recruiter-real-ci.yml` checkar ut exakt aktuell schema-/test-SHA från GitHub-eventet. Applikationen checkas ut separat till `app/` på `a68f22d799769de32230781bba268632e57e796f` (snapshot-applikation inklusive Passport-adapter och E4-rättningen). `scripts/recruiter-real-ci-contract.mjs` kräver båda dessa faktiska Git-HEAD, rena spårade filer och GitHub-hosted Linux. En annan app-commit måste först granskas och uttryckligen ersätta pinnen i både kontrakt och workflow.

Körningen skapar en ny, egen lokal Supabase-stack `cqj-ri-real-20261008b`, API `http://127.0.0.1:55690`, PostgreSQL `127.0.0.1:55691`, applikation `http://127.0.0.1:3140`. Officiell CLI 2.111.0, Node 22, Bun 1.3.14 och Chromium installeras. Körningen verifierar faktisk PostgreSQL 17 och PostgREST 14.15 samt redovisar Auth-/Storage-containerbilderna. Den är avsiktligt spärrad på lokal dator och självhostad runner.

GoTrue, Storage, Kong och PostgREST är verkliga CLI-tjänster. Inga Auth-bryggor, egenutgivna kandidat-JWT eller `supabase/tests/00_bootstrap.sql` används på stacken. CLI-status, databasuppgifter, syntetiska lösenord och råa testloggar sparas privat. Inga hosted-nycklar tillåts. SMTP, AI, Edge Functions, retention-/erasure-workers och cron-körningar aktiveras inte.

## Vad körningen kräver

1. Alla kanoniska migrationsfiler på schema-SHA körs med `psql ON_ERROR_STOP=1`; minst snapshot `20270307090000` och forward `20270307100000` måste finnas. Fel, malformed filnamn eller dubbla versions-ID avbryter. Först efter framgångsrik SQL-replay repareras den egna, färska CLI-ledgern och jämförs exakt med de körda versionerna. Varje fils hash redovisas. Ingen gammal migration ändras eller hoppas över genom en tidigare ledgeralias.
2. Åtta syntetiska konton skapas via riktig GoTrue-admin i denna tomma stack, bekräftas utan e-post och loggas in med lösenord. De verkliga Auth-ID används i den befintliga avgränsade fixturefilen `scripts/fixtures/recruiter-real-local-setup.sql`. Kvittoutskick sätts av före ansökningsinläggningen. Tolv annonser och tolv ansökningar ska finnas, inga förskapade intervjuärenden eller rapporter.
3. Sju caller-autentiserade Storage-/metadata-prover kör den versionsbundna `src/lib/security-passport/evidence-upload-adapter.functions.ts`. Proven omfattar preflight som hindrar upload, faktisk SQL-nekning med bekräftad egen cleanup, injicerat DELETE503 som lämnar pending/orphan, faktisk metadata-commit med tappat svar, nekad readback som behåller unknown och undviker blind delete, normal success och återkallad session efter preflight. Varje transportinjektion sker uttryckligen på klienten; lyckade och nekade backendanrop använder riktiga tjänster. Egen explicit slutstädning kontrolleras. Detta är adapterprov, inte app-HTTP-fault-injection.
4. Tolv kompletta UI-flöden körs med AI avstängt: fyra roll/start-/språkkombinationer på dator samt emulerad mobil 375 och 390. Befintliga åtta kärnfrågor, sex kompetensområden och innehållsstatus kontrolleras. Sparning, återupptagning, manuella kontrollpunkter, bekräftad evidens, mänsklig bedömning, rapport och behörighetsgränser ingår. Två ytterligare tvåfliksprov skapar egna nya ärenden via ordinarie UI och verifierar sparfel, CAS-konflikt och uttrycklig reload. Inga tidigare lokala ärende-ID återanvänds.
5. Ett extra process-CAS-prov använder ny riktig GoTrue-inloggning och direkt PostgREST. En stale skrivning måste ge HTTP 409, `PT409` och `SCP_IV_SESSION_PROCESS_STALE` inom en åttasekunders klientgräns. Äkta PostgreSQL-transaktionskonflikter behandlas inte som domänkonflikter. Funktionen som detta prov använder returnerar tabell; andra RPC:er som returnerar void kan korrekt ge HTTP 204.
6. Exakta browserantal krävs: 12 huvudflöden och 2 tvåfliksprov, noll failed, flaky eller skipped. Slutläsning kräver 14 ärenden och 12 rapporter samt fortsatt noll AI-runs, kvitton, rekryteringsmeddelanden, email attempts, erasure/storage queues och cron-jobb. Bara den egna applikationsprocessen och den egna namngivna CLI-stacken stoppas.

## Publicerbart bevis och hittills utförda kontroller

Workflowen publicerar enbart `real-public/manifest.json`, `real-public/errors.json` och explicit namngivna syntetiska PNG i `real-public/images/`. Manifestet visar SHA, uppmätta tjänsteversioner, SQL-hashar, stegutfall, räknare och kontrollerade felkoder. Rå CLI-status, JWT, privata loggar, Playwright-traces och Vite-output får inte följa med. En separat validator kontrollerar filuppsättning, symlinks, bildnamn, storlek/hash och credential-mönster före upload. Det är ingen garanti om OCR eller komprimerade pixelsträngar; bilderna tas från avgränsade syntetiska vyer, inte login-/credential-vyer.

Lokalt har 12 statiska skydds-/exportprov med 91 assertions, strikt TypeScript-kontroll av browser/config och lint för de nya filerna passerat. Dessa prov verifierar målbindning, spärrar mot försvagad körning, full replay och publiceringsregler; de bevisar inga nya faktiska Supabase- eller UI-resultat. Docker kan för närvarande inte användas lokalt på grund av blockerad Colima I/O och andra användarstackar. Den faktiska nya GitHub-körningen måste passera på den integrerade schema-SHA före release.

Tidigare verkliga lokala adapter-/browserbevis ligger kvar oförändrade i `2026-10-08-real-browser-and-upload-recovery.md` och dess evidence. De är jämförelseunderlag och får inte redovisas som denna nya körning.

OP09:s bestående upload-journal, resume efter reload och cleanup-fence behöver egna nya verkliga prover när dess schema och apphjälpare är granskade och versionsbundna. De sju äldre adapterproven ersätter inte dessa. En sådan komplettering ska vara separat och kräva en ny uttryckligen granskad app-pin.
