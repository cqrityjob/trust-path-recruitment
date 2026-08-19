# Production state captured immediately before Phase B

**Database:** `zrahptwsnjcdyzfywbeh` · **Lovable:** `9ec625ef-34a1-4b4b-8cbb-712cae168579`
**Captured:** 19 August 2026, read-only, immediately before
`20260821090000_scp_pilot_security_gate` was applied.
**Ledger at capture:** 98

Rollback SQL built from this state: [`pre-phase-b-rollback.sql`](./pre-phase-b-rollback.sql)

---

## The four exposures — all OPEN at capture

### A — `FOR ALL` author-write policies

| Table | Policy | cmd | roles | USING / CHECK |
|---|---|---|---|---|
| `scp_attempts` | `scp_attempts_author_write` | **ALL** | `{authenticated}` | `scp_can_author(auth.uid())` |
| `scp_candidate_responses` | `scp_responses_author_write` | **ALL** | `{authenticated}` | `scp_can_author(auth.uid())` |
| `scp_competency_evidence` | `scp_evidence_author_write` | **ALL** | `{authenticated}` | `scp_can_author(auth.uid())` |
| `scp_human_reviews` | `scp_human_reviews_author_only` | **ALL** | `{authenticated}` | `scp_can_author(auth.uid())` |

Read policies preserved alongside (not changed by the gate):
`scp_attempts_own_select`, `scp_responses_own_select`, `scp_evidence_own_select`.

### B — assignment policies accept any active member

```
assignments_employer_insert  INSERT  {authenticated}
  CHECK = has_employer_role(auth.uid(), employer_id, NULL::text[])
          AND employer_is_active_status(employer_id)
          AND (assigned_by = auth.uid())

assignments_employer_update  UPDATE  {authenticated}
  USING = has_employer_role(auth.uid(), employer_id, NULL::text[])
          AND employer_members_can_edit(employer_id)
  CHECK = same
```

`NULL::text[]` = no role restriction. Untouched by the gate:
`assignments_admin_select`, `assignments_employer_select`,
`assignments_recipient_select_own`.

### C — function ACLs

```
scp_compute_maturity(uuid,uuid,text,timestamptz)     postgres=X, authenticated=X, service_role=X
scp_attempt_maturity(uuid,uuid,text,timestamptz)     postgres=X, authenticated=X, service_role=X   <- C2-owned
scp_display_evidence_state(uuid,uuid,text)           postgres=X, authenticated=X, service_role=X
scp_attempt_evidence_state(uuid,uuid,text)           postgres=X, authenticated=X, service_role=X   <- C2-owned
```

**The two C2-owned functions are revoked by Phase B but are not created by it.**
Rollback restores their grant and must never drop them.

### D — `scp_open` absent

`assessment_assignments` columns at capture (34): `id, employer_id, assessment_id,
assessment_version_id, profile_id, use_case, job_id, application_id, employee_id,
recipient_email, recipient_user_id, assigned_by, language, employer_message,
status, invitation_token_hash, expires_at, invited_at, opened_at, started_at,
completed_at, cancelled_at, completion_id, answers, engine_result,
assessment_run_id, created_at, updated_at, cancellation_reason, cancelled_by,
email_delivery_status, email_delivery_error, email_sent_at,
scp_assessment_version_id` — **no `scp_open`.**

Indexes (9): `assessment_assignments_active_unique_idx`, `_application_idx`,
`_employee_idx`, `_employer_idx`, `_invitation_token_hash_key`, `_pkey`,
`_recipient_user_idx`, `_run_idx`, `_scp_version_idx` — **no
`scp_assignments_one_open_per_subject_idx`.**

Triggers (5): `assessment_assignments_block_retired_reactivation_trg`,
`assessment_assignments_block_retired_trg`,
`assessment_assignments_immutable_guard_trg`,
`scp_assignments_target_published_trg`,
`set_assessment_assignments_updated_at`.

---

## Row counts — the invariants Phase B must not change

| Table | Count |
|---|---|
| `assessment_assignments` | 6 |
| `scp_attempts` | 2 — **1 released, 1 in_progress** |
| `scp_candidate_responses` | 7 |
| `scp_human_reviews` | 1 |
| `scp_competency_evidence` | 4 |
| `scp_report_snapshots` | 2 |
| `cd_sessions` | 40 |
| `cd_report_snapshots` | 22 |
| `jobs` | 15 |

**The single `in_progress` attempt is the important one.** The gate backfills
`scp_open` from exact attempt lineage rather than assuming a clean fixture, so
this is the case that backfill exists for. Expect exactly one assignment to come
out with `scp_open = true` — the one linked to that in-progress attempt.
