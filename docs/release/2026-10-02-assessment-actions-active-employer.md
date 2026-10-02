# P1-B (3/5): assessment actions require an active organisation

**Status: APPLIED.** Merged (#370, a7288db) and verified on production on 2026-10-02.
See `docs/release/2026-10-02-reaudit-p1-fixes-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270110090000_assessment_actions_active_employer.sql` |
| Rollback | `supabase/rollback/20270110090000_assessment_actions_active_employer_rollback.sql` |
| Suite | `supabase/tests/assessment_actions_active_employer_test.sql` (18 assertions) |

## 1. Root cause

The employer's assessment actions checked membership and role, but not the
organisation's status. A suspended or not-yet-approved organisation could
still:

| Action | Function |
|---|---|
| Review its participants' responses | `scp_can_review_for`, behind the review queue, the reviewer's workload and `scp_review_authorisation` (which `scp_complete_human_review` enforces) |
| Release a development report | `scp_release_attempt_report` |
| Record a decision about a person | `scp_record_employer_decision` |
| Cancel an assessment invitation | `scp_cancel_assessment_invitation` |
| Record the setup a test was sent with | `scp_record_assessment_setup` |

It could also read those setups directly (`scp_assessment_setups_member_read`).

## 2. Fix

All five gates and the policy now call `has_active_employer_role`. Each keeps
its existing role requirement and its existing refusal:

| Function | Refusal |
|---|---|
| Review | `SCP_NOT_A_REVIEWER` |
| Release | `SCP_NOT_AUTHORISED_TO_RELEASE` |
| Decide | `SCP_NOT_AUTHORISED_TO_DECIDE` |
| Cancel | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| Setup | `SCP_SETUP_NOT_PERMITTED` |

A platform admin's break-glass review (`'break_glass'`) is unchanged. Each body
is the hosted body verbatim except its gate.

**Not changed:**
- reviewer staffing (`scp_grant_employer_reviewer` / `scp_revoke_employer_reviewer`
  and the reviewer list), which is the organisation's own set-up;
- assigning and inviting, which are P1-D (20270113090000);
- payloads, grants and any row.

## 3. Hosted state (read-only, 2026-10-02)

All 11 employers are active, and none has ever been suspended. All five hosted
bodies equal the md5 values the rollback pins.

## 4. Tests

The fixture runs the real flow, giving employer E:
- a released sitting;
- a reviewed but unreleased sitting;
- a sitting waiting for review;
- an open invitation;
- a recorded setup.

Every action is probed as the principal allowed to take it, then undone.

| Group | Proves |
|---|---|
| AA-F | While E is active, the reviewer sees the queue and is authorised, and every action succeeds. An outsider sees nothing. The probes leave nothing behind. |
| AA0 | **Reproduction.** E is suspended and the pre-fix state is restored with the real rollback. Every action still succeeds, and the reviewer still sees the queue. |
| AA1 | With E suspended, reviewer and owner get exactly an outsider's answer. Every action is refused with its existing refusal, and nothing is written. |
| AA2 | The same holds for `pending`, `rejected`, `archived` and `draft`. Break-glass review stays available. |
| AA3 | Reactivation restores every read and action. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | AA1.1 |
| NC2 | Only `scp_can_review_for` pre-fix | AA1.1 |
| NC3 | Only `scp_release_attempt_report` pre-fix | AA1.3 |
| NC4 | Only the setups read policy pre-fix | AA1.1 |
