# Security Passport — international professional certifications

**Phase 1 of 4 — Phase 1A, the SCHEMA release.**
**Migration `20261111090000_sp_global_professional_certifications`.**
**Source review date: 2026-09-12.**

> **This document describes a schema-only release.** It adds tables, a column,
> constraints, triggers, grants and reference data. It adds **no application
> code**: nothing under `src/` reads any of it, and
> `scripts/passport-global-certification-check.ts` asserts that, object by
> object, so the migration is safe to merge and apply while the running
> application continues against the old hosted schema.
>
> The resolver, the canonical classifier and the read path that consume this
> schema are Phase 1B and ship separately, **after** this migration is applied
> on the owner project and `release-state.json` records the hosted evidence.
> That order is the repository's schema-first contract, enforced by
> `scripts/schema-first-release-check.ts`.

This document is the governance record for the international-certification
foundation: why international scope is explicit, what an issuer is and is not,
how the programme's rules stay separate from a holder's standing, which
official sources were read, and what has to happen before a fifteenth
certification or a country recognition rule is added.

It describes schema and reference data. No Passport surface reads any of it
yet — not even the server function that will: that code is Phase 1B's. The
holder experience is Phase 2's.

---

## 1. Why international scope is explicit

The Passport already knew how to say where a credential comes from. The
three-market foundation (`20260907090000`) separated four concepts
permanently — jurisdiction, sub-jurisdiction, authority and market pack — so
that a British SIA licence and a Swedish ordningsvaktsförordnande could never
become peers in one flat vocabulary.

A Certified Protection Professional is a different shape again. It is real, it
is professional, it is awarded by an organisation rather than granted by a
regulator, and it authorises nothing, anywhere. Every cheap way of recognising
one is wrong:

| Candidate signal            | Why it fails                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `jurisdiction_code IS NULL` | Also true of every language, practical skill and free-text training row in the product |
| The issuer's country        | ASIS is incorporated somewhere. A CPP is not a credential _of_ that place              |
| The word "international"    | Holder-supplied text                                                                   |
| A title or an abbreviation  | "CPP" is also a job title, an acronym and whatever anybody types                       |
| An uploaded document        | A PDF asserts. It does not govern                                                      |
| A Career Center category    | Research about a profession, not a fact about a person                                 |

So scope is **declared**, by the catalogue, in
`sp_credential_types.scope_code`, and it is a foreign key into
`sp_credential_scopes` rather than a PostgreSQL enum — because this migration
must roll back cleanly, and a dropped enum value is not something Postgres
offers.

Three states, never two:

- `global_professional` — an international professional certification;
- `national_regulated` — belongs to one jurisdiction;
- `NULL` — **undeclared**, which is what every pre-existing row is and what it
  stays until somebody reviews it.

`NULL` is never global. That asymmetry is the whole design: this phase adds a
way to _say_ international and adds no way to _guess_ it.

### What the database refuses

`sp_credential_type_global_scope_unbound` pins every `global_professional`
definition to:

```
claim_type            = 'certification'
category              = 'qualification'
market_pack_code      IS NULL
jurisdiction_code     IS NULL
sub_jurisdiction_code IS NULL
authority_id          IS NULL
regulated_role_id     IS NULL
contributes_to        does NOT contain local_eligibility or active_title
```

The last line is the one that matters most. A certification may evidence
professional competence. It may never create permission to work, and it may
never feed a derived professional title. That is structural, not a property of
the seed.

`sp_claims_credential_rules` gains one rule —
`SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION` — and is otherwise reproduced
verbatim. A client that submits `credential_code: "INTL_ASIS_CPP"` alongside
`jurisdiction_code: "SE"` is refused, for every caller including
`service_role`. The application's own mapping never builds such a row; the
database is what makes it impossible.

---

## 2. Issuer versus regulator versus verifier

Three different things, and conflating any two of them is how a Passport comes
to overstate what it knows.

**A regulator** decides who may work. Polismyndigheten, Länsstyrelsen, the SIA
and SIRA are regulators, they live in `sp_authorities`, and their decisions
carry legal force in a named territory.

**An issuer** awards a professional certification. ASIS International, ISC2,
ISACA, the ACFE and ACAMS are issuers. They live in
`sp_certification_issuers`, which is a **separate table** — because the moment
a certification body sits in the regulator table, a Passport can present an
ASIS certificate as though somebody's government issued it. The table
deliberately carries **no jurisdiction column at all**, so an issuer's
domicile can never become a credential's jurisdiction by a later join.

