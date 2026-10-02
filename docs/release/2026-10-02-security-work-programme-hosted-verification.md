# Security Work programme schema contract: hosted verification

**Status: APPLIED and verified on production** (`wrygicdfxwjnrugduxnt`, 2026-10-02 19:41 UTC).

| Change                                                                                                                                                   | Migration                                | PR   | Merge     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---- | --------- |
| Security Work programme schema (mandates, protected assets, risk-asset links, baseline, gaps, evidence links, AI suggestions, plans, management reports) | `20270117090000_security_work_programme` | #376 | `1611135` |

The application half follows in #372 once this record is on main.

## Ledger

`supabase_migrations.schema_migrations` has 351 rows (read 2026-10-02 19:41 UTC).
The md5 of `version:name`, joined by newline, is
`d51e277eb053ef50833765ebb9f751b0`, equal to `supabase/hosted-ledger.json`.
The first 350 rows still have their previous digest,
`29249f9a262f9f33b0139403caa3293d`. Exactly one row is new. Nothing is pending.

## Method

Every function body was compared as `md5(prosrc)` with the local replay of the
merged migration file. The behavioural probe ran inside a `DO` block that ended
in `RAISE EXCEPTION`, so all of it rolled back. It impersonated a signed-in user
who is a member of no workspace through `request.jwt.claims` and `SET LOCAL ROLE
authenticated`, then `anon`, and reported only counts and SQLSTATEs. No personal
data was read out, and nothing was written.

## 20270117090000 security_work_programme (#376, merge 1611135) — verified 2026-10-02 19:41 UTC

- schema_migrations: 20270117090000 / security_work_programme present (applied within minutes of the merge).
- md5(string_agg(proname:md5(prosrc))) over `sw_private.guard_action_approval`, `guard_lifecycle`, `guard_programme` = `7989859578517253de320241dbdb8071` = local replay (guard_lifecycle `0db95160…`, guard_programme `9fe70073…`, guard_action_approval `64683367…`). `guard_lifecycle` carries the one lifecycle change (`NEW.assessment_id IS NOT NULL AND NOT EXISTS`).
- The ten programme tables exist, all with `relrowsecurity`; md5 over their policies' `qual|with_check` = `30535b523cbfba479ec887061e4478d3` = local replay; 23 non-internal triggers (guard, audit, programme).
- `sw_risks.assessment_id` and `sw_actions.assessment_id` nullable; `owner_id`, `threat_scenario`, `source_kind`, `gap_id`, `asset_id`, `approval_required`, `approval_note` present as merged.
- anon and service_role hold no table privilege on the ten tables; authenticated cannot EXECUTE `guard_programme()` or `guard_action_approval()`; both pin `search_path`.
- Data: `sw_risks` and `sw_actions` hold 0 rows in production (nothing to repair).
- Rolled-back probe as a signed-in non-member: 0 rows readable across five programme tables; INSERT into `sw_protected_assets` refused `42501 SW_HUMAN_REQUIRED`; a suggestion inserted as `approved` refused `42501 SW_HUMAN_REQUIRED`; anon SELECT refused `42501 permission denied`. PROBE_ROLLED_BACK; no hosted write.
