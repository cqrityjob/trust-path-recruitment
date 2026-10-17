# 2026-10-17 — Passport delad med ansökan: sessionskrav på båda sidor

Schema-först. PR:en innehåller en migration med rollback, en SQL-svit med planterade fel,
CI-registrering, ett e2e-test och releaseunderlag. Appen ändras inte.

Bas: `main` `b219c685` (#476). Installeras efter `20270320090000`.

## Fynd (oberoende acceptans 2026-10-17, P1)

Reproducerat på en full replay med repots egen Passport-fixtur
(`sp_application_passport_test.sql`):

| Anrop med utloggad token                                   | Före                                                         | Efter                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Kandidatens lista `sp_my_application_disclosures()`        | **Svarade** med arbetsgivarnamn, delningspaket och jobbtitel | `SP_SESSION_REVOKED`        |
| Arbetsgivarens läsning `sp_application_disclosure(uuid)`   | Nekad, men bara som bieffekt (se nedan)                      | `REC_SESSION_REVOKED` först |
| Kandidatens omdelning `sp_share_passport_with_application` | Nekad av Passportens skrivvakt                               | Oförändrad                  |

Arbetsgivarens läsning räknar upp `access_count` innan payloaden returneras. Den skrivningen
utlöser Passportens skrivvakt (`sp_passport_session_write_guard`) med arbetsgivarens token och
nekar därför. Tas räknaren bort, eller flyttas efter payloaden, skulle Passportet lämnas ut.
Regeln står nu först och uttryckligen. Den gör ingen skrivning för ett nekat anrop.

## Lösning (`20270321090000_sp_application_disclosure_session`)

- `sp_application_disclosure(uuid)` får som första rad
  `IF NOT public.rec_session_active() THEN RAISE 'REC_SESSION_REVOKED'`, alltså samma regel som
  rekryteringens övriga läsningar har sedan `20270320090000`.
- `sp_my_application_disclosures()` byter språk från `sql` till `plpgsql` och anropar
  `sp_assert_passport_session()`, alltså Passportens regel för innehavaren, före `RETURN QUERY`.
  Frågan är densamma.
- Signaturer, rättigheter, kommentarer och payload ändras inte. Svaret `{"status":"none"}` till
  levande anropare ändras inte heller.

**Oförändrat med avsikt:**

- **Publik delning via giltig länk.** Den går genom `sp_get_disclosure` och
  `sp_get_disclosure_session`, som bara `service_role` kan köra och som sessionsregeln inte
  gäller för (AD5). Hela länkkedjan med QR och utloggad mottagare prövas redan i
  `e2e/passport-public-pilot-local.spec.ts` (G).
- **Alla skrivare.** `sp_share_passport_with_application`, `sp_create_*_disclosure` och
  `sp_revoke_disclosure` skyddas redan av skrivvakten på `sp_disclosures`.

**Appen** behöver ingen ändring. `readApplicationDisclosure` visar varje fel som
"unavailable", och `listMyApplicationDisclosures` visar felet.

## Tester

**SQL-sviten** `supabase/tests/sp_application_disclosure_session_test.sql` innehåller 16
påståenden och använder `sp_application_passport_test`:s fixtur:

- AD1 levande sessioner;
- AD2 arbetsgivaren utloggad: nekas av regeln, ingen åtkomst registreras;
- AD3 innehavaren utloggad: lista och omdelning nekas, delningen orörd;
- AD4 annan session, och sessionen bunden till sin användare;
- AD5 en giltig publik länk öppnas även när innehavaren är utloggad överallt, en återkallad gör
  det inte;
- AD6 oförändrade "none"-svar.

På schemat före slotten faller AD2.1. Med den hoppad faller AD3.1, som är läckan.

**Planterade fel:**

- AD NC1, arbetsgivarens regel borttagen: faller på AD2.1.
- AD NC2, innehavarens kontroll borttagen: faller på AD3.1.

Den befintliga `sp_application_passport_test` passerar på de nya kropparna (38 påståenden).

**E2E** (`e2e/recruitment-workspace.spec.ts`, "a Passport shared with an application …"):

- en syntetisk innehavare delar Passport med en ansökan;
- arbetsgivarens läsning och innehavarens lista prövas både via PostgREST och via appens
  serverfunktioner, som fångas från inloggade webbläsare;
- levande sessioner läser;
- efter lokal utloggning nekas båda tokens genom båda ingångarna, och ingen åtkomst registreras;
- andra sessioner fungerar.

**Rollback:** rollback, återapplicering och rollback i db-test, med efterkontroll. Lokalt ger
rollbacken samma md5 över alla 938 funktioner som schemat före slotten.

## Migrationsnummer och beroenden

`main` slutar på `20270320090000`. Ingen gren och ingen öppen PR har ett högre nummer, så
`20270321090000` används. Slotten installeras efter `20270320090000`, eftersom den använder
`rec_session_active()`. Den rullas tillbaka före den.

## Efter godkänd release

Läsverifiering, utan skrivning:

```sql
select position('rec_session_active' in prosrc) > 0 as employer_rule
  from pg_proc where oid = 'public.sp_application_disclosure(uuid)'::regprocedure;
select position('sp_assert_passport_session' in prosrc) > 0 as holder_rule
  from pg_proc where oid = 'public.sp_my_application_disclosures()'::regprocedure;
-- förväntat: true, true
```
