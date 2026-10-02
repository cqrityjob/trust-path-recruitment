# P1-B (2/5): candidate identity, interview notes and candidate notifications require an active organisation

**Status: APPLIED.** Merged (#368, 23e8bf4) and verified on production on 2026-10-02.
See `docs/release/2026-10-02-reaudit-p1-fixes-hosted-verification.md`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270109090000_candidate_identity_active_employer.sql` |
| Rollback | `supabase/rollback/20270109090000_candidate_identity_active_employer_rollback.sql` |
| Suite | `supabase/tests/candidate_identity_active_employer_test.sql` (19 assertions) |

## 1. Root cause

On production, a rolled-back probe suspended an employer. Then:
- `jase_notification_payload` still gave its member a candidate's e-mail
  address for a pending status notification (rows=1);
- `jase_record_notification` still recorded the delivery;
- the same member's read of `job_applications` returned 0 rows;
- `scp_resolve_participant_identity` still resolved a participant's e-mail
  for the owner (rows=1).

The interview-evidence notes an organisation keeps against a released brief
were readable and writable on membership alone.

## 2. Fix

These now call `has_active_employer_role`:

| Object | Purpose |
|---|---|
| `scp_resolve_participant_identity` | An owner or admin resolves a participant's contact address |
| `jase_notification_payload` | A candidate's address for a status e-mail |
| `jase_record_notification` | Records that delivery |
| `scp_interview_notes` / `scp_record_interview_note` | Interview-evidence notes (read / write) |
| `scp_interview_notes_employer_read` (policy) | The same notes, read directly |

A caller who fails the rule gets the answer a non-member already gets. The
reads return no rows. The writes raise their existing refusals:
`JASE_NOT_AUTHORISED` and `SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW`. Each body
is the hosted body verbatim except its gate.

**Not changed:**
- the `rec_*` recruitment functions, which already gate on `rec_is_member`
  (membership AND an active organisation);
- the application reads fixed in 20270105090000;
- payloads, grants and any row.

No application code calls the `jase_*` functions any more. The interview-note
functions are reached only from the employer workspace, which is not shown to
a non-active employer.

## 3. Hosted state (read-only, 2026-10-02)

All 11 employers are active, and none has ever been suspended. All five hosted
bodies equal the md5 values the rollback pins.

## 4. Tests

The fixture runs the real flow. A participant's report is released by
employer E, E records an interview note against it, and the participant's job
application is moved to `interview`, which leaves one unsent status event.

| Group | Proves |
|---|---|
| CI-F | While E is active, the owner resolves the participant, gets the payload with the address, and reads and writes notes. A plain member reads the payload and notes but cannot resolve identity, as before. |
| CI0 | **Reproduction.** E is suspended and the pre-fix state is restored with the real rollback. E's owner still resolves the e-mail, gets the payload, records the delivery, and reads and writes notes. |
| CI1 | With E suspended, the owner and member get exactly an outsider's answer. Both writes are refused with their existing refusals, and nothing is written. |
| CI2 | The same holds for `pending`, `rejected`, `archived` and `draft`. |
| CI3 | Reactivation restores every read and write. Anon may execute none of the five. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | CI1.1 |
| NC2 | Only `jase_notification_payload` pre-fix | CI1.1 |
| NC3 | Only the notes read policy pre-fix | CI1.1 |
| NC4 | Only `scp_record_interview_note` pre-fix | CI1.3 |
