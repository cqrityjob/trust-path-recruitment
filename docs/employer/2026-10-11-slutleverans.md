# Slutleverans 2026-10-11 – rekryteringsprodukten (PR 1 #468 + PR 2 #469)

Uppdrag: _Slutför leveransen genom befintliga #468 och #469, hela vägen till en verifierad
version som jag kan publicera i Lovable._ Två PR:ar, inga fler. AI och automatisk gallring
avstängda; ingen produktionsdata raderad; inga riktiga kandidatutskick; Publish görs av ägaren.

Kolumnerna i matrisen betyder: **Byggt** = kod i grenen; **Mergat** = i main; **Installerat** =
schema på det hostade projektet `wrygicdfxwjnrugduxnt`; **Publicerat** = i den publicerade
appen (ägarens Publish); **Verifierat** = faktiskt kört bevis, var och på vilken commit.

## 1. CI på de faktiska slutcommitsen

### PR 1 (#468) – slutcommit `8a736dd4` (bildbotens commit ovanpå `aece303d`), mergad som `9774c9c0`

Bildbotens commit utlöste alla 13 workflows med `action_required` (repots Actions-policy för
`github-actions[bot]`). Enligt policyn körs de om av underhållarkontot; **försök 2 är beviset**,
samtliga gröna på exakt `8a736dd4`:

| Workflow                                                                                                                                                          | Körning                                        | Resultat |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| CI (lint/typecheck/guards, migrationsreplay PG16+PG17/PostgREST14, P1 PG17+HTTP, P1 full SQL/HTTP/browser, CV, Passport, publika browsersviter, före/efter-paret) | run 1878 attempt 2                             | ✅       |
| Recruiter P1 native 100-application evidence (70 HTTP + 23 kanoniska + 5 browserfall, pinnat mot appen)                                                           | run 92 attempt 2                               | ✅       |
| Recruiter real Supabase evidence (full uppspelning 394 + appens P1-skript)                                                                                        | run 89 attempt 2                               | ✅       |
| Passport native OP09 recovery evidence                                                                                                                            | run 76 attempt 2                               | ✅       |
| Recruitment workspace — routed browser evidence (riktig GoTrue/PostgREST, `recruitment-workspace.spec.ts`)                                                        | run 509 attempt 2                              | ✅       |
| Employer portal UX evidence — before and after                                                                                                                    | run 62 attempt 2                               | ✅       |
| E4 employer final report / Career Center / Job ad back navigation / Passport public pilot / Role assessment / Security Work / Application retention               | 760/2, 472/2, 474/2, 434/2, 105/2, 522/2, 83/2 | ✅       |

Tidigare gröna körningar på `aece303d` är **tidigare bevis** (CI-körningen där avbröts av bot-pushen
och räknas inte); slutverifieringen är försök 2 på `8a736dd4`.

### PR 2 (#469) – kodhuvud `869cf5c4` (bildbotens par för `946a3ade`, bas main `9774c9c0`)

Kedjan: `946a3ade` (merge av main + installationsregistrering + kandidatens svarsvy) → `bfbe02e7`
(denna not, docs) → `869cf5c4` (botens färska bildpar: före = main `9774c9c0`, efter = `946a3ade`,
samma instrument). Botens commit utlöste alla 13 workflows med `action_required`; de kördes om av
underhållarkontot och **försök 2 är beviset**, samtliga gröna på exakt `869cf5c4`:

| Workflow                                                                                                                                                                                                                                                                        | Körning                                        | Resultat |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| CI (lint/typecheck/guards inkl. nullable-RPC-kontraktet och workspace-guarden, migrationsreplay PG16+PG17/PostgREST14, P1 PG17+HTTP, **P1 full SQL/HTTP/browser – PostgREST-starten gick igenom**, CV, Passport, publika browsersviter, före/efter-paret komplett och aktuellt) | run 1882 attempt 2                             | ✅       |
| Recruitment workspace — routed browser evidence (riktig GoTrue/PostgREST; kandidat20 svarar i appen i egen webbläsare, ansvarig läser och avslutar)                                                                                                                             | run 512 attempt 2                              | ✅       |
| Recruiter P1 native 100-application evidence                                                                                                                                                                                                                                    | run 96 attempt 2                               | ✅       |
| Recruiter real Supabase evidence                                                                                                                                                                                                                                                | run 93 attempt 2                               | ✅       |
| Passport native OP09 recovery evidence                                                                                                                                                                                                                                          | run 79 attempt 2                               | ✅       |
| Employer portal UX evidence — before and after                                                                                                                                                                                                                                  | run 65 attempt 2                               | ✅       |
| E4 / Career Center / Job ad back navigation / Passport public pilot / Role assessment / Security Work / Application retention                                                                                                                                                   | 763/2, 475/2, 477/2, 437/2, 108/2, 525/2, 86/2 | ✅       |

