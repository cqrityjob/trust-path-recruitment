# PEACE och Recruiter Intelligence: versionsbundet releaseunderlag

Arbetsversion v0.3-LIVE-r12, 2026-10-08. Detta index förbinder den ursprungliga
intervjuinventeringens dokumentationsplats med det fortsatta releaseunderlaget
i #449. Det ersätter inte beslutad rollguide eller innehållsgranskning.

[Aktuell r12-releasejournal](../recruiter-intelligence/2026-10-08-live-release.md)
anger exakta huvud-/main-SHA, obligatorisk CI, verkligt installerade migrationer,
faktisk publicerad releaseidentitet, konstaterade fel, blockerade kontroller och
återställningsordning. [22driftprovs matris](../recruiter-intelligence/2026-10-08-live-operational-matrix.md)
skiljer isolerad riktig Auth/Storage från publicerad runtime och fysisk telefon.

PEACE beskriver intervjuarens arbetssätt. De åtta befintliga kärnfrågorna och
sex kompetensområdena per roll är bevarade. Mänsklig bedömning citerar evidens
mot rollkrav separat; ingen PEACE-poäng, automatisk kandidatrangordning,
personlighets-/trovärdighetsbedömning eller anställningsslutsats införs.

Båda rollguiderna är fortfarande draft/pilot_hypothesis med review open och 0
granskarbeslut. Svenska frågor, probes och definitioner är bevarade; engelska
rollfrågor/definitioner/probes saknas och säkerhetschefens engelska ankare har
ytterligare luckor. Engelskt gränssnitt innebär inte en godkänd engelsk metod.

Snapshot-schema 07090000 är installerat och konflikttransport 07100000 är
verifierad installerad; snapshot-appen #452 ingår i offentligt avlästa main 6d92056. R12 nedan skiljer den från integrationsappen och dess publiceringsunderlag.
Manifestet upptäcker avvikelser. Faktiskt skydd av pågående ärenden kommer från
bestående användningslås, atomisk full snapshot och att både intervju och
rapport läser den. Dessa egenskaper får inte blandas ihop.

De 20 tidigare ärendena har `observed_now`-snapshot; det är ingen retroaktiv
garanti för äldre innehåll. Fortsättning kräver verklig ägare/admins hash-CAS,
notering och audit. Använt normativt innehåll blir permanent låst. Ändring eller översättning kräver
en ny version. Ren livscykel eller godkännandestatus kan ändras genom befintliga
behörigheter när innehållshashen förblir densamma; ärendets snapshot behåller
statusen vid frysningen. Indragen öppen pilottillgång tar bort den startgrunden
men inte ett separat giltigt pilotmedgivande. R12 och den länkade
livscykelgranskningen redovisar terminalstatusspärren som återstår.
Tidigare lås, snapshots och fastställda rapporter består.

[Installationsbevis snapshot](../../release/2026-10-08-interview-content-snapshot-hosted-verification.json)
och [konflikttransport/historik](../../release/2026-10-08-recruiter-domain-conflict-hosted-verification.json)
är skilda från [faktiska isolerade native-intervjuresor](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run4/README.md).
Ingen sådan teknisk kontroll godkänner metodinnehållet eller ersätter en
kommersiell innehålls-/språkgranskning.

## Daterat tillägg r12: aktuell slutleverans och öppna grindar

