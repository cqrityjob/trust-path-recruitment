# P1: Passport evidence and verification requests are written only by their functions

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-4 of the
2026-10-02 pre-launch hostile-user audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270106090000_sp_evidence_and_request_writes_rpc_only.sql` |
| Rollback | `supabase/rollback/20270106090000_sp_evidence_and_request_writes_rpc_only_rollback.sql` |
| Suite | `supabase/tests/sp_evidence_and_request_writes_test.sql` (29 assertions) |

## 1. Root cause

**`sp_evidence`.** `authenticated` held INSERT and UPDATE. The only row rule,
`sp_evidence_self` (FOR ALL), was `holder_user_id = auth.uid()`. Nothing tied
`claim_id`, `period_id` or `storage_path` to that same holder. So holder A
could insert, or repoint by UPDATE, A's evidence onto holder B's claim. Then:

- the verifier's dossier for B's claim showed A's file;
- B could not remove it, because `sp_withdraw_evidence` raises `SP_NOT_HOLDER`.

The attacker needs B's claim id, which older share links and an employer's
disclosure view carry.

**`sp_verification_requests`.** It had the same shape: a column INSERT grant,
and `sp_vr_self_insert` checking only the holder, the status and
`decided_by`. A could open a request on B's entry. That also blocked B's own
submission with `SP_REQUEST_ALREADY_OPEN`, and it skipped the
employer-eligibility check that `sp_submit_for_verification` makes.

## 2. Fix

No client writes either table directly. Every legitimate write already goes
through a SECURITY DEFINER function that checks the holder, the target and (for
evidence) the storage path:

| Table | Written by |
|---|---|
| `sp_evidence` | `sp_attach_evidence`, `sp_withdraw_evidence` |
| `sp_verification_requests` | `sp_submit_for_verification`, `sp_withdraw_verification_request`, `sp_verifier_decide` |

The application only SELECTs these tables directly
(`src/lib/security-passport/*.functions.ts`).

The fix has two independent layers:

1. **Privileges.** INSERT/UPDATE on `sp_evidence` and INSERT on
   `sp_verification_requests` are revoked from every client role, at table
   and column level.
2. **Policies.** `sp_evidence_self` becomes SELECT-only, and
   `sp_vr_self_insert` is dropped. No permissive client write policy remains.

**Not changed:**
- every read (holder, verifier, employer);
- the restrictive session policy;
- the five functions above;
- the Storage policies;
- any row.

## 3. Hosted history (read-only, 2026-10-02)

| Check | Result |
|---|---|
| Evidence rows | 12 |
| Evidence whose claim or period belongs to another holder | **0** |
| Evidence paths outside the holder's folder | **0** |
| Verification requests | 11 |
| Requests on another holder's entry | **0** |

There is nothing to repair.

## 4. Tests

| Group | Proves |
|---|---|
| SV-F | A and B attach their own evidence through `sp_attach_evidence`. B's claim 1 goes under review. |
| SV0 | **Reproduction** on the pre-fix grants and policies, restored with the real rollback inside a savepoint. A plants A's file on B's claim under review, the verifier's dossier shows it, and B cannot remove it. A repoints A's own evidence onto B's claim. A opens a request on B's claim 2, and B can no longer submit it. |
| SV1 | Every one of those direct writes is refused, including a direct request on A's own claim. B's entries are left as B made them. |
| SV2 | Submitting, withdrawing, attaching and withdrawing evidence all still work through the functions. The functions still refuse another holder's claim, another holder's folder, and a request on another holder's claim. |
| SV3 | Reads are unchanged for the holder, another holder and the verifier. |
| SV4 | Each layer holds alone. With the write grants restored, the policies refuse. With the old policies restored, the privileges refuse. |
| SV5 | A holder cannot edit their own evidence directly (no un-withdrawing, no repointing a file under review). Anon holds no write. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | SV1.1 |
| NC2 | Old write policies back, write grants still revoked | SV4.1 |
| NC3 | Write grants back, SELECT-only policies kept | SV1.2 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.

## 5. Existing suites updated

Three existing suites sent a direct client INSERT into
`sp_verification_requests` and expected the table's constraint or index to
refuse it. The client is now refused earlier, by privilege, so each of those
checks was kept and split in two. No check was removed:

- the original check now runs as the table owner. This proves the constraint
  or index itself, which also binds the SECURITY DEFINER functions;
- a new `b` check proves the client cannot send that INSERT at all.

| Suite | Checks |
|---|---|
| `security_passport_trust_boundary_test.sql` | 1.5/1.5b, 1.6/1.6b, 6.2/6.2b |
| `security_passport_employer_verification_test.sql` | 1.4/1.4b, 1.8/1.8b |

`security_passport_note_privacy_test.sql` 2.8 asserted that a holder could
still INSERT directly, the exact path this change closes. Its stated purpose
is to show that 2.7 does not pass merely because holders cannot file at all.
That purpose is kept: 2.8 now files a request through
`sp_submit_for_verification` (undone in a subtransaction) and checks that the
request carries no internal note.

