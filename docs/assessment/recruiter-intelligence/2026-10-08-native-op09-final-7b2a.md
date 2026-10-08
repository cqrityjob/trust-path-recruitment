# OP09 native: versionsbundet slutvittne för 7b2a

Observation 2026-10-08, faktisk körning **14:37:38.215–14:41:04.440 UTC: PASS**. Det gäller en färsk isolerad GitHub CI-stack med verklig GoTrue/Storage och riktiga lösenordsinloggningar. Det är inget hosted-/publiceringsbevis. Tidigare a037/2bb och senare huvuden behåller egna utfall och begränsningar.

| Identitet | Exakt värde |
| --- | --- |
| Evidenshuvud #461 | `7b2a47026fdd26b18f1674bd494a5800d2399038` |
| App | `40e5775de5195050571421827434ec2872a61506` |
| Schema | `1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9` |
| SRC-tree | `3d5feca97be01959778173fc3a0f0959fe62355c` |
| Run/job | [37790823455 / 113357428434](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37790823455/job/113357428434), terminal SUCCESS |
| Artifact | `11558490180`, `passport-native-op09-evidence` |
| ZIP SHA256 | `ef5fdabc520e112278e522fcd88b59bb2a36c9efb9c741783c1ee00dba1f7a26` |
| Originalmanifest SHA256 | `de70fbe7cadf87bb10b66f3e0c4bbd04cc38b2c15b7ddaa34fbe8239df6d1139` |

[Originalbevis och två PNG](evidence/2026-10-08-native-op09-final-7b2a/README.md), [manifest](evidence/2026-10-08-native-op09-final-7b2a/manifest.json) och [oberoende läsande verifiering](evidence/2026-10-08-native-op09-final-7b2a/independent-verification.json) är versionshanterade utan ZIP eller privata loggar. GitHub-jobb/artifact, exakta ZIP-bytes, samtliga 12 PNG-hashar/storlekar och **387 migrationshashar i ordning** återkontrollerades oberoende. App-/schema-/config-träd och båda pinnade ancestors matchar Git-objekten. Äldre bevis och releasehistorik ändras inte.

Faktiska tjänster: PostgreSQL 17.6, GoTrue 2.194.0, Storage 1.67.20, PostgREST 14.15, Supabase JS/Auth JS 2.110.5. Alla sju manifeststeg passerar, `errors=[]`, och stopp av endast den egna stacken bekräftas. Operativ helper SHA256 `d6c145b5dc2d25114d4f60cad22fb18e9a81ca84e3c0a14dcf1459954c0ac1fe` och testpreload SHA256 `fb946ffc25843ba8a2892eefc75830c8e1ce9a08e7fb9835b126f455407ca2ca` matchar auktoritativa Git-blobs.

## Utfört och observerat

Åtta nya Auth-konton skapades via officiell admin-API och återlästes som bekräftade. Testaktörerna använder egna riktiga password-sessioner och RPC/Storage, utan service-role som testaktör. Den avgränsade setupen skapar en syntetisk draft-annons med kvitton avstängda; inga ansökningar eller utskick skapas.

**44 SDK-assertions** omfattar förlorat uppladdningssvar, bestående egen journal, uttrycklig/idempotent återupptagning, motpartsnekande, cleanup-fence och återförsök, sen registrering/Storage-upsert efter fence, bevarade registrerade bytes, befintlig withdrawal-RPC, ändrade bytes samt races och lokal session-revocation. De sista **10 assertions** gäller local signOut, inaktiv live-session, fyra direkta nekade journal-RPC:er, ärlig tom-list-/cleanup-/resume-status och nekad originalåtkomst. Detta är inget JWT-expiry- eller generellt omedelbart global-logout-prov.

De två faktiskt samtidiga race gav **`registration_won`, `registration_won`**. Manifestet anger korrekt **`bothRaceOrdersObserved=false`**. Båda ordningarna verifierades sekventiellt genom registrering före cleanup och fence före sen registrering; inget påstående görs att båda samtidiga utfall observerades.

**Fyra browserresor** passerar på svenska/engelska i desktop 1440 och emulerad Chromium 375: `expected=4`, `unexpected=0`, `flaky=0`, `skipped=0`. Varje resa bekräftar reload utan tyst attachment, uttrycklig återupptagning till en metadata-rad, exakt ett testinjicerat eget DELETE503 med bestående fence/bytes, reload utan nytt automatiskt delete samt uttrycklig retry till verifierad frånvaro. Registrerat original bevaras. Denna browser-injektion är separat från SDK-provet och använder endast det egna testförsöket.

Slutreadback: **8 bekräftade Auth-konton, 1 syntetisk draft-annons, 13 journalrader och 7 evidensrader**. Ansökningar, kvitton, meddelanden, mailförsök, AI-runs/SecurityWork-runs, erasure-jobb/-kö och cron är 0; `ai_enabled=false`. Ingen AI-kostnad, worker/cron eller kandidatkommunikation aktiverades.

## Bilder och gränser

[Svensk desktop](evidence/2026-10-08-native-op09-final-7b2a/images/sv-desktop1440-fenced.png) visar den bestående cleanup-statusen och explicit retry/reload, separat från det redan registrerade originalet. [Engelsk emulerad 375](evidence/2026-10-08-native-op09-final-7b2a/images/en-emulated375-fenced.png) visar samma ärliga status men behåller känd filnamnsbrytning nästan teckenvis bredvid knapparna. Detta är en layoutbegränsning, inte ett nytt fullständigt mobil-PASS.

Miljön är faktisk **ephemeral CI**, inte hosted runtime/CDN eller autentiserad publicerad B-matris. Chromium 375 är inte fysisk telefon; full accessibility/prestanda/layout är inte validerad. Enbart OP09-funktionerna omfattas; inget PEACE-innehåll godkänns och inga EN-luckor eller repo-/lintskulder löses av detta bevis. Den oberoende granskaren körde inga tjänster, tester eller DB-/Auth-skrivningar. Senare test-/metadata-huvud `6ae933c68da56121cdf02d4a7d4e301510a0709e` måste ha egen aktuell CI/native-status och ärver inte detta huvudets PASS.
