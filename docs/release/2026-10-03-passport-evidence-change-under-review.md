# Passport: evidence added under review binds the decision too

**Status: PENDING.** It is not merged, and nothing was written to the hosted
database. It follows 20270125090000. The application has called
`sp_verifier_decide_reviewed` since #385 (merged, f5eb230), so it can ship next.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270126090000_sp_evidence_change_under_review.sql` |
| Rollback | `supabase/rollback/20270126090000_sp_evidence_change_under_review_rollback.sql` |
| Suite | `supabase/tests/sp_decision_bound_to_reviewed_content_test.sql`, SR6 |

## 1. Finding (confirmed)

Reproduced with 20270125090000 applied:

1. A reviewer opens a request whose entry has one document.
2. While the request is pending, or as an answer to a clarification, the
   holder attaches a second document (`sp_attach_evidence`).
3. The reviewer approves from the page that still shows one document.

**Result:** the approval goes through. The decision covered evidence the
reviewer never saw.

Withdrawing evidence under review was already refused
(`SP_EVIDENCE_UNDER_REVIEW`, 20260817140000). Only adding was open.

## 2. Root cause

20270125090000 binds a decision to the request's `submitted_at`. Editing the
entry moves it. Attaching a document did not, so the old page still named the
current version.

## 3. Correction

`sp_attach_evidence` keeps its hosted body (20270114090000, md5 pinned by the
rollback). Every check, its order and its result are unchanged. One step is
added after the row is written:
- **Request found.** It finds an open request (`pending` or
  `clarification_requested`) on the same claim or period.
- **Version moved.** It sets the request's `submitted_at` to
  `clock_timestamp()` and sets `answered_at`, the marker 20270125090000
  already reads.

The decision path then refuses a page loaded before the document, and a bare
call, with `SP_REVIEW_STALE`, exactly as for an edited entry. The request's
status is unchanged.

**Release order.** This change ships after the application calls the
reviewed entry point. Before that, the live application's bare call would be
refused for every request answered with a document.

## 4. Tests

| Assertion | Proves |
|---|---|
| SR6.1 | A pending request: the approval from the page that showed one document is refused, and so is a bare call. |
| SR6.2 | A clarification answered with a document: the status stays `clarification_requested`, and the stale approval is refused. |
| SR6.3 | After reloading, which shows every document, the reviewer approves both. |
| SR6.4 | A document added after the decision touches no decided request. |

Older suites that approve after a clarification answered with a document now
decide on the version their reviewer page shows. That version comes from
`sp_verifier_request_detail`:
- `security_passport_india_national_qualifications_test`;
- `security_passport_open_uk_dubai_test`.

All 23 Passport suites pass with the migration applied.

`scripts/passport-live-local-journey-check.mjs` now does three things after
the holder's document reply:
- it refuses the approval from the page loaded before the reply;
- it shows the reloaded page with both documents and a new version;
- it approves from that reloaded page.

## 5. Negative controls (`scripts/db-test.sh`)

| Control | Planted defect | Fails at |
|---|---|---|
| EV NC1 | The real rollback | SR6.1 |
| EV NC2 | The attachment leaves the version unchanged | SR6.1 |

`scripts/db-test.sh` rolls back and re-applies 20270114090000 in two
places, which restores that migration's `sp_attach_evidence` body. In both
places 20270126090000 is re-applied on top straight after.
