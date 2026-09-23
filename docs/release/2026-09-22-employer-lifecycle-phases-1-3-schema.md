# 20261205090000 + 20261206090000 — the employer lifecycle, schema half

**What merges here:** two migrations, their rollbacks, one SQL suite, its registration in
`scripts/db-test.sh`, and the ledger entries. **No application code.** Nothing in `src/`
changes, so `schema-first-release:check` classes this as a SCHEMA RELEASE.

## Why this is its own PR

`20261206090000` re-creates `scp_assign_training` with an eighth argument. The application
code for phase 3 passes it (`assignDevelopmentProgrammeToEmployee` in
`src/lib/security-competency/academy-employer.functions.ts`). Application code reaches the
live site the moment it merges, because Lovable rebuilds from `main`; the migration only
runs when the Supabase GitHub integration applies it. Shipping the two together would mean
an employer clicking "assign a development programme" against a database whose function has
seven parameters. The guard names it exactly:

```
src/lib/security-competency/academy-employer.functions.ts
  needs function "scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid)"
  from  20261206090000_scp_training_assignment_person_context.sql
```

`20261205090000` introduces no object and does not have to be split out. It travels with
the other one because the two are one owner decision and reviewing them apart would be
harder, not easier.

## 20261205090000 — workforce records belong to an approved organisation

Closes S1 of the 2026-09-22 lifecycle audit, on the Product Owner's decision that a pending
organisation MAY create job drafts and MUST NOT create employee or workforce records.

| Layer | Change |
| --- | --- |
| RLS | `employees_employer_insert` additionally requires `employer_is_active_status(employer_id)` |
| Trigger | `employer_operational_guard()` refuses an `employees` insert unless the organisation is `active`, for every Postgres role including `service_role` |

Untouched on purpose: `jobs` (a pending organisation keeps its drafts), and `SELECT` /
`UPDATE` on `employees` (a suspension must stop new work, not destroy existing records).
`scp_employment_from_application()` already required an active organisation, so no hire that
works today stops working.

An archived organisation keeps the older `EMPLOYER_NOT_OPERATIONAL` code and message; the
new refusal is `EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE` and names job drafts as still available.

## 20261206090000 — a development assignment carries the employment record

`scp_assign_training` is dropped at its 7-argument signature and re-created with
`_employee_id uuid DEFAULT NULL` last. The new argument is checked against the caller's
organisation, and binds `employees.subject_id` **only when that record carries none**.

This is not a new mechanism: `scp_employer_assign` has taken `_employee_id` and bound the
same way since `20260829092000`. Training was never given the parameter, so an assignment
made from an employee's page was attached to a subject that the employment record might not
share — and in production three of five employment records carry no subject at all, so for
most employees the programme just assigned was invisible on the page it was assigned from,
with no error, because nothing had failed.

Unchanged: the owner/admin gate, purpose resolution, version pinning,
`scp_guard_training_target_assignable`, module seeding, and every error code. Existing
7-argument callers keep working and keep meaning what they meant.

Nothing here touches `scp_competency_evidence`, maturity or any validation status. A
completed programme remains a completed programme; `scp_content_library_test.sql` L4.5
still owns that boundary.

## Proof

`supabase/tests/employer_lifecycle_phase1_3_test.sql`, run **twice** in
`scripts/db-test.sh` — once with the migrations applied, once after standing them down and
reapplying them. The stand-down is asserted (the policy and the guard body are read back),
and a negative control proves that with the gate rolled back a pending organisation *can*
create an employment record, so the "after" round is evidence about these migrations and not
about something else that happens to refuse.

Groups: `W` the write rule (pending refused, draft refused, archived keeps its old code,
`service_role` refused, approved permitted, job drafts still permitted), `D` the person
context (one definition only, cross-tenant employee refused with nothing written, unbound
record bound, the assignment findable on that employee's own page, an already-bound record
never rebound, the 7-argument call unchanged, owner/admin still required, anon revoked), and
`E` the lineage Employee 360 reads.

## Rows changed

**0.** Neither migration writes, backfills or deletes a row. Both apply-time proofs create
and delete their own throwaway fixtures inside the apply.

## Release order

1. Merge this PR alone.
2. The Supabase GitHub integration applies both migrations on merge.
3. Verify hosted with the `verify` SQL in each `supabase/release-state.json` entry.
4. Record `hostedState: "applied"` with an `evidenceSource`, and take both names off
   `expectedPending` in `scripts/release-frontier-check.ts`.
5. Then merge the application PR.

## Rollback

Both rollbacks are safe and data-free. `20261206090000`'s deliberately does **not** unbind
an employment record it bound: the binding is a fact about who the person is and was correct
when it was made.
