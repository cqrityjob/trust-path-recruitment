# Release note — ordinary membership no longer reads company reports (20270203090000)

Migration: `supabase/migrations/20270203090000_employer_report_access_model.sql`
Rollback: `supabase/rollback/20270203090000_employer_report_access_model_rollback.sql`
Suites: `supabase/tests/employer_report_access_model_test.sql` (66 assertions),
`supabase/tests/employer_report_access_matrix_test.sql` (63, flipped), `supabase/tests/employer_active_reads_test.sql` (26, AR-F.2 flipped)
Design: `2026-10-03-employer-report-access-design.md` sections 1 to 3.2. Finding:
`2026-10-03-report-access-security-finding.md`.

## What was wrong

Every employer-audience read admitted **any active member of the organisation**: the released report,
decisions, interview notes, subject progress, development recommendations, the participant, pipeline,
person and invitation lists, the assignment rows (which carry the recipient's email, and for the
legacy lineage the answers and engine result), the review counts, and workforce training status. A
person who was also a member could read the employer-audience document about themselves. The
reviewer grants an owner or admin makes in `scp_employer_reviewers`, and the named responsible
recruiter of a vacancy, gave no more than plain membership did.

## The model

A caller reads one item only if they hold **standing** (an active membership of an active
organisation), are **not the subject** of the item, and have a **basis**: owner or admin (R1); an
active reviewer grant whose use cases contain the item's use case (R2); or, for a recruitment item,
the responsible recruiter of the item's vacancy (R3). An item whose use case is unknown is reachable
by owner or admin only. Release (frisläppning) and finalise stay owner/admin only and are not
touched. Existing roles and grants only; nothing was invented.

| Actor                                                                | Report, decisions, notes, progress, recs | Lists, assignment rows, training | Counts (review board, pressure) |
| -------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- | ------------------------------- |
| Owner / admin                                                        | all                                      | all                              | all                             |
| Reviewer, `recruitment` grant                                        | recruitment items                        | recruitment rows                 | recruitment attempts            |
| Reviewer, `workforce` grant                                          | workforce items                          | workforce rows and training      | workforce attempts              |
| Responsible recruiter of vacancy V                                   | recruitment items of V                   | rows of V                        | attempts of V                   |
| Ordinary member                                                      | none                                     | none                             | none                            |
| The subject, who is a member                                         | none about themselves                    | none about themselves            | none about themselves           |
| Suspended / removed member                                           | none                                     | none                             | none                            |
| Another organisation, platform admin who is not a member, logged out | none                                     | none                             | none                            |

## What changes

One definition, three adapters, and the objects that ask them:

| Object                                                                                                                                                                                                                                                                                                                                                                                                                     | Change                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `employer_reports_readable(employer, use_case, job, application, subject_users, case)`                                                                                                                                                                                                                                                                                                                                     | **new**, the only place the model is written. Answers for `auth.uid()` only, never NULL                                                                                                                                  |
| `scp_attempt_reports_readable(attempt)`                                                                                                                                                                                                                                                                                                                                                                                    | **new** adapter: an attempt's issuer, use case, vacancy and subject, then the definition                                                                                                                                 |
| `scp_report_snapshot_readable(text,uuid,uuid,uuid)`                                                                                                                                                                                                                                                                                                                                                                        | **new** four-argument overload that knows the attempt; the three-argument form delegates with no attempt (owner/admin only)                                                                                              |
| `employer_report_access(employer)`                                                                                                                                                                                                                                                                                                                                                                                         | **new**, read-only: the caller's own facts (member, owner/admin, readable use cases, responsible vacancies, any case), always one row. It lets the screen say "you do not have access to results". It authorises nothing |
| `scp_employer_report`, `scp_employer_report_identity`, `scp_subject_progress`, `scp_development_recommendations`, `scp_employer_decisions`, `scp_interview_notes`, `scp_employer_participants`, `scp_employer_assessment_pipeline`, `scp_employer_person_overview`, `scp_application_assessments`, `scp_employer_invitations`, `scp_employer_review_board`, `scp_employer_review_pressure`, `scp_employer_training_status` | bodies ask the adapter, row by row where the function returns rows; each starts from the latest definition in the chain (md5 pinned in the rollback)                                                                     |
| policies `scp_report_snapshots_employer`, `scp_employer_decisions_member_read`, `scp_interview_notes_employer_read`, `scp_assessment_invitations_employer_read`, `assignments_employer_select`, `scp_training_assignments_read`, `scp_training_progress_read`                                                                                                                                                              | the employer branch asks the adapter or the definition; the subject's and the learner's own branches are untouched                                                                                                       |

Untouched: release and finalise, the participant document (`scp_participant_report*`),
`scp_employer_report_v3` and `scp_employer_person_assessments` (they read through the changed
functions), `job_applications`, every `sp_*` and `bcp_*` object, the content-role `*_author_read`
policies (finding c, out of scope).