[R12-journalen](../recruiter-intelligence/2026-10-08-live-release.md#tillägg-r12-aktuell-slutleverans-och-öppna-grindar) och [matrisen](../recruiter-intelligence/2026-10-08-live-operational-matrix.md#tillägg-r12-aktuell-slutleverans-och-öppna-grindar) binder #449:s main-bas **e4531c3b8abac440c9a98ed0f4182106d5b31106** och faktisk CI/native. Eget docshead/slutmain anges i PR-metadata/slutrespons utan själv-SHA; r11/tails/historiska FAIL/PASS bevaras.
#453 a46→2db06ef/#458 b9→8c2895 har 18/18; #456 e341→a21bfed alla 19 efter enda faktiska API-retry med 95 SQL/23 HTTP på 14.15; #460 19ed→f249bc6 alla 19/core 37796857544. Hosted 080→0909/387 installerat; #461:s attempts 1+2 ECR FAIL bevaras; sista samma-head-owner-retry 16:08:41 blev attempt 3/job 113412007956 SUCCESS, samtliga 19 gröna, normal merge e4531c3b8abac440c9a98ed0f4182106d5b31106.
Lovable 15:57:58 är synkad 8c2895 (P1+recovery); public GET 15:58:32 visar 6d92056 (snapshot). Detta är olika identiteter; avläsningen tillskriver ingen deploy/aktör. Äldre886/c004 behåller sina datum.
Aktuella nativepinnar APP 40e/schema 1e: [e341 intervju](../recruiter-intelligence/evidence/2026-10-08-native-interview-current-e341/README.md) 12+2/Storage 7, [19ed native100](../recruiter-intelligence/evidence/2026-10-08-native-p1-current-19ed/witness.md) 100/API 23/browser 5 och [6ae OP09](../recruiter-intelligence/evidence/2026-10-08-native-op09-current-6ae/README.md) 44 SDK/4 browser PASS. Separata readiness-/rate-limitFAIL bevaras.
PEACE styr intervjuarens fem steg. SV 8Q/6C, erfarenhetsfrågor/scenarier, manuella kontrollpunkter/reflektion/avvikelse bevaras; mänsklig bedömning citerar evidens mot rollkrav separat.
Kravstatus är käll-/profilversionsbunden: minst ett skallkrav och alla accepterat uppfyllda ger grönt; explicit ej uppfyllt ger gult; luckor grått. AI-förslag/PEACE-arbetssätt ger ingen kandidatscore/rangordning/sannings-/personlighetsdetektion/anställningsslutsats.
[Uttryckligen vald förberedelsekopia](recruiter-intelligence-v03-selected-source-boundary.md) följer målärendets ACL/retention och bekräftar ingen evidens. Aktuell SV-handoffbild visar sparad R2 men livepanel-loading, inte färdig liveansökan.
Guiderna är draft/pilot_hypothesis/review open/0 godkännanden. EN-frågor/definitioner/probes och ytterligare säkerhetschefsankare saknas; engelskt UI/native-PASS är ingen godkänd engelsk metod eller kommersiell metodvalidering.
Manifestet upptäcker avvikelser; permanenta use-lock/atomisk snapshot skyddar bundet innehåll; fastställd rapport fryses separat. Färsk 16:30/16:33 SELECT ger 21 snapshots: ursprungliga 20 observed_now och 14 låsrader oförändrade med samma radformel, 0 ACK; senaste rapportpopulationen avlästes separat 13:34. Ingen retroaktiv startfrysning.
Normativ ändring/översättning av använt innehåll kräver ny version; ren lifecycle kan ske utan ändrad lagrad hash; submit/publish nekas på använd version om omstämplingen ändrar hash. Snapshotstatus blir inte retroaktivt godkänd. [Färsk hashavläsning](../recruiter-intelligence/evidence/2026-10-08-final-hosted-readback.json) bekräftar väktarens redan dokumenterade 6b/2f-avvikelse från äldre EN-evidensetiketter; ingen retroaktiv omstämpling.
[Full 387-lifecyclegranskningen](../recruiter-intelligence/2026-10-08-content-lifecycle-review.md) skiljer indraget open_pilot från separat restricted + livegrant, som är avsiktligt. Suspended/retired + old livegrant når ännu new-case-fallback; grantguard på alla UPDATE nekar också revoked_at efter statusbytet: konkret kommersiellt pilotgap, inget påstått hostedmissbruk.
Föreslagen forwardguard före grantfallback + strikt genuint revoked_at-undantag och nya behörighets/hash/list/create/INSERT/race/snapshot-/rapportprov är ej implementerade/ej utförda. Bevara exakt legitim grant/ärendekontinuitet, lås/snapshots/rapporter; tekniskt PASS ersätter inte metodbeslut.
Alla 22 autentiserade hostedprov BLOCKED, fysisk telefon NOT RUN. E341 375/390 är korrekt emulering; filnamnswrap/scrollad steglist/startupdiagnostiklucka/tidigare lint 772/114/advisors 4 ERROR + 1 WARN kvarstår.
Exakt slutmain/publiceringsredo fastställs utan nytt approvalsflöde; faktisk publicering/hosted-verifiering redovisas separat. Root anropade ingen deploy i den aktuella avläsningsomgången.
Rollback: kompatibel app först, installerat schema rättas framåt utan SQL-replay; snapshots/evidens/audit/rapportfrysning bevaras. Ingen AI-kostnad/verkligt utskick/retention-worker/cron aktiveras av tillägget.

## Daterat tillägg r11, 2026-10-08 14:14 UTC

Main c004 innehåller mergad snapshot-app #452/26e7 efter 15/15 slut-CI och schema #457/1e efter 15/15 CI. Hosted 080 och 0909 är installerade i ordning, ledger 387 med prior 386 oförändrat. [R11-releasejournalen](../recruiter-intelligence/2026-10-08-live-release.md#tillägg-r11-dokumenterat-2026-10-08-1414-utc) länkar full faktisk katalog-/ACL-/constraint-/policygranskning av 16 P1- och 10 nya journalfunktioner samt bevarande av 20 observed_now/14 permanenta lås/0 ACK/0 rapporter/status. Rättningen av katalogfrågans 42883 ändrade ingen schemafunktion. Manifestdetektion, permanent användningslås/atomisk snapshot och rapportfrysning är skilda skydd; ingen retroaktiv startfrysning eller metodapproval tillkommer.

[Terminalt 26e7-bevis](../recruiter-intelligence/evidence/2026-10-08-ci-26e7-terminal.md) skiljer den genomförda avgränsade omkörningens 15 PASS från första ECR 429-FAIL och omfattar 386, inte 0909/41. Native 191d 12+2/Storage 7, 0508:s 100 facit/API 23/5 browser och a037 44+4 behåller sina egna pinnar. De nya #456/513, #460/6d5 och #461/7b2 pinnar kombinerad app 40e/schema 1e/387 och är NOT RUN/pending. Exakta appgrindar/publicering/hosted B återstår; metadata #462/398 har aktuellt ECR 429/PG16 FAIL och planerad retry är inget PASS.

Publicerad app är fortsatt 886; sista faktiska Lovable 517 från 11:09 är ingen färsk synk på c004. Hosted Auth/B BLOCKED, fysisk telefon NOT RUN, draft/pilot_hypothesis/review open/0 godkännanden, 8Q/6C och EN-luckor består. Projektets rådgivarfynd från 13:09, 4 security-definer-view ERROR och 1 mutable-search-path WARN, är ej rättade; teknisk RI-paritet är inget påstående att hela databasen saknar säkerhetsfynd. Repository-/lint-/UX-skuld och samtliga historiska FAIL/PASS behåller sitt avgränsade omfång.

## Daterat tillägg r10, 2026-10-08 13:06 UTC

Main 2a innehåller normal merge av P1-schema451/6039. 080 är faktiskt installerad med 386 ledgeridentiteter och oberoende full katalog-/ACL-/constraint-/policygranskning; 20 observed_now-snapshots/14 permanenta lås/0 ACK/0 rapporter och deras rad-MD5 är bevarade. Publicerad app är fortsatt 886; senast faktiskt avläst Lovable 517 är ingen ny synkavläsning på 2a. [R10-releasejournalen](../recruiter-intelligence/2026-10-08-live-release.md#tillägg-r10-dokumenterat-2026-10-08-1306-utc) länkar exakt installeringsbevis och metadata462.

[Native 100:s 0508-vittne](../recruiter-intelligence/2026-10-08-native-p1-100-actual-witness.md) passerar 386 migrationer/104 riktig Auth/80 original/100 facit40–25–35 och27–73/23 API/fem browserfall med exakt app 3e0/schema 6039. PEACE-handoff bevarar 8 frågor/6 kompetensområden/full fryst manifest och 0 bekräftad evidens. Privilegierad fixture-Storage och admin CV-radering/återuppladdning är uttryckliga testgränser; ingen kandidatconsent- eller hosted-upload-garanti tillkommer. Kravprofilens version/status är skild från intervjuarens PEACE-arbetssätt och rollkravsbedömning.

452/26e7 har oförändrat produkt-SRC mot 191d/app 3d66:s native 12+2-PASS; ny obligatorisk CI har ett faktiskt ECR Dockerpull 429-fel och är ännu ingen slut-PASS. Lokalt P1-/recoveryintegrerade apphuvuden har separata slutgrindar. 0909 är ej installerad; a037:s native 44+4 är separat från hela den nya integrationsappen. Hosted Auth/B BLOCKED, fysisk telefon NOT RUN, draft/0 godkännanden/EN-luckor och dokumenterad repository-/UX-skuld består. Tekniskt use-lock/snapshot, manifestdetektion och rapportfrysning ger inget retroaktivt innehållsgodkännande eller historiskt startfrysningsbevis. Alla äldre daterade PASS/FAIL bevaras.

## Daterat tillägg r9, 2026-10-08 12:23 UTC

[Run9:s exakta 191d/app 3d66-bevis](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run9/README.md) passerar 12 intervjuresor/2 tvåfliksprov, 7 Storageadapterprov och alla 8 frågenoter efter 3 faser i riktig isolerad Auth/Storage. #452:s obligatoriska slut-CI pågår; publicerad app är fortsatt 886 och hosted 071/385. Den särskilda explicit-read-nätverksfelvägen har lokal regression, inte native HTTP-fault-injection.

[OP09 a037/appcce/schema 9c8](../recruiter-intelligence/evidence/2026-10-08-native-op09-a037/README.md) passerar 44 SDK-/4 recovery-UI-prov. Båda samtidiga raceförsök gav registrering som vinnare; sekventiella båda ordningarna verifierades separat. [P1 native 3ac](../recruiter-intelligence/evidence/2026-10-08-native-p1-3ac-browser-failure/README.md) passerar 386/Auth 104/Storage 80/100 kravbedömningar via granskar-sessioner/23 API men behåller browserFAIL. Test-only 3e0/0508192 med exakt saved-source-anchor och sekretessbegränsad JSON-diagnos väntar nytt femfalls-nativebevis. Appcore-/slut-CI och hosted 080/0909-installation återstår.

Alla äldre PASS/FAIL behåller sitt datum och huvud. Tekniska användningslås/snapshots skyddar versionbundet innehåll; manifestet upptäcker avvikelser och fastställd rapport har separat frysning. 20 äldre observed_now-ärenden är inget retroaktivt startfrysningsbevis. Rollguiderna förblir draft/EN-luckor med 8Q/6C och 0 godkännanden. Ingen ny metodapproval, hosted Auth/B-verifiering eller fysisk telefon följer av native-PASS. [R9-releasejournalen](../recruiter-intelligence/2026-10-08-live-release.md#tillägg-r9-dokumenterat-2026-10-08-1223-utc) anger grindar, kvarstående skuld och återställningsordning.

## Daterat tillägg r8

[Verifierat native run8](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run8/README.md) gäller exakt app0eab/schema250/test885 i isolerad riktig GoTrue/Storage:12intervjuer/2tvåfliksprov och alla8 sparade frågenoter passerade. Den senare explicit-read-rättningen55d6 ingår i nya apphuvuden3d66/c52/cce och har separat lokal regression; nytt191d-nativebevis väntar. Fulla native100 och OP09 native44/recovery4 är fortfarande inte passerade;9c8:s faktiska full387/41+95/historik-CI är ett separat schema-/transportbevis. Ingen ny publicering eller080/0909-installation påstås. Äldre PASS och FAIL bevaras, och ingen teknisk kontroll godkänner de draftbaserade rollguiderna eller fyller deras engelska innehållsluckor.
