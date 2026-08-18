# Purpose governance — Product Owner decision pack

**Status:** DRAFT. Every legal statement below requires Product Owner approval and
appropriate privacy/legal review before it is published.
**Not part of any migration.** Nothing here has been activated in the product.
**Prepared:** 20 August 2026, alongside `20260820090000_scp_governed_purpose_selection.sql`.

---

## Why this exists

`scp_employer_assign` used to select the processing purpose as *the most recently
published active purpose, across all purposes*, without reading the use case. That
has been replaced with an explicit mapping that **fails closed**:

| Selector | Required `purpose_code` | State today |
|---|---|---|
| `use_case = 'workforce'` | `competence_development` | active, published — **works** |
| `use_case = 'recruitment'` | `selection_support` | inactive, no published version — **refuses** |
| purpose intent `reassessment` | `reassessment` | inactive, no published version — **refuses** |

Two product paths are therefore closed until this pack is decided:

- **Recruitment assignment** — refuses with `SCP_PURPOSE_NOT_AVAILABLE`.
- **Reassessment** ("Boka omprövning") — refuses with the same error. The
  Participants page now disables the control and explains why, rather than
  failing on click.

Publishing a purpose version asserts a lawful basis, a privacy-notice version, a
controller/processor allocation and a retention position. Those are decisions for
a person, so the migration deliberately did not invent them.

### The precedent to follow

`competence_development` v1 (migration `20260811090000`) is the only approved
purpose and is a good model. It was reasoned explicitly onto **GDPR Art.6(1)(f)**
rather than consent, because consent given to an employer is rarely freely given
and the power imbalance makes legitimate interest the honest basis. It names a
specific privacy-notice version (`pn-2026-08-competence-development-v1`) and is
scoped to the `SE` jurisdiction.

---

## Decision 1 — `selection_support` (recruitment)

| Field | Draft proposal — REQUIRES APPROVAL |
|---|---|
| **Intended purpose** | Structured evidence to support a human recruitment decision for a defined role. |
| **Permitted use** | As one input among several to a human decision; to structure an interview; to give the candidate their own report. |
| **Prohibited use** | Any automated or sole-basis decision. Ranking or comparing candidates. Reuse for a different purpose without a fresh, lawful and transparent assessment. Use of closed-test content as if validated. |
| **Governance mode** | `recruitment` — reachable only for content that is `published` **and** `operational-development`/`operational-selection`. A test grant can never confer it. |
| **Required validation wording** | Must state the validation status of the instrument and that the employer decides. Must not imply predictive validity that has not been evidenced. |
| **Candidate information requirements** | Before starting: purpose, controller, recipients, retention, rights, that a human decides, and that they receive their own report. |
| **Controller / processor** | **DECISION REQUIRED.** Likely employer = controller, CQrityjob = processor — but CQrityjob's own use of response data for validation may make it a controller for that separate purpose. Must be settled explicitly, not assumed. |
| **Lawful basis** | **DECISION REQUIRED.** Art.6(1)(f) legitimate interest is the likely candidate, mirroring `competence_development`, with a documented balancing test. Consent is not appropriate in an employment context. |
| **Retention** | **DECISION REQUIRED.** Recruitment data typically has a shorter horizon than development data, and unsuccessful candidates need a defined deletion point. |
| **Privacy-notice fields needing legal review** | Notice version id; controller identity; balancing-test summary; retention period; objection and rectification route; whether AI Act Annex III high-risk classification applies to the intended use. |

**Blocked until decided:** recruitment E2E, Journey A, and any recruitment pilot.

---

## Decision 2 — `reassessment`

| Field | Draft proposal — REQUIRES APPROVAL |
|---|---|
| **Intended purpose** | Independent re-measurement after a development activity, to see whether a way of working is now evidenced. |
| **Permitted use** | Comparison against the person's own earlier evidence; documenting a development outcome; input to a human follow-up decision. |
| **Prohibited use** | Disciplinary action, pay, scheduling or placement changes driven automatically by the result. Comparison against colleagues. Reuse of the original form (that measures recall of the question, not transferable practice). |
| **Governance mode** | Same as the original assessment. A reassessment of closed-test content is still closed test. |
| **Required validation wording** | Must state that it is a re-measurement of the same competencies with different items, and that a change in evidence is not a change in the person. |
| **Employee information requirements** | Why the reassessment was assigned, what it compares against, who sees the result, and that a human interprets it. |
| **Controller / processor** | **DECISION REQUIRED.** Likely the same allocation as `competence_development`, but should be stated rather than inherited. |
| **Lawful basis** | **DECISION REQUIRED.** Probably the same Art.6(1)(f) basis as competence development, with a balancing test that accounts for the repeat nature of the processing. |
| **Retention** | **DECISION REQUIRED.** Must cover how long a before/after pair is kept, and whether the earlier result is retained beyond the later one. |
| **Privacy-notice fields needing legal review** | Notice version id; relationship to the original assessment's notice; retention of the comparison; employee objection route. |

**Blocked until decided:** Phase 9 reassessment delivery and the development→reassessment journey.

---

## What publishing actually requires, once approved

For each purpose:

1. `UPDATE scp_processing_purposes SET is_active = true WHERE code = '<code>';`
2. Insert an `scp_purpose_versions` row with the approved `privacy_notice_version`,
   `lawful_basis_reference` and `jurisdiction_id`.
3. No code change. `scp_required_purpose_code` already maps to these codes, and
   `scp_employer_assign` will begin to permit the path the moment an approved
   version exists.

The mapping and the freeze are already in place, so publishing is a governance act
rather than an engineering one — which is the separation this pack exists to keep.

---

## Open question that is not a purpose decision

`scp_employer_assign` requires the recipient to already hold an account
(`SCP_RECIPIENT_HAS_NO_ACCOUNT`), and the invitation token it writes has no
retrievable plaintext. So even once `selection_support` is published, a candidate
without an account still cannot be assessed. That is the approved Phase 8.5
invitation slice and is tracked separately.
