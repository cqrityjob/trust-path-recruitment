# Security Passport: public pilot in the application

PR 3 of `docs/passport/completion-work-order.md` (revision 3). Application only: no
migration, no data change. It teaches the application the `public_pilot` state that
`20261220090000_sp_public_pilot_availability.sql` (PR 2) adds, fixes India's market
state (G5), and labels every Dubai-scoped credential "Dubai, UAE".

## What changes for a holder

- **Public pilot (after PR 2 and PR 4 are live).** The database answers
  `sp_market_access() = 'public_pilot'` for a signed-in holder of a public-pilot market.
  The application now:
  - offers that market's catalogue with no individual grant;
  - lists the market in the "Visa behörigheter för" browsing filter;
  - states three separate facts wherever a public-pilot catalogue is offered: it is a
    public pilot, the legal review of the market's rules is still pending, and
    registering a credential is not a permission to work. The surfaces are the entry
    page, the credential wizard and the work-country panel.
- **India (G5).** `/passport/information` offered India's four NSQF qualifications in
  the wizard but reported the market as unsupported. It now offers them under
  "Qualifications for India" with the sentence that they are qualifications, not
  licences or permission to work.
- **Dubai, UAE.** Every Dubai-scoped credential reads "Dubai, UAE", per the owner's
  instruction of 2026-09-27. This applies on the card's shields, the wallet, the
  recipient's list, the reviewer's facts, the CV row and the wizard.
  - The recipient list and the CV row previously printed a Dubai credential's country
    alone, "United Arab Emirates".
  - The card, its shields and flags are unchanged.
- **Availability refusals.** A save or a correction refused because the definition or
  its market is no longer open for new registration gets its own message. It no longer
  shows the generic "check your details" error. Existing claims are unaffected.
- **The correction form** resolves the taxonomy row of a pilot or public-pilot
  credential. It no longer filters on `is_active`; row-level security decides. Before,
  a Dubai credential lost its row and the form stopped asking for the scope that
  fifteen Dubai definitions require.
- **Static sentences that PR 4 would have falsified are rewritten** to be true before
  and after it: "being prepared and cannot be selected yet" is now "in pilot, and each
  market shows who can register there".

## What changes for a reviewer

- **The review queue names the credential's territory.** It printed the country
  only, so a Dubai licence read "United Arab Emirates" and a Northern Irish licence
  "United Kingdom". It now reads "Dubai, UAE" and Northern Ireland.
  - It reads `sub_jurisdiction`, which 20261220090000 adds to `sp_verifier_queue`.
    Against a database without it, the line shows the country, as before.
  - The dispute list uses the same label.

## Administration

