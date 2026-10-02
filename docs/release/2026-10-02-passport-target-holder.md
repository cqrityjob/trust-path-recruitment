# P1-E: a Passport request or evidence row names exactly one entry, and it is the holder's own

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-E of the
2026-10-02 full hostile-user re-audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270114090000_sp_passport_target_holder.sql` |
| Rollback | `supabase/rollback/20270114090000_sp_passport_target_holder_rollback.sql` |
| Suite | `supabase/tests/sp_passport_target_holder_test.sql` (20 assertions) |

## 1. Root cause

`sp_attach_evidence` and `sp_submit_for_verification` take both a claim and a
period. When a claim was named, they checked only the claim's holder and then
stored the period exactly as passed.

On production, a rolled-back probe had holder A name A's own claim and holder
B's period. As a result:

- A's file was attached to B's period. B's verifier dossier showed it, and B
  could not withdraw it (`SP_EVIDENCE_UNDER_REVIEW`).
- A CQrityjob review was opened on B's period. It blocked B's own submission
  (`SP_REQUEST_ALREADY_OPEN`).
- When a verifier approved that review, it recorded "CQrityjob /
  document_review" provenance against B's period in B's disclosures. B's
  period could then be revoked.

`sp_raise_dispute` and `sp_verifier_revoke` accept the same pair with the same
ambiguity. Nothing at the table level tied a request or an evidence row to its
holder's own entry. B needs to know A's ids, which disclosure links carry
(P2).

## 2. Fix

There are two layers.

1. **Functions.** `sp_attach_evidence`, `sp_submit_for_verification`,
   `sp_raise_dispute` and `sp_verifier_revoke` refuse unless exactly one of
   claim and period is named (`SP_TARGET_AMBIGUOUS`). The check runs before
   anything is read or written, and is the rule `sp_resolve_dispute` already
   applies. The holder check then always covers the one entry used. The
   application always names exactly one (`src/lib/security-passport/rpc.ts`).
2. **Tables.** `sp_evidence` and `sp_verification_requests` each gain a CHECK
   that exactly one of `claim_id` / `period_id` is set. They also gain
   composite foreign keys:
   - `(claim_id, holder_user_id)` → `sp_claims (id, holder_user_id)`;
   - `(period_id, holder_user_id)` → `sp_experience_periods (id, holder_user_id)`.

   So no writer, now or later, can attach a row to another holder's entry. The
   two referenced pairs get UNIQUE constraints; `id` is already unique, so they
   hold by construction.

**Not changed:**
- every legitimate call (one entry, one's own);
- the existing foreign keys and their `ON DELETE CASCADE`;
- grants, reads and any row.

## 3. Hosted history (read-only, 2026-10-02)

| Table | Rows | Naming two entries | Pointing at another holder's entry |
|---|---|---|---|
| `sp_evidence` | 12 | 0 | 0 |
| `sp_verification_requests` | 11 | 0 | 0 |
| `sp_passport_events` | 149 | — | 0 |

There is nothing to repair. The migration refuses to apply if such a row exists
by the time it runs.

## 4. Tests

| Group | Proves |
|---|---|
| TH0 | **Reproduction** on the pre-fix functions and tables (the real rollback, inside a savepoint). Naming A's claim and B's period, A attaches a file to B's period and opens a review on it. B's own submission is refused as already open. V's approval records a CQrityjob approval against B's period, which can then be revoked. |
| TH1 | Both calls are refused as ambiguous, and so is naming neither. Nothing is written, and B submits B's own period normally. |
| TH2 | Dispute and revoke refuse two entries. |
| TH3 | With the pre-fix functions and the new constraints, a row naming two entries violates the CHECK. Even the table owner cannot write evidence or a request against another holder's entry, both in a savepoint and in the migrated state as it stands. |
| TH4 | Every legitimate call still works: evidence and review on one's own claim and period, approve and revoke, and a dispute. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | TH1.1 |
| NC2 | Only the four functions pre-fix (constraints kept) | TH1.1 |
| NC3 | Only the constraints dropped (functions kept) | TH3.3 |

## 5. Existing suite updated

`sp_evidence_and_request_writes_test.sql` (P1-4) reproduces a cross-holder
evidence row and request on the pre-P1-4 grants and policies. The new
same-holder foreign keys refuse those rows too. SV0 therefore also runs this
migration's rollback inside its savepoint, so it reproduces the state before
both fixes.

P1-4's negative controls in `db-test.sh` likewise lift this invariant while
they prove P1-4's own layers, and restore it afterwards. No assertion was
removed.
