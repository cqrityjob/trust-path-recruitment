# Employer report access — the model, the objects it changes, and the order it ships in

Status: **design, written before the implementation.** It answers the finding in
`2026-10-03-report-access-security-finding.md` (reproduced there, and pinned by
`supabase/tests/employer_report_access_matrix_test.sql` on main `f5eb230` plus PR #387).
Evidence below is from a full replay of the migration chain through `20270201090000` into a
scratch database; every "latest definition" was read from the replayed catalogue, not from memory,
and the source migration of each is named.

## 0. The requirement

> Authorised recruiters and assessors must be able to read the relevant company reports, while
> ordinary membership must NOT automatically give that access. Preserve the security-vetting
> (säkerhetsprövning) special restrictions. Fix the circumvention of suspension.

No role model is invented. The existing parts are used as they are:

| Part                                                                                                | Where it lives                                                              |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| membership role `owner` / `admin` / `member`, status `invited` / `active` / `suspended` / `removed` | `employer_memberships`                                                      |
| organisation status (only `active` counts)                                                          | `employers.status`, `has_active_employer_role`                              |
| per-use-case reviewer grant (`workforce`, `recruitment`), granted and revoked by owner/admin        | `scp_employer_reviewers`, `scp_can_review_for`                              |
| the named recruitment responsible of a vacancy                                                      | `recruitment_settings.responsible_user_id` (`rec_can_manage`)               |
| the interview case creator and the case's panel                                                     | `scp_interview_cases.created_by`, `scp_interview_panels` / `_panel_members` |
| appointed security officers for vetting-restricted cases                                            | `bcp_security_officers`, `bcp_case_access_ok`                               |
| platform admin                                                                                      | `is_platform_admin`, `update_employer_membership`                           |

"Assessor" is not a role. It exists as a reviewer grant and as `assessor_id` on interview
assessment rows, and is used here only in that sense.

## 1. The model

An **employer-audience read** is any read of what an organisation learned about a person through
an assessment or an interview: the released report (`scp_employer_report`, `_v3`, `_identity`, the
snapshot rows), decisions, interview notes, subject progress, development recommendations, the
participant, pipeline and person lists, the invitation list, the assignment rows, the counts of
reviews waiting, workforce training status, and the interview case with everything under it.

A caller **may** make such a read of one item only if every one of these holds:

1. **Standing.** They hold an `active` membership of an organisation whose status is `active`
   (`has_active_employer_role`). Suspended, removed, invited, other organisation, logged out: no.
2. **Not the subject.** The item is not about them. A person who is also a member never reads the
   employer-audience document about themselves, or a colleague-facing document about themselves,
   through membership. They keep their participant document.
3. **A basis**, exactly one of:
   - **R1** owner or admin of the organisation;
   - **R2** an **active reviewer grant** in that organisation whose `allowed_use_cases` contains the
     use case of the item (a `recruitment` grant never reads `workforce` items and vice versa). An
     item whose use case is NULL or unknown is not reachable through R2;
   - **R3** for a **recruitment** item: the named responsible recruiter of the vacancy the item
     belongs to (`recruitment_settings.responsible_user_id` of the assignment's job, or of the
     application's job);
   - **R4** (interview cases only): the **creator** of that case, or a **member of that case's
     panel**.
4. **Vetting.** For an interview case, `bcp_case_access_ok(case)` as well. The vetting restriction
   is additive: it can only narrow what 1–3 allow, never widen it. An owner or admin who is not an
   appointed security officer does not read a vetting-restricted case, exactly as today.

An ordinary member with none of R1–R4 reads **nothing**: no rows, no counts, no flags.

Release (frisläppning) and finalise stay owner/admin only, and are not touched. Platform admin
behaviour is unchanged: a platform admin who is not a member reads nothing through these
functions, and keeps the raw `*_author_read` policies (finding c, not in scope).

### 1.1 The use case of an item

| Item                                               | Use case                                                                               | Vacancy (R3)                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| attempt, report snapshot, decision, interview note | `assessment_assignments.use_case` of the attempt's assignment; **no assignment: NULL** | `assessment_assignments.job_id`, else the job of `assessment_assignments.application_id` |
| invitation                                         | `scp_assessment_invitations.use_case`                                                  | `job_id`, else the application's job                                                     |
| assignment row                                     | `assessment_assignments.use_case`                                                      | as above                                                                                 |
| training assignment                                | `workforce`                                                                            | none                                                                                     |
| interview case                                     | `recruitment` (interview intelligence is the recruitment interview product)            | `scp_interview_cases.job_id`, else the application's job                                 |

The review code coalesces a missing assignment to `workforce` (`scp_review_authorisation`,
`scp_employer_assessment_pipeline`). The read model deliberately does **not**: an assessment attempt
without an assignment has no known use case and is therefore owner/admin only. That is the safe
direction, and an assessment attempt without an assignment is not a path the product creates.

### 1.2 The matrix

Y = reads / may, N = refused, and "own" = only what the case or vacancy names. Release and finalise
are owner/admin only in every row.

| Actor                              | Report, decisions, notes, progress, recs | Lists (participants, pipeline, person, invitations, assignments, training) | Counts (review board, pressure) | Interview case, notes, findings, final report | Case write (assess, notes, conclude) | Release / finalise |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------- | ------------------------------------ | ------------------ |
| Logged out                         | N                                        | N                                                                          | N                               | N                                             | N                                    | N                  |
| The subject, who is a member       | N (own participant document only)        | N for rows about them                                                      | N for their attempts            | N for their case                              | N                                    | N                  |
| Owner / admin                      | Y                                        | Y                                                                          | Y                               | Y (vetting: officers only)                    | Y                                    | Y                  |
| Reviewer, `recruitment` grant      | recruitment items                        | recruitment rows                                                           | recruitment attempts            | all recruitment cases                         | all recruitment cases                | N                  |
| Reviewer, `workforce` grant        | workforce items                          | workforce rows, training                                                   | workforce attempts              | none (no workforce cases)                     | none                                 | N                  |
| Responsible recruiter of vacancy V | recruitment items of V                   | rows of V                                                                  | attempts of V                   | cases of V                                    | cases of V                           | N                  |
| Case creator / panel member        | none                                     | none                                                                       | none                            | **their case only**                           | **their case only**                  | N                  |
| Ordinary member                    | **N**                                    | **N**                                                                      | **N**                           | **N** (their own cases, if any)               | **N**                                | N                  |
| Suspended / removed member         | N                                        | N                                                                          | N                               | N                                             | N                                    | N                  |
| Member of another organisation     | N                                        | N                                                                          | N                               | N                                             | N                                    | N                  |
| Platform admin, not a member       | N through the app                        | N                                                                          | N                               | N                                             | N                                    | N                  |

Every `Y` in the case columns for owner/admin, reviewer and responsible recruiter is **AND**
`bcp_case_access_ok`.

## 2. One definition

```
public.employer_reports_readable(
  _employer_id uuid, _use_case text DEFAULT NULL, _job_id uuid DEFAULT NULL,
  _application_id uuid DEFAULT NULL, _subject_users uuid[] DEFAULT NULL, _case_id uuid DEFAULT NULL)
RETURNS boolean   -- STABLE SECURITY DEFINER, search_path pinned, EXECUTE authenticated + service_role
```

It reads `auth.uid()` only, so it answers "may the **caller**", never "may this other user". It is
the only place in the schema where R1–R4, the standing rule and the subject rule are written. Two
thin adapters resolve what an item is, and make no decision of their own:

- `scp_attempt_reports_readable(_attempt_id)`: attempt → issuer, assignment use case, vacancy,
  the subject's account → `employer_reports_readable`.
- the three case gates (`scp_iv_can_read_case`, `scp_iv_can_write_case`,
  `scp_iv_case_row_visible`): case → employer, `recruitment`, vacancy, candidate and applicant
  accounts, the case id → `employer_reports_readable`, and then `bcp_case_access_ok`.

Plus one read-only entry for the application, so the UI can tell the truth:
`employer_report_access(_employer_id)` returns the caller's own facts about that organisation
(active member, owner/admin, reviewer use cases, the vacancies they are responsible for, whether any
case is readable by them). It returns nothing about anybody else and is not an authorisation.

## 3. What changes, and where each object comes from

Three migrations, in this order (§7). "Source" is the migration that holds the **latest**
definition in the chain; each new body starts from it and changes only what is named.

### 3.1 `20270202090000_employer_membership_standing_not_bypassable.sql` (suspension and removal)

| Object                                                                                         | Kind                                                                                   | Source of the latest definition                        | Change                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employer_access_request_standing_guard()` + trigger `employer_access_requests_standing_guard` | new, BEFORE INSERT on `employer_access_requests`                                       | none                                                   | refuses `ACCESS_REQUEST_MEMBERSHIP_BLOCKED` when the requester's membership of that organisation is `suspended` or `removed`                                                                                                                             |
| `approve_access_request(uuid,text,text)`                                                       | function                                                                               | `20270120090000_access_request_no_role_escalation.sql` | refuses `ACCESS_REQUEST_REACTIVATION_REFUSED` for **every** caller, platform admin included, when the requester's membership is `suspended` or `removed`. The `ON CONFLICT DO UPDATE` can then only ever touch an `invited` row                          |
| `employer_membership_revoke_reviewer_grants()` + trigger                                       | new, AFTER UPDATE OF status / AFTER DELETE on `employer_memberships`, SECURITY DEFINER | none                                                   | when a membership becomes anything but `active`, or is deleted, every live `scp_employer_reviewers` grant of that user in that organisation is marked revoked (`revoked_at`, `revoked_by`), in the same transaction. Reactivation does not bring it back |
| one-off backfill                                                                               | data                                                                                   | none                                                   | live grants of memberships that are **already** suspended, removed or gone are revoked. They are inert today (`scp_can_review_for` requires an active membership); this makes sure they do not return on reactivation. The count is reported as a NOTICE |

**Every writer of `employer_memberships`, audited across the whole chain** (grep over
`INSERT INTO`, `UPDATE`, `ON CONFLICT`, `DELETE FROM`, plus the catalogue, plus `src/` and
`supabase/functions/`):

| Path                                                            | Can it move suspended/removed → active?                                                                                                                                        | Verdict                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `update_employer_membership` (`20260719100000`)                 | yes, by design: `is_platform_admin` is checked inside and RLS also requires it                                                                                                 | the **only** intended path; unchanged |
| `employer_memberships_admin_all` policy, direct DML             | yes, platform admin only (the admin "add member" server function inserts through it)                                                                                           | intended; unchanged                   |
| `approve_access_request` (`20270120090000`)                     | **yes**: `ON CONFLICT … DO UPDATE SET status='active'`, refusing only an ACTIVE requester, for any owner/admin of the organisation                                             | **closed**                            |
| `employer_access_requests_requester_insert` policy              | **yes in effect**: checks only `requester_user_id = auth.uid()`, for any employer id, so a suspended or removed person can file the request that the route above then approves | **closed** (trigger; coded error)     |
| `create_my_employer_company`, `create_employer_self_service`    | no: both create a **new** employer and its owner row; the unique key cannot collide with an existing membership                                                                | verified by test, unchanged           |
| direct DML by an organisation's owner or admin or by the member | no: no INSERT/UPDATE/DELETE policy exists for them (RLS refuses; `authenticated` holds the table grant, RLS is the boundary)                                                   | verified by test, unchanged           |
| `scp_grant_employer_reviewer` / the reviewer guard              | not a membership write; refuses a grant to a non-active member (`SCP_REVIEWER_NOT_A_MEMBER`)                                                                                   | verified by test, unchanged           |
| `src/`, `supabase/functions/`                                   | only `membership.functions.ts` writes (platform admin through the policy above)                                                                                                | unchanged                             |

No other function, policy or trigger writes the table. There are no triggers on it besides
`set_updated_at`.

### 3.2 `20270203090000_employer_report_access_model.sql` (reports, lists, counts)

New: `employer_reports_readable(…)`, `scp_attempt_reports_readable(uuid)`,
`scp_report_snapshot_readable(text,uuid,uuid,uuid)` (the attempt-aware overload),
`employer_report_access(uuid)`.

| Object                                                                                   | Kind      | Source of the latest definition                                              | Change                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scp_report_snapshot_readable(text,uuid,uuid)`                                           | function  | `20270108090000_employer_active_reads.sql`                                   | participant branch verbatim; employer branch asks the one definition with an **unknown use case**, i.e. owner/admin only. Any caller that does not name an attempt gets the strict answer                                                                                            |
| `scp_employer_report(uuid)`                                                              | function  | `20260904171840_scp_trust_evidence_report_r2a_report_version_continuity.sql` | gate becomes the attempt-aware overload                                                                                                                                                                                                                                              |
| `scp_employer_report_identity(uuid)`                                                     | function  | `20261107090000_scp_iv_report_basis_integrity.sql`                           | same                                                                                                                                                                                                                                                                                 |
| `scp_employer_report_v3(uuid)`                                                           | function  | `20260906125945…`                                                            | **no change**: it reads the document through `scp_employer_report`                                                                                                                                                                                                                   |
| `scp_participant_report`, `scp_participant_report_for_issuer`, `scp_report_issuer_admin` | functions |                                                                              | **no change**: participant branch, and owner/admin only                                                                                                                                                                                                                              |
| `scp_subject_progress(uuid)`                                                             | function  | `20270108090000`                                                             | the employer branch is entered only through an attempt the caller may read, and every snapshot row is filtered by the attempt-aware overload                                                                                                                                         |
| `scp_development_recommendations(uuid)`                                                  | function  | `20270108090000`                                                             | an organisation counts only if **every** released attempt of the subject in it is readable by the caller. Maturity is computed per issuing organisation and cannot be split by attempt, so a partial reader gets nothing rather than a blend that includes an item they may not read |
| `scp_employer_decisions(uuid)`                                                           | function  | `20270108090000`                                                             | attempt gate                                                                                                                                                                                                                                                                         |
| `scp_interview_notes(uuid)`                                                              | function  | `20270109090000_candidate_identity_active_employer.sql`                      | attempt gate                                                                                                                                                                                                                                                                         |
| `scp_employer_participants(uuid)`                                                        | function  | `20270108090000`                                                             | per-row attempt gate                                                                                                                                                                                                                                                                 |
| `scp_employer_assessment_pipeline(uuid)`                                                 | function  | `20270108090000`                                                             | per-row attempt gate. `can_release` is unchanged (owner/admin). `scp_employer_person_assessments` reads through it and needs no change                                                                                                                                               |
| `scp_employer_person_overview(uuid,uuid)`                                                | function  | `20270108090000`                                                             | assessment and interview-note rows per attempt gate. The `application` rows are recruitment-pipeline data governed by the `rec_*` model and are not touched                                                                                                                          |
| `scp_application_assessments(uuid)`                                                      | function  | `20270105090000_suspended_employer_applicant_reads.sql`                      | per-row gate on the assignment's use case and vacancy                                                                                                                                                                                                                                |
| `scp_employer_invitations(uuid)`                                                         | function  | `20270108090000`                                                             | per-row gate on the invitation's use case and vacancy                                                                                                                                                                                                                                |
| `scp_employer_review_board(uuid)`, `scp_employer_review_pressure(uuid)`                  | functions | `20270108090000`                                                             | the attempts counted are the ones the caller may read                                                                                                                                                                                                                                |
| `scp_employer_training_status(uuid)`                                                     | function  | `20270108090000`                                                             | rows gated as `workforce`                                                                                                                                                                                                                                                            |
| policy `scp_report_snapshots_employer`                                                   | policy    | `20260904174903_scp_trust_evidence_report_r2a_contract.sql`                  | uses the attempt-aware overload                                                                                                                                                                                                                                                      |
| policy `scp_employer_decisions_member_read`                                              | policy    | `20270108090000`                                                             | attempt gate                                                                                                                                                                                                                                                                         |
| policy `scp_interview_notes_employer_read`                                               | policy    | `20270109090000`                                                             | attempt gate                                                                                                                                                                                                                                                                         |
| policy `scp_assessment_invitations_employer_read`                                        | policy    | `20270108090000`                                                             | use case and vacancy                                                                                                                                                                                                                                                                 |
| policy `assignments_employer_select`                                                     | policy    | `20260724090000_employer_assessment_assignments.sql`, as altered later       | the legacy and SCP assignment rows carry `recipient_email`, status and, for the legacy lineage, `answers` and `engine_result`; gated on use case and vacancy. The recipient's own policy is untouched                                                                                |
| policies `scp_training_assignments_read`, `scp_training_progress_read`                   | policies  | `20270108090000`                                                             | the employer branch gated as `workforce`; the learner branch untouched                                                                                                                                                                                                               |

ACLs: every function keeps its present grants. The new ones are `authenticated` (and `service_role`
for the helper), never `anon`, with an explicit `REVOKE ALL … FROM PUBLIC, anon`.

### 3.3 `20270204090000_interview_case_access_model.sql` (Interview Intelligence)

| Object                               | Kind     | Source of the latest definition                      | Change                                                                                                                                                                                                  |
| ------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scp_iv_can_read_case(uuid)`         | function | `20270111090000_interview_beskt_active_employer.sql` | the one definition (R1–R4) **and** `bcp_case_access_ok`                                                                                                                                                 |
| `scp_iv_can_write_case(uuid)`        | function | `20270111090000`                                     | same predicate, plus the existing `cancelled` / `retention_state = 'active'` conditions and `bcp_case_access_ok`. A plain member is refused for write as well as read                                   |
| `scp_iv_case_row_visible(uuid,uuid)` | function | `20270111090000`                                     | the one definition, and the vetting expression it already has                                                                                                                                           |
| policy `scp_iv_corrections_employer` | policy   | `20270111090000`                                     | `scp_iv_can_read_case(case_id)`. This is finding **a**: the corrections of a candidate on a vetting-restricted case were readable by any member because the policy did not include `bcp_case_access_ok` |

Every child-table policy of Interview Intelligence reads through `scp_iv_can_read_case` or
`scp_iv_can_write_case` and follows without being edited.

**Inherited, and reported because it is not mine to edit.** The BESKT conduct functions
(`bcp_conduct_*`, `bcp_conduct_sessions_member_read`, `bcp_conduct_reports_member_read`) authorise
through `scp_iv_can_read_case` / `scp_iv_can_write_case`. After this change a plain member can join a
conduct session, record a stance or read a conduct report only if they are the case's creator, on its
panel, or authorised under R1–R3. No `bcp_*` object is edited. The only `bcp_case_access_ok` call
added is the one that already sits inside the three gates and the new one in the corrections policy
(through the gate).

## 4. Findings a–f

| #   | Finding                                                           | Handling                                               |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| a   | corrections policy lacks `bcp_case_access_ok`                     | closed in `20270204090000`                             |
| b   | the subject who is a member reads reports about themselves        | closed by rule 2 in the helper, for attempts and cases |
| c   | content-role holders read every tenant through `*_author_read`    | **not in scope**, unchanged                            |
| d   | release is owner/admin only                                       | unchanged, asserted                                    |
| e   | `approve_access_request` and the request insert bypass suspension | closed in `20270202090000`                             |
| f   | reviewer grants survive suspension and removal                    | closed in `20270202090000`, with a backfill            |

## 5. Compatibility: EXPAND, then the application

- **The migrations are safe before the application change.** No signature the application calls is
  removed or changed; the new objects are additive. An old application against the new database
  simply gets what the new model returns: an empty list, an empty result, `no_data_found` or
  "not found" for the interview case, for an ordinary member. Nothing errors that did not before.
- **The application tolerates both.** It asks `employer_report_access`; if the function does not
  exist yet (PostgREST `PGRST202` / "could not find the function") the answer is `unknown` and every
  screen behaves exactly as it does today. Once the answer is known, an ordinary member sees an
  honest "you do not have access to results in this organisation — ask an owner or an
  administrator" state instead of an error or an empty list that reads as "no candidates", and the
  entry points that need access are hidden.
- **The access-request refusal is mapped in the application** from its error code, and works the
  same before the migration (the insert then simply succeeds, as today).

## 6. What is deliberately not changed

- Content-role `*_author_read` policies (finding c).
- Release and finalise (owner/admin).
- `job_applications`, `recruitment_*` and the application pipeline: they are governed by the
  `rec_*` model (`rec_is_member`, `rec_can_manage`). A vacancy's responsible recruiter is read from
  that model; the per-application responsible (`recruitment_application_meta`) is **not** a read
  basis, because it assigns follow-up work, not access to results.
- `scp_assessment_setups` (configuration of an assignment, no result), `scp_employer_team`, the
  catalogue and library reads, `employees`.
- All `sp_*` (Passport) and `bcp_*` (BESKT) objects, migrations `20270124/25/26`, and the job-board
  migrations `20270130/31/20270201`. The BESKT employer reads `bcp_employer_assignments`,
  `bcp_employer_people`, `bcp_employer_party` and the two member-read policies on `bcp_*` tables
  admit any active member today; they are reported, not touched.
- **Case-scoped assignments are not revoked on suspension**: panel membership, case creation and the
  responsible-recruiter name stay on their rows. They are inert while the membership is not active
  and return on a platform-admin reactivation. Only reviewer grants (finding f) are revoked, because
  they are an organisation-wide grant that an owner or admin made and must make again.
- An organisation-level suspension (`employers.status`) is not a membership change and does not
  revoke grants; it already blocks every read through `has_active_employer_role`.

## 7. Apply order

1. **`20270202090000`** (standing). Standalone.
2. **`20270203090000`** (reports). Standalone.
3. **`20270204090000`** (interview cases). Requires `20270203090000` (`employer_reports_readable`);
   refuses with `INTERVIEW_CASE_ACCESS_PRECONDITION` otherwise.
4. Verify the md5 pins and the grants recorded in `supabase/release-state.json`, and the new
   functions' EXECUTE grants on the hosted project (a new `public` function is granted to `anon` by
   default there; every new function carries an explicit `REVOKE`).
5. Then the application change. It is safe in either order.

Rollback is the three rollback files in the reverse order (`…0204`, `…0203`, `…0202`). Each restores
the function bodies by md5 and each SQL suite runs its own rollback inside a savepoint to
reproduce the defect before it proves the fix.

## 8. How it is proven

- Each suite reproduces the defect on the **pre-fix state inside the suite** (a savepoint, then the
  real rollback file, then a rollback to the savepoint), then proves the fix:
  `employer_membership_standing_test.sql`, `employer_report_access_model_test.sql`,
  `interview_case_access_model_test.sql`.
- The two existing suites that encode the old model are flipped, and every `MEMBER-WIDE-MODEL` tag is
  replaced: `employer_report_access_matrix_test.sql` and `employer_active_reads_test.sql` (AR-F.2).
- Planted controls in `scripts/db-test.sh` fail on named assertions.
- `scripts/employer-report-access-check.ts` pins the application half (the access state, the
  gating, the copy) and has a negative-control pair.
- The stubbed-backend browser specs that can run locally are kept consistent;
  `e2e/employer-final-report-evidence.spec.ts` needs the local stack and is updated, not run.
