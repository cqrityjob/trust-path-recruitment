# P1: a Learning Mode run never becomes assessment evidence

**Status: APPLIED.** Merged and verified on production on 2026-10-02. See
`docs/release/2026-10-02-security-gate-blockers-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270103090000_scp_submit_assessment_only.sql` |
| Rollback | `supabase/rollback/20270103090000_scp_submit_assessment_only_rollback.sql` |
| Suite | `supabase/tests/scp_submit_assessment_only_test.sql` (25 assertions) |

## 1. Root cause

`scp_submit_attempt(_attempt_id)` is SECURITY DEFINER. It checked that the run
was the caller's and still in progress. It never checked that the run was an
assessment. A candidate could:

1. start a Learning Mode run (`scp_start_learning_attempt`);
2. read the preferred answer for each item through `scp_get_learning_feedback`;
3. save exactly those answers;
4. call `scp_submit_attempt` on the learning run instead of
   `scp_complete_learning_module`.

The run was then scored as an assessment. It wrote one evidence row per item, at
contribution 1.000 and confidence 1.000, in an `assessment_form` context.
Employers can read that evidence, and maturity is computed from it. The steps
could be repeated without limit.

## 2. Fix

`scp_submit_attempt` refuses any run whose `mode` is not `assessment`. The
refusal comes right after the ownership check, before anything is read or
written. It raises `SCP_NOT_AN_ASSESSMENT` (`23514`). Ownership is checked
first, so a stranger still gets `SCP_ATTEMPT_NOT_YOURS` and learns nothing
about the run's mode.

**Not changed:**
- the rest of the function body, its comment and its grants;
- `scp_complete_learning_module` and `scp_complete_training_module`. They are
  how learning and training runs close, and neither calls `scp_submit_attempt`.
  No other database function calls it either;
- the Academy assessment route. It only ever opens assessment runs;
- any stored row.

## 3. Hosted history (read-only, 2026-10-02)

| Check | Result |
|---|---|
| Learning runs | 10 (8 scored, 2 in progress) |
| Evidence written by `scp_submit_attempt` from a learning run | **0** |
| Assessment runs released / submitted | 9 / 11 |

There is nothing to repair.

## 4. Tests

The suite runs as the real `authenticated` role through the real RPCs.

| Group | Proves |
|---|---|
| SA-F | A learning run is answered with the preferred options that learning feedback reveals. |
| SA0 | **Reproduction** on the pre-fix body, restored with the real rollback inside a savepoint. The learning run is scored and writes full-credit `assessment_form` evidence. |
| SA1 | Submitting the learning run is refused. It writes no evidence and opens no review, and the run stays open. |
| SA2 | A learning run issued under an employer (the shape a training module creates) is refused the same way. |
| SA3 | The learning run still completes through `scp_complete_learning_module`, with only its weak training evidence (0.250 / 0.500). An assessment run is still submitted and writes its evidence. |
| SA4 | Another person's run is still "not yours". A completed learning run and an already-submitted assessment run are refused. Anon cannot execute the function. |
| SA5 | No evidence in the database was written by `scp_submit_attempt` from a learning run. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | SA1.1 |
| NC2 | Only a learning run with no employer is refused, so training runs still score | SA2.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
