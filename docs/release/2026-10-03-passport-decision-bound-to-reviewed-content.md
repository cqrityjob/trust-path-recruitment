# Passport: a review decision is bound to the content the reviewer saw

**Status: PENDING.** It is not merged, and nothing was written to the hosted
database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270125090000_sp_decision_bound_to_reviewed_content.sql` |
| Rollback | `supabase/rollback/20270125090000_sp_decision_bound_to_reviewed_content_rollback.sql` |
| Suite | `supabase/tests/sp_decision_bound_to_reviewed_content_test.sql` (20 assertions) |
| Race | `scripts/db-test.sh`, "Passport answer/decision race" |

## 1. Finding (confirmed)

Reproduced on current main:

1. A reviewer opens a candidate's employment period. It shows "Väktare,
   started 400 days ago".
2. The reviewer requests a clarification.
3. The holder answers by changing the period to "Säkerhetschef, 3000 days".
   20270119090000 returns the request to `pending`.
4. The reviewer approves from the page that still shows the old content.

**Result:** `verified|3000|Säkerhetschef`, content the reviewer never saw (SR0.1).

## 2. Root cause

`sp_verifier_decide` takes no reference to the content it decides on. It
accepts decisions on `pending` and `clarification_requested` requests alike,
and verifies whatever the row holds when the decision is made.

## 3. Correction

The fix reuses the request's own content epoch, `submitted_at`. Both read
models already return it alongside the content: `sp_verifier_request_detail`
and `sp_employer_attestation_queue`.

- **Reviewed entry point.** The application calls
  `sp_verifier_decide_reviewed(request, reviewed_submitted_at, …)`. It passes
  the version its page loaded, through a transaction-local marker, into
  `sp_verifier_decide` in the same transaction.
- **Checks in `sp_verifier_decide`.** The hosted body (20270112090000) gains
  one block. It runs after the authorisation and already-decided checks:
  - The named version must be the current `submitted_at`; otherwise the call
    fails with `SP_REVIEW_STALE`.
  - A request whose holder answered a clarification by editing the entry
    cannot be decided without a named version at all. This covers a bare RPC
    call as well as a stale page. Such requests are marked by the new column
    `sp_verification_requests.answered_at`.
- **Holder's answer.** `sp_entry_review_on_holder_edit` (20270119090000) now
  sets `answered_at` and stamps the new `submitted_at` with
  `clock_timestamp()`, so the epoch moves even inside one transaction.
- **Concurrency.** Both checks run under the existing `SELECT … FOR UPDATE`
  on the request. The holder's answer updates that same row, so an edit and a
  decision serialise. The race test shows the stale decision waiting about
  1.5 s on the row and then being refused.

Unchanged:
- A request whose entry has not changed since submission decides exactly as
  before, by either entry point. That covers requests never sent for
  clarification and clarifications not yet answered.
- Every authorisation, method, message and validity rule.
- Clarification, withdrawal and the holder's answer.
- Who may decide.

Production holds 0 open requests, so no request is stranded.

**Out of scope, recorded as an observation.** A clarification can also be
answered by attaching a new document (`sp_attach_evidence`). That path does
not move `submitted_at`, and the request stays `clarification_requested`. It
changes the supporting evidence, not the entry being verified, and is left
as it was.

## 4. Legitimate review flows (positive tests)

| Assertion | Proves |
|---|---|
| SR3.1 | After reloading, the reviewer approves, and exactly the content now shown is verified. |
| SR4.1–4.2 | A request never sent for clarification is decided by either entry point. |
| SR4.3 | A clarification approved without any change by the holder needs no reload. |
| SR4.4 | The holder can still withdraw an answered request. |
| SR4.5 | After reloading, the reviewer can reject an answer. |
| SR5.1 | The binding never stands in for authority: a non-verifier is refused as before. |
| Employer suite 7.1–7.7 | An employer representative decides an answered employment request with the version they reviewed. |

Older suites that decide after an answered clarification now name the
version they reviewed:
- `sp_entry_frozen_under_review_test` (ER3.4);
- `security_passport_employer_verification_test` (7.1, 7.2).

Every other Passport suite that calls the decision passes unchanged.

## 5. Negative controls (`scripts/db-test.sh`)

| Control | Planted defect | Fails at |
|---|---|---|
| SR NC1 | The real rollback | SR1.a |
| SR NC2 | The decision ignores the named version | SR1.1 |
| SR NC3 | A bare call on an answered request is let through | SR2.1 |

## 6. Release order

1. **This PR: database only.** The migration, rollback, suites and db-test.
   The repository's schema-first guard requires this to merge before any
   application code that calls `sp_verifier_decide_reviewed`.
2. The official integration applies 20270124090000 and 20270125090000. Then
   read-only verification and a release record.
3. **Then the application PR.** The reviewer workspace and the employer page
   pass the loaded `submitted_at`, and `SP_REVIEW_STALE` is shown as "reload
   and decide again".

Between steps 2 and 3, the live application still makes the bare call. For
a request whose holder answered by editing, that call is refused
(`SP_REVIEW_STALE`, currently shown as the generic retry message), so it
fails safely. Production has 0 open requests today.