**A verifier** is whoever checks a specific claim. CQrityjob reviewing a
document is a verifier. So, in future, is an authenticated issuer. They are
recorded on the claim's provenance, not on the catalogue.

### Verification capability, and what its absence means

`sp_certification_issuers.verification_mode` records what the _issuer_
publishes — never what CQrityjob has done:

| Mode                 | Meaning                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `exact_match_lookup` | A public tool that answers about a named holder given identifying details |
| `opt_in_directory`   | A listing the holder chooses to appear in. **Absence proves nothing**     |
| `issuer_account`     | Confirmation needs the issuer's own account or a manual evidence route    |
| `none`               | No official public holder lookup was confirmed                            |

`absence_is_inconclusive` is a column, not a convention, and a constraint
forces it true for every `opt_in_directory`. A surface that could render "not
found" as "not certified" would be making the single most damaging statement
this table is capable of.

---

## 3. Trust versus lifecycle

Two independent axes, and a third thing that is neither.

**Trust** (`sp_claims.assertion_level`) is how well a claim is backed:
self-declared, document reviewed by CQrityjob, or — in future — confirmed by
an authenticated issuer. A PDF, a logo, an email domain, a link click and a
public-directory search are none of them issuer confirmation, and
`sp_claim_certification_lifecycle` enforces that: `status_source =
'issuer_confirmed'` requires both a confirming time and a confirming source,
which a document review can supply neither of.

**Lifecycle** is where the fact sits in its life. For these certifications it
is emphatically _not_ `sp_claims.valid_until`, which means one thing across the
whole Passport: the date an authorisation stops authorising. None of these
programmes works that way. Reusing the column would have made a Passport state,
in its own vocabulary, that a certification had expired when its issuer says no
such thing.

So the certification lifecycle is a normalised side table with explicit
semantics:

```
awarded_on              stated, never computed
cycle_ends_on           stated, never computed
cycle_end_semantics     recertification_due | certificate_printed_date
                        | annual_compliance_due | unknown
holder_lifecycle_status unknown | active | lapsed | suspended
                        | expired | revoked | retired
status_as_of            REQUIRED whenever the status is not 'unknown'
status_source           holder_declared | document_reviewed | issuer_confirmed
```

**The programme's rules are a third thing.** "ASIS recertifies on a three-year
cycle" is a fact about ASIS. "Sara is currently certified" is a fact about
Sara, and no amount of the first proves the second. `maintenance_cycle_months`
lives on the definition; nothing in this repository adds it to `awarded_on`.

The programme shapes the catalogue records, from the sources read on
2026-09-12:

| Issuer | Shape                                                                                                                                               | Recorded as                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| ASIS   | Three-year recertification cycle                                                                                                                    | `recertification_cycle`, 36 months         |
| ISC2   | Three-year cycle **and** a separate annual maintenance obligation; CPE totals are credential-specific                                               | `cycle_plus_annual_maintenance`, 36 months |
| ISACA  | Annual CPE minimum and annual fee, plus 120 CPE over three years. **Annual standing can end before the three-year date printed on the certificate** | `cycle_plus_annual_maintenance`, 36 months |
| ACFE   | **Annual** compliance, not a multi-year expiry                                                                                                      | `annual_compliance`, cycle **NULL**        |
| ACAMS  | Three-year recertification cycle                                                                                                                    | `recertification_cycle`, 36 months         |

ACFE's `maintenance_cycle_months` is NULL and a constraint requires it to be:
an annual-compliance programme publishes no cycle, and inventing thirty-six
months for it would be exactly the fabrication this section exists to prevent.

---

## 4. The catalogue, and the sources behind it

Five issuers, fourteen certifications, reviewed 2026-09-12.

### Controlled display names

| `issuer_code` | Display name                                    | Note                                                                                                                                                                   |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASIS`        | ASIS International                              |                                                                                                                                                                        |
| `ISC2`        | ISC2                                            | Legal name recorded separately. `(ISC)²`, `(ISC)2` and `ISC²` are **search aliases only** — the superscript renders four different ways across this product's surfaces |
| `ISACA`       | ISACA                                           | **Not expanded.** ISACA retired the expansion, and printing a former organisation name beside somebody's credential is a small lie they cannot correct                 |
| `ACFE`        | Association of Certified Fraud Examiners (ACFE) | Expanded, because the abbreviation alone is not widely legible outside fraud examination                                                                               |
| `ACAMS`       | ACAMS                                           | Expansion recorded as an alias                                                                                                                                         |

### The fourteen

**ASIS International — 4**

| Code            | Certification                             |
| --------------- | ----------------------------------------- |
| `INTL_ASIS_APP` | Associate Protection Professional (APP)   |
| `INTL_ASIS_CPP` | Certified Protection Professional (CPP)   |
| `INTL_ASIS_PCI` | Professional Certified Investigator (PCI) |
| `INTL_ASIS_PSP` | Physical Security Professional (PSP)      |

Maintenance: `https://www.asisonline.org/certification/recertification/`
Verification: `https://external.asisonline.org/eweb/DynamicPage.aspx?webcode=ASISCredSearch`

