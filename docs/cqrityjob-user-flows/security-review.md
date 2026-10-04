# Separat säkerhetsgranskning: F02, F04, F05, F09

Granskad mot aktuell kod från `origin/main` `ecaa805`, därefter denna branches ändringar. Inga produktionsändringar, externa konton eller verkliga delningstoken användes. Rapportens instruktioner behandlades som observationer; det inklistrade användaruppdraget styr arbetet. Slutcommit och slutlig CI-status registreras av integrationsansvarig efter att kod och dokumentation frysts.

## F02 — identitet efter karriärtestet

**Observation:** Testaren uppger att Google-knappen öppnade Mostafas konto. Ingen Google-session eller ursprunglig profil kunde undersökas. Användaren bekräftade att separata Google-testkonton inte finns tillgängliga.

**Bekräftad diagnos:** `UnifiedAuthPanel` återanvänder en redan inloggad app-session och navigerar vidare. Före ändringen sparade `PublicAssessmentFlow` ett färdigt resultat automatiskt när `signedIn` var sant; den som återkom med en claim fick ingen explicit kontroll av vilket konto resultatet skulle knytas till. Google-anropet bad inte uttryckligen om kontoval. Detta är verifierade kodvägar, **inte bevis för vilken som orsakade testarens Google-upplevelse**.

Servern använder redan autentiseringens verifierade `context.userId` som `cd_sessions.user_id`; klienten väljer inte ägare. Claimens deterministiska sessions-ID och RLS hindrar ett annat konto från att läsa eller ta över ett redan sparat resultat. Inget hårdkodat Mostafa-konto eller ersättning av ägar-ID identifierades i de granskade vägarna.

**Ändring:**

- Resultatet visar aktivt konto och kräver den synliga åtgärden ”Spara resultatet på det här kontot”.
- ”Byt konto” behåller det färdiga resultatet och samma befintliga claim, avslutar den lokala app-sessionen och återgår till inloggning med rätt returväg.
- `getUser()` läser identiteten igen vid sparåtgärden. Om en annan flik har bytt konto stoppas sparandet och det nya kontot visas för ett nytt aktivt val.
- `expectedUserId` jämförs med serverns autentiserade identitet före databasarbete. Det är en kontroll av användarens val, inte en auktoritetskälla. Äldre klienter utan fältet använder fortfarande serverns befintliga ägarregler.
- Google-anropet använder `prompt=select_account`. Kontovalsdialogen är en tydlighetsåtgärd, inte bevis för resultatets ägarskap.

Kod: `src/components/career-discovery/v31/PublicAssessmentFlow.tsx`, `src/components/auth/UnifiedAuthPanel.tsx`, `src/lib/auth/account-confirmation.ts`, `src/lib/career-discovery/v31-public.functions.ts`.

**Verifiering:** 12 lokala browserfall passerade för desktop/375 px: synligt konto, inget automatiskt sparande, aktivt sparande i public/internal_test, kontoändring under sparandet utan request, pausad analys och nekad sparning med bibehållna svar. Browserns auth/backend är syntetiska fixtures, inte riktiga Google-sessioner. `auth-account-boundary.test.ts` kör den riktiga serverhandlern och dess validator med ersatt transport/DB: ett request med verifierad kontext B och förväntat A stoppas före första DB-anropet; matchande A når befintliga accesskontroller (2 tester). Det separata SQL-testet `career_discovery_v31_public_flow_test.sql` passerade 28 assertions på färsk aktuell lokal databas, inklusive verklig RLS-isolering av rapport och svar mellan syntetiska användare samt idempotent sparande.

**Kvarstående manuell kontroll:** Google med två egna testkonton i ren respektive tidigare använd browserprofil, följt av kontroll av app-session, profilägare och sparat resultat. Google-, Supabase- och appkontot måste jämföras; kontovalsdialog ensam räcker inte. Kontobytesknappens kompletta externa OAuth-retur är inte körd. F02 är därför delvis verifierad, med rapporterad Google-rotorsak fortfarande okänd.

### Ansökningsutkast vid kontobyte

`_authenticated` använder nu användar-ID som React-nyckel för den inloggade vyn. Tidigare behöll direkt `SIGNED_IN` med ny identitet samma lokala komponentstate; en rensad querycache räckte inte för Academy-svar. Academy avbryter debouncade/ännu ej startade sparningar vid avmontering, medan normal navigation inväntar sparande före utgång. Syntetiskt A → B → A samt utloggning → ny session har verifierats på desktop/375: ingen A-text syns för B, ingen gammal buffert skickas under B och A återfår sina serverlagrade svar och position. Befintlig serverkontroll av försökets ägare kvarstår.

En separat verifierad klientrisk hittades i `ApplyInternalDialog`: både sessionStorage-nyckeln `cqj.apply-draft.<jobId>` och det öppna formulärets state saknade kontogräns. Därmed kunde ett annat konto i samma webbläsarflik få föregående kontos utkast. Detta är inte en förklaring till den ursprungliga Google-observationen.

