# Mätunderlag: kandidatläsningen före och efter 20270319090000

Råutdata och skripten som tog fram dem. Sammanställningen finns i
[`docs/release/2026-10-16-candidate-view-shared-permissions.md`](../../2026-10-16-candidate-view-shared-permissions.md).

## Miljö

- Bas: `main` `5763e452` (#473 inräknad), 397 migrationer; efter: samma plus `20270319090000`.
- PostgreSQL 17.6 (lokal, isolerad, loopback, port 5417), 4 vCPU Intel Xeon 2,8 GHz, 15 GB RAM.
  `track_functions = all` på servern; `fsync` av (påverkar inte läsningar).
- Riktig Supabase Auth (GoTrue v2.177.0) och PostgREST 12.2.3 framför samma databas. Det är
  samma PostgREST-version som i reproduktionen i
  `docs/passport/talent-discovery/review-2026-10-15/recruitment-5050-race.txt`.
- Fixturen `scripts/fixtures/recruitment-workspace-fixture.sql`: 5 050 ansökningar på
  "Väktare, Norrköping" plus 32 på Uppsala.
- `auth.uid()` och `auth.role()` har Supabase-produktionens kroppar (`supabase-auth-uid.sql`).
  De läser `request.jwt.claims` som PostgREST sätter, så varje anrop tolkar claims precis som
  på den hostade databasen. `auth-columns.sql` lägger till de GoTrue-kolumner som fixturen
  skriver och som repots minimala `auth.users`-stub saknar. Bägge gäller bara mätdatabasen,
  inte repot.

## Hur mätningen gjordes

Alla mätningar gjordes som den inloggade ägaren Anna
(`d016a3c5-f43b-4452-aabc-1ff7f7d3672c`). En mätning som administratör eller med förbikopplad
RLS ingår inte.

- `bench.sh DB RUNS USER`: varje körning är en egen transaktion med samma form som en
  PostgREST-förfrågan, alltså `SET LOCAL ROLE authenticated` och `request.jwt.claims`. Den
  använder appens egna argument (`viewArgs` med standardvyn, sida 1, 25 rader) och mäter med
  `EXPLAIN (ANALYZE)` Execution Time.
- `profile.sh DB USER`: samma anrop med `EXPLAIN (ANALYZE, BUFFERS)`, `auto_explain` för de
  nästlade satserna och transaktionens egen funktionsstatistik
  (`pg_stat_xact_user_functions`). Resultatet finns i `profile-before.txt` och
  `profile-after.txt`.
- `api-chain.mjs RUNS`: kedjan i `listRecruitmentCandidatesPage` över HTTP mot riktig Auth
  och PostgREST:
  1. GoTrue `/user` (sessionskontrollen i `getClaims` för en HS256-token)
  2. `requireMember`
  3. fas 1: RPC:n och frågorna
  4. fas 2: svar, kommentarer och meddelanden för sidans id:n, plus teamet

  Kolumnerna är totaltid, auth, fas 1 och fas 2. Själva appservern startades inte lokalt,
  eftersom paketinstallationen inte var tillåten i sessionen. Appens egen tid mäts i CI av
  `e2e/recruitment-workspace.spec.ts`, som skriver ut median, min och max för 7 anrop.

- Mätningarna gjordes omväxlande före och efter:
  - **SQL:** fyra omgångar med 5 körningar mot `rec_before` och 5 mot `rec_after`, alltså
    samma databas utan och med migrationen.
  - **API:** två omgångar med migrationen applicerad och sedan rullad tillbaka på den levande
    stacken, 10 körningar var.
- `stats.cjs` beräknar median, min, max, p95 (nearest-rank) och IQR.

| Fil                          | Innehåll                                             |
| ---------------------------- | ---------------------------------------------------- |
| `sql-before-baseline-ms.txt` | 20 körningar på basversionen, före all annan mätning |
| `api-before-baseline-ms.tsv` | 20 körningar av API-kedjan på basversionen           |
| `sql-before-ms.txt`          | 20 omväxlande körningar före                         |
| `sql-after-ms.txt`           | 20 omväxlande körningar efter                        |
| `api-before-ms.tsv`          | 20 omväxlande körningar av API-kedjan före           |
| `api-after-ms.tsv`           | 20 omväxlande körningar av API-kedjan efter          |
| `profile-before.txt`         | plan och funktionsprofil före                        |
| `profile-after.txt`          | plan och funktionsprofil efter                       |
