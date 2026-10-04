# Account erasure: the whole call path, on a disposable local stack (2026-10-04)

Owner instruction: use #416 as the dependency for erasure, check its merge and application
status, and do not mark erasure verified until the whole call path has been tried with a
synthetic account that has the relevant Passport underlag.

## Status of the dependency

| | |
|---|---|
| #416 `20270208090000` | merged to `main` as `abbc036e` |
| Applied to production | yes; the ledger has 370 rows, the last is `20270208090000 account_erasure_credential_details` (#418, read-only verification 2026-10-04 07:56 UTC) |
| Function hashes in production | `admin_delete_user_if_safe` `e44122cc…`, `sp_evidence_extractions_append_only()` `51ce2c13…`, equal to the strict local replay |

## What was run

`e2e/account-erasure-full-path-local.spec.ts`, in a real browser (Chromium), against the
disposable local stack (`scripts/local-stack/`): real PostgreSQL 16 with every migration replayed,
real PostgREST 12.2.3 enforcing real RLS, the checked-in application with its real routes and
server functions, and the stack's GoTrue stand-in.

Synthetic data (`scripts/local-stack/erasure-fixture.sql`): a superadmin who signs in, and a
candidate whose Security Passport holds exactly what #416 had to learn to erase: a credential's
details (`sp_credential_details`), an uploaded document (`sp_evidence`, with a storage path) and a
reading of that document (`sp_evidence_extractions`), plus the candidate's own feedback
(`beta_feedback`).

The path: the browser signs in as the superadmin, opens the candidate in the admin console,
presses "Delete this account permanently", reads the database's impact preview, gives a reason and
the account's address, and confirms. That calls the application's server function
`adminDeleteUser`, then PostgREST, then `admin_delete_user_if_safe`, then the application's
storage erasure sweep.

## Result (passed)

| After the erasure | Result |
|---|---|
| Credential details (`sp_credential_details`) | gone (removed as dependents of the claim, 1) |
| Reading of the document (`sp_evidence_extractions`) | gone (1) |
| Passport claim and evidence rows | gone |
| Profile | gone |
| Sign-in identities | gone (0) |
| The Auth account | **a tombstone**: address replaced by `raderad+<id>@removed.invalid`, metadata empty, banned to 2126. It survives because retained records keep their foreign keys. |
| Record of the erasure (`deleted_accounts`) | one row: when, by whom, the reason typed by the administrator |
| The uploaded file | **queued** for deletion in `storage_erasure_queue` (`passport-evidence`, 1 object); the sweep ran at once |
| The browser | returned to the user list with a banner that 1 storage object is still owed |

**Negative control, run.** With migration `20270208090000` rolled back on the same stack
(`supabase/rollback/20270208090000_account_erasure_credential_details_rollback.sql`), the same spec
fails: the dialog ends with "The action could not be completed.", the page does not leave the
person, and nothing is erased. That is the defect #416 corrected (the function refused a holder of
credential details or a reading), now seen through the browser.

## What this does NOT verify, and what was found

1. **The Storage deletion itself.** The stack has no Supabase Storage, so the sweep's HTTP call could
   not succeed here: the object stayed queued with its error recorded, which is the documented
   behaviour (the account is erased and the object is a separate, retryable obligation). The
   production run below did not settle it either: the holder had already deleted the file, so the
   queued object was already absent. Deleting a Storage object that is still present is proven
   only by the sweep's own tests, not end to end in production.
2. **GoTrue.** The stack's gateway signs the JWT; the spec writes the `auth.sessions` row that
   real GoTrue writes at sign-in, because the Passport write guard requires a live session. The
   gateway also gained the two Auth Admin reads the admin console makes (`GET /auth/v1/admin/users`
   and `/admin/users/:id`, service role only) and a service-role key in `.env.local`.
3. **FINDING, the audit row keeps the erased address.** `audit_logs` has an `action = 'user_deleted'`
   row whose metadata holds the account's e-mail address and the reason text. The policy says the
   person's data is erased within 30 days. The address stays in the audit log for as long as audit
   logs are kept, and the owner has not decided that period (`retention-plan.ts`, row
   `admin-audit`). Either the owner decides a period and the policy says that the audit log keeps
   the address of an erased account for that time, or a later migration stops writing the address
   into the audit row. Until then the policy does not promise more than this. In the runbook the
   reason is the date of the request, never anything about the person.
4. **FINDING, a banned tombstone keeps a password hash.** The tombstone's `encrypted_password` is
   not cleared. It cannot sign in (banned, no identity, no usable address), but an erasure that
   cleared it would be cleaner. Not changed here.
5. **Feedback** (`beta_feedback`) survives with its link to the tombstone, which holds no identity,
   and follows its own 12-month row. The impact preview calls this "detached"; in the tombstone form
   the row keeps the id of the identity-free tombstone rather than a null. Nothing identifies the
   person from it, but the free text is the person's own words and stays up to 12 months.

## The production run (2026-10-04, done)

The synthetic candidate account `8a0fdbc5-…` (it held Passport underlag: one credential detail and
one evidence file) was closed permanently by a superadmin through the admin UI at 08:00:19 UTC, as
form `erasure`. The read-only check afterwards is in
`docs/release/2026-10-04-test-round-cleanup.md` section 5 and the run is logged in
`docs/legal/retention-execution-log.md`:

- removed: 1 `sp_credential_details`; 0 identities, sessions, refresh tokens, claims, evidence,
  orphaned credential details, profile, CV, experience or role rows;
- kept because other parties' records reference them (anonymised): 3 revoked share links, 1 job
  application with its status event, 1 cancelled assessment assignment;
- 1 `deleted_accounts` tombstone; audit rows `user_anonymised` and `user_deleted` kept; the address
  pseudonymised and free to register again;
- Storage: 1 `passport-evidence` object queued and already absent (the holder had deleted the file
  earlier), so the queue row is settled and 0 objects remain. **This is the one thing the run did
  not exercise:** deleting a file that is still there.

The `account` row in `retention-plan.ts` is therefore `live`, with that caveat written into its
evidence. If a real request ever has a file still in the bucket, runbook R1 step 4 applies and the
count goes in the log.

## Re-running this evidence

```
scripts/local-stack/up.sh --reseed        # a freshly seeded database (the fixture loads once)
psql -d beskt_e2e -f scripts/local-stack/erasure-fixture.sql
ERASURE_FULL_PATH_LOCAL=1 E2E_BASE_URL=http://127.0.0.1:3119 bunx playwright test e2e/account-erasure-full-path-local.spec.ts --project=chromium
```

The spec refuses to run unless the database is the disposable local `beskt_e2e` on loopback and the
base URL is loopback. It is not part of CI: CI has no local stack for it.
