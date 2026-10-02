# P0: the progress series shows an employer only its own reports

**Status: APPLIED.** Merged and verified on production on 2026-10-02. See
`docs/release/2026-10-02-security-gate-blockers-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270102090000_scp_subject_progress_employer_scope.sql` |
| Rollback | `supabase/rollback/20270102090000_scp_subject_progress_employer_scope_rollback.sql` |
| Suite | `supabase/tests/scp_subject_progress_scope_test.sql` (12 assertions) |

## 1. Root cause

`scp_subject_progress(_subject_id)` is SECURITY DEFINER. It chooses an audience,
then returns every snapshot of that audience for the subject:

- The employer branch is entered by any active member of any organisation that
  has one released attempt for the subject.
- It then returned the employer-audience snapshots of every organisation, not
  only the caller's.

On hosted production, a rolled-back probe as a member of employer A (not a
member of B) returned 13 rows, 4 of them from B's employer reports: evidence
state, observation and safety-flag counts, attempt id and release date. Two such
caller/subject pairs exist. The employer report page calls the function in
normal use (`getSubjectProgress`).

The snapshot table's own RLS already had the right rule,
`scp_report_snapshot_readable`. The definer function never applied it.

## 2. Fix

Every row the function returns now passes `scp_report_snapshot_readable(audience,
subject_id, issuer_organization_id)`, the predicate the table's policies use.
The series therefore shows exactly the snapshots the caller could read directly.

**Not changed:** audience selection, columns, ordering, grants,
`scp_report_snapshot_readable`, the snapshot table and its policies, any row.

## 3. Tests

The suite runs two real employers assessing the same person through the real
assign, answer, submit, review and release flow.

| Group | Proves |
|---|---|
| PS0 | **Reproduction** on the pre-fix body, restored with the real rollback inside a savepoint: employer 1's owner reads employer 2's report rows. |
| PS1 | Each employer reads no row of the other's report, and still reads every row of its own. A plain member reads the same as the owner. |
| PS2 | The participant still reads their own series from both employers. |
| PS3 | A member of both employers reads both. |
| PS4 | A suspended membership, an unrelated employer's owner and anon read nothing. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | PS1.1 |
| NC2 | Scoped by organisation, but ignoring membership status | PS4.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
