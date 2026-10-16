# 2026-10-16 — Kandidatlistan bedömer behörigheten en gång per läsning: schemasteg

Schema-först. Denna PR innehåller en migration, dess rollback, en SQL-svit, CI-registrering,
ett e2e-test och dokumentation. Ingen app-PR behövs, eftersom kontraktet inte ändras:
`rec_ri_candidate_view` behåller signatur, rättigheter, svarsfält, filter, sortering,
sidindelning, totalantal och avvisningar. Den körande appen fungerar oförändrad med både den
gamla och den nya kroppen.

Bas: `main` `5763e452`, där #473 redan ligger. Migrationen ska installeras efter
`20270318090000`.

## Grundorsak

`listRecruitmentCandidatesPage` läser sida, totalantal och räkningar från en enda RPC,
`rec_ri_candidate_view` (`20270308090000`). Funktionens `MATERIALIZED`-bas anropade
`public.rec_can_manage(a.job_id)` för **varje ansökan** i tjänsten. Varje sådant anrop körde
om:

- `rec_is_member`, det vill säga `has_employer_role` och `employer_is_active_status`;
- `has_employer_role(owner/admin)`;
- uppslaget av ansvarig rekryterare.

För en anropare, en organisation och en tjänst kan svaret ändå inte skilja sig mellan raderna.

Mätt som inloggad ägare (rollen `authenticated`, `request.jwt.claims`, appens egna argument,
PostgreSQL 17.6) på fixturen med 5 050 ansökningar:

| Funktion                                   | Anrop före | Tid före (ms) | Anrop efter | Tid efter (ms) |
| ------------------------------------------ | ---------: | ------------: | ----------: | -------------: |
| `rec_ri_candidate_view`, totalt            |          1 |         2 435 |           1 |          1 031 |
| `rec_can_manage`                           |      5 050 |         1 433 |       **0** |              – |
| `rec_is_member`                            |      5 051 |           970 |       **1** |            4,5 |
| `has_employer_role`                        |     10 101 |           760 |       **2** |            2,5 |
| `employer_is_active_status`                |      5 051 |           176 |       **1** |            1,3 |
| `recruiter_intelligence.application_state` |      5 050 |           848 |       5 050 |            775 |

Funktionsprofilen har overhead från `track_functions` och `auto_explain`. Rena tider finns
under Mätningar. Planen före och efter ligger i
[`evidence/2026-10-16-candidate-view-shared-permissions/`](evidence/2026-10-16-candidate-view-shared-permissions/README.md).
Buffer-träffarna sjunker från 169 588 till 129 084. `CTE manage` körs en gång (`loops=1`),
och basens nästlade loop läser den en gång per tjänst.

## Lösning

Bara beräkningen av `can_manage` ändras:

- **Medlemskapet** kontrolleras som förut, först och oförändrat (`rec_is_member`,
  `RECRUITMENT_NOT_PERMITTED`).
- **Ägare eller admin** läses en gång per anrop till en PL/pgSQL-variabel, efter
  medlemskontrollen. En tilldelning utvärderas exakt en gång. En CTE ensam lovar inte det,
  och profilen ovan bekräftar det.
- **Ansvarig rekryterare** läses en gång per tjänst i en `MATERIALIZED` CTE som kopplas till
  tjänstens ansökningar.
- **En tjänst som tillhör en annan organisation** än `_employer_id` får fortfarande hela
  `rec_can_manage(job)`. Ansökningsvägen stämplar tjänstens organisation, men inget data
  antas: en sådan rad bedöms som förut (CV6.1).
- **Allt som beror på raden** stannar per rad: `application_state`, bokning, öppet test och
  svarsfilter.
- **Ögonblicksbilden** är densamma. Funktionen är `STABLE`, så medlemskontrollen och
  läsningen delar anropande sats, precis som anropen per rad gjorde.
- **Ingen cache.** Varje anrop läser medlemskap, roll och ansvar på nytt.

Det kvarvarande arbetet är `application_state` per ansökan, som beror på raden.
Kravbedömningen ändras inte här.

