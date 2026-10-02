# P1: a panel reviewer sees no other reviewer's assessment before the reveal

**Status: PENDING.** This is an isolated PR from `origin/main` for P1-5 of the
2026-10-02 pre-launch hostile-user audit. It is not merged, and nothing was
written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270107090000_scp_iv_panel_reveal_boundary.sql` |
| Rollback | `supabase/rollback/20270107090000_scp_iv_panel_reveal_boundary_rollback.sql` |
| Suite | `supabase/tests/scp_iv_panel_reveal_boundary_test.sql` (22 assertions) |

## 1. Root cause

An Interview Intelligence panel exists so that each reviewer assesses
independently and only then sees the others. Three things enforce that order:

- `scp_iv_panel_submit` refuses a partial view;
- `scp_iv_panel_reveal` refuses while anyone is outstanding;
- `scp_iv_panel_visible_assessments` returns only the caller's own rows until
  the reveal.

Three other reads did not apply the rule:

| Read | Before |
|---|---|
| `scp_interview_assessments` | Policy checked case access only. Panel member B read A's levels and rationales with a plain SELECT. |
| `scp_interview_case_events` | Policy checked case access only. Each `assessment_recorded` event carries the question and level in `metadata`, and each `assessment_superseded` event carries the reason. |
| `scp_iv_preview_report` | Built the report basis, which holds every live assessment, for any case reader. Finalising would publish it. |

## 2. Fix

The fix follows the BESKT conduct layer's rule
(`bcp_conduct_*_own_or_revealed`). A new helper,
`scp_iv_panel_hides_others(case)`, is true while a panel on the case is in its
`individual` phase. While it is true:

- the assessments policy shows a reader only their own rows;
- the events policy hides other people's `assessment_recorded` and
  `assessment_superseded` events. Every other event stays readable;
- `scp_iv_preview_report` refuses with `SCP_IV_PANEL_NOT_REVEALED`;
- `scp_iv_report_blockers` adds `PANEL_NOT_REVEALED`. Both finalise
  functions already refuse while any blocker exists, so finalising is refused
  too.

Once the panel reveals or concludes, nothing changes, and the same holds for a
case with no panel.

**Not changed:**
- `scp_iv_can_read_case` and the panel functions;
- the report builder and the finalise functions;
- grants and any row.

## 3. Hosted state (read-only, 2026-10-02)

- **Data:** 0 panels, 18 cases and 13 assessments, so nothing is exposed
  today.
- **Bodies and policies:** both hosted bodies equal the md5 values the
  rollback pins, and both policies are `scp_iv_can_read_case(case_id)`.

## 4. Tests

A two-reviewer panel is opened through `scp_iv_panel_open`. Each reviewer
records every core question through `scp_iv_record_assessment`. A second case
has no panel.

| Group | Proves |
|---|---|
| PR0 | **Reproduction** on the pre-fix policies and bodies, restored with the real rollback inside a savepoint. Before the reveal, B reads A's assessments, reads A's levels in the events, and previews a report carrying A's rationale. |
| PR1 | Before the reveal, each reviewer reads only their own assessments and assessment events. Other events stay readable. The owner, who reads the case but is not on the panel, reads neither reviewer's. |
| PR2 | Before the reveal, the preview is refused for reviewer and owner alike, and the blockers name the unrevealed panel. |
| PR3 | After both reviewers submit and the panel reveals, everyone reads both reviewers' assessments. The blocker is gone, and the preview carries both. |
| PR4 | A case with no panel is unchanged. |
| PR5 | Another employer and anon read nothing. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | PR1.1 |
| NC2 | Assessments hidden, case events still checking case access only | PR1.4 |
| NC3 | Both tables hidden, pre-fix preview restored | PR2.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
