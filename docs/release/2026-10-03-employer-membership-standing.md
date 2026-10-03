# Release note — a platform admin's suspension cannot be circumvented (20270202090000)

Migration: `supabase/migrations/20270202090000_employer_membership_standing_not_bypassable.sql`
Rollback: `supabase/rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql`
Suite: `supabase/tests/employer_membership_standing_test.sql` (43 assertions)
Design: `2026-10-03-employer-report-access-design.md` section 3.1. Findings e and f of
`2026-10-03-report-access-security-finding.md`.

## What was wrong

A platform admin suspends or removes a member through `update_employer_membership`. Two things
undid that:

1. `employer_access_requests_requester_insert` checked only `requester_user_id = auth.uid()`, for
   **any** employer id, so a suspended or removed person could file a request through
   `/employer/join?org=<id>`.
2. `approve_access_request` reactivated the membership (`ON CONFLICT … DO UPDATE SET status =
'active'`) and refused only a requester who was already active. The organisation's own owner or
   admin could therefore approve the person back in, overriding the platform admin. The migration
   that introduced it documented this as intentional.

And, separately, **reviewer grants** (`scp_employer_reviewers`) survived suspension and removal.
They are inert while the membership is not active, and silently come back the moment it is
reactivated.

## What changes

| Object                                                                                       | Change                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trigger `employer_access_requests_standing_guard` (BEFORE INSERT)                            | refuses a requester whose membership of that organisation is `suspended` or `removed`: `ACCESS_REQUEST_MEMBERSHIP_BLOCKED`, SQLSTATE 42501. A trigger rather than a policy, because a policy failure is the generic "violates row-level security" and says nothing a person can act on                                    |
| `approve_access_request`                                                                     | refuses `ACCESS_REQUEST_REACTIVATION_REFUSED` for **every** caller, a platform admin included: up front (the request stays pending and can be denied) and again in the `ON CONFLICT … DO UPDATE WHERE` itself (a suspension committed after the check is not overwritten). Body otherwise the hosted `20270120090000` one |
| trigger `employer_memberships_revoke_reviewer_grants` (AFTER UPDATE OF status, AFTER DELETE) | when a membership becomes anything but `active`, or is deleted, every live reviewer grant of that user in that organisation is marked revoked (`revoked_at`, `revoked_by`) in the same transaction. Reactivation needs a fresh grant by an owner or admin                                                                 |
| one-off backfill                                                                             | live grants of memberships that are already suspended, removed or missing are revoked once. The count is a NOTICE. They were inert; this stops them returning                                                                                                                                                             |

Only a platform admin, through `update_employer_membership`, can move a person from `suspended` or
`removed` back to `active`. That is the one audited path and it is unchanged.

## Every writer of `employer_memberships` was audited

See the design document, section 3.1, for the table. Result: `update_employer_membership` and the
platform-admin policy (intended), `approve_access_request` and the request insert (closed here),
`create_my_employer_company` and `create_employer_self_service` (create a **new** organisation; they
cannot collide with an existing membership), direct DML by an organisation's owner, admin or the
member (no policy admits it), the reviewer guard (refuses a grant to a non-active member). Each has
an assertion in the suite (MS1 to MS5). There are no other triggers on the table than `set_updated_at`.

## Proof

`employer_membership_standing_test.sql` reproduces every defect on the **pre-fix state inside the
suite** (MS0: the real rollback inside a savepoint: a suspended person files a request, the owner
approves them back, the reviewer grant returns on reactivation), then proves the fix (MS1 to MS6),
including that re-applying the migration over the pre-fix state revokes a stale grant. Six planted
controls in `scripts/db-test.sh` each fail on a named assertion (MS0.5, MS1.1 twice, MS2.1, MS4.1,
MS4.5). The older suite `access_request_no_role_escalation_test.sql` asserted that a removed former
member **was** reactivated by an approval (AR4.3); it now asserts the opposite.

## Application

The join route maps the new code to an honest message (`ACCESS_REQUEST_MEMBERSHIP_BLOCKED`: your
access was suspended or ended by a platform administrator; contact support), and the owner/admin
queue maps `ACCESS_REQUEST_REACTIVATION_REFUSED`. Before this migration is applied the insert simply
succeeds, as today; nothing in the application depends on the migration.

## Apply

Standalone; no prerequisite beyond the chain. Apply it first of the three (`…0202`, `…0203`,
`…0204`). Before applying, compare the hosted `approve_access_request` md5 with
`91ce1c857970f99b10081a76c763e331` (the body this builds on), and read the count of live grants of
non-active memberships (`release-state.json` `verify`). After applying, run the same query and
expect the new md5s and a zero count. Every new function is revoked from `anon` explicitly; check on
the hosted project that the two trigger functions are not executable by `anon` or `authenticated`.

## Rollback

Drops both triggers and their functions and restores the `20270120090000` body (md5 pinned,
verified). Reviewer grants revoked meanwhile stay revoked.
