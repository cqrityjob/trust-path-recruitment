# Security Passport — certification research catalogue integration

**Snapshot** 2026-10-03 · 170 researched programmes · 40 issuers · 117 source URLs
**Source** `docs/passport/research/2026-10-03-certification-catalogue/` (the research package, unchanged)
**Governing documents** [closed-catalogue-governance.md](closed-catalogue-governance.md), [global-certification-governance.md](global-certification-governance.md), [completion-work-order.md](completion-work-order.md) §2, §4

This integrates the research package into the **existing** Security Passport catalogue. It adds no second catalogue, no new
issuer model, no new verification path and no new market. The research records are research, not definitions: nothing is
approved by being in the package, and nothing here verifies a holder.

## 1. The three things that stay separate

|                                                            | Where it lives                                      | Who changes it                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Research decision** (matched, added, retained, excluded) | `sp_catalogue_research_records`                     | A reviewed migration; an administrator may move a _retained_ record between pending, needs-information and excluded, with a reason, and it is audited |
| **Publication of a definition** (a holder can select it)   | `sp_credential_types.is_active`                     | A reviewed migration only (D4 of the completion work order stands)                                                                                    |
| **Verification of a holder's claim**                       | `sp_claims.assertion_level` and the review workflow | Never by anything here. A definition, a request, an upload or a HAYAT reference verifies nobody                                                       |

Also kept apart, as the brief requires: the **awarding organisation** (an `sp_certification_issuers` row) and any **training
provider** (`sp_credential_organisation_roles`); a **professional certification** and a **course certificate** (credential
class); **international availability** and **permission to work** (a `global_professional` definition is structurally
forbidden from carrying any local eligibility or title).

## 2. The result

Every one of the 170 records has one explicit outcome. Nothing is pending; nothing was dropped.

| Outcome                                                                    | Records |
| -------------------------------------------------------------------------- | ------- |
| Matched to an existing definition (nothing changes)                        | **14**  |
| Added as an approved definition (inactive until the publication migration) | **140** |
| Retained for administrator review (specific issue and action recorded)     | **16**  |
| Excluded                                                                   | **0**   |
| **Total**                                                                  | **170** |

By priority: **P1 51** (13 matched, 35 added, 3 retained) · P2 116 (1 matched, 105 added, 10 retained) · P3 3 (all retained).
By research area (matched / added / retained): cyber and privacy 46 (8 / 38 / 0) · insurance and claims 30 (0 / 29 / 1) ·
physical security and investigation 25 (4 / 16 / 5) · resilience, continuity, fire and safety 32 (0 / 31 / 1) ·
risk, compliance and fraud 37 (2 / 26 / 9).
By kind of the 140 added: 78 personal certifications · 35 professional qualifications · 20 professional designations ·
6 assessed subject certificates · 1 course certificate.

The full per-record table is [reconciliation report](research/2026-10-03-certification-catalogue/RECONCILIATION.md)
(generated) and `reconciliation.json` beside it.

### Why 14 matched, by issuer and exact award

The 14 existing international definitions (ASIS APP, CPP, PCI, PSP; ISC2 CC, CCSP, CGRC, CISSP, SSCP; ISACA CISA, CISM,
CRISC; ACFE CFE; ACAMS CAMS) are reused. A research record matches only when **its issuer resolves to the definition's
issuer, its award name equals the definition's, and the two abbreviations do not disagree**. An acronym alone is never enough,
and the abbreviation test exists because normalisation drops a trailing "(ABBR)": without it _OffSec Certified Professional
(OSCP+)_ and _OffSec Certified Professional_ would be one award, when OSCP and OSCP+ are two (`INTL_OFFSEC_OSCP`,
`INTL_OFFSEC_OSCP_PLUS`). No existing Swedish, Indian, British or Dubai definition overlaps the research. ISC2 and ISACA
gain only their genuinely new awards (CSSLP, ISSAP, ISSEP, ISSMP; CCOA, CDPSE, CGEIT), under the **existing** issuer rows;
the ISC2 concentrations create no prerequisite credential. The one `source_recheck_required` row among the 14 (ACAMS CAMS)
matches a definition that rests on its own earlier reviewed sources, which are unchanged.

## 3. How each research field maps to a product field

