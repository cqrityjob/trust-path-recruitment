# P1-F: a holder cannot set or change a claim's verification stamp

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-F of the
2026-10-02 full hostile-user re-audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270115090000_sp_claim_verification_stamp.sql` |
| Rollback | `supabase/rollback/20270115090000_sp_claim_verification_stamp_rollback.sql` |
| Suite | `supabase/tests/sp_claim_verification_stamp_test.sql` (20 assertions) |

## 1. Root cause

A claim's verification stamp is two columns, `verified_at` and
`verified_by_user_id`. `sp_verifier_decide` writes both when it approves a
claim. `authenticated` holds UPDATE on every column of `sp_claims`.

| Guard | What it covered |
|---|---|
| `sp_claims_self_update` (holder's policy) | Required `verified_by_user_id IS NULL`. Said nothing about `verified_at`. |
| `sp_guard_trust_fields_immutable` (trigger) | Guarded `assertion_level` and `lifecycle_state`. Neither stamp column. |

On production, a rolled-back probe as a holder wrote `verified_at` on their own
self-declared credential (rows=1). `sp_selected_merits_payload` serves
recipient links and previews. It then returned the claim as
`assertion=self_declared` with `verified_at=2026-01-15`. The recipient view
shows a "verified at" line whenever that value is present.

## 2. Fix

There are two independent layers. Either one alone refuses the forgery.

1. **Trigger.** On `sp_claims`, `sp_guard_trust_fields_immutable` now refuses
   any change to `verified_at` or `verified_by_user_id` outside
   `sp.verification_context`, with `SP_TRUST_FIELD_IMMUTABLE`. This is the
   rule it already applies to `assertion_level`. `sp_verifier_decide` is the
   only function that sets that context, and no other function writes either
   column on UPDATE. The new block is nested under
   `TG_TABLE_NAME = 'sp_claims'`, so `sp_experience_periods`, which shares the
   trigger and has neither column, is unaffected.
2. **Policy.** The WITH CHECK of `sp_claims_self_update` also requires
   `verified_at IS NULL`, as it already required `verified_by_user_id IS NULL`.

**Not changed:**
- the verification workflow;
- `sp_correct_claim`. It is a definer INSERT: it carries the stamp forward when
  a correction changes no material fact, and clears it when one does;
- every holder edit of a claim's own fields;
- grants, reads, payloads and any row.

## 3. Hosted history (read-only, 2026-10-02)

| Claims | Total | With `verified_at` | Stamp without an approved decision |
|---|---|---|---|
| `self_declared` (active or withdrawn) | 42 | 0 | 0 |
| `verified` (active or withdrawn) | 9 | 9 | 0 |

There is nothing to repair. The migration refuses to apply if a self-declared
claim carries a stamp by the time it runs.

## 4. Tests

| Group | Proves |
|---|---|
| VS-F | Holder A has two self-declared claims, no stamp, and a preview with no verification time. |
| VS0 | **Reproduction** on the pre-fix trigger and policy (the real rollback, inside a savepoint). A writes `verified_at`, and A's preview shows a self-declared claim with a verification time. |
| VS1 | Writing `verified_at` or `verified_by_user_id` is refused, including when it rides along with an ordinary edit. A's ordinary edits still work, and nothing was stamped. |
| VS2 | Verifier V's approval through `sp_verifier_decide` still stamps the claim. A can then neither move nor clear the stamp. A correction carries the stamp forward or clears it, exactly as before. |
| VS3 | Each layer alone refuses: the pre-fix trigger with the new policy, and the new trigger with the pre-fix policy. |
| VS4 | Periods, which share the trigger, still edit normally and still refuse a raised assertion level. Holder B still cannot touch A's claim. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | VS1.1 |
| NC2 | Only the trigger on its pre-fix body (policy kept) | VS1.1 |
| NC3 | A trigger that guards `verified_at` but not `verified_by_user_id` | VS1.2 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
