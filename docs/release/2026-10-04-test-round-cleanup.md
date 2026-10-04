# Launch test round 2026-10-03: final checks and cleanup

The owner approved this in writing on 2026-10-04. The approval covers two things:

- closing the exactly identified test advertisement;
- removing synthetic test objects from this round whose membership in the round is proven.

The only objects in scope are the ones this round created: the synthetic candidate account made by test T1, its Passport, CV and application, the test assignment sent in T5, and the test advertisement. Identifiers below are prefixes only. This record holds no addresses, passwords, link tokens or file contents.

## 1. Security verification after #404–#406

| Check                                                          | Result                                                                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #405 published app reads the case flags through the scoped RPC | `POST /rpc/scp_iv_case_capabilities` 200 at 05:58:49 and 05:59:19 UTC, from the owner's session, server runtime.                                                                                                     |
| After #406 / `20270207090000` was applied (06:13 UTC)          | The owner reopened the interview at 06:37 UTC. `scp_iv_case_capabilities` returned 200 at 06:37:07, 06:37:16 and 06:37:25, and every interview request in 06:30–06:50 was 2xx. Questions, notes and navigation work. |
| Full interview configuration, after the contract               | Shown in the probe table below this one.                                                                                                                                                                             |
| Independent check (Sonnet session)                             | It agrees with the probe results. A **non-admin** organisation member with a live scoped reviewer grant gets both flags through the RPC and reads 0 configuration rows directly. Recorded in #414.                   |
| Steps 11 and 15 (access model, suspension)                     | Proven at database level in #414: all 9 real members, plus a synthetic suspended person, in rolled-back probes. The browser wording is not verified (see §5).                                                        |

Rolled-back probes on the full interview configuration, after the contract:

| Who            | Full configuration            | Case flags                         |
| -------------- | ----------------------------- | ---------------------------------- |
| Test candidate | 0 rows; UPDATE denied (42501) | Denied: `INTERVIEW_CASE_NOT_FOUND` |
| `anon`         | Denied (42501)                | –                                  |
| Platform admin | 1 row                         | `ai=false`, `transcript=false`     |

## 2. Test advertisement

`b6870d17` "TEST – CQrityjob lanseringstest (ej riktig tjänst)" was closed at 06:40:25 UTC.

- **How:** the same operation as the employer's "Avsluta annons" (`closeEmployerJob`). It ran as the owner under RLS: `status` went from `published` to `archived`, with a `job_audit_events` row with action `closed`.
- **Kept:** the advertisement stays internally, as asked.
- **Public effect:** the advertisement page answers 404 "inte tillgängligt", and `anon` sees 0 rows for it.

## 3. Inventory

Every uuid column in `public`, `storage` and `scp_private`, and every user-, holder- or email-like text column in `public`, was searched for the candidate account, the application and the advertisement.

| Object                                                                           |  Count | Outcome                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passport evidence `48bc6bd3`, test PDF                                           |      1 | **Withdrawn** with `sp_withdraw_evidence`, as the holder                                                                                                                                      |
| Storage object in `passport-evidence`, that PDF                                  |      1 | **Deleted** through the Storage API, as the holder (policy `sp_evidence_holder_delete`). 0 files left.                                                                                        |
| Passport claim `f68d322e`, VU1 test merit                                        |      1 | **Withdrawn** with `sp_withdraw_claim`, as the holder                                                                                                                                         |
| Share links `9cba50fa`, `f49f12ba`, `e183cef7`                                   |      3 | Already revoked in T1 (14:58–14:59 UTC). Kept as revoked records. 0 open.                                                                                                                     |
| Assessment assignment `28b10c51`, the T5 invitation                              |      1 | **Cancelled** with `admin_cancel_assessment_assignment`, with a reason. No mail is sent.                                                                                                      |
| Job application `dbd58af3` and its recruitment metadata                          |      1 | **Withdrawn** with `set_application_status` as the candidate (the "Återkalla ansökan" path), after T4 was confirmed. No mail sent. Rows kept, because the messages and notice reference them. |
| Recruitment messages: receipt `13f91760`, information `f0c2d153`                 |      2 | **Kept**: delivery and idempotency records (T4 and T5 received)                                                                                                                               |
| Employer notice `3be4b533`                                                       |      1 | **Kept**: delivery and idempotency record (status `sent`)                                                                                                                                     |
| CV document `e1bc45a6` and its operations                                        |      1 | **Deleted** with the account (§5)                                                                                                                                                             |
| Experience period `134d8b5a`, Passport profile, profile, subject identity        | 1 each | **Deleted** with the account (§5)                                                                                                                                                             |
| `sp_passport_events`, `sp_passport_operations`, `job_audit_events`, `audit_logs` |      – | **Kept**: security and audit logs                                                                                                                                                             |
| Contact enquiry from T3                                                          |      – | Not stored in the database (mail only)                                                                                                                                                        |

