# Document 06 — Profession Coverage Model

**Derives from:** [Assessment DNA — Security Profession Assessment Model](../assessment-science/07-profession-assessment-model.md).
**Purpose:** how the Question Library should structure content reuse across professions — this document does not re-derive *why* each profession's competency priorities differ (Assessment DNA Document 07 already did that); it defines how the *library* should be organized so that reasoning translates into efficient, non-duplicated content coverage.

## 1. The core reuse principle

Assessment DNA Document 07 §15 already established that foundational
competencies (Domains A–F) never disappear across professions — what
changes is which *additional* domains and *which dimensions within*
the foundational set differentiate most. The Question Library's
structural consequence: **a large share of the library should be
profession-agnostic by design**, tagged with broad Environment/
Profession applicability (Document 04 §6) rather than authored
separately per profession. Profession-specific content should exist
only where Assessment DNA Document 07 identified a genuine
differentiating need — not by default.

## 2. Three tiers of content

**Tier 1 — Universal.** Items targeting Domains A–F (Vigilance,
Judgement, Integrity, Communication, Documentation, Resilience) at the
foundational-dimension level (D1–D6), written without profession-
specific scenario detail (a generic but realistic security-operations
framing). These items should carry broad Profession/Environment
applicability metadata and form the largest tier by volume — this is
where the reusability goal ("the same question should be reusable
across multiple assessments when scientifically appropriate," per the
brief's Objectives) is realized most directly.

**Tier 2 — Environment/Domain-Extended.** Items targeting Domains G–J
(Leadership, Technical Knowledge, Investigative Reasoning, Learning
Agility) or advanced dimensions (D7–D12), written with enough
scenario specificity to be realistic (Document 03 §2) but applicable
across several related professions that share the same differentiating
need — e.g. one Domain H2 (Regulatory Knowledge) item family
structured to be authored in variants for each regulated environment,
rather than one bespoke item per profession from scratch.

**Tier 3 — Profession-Specific.** Items whose realism genuinely
depends on a single profession's specific operational detail (e.g. an
Executive Protection travel-logistics scenario, an Aviation screening-
procedure scenario) — the smallest tier, reserved for cases where
Tier 2's "variant of a shared family" approach would sacrifice realism
(Document 03 §2) if generalized further.

## 3. Coverage by profession, and where each sits

Restating Assessment DNA Document 07's environments with their primary
tier composition — reasoning is in that document; this is the library-
structure consequence:

| Profession/Environment | Primary tier composition |
|---|---|
| General Security | Almost entirely Tier 1 — the reference baseline |
| Security Supervisor / Manager / Coordinator | Tier 1 + Tier 3 for Domain G (leadership) |
| Control Room Operator | Tier 1, weighted toward Domain A items |
| Datacenter Security | Tier 1 + Tier 2 (Domain H1–H2 regulatory/systems family) |
| Critical Infrastructure | Tier 1 + Tier 2 (Domain H2–H3, Domain B3/D9 risk family) |
| Corporate Security | Tier 1 + Tier 2 (Domain D3 stakeholder-communication family) |
| Public Sector Security | Tier 1 + Tier 2 (Domain H2, Domain D1 accountability family) |
| Executive Protection | Tier 1 + Tier 3 (F1, H3 travel/logistics specifics) |
| Aviation Security | Tier 1 + Tier 2 (Domain H2 regulatory family, Aviation variant) + Tier 3 for screening-specific detail |
| Maritime Security | Tier 1 + Tier 2 (Domain H2 regulatory family, Maritime variant) + Tier 3 for port/vessel-specific detail |
| Investigation | Tier 1 + Tier 2 (Domain I family) |
| Intelligence | Tier 1 + Tier 2 (Domain I family, shared with Investigation) + Tier 3 for the heightened Domain C/I3 objectivity-under-pressure content Assessment DNA Document 07 §11 identifies as distinctive |
| Risk Management | Tier 1 + Tier 2 (Domain B3/D9 family, shared with Critical Infrastructure, extended to enterprise scope) |
| Crisis Management | Tier 1 + Tier 2 (Domain G2, F, D1/D3 sustained-multi-competency family — see §4) |

## 4. Explicit overlap patterns

Several professions share enough of their differentiating profile that
their Tier 2/3 content should be **explicitly authored as shared
families with variants**, not independently:

- **Investigation ↔ Intelligence.** Nearly identical Domain I coverage
  (Assessment DNA Document 07 §10–11); Intelligence's distinguishing
  need (heightened I3/motivated-reasoning-resistance content) should
  be authored as an *addition* to the shared Investigation/Intelligence
  Tier 2 family, not a separately built parallel set.
- **Aviation ↔ Maritime.** Both are heavily regulated, procedure-
  standardized, internationally-governed environments (Assessment DNA
  Document 07 §8–9); their Domain H2 regulatory-knowledge item
  *structure* (how a regulatory-scenario item is built) should be
  shared, with jurisdiction-specific content varying inside that
  shared structure, rather than two unrelated item families.
- **Critical Infrastructure ↔ Risk Management.** Share the Domain B3/
  D9 risk-calibration family; Risk Management's distinguishing need is
  scope (enterprise-wide vs. site-specific) and communication (Domain
  D3), not a different underlying risk construct — the item family
  should be shared with a scope-variant metadata tag (Document 04 §6),
  not duplicated.
- **Security Supervisor / Manager / Coordinator ↔ every other
  profession.** Per Assessment DNA Document 07 §14, Leadership is a
  cross-cutting layer, not its own environment — Tier 3 leadership
  content should be authored once per Domain G competency and tagged
  as applicable *across* every profession's supervisory/management
  level (Document 04 §7 Role Level), rather than reauthored per
  profession-plus-leadership combination.
- **Crisis Management.** Uniquely, this environment's differentiator
  (Assessment DNA Document 07 §13) is *sustained simultaneous*
  competency demand, not a single new domain — its Tier 2 content
  should specifically favor Scenario-Based items (Document 01 §2.3)
  long enough to test sustained performance across Domains B/F/G/D
  together, rather than single-competency items reused from other
  profiles.

## 5. Coverage-gap monitoring

As the library grows, coverage should be monitored per
Profession × Dimension cell against Assessment DNA Document 06 §1's
minimum-evidence floor — a library-health metric distinct from any
single Blueprint's own coverage check (that Blueprint-level check
remains Assessment DNA Document 06 §11's responsibility). A profession
with thin Tier 1 coverage is a library-design problem; a profession
missing its expected Tier 2/3 differentiating content (per §3's table)
is a targeted authoring gap — the two failure modes require different
responses and should be tracked separately.

## 6. Future professions

Per Assessment DNA Document 07 §15, a genuinely new profession should
be positioned first by asking Assessment DNA's own differentiating-
factor question, then slotted into this document's tier structure: if
its needs are fully met by existing Tier 1/2 content plus at most a
small Tier 3 addition, the library has succeeded at its generality
goal; if it requires a wholly new Tier 2 family, that is a legitimate,
expected form of library growth (Document 10), not a sign of a design
failure.
