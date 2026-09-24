# PR A hosted application — read-only verification

Verified 2026-09-24, before PR B application implementation. PR #287 was merged at
04:20:20 UTC as `14e25672551657a7cafb67870fb7a28ac47a05c9`; its reviewed head was
`3c8b88bcb08cab21ec1c59d4e4ea125b38a48be2`. Fresh `origin/main` is the merge commit,
and the unchanged foundation migration in that tree is the comparison source.

Explicit project: **CQrityjob Production**, `wrygicdfxwjnrugduxnt`, eu-central-1,
ACTIVE_HEALTHY, PostgreSQL 17.6.1.166. No business records were read or written.

## Observed hosted state

- Full migration ledger re-read: **312** identities, newest
  `20261210090000 / security_work_foundation`, 52 stored statements,
  `md5(array_to_string(statements, E'\n')) = a3a6bf7486736d74954a149270df21ed`.
- **16/16 `sw_*` tables have RLS**. All columns/defaults, constraints, policies,
  trigger definitions and role grants match the isolated PostgreSQL 16 replay.
- All **11 function bodies**, identity arguments, results, definer flags,
  pinned `search_path` settings and effective execution grants match replay.
- The public bootstrap is SECURITY INVOKER: authenticated execute true;
  PUBLIC, anon and service_role execute false. Private predicates/bootstrap
  have only their reviewed authenticated grants; trigger functions are not
  executable by API roles. No anonymous or service_role table grants exist.
- A read-only Data API request with `Accept-Profile: sw_private` returned
  **HTTP 406 / PGRST106**: only `public, graphql_public` are exposed. No private
  helper was called. SQL session settings alone were null and were not treated
  as proof of API configuration.
- Security advisors: the same six groups and counts as before #287:
  `rls_enabled_no_policy` INFO 15; `security_definer_view` ERROR 1;
  `extension_in_public` WARN 1; anon definer execute WARN 4;
  authenticated definer execute WARN 332; leaked-password protection WARN 1.
  No Security Work object appears in a finding. The existing view error is
  `public.scp_scoring_version_lineage` and is outside this change.

Catalog comparison uses sorted JSON keys with array order fixed in SQL. Its
SHA-256 is `8dc2ffc389493b87707f9aa6687d0122396c86870aa40b80a33ae473480151b0`
for **both** hosted and replay catalogs. Full ledger identity SHA-256 is
`14ba51cf5c54bb5cb512ed3b347d86348b7e484506a0b6e7d0c26de6a4ea0865`.
The reproducible metadata-only query is in
[evidence/catalog-verification.sql](evidence/catalog-verification.sql).

`release-state.json` now records applied evidence, `hosted-ledger.json` contains
the complete fresh read, and `expectedPending` is empty. Executed
`release-parity:gate`, `deploy-plan:gate` and `release-frontier:check`: PASS;
the next migration plan is empty. No migration was re-sent or manually applied.

## Current documentation checked

The official [Supabase changelog](https://supabase.com/changelog) and
[Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
were checked. Explicit grants and RLS remain required, independently of schema
exposure, as described in [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).
No new SDK, provider, secret, schedule or automatic collection is introduced.