`scp_development_recommendations` is computed per issuing organisation, so a caller who may read only
part of a subject's released attempts gets nothing rather than a blend that includes an item they
may not read.

## Proof

`employer_report_access_model_test.sql` reproduces the defect on the **pre-fix state inside the
suite** (RA0: the real rollbacks inside a savepoint: an ordinary member reads the report, the lists
and the counts), then proves the model (RA1 to RA9), including the subject exclusion, a grant for
the other use case, an unknown use case, a recruiter of the other vacancy, suspension (member and
organisation), and RA9, which asserts exactly what `employer_report_access` tells each principal.
The matrix suite (`MEMBER-WIDE-MODEL` tags) and `employer_active_reads_test.sql` (AR-F.2) now assert
the narrower model. Eight planted controls in `scripts/db-test.sh` for the matrix and nine for the
model each fail on a named assertion.

## Older suites, and the db-test cycles

Sixteen older suites assumed that a plain member reads or works what the organisation holds. None of them
was weakened: where the member is an ACTOR of the suite (the second assessor, the colleague who reaches the
owner's case, the member who previews a report) the fixture now gives them the existing basis, a reviewer
grant made by the owner (`candidate_identity_active_employer`, `bcp_interview_conduct`,
`interview_beskt_active_employer`, `scp_interview_evidence_reliability`, `scp_interview_starts`,
`scp_iv_findings_review_writes`, `scp_iv_panel_reveal_boundary`, `scp_iv_report_basis_integrity`,
`scp_phase2_journey`, `suspended_employer_applicant_reads`, `scp_subject_progress_scope`;
`bcp_beskt_complete` probes with the owner, who has a basis). Where the assertion IS the old model it was
flipped: `scp_development_recommendations_scope` DR1.3 (a plain member gets nothing; the member of both
employers is an admin of both, because that suite writes attempts with no assignment),
`scp_participant_report_issuer_preview` P3.2 (the ordinary member has no employer read; P3.2b keeps the
reviewer's) and P5.6 (two overloads now), `scp_pilot_security_gate` SG1.7 (the owner reads the assignment
list, the ordinary member no longer does). The real vetting suite `scp_interview_case_vetting_read_test.sql`
keeps its assertions (its member and its security officer hold a recruitment grant) and gains CV5: on a
real BESKT vetting, a recruitment reviewer, a panel member of the vetting case and a candidate's corrections
are all refused without the appointment, and a reviewer who is ALSO appointed reads it. It holds on both
sides of the model, which matters because of the next paragraph.

`scripts/db-test.sh` rolls older migrations back and re-applies them to prove them. A re-applied older
migration puts its old function bodies back, which silently replaced this model for every later suite.
After every full re-apply of an older migration that redefines an object of this model (and after the
direct re-applies of 20260904174903 and 20261107090000), `ac_restore_model` applies 20270202090000,
20270203090000 and 20270204090000 again, and the four access suites are run once more after the last of
those cycles. The BESKT stand-down cycles (20261130 to 20270111) pin function bodies and are deliberately
not restored; the suites inside them hold on both sides of the model. The planted control NC2 of the
active-reads section plants the pre-fix helper on the overload the policies now call, and the documented
SCP rollback procedure (`scp_a_rollback_test.sql`) drops the new `scp_` functions, the trigger that ends a
reviewer grant with its membership (it would otherwise fail every later delete of a membership), and
re-points the legacy assignments policy, which survives that rollback, to its legacy predicate.

## Application

A second release, safe in either order. The application asks `employer_report_access`; if the
function does not exist (`PGRST202`), or the call fails, the answer is `unknown` and every screen is
exactly what it was. Only a **confirmed** "member with no basis" yields the honest notice ("you do
not have access to results in this organisation"), and the report tabs and entry points that lead
only there are hidden. `scripts/schema-first-release-check.ts` blocks it from merging before this
migration is applied.

## Apply

After `20270202090000`. Before applying, read the hosted md5s listed in `release-state.json`
(`verify`) and compare with the bodies named there. After applying, expect the new md5s, three
functions plus `employer_report_access` not executable by `anon`, and the seven policies naming
`employer_reports_readable`, `scp_attempt_reports_readable` or the four-argument
`scp_report_snapshot_readable`. **Expected effect on a live organisation:** a member who is not an
owner, an admin, a reviewer for the use case or the vacancy's responsible recruiter immediately
reads no report, row or count. Owners and admins who relied on members seeing results should grant
reviewer access first (existing screen: Settings, Team) if they want those members to keep it.

## Rollback

Restores every body by md5 and every policy, then drops the four new functions. Roll back
`20270204090000` first (its gates call `employer_reports_readable`).
