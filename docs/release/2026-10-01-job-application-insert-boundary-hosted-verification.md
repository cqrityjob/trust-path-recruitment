# Job application insert boundary: hosted verification

**Status: APPLIED and verified read-only on production `wrygicdfxwjnrugduxnt`.**
Merging PR #353 to `main` as `e81a1dc` (head `7d34635`, CI fully green)
triggered the official Supabase GitHub integration, which applied
`20261230090000_job_application_insert_boundary.sql`. This verification wrote
nothing to the hosted database. Every statement was a read. The behavioural
probe ran inside a transaction that ended in `RAISE`, so it was rolled back.

Change and contract: `docs/release/2026-10-01-job-application-insert-boundary.md`.

## Ledger

| Check | Result |
|---|---|
| `supabase_migrations.schema_migrations` | 333 rows; highest is `20261230090000 / job_application_insert_boundary`, 7 statements |
| Previous 332 identities | preserved |
| md5 of `version:name` joined by newline, all 333 rows | `f5124acc449b8ceaddf92d648c882ab8`, equal on the connector read and in `supabase/hosted-ledger.json` |

## Objects

| Object | Hosted state |
|---|---|
| `job_applications_owner_insert` WITH CHECK | md5 `9b4e935fd294a2d71dcd868e158e0efd`, equal to a strict local replay of the merged file. It carries the initial state, the path rule and the `cv_owned_application_snapshot` check. |
| `authenticated` INSERT columns | exactly the 13 the submission function writes (md5 of the list `532db38a1fd8fd5b0717092881eee9b7`, equal to the replay). `status`, `employer_note`, `withdrawn_at`, `created_at`, `updated_at` and `employer_id` are not granted. |
| anon INSERT | none |

## Data

| Measure | Value |
|---|---|
| Applications | 14, unchanged |
| CV path outside `<applicant>/<application>/` | 0 |

## Behaviour (rolled-back probe)

The probe ran as a real candidate, using `SET LOCAL ROLE authenticated` and the
candidate's real JWT `sub`. It called `rec_submit_application` on a published
internal job with no required questions:

| CV path submitted | Result |
|---|---|
| In another applicant's folder | refused: `42501` row-level security |
| In the candidate's own folder for this application | accepted, status `submitted` |

The transaction ended in `RAISE`, so it was rolled back and no row was written.

## Not covered by this database read

The server-side half of P1-2 (`getApplicationCvSignedUrl` refusing a path
outside the applicant's folder) ships with the application build, not with
the migration. This note does not verify that deploy.

## Bookkeeping in this change

- `supabase/release-state.json`: the entry is now `applied`, with this evidence.
- `supabase/hosted-ledger.json`: refreshed to all 333 rows.
- `scripts/release-frontier-check.ts`: `expectedPending` is empty again.
