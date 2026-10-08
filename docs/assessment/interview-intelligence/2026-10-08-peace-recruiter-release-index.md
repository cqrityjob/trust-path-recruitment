# PEACE och Recruiter Intelligence: versionsbundet releaseunderlag

Arbetsversion v0.3-LIVE-r9, 2026-10-08. Detta index förbinder den ursprungliga
intervjuinventeringens dokumentationsplats med det fortsatta releaseunderlaget
i #449. Det ersätter inte beslutad rollguide eller innehållsgranskning.

[Aktuell r9-releasejournal](../recruiter-intelligence/2026-10-08-live-release.md)
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
verifierad installerad; snapshot-appen #452 väntar på slutgrind/publicering.
Manifestet upptäcker avvikelser. Faktiskt skydd av pågående ärenden kommer från
bestående användningslås, atomisk full snapshot och att både intervju och
rapport läser den. Dessa egenskaper får inte blandas ihop.

De 20 tidigare ärendena har `observed_now`-snapshot; det är ingen retroaktiv
garanti för äldre innehåll. Fortsättning kräver verklig ägare/admins hash-CAS,
notering och audit. Använd draft blir låst. Godkännande, översättning eller
ändring ska bindas till en ny innehållsversion; återkallning stoppar nya starter
och lämnar tidigare lås, snapshots och fastställda rapporter skyddade.

[Installationsbevis snapshot](../../release/2026-10-08-interview-content-snapshot-hosted-verification.json)
och [konflikttransport/historik](../../release/2026-10-08-recruiter-domain-conflict-hosted-verification.json)
är skilda från [faktiska isolerade native-intervjuresor](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run4/README.md).
Ingen sådan teknisk kontroll godkänner metodinnehållet eller ersätter en
kommersiell innehålls-/språkgranskning.

## Daterat tillägg r9, 2026-10-08 12:23 UTC

[Run9:s exakta 191d/app 3d66-bevis](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run9/README.md) passerar 12 intervjuresor/2 tvåfliksprov, 7 Storageadapterprov och alla 8 frågenoter efter 3 faser i riktig isolerad Auth/Storage. #452:s obligatoriska slut-CI pågår; publicerad app är fortsatt 886 och hosted 071/385. Den särskilda explicit-read-nätverksfelvägen har lokal regression, inte native HTTP-fault-injection.

[OP09 a037/appcce/schema 9c8](../recruiter-intelligence/evidence/2026-10-08-native-op09-a037/README.md) passerar 44 SDK-/4 recovery-UI-prov. Båda samtidiga raceförsök gav registrering som vinnare; sekventiella båda ordningarna verifierades separat. [P1 native 3ac](../recruiter-intelligence/evidence/2026-10-08-native-p1-3ac-browser-failure/README.md) passerar 386/Auth 104/Storage 80/100 kravbedömningar via granskar-sessioner/23 API men behåller browserFAIL. Test-only 3e0/0508192 med exakt saved-source-anchor och sekretessbegränsad JSON-diagnos väntar nytt femfalls-nativebevis. Appcore-/slut-CI och hosted 080/0909-installation återstår.

Alla äldre PASS/FAIL behåller sitt datum och huvud. Tekniska användningslås/snapshots skyddar versionbundet innehåll; manifestet upptäcker avvikelser och fastställd rapport har separat frysning. 20 äldre observed_now-ärenden är inget retroaktivt startfrysningsbevis. Rollguiderna förblir draft/EN-luckor med 8Q/6C och 0 godkännanden. Ingen ny metodapproval, hosted Auth/B-verifiering eller fysisk telefon följer av native-PASS. [R9-releasejournalen](../recruiter-intelligence/2026-10-08-live-release.md#tillägg-r9-dokumenterat-2026-10-08-1223-utc) anger grindar, kvarstående skuld och återställningsordning.

## Daterat tillägg r8

[Verifierat native run8](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run8/README.md) gäller exakt app0eab/schema250/test885 i isolerad riktig GoTrue/Storage:12intervjuer/2tvåfliksprov och alla8 sparade frågenoter passerade. Den senare explicit-read-rättningen55d6 ingår i nya apphuvuden3d66/c52/cce och har separat lokal regression; nytt191d-nativebevis väntar. Fulla native100 och OP09 native44/recovery4 är fortfarande inte passerade;9c8:s faktiska full387/41+95/historik-CI är ett separat schema-/transportbevis. Ingen ny publicering eller080/0909-installation påstås. Äldre PASS och FAIL bevaras, och ingen teknisk kontroll godkänner de draftbaserade rollguiderna eller fyller deras engelska innehållsluckor.
