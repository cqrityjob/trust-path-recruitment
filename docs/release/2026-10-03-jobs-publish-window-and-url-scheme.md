# Job board: publishing needs a live window and a web address

**Status: PENDING.** It is not merged, and nothing was written to the hosted
database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270131090000_jobs_publish_window_and_url_scheme.sql` |
| Rollback | `supabase/rollback/20270131090000_jobs_publish_window_and_url_scheme_rollback.sql` |
| Suite | `supabase/tests/jobs_publish_window_and_url_scheme_test.sql` (40 assertions) |
| Server | `employer-jobs.functions.ts`, `admin.functions.ts`, `job-readiness.ts`, `application-url.ts` |
| Guard | `bun run job-board-launch:check` |

Findings 2 and 7 of the launch-readiness audit of the job board.

## 1. Findings (confirmed)

Both reproduced on a replayed database as an `authenticated` member, and rolled
back (PW0.2, PW0.3 re-run them against the pre-fix body on every suite run).

**A. Restore -> Publish published an advertisement nobody could see.**
`restoreEmployerJob` returns a closed advert to `draft` and keeps its dates.
After its `expires_at` had passed:

```
draft -> published      published_at = now()   expires_at = 2 days ago
job_is_active(...)      false
```

The trigger refused an `expires_at` too far out (more than 90 days after
`published_at`) but never one in the past. The ad never appeared in `/jobs`; the
employer's hub showed the phase "closed" and no error. `checkJobReadiness` and
`publishEmployerJob` checked only that `expires_at` was set.

The second scenario in the audit -- an old `deadline_at` -- was already refused by
the trigger (`deadline_at must be on or after published_at`), but the
application mapped **every** `23514` to `INVALID_JOB_DATA`, whose message tells
the employer to check workplace type, employment form and career area. None of
which is the problem.

**B. `application_url` accepted any scheme.** The trigger required only a
non-empty value for an external application; zod's `.url()` accepts
`javascript:alert(1)`; the apply dialog puts the value in an anchor. A member
could save `javascript:...` on a draft, publish it, and have it **live**
(`job_is_active` true) as the apply link.

## 2. Correction

**Database** (`jobs_validate_before_write()`, on top of `20270130090000`):

1. On the act of publishing (insert, or a move into `published`), for every
   caller: `expires_at` must be in the future. A later write to a row that is
   already published is not held to it, so a moderator can still correct an
   advert that has run its course (PW1.10).
2. `application_url` is validated **when it is written** (an insert, or an update
   that changes it): `^https?://` followed by a host, anchored, case-insensitive.
   A stored row that holds anything else is tolerated -- it can still be closed,
   rejected, archived or edited in any other column (PW4.1, 4.5, 4.6).
3. A row being **published** with `application_method = 'external'` must carry
   such an address, however it was stored (PW4.2). A row whose method does not use
   the address is not held to a leftover (PW4.4).

No `CHECK` constraint: even `NOT VALID` would refuse every unrelated UPDATE of a
legacy row. `application_email` and the `mailto:` link are untouched.

After the migration `md5(prosrc) = bc292d28d31dd973c81f1cffc145b5bf`.

**Application:**

- `publishDateProblems()` (pure, in `job-readiness.ts`) states the rules once:
  `expires_at` after now, at most 90 days ahead, `deadline_at` not before now.
  `publishEmployerJob` throws `EXPIRES_AT_IN_PAST`, `EXPIRES_AT_TOO_FAR` or
  `DEADLINE_IN_PAST` before it writes; `checkJobReadiness` shows two new blocking
  checklist lines (`expiresWindow`, `deadline`) so the hub disables Publicera and
  names the date. Each has its own sv/en sentence.
- The bound is **90 days, not the 89 of `MAX_EXPIRY_DAYS_OFFERED`.** That 89 is a
  date-picker rule (a chosen day is stored as 23:59, so day 90 could land after
  `published_at + 90 days`). A server check on the stored timestamp at 89 days
  would refuse a value the form itself offered in the morning.
- `sanitizeJobWriteError` maps a `23514` whose message is one of the trigger's
  fixed rule sentences to that rule's own code (also `JOB_NOT_EDITABLE`,
  `APPLICATION_URL_INVALID`); the text is compared against, never forwarded.
  Anything else stays `INVALID_JOB_DATA`.
- `application_url` is `trim().url().refine(isHttpApplicationUrl)` in the
  employer **and** the admin schema; duplicating an advert does not copy an
  address the database would now refuse; `JobApplicationPanel` and
  `ExternalApplyDialog` never build an anchor from anything but a web address,
  which protects the rows already stored.

## 3. Legitimate flows (positive tests)

| Assertion | Proves |
|---|---|
| PW1.4 | Correct the date and the restored advert publishes and is visible |
| PW1.7 | A minute ahead and 89 days ahead publish |
| PW1.9 | A moderator publishes a pending advert with a future date |
| PW1.10-1.11 | An already-published advert past its date can still be corrected by an admin and closed by the member |
| PW3.13 | Upper-case scheme, port, query and fragment are accepted; NULL and `''` are allowed |
| PW4.x | Legacy rows are tolerated and checked at publication |
| PW5.1 | Email and internal adverts publish exactly as before |

## 4. Negative controls (`scripts/db-test.sh`)

| Control | Planted defect | Fails at |
|---|---|---|
| PW NC1 | The real rollback | PW1.1 |
| PW NC2 | Only the `expires_at` rule disabled | PW1.1 |
| PW NC3 | Only the address rules disabled | PW3.1 |

`job-board-launch:check` has planted controls for the application half
(`negative-controls:job-board-launch`).

## 5. Grants

No function is created or dropped; `CREATE OR REPLACE` keeps the owner and the
ACL of `jobs_validate_before_write()` (EXECUTE for the owner only on the replay),
so there is nothing to `REVOKE`.

## 6. Release order (expand/contract)

The application checks the same three things first and works unchanged
**before** this migration is applied. Applied first, the database refuses the
same cases and the application shows its specific sentence for the trigger's
text. Either order is safe. Requires `20270130090000` applied first.

**Hosted pre-check (read-only, not required to apply):**

```sql
SELECT count(*) FROM public.jobs
 WHERE application_url IS NOT NULL AND btrim(application_url) <> ''
   AND application_url !~* '^https?://[^/?#[:space:]]+';
```

The migration reports the same count as a `NOTICE` and changes none of them.
Whether to clean those rows is a separate decision.