**ISC2 — 5**

| Code              | Certification                                               |
| ----------------- | ----------------------------------------------------------- |
| `INTL_ISC2_CC`    | Certified in Cybersecurity (CC)                             |
| `INTL_ISC2_CGRC`  | Certified in Governance, Risk and Compliance (CGRC)         |
| `INTL_ISC2_SSCP`  | Systems Security Certified Practitioner (SSCP)              |
| `INTL_ISC2_CISSP` | Certified Information Systems Security Professional (CISSP) |
| `INTL_ISC2_CCSP`  | Certified Cloud Security Professional (CCSP)                |

Maintenance: `https://www.isc2.org/policies-procedures/member-policies` and
`https://www.isc2.org/policies-procedures/amfs-overview`
Verification: `https://www.isc2.org/MemberVerification`

**ISACA — 3**

| Code               | Certification                                             |
| ------------------ | --------------------------------------------------------- |
| `INTL_ISACA_CISA`  | Certified Information Systems Auditor (CISA)              |
| `INTL_ISACA_CISM`  | Certified Information Security Manager (CISM)             |
| `INTL_ISACA_CRISC` | Certified in Risk and Information Systems Control (CRISC) |

Maintenance: one `maintain-…-certification` page per credential.
Verification: `https://www.isaca.org/credentialing/verify-a-certification`

**ACFE — 1**: `INTL_ACFE_CFE` — Certified Fraud Examiner (CFE).
Directory: `https://www.acfe.com/fraud-resources/find-a-cfe` — **opt-in.**

**ACAMS — 1**: `INTL_ACAMS_CAMS` — Certified Anti-Money Laundering Specialist.
**No official public holder-verification lookup was confirmed on review**, so
`public_verification_url` is NULL. A marketing page, a site-search result and a
third-party badge platform are none of them a verification service, and storing
one as though it were would be the product asserting a capability it does not
have.

### What is deliberately absent

ISO 31000, ISO 22301 and ISO/IEC 27001 are **not** personal certifications and
are not here. ISO publishes standards; it certifies nobody. ISO 31000 is
guidance and is not intended for certification at all, and the other two
certify an _organisation's_ management system. The Career Center already
records them correctly as knowledge areas rather than credentials
(`src/lib/career-center/certifications.ts`), and this catalogue does not
contradict it.

### Abbreviations

CISSP and CRISC are five characters. `sp_credential_types_symbol_label_check`
was relaxed from 4 to 8 so they store and render whole. Truncating a
credential's own abbreviation prints something nobody awarded onto the surface
a candidate screenshots and sends to an employer. No issuer logos are used
anywhere; the marks are neutral CQrityjob plates.

---

## 5. Source governance and re-review

A catalogue entry whose source nobody read, on a date nobody recorded, is an
assertion wearing a database row. `sp_certification_sources` records, for every
entry: the issuer, the programme (or NULL for an issuer-level source), the kind
of source, its URL, who reviewed it, when, and what they read.

**To add a fifteenth certification, all of the following are required:**

1. an official **programme** source, read and recorded;
2. an official **maintenance-policy** source, read and recorded;
3. a **verification-capability** review — which of the four modes the issuer
   publishes, and whether absence through that route is conclusive;
4. a named **reviewer and date**;
5. a stable, immutable `credential_code`;
6. the scope declared explicitly as `global_professional`, with every
   territorial column NULL;
7. tests: the code in the SQL suite's expected set and in
   `scripts/passport-global-certification-check.ts`, plus a governed mark.

**To retire one:** set `retired_on` and, where applicable, `replaced_by_code`,
and set `sp_credential_types.is_active = false`. Never reuse, silently rename
or delete a code a holder's claim may reference. A retired definition stays
readable forever — holders keep claims against it — and only new claims are
refused.

