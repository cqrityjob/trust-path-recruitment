# 2026-10-16 — Privata rekryteringsdata kräver en aktiv Auth-session: schemasteg

Schema-först. PR:en innehåller:

- en migration och dess rollback;
- en SQL-svit med planterade fel;
- CI-registrering i `scripts/db-test.sh`;
- sessions-id i P1-harnessens syntetiska tokens;
- skarpa e2e-assertioner;
- releaseunderlag.

Ingen app-PR behövs. Appen skickar redan GoTrue-tokens, och de bär `session_id`. Inga
signaturer, svarsfält eller rättigheter ändras.

Bas: #475 (`20270319090000`, kandidatlistans prestanda). Migrationen ska installeras efter den
och rullas tillbaka före den, se "Beroenden".

## Beslut och grundorsak

**Ägarbeslut 2026-10-16:** privata rekryteringsdata kräver en aktiv Auth-session, enligt
samma princip som Passporten. Efter bekräftad utloggning eller sessionsåterkallelse ska
nästa anrop med den gamla tokenen nekas. Rekrytering ska inte kräva att personen har ett
Passport.

**Grundorsak:** en access-token är kryptografiskt giltig tills `exp`, oavsett utloggning.

- PostgREST kontrollerar bara signatur och giltighetstid.
- Appens middleware (`getClaims`) verifierar asymmetriska tokens lokalt, utan att fråga Auth
  om sessionen.
- Rekryteringens databasregler läste aldrig `auth.sessions`.

Reproducerat lokalt mot riktig GoTrue och PostgREST före migrationen
([`http-before.txt`](evidence/2026-10-16-recruitment-session-required/http-before.txt)). Efter
lokal utloggning gäller följande för den gamla tokenen:

- Auth `/user` nekade (403).
- `rec_ri_candidate_view` svarade fortfarande 200 med kandidater.
- Tabelläsningen gav 32 ansökningar.
- `rec_add_comment` och `rec_mark_application_viewed` **skrev**.

Totalt föll 24 av 38 kontroller. Efter migrationen passerar alla 38
([`http-after.txt`](evidence/2026-10-16-recruitment-session-required/http-after.txt)).

## Lösning

`public.rec_session_active()` returnerar sant endast när tokenens `session_id` är en levande
rad i `auth.sessions` **för samma användare**. Levande betyder att `s.user_id = auth.uid()` och
att `not_after` saknas eller ligger i framtiden.

- Funktionen läser `auth.sessions` vid varje anrop och har ingen cache.
- Anrop utan Auth-JWT (SQL, underhåll) och `service_role` påverkas inte, som för Passporten.
- Ett saknat, okänt, felformat eller annan användares `session_id` nekas.

Kontrollen verkställs på tre ställen. Skyddet sitter i databasen, så det gäller lika för
direkta PostgREST-anrop och för appens serverfunktioner.

1. **`rec_is_member()`**, medlemsregeln bakom varje rekryterarsidig `rec_*`-läsning och
   -skrivning (och därmed `rec_can_manage`), kräver sessionen. Roll- och företagsreglerna är
   oförändrade.
2. **Nio RPC:er som beslutar utan `rec_is_member`** får samma kontroll först i kroppen.
   Varje kropp är den nuvarande (`pg_get_functiondef` av den replayade schemat) plus kontrollen.
   - Plattformsadmin-grenen i `rec_application_employer_note` och
     `rec_application_status_events`.
   - `set_application_status`, `rec_save_vacancy_structure` och `rec_ri_case_composition`.
   - `scp_application_candidate`, som returnerar tomt.
   - Kandidatens `rec_my_application_context` (tomt), `rec_respond_to_booking` och
     `rec_candidate_reply_to_message`.
