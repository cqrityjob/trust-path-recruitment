# P1: a suspended employer reads no applicant through the definer functions

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-3 of the
2026-10-02 pre-launch hostile-user audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270105090000_suspended_employer_applicant_reads.sql` |
| Rollback | `supabase/rollback/20270105090000_suspended_employer_applicant_reads_rollback.sql` |
| Suite | `supabase/tests/suspended_employer_applicant_reads_test.sql` (18 assertions) |

## 1. Root cause

An employer's read of `job_applications` is gated twice: an active membership
**and** an active organisation. Both the table's policy
(`has_employer_role(...) AND employer_is_active_status(employer_id)`) and the
`rec_*` functions check both. Three SECURITY DEFINER functions that read an
application for its employer checked only the membership:

| Function | Returns |
|---|---|
| `scp_application_candidate` | name, phone, cover note, status, subject |
| `scp_application_assessments` | the candidate's assessment attempts |
| `sp_application_disclosure` | the candidate's Passport disclosure, and counts an access |

On production, a rolled-back probe suspended an employer. Row-level security
then returned 0 applications, but these functions still returned the
applicant's data to the employer's members.

## 2. Fix

Each function now also requires `employer_is_active_status(_employer)`. When the
organisation is not active, the function gives the same empty answer it already
gives a non-member. A suspended organisation therefore cannot tell "suspended"
from "not there".

Only the gate changes. Each body is otherwise the hosted body verbatim.

**Not changed:**
- columns, payloads and grants;
- the candidate's own paths and the admin paths;
- any row.

## 3. Hosted state (read-only, 2026-10-02)

- **Employers:** 11, all `active`, with 14 applications. No organisation is
  suspended today, so nothing is exposed now. The gap opens the first time an
  employer is suspended.
- **Bodies:** all three hosted bodies equal the md5 values the rollback pins.

## 4. Tests

The employer is suspended and reactivated through the real `moderate_employer()`,
as a platform admin.

| Group | Proves |
|---|---|
| SE-F | While the employer is active, its owner and a plain member read the applicant, their assessment and their disclosure. |
| SE0 | **Reproduction.** The employer is suspended and the pre-fix bodies are restored with the real rollback inside a savepoint. Row-level security hides the application, but the owner still reads all three through the functions. |
| SE1 | With the employer suspended, owner and member read nothing, and get exactly the answer a non-member gets. The refused reads are not counted as disclosure accesses. |
| SE2 | The same holds for `pending`, `rejected`, `archived` and `draft`. |
| SE3 | Reactivation restores every read. The applicant's own read is unaffected throughout. |
| SE4 | Another employer's owner, a suspended member of an active employer, and anon are all still refused. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | SE1.1 |
| NC2 | A deny-list that refuses only a `suspended` organisation | SE2 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
