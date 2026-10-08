# PEACE och Recruiter Intelligence: versionsbundet releaseunderlag

Arbetsversion v0.3-LIVE-r7, 2026-10-08. Detta index förbinder den ursprungliga
intervjuinventeringens dokumentationsplats med det fortsatta releaseunderlaget
i #449. Det ersätter inte beslutad rollguide eller innehållsgranskning.

[Aktuell r7-releasejournal](../recruiter-intelligence/2026-10-08-live-release.md)
anger exakta huvud-/main-SHA, obligatorisk CI, verkligt installerade migrationer,
faktisk publicerad releaseidentitet, konstaterade fel, blockerade kontroller och
återställningsordning. [22driftprovs matris](../recruiter-intelligence/2026-10-08-live-operational-matrix.md)
skiljer isolerad riktig Auth/Storage från publicerad runtime och fysisk telefon.

PEACE beskriver intervjuarens arbetssätt. De åtta befintliga kärnfrågorna och
sex kompetensområdena per roll är bevarade. Mänsklig bedömning citerar evidens
mot rollkrav separat; ingen PEACE-poäng, automatisk kandidatrangordning,
personlighets-/trovärdighetsbedömning eller anställningsslutsats införs.

Båda rollguiderna är fortfarande draft/pilot_hypothesis med review open och0
granskarbeslut. Svenska frågor, probes och definitioner är bevarade; engelska
rollfrågor/definitioner/probes saknas och säkerhetschefens engelska ankare har
ytterligare luckor. Engelskt gränssnitt innebär inte en godkänd engelsk metod.

Snapshot-schema07090000 är installerat och konflikttransport07100000 är
verifierad installerad; snapshot-appen #452 väntar på slutgrind/publicering.
Manifestet upptäcker avvikelser. Faktiskt skydd av pågående ärenden kommer från
bestående användningslås, atomisk full snapshot och att både intervju och
rapport läser den. Dessa egenskaper får inte blandas ihop.

De20 tidigare ärendena har `observed_now`-snapshot; det är ingen retroaktiv
garanti för äldre innehåll. Fortsättning kräver verklig ägare/admins hash-CAS,
notering och audit. Använd draft blir låst. Godkännande, översättning eller
ändring ska bindas till en ny innehållsversion; återkallning stoppar nya starter
och lämnar tidigare lås, snapshots och fastställda rapporter skyddade.

[Installationsbevis snapshot](../../release/2026-10-08-interview-content-snapshot-hosted-verification.json)
och [konflikttransport/historik](../../release/2026-10-08-recruiter-domain-conflict-hosted-verification.json)
är skilda från [faktiska isolerade native-intervjuresor](../recruiter-intelligence/evidence/2026-10-08-native-supabase-run4/README.md).
Ingen sådan teknisk kontroll godkänner metodinnehållet eller ersätter en
kommersiell innehålls-/språkgranskning.
