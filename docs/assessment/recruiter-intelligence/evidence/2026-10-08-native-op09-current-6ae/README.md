# Aktuellt OP09 native-vittne: 6ae933

Faktisk isolerad CI-körning **2026-10-08 15:17:18.804–15:20:34.918 UTC: PASS**, separat oberoende verifierad. Äldre 7b2/a037/2bb behåller egna versionsbundna utfall.

| Pin / identitet | Exakt värde |
| --- | --- |
| Evidenshuvud #461 | `6ae933c68da56121cdf02d4a7d4e301510a0709e` |
| App | `40e5775de5195050571421827434ec2872a61506` |
| Schema | `1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9` |
| SRC-tree | `3d5feca97be01959778173fc3a0f0959fe62355c` |
| Run / job | [37796851340 / 113378429798](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37796851340/job/113378429798), terminal SUCCESS |
| Artifact | `11559159823`, `passport-native-op09-evidence`, 2 816 182 bytes |
| ZIP SHA256 | `9a7e9277abd2cf2b4dfd8c8f2be8f55c1fddf0e1e5f8e5b54b9d3d91fb447de0` |
| Originalmanifest SHA256 | `498b0af41ad666c0ac2f369b3ace9f00b694561baa8a32ff26fbe23590ea85c8` |
| Oberoende verifiering SHA256 | `779239f30e16dd35d720e3ed743f45bccb80b7999238dfbfdf652f4e3daae6b9` |

[Originalmanifest](manifest.json) och [oberoende verifiering](independent-verification.json) bevaras byteoförändrade. Exakta app-/schema-/config-träd, båda ancestors, alla **387 migrationsnamn/hashar i ordning**, helper/preload-hashar, arkivets manifest och samtliga **12 PNG** matchar auktoritativa Git-blobs respektive originalbytes. Faktiska tjänster: PostgreSQL 17.6, GoTrue 2.194.0, Storage 1.67.20, PostgREST 14.15 och Supabase JS/Auth JS 2.110.5.

Sju steg PASS, `errors=[]`: **8 nya bekräftade Auth-konton**, **44 SDK-assertions** med egna verkliga caller-sessioner/Storage, **4 browserresor** (SV/EN, desktop1440/emulerad375), uttrycklig reload/resume/cleanup samt stopp av endast den egna stacken. Browserresultat `expected=4`, `unexpected=0`, `flaky=0`, `skipped=0`. Varje resa har exakt ett eget testinjicerat DELETE503, bestående fence utan tyst resume/retry, sedan explicit återförsök med bevisad frånvaro och bevarat registrerat original.

De två samtidiga race gav **`registration_won`, `registration_won`**; **`bothRaceOrdersObserved=false`**. Båda ordningarna prövades sekventiellt. De sista **10 SDK-assertions** gäller **local** logout/live-session, direkta nekade journaloperationer och ärlig list-/cleanup-/resume-/originalåtkomst. De bevisar varken JWT-expiry eller generell omedelbar global logout.

Slutreadback: **8 bekräftade Auth-konton, 1 syntetisk draft-annons, 13 journalrader och 7 evidensrader**. Ansökningar/kvitton/meddelanden/mailförsök/AI-runs/SecurityWork-runs/erasure-jobb/-kö/cron är 0 och `ai_enabled=false`. Ingen AI-kostnadsaktivering, worker/cron eller kandidatkommunikation ingår.

Två aktuella oförändrade originalbilder är valda och visuellt lästa: [SV desktop fenced](images/sv-desktop1440-fenced.png), SHA256 `07911b4de28cee2c2951245f1b80bb6c393166f3b4de125a16d5de6c16285bb0`, och [EN emulerad375 fenced](images/en-emulated375-fenced.png), SHA256 `6ac3bffa9465cc152018db71e70e600ced32af4cbd0df021a20b264ad2a7cc7e`. Det registrerade originalets filnamn bryts nästan teckenvis på375; känd layoutskuld kvarstår. Bilderna ger inget fullständigt mobil-/accessibility-/prestanda-PASS.

Miljön är faktisk **ephemeral CI**, inte hosted runtime/CDN eller autentiserad publicerad B-matris. Emulerad375 har explicita `isMobile/hasTouch`, men är **inte fysisk telefon**. Teknisk kontroll godkänner inget PEACE-/rollguideinnehåll och löser inga EN- eller repo-/lintskulder. Aktuell core-CI är separat: dess första PG16-försök stoppades av ECR `toomanyrequests: Rate exceeded`; detta native-PASS får inte märkas som whole-core-PASS. Ingen självständig retry, tjänststart, test-/DB-/Auth-skrivning eller produkt-/repoändring utfördes av granskaren. Ingen ZIP eller privat logg kopieras här.
