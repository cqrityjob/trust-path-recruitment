# Admin Control Center — Phase 1 current-state audit

Audited against `origin/main` at `79fcd90`, by replaying the full migration
history into a clean database (`scripts/db-test.sh`, 2 284 lines, green:
0 unexpected replay failures, 24 allowlisted, ~2 000 assertions) and
introspecting the resulting schema directly. Nothing below is inferred from
comments or documentation.

---

## 0. What the admin portal is today

Eleven routes under `/admin`, all behind `_authenticated.admin.tsx` →
`adminWhoAmI()` → `is_platform_admin(auth.uid())`:

overview, employers, users, jobs, applications, assessments (catalog),
assignments, results, workforce, feedback, passport-verification.

Every server function re-verifies `is_platform_admin` (or `is_superadmin`)
server-side before any read or write, and reads through the caller's own
RLS-scoped client wherever an admin RLS policy already grants the rows.
`supabaseAdmin` (service role) is used only where no RLS-bypassable path
exists: `profiles` (self-select-only) and the Auth Admin API.

**It is a moderation console.** Every state-changing operation it exposes is a
*review outcome*, not a lifecycle operation:

| existing write | RPC behind it | governance |
| --- | --- | --- |
| approve / reject / suspend / reactivate employer | `moderate_employer()` | fixed transition allow-list, note required for reject/suspend, one `employer_moderation_events` row, unforgeable transaction-local marker |
| grant / revoke platform role | `admin_set_platform_role()` | superadmin only, self-change blocked, last-superadmin protected, `audit_logs` row |
| cancel assessment assignment | `admin_cancel_assessment_assignment()` | admin only, reason required, only `invited/opened/started`, `audit_logs` row |
| job transitions | `adminTransitionJob` + `jobs_validate_before_write()` | publish requires an active employer, for every caller |
| create / edit employer metadata | `adminUpsertEmployer` | `assertNoExistingEmployerStatusChange` blocks any status write |
| set employee employment status | `adminSetEmployeeStatus` | `audit_logs` row |

There is **no** archive, no deletion of any kind, no anonymisation, no account
disable, no canonical person view, no audit-log surface, and no data-management
surface.

---

## 1. Cascade map — what a naive DELETE would destroy

### 1a. `employers` (25 inbound foreign keys)

| behaviour | referencing table.column |
| --- | --- |
| **CASCADE** (silently destroyed) | `assessment_assignments.employer_id`, `employees.employer_id`, `employer_access_requests`, `employer_admin_meta`, `employer_memberships`, `employer_moderation_events`, `job_application_status_events`, **`job_applications.employer_id`**, `requirement_profiles`, `scp_employer_reviewers`, `scp_fixture_access`, `scp_test_grants` |
| **RESTRICT** (would raise) | `scp_assessment_definitions.owner_employer_id`, `scp_assessment_invitations`, **`scp_attempts.issuer_organization_id`**, **`scp_competency_evidence.issuer_organization_id`**, `scp_employer_report_decisions`, `scp_interview_notes`, `scp_modules`, `scp_programs`, **`scp_report_snapshots.issuer_organization_id`**, `scp_training_assignments` |
| **NO ACTION** | `jobs.employer_id` |
| **SET NULL** | `sp_experience_periods.employer_id`, `sp_verification_requests.target_employer_id` |

The CASCADE column is the danger: a `DELETE FROM employers` would take every
application, every application status event and every employment record with it
without raising anything. The RESTRICT column would abort the statement — but
with a raw Postgres foreign-key error, not an explainable one.

### 1b. `auth.users` (≈100 inbound foreign keys)

CASCADE includes `profiles`, `job_applications.applicant_user_id`,
`employer_memberships.user_id`, `assessment_runs`, `assessment_responses`,
`assessment_run_reports`, `scp_subject_identities.user_id`,
`scp_content_roles`, `scp_employer_reviewers`, `consent_records`,
`cd_sessions`, `cd_shared_reports`, and the **entire Security Passport
holder surface**: `sp_claims`, `sp_evidence`, `sp_disclosures`,
`sp_experience_periods`, `sp_passport_events`, `sp_passport_profiles`,
`sp_verification_requests`, `sp_verification_decisions`.

`employees.created_by`, `assessment_assignments.assigned_by`,
`scp_assessment_invitations.invited_by`, `scp_interview_notes.recorded_by`,
`scp_employer_report_decisions.decided_by`, `scp_publication_approvals`,
`scp_training_assignments.assigned_by` and `scp_employer_reviewers.granted_by`
are **NO ACTION / RESTRICT**, so a user who has *acted* on the platform cannot
be deleted at all without those rows going first.

`audit_logs.actor_id` is `ON DELETE SET NULL` — deleting an admin does not
destroy the audit trail, it only orphans the actor.

### 1c. `scp_subjects` (the pseudonymous person spine)

