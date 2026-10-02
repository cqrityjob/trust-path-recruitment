# P1-C: only an owner or admin reviews an interview finding, only its review fields, and the database records who

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-C of the
2026-10-02 full hostile-user re-audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270116090000_scp_iv_findings_review_writes.sql` |
| Rollback | `supabase/rollback/20270116090000_scp_iv_findings_review_writes_rollback.sql` |
| Suite | `supabase/tests/scp_iv_findings_review_writes_test.sql` (16 assertions) |

## 1. Root cause

`scp_interview_findings` holds what an interview case still has to settle:
gaps, unclear points, and differences between sources.

| Guard | Before |
|---|---|
| Grant | `authenticated` held UPDATE on every column. |
| Policy | The only row rule (`scp_interview_findings_update`) was `scp_iv_can_write_case(case_id)`, which any member passes, plain members included. |
| Triggers | Check only that a finding cites its own case and pinned pack. |

The report builders list a finding as unresolved only while its
`resolution_state` is `open`, `needs_verification` or `unresolved_difference`.
A plain member could therefore:

- mark a finding `resolved` or `not_relevant`, so it drops off the report an
  owner or admin then finalises;
- rewrite the AI run's recorded output: `statement`, `finding_kind`,
  `claim_class` or the cited source;
- write `human_actor_id` and `human_actor_at`, attributing the review to
  someone else.

Finalising a report already requires an owner or admin
(`SCP_IV_FINALISE_ROLE`). Deciding what goes into it did not.

## 2. Fix

There are three layers.

| Layer | Change |
|---|---|
| Privileges | Table-level UPDATE is revoked from client roles. UPDATE is granted back on the three review columns only: `resolution_state`, `human_state`, `human_note`. |
| Policy | `scp_interview_findings_update` also requires an owner or admin of the case's employer, the same bar as finalising. |
| Attribution | A new BEFORE UPDATE trigger, `scp_interview_findings_review_stamp`, sets `human_actor_id = auth.uid()` and `human_actor_at = now()` whenever a review column changes. |

After the fix:
- the AI run's recorded output and the citations are not client-writable;
- the record of who settled a finding is written by the database, not the
  caller.

**Not changed:**
- reading findings;
- recording them (`scp_iv_record_findings`, a SECURITY DEFINER insert);
- the report builders;
- the citation triggers;
- any row.

No application code writes this table:
`src/lib/interview-intelligence/runtime.functions.ts` only reads it.

## 3. Hosted state (read-only, 2026-10-02)

- **Data:** 0 findings, so nothing is exposed today and there is nothing to
  repair.
- **Grants and policy:** `authenticated` holds `rw` on the table. The hosted
  update policy's md5 is pinned in the rollback.

## 4. Tests

The fixture is one case of employer E with two findings. The contradiction is
`open` and the verification is `needs_verification`, so both are on the
report's unresolved list.

| Group | Proves |
|---|---|
| FR0 | **Reproduction** on the pre-fix grants and policy (the real rollback, inside a savepoint). A plain member marks the contradiction not relevant, which takes it off the unresolved list. The member also rewrites the other finding's statement and attributes the review to the owner. |
| FR1 | A plain member's review updates touch no row. Statement, kind and attribution are not writable at all. Both findings stay as recorded. |
| FR2 | The owner and an admin review findings, and the database records each as the reviewer, with a time. Neither can rewrite the statement, class or attribution. |
| FR3 | Another employer's owner updates nothing, and anon holds no UPDATE. |
| FR4 | With table-level UPDATE restored, the policy alone still keeps a plain member out. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | FR1.1 |
| NC2 | Table-level UPDATE granted back (policy kept) | FR1.3 |
| NC3 | The policy back on case access alone (grants kept) | FR1.1 |
| NC4 | The attribution trigger dropped | FR2.2 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again. `supabase/tests/scp_a_rollback_test.sql` drops the new
trigger function, so the documented full rollback still leaves no `scp_`
function behind.
