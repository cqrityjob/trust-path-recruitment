# P1-B (4/5): Interview Intelligence and BESKT require an active organisation

**Status: APPLIED.** Merged (#371, cbddf5e) and verified on production on 2026-10-02.
See `docs/release/2026-10-02-reaudit-p1-fixes-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270111090000_interview_beskt_active_employer.sql` |
| Rollback | `supabase/rollback/20270111090000_interview_beskt_active_employer_rollback.sql` |
| Suite | `supabase/tests/interview_beskt_active_employer_test.sql` (18 assertions) |

## 1. Root cause

Every Interview Intelligence table policy and function reaches a case through
`scp_iv_can_read_case`, `scp_iv_can_write_case` or `scp_iv_case_row_visible`.
The BESKT employer side goes through `bcp_is_security_officer` and its own
gates.

All of them checked the caller's membership (`has_employer_role`) and never
the organisation's status. A suspended or not-yet-approved organisation
therefore kept reading and working:
- its candidate interview cases: sources, assessments, findings, sessions,
  notes, reports and candidate corrections;
- its BESKT assignments, invitations and people.

## 2. Fix

`has_employer_role` is replaced by `has_active_employer_role` in:

| Kind | Objects |
|---|---|
| Case helpers (and so every policy and function built on them) | `scp_iv_can_read_case`, `scp_iv_can_write_case`, `scp_iv_case_row_visible`, `bcp_is_security_officer` |
| Functions that gate on a role directly | `scp_iv_confirm_transcript_basis`, `scp_iv_erase_source`, `scp_iv_finalise_previewed_report`, `scp_iv_finalise_report`, `scp_iv_panel_open` (each reviewer must be an active member of an active organisation), `scp_iv_start_choices`, `scp_iv_start_interview`, `bcp_employer_assignments`, `bcp_employer_beskt_assignments`, `bcp_employer_invitations`, `bcp_employer_party`, `bcp_employer_people`, `bcp_internal_test_activations_for`, `bcp_revoke_invitation`, `bcp_conduct_may_record_stance` |
| Row policies | `scp_iv_corrections_employer` (candidate corrections) and `bcp_ita_party_read` (internal test activations; a platform admin still reads every row) |

Every role list, every refusal and every other condition is unchanged. Only
the organisation's status is added. Each body is the hosted body verbatim
except the swap, which is marked `20270111090000` in place.

**Not changed:**
- `scp_iv_create_case` and `scp_iv_employer_can_start_interviews`, which
  already required an active organisation;
- `bcp_accept_invitation`, where `has_employer_role` is a *refusal* (the
  employer side may not accept its own invitation) and must stay as strict as
  it is;
- security-officer appointment and revocation, the method preview and pilot
  grants, which are the organisation's own set-up;
- payloads, grants and any row.

## 3. Hosted state (read-only, 2026-10-02)

All 11 employers are active, and none has ever been suspended. There are 18
interview cases, all belonging to active employers. All nineteen hosted bodies
equal the md5 values the rollback pins.

## 4. Tests

In the fixture, employer E's owner opens a case on the openly available
Vaktare pack, a member assesses a core question, and the candidate files a
correction. E also has an internal test activation, so the read policy has a
row to show.

| Group | Proves |
|---|---|
| IB-F | While E is active, its owner and member read the case, its assessment, events and correction, E's BESKT people and the activation. The member records an assessment and the owner opens a panel. Finalising is refused only because the case is not ready. |
| IB0 | **Reproduction.** E is suspended and the pre-fix state is restored with the real rollback. E's member still reads and works the case. |
| IB1 | With E suspended, owner and member get exactly an outsider's answer. Assessing and opening a panel are refused. Finalising is refused for the role, not for readiness. Nothing is written, and a platform admin still reads the activation. |
| IB2 | The same holds for `pending`, `rejected`, `archived` and `draft`. |
| IB3 | Reactivation restores every read and action. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | IB1.1 |
| NC2 | Only `scp_iv_can_read_case` pre-fix | IB1.1 |
| NC3 | Only `scp_iv_case_row_visible` pre-fix | IB1.1 |
| NC4 | Only the test-activation read policy pre-fix | IB1.1 |
| NC5 | Only `scp_iv_finalise_report` pre-fix | IB1.3 |

The candidate-corrections policy reads its case through the cases table's own
row policy, which `scp_iv_case_row_visible` already gates. Planting it alone
is therefore not observable, and NC3 covers that path.

**Older suites aligned with the new boundary:**
- `scp_interview_method_library_tenant_read_test.sql` ML7.1 asserted that a
  suspended organisation's owner still reads its existing case. It now
  expects the refusal. ML7.2–ML7.4 (the pinned method and pack, library
  content rather than candidate data) are unchanged and still pass.
- `scripts/db-test.sh` stands 20270111090000 down before the 20261203090000
  rollback, which pins `scp_iv_confirm_transcript_basis`.
