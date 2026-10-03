# CQrityjob — slutrapport för återstående lanseringsarbete (2026-10-03)

**Startcommit:** `main` `7ff0cbe` (efter #384). Astras granskning gällde `ff2a5b3`; varje fynd är
kontrollerat mot `7ff0cbe` innan det rättades. **Arbetsgren:** `claude/busy-clarke-42da1t`, utkast-PR
[#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387). **Slutcommit:** den som PR:en
visar som huvud när den granskas (rapporten skrevs på `5d396c4`; senare commits rör bara denna rapport).

**Ingen merge, publicering, produktionsskrivning, DNS-ändring eller Auth-konfigurationsändring har
gjorts. Inga mejl har skickats.** Sandboxen når varken `supabase.co` eller `www.cqrityjob.com`
(nätverkspolicy), så allt som kräver produktion är *ej verifierat*, inte *godkänt*.

## 1. Tre olika nivåer (blanda inte ihop dem)

| Nivå | Betyder | Läge |
|---|---|---|
| **Redo för merge** | Koden är granskad, testad lokalt och i CI | Ja för det som rapporteras som Godkänt nedan; PR #387 är utkast tills du säger till |
| **Publicerat** | Mergat och publicerat i Lovable; migrationer applicerade hostat | **Nej.** Inget är publicerat. Tre migrationer är skrivna men oapplicerade (`pending`) |
| **Verifierat i produktion** | Kundresan körd mot www med riktiga mejl | **Nej.** Begäran förberedd i `2026-10-03-production-test-request.md` |

## 2. Slutrapport per flöde

| Flöde | Status | Bevis | Kvarstående fel |
|---|---|---|---|
| **1. Landning och navigation** | **Godkänt** (redo för merge) · produktion ej verifierat | Granskning av alla länkar (396 filer, inga döda); företagsregistrering tillagd i header, mobilmeny och sidfot via en delad nav-definition; `/employer/register` behåller företagsintentionen; översatta 404/felsidor; skärpt `safeReturnPath`; sitemap utan noindex/omdirigeringar; 111 + 40 webbläsartester (dator, 375 px, sv/en) gröna (se avsnitt 5) | Mobilmenyn staplar nu tre knappar (granska skärmbild i produktion); hero-korten är bara ankare; Passports nivå "Källbekräftad" (Claude) |
| **2. Kontaktflöde** | **Underkänt i produktion** · koden **Godkänd** (redo för merge) | Rotorsak med bevis i avsnitt 3: edge-funktionens egen kod avvisar appens readiness-anrop med 401 (nyckeln matchar inte); aldrig ett POST-anrop; servicenyckeln fungerar mot databasen. Koden skiljer nu orsakerna, loggar dem, adminsidan pekar inte längre på fel orsak, `info@cqrityjob.com` syns alltid (även i stängt läge och vid fel); ingen falsk bekräftelse (bekräftelse bara när leverantören accepterat) | **Produktionsåtgärd krävs (S8 i `www-domain-cutover.md`)**: diagnostiskt anrop med servicenyckeln, därefter omdeploy/omkonfiguration. Exakt varför nyckeln inte matchar är ej verifierat |
| **3. Domän och metadata** | **Godkänt** (redo för merge) · produktion ej verifierat | 33 hårdkodade Lovable-adresser ersatta via `src/lib/site-origin.ts`; byggd SSR-HTML visar `https://www.cqrityjob.com` i canonical, `og:url`, `sitemap.xml`, `robots.txt`; mejllänkar ignorerar en `PUBLIC_SITE_URL` på Lovable-värd; delningslänkar via `shareableUrl()`; `site-origin:check` + 10 planterade fel | Auth-returer och mejllänkar från www ej verifierade (ingen Auth-trafik från www under senaste dygnet); inställningar i `www-domain-cutover.md` (Lovable, Supabase, Resend, DNS, GitHub) kräver godkännande |
| **4. Jobbboard — hela flödet** | **Godkänt lokalt** (kod + SQL) · migrationer **pending** · produktion ej verifierat | Tre migrationer med rollback, SQL-sviter (42 + 40 + 22 påståenden) som reproducerar felet före rättning; stängd annons ger nu 404 (var 200); dubbla utkast vid retry, inaktuell lista, CV-chip, tvetydigt RPC-fel, `application_url`-schema rättade; lagrat XSS i annonssidans JSON-LD rättat (`job-jsonld-escaping:check`); jobb-specar gröna | Migrationerna är inte applicerade; arbetsgivaren får **inget mejl** vid ny ansökan (beslutsmemo i avsnitt 7); `sweep_expired_jobs` kan aldrig lyckas (observerat); drafts saknar optimistisk låsning; rolltyrning är bara UI |
| **5. Företagskonto** | **Godkänt** för det som ändrats · **Underkänt mot kravet** på rapportbehörighet (beslut) | Admin kan stänga av/ta bort/återaktivera/byta roll på medlem; ärliga sidor för pending/avvisad/borttagen; bekräftelse före identitetsändring som ger ny granskning; testutskick förklarar sitt skäl; **åtkomstmatris i SQL (45 påståenden, 11 aktörer) som låser nuvarande beteende** | **Alla aktiva medlemmar läser rapporter och intervjufynd; det finns ingen bedömarroll** (säkerhetsmemo, beslut krävs). Återaktivering via åtkomstförfrågan kringgår plattformsadminens beslut (F1). Ingen self-service för ägarens borttagning av medlem. Testutskick når bara sökande, inte godtyckliga mottagare |
| **6. Registrering och e-post** | **Ej verifierat** | Kodgranskning av alla resor (receptmottagare, länkar, idempotens, felhantering); Auth-returer härleds från besökarens origin; Supabase-loggar visar att Google-inloggning fungerade från den gamla värden 2026-10-02 | Inget bekräftelsemejl, ingen återställning, inget kvitto och ingen inbjudan har provats mot www. F4 (dubbel provisionering vid "fortsätt" på annan enhet) och F7 (Google-registrering tappar företagsnamn) rapporterade till Claude-sessionen |
| **7. Resten** (Career Center, yrkeskatalog, karriärtest, sparad rapport, profil, CV-export, Säkerhetsarbete, inställningar, feedback, support) | **Godkänt** i kod/guards · live **ej verifierat** | Granskning; evig spinner i karriäranalysens ingång, CV-utskrift som blev tom under redigering, förlorade CV-ändringar vid navigering, läsfel som visades som "inga rapporter", feedbackens felaktiga sida, "Fråga Security AI" utan AI, orphan-sidan `/journey` — alla rättade | **Inget kandidatflöde för kontoinställningar, dataexport eller radering**; ingen support-ingång utanför `/contact` (Claude, tillsammans med juridiska sidor); ingen utskrift på sparad rapport |
| **"Intern testversion"** | **Utrett och korrigerat** | Faktisk status: Career Discovery v3.1 är öppen för anonyma besökare; inloggade starter är begränsade till testare/admin tills `cd_access_policy = public` (idag `internal_test`, 0 testare); alla sju granskningsflaggor är falska; innehåll "draft". Alltså inte "intern", men **ogranskad**. Ny text: "under utveckling … ännu inte granskat av sakkunniga"; taggen i historiken är nu datadriven; Academy-sidor har inte längre karriärtextens sidfot. BESKT-etiketterna är korrekta och orörda | Döda v3.0-komponenter ligger kvar (listade); analys-CTA på yrkesguider dras inte tillbaka när analysen är stängd |
| **8. Testmiljö** | **Godkänt** (databas) · app-nivå **ej möjlig** | Lokal PostgreSQL 16.14; hela migrationskedjan (362 migrationer) återspelad i färsk databas och alla SQL-sviter grönt ("DB suite OK") på merge-trädet; testad commit angiven ovan | **Docker finns inte** i sandboxen → ingen lokal GoTrue/PostgREST-kedja; registrering→ansökan→kommunikation→test→rapport är därför inte körd som en sammanhängande webbläsarresa lokalt. Täcks av SQL-sviter per länk, åtkomstmatrisen och stubbade browserspecar |
| **9. Dependencies** | **Godkänt** (ej tillämpligt, med bevis) | 13 flaggade paket i `bun.lock`; endast `fast-uri` finns i produktionsbundeln, bakom den stängda `/mcp`-routen och används på schema-URI:er, aldrig på indata; resten är byggverktyg eller ingår inte i bundeln. Se `2026-10-03-dependency-audit.md` | Lockfile-uppdatering kräver Lovables paketcache och ditt godkännande; `package-lock.json` är föråldrad |
| **10. Leverans** | **Delvis** | En samlad PR (utkast) med logiska commits; kan delas i flera efter tillstånd (min tilldelade gren är en) | Ingen merge/publicering gjord |

## 3. Kontaktflödet — rotorsak (för Astra att upprepa)

1. `/contact` frågar servern om formuläret är öppet; servern gör ett `GET` mot Supabase Edge
   Function `transactional-email` med servicenyckeln och räknar allt utom 200 som stängt.
2. Supabase-loggarna (skrivskyddat) visar att funktionen **bara någonsin fått tre GET-anrop**
   (2026-10-02 05:30, 2026-10-03 06:27 och 06:33), **alla 401**, aldrig ett POST.
3. Anropen bär en `service_role`-JWT med samma utfärdandetid som projektets anon-nyckel. Samma
   nyckel får 200 mot PostgREST (`/rest/v1/assessment_assignments`, Cloudflare-källa, 2026-10-02).
4. Funktionens egna loggar visar `booted` 13 ms **före** varje 401-anrop (06:27:47.567 start, .580 anrop;
   06:33:49.390 / .405): funktionens egen kod körde och avvisade anroparen i `callerIsServer()`. (Svaret är
   46 byte medan funktionens 401-text är 26 byte; skillnaden är oförklarad och bevisar inget.) Den
   driftsatta koden är identisk med repot. En saknad `RESEND_API_KEY` ger 503 först *efter* att anroparen
   godkänts och är alltså inte orsaken. Mest sannolikt: nyckeln i funktionens miljö
   (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`) skiljer sig från den äldre `service_role`-JWT som
   appen håller (och som PostgREST accepterar); detta är en hypotes, inte verifierat.
5. Ej avgjort härifrån: varför. Diagnos som behöver servicenyckeln:
   `curl -i -H "apikey: $SVC" -H "Authorization: Bearer $SVC" https://wrygicdfxwjnrugduxnt.supabase.co/functions/v1/transactional-email`.
   Svar `{"outcome":"unauthorized"}` = nyckeln skiljer sig i funktionen (förväntat); annan JSON =
   plattformens grind (kontrollera `verify_jwt` och status för äldre API-nycklar). Robust kodrättning:
   `callerIsServer()` verifierar den presenterade nyckeln mot projektets Auth-adminändpunkt i stället för
   att jämföra miljövärden (ligger hos Claude-sessionen som äger mejlkonfigurationen; kräver omdeploy).
6. Kodändringen gör att nästa gång någon tittar står orsaken i serverloggen
   (`[email-transport] not ready: key_rejected (HTTP 401)`) och på adminsidan.

## 4. Gemensam fellista (Astras rapport + nya fynd)

Förklaring: **R** rättad i kod (redo för merge) · **P** kräver produktionsåtgärd · **B** kräver beslut ·
**C** hanteras av Claude-sessionen (#384/#386) · **O** observerad, ej åtgärdad · **E** ej tillämplig (bevis)

### Från Astras rapport

| ID | Fynd | Läge |
|---|---|---|
| A1 | `/jobs` har Lovable-domänen som canonical och `og:url` | **R** (+ publicering krävs) |
| A2 | Registrering hänvisar till integritetspolicy som inte publicerats | **C** (#386) |
| A3 | `/contact` visar "Formuläret är inte öppet ännu" (sv och en) | Orsak funnen, **R** (kod) + **P** (S8) |
| A4 | Rapportbehörighet bredare än ärendevillkoret (alla medlemmar) | **B** — memo + 45 testpåståenden; ingen ändring |
| A5 | Exakt publicerad commit ej verifierad | **O** — ej möjlig härifrån |
| A6 | BESKT-exponering och Passport-beslutsbindning (PR #384) | **C** — migrationerna 20270124/25 är `pending` |
| A7 | Testmiljö på fel version | **R** — lokal PG16, full kedja, grön |
| A8 | Centrala resor ej verifierade (registrering, mejl, företagsregistrering, ansökan, test, rapport) | **P** — begäran förberedd |
| A9 | Märkningen "intern testversion" | **R** |

### Nya fynd (inventering och granskning)

| ID | Fynd | Allvar | Läge |
|---|---|---|---|
| N1 | Lagrat XSS på varje publik annons-URL (JSON-LD ej escapad) | P1 | **R** |
| N2 | Mejllänkbas kunde peka på Lovable via `PUBLIC_SITE_URL` | P1 | **R** (+ **P** L2) |
| N3 | Adminsidan skyllde alltid på `RESEND_API_KEY` | P3 | **R** |
| N4 | Publicerad/stängd annons kunde redigeras på plats via API av vilken medlem som helst | P2 | **R** (migration pending) |
| N5 | Återställ→publicera gav osynlig annons eller vilseledande fel | P2 | **R** (app + migration pending) |
| N6 | Kandidat kunde skriva/radera sin CV-fil direkt i bucketen | P2 | **R** (migration pending) |
| N7 | `/jobs/new` skapade dubblettutkast vid retry | P2 | **R** (rest: förlorat svar på allra första insättning) |
| N8 | Stängd annons: HTTP 200 med tomt skal (soft-404) | P2 | **R** |
| N9 | Lista inaktuell efter egna åtgärder; utkast dolda | P3 | **R** |
| N10 | CV-chip saknades för CQrityjob-CV; tvetydigt RPC-fel raderade CV | P3 | **R** |
| N11 | `application_url` tog valfritt schema (`javascript:`) | P3 | **R** (app + migration pending) |
| N12 | Ingen UI för att stänga av/ta bort/återaktivera medlem | P2 | **R** |
| N13 | Pending/avvisad/borttagen: sackgator utan nästa steg | P2 | **R** |
| N14 | Identitetsändring gav tyst ny granskning och offline-annonser | P2 | **R** |
| N15 | Testutskick sade "du måste vara ägare" till ägare av granskad organisation | P3 | **R** |
| N16 | Ingen företagsregistrering i header/mobil/sidfot | P2 | **R** |
| N17 | Sidfotens Betafeedback ledde till inloggningsvägg | P3 | **R** |
| N18 | 404/felsida enbart engelska | P3 | **R** |
| N19 | `/employer/register` tappade företagsintentionen | P2 | **R** |
| N20 | `safeReturnPath` släppte igenom TAB/NUL (`/\t/evil.com`) | P3 | **R** |
| N21 | Sitemap listade noindex-, omdirigerings- och opublicerade sidor | P3 | **R** |
| N22 | Sidtitlar/beskrivningar enbart ett språk | P3 | **R** |
| N23 | Karriäranalysens ingång kunde hänga för evigt | P2 | **R** |
| N24 | CV-utskrift blev tom under redigering; ändringar förlorades vid navigering; tysta fel | P2 | **R** |
| N25 | Läsfel i historik/profil visades som "inga rapporter"/"ej ifyllt" | P3 | **R** |
| N26 | Feedback skickade fel sida och kunde avvisas | P3 | **R** |
| N27 | "Fråga Security AI" visades fast AI är stängt | P3 | **R** |
| N28 | Karriärtextens sidfot låg på Academy-sidor | P2 | **R** |
| N29 | `/journey` föräldralös engelsk sida | P3 | **R** |
| S1 | Rapportbehörighet: alla medlemmar läser (ingen bedömarroll) | P1 | **B** (se `report-access-security-finding.md`) |
| S2 | Vetting-begränsat ärende: kandidatens rättelser läses av alla medlemmar | P2 | **B/C** |
| S3 | Subjekt som själv är medlem läser sin egen arbetsgivarrapport | P2 | **B/C** |
| S4 | Globala innehållsroller läser alla klienters kandidatsvar | P2 | **B/C** |
| S5 | `approve_access_request` återaktiverar borttagen/avstängd medlem | P2 | **B/C** |
| S6 | Bedömarbehörigheter återkommer tyst vid återaktivering | P3 | **O** |
| D1 | Arbetsgivaren mejlas inte om ny ansökan | P2 | **B** (memo) |
| D2 | Testliknande publika annonser (3 synliga: "Säkerhet AB (h31-test-co)", "Buller o bång", "cqrityjob") | P2 | **B** (ägare) |
| D3 | `sweep_expired_jobs()` kan aldrig lyckas | P3 | **O** |
| D4 | Reply-To `job@` på arbetsgivarmeddelanden: kandidatsvar når CQrityjob, inte arbetsgivaren | P3 | **C** |
| D5 | Ingen kandidatväg för kontoinställningar, export, radering, support | P1 | **C** |
| D6 | ~20 `:check`-skript ligger utanför CI, två misslyckas redan på main (`employer-journey`, `employer-library-purpose`) | P3 | **O** |
| D7 | Produktionens säkerhetsrådgivare: 1 ERROR (`scp_scoring_version_lineage` är SECURITY DEFINER) | — | **E** — medveten, dokumenterad design (`20260801100000`) |
| D8 | Dependencies (13 paket) | — | **E** med bevis; uppdatering vid nästa refresh |
| D9 | Edge-funktionens 401, Auth Site URL/Redirect URLs, `PUBLIC_SITE_URL` | P1 | **P** |

## 5. Tester och obligatorisk CI

| Kontroll | Resultat |
|---|---|
| `bunx tsc --noEmit` | rent |
| CI:s verify-jobb (175 steg inklusive `bun run build` och `scripts:typecheck`) lokalt | 174 gröna vid körning; det enda röda (`release-frontier:check`) krävde att de tre nya pending-migrationerna lades i dess förväntade lista och är grönt därefter |
| Hela migrationskedjan + alla SQL-sviter (`scripts/db-test.sh`, PG16) på merge-trädet | **"DB suite OK"**, 362 migrationer, inkl. åtkomstmatris (45) och jobbsviter (42 + 40 + 22) |
| Alla 60 negativa kontrollsviter (`negative-controls:all`) | alla **1 658** planterade fel upptäckta; filer återställda byte för byte |
| Playwright (systemets Chromium, stubbad backend), efter merge | se avsnitt 5a |
| GitHub Actions på PR-toppen `5d396c4` | 12 av 13 jobb gröna när rapporten skrevs (lint/typecheck/guards, migrationsreplay/RLS/rollback, CV, Passport, E4, recruitment workspace, Career Center, bakåtnavigering, browser); "Public entry browser" pågick |

### 5a. Webbläsartester lokalt (systemets Chromium, stubbad backend, merge-trädet `5d396c4`)

| Svit | Projekt | Resultat |
|---|---|---|
| Hemsida, arbetsgivarlandning, ingång, hydrering, India-landning | dator | **111 godkända** |
| Åtkomstlivscykel för företag (medlemskontroller, väntesida, borttagen medlem, omgranskning) | dator | **8 godkända** |
| Inloggad header på dator (alla bredder) | dator | **27 godkända** |
| Jobbupplevelse + bakåtnavigation | dator + 375 px | **40 godkända**, 10 hoppas över med flit |
| Career Center-resa + utforska-länk i karriäranalysen | dator + 375 px | **38 godkända** |
| Säkerhetsarbete (programmet) | dator + 375 px | **2 godkända** |

Allt körs mot en stubbad backend; ingen skrivning nådde något riktigt system. Efter integrationen med
Claude-sessionens #385 (main `f5eb230`) kördes de statiska kontrollerna om (typecheck, frontier,
parity, migrations, jobbguards, Passport-guards); webbläsarsviterna körs om i sista omgången.

## 6. Leverans — vad som ändrats och varför

| Del | Innehåll | Återställning |
|---|---|---|
| Adresser och kontakt | `site-origin.ts`, `serverSiteOrigin`, `shareableUrl`, transportdiagnos, kontaktväg | Revertera PR; additivt |
| Säkerhet | XSS-åtgärd (`jsonLdScript`) | Revertera commit `c88856c` |
| Landning/navigation | delad nav, registreringsingång, `employerRegisterHref`, rotsidor, `safeReturnPath`, sitemap, språkhuvuden | Revertera mergecommit `db9cb93` |
| Kandidatresa | sanningsenliga etiketter, retry-tillstånd, CV, feedback, `/journey` | Revertera `a250a5b` |
| Företagskonto | medlemskontroller, ärliga sidor, bekräftelse, testrefusal, åtkomstmatris (test) | Revertera `1a9d7ed` |
| Jobbboard | tre migrationer (**pending**, schema först), appändringar, 404 på stängd annons | Rollback-skript för varje migration (`supabase/rollback/20270130090000…`, `20270131090000…`, `20270201090000…`); appen fungerar före migration |
| Dokument | dependency-audit, domän/inställningar, säkerhetsmemo, produktionstestbegäran, denna rapport | — |

**Migrationsordning — PROVISORISK.** Får inte användas som slutlig releaseordning förrän Claude-sessionen
(som äger Passport-/evidensarbetet) har bekräftat sina planerade migrationer. Beroenden jag känner till:
`20270124`/`20270125` är **applicerade** (rekordförda i main, #385) → `20270126090000` (#388, Claude, öppen)
→ `20270130090000` → `20270131090000` (kräver `20270130090000`) → `20270201090000`. Varje migration är
skriven för att kunna appliceras före appändringen. Schema först, hostat md5 kontrolleras före, därefter
publicering.

## 7. Beslut och hinder (det som inte är mitt att avgöra)

1. **Rapportbehörighet** (S1–S5): får en vanlig medlem läsa kandidaters resultat och intervjufynd?
   Förslag och påverkan i `2026-10-03-report-access-security-finding.md`. Rapporterat till
   Claude-sessionen; ingen ändring gjord.
2. **Arbetsgivarmejl vid ny ansökan** (D1): saknas helt. Alternativ A: ny transaktionell typ
   `employer_new_application` + ändring och omdeploy av edge-funktionen, ej väntad i ansökningsanropet,
   endast jobbtitel, antal och länk (ingen persondata), mottagare = ansvarig, annars ägare/admin.
   Alternativ B: sammanfattning via befintligt sweep-flöde (senare, tyst). Rekommendation: A nu med
   avstängning, B senare.
3. **Ägarens egen borttagning av medlem**: kräver en ny funktion (nuvarande är endast plattformsadmin).
4. **Testliknande publika annonser** (D2) och data som hygienunderlaget märkt "REMOVE BEFORE LAUNCH".
5. **Dependencies**: godkänn en lockfile-uppdatering i miljö som når Lovables cache.
6. **Delning i flera PR:er**: kräver tillstånd att skapa fler grenar.
7. **Produktion**: inställningarna i `2026-10-03-www-domain-cutover.md` (L1–L5, S1–S8, R1–R3, D1–D3, G1–G2)
   och själva testet i `2026-10-03-production-test-request.md`.
8. **Claude-sessionens PR #386** (juridik, kontaktadresser, avsändarnamn) rör samma filer. Provmerge mot
   min gren: allt går ihop automatiskt utom en `package.json`-rad. Jag mergar `main` in i min gren
   (ingen rebase, eftersom grenen är pushad) när #386 ligger där, byter min kontaktkonstant mot
   `src/lib/site-contact.ts` och kör om kontrollen. **Sluttesterna ska köras efter den mergen.**

## 8. Kvarstående hinder för lansering

1. Kontaktformuläret är stängt i produktion tills S8 är gjort.
2. Auth från www är ej verifierat (S1/S2 + test).
3. Rapportbehörigheten matchar inte kravet förrän beslut tagits.
4. Juridiska sidor och kandidatens rättigheter (Claude, #386).
5. De tre job-migrationerna är inte applicerade.
6. Mejl, registrering, bekräftelse, ansökan, test och rapport saknar produktionsbevis.
7. Publicerad commit är okänd.
