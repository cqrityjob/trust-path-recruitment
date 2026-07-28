# Security Competency Platform — overview

**Status:** PR-A (domain model) implemented. Not launched, no content published, no assignable product.
**Normative source:** *CQrityjob Security Competency Core Specification v2.0* (owner: Mostafa Alshawi, 27 July 2026).
**Validation status of everything below:** `design`. Nothing in this platform may be described as validated, certified or scientifically proven until the chapter 14 release gates are met.

## What this is

One shared competency core plus versioned, role-specific profession modules:

```
CQrityjob Assessment Platform
│
├── Career Guidance            (separate product — frozen, untouched)
│
└── Security Competency Platform
    ├── Security Competency Core          SCC-01 … SCC-12
    ├── Security Officer – Sweden         Väktare
    ├── Public Order Officer – Sweden     Ordningsvakt
    └── Protective Security Officer – SE  Skyddsvakt
```

A candidate experiences Core + module as one coherent journey. Core and module scores are calculated, stored and reported **separately** (spec 8.1).

## Stable public slugs

| Object | Slug | Swedish | English |
|---|---|---|---|
| Core family | `security-competency-core` | Security Competency Core | Security Competency Core |
| Module family | `security-profession-modules` | Yrkesmoduler | Profession Modules |
| Profession | `security-officer-se` | Väktare | Security Officer – Sweden |
| Profession | `public-order-officer-se` | Ordningsvakt | Public Order Officer – Sweden |
| Profession | `protective-security-officer-se` | Skyddsvakt | Protective Security Officer – Sweden |

`security-guard-foundation` is **retired** and must never be reused as a slug for anything new.

Swedish regulated roles carry an explicit `market = 'SE'`. Swedish legal requirements never apply automatically to another country; a new country is a separate profession/market adaptation with its own lineage and validation.

## Spec chapter 13.1 → table mapping

The specification uses generic table names; three of them collide with live legacy tables (`assessments`, `assessment_versions`, `assessment_assignments`). The implementation uses the `scp_` prefix, matching this repository's existing `cig_` convention.

| Spec 13.1 object | Table |
|---|---|
| `assessment_families` | `scp_assessment_families` |
| `competencies` | `scp_competencies` + `scp_competency_versions` |
| `competency_facets` | `scp_competency_facets` |
| `professions` | `scp_professions` |
| `assessment_definitions` | `scp_assessment_definitions` |
| `assessment_versions` | `scp_assessment_versions` |
| `forms` | `scp_forms` + `scp_form_items` |
| `items` / `item_versions` | `scp_items` + `scp_item_versions` (+ `scp_item_texts` for language adaptations) |
| `options` / `scoring_keys` | `scp_item_options` (key) + `scp_item_option_texts` (label) |
| `module_links` | `scp_bundles` + `scp_bundle_versions` |
| `role_weight_profiles` | `scp_role_weight_profiles` + `_weights` |
| scoring model (spec 8.1) | `scp_scoring_versions` — versioned weights, owner decision A |
| cross-role item reuse | `scp_item_version_professions` — owner decision D |
| `audit_events` | `scp_content_events` |
| `assignments` / `attempts` / `responses` | PR-C |
| `score_results` | PR-D |
| `reports` | PR-E |
| `norm_groups` / `validation_studies` | PR-F and later |

## Two structural decisions worth knowing

**Scoring keys are in a different table from option labels.** `scp_item_options` holds `score_value` and `scoring_rationale`; `scp_item_option_texts` holds the candidate-visible label. The candidate runtime joins only the latter, so "no scoring key ever reaches the browser" (spec 12.1, acceptance criterion 12) is enforced by table design rather than by discipline in a SELECT list.

**The assignability gate fails closed — but nothing calls it yet.** `scp_bundle_version_assignability()` it *proves* both forms are populated and that at least one language is completely adapted before it can return anything but `blocked`. An earlier version used count-based negative checks, which passed vacuously on an empty set — an empty bundle was reported assignable. Fixed in A3 (review finding HIGH-2). See [owner decisions](./governance/owner-decisions.md) B.

**The gate exists but is not yet wired.** PR-A builds the function and the structural controls around it. PR-A does **not** enforce it on any candidate-assignment workflow, because no Security Competency assignment path exists yet. PR-C must call it on every assignment path and refuse on anything but `assignable` (or `pilot_only` for a consenting pilot participant). Until PR-C is implemented and tested, this is an *available* protection, not an *enforced* one — and AC-15 stays partial.

**Language is an adaptation object, not a column.** `scp_item_texts` is one row per language per item version, each with its own `adaptation_status`. Machine translation alone can never reach `approved` (spec 11). This is why the schema has no `text_sv`/`text_en` pair anywhere.

## What is deliberately not built yet

Assignments and candidate runtime (PR-C), the scoring engine (PR-D), reports (PR-E), pilot analytics (PR-F). No item content exists; the item bank is empty by design — items are authored through PR-B's review-and-publish flow. The assignability gate refuses any bundle containing a draft item, but nothing calls that gate until PR-C — see the enforcement note above.

## Related documents

- [Security Competency Core v2.0](./security-competency-core-v2.0.md) — the twelve constructs
- [ADR: product separation](../architecture/adr-security-competency-product-separation.md)
- [Gap analysis](./implementation/gap-analysis.md)
- [Migration and rollback](./implementation/migration-and-rollback.md)
- [Test matrix](./implementation/test-matrix.md)
- [Publishing and versioning](./governance/publishing-and-versioning.md)
- [Validation statuses](./governance/validation-statuses.md)
- [AI and human oversight](./governance/ai-and-human-oversight.md)
- [Owner decisions](./governance/owner-decisions.md) — A–D, decided 2026-07-27
- [Trust boundary and scoring visibility](./governance/trust-boundary-and-scoring-visibility.md) — LOW-2 and LOW-4 decisions
- [Scoring engine v1](./scoring/scoring-engine-v1.md)