| Research field                                                   | Product field                                                                                                                    | Rule                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`                                                         | `sp_certification_issuers` (existing table)                                                                                      | The awarding organisation. 31 new issuers; the five existing are reused. ISO is never an issuer (PECB awards the ISO-based credentials). `verification_mode = 'none'`: the research did not establish a holder lookup                                                                                                                                          |
| `official_name`, `acronym`                                       | `sp_credential_types.name_en/name_sv`, `sp_certification_definitions.canonical_name_en/abbreviation`                             | `name_sv = name_en` (one name, given by the issuer). The abbreviation is the issuer's own; **27 awards publish none and have none** (`abbreviation` is now nullable)                                                                                                                                                                                           |
| `credential_kind`                                                | `sp_credential_definition_metadata.credential_class`                                                                             | `person_certification` → `certification` (default); `professional_qualification`; `designation` → `professional_designation`; `assessed_certificate`; `course_certificate`. Four classes added                                                                                                                                                                 |
| `research_area`, `domain`                                        | `sp_credential_definition_reviews.professional_domain` (the existing subject filter)                                             | `cyber` → information security; `insurance` → insurance; `resilience` → resilience and safety; `risk` and `physical` are cut by the research `domain`. Three subjects added                                                                                                                                                                                    |
| `research_scope`, `jurisdiction_context`                         | **kept verbatim as research metadata only**                                                                                      | **Never** a jurisdiction, region, market pack, authority or access rule. Every addition is `global_professional` with none of those, which the database already forbids it from carrying. A US-origin designation can be held and registered by a person anywhere; a UK-origin diploma likewise. International availability never confers a permission to work |
| `source_url`, `source_title`, `evidence_*`, `researched_at`      | `sp_certification_sources` (programme source), `sp_credential_definition_reviews.source_url/checked_on`, and the research record | Source and research date are kept on the definition and on the record                                                                                                                                                                                                                                                                                          |
| `renewal_note`                                                   | `sp_certification_definitions.maintenance_summary_en`, policy type `not_assessed`                                                | Narrative only. **No cycle is invented and nothing is lifetime**: `allows_no_expiry` is false for every addition, including OSCP, where the research says the issuer distinguishes a lifetime award; that is an owner decision, not an inference                                                                                                               |
| `limitations`                                                    | the research record                                                                                                              | Kept verbatim for the administrator; never shown to holders as a claim                                                                                                                                                                                                                                                                                         |
| `catalogue_decision`, `reviewer`, `reviewed_at`, `decision_note` | the research record                                                                                                              | Reviewer is stated as the automated reconciliation under the owner's instruction, **effective only when the owner merges**. Reason is recorded per record                                                                                                                                                                                                      |
| `legal_recognition_status`, `holder_verification_policy`         | the research record, constrained by `CHECK` to `not_assessed` and `separate_holder_evidence_required`                            | A row cannot be edited into a recognition or an automatic verification                                                                                                                                                                                                                                                                                         |
| `legal_review_state` (on the definition)                         | `pending`                                                                                                                        | No legal or expert review took place, so none is claimed                                                                                                                                                                                                                                                                                                       |
| `symbol_label` (plate mark)                                      | `sp_credential_types.symbol_label`                                                                                               | The abbreviation where it fits 8 characters; otherwise the **issuer's** acronym. Initials are never composed from a title                                                                                                                                                                                                                                      |

Award **versions** are not governed for any addition: the research gives no authoritative version list. The holder's evidence
document carries the version; the catalogue neither captures nor infers one (`SP_DEFINITION_VERSION_UNKNOWN` stands).

## 4. The recheck of the 13 `source_recheck_required` records (2026-10-03)

The rule in the package is that search excerpts are provisional and that these rows need stronger evidence before approval.
The recheck was attempted against current official issuer sources and **could not be closed from the review environment**:
direct fetches of `acams.org`, `theiia.org`, `cila.co.uk`, `int-comp.org`, `nfpa.org` and `yourlpf.org` were refused by the
session's network egress policy (`EGRESS_BLOCKED`), which was not worked around. A web-search index restricted to each issuer's
own domain was consulted instead. It returned official-domain pages for every record, but that is the same class of evidence as
the original excerpt, so no record was promoted on it. What it did establish is recorded per record in `recheck_note` and in
the reconciliation report, including two findings the researcher could not have had:

- **CILA Advanced Diploma**: the issuer's 2025 Charter Review (indexed on cila.co.uk) says the Advanced Diploma is being retired for
  new candidates and the Institute is renaming itself. It is retained for an owner decision (leave out, or publish as a
  historical definition, which needs a retired-award registration rule the catalogue does not have). The renaming is recorded
  as a search alias on the CILA issuer, not a display name.
- **IIA Internal Audit Practitioner**: the issuer's page is titled "Internal Audit Practitioner (IAP) designation" while the
  research classes it as a personal certification, so its kind is unsettled.
- **ICA Diploma in Managing Sanctions Risk**: the index summary says the diploma is "awarded in association with" a
  university, so whether ICA is the sole awarding organisation is unsettled.

Result of the 13: **1 matched** (CAMS, an existing definition) and **12 retained**, each with the page to open and what to
confirm. Opening the page from an unrestricted network is the only action needed to close all twelve except the CILA decision.

## 5. Retained for review (16)

Twelve are the unclosed rechecks above. Four more are retained for a reason the research itself raises:

| Record                                          | Unresolved issue                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ISMI Certified Security Management Professional | The awarding organisation and award identifier are not established (UK framework origin; ISMI delivery must be kept apart from the awarding body) |
| Chartered Security Professional (WCoSP / CSPRA) | Two organisations are named as one issuer, the Security Institute administers the register, and the designation is register-dependent             |
| IFCPP Certified Visitor Relations Specialist    | P3, and it is not established whether the award is assessed or a course-completion certificate                                                    |
| PRMIA Operational Risk Management Certificate   | The research says the title differs across issuer pages and instructs aliases be resolved before approval                                         |

From release 2, each is visible to administrators at `/admin/passport-catalogue` (Research tab) with its issue, action,
evidence level and priority, and a holder searching for one sees "not available yet" with a fixed, translated reason and may
ask for it. In release 1 they are rows in `sp_catalogue_research_records`, readable by platform administrators only.

## 6. Release order

Three dependent releases, because the repository's schema-first contract forbids application code from merging against a
migration that is not applied, and because publishing 140 definitions to the old wizard would list them with raw class and
subject codes.

| #   | Release                      | Contains                                                                                                                                                                                                                                                                       | Needs                                                                                                                   | Production effect                                                                                                                                                                          |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Schema and research data** | Migrations `20270212090000` (foundation) and `20270213090000` (import), rollbacks, SQL suite and planted controls, `release-state.json`, the two vocabulary mirrors (`CREDENTIAL_CLASSES`, nullable `abbreviation`), generated types, this document, the reconciliation report | —                                                                                                                       | Adds tables, functions, four classes and 140 **inactive** definitions. The approved catalogue is **unchanged** (nothing new is selectable). No claim, grant, market or trust state changes |
| 2   | **Application**              | The registration search, filters, "not yet available" explanations, request path, admin Research and Requests views, a retired state, shared label mappings with neutral fallbacks, plate marks up to eight characters, tests and before/after screenshots (section 9)         | Release 1 applied **and recorded applied with evidence** in `release-state.json` (the schema-first guard enforces this) | None until the owner publishes the app in Lovable                                                                                                                                          |
| 3   | **Publication**              | Migration `20270214090000`: `is_active = true` on exactly the 140 added codes                                                                                                                                                                                                  | Release 2 published                                                                                                     | The 140 become selectable for every signed-in holder. `legal_review_state` stays `pending`; no market opens                                                                                |

Merging a migration to `main` applies it to production (D3 of the completion work order), so approving a merge approves its
release. **Nothing in this work was merged, published or written to hosted production.**

### Verification after each release (read-only)

The `verify` entry of each migration in `supabase/release-state.json` carries the queries and expected values (counts, RLS,
privileges, function fingerprints). After release 1, expect 170 research records (140 added, 14 matched, 16 retained),
14 of 154 international definitions active, the approved catalogue count unchanged, 12 credential classes, and zero rows in
`sp_catalogue_requests`. After release 3, expect 154 of 154 active and 154 selectable international definitions.

### Rollback

Each migration has a rollback in `supabase/rollback/`. They refuse rather than destroy: the foundation refuses while any
request, research record or new-class claim exists; the import refuses while any holder holds a claim against an added
definition, any request refers to one, or an administrator has recorded a decision; the publication rollback only withdraws
the definitions from **new** registration and never touches a claim. Order: publication, then import, then foundation. The
rollback chain and a clean re-apply are exercised in `scripts/db-test.sh`.

## 7. What is deliberately not here

- No market is opened or altered; no grant, pack, legal-review state or availability of an existing definition changes.
- No holder is verified. A catalogue entry, a request, an uploaded document and a HAYAT reference are all self-declared
  claims until the existing review workflow says otherwise.
- No equivalence between awards, no inferred prerequisite, no ranking (CPP, PSP and PCI are independent), no lifetime
  validity from missing renewal information, no membership-dependent postnominal treated as an award.
- Local security licences, visas, memberships, organisational ISO certification, product certifications and
  course-attendance badges remain outside the catalogue and need their own data models if requested.

## 8. Remaining blockers (genuine)

1. **The 12 unclosed source rechecks** need someone to open the issuer pages from a network that can reach them
   (`ACAMS` CAFS, CCAS, CGSS; `ICA` Advanced Certificate and Diploma in Managing Sanctions Risk; `NFPA` CWBSP; `IIA` CRMA, CIA,
   IAP; `LPF` LPC, LPQ; `CILA` Advanced Diploma). This session could not.
2. **CILA Advanced Diploma**: an owner decision (leave out, or add a retired-award registration rule).
3. **Four judgement records** (ISMI CSMP, Chartered Security Professional, IFCPP CVRS, PRMIA ORM) need the single fact named
   in section 5.
4. **OSCP no-expiry**: the research says the issuer distinguishes a lifetime OSCP from the time-limited OSCP+. The catalogue
   does not enable the explicit non-expiring option (`allows_no_expiry`) for it on that evidence; the owner may.
5. **Former titles**: the research says former ICA "International Diploma" titles need alias reconciliation but does not list
   them, so none was invented; they should be added as aliases when the issuer confirms them.
6. **Owner actions**: merging release 1; recording it applied with evidence; publishing the application; merging release 3.

## 9. The application release (release 2), what it changes and what it decided

**The registration flow.** Five steps (scope, location and category, credential, details, review) become three: _Find your
credential_, _Your details_, _Review and save_. Step 1 is one screen:

- a search over the full name, the abbreviation, the code, the issuer, approved issuer aliases and a definition's former names,
  ranked (exact abbreviation, abbreviation prefix, name, organisation, alias); a token matches the start of a word, so `cpp`
  finds CPP and not a certification whose issuer is IFCPP; no category has to be chosen first;
- a scope that starts at **All** (international and national together), narrowed by the holder to International or National
  (then country and, where a country has regional definitions, region), and optional filters for professional area, kind and
  organisation, each with counts;
- a result list in which every row reads `CPP — Certified Protection Professional` over `ASIS International · International
certification`, so two awards with similar abbreviations are told apart by full name and awarding organisation, a course
  certificate is never labelled a certification, and a national credential keeps its own name;
- once chosen, the catalogue's own facts appear under the row (headline, kind, territory, awarding organisation, professional
  area, how the issuer publishes renewal, official source) and the form then asks only for what is the holder's own:
  identifier, issue date, expiry or the explicit non-expiring choice where the definition allows it, the issuer printed on the
  certificate or the scope where the definition requires them, a version where one is governed, and evidence;
- credentials the research knows of but the catalogue has not approved are listed under **Not available yet** with a reason
  from a fixed, translated vocabulary, cannot be selected, and can be asked about;
- **Cannot find your certification?** sends a _request_: text the holder typed. It creates no definition, no issuer and no
  claim, changes nothing selectable, verifies nothing, is limited to ten open requests, is refused as a duplicate by the
  database as well as the form, and is answered by an administrator with a note the holder reads.

**Decisions this release made, and why**

| Decision                                                                                                                                                                                                                                                       | Reason                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choosing another credential clears what depended on the old one (issuer on the document, scope, version, a non-expiring choice the new definition does not allow, what HAYAT read, a badge link) and **keeps** the identifier, the dates and the attached file | They are the holder's own. A mis-click should not cost a typed certificate number                                                                                                   |
| Searching and filtering never un-choose a credential; changing the **place** (scope or country) does, when the credential no longer belongs to it                                                                                                              | Asking for Great Britain while a Swedish credential is selected is a contradiction; a narrower search is not                                                                        |
| An international certification is saved with no country and no market, whatever the holder's work country; the work country is read once, as a starting point, and never rewrites the scope                                                                    | International availability is not a permission to work, and a catalogue filter is not a territory                                                                                   |
| A missing expiry is saved as missing                                                                                                                                                                                                                           | Never inferred as a lifetime; the explicit non-expiring option exists only where the definition allows it, and says so                                                              |
| The recipient payload is **unchanged** (no credential class was added to it)                                                                                                                                                                                   | A payload change is a schema change to the sharing functions. The recipient already sees the credential's governed title, issuer, dates and trust state, and only what was selected |
| The plate legend prints up to eight characters; four or fewer are byte-for-byte the plates that already shipped                                                                                                                                                | `CISSP` was printed as `CISS` since `20261111090000` relaxed the database to eight characters; the 140 new marks need it                                                            |
| An unknown claim type, class, area or scope is named generically; an unknown claim type no longer silently drops out of the sharing screen                                                                                                                     | A migration ahead of the code must not take a credential out of sight                                                                                                               |
| Retired is its own availability state (a `retired_on` in the past, or deprecated), no longer "blocked"                                                                                                                                                         | An administrator needs to tell a retired definition from one that is waiting for governed data                                                                                      |

**Administration** (`/admin/passport-catalogue`): three views of one page. _Definitions_ is the existing diagnosis, now with a
retired state. _Research_ lists all 170 records with filters, the evidence level, the source and recheck note, what the holder
is told, and one audited decision per record: awaiting, needs information (with the unresolved issue, the action and the
holder-facing reason) or excluded. **No view can approve a record or publish a definition**, and the database refuses both
for everyone, an administrator included. _Requests_ answers a holder's request by pointing it at an existing definition or a
research record, or declining it with a reason. Both decisions are audited and findable on `/admin/audit`.

**Tests this release added.** `passport-credential-picker:check` (72 assertions: ranking, headline and byline, scope, selection
change, request limits against the database's own, structure, plate marks, unknown-type fallbacks) and
`passport-catalogue-admin:check` (32: administrator-only, own session, no approval path, labels and fallbacks), with 24 planted
controls in `negative-controls:passport-credential-picker` (one of them found an assertion that could not fail). Browser: a
stubbed picker suite at desktop, 375px and 390px in Swedish and English (48 tests), the existing wizard specs updated to the
three-step flow, and `e2e/passport-catalogue-integration-local.spec.ts`, a nine-test journey against **real** PostgreSQL,
PostgREST and RLS: search, select, fill, evidence, save, reload, Passport, a request for an unavailable credential, research and
request decisions, a verification review decided by an administrator, a selective share, a logged-out recipient, revocation,
an international certification held by a UK-based holder with no dates, local issuer details, and unapproved, forged and direct
writes refused. It found one real defect the stubbed suites could not: the admin definitions page selected a column that does
not exist on `sp_credential_types` and so failed against a real database (fixed and pinned). The journey reads from the
database whether the 140 researched definitions are published and asserts the matching behaviour (70 or 210 credentials
offered, OSCP and OSCP+ absent or two distinct results, 140 or 0 awaiting approval); its ninth test, registering a researched
certification with no country and no inferred lifetime, runs only once they are. It passed in both states.

**Local-stack changes** (named in `scripts/local-stack/README.md`): each sign-in now persists its `auth.sessions` row (the
Passport refuses writes from a session the database cannot find), logout deletes it, an in-memory Storage substitute serves the
evidence upload with the bucket's owner-prefix rule restated, a service-role key is written for the administrator's diagnosis
read, and the local service role is granted `SELECT` on the public tables.

**An observation, not a finding about production.** The administrator's definitions diagnosis reads the catalogue tables with
the service role after its own administrator check. A bare local replay of the migration history leaves `service_role` without
`SELECT` on `sp_credential_types` and its neighbours, which is why the local harness grants it. I have not verified what the
hosted project grants; if it matches the local replay, that page (which existed before this work) would fail there too.
