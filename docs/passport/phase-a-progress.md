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

## Items — all complete

| Item                                    | State | Commit                |
| --------------------------------------- | ----- | --------------------- |
| A1 legacy Skyddsvakt correction         | done  | `a17ea5f`             |
| A2 credential-code validation drift     | done  | `68e061f`             |
| A3 scope flow                           | done  | `d332792`             |
| A4 duplicate jurisdiction rendering     | done  | `c4f0134`             |
| A5 training versus title                | done  | `c4f0134`             |
| B1 self-declared presentation           | done  | `63a96ea`             |
| B2 scripts type safety and social guard | done  | `f2251dd`             |
| B3 form/database agreement              | done  | `68e061f` + `e431693` |
| B4 rollback safety                      | done  | `63a96ea`             |
| B5 hygiene                              | done  | `63a96ea`             |
| B6 regulatory-claim guard               | done  | `e431693`             |

## Migrations added by Phase A

| Version          | Purpose                               | Rollback                              |
| ---------------- | ------------------------------------- | ------------------------------------- |
| `20260908090000` | legacy scope correctable              | yes — warns when it strands a holder  |
| `20260908091000` | title country suffix + training label | yes — asserts the labels are restored |
| `20260908092000` | disclosure scope boundary             | yes                                   |

Together with the four inherited migrations that is **seven migrations and
seven rollbacks**, all executed by `db-test.sh` in reverse migration order.

## Final gates

Run against `origin/main` at `c224934`, merged forward into this branch.

`tsc` (app) clean · `tsc -p tsconfig.scripts.json` clean · production build
clean · `db-test.sh` **exit 0** · **38 / 38** guard scripts · changed-file
eslint clean · Prettier clean · replay allowlist **identical to `main`**.

`regulatory-sources:check` passes since the owner accepted the Länsstyrelsen
change on 2026-08-23 — see the register for what that acceptance does and does
not claim.

**Seven of seven rollbacks execute**, in reverse migration order, and the label
rollback now asserts the previous values were restored rather than only that it
ran.

New DB assertions: 42 three-market + 23 Swedish truth model + 22 UK + 24 Dubai

- 16 legacy scope correction + 12 scope disclosure boundary + 7 rollback data
  safety. Guard assertions: 70 credential-form, 60 identity-engine, 27
  regulatory-claim self-test, 14 scope surface. Browser: 53 passed, 3 skipped.

### Review round two

Six blockers, all closed:

1. The employer application view rendered no scope at all. `RecipientPassportCard`
   — which `ApplicationPassportPanel` draws — never mentioned it, so a correct
   payload met a screen that ignored it. One shared `CredentialScopeLine` now
   serves the employer view and the public page, and the holder's own entry
   view displays the stored scope rather than only accepting it as input.
2. The boundary suite could emit `ok … NOT COVERED` and pass. Removed: no
   escape hatch, assertions 4.1 and 4.2 named as mandatory in `db-test.sh`,
   floor raised to 12. A rendered spec proves what each audience sees.
3. The label rollback existed but was never wired into the chain, so it had
   never run. Wired in reverse order, with a restoration assertion.
4. The Swedish rollback dropped `authorisation_scope` without checking whether
   any holder had one — quieter than the deletes, because the claim rows
   survive while what they were limited to is erased. It now refuses.
5. `origin/main` merged forward (`2c56fdd` → `c224934`); every gate rerun.
6. The changed Länsstyrelsen source reviewed, not accepted. See
   `regulatory-source-register.md`.

## Not done, and must not be

No merge. No hosted migration. No production publication. No Lovable Build,
chat, generated change or credit. Phase B is not started.
