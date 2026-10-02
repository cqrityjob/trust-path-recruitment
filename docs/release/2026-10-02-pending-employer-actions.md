# P1-D: only an active (approved, not suspended) organisation assigns, invites, schedules, trains or binds people

**Status: PENDING.** This PR fixes P1-D of the 2026-10-02 full hostile-user
re-audit. It builds on 20270108090000 (`has_active_employer_role`) and merges
after P1-B 5/5. It is not merged, and nothing was written to the hosted
database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270113090000_pending_employer_actions.sql` |
| Rollback | `supabase/rollback/20270113090000_pending_employer_actions_rollback.sql` |
| Suite | `supabase/tests/pending_employer_actions_test.sql` (14 assertions) |

## 1. Root cause

An organisation registers as `pending` and is approved by moderation. The row
policy for creating an assessment assignment already requires an active
organisation (`assignments_employer_insert`). The SECURITY DEFINER functions
that do the same work checked only the caller's owner/admin membership.

On production, a rolled-back probe set an employer to pending. Its owner then:
- assigned an assessment to an unrelated registered user (rows=1);
- invited a participant (rows=1).

A suspended organisation could do the same.

## 2. Fix

| Function | Now requires | Refusal (unchanged) |
|---|---|---|
| `scp_employer_assign` | `has_active_employer_role(owner, admin)` | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| `scp_invite_participant` | same | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| `scp_assign_training` | same | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| `scp_schedule_reassessment` | same | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| `scp_assign_from_application` | same | `SCP_NOT_AUTHORISED_TO_ASSIGN` |
| `scp_bind_employee_subject` | same | `SCP_NOT_AUTHORISED_TO_BIND` |
| `scp_claim_assessment_invitations` (participant side) | the inviting organisation is active **when the invitation is claimed** | — the invitation stays pending (not bound, not closed) and binds on a later sign-in once the organisation is active |

Each body is the hosted body verbatim except its gate, which is marked
`20270113090000` in place.

**Not changed:**
- what an active organisation can do;
- the organisation's own set-up while pending (profile, job drafts, team);
- the insert policies on `assessment_assignments` and `employees`, which
  already require an active organisation;
- grants and any row.

## 3. Hosted history (read-only, 2026-10-02)

Five organisations went from `pending` to `active` through moderation, and six
were created active. For the five, every one of these postdates the approval:
- assessment assignment and invitation;
- training assignment;
- attempt;
- employee binding.

There is nothing to repair.

## 4. Tests

The fixture is built while employer E is active. It has:
- a participant with a released sitting;
- an unbound employment record;
- a registered user U who applied to E's job;
- an invitation to an address with no account yet.

| Group | Proves |
|---|---|
| PE-F | While E is active, its owner may do all six actions (each probe undone). A plain member may do none, as before. |
| PE0 | **Reproduction.** E is set back to `pending` and the pre-fix bodies are restored with the real rollback. The owner still does all six. |
| PE1 | With E pending, every action is refused with its existing refusal, and nothing is written. |
| PE2 | The same holds for `suspended`, `rejected`, `archived` and `draft`. |
| PE3 | The invitee signs up while E is pending: nothing is bound and the invitation stays pending. Once E is approved, the next claim binds it. |
| PE4 | Approval restores every action. A plain member still may not act. |

Scheduling a reassessment passes the authorisation gate and then stops on the
fixture's purpose catalogue (`SCP_PURPOSE_NOT_AVAILABLE`). That outcome is past
the gate this suite tests, and it differs from the refusal a non-active
organisation gets.

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | PE1.1 |
| NC2 | Only `scp_employer_assign` pre-fix | PE1.1 |
| NC3 | Only `scp_claim_assessment_invitations` pre-fix | PE3.1 |
| NC4 | Only `scp_bind_employee_subject` pre-fix | PE1.1 |
