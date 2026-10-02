# P1: development recommendations show an employer only its own evidence

**Status: APPLIED.** Merged and verified on production on 2026-10-02. See
`docs/release/2026-10-02-security-gate-blockers-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270104090000_scp_development_recommendations_employer_scope.sql` |
| Rollback | `supabase/rollback/20270104090000_scp_development_recommendations_employer_scope_rollback.sql` |
| Suite | `supabase/tests/scp_development_recommendations_scope_test.sql` (16 assertions) |

## 1. Root cause

`scp_development_recommendations(_subject_id)` is SECURITY DEFINER. Any active
member of any organisation with one released attempt for the person passed its
gate. The function then:

- chose modules from **all** of the person's evidence, including evidence that
  other employers' assessments wrote;
- labelled each one with a maturity level from `scp_compute_maturity`, which
  also counts every employer's evidence.

The employer results page calls it in normal use. So employer A learnt, in
derived form, which competencies employer B had assessed and how the person did
there. Hosted had 2 people with released attempts from two or more employers.

## 2. Fix

For an employer caller, the function first works out which organisations'
evidence it may use. These are the organisations the caller is an active
member of that have a released attempt for the person, the same gate as before.
Then:

- only evidence those organisations issued can select a module;
- the level comes from `scp_compute_maturity_for_issuers`, a new private
  helper. It is `scp_compute_maturity`'s body verbatim plus one filter on the
  issuing organisation. No client role can execute it.

The participant branch is unchanged. The participant still reads everything of
their own, levelled by `scp_compute_maturity` exactly as before.

**Not changed:**
- `scp_compute_maturity`;
- the gate, the columns, the ordering, the module filters and the grants;
- any row.

## 3. Tests

The person is assessed by two employers. Employer 1's evidence covers
competency A only. Employer 2's evidence covers A, with more and better
observations, and also competency B.

| Group | Proves |
|---|---|
| DR0 | **Reproduction** on the pre-fix body, restored with the real rollback inside a savepoint. Employer 1 gets the B module, which only employer 2's evidence selects. Employer 1 also sees A levelled with employer 2's observations. |
| DR1 | Employer 1 gets only A modules, levelled from its own single observation. A plain member gets the same. |
| DR2 | Employer 2 gets its A and B modules, levelled from its own evidence. |
| DR3 | The participant gets everything, levelled exactly as `scp_compute_maturity` levels it. A member of both employers gets the union. Over every issuer, the helper agrees with `scp_compute_maturity`. |
| DR4 | A suspended member, an unrelated employer's owner and anon get nothing. No client role may run the helper. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | DR1.1 |
| NC2 | Rows scoped to the caller's evidence, but levels still computed over all of it | DR1.2 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
