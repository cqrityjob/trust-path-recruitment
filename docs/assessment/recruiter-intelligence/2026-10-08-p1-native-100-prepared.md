# P1: förberedd native 100-acceptans, 2026-10-08

Status: **förberedd, inte körd mot tjänster**. Detta är en separat komplettering
till det tidigare isolerade PostgreSQL-/API-/browserbeviset med Auth-gateway
och syntetisk Storage-metadata. Ingen tidigare kontroll ändras eller räknas
om till native-bevis. Ingen produktionsskrivning, publicering eller fysisk
telefonprovning har utförts.

## Versionskontrakt och primärkällor

Appen checkas ut separat i `app/` på exakt
`ac25b3befbfb87ed5eb682679a929708d6dfbebf`. Testskriptets eget repository-HEAD
måste uttryckligen anges i `RI_P1_NATIVE_EVIDENCE_SHA`. Separat schema-checkout
i `schema/` låses till granskad `fd48827b79f3e09c1dc9ccb4a8720e18692d68a1`,
inklusive pending080-hashfix `5cdc82ac872a2f69cc518b8c1a0d782e5a2a3897`.
Därifrån replayas **hela** den sorterade migrationshistorien med
`ON_ERROR_STOP=1`, inklusive snapshot
`20270307090000`, sessiongräns `20270307100000` och P1 `20270308090000`.
Ingen allowlist, Auth-/Storage-basalschemaersättning eller ledger-reparation
används. Manifestet får varje faktiskt applicerad fils SHA256 och ett eventuellt
stoppande migrationsnamn. Det är inte ett hosted-paritetsbevis.

Oförändrade källor från app-pinnen används med hela filens SHA256:

| Källa | SHA256 | Användning |
| --- | --- | --- |
| `supabase/tests/recruiter_intelligence_p1_test.sql` | `c47c13c3f11a44bfd2a883dc80391230581e2b0e1e7786c9aed691283bebad7e` | Exakta 100 ansökningsdata, fyra skallkrav, två meriter och beslutsregler; endast fixture-avsnittet används här. |
| `scripts/recruiter-intelligence-p1-api-check.mjs` | `b650ce6987192c88404cc65bca63bad4f23983fd711e2af7c89cb3327ae4b3a4` | Alla 23 befintliga API-assertions, med riktig JWT-transport och Bob som andra samtidig granskare. |
| `e2e/recruiter-intelligence-p1.spec.ts` | `dc1e4e02f97e3116c553dc287d97360a99363f55e02fb0da7962a4c26acf72c4` | Alla fem befintliga browserfall, plus faktisk originalfilsläsning i de fyra språk-/viewportresorna. |

CLI är låst till 2.111.0, PostgreSQL till 17, PostgREST till 14.15 och GoTrue
till 2.194.0. Körningen läser image-taggar, faktisk PostgreSQL-version,
PostgREST-binärversion och installerade SDK-versioner och stoppar vid avvikelse.
`bun.lock` och de lästa lokala paketen låser `@supabase/supabase-js` och
`@supabase/auth-js` till 2.110.5. `package-lock.json` anger Auth 2.110.7;
den här sviten kräver därför Bun med `--frozen-lockfile`. Inget lås ändras här.