Nothing was deleted with RLS, triggers or other protections switched off. Every change went through an existing function or policy, as the owning role.

## 4. Mail received and no mail sent again

- **Received (owner's confirmation, 2026-10-04):** T4 (application receipt) and T5 (test invitation) reached the colleague's inbox, and T6 (employer notice) reached the owner's. Delivery of all three is verified.

- **No new mail:** no `transactional-email` call or other edge function has run since 06:00 UTC, and none after the cleanup.
- **Outbox:** 0 unsettled employer notices.
- **One unsettled message, not from this round:** one row (from 2026-09-29) has `email_status = not_configured`. It is retried only manually ("Skicka e-posten igen"), and the database has no scheduler, so it cannot send on its own. It was not touched.

## 5. The candidate account and the interview notes

### The synthetic candidate account (approved by the owner for full deletion)

The account was created 2026-10-03 14:40:47 UTC by T1 and had 0 roles and 0 memberships. Its mailbox is the colleague's. The owner confirmed the account and approved deleting it fully, so the colleague can register again with the same address.

- **First attempt:** the permanent deletion failed for any holder with Passport credential metadata. `sp_credential_details` and `sp_evidence_extractions` are `ON DELETE RESTRICT`, and the extraction append-only guard refused every DELETE.
  - The superadmin then anonymised the account at 06:57 UTC.
- **Fix:** #416 (`20270208090000`) was reviewed independently and merged as `abbc036e`. The official integration applied it, and it was verified read-only at 07:56 UTC. See `docs/release/2026-10-04-account-erasure-hosted-verification.md`.
- **Deletion:** the superadmin deleted the account permanently through the admin UI at 08:00:19 UTC. It used form `erasure`, because the account has history.
  - `removed_dependents`: 1 `sp_credential_details`.
  - Anonymised and kept, because other parties' records reference them: 3 revoked share links, 1 job application and its status event, and 1 cancelled assessment assignment.
  - Storage: 1 `passport-evidence` object was queued. It was already absent, since it was deleted earlier as the holder, so the queue row is settled and 0 objects remain.
- **Verified afterwards, read-only:**
  - 0 identities, 0 sessions and 0 refresh tokens.
  - 0 claims, 0 evidence and 0 orphaned credential details.
  - 0 profile, CV, experience or role rows.
  - 1 `deleted_accounts` tombstone, which keeps the duplicate protection.
  - Audit rows `user_anonymised` and `user_deleted` are kept.
  - The account's address is pseudonymised. No account and no identity holds the original address, so it is free to register again. That was not exercised here, because a signup would send mail; the colleague registers themselves.
  - No other account was touched: exactly 1 deletion and 1 audit row since 07:59 UTC.
  - No edge function and no auth mail endpoint ran around the deletion.
- **Not done:** the account was not recreated, and no test mail was sent.

### The owner's interview notes on case `5015defd`

The owner approved removing them. Notes `b37f9b4b` and `d1976090` were emptied as the owner, through the normal note path.

### Not run here

Browser wording for steps 11 and 15 needs signed-in sessions of real members.

## 6. Unchanged

These were checked after the cleanup:

- 22 account rows (the deleted account remains only as a pseudonymised tombstone without identities or sessions).
- 2 platform administrator accounts.
- 2 role rows in total.
- 9 active memberships, last changed 2026-08-25.
- No real organisation, membership, role or catalogue row was written.
