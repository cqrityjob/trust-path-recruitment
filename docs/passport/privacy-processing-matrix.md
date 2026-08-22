# Security Passport — privacy processing matrix

Three markets, three regimes. This document records what is processed, on what
basis, and what is refused.

**This is not legal advice and does not constitute legal approval.** It is a
technical and product record for a qualified reviewer to work from.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## Consent is not the default basis

**Explicitly prohibited: hardcoding "consent" as the universal employment-law
basis.**

Consent given in an employment or recruitment context may be invalid or
inappropriate because of the power imbalance between the parties. Where this
product relies on the holder's own act — creating a Passport, choosing to
disclose — that is a holder-initiated action rather than employer-obtained
consent, and the two must not be conflated in the reviewer's analysis.

The basis column below is left **for legal review** deliberately. Filling it in
here would be the exact failure this section warns about.

## The matrix

|                            | Holder's own Passport                                                              | Application disclosure               | Public/social card                                              |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| **Controller**             | _Requires legal review_                                                            | _Requires legal review_              | _Requires legal review_                                         |
| **Purpose**                | Holder's professional record                                                       | Support one named application        | Holder-chosen publication                                       |
| **Legal basis**            | _Requires legal review_                                                            | _Requires legal review_              | _Requires legal review_                                         |
| **Data categories**        | Claims, evidence, experience, events                                               | Selected claims + derived titles     | Display name, titles, jurisdiction, verified-experience summary |
| **Recipients**             | Holder; verifier on request                                                        | One employer workspace               | Anyone with the link                                            |
| **Retention**              | Until holder withdraws; history append-only                                        | Employer's lawful recruitment record | Until revoked                                                   |
| **Correction**             | New version, supersedes; never overwrites                                          | Snapshot is immutable by design      | Regenerated from current facts                                  |
| **Export**                 | _Future_                                                                           | _Future_                             | n/a                                                             |
| **Access logging**         | `sp_passport_events`                                                               | `sp_disclosure_accesses`             | `sp_disclosure_accesses`                                        |
| **International transfer** | _Requires legal review_                                                            | _Requires legal review_              | _Requires legal review_                                         |
| **DPIA status**            | _Requires legal review_ — see [dpia-technical-input.md](./dpia-technical-input.md) |                                      |                                                                 |

### Per-market review state

| Market         | Regime                   | Sources registered                                   | Legal review                    |
| -------------- | ------------------------ | ---------------------------------------------------- | ------------------------------- |
| Sweden         | GDPR + IMY guidance      | 4 IMY entries                                        | **grandfathered — outstanding** |
| United Kingdom | UK GDPR + ICO            | 4 ICO entries                                        | **pending**                     |
| Dubai          | UAE federal + Dubai/SIRA | `ae_data_protection_laws`, `ae_business_regulations` | **pending**                     |

## Categories this product refuses to process

Enforced by **absence of any column**, plus `narrow_result_only` on the two
rows where such content could plausibly have arrived:

- Criminal-record extracts
- Suspicion-register information
- Court judgments
- Security-clearance results
- The reason for a government rejection
- Health, medical, fitness or drug-test information
- Political opinions
- Trade-union membership
- Religious belief
- Internal intelligence or security notes

Any exception requires a **separately approved** legal basis, purpose,
retention rule, DPIA and explicit owner approval. **That is outside this
mission and outside this document.**

_Status: Implemented (absence + two narrow-result credentials), Tested._

### The narrow-result mechanism

`sp_credential_types.narrow_result_only = true` makes the claim trigger refuse:

- any holder note, **including on a draft**;
- any title other than the credential's controlled label.

Two rows carry it: `SE_PERSONNEL_APPROVAL` and `AE_DU_FITNESS_CHECKED`. The
forward migration asserts there are exactly two and aborts if that changes, so
un-marking either fails the build rather than shipping.

## What a recipient never receives

`SOCIAL_FORBIDDEN_KEYS` (unchanged, extended in coverage by this work) plus the
reduced `PublicTitle` type. A public or social card carries the holder's chosen
display name, derived titles, jurisdiction, a verified-experience summary and a
verification link.

**Never:** evidence documents · credential or licence numbers · employer
history · contact details · internal notes · government identifiers ·
sensitive dates · criminal or medical information.

`PublicTitle` has **no date field at all**. That is not a filter — passing a
full `ProfessionalIdentity` to the social builder put `expiresOn` into an
exported PNG and the existing guard caught it. A type with no date cannot leak
one whatever the serialiser does.

_Status: Implemented, Tested — 66 persona/privacy combinations._

## Humans decide

AI may extract proposed fields from uploaded evidence and explain what is
missing. **It must never approve, reject, rank or shortlist.**

- Extraction confidence is internal and is **never** rendered as a trust score.
- The candidate confirms extracted fields.
- A human verifier still decides verification.
- A person can never verify their own claim (`sp_phase10` self-review guard,
  unchanged and re-asserted).

_Status: self-review guard Implemented and Tested. Document extraction is
**Future**._

## Explicitly prohibited

- A readiness, suitability, risk, employability or trust score, anywhere.
- Percentage match, candidate ranking or automatic rejection in an employer
  view.
- Treating an application as consent to read a Passport. A disclosure row must
  be created **by the holder**, naming one application, before an employer can
  read anything — and the "no disclosure" response is byte-identical whether
  the candidate has no Passport, has one and shared nothing, or shared and
  revoked.

_Status: Implemented and Tested in `sp_application_passport_test.sql`._

## Future

Per-market controller/processor determination · retention schedules per
category · holder-facing export · international-transfer analysis for the Dubai
pack.
