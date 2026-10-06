# Security Passport — United States: what exists, and a proposal for a first state catalogue

Status (2026-10-06): **proposal.** Nothing in this document is data. The only United States rows in
the schema are the ones `20270219090000_sp_united_states_jurisdiction_and_destinations` adds: the
country a holder may *state* as a work country and *want* as a destination. No market pack, no
authority, no definition, no state and no regulatory source names the United States, and this
document authors none of them. It exists so that the owner's decision to prioritise the market can be
taken on a written model rather than on a plausible-looking migration.

## 1 · What a US-based holder gets today

| Fact | Where it lives | United States |
|---|---|---|
| Where they live | `candidate_current_location` (any ISO country) | Yes, already; a city or state as free text |
| Where they work | `sp_passport_profiles.jurisdiction_code` | Yes, after 20270219090000 (`US`, no state) |
| Where they would like to work | `candidate_job_preferences.desired_destinations` | Yes, after 20270219090000 |
| Regulated credentials | the approved catalogue, per market pack | **None.** The market read answers `unsupported`; the surfaces say a local catalogue is not available and that the basic profile and the open catalogues remain usable |
| International certifications | the global catalogue (ASIS, ISC2, ISACA, ACFE, ACAMS and the published research set) | Yes, from any country |
| Provenance | a practical skill or an employment period may carry `US` | Yes |

The international certifications are what a US-based holder can register today. They are
certifications of competence, awarded by organisations, and **none of them is a licence to work as a
security officer in any state**. The product already says so for the global scope (`sp_credential_scopes`
meaning for `global_professional`; `global-certification-governance.md` §4), and nothing in this proposal
changes it. ASIS is incorporated in the United States; a CPP is still not a US credential.

## 2 · The model the schema already has, and how a state fits it

Security officer licensing in the United States is a **state** matter. There is no federal security
guard licence. The schema was built for exactly this shape in the UAE: a country whose rules are
authored per region, with `sp_sub_jurisdictions` carrying the region, `sp_market_packs` keyed by it
(`AE-DU`, `AE-AZ`), and the claim rules refusing a claim that names the country without a region
(`SP_SUB_JURISDICTION_REQUIRED`).

A state follows the same rows, and nothing new is needed in the schema:

| Row | Shape | Example |
|---|---|---|
| `sp_sub_jurisdictions` | ISO 3166-2 code, `^[A-Z]{2}-[A-Z0-9]{2,3}$` | `US-TX`, `jurisdiction_code = US`, `is_active = false` until opened |
| `sp_market_packs` | one pack per state, keyed by the state | `US-TX`, `legal_review_state = pending`, `is_active = false`, `pilot_state = closed` |
| `sp_authorities` | the state regulator, scoped to the state | code `US_TX_DPS`, `sub_jurisdiction_code = US-TX` |
| `sp_regulated_roles` | the licence classes the regulator issues | one per definition |
| `sp_credential_types` | one definition per licence class, `scope_code = national_regulated`, `market_pack_code = US-TX`, `jurisdiction_code = US`, `sub_jurisdiction_code = US-TX` | `requires_valid_until = true`, `requires_issuer = true`, `requires_scope = false` |
| `sp_regulatory_sources` | the regulator's page, registered **unread** until somebody reads it | `us_tx_dps_private_security` |
| `sp_credential_organisation_roles` | regulator and issuer → the authority, with the page and the date it was read | as Dubai's cards |

A holder who works in Texas would state `US-TX` as their work country (the work-country selector gains
one option per opened state, exactly as it gained Dubai and Northern Ireland). A holder who states plain
`US` is told the country regulates security locally and is asked for the state, which is the sentence
the claim rules already produce for the UAE.

What must **not** be done, because the schema's own rules forbid it: a US-wide pack or definition
(there is no US-wide licence); a definition whose validity is borrowed from another state; a
`reference_pattern` nobody has confirmed; an activated pack without a named legal reviewer
(`sp_market_pack_active_needs_review`).

## 3 · A small first state catalogue — candidates, not facts

Five states, chosen for the size of their private-security workforce and because each has one named
regulator with a published licence scheme. **Every row below is a candidate to be verified.** Nobody in
this repository has pinned the authoritative page, read the licence categories against it, or confirmed
the validity period. That reading is the first item of each pack's legal review, as it was for Abu
Dhabi (`20260914092000`), and until it is done none of these may be authored as a definition.

| State | Regulator (candidate) | Official site to pin | Licence classes to confirm | Notes to confirm |
|---|---|---|---|---|
| Texas (`US-TX`) | Texas Department of Public Safety, Private Security Program (Texas Occupations Code ch. 1702) | `https://www.dps.texas.gov/` | Non-commissioned security officer (Level II); Commissioned security officer (Level III); Personal protection officer (Level IV) | Training levels and the licence are distinct facts, as OV training and the ordningsvakt appointment are in Sweden |
| California (`US-CA`) | Bureau of Security and Investigative Services, Department of Consumer Affairs | `https://www.bsis.ca.gov/` | Security guard registration ("guard card"); exposed firearm permit; baton permit | The permits are endorsements, not stand-alone licences; model them as separate definitions only if the source presents them so |
| Florida (`US-FL`) | Florida Department of Agriculture and Consumer Services, Division of Licensing | `https://www.fdacs.gov/` | Class D security officer licence; Class G statewide firearm licence | Class G is held with a Class D; confirm whether it is a separate credential or a scope |
| New York (`US-NY`) | New York State Department of State, Division of Licensing Services | `https://dos.ny.gov/` | Security guard registration; armed security guard registration | Registration, not a licence, in the state's own words; the credential name must follow the source |
| Illinois (`US-IL`) | Illinois Department of Financial and Professional Regulation | `https://idfpr.illinois.gov/` | Permanent Employee Registration Card (PERC); firearm control card | PERC is an employee registration held through a licensed agency; confirm the holder-level credential |

Validity periods, renewal rules, reference formats and whether a credential is tied to an employer
are deliberately left blank: each is a fact to be read from the pinned page, never carried across from
another state or from SIRA's two-year statement.

## 4 · How a state would open, in this repository's order

1. **Source first.** Register each regulator's page in `sp_regulatory_sources` and read it; record the
   fingerprint and `checked_on`. Add the keys to the weekly monitor (`scripts/regulatory-source-monitor.ts`
   currently parses only the three-market migration; Abu Dhabi's and India's sources are not monitored
   either — fix that at the same time).
2. **Author, closed.** One data migration per state: sub-jurisdiction (inactive), pack (pending, closed),
   authority, roles, definitions (inactive, `pilot_state = closed`), organisation roles with the read
   source, definition reviews with the validity text as the source states it. Postflight: nothing active,
   nothing offered, `sp_market_access` answers `closed`.
3. **Application.** `US-TX` and the others join the work-country selector, `formatJurisdiction` and the
   per-market copy; the flag stays the country's, the text carries the state (the Northern Ireland rule).
   No new copy says that a registration is permission to work.
4. **Open as a public pilot** by a further data migration, as the UK and Dubai were (`20261221090000`):
   `pilot_state = public_pilot` on the pack and its definitions, `is_active` and `legal_review_state`
   untouched, the three public-pilot statements shown.
5. **Activate** only with a named legal reviewer, through the constraint that exists for it.

## 5 · What this proposal does not decide

- Which states, and in what order — the owner's call; the five above are candidates.
- Whether a state's training certificate is a definition of its own or evidence attached to the licence.
- Anything about immigration, work authorisation or the right to work. The Passport records
  credentials and says, everywhere, that a credential is not permission to work.
