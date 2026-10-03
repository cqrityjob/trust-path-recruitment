# BESKT: an exposed position stays as recorded, whoever joins later

**Status: APPLIED.** Follow-up to P1-J (20270122090000). Merged (#384, 7ff0cbe)
and verified read-only on production on 2026-10-03. See
`docs/release/2026-10-03-beskt-exposure-and-passport-review-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270124090000_bcp_conduct_exposure_is_durable.sql` |
| Rollback | `supabase/rollback/20270124090000_bcp_conduct_exposure_is_durable_rollback.sql` |
| Suite | `supabase/tests/bcp_interview_conduct_test.sql`, C7.13–C7.21 (new) |
| Race | `scripts/db-test.sh`, "BESKT conduct join/lock/reopen race" |

## 1. Finding (confirmed)

The finding came from code review and was then reproduced locally through the
real governed functions:

1. Assessors A and B join an open session, record their positions and lock
   them.
2. Every position is locked, so `bcp_conduct_may_see_others` lets A read B's
   position (C7.7).
3. Before any panel reveal, an authorised third assessor C joins with an open
   position (`bcp_conduct_join_session`).
4. A calls `bcp_conduct_reopen_position` and the position B has already read
   is open again.

On current main the regression fails at C7.15 ("A still cannot reopen …,
although C is open — statement unexpectedly SUCCEEDED").

## 2. Root cause

P1-J's guard in `bcp_conduct_reopen_position` asks "is every OTHER position
locked NOW?" It reads current states only, so a later join makes the
predicate false. Exposure was never recorded as a fact.

The concurrency was also loose. `join_session` serialises on the session,
while `lock_position` and `reopen_position` serialise only on the position.
A join, a lock and a reopen in the same session therefore did not order
against each other.

## 3. Correction

The fix is the smallest durable addition to the existing model:

- **Exposure record.** `bcp_conduct_position_exposures` holds one append-only
  row per position. An AFTER trigger on `bcp_conduct_positions` writes the
  rows at the moment every position in the session is locked, with at least
  two positions. That is exactly when `may_see_others` opens.
- **Refusal.** A BEFORE trigger refuses `locked → open` for a position with
  an exposure row, with `BCP_CONDUCT_POSITIONS_ALREADY_SEEN`. It holds on the
  RPC, a direct write and the table owner (C7.17).
- **Transaction coordination.** Every insert of a position and every change
  of a position's state takes the session's transaction advisory lock, the
  same key `join_session` already takes. Join, lock and reopen in a session
  therefore serialise, and each decision reads the committed result of the
  previous one. Revision-only updates (entry saves) take no lock.
- **No foreign key on the exposure table, on purpose.** A key check would
  take KEY SHARE on the position. The reopen RPC holds FOR UPDATE on that row
  while it waits for the session lock, so a foreign key would deadlock by
  construction. Positions are never deleted, so a row cannot dangle.

Unchanged:
- who may join, lock, reopen or read;
- the panel and its reveal guard;
- entries, corrections, verifications and their history;
- the body of `bcp_conduct_reopen_position`. Its P1-J check stays and is now
  redundant rather than wrong.

Production holds 0 conduct sessions, so the backfill writes 0 rows.

## 4. Legitimate reading and collaboration (positive tests)

| Assertion | Proves |
|---|---|
| C7.14 | An authorised colleague on the case joins the session. |
| C7.18 | The newcomer sees nothing of A's or B's until their own position is locked. The independence rule is unchanged. |
| C7.19 | Once C locks, the colleagues on the case read each other's positions. |
| C7.21 | A locked position nobody has read is still reopened. The reopen is attributed and counted, and only the three read positions are on the exposure record. |
| C8.* | The panel, its disagreement record and its joint resolutions are unchanged and pass. |

The other BESKT suites pass unchanged: prompts and report (71), report
independence (30), candidate preparation (249) and case bridge (47).

## 5. Negative controls (`scripts/db-test.sh`)

| Control | Planted defect | Fails at |
|---|---|---|
| BX NC1 | The real rollback | C7.15 |
| BX NC2 | Exposure never recorded (AFTER trigger dropped) | C7.15 |
| BX NC3 | Guard ignores the exposure record | C7.15 |
| BX-RACE | Guard without the session lock | The race lets an exposed position reopen |

**The race.** It uses two real connections on committed synthetic rows in a
clone database:

1. **Lock vs reopen.** B's lock, which exposes A, holds its transaction open
   while A reopens.
2. **Lock vs join + reopen.** The same, with C's join and A's reopen in one
   transaction.

In both cases A waits about 1.5 s on the session lock, is then refused, and
stays locked with two exposure rows.

The P1-J controls (NC1 and NC2) now take this migration down first. It
enforces the same refusal durably, so without that step the controls would
pass.
