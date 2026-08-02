# Phase 0 hardening review — field-by-field classification

Performed against the unpushed Phase 0 migration before any real evidence exists.
Every suggestion is classified; several are deliberately **not** added, with the
reason stated.

**Test for inclusion:** a field belongs in Phase 0 only if it is part of the ledger's
*grain*, or is **unrecoverable** if not written at collection time. A nullable column
that can be added later with one cheap `ALTER` — before real evidence — does not
qualify.

---

## §1 Identity and privacy separation

**Finding: a real defect in the original Phase 0.** Evidence referenced
`auth.users(id) ON DELETE CASCADE`. Two problems: the ledger was directly coupled to an
identity, and deleting an account would have **destroyed evidence** — contradicting both
append-only and the ability to anonymise-and-retain.

| Change | Classification |
|---|---|
| `scp_subjects` (pseudonymous, carries nothing but a key) | **add to another Phase 0 graph table** |
| `scp_subject_identities` (the only subject→person mapping) | **add to another Phase 0 graph table** |
| `subject_id` → `scp_subjects(id)` `ON DELETE RESTRICT` | **add to Phase 0 ledger** |

**Erasure without rewriting the ledger:**

- **Correction** → supersede the evidence row.
- **Erasure / unlinking** → delete the `scp_subject_identities` row. Evidence survives as
  pseudonymous data attached to a key that no longer resolves. The ledger is untouched.
- **Full anonymisation** → unlink, then rely on the ledger holding no name, email,
  identity number or free text — asserted structurally by G2.1.

Append-only is therefore **not** a claim that personal data can never be erased. It is a
claim that the *judgement* is never rewritten; the *link to a person* is separately
revocable.

---

## §2 Evidence issuer and assessor

| Field | Classification | Note |
|---|---|---|
| `issuer_organization_id` | **add to ledger** | FK to `employers`. Also the cross-organisation boundary. Cannot be derived: manager-observation evidence has no attempt to inherit from. |
| `assessor_actor_id` | **add to ledger** | Nullable — deterministic scoring has no human actor. A pseudonymous account reference, never a name. |
| `created_by_service` | **add to ledger** | Explicit provenance over inferred. |
| `provenance_type` | **add to ledger** | Renamed from `provenance` to the requested vocabulary. |
| `provenance_ref` | already present | — |

---

## §3 Jurisdiction and regulatory context

| Field | Classification | Note |
|---|---|---|
| `jurisdiction_id` + `scp_jurisdictions` (SE only, active) | **add to Phase 0** | Unrecoverable. Evidence collected under Swedish rules must never be silently treated as interchangeable with another jurisdiction's. Also added to `scp_role_versions` and `scp_purpose_versions`. |
| `regulatory_context_version_id` | **derive through an existing pinned relationship** | **Not added.** There is no regulatory-context model yet, so the column would be a dangling reference. It is also *recoverable*: `jurisdiction_id` + `observed_at` + `behaviour_version_id` together determine which framework was in force. Revisit when regulatory content is actually modelled. |

---

## §4 Processing purpose and privacy notice

Not modelled as consent — the active lawful basis is legitimate interest for competence
development, recorded explicitly.

| Field | Classification | Note |
|---|---|---|
| `purpose_version_id` | **add to ledger** | GDPR purpose limitation is unrecoverable: you cannot later determine what a person was told. |
| `scp_processing_purposes` registry | **add to Phase 0** | `competence_development` active; `reassessment`, `training_follow_up`, `selection_support`, `compliance_support` present and inactive. |
| `scp_purpose_versions` | **add to Phase 0** | Holds `privacy_notice_version`, `lawful_basis_reference`, `jurisdiction_id`, versioned. |
| `processing_purpose` (code, on the ledger) | **reject as unnecessary** | Duplicates what `purpose_version_id` already reaches. Clear relationships over duplicated fields. |
| `privacy_notice_version_id`, `lawful_basis_reference` on the ledger | **add to another Phase 0 graph table** | They belong once per purpose version, not copied onto every evidence row. |

---

## §5 Role and assessment context

| Field | Classification | Note |
|---|---|---|
| `role_version_id` | **add to ledger** | Unrecoverable: which role the person was being assessed against. |
| `context_type` + `context_ref` | **add to ledger** (replacing `context_key`) | This pair is the **grain of the sufficiency gate** — breadth is counted over it — so it is expensive to change later. Typed beats a free-text key. |
| `programme_version_id` | **defer to Phase 1** | `scp_program_versions` does not exist yet. Adding a nullable FK in Phase 1, still before any real evidence, is one cheap `ALTER`. |
| `jurisdiction_id` | covered in §3 | — |

The graph is **role-neutral**: `scp_roles` is generic and links optionally to
`scp_professions`. No role content beyond the approved Security Guard MVP was added — in
fact no role content at all was seeded.

---

## §6 Extensible evidence source types

**Finding: the original CHECK constraint was too rigid.** Replaced with the
`scp_evidence_source_types` registry plus a `has_active_writer` flag and a trigger
(`SCP_EVIDENCE_SOURCE_NOT_ENABLED`) that refuses evidence from a reserved source.

Seeded: `assessment_response` (**active**), and `training_completion`,
`manager_observation`, `certification`, `verified_credential`, `practical_exercise`,
`incident_review` — all present, all with **no active writer**.

