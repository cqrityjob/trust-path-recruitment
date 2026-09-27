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

## Verified (local, stubbed backend)

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

The walk against a real backend (GoTrue, PostgREST and row-level security) is not in
this list. It needs synthetic accounts on the isolated local stack and is tracked
separately.

## Release

- **Order:** merge after PR 2 (#315) has merged and been applied. The application does
  not depend on it, but the public pilot does.
- **After merge:** the owner publishes the application in Lovable.
- **Until PR 4 merges** (D2: the owner names the definitions that open), no market is
  in public pilot, so nothing changes for the UK or Dubai.
