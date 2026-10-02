# P1-J: a BESKT position cannot be reopened once the others are readable

**Status: PENDING.** This PR fixes P1-J of the 2026-10-02 final hostile-user
audit. It builds on P1-K (20270120090000) and merges after it. It is not
merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270121090000_bcp_conduct_reopen_after_exposure.sql` |
| Rollback | `supabase/rollback/20270121090000_bcp_conduct_reopen_after_exposure_rollback.sql` |
| Suite | `supabase/tests/bcp_interview_conduct_test.sql`, C7.9–C7.12 (new) |

## 1. Root cause

`bcp_conduct_may_see_others` lets an assessor read the other positions once
their own is locked **and** either the panel has revealed or nobody is still
open. `bcp_conduct_reopen_position` refused only once a panel was revealed
or concluded.

So when every position was locked and no panel existed yet, or it was still
open, assessor A could:
1. read B's locked position;
2. reopen A's own position;
3. change it and lock it again.

This is the anchoring that the reopen guard's own comment calls "the exact
dependency the whole design refuses". Auditor probe:
`A_reads_B_entries=1, reopen_err=none, A_state_now=open`.

## 2. Fix

`bcp_conduct_reopen_position` now also refuses with
`BCP_CONDUCT_POSITIONS_ALREADY_SEEN` when the session has another position
and every other position is locked. That is exactly the moment
`may_see_others` opens.

A reopen while another assessor is still open is unchanged, because nothing
is readable yet. A session with one assessor is unchanged. The body is
otherwise the hosted one: md5 `55e5e05559d9b9624bf411b68ee2f322`, pinned by
the rollback. The added block is marked `20270121090000`.

**Older suite and guards aligned:**
- `bcp_conduct_report_independence_test.sql` B6 used to reopen after both
  positions had been readable, to show the report closing again. That reopen
  is the defect. B6 now proves it is refused and that the position stays
  locked.
- `beskt-report-independence:check` and its negative control
  `RIB-NC-SUITE-NO-REOPEN` now require that proof.
- `beskt-interview-conduct:check` now pins the conduct suite's own
  registration line. The P1-J block runs the same suite a second time, and
  that run must not stand in for the registered one. This keeps
  `CND-NC-SUITE-NOT-RUN` alive.

## 3. Hosted state (read-only, 2026-10-02)

Production holds 0 conduct sessions, 0 positions and 0 reopens. There is
nothing to repair, and the behaviour is proven by the suite.

## 4. Tests

These run inside the conduct suite, which already builds a two-assessor
session:

| Assertion | Proves |
|---|---|
| C7.9 | **Reproduction.** On the hosted body, restored by the real rollback, the first assessor reopens their position after the other became readable. |
| C7.10 | That reopen is refused. |
| C7.11 | The second assessor's reopen is refused too. |
| C7.12 | Both positions stay locked. |

The existing C8.11 (no reopen after the panel reveals) is unchanged and
still passes.

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | C7.10 |
| NC2 | The guard applies only once a panel exists | C7.10 |