Adding a future source is now a row, not a migration that rewrites a CHECK on a live
ledger. No Security Passport or credential verification was built.

---

## §7 Reproducibility and correction

| Field | Classification | Note |
|---|---|---|
| `source_snapshot_hash` | **add to ledger** | Makes a historical judgement auditable even if the source record is later re-shaped. |
| `scoring_model_version` | **add to ledger** | Which scorer produced the contribution. Text version identifier, matching the repo's `cd_*` convention. |
| `superseded_at`, `superseded_by_actor_id` | **add to ledger** | Completed by a CHECK requiring `by`/`reason`/`at` together. |
| `calculation_rule_version_id` | **reject on the ledger** | **Challenged.** The maturity calculation happens at *read* time, across many rows, under a `threshold_version`. Pinning a calculation rule onto a single evidence row would imply the row was computed under it, which is false. It belongs on the **generated report snapshot** (Phase 1), where a calculation genuinely occurs. |

---

## §8 Safety-critical evidence

| Field | Classification |
|---|---|
| `is_safety_critical` | already present |
| `safety_severity` (`low`/`medium`/`high`/`critical`) | **add to ledger**, required whenever `is_safety_critical` |
| `requires_human_review` | **add to ledger** |
| `review_status` (`not_required`/`pending`/`in_review`/`upheld`/`overturned`) | **add to ledger** |

`review_status` and `requires_human_review` are among the *only* mutable columns — that
is the human-review path, not a rewrite. G6.7 asserts the property from the brief
directly: **later strong evidence does not clear a safety flag**; only an explicit
supersession does. A partial index backs the review queue.

---

## §9 Evidence maturity vocabulary

Replaced `emerging/developing/established/embedded` with the requested vocabulary:

`no_evidence` → `limited_evidence` → `developing_evidence` → `consistent_evidence` →
`strong_evidence`. **No `expert`** — asserted by G6.5 and by an in-migration check.

The names describe the **evidence**, not the person, which is what keeps the reported
statement at *"consistent evidence has been demonstrated in the assessed scenarios and
context"* rather than *"this person is competent"*. Thresholds stay in versioned
configuration, recalibratable after pilot without touching a single evidence row.

---

## §10 / §13 / §14 Security Passport boundary and ownership

**Nothing Passport-specific was built** — no pages, uploads, identity verification,
certificate verification, criminal-record handling, blockchain or credential issuance.

| Field | Classification | Note |
|---|---|---|
| `disclosure_class` (`internal_employer` default / `participant_visible` / `shareable_projection_eligible`) | **add to ledger** | Whether evidence is employer-confidential or individually portable is decided **at creation**. Retrofitting means guessing for historical rows — unrecoverable. It is a classification only; **no sharing workflow exists**, and it is immutable after write (G4.8). |
| Consent, sharing and credential-issuance workflows | **reserve for Security Passport** | Deferred entirely. |

**Ownership model.** The ledger already separates the five parties the brief asks about:
subject (`subject_id`, pseudonymous), commissioning/issuing organisation
(`issuer_organization_id`), assessing actor (`assessor_actor_id`), platform (the ledger
itself), and permitted viewer (RLS). Portability is expressed by `disclosure_class`;
expiry by `valid_until`; revocation by supersession. No assumption is made that the
participant owns employer-created records, nor that the employer owns the individual's
permanent competence identity.

A future Passport would read a **controlled projection filtered on `disclosure_class`** —
never this table, and never items, answer keys, rubrics, prompts or reviewer comments.
`scp_contract_versions` is what structurally prevents any future service binding to
assessment content.

---

## §15 Avoiding false objectivity

Every element the brief lists is preservable: source type, provenance, confidence,
human-review status, validity period, jurisdiction, context, and supersession history.

| Field | Classification | Note |
|---|---|---|
| `assessment_method` | **derive through an existing pinned relationship** | `source_type` + `provenance_type` + `source_ref` reach the method once Phase 1 lands the response tables. A separate column would duplicate it and could disagree. |
| `limitations` | **defer to Phase 1** | Limitations are a property of the *report*, not of one observation. They belong on `report_versions`. |

The table and function comments state plainly that the ledger records **demonstrated
behaviour**, not character, honesty, motivation or future performance.

---

## Whole-platform compatibility (§13)

- **Career Platform** — the separation guard's career-guidance rejection is reproduced
  byte-for-byte and still runs **first**. G1.2 attacks it from the hostile direction and
  demands the *specific* error, so a career-orientation answer can never become employer
  competence evidence via a mis-attached definition. Mutation-verified.
- **Security Competence Platform** — Assessment Center owns every table added here.
- **Security Passport** — no access path exists; only the `disclosure_class`
  classification a future projection would filter on.

---

## Not added, in summary

`regulatory_context_version_id` (derivable) · `processing_purpose` code on the ledger
(duplicate) · `privacy_notice_version_id` / `lawful_basis_reference` on the ledger
(belong on the purpose version) · `calculation_rule_version_id` (belongs on the report) ·
`programme_version_id` (Phase 1, table does not exist) · `assessment_method` (derivable) ·
`limitations` (belongs on the report) · `scp_audit_events` (Phase 1 — evidence is already
append-only with full provenance; there are no admin actions to audit yet).