Den commit som för in denna tabell är docs-only (ingen omfotografering); dess egen CI-körning
rapporteras i PR:en och i chatten före merge, och merge sker på den exakta commiten.

## 2. Matris per krav

| Krav                                                                                                                                               | Byggt                                     | Mergat                  | Installerat                                                                                 | Publicerat            | Verifierat                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motiverade kravändringar + korrekt versionshistorik även via `rec_ri_confirm_profile`; historisk granskning är aldrig bekräftelse av nya krav      | ja (#468)                                 | ja `9774c9c0`           | **ja** slot `20270313100000` (ledger, funktioner, grants, kroppshashar = lokal uppspelning) | nej – ägarens Publish | SQL P1–P18 (57-sviten, full uppspelning); real-stack-test _the requirement profile…_ (legacyvägran via riktigt API); P1-native/real-CI gröna på `8a736dd4`                                                       |
| Kravändringshistorik och påverkan i klienten                                                                                                       | ja (#468)                                 | ja                      | ja (API sedan 2026-10-09)                                                                   | nej                   | real-stack-test; stubbad evidenssvit 24/24                                                                                                                                                                       |
| Kandidatjämförelse mot samma profilversion, källbundet, ingen rangordning                                                                          | ja (#468)                                 | ja                      | ja (API sedan 2026-10-09)                                                                   | nej                   | real-stack-test _two candidates compared…_                                                                                                                                                                       |
| Livscykel: "Ej aktuell" lämnar Aktiva och kön direkt, hittas under Avslutade, arkiveras; återöppning behörig med orsak; besked separat från beslut | ja (#466/#468)                            | ja                      | ja (111/121)                                                                                | nej                   | real-stack-tester _'Ej aktuell'…_ och _reopened only as its own act…_                                                                                                                                            |
| Komplettering: begäran → skick av person → **kandidatens svar i appen** → sparbekräftelse → ansvarigs läsning → fortsatt granskning                | server (#468) + **kandidatens vy (#469)** | PR 1 ja; PR 2 vid merge | **ja** slot `20270314100000`                                                                | nej                   | SQL A1–A22; real-stack-test _a supplement…_ där kandidat20 svarar i egen webbläsare, svaret persisterat, ansvarig läser och avslutar, vägran efter avslut visad som mening; stubbad browser-rök 1440/sv + 375/en |
| Intervjupaket: relevanta BESKT-frågor, beteende/scenario, kärnfrågor obligatoriska; rekrytering ≠ säkerhetsprövning                                | ja (#468) + läsbart upplägg (#469)        | PR 1 ja                 | **ja** slot `20270315100000`                                                                | nej                   | SQL B0–B15; real-stack-test _the interview setup offers the published BESKT item…_ (syntetiskt innehåll i fixturen)                                                                                              |
| Nästa ansökan att granska (översikt + kandidatsteg)                                                                                                | ja (#469)                                 | vid merge               | ja (`rec_ri_next_unreviewed`)                                                               | nej                   | stubbad evidenssvit; före/efter-par                                                                                                                                                                              |
| Bekräftade/saknade/inaktuella skallkrav begripliga i ansökan                                                                                       | ja (#466/#469)                            | –                       | –                                                                                           | nej                   | stubbad evidenssvit; real-stack                                                                                                                                                                                  |
| SV/EN-intervjutexter för ägarens innehållsgodkännande                                                                                              | dokument                                  | ja                      | –                                                                                           | –                     | **kräver ägarens godkännande**; inget aktiverat                                                                                                                                                                  |

Beslut, kandidatbesked, arkivering och radering är fyra skilda handlingar i klienten och i schemat:
beslutet är ett stegbyte (`rec_set_application_stage`, Ej aktuell/anställd) utan utskick; beskedet är
ett meddelande som en person skriver och skickar (`rec_claim_message_send`/`rec_settle_message_send`);
arkiveringen är `rec_archive_material` (retention-livscykeln, 20270305090000) som bara markerar och
aldrig raderar; radering sker enbart av retention-arbetaren, som är avstängd.

## 3. "120 kompletteringskontroller" – vad som faktiskt finns

Talet 120 finns inte i något kontrakt, test eller workflow. Det räknbara:

| Bevis                                                        | Antal                                      | Pinnat mot                   | Status                             |
| ------------------------------------------------------------ | ------------------------------------------ | ---------------------------- | ---------------------------------- |
| `workspace_six_rpc_real_auth_http` (native)                  | 70 HTTP-anrop med riktiga GoTrue-sessioner | app + schema `53659419`      | grönt på `8a736dd4`                |
| `canonical_23_http_two_real_reviewers` (native)              | 23 räknade assertioner (`API_HASH`)        | app                          | grönt på `8a736dd4`                |
| fem browserfall `recruiter-intelligence-p1.spec.ts` (native) | 5 (`BROWSER_HASH`)                         | app                          | grönt på `8a736dd4`                |
| Passport native OP09                                         | Auth 8, actual 44, browser 4               | pinnar                       | grönt                              |
| Real Supabase evidence                                       | full uppspelning 394 + P1-orakel           | `RI_REAL_RELEASE_SCHEMA_SHA` | grönt                              |
| v0.4-SQL-sviten (nya slots)                                  | 57                                         | lokal + CI-replay            | grönt                              |
| real-stack-browsersviten `recruitment-workspace.spec.ts`     | 24 tester                                  | PR-huvudet                   | grönt på `8a736dd4` och `869cf5c4` |

98 räknade native-kontroller + 56 OP09 + 57 SQL + 24 real-stack. **Gamla app-pinnar
(`55db1e3b`) används inte som bevis för nya funktioner**; native-pinnarna pekar på
`53659419` (P1-orakel genom granskad wrapper), och de nya funktionerna bevisas av real-stack-jobbet
på PR-huvudet, inte av native-stagen.

## 4. Installationen (read-only verifierad, registrerad)

`docs/release/2026-10-11-slutuppdrag-hosted-verification.json`: ledger 394 rader (prior 391
oförändrade, md5 `8a2b78d8`; alla 394 `497fb4e7`), åtta funktioner med identitetsargument, kroppshashar
lika med den lokala fulla uppspelningen, EXECUTE endast `authenticated` (aldrig `anon`; privat kärna
och triggerguard för ingen klientroll), `rec_candidate_replies` RLS på, 0 rader, SELECT endast
`authenticated`, trigger och index bundna. `release-state.json` applied med evidens,
`hosted-ledger.json` 394, frontier tom, deploy-plan tom. Inga redan installerade migrationer ändrade.

## 5. PostgREST-startfelet i "P1 — full SQL, HTTP and browser proof"

På PR 2:s huvud `5105eaa3` (12:14Z) föll jobbet med _local service not ready:
http://127.0.0.1:54394/rest/v1/_ exakt 60 s efter att PostgREST-bilden dragits; samma jobb, samma
skript, gick grönt på PR 1:s `aece303d` åtta minuter tidigare och på `8a736dd4` (försök 2). PR 2
ändrar ingenting under `scripts/local-stack` eller i workflowen. De privata loggarna laddas inte upp.
Bedömning: långsam start av PostgREST/gatewayen på den runnern (schemacache över 394 migrationer),
inte PR:ens kod. Ingen tidsgräns har ändrats. Resultatet på PR 2:s slutcommit avgör: grönt = engångs;
rött igen = rotorsak åtgärdas innan merge (ingen förlängd väntetid "för att få grönt").

## 6. Ägarens steg efter merge

1. **Lovable-synk:** synka main till den slutliga main-SHA:n (merge-commiten av #469; rapporteras i
   chatten). Kontrollera i Lovable att commiten syns och att inga egna ändringar ligger ovanpå.
2. **Före Publish:** `release-identity.json` i den byggda förhandsvisningen ska ha `commitSha` =
   main-SHA:n och `sourceTreeSha256` = värdet i chatten; inga env-värden ändrade (AI och retention
   förblir avstängda; `VITE_*`-flaggor oförändrade).
3. **Efter Publish:** hämta `https://<publicerad domän>/release-identity.json` och jämför båda
   fälten. Avvikelse = publicera inte vidare, säg till.
4. **Inloggat flöde (syntetiska konton, inget riktigt utskick):** se checklistan i chatten – nästa
   ogranskade → granskning → komplettering (skick + kandidatens svar i appen) → jämförelse →
   intervjuupplägg → Ej aktuell → Avslutade → arkivering; kandidatens sida: ansökan, meddelande,
   svar, bekräftelse.
5. **Innehållsgodkännande:** `docs/employer/2026-10-11-intervjutexter-sv-en-for-godkannande.md`.
   Inget BESKT-innehåll är aktiverat; fixturens BESKT-metod är syntetisk och bevisar bara mekaniken.