## Mätningar

Mätningarna gjordes före och efter under samma förutsättningar och omväxlande, se
[`evidence/…/README.md`](evidence/2026-10-16-candidate-view-shared-permissions/README.md) för
miljö och metod.

| Mätning (5 050 ansökningar, inloggad ägare)                                |   n | Median före | Median efter | Min–max före | Min–max efter | p95 före | p95 efter |
| -------------------------------------------------------------------------- | --: | ----------: | -----------: | -----------: | ------------: | -------: | --------: |
| SQL, `rec_ri_candidate_view` (PG17.6)                                      |  20 |    2 410 ms |       747 ms |  2 167–2 898 |       710–898 |    2 748 |       892 |
| API-kedjan i `listRecruitmentCandidatesPage` mot riktig Auth och PostgREST |  20 |    2 666 ms |       806 ms |  2 437–2 988 |       738–962 |    2 985 |       895 |

Basmätningen före allt annat (20 körningar) gav SQL-median 2 409 ms och API-median 2 679 ms.
Det stämmer med den omväxlande mätningen.

Appens egen tid i CI, i samma workflow (Recruitment workspace, Supabase CLI 2.117 med riktig
GoTrue och PostgREST), mätt på `listRecruitmentCandidatesPage` med 5 050 ansökningar, 5 anrop per
körning:

| Körning                                                                                                                                     |   n |   Median | Min–max (ms) |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --: | -------: | -----------: |
| Före: `41209160`, `main`:s funktion ([jobb](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/38856358538/job/116828596591)) |   5 | 2 862 ms |  2 785–3 027 |
| Efter: `58ff817b` ([jobb](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/38857091040/job/116830895153))                   |   5 |   523 ms |      509–536 |

Hela e2e-testet "5 050 applications …" tog 26,0 s före och 10,7 s efter.

## Åtkomsten är oförändrad: tester

**SQL-sviten** `supabase/tests/rec_candidate_view_shared_permissions_test.sql` innehåller 32
påståenden och är registrerad i `scripts/db-test.sh`:

- **CV1–CV2:** ägare, admin och ansvarig rekryterare läser och får hantera rätt rader;
  ansvarig rekryterare bara sin tjänst. En vanlig medlem läser samma population utan att få
  hantera.
- **CV3:** borttagen, avstängd och inbjuden medlem nekas med samma fel, liksom ägaren av en
  inaktiv organisation, företag B:s ägare (också med A:s tjänst under B:s id), en utomstående
  och anrop utan användare. `anon` saknar EXECUTE.
- **CV4:** filter, sortering, sidor (disjunkta, klämning bortom sista sidan), grannar,
  totalantal och räkningar, med explicita tal.
- **CV5:** gammalt = nytt. 11 personer × 28 vyer ger hela svaret eller felet, jämfört med
  rollbackens `20270308090000`-kropp, som laddas som `rec_cv_reference.candidate_view`.
- **CV6:** en ansökan under en annan organisation än tjänstens.
- **CV7:** ingen cache. Rolländring, nytt ansvar, borttaget medlemskap och avstängd
  organisation gäller från nästa anrop, i båda kropparna.
- **CV8:** en återkallad session. Databasläsningen är oförändrad av denna slot, som inte
  rör någon sessionsregel. Funktionen har aldrig läst `auth.sessions`.
- **CV9:** regressionsskyddet. De gemensamma kontrollerna körs ett fast antal gånger
  (`rec_can_manage` 0, `rec_is_member` 1, `has_employer_role` 2,
  `employer_is_active_status` 1), med samma antal för 60 och 120 ansökningar. Referensen ökar
  med raderna (60, sedan 120).

**Planterade fel** (CV NC1–NC4) fäller sviten på det namngivna påståendet:

- NC1, ansvarsdelen borttagen: CV1.3.
- NC2, kontrollen per rad återinförd: CV9.1.
- NC3, medlemskontrollen borttagen: CV3.1.
- NC4, varje medlem räknas som admin: CV1.3.

