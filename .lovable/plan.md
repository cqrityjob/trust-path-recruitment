# Saved assessment report — regression investigation and secure fix

## What I verified before writing this plan

Read-only checks against the live backend:

- The public v3.1 assessment writes its report to `cd_report_snapshots`, not to `assessment_run_reports`. The security change described as "write-locked to trusted backend paths" touched `assessment_run_reports` only.
- Effective permissions for signed-in users are intact across the whole v3.1 path: read on the definition version, insert on sessions and evidence, read on report snapshots, execute on the atomic completion routine.
- `assessment_run_reports`: signed-in users can read their own rows and direct client insert/update/delete is blocked. That is the intended posture, and no application code inserts into that table directly — the only writer is the trusted server path using the service-role routine.
- Every completed session in the database has exactly one matching report row, including the most recent one (2 Aug). There are no "completed with no report" rows.
- The v3.1 definition version is `active`, so the assessment is admissible.
- The completion flow in the UI already matches the required secure architecture: server-side computation, user id from the verified session, answers kept until the write is confirmed, no navigation on failure, retry allowed, technical error logged without answer content.

So the symptom is **not explained** by the `assessment_run_reports` lock, and no stored data currently shows a failed save. The root cause is therefore **unconfirmed**, and confirming it is step 1 rather than something this plan asserts.

## Step 1 — Reproduce and capture the real error (no code changes)

Run an authenticated end-to-end completion in the preview environment and capture:

- browser console output from the completion handler (it already logs the server error code and message),
- the server function log for that completion call,
- backend auth/postgres logs for the same minute,
- whether a session row, evidence rows and a report row were created for that attempt,
- if the row exists, whether the report page and the report history query return it.

Outcome is a one-line classification:

- **A. Write fails** — a specific database refusal (permission, policy, trigger guard, constraint) surfaces from the completion call.
- **B. Write succeeds, read fails** — the row exists but a page or history query does not return it.
- **C. Neither** — saving works and the perceived loss is a session/navigation issue (returning from sign-in without the buffered attempt, or landing on a page that queries the other report family).

## Step 2 — Smallest secure fix, chosen by the classification

- **A:** fix the exact refusing object. If the security migration removed a grant the trusted server flow legitimately needs, restore that single grant for the signed-in role or the service role only — never a broad policy, never client write access to the protected report table. If a trigger guard or constraint refuses, fix the payload the server sends rather than relaxing the guard.
- **B:** fix the retrieval query or its ownership filter, leaving owner-scoped access rules unchanged.
- **C:** fix the presentation/navigation defect: never present the result as saved before persistence succeeds, and resume the buffered attempt correctly after sign-in.

Non-negotiable in all branches: the protected report table keeps its no-direct-client-write posture, the user id keeps coming from the verified session, scores and report content stay server-computed, and completion stays idempotent per attempt.

## Step 3 — Regression tests

Database-level (SQL suite, alongside the existing career-discovery tests):

- a completed attempt produces exactly one report row, owned by the attempting user and linked to that attempt,
- re-running completion for the same attempt returns the same report and creates no duplicate,
- one user cannot read or write another user's report,
- a direct client-role insert or update on the protected report table is refused,
- the trusted completion routine succeeds for the attempt's owner.

Application-level:

- end-to-end: complete the public assessment signed in, land on the report, reload, sign out and back in, confirm it is still there and still a single row,
- failure path: with persistence forced to fail, the UI shows a translated error, keeps the answers, offers retry, and does not navigate,
- existing scoring and persona regression tests run unchanged.

## Step 4 — Deliverable report

- confirmed root cause and the exact policy, migration, function or call responsible,
- whether the report failed to save or only failed to load,
- fix applied, affected files and database objects, migration name if any,
- database evidence (row counts before/after, ownership, single-row proof),
- end-to-end evidence,
- explicit confirmation that direct client writes to the protected report table are still refused,
- rollback plan: any new migration is a single reversible statement with its inverse recorded in the report; frontend changes revert independently of the database.

## Technical notes

- Two report families are in play: `cd_report_snapshots` (Security Career Discovery v3.1, written by the atomic completion routine) and `assessment_run_reports` (Career Intelligence saved report, written only by the service-role routine). The fix must keep them distinct.
- Files likely in scope depending on branch: the public v3.1 flow component, the v3.1 persistence server functions, the stored-report/history server functions and their routes.
- No change to scoring, question content, or the domain model.