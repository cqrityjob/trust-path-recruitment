# P1: only the assignment path may bind an employment record to a person

**Status: PENDING.** This is a separate PR from `origin/main` for P1-3 of the
2026-10-01 pre-release security audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20261231090000_scp_resolve_employment_owner_only.sql` |
| Rollback | `supabase/rollback/20261231090000_scp_resolve_employment_owner_only_rollback.sql` |
| Suite | `supabase/tests/scp_resolve_employment_owner_only_test.sql` (13 assertions) |

## 1. Root cause

`scp_resolve_employment_for_assignment(_employer_id, _email, _subject_id)` is
SECURITY DEFINER. It binds an unbound employment record to a person when exactly
one active record in that employer carries the email. It trusts every argument.
It never asks whether the caller belongs to the employer, or whether the subject
is the caller's.

`20260829097000` granted it to `authenticated` so `scp_employer_assign` could
call it. A definer function owned by the same role does not need that grant.

So any signed-in user, with no employer membership at all, could attach another
employer's employee record to a person of their choosing:

- Employer ids are public through job listings. The attacker needs only the
  employee's email.
- The binding never rebinds, by design. So it also blocks the real employee
  from ever being linked to their record.
- That employer's released results then follow the wrong person.

## 2. Fix

EXECUTE is revoked from PUBLIC, anon and `authenticated`. The function's owner
keeps it.

Its only callers are `scp_employer_assign` and `scp_employment_from_application`.
Both are SECURITY DEFINER functions owned by the same role. They keep calling
it, after their own membership checks, exactly as before. The migration's
precondition refuses to apply if any caller would lose access.

**Not changed:**
- the function body;
- any binding;
- any application code (only the generated types list the function).

## 3. Hosted history (read-only, 2026-10-01)

| Check | Result |
|---|---|
| Employment records | 5 |
| Bound to a person | 2 |
| Bound without an assignment from their own employer | **0** |

## 4. Tests

The suite runs as the real roles, in one transaction that ends in ROLLBACK.

| Group | Proves |
|---|---|
| RB0 | **Reproduction** on the pre-fix grant, restored with the real rollback inside a savepoint. A user with no membership binds another employer's employee record to their own subject. The employer's later assignment then cannot link the real employee. |
| RB1 | After the fix, the direct call is refused for a non-member, for the employer's own owner, and for anon. Nothing is bound. |
| RB2 | The real path still binds: the employer assigning by email alone links the record to the person it assigned. |
| RB3 | No client role may execute the helper. Every caller runs as its owner, and both callers are present. |

The existing `scp_person_spine_test` (S1.3, RE1–RE4) also keeps proving the
binding rules through the real assignment path.

**Negative controls in `scripts/db-test.sh`.** Each control must make the suite
fail on an assertion:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | RB1.1 |
| NC2 | The grant given back through PUBLIC | RB1.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
