# Implementation Roadmap v3.0

**Status:** design.

> **How this document relates to the others**
> Everything specified across the set, sequenced. Every item cross-references the document that specifies it.

**The constraint that shapes this document:** CQrityjob is a startup. A blueprint that takes two years to build is a failed blueprint. The discipline is scope, not quality — the MVP must still be exceptional, and it must contain at least three of the WOW moments or it has failed its own thesis.

---

## Prerequisite — an owner decision, not an assumption

Placing Career Discovery on the merged `scp_*` machinery requires narrowing one guard.

**Today:** `scp_guard_family_product_separation` (migration A1 §12) rejects any assessment definition attached to a family whose `product_type` is `career_guidance`. That was deliberate — it prevents the `security-guard-foundation` mistake recurring.

**Needed:** the rule should enforce *separate content, constructs, scoring and reports* — which the foreign-key structure and the CI separation guard already enforce independently — rather than *separate tables*.

**Alternative if declined:** Career Discovery builds parallel tables mirroring the `scp_*` ones. This duplicates the entire authoring, versioning, review and governance machinery for a second product, and is the antipattern the owner has already warned against. Roughly six to eight weeks of avoidable work, and two systems to keep in step forever.

**Recommendation:** narrow the guard. Additive migration, one trigger function, covered by the existing test suite.

---

## Phase map

| | Duration | Ships | Success measure |
|---|---|---|---|
| **MVP** | ~10 weeks | Complete 20-item discovery, DNA, narrative, recommendations, action plan, save | 50 real completions; ≥60% completion rate; qualitative recognition |
| **Beta** | ~4 weeks | Pilot instrumentation, review gates cleared | 200–300 completions; item statistics; no stop-the-line finding |
| **V1** | ~12 weeks | Adaptive, living DNA, reassessment, learning, jobs, "why do you say that?" | Return rate; reassessment uptake; recommendation acceptance |
| **V2** | ~12 weeks | AI-assisted phrasing, richer pathways, employer-side reporting | Narrative quality without traceability loss |
| **Future** | — | Consented enrichment, longitudinal insight, international | Two-sided flywheel operating |

---

## MVP — before beta

**Goal:** a complete, honest, memorable 15-minute discovery that produces genuine self-understanding. No adaptive, no accumulation, no learning or jobs integration.

### Content
- [ ] 20 core items + 3 context, authored — [Question Blueprint](./question-blueprint-v3.0.md)
- [ ] **Native-speaker review of all Swedish** — non-negotiable, blocks everything downstream
- [ ] English adaptation with its own approval status
- [ ] SME review: ≥3 independent professionals, ≥2 environments
- [ ] Bias and accessibility review
- [ ] ~15 profession requirement profiles, authored — [Career Intelligence Mapping §3](./career-intelligence-mapping-v3.0.md)
- [ ] Narrative statement library with licensing rules — [DNA Model §1](./security-career-dna-model-v3.0.md)

### Data
- [ ] Guard narrowed (prerequisite above)
- [ ] Career Discovery family, 8 axes, 4 behavioural signals
- [ ] Items on `scp_items` / `scp_item_versions` / `scp_item_texts` / `scp_item_options`
- [ ] **Evidence Object store, append-only** — the keystone; [Evidence Architecture §2](./evidence-architecture-v3.0.md)
- [ ] Immutable, content-hashed report snapshots
- [ ] Profession profiles as versioned data, not TypeScript

### Engine
- [ ] Evidence → axis aggregation, equal weights, common scale by construction
- [ ] Confidence from coverage + agreement; emerging excluded from matching
- [ ] Context-dependence detection
- [ ] Signals with tolerance bands
- [ ] Fit computation; **rank on fit, confidence reported separately**
- [ ] Deterministic narrative assembly; unlicensed statements not emitted
- [ ] Traceability enforced internally

### Experience
- [ ] Screens S-01 → S-15 — [Information Architecture](./information-architecture-v3.0.md)
- [ ] "Why are we asking this?" on every item
- [ ] Interstitials after items 7 and 14, derived not generic
- [ ] Reflection prompt and the prediction comparison
- [ ] Resume that never loses a run
- [ ] Save preserving the report across authentication
- [ ] Full i18n — zero inline language ternaries
- [ ] WCAG 2.2 AA, verified

### Verification
- [ ] Persona fixtures against **the production path**, in CI (audit F-7)
- [ ] Every axis has exactly 3 loadings — automated
- [ ] No recommendation without a traceable chain — automated
- [ ] No item reused from v2.1 — CI guard, mirroring the existing separation check
- [ ] Snapshot reproducibility

### Legacy
- [ ] `public-career-assessment` retired for new runs; all 13 historical runs readable and reproducible
- [ ] `/security-career-assessment` → `/career-discovery`, permanent
- [ ] `/invite/$token` reuses the same components — one runner, not two

