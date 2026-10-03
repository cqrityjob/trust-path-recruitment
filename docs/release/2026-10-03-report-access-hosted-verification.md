# Report access migrations: hosted verification (2026-10-03)

Read-only. No production write was made by the author of this record and no write probe was run. Counts,
names, hashes and policy definitions only; no candidate data was read.

## What happened

PR #396 merged to `main` as `2b5015d` (head `e7b5a3d`, every mandatory CI job green; owner decision recorded: ordinary
membership alone gives no report access, nobody is given reviewer access automatically). The official Supabase
integration applied, in version order:

| Version | Name |
|---|---|
| `20270202090000` | `employer_membership_standing_not_bypassable` |
| `20270203090000` | `employer_report_access_model` |
| `20270204090000` | `interview_case_access_model` |

## Before (read ~15:50-16:20 UTC)

The six pinned bodies equalled the release note: `approve_access_request` `91ce1c85…`, `scp_iv_can_read_case`
`e60a8e8a…`, `scp_iv_can_write_case` `1249ebde…`, `scp_iv_case_row_visible` `b6f6f202…`, the three-argument
`scp_report_snapshot_readable` `3e86e520…`, `scp_employer_report` `ed549724…`. `employer_reports_readable` and
`employer_report_access` did not exist. Counts: 11 active organisations; active memberships 5 owner, 1 admin, 3 member
(2 of them with a live reviewer grant); 1 active ordinary member without a grant, in 1 organisation, would stop reading
reports; 0 live grants held by inactive members; 9 employer-audience report snapshots.

## After (read ~16:50 UTC, project `wrygicdfxwjnrugduxnt`; the production session read the same independently)

- **Ledger:** 366 rows, last version `20270204090000`, the three new rows exactly as above. md5 of `version:name`
  joined by newline over all rows `ae6f49cb25fa072932ae6aaf8d2b4ddc`; over the first 363 rows
  `fbfc766e1fd85a3d19fc82b8f4fbc8c7` (unchanged since #387). `supabase/hosted-ledger.json` hashes to the same values.
- **Function bodies:** all 25 `md5(prosrc)` equal a strict local replay of `e7b5a3d` (366 migrations, zero failures) and
  the values recorded in `release-state.json`: 3 from `20270202`, 19 from `20270203`, 3 from `20270204`. Examples:
  `employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)` `1f49e9ab…`, `employer_report_access(uuid)`
  `550323d2…`, `approve_access_request(uuid,text,text)` `262a76d3…`, `scp_iv_can_read_case(uuid)` `2571ec0f…`.
- **Privileges:** `anon` has no EXECUTE on `employer_reports_readable`, `scp_attempt_reports_readable`, either
  `scp_report_snapshot_readable`, `employer_access_request_standing_guard` or
  `employer_membership_revoke_reviewer_grants`. `employer_report_access(uuid)`: anon false, authenticated true.
- **Triggers:** `employer_access_requests_standing_guard` and `employer_memberships_revoke_reviewer_grants` exist,
  enabled `O`.
- **Policies:** the seven `20270203` policies (`scp_report_snapshots_employer`, `scp_employer_decisions_member_read`,
  `scp_interview_notes_employer_read`, `scp_assessment_invitations_employer_read`, `assignments_employer_select`,
  `scp_training_assignments_read`, `scp_training_progress_read`) each name the new gate and none names
  `has_active_employer_role` or `has_employer_role` alone. `scp_iv_corrections_employer` has the qual
  `scp_iv_can_read_case(case_id)`.
- **Live reviewer grants of suspended, removed or missing memberships:** 0.
- **Advisors (security):** 5 findings in total, none new from this change: `security_definer_view` ERROR (existed before),
  `extension_in_public`, `rls_enabled_no_policy`, and the two executable-SECURITY-DEFINER warnings. The anon one names none
  of the touched functions; the authenticated one lists the new gate functions, which are authenticated-executable by
  design (they answer for `auth.uid()` only).

## Not done

No rolled-back probe as a real principal was run (the connector reads only). Behaviour is proven on the identical
bodies by `employer_membership_standing_test` MS1-MS6, `employer_report_access_model_test` RA1-RA9,
`interview_case_access_model_test` IC1-IC6 and the flipped matrix suites; the production probes are in
`2026-10-03-production-test-request.md` section 4 (steps 11 and 15) and run after the application half (#397) is published.

## Recorded in

`supabase/release-state.json` (`hostedState: applied`), `supabase/hosted-ledger.json` (366 rows) and
`scripts/release-frontier-check.ts` (`expectedPending` is empty).
