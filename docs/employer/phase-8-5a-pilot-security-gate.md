# Phase 8.5A — pilot security gate

**Prepared:** 21 August 2026, alongside `20260821090000_scp_pilot_security_gate.sql`.
**Status:** implemented on `feat/employer-assessment-center`. Not merged, not deployed.
**Scope:** who may do what. No change to scoring, maturity thresholds, report
meaning, released snapshots or historical evidence.

This document exists for one reason the migration cannot carry on its own: the
legacy assignment model was restricted, not removed, and somebody has to be able
to find every place it is still load-bearing.

---

## The four findings, and what closed each one

| # | Finding | Closure | Proven by |
|---|---|---|---|
| 1 | `scp_attempts`, `scp_candidate_responses`, `scp_competency_evidence` and `scp_human_reviews` carried `FOR ALL` author policies, so any editor/reviewer/publisher could write them directly through PostgREST | the four policies are now `FOR SELECT`; every write path is a `SECURITY DEFINER` function owned by `postgres` and is unaffected | SG2.1–SG2.10 |
| 2 | `assignments_employer_insert` / `_update` accepted **any** active membership, while `scp_employer_assign` requires owner or admin | both policies name `owner` and `admin` through the existing `has_employer_role` helper; `SELECT` untouched | SG1.1–SG1.7 |
| 3 | `scp_compute_maturity` was granted to `authenticated` — a competence judgement about any subject id, callable by any signed-in account | `EXECUTE` revoked from `anon`, `authenticated`, `service_role` and `PUBLIC`, together with the three Phase 8 derivation helpers | SG4.1–SG4.6 |
| 4 | `assessment_assignments_active_unique_idx` keys on `assessment_id`, which the single-lineage CHECK forces to `NULL` on every SCP row | trigger-owned `scp_open` lifecycle flag + partial unique index on `(employer_id, scp_assessment_version_id, recipient_user_id, use_case)`, cancellation/attempt synchronization, and a trigger that raises `SCP_ASSIGNMENT_ALREADY_OPEN` | SG5.1–SG5.17 |

### Why finding 4 is a flag rather than a status predicate

The obvious index — "unique while status is active" — could not be built. The SCP
assignment path never advances `assessment_assignments.status`: all four live SCP
rows sit at `invited` permanently, in two duplicate groups, while all four
attempts are `released`. A status-keyed index would have failed to build against
the existing data, and had it built, it would have blocked every reassessment
forever.

`scp_open` states the lifecycle instead of inferring it. It defaults to `false`
and is backfilled from exact attempt lineage before the index is built, so a
hosted database with an in-progress attempt is handled safely rather than being
assumed to match a local fixture. It is set on insert for SCP lineage and cleared
when the attempt leaves `in_progress`.

The flag is not client-writeable: authenticated owners/admins retain column-level
UPDATE only for `status` and `cancelled_at`. Cancelling or expiring an open SCP
assignment atomically abandons the linked in-progress attempt; submitted,
scored or released work cannot be relabelled as cancelled. Responses and reports
are never deleted by cancellation.

---

## Where the legacy assignment model is still in use

The legacy model (`assessment_assignments` rows carrying `assessment_id` /
`assessment_version_id`, the CIE lineage) is **restricted, not removed**. It is
the only path that can reach a recipient who has no account, and Phase 8.5B
replaces it. Until then it remains live in:

**Employer surface** — narrowed to owner/admin by this phase
- `src/lib/job-intelligence/assessment-assignments.functions.ts` — `createAssessmentAssignment`, `cancelAssessmentAssignment` (writes); `listAssignmentsForEmployer`, `getEmployerAssignmentReport` (reads, any active member)
- `src/routes/_authenticated.employer.$employerSlug.assessments.assign.tsx`
- `src/routes/_authenticated.employer.$employerSlug.assessments.assignments.index.tsx`
- `src/routes/_authenticated.employer.$employerSlug.assessments.assignments.$assignmentId.tsx`
- `src/routes/_authenticated.employer.$employerSlug.applications.tsx`, `…workforce.index.tsx`, `…index.tsx` (read-only counts and lists)

**Candidate token path** — unchanged by this phase
- `src/routes/invite.$token.tsx`
- `getAssignmentByToken`, `startAssessmentAssignment`, `completeAssessmentAssignment`, `claimAssessmentAssignment`, `getCompletedAssignmentResultByToken` — all through the service-role client, which bypasses RLS and was never the wider door

**Participant surface**
- `src/routes/_authenticated.my-career.index.tsx` (`getMyLinkableAssignments`)

**Platform admin** — service-role, unaffected
- `admin-assessment-assignments.functions.ts`, `admin-applications.functions.ts`, `admin-workforce.functions.ts`, `admin-overview.functions.ts`, `admin-employer-moderation.functions.ts` and the four `_authenticated.admin.*` routes

---

## What this phase deliberately did not do

- No purpose was activated or published. `selection_support` and `reassessment`
  remain inactive, and recruitment assignment still fails closed
  (asserted as SG1.8).
- No legacy route, table or function was deleted.
- No assertion floor was lowered. The DB suite floor rose from 1,393 assertions
  across 26 suites to at least 1,441 across 27.
- No authentication configuration was touched.
- Phases 9–12 were not started.

---

## Rollback

`supabase/tests/scp_a_rollback_test.sql` unwinds this phase with the rest of the
SCP platform. Two things need naming there rather than riding out on a
`DROP TABLE`: the three trigger functions return `trigger`, so the
`scp_governance_mode` cascade does not reach them, and `scp_open` sits on the
pre-existing legacy table.

The narrowed legacy write policies are **not** reopened by the rollback. Undoing
the SCP platform is not a reason to hand an ordinary member write access to the
legacy assignment table again, and the legacy product never depended on it.
