# Security Career Discovery v3.0

The permanent product documentation for CQrityjob's Career Discovery experience — the product currently called *Gör karriärtest*.

**Status:** design. No implementation.

> ## ⚠ The architecture is approved. The authored content is NOT approved for production.
>
> This distinction is not a formality, and nothing in this document set may be read as production-ready assessment content.
>
> **Approved in principle:** the architecture, the construct model, the eight axes, the evidence pipeline, the experience design, the roadmap.
>
> **NOT approved:** every question, option, scale and narrative statement in the [Question Blueprint](./question-blueprint-v3.0.md). All of it is authored draft. All Swedish text is an AI-authored first draft. No item has been reviewed by anyone.
>
> **No question may be administered to any real candidate until all six gates are cleared:**
>
> | Gate | Status |
> |---|---|
> | SME review — ≥3 independent security professionals from ≥2 environments | ☐ not started |
> | Language review — native-speaker review of all Swedish; English as an approved adaptation | ☐ not started |
> | Accessibility review — reading level, no colour-only or sensory dependence | ☐ not started |
> | Bias review — cultural neutrality, no protected-characteristic proxies, balanced option desirability | ☐ not started |
> | Privacy / legal review — GDPR, DPIA, lawful basis | ☐ not started |
> | Psychometric review — construct validity, the ipsative trade-off design, item statistics after pilot | ☐ not started |
>
> **Validation status is `design` throughout.** It advances to `pilot` only after the gates above, and further only on documented evidence. Nothing here may be described to a candidate, an employer, a partner or an investor as validated.

---

## Start here

**New to this?** Read the [Executive Summary](./executive-summary.md) (one page), then the [Experience blueprint](./security-career-discovery-experience.md).

**Implementing?** Read the [Master Product Blueprint](./master-product-blueprint-v3.0.md), then the [Roadmap](./implementation-roadmap-v3.0.md), then the document for your area.

**Wondering why a decision was made?** [Current-state audit](./current-state-audit.md) has the evidence, with file and line references.

---

## The set

| # | Document | What it answers |
|---|---|---|
| — | [Executive Summary](./executive-summary.md) | Why users trust it, why employers trust it, why it is hard to copy, why it scales, why it fits the mission |
| 1 | [Master Product Blueprint](./master-product-blueprint-v3.0.md) | The technical spine — philosophy, 17-stage experience architecture, discovery psychology, assessment architecture, question strategy, AI boundary, scalability, UX, final recommendations |
| 2 | [The Experience](./security-career-discovery-experience.md) | The emotional and commercial spine — WOW moments, trust architecture, motivation engine, the continuous journey, differentiation, long-term vision |
| 3 | [Question Blueprint](./question-blueprint-v3.0.md) | The actual instrument — 20 core items with full bilingual wording and complete metadata |
| 4 | [Information Architecture](./information-architecture-v3.0.md) | Every screen: purpose, actions, data, evidence, decision, transition |
| 5 | [User Journey](./user-journey-v3.0.md) | All 17 stages as narrative — what is seen, felt, and done |
| 6 | [Evidence Architecture](./evidence-architecture-v3.0.md) | The reasoning pipeline, the Evidence Object, and adaptive discovery |
| 7 | [Security Career DNA Model](./security-career-dna-model-v3.0.md) | The eight axes, confidence, conflict, missing evidence, living profile, enrichment |
| 8 | [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) | DNA → Security Career Areas → categories → roles, and how each recommendation is explained |
| 9 | [Implementation Roadmap](./implementation-roadmap-v3.0.md) | MVP · Beta · V1 · V2 · Future, with exit gates |
| — | [Current-state audit](./current-state-audit.md) | Why all of this exists — 20 findings against the live build |
| — | [ADR: construct model](../../architecture/adr-career-discovery-construct-model.md) | Which construct model governs which product |

Documents 1 and 2 are **peers**. One specifies the machine; the other specifies why anyone would love it.

---

## The short version

**The product.** A 15-minute discovery that produces a Security Career DNA — eight orientation axes with honest confidence — then a Career Narrative explaining the person to themselves, then named Swedish professions with real regulatory grounding, then an action plan. Anonymous to take, anonymous to read; an account only to keep it.

**The premise.** Most assessment products reduce uncertainty *about* a person for someone else's benefit. This one reduces uncertainty *for* the person, and lets them choose what to share.

**The keystone.** A persisted, append-only **Evidence Object** per answer. It is what makes full traceability, a living profile, and consented employer enrichment possible at once — and none of the three is possible without it.

**Data protection.** Export and deletion ship at `[MVP]`, before public release — because the product promises them on screen, and a promise made in the product must be true when the product is public. Consent is per-purpose and revocable; withdrawal removes the evidence and recomputes. DPIA and legal review remain mandatory before any real recruitment use. See [Master Blueprint ch 10](./master-product-blueprint-v3.0.md).

