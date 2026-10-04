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

| Object                                                                           |  Count | Outcome                                                                                                |
| -------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------ |
| Passport evidence `48bc6bd3`, test PDF                                           |      1 | **Withdrawn** with `sp_withdraw_evidence`, as the holder                                               |
| Storage object in `passport-evidence`, that PDF                                  |      1 | **Deleted** through the Storage API, as the holder (policy `sp_evidence_holder_delete`). 0 files left. |
| Passport claim `f68d322e`, VU1 test merit                                        |      1 | **Withdrawn** with `sp_withdraw_claim`, as the holder                                                  |
| Share links `9cba50fa`, `f49f12ba`, `e183cef7`                                   |      3 | Already revoked in T1 (14:58–14:59 UTC). Kept as revoked records. 0 open.                              |
| Assessment assignment `28b10c51`, the T5 invitation                              |      1 | **Cancelled** with `admin_cancel_assessment_assignment`, with a reason. No mail is sent.               |
| Job application `dbd58af3` and its recruitment metadata                          |      1 | **Kept**: T4 receipt not yet confirmed (§4)                                                            |
| Recruitment messages: receipt `13f91760`, information `f0c2d153`                 |      2 | **Kept**: delivery and idempotency records; T4 pending                                                 |
| Employer notice `3be4b533`                                                       |      1 | **Kept**: delivery and idempotency record (status `sent`)                                              |
| CV document `e1bc45a6` and its operations                                        |      1 | **Kept**: attached to the kept application                                                             |
| Experience period `134d8b5a`, Passport profile, profile, subject identity        | 1 each | **Kept** with the account (§5)                                                                         |
| `sp_passport_events`, `sp_passport_operations`, `job_audit_events`, `audit_logs` |      – | **Kept**: security and audit logs                                                                      |
| Contact enquiry from T3                                                          |      – | Not stored in the database (mail only)                                                                 |

Nothing was deleted with RLS, triggers or other protections switched off. Every change went through an existing function or policy, as the owning role.

## 4. No mail sent again

- **No new mail:** no `transactional-email` call has run since 06:00 UTC.
- **Outbox:** 0 unsettled employer notices.
- **One unsettled message, not from this round:** one row (from 2026-09-29) has `email_status = not_configured`. It is retried only manually ("Skicka e-posten igen"), and the database has no scheduler, so it cannot send on its own. It was not touched.

## 5. Deliberately kept

- **The synthetic candidate account** (created 2026-10-03 14:40:47 UTC by T1, 0 roles, 0 memberships), with its application, CV, receipt and profile.
  - Its mailbox is the colleague's, and the T4 receipt has not been confirmed there yet.
  - The owner warned that the account must not be assumed deletable.
  - Removing it is an open question to the owner.
- **The owner's interview notes on case `5015defd`**, written 2026-10-04 for the verification.
  - The case predates this round and is not linked to the test application, so its membership in the round is not proven.
- **Browser wording for steps 11 and 15** needs signed-in sessions of real members and is not run here.

## 6. Unchanged

These were checked after the cleanup:

- 22 accounts.
- 2 platform administrator accounts.
- 2 role rows in total.
- 9 active memberships, last changed 2026-08-25.
- No real organisation, membership, role or catalogue row was written.
