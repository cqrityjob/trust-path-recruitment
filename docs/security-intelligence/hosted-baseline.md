# Hosted baseline — read-only, 2026-09-23

Project: **CQrityjob Production**, `wrygicdfxwjnrugduxnt`, PostgreSQL 17.6.1.166. Repository baseline: `bb4e849b43960f9c82907e08965e51c57a9a3261` (PR #286 merge).

The official Supabase integration has applied `20261209090000_recruitment_assignment_idempotency`; it follows `20261208090000_recruitment_workspace_backstops` and `20261207090000_recruitment_workspace`. The repository's prior pending entry was stale. This change records observed application; it neither applies nor reapplies anything.

Verified through read-only Supabase management SQL:

| Evidence                                                                                 | Result                                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --- | --- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Hosted migration rows                                                                    | 311                                                                                     |
| `md5(string_agg(version                                                                  |                                                                                         | ':' |     | name, ',' ORDER BY version))` before 20261209 | `3fdf4db1bf66da6bea6873734b5cc193` — matches prior committed 310-row snapshot |
| Same digest, all 311 rows                                                                | `fc07f5a186da2fe68c95fbe0cb07675c` — matches updated snapshot                           |
| `scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)` body md5 | `63cd0684c152b137c065d2be3dfbe6bb` — byte-identical to the body in the merged migration |
| Assignment function privileges                                                           | authenticated EXECUTE true; anon false; SECURITY DEFINER; pinned `public, pg_temp`      |
| Serialisation/idempotency body present                                                   | true                                                                                    |
| `to_regclass('public.sw_workspaces')`                                                    | null — Security Work foundation not deployed                                            |
| Existing `scp_interview_ai_config.ai_enabled`                                            | false — not a Security Work activation                                                  |

No business rows were read for discovery, and no data, configuration, grant, secret, provider, migration or production deployment was changed. No hosted test account was created. No live AI request was made.

## Security advisors

The hosted security advisor was read at 19:43 UTC, before the new schema exists. Six groups were returned; these are the baseline, not findings introduced by this PR:

| Group                                     | Level | Count                                    |
| ----------------------------------------- | ----- | ---------------------------------------- |
| RLS enabled without policy                | INFO  | 15                                       |
| Security definer view                     | ERROR | 1 (`public.scp_scoring_version_lineage`) |
| Extension in public                       | WARN  | 1                                        |
| Anonymous-executable security definer     | WARN  | 4                                        |
| Authenticated-executable security definer | WARN  | 332                                      |
| Leaked-password protection                | WARN  | 1                                        |

The existing [security-definer-view finding](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) remains outside this PR. Hosted advisors must run again **after** the owner applies A; a pre-application hosted scan cannot certify objects that do not yet exist. Local database tests inspect every new table's RLS/grants and every helper's privileges/search path.
