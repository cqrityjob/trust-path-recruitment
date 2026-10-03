# Security finding — who may read assessment reports and interview findings inside an organisation

Status: **reported for decision; no change made.** The shared report-permission logic is
coordinated with the engineer who owns #384 (sent 2026-10-03). This document is the finding, the
access matrix as the migration chain defines it today, and a proposed fix for the owner to choose
from. Evidence is from the migration chain through `20270125090000` and the SQL tests; it was not
exercised against production.

## 1. Finding

Astra's independent review (main `ff2a5b3`) reported that the generic report path lets every
active member of the issuing organisation read SCP reports, without an assessor or case check,
and that this is broader than the requirement "authorised assessors in the same company can read
the relevant assessments, even if they did not create them; ordinary members are checked
separately; another company, a removed member and a logged-out user are refused".

Confirmed from the chain. The condition is the **employer branch of
`scp_report_snapshot_readable`** (`20270108090000_employer_active_reads.sql` ~123-146, branch at
~139-142): any member who passes `has_active_employer_role` (an `active` membership of an `active`
organisation) reads. There is no check of the viewer's role beyond membership, no reviewer grant
and no relation to the case. The same membership-only predicate governs:

- `scp_employer_report` (`20260904171840…`), `_v3` (`20260906125945…`), `_identity`
  (`20261107090000…`), `scp_subject_progress` (`20270108090000…`), and the table policy
  `scp_report_snapshots_employer`;
- `scp_employer_decisions` and its policy, the interview notes read
  (`20270109090000…` ~209-232), person and participant lists;
- interview cases, findings and the final report (`scp_iv_can_read_case`,
  `20270111090000_interview_beskt_active_employer.sql` ~86-97; the `scp_iv_can_write_case` branch
  admits owner, admin **and member**).

The only fine-grained grant that exists, `scp_employer_reviewers`, gates **review work**
(`scp_can_review_for`, `scp_review_queue`, `scp_complete_human_review`) and never a read.

It is the documented and tested behaviour, not a regression:

- `docs/assessment/architecture/trust-evidence-report-r2a-audience-boundary.md` ("zero rows for a
  non-member or another organisation") and `docs/employer/phase-8-5a-pilot-security-gate.md:54`
  ("any active member");
- `docs/architecture/interview-saas-readiness.md:15,34` lists a distinct reviewer role and per-case
  assignment as **missing before public production**;
- tests that encode it: `supabase/tests/employer_active_reads_test.sql:243-245` (AR-F.2: a plain
  member reads) and `e2e/employer-final-report-evidence.spec.ts:517` ("a member: the whole report").

There is **no "assessor" role** in the implemented model. "Assessor" is only `assessor_id` on
interview assessment rows. The existing roles are: membership role `owner` / `admin` / `member`
(`employer_memberships.role`), membership status `invited` / `active` / `suspended` / `removed`,
organisation status `draft` / `pending` / `active` / `rejected` / `suspended` / `archived`, the
per-use-case reviewer grant (`scp_employer_reviewers`, workforce / recruitment), the named
recruitment responsible per vacancy (`rec_can_manage`), appointed security officers for
vetting-restricted cases (`bcp_security_officers`), and platform admin.

## 2. Access matrix (as the chain defines it today)

Y = allowed, N = refused. "Report" = SCP report snapshot / employer report; "findings" = interview
notes, cases and findings.

| Actor | List | Read report | Read findings | Release (frisläppning) | Write |
|---|---|---|---|---|---|
| Logged out | N | N | N | N | N |
| Candidate (subject) | own attempts | own participant document; employer document N | status and source kinds only | N | own answers while in progress |
| Another candidate | N | N | N | N | N |
| Owner / admin of company A | Y | Y (identity reveal Y) | Y | Y (owner/admin only) | decisions, notes, findings review, case work |
| Reviewer-granted member of A (did not create it) | Y | **Y by membership; the grant is not consulted** | Y | N | review queue and review completion for the granted use case |
| **Ordinary member of A** | **Y** | **Y** | **Y** | N | interview assess / notes / conclude; decisions, findings review, identity: N |
| Removed or suspended member of A | N | N | N | N | N |
| Member of company B | N | N | N | N | N |
| Platform admin who is not a member | N through the app | N (raw table reads Y, `scp_can_author`) | N | N (needs a membership role) | break-glass review only |

Rows that agree with the requirement: logged out, other candidate, removed / suspended member,
company B. The row that does **not**: the ordinary member (and, as a consequence, the reviewer
row cannot be told apart from it).

## 3. Related findings (same area)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| a | `scp_iv_corrections_employer` uses the membership predicate only and omits `bcp_case_access_ok`, so a candidate's corrections on a security-vetting case that is hidden from the viewer are readable by any member. No test covers it. | `20270111090000…` ~1135-1138 | P2 |
| b | A subject who is also an active member (internal applicant, assessed employee) reads their own employer-audience report and findings, and colleagues'. No subject exclusion in `scp_report_snapshot_readable` or `scp_iv_can_read_case`. | same functions | P2 |
| c | Global content-role holders (`scp_can_author`) read every tenant's candidate responses, attempts, evidence and human reviews through the `*_author_read` policies; migration #51 intended to remove content roles from customer responses but fixed only the queue. Number of holders unknown. | `20260821090000…` ~39-53 | P2 |
| e | `approve_access_request` reactivates a **removed or suspended** membership (`ON CONFLICT … DO UPDATE`) and refuses only a requester who is ACTIVE; any authenticated user can insert an access request for any employer id (the policy checks only `requester = auth.uid()`). A person a platform admin suspended or removed can file a request via `/employer/join?org=<id>` and the organisation's own owner/admin can approve them straight back in, overriding the platform admin's decision. The migration documents it as intentional; it undermines offboarding ("återkallad åtkomst"). | `approve_access_request`, access-request insert policy | P2 |
| f | Reviewer grants (`scp_employer_reviewers`) survive suspension and removal. Inert while the membership is inactive (`scp_can_review_for` checks `has_active_employer_role`) but silently return on reactivation. | `scp_can_review_for` | P3 |
| d | Release is owner/admin only, so a reviewer cannot release; matches the "release" requirement only if that is the intended split. | `20270110090000…` ~75-112 | info |

## 4. Proposed fix (needs an owner decision on the "ordinary member" scope first)

Reuse the existing model, add no new role:

1. In `scp_report_snapshot_readable`, replace the employer branch with
   `has_active_employer_role(owner, admin)` **or** `scp_can_review_for(auth.uid(), organisation, NULL)`
   (reviewer-granted). One edit covers `scp_employer_report` (all variants), `scp_subject_progress`
   and the snapshot table policy.
2. Repeat the predicate in `scp_development_recommendations`, `scp_employer_decisions` (+ policy),
   the interview-notes read, and the person / participant lists. Whether an ordinary member still
   sees **counts only** is an owner decision.
3. Interviews: owner / admin **or** `scp_interview_cases.created_by` **or** a panel member.
4. Add `bcp_case_access_ok(case_id)` to `scp_iv_corrections_employer` (finding a) and exclude
   `subject = auth.uid()` in the same predicates (finding b).
5. Content roles (finding c): restrict the `*_author_read` policies to platform admin with a logged
   break-glass, once the holder count is known.
6. Tests that must change with it: `employer_active_reads_test.sql` AR-F.2 and the e2e "a member:
   the whole report" assertion; both are exactly the lines that state today's model.

Release order (schema-first): migration applied and verified on production **before** any app
change that relies on it; the app tolerates both models, so no app change is needed for this fix.
Rollback: restore the previous function bodies (the previous migration files are the rollback).

## 4a. Tests added in this branch (they pin the CURRENT behaviour, so changing the model changes exactly these assertions)

`supabase/tests/employer_report_access_matrix_test.sql`, wired into `scripts/db-test.sh` right after
the replay (final chain state): **45 assertions, no deviation from this document's matrix.**
Principals: anon, candidate subject, other candidate, owner, admin, reviewer-granted member, plain
member, suspended admin, removed admin, removed member, company B owner, platform admin who is not
a member. Read paths: `scp_employer_report` / `_v3` / `_identity`, `scp_participant_report` and
`_for_issuer`, `scp_report_snapshot_readable`, the `scp_report_snapshots` policies,
`scp_iv_can_read_case`, `scp_interview_cases` / `_case_events` / `_session_notes` / `_notes`;
actions: release and both finalise variants. Results: suspended and removed members, company B,
other candidates and a non-member platform admin read nothing; anon is refused before any row is
looked at; plain and reviewer-granted members read what the owner reads (tagged
`MEMBER-WIDE-MODEL`, RM5.1–5.3, RM9.1); release and finalise are owner/admin only (RM5.4–5.5);
RM10 drives the same `update_employer_membership` the new admin UI calls (access follows status on
the next read, removal keeps the row with `removed_at`, owner/admin cannot call it, the final-owner
rule still holds). Four planted controls (removed members still count; platform admin reads all;
case read open to any authenticated user; report narrowed to owner/admin) each fail on a named
assertion.

Scope note for the fix in section 4: narrowing only `scp_report_snapshot_readable` flips RM5.1–5.3
and leaves the case, notes and attempt-notes reads member-wide, because `scp_iv_can_read_case`,
`scp_iv_case_row_visible` and the `scp_interview_notes` / corrections policies call
`has_active_employer_role(..., NULL)` directly. The test shows that split.

## 5. Decision requested

1. Is an ordinary member of an organisation entitled to read candidate results and interview
   findings? If not: adopt section 4. If yes: record it as the model and change the requirement.
2. Is a per-case assignment wanted (the readiness document says it is missing before public
   production), or is "reviewer-granted or case creator or panel member" enough?

Until decided, the safe operational stance is the existing documented one: grant the `member` role
only to people who should read results, and keep ordinary colleagues out of the organisation.
