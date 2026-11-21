# `admin_delete_user_if_safe`: the Lovable scanner warning (2026-11-21)

**Verdict: not substantiated. No change was made to the function.**

The warning points at a `SECURITY DEFINER` function, granted `EXECUTE` to
`authenticated`, that builds SQL dynamically. I inspected the installed
definition (identical to the newest migration that defines it,
`20270208090000_account_erasure_credential_details.sql`), the role boundary
and the call path.

| Concern | What the code does |
| --- | --- |
| Who may call it | The first statements check `auth.uid()` and `public.is_superadmin(auth.uid())` before any read or write. `is_superadmin` reads `public.user_roles` through `has_role`. The server function `adminDeleteUser` checks superadmin again before calling it. |
| Can a role be self-granted? | `authenticated` and `anon` have no `INSERT` or `UPDATE` on `user_roles`. The only writer is `admin_set_platform_role`, which itself requires a superadmin. The signup trigger `handle_new_user` writes `profiles` only and never reads a role from metadata. |
| Dynamic SQL | Table and column names come from `pg_constraint`/`pg_attribute`, never from input, and are formatted with `%I`. The target id is passed with `EXECUTE ... USING`. `_reason` and `_confirm_email` are compared and stored as values, never spliced into SQL. |
| Why the grant must stay | The function authorises on the caller's own identity. Revoking `authenticated`, or switching to `SECURITY INVOKER`, would break the admin flow or move the check out of the database. |

## Tests (`supabase/tests/admin_delete_user_safety_test.sql`, registered in `scripts/db-test.sh`)

These add to the existing `admin_lifecycle_test.sql` coverage (anon,
ordinary users, non-superadmin admins, the successful superadmin path):

- signup metadata claiming `superadmin` grants no role;
- that account, an ordinary user and a platform admin are refused;
- no client can write a role;
- an injection-shaped confirmation is compared as text and refused, and the
  refusals change nothing;
- a superadmin erases exactly the target, while the hostile reason
  `Requested'); DROP TABLE public.profiles; DELETE FROM auth.users; --` is
  recorded verbatim in `audit_logs`;
- the catalogue-driven `DELETE` reaches a column whose name is SQL and
  handles it as a quoted identifier.

Controls that must make the suite fail, and do:
- replacing the `%I` statement with string concatenation fails the suite;
- removing the superadmin check fails the suite.

## Observation (not a vulnerability; not changed)

The catalogue passes select the table as `conrelid::regclass::text`, which
PostgreSQL already quotes when a name needs it, and then format it with `%I`,
which quotes it again. For a public table whose name needs quoting and that
cascades from `auth.users`, the erasure therefore stops with "relation does
not exist" and rolls back. No such table exists in this schema, and the
failure is closed: nothing is deleted. Fixing it means using `c.conrelid`
with `%s` on the regclass. That would be a forward migration of an
unrelated administrative function, so it is left for an owner decision.