**The construct decision.** Three construct models exist in this repository and nothing decided between them. They answer different questions and each now owns one: SCC-01…12 owns occupational competence; **CDA-01…08 owns career orientation**; Assessment DNA governs method and ethics and supplies vocabulary to neither. See the [ADR](../../architecture/adr-career-discovery-construct-model.md).

**Twenty items, not sixteen.** Eight axes × three independent items = 24 loadings, carried by 20 items because the eight trade-off items load two axes each. Sixteen cannot clear the evidence floor — and sixteen is exactly what produced the current build's four single-item dimensions.

---

## Phase tags

Every recommendation across the set is tagged. An untagged recommendation is a defect.

| Tag | Meaning |
|---|---|
| `[MVP]` | Before beta. ~10 weeks. Six of eight WOW moments |
| `[V1]` | Before commercial launch |
| `[V2]` | After launch |
| `[Future]` | Directionally committed, not scheduled |

---

## Terminology Standard

**The candidate-facing taxonomy is the Security Career Area** — Swedish **Säkerhetsområde**. This is binding on all future implementation.

| Layer | Use | Never use |
|---|---|---|
| Product | **Security Career Area** | Career Family |
| Documentation | **Security Career Area** | Career Family |
| Frontend | **Security Career Area** | Career Family |
| Swedish UI | **Säkerhetsområde** | Karriärfamilj |
| TypeScript | `SecurityCareerArea` | `CareerFamily` |
| API | `securityCareerArea` | `careerFamily` |
| Database | `career_area` | `career_family` |
| Database id | `career_area_id` | `family_id` |

Also never introduce, in any layer: *family recommendation · family mapping · family hierarchy · family confidence · family target*, or any equivalent. The corresponding terms are **area recommendation · area mapping · area hierarchy · area confidence · area target**.

### Two different concepts that both contain the word "family"

They are unrelated, and conflating them is the reason this standard exists.

| | **Assessment Family** | **Security Career Area** |
|---|---|---|
| What it is | Internal SCP **governance** concept — which product a piece of assessment content belongs to | The **product taxonomy** a candidate sees — a grouping of security professions |
| Where it lives | `scp_assessment_families`, `product_type`, `scp_guard_family_product_separation` | `cig_profession_families` today; `career_area` in future schema |
| Who sees it | Platform admins and content authors | Candidates |
| Examples | `security-competency-core`, `security-profession-modules` | Protective Operations, Investigations & Intelligence |
| Renamed? | **No. Never.** | Yes — from "Career Family" |

**Existing identifiers are not renamed.** `scp_assessment_families`, `scp_guard_family_product_separation`, `cig_profession_families`, `cig_profession_family_rel`, their migrations, functions and triggers all stay exactly as they are. No migration, no schema rename, no code change follows from this standard.

The standard governs **new** work: new product copy, new frontend, new API surface, new TypeScript types, and any new database object. Where this document set describes existing schema, it uses the existing name and says so.

---

## Relationship to existing documentation

**Supersedes** `Public_Assessment_MVP_v2.1.md` and `public-career-assessment-v1-spec.md` for this product area. The v2.1 instrument remains live and frozen until v3.0 replaces it; its 13 historical runs stay readable and exactly reproducible.

**Inherits without re-litigation** — consistent across every prior layer:

1. *AI explains. Deterministic rules calculate. Humans decide.*
2. No pass/fail, ranking or suitability classification
3. Immutability and versioning as a scientific requirement, not engineering hygiene
4. Preference ≠ competence; confidence ≠ ability
5. Decision support only
6. Self-report is weakest exactly where the stakes are highest
7. The trainable / partially-trainable / largely-fixed trichotomy
8. Honest limitation disclosure as an ethical duty

**Does not cite** the H4.1 Blueprint Engine. It was formally parked by `adr-security-competency-product-separation.md`, so the Assessment DNA and Question Library documents that describe it as "the locked architecture" are citing a dead branch.

**Reuses** the `scp_*` platform merged in PR-A — versioned item bank, per-option scoring keys held separately from labels, language as adaptation objects, publication workflow, two-person principle, validation statuses, content hashing, immutability triggers. Content and constructs stay separate; the machinery is shared.

---

## Open items requiring an owner or specialist decision

| Item | Owner | Blocks |
|---|---|---|
| Narrow `scp_guard_family_product_separation` to content rather than tables | Owner | MVP start — the alternative adds 6–8 weeks |
| Native-speaker review of all Swedish item text | Owner to resource | Every downstream gate |
| SME panel: ≥3 professionals from ≥2 environments | Owner to resource | Item approval |
| Psychometric review of the eight axes and the ipsative trade-off design | Specialist | Moving past `pilot` |
| DPIA + legal/DPO sign-off before any real recruitment use | Legal / DPO | **Beta** — any beta involving real candidates, not only commercial launch |
| Retention durations per data class | Legal / DPO | MVP — the architecture supports any schedule; it does not choose one |
| Data export and deletion **platform-wide** — promised in UI copy today with no implementation | Owner | Career Discovery ships its own at MVP; the wider platform promise remains a pre-existing exposure |
