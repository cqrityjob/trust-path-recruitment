# The United States as a stated country and a wanted destination — schema release

Status: **prepared, not applied.** Nothing in this note has been run against production. No merge, no
application and no publication is authorised by it; the owner decides each step.

PR 1 of 3 in the global-registration delivery. Schema first (this PR), the application after it is
applied and verified, and the Abu Dhabi public pilot as its own data PR with its own decision.

## 1 · What the migration changes, and nothing else

`supabase/migrations/20270219090000_sp_united_states_jurisdiction_and_destinations.sql`

| Table | Change |
|---|---|
| `sp_jurisdictions` | `+ US` — Swedish "USA", English "United States". A country a holder may state as their work country; the profile's foreign key accepted SE, GB, AE and IN and refused everything else. |
| `sp_credential_jurisdictions` | `+ US`, national. The 20261118100000 seed copied `sp_jurisdictions` once; without this row the international form's country filter cannot name the country. |
| `candidate_job_preferences` | The destination CHECK admits `US` (IN, AE-DU, AE, GB, SE, US) and its cardinality cap grows from 5 to 6 — one per value, as before. Same constraint name, so the rollback restores the previous text exactly. |

Data only against existing tables. No object is created, replaced or dropped; the generated
application types are unchanged. The migration fingerprints `sp_market_packs`, `sp_credential_types`
(availability and review state), `sp_claims` and `sp_authorities` before it moves and refuses to commit
if any of them changed.

## 2 · What stays shut, proved by the migration and its suite

- **No market.** No pack, definition, authority, regulated role or sub-jurisdiction names the United
  States. `sp_market_access(_, 'US')` answers `closed` for everyone, by the same `COALESCE` that
  answers for an unknown code.
- **No credential can be filed there.** A governed definition keeps its own territory
  (`SP_CREDENTIAL_JURISDICTION_MISMATCH` on a direct write, `SP_DEFINITION_NOT_AVAILABLE_IN_MARKET`
  through the save RPC), and an existing credential cannot be moved there by an update.
- **The catalogue is unchanged.** The approved catalogue offers nothing under `US`; the international
  certifications are offered as before, from any country, and none of them is a US work licence.
- **The four facts stay apart.** A holder who moves their work country to the United States keeps every
  credential with its own country, status and trust (suite 2.5). Residence
  (`candidate_current_location`) already accepted any ISO country and is untouched.
- **A state is not a country.** `US-TX` is refused as a sub-jurisdiction until one is authored; the
  proposal is `docs/passport/united-states-market-entry.md`.

Suite: `supabase/tests/sp_united_states_jurisdiction_test.sql` (23 assertions). `scripts/db-test.sh`
runs it on the fully migrated database, runs the rollback, proves the rollback refuses a second run,
proves the suite fails without the migration, reapplies, and runs it again. Because the older
20261215090000 block re-creates `candidate_job_preferences` with its original five-value CHECK, the
script reapplies this migration after that block so every later suite sees the real frontier.

## 3 · Rollback

`supabase/rollback/20270219090000_sp_united_states_jurisdiction_and_destinations_rollback.sql`

Removes the two rows and restores the five-value CHECK with its cap of 5. It **refuses once adopted**:
a profile, claim, employment period, definition-jurisdiction row or destination list that names the
United States is something a person stated, and the rollback will not delete it (the foreign keys
would refuse anyway). After adoption the path is a forward fix.

## 4 · Release bookkeeping

- `supabase/release-state.json`: frontier entry, `hostedState: pending`, `introduces: []` with the note
  that the dependent application PR waits for **applied**, not for a new object.
- `scripts/release-frontier-check.ts`: `expectedPending` lists the file. Remove it only with hosted
  application and postflight evidence, never on merge alone.
- Verify after the integration applies it (read-only), as the `verify` field says: the two rows, the
  widened CHECK, zero packs and definitions under `US`, `sp_market_access(NULL,'US') = closed`, and the
  four fingerprints unchanged from the pre-apply read.

## 5 · What is global and what is market-specific after this release

| Fact | Vocabulary | Global? |
|---|---|---|
| Where the holder lives | any ISO 3166-1 country (unchanged) | yes |
| Where the holder works | SE, GB (GB-NI), AE (AE-DU, AE-AZ), IN, **US** | governed list, now five countries |
| Where the holder would like to work | IN, AE-DU, AE, GB, SE, **US** | governed list |
| Which credentials can be registered | the approved catalogue, per market | market-specific; **nothing opens here** |
| International certifications | the global catalogue | yes, from any country; never a work licence |

## 6 · Not in this PR, by design

- The application that offers `US` in the work-country and destination selectors, the residence card
  on the Profile, and the "no local catalogue" guidance — PR 2, after this is applied.
- Any state catalogue, authority or source for the United States — a proposal only.
- Abu Dhabi — its own data PR, its own owner decision.
