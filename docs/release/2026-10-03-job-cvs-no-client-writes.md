# Job board: the candidate-CV bucket has no client write path

**Status: PENDING.** It is not merged, and nothing was written to the hosted
database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270201090000_job_cvs_no_client_writes.sql` |
| Rollback | `supabase/rollback/20270201090000_job_cvs_no_client_writes_rollback.sql` |
| Suite | `supabase/tests/job_cvs_no_client_writes_test.sql` (22 assertions) |
| Controls | `scripts/db-test.sh`, "job-board launch-readiness assertions" |

Finding 8 of the launch-readiness audit of the job board.

## 1. Finding (confirmed)

`20260721085020` gave an applicant, through Supabase Storage with their own JWT,
INSERT, UPDATE, DELETE and SELECT on every object under `<their uid>/...` in the
private `job-application-cvs` bucket
(`job_cvs_applicant_insert|update|delete|select`;
`docs/security/2026-09-27/production-metadata.json` lists all five policies as
live). Reproduced against the real policies as `authenticated` (CV0.1-0.3):

1. A candidate **replaces or deletes the CV of an application already
   submitted** -- after the employer has opened it, screened on it or exported it.
   `job_applications.cv_storage_path` keeps pointing at the object, so the
   employer's CV button serves whatever the candidate put there, or nothing.
2. A candidate **plants any bytes** at `<uid>/<application id>/<file>` and
   inserts the application row directly with that path (the row policy
   `job_applications_owner_insert`, `20261230090000`, accepts exactly that path
   shape). That skips the checks `submitJobApplication` makes before anything is
   stored: the `%PDF-` magic number and the 5 MB limit.

## 2. Does anything depend on those policies? No.

The audit step the brief asks for first. Every Storage call on this bucket in
`src/`, `supabase/functions/`, `scripts/` and `e2e/` is made with the **service
role** (`supabaseAdmin`), which bypasses RLS:

| Call | Where |
|---|---|
| `upload` (the CV) | `applications.functions.ts` `submitJobApplication` |
| `remove` (clean-up of a failed submission) | `applications.functions.ts` |
| `createSignedUrl` (applicant and employer reads) | `applications.functions.ts` `getApplicationCvSignedUrl` |
| `remove`, `getBucket` (erasure sweep) | `admin-storage-erasure.functions.ts` |
| `getBucket`, `createBucket` | `scripts/passport-regression-application.mjs` |

No browser code calls `.storage.from(...)` on it. The other buckets that do
(`passport-evidence`, `sw-documents`) have their own policies and are not
touched. The code comment "zero client-facing policies" was the intent; this
migration makes it true for writes.

## 3. Correction

Drop `job_cvs_applicant_insert`, `_update`, `_delete` **and `_select`**. Nothing
reads the bucket as the applicant either, so there is no reason to keep the
SELECT (the brief: keep it only if the browser reads its own file directly).

**Kept: `job_cvs_employer_select`.** An active member of the employer a stored
path belongs to may read that one object -- the authorisation
`getApplicationCvSignedUrl` applies, and read-only. Nothing uses it either;
removing it is a separate decision, so the comment is still not literally "zero".

**`job_applications_owner_insert` needs no change.** It already pins
`cv_storage_path` to `<own uid>/<this application's id>/<file>` (CV4.1, 4.2).
With no client write path into the bucket, the only object that can exist at such
a path is one the server stored after its checks. A directly-inserted row can
still carry a path to an object that does not exist; that is a broken download,
not a way to serve other content.

The postflight fails the migration (and so rolls it back) if any client write
policy that names the bucket remains.

## 4. Tests

| Assertion | Proves |
|---|---|
| CV0.1-0.3 | **Reproduction**: with the four policies back (the real rollback, in a savepoint) the candidate replaces, plants and deletes |
| CV1.1-1.6 | The candidate can no longer store, replace, delete or list; the stored CV is exactly what the server stored |
| CV2.1-2.3 | Another candidate, and a member of an unrelated employer, reach nothing |
| CV3.1-3.3 | The employer member still reads (read-only); the server (service role) still uploads and cleans up |
| CV4.1-4.2 | A directly-inserted application cannot point at another person's object, or at an object of a different application |
| CV5.1-5.3 | Policy inventory: exactly one policy left on the bucket |

Negative controls (`scripts/db-test.sh`):

| Control | Planted defect | Fails at |
|---|---|---|
| CV NC1 | The real rollback | CV1.1 |
| CV NC2 | Only the applicant INSERT policy back | CV1.1 |
| CV NC3 | Only the applicant DELETE policy back | CV1.4 |

## 5. Release order

No application change is needed and none depends on it; it may be applied before
or after any code deploy. **Before applying (read-only):** list every policy on
`storage.objects` and confirm none other than those admits a client write to this
bucket without naming it (a bucket-agnostic one this repository does not hold --
the postflight only sees policies that name the bucket).