3. **En RESTRICTIVE policy `rec_session_required`** ligger på de tolv privata
   rekryteringstabellerna:
   `job_applications`, `job_application_answers`, `job_application_status_events`,
   `rec_candidate_replies`, `rec_requirement_profiles`, `rec_requirement_review_heads`,
   `recruitment_application_meta`, `recruitment_comments`, `recruitment_erasure_jobs`,
   `recruitment_interview_bookings`, `recruitment_messages` och `recruitment_settings`.
   - Den gäller `FOR ALL`, för läsning och skrivning.
   - Den är skriven `(SELECT public.rec_session_active())`. Det blir en InitPlan som
     utvärderas en gång per sats, aldrig per rad.
   - CV-filen i Storage täcks på köpet. Dess enda läspolicy slår upp filen i
     `job_applications` som anroparen (SR9.3–9.4).

**Ingen kontroll per kandidatrad.** De tio medlemspolicyerna anropade `rec_is_member` per
rad. De pekar nu på `recruiter_intelligence.rec_member_without_session`, samma medlemsregel
utan sessionen. Funktionen ligger utanför det PostgREST-exponerade schemat, och varje tabell
den används på bär den restriktiva policyn.

## Kartläggning: rekryteringens klientåtkomliga vägar

| Väg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ingång                    | Skydd                                                 | Prov                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- | ------------------------- |
| Kandidatlistan `rec_ri_candidate_view`, äldre `rec_candidate_view`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | RPC, app                  | `rec_is_member`                                       | SR1–SR6, SR12.1–12.2, e2e |
| Översiktsräkningar `rec_ri_overview_counts`, `rec_job_counts`, `rec_ri_next_unreviewed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | RPC, app                  | `rec_is_member`                                       | SR1.1, SR2.1, SR12.4–12.5 |
| Granskningsinformation `rec_ri_get_review`, `rec_ri_compare_applications`, `rec_ri_get_profile`, `rec_ri_profile_change_history/impact`, `rec_ri_supplement_state`, `rec_ri_page_evidence`, `rec_ri_composition_catalog`, `rec_ri_get_composition`                                                                                                                                                                                                                                                                                                                                                                   | RPC, app                  | `rec_is_member` (via `rec_can_manage` där det gäller) | SR1.1, SR2.1 (`review`)   |
| Händelser och anteckning `rec_application_status_events`, `rec_application_employer_note`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | RPC, app                  | egen kontroll (admin-grenen) + `rec_is_member`        | SR1.1, SR2.1              |
| Gallring och kvitton `rec_retention_overview`, `rec_preview_erasure` (via `rec_retention_scope`), `rec_receipts_needing_attention`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | RPC, app                  | `rec_is_member`                                       | lokal mätning             |
| Skrivande RPC:er: `rec_add_comment`, `rec_set_application_stage`, `rec_set_application_responsible`, `rec_set_recruitment_responsible`, `rec_mark_application_viewed`, `rec_save_booking`, `rec_set_booking_status`, `rec_save_message_draft`, `rec_discard_message_draft`, `rec_claim_message_send`, `rec_settle_message_send`, `rec_archive_material`, `rec_complete_recruitment`, `rec_reopen_recruitment`, `rec_reopen_application`, `rec_request_erasure`, `rec_retry_erasure`, `rec_set_retention`, `rec_set_receipt_settings`, `rec_ri_request_supplement`, `rec_ri_resolve_supplement`, `rec_ri_save_review` | RPC, app                  | `rec_is_member` (direkt eller via `rec_can_manage`)   | SR2.2, SR2.4, e2e         |
| `set_application_status`, `rec_save_vacancy_structure`, `rec_ri_case_composition`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | RPC, app                  | egen kontroll, `REC_SESSION_REVOKED`                  | SR1.5, SR2.2              |
| `scp_application_candidate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | RPC, app                  | egen kontroll (tomt svar)                             | SR9.1–9.2                 |
| Kandidatens `rec_my_application_context`, `rec_respond_to_booking`, `rec_candidate_reply_to_message`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | RPC, app                  | egen kontroll                                         | SR7.1–7.3, SR7.7          |
| De tolv tabellerna (läsning)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | PostgREST, app            | `rec_session_required` (RESTRICTIVE)                  | SR2.1, SR8, SR12.3, e2e   |
| Direkta skrivningar: endast sökandens `INSERT` i `job_applications` och `job_application_answers` (kolumnrättigheter). Övrigt saknar skrivrättighet för `authenticated`                                                                                                                                                                                                                                                                                                                                                                                                                                              | PostgREST, app (`submit`) | `rec_session_required` `WITH CHECK`                   | SR2.3, SR7.4–7.6          |
| CV-filen i Storage (`job-application-cvs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Storage-API               | läspolicyn läser `job_applications` som anroparen     | SR9.3–9.4                 |
| Talangsök `rec_talent_*`, `sp_talent_*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | RPC, app                  | redan `sp_assert_passport_session` (`20270318090000`) | befintliga sviter         |

**Appens serverfunktioner** går genom `requireSupabaseAuth`. Den lämnar vidare en klient med
användarens egen token, så varje rad ovan gäller även appen. Tjänsteroll används bara på dessa
ställen:

- **Efter en läsning med användarens token som nu nekas:**
  - `getApplicationCvSignedUrl` (`loadApplication` före den signerade länken);
  - namnberikningen i `recruitment.functions.ts:133` och `ai.functions.ts:400`.
- **CV-uppladdningen i `submitJobApplication`:** filen tas bort när ansökans `INSERT` nekas
  (`applications.functions.ts:484–494`). Ingen bestående ändring.
- **Systemarbetare utan användartoken:** kvitto- och arbetsgivarnotiserna
  (`receipt.server.ts`, `employer-notice.server.ts`) och `scp_iv_ai_real_model_permitted`.
  De är medvetet opåverkade.

**Kartlagt men utanför denna slot** (förslag till separat steg): definer-funktioner som läser
rekryteringstabeller utan `rec_is_member`. De gör det inom egna domäner med egna regler:

- intervju: `scp_iv_create_case`, `scp_iv_start_interview`, `scp_iv_can_read_case` m.fl.;
- bedömning: `scp_application_assessments`, `scp_assign_from_application`,
  `scp_employer_assign`, `scp_employer_person_overview`, `scp_employment_from_application`,
  `scp_invite_participant`;
- BESKT: `bcp_assign`, `bcp_start_beskt`, `bcp_employer_can_read_assignment`;
- Passportdelning: `sp_application_disclosure`, `sp_my_application_disclosures`,
  `sp_share_passport_with_application`;
- rapporter: `employer_reports_readable`;
- plattformsadmin: `admin_*`;
- notiser: `jase_*`.

Läser de `job_applications` som invoker omfattas de redan av den restriktiva policyn. Som
definer gör de det inte. Rekommendation: samma kontroll i en egen slot per domän, efter
domänägarens genomgång.

## Middleware: bedömning och val

`src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`, används av 99 filer)
är genererad av Lovable ("Do not edit it directly"). Den verifierar token med
`supabase.auth.getClaims`. Med asymmetriska nycklar sker det lokalt mot JWKS, utan sessionsfråga.
Med HS256 faller den tillbaka på `/auth/v1/user`.

