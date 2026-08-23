# Security Passport — UAE / Dubai market pack (SIRA)

`sp_market_packs.code = 'AE-DU'` · **inactive** · `legal_review_state = 'pending'`

> Nothing in this pack can reach a holder.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## Dubai, and only Dubai

SIRA regulates private security in Dubai. It does not regulate Sharjah, and a
Security Cadre Card is **not a UAE licence**.

Every row is pinned to `AE-DU`. All seven emirates are listed in
`sp_sub_jurisdictions`; one is active.

| Emirate        | Code    | Supported |
| -------------- | ------- | --------- |
| Dubai          | `AE-DU` | yes       |
| Abu Dhabi      | `AE-AZ` | no        |
| Sharjah        | `AE-SH` | no        |
| Ajman          | `AE-AJ` | no        |
| Umm Al Quwain  | `AE-UQ` | no        |
| Ras Al Khaimah | `AE-RK` | no        |
| Fujairah       | `AE-FU` | no        |

**The six are listed rather than omitted on purpose.** An absent row rejects
`AE-AZ` with a foreign-key error that reads like a bug; an inactive row lets
the trigger answer _"Abu Dhabi is not supported yet"_ — a true statement the UI
can render as a state.

**Switching Dubai on does not make `AE` a jurisdiction.** With the pack live, a
claim for the country with no emirate is still refused with
`SP_SUB_JURISDICTION_REQUIRED`, and each of the six is still refused
individually. _Tested by mutation, with the pack activated._

Each active title names the emirate in its own label — _"Security Guard (SIRA
cadre card) · Dubai, UAE"_ — so a reader cannot take one for a national or
portable licence. _Tested._

## The card is not the courses

SIRA requires training before it issues a card. Somebody with the courses and
no card is **not licensed to work**, and with only a card credential available
would have had nothing truthful to record.

| Code                            | Category      | Contributes to     |
| ------------------------------- | ------------- | ------------------ |
| `AE_DU_SIRA_CARD_GUARD`         | appointment   | eligibility, title |
| `AE_DU_SIRA_CARD_SUPERVISOR`    | appointment   | eligibility, title |
| `AE_DU_SIRA_CARD_OPS_MANAGER`   | appointment   | eligibility, title |
| `AE_DU_SIRA_GUARD_COURSE`       | qualification | education          |
| `AE_DU_BASIC_FIRE_SAFETY`       | qualification | education          |
| `AE_DU_BASIC_LIFE_SUPPORT`      | qualification | education          |
| `AE_DU_PEOPLE_OF_DETERMINATION` | qualification | education          |
| `AE_DU_SPECIALIST_COURSE`       | qualification | education          |
| `AE_DU_FITNESS_CHECKED`         | qualification | **nothing**        |

_Tested by mutation: completing every SIRA course produces no professional
title._

## The fitness check derives nothing, and that was a correction

The first draft had `AE_DU_FITNESS_CHECKED` produce `local_eligibility`. The
**Swedish** suite's global invariant failed it — _"an authority-bearing rule
rests on a qualification"_.

The suite was right. Eligibility means an authority currently permits this
person to work, and passing a medical does not; SIRA issues the card, and the
card is what permits anything. Weakening the assertion to accommodate the row
would have removed a real guard to make a wrong model fit.

The credential still appears in the holder's record and in an employer's view
of a disclosure. It simply is not a status.

_Status: Implemented, Tested._

## The card names its company, and its own expiry

**Scope is required.** SIRA links a cadre card to the licensed company the
holder works for; shown without it, the card reads as a portable personal
licence. _Tested._

**`typical_validity_months = 24`** records SIRA's published general cadre
validity — as a hint for renewal reminders and form defaults, and **never** to
compute an expiry. The card states its own date; deriving one would put a
fabricated fact on a trust record. _Tested: the hint never overrides the stated
date._

_Explicitly prohibited: converting a published typical validity into a stored
`valid_until`._

## What cannot be stored

- Emirates ID number or image
- Residence-visa image or details
- Good-conduct certificate contents
- Criminal information
- Medical or fitness detail
- Reasons for rejection
- Internal authority notes

Most of this is enforced by **absence**: there is no column, and adding one
would be a visible schema change somebody has to justify. _Tested directly —
`sp_claims` has no column matching `emirates_id|visa|conduct|criminal|medical|health`._

The fitness certificate is the one row where a medical detail could plausibly
have arrived, so it is `narrow_result_only`: no holder note, controlled label
only, refused for every caller including `service_role`. _Tested by mutation._

## Arabic is absent, not machine-generated

`name_ar` is **NULL on every row in this pack**.

Filling it with a machine translation of Emirati security-law vocabulary would
produce terms that _look_ authoritative and that nobody competent has checked —
worse than showing the English. `labelFor` in the derivation engine falls back
to `nameEn` when `nameAr` is null, and there is a test asserting exactly that.

_Status: **Requires legal review**. A native and legal reviewer supplies these
before the pack is ever activated. Shipping unreviewed Arabic legal terminology
is **explicitly prohibited**._

## Sources and review state

Six of seven Dubai sources answered on 2026-08-22.

> **`ae_du_sira_portal` did not answer the checker at all.** This is a standing
> limitation of the pack, not a transient failure. The document-verification
> route cannot be described as monitored while its portal does not respond to
> us, and any register adapter for Dubai would today be an integration with a
> guess.

## Activating this pack

As for the UK, plus: **the Arabic vocabulary must be supplied and reviewed
first**, and the SIRA portal question must be resolved or explicitly accepted
as a limitation in the review.

## Future

Arabic labels and RTL rendering · candidate-facing forms · a SIRA register
adapter, gated on an authorised route · any second emirate, each of which needs
its own authority, vocabulary, sources and verification process reviewed before
it could be switched on.
