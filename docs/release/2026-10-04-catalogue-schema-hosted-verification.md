# Certification catalogue, release 1: hosted verification (20270212090000, 20270213090000)

**Status 2026-10-04 ~08:46 UTC.** #410 was merged to `main` as `277cb842193650b47266650d349eef5d84fb66ad` (head
`3f824835e124af5a3a1de7503d3bf3d4a5d31362`, every mandatory CI job green on that exact head) and the official Supabase
integration applied both migrations in version order, after `20270208090000` (account erasure, #416). This record is a
read-only verification of production; nothing was written to it by the author, who also did not apply the migrations
(merging is what applies them).

## What was applied

| Version          | Name                               | Effect                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20270212090000` | `sp_catalogue_research_foundation` | Schema: four credential classes, three subject domains, three relaxed constraints on `sp_certification_definitions` / `sp_credential_definition_reviews`, `sp_certification_definition_aliases`, `sp_catalogue_research_records`, `sp_catalogue_requests`, five RPCs and one trigger function |
| `20270213090000` | `sp_catalogue_research_import`     | Data: all 170 researched records with an explicit outcome, 31 issuers, 140 definitions **inactive**, two aliases                                                                                                                                                                              |

Nothing becomes selectable: the publication (`20270214090000`) is a separate release, staged outside `supabase/migrations/`
until the application that renders the definitions is published.

## Before the merge (read-only, 2026-10-04 07:40-08:40 UTC)

The migrations were not applied, none of the new objects existed, and the objects they change matched a strict local replay
of the migrations on `main`: 77 `sp_credential_types` rows with the same per-row hash on both sides (26 active), 14
`sp_certification_definitions` (md5 `5cd7fc831c456edac4e6b6e54c6678a8`), 5 `sp_certification_issuers`
(md5 `cf26bfc275230c3de8d2b401f325c176`), the three constraints with their old definitions, `is_platform_admin` present, ledger 369
then 370 rows. A deviation there would have made the import's own postflight fail, so it was checked before merging rather than after.

## After the merge

`verify.sql` and its output (`evidence/2026-10-04-catalogue-schema/`) were run read-only on production and compared line by
line with the same query on the local replay of the exact merged tree:

- **Ledger:** 372 rows; digest `868e9c610f78ced1c5f529596ca273c2`; the first 370 rows unchanged (`538769fe5724a0d4561a645d3faf79d6`), the
  first 369 as in the earlier records. `supabase/hosted-ledger.json` carries the same 372 rows and the same digest.
- **Functions:** the five catalogue RPCs and the provenance trigger function equal the local replay by `md5(prosrc)`, all
  `SECURITY DEFINER` where the migration says so, `search_path` empty, no EXECUTE for `anon`, EXECUTE for `authenticated`.
  They include the per-holder allowance lock (`3d6bfc5f`), which production therefore carries.
- **Tables:** the three new tables have RLS enabled, `authenticated` SELECT only and no write grant for any client role, and
  their policies read `is_platform_admin(auth.uid())` (records and requests) or "the definition exists" (aliases).
- **Constraints:** abbreviation may be NULL and up to 24 characters; `not_assessed` is an admitted maintenance policy;
  insurance, risk and compliance, resilience and safety are admitted subject domains.
- **Data:** 170 research records (14 matched, 140 added, 16 retained, 0 excluded); the 14 matched all point at an existing
  definition; the 140 new definitions are all inactive, global, without jurisdiction or market pack, `allows_no_expiry`
  false and legal review pending; 36 issuers (5 + 31); 154 certification definitions (14 + 140); 217 credential types of
  which 26 active, **the same 26**; 0 requests; 0 claims reference a new code.
- **Existing rows untouched:** the 77 previous credential types, the 14 previous certification definitions and the 5 previous
  issuers are byte-identical to their fingerprints from before the apply.

## Not verified, stated plainly

- No write probe was run against production (no request was created, no decision recorded, no claim written): the access
  rules rest on the grants and policies above, on `security_passport_catalogue_research_test.sql` (122 assertions) and the
  two-session allowance race in CI, and on the strict local replay.
- The application that reads these tables (#411) is not merged or published; the registration flow is unchanged for every
  holder until it is.
- The service role holds no SELECT on the three tables in production (the migration revokes it); the administrator pages
  read them with the signed-in administrator's own session, so this is intended.
