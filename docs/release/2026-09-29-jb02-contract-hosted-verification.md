# Hosted verification — 20261226090000 (JB-02 CONTRACT), with the end-to-end privacy proof

**Read-only.** Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, 2026-09-29 13:29–13:31 UTC, after the owner published the site from `main` at ≥ `d8f6266` (#329, the three moved reads, live) and merged PR #330 as `a2061fe` (13:27 UTC), and the official Supabase GitHub integration applied the migration. No hosted write, no behavioural mutation: every probe below is a `SELECT` inside a transaction that ends in `ROLLBACK`, with `SET LOCAL ROLE` and the real JWT `sub` of an existing account.

## Migration

| Check | Result |
|---|---|
| Ledger row | `20261226090000` / `application_notes_column_privileges`, 8 statements, the 329th and highest row |
| Ledger snapshot | `hosted-ledger.json` refreshed to all 329 rows; digest of `version:name` `818869f89fa9f0e61dcd40378bb83255` on the connector read and on the file |
| `authenticated` on `job_applications` | no table-level SELECT; column SELECT on the listed columns (`status` true) and **not** on `employer_note`; INSERT kept |
| `authenticated` on `job_application_status_events` | no table-level SELECT; column SELECT on `new_status` true and **not** on `note` |
| `anon` | no SELECT on `job_applications` |
| `service_role` | still reads `employer_note` |
| Grants vs local replay | identical (`false false true false true` for employer_note / note / status / table SELECT / INSERT) |
| `rec_application_status_events(uuid)` | unchanged, md5(prosrc) `5b4581066812f949938e0ddf129741e9`; SECURITY DEFINER; anon cannot execute |
| `rec_application_employer_note(uuid)` | unchanged, md5 `d018031ed27b9279ad900742c9fd2bb7`; SECURITY DEFINER; anon cannot execute |
| Policies | `job_applications` 5, `job_application_status_events` 3; digest `a5b8d75fa927deb13fcd6a412b07d69f` equal to the local replay: no policy changed |
| Rows | 14 applications, 24 status events, unchanged; exactly one application and one event carry a note |

## End-to-end privacy boundary (the one application that carries a note)

| Caller (real account, JWT `sub` set) | Probe | Result |
|---|---|---|
| The applicant | `SELECT auth.uid(), id, status FROM job_applications WHERE id = …` | own row returned (`uid` = the applicant, status `rejected`) |
| The applicant | `SELECT employer_note FROM job_applications WHERE id = …` | **`permission denied for table job_applications`** |
| The applicant | `SELECT note FROM job_application_status_events WHERE application_id = …` | **`permission denied for table job_application_status_events`** |
| The applicant | `rec_application_employer_note(…)` | **`REC_NOT_MEMBER`** |
| The applicant | `rec_application_status_events(…)` | **`REC_NOT_MEMBER`** |
| Active member of the owning employer (not an admin) | `rec_is_member(employer)`; the two functions | `true`; the 129-character note; 3 events, 1 with a note |
| Active member of the owning employer | `SELECT employer_note FROM job_applications WHERE id = …` | **`permission denied`** (members read through the function only) |
| Active member of another employer, not an admin | `rec_is_member`, row visibility, the two functions | `false`; 0 rows visible; **`REC_NOT_MEMBER`** from both |
| Platform admin (`user_roles.role = admin`) | `rec_application_employer_note(…)` | the note (admitted by design: the functions accept `is_platform_admin`) |
| `anon` | `SELECT count(*) FROM job_applications` | **`permission denied`** |

Gate item 11 of the 2026-09-28 UAT (`GET /rest/v1/job_applications?select=employer_note` as the applicant returns a column error, not the note) is therefore satisfied at the database boundary; PostgREST maps the same privilege error to HTTP 401/403.

## Release state after this record

Every migration of the 2026-09-28 UAT fix set (20261222090000, 20261223090000, 20261224090000, 20261225090000, 20261226090000) is applied on the owner project and recorded; `scripts/release-frontier-check.ts` expects nothing pending.
