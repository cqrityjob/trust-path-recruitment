# P1-B (1/4): one active-employer rule, applied to employer reports and reads

**Status: PENDING.** This is an isolated PR from `origin/main`, the first of
four for P1-B of the 2026-10-02 full hostile-user re-audit. It is not merged,
and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270108090000_employer_active_reads.sql` |
| Rollback | `supabase/rollback/20270108090000_employer_active_reads_rollback.sql` |
| Suite | `supabase/tests/employer_active_reads_test.sql` (24 assertions) |

## 1. Root cause

An organisation that is not `active` loses application access through
row-level security: `job_applications_employer_select` requires
`employer_is_active_status`. But most `SECURITY DEFINER` employer functions,
and several row policies, check only the caller's membership.

On production, a rolled-back probe suspended an employer. Its owner then read
nothing from `job_applications`, but still read through the functions:

| Read | Rows |
|---|---|
| Released employer report (`scp_employer_report`, `_v3`, `_identity`) | 1 |
| Assessment pipeline | 12 |
| Subject progress | 24 |
| Development recommendations | 3 |
| Participants | 12 |
| Person overview | 3 |

The same gap lets an organisation that is not yet approved read data.

## 2. Fix

### The canonical rule

A new function, `has_active_employer_role(user, employer, roles)`, is the rule
this migration introduces and every later P1-B and P1-D fix reuses:

```sql
coalesce(has_employer_role(user, employer, roles), false)
AND coalesce(employer_is_active_status(employer), false)
```

It is true only for an active membership, optionally in one of `roles`, of an
organisation whose status is `active`. It is false for every other status
(`draft`, `pending`, `rejected`, `suspended`, `archived`) and for an unknown
organisation, and it never returns NULL. This is the rule `job_applications`
already enforces, written once.

The rule guards data about candidates, people and their evidence. An
organisation's own set-up (profile, job drafts, team list, content catalogue)
stays reachable to draft and pending members, as `employer_members_can_edit`
already allows.

### Where it now applies

| Kind | Objects |
|---|---|
| Helpers | `scp_report_snapshot_readable` (employer branch). This covers the employer report family, `scp_subject_progress` and the `scp_report_snapshots_employer` policy. `scp_report_issuer_admin` covers `scp_participant_report_for_issuer`. |
| Read functions | `scp_employer_participants`, `scp_employer_assessment_pipeline`, `scp_employer_person_overview`, `scp_employer_person_assessments`, `scp_employer_training_status`, `scp_employer_decisions`, `scp_employer_invitations`, `scp_employer_review_board`, `scp_employer_review_pressure`, `scp_subject_progress`, `scp_development_recommendations` |
| Row policies | `scp_assessment_invitations_employer_read`, `scp_employer_decisions_member_read`, `scp_training_assignments_read`, `scp_training_progress_read` |

A caller who fails the rule gets exactly the answer a non-member already gets
(no rows, or false). An inactive organisation therefore cannot tell
"inactive" from "not there". Each body is the hosted body verbatim except its
membership gate, which is marked `20270108090000` in place.

**Not changed:**
- payloads, columns and grants;
- the participant's own reads;
- `scp_employer_team`, `scp_employer_library` and `scp_employer_content_library`;
- any row.

The application already sends every non-active employer to `/employer/pending`
before any of these functions is called
(`src/routes/_authenticated.employer.$employerSlug.tsx`), so no legitimate
screen loses data.

The other three P1-B PRs cover:
- candidate identity and job notifications;
- assessment actions and Interview Intelligence;
- the Security Passport.

## 3. Hosted state (read-only, 2026-10-02)

| Check | Result |
|---|---|
| Employers | 11, all `active` |
| Moderation history | Only 5 `pending → active` approvals. No employer has ever been suspended. |
| Bodies | All 13 hosted bodies equal the md5 values the rollback pins. |

Nothing is exposed today and there is nothing to repair. The gap opens the
first time an employer is suspended.

## 4. Tests

The fixture runs the real flow, with each step done by the principal allowed
to take it. One person is assessed by employer E: assign → answer → submit →
review → release. E also has:
- a second sitting waiting for review;
- a training assignment;
- an open invitation;
- an employer decision.

E is suspended and reactivated through the real `moderate_employer()`, as a
platform admin.

| Group | Proves |
|---|---|
| AR-F | While E is active, its owner reads all 19 reads (functions and row policies). A plain member reads the same except the issuer-admin report. A member of an unrelated employer reads nothing. |
| AR0 | **Reproduction.** E is suspended and the pre-fix state is restored with the real rollback inside a savepoint. E's owner still reads all 19. |
| AR1 | With E suspended, its owner, member and reviewer each get exactly an outsider's answer. |
| AR2 | The same holds for `pending`, `rejected`, `archived` and `draft`. |
| AR3 | Reactivation restores every read to the AR-F counts. |
| AR4 | The participant reads their progress and report whatever E's status. |
| AR5 | The primitive itself: roles, a suspended membership, a suspended organisation, unknown and NULL ids (false, never NULL). Authenticated may execute it, anon may not. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback (primitive kept) | AR1.1 |
| NC2 | Only `scp_report_snapshot_readable` on its pre-fix body | AR1.1 |
| NC3 | Only the four row policies on their pre-fix predicates | AR1.1 |
| NC4 | A deny-list primitive that refuses only `suspended` | AR2.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.

## 5. Rollback

The rollback restores the 13 hosted bodies (md5 pinned) and the four policies,
then drops the primitive. It refuses to drop the primitive while any other
function or policy still calls it, so later migrations in this series must be
rolled back first.
