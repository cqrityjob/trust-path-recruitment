# Security Passport Network statistics — hosted verification

Migration `20261227090000_sp_network_statistics.sql` (PR #345, merged as `1c0fd8e`,
approved head `f073fce`) was applied to the owner production project
`wrygicdfxwjnrugduxnt` by the official Supabase GitHub integration.

Verified **read-only** through the Supabase connector on 2026-10-01 13:06 UTC.
Nothing was applied, changed or written by this verification.

## Ledger

`supabase_migrations.schema_migrations` holds `20261227090000 / sp_network_statistics`
as its 330th and highest row. `supabase/hosted-ledger.json` was refreshed to all 330
rows; the md5 of `version:name` joined by newline,
`d628b215c6fb12e31848b850eac03e24`, is equal on the connector read and on the
committed file, so the 329 earlier rows are unchanged.

## Objects against the merged migration

| Check | Hosted |
|---|---|
| `sp_network_stats_policy`, `sp_statistics_exclusions` exist | yes |
| RLS enabled / policies on both | enabled / **0 policies** |
| `anon`, `authenticated` privileges on both | none |
| `service_role` on the policy table | SELECT, UPDATE |
| `service_role` on the exclusions table | SELECT, INSERT (no DELETE — Phase 8 rule) |
| Policy row | `singleton=true`, `display='hidden'`, `min_group_size=5` |
| CHECKs | `display IN (hidden, passport_page, public)`, `min_group_size >= 5`, singleton, note length |
| Exclusions rows | 0 |
| `sp_network_stats()` | SECURITY DEFINER, `search_path=public`, STABLE; EXECUTE for anon, authenticated, service_role (the one reviewed anon read) |
| `sp_set_network_stats_display(text,text)` | SECURITY DEFINER, `search_path=public`; **not** executable by anon |
| Function bodies | md5 `49f4cf6204e44e9345e886aa74ebfba7` and `77cfdb5b8bd48c9e137c23d69ea984d9`, **equal** to the bodies in the merged file |
| Passport tables | `anon` has no SELECT on `sp_passport_profiles` / `sp_claims`; 4 and 4 policies, unchanged |
| `SELECT public.sp_network_stats()` | `{"display":"hidden"}` — no number |

## State and next step

The statistics remain **hidden**: nothing is shown anywhere, and the function
publishes no number until a platform admin runs
`sp_set_network_stats_display(...)`. The homepage and Passport-page UI that
calls the function follows in a second PR (schema-first-release rule); it is not
part of this record.

Audit of production data before the change (counts only): 4 Passport profile
rows, 2 completed, and both completed Passports belong to staff accounts, so the
real, non-staff count is 0 today.
