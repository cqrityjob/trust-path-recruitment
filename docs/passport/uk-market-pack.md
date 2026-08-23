# Security Passport — United Kingdom market pack (SIA)

`sp_market_packs.code = 'GB'` · **inactive** · `legal_review_state = 'pending'`

> Nothing in this pack can reach a holder. Two independent gates: the pack
> constraint refuses every `GB` claim, and every credential and rule is
> individually `is_active = false`.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## Qualification and licence are separate facts

Somebody who has passed the Level 2 award for door supervision has done the
training the SIA requires. **They are not licensed** until the SIA has decided,
and that decision rests on a suitability investigation this product neither
sees nor stores.

They are therefore separate credential types, never one row with a flag — a
single `UPDATE` must not be able to turn a course certificate into a licence.

_Status: Implemented, Tested by mutation._

## One licence per licensable activity

Door supervision and public space surveillance are different licences requiring
different training, and holding one says nothing about the other. Storing the
activity as free text on a shared row would make _"is this person licensed for
CCTV"_ a string comparison against something the holder typed.

| Activity                         | Licence               | Qualification      | Active title |
| -------------------------------- | --------------------- | ------------------ | ------------ |
| Security guarding                | `UK_SIA_LICENCE_SG`   | `UK_SIA_QUAL_SG`   | yes          |
| Door supervision                 | `UK_SIA_LICENCE_DS`   | `UK_SIA_QUAL_DS`   | yes          |
| Public space surveillance (CCTV) | `UK_SIA_LICENCE_CCTV` | `UK_SIA_QUAL_CCTV` | yes          |
| Close protection                 | `UK_SIA_LICENCE_CP`   | `UK_SIA_QUAL_CP`   | yes          |
| Cash and valuables in transit    | `UK_SIA_LICENCE_CVIT` | `UK_SIA_QUAL_CVIT` | yes          |
| Key holding                      | `UK_SIA_LICENCE_KH`   | —                  | yes          |
| Non-front-line                   | `UK_SIA_LICENCE_NFL`  | —                  | **no**       |

Plus `UK_SIA_TOP_UP` for refresher training.

**Non-front-line grants eligibility but no professional title.** It is not a
licence to perform a front-line activity, and giving it a title would assert
something about what its holder may do on a door. _Tested by mutation._

## Applicability is not universal

This pack does **not** assert that every security worker needs a licence.
Whether one is required depends on the activity and the contractual context —
see `gb_sia_need_a_licence` in the source register.

_Explicitly prohibited: any rule that infers "unlicensed therefore ineligible"
from the absence of a licence claim._

## The licence number

16 digits, enforced by `reference_pattern` on the credential type, checked by
the one claim trigger for every caller. It binds a **draft**: eight digits in a
sixteen-digit field is wrong when it is stored, not when it is submitted.

A qualification's certificate number is whatever the awarding organisation
prints and carries no pattern.

The number is **private throughout** — like every `credential_reference` it is
a lookup key into somebody else's register, and it never appears on a card, a
social image or a disclosure.

_Status: Implemented, Tested._

## Register verification

`src/lib/security-passport/verification/registry-adapter.ts`

**One implementation: `manualRegistryAdapter`. It performs no network request.**

A verifier looks at the official register and records what they saw; the
adapter attaches the source URL, the source key, a timestamp, the verifier and
the method, so a manual result carries the same provenance an automated one
would rather than being free text somebody typed.

Four outcomes:

| Outcome                   | Supports verification | Needs human review |
| ------------------------- | --------------------- | ------------------ |
| `shown_as_current`        | **yes**               | no                 |
| `shown_as_not_current`    | no                    | yes                |
| `not_found`               | no                    | yes                |
| `could_not_be_determined` | no                    | yes                |

`could_not_be_determined` is first-class and distinct from `not_found`. **A
register that is down says nothing about a person**, and collapsing the two
would let an outage become a negative finding.

### Why automation is not enabled

- `rolh.services.sia.homeoffice.gov.uk` is published for people checking one
  licence. Automating requests against it is a decision about that service's
  terms, not a technical convenience.
- Enabling an automated provider requires a **confirmed authorised technical
  route** — an API, a documented bulk-check facility, or written permission.
  Nothing here should be read as suggesting one exists.

_Status: shape Implemented; automated provider **Future**, gated on
authorisation. Scraping is **explicitly prohibited**._

## Explicitly prohibited

- Storing the criminal-record or suitability information the SIA uses. There is
  no field for it.
- Scraping or automating against the public register in breach of its terms.
- Treating a UK qualification as evidence about a Swedish or Dubai credential,
  or the reverse.

## Sources and review state

All nine UK sources answered on 2026-08-22.

> **Requires legal review.** The Data (Use and Access) Act has affected ICO
> guidance. `gb_ico_recruitment`, `gb_ico_vetting`,
> `gb_ico_criminal_offence_data` and `gb_ico_automated_decisions` must be
> **re-read on the implementation date**; do not rely on old UK GDPR
> assumptions or on the fingerprints recorded here.

## Activating this pack

1. A named reviewer reads the nine sources and the credential/rule vocabulary.
2. Record the review: `legal_review_state = 'approved'` with
   `legal_reviewed_by` and `legal_reviewed_on` — the constraint requires both.
3. `is_active = true` on the pack.
4. `is_active = true` on the credentials and rules the reviewer approved. This
   is per-row on purpose: a reviewer may approve the pack and hold one
   credential back.

## Future

Candidate-facing forms · authorised register integration · employer view of a
UK application disclosure.
