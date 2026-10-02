# P1-G: an access-request approval admits a person; it cannot make an owner

**Status: PENDING.** This PR fixes P1-G of the 2026-10-02 final hostile-user
audit. It builds on P1-H (20270119090000) and merges after it. It is not
merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20270120090000_access_request_no_role_escalation.sql` |
| Rollback | `supabase/rollback/20270120090000_access_request_no_role_escalation_rollback.sql` |
| Suite | `supabase/tests/access_request_no_role_escalation_test.sql` (12 assertions) |

## 1. Root cause

`approve_access_request` let any owner or admin approve a request with any
granted role, `owner` included. Its `ON CONFLICT … DO UPDATE SET role`
rewrote the requester's existing membership. This allowed two escalations:
- An admin could file a request to their own organisation, approve it as
  `owner`, and become an owner. On production a rolled-back probe showed
  `role admin -> owner, active owners 1 -> 2, err=none`.
- Any admin could make an outsider an owner.

Role changes are otherwise platform-admin only (`update_employer_membership`),
and the team UI deliberately offers no "approve as owner".

## 2. Fix

The function body is the hosted one plus one block, marked `20270120090000`.
Unless the caller is a platform admin:

| Rule | Refusal |
|---|---|
| `rule:owner`: only a platform admin grants `owner` | `Forbidden: only a platform admin can grant the owner role` |
| `rule:self`: nobody approves their own request | `Forbidden: you cannot approve your own access request` |
| `rule:live`: a requester with an active membership is refused, so an approval never rewrites a live member's role | `Already a member: …` |

**Not changed:**
- denying a request;
- admitting a new person as admin or member;
- reactivating a removed or suspended membership;
- the platform admin path;
- the request policies;
- audit logging;
- any row.

## 3. Hosted state (read-only, 2026-10-02)

The hosted body equals the repository body (md5
`1a4bfdb83919585be20282413c93f5c6`, pinned by the rollback). Production has
0 pending requests and 0 approvals that ever granted `owner`, so there is
nothing to repair.

## 4. Tests

| Group | Proves |
|---|---|
| AR0 | **Reproduction.** On the hosted body, restored by the real rollback, an admin approves their own request as owner and becomes one. |
| AR1 | Self-approval is refused, as owner and at all. |
| AR2 | Neither an admin nor the owner can hand out `owner` through the queue. |
| AR3 | A live member's role cannot be rewritten through a request, and the owner count is unchanged. |
| AR4 | Admitting a new member or admin, and reactivating a removed member, still work. |
| AR5 | A platform admin still grants owner. |

**Negative controls in `scripts/db-test.sh`.** Each must make the suite
fail. NC2 to NC4 each drop exactly one marked rule:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | AR1.1 |
| NC2 | Without `rule:owner` | AR2.1 |
| NC3 | Without `rule:self` | AR1.2 |
| NC4 | Without `rule:live` | AR3.1 |