**P1-oraklet** (100 ansökningar) körs också mot den nya kroppen innan slotten avvecklas.

**Rollback:** `supabase/rollback/20270319090000_rec_candidate_view_shared_permissions_rollback.sql`
återställer `20270308090000`-kroppen ordagrant med samma rättigheter. Slotten lagrar inget,
så rollbacken vägrar aldrig. I db-test körs rollback, återapplicering och rollback igen.
Efterkontrollen bekräftar kroppen, SECURITY DEFINER, EXECUTE och att referensen är borta.

**E2E-testet** `e2e/recruitment-workspace.spec.ts` testar över riktig Auth och PostgREST:
"the candidate read over real Auth: one population for every role, nothing for anyone else,
judged afresh on every call".

- Ägare och medlem får samma rader, ordning och räkningar. Företag B, en kandidat och anon
  nekas.
- En syntetisk person blir i tur och ordning medlem, admin, ansvarig och borttagen. Varje
  ändring gäller från nästa anrop, både via PostgREST och via appens egen
  `listRecruitmentCandidatesPage`.
- Efter utloggning har Auth avslutat sessionen (`/auth/v1/user` nekar). Vad appens läsning
  och PostgREST därefter svarar på den ännu giltiga token registreras på båda sidor. Det
  påstås inte, se "Befintlig iakttagelse" nedan.
- Testet pushades före migrationen, så CI visar att det gäller även på den gamla kroppen.

## Verifierat lokalt

- **Full replay** av 398 filer på PostgreSQL 17.6 med repots bootstrap, strikt.
- **db-test.sh-blocket**, isolerat på samma replay:
  - 32 + 32 påståenden;
  - NC1–NC4;
  - 95 P1-påståenden på den nya kroppen;
  - avveckling med återapplicering.
- **Repots kontroller:** `migrations:check`, `migrations-duplicate:check`,
  `release-parity:check`, `release-frontier:check`, `deploy-plan:check`,
  `deploy-plan-negative:check` och `schema-first-release:check`.

## Befintlig iakttagelse, utanför uppdraget

CI-körningen på basversionen (`148d4115`, `main`:s funktion) visade att appens
`listRecruitmentCandidatesPage` fortfarande svarade med kandidatdata på en utloggad användares
ännu giltiga access-token. På CI-stacken verifierar `getClaims` token lokalt utan att fråga Auth
om sessionen. Lokalt, med en HS256-token, nekade `/auth/v1/user` efter utloggningen (403),
men ett direkt PostgREST-anrop till `rec_ri_candidate_view` med samma token svarade 200.

Passporten har en databasregel för detta (`sp_assert_passport_session`), men rekryteringens
läsningar har ingen. Detta är `main`:s beteende före och efter denna slot, och slotten ändrar
det inte. Att införa en sessionsregel är en säkerhetsändring med egen release och föreslås
som separat uppgift.

## Migrationsnummer

Repot har ingen reservationsfil. Slots samordnas enligt `docs/release/release-sequence.md`
("next canonical slot") och CI-spärrarna `migrations:check` och
`migrations-duplicate:check`. Den 2026-10-16 hade varken `main` (fronten `20270318090000`,
hostad ledger med 397 rader), någon fjärrgren eller någon öppen PR en migration över
`20270318090000`. Därför används `20270319090000`. Om en annan ström hinner före med samma
nummer flyttas denna fil till nästa lediga slot. Bara versionen och dess referenser ändras.

## Efter merge (releaseansvarig)

1. Supabase GitHub-integrationen applicerar `20270319090000`.
2. Läsverifiering på produktion, utan skrivning:

```sql
select version, name from supabase_migrations.schema_migrations where version = '20270319090000';
select position('rec_can_manage(a.job_id)' in prosrc) = 0 as per_job, prosecdef,
       has_function_privilege('anon', oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated
  from pg_proc where oid = 'public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)'::regprocedure;
-- förväntat: per_job = true, prosecdef = true, anon = false, authenticated = true
```

3. Sätt `hostedState: applied` med evidens och ta bort namnet ur `expectedPending`.