All inbound references are **RESTRICT** (`scp_attempts`,
`scp_competency_evidence`, `scp_report_snapshots`, `scp_training_assignments`,
`scp_assessment_invitations`, `scp_subject_identities`) except
`employees.subject_id`, which is **NO ACTION**. A subject that has ever been
assessed is therefore structurally undeletable — correct, and worth stating
explicitly rather than discovering at runtime.

---

## 2. Capability matrix (BEFORE)

| entity | disable | archive | anonymise | delete | notes |
| --- | --- | --- | --- | --- | --- |
| employer | ✅ `suspended` | ❌ status exists in the CHECK constraint but **no transition reaches it** | ❌ | ❌ | `employers_status_check` allows `archived`; `moderate_employer()`'s allow-list does not |
| employer membership | ✅ via `update_employer_membership` | ❌ | ❌ | ❌ | employer-side only |
| auth user | ❌ | ❌ | ❌ | ❌ | nothing in the product touches an account's ability to sign in |
| profile | ❌ | ❌ | ❌ | ❌ | |
| platform role | ✅ revoke | — | — | — | superadmin only, last-superadmin protected |
| candidate / subject | ❌ | ❌ | ❌ | ❌ | |
| employee | ✅ `inactive` | ❌ | ❌ | ❌ | `adminSetEmployeeStatus` |
| job | ✅ close | ✅ `archived` | — | ⚠️ employer-side only (`jobs_delete_draft`) | admin has no delete path |
| application | ❌ | ❌ | ❌ | ❌ | admin is read-only |
| assessment assignment | ✅ cancel | — | — | ❌ | `admin_cancel_assessment_assignment` |
| attempt / report | ❌ | — | — | ❌ | correct: released evidence |
| Passport claim | — | holder-side archive | ❌ | ❌ | governed by `sp_*` holder RPCs |
| Passport disclosure | ✅ `sp_revoke_disclosure` — **holder only** | — | — | ❌ | admin cannot revoke a leaked share |
| audit log | — | — | — | — | readable by admin RLS since `20260803114922`, **never surfaced in the UI** |

---

## 3. Findings that shaped the design

**F1 — `archived` is already wired for everything except the transition.**
`employer_members_can_edit()` returns `status IN ('active','draft','pending')`
and gates 10 RLS policies (`jobs` select/insert/update, `employees`
select/insert/update, `assessment_assignments` select/update,
`employers_owner_admin_update`). `employer_is_active_status()` gates
`job_applications`, `job_application_status_events`, public job visibility and
CV storage. So the moment an employer reaches `archived`, the workspace is
already locked and the adverts already disappear. Archiving needs a
*transition*, not a new authorisation model.

**F2 — the Security Competency surface does not check employer status.**
`scp_employer_assign()`, `scp_invite_participant()`, `scp_assign_training()`
and friends check active *membership* and nothing about the employer's own
status. A suspended employer's owner can therefore still commission
assessments today. This is a pre-existing gap, and it means "archive stops new
assignments" cannot be delivered by the transition alone.

**F3 — `employers.status` can only be changed inside `moderate_employer()`.**
`employers_validate_before_write()` rejects any status change that does not
carry the transaction-local marker `app.employer_moderation_in_progress`, for
every Postgres role including `service_role`. Any archive path must go through
that function; a second SECURITY DEFINER function setting the same marker would
weaken the invariant.

**F4 — `jobs_delete_draft()` is the house pattern for safe deletion.**
Tenant isolation in the `WHERE` clause, an explicit named refusal per cascade
edge (`JOB_HAS_APPLICATIONS`, `JOB_HAS_ASSIGNMENTS`, `JOB_HAS_INVITATIONS`),
`ERRCODE = 'P0001'`, stable `CODE: message` strings. The new deletion RPCs
follow it exactly.

**F5 — there is no test/pilot marker anywhere in the schema.**
`scp_assessment_definitions.is_test_fixture`, `scp_programs.is_test_fixture`
and `cd_sessions.is_internal_test` are content flags, not tenancy flags. There
is no `employers.is_test`. Adding one would create a mislabelling surface: an
operational customer flagged as test data becomes deletable.

**F6 — `postgres` holds `BYPASSRLS` and full DML on `auth.users`.**
So account disable / anonymise / delete can be done in SQL, atomically with the
audit row, rather than split across the Auth Admin API and a second write.

**F7 — no identity-merge function exists.** `scp_resolve_participant_identity`
resolves an identity under strict conditions; `scp_bind_employee_subject` links
an employee to a subject. Neither merges. Phase 5 is therefore diagnostics only,
as instructed.

**F8 — `audit_logs` is fragmented across three tables.**
`audit_logs` (platform actions), `employer_moderation_events` (employer status),
`job_audit_events` (job lifecycle). Rebuilding them into one is out of scope;
a read layer that unions them is not.

---

## 4. Retention positions taken

