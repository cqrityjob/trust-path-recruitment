# P1-L: an employer creates an assessment assignment as an invitation only

**Status: PENDING.** This PR fixes P1-L of the 2026-10-02 final hostile-user
audit. It is not merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270118090000_assessment_assignment_insert_columns.sql` |
| Rollback | `supabase/rollback/20270118090000_assessment_assignment_insert_columns_rollback.sql` |
| Suite | `supabase/tests/assessment_assignment_insert_columns_test.sql` (11 assertions) |

## 1. Root cause

`authenticated` held table-level INSERT on `assessment_assignments`. The only
row rule, `assignments_employer_insert`, requires an owner or admin of an
active employer. An owner or admin could therefore create a row directly
through PostgREST that was already `completed` and carried any `engine_result`,
`answers`, `completion_id` and `completed_at`. This skipped the server
computation in `completeAssessmentAssignment`.

The invented result then showed up in three places:
- the employer and admin result views;
- `getMyLinkableAssignments`, which offered it to whoever owns `recipient_email`;
- that person's My Career reports, because `claimAssessmentAssignment` then wrote the report there with the service role.

On production a rolled-back probe as a real owner produced
`inserted=t status=completed forged_engine_result=true`.

## 2. Fix

INSERT is revoked from client roles. It is granted back on exactly the
columns that `createAssessmentAssignment` sets:
`employer_id`, `assessment_id`, `assessment_version_id`, `profile_id`, `use_case`,
`job_id`, `application_id`, `employee_id`, `recipient_email`,
`recipient_user_id`, `assigned_by`, `language`, `employer_message`,
`invitation_token_hash` and `expires_at`.

Because `status` is no longer client-insertable, it takes its default,
`invited`. The lifecycle and result columns stay with the server's
service-role paths and the SECURITY DEFINER SCP functions.

**Not changed:**
- the insert policy;
- UPDATE, which already allows only `status` and `cancelled_at`;
- SELECT;
- the completion path;
- any row.

## 3. Hosted state (read-only, 2026-10-02)

Production has 0 completed legacy assignments without a run, so there is
nothing to repair.

## 4. Tests

| Group | Proves |
|---|---|
| FA0 | **Reproduction.** With the pre-fix grant restored by the real rollback, the owner creates an already-completed assignment with an invented result. |
| FA1 | After the fix, `status`, `engine_result`, `answers`, `completion_id`, `completed_at` and `started_at` are each refused on creation (42501). No forged row exists. |
| FA2 | The application's own create shape still works, and the row it creates is an invitation. |
| FA3 | No client role holds table-level INSERT, and anon may insert nothing. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | FA1.1 |
| NC2 | Only `status` and `engine_result` insertable again | FA1.2 |
