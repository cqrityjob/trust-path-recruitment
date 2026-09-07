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

## Production application completed

After the seven identity corrections and the two parking decisions, exactly
these three migrations were selected and applied through Lovable's connected
Supabase mechanism on 2026-09-07:

1. canonical `20261028090000_admin_cancel_assignment_error_contract.sql`
   → hosted `20260907064303` / `f8efc1c3-def4-4147-9db1-45a68b1f6a69`
2. canonical `20261030090000_sp_trust_source_containment.sql`
   → hosted `20260907064513` / `19c76abb-f1fd-40e5-aa50-b008b7de38bf`
3. canonical `20261031090000_sp_passport_first_merit.sql`
   → hosted `20260907064849` / `0bb96516-c1eb-4178-8e9e-60bde13071dd`

Read-only postflight verification confirmed all function contracts, grants,
row locks, RLS boundaries and indexes. Core holder row counts were unchanged:
profiles 5, events 154, claims 45, experience periods 5, verification requests
12, verification decisions 11 and operation receipts 0. Security advisors
moved from 213 to 216 only because migration 31 intentionally adds one private
RLS-with-no-policy table and two authenticated SECURITY DEFINER entry points.
No anonymous callable function was added.

The first application left the schema correct but the three canonical versions
absent from migration history. A second, history-only Lovable migration
(`20260907071826` / `6c070461-aa51-4d78-8ed0-a82294f12489`) then recorded the
three canonical aliases after verifying each hosted anchor and refusing any
unexpected name. It executed no application or schema DDL. The hosted ledger
now contains 265 rows, including both the three original hosted identities and
the three canonical aliases. Core holder row counts remained unchanged.

The repository keeps the three complete authored migrations at their original
canonical versions so a clean replay preserves dependency order. The generated
copies are parked outside the active replay path. The hosted-version mappings in
`migrations-policy.json` are the durable evidence that these migrations must
never be executed against production again; the canonical alias rows are the
technical barrier that prevents filename-versus-ledger selection.
`release-frontier:check` pins an empty pending set.
