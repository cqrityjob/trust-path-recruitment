# Job board: a published or closed advertisement is not editable in place

**Status: PENDING.** It is not merged, and nothing was written to the hosted
database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270130090000_jobs_not_editable_in_place.sql` |
| Rollback | `supabase/rollback/20270130090000_jobs_not_editable_in_place_rollback.sql` |
| Suite | `supabase/tests/jobs_not_editable_in_place_test.sql` (42 assertions) |
| Controls | `scripts/db-test.sh`, "job-board launch-readiness assertions" |

Finding 1 of the launch-readiness audit of the job board.

## 1. Finding (confirmed)

Reproduced on a replayed database, as the real `authenticated` role with a JWT
subject, on a job of the caller's own organisation, and rolled back:

```sql
UPDATE public.jobs SET title_sv = 'x', description_sv = 'x',
       application_method = 'external', application_url = 'javascript:...'
 WHERE id = <a LIVE job>;                       -- UPDATE 1
UPDATE public.jobs SET title_sv = 'x' WHERE id = <an ARCHIVED job>;   -- UPDATE 1
```

Any active member, of any role, could rewrite a live advertisement through
PostgREST. `saveEmployerJobDraft` refuses a non-draft (`JOB_NOT_EDITABLE`) and
writes the audit row; the direct write does neither.
`docs/job-intelligence/jobs-mvp-v1-spec.md` says an employer "cannot edit a
published job's content in place", "trigger-enforced, not merely a UI
restriction".

**Claim re-checked, and narrower than the audit said.** `pending_review` rows
are *not* editable: the update policy (`jobs_employer_update_editable`) admits
`draft`, `rejected`, `published` and `archived` only, so the member's UPDATE
matches 0 rows (NE1.11). The hole is `published` and `archived`. The new branch
covers `pending_review` and `expired` as well, so the rule does not rest on that
one policy.

## 2. Root cause

The rule existed. `20260720170000` carried

```sql
ELSIF OLD.status NOT IN ('draft','rejected') THEN
  RAISE EXCEPTION 'Job is not in an employer-editable state'
```

and, above it, `'A published job cannot be edited in place; close and duplicate
it instead'`. Both disappeared when `jobs_validate_before_write()` was
re-declared from `20260724120000` onward (`CREATE OR REPLACE` re-states the whole
function), and nothing replaced them. `20260814090000` then widened the update
policy to published and archived rows, and `authenticated` holds UPDATE on every
column. The only thing left between a member and a live row was the
archive-immutability list, which applies to a `published -> archived` move and
names 32 columns -- not `salary_*`, the skill ids, `slug`, `expires_at`,
`deadline_at`.

## 3. Correction

One branch in the employer (non-platform-admin) UPDATE path of
`jobs_validate_before_write()`:

```sql
IF current_user IN ('authenticated', 'anon')
   AND OLD.status NOT IN ('draft', 'rejected')
   AND NEW.status IS NOT DISTINCT FROM OLD.status
   AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
  RAISE EXCEPTION 'Job is not in an employer-editable state' USING ERRCODE = 'check_violation';
END IF;
```

- **Whole row, not a column list.** A column added to `jobs` later is protected
  the day it is added. `updated_at` is the only bookkeeping column.
- **Client roles only.** `current_user` is `authenticated` for a direct API
  write and the function owner inside a `SECURITY DEFINER` function, which is how
  `reject_job` and every sanctioned writer reaches the table. This is the same
  distinction `20270119090000` draws for Passport entries, and it leaves the SCP
  suites that edit a published job's title as the database owner exactly as they
  were.
- **Platform admins** are outside the block altogether.
- The body is otherwise the hosted one: `20260906100000`,
  `md5(prosrc) = 7e7477c391e41071f01e599e90c8e1a5`, pinned by the rollback.

After the migration `md5(prosrc) = 9d143a2825ac3b51de8b3a8cabda2bc1`. **Compare
the hosted `md5` of the current body to `7e7477c3...` before applying**: this
repository cannot see the hosted function, only the replay of the chain.

## 4. Legitimate flows (positive tests)

| Assertion | Proves |
|---|---|
| NE2.1-2.3 | Touching `updated_at`, or writing identical values, on a live advert is allowed |
| NE3.1 | `draft -> published` |
| NE3.2, NE3.5 | `draft`/`rejected -> pending_review` |
| NE3.3, NE3.6, NE3.7 | `draft`/`rejected`/`published -> archived` (the close action) |
| NE3.4 | `rejected -> published` |
| NE3.8-3.14 | `archived -> draft` (restore), the restored draft is editable, publishes again, and is then uneditable again |
| NE3.9-3.12 | Drafts and rejected jobs are freely editable; a draft may carry its final edit into `published` |
| NE3.15 | `published -> draft` is still refused by the allow-list |
| NE4.1-4.4 | A platform admin (and a member who is also an admin) still edits live and archived adverts; `reject_job()` still works from `pending_review` and `published` |
| NE5.1-5.2 | A `SECURITY DEFINER` writer and `service_role` are not refused |
| NE1.13 | Another tenant's member still matches no row |

## 5. Negative controls (`scripts/db-test.sh`)

| Control | Planted defect | Fails at |
|---|---|---|
| NE NC1 | The real rollback | NE1.1 |
| NE NC2 | The refusal narrowed to one column | NE1.2 |
| NE NC3 | The refusal applied to every role | NE5.1 |

The suite also reproduces the defect itself (NE0.2): it runs the real rollback in
a savepoint, edits a live and an archived advert as a member, and rolls back.

## 6. Observed, not changed

- **`sweep_expired_jobs()` cannot work.** It flips `published -> expired` as
  `service_role` (`auth.uid()` is NULL, so the employer allow-list applies) and
  the allow-list refuses `published -> expired`. Verified on a replay before and
  after this migration. Nothing schedules it, and a published job stops being
  visible by `job_is_active()` at `expires_at` without a status change, so
  nothing is user-visible today.
- A member can still write moderator-owned columns (`mapping_reviewed_by`,
  `source_type`, `content_hash`, `slug`...) on a **draft**. That is a column
  privilege question, not an in-place edit.

## 7. Grants

No function is created or dropped. `CREATE OR REPLACE` keeps the owner and the
ACL: on the replay `proacl` of `jobs_validate_before_write()` is
`{postgres=X/postgres}` (EXECUTE for the owner only), so there is nothing to
`REVOKE`. Read the hosted ACL together with the `md5` before applying.

## 8. Release order

No application change is needed and none depends on it: the application already
refuses non-drafts. It may be applied before or after any code deploy. It must
be applied before `20270131090000`, which builds on this body.
