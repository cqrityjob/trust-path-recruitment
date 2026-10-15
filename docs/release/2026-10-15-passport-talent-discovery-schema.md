# 2026-10-15 — Passport-slutförande och talangsökning: schemasteg

Schema-först. Denna PR innehåller bara migrationer, rollback, SQL-sviter, CI-registrering
och dokumentation. Applikationskoden kommer i en separat PR som kan mergas först när
migrationerna är applicerade och verifierade på `wrygicdfxwjnrugduxnt` och
`supabase/release-state.json` säger `applied` med evidens.

## Migrationer, i ordning

| #   | Fil                                                      | Innehåll                                                                                                                                                                                 | Rollback                                                                                                     |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `20270316090000_sp_review_reply_history_and_notices.sql` | Ärendebundet textsvar på komplettering, meddelande per beslut, entydig aktuell granskningsstatus och historik, inkorg/mejl-outbox, mätning. `sp_verifier_decide` byts med samma signatur | Vägrar om svar, beslutsmeddelanden eller notiser finns; återställer `sp_verifier_decide` till 20270125090000 |
| 2   | `20270317090000_sp_talent_discovery.sql`                 | Frivillig sökbarhet (avstängd från början), urval, preferenser, spärrar, samtyckeshistorik, den enda kortbyggaren                                                                        | Vägrar om någon öppnat inställningen                                                                         |
| 3   | `20270318090000_rec_talent_search_and_contact.sql`       | Katalogbundna kriterier för bekräftad kravprofil, sökning, profil, kontaktförfrågan                                                                                                      | Vägrar om kontakter eller kriterier finns; återställer notisfunktionerna                                     |

Kontrakt: [`docs/passport/talent-discovery/talent-search-contract.md`](../passport/talent-discovery/talent-search-contract.md).

## Verifierat lokalt

- Full replay (397 filer) på PostgreSQL 16, strikt.
- `supabase/tests/sp_review_reply_history_and_notices_test.sql` — 53 påståenden.
- `supabase/tests/sp_talent_discovery_test.sql` — 33 påståenden.
- `supabase/tests/rec_talent_search_and_contact_test.sql` — 75 påståenden.
- Fem planterade negativa kontroller (TD NC1–NC5) som var och en får sviten att fallera på
  det namngivna påståendet.
- De tre rollbackarna vägrar inspelad data (sviternas egna fixturer) och står sedan ner rent.
- Rollback → återapplicering → postflight grön.

## Efter merge (releaseansvarig)

1. Supabase GitHub-integrationen applicerar 1–3 i ordning.
2. Läsverifiering på produktion (ingen skrivning):

```sql
-- ledgern
select version, name from supabase_migrations.schema_migrations
 where version in ('20270316090000','20270317090000','20270318090000') order by 1;
-- inga sökbara personer skapade av migrationen
select count(*) from public.sp_talent_profiles;            -- 0
-- grants
select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
  from pg_proc p where p.proname like any (array['sp_talent_%','rec_talent_%','user_notices_%','sp_reply_to_clarification','sp_review_thread','sp_entry_review_state']);
-- förväntat: anon = false på alla
select has_function_privilege('authenticated','public.user_notices_claim_emails(integer)','EXECUTE'); -- false
```

3. Sätt `hostedState: applied` med evidens för de tre posterna.
4. Därefter kan applikations-PR:en mergas.
