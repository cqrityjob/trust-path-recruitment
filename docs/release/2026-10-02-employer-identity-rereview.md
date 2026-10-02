# P1-I: an approved organisation that changes its identity goes back to review

**Status: PENDING.** This PR fixes P1-I of the 2026-10-02 final hostile-user
audit. It builds on P1-J (20270122090000) and merges after it. It is not
merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270123090000_employer_identity_rereview.sql` |
| Rollback | `supabase/rollback/20270123090000_employer_identity_rereview_rollback.sql` |
| Suite | `supabase/tests/employer_identity_rereview_test.sql` (13 assertions) |

## 1. Root cause

Moderation approves an organisation's identity once, by moving it from
`pending` to `active`. After that an owner or admin could freely rewrite the
name, organisation number, website and logo and stay `active`. The status
guard `employers_validate_before_write` protected only `status` and `slug`.

On production a rolled-back probe gave an approved organisation another
approved organisation's name and number:
`rows=1, identity_identical_to_other_active_org=t, status=active`.

Live ads and the apply flow then present the copied identity to candidates.
The duplicate check exists only at creation.

## 2. Fix (owner decision: re-review)

When an **active** organisation's material identity changes, the status guard
sets it back to `pending`. Moderation then approves it again
(`moderate_employer`, `pending → active`) or rejects it. While it is pending,
the organisation keeps its own set-up but loses every active-organisation
capability (`has_active_employer_role`), and its ads are not public.

**Material fields.** These are the four identity fields the moderation queue
reviews (`admin-employer-moderation.functions.ts`): `name`, `country`,
`registration_number` and `website`. They are compared trimmed and
case-insensitively, so a cosmetic re-type is not a change.

**Not material, so no re-review:** `description_sv`, `description_en` and
`logo_url`. These are profile fields that moderation does not review.

**Not changed:**
- edits by draft or pending organisations, which are already under review;
- a platform admin's edit;
- `moderate_employer` and its marker (the guard moves the status itself and
  does not set the marker);
- the slug rule;
- any row.

The function body is otherwise the hosted one: md5
`e3fd899458d95fe8c00c5f4dfa082fa8`, pinned by the rollback.

## 3. Tests

| Group | Proves |
|---|---|
| EI0 | **Reproduction.** On the hosted guard, restored by the real rollback, an approved organisation takes another's name and number and stays approved. |
| EI1 | The same edit is saved, and the organisation returns to `pending` with no active capability. |
| EI2 | Name, organisation number, website and country each return it to review on their own. |
| EI3 | Description and logo edits, and a case- or space-only re-type, keep it approved. |
| EI4 | A platform admin's correction keeps it approved, and moderation re-approves after a rename. |

I compared every suite that edits employer rows with and without the fix.
Only this suite differs.

**Negative controls in `scripts/db-test.sh`.** Each must make the suite fail:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | EI1.1 |
| NC2 | Organisation number dropped from the material fields | EI2.2 |
