# P1-K: only the security function erases material on a security vetting

**Status: PENDING.** This PR fixes P1-K of the 2026-10-02 final hostile-user
audit. It builds on P1-G (20270119090000) and merges after it. It is not
merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270120090000_scp_iv_erase_vetting_boundary.sql` |
| Rollback | `supabase/rollback/20270120090000_scp_iv_erase_vetting_boundary_rollback.sql` |
| Suite | `supabase/tests/scp_iv_erase_vetting_boundary_test.sql` (6 assertions) |

## 1. Root cause

A security vetting's interview case belongs to the appointed security
function alone. Every case helper, and `scp_iv_confirm_transcript_basis`,
requires `bcp_case_access_ok`. `scp_iv_erase_source` checked only "active
owner or admin". An owner or admin who was not the security officer could
therefore irreversibly erase sources, passages and proposals on a vetting
case they cannot even read. A rolled-back production probe showed
`is_SO=f, can_read_case=f, erase_err=none, source_state_after=erased`.

## 2. Fix

`scp_iv_erase_source` also requires `bcp_case_access_ok(_case_id)`. It
refuses with `SCP_IV_NOT_CASE_MEMBER`, exactly as
`scp_iv_confirm_transcript_basis` does. The body is otherwise the hosted
one: md5 `fc3984e279784abff4f197f0b3aa45a9`, pinned by the rollback. The
added block is marked `20270120090000`.

I checked every other role-gated SECURITY DEFINER `scp_iv_*` function:
- the case helpers and `confirm_transcript_basis` already check the vetting
  boundary;
- `panel_open` and `start_interview` go through the case helpers;
- the finalise paths are blocked by `scp_iv_report_blockers` (`NOT_PERMITTED`);
- `create_case`, `employer_can_start_interviews` and `start_choices` act on no
  existing case.

**Not changed:** erasure on ordinary cases; the security officer's own
erasure; any row.

## 3. Tests

The security officer and the vetting link are seeded with
`session_replication_role = replica`. That is exactly the data
`bcp_case_vetting_restricted` reads.

| Group | Proves |
|---|---|
| VE-F | The vetting case is restricted: the owner cannot read it and the security officer can. |
| VE0 | **Reproduction.** On the hosted body, restored by the real rollback, the owner erases the vetting material. |
| VE1 | The owner's erasure is refused, and the source is intact. |
| VE2 | The security officer still erases. |
| VE3 | On an ordinary case the owner still erases. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | VE1.1 |
| NC2 | `bcp_case_access_ok` answers true for everyone | VE-F |