**WOW moments live at MVP:** 1 (real security items) · 2 (interstitials) · 3 (narrative before recommendation) · 4 (honest uncertainty) · 5 (prediction comparison) · 6 (real professions).
**Six of eight.** The MVP is not a stripped skeleton.

### Explicitly not in MVP
Adaptive items · cross-session accumulation · reassessment · learning · jobs · user-facing "why do you say that?" · AI anywhere · norms or benchmarks · employer enrichment.

---

## Beta — validation before commercial claims

- [ ] Pilot instrumentation: item timing, completion, drop-off, declines — [Evidence Architecture §8](./evidence-architecture-v3.0.md)
- [ ] 20–30 cognitive interviews in both languages
- [ ] 200–300 field completions
- [ ] Item statistics: difficulty, discrimination, axis internal consistency
- [ ] Deidentified validation export
- [ ] Fairness screening as sample allows

**Exit gates.** Every item reviewed and piloted · axes show acceptable internal consistency · no stop-the-line finding · completion ≥60% · qualitative evidence of recognition.

**Validation status moves `design` → `pilot`.** It may not move further without specialist review, and no marketing may describe the instrument as validated.

---

## V1 — before commercial launch

**Goal:** the loop closes. A one-time assessment becomes a companion.

- [ ] Adaptive discovery live: triggers, selection, hard cap of 8, sequence recording
- [ ] Adaptive pool A1–A10 authored and reviewed
- [ ] **Living DNA** — cross-session accumulation, recency weighting, per-axis confidence growth
- [ ] Reassessment with before/after comparison
- [ ] **"Why do you say that?"** surfaced to users — the strongest trust mechanism in the product
- [ ] Learning recommendations with honest coverage
- [ ] Jobs integration, gated on real inventory
- [ ] Return journey: what changed since last visit
- [ ] `/my-career` rebuilt on the living DNA
- [ ] Empirical item weights replace authored estimates
- [ ] Profession profiles reviewed; unreviewed profiles excluded from recommendation
- [ ] Data export and deletion — *note: currently promised in UI copy platform-wide with no implementation; a live compliance exposure independent of this work*

**Adds WOW-7** (it kept working while I was away) — seven of eight.

**Exit gates.** Adaptive shortens sessions without reducing confidence · reassessment produces stable results where stability is expected · return rate justifies the investment.

---

## V2

- [ ] AI-assisted narrative phrasing over the same licensed statement set — traceability preserved, human review of the library first
- [ ] Prohibited-language guards
- [ ] Richer career pathways from the graph
- [ ] Employer-side aggregate reporting — **never individual candidate DNA**
- [ ] Ranking items reconsidered, if a UI justifies them

---

## Future

- [ ] **Consented employer enrichment** — [DNA Model §11](./security-career-dna-model-v3.0.md). Explicit, purpose-specific, revocable, one-directional, evidence-level. **Adds WOW-8** — eight of eight
- [ ] Longitudinal insight across a career
- [ ] Conversational interface over the person's own evidence
- [ ] Additional domains — ten of twelve already have a canonical family
- [ ] International markets: new professions, jurisdictions, approved adaptations. **Axes unchanged**
- [ ] Norms and percentiles — only after representative data, per Assessment DNA Doc 09

---

## Sequencing risks

| Risk | Mitigation |
|---|---|
| **Native-speaker review is the critical path** | Start it in week 1, not after authoring completes. Every downstream gate waits on it |
| **SME availability** | ≥3 reviewers from ≥2 environments; identify before authoring finishes |
| **Evidence Object store deferred as "we only have one session"** | Non-negotiable at MVP. Retrofitting it later means rebuilding the engine and starting history at zero |
| **Adaptive pulled forward into MVP** | Resist. It needs pilot depth to select well, and a badly-selected adaptive item is worse than none |
| **Profession profiles authored but unreviewed** | The exact failure the audit found — 0 of 16 current profiles are reviewed. Gate them out at V1 |
| **Guard-narrowing declined late** | Decide before MVP week 1; the alternative changes the estimate by 6–8 weeks |

---

## What this roadmap refuses

- **No "MVP" that is a stripped skeleton.** Six of eight WOW moments ship at MVP or the thesis is unproven.
- **No adaptive before pilot data.** Selection without discrimination estimates is guessing with extra steps.
- **No AI before the deterministic chain is complete and traced.**
- **No validated claim before the gates.** `design` → `pilot` → `operational-development` are earned, never asserted.
- **No item administered before its review gates.** The prior documentation predicted lifecycle bypass under delivery pressure as its most realistic risk, and it happened within a week. This roadmap treats the gates as scope, not overhead.
