# Hosted verification — 20261222090000 (CI-01), 20261224090000 (JB-01) and 20261225090000 (AS-01)

**Read-only.** Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, 2026-09-29, each read taken right after its PR merged to `main` and the official Supabase GitHub integration applied the migration. No hosted write, no behavioural probe. Merges were made by the release session under the owner's authorisation of 2026-09-29, in the owner's order #322 → #324 → #325, one at a time on green CI.

## 20261222090000_cd_access_policy (CI-01, #322)

Read-only verification 2026-09-29T09:26:33Z through the Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, after PR #322 merged to `main` as `76bd20b` (09:16 UTC) and the official Supabase GitHub integration applied it.

| check | result |
|---|---|
| `supabase_migrations.schema_migrations` row | version `20261222090000`, name `cd_access_policy`, 19 statements; ledger now 326 rows (digest `1ce1efa75d3c8e69c097b5f3982e193c`) |
| `public.cd_access_policy` | exists, RLS on, zero policies; `authenticated` and `anon` have neither SELECT nor UPDATE |
| `cd_access_state()` | SECURITY DEFINER, `search_path=public`; md5(prosrc) `c97f4009f966d9e058786e2581d3b823` = local replay; executable by anon, authenticated, service_role (the reviewed fifth anon-executable definer) |
| `cd_v31_may_start(uuid)` | SECURITY DEFINER, `search_path=public`; md5 `e43d218e357086825f8db1809229f2ff` = local replay; anon cannot execute |
| `cd_set_access_state(text,text)` | SECURITY DEFINER, `search_path=public`; md5 `a731c7f4c11af2df1afdcfee89c1ebff` = local replay; anon cannot execute |
| state | exactly one policy row, `internal_test`; `cd_access_state()` returns `internal_test`; `cd_internal_testers` still 0 rows |

Applying it changed nobody's access. No hosted write was issued.

## 20261224090000_candidate_application_context (JB-01, #324)

Read-only verification 2026-09-29T09:46:12Z through the Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, after PR #324 merged to `main` as `c195732` (09:36 UTC) and the official Supabase GitHub integration applied it.

| check | result |
|---|---|
| `supabase_migrations.schema_migrations` row | version `20261224090000`, name `candidate_application_context`, 5 statements; ledger 327 rows at read time (digest `70bff3d121bcba1f2bb636ffe2e71a15`) |
| `rec_my_application_context()` | exists, SECURITY DEFINER, `search_path=public, pg_temp`; md5(prosrc) `571502bd7e894dffe175d8e8c800bd7a` = local replay of the merged file; executable by authenticated and service_role, **not** by anon |
| public policies untouched | `jobs` 6 policies (digest `5809431221401174c8e2c546c87c939c`), `employers` 4 (`9d7f5ba8cf92c1054eefdd83f28d78a0`), `job_applications` 5 (`bbd3d098af9d3f5ca710498b7508b383`): all three digests equal the local replay, so no policy changed |

No table, policy or row changed; no application code reads the function until #328. No hosted write was issued.

## 20261225090000_assessment_assign_requires_open_application (AS-01, #325)

Read-only verification 2026-09-29T10:05:32Z through the Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, after PR #325 merged to `main` as `5a9a3ec` (09:55 UTC) and the official Supabase GitHub integration applied it.

| check | result |
|---|---|
| `supabase_migrations.schema_migrations` row | version `20261225090000`, name `assessment_assign_requires_open_application`, 4 statements; the 328th and highest row |
| `scp_employer_assign(...)` | exactly one definition; SECURITY DEFINER, `search_path=public, pg_temp`; md5(prosrc) `0f4e39961655ab00fc9e1aef10e83842` = local replay of the merged file (the pre-migration body on `main` before #325 was `63cd0684c152b137c065d2be3dfbe6bb`); the body carries both refusals `SCP_APPLICATION_NOT_OPEN` and `SCP_RECRUITMENT_COMPLETED` |
| grants | unchanged: authenticated may execute; anon and service_role may not, exactly as on the local pre-migration replay |

Nothing already sent changes; the application half in the same PR works against the old body too, so the order of publish and apply does not matter here. No hosted write was issued.

## Ledger snapshot

`supabase/hosted-ledger.json` refreshed whole at 2026-09-29T10:05:44Z: 328 rows, digest of `version:name` `91502ba5606b0d18375ad8e0ec77d49c` on the connector read and on the file. All 325 previous identities preserved; the three new rows are the ones above. `scripts/release-frontier-check.ts` now expects nothing pending.

## What this unblocks

- #327 (Career Discovery application half) and #328 (application-history application half): `schema-first-release:check` passes once each carries this record from `main`.
- Opening Career Discovery is still an owner action (`cd_set_access_state('public', …)` or tester grants); the hosted state is `internal_test`.