- `/admin/passport-catalogue` shows the new availability ("Selectable by every
  signed-in holder — public pilot") and the Route B reason.
  - The legal review has its own column: the definition's and the market pack's.
  - Availability never reads the legal review.
- The per-user pilot panel says a public-pilot market needs no grant, and offers
  none. An earlier grant stays listed as history and can still be revoked.
- `docs/passport/catalogue-coverage-matrix.md` is regenerated with the new state and
  the legal-review column: 77 definitions, 26 open to all, 44 for pilot members,
  0 public pilot and 7 closed.

## Fails closed

The application reads `public_pilot` only from the database's own answer. Against a
database without 20261220090000 nothing changes:

- `sp_market_access()` never answers `public_pilot`;
- `resolveMarketAccess` maps any unknown answer to `closed`;
- `marketAvailabilityOf` and `isOfferableMarketState` accept only exact values.

Every column the application newly reads (`pilot_state`, `is_active`, the pack's
`legal_review_state`) is already applied on the owner project. The schema-first
gate passes.

## Verified (stubbed backend)

- **Type-checks:** `bunx tsc --noEmit` and `bun run scripts:typecheck` pass.
- **Guards:** every Passport guard in CI passes, with new assertions for the public
  pilot, India, the admin surfaces and the Dubai label:
  - market catalogue (236), catalogue filters and diagnostics (60), schema drift,
    shields (77), persona journeys (174), reviewer decisions.
- **`e2e/passport-three-market.spec.ts`:** 76 scenarios pass on desktop and 375px,
  including the new public-pilot and India scenarios. Screenshots were taken at
  390px and 1440px, in Swedish and English.
- **Other browser specs:** HAYAT reading, date input and the Profile/CV/Passport
  surfaces pass unchanged.

## Verified on a real backend

`e2e/passport-public-pilot-local.spec.ts` walks the proof cases of the work order in
the running application. Every response is real:

- GoTrue registers, confirms and signs the people in.
- PostgREST and row-level security store and return their rows.
- The claim rules decide what may be saved.
- The share function hands the recipient over.

`scripts/fixtures/passport-public-pilot-fixture.sql` puts GB, GB-NI and AE-DU in the
public-pilot state and seeds synthetic people with **no pilot grant**. It refuses any
database whose migrations the Supabase tooling recorded, or that holds a non-synthetic
account. Per project, desktop (screenshots at 1440) and a 390px phone, in Swedish and
English:

| case | what the walk proves                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | A person registers at `/signup`, confirms from the e-mail the stack sends, creates the Passport and saves a Dubai card through every wizard step. All four markets are offered, and no grant exists. An ordinary holder saves from Dubai, Great Britain, Northern Ireland, India, Sweden and the international catalogue. All six are on `/passport` after a reload, in Swedish and English. |
| D    | One form per field pattern: Dubai's required company, a British licence, Northern Ireland's own licence, an Indian qualification's issuer and version, a Swedish course's provider, a certification.                                                                                                                                                                                         |
| E    | The occupation saved on the profile is on the Passport card.                                                                                                                                                                                                                                                                                                                                 |
| I    | Moving from Dubai to Sweden and back keeps all six credentials, with the same ids.                                                                                                                                                                                                                                                                                                           |
| F    | Document → review request → clarification → the holder's answer → approval, by a reviewer with the `passport_verifier` role only and no grant. The holder cannot open the review workspace, and the queue reads "Dubai, UAE".                                                                                                                                                                |
| G    | Selective share → the QR code is exactly the link, module for module → a logged-out recipient sees the two chosen credentials ("Dubai, UAE", India) and not the others or the scope → revocation ends it.                                                                                                                                                                                    |
| H    | Another holder, with their own session, reads nothing of this Passport through the page or the API. They cannot change it, raise their own trust level, decide a review or grant themselves a pilot.                                                                                                                                                                                         |
| B    | A mixed-market holder adds all four Indian qualifications and reloads.                                                                                                                                                                                                                                                                                                                       |
| J    | Fifteen credentials, one expired, with a long name: the card, the wallet and no horizontal scroll.                                                                                                                                                                                                                                                                                           |
| K    | The administrator's public-pilot definitions are exactly what a Dubai holder and a GB holder are offered.                                                                                                                                                                                                                                                                                    |

- **Locally:** all 20 runs pass on a stack I built by hand: GoTrue v2.169.0, PostgREST
  v12.2.3, the share function under Deno and a mail catcher. It has no Storage, so there
  case F attaches its documents through `sp_attach_evidence` as the holder, and records
  that in the test's annotations.
- **In CI:** `.github/workflows/passport-public-pilot-evidence.yml` runs the same walk on
  the Supabase CLI stack, which includes Storage (`E2E_STORAGE=1`). E-mail confirmation
  is required there, as on the hosted project, and the share function is served.
  `scripts/passport-public-pilot-evidence-verify.ts` refuses the report unless every
  case ran and passed on both projects, the documents went through Storage, and the
  screenshots exist at both widths.
- **Not proven here:** delivery by a real mail provider, and the deployed application.

## Release

- **Order:** merge after PR 2 (#315) has merged and been applied. The application does
  not depend on it, but the public pilot does.
- **After merge:** the owner publishes the application in Lovable.
- **Until PR 4 merges** (D2: the owner names the definitions that open), no market is
  in public pilot, so nothing changes for the UK or Dubai.