Utkast lagras nu under `cqj.apply-draft.<userId>.<jobId>`. Ett auth-lyssnande omslag monterar om hela formuläret vid ändrad användaridentitet eller annons, så även filer, samtycke och tillfälliga fält återställs innan det nya kontot kan öppna dialogen. Äldre utkast utan känd ägare återställs inte. En sen initial sessionsläsning får inte skriva över ett senare auth-event.

`e2e/application-draft-account-isolation.spec.ts` använder den riktiga klientens `setSession` med syntetiska identiteter och avskärmad Auth/backend. Den byter A → B → A i **samma dokument utan omladdning**, kontrollerar tomt formulär för B, separat B-utkast och återställt A-utkast. Den kontrollerar även att gammalt kontolöst utkast ignoreras. Detta är browser-state-bevis, inte bevis på riktiga JWT-signaturer eller Google-identitet.

## F04 — förhandsgranskning

**Observation/diagnos:** Knappen var redan ett riktigt `<button>` med `aria-expanded`, `aria-controls` och fokusstil. Den hade ingen explicit pekmarkör och texten gjorde handlingen mindre direkt. Visuell granskning bekräftade dessutom mörk mottagartext mot marinblå preview-wrapper; mottagarens vanliga sida har ljus bakgrund.

**Ändring:** ”Förhandsgranska delningen” / ”Preview sharing”, ”Se vilka uppgifter mottagaren kommer att se” / ”See what information the recipient will see”, pekmarkör/hover och ljus wrapper. Den gemensamma mottagarkomponenten och urvalsreglerna är oförändrade. Stängning behåller de valda uppgifterna och inställningarna.

**Verifiering:** Browsertest öppnar den riktiga mottagarkomponenten, verifierar valt innehåll, stänger med Enter, kontrollerar att båda valen finns kvar och att fokus ligger på preview-knappen. Hit-test av knappens mittpunkt kontrollerar att sidhuvudet inte täcker den. Desktop och 375 px passerade efter slutlig kontraständring. Före-/efterbilder: `screenshots/{before,after}-{desktop,mobile}-share-preview-sv.png`.

Fullpage-bilder tas från `scrollY=0` efter två animation frames. Tidiga bilder där sticky header hamnade mitt i dokumentet var screenshot-artefakter och ersattes; de används inte som bevis på faktisk överlappning.

## F05 — /p och fragmentlänk

**Observation:** Rapporten visar en 404 för `/p#…`. Rapportens verkliga token har inte återanvänts, loggats eller publicerats.

**Verifierad diagnos:** Aktuell `src/server.ts` hanterar exakt `/p` före TanStack-router och returnerar en egen HTML-ingång. Fragmentet når inte HTTP-servern; ingångsskriptet tar bort det och skickar det i POST-body till `/p/open`. En giltig delning byts mot en kortlivad HttpOnly-session. Ett anonymt, tokenfritt GET av `https://www.cqrityjob.com/p` den 4 oktober 2026 kl. 14:11:53 UTC gav **200**, rätt ingångsskript och nonce-baserad CSP. Lokal aktuell kod gav också 200. Den rapporterade 404:an kunde därmed inte reproduceras på den tokenfria ingången. Ingen gissad hostingändring gjordes.

**Verifiering:** Befintliga transportregressioner passerade 59 + 89 assertions: token/session-separation, URL-rensning, isolering av två öppna delningar, cookie-scope och felutfall. SQL-gatewaytestet kördes på färsk aktuell lokal databas: giltigt utbyte, engångshandoff, återkallad delning, utgången/malformed session och uteslutning av ansökningsdelningar från offentliga länkar. Browserfixture-tester visar utloggad aktiv mottagarvy, innehållsurval och felvyer.

**Sammanhängande lokal verifiering:** `scripts/cqrity-passport-local-check.mjs` passerade på svenska/1280 px och engelska/375 px mot befintlig lokal Supabase på 55421 med riktig GoTrue, PostgREST och appens HTTP-gateway via loopback-HTTPS. Varje körning skapar nya syntetiska ägare, loggar in med lösenord och skapar två egna meriter genom riktiga RPC:er. UI väljer en merit, öppnar/stänger preview med bibehållet urval, skapar en färsk länk, kopierar med Clipboard API och jämför QR-bildens moduler med exakt den skapade länken. Separat utloggad browser öppnar länken och laddar om; bara vald uppgift visas. Återkallning via UI stänger åtkomsten även efter reload, och slumpmässig ogiltig länk ger begripligt fel utan uppgifter. Inga nätverkssvar ersattes. Browsern blockerar alla externa adresser; inga externa anrop gjordes. Inga bearer-länkar, sessionsnycklar, skärmbilder eller traces skrivs av runnern.