| data | on employer delete | on user delete | on anonymise |
| --- | --- | --- | --- |
| applications, status events | **blocks the delete** | **blocks the delete** | retained (non-personal columns) |
| employees / employment | **blocks** | **blocks** | name pseudonymised |
| assessment attempts, evidence, report snapshots | **blocks** | **blocks** | untouched |
| Passport claims, evidence, disclosures | **blocks** | **blocks** | untouched — see below |
| moderation / audit history | **blocks** (any event beyond the row the employer's own creation wrote) | retained, actor orphaned by `SET NULL` | retained |
| memberships, admin meta, requirement profiles, never-published draft jobs | deleted with the employer | — | — |
| profile display name, country, Passport display name / headline, auth email, auth user metadata | — | — | **pseudonymised** |

**Flagged for owner/legal review, not decided here:** `sp_claims` carries
holder-entered `title`, `claimed_issuer_name`, `credential_reference` and
`holder_note`. These are personal data that an anonymisation run does *not*
clear, because clearing them would destroy verified credential evidence a
verifier has already relied on. Whether a GDPR erasure request can reach
verified Passport evidence, and under what retention basis it is refused, is a
legal decision. The code makes the choice visible instead of making it silently.

---

## 5. Three findings that only appeared while building

**F9 — a duplicate person cannot look the way Phase 5 assumed.**
`scp_subject_identities` is 1:1 by construction: `subject_id` is its primary
key and `user_id` carries a `UNIQUE` constraint. "One account with two
subjects" and "one subject with two accounts" are impossible rows, not
undetected ones — the first draft of the diagnostic checked for exactly those
and the test suite refused to insert the fixture. A duplicate person on this
platform can therefore only appear as a record that is **not linked**, or
linked to the **wrong** spine, which is what the shipped diagnostic checks:
`UNCLAIMED_SUBJECT`, `DUPLICATE_EMPLOYEE_IN_ORGANISATION`,
`EMPLOYEE_NOT_BOUND_TO_ACCOUNT`, `EMPLOYEE_SUBJECT_MISMATCH`.

**F10 — `requirement_profiles` exists in the hosted database and not in a
canonical replay.** It comes from the parked Blueprint Engine migration
(`supabase/archive/parked-migrations/20260720180000_...`), which hosted applied
and the repository does not replay. A hard-coded reference to it would have
been correct in exactly one of the two environments. Both "what would silently
cascade" reports (employers and accounts) are therefore built from
`pg_constraint` at call time instead of from a hand-maintained list — which
also means a table added next month is covered on the day it exists.

**F11 — the operational guard changes one existing admin behaviour, deliberately.**
Before this change, a platform admin (or any service-role write) could create a
job, an employee or an assessment assignment for a **suspended** employer; RLS
blocked the employer's own members but exempted admins. The new BEFORE INSERT
guard applies to every Postgres role, so that write is now refused with
`EMPLOYER_NOT_OPERATIONAL`. This surfaced immediately: `jobs_self_publish_test`
built its fixture by inserting a draft directly for an already-suspended
employer. The fixture now suspends the organisation through
`moderate_employer()` **after** creating the draft — which is the only sequence
that can occur in production anyway — and every assertion in that suite is
unchanged.

---

## 6. Capability matrix (AFTER)

| entity | disable | archive | anonymise | delete | who |
| --- | --- | --- | --- | --- | --- |
| employer | ✅ suspend (unchanged) | ✅ **new** `archived` / `restored` | — | ✅ **new**, only when the database computes it empty | archive: admin · delete: **superadmin** |
| auth account | ✅ **new** (`banned_until`) | — | ✅ **new** | ✅ **new**, only when the impact report is empty | disable: admin (superadmin to disable an admin) · anonymise + delete: **superadmin** |
| platform role | ✅ revoke (unchanged) | — | — | — | superadmin |
| job | ✅ close/archive (unchanged) | ✅ (unchanged) | — | ✅ **new** admin path for a never-published draft | admin |
| application | inspect (unchanged) | — | — | ❌ by design | — |
| assignment | ✅ cancel (unchanged) | — | — | ❌ by design | admin |
| attempt / report / Passport evidence | ❌ by design | — | ❌ by design | ❌ by design | — |
| audit trail | — | — | — | — | readable at `/admin/audit` |
| identity duplicates | — | — | — | — | read-only diagnostics at `/admin/data` |

New database surface: `employer_accepts_operations`,
`employer_operational_guard` (+5 triggers), `admin_employer_deletion_impact`,
`admin_delete_employer_if_safe`, `admin_user_deletion_impact`,
`admin_set_user_disabled`, `admin_anonymise_user`, `admin_delete_user_if_safe`,
`admin_delete_job_if_safe`, `admin_identity_diagnostics`,
`admin_disposable_records`, `admin_person_overview`, and two new actions on the
existing `moderate_employer()`.
