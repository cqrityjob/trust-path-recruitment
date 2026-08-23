# Phase A — progress and the gates behind it

Working branch: `fix/passport-sweden-foundation-completion`, branched
forward-only from `origin/main` at `2c56fdd`.

> **Work in a dedicated git worktree, not the primary checkout.**
> Lovable operates `/Users/mostafas/trust-path-recruitment` and switched
> branches under a running session on 2026-08-23 — reflog:
> `checkout: moving from fix/passport-sweden-foundation-completion to main`.
> A full set of green gates (typecheck, build, `db-test.sh`, 35 guard scripts)
> silently measured plain `main` instead of this branch. Nothing warned; the
> only symptom was four migration files appearing to be "missing".
> `cd` into the worktree at the start of every command.

## Step 0 — authoritative state

|                                 |                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `origin/main` at branch time    | `2c56fdd` (Lovable _Update plan_, 2026-08-23 06:37 UTC)                               |
| Work order reference baseline   | `366c43b` — an ancestor; tree differs **only** by `.lovable/plan.md`                  |
| Lovable commits since `d74cab6` | 5 (`5533f0c`…`2c56fdd`)                                                               |
| What they touched               | `.lovable/plan.md` and an SCP splice in `types.ts`                                    |
| Passport overlap                | none — all 7 SCP type lines preserved through the merges                              |
| Topology defect                 | confirmed: #80/#81/#82 branch from `f90720c` and lack `246509c`, `eb4ec01`, `41d7bc1` |
| Inclusion                       | all 9 PR commits are ancestors of this branch                                         |

## Step 0b — hosted legacy gate

The literal query in the work order **cannot run** on hosted:
`authorisation_scope` does not exist there, because these four migrations are
what introduce it. On the current hosted schema every active `SV` claim
therefore becomes a legacy NULL-scope row the moment the stack lands.

**Count: 1.** Shape — structural columns only, no holder data:

```
claim_type licence · lifecycle active · assertion_level VERIFIED
version_no 1 · no predecessor · has issuer · has valid_until
no reference · no note · has verifier · jurisdiction SE
```

`verified` is what makes A1 urgent rather than precautionary: before the fix
that holder's only escape from a frozen record was to destroy a real verifier's
decision.

## Baseline gates on this branch

`tsc` clean · production build clean · `db-test.sh` exit 0 ·
**34 / 35** guard scripts. The work order's reference baseline was 33 / 35.

The single failure is `regulatory-sources:check`:
`se_lansstyrelsen_bevakningsforetag` changed since 2026-08-22. **That is the
guard working** — a regulatory source moved and a human must read it. It is not
part of PR CI (weekly workflow only), and it must not be silently accepted with
`--update`.

## Items

| Item                                    | State                                     | Commit    |
| --------------------------------------- | ----------------------------------------- | --------- |
| A1 legacy Skyddsvakt correction         | done                                      | `a17ea5f` |
| A2 credential-code validation drift     | done                                      | `68e061f` |
| A3 scope flow                           | outstanding                               |           |
| A4 duplicate jurisdiction rendering     | done                                      | `c4f0134` |
| A5 training versus title                | done                                      | `c4f0134` |
| B1 self-declared presentation           | outstanding                               |           |
| B2 scripts type safety and social guard | outstanding                               |           |
| B3 form/database agreement              | codes done in `68e061f`; rest outstanding |           |
| B4 rollback safety                      | outstanding                               |           |
| B5 hygiene                              | outstanding                               |           |
| B6 regulatory-claim guard               | outstanding                               |           |

## Migrations added by Phase A

| Version          | Purpose                               | Rollback                             |
| ---------------- | ------------------------------------- | ------------------------------------ |
| `20260908090000` | legacy scope correctable              | yes — warns when it strands a holder |
| `20260908091000` | title country suffix + training label | yes                                  |

Rollback chain: `20260908090000` → Dubai → UK → Sweden → foundation.
`20260908091000` touches only label columns and may run at any point.

## Not done, and must not be

No merge. No hosted migration. No production publication. No Lovable Build,
chat, generated change or credit. Phase B is not started.