**Begränsning:** Den befintliga lokala stacken saknar migrationsledger; den återställdes eller migrerades inte. F09 och slutlig schemaordning verifieras separat på färsk full replay, inte genom denna stack. Lokal login är verklig GoTrue med syntetiskt lösenordskonto, inte Google OAuth. Utgångna delningar täcks av separat SQL-gatewaytest. Public GET 200 och den fungerande lokala kedjan bevisar inte giltigheten hos originaltoken eller dåvarande publicering. Ursprunglig 404-rotorsak är fortfarande okänd.

## F09 — ansökningsdelning

**Bekräftad diagnos:** Ansökningsinlämningen kontrollerar att det finns aktiva verifierade claims/erfarenhetsperioder. Efterhandsdelningens UI kontrollerade endast att Passport-profilen existerade; `sp_share_passport_with_application` kunde då skapa en tom meritdelning med profiluppgifter. Mottagarens paketpayload filtrerade redan `assertion_level='verified' AND lifecycle_state='active'`. En klickbar knapp bevisar alltså inte att overifierade meriter skickades.

**Ändring:** Efterhands-UI läser samma `getApplicationPassportOffer` som ansökningsdialogen och visar den begärda förklaringen samt ”Öppna Security Passport” när verifierat innehåll saknas. En ny, ansökningsspecifik databastrigger vägrar INSERT eller ändrat innehållsurval när paketet saknar verifierat aktivt innehåll. Den utgår från den verkliga paket-/fokusavgränsningen och gäller även direkt RPC-anrop. Privilegierade triggers får anropa funktionen; den är inte körbar direkt av anon/authenticated/service_role. Allmän delning med `application_id IS NULL` behåller sin separata regel.

Migration `20270215090000_application_passport_verified_content_guard.sql` är **pending**, ej tillämpad i produktion. Den skapades via Supabase CLI och placerades efter repositoryts befintliga 20270214090000-frontier. Rollback tar endast bort trigger/funktion och återställer den tidigare möjligheten till tomma ansökningsdelningar. Release-state innehåller verifieringsquery och rollback. Samma PR kan granskas samlat; ingen produktionsrelease ingår.

**Verifiering:** Färsk strikt replay av samtliga 374 migrationer passerade i rätt slutlig filordning. `sp_application_passport_test.sql` passerade 38 innehålls-/beteendeassertions och 7 yt-/privilegieassertions: ansökan med samtycke, efterhandsdelning, mottagarens riktiga serverpayload, ägare/arbetsgivare, återkallning och den nya direkta vägran när bara egen uppgift finns. `security_passport_selected_sharing_test.sql` passerade 122 assertions och bevisar att allmän delning fortfarande kan bära aktiva `self_declared` och `document_provided` poster med rätt etiketter. Att dokument finns blir inte samma sak som verifierad.

## Reproducerbara slutkontroller

DB:n `cqrityjob_userflows_final` i den lokala containern `codex-interview-access-db` har hela slutliga migrationskedjan replayad. Följande fokuserade runner kan upprepas utan ny databas; varje tests fixtures rullas tillbaka:

```bash
DOCKER_BIN=/opt/homebrew/bin/docker \
SECURITY_DOCKER_CONTAINER=codex-interview-access-db \
SECURITY_TEST_DB=cqrityjob_userflows_final \
bash scripts/cqrity-user-flows-security-db.sh

bun test scripts/auth-account-boundary.test.ts
bun run scripts/public-assessment-auth-check.ts
bun run scripts/career-discovery-claim-check.ts
bun run scripts/career-discovery-conversion-check.ts
bun run scripts/passport-share-transport-check.ts
bun run scripts/passport-share-gateway-transport-check.ts

E2E_BASE_URL=http://127.0.0.1:3102 bun x playwright test \
  e2e/career-analysis-availability.spec.ts --project=chromium --project=mobile-375 \
  --grep 'the claim of a run' --workers=1
E2E_BASE_URL=http://127.0.0.1:3102 bun x playwright test \
  e2e/passport-sharing.spec.ts --project=chromium --project=mobile-375 \
  --grep '^.*2 · the preview' --workers=1
```

```bash
E2E_BASE_URL=http://127.0.0.1:3102 bun x playwright test \
  e2e/application-draft-account-isolation.spec.ts --project=chromium --project=mobile-375 \
  --workers=1
```

Browserkommandona förutsätter en lokal devserver och använder syntetiska nätverksfixtures. De bevisar inte produktionskonfiguration. Full CI/lint/build och final-commit-id rapporteras av integrationsansvarig separat.

Lokal sammanhängande Passport-körning (kräver skyddad lokal env-fil och separat lokalt konfigurerad app med HTTPS):

```bash
CQJ_LOCAL_PASSPORT=1 CQJ_LOCAL_ENV_FILE=/tmp/cqrity-live-local.env \
E2E_BASE_URL=https://127.0.0.1:3133 node scripts/cqrity-passport-local-check.mjs
```
