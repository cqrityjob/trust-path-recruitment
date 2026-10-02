# P1-H: a Passport entry under review cannot change underneath the reviewer

**Status: PENDING.** This PR fixes P1-H of the 2026-10-02 final hostile-user
audit. It builds on P1-L (20270117090000) and merges after it. It is not
merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270118090000_sp_entry_frozen_under_review.sql` |
| Rollback | `supabase/rollback/20270118090000_sp_entry_frozen_under_review_rollback.sql` |
| Suite | `supabase/tests/sp_entry_frozen_under_review_test.sql` (15 assertions) |

## 1. Root cause

A holder's self-declared claim or experience period stayed writable by the
holder (`sp_claims_self_update`, `sp_periods_self_update`) while a
verification request on it was open. `sp_verifier_decide` approves whatever
the row holds at the moment of the decision. A holder could therefore submit
plausible data and change it before the reviewer approved. On production a
rolled-back probe showed that an edit while pending was approved and became
verified with dates shifted 3650 days. `sp_credential_details` already
refused edits once a request existed, but the claim and period rows did not.

## 2. Fix

A BEFORE UPDATE trigger on `sp_claims` and `sp_experience_periods` applies
to direct client writes only (`current_user` is a client role):

| Request state | Holder's direct edit |
|---|---|
| `pending` (in review) | refused: `SP_ENTRY_UNDER_REVIEW` |
| `clarification_requested` | allowed, because the reviewer asked for the correction. The request returns to `pending`, so the reviewer decides on the corrected content, and the entry is frozen again. |
| none, `withdrawn`, decided | unchanged |

The Passport SECURITY DEFINER functions run as the owner and are unaffected:
decide, revoke, correct, withdraw and dispute.

The helper `sp_entry_review_on_holder_edit` acts only on the caller's own
entry and tells anyone else nothing. It is not executable by anon.

**Not changed:**
- the row policies;
- the trust-field guards;
- every Passport RPC;
- entries with no open request;
- any row.

**Older suite aligned:** `security_passport_employer_verification_test.sql`.
After the candidate corrects a period in reply to a clarification (6.9), the
new 6.9b proves that the request is back in review. Group 7 now finds it as
`pending`.

## 3. Hosted state (read-only, 2026-10-02)

Every verification request on production is decided (`approved`). There is
no open request to strand, and nothing to repair.

## 4. Tests

| Group | Proves |
|---|---|
| ER0 | **Reproduction.** With the guard removed by the real rollback, a pending period is rewritten (start moved 10 years back, role renamed) and then verified. |
| ER1 | The same edit is refused. The approval verifies what was submitted. |
| ER2 | The same holds for a claim's validity. |
| ER3 | A clarification is answered by editing and the request returns to review. A second edit is refused, and the approval verifies the corrected content. |
| ER4 | With no open request (none, or withdrawn) the holder edits freely. Another holder cannot, and the helper tells them nothing. |
| ER5 | anon cannot call the helper. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | ER1.1 |
| NC2 | Only the claims trigger dropped | ER2.1 |
| NC3 | A clarification never returns to review | ER3.2 |
