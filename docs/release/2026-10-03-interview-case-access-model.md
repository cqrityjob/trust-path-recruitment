# Release note — an interview case is read by those who work it (20270204090000)

Migration: `supabase/migrations/20270204090000_interview_case_access_model.sql`
Rollback: `supabase/rollback/20270204090000_interview_case_access_model_rollback.sql`
Suite: `supabase/tests/interview_case_access_model_test.sql` (43 assertions); fixture shared with the
matrix and model suites: `supabase/tests/employer_report_access_fixture.sql`
Design: `2026-10-03-employer-report-access-design.md` section 3.3. Requires `20270203090000`.

## What was wrong

`scp_iv_can_read_case` and `scp_iv_case_row_visible` admitted **any active member** of the
organisation, and `scp_iv_can_write_case` admitted owner, admin **and member**. Every child table of
Interview Intelligence (notes, findings, assessments, panel, final report, conduct, corrections)
follows those gates. So a member who had nothing to do with an interview read what the panel wrote
about the candidate, and could write to the case.

One policy omitted the vetting restriction: `scp_iv_corrections_employer` never asked
`bcp_case_access_ok`, which is finding **a** of the report-access finding. **Measured on the replayed
chain, this was not an observable leak** (suite IC0.6): the policy's own sub-select reads
`scp_interview_cases` under row-level security, and the case row policy already hides a
vetting-restricted case from anyone who is not an officer on it, so the corrections of a hidden case
were not returned. It was a gap in defence in depth, and it is closed as that: the policy now asks the
case gate itself.

## What changes

| Object                               | Change                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scp_iv_can_read_case(uuid)`         | the one definition with the case as context: owner/admin, the case's **creator**, a **member of its panel**, a reviewer with a `recruitment` grant, or the **responsible recruiter** of its vacancy; the candidate or applicant who is also a member is excluded; **and** `bcp_case_access_ok(case)`, exactly as before |
| `scp_iv_can_write_case(uuid)`        | the same predicate plus its existing conditions (case not cancelled, retention state active) and `bcp_case_access_ok`. A plain member is refused                                                                                                                                                                        |
| `scp_iv_case_row_visible(uuid,uuid)` | the same definition, with the vetting expression it already had                                                                                                                                                                                                                                                         |
| policy `scp_iv_corrections_employer` | reads through `scp_iv_can_read_case(case_id)`: finding a closed as defence in depth                                                                                                                                                                                                                                     |

**Vetting is preserved and only narrows.** `bcp_case_access_ok` stays inside both gates. An owner or
admin who is not an appointed security officer does not read a vetting-restricted case, a creator or
panel member does not either, and a recruitment reviewer or a responsible recruiter does not. Nothing
widens what a vetting-restricted case allows; the suite asserts each of those, corrections included.

**Inherited, not edited.** The BESKT conduct functions and two `bcp_*` member-read policies
authorise through `scp_iv_can_read_case` and `scp_iv_can_write_case`, so they follow: a plain member
can no longer join a conduct session, record a stance or read a conduct report on a case they do not
work. No `bcp_*` or `sp_*` object is edited. The BESKT employer reads that admit any member on their
own (`bcp_employer_assignments`, `bcp_employer_people`, `bcp_employer_party`) are reported in the
design document and are not touched.

Not changed: no object is introduced and no row is touched. Release and finalise of an assessment
stay owner/admin only.

## Proof

`interview_case_access_model_test.sql` reproduces the defect on the pre-fix state inside the suite
(IC0: the real rollback in a savepoint: a plain member reads and writes a case, a candidate's
corrections on a vetting-restricted case are read), then proves the fix (IC1 to IC6), including the
creator and panel member reading and writing only their own case, the candidate who is a member
excluded, a case on another vacancy, suspension and the vetting restriction in both directions. Six
planted controls in `scripts/db-test.sh` each fail on a named assertion. The legacy suites that
assumed a plain member reads a case were given a basis in their fixture and nothing else.

## Application

Second release. `src/lib/interview-intelligence/capability.ts` and the Interview Intelligence
screens use the `employer_report_access` answer (`case_access`): a member who has no case to open
sees the honest notice instead of an empty list, and the entry point is hidden. Before the migration
is applied the answer is `unknown` and nothing changes.

## Apply

After `20270203090000`; the migration refuses with `INTERVIEW_CASE_ACCESS_PRECONDITION` otherwise.
Compare the hosted md5s with the pins in `release-state.json` (`verify`) before applying, and the new
ones after. **Expected effect on a live organisation:** a member who is neither the case's creator,
on its panel, nor an authorised reviewer or recruiter no longer sees the case. The owner or admin
keeps access (vetting-restricted cases: officers only, as before).

## Rollback

Restores the three bodies (md5 pinned) and the corrections policy. Run it before rolling back
`20270203090000`.