Tre alternativ, och valet:

- **Ändra middleware till `getUser()` per anrop:** avvisas som lösning.
  - En extra Auth-rundresa per serverfunktionsanrop.
  - Skyddar inte direkta PostgREST-anrop.
  - Skrivs över vid nästa generering från Lovable.
- **Egen middleware-wrapper för rekryteringsfunktionerna:** samma brist mot PostgREST och en
  andra sanning att hålla i synk.
- **Databasen som varaktig kontroll (vald):** den gäller vid varje anrop genom båda
  ingångarna, binder sessionen till användaren och kostar en indexuppslagning per sats.
  Middleware lämnas oförändrad. Dess roll är att avvisa uppenbart ogiltiga tokens tidigt, inte
  att bära sessionsbeslutet.

E2E-testet visar att appens egen läsning (`listRecruitmentCandidatesPage`) och skrivning
(`markApplicationViewed`) nekas med den gamla tokenen, med oförändrad middleware. Det täcker
CI-stackens asymmetriska tokens, där `getClaims` inte frågar Auth.

## Prestanda: kontrollen upprepas inte per kandidatrad

Sessionskontroller per läsning (`pg_stat_xact_user_functions`, PG 17.6):

| Läsning                                                                              | Anrop av `rec_session_active`                |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| `rec_ri_candidate_view` (5 050, 120, 90 eller 30 ansökningar)                        | **1**                                        |
| `rec_job_counts`, `rec_candidate_view`, `rec_ri_next_unreviewed`                     | 1                                            |
| `rec_ri_get_review`                                                                  | 3                                            |
| `rec_application_status_events`, `rec_application_employer_note`                     | 2                                            |
| `rec_ri_overview_counts`                                                             | 1 + 2 per tjänst, oberoende av ansökningarna |
| Tabelläsning (`job_applications` 5 114 rader, `job_application_answers` 5 114 rader) | **1**                                        |