De ursprungliga 104 Auth-ID:n kan behållas. Den versionsbundna
[GoTrue 2.194.0-koden](https://github.com/supabase/auth/blob/v2.194.0/internal/api/admin.go#L419-L427)
validerar ett angivet UUID och använder det vid admin-skapande. Motsvarande
[Auth SDK 2.110.5-kontrakt](https://github.com/supabase/supabase-js/blob/v2.110.5/packages/core/auth-js/src/lib/types.ts#L589-L596)
tillåter `id`. Wrappern kontrollerar även det faktiskt återgivna ID:t och
bekräftelsedatumet. Officiellt
[admin.createUser med email_confirm](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
används, aldrig invite, registreringsmejl eller direkt Auth-SQL.

Native Storage skriver objekt via API enligt
[Storage-schemats kontrakt](https://supabase.com/docs/guides/storage/schema/design).
Behörighetsprov använder den verkliga
[Storage/RLS-gränsen](https://supabase.com/docs/guides/storage/security/access-control).
Produktens `20270201090000_job_cvs_no_client_writes.sql` är oförändrad:
de 80 originalen är uttryckligen **lokal service-role fixture-setup**, inget
påstående om kandidatens uppladdnings-ACL. Original läses/signeras därefter
med inloggad arbetsgivares befintliga rättigheter.

## Körförutsättningar

Endast en ny GitHub-hostad Linux-runner godtas: `GITHUB_ACTIONS=true`,
`CI=true`, `RUNNER_OS=Linux`, `RUNNER_ENVIRONMENT=github-hosted` och
`RI_P1_NATIVE_DISPOSABLE=1`. Självhostad runner, arbetsstation, ärvda Supabase-,
OpenAI-, Resend- eller AWS-variabler, fel app-HEAD och redan befintliga
stack-/artifactkataloger nekas före service- eller API-anrop.

Repository-roten behöver dessa nya skript. Separata schema- och app-checkouts
behöver de exakta pinnarna ovan. Installera
Node 22, Bun 1.3.14, `bun install --frozen-lockfile` i båda checkoutarna,
Playwright Chromium inklusive systembibliotek, psql, Docker och officiell
Supabase CLI 2.111.0. Workflow-/package-inkoppling ägs av integrationsarbetet;
den här committen ändrar dem inte.

```sh
export RI_P1_NATIVE_DISPOSABLE=1
export RI_P1_NATIVE_EVIDENCE_SHA="$(git rev-parse HEAD)"
node scripts/recruiter-p1-native-run.mjs
```

GitHub tillhandahåller runner-variablerna och `GITHUB_WORKSPACE`; att manuellt
sätta dem på en arbetsstation är inte ett godkänt prov. Projektet heter
`cqj-ri-native-p1-100`, API är `127.0.0.1:55810`, PostgreSQL
`127.0.0.1:55811`, shadowport `55809`, appport `35810`. Alla måste vara lediga.
Status från CLI måste exakt motsvara dessa adresser samt nyckelrollerna anon
och service_role. Ingen godtycklig URL kan skickas till runnern.

Global Auth-signup är avstängd. E-postprovidern är på för lösenordsinloggning
av de admin-skapade kontona; automatisk e-postbekräftelse kommer från admin-
anropet. [CLI 2.111.0:s versionsbundna env-mappning](https://raw.githubusercontent.com/supabase/cli/v2.111.0/apps/cli-go/internal/start/start.go)
separerar global `GOTRUE_DISABLE_SIGNUP` från providerns
`GOTRUE_EXTERNAL_EMAIL_ENABLED`. Lokal SMTP/mailpit, Edge runtime och övriga uteslutna tjänster startas
inte. Workers/cron aktiveras inte. Ingen hosted-konfiguration används.

## Förberedda kontroller och förväntade utfall

1. **104 riktiga Auth-konton:** owner, admin Bob, member, outsider och A001–A100
   skapas via admin API i nytt `.invalid`-namespace. Slumplösenord och
   `creation_intent` sparas privat före varje anrop. Okänt resultat, fel ID eller
   obekräftat konto stoppar; ingen blind återförsöksskapning tillåts. Aktuell
   databas ska ha exakt 104 bekräftade konton. Owner/Bob/member/outsider loggar
   in via riktig `signInWithPassword`; JWT måste innehålla rätt sub, issuer,
   authenticated-roll och session_id.
2. **Syntetiska appdata:** fixture-SQL exkluderar Auth-/Storage-DML och fabricerade
   JWT-claims. Två egna jobb skapas; `receipt_enabled=false` sätts och verifieras
   före första ansöknings-INSERT. Dessa privilegierade lokala setup-skrivningar
   är inte bevis för kandidaters ansökningsbehörighet eller livscykel.
3. **80 faktiska original:** Storage API laddar exakt 80 separata 512-byte PDF-
   fixtures och läser varje objekts bytes tillbaka. Owner skapar en riktig
   signerad URL och originalets bytes läses genom native tjänsten. De små PDF-
   fixturesen används för byte-identitet, inte för ett PDF-renderingspåstående.
4. **100 mänskliga granskningar:** owner och Bob växlar mellan riktiga session-
   RPC-anrop med aktuell profil-, source-, review- och assignment-CAS.
   Baseline ska vara **40 gröna, 25 gula, 35 grå; 27 granskade, 73 återstående**.
   Varje beslut citerar faktisk aktuell källa från public get-review; inga
   beslut injiceras med SQL.
5. **23 API-assertions:** full global ordning/filter/fyra sidor, member/outsider/
   anon-gränser, assignment-CAS och två samtidiga skilda granskare. De gamla
   assertions behålls exakt. Domänkonflikter ska ge exakt HTTP409/PT409 utan
   lång retryloop. V2:s decemberstart ska göra tidigare granskning stale och ge
   **30/35/35, 0 granskade, 100 återstående**.
6. **Verklig source-revoke/replacement:** Storage API raderar A001–005:s objekt;
   ny bytesläsning nekas och nya CV-källval saknas. Efter V2 ska utfallet vara
   **25/35/40, 0 granskade**. Återskapade objekt får ny sourceVersion och får
   inte återställa gammalt accepterat underlag eller granskning. Detta provar
   ny läsning och aktuell kravkälla, inte redan cachade bytes/CDN-revokering.
7. **AI skapar aldrig grönt:** två historiska syntetiska mock-förslag, ett positivt
   och ett negativt, läggs i ett eget A096-ärende utan körd AI. Saknat original
   ska fortfarande ge grått/clarify; ett met-beslut utan original ska nekas med
   `RI_ACCEPTED_SOURCE_REQUIRED`. AI-/transcript-switchar förblir avstängda.
8. **Smalt återställningsvittne före browser:** endast de två egna jobben raderas
   och återskapas för samma oförändrade baseline. Auth, Storage, ärenden och
   rapporter raderas inte. Befintliga ärenden ska få job/application-FK NULL
   enligt befintlig lifecycle, medan frysta snapshotmanifest/tid är bytevis
   lika. Om en befintlig FK/trigger stoppar detta blir provet FAILED; den
   kringgås inte och snapshotfence försvagas inte.
9. **Fem riktiga browserfall:** samma befintliga 100-orakel, refresh/URL/drafts,
   tvåflikskonflikt, grå mänsklig granskning, uttrycklig PEACE-källhandoff,
   cachad jobbprofil och arkiv-only-vy körs med lösenordsinloggning. Den första
   resan täcker sv/en på desktop och Chromium **emulerad** mobil 375 px. I vart
   och ett av de fyra språklägena/viewports öppnas också inskickat original via
   appens faktiska signerare; native HTTP200 och exakt PDF-byte-identitet krävs.
   Alla fem måste vara PASS med 0 flaky, 0 skipped och 0 unexpected.

Säkerhets-readback kontrollerar löpande 104 Auth, 100 ansökningar, 0 aktiva
kvittensinställningar, 0 rekryteringsmeddelanden/mejlförsök, 0 erasure-jobb/-kö,
0 cronjobb, 0 faktisk AI-generering och avstängd AI/transcript. Endast de två
redovisade historiska mock-raderna kan finnas efter AI-isoleringsprovet.

## Bevis och stoppvillkor

Privata filer ligger i `p1-native-stack/supabase/.temp/` med katalog 0700 och
status/aktörer/sessioner/loggar 0600. Lösenord, nycklar, JWT, signerade URL:er,
råa SDK-fel, raw browserreport/traces och privata SQL-loggar får inte laddas upp
som artifact. Auth-setup måste lämna privat intent/readback om den avbryts.

Endast `p1-native-public/manifest.json` och kuraterade PNG-bilder får bli
artifact. Manifestet har faktisk app-/evidence-SHA, serviceversioner,
migrationshashar, uppmätta antal och per-stage `not_run/running/passed/failed`.
PNG har SHA256 och begränsade filnamn. Leakscan nekar hemligheter; fel/status
redovisas med fasta operationer och begränsad HTTP-/SQLSTATE-/domänkod, utan
SDK-message/details/hint/cause/stack. Ett avbrutet prov blir FAILED och lämnar
senare steg `not_run`. Egen app-process och exakt eget CLI-projekt stoppas på
exit, utan att andra stackar eller privata bevis rensas.

**Återstående blockerare:** faktisk native körning är inte utförd på denna
arbetsstation eftersom lokal Colima/disk-I/O är stoppad. Den rapporterade
native P1 `public.digest(text,unknown)`-inkompatibiliteten i pending080 har en
granskad korrigering i den låsta schema-pinnen, men kräver faktiskt native
replay- och funktionsbevis före PASS. Ingen
förbikoppling finns här. Faktisk fullhistory replay, 104 GoTrue-ID:n, Storage-
bytes, job-cascade-vittne, API-race och fem browserfall måste därefter passera
i en ny ephemeral runner. Native resultat ska kompletteras med publicerad
runtime/Auth/Storage/driftprov och fysisk mobil där dessa fortfarande krävs.

## Utförd lokal verifiering

Endast enhets-/kontrakt-/körgrindsprov utan externa anrop, syntax, riktad lint
och typkontroller körs i denna leverans. Auth-kontraktets testdubbel bevisar
wrapperns instruktioner och stoppbeteende; den bevisar inte en faktisk GoTrue-
skapning. Inga DB-/Docker-/Auth-/Storage-/browseråtgärder har utförts här.
Utfört: 19 nya native-harnesskontrakt och 56 befintliga P1-render-/guardprov
(75 PASS, 0 FAIL), app- och scripts-typecheck, separat typecheck av den nya
configen/testfilen och importerade JavaScript-kontrakt, riktad ESLint (0 fel/
varningar), Node-syntax samt syntaxkontroll av genererat API/browserunderlag.
Inledningsvis saknade den smala checkouten tre äldre manifestindata; efter att
de oförändrade spårade filerna gjorts tillgängliga passerade alla äldre prov.
Ingen produkt- eller guardändring användes för det. Slut-SHA meddelas med
committen.