**Re-review cadence:** at least annually, and immediately on any known issuer
change (a renamed programme, a changed maintenance policy, a withdrawn or
newly published verification route). The source-diff process is: fetch each
recorded URL, compare against the `review_note` recorded at the last review,
and record a new row with a new `reviewed_on` rather than editing the old one.
`superseded_on` closes a source that no longer exists.

---

## 6. Why free text is never silently upgraded

Holders already have claims titled `ASIS`, `CPP`, `CISSP` and `test`. Every one
of them stays exactly as it is.

The migration's backfill writes one value — `national_regulated` — and only
onto definitions that **already** carry both a reviewed market pack and a
jurisdiction. That is an exact governed relationship, not a guess. No title is
read, no abbreviation is matched, no issuer name is compared, and no row is
classified from the absence of a country. The migration reads, writes and
deletes nothing in `sp_claims` at all.

The reason is not caution for its own sake. A free-text row titled "CPP" might
be a Certified Protection Professional. It might be a job title, a note to
self, or a typo. Promoting it would hand the holder a governed credential
nobody awarded them and hand a reader a trust signal nobody earned — and the
holder would have no way to tell it had happened. The only thing that changes a
free-text claim into a governed one is the holder explicitly choosing the
definition, which is Phase 2's flow.

`scripts/negative-controls/global-certification-controls.ts` plants a fuzzy
backfill and requires the guard to catch it.

---

## 7. Rollback, and its limit

`supabase/rollback/20261111090000_…_rollback.sql` removes exactly the objects
this migration introduces: the six tables, the scope column and its two
constraints, the three trigger functions, the fourteen definitions **by name**,
and the relaxed plate bound. It restores `sp_claims_credential_rules` verbatim
to its `20261109090000` definition. It uses no `CASCADE`. It touches no row of
`sp_claims`, and the 59 pre-existing definitions survive byte-for-byte — the
scope column was the only thing written to them, and dropping it removes the
backfill with it.

Proved up → down → up against an empty clean replay **and** against a
representative fixture containing free-text rows named after real
certifications, a Swedish credential, a British licence and a Dubai cadre card.

**The limit, stated plainly.** Once a real holder records an international
certification, this rollback **refuses**, loudly, with
`SP_GLOBAL_CERT_ROLLBACK_REFUSED`. Removing the definition would have to delete
their claim, and a rollback that deletes holder data is not a rollback. After
adoption, a defect here must be corrected by a **forward migration**. That is a
property of the change, not a gap in the file.

---

## 8. Future standards compatibility

Directional only. Nothing below is implemented, and nothing in this phase
should be built to accommodate it beyond what is already true.

The shape this foundation happens to have — a stable credential code, a named
issuer with a canonical identity, a dated award, an explicit status with a
recorded source, and a separation between what the issuer says and what the
holder says — is the shape **W3C Verifiable Credentials 2.0** and **Open Badges
3.0** both assume. If CQrityjob ever issues or consumes either:

- `sp_certification_issuers.issuer_code` is the natural anchor for an issuer
  identifier;
- `sp_credential_types.code` is the natural anchor for a credential type;
- `sp_claim_certification_lifecycle.status_source` already distinguishes a
  holder's assertion from an issuer's, which is the distinction a verifiable
  credential encodes cryptographically.

None of that is a commitment. Do not add DID methods, proof suites, JSON-LD
contexts, wallets or badge baking in anticipation — the cost of removing an
unused standard is higher than the cost of adding one later, and this phase
builds none of it.

---

## 9. What this release did not do

No application code at all — no server function, no resolver, no classifier, no
form, no route, no component. No share transport change. No recipient field. No
market activated (Sweden remains the only active pack). Nothing written to
hosted Supabase. No generated types regenerated — `types.ts` describes the
hosted database, and rewriting it for a schema that is not applied would make
it assert something untrue about production. No Edge Function, no DNS, no
Lovable action, no deployment, no publication.

`scripts/passport-global-certification-check.ts` GROUP 4 asserts the whole of
that first sentence mechanically: for each of the six new tables, the new
column and the `INTL_` code namespace, no file under `src/` mentions it, and
the generated types do not describe it. The day Phase 1B wires the catalogue
up is therefore a deliberate change to that guard, not a drift past it.

### The order from here

1. this schema PR is independently reviewed and merged;
2. the official Supabase GitHub integration applies the migration;
3. the hosted schema is verified read-only;
4. `release-state.json` records `hostedState: applied` with that evidence;
5. the application PR is rebased onto the new `main`;
6. the application PR is rerun through complete CI and reviewed again.

Until step 4 the entry in `release-state.json` says `pending`, which is what it
is. No step in this list may be skipped to make a check green.
