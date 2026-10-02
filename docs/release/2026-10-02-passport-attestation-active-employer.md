# P1-B (5/5): employer attestation in the Security Passport requires an active organisation

**Status: PENDING.** This is the fifth of five PRs for P1-B of the 2026-10-02
full hostile-user re-audit. It builds on 20270108090000
(`has_active_employer_role`) and merges after P1-B 4/5. It is not merged, and
nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270112090000_passport_attestation_active_employer.sql` |
| Rollback | `supabase/rollback/20270112090000_passport_attestation_active_employer_rollback.sql` |
| Suite | `supabase/tests/passport_attestation_active_employer_test.sql` (16 assertions) |

## 1. Root cause

A holder can ask an employer to confirm an employment period
(`employer_attestation`). `sp_submit_for_verification` checks that the
employer is active, but only at submission.

The employer side checked only that the caller is an owner or admin:
- `sp_employer_attestation_queue`;
- the employer branch of `sp_verifier_decide`;
- the `sp_vr_employer_read` policy.

On production, a rolled-back probe suspended an employer after a request was
filed. Its owner then:
- still saw the queue, including the holder's name and employment details
  (`queue_rows=1`);
- approved the period, which became `verified` with 731 days of verified
  experience.

## 2. Fix

All three now call `has_active_employer_role`. The owner/admin requirement is
unchanged, and the organisation must also be active. Both functions keep the
refusal they already give a non-representative,
`SP_NOT_EMPLOYER_REPRESENTATIVE`. The CQrityjob-review branch of
`sp_verifier_decide` is unchanged.

Hosted `sp_verifier_decide` differs from the repository only in comments.
| Body | md5 |
|---|---|
| Hosted | `8aff390cafb6916038be392afd339a10` |
| Replayed | `ba3458fe2b4e5a38cde7e4ebd456999b` |

The logic is identical. The migration installs the repository body plus the
gate, and the rollback restores the repository body.

**Not changed:**
- the holder's paths;
- `sp_submit_for_verification`;
- `sp_application_disclosure`;
- grants and any row.

## 3. Hosted state (read-only, 2026-10-02)

All 11 employers are active, and none has ever been suspended. There are 0
employer-attestation requests, so nothing is exposed today and there is
nothing to repair.

## 4. Tests

| Group | Proves |
|---|---|
| PA-F | Holder H asks E (active) to confirm a period. E's owner sees it and may decide it. A plain member and another employer's owner are refused, as before. |
| PA0 | **Reproduction.** E is suspended and the pre-fix state is restored with the real rollback. E's owner still sees the queue and verifies the period. |
| PA1 | With E suspended, the queue and the decision are refused as for a non-representative, and the period stays self-declared. |
| PA2 | The same holds for `pending`, `rejected`, `archived` and `draft`. |
| PA3 | Reactivation restores the queue and the decision. The CQrityjob review branch is unaffected. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | PA1.1 |
| NC2 | Only `sp_employer_attestation_queue` pre-fix | PA1.1 |
| NC3 | Only `sp_verifier_decide` pre-fix | PA1.2 |

**Older suite aligned with the new boundary:**
`security_passport_employer_matching_test.sql` 5.1 asserted that a suspended
organisation's owner still reads requests placed before the suspension. That
is the read this PR closes, so 5.1 now expects `SP_NOT_EMPLOYER_REPRESENTATIVE`.
A new 5.4 proves that the request is kept and is back in the queue after
reactivation. Both are on `scripts/db-test.sh`'s mandatory-assertion list.
