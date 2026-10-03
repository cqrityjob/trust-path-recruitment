# BESKT exposure and Passport review binding: hosted verification

**Status: APPLIED and verified read-only on production** (`wrygicdfxwjnrugduxnt`, 2026-10-03).

#384 merged to `main` as `7ff0cbe` with CI fully green. The official
integration then applied both migrations in version order.

| Fix | Migration | Detail |
|---|---|---|
| A BESKT position, once exposed, stays exposed, whoever joins later | `20270124090000_bcp_conduct_exposure_is_durable` | `docs/release/2026-10-03-beskt-exposure-is-durable.md` |
| A Passport decision is bound to the content the reviewer saw | `20270125090000_sp_decision_bound_to_reviewed_content` | `docs/release/2026-10-03-passport-decision-bound-to-reviewed-content.md` |

## Ledger

`supabase_migrations.schema_migrations` has 359 rows, read 2026-10-03 06:53 UTC.
The md5 of `version:name`, joined by newline, is
`52e21ce44d6964ae72605bdf2b67817a`, equal to `supabase/hosted-ledger.json`.
The first 357 rows, through `20270123090000_employer_identity_rereview`, keep
their previous digest, `f4f87e56322142f2ac03b5eda5c1cfae`. Two rows are new.
Nothing is pending.

## Method

Read-only only. Every deployed function body was compared as `md5(prosrc)`
with a local replay of the migration files on `main`. Grants and ACLs were
compared the same way. Triggers, the new column and the new table were read
from the catalogue.

No behavioural probe was run on production, not even a rolled-back one. The
owner's instruction for this work excludes production write probes. Behaviour
is proven by the suites, negative controls and two-connection races in
`scripts/db-test.sh`, which run on bodies identical to those deployed.

## Deployed objects

| Object | Production | Local replay of `main` |
|---|---|---|
| `bcp_conduct_position_exposure_guard()` | `8bd6263d…` | equal |
| `bcp_conduct_position_exposure_record()` | `d84a409a…` | equal |
| `bcp_guard_conduct_exposure_append_only()` | `d7eb7417…` | equal |
| `sp_verifier_decide` (7 args) | `4b282cc0…` (was `7078c44c…`) | equal |
| `sp_entry_review_on_holder_edit` | `304678aa…` (was `926a3a79…`) | equal |
| `sp_verifier_decide_reviewed` (8 args) | `e03d0a4d…` | equal |
| `sp_attach_evidence` | `37e34877…` | unchanged, as expected |

Further catalogue checks:
- **Triggers.** `bcp_conduct_positions_exposure_guard`,
  `bcp_conduct_positions_exposure_record` and
  `bcp_conduct_position_exposures_append_only` are enabled.
- **Exposure table.** `bcp_conduct_position_exposures` has RLS on. It grants
  nothing to `anon` or `authenticated`. `service_role` keeps only the
  platform's `Dxtm` privileges, the same as `sp_verification_requests`.
- **Trigger functions.** None is executable by `anon` or `authenticated`.
- **Reviewed entry point.** `authenticated` may execute
  `sp_verifier_decide_reviewed`; `anon` may not.
- **New column.** `sp_verification_requests.answered_at` is present as
  `timestamptz`.

## Data

- **Exposure table.** 0 conduct positions and 0 exposure rows, so the
  backfill wrote nothing.
- **Verification requests.** 0 open requests and 0 rows with `answered_at`,
  so no request was left waiting on a decision.

## Result

Both fixes are deployed exactly as merged.

