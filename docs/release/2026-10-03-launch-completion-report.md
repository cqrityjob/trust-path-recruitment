# CQrityjob — slutrapport för återstående lanseringsarbete (2026-10-03)

**Startcommit:** `main` `7ff0cbe` (efter #384). Astras granskning gällde `ff2a5b3`; varje fynd är
kontrollerat mot `7ff0cbe` innan det rättades. **Arbetsgren:** `claude/busy-clarke-42da1t`, utkast-PR
[#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387), som nu har main (#386, #388, #389)
inmergad; #386 (med den av Astra godkända autentiseringen `43180b8`) är mergad som `071f69e`. Resten av arbetet ligger i
staplade utkast-PR:er mot #387: [#390](https://github.com/cqrityjob/trust-path-recruitment/pull/390)
(testskriptets flake, mot main), [#391](https://github.com/cqrityjob/trust-path-recruitment/pull/391)
(karriäranalys), [#392](https://github.com/cqrityjob/trust-path-recruitment/pull/392) och
[#393](https://github.com/cqrityjob/trust-path-recruitment/pull/393) (mejl till arbetsgivaren, schema
och app) samt PR_ACCESS_SCHEMA_REF och PR_ACCESS_APP_REF (rapportbehörighet, schema och app).
**Slutcommit** per PR är den som PR:en visar som huvud; CI-resultat per slutcommit står i avsnitt 5.
**Releaseordning för alla:** `2026-10-03-release-order.md` (ersätter den tidigare provisoriska listan).

**Ingen merge, publicering, produktionsskrivning, DNS-ändring eller Auth-konfigurationsändring har
gjorts. Inga mejl har skickats.** Sandboxen når varken `supabase.co` eller `www.cqrityjob.com`
(nätverkspolicy), så allt som kräver produktion är *ej verifierat*, inte *godkänt*.

## 1. Tre olika nivåer (blanda inte ihop dem)

| Nivå | Betyder | Läge |
|---|---|---|
| **Redo för merge** | Koden är granskad, testad lokalt och i CI | Ja för det som rapporteras som Godkänt nedan; PR #387 är utkast tills du säger till |
| **Publicerat** | Mergat och publicerat i Lovable; migrationer applicerade hostat | **Nej.** Inget är publicerat. Sju migrationer är skrivna men oapplicerade (`pending`): jobbtavlan `20270130`, `20270131`, `20270201`; behörighet `20270202`, `20270203`, `20270204`; mejl till arbetsgivaren `20270205` |
| **Verifierat i produktion** | Kundresan körd mot www med riktiga mejl | **Nej.** Begäran förberedd i `2026-10-03-production-test-request.md` |

## 2. Slutrapport per flöde

| Flöde | Status | Bevis | Kvarstående fel |
|---|---|---|---|
| **1. Landning och navigation** | **Godkänt** (redo för merge) · produktion ej verifierat | Granskning av alla länkar (396 filer, inga döda); företagsregistrering tillagd i header, mobilmeny och sidfot via en delad nav-definition; `/employer/register` behåller företagsintentionen; översatta 404/felsidor; skärpt `safeReturnPath`; sitemap utan noindex/omdirigeringar; 111 + 40 webbläsartester (dator, 375 px, sv/en) gröna (se avsnitt 5) | Mobilmenyn staplar nu tre knappar (granska skärmbild i produktion); hero-korten är bara ankare; Passports nivå "Källbekräftad" (Claude) |
| **2. Kontaktflöde** | **Underkänt i produktion** · koden **Godkänd** (redo för merge) | Rotorsak med bevis i avsnitt 3: edge-funktionens egen kod avvisar appens readiness-anrop med 401 (nyckeln matchar inte); aldrig ett POST-anrop; servicenyckeln fungerar mot databasen. Koden skiljer nu orsakerna, loggar dem, adminsidan pekar inte längre på fel orsak, `info@cqrityjob.com` syns alltid (även i stängt läge och vid fel); ingen falsk bekräftelse (bekräftelse bara när leverantören accepterat) | **Produktionsåtgärd krävs (S8 i `www-domain-cutover.md`)**: diagnostiskt anrop med servicenyckeln, därefter omdeploy/omkonfiguration. Exakt varför nyckeln inte matchar är ej verifierat |
| **3. Domän och metadata** | **Godkänt** (redo för merge) · produktion ej verifierat | 33 hårdkodade Lovable-adresser ersatta via `src/lib/site-origin.ts`; byggd SSR-HTML visar `https://www.cqrityjob.com` i canonical, `og:url`, `sitemap.xml`, `robots.txt`; mejllänkar ignorerar en `PUBLIC_SITE_URL` på Lovable-värd; delningslänkar via `shareableUrl()`; `site-origin:check` + 10 planterade fel | Auth-returer och mejllänkar från www ej verifierade (ingen Auth-trafik från www under senaste dygnet); inställningar i `www-domain-cutover.md` (Lovable, Supabase, Resend, DNS, GitHub) kräver godkännande |
| **4. Jobbboard — hela flödet** | **Godkänt lokalt** (kod + SQL) · migrationer **pending** · produktion ej verifierat | Tre migrationer med rollback, SQL-sviter (42 + 40 + 22 påståenden) som reproducerar felet före rättning; stängd annons ger nu 404 (var 200); dubbla utkast vid retry, inaktuell lista, CV-chip, tvetydigt RPC-fel, `application_url`-schema rättade; lagrat XSS i annonssidans JSON-LD rättat (`job-jsonld-escaping:check`); jobb-specar gröna | Migrationerna är inte applicerade; **mejl till arbetsgivaren vid ny ansökan är byggt** (#392 schema, #393 app) men varken mergat eller applicerat; `sweep_expired_jobs` kan aldrig lyckas (observerat); drafts saknar optimistisk låsning; rolltyrning är bara UI |
| **5. Företagskonto** | **Godkänt** för det som ändrats · behörighetsrättningen är **byggd och lokalt verifierad** (schema- och app-PR) men inte mergad eller applicerad; **underkänt mot kravet tills den är det** | Admin kan stänga av/ta bort/återaktivera/byta roll på medlem; ärliga sidor för pending/avvisad/borttagen; bekräftelse före identitetsändring som ger ny granskning; testutskick förklarar sitt skäl; **åtkomstmatris i SQL (45 påståenden, 11 aktörer) som låser nuvarande beteende** | **I produktion läser fortfarande alla aktiva medlemmar rapporter och intervjufynd** tills `20270203`/`20270204` är applicerade (då: ägare/administratör, granskare per användningsfall, ansvarig rekryterare, ärendets skapare/panel; vanlig medlem läser ingenting). Avstängningskringgåendet (F1) är rättat i `20270202`, ej applicerat. Ingen self-service för ägarens borttagning av medlem. Testutskick når bara sökande, inte godtyckliga mottagare |
| **6. Registrering och e-post** | **Ej verifierat** | Kodgranskning av alla resor (receptmottagare, länkar, idempotens, felhantering); Auth-returer härleds från besökarens origin; Supabase-loggar visar att Google-inloggning fungerade från den gamla värden 2026-10-02 | Inget bekräftelsemejl, ingen återställning, inget kvitto och ingen inbjudan har provats mot www. F4 (dubbel provisionering vid "fortsätt" på annan enhet) och F7 (Google-registrering tappar företagsnamn) rapporterade till Claude-sessionen |
| **7. Resten** (Career Center, yrkeskatalog, karriärtest, sparad rapport, profil, CV-export, Säkerhetsarbete, inställningar, feedback, support) | **Godkänt** i kod/guards · live **ej verifierat** | Granskning; evig spinner i karriäranalysens ingång, CV-utskrift som blev tom under redigering, förlorade CV-ändringar vid navigering, läsfel som visades som "inga rapporter", feedbackens felaktiga sida, "Fråga Security AI" utan AI, orphan-sidan `/journey` — alla rättade | **Inget kandidatflöde för kontoinställningar, dataexport eller radering**; ingen support-ingång utanför `/contact` (Claude, tillsammans med juridiska sidor). Utskrift på sparad rapport är åtgärdad i #391 |
| **"Intern testversion"** | **Utrett och korrigerat** | Faktisk status: Career Discovery v3.1 är öppen för anonyma besökare; inloggade starter är begränsade till testare/admin tills `cd_access_policy = public` (idag `internal_test`, 0 testare); alla sju granskningsflaggor är falska; innehåll "draft". Alltså inte "intern", men **ogranskad**. Ny text: "under utveckling … ännu inte granskat av sakkunniga"; taggen i historiken är nu datadriven; Academy-sidor har inte längre karriärtextens sidfot. BESKT-etiketterna är korrekta och orörda | **Tillgängligheten är nu rättad i kod (#391), inte bara i etiketten**: en källa för alla ytor, sann stängd panel, indexering följer läget, analys-CTA:erna dras tillbaka där dörren är stängd; sanningstabell per läge × aktör i `2026-10-03-career-analysis-availability.md`. **Att öppna analysen är ägarens beslut** (alla sju granskningsflaggor är `false`). Döda v3.0-komponenter ligger kvar (listade) |
| **8. Testmiljö** | **Godkänt** (databas, med en rättad flake i testskriptet, #390) · app-nivå **ej möjlig** | Lokal PostgreSQL 16.14; hela migrationskedjan återspelad i färsk databas och alla SQL-sviter grönt ("DB suite OK") per gren; `scripts/db-test.sh` hade en latent flake (`grep -q` under `pipefail` rapporterade funna rader som saknade, 20/20 på stor utdata; observerat två gånger) som är rättad och bevisad i #390 | **Docker finns inte** i sandboxen → ingen lokal GoTrue/PostgREST-kedja; registrering→ansökan→kommunikation→test→rapport är därför inte körd som en sammanhängande webbläsarresa lokalt. Täcks av SQL-sviter per länk, åtkomstmatrisen och stubbade browserspecar |
| **9. Dependencies** | **Godkänt** (ej tillämpligt, med bevis) | 13 flaggade paket i `bun.lock`; endast `fast-uri` finns i produktionsbundeln, bakom den stängda `/mcp`-routen och används på schema-URI:er, aldrig på indata; resten är byggverktyg eller ingår inte i bundeln. Se `2026-10-03-dependency-audit.md` | Lockfile-uppdatering kräver Lovables paketcache och ditt godkännande; `package-lock.json` är föråldrad |
| **10. Leverans** | **Klar för granskning** · ingen merge, ingen publicering | Åtta utkast-PR:er i beroendeordning (avsnitt 6) med en gemensam releaseordning (`2026-10-03-release-order.md`); schema och app är åtskilda där releaseprocessen kräver det (notis, behörighet) | Inget är mergat eller publicerat; ordningen och varje steg kräver ditt godkännande |

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

Lokalt, per gren (PostgreSQL 16, systemets Chromium, stubbad backend; ingen skrivning nådde något riktigt system):

| Kontroll | Resultat |
|---|---|
| `tsc --noEmit`, `bun run build` | rent / grönt på #387, #391, #393 och behörighetsappen |
| CI:s verify-jobb (181 kommandon inklusive `build`) lokalt på #387 efter integrationen med #386 | 181 av 181 gröna (ett rött, `site-origin:check`, rättades och fick en planterad kontroll) |
| Hela migrationskedjan + alla SQL-sviter (`scripts/db-test.sh`) | "DB suite OK" på #387, #390, #391 och notis- och behörighetsschemat |
| Planterade fel | #387: 60 sviter, 1 658 fel upptäckta (före integrationen) + ny kontroll; #391: 14 + 24; #393: 34 (notis) och 22 (transactional-email) och 63 (recruitment-workspace); behörighetsappen: 26. Alla upptäckta, filer återställda byte för byte |
| Playwright public-entry (dator) på integrerade trädet | 166 gröna, 2 föll på en lastrelaterad timeout och är gröna när de körs ensamma; behörighetsagenten och karriäragenten körde sina egna specar (se respektive PR) |
| `schema-first-release:check` | grön på #387, #391, #392 och behörighetsschemat; **röd med flit** på #393 och behörighetsappen tills deras migrationer är applicerade och registrerade |
| GitHub Actions | körs på varje PR:s slutcommit (staplade PR:er fick CI genom #395); resultatet står på respektive PR:s checkflik när detta läses |

### 5a. Webbläsartester lokalt

| Svit | Projekt | Resultat |
|---|---|---|
| Hemsida, arbetsgivarlandning, åtkomstlivscykel, ingång, hydrering, India-landning, Passport-nätverk | dator | **166 godkända** + 2 som godkänns i isolering |
| Jobbupplevelse + bakåtnavigation, Career Center-resa, utforska-länk | dator + 375 px | gröna före integrationen (40 + 38) |
| Karriäranalysens tillgänglighet (ny) | dator + 375 px | 29 × 2 godkända (karriäragentens körning) |
| Rapportåtkomst (ny: ordinär medlem nekas, granskare läser) | — | **uppdaterad men inte körd**: kräver den lokala Supabase-stacken som sandlådan saknar |

**Ej körbart lokalt:** allt som kräver GoTrue, Resend, Lovables värd eller DNS, och e2e-specar som kräver
den lokala Supabase-stacken. De täcks av CI:s isolerade stackar och av produktionstestet.

## 6. Leverans — vad som ändrats och varför

| PR | Del | Innehåll | Återställning |
|---|---|---|---|
| [#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387) | Adresser och kontakt | `site-origin.ts`, `serverSiteOrigin`, `shareableUrl`, transportdiagnos, kontaktväg | Revertera PR; additivt |
| #387 | Säkerhet | XSS-åtgärd (`jsonLdScript`) | Revertera commit `c88856c` |
| #387 | Landning/navigation, kandidatresa, företagskonto | delad nav, registreringsingång, sanningsenliga etiketter, retry-tillstånd, CV, feedback, medlemskontroller, ärliga sidor | Revertera respektive mergecommit |
| #387 | Jobbtavla | tre migrationer (**pending**, schema först), appändringar, 404 på stängd annons | Rollback-skript för varje migration (`supabase/rollback/20270130090000…`, `…31…`, `20270201090000…`); appen fungerar före migration |
| #387 | Integration | main (#386, #388, #389) inmergad; #386:s juridiska rutter tar sin canonical från `siteUrl()`; kontaktadressen kommer från #386:s `src/lib/site-contact.ts`; edge-funktionen är #386:s egen, oförändrad (frågar projektets Auth vid varje anrop, ingen cache, ingen nyckelgenväg från miljön); sitemap-guarden godtar en utkast-noindex bara när sitemap listar sidan under samma `*_FINAL`-flagga | Revertera mergecommit `472bc55` |
| [#390](https://github.com/cqrityjob/trust-path-recruitment/pull/390) | Testmiljö | `db-test.sh`: `grep -q` får inte fälla en pipeline som hittade sin rad | Revertera commit |
| [#391](https://github.com/cqrityjob/trust-path-recruitment/pull/391) | Karriäranalys | en tillgänglighetskälla, sann stängd panel, indexering följer läget, CTA:er bakom samma svar, utskrift på sparad rapport. **Ingen migration** | Revertera PR; läge byts med `cd_set_access_state` |
| [#392](https://github.com/cqrityjob/trust-path-recruitment/pull/392) | Mejl till arbetsgivaren, schema | utkorg, mottagarregler i SQL, claim/settle med lease, 90 dagars retention, `20270205090000` (**pending**) | Rollback-skript; appen tål att funktionen saknas |
| [#393](https://github.com/cqrityjob/trust-path-recruitment/pull/393) | Mejl till arbetsgivaren, app | kind `employer_new_application`, avsändare utan kandidatuppgifter, kö-hantering, sweep, 34 planterade fel (inkl. de två som kräver #386), rättad ordningskontroll i `recruitment-workspace:check` | Revertera PR |
| PR_ACCESS_SCHEMA_REF | Rapportbehörighet, schema | `20270202090000` (avstängning kan inte kringgås, granskargrants följer medlemskapet), `20270203090000` (en definition av vem som läser; 14 funktioner och 7 policyer), `20270204090000` (intervjuärenden), 16 äldre sviter anpassade, 4 nya sviter | Rollback-skript i omvänd ordning, md5-pinnade |
| PR_ACCESS_APP_REF | Rapportbehörighet, app | ärlig "ingen åtkomst"-vy, avstängningskoder som riktiga meningar, `employer-report-access:check` med 26 planterade fel | Revertera PR |
| Dokument | | dependency-audit, domän/inställningar, säkerhetsmemo, produktionstestbegäran, releaseordning, denna rapport | — |

**Releaseordning.** Beroendebaserad och för alla PR:er: `2026-10-03-release-order.md`. Kortfattat:
#390 när som helst → #386 (efter Astra) och funktionsdriftsättning → #387 (jobbtavlans tre migrationer)
→ behörighetsschema (`0202–0204`) → behörighetsapp → notisschema (`0205`) → funktionsdriftsättning
→ notisapp → karriär (#391, ingen migration). Versionerna hålls stigande eftersom migrationsverktyget
annars avvisar eller kräver `--include-all`. `20270126090000` (#388) är applicerad och registrerad (#389).

## 7. Beslut och hinder (det som inte är mitt att avgöra)

1. **Rapportbehörighet:** rättningen är byggd (steg 3 i releaseordningen). Beslutet är ägarens: vanligt
   medlemskap ger inte läsrätt; ägare/administratör, granskare per användningsfall, ansvarig rekryterare och
   ärendets skapare/panel gör det. Beteendet ändras för befintliga organisationer samma dag
   `20270203` appliceras, så de bör meddelas och tilldela granskaråtkomst först. En utsedd
   säkerhetsansvarig som är vanlig medlem utan grund kan inte läsa ett prövningsärende (snävare, aldrig vidare).
2. **Karriäranalysens öppnande:** att öppna för konton som inte är testare, med alla sju granskningsflaggor
   `false` och utkastetiketter, är ägarens beslut; det gör också sidan indexerbar. Se #391.
3. **Arbetsgivarmejl:** byggt som alternativ A. Ingen avanmälan i första versionen; mottagare är ansvarig
   rekryterare, annars ägare/administratörer (högst 10). Anropet väntar högst 3 s på leverantören.
4. **Ägarens egen borttagning av medlem:** kräver en ny funktion (nuvarande är endast plattformsadmin).
5. **Testliknande publika annonser** (D2) och data som hygienunderlaget märkt "REMOVE BEFORE LAUNCH".
6. **Dependencies:** godkänn en lockfile-uppdatering i miljö som når Lovables cache.
7. **Produktion:** inställningarna i `2026-10-03-www-domain-cutover.md` (L1–L5, S1–S8, R1–R3, D1–D3, G1–G2)
   och själva testet i `2026-10-03-production-test-request.md`. Testmejl bara till den av ägaren namngivna adressen.
8. **Svar till kandidater:** svar går till `job@cqrityjob.com` tills ett svar i produkten finns. Ägaren
   behöver namnge vem som bevakar `job@` och en svarstid (Claude-sessionen har föreslagit en minimal
   svarsfunktion som kan ta samma utkorg).

## 8. Kvarstående hinder för lansering

1. **Produktmejlen är fortfarande stängda.** #386 är mergad och `transactional-email` v3 driftsatt (13:47 UTC,
   enligt #394), men funktionen svarar 503 `not_configured`: `RESEND_API_KEY` saknas på den. Den publicerade
   sajten saknar dessutom #386 tills ägaren publicerar.
2. Auth från www är ej verifierat (S1/S2 och test; Claude-sessionens konfiguration).
3. Sju migrationer är inte applicerade; rapportbehörigheten i produktion matchar inte kravet förrän `0203`/`0204`.
4. Juridiska sidor: öppna platshållare (Claude-sessionen) och vem som bevakar `job@`.
5. Karriäranalysen är stängd för icke-testare tills ägaren öppnar den.
6. Mejl, registrering, bekräftelse, ansökan, test, rapport och arbetsgivarmejl saknar produktionsbevis; Claude-sessionen
   skickar T1–T5 till en enda testadress och jag kontrollerar loggarna; T6 väntar på `20270205` och appen.
7. Publicerad commit är okänd. Ingen merge och ingen produktionsändring har gjorts.
8. **Kvarstår medvetet utanför dessa PR:er:** innehållsrollernas `*_author_read`-policyer (läser alla
   hyresgästers kandidatsvar; antalet innehavare okänt), BESKT:s `bcp_employer_*`-medlemsläsningar,
   den pensionerade v3.0-karriäranalysen som fortfarande kontrollerar testarlistan oavsett läge, `sweep_expired_jobs`.
