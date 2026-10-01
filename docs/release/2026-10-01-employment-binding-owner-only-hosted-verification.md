# Employment-binding helper owner-only: hosted verification

**Status: APPLIED and verified read-only on production `wrygicdfxwjnrugduxnt`.**
Merging PR #354 to `main` (head `93d306c`) triggered the official Supabase
GitHub integration, which applied
`20261231090000_scp_resolve_employment_owner_only.sql`. This verification wrote
nothing to the hosted database. Every statement was a read. The behavioural
probe ran inside a transaction that ended in `RAISE`, so it was rolled back.

Change and contract: `docs/release/2026-10-01-employment-binding-owner-only.md`.

## Ledger

| Check | Result |
|---|---|
| `supabase_migrations.schema_migrations` | 334 rows; highest is `20261231090000 / scp_resolve_employment_owner_only`, 4 statements |
| Previous 333 identities | preserved |
| md5 of `version:name` joined by newline, all 334 rows | `f4dead77ace6cfd387c3318411ed96b7`, equal on the connector read and in `supabase/hosted-ledger.json` |

## Objects

| Object | Hosted state |
|---|---|
| ACL of `scp_resolve_employment_for_assignment(uuid,text,uuid)` | `{postgres=X/postgres}`. Neither `authenticated` nor anon may execute it. |
| `md5(prosrc)` of the helper | `37bcf46465445c5f602890f62af3fa6b`, unchanged from before the merge (the body was not touched) |
| Comment | carries the `20261231090000` owner-only note |
| Callers | `scp_employer_assign` and `scp_employment_from_application`, both SECURITY DEFINER owned by `postgres` |
| `scp_employer_assign` | still executable by `authenticated` |

## Data

| Measure | Value |
|---|---|
| Employment records | 5 |
| Bound to a person | 2, unchanged |

## Behaviour (rolled-back probe)

The probe ran as a real signed-in user with no employer membership, using `SET
LOCAL ROLE authenticated` and the user's real JWT `sub`. It called the helper
directly against an unbound employment record:

| Call | Result |
|---|---|
| `scp_resolve_employment_for_assignment(employer, email, own subject)` | refused: `42501 permission denied` |
| Bound records before and after | 2 and 2 |

The transaction ended in `RAISE`, so it was rolled back and no row was written.

## Bookkeeping in this change

- `supabase/release-state.json`: the entry is now `applied`, with this evidence.
- `supabase/hosted-ledger.json`: refreshed to all 334 rows.
- `scripts/release-frontier-check.ts`: `expectedPending` is empty again.
