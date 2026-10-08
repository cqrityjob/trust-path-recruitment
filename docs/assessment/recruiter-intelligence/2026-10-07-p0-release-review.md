# CQrityjob Recruiter Intelligence v0.3 — P0 releasegranskning

**Version:** `0.3-P0-REVIEW-r2`, 2026-10-07. **Omfattning:** slutförd P0-granskning och releaseförberedelse samt föreslaget P1-acceptansfacit. P1-produktimplementation har inte påbörjats. Merge, produktionsinstallation, publicering, verkliga utskick, AI-kostnadsaktivering och retention-worker/cron inväntar separata klartecken från Mostafa. Detta dokument ger inget sådant klartecken.

P0:s funktioner har verifierats isolerat, men **release är ännu blockerad**. Appen använder ett pending schema. Kommersiell pilot kräver dessutom innehållsbeslut, bestående skydd av använda innehållsversioner och kvarvarande realtjänstprov. Tidigare leveransevidens behålls oförändrad i [P0-leveransrapporten](2026-10-07-v03-p0-delivery.md). Den här revisionen kompletterar dess äldre SHA-/CI-status; den uppgraderar inte ej utförda prov till PASS.

## 1. Exakta revisionsgränser

| Del                                                                                               | Granskad identitet                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub main / P0 main-bas                                                                         | `7fb66dcdaf22b7e0aec31b95c0cd4f220b0b873d`                                                                                                                        |
| Schema [#447](https://github.com/cqrityjob/trust-path-recruitment/pull/447), bas main             | `82564cc3ad390f0a378d8a8ef4376dbbc31fae12`                                                                                                                        |
| App [#448](https://github.com/cqrityjob/trust-path-recruitment/pull/448), draft, bas schemagrenen | `20dd01e7c73017dd44e250ebbefd7c02995f043c`                                                                                                                        |
| P0:s faktiskt browserprovade funktionella kod                                                     | `a088229e52834363fc0a9e4cbef7375ebfb0fd20`                                                                                                                        |
| Ursprungligt schema före denna guardrättning                                                      | `3b41ca827407feb2a65d05be5ffc67bc09a95c51`                                                                                                                        |
| Lovable senaste synkade commit, återkontrollerad 20:17 UTC                                        | main `7fb66dcdaf22b7e0aec31b95c0cd4f220b0b873d`. Editor-synk identifierar inte publicerad runtime.                                                                |
| Hosted innehåll/schema, läsande återkontroll                                                      | `wrygicdfxwjnrugduxnt`, 2026-10-07 20:00:23.965549 UTC: 382 migrationer, frontier `20270305090000`, nya manifest-RPC:n saknas. Ingen kandidat-/ärendedata lästes. |

Efter ursprunglig apprevision `9b83ba94e2ea008364ae46d780f9bed7c8680399` till aktuellt apphuvud ändras endast två guardfiler. Produktkod, migrations-SQL och browserprov är oförändrade. Schemagrenen integrerades med en vanlig merge; ingen publicerad historik skrevs om. Den separata granskningsgrenen `codex/recruiter-intelligence-v03-p0-review` innehåller dokumentation och ett fristående acceptansorakel. Dess slut-SHA anges av commit/PR, utan att flytta #447/#448 för dokumentationsändringar.

## 2. CI på aktuella huvuden

Den versionsbundna [CI-observationen](p0-review/ci-current-heads.json) innehåller observationstid, PR-head/base, workflow/check-ID, resultat och URL. Varje check måste avse exakt SHA ovan. Framgång på ett tidigare huvud, `mergeable=true`, en tom combined-statuslista eller `Supabase Preview: skipped` räcker inte. Kontrollera om allt vid varje senare head- eller basändring och före ett godkänt mergeförsök.

**Slutobservation: 2026-10-07 20:23:45 UTC.** Båda PR-huvudena och baserna återlästes; samtliga checks är avslutade. Ingen PR är mergad.

| CI-jobb / kontroll                       | #447 på 82564cc                       | #448 på 20dd01e                                                        |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Lint, typecheck and deterministic checks | **PASS**                              | **BLOCKED / failure:** endast `Schema-first release contract` fallerar |
| Migration replay, RLS and rollback tests | **PASS**                              | **PASS**                                                               |
| Passport three-market browser            | **PASS**                              | **PASS**                                                               |
| Public entry / arbetsgivarresa           | **PASS**                              | **PASS**                                                               |
| CV export / PDF / ATS                    | **PASS**                              | **PASS**                                                               |
| CV signed-in browser                     | **PASS**                              | **PASS**                                                               |
| Övriga aktiverade workflows              | **7/7 PASS**                          | **1/1 PASS:** preview image i workerd                                  |
| Supabase Preview                         | **SKIPPED**, inget installationsbevis | **SKIPPED**, inget installationsbevis                                  |

Schema-[CI 37677287715](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37677287715) är success; totalt 13 lyckade checks och en skipped preview. App-[CI 37677452111](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37677452111) är failure; fem huvudjobb och workerd-checken är success. Appens blockerande steg redovisar fem nya RPC:er och elva finding-kolumner i pending-migrationen. Efterföljande verify-steg, bland annat intervju-UX/metodguard och production build i det jobbet, är **skipped/ej körda**, inte godkända på apphuvudet. Dess tidigare steg inkluderar 33 P0-klientprov/197 assertions, app/scripts-typecheck, Sentinel och negativa kontroller som passerade. Separat CV-exportbuild passerade, men ersätter inte hela verify-jobbets build/grindar.

Appen förblir draft och ej merge-/releaseklar. Detta stopp ska hävas genom verklig installation och verifierade applied-bevis i separat godkänt arbete, följt av CI på det nya huvudet. Ingen guard eller statusdeklaration har ändrats för att skapa grönt.

Releasegrinden omfattar de sex jobben i [CI-workflowen](https://github.com/cqrityjob/trust-path-recruitment/blob/20dd01e7c73017dd44e250ebbefd7c02995f043c/.github/workflows/ci.yml): lint/typecheck/deterministiska kontroller; full migrationsreplay/RLS/rollback; Passport tre marknader; public entry/arbetsgivarresa; CV-export/PDF/ATS; CV:s inloggade browserresa. Även de separata workflows som aktiverats av respektive diff redovisas i bilagan. Schema-first och säkerhets-/typgrindar får inte hoppas över.

GitHubs branchmetadata rapporterade main `protected=false`, required status checks `enforcement_level=off` och inga contexts/checks; synliga rulesets var tomma. Det finns alltså **ingen verifierad serverframtvingad GitHub-lista över required checks**. Ordet obligatorisk avser här repositoryts CI och denna releasegrind. Rekommendera separat ägarbeslut om branch protection; ingen inställning har ändrats. Workflowets lintsteg har `continue-on-error: true`, så en grön jobbstatus bevisar inte grön global lint. Aktuell CI uppmätte schema **811 errors/114 warnings** och app **774 errors/114 warnings**; [loggutdrag](p0-review/ci-log-excerpts.json) bevarar tid och jobb-ID.

### Bekräftat guardfel och korrigering

Schema-CI på `3b41ca827407feb2a65d05be5ffc67bc09a95c51` föll i `Interview-method library tenant-read guard`: TS-guarden krävde den äldre anon-listan med sju funktioner, medan SQL-provet och funnelns service-only skrivgräns har exakt sex. Lokalt reproducerades 1 fel av 117 kontroller. `cd_record_funnel_event` togs bort från guardens tillåtna anon-lista, och en ny negativ kontroll återför just den felaktiga sjunde posten och kräver att guarden stoppar den.

Aktuell slutmigration nekar funnel-RPC:n för PUBLIC, anon och authenticated; service_role behåller skrivvägen. Den negativa kontrollens äldre ord om en authenticated participant boundary ska inte tolkas som en authenticated skrivrätt. Detta ändrar inga DB-grants, policies, genererade typer eller runtimebeteenden. [Guarddiffen](https://github.com/cqrityjob/trust-path-recruitment/commit/82564cc3ad390f0a378d8a8ef4376dbbc31fae12) håller listan exakt. Den [oberoende guardgranskningen](p0-review/guard-independent-review.md) bekräftar samma slutsats. På rättningen passerade **117/117** kontroller, **29/29** negativa mutationer i en ren separat klon med återställning byte för byte, scripts-typecheck och ESLint för de två ändrade guardfilerna. Den tidigare skildringen av P0:s 10 nullable-mutationer är ett annat prov och ska inte räknas som dessa 29.

## 3. Vad som fungerar och vad proven begränsar

| Bekräftad P0-funktion                                                              | Utfört bevis och gräns                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kandidatbakgrund, uttryckligt valt underlag och manuella kontrollpunkter med AI av | Klienten skiljer aktuell ansökningsläsning från sparade ärendekällor och planens sammanfattning. Källreferens är inte automatisk kopia av originalet. Kontrollpunkter har neutral fråga, källa, ansvarig, nästa handling och revisionskontroll.                                                       |
| Sparning, paus/återupptagning och samtidighet                                      | 12/12 isolerade användarflöden: båda rollerna, fristående/ansökningskopplat, sv/en, desktop och emulerad mobil. Riktiga RPC/REST mot PostgreSQL/PostgREST prövade nätfel/retry, spar-drain, två flikar och CAS-konflikt. 33 klientprov/197 assertions passerade.                                      |
| Mänsklig evidens/bedömning och låst rapport                                        | Preview/fastställande/readback, främmande ärende och granskarens 403 vid direktfinalisering prövades. Befintliga rapporter ändras inte. Full lokal replay körde 383 migrationer, bland annat 56 P0- och 123 metodbibliotekskontroller samt rollback/reapply. Aktuell CI:s DB-jobb återprövar schemat. |
| AI av                                                                              | Lokal slutkontroll: AI/transkript av, 0 P0 AI-runs och 12 rapporterade ärenden/12 rapporter. Ingen AI-tjänst anropades. Detta är ingen hosted driftmätning.                                                                                                                                           |
| Bevarade kontrakt                                                                  | Åtta kärnfrågor/sex kompetensområden per roll, Sentinel, befintliga ACL, livscykel, rapportregler och RPC-typöverlagring. Genererade `types.ts` är oförändrade.                                                                                                                                       |

Det lokala browserprovet använde syntetisk auth-gateway och Storage-ersättning. Riktig GoTrue/Storage och publicerad runtime är **ej verifierade**. Mobilprov var Chromium-emulering, inte fysisk iOS/Android. Efter refresh visas Q1 igen, men noter/frågestatus finns kvar. Reflektion/protokollavvikelse sparas i sessionen; deras fritext ingår inte i rapportbasis. Detta är tydliga produktgränser, inte borttappade verifierade rapportfält. Sakrättelse registrerad av arbetsgivaren är inte en ny kandidatportal.

Browserbilder och redigerade loggar finns i [tidigare bevismanifestet](2026-10-07-p0-evidence/manifest.json). Inga nya UI-bilder utges för denna dokumentationsrevision. Bild-/logghashar och körnings-SHA ska bedömas tillsammans.

## 4. Skydda pågående intervjuer före kommersiell pilot

Den fullständiga [innehålls- och skyddsgranskningen](2026-10-07-p0-content-protection.md) skiljer prevention, levande läsning, avvikelseupptäckt och fryst rapport. Färska metadata/SQL-resultat finns i dess versionsbundna bilaga.

**Befintligt skydd:** rollredaktörernas editable/RLS-regel blockerar ändringar när `pilot_availability=open`; publicerade rollversioner har innehållstriggers. Ärendet pinnar versions-ID och äldre rollhash; metod-ID kan inte ersättas när det redan finns. Dessa skydd ska bevaras.

**Återstående lucka:** withdrawal till restricted kontrollerar inte pågående användning och gör samma draft redigerbar igen. Barntriggern har ett svagare statusvillkor än RLS och täcker inte samma open/in-use-regel för service-vägen. Metodversioner/barn saknar motsvarande innehållslås. Ärende/session läser frågor och metodtexter från aktuella barn bakom de pinnade ID:na. Någon full innehållssnapshot vid case-skapande, plangodkännande eller samtalsstart sparas inte av P0.

**Manifestets bevisvärde:** P0 observerar aktuellt innehåll och räknar full SHA256 inklusive språkfält. Äldre `pack_hash_matches` jämför versionens lagrade MD5 med dagens omräkning, inte med en fryst samtalsstartsnapshot. Notisen spärrar inte start/fortsättning/fastställande. Ny rapport fryser manifestet när rapporten fastställs; detta kan inte bevisa tidigare samtalstexter eller återskapa äldre rapportproveniens. Ett rent hashresultat är varken innehållsgodkännande eller prevention.

**Föreslaget pilotkrav, ännu ej implementerat:** ett bestående DB-lås från första ärendebindning för roll- och metodinnehåll, oberoende av draft/approval/tillgänglighet, samt en full oföränderlig ärendesnapshot som intervjun faktiskt läser. Skyddet ska gälla INSERT/UPDATE/DELETE, OLD/NEW-parent vid flytt, importer och service-vägar; case-bindning och innehållsedit ska ha samma bevisade serialiseringspunkt. Normativa sv/en-apptexter behöver också versionsbindas. Withdrawal stoppar nya starter utan att låsa upp använda texter. Ändring kräver ny identitet och explicit ny innehålls-/plangranskning; ingen tyst repinning.

För äldre pågående ärenden utan bevisbar snapshot behövs läsande riskinventering och ett dokumenterat mänskligt fortsättningsbeslut. Dagens observation får bara beskrivas som fryst från nu. Återfyll aldrig dagens manifest som historisk starttext. Byte sker genom ett nytt länkat ärende eller uttrycklig ny förberedelse där gamla pin-regler tillåter det, med tidigare sessioner/evidens/rapporter bevarade. Denna granskning läste inga befintliga kandidatärenden och har inte genomfört inventeringen eller nya lås-/raceprov.

## 5. Innehållsgodkännande och språk

Båda installerade rollguiderna är v1, `draft`, `pilot_hypothesis`, open pilot, publiceringstid NULL och **0 review-rader**. Varje roll har 11 provisional kompetensmappningar och 0 confirmed. Sex metodversioner är draft med NULL approvaltid. Tillgänglighet via internal QA/open pilot är inte kommersiellt innehållsgodkännande. Production kräver approved TRUST enligt den befintliga valvägen. PEACE:s 13 och ORBIT:s 4 bibliotekspraxis tillhör egna metod-ID:n och blir inte automatiskt stöd i det exakt TRUST-pinnade ärendet.

| Installerad EN-lucka                  |     Väktare | Säkerhetschef |
| ------------------------------------- | ----------: | ------------: |
| Kompetensnamn respektive definitioner |   6/6 + 6/6 |     6/6 + 6/6 |
| Kärnfrågor / följdfrågor              | 8/8 + 48/48 |   8/8 + 48/48 |
| Dimensionsetiketter                   |        0/40 |         40/40 |
| Ankarlabel respektive ankartext       | 0/40 + 0/40 | 40/40 + 40/40 |
| Förbjudna områdens statement          |        0/14 |         14/14 |

Det finns dessutom svenska verifierings-/rationalefält utan EN-kolumn, och klienten läser kärnfråga/probe på svenska även i EN-gränssnitt. Metodernas befintliga språkparade conduct-/guidancefält har text, men textnärvaro är inte fack- eller språkapproval. Ett EN-browser-PASS gäller navigation/sparning, inte en komplett engelsk intervju.

Väktarens kvarstående lagrade/omräknade MD5 är `6b0ace21db962486d791da79a55be19b` / `2f1e15e0c303da31942a4d2040bc8bc8`; säkerhetschefens är båda `06d58c640dce2ddb4455ac07239d4803`. Befintlig EN-kopiering av väktarens dimensionslabels på samma version förklarar den konstaterade avvikelsen. Äldre hash/rapporter får inte skrivas om för att dölja den.

Mostafa behöver besluta innehåll/version, ansvariga expert/legal/cognitive/product-granskare, full manifestbunden approval, provisoriska kompetensrelationer, svenska pilotens omfattning och eventuell uttrycklig EN-avgränsning. Översättningar/korrektioner får nya versionsidentiteter med diff och nytt godkännande. Säkerhetschefens åtta frågor och sex kompetensområden bevaras. PEACE beskriver intervjuarens arbetssätt; mänsklig rollbedömning förblir separat. Inget PEACE-kandidatmått, automatisk ranking, trovärdighets-/personlighetsomdöme eller anställningsbeslut tillkommer.

## 6. Återstående driftprov och repositoryskuld

[Driftplanen](2026-10-07-p0-operational-test-plan.md) innehåller **22 planerade, ej utförda prov**. Först behövs full isolerad Supabase med riktig GoTrue/Storage, sedan separat godkänd publicerad icke-produktionsruntime. Proven omfattar riktiga JWT/refresh/expiry/logout, aktuell ärende-/medlemsrätt via UI och direkt API, verkliga filbytes/upload/felstädning/signering/withdrawal, varma/kalla CDN-cacher, källåterkallelse, sparningsrace, preview/finalrapport, faktisk build-/publiceringsidentitet, headers/CSP och fysisk mobil.

Planen skiljer refresh-token-revoke från redan giltig access-JWT, samt nya produktåtkomstbeslut från signerade URL:er/CDN/browsercache och redan nedladdade bytes. `expiresIn=300` bevisar ingen generell femminutersgräns för bytesåtkomst. `withdrawEvidence` kontrollerar inte Storage-remove-fel i läst kod; detta är en kodbaserad risk, inte ett utfört hosted raderingsprov. Sidokanaler AI/mail/outbox/workers måste verifieras avstängda före/efter syntetiska prov.

Kvarvarande repositoryskuld: aktuell CI-global lint 774 errors/114 warnings på app20dd och 811/114 på schema825 (äldre lokal schema-bas 812/114); äldre intervjue2e förväntar annan rubrik och har motstridigt ordkontrakt; gemensam `release-sequence.md` har äldre merge-före-schema-beskrivning som strider mot aktuell schema-first-grind; äldre Auth/Storage/runtime-/typdokument blandar historisk konfiguration med aktuell drift. Driftplanens skuldtabell anger källor och separat åtgärd. Historiska produktions-/mail-UAT-dokument återanvänds inte som auktorisation. Branch protection ovan är en ytterligare driftstyrningslucka. Inget av detta rättas genom att försvaga guards eller redigera genererade typer.

## 7. Konkret releaseordning efter ägarens beslut

1. **P0-review och exakt CI.** Granska #447 på 82564cc och #448 på 20dd samt detta underlag. Varje nytt huvud kräver ny CI-kontroll. Appens schema-first-blockering kvarstår tills verkliga applied-bevis finns; app-PR förblir draft. Mostafas klartecken saknas ännu.
2. **Separat godkänd schemarelease.** Merge av #447 kan få installations-/synkeffekter via ordinarie integration. Fastställ det faktiska integrationsbeteendet och mål innan merge; anta inte att merge är en ofarlig dokumentationsåtgärd. Installera i kanonisk stigande ordning, kontrollera ledger före eventuell retry. Ingen installation sker nu.
3. **Läsande installationsbevis.** Verifiera `20270306090000`, de fem RPC-signaturerna, elva finding-kolumnerna, funktioners kroppar/search_path/grants (inga nya anon/PUBLIC-grants), constraints, revisionstrigger, reportbuilder och nullable-kontrakt mot granskad SQL. Frys bevis och uppdatera `supabase/hosted-ledger.json`, release-state/policy enligt faktisk kanonisk/aliasidentitet. Ta bara den verifierade P0-migrationen ur expectedPending; en ledgeretikett utan SQL-ekvivalens är otillräcklig.
4. **App efter schema.** Integrera applied-bevis utan historikomskrivning, läs nytt apphuvud och kör alla obligatoriska checks igen. Schema-first ska nu passera av rätt skäl. Ägaren ger separat klartecken för #448-merge; först då får den lämna draft. Lovable-synk är fortfarande inte publiceringsbevis.
5. **Pilot och publicering separat.** Återstående realtjänstprov, innehållsskydd, approval, språkbeslut och accepterade begränsningar granskas före kommersiell pilot. Publicerad test-/produktionsruntime kräver eget klartecken och identitetsbevis. P1 får börja först efter P0-granskningen enligt användarens senaste instruktion, och är inte implementerad här.

**Återställningsplan:** återställ appen till senast känd fungerande godkänd version först. Det additiva schemat kan normalt behållas med äldre app. En särskilt godkänd schemarollback kräver backup och den [versionsbundna rollbacken](https://github.com/cqrityjob/trust-path-recruitment/blob/82564cc3ad390f0a378d8a8ef4376dbbc31fae12/supabase/rollback/20270306090000_recruiter_intelligence_interview_foundation_rollback.sql): äldre reportbuilder återställs och nya RPC:er tas bort; kontrollpunkter, tillagda kolumner, revisionstrigger, audit, processanteckningar och rapportmanifest bevaras. Ingen användardata eller låst rapport raderas/skrivs om. Återaktivering kräver ny granskad forward-migration och nya schema-/rapportprov. Ingen worker eller AI aktiveras av återställningen.

## 8. P1 förberett — inget produktprov påstås

[Acceptanskriterierna](2026-10-07-p1-acceptance-criteria.md) operationaliserar versionsbunden kravprofil, stabila befintliga krav-ID, accepterat aktuellt underlag, separata krav-/rekryterings-/analys-/granskningsstatusar och globala filter/sort/count före pagination. De föreslår grön endast för alla accepterat uppfyllda skallkrav, gul vid ett aktuellt uttryckligt inte uppfyllt och annars grå vid klarläggandebehov. Tom/ej fastställd profil blir aldrig grön. Meriter kompenserar inte skallkrav.

Det fristående [facitskriptet](p1-acceptance/ri-p1-100-v1.py) kördes med Python utan produktimporter, DB/API/browser, AI eller externa skrivningar. [Full output](p1-acceptance/ri-p1-100-v1-output.json) innehåller 100 UUID/statusrader och exakta sidor/filter: bas **40 grön/25 gul/35 grå**, **27 mänskligt granskade/73 återstår**. Modellprov passerade för V1→V2 (**30/35/35**, granskning 0 tills ny bekräftelse), återkallelse (**35/25/40**, 22 granskade), ersatt original, rättelse, kontrollutgång, CAS-konflikt/dubbelräkning och positiva/negativa AI-utkast utan beslutsgrund. AI-förslag påverkar inte sakstatusen ensamt.

Facit är ett konkret förslag att granska/låsa, inte beslutade kommersiella rollkrav. P1-schema, direkt-API-behörigheter, 100 seedade ansökningar och sv/en dator/mobilprov mot plattformen är **ej utförda** och måste köras efter implementation i godkänd isolerad miljö. Modell-PASS är inte P1-produkt-PASS. Kriterierna inkluderar oföränderliga rapporter, inaktualisering efter relevanta profil-/käll-/åtkomständringar, gamla revisioners nekade överskrivning och uttrycklig mänsklig bekräftelse.