SR12 fäller sviten om kandidatlistan eller en tabelläsning kontrollerar mer än en gång, eller
om antalet växer med raderna. NC3 (policyn utan `SELECT`) visar att skyddet fångar en
per-rad-utvärdering.

Mätt före och efter, omväxlande, som inloggad ägare med session, på 5 050 ansökningar.
Underlaget finns i [`evidence/…`](evidence/2026-10-16-recruitment-session-required/README.md).

| Mätning                                                                    |   n | Median före | Median efter | Min–max före | Min–max efter | p95 före | p95 efter |
| -------------------------------------------------------------------------- | --: | ----------: | -----------: | -----------: | ------------: | -------: | --------: |
| SQL, `rec_ri_candidate_view`                                               |  20 |      552 ms |       509 ms |      410–762 |       417–730 |      655 |       701 |
| API-kedjan i `listRecruitmentCandidatesPage` mot riktig Auth och PostgREST |  20 |      570 ms |       598 ms |      456–674 |       461–788 |      659 |       711 |

Skillnaden ligger inom bruset, och kvartilerna överlappar (SQL 489–578 mot 486–551 ms).
Prestandavinsten från #475 behålls.

**Iakttagelse som styr beroendet.** Mot `rec_ri_candidate_view`-kroppen från _före_ #475
(`rec_can_manage` per ansökan) skulle sessionen kontrolleras per ansökan. Där blev API-kedjan
3 928 ms mot 2 091 ms. Därför installeras denna slot efter `20270319090000` och rullas
tillbaka före den.

## Tester

**SQL-sviten** `supabase/tests/rec_session_required_test.sql` innehåller 50 påståenden och
körs av `scripts/db-test.sh` före #475:s block:

- **SR1:** en aktiv session fungerar. Det gäller lista, räkningar, granskning, tabeller och
  skrivningar.
- **SR2:** efter lokal utloggning nekas den gamla tokenen överallt, och nekade skrivningar
  lämnar ingen ändring.
- **SR3:** en annan aktiv session för samma användare fungerar.
- **SR4:** sessionen är bunden till användaren. En annans levande session, okänt, felformat
  eller saknat id nekas.
- **SR5:** en utgången session nekas.
- **SR6:** global utloggning nekar alla tokens. En ny inloggning fungerar, och de gamla
  tokens förblir nekade.
- **SR7:** kandidatens vägar, inklusive direkta inserts. De nekas och lyckas med ny session.
- **SR8:** plattformsadmin.
- **SR9:** `scp_application_candidate` och CV-filen i Storage.
- **SR10:** roller och företag är oförändrade.
- **SR11:** anrop utan JWT och `service_role` påverkas inte, och `anon` saknar EXECUTE.
- **SR12:** regressionsskyddet.
- **SR13:** formen, sist, så att planterade fel fångas av beteendet först.

**Planterade fel** (SR NC1–NC5) fäller sviten på det namngivna påståendet:

- NC1, `rec_is_member` utan session: SR2.1.
- NC2, sessionen inte bunden till användaren: SR4.1.
- NC3, policyn per rad: SR12.3.
- NC4, en tabell utan restriktiv policy: SR2.1.
- NC5, kandidatens bokningssvar utan kontroll: SR7.3.

**Rollback** körs i db-test, följd av återapplicering och rollback igen. Efterkontrollen
bekräftar:

- att ingen funktion nämner `rec_session_active` eller `REC_SESSION_REVOKED`;
- att ingen `rec_session_required`-policy finns kvar;
- att medlemspolicyerna åter använder `rec_is_member`.

