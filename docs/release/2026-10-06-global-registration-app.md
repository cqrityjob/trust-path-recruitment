# Global registration in the application — residence for every country, the United States, and "no local catalogue"

Status: **prepared, not merged.** PR 2 of 3 in the global-registration delivery. Application only, no
migration. **Depends on PR 1 (`20270218090000`) being applied and recorded `applied`** — the work-country
and destination selectors below offer `US`, and the database refuses it until then. The schema-first
guard cannot see this dependency (the migration introduces no object), so the order is held by hand:
PR 1 applied and verified, then this.

## 1 · What was found, and what this changes

| Item | Before | After |
|---|---|---|
| Residence country at basic-profile registration | Asked only in the India setup (`/passport/start`), full ISO list; no other surface could record where a holder lives | The Profile page (`/my-career/profile`) carries a residence card for every holder: any ISO country, locality optional, the same list and the same writer (`candidate_current_location`) as the India setup. No market pack is involved; a missing pack cannot block it |
| Work country | SE, GB, GB-NI, AE-DU, AE-AZ, AE (other), IN | `+ US`. Choosing it opens no catalogue; the sentence under the selector says a local catalogue is not available and that the international certifications are open from any country and are not US work licences |
| Desired destinations | IN, AE-DU, AE, GB, SE | `+ US` (mirrors the widened CHECK; the guard now reads the newest migration that defines it) |
| Employment period country | SE, GB, AE | `+ IN, US` — every country `sp_jurisdictions` holds; provenance, never a market |
| "This market is not supported yet" | The absence and "your existing credentials stay" | Plus: the basic profile, the holder's own records and the catalogues open to everyone remain available, none of them is permission to work, and a button opens the international catalogue |
| Availability sentences | "The United Kingdom and Dubai are in pilot" | "…are public pilots"; a country without a local catalogue is told that the basic profile and the international certifications are open to everyone |

## 2 · The four facts, kept apart

| Fact | Where | Who may say it | Vocabulary |
|---|---|---|---|
| Where the holder lives | `candidate_current_location` | every holder, on the Profile | any ISO 3166-1 country (**global**) |
| Where the holder works | `sp_passport_profiles` | every holder, on the Profile | SE, GB, GB-NI, AE-DU, AE-AZ, AE, IN, US (governed) |
| Where the holder would like to work | `candidate_job_preferences` | every holder, in the setup | IN, AE-DU, AE, GB, SE, US (governed) |
| Where a credential is valid | the definition, on `sp_claims` | the catalogue, never a profile answer | per market pack (**market-specific**) |

No write path reads one of these to set another. Changing residence or work country rewrites no claim
and hides none (`cred.market.keepsExisting` is printed in every closed state). The residence card says
in one sentence that it changes neither the work country, nor a credential's country, nor which
catalogues are open, and says nothing about permission to work.

## 3 · What is global and what is market-specific

- **Global, from any country:** the basic profile (name, title, residence, work country, situation,
  profession), the holder's own records (employment, skills, languages, general certificates), the
  international certifications (ASIS, ISC2, ISACA, ACFE, ACAMS and the published research set).
  None of these is a licence to work anywhere, and the copy says so where it is offered.
- **Market-specific:** the regulated catalogue — Sweden (production), India's national qualifications,
  the UK, Northern Ireland and Dubai (public pilots), and Abu Dhabi if PR 3 is merged. A holder whose
  work country has no pack sees the "not supported yet" state with the sentences above.
- **Nothing in this PR opens a market**, approves a definition or changes trust.

## 4 · Guards and tests touched

- `scripts/india-entry-check.ts`: the destination mirror reads the newest migration that defines the
  CHECK (it was pinned to the first).
- Copy parity (`passport-fixture-check`): every new key exists in Swedish and English.
- `passport-persona-journey-check`: the availability sentence still names Dubai and the United
  Kingdom and promises no date; every work-country option still splits into a seeded country
  (`US` is seeded by `20270218090000`).
- `passport-market-profiles-check` / `passport-market-catalogue-check`: the unsupported state still
  renders no credential and names the absence; the shared `isOfferableMarketState` rule is unchanged.
- Two Profile e2e specs stub the new residence read so the page renders as before.

## 5 · Not verified locally

`bun install` is refused in this environment, so lint, typecheck, the guard scripts and the browser
specs run in CI only. The SQL side needs nothing from this PR.

## 6 · Proof plan for the owner (after PR 1 is applied and this is published)

1. A new account from a country with no pack (for example Norway): sign up, open the Profile, state
   residence Norway, leave the work country unset or set it to a listed market; open the Passport:
   the market section says the absence and offers the international catalogue; a CPP saves.
2. A US-based holder: residence `US`, work country `US`; the Passport says no local catalogue, the
   international certifications are offered; no state can be chosen (none is authored).
3. A holder with Swedish and Dubai credentials changes residence and work country: every credential
   keeps its own country and status; the recipient view of a share is unchanged.
4. Share a selection, open it logged out, revoke it: unchanged behaviour (the sharing specs cover it).
