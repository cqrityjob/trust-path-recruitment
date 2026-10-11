# Slutuppdrag 2026-10-11 – PR 1 (funktioner och verifiering): leveransnot och matris

Uppdrag: *Slutför CQrityjobs rekryteringsprodukt både funktionellt och som en sammanhängande,
användarvänlig arbetsyta. Högst två PR:ar.* Detta är PR 1 ([#468](https://github.com/cqrityjob/trust-path-recruitment/pull/468),
gren `claude/amazing-clarke-ferjkh`), utgående från main `63f34421`. PR 2 (UX) byggs ovanpå.

Produktion `wrygicdfxwjnrugduxnt` har inte skrivits till; ingen publicering; AI och
retention-worker/cron avstängda; inga riktiga kandidatutskick; inga produktionsraderingar.
Redan installerade migrationer är oförändrade; inga releasegrindar har kringgåtts.

Commits: `7416a139` (schema + klient + tester + texter), `17d47c70` (ompinnade vittnen).
**CI på exakt slutcommit: pågår – resultat förs in här när jobben gått.**

## Matris per krav i uppdraget (PR 1)

Kolumnerna betyder: *Byggt* = kod i grenen; *Mergat* = i main; *Installerat* = schema i den hostade
databasen; *Publicerat* = i publicerad app; *Verifierat* = faktiskt kört bevis, var och hur.

| Krav | Byggt | Mergat | Installerat | Publicerat | Verifierat |
|---|---|---|---|---|---|
| 1. Kandidatjämförelse i klienten mot befintlig server-API (`rec_ri_compare_applications`, installerad 20270310100000); jämförbart, källbundet underlag mot samma profilversion; ingen rangordning | ja – jämförelsesida + "Jämför" i tabellen | nej | **ja** (API:n sedan 2026-10-09) | nej | tsc/eslint/guards lokalt; real-stack-browsertest *two candidates compared…* i `recruitment-workspace.spec.ts` (CI på slutcommit) |
| 1. Kravändringshistorik i klienten (`rec_ri_profile_change_history`, `rec_ri_profile_change_impact`) | ja – påverkan före ändring, historik med "ingen motivering registrerad" för äldre versioner | nej | **ja** (API:n) | nej | SQL P11 (historik); browsertest *the requirement profile…* |
| 2. Kravändringar kräver motivering och korrekt versionshistorik även via `rec_ri_confirm_profile`; historiska granskningar är inte bekräftelser av nya krav | ja – slot `20270313100000` + klienten skickar ändringar via granskad wrapper | nej | **nej** (pending) | nej | `recruitment_lifecycle_v04_test.sql` P1–P18 (lokalt, full uppspelning); rollback ordagrann; browsertest med legacyvägran via riktigt API (CI) |
| 3. Livscykel mottagen → granskning → komplettering/test/intervju → beslut → avslutad → arkiverad; "Ej aktuell" lämnar Aktiva och kön direkt, även efter omladdning/annan flik; återöppning behörig med orsak; besked separat från beslut | ja sedan #466 (installerat schema 111); återöppning via `rec_reopen_application` | ja (#466) | ja (111/121) | nej | befintligt real-stack-test *'Ej aktuell'…* + nytt *reopened only as its own act…* (medlem vägras via API) – CI på slutcommit |
| 4. Komplettering: begäran → skick → kandidatens svar → fortsatt granskning | begäran/avslut sedan #466; **kandidatens svar i appen = slot `20270314100000`** (server) + arbetsgivarens läsning (klient); kandidatens skrivklient kommer efter installation | nej | **nej** (pending) | nej | SQL A1–A22; browsertest *a supplement: requested…* där kandidaten svarar via riktigt GoTrue/PostgREST-API (CI). **Vad som faktiskt stöds i dag utan sloten:** svar via e-post registreras av en person; panelen säger det. |
| 5. Intervjupaket: relevanta BESKT-frågor, beteendefrågor, scenarier; kärnfrågor obligatoriska; ärendets pinnade version; rekrytering ≠ säkerhetsprövning | ja – slot `20270315100000` + BESKT-grupp i upplägget; beteende/scenario grupperas efter paketets frågetyp | nej | **nej** (pending) | nej | SQL B0–B15 (katalogfilter, vägran av säkerhetsprövnings-/känsligt/förberedelse-/opublicerat innehåll); browsertest *the interview setup offers the published BESKT item…* (CI). Inget BESKT-innehåll finns hostat – fixturen seedar syntetiskt. |
| 6. Kompletta SV/EN-texter för inledning, kandidatfrågor, avslut; PEACE stödjer samtalet | **dokument för godkännande**: `docs/employer/2026-10-11-intervjutexter-sv-en-for-godkannande.md` | – | – | – | kräver ägarens innehållsgodkännande; inget aktiverat |
| 7. Tester mot nya klienten med riktig Auth/Storage/DB i isolering | ja – fem nya real-stack-tester; native/real-CI-vittnen ompinnade till `7416a139` | nej | – | – | CI på slutcommit (se nedan) |

## "120 kontroller" – vad som faktiskt finns och vad som körts

Talet 120 förekommer inte i något kontrakt, test eller workflow. Det räknbara i Astras
native-stage (`.github/workflows/recruiter-p1-native-ci.yml`) är:

| Bevis | Antal | Pinnat mot | Status på denna gren |
|---|---|---|---|
| `workspace_six_rpc_real_auth_http` | 70 HTTP-anrop (60 mot de sex RPC:erna + 10 stöd) med riktiga GoTrue-sessioner | app `APP_SHA`, schema `SCHEMA_SHA` | ompinnat till `7416a139`; körs i CI |
| `canonical_23_http_two_real_reviewers` | 23 räknade assertioner från appens `scripts/recruiter-intelligence-p1-api-check.mjs` (hash-pinnad) | `API_HASH` | skriptet uppdaterat (v2 via granskad wrapper + legacyvägran asserterad utanför räkningen); ny hash; körs i CI |
| fem browserfall från appens `e2e/recruiter-intelligence-p1.spec.ts` (hash-pinnad) | 5 | `BROWSER_HASH` | hash följer appcommit; körs i CI |
| Passport native OP09 | Auth8, actual44, browser4 | samma pinnar | ompinnat; körs i CI |
| Real Supabase evidence | fullständig uppspelning (394) + appens P1-skript mot aktuellt schema | `RI_REAL_RELEASE_SCHEMA_SHA`, app | ompinnat; körs i CI |

Summa räknbara enskilda kontroller: 70 + 23 + 5 = 98 i P1-native, plus OP09:s 56 och
real-CI:s uppspelning. **Gamla app-pinnar (`55db1e3b`) används inte som bevis för nya
funktioner**: alla vittnen pekar nu på commiten som bär den nya klienten och det nya schemat.
Den nya klientens egna funktioner (jämförelse, motiverad ändring, kandidatsvar, BESKT) bevisas av
real-stack-jobbet *Recruitment workspace browser evidence* (riktig GoTrue/PostgREST, lokal stack),
inte av native-stagen, som fortsatt bevisar P1-kontraktet.

## Verifierat lokalt (exakt, isolerad PostgreSQL 16 på port 55432)

- Full uppspelning av 394 migrationer; `recruitment_lifecycle_v04_test.sql` 56/56; databärande
  rollbackar vägrar data (`RI_ROLLBACK_REQUIRES_PRESERVED_DATA`); tomma rollbackar står ned och
  återställer kropparna ordagrant (jämfört mot originalmigrationerna); återapplicering 56/56.
- `db-test.sh` till Docker-steget (PostgREST14 kräver Docker lokalt): v0.4 56, P1-orakel 95,
  v0.3 51, workspace 36 + races, upload 41, lifecycle 124, Sentinel 35.
- `tsc`, `eslint`, `prettier`, `employer-portal-flow:check`, `interview-ux-contract:check`,
  `interview-recruiter-workflow:check`, `employer-lifecycle:check`, `release-frontier:check`
  (3 pending by design), `release-parity:check`, `schema-first-release:check`,
  `deploy-plan:check` (plan = de tre pending), `migrations:check`, `migrations-duplicate:check`,
  `nullable-rpc-contract:check`; bun-tester 28 + 84 vittnestester.
- Kunde **inte** köras lokalt: Playwright mot lokal Supabase-stack (Docker saknas). CI på exakt
  SHA avgör.

## Ägarens beslut som återstår

1. **Releasebeslut** för slotsen 131/141/151: merge till main → officiell installation →
   read-only verifiering → registrering som *applied* i `release-state.json` + hosted ledger.
   Kandidatens skrivklient (svar i appen) och eventuella `introduces`-konsumenter kommer i
   PR 2 först efter registrering (release-parity-guarden).
2. **Innehållsgodkännande** av SV/EN-texterna.
3. **Merge-ordning:** PR 1 före PR 2 (PR 2 bygger på PR 1).

## Releasesteg (oförändrade)

Verifierat schema → kompatibel app-merge → Lovable-synk → ägarens Publish →
`release-identity.json` matchar → inloggad kontroll i publicerad app.
