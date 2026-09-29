# Production data hygiene — inventory and owner-approved cleanup checklist

Read-only inventory of the hosted project on 2026-09-28. **Nothing was deleted or changed.** Every row below is classified; the owner ticks what is removed, and how (the application's own admin paths where they exist: `admin_delete_user_if_safe` / `admin_anonymise_user` for people, `moderate_employer` for organisations, the job archive/delete RPCs for ads). Direct SQL deletion is a last resort and must respect the append-only ledgers (`sp_passport_events`, `bcp_events`, `job_audit_events`).

Classes: **REMOVE BEFORE LAUNCH · SAFE TO KEEP ARCHIVED · SYSTEM/REFERENCE DATA · UAT ACCOUNT · UNKNOWN — OWNER REVIEW**

## 1. Jobs (26 rows: 6 published, 20 archived)

| Item | Class | Note |
|---|---|---|
| Published `6x7a6jlujd` "jkdshfkjdhsf" (employer cqrityjob), deadline 2026-09-19 | **REMOVE BEFORE LAUNCH** | test text; hidden only because its deadline passed; the employer workspace still lists it |
| Published `f5mumdx7t7` "Väktare" (cqrityjob), `v6aagij3wq` "Väktare" (Säkerhet AB), `f436yrtqmf` "Säkerhetschef" (Buller o bång), `cwgfizt6ys`, `r6p65f6k6s` (Buller o bång, past deadline) | **UNKNOWN — OWNER REVIEW** | the three live public ads today; are they real vacancies at launch? |
| Archived `e7wnz23xmk` "Bajskorv", `ixkf3prcm3`/`zeget5dp6j`/`ugeifjd5h5` (untitled drafts), `267ynu664k` "Testtitel SV", `mcw4pycr77`/`23ecq4ogab` "H32 … Draft" | **REMOVE BEFORE LAUNCH** | test content under Säkerhet AB; invisible to the public but visible in that workspace and in admin |
| Archived `DEMO0001`–`DEMO0008` "[TEST DATA] …" (5 demo employers) | **REMOVE BEFORE LAUNCH** (or keep archived if the demo employers are kept) | seeded demo ads; invisible to the public |
| Archived `PILOT001`, `n43o2c5tkd`, `6jinjpi6ev` (Säkerhet AB), `gvimckhlqk` (Northstar), `j7b2ta4u3k` (Buller o bång) | **SAFE TO KEEP ARCHIVED** | pilot-era ads with real applications attached; keep as history of those UAT accounts, or remove with them |

## 2. Employers (11, all `active`)

| Item | Class |
|---|---|
| 5 "(demo)" employers (Nordic Guarding, Aurora Corporate Security, Fjord Cyber Sentinel, Sentinel Public Safety, Kärnkraft Skyddscentrum), 0 members, 3 publicly readable | **REMOVE BEFORE LAUNCH** (via `moderate_employer` → archived, then delete if the schema allows) |
| "STÄNGD TEST — CQrityjob internt" (`63828d64`), members: employer.owner@closed-test.invalid; holds the closed-test grant | **UAT ACCOUNT** — remove with its users after UAT |
| "Säkerhet AB" (slug `h31-test-co-etlqoz`, 11 jobs, 3 members incl. the owner account and closed-test users) | **UNKNOWN — OWNER REVIEW**: test organisation of the owner? |
| "cqrityjob" (`b901bdaf`, owner mostafa@salvusgroup.se, 2 published jobs, 11 interview cases, 11 assignments) | **UNKNOWN — OWNER REVIEW**: internal organisation kept for demos? |
| "Buller o bång" (`9d2838aa`, 4 jobs, 5 interview cases) | **UNKNOWN — OWNER REVIEW** |
| "Northstar Security AB", "Shieldguard Services AB" (mailinator owners) | **UAT ACCOUNT** — remove after UAT |

## 3. Accounts (20 in `auth.users`)

| Item | Class |
|---|---|
| sandleradam191@gmail.com (superadmin), mostafa@salvusgroup.se (admin) | **SYSTEM** — owner/admin accounts; keep |
| emma@cqrityjob.com (2026-09-26; passport, application, interview cases) | **UNKNOWN — OWNER REVIEW**: real colleague or test? |
| carl@hoglund.nu, shkachmed@gmail.com (2026-09-24/25, real-looking) | **UNKNOWN — OWNER REVIEW**: early real users? keep unless they were tests |
| northstar.uat.a@, anna.uat.a@, rebecka.uat.rev@, bjorn.uat.b@, shieldguard.uat.b@ (mailinator.com) | **UAT ACCOUNT** — remove after owner UAT (they hold applications, disclosures, an assignment) |
| northstar.uat1@example.com, mvp-audit-candidate-20260725@example.com (unconfirmed) | **REMOVE BEFORE LAUNCH** |
| employer.owner@, participant@, reviewer@closed-test.invalid | **UAT ACCOUNT** (closed test) — remove with "STÄNGD TEST" |
| 5 × `raderad+…@removed.invalid` (anonymised) | **SAFE TO KEEP** — product of the deletion flow; `deleted_accounts` has 5 rows |

## 4. Passport and shares

| Item | Class |
|---|---|
| 13 live disclosures (10 mostafa, 2 on an anonymised account, 1 owner, 1 emma) with gateway-form links | **REMOVE BEFORE LAUNCH** (revoke): the owner's screenshot exposed one token; all pre-#318 links change transport anyway. Revoke via "Dina delningar" |
| 51 claims (29 self-declared active, 4 verified active, 18 withdrawn) across 4 holders, 12 evidence rows / 9 files | **UNKNOWN — OWNER REVIEW** per holder (owner, admin and emma may want to keep theirs) |
| 11 verification requests/decisions (all approved) | **SAFE TO KEEP** as ledger, or remove with their holders |
| `sp_public_access_throttle` 10 rows | **SYSTEM** |

## 5. Assessments, interviews, Career Discovery

| Item | Class |
|---|---|
| `assessment_assignments` 29 (23 "invited", 1 completed, 3 cancelled, 1 expired, 1 started; e-mail never attempted) across cqrityjob 11, Säkerhet AB 11, Buller o bång 4, STÄNGD TEST 2, Northstar 1 | **UAT ACCOUNT / OWNER REVIEW** — remove with their organisations; all attempts are `closed_test` or pre-governance |
| `scp_attempts` 35 (23 closed_test, 12 legacy null mode), 682 responses, 147 human reviews | same |
| `scp_interview_cases` 17 (cqrityjob 11, Buller o bång 5, Säkerhet AB 1), 10 sessions, 27 evidence rows | **OWNER REVIEW**: test cases; note retention fields |
| `cd_sessions` 48 (owner 41, admin 7), 30 report snapshots, 330 funnel events, 4 test feedback | **SAFE TO KEEP** (own accounts) or remove; no third party's data |
| `sw_workspaces` 1 "Omvärldsbevakning" (admin) | **SAFE TO KEEP** |
| `scp_test_grants` 4 (one revoked, one expired 2026-09-20, two live: STÄNGD TEST development, cqrityjob closed_test until 2026-11-18) | **OWNER REVIEW**: revoke grants that should not outlive UAT |
| `cd_internal_testers` 0, `scp_interview_pack_pilot_grants` 0, `bcp_*` 0, `beskt_*` 0 | **SYSTEM** — empty by design |
| Catalogue content (cig_*, scp_* content, sp_credential_*, sp_market_packs, cd_professions) | **SYSTEM/REFERENCE DATA** — keep |

## 6. Storage

| Bucket | Objects | Class |
|---|---|---|
| `job-application-cvs` | 9 (owner 6, closed-test 1, anna 1, bjorn 1, admin 1) | remove with the applications/accounts |
| `passport-evidence` | 9 (admin 5, owner 3, emma 1) | per holder decision |
| `sw-documents` | 0 | — |

`storage_erasure_queue` has 9 rows: run the admin storage-erasure backlog (`/admin/data`) so deleted accounts' files are actually removed.

## 7. Order of operations (after owner sign-off)

1. Revoke the 13 live shares (holders, via the product).
2. Archive then remove test ads; remove demo employers; remove the unconfirmed `example.com` accounts.
3. After owner UAT: remove UAT accounts via the admin deletion path (`admin_delete_user_if_safe`, else `admin_anonymise_user`), which cascades applications, files and queues erasure.
4. Run the storage erasure backlog; confirm `storage_erasure_queue` drains.
5. Revoke/expire test grants that should not outlive UAT.
6. Re-run the read-only inventory queries (UAT report appendix) and attach the result to #320.
