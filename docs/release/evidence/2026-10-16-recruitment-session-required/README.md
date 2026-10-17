# Underlag: 20270320090000, rekryteringens sessionskrav

## Miljö

Allt kördes lokalt i en container:

- **Databas:** PostgreSQL 17.6 (`@embedded-postgres/linux-x64`) med repots
  `supabase/tests/00_bootstrap.sql`.
- **Auth och REST:** GoTrue och PostgREST som releasebinärer, bakom en liten proxy (port 54421)
  som Supabase-klienten.
- **Data:** recruitment-workspace-fixturen med 5 050 ansökningar.
- **Nycklar:** lokala demonycklar.

## Filer

| Fil                                     | Innehåll                                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-http.mjs`                      | PostgREST-halvan av e2e-testet mot riktig GoTrue och PostgREST: aktiv session, lokal utloggning, annan session, global utloggning, ny inloggning, nekade skrivningar räknade i databasen                             |
| `http-before.txt`                       | Samma skript **före** migrationen: 14 godkända och 24 fallerade. Den utloggade tokenen läser och skriver (kommentar, kvitto)                                                                                         |
| `http-after.txt`                        | **Efter** migrationen: 38 godkända och 0 fallerade                                                                                                                                                                   |
| `bench-s.sh`                            | SQL-tid för `rec_ri_candidate_view` som inloggad ägare med `session_id` i claims (som PostgREST); ett anrop per transaktion                                                                                          |
| `sql-before-ms.txt`, `sql-after-ms.txt` | 20 + 20 körningar omväxlande: databas med `20270319090000` mot samma med `20270320090000`                                                                                                                            |
| `api-before-ms.tsv`, `api-after-ms.tsv` | API-kedjan i `listRecruitmentCandidatesPage` (`../2026-10-16-candidate-view-shared-permissions/api-chain.mjs`), 10 rundor × 2 anrop. Varje runda: rollback, mät, applicera, mät. Kolumner: total, auth, fas 1, fas 2 |
| `api-*-pre475-body-ms.tsv`              | Samma mätning av misstag mot kandidatvyns kropp från **före** #475. Kontrollen hamnar då per ansökan (2 091 ms mot 3 928 ms). Det är skälet till installationsordningen                                              |

Statistiken togs fram med `../2026-10-16-candidate-view-shared-permissions/stats.cjs`
(n, median, min, max, p95 som nearest-rank, IQR).

## Rollbackens identitet

Två databaser jämfördes:

- full replay av de första 398 filerna;
- full replay av alla 399 filer följd av rollbacken.

| Databas              | Funktioner (definition, ACL, kommentar), md5 | Antal | Policyer, md5                      | Antal |
| -------------------- | -------------------------------------------- | ----: | ---------------------------------- | ----: |
| 398 filer            | `37c84413a2b4abef318ae4923cd4fc05`           |   936 | `1729c7b33551a5092f9b2ed96c9e36a8` |   623 |
| 399 filer + rollback | `37c84413a2b4abef318ae4923cd4fc05`           |   936 | `1729c7b33551a5092f9b2ed96c9e36a8` |   623 |
| 399 filer            | `fb97728d269920e01efb7dc94dcd0c5d`           |   938 | `e57bb6dddd28b806ed102bce85fcec5b` |   635 |
