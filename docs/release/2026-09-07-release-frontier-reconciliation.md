# Production release-frontier reconciliation — 2026-09-07

Target: owner production project `wrygicdfxwjnrugduxnt`.

This record reconciles repository migration identities with the production
ledger after PR #192. The investigation was read-only: no SQL was applied and
no hosted row was changed. Production held 258 ledger rows and the GitHub
integration reported `MIGRATIONS_FAILED` because active repository files used
canonical versions that production had recorded under generated versions.

## Applied and live postconditions

| Authored identity | Hosted identity  | Read-only production evidence                                                           |
| ----------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `20261006090000`  | same             | SP015–SP018 exist; all are excluded from ranking                                        |
| `20261007090000`  | same             | reconciliation table and mirror function exist; zero drift rows                         |
| `20261008090000`  | same             | compatibility adoption function and trigger are absent, as CONTRACT requires            |
| `20261009090000`  | same             | superseded-by foreign key is deferrable                                                 |
| `20261011090000`  | same             | CV presentation comment carries the wording-and-order provenance contract               |
| `20261012090000`  | same             | `sp_verifier_decide` contains `SP_DECISION_REQUIRES_HOLDER_MESSAGE`                     |
| `20261013090000`  | same             | employer-attestation constraint and three concurrency indexes exist                     |
| `20261014090000`  | same             | authenticated has no SELECT grant on reviewer `decision_note`                           |
| `20261015090000`  | same             | `passport_verifier` exists in `app_role`                                                |
| `20261016090000`  | same             | `sp_is_verifier` recognises `passport_verifier`                                         |
| `20261017090000`  | same             | employer queue returns `is_self` and holder display name                                |
| `20261019090000`  | same             | submission function carries all three employer-eligibility refusals                     |
| `20261020090000`  | same             | three origin triggers and the origin guard function exist                               |
| `20261021090000`  | `20260905053344` | option-order column, four functions and two triggers exist; no historical backfill      |
| `20261026093000`  | `20260905053809` | release function uses competency-scoped facet resolution, not slug-only resolution      |
| `20261027090000`  | `20260905054603` | live R1 manifest table has RLS and zero policies; link columns and four functions exist |
| `20261029090000`  | `20260906125945` | R3A functions exist with the reviewed grants; next-step remains internal                |

The earlier R1 ledger row `20260904190901` is historical: that apply was rolled
back. The later row `20260905054603` is the live apply and is the identity now
used by the active repository file.

## Parked before deployment

`20261022090000` and `20261023090000` were never applied. Both select a form
by the non-unique slug `security-officer-recruitment-form-a`. Production has
two matching forms, and the current query selects the quiet one-attempt form
instead of reliably protecting the 12-attempt pilot form. They remain preserved
under `supabase/archive/parked-migrations/` but cannot be reached by replay or
the GitHub integration. A corrected follow-up must resolve the form through
assessment-definition/version identity and refuse ambiguity.

## Merge-time deployment selection

After the seven identity corrections and the two parking decisions, exactly
these active migrations remain declared pending:

1. `20261028090000_admin_cancel_assignment_error_contract.sql`
2. `20261030090000_sp_trust_source_containment.sql`
3. `20261031090000_sp_passport_first_merit.sql`

The repository guard `release-frontier:check` pins that set. Merging this
reconciliation is therefore also the production deployment of those three
migrations through the approved GitHub integration. The pull request must not
be merged until CI and an independent review are green.
