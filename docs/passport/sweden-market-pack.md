# Security Passport — Sweden market pack

`sp_market_packs.code = 'SE'` · active · `legal_review_state = 'grandfathered'`

> **`grandfathered` is not `approved`.** Sweden shipped before the source
> register existed and carries the same review debt as any other pack. The
> separate value exists so that debt stays visible instead of being laundered.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## Credentials

| Code                    | Category      | Contributes to        | Notes                                           |
| ----------------------- | ------------- | --------------------- | ----------------------------------------------- |
| `VU1`                   | qualification | education             | No expiry, and none is invented                 |
| `VU2`                   | qualification | education, competence |                                                 |
| `OV_TRAINING`           | qualification | education             | The **course**, not the appointment             |
| `OV_REFRESHER`          | qualification | education             | Fortbildning                                    |
| `OV_TRANSPORT`          | qualification | education             | Special transport training                      |
| `OV`                    | appointment   | eligibility, title    | Polismyndigheten. Requires end date + authority |
| `SV`                    | appointment   | eligibility, title    | Länsstyrelsen. **Requires a scope**             |
| `SE_PERSONNEL_APPROVAL` | appointment   | eligibility           | Länsstyrelsen. **Narrow result only**           |

_Status: Implemented, Tested. Requires legal review._

## The rules, as data

| Rule                            | Output           | Requires                |
| ------------------------------- | ---------------- | ----------------------- |
| `SE_VU1_COMPLETED`              | education        | `VU1`                   |
| `SE_VU2_COMPLETED`              | education        | `VU2`                   |
| `SE_OV_TRAINING_COMPLETED`      | education        | `OV_TRAINING`           |
| `SE_OV_REFRESHER_COMPLETED`     | education        | `OV_REFRESHER`          |
| `SE_OV_TRANSPORT_COMPLETED`     | education        | `OV_TRANSPORT`          |
| `SE_VAKTARE_COMPETENCE`         | competence       | `VU1` **AND** `VU2`     |
| `SE_PERSONNEL_APPROVAL_CHECKED` | eligibility      | `SE_PERSONNEL_APPROVAL` |
| `SE_ORDNINGSVAKT_ELIGIBILITY`   | eligibility      | `OV`                    |
| `SE_SKYDDSVAKT_ELIGIBILITY`     | eligibility      | `SV`                    |
| `SE_ORDNINGSVAKT_TITLE`         | **active title** | `OV`                    |
| `SE_SKYDDSVAKT_TITLE`           | **active title** | `SV`                    |

All eleven require `verified` evidence that is **current on the evaluation
date**.

### The three things this pack asserts

1. **VU1 alone displays completion of VU1 and nothing else.** It does not
   create the title Väktare. _Tested by mutation — the assertion is named
   "MUTATION: VU1 alone does NOT produce the competence title Väktare"._
2. **VU1 + VU2, verified, derives the competence title Väktare / Security Guard
   · Sweden.** Local eligibility and employer-related approval remain separate
   statuses. _Tested._
3. **Ordningsvakt and Skyddsvakt are titles only from a currently valid
   appointment**, never from training. _Tested by mutation both ways._

A holder may carry Väktare competence, an Ordningsvakt title and a Skyddsvakt
title **simultaneously**. They are never collapsed: inventing a combined word
would name a job that does not exist. _Tested._

## Why `requires_current_validity` is true on every rule

It is tempting to set it false for a completed course — finishing VU1 in 2019
is still true in 2026. But the flag does not only govern expiry; it governs
whether the credential is **effectively active** on the evaluation date, which
is also how a revoked, disputed or superseded credential stops counting.

A VU1 has no `valid_until`, so requiring currency costs it nothing and never
lapses, while a VU1 withdrawn after a correction correctly stops producing a
title. Setting it false would buy no accuracy and would keep revoked evidence
alive.

## Personnel approval: what is stored, and what cannot be

`SE_PERSONNEL_APPROVAL` is marked `narrow_result_only`. The database refuses:

- **any** holder note on it, **including on a draft**;
- **any** title other than its controlled label.

A draft that has already stored somebody's register commentary has already done
the harm, so unlike the completeness rules this one does not wait for submit.

**Stored:** that an approval was checked · the authority · the date ·
provenance · lifecycle · scope where applicable.

**Explicitly prohibited:** register contents · suspicions · offences · Säpo
material · the reason for a refusal · any internal authority note.

_Status: Implemented, Tested. Requires legal review_ — whether recording even
the narrow result is lawful in a given workflow is a question for a Swedish
data-protection reviewer, not for this document.

## Skyddsvakt scope, and why it is grandfathered

`SV` sets `requires_scope`: the approval is limited to an employer, a principal
or a protected object, and shown without saying which it reads as a general
national security licence.

The rule binds **inserts**, and on **updates** only rows that already carried a
scope. Skyddsvakt claims exist from before the column did, and the trigger
fires on UPDATE — enforcing it unconditionally would have frozen those rows: no
correction, no verification, no expiry, refused over a field the form never
asked for. A recorded scope still cannot be removed.

_Status: Implemented, Tested_ — including the grandfathering itself.

## The form and the database must agree

The taxonomy decides what a credential asks for, and **two** readers act on it:
the form (`fieldsFor`, `validateCredential`) and a database trigger. That is the
design — one source of truth, enforced for every caller — and it is also
exactly how the two can silently disagree.

They did. Adding `requires_scope` to `SV` made the database refuse a claim the
form could not supply, and `narrow_result_only` on the personnel approval made
it refuse a title and a note the form still offered. Both would have failed
only at the moment a real holder pressed save, in a live market.

`scripts/passport-credential-form:check` is the guard that was missing. For
**every** credential in the taxonomy it builds a complete draft _from that
row_ and asserts it validates clean, then asserts each rule refuses what it
exists to refuse — so a credential added later is covered without editing the
script. Negative-tested: removing the scope field from `fieldsFor` fails 2 of
50 assertions.

_Status: Implemented, Tested, in CI._

## Employment and experience

Verified experience is computed by **interval union**, so two concurrent jobs
count once (`experience.ts`, unchanged by this work). The five segments are a
visual progression and **not a score**; the exact verified duration is always
printed beside them.

**Explicitly prohibited:** an employer attesting subjective labels — "good
guard", "trustworthy", "recommended". Employer attestation is for factual role,
dates, employment or assignment, extent and operating environment.

_Status: interval union Implemented and Tested. The constrained attestation
vocabulary is **Future**._

## Sources

Registered in `sp_regulatory_sources`; see
[regulatory-source-register.md](./regulatory-source-register.md). All nine
Swedish sources answered the checker on 2026-08-22.

> **Requires legal review.** Swedish legal rules and authority material must be
> re-read on the implementation date. The fingerprints here record what the
> pages said on 2026-08-22 and nothing more.

## Future

Renewal reminders linked to Polisen's fortbildning guidance · the constrained
employer-attestation vocabulary · clearing incompatible hidden values when the
holder switches credential type.

Candidate-facing forms for the four new credentials are **Implemented and
Tested** — see the section above. The jurisdiction control now reads the active
market packs rather than a literal, so it offers Sweden and nothing else until
a reviewer approves another pack.