**E2E** (`e2e/recruitment-workspace.spec.ts`, "a signed-out token is refused on its next call
through both doors; …") körs över riktig GoTrue, PostgREST och appens serverfunktioner, med
en syntetisk medlem och flera sessioner:

- aktiva sessioner fungerar genom båda ingångarna (RPC, tabell och appens läsning);
- efter lokal utloggning nekas den gamla tokenen genom båda ingångarna. Skrivningar via
  PostgREST (`rec_add_comment`, `rec_mark_application_viewed`) och via appens
  `markApplicationViewed` lämnar ingen ändring i databasen;
- den andra sessionen fortsätter fungera;
- global utloggning nekar både den utloggande och en annan session, och en ny inloggning
  fungerar. Därefter går samma skrivning igenom med den levande sessionen.

Det tidigare testets "signed-out session"-registrering är nu också en skarp assertion.

**P1-harnessen** (`scripts/recruiter-intelligence-p1-api-check.mjs`) mintar syntetiska
HS256-tokens. De bär nu ett deterministiskt `session_id`, och
`run-ri-p1-evidence.sh` skapar motsvarande `auth.sessions`-rader. Den native P1-körningen
använder riktiga GoTrue-inloggningar och påverkas inte.

## Verifierat lokalt

- **Full strikt replay** av 399 filer på PostgreSQL 17.6 med repots bootstrap.
- **På den fulla schemat:**
  - livscykelsviten (124) och uppladdningssviten (41) med slotten installerad;
  - därefter SR-blocket (50 + 50, NC1–NC5, avveckling);
  - CV-blocket från #475 (32 + 32, NC1–NC4, 95 P1-påståenden, avveckling).
- **Rollback mot replay av de första 398 filerna:** funktionsdefinitioner och policyer är
  identiska, se evidence-README.
- **HTTP-reproduktionen** före och efter mot riktig GoTrue och PostgREST.
- **Repots kontroller:**
  - `migrations:check`, `migrations-duplicate:check`, `release-parity:check`;
  - `release-frontier:check`, `deploy-plan:check`, `deploy-plan-negative:check`;
  - `schema-first-release:check`.
- **Prettier, eslint och typkontroll** av e2e-specen.
- **Inte lokalt:** appens serverfunktioner kräver en full installation som inte var tillåten
  här. Den delen bevisas i CI.

## Beroenden, migrationsnummer och rollback

- **Installeras efter** `20270319090000` (#475) och **rullas tillbaka före** den.
- **Migrationsnummer:** det finns ingen reservationsfil, och slots samordnas enligt
  `docs/release/release-sequence.md`. Den 2026-10-16 hade varken `main`, någon fjärrgren eller
  någon öppen PR en migration över `20270319090000`. Därför används `20270320090000`.
- **Rollback:** `supabase/rollback/20270320090000_rec_session_required_rollback.sql`.
  - Tar bort de tolv policyerna.
  - Återställer de elva funktionskropparna ordagrant.
  - Återställer de tio medlemspolicyernas uttryck och tar bort de två nya funktionerna.
  - Slotten lagrar inget, så rollbacken vägrar aldrig.

## Efter godkänd release (releaseansvarig)

1. Supabase GitHub-integrationen applicerar `20270320090000`.
2. Läsverifiering på produktion, utan skrivning:

```sql
select version from supabase_migrations.schema_migrations where version = '20270320090000';
select count(*) = 12 as policies from pg_policies
 where policyname = 'rec_session_required' and permissive = 'RESTRICTIVE';
select prosecdef, position('s.user_id = auth.uid()' in prosrc) > 0 as bound,
       has_function_privilege('anon', oid, 'EXECUTE') as anon
  from pg_proc where oid = 'public.rec_session_active()'::regprocedure;
-- förväntat: policies = true, prosecdef = true, bound = true, anon = false
```

3. Ett utloggat anrop: logga in en testanvändare, logga ut (`scope=local`) och anropa
   `rec_ri_candidate_view` med den gamla tokenen. Förväntat: 4xx utan kandidatdata.
4. Sätt `hostedState: applied` med evidens och ta bort namnet ur `expectedPending`.
