# 20261204090000 — HAYAT assessments (schema-only release)

**What merges here:** one migration, its rollback, its SQL suite, its registration in
`scripts/db-test.sh`, and its ledger entries. **No application code.** Nothing in `src/`
changes, so the schema-first gate classes this as a SCHEMA RELEASE.

## Why it is its own PR

Application code syncs to Lovable the moment it reaches `main`; migrations are applied by
the Supabase GitHub integration on merge and are only *known* to be applied once somebody
has looked. The code that records and reads HAYAT assessments
(`claude/hayat-assessments-app`) names `sp_hayat_assessments`,
`sp_hayat_record_assessment`, `sp_hayat_current_assessment` and
`sp_hayat_claim_fingerprint`. If it reached `main` first, the credential page would call
functions that do not exist. `schema-first-release:check` blocks that app PR until this
entry is `applied` with evidence — which is the point.

## What it adds

| Object | Purpose | Who may use it |
| --- | --- | --- |
| `sp_hayat_assessments` | One row per server-produced check: claim, fingerprint of the five assessed fields, evidence file + sha256 or the holder's own link, adapter, rule version, status, reasons, checks, binding level, scope limits, check time, currency window, invalidation | holder: `SELECT` own rows (RLS). Nobody: insert/update/delete/truncate |
| `sp_hayat_record_assessment(…)` | **The only writer.** Re-checks holder, evidence, and that the assessed fields are still the claim's fields; supersedes the previous current row | `service_role` only |
| `sp_hayat_current_assessment(uuid)` | Latest check for a claim with `is_current` derived at read time | `authenticated` (SECURITY INVOKER; RLS decides) |
| `sp_hayat_claim_fingerprint(uuid)` | Fingerprint of the caller's own claim | `authenticated` |
| `sp_hayat_fields_fingerprint(sp_claims)` | sha256 over `credential_code`, `credential_reference`, `claimed_issuer_name`, `issued_on`, `valid_until` | `authenticated`, `service_role` |
| 3 triggers | invalidate on claim field change; invalidate on evidence withdrawal/replacement; append-only guard | — |

## What it deliberately does not do

- It does **not** touch `sp_claims.assertion_level`, `sp_verification_decisions`, or any
  disclosure/share payload. A HAYAT result is shown to the holder on the credential page
  only. Promoting a machine result into what a *recipient* sees would change the
  trust-source containment of `20261030090000` and needs its own reviewed migration and an
  owner decision about which sources may do it.
- It stores **nothing fetched from a source** — no assertion body, no recipient hash.
- Personal rows changed: **0**. No backfill.

## Trust-policy change to review

The application half adds a **second named service-role exception** in the Passport
domain (`hayat-assessment.server.ts`, exactly one RPC: `sp_hayat_record_assessment`).
That is a deliberate, reviewable change to `passport-separation:check`, not a relaxation:
the writer must be unreachable from a holder's session, and a holder can call any
`authenticated`-executable function directly through PostgREST. It is in the app PR so it
can be reviewed beside the code that uses it.

## Verification (local)

`scripts/db-test.sh` against PostgreSQL: full strict replay from empty, then
`security_passport_hayat_assessments_test.sql` **before and after** a rollback/reapply
cycle; the rollback is asserted to leave no HAYAT table, function or trigger, and the
reapply to restore 3 triggers with the writer executable by `service_role` only. The
migration is also stood down first in the isolated global-certification rollback block.

## Release order

1. Merge **this** PR alone. The Supabase GitHub integration applies `20261204090000`.
2. Verify hosted, read-only, with the `verify` statements in `supabase/release-state.json`
   — in particular that `anon` has **no** EXECUTE on any `sp_hayat_*` function (the hosted
   project's default privileges grant it on new functions; the explicit REVOKEs must have
   landed) and no table privilege.
3. Record it: `hostedState: "applied"` + `hostedVersion` + `evidenceSource` in
   `supabase/release-state.json`, the ledger snapshot in `supabase/hosted-ledger.json`, and
   remove the file from `expectedPending` in `scripts/release-frontier-check.ts`.
4. Only then merge `claude/hayat-assessments-app`.

## Rollback

`supabase/rollback/20261204090000_sp_hayat_assessments_rollback.sql`. It **refuses** once
any assessment row exists. The application tolerates the schema being absent: the
credential page shows "no automatic check has been made", and document reading never
touches the database.
