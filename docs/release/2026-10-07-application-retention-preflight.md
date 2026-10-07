# Produktionsförberedelse för ansökningsmaterial

**Beslut nu: håll produktionsaktivering spärrad.** Verkligt Storage-test och inloggat
portaltest saknar ett separat godkänt projekt med åtkomst. Detta underlag är ingen
aktivering och ingen genomförd gallringskörning. Lagringsplanens mekanism förblir `pending`.

## Version och ändringsgräns

Hämtad GitHub-main: `e3223033d679fdc4f87086088b67d9a8e534f7fa` (#445), ovanpå #444
och #443. Förberedelserna görs på `codex/retention-activation-preflight` från denna main.
#443:s dokumenterade slutverifiering återanvänds. Inga testmodul-, layout-, app-, worker-
eller migrationsfiler ändras. Ingen ny produktionsmigration behövs: installerad migration
`20270305090000` finns i den verifierade ledgern med 382 rader. Den återinstalleras inte.

PR-fixen gäller operatörens SELECT-rapport: utgångna annonser utan verkligt avslutsdatum
ska flaggas precis som i portalen; öppna annonser utan settings ska ge boolean `false`,
inte NULL. Rapporten redovisar datumgräns, annons/ansökningsstatus, kö, filskuld, aktiva
leases och möjliga första batcher. Den köar ingenting. Rapporttestet körs i DB-CI på
syntetiska fixtures som alltid rullas tillbaka.

## Skrivskyddad produktionstorrkörning

Projekt: **CQrityjob Production — `wrygicdfxwjnrugduxnt`**.
Observation: **2026-10-07 04:46:49 UTC**. Originalets tre SELECT-frågor kördes först;
den korrigerade rapporten kördes därefter i `BEGIN TRANSACTION READ ONLY` / `COMMIT`.
Torrkörningen genomfördes som oberoende förberedelse medan testprojekt saknades.
[Maskinläsbart bevis](2026-10-07-application-retention-preflight.json).

| Omfattning | Antal |
|---|---:|
| Rekryteringar / ansökningar | 28 / 16 |
| Verkligt avslutade rekryteringar med känt datum | 0 |
| Förfallna vid aktuell lagringstid / möjliga automatiska köposter | 0 / 0 |
| Ärenden som flaggas för saknat avslutsdatum / ansökningar i dem | 23 / 11 |
| Väntande manuella / automatiska raderingsjobb | 0 / 0 |
| Väntande / misslyckade filraderingar kopplade till dessa jobb | 0 / 0 |
| Redovisade blockerade jobb | 0 |
| Arbetsgivare med 24 månader / sex månader | 11 / 0 |

Inga datum gissades eller fylldes i. De 23 ärendena kräver verksamhetens hantering av
verkligt avslut; annonsarkivdatum får inte användas. Noll blockerade köjobb betyder en
tom kö, inte att alla framtida materialgrafer har godkänts. Ingen beroendegraf behöver
bedömas för den tomma första batchen. Varje framtida icke-tom godkännandebatch måste
få en separat skrivskyddad kontroll av delade/okända beroenden innan beslut.

**Första körningen med aktuell snapshot:** worker med automatisk köläggning av =
0 jobb, 0 ansökningar, 0 filer. Även med automatisk köläggning på skulle första
enqueue-batchen vara 0 och första exekveringsbatchen 0. Detta gäller bara observationen
ovan. Kör rapporten igen efter testerna och omedelbart före godkännande; nya manuella
jobb, avslut och arbetsgivarval kan ändra omfattningen.

## Installerad worker och kvarvarande inställningskontroll

Supabases GitHub-integration har efter #445 deployat `recruitment-retention`, version **1**,
med `verify_jwt=false`. Deployad bundle SHA-256:
`e068569f0c729b9266bf396bb08516a07f7f8fac11e64c513b2789f990e15257`.
Hämtade båda källfiler matchar main efter TypeScript-transpilering utan kommentarer
(ingen kod exekverades vid jämförelsen); bara formateringen skiljer sig.
`@supabase/supabase-js` är pinnad till **2.110.5** i workern.

Ett POST utan Authorization gav HTTP 404 före databasåtkomst. Kodens grind kräver
POST, miljöflaggan exakt `true`, token minst 32 tecken och rätt Bearer-token.
**404 bevisar inte miljöflaggans värde.** Den tillgängliga MCP-anslutningen kan inte
läsa Edge-hemligheternas konfiguration; en behörig operatör behöver säkert kontrollera
att `RECRUITMENT_RETENTION_WORKER_ENABLED` är `false` eller saknas. Logga bara
kontrollens resultat, aldrig hemlighetens värde eller en bearer-header. Detta är en
kvarvarande aktiveringsspärr, inte ett antagande om att worker är körbar.

Databasens `recruitment_erasure.activation.enabled=false` är verifierad. Cron-tabell
saknas. Vault 0.3.1 är installerat; de namngivna worker-hemligheterna finns inte i Vault.
`pg_cron` 1.6.4 och `pg_net` 0.20.4 är tillgängliga men inte installerade. Installation
av dessa och scheduler är separat driftaktivering, aldrig vanlig Lovable-publicering.

## Åtkomst som saknas

Anslutningen listar bara produktion och dess default-main; ingen separat testbranch
eller separat testprojekt. Ange och godkänn testprojektets ref, ge Supabase-anslutningen
projektåtkomst och ge en säker kanal för testmiljöns nycklar/worker-hemligheter samt
worker-deployment. Projektet ska innehålla enbart syntetiska uppgifter, matchande schema,
Auth och verklig Storage. Ingen produktionsdatakopia behövs. Produktion och de pensionerade
eller uteslutna refs i `supabase/deployment-targets.json` får aldrig bli testmål.

För portalen behövs en testinstans från samma SHA med både `SUPABASE_URL` och
`VITE_SUPABASE_URL` pekande på testprojektet, båda publishable-key-variablerna för samma
projekt samt servernyckel enbart server-side. Bekräfta backend på både webbläsar- och
servertrafik innan första skrivningen. Använd separata testmiljövariabler; skriv inte
över Lovables eller parallellt arbetes `.env` eller layout. Skicka inga nycklar i chatten.

## Verkligt testprotokoll att slutföra när projektet finns

Skapa syntetiska Auth-konton via Auth Admin och två arbetsgivare, med ägare/admin,
vanlig medlem, kandidater och annan organisations ägare. Lägg in syntetiskt Passport,
eget testresultat och andra organisationens ansökningsmaterial som skyddade kontrollrader.
Lagra kontrollernas exakta ID och innehållsdigest före/efter, inte bara totalsiffror.
Skapa CV-objekt genom **Storage API**, aldrig genom SQL i `storage.objects`.
Registrera unikt test-run-ID och en explicit lista över dess konton, jobb och objektsökvägar.

| Fall | Verklig körning och acceptansbevis |
|---|---|
| Exklusivt CV | Ladda upp, verifiera download/digest, bekräfta radering som inloggad ägare, anropa deployad worker. Ansökningsrader och objekt ska försvinna; Storage-download ska sedan visa frånvaro. |
| Redan borta | Ladda upp och ta bort via API innan worker. Samma jobb ska slutföras först efter katalogkontroll i fungerande bucket. |
| Delat CV | Två ansökningar, två organisationer refererar samma uppladdade objekt. Radera bara den ena ansökningen; andra ansökningen och objektets digest ska vara oförändrade. |
| Storage/API-fel | Testprojektets isolerade nätverksproxy avvisar ett riktigt remove med 503; bucket/download fungerar. Jobbet och filskulden ska förbli öppna med fel. Återställ nätverk, begär återförsök som ägare och bevisa borttagning och slutförande. |
| Förlorad kvittens | Proxyn vidarebefordrar verkligt remove, kastar sedan bort svaret. Bevisa att objektet faktiskt är borta medan skuld/jobbet kvarstår. Återförsök ska kontrollera frånvaro och slutföra en gång. |
| Blockerat/okänt beroende | Skapa ett syntetiskt delat rapportberoende och en test-only okartlagd FK-tabell. Worker ska ge stabilt blockfel och atomiskt bevara raderna. Frigör endast godkänt syntetiskt beroende; återförsök. Inget skydd kringgås. |
| Behörighet/status | Kandidat, vanlig medlem, annan organisation och aktiv rekrytering ska nekas via riktiga JWT/API-anrop; inga köposter eller ändrade filer. |

Fel- och kvittensfallen behöver en **test-only** worker-deployment med nätverksproxy
för fault injection som anropar det verkliga Storage API:t och samma `runRetentionWorker`.
Ingen Storage-mock. Kör dessutom normal deployad worker för positiva fall. Produktions-
entrypoint och shared-worker ska behålla ovanstående källdigests. Dokumentera separat
normal bundle och fault-injection bundle, så testkoden inte kan bli produktionsversion.

Kör fulla portalvägar med faktisk inloggning i **sv/en × desktop 1440/mobile 375**:
avgör kandidater, avsluta rekrytering, arkivera ansökan och hela rekryteringen, kontrollera
aktiva listor och filtret Arkiverade, återställ, visa beräknat gallringsdatum, kontrollera
raderingsdialogens omfattning/filer, bekräfta, följ status och gör återförsök efter filfel.
Bevisa via både UI och DB att arkivåterställning, sidvisning och anteckningsredigering inte
ändrar `completion_state`, `completed_at` eller gallringsdatum. Kontrollera standard 24,
ägarens sexmånadersval, UTC/månadsslut och exakt gräns samt saknat datum utan gissning.

Spara tidsstämplar, projektref, SHA, worker-version, fixture-ID, assertioner, skärmbilder
och digests. Browsertraces kan innehålla JWT; lagra dem privat och publicera bara digests.
Jobbet måste aldrig ha `completed_at` medan en köfil eller blockerad databasradering
återstår. Förlorad kvittens ska lämna synlig skuld tills nästa verifierade försök.
Nuvarande lokala SQL-, worker-mock- och komponentbevis ersätter inte dessa tester.

## Exakt framtida aktiveringsbeslut

Detta beslut ska visas för ägaren först när ovanstående tester är gröna, miljögrinden
verifierad och en ny skrivskyddad snapshot ger exakt mängd, ID och materialomfattning.
Nu saknas testbevis; aktivering ska därför inte godkännas på detta underlag.

**A — Verkställning av manuellt bekräftade jobb:** Godkänn aktivering av verifierad
`recruitment-retention` på `wrygicdfxwjnrugduxnt` från main-SHA ovan (eller en uttryckligen
omverifierad ersättare), bundle/version verifierad efter test. Lagra slumpmässig unik
`RECRUITMENT_RETENTION_TOKEN` (minst 32 tecken) säkert som Edge-hemlighet och samma token
i Vault; använd Supabases servernyckel endast i workern. Aktivera miljöflaggan och den
namngivna scheduler-körningen, men behåll databasens automatic-flagga `false`.
Första batch enligt snapshot ovan: **0 jobb / 0 ansökningar / 0 filer**. Ingen annan
omfattning omfattas av denna snapshot; uppdaterad batch måste redovisas före godkännande.

**Viktig omfattningsgräns:** worker hämtar alla väntande jobb, även gamla
`automatic_retention`, när automatic-flaggan är false. A kräver därför noll väntande
automatiska jobb i den nya snapshoten, annars ett utvidgat explicit beslut. Worker har
ingen produktionsselektor för att köra bara ett godtyckligt valt manuellt jobb.

**B — Automatisk köläggning och gallring:** Ett separat godkännande utökar A med
`recruitment_erasure.activation.enabled=true`. Standard 24 kalendermånader och
arbetsgivarens uttryckliga sexmånadersval gäller även redan avslutade ärenden, från verkligt
`completed_at`. Första enqueue-batch i denna snapshot: **0 ärenden**. Inga saknade datum
får fyllas automatiskt. Redovisa nya förfallna ID och beroenden vid beslutet.

## Driftsekvens, övervakning och avstängning

Efter godkännande: använd den officiella projektintegrationen/behörig driftoperatör för
separat deployment och hemlighetskonfiguration. Installera enbart saknade cron/net-
extensions via separat godkänd driftändring; återinstallera inte retention-migrationen.
Vault-namn: `recruitment_retention_url` (exakt produktions-URL) och
`recruitment_retention_token`. Kontrollera namn/unik förekomst utan att läsa ut värden i logg.
Cron: **`recruitment-material-retention`**, **`*/15 * * * *`**, POST till
`/functions/v1/recruitment-retention`, timeout 120000 ms; mall finns i aktiveringsplanen.
Ändra inte andra cron-jobb. Default worker-batch: 10 enqueue, 10 claims, 100 filer/claim;
lease 10 minuter och nytt försök efter 15 minuter. Större filskuld fortsätter nästa körning.

Utse före aktivering en namngiven driftansvarig och ersättare som tar emot driftlarm.
Kontrollera varje 15-minuterskörning: cron-run, pg_net HTTP-svar, JSON `ok`/`failed`,
Edge-fel och rapportens pending/failed files, blockerade jobb och attempts. Cron-grönt
betyder bara att HTTP skickades; HTTP 200 med `ok:false` är ett fel. Larma direkt på
HTTP-fel/`ok:false`/blockerat jobb, och på två uteblivna körningar (30 minuter) eller
växande skuld. Läs och bevara relevanta pg_net-svar innan deras loggar löper ut.
Logga bara stabila felkoder och interna jobb-ID, inga kandidattexter eller tokens.

Vid fel: stoppa först worker genom `RECRUITMENT_RETENTION_WORKER_ENABLED=false`,
unschedule endast `recruitment-material-retention`, sätt automatic-flaggan false enligt
driftrollback-filen. Detta stoppar nya körningar; en redan startad körning kan slutföra
sin pågående claim. Behåll skuld/schema, undersök filer och återförsök endast efter
behörigt beslut. Raderade uppgifter återställs inte genom rollback eller arkivåterställning.

Efter första **verkliga, tillåtna och verifierade** driftkörning: kontrollera fysisk
radering och skyddade referenser, logga instruktion, projekt/version, antal, fel/skuld
och bevis i genomförandeloggen. En tom första batch kan visa drift av schemaläggningen
men bevisar inte fysisk radering. Markera mekanismen `live` först när faktisk drift
verifierats och loggats enligt ägarens aktiveringsvillkor. Denna förberedelse ändrar ingen
live-markering och lägger inte in en falsk genomföranderad.
