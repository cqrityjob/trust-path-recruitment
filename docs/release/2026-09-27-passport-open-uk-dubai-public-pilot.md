# Security Passport: the UK and Dubai open as a public pilot (data)

**Migration:** `20261221090000_sp_open_uk_dubai_public_pilot.sql` ·
**Rollback:** `supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql` ·
**Suite:** `supabase/tests/security_passport_open_uk_dubai_test.sql` ·
**Agreement proof:** `scripts/passport-availability-agreement.ts`

PR 4 of `docs/passport/completion-work-order.md` (revision 3). Data only. It needs
20261220090000 (PR 2) applied and refuses to run without it.

## What it does

- **Great Britain, Northern Ireland and Dubai move to the public pilot**, together with
  the 44 definitions authorised for their internal pilot: 13 British, 1 Northern Irish,
  30 Dubai. Every signed-in holder can register them. No pilot grant is needed and
  none is given.
- **Nothing else changes.** `is_active`, `legal_review_state` and the approval fields of
  every definition and pack stay as they are, as do every claim, grant, professional-title
  rule and other market. The migration fingerprints all of them before and after, and
  aborts if anything differs.
- **Abu Dhabi and every other emirate stay closed.** Northern Ireland stays its own market,
  so a British licence is not a Northern Irish one.
- **Grants become history.** `sp_pilot_members` rows stay in place and are still audited.
  The members-only route (Route A) still governs any market left in internal pilot.

## D2: the prepared default, not a decision

The list of 44 is the prepared default: every definition already authorised for the
internal pilot (owner decision 2026-09-18, `docs/passport/pilot-approval-decisions.md`).
Merging this PR is the owner's D2 decision for exactly this list. To hold a definition
back, take its code off the `_sp_pr4_open` list before merging. After release, a reviewed
migration can set its `pilot_state` to `closed`.

The caveats already on record for these 44 still apply. A public pilot makes them visible
to every holder, not only to named testers:

- `name_ar` is NULL on every Dubai row. The application does not offer Arabic, so no screen
  shows it, but the Arabic vocabulary is still unreviewed.
- A reviewer should still confirm who issues the fitness, fire-safety and life-support
  documents (`AE_DU_FITNESS_CHECKED`, `AE_DU_BASIC_FIRE_SAFETY`, `AE_DU_BASIC_LIFE_SUPPORT`).
- The four ICO sources behind the UK pack need re-reading on the implementation date
  (Data (Use and Access) Act).
- Legal review stays **pending** for all three packs. The application says so next to
  every public-pilot market, and says that registering is not permission to work.

## Verified (isolated local replay; CI repeats it)

- `scripts/db-test.sh`: strict replay of every migration and every suite, exit 0.
- The new suite, 41 assertions, fails without the migration:
  - an ordinary holder with no grant saves from every opened market;
  - the scope, not-applicable, UAE-wide, Northern Ireland-as-GB and Abu Dhabi refusals hold;
  - a work-country change keeps every credential;
  - a verifier with no grant reviews, asks for clarification and decides;
  - privacy and trust hold between holders;
  - a held-back definition cannot come back through an edit, a credential switch or a
    reactivation;
  - no grant is written anywhere.
- The members-only suites (`market_pilot`, `pilot_catalogue_visibility`, `pilot_write_path`,
  `global_certification`, `pilot_scope`) now pin the three packs back to internal pilot
  inside their own rolled-back transaction, using
  `supabase/tests/security_passport_route_a_markets_fixture.sql`. They prove Route A exactly as
  before, with the same assertion counts with and without this migration. The fixture refuses
  to run outside a transaction.
- **Proof case K.** The administrator's diagnosis (`catalogue-diagnostics.ts`, the
  `/admin/passport-catalogue` page) is computed for every definition and checked against
  the database for a real holder:
  - As released: 70 offered to an ordinary holder, and each saves through the real RPC.
    7 are withheld, and each is refused with `SP_APPROVED_DEFINITION_REQUIRED`.
  - With the three markets pinned back to members-only: 96 answers offered and saved, 58 refused.
  - A mutated diagnosis fails the proof.
- The rollback refuses unless exactly this state is present, returns the 3 packs and 44
  definitions to internal pilot with claims, grants and review states fingerprinted
  unchanged, refuses a second run, and the migration re-applies on top of it.
- The routed browser walk (`.github/workflows/passport-public-pilot-evidence.yml`) runs on
  this branch against the migrated state.
- `docs/passport/catalogue-coverage-matrix.md` is regenerated from the migrated state: 26 open
  to everyone, 44 public pilot, 0 members-only, 7 closed.

## Production status: pending (D2, D3)

No production write was made. **Merging this PR is the production release.** The Supabase
GitHub integration applies merged migrations to `wrygicdfxwjnrugduxnt` automatically (D3).
Merge only after D2, and after PR 2 is applied and PR 3 is published. After merge, verify
read-only with the `verify` statement in `supabase/release-state.json`:

- 3 packs and 44 definitions are `public_pilot`, and none is active.
- Legal review is still pending.
- Claims and grants are unchanged.

Then record the evidence there and take the file off `expectedPending` in
`scripts/release-frontier-check.ts`.

## Order

1. PR 1, PR 2 (release), PR 3 (Lovable publish). This branch is stacked on all three.
2. D2 decided; this PR merges; the integration applies it; read-only verification.
3. The owner runs the smoke test. Announce only after confirmation email delivery works (O1).
