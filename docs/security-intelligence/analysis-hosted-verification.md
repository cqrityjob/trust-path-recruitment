# Analysis schema: hosted application verified

Verified read-only on 24 September 2026 after PR #289 merged as
`91c788c449d11f265be3049fc4ac87efa00d7eb5`. Its reviewed schema head was
`6d7762683fc768f90b05506a2ade1e2ced49ed3a`. Fresh main was merged normally into
the existing #290 branch; no published history or merged migration was changed.

The explicitly selected project is **CQrityjob Production**,
`wrygicdfxwjnrugduxnt`, region `eu-central-1`, ACTIVE_HEALTHY, PostgreSQL
17.6.1.166. No production migration, business write or provider activation was
performed by this verification.

## Observed contract

- A complete fresh ledger read contains **313** canonical migration identities,
  ending with `20261211090000 / security_work_analysis_contract`.
- All **29 public Security Work tables and three private helper tables** have
  RLS. Their columns/defaults, constraints, indexes, policies, triggers and
  effective API-role grants match an isolated PostgreSQL 17 replay of all 313
  merged migrations.
- All **42 public/private functions** match by identity arguments, return type,
  body digest, definer/invoker flag, pinned configuration and effective execute
  grants. None grants anonymous execution. All three private helper tables deny
  every checked privilege to anon, authenticated and service_role.
- All **three method versions and three report templates** match, including the
  exact owner-approved 25-cell RSA matrix. Only installation timestamps are
  excluded from the seed comparison; source text and version identities match.
- `sw-documents` is private, limited to **10 MiB**, and allows only PDF and DOCX.
  Both Security Work policies on `storage.objects` match the replay.
- A read-only anonymous Data API request for document IDs is refused with
  **401 / 42501**. A request using `Accept-Profile: sw_private` is refused with
  **406 / PGRST106**, naming only `public, graphql_public` as exposed schemas.
  No document or worker-key record was returned.

The [metadata query](evidence/analysis-catalog-verification.sql) is reproducible;
it reads catalog metadata and the immutable method/template seeds, never customer
analyses, documents or signing-key values. Canonical JSON uses sorted object keys,
SQL-ordered arrays, UTF-8 and compact separators. Both hosted and replay catalog
SHA-256 values are:

`149edc432f9e952a8241ce9e861af573c0eb78b6839b78972ac15b3c19530fbf`

The complete hosted ledger identity SHA-256 is:

`99243ea13ad141a13820e6d7b37edc845980b6712e5eb90d1d688aef1fa1edba`

The local browser stack contains synthetic fixtures; these are not part of the
metadata comparison. Production role behaviour has not been probed by writing
business records. Those non-vacuous tests run against isolated Auth/RLS/Storage.

## Advisors and release evidence

Security advisors report three additional **INFO** entries for RLS without
policies on `sw_private.approval_intents`, `source_write_intents` and `worker_keys`.
These are intentional deny-by-default private tables with no API-role table
grants; adding permissive policies would weaken the reviewed contract. See the
[official advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The other five advisor groups are unchanged: the existing security-definer view,
public extension placement, four anonymous and 332 authenticated executable
definer-function findings, and disabled leaked-password protection. No new
Security Work function appears in those findings. Unrelated findings are not
claimed fixed by this application delivery.

`supabase/hosted-ledger.json` records the complete fresh read;
`supabase/release-state.json` records this evidence and the applied identity.
The pending-frontier assertion is updated in the same change. The schema-first
guard itself is unchanged. Processor operation, AI approval/configuration, live
model-quality evidence and application publication are separate release facts.

The current [Supabase changelog](https://supabase.com/changelog) and
[branching/integration documentation](https://supabase.com/docs/guides/deployment/branching)
were checked; no new SDK, CLI feature or manual migration path was introduced.
