# P1: a candidate creates an application, never the employer's side of it

**Status: PENDING.** This is a separate PR from `origin/main` for P1-1 and P1-2
of the 2026-10-01 pre-release security audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20261230090000_job_application_insert_boundary.sql` |
| Rollback | `supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql` |
| Suite | `supabase/tests/job_application_insert_boundary_test.sql` (44 assertions) |
| Server | `src/lib/job-intelligence/applications.functions.ts` (`getApplicationCvSignedUrl`) |

## 1. Root cause

`job_applications_owner_insert` checked one thing: `applicant_user_id = auth.uid()`.
Every column was granted for INSERT to `authenticated`. A candidate posting
straight to `/rest/v1/job_applications` could create an application that was:

- already `hired`, `interview` or `rejected`, with no status event behind it;
- carrying an `employer_note`, which the employer then reads through
  `rec_application_employer_note()` as if a colleague had written it;
- dated with a `created_at`, `updated_at` or `withdrawn_at` of their choice;
- a `cqrityjob_cv` application whose `cv_document_snapshot` the candidate wrote
  themselves. That skips the fact verification `sp_submit_application_with_cv_source`
  runs, which `20261102090000` names as the guarantee that an employer never
  reads a fabricated CV;
- **(P1-2)** pointing `cv_storage_path` into another person's CV folder. This
  works through the submission RPC too, which takes the path as a parameter.
  `getApplicationCvSignedUrl` signs the stored path with service-role access,
  and `job_cvs_employer_select` shows the object to the employer the row names.

## 2. Fix

Two independent database layers, plus the server:

1. **Column privileges.** `authenticated` may INSERT exactly the 13 columns
   `sp_submit_application_with_cv_source` writes. That function is the only
   legitimate writer and runs as the caller. `status`, `employer_note`,
   `withdrawn_at`, `created_at` and `updated_at` take their defaults.
   `employer_id` is stamped from the job by the existing trigger.
2. **The insert policy restates the rule as a row check**, so it holds even
   where a stack's default privileges grant every column back:
   - the status is `submitted`, with no note and not withdrawn;
   - both timestamps are `now()`;
   - an uploaded CV's path is `<auth.uid()>/<this application's id>/<file>`,
     with the file name in the `[A-Za-z0-9._-]` set the server produces;
   - a CqrityJob CV's snapshot equals `cv_owned_application_snapshot(cv_document_id)`.
     That function raises if the document is not the caller's, not ready, or
     has stale facts.
3. **Server.** `getApplicationCvSignedUrl` refuses to sign a path outside that
   folder. This covers a row written before this migration, or by any other
   writer.

**Not changed:**
- `sp_submit_application_with_cv_source` and `rec_submit_application`;
- every UPDATE path (there is no candidate UPDATE policy);
- the employer and admin read paths;
- the storage bucket policies;
- any stored row.

## 3. Hosted history (read-only, 2026-10-01)

| Check | Result |
|---|---|
| Applications | 14 |
| With a CV path | 10 |
| Path outside `<applicant>/<application>/` | **0** |
| Non-submitted application with no status event | 0 |
| Employer note on a never-updated row | 0 |
| `withdrawn_at` set but status not `withdrawn` | 0 |

The migration refuses to apply if any stored path is off the rule.

## 4. Tests

The suite runs as the real `authenticated` role. It goes through the real
submission functions and also straight at the table, the way PostgREST sends it.

| Group | Proves |
|---|---|
| JA0 | **Reproduction** on the pre-fix boundary, restored with the real rollback inside a savepoint. A hired, back-dated application carries an employer note the employer reads as its own. The RPC stores a path in the victim's folder. A composed CV snapshot is accepted. |
| JA1 | Upload, CqrityJob CV, no-file and replayed submissions still work and are stored in their initial state. |
| JA2 | Every forged field is refused at the table: status, note, `withdrawn_at`, both timestamps, `employer_id`, another applicant. The same insert with only candidate columns is accepted. |
| JA3 | A path in the victim's folder (RPC and table), under another application, a traversal, a dotted name, or no name is refused. Any name the server produces is accepted. |
| JA4 | A composed snapshot, a foreign document, and a snapshot gone stale are refused. The database's own snapshot is accepted. |
| JA5 | Privileges and policy shape. |
| JA6 | With every column granted back, the row check alone refuses each forged field. |

**Negative controls in `scripts/db-test.sh`.** Each control must make the suite
fail on an assertion:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | JA2.1 |
| NC2 | The original row check, column grants kept | JA3.1 |
| NC3 | The row check without the CqrityJob snapshot rule | JA4.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
