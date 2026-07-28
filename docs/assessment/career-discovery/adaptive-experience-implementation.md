# Adaptive Candidate Experience — Implementation Status

**Status:** Phase 1 implemented · **Validation status: `design`** · **NOT administrable to real candidates**

> ## ⚠ Nothing in this instrument may be put in front of a real candidate.
>
> The version ships with `lifecycle_status = 'design'` and **all seven content review gates outstanding**. This is enforced, not merely stated: `cd_guard_session_requires_administrable_version()` refuses to create a session unless the status is `pilot` or `active` **and** every gate is `true`. It is a trigger, so the refusal also applies to `service_role` and any other `BYPASSRLS` caller.
>
> All Swedish text is an AI-authored first draft. The English is an authored adaptation, not a runtime translation. **No item has been reviewed by anyone.**

> **How this document relates to the others**
> [Question Blueprint](./question-blueprint-v3.0.md) is the instrument's core content. [DNA Model](./security-career-dna-model-v3.0.md) defines the axes. [Evidence Architecture](./evidence-architecture-v3.0.md) defines what happens to answers. [ADR: adaptive experience](../../architecture/adr-career-discovery-adaptive-experience.md) records why the adaptive layer is framing-only. This document records **what is actually built**.

---

## 1. The 70/30 design principle

The session is roughly **70% shared measurement and 30% personal framing**, by item count and by time:

| | Items | Share | Scored |
|---|---|---|---|
| Shared core (identical for everyone) | 20 | **77%** | Yes |
| Personal layer (context + adaptive) | 6 | 23% | No |

The ratio is deliberate and it points one way. Personalisation exists to make the session feel like it is about *this* person; it never buys that feeling with comparability. **Every candidate answers the same 20 core items, in the same wording, in the same order, regardless of path.**

This inverts the live v2.1 instrument, where the context answer selects which 8 of 16 questions a person receives — so two people sit different instruments and their results cannot be compared (audit finding F-1).

---

## 2. The shared 20-item core

Authored in [`src/lib/career-discovery/core-items.ts`](../../../src/lib/career-discovery/core-items.ts), transcribed from [Question Blueprint §3–§5](./question-blueprint-v3.0.md).

| Block | Items | Loads |
|---|---|---|
| Single-axis | S1–S8 | one orientation axis each |
| Trade-off | T1–T8 | two axes each, inversely within the item |
| Behavioural | B1–B4 | one behavioural signal each — **never an axis** |

Axis coverage is exactly 3 independent loadings per axis, 24 total. The guard script fails if any axis drops below the floor.

**Known limitation, unchanged:** trade-off items are partly ipsative — they measure relative pull, not absolute level. Each axis is anchored by one non-ipsative single-axis item so absolute level remains recoverable. Flagged for psychometric review.

---

## 3. The five Discovery sections

Sections are a **presentation grouping**. Nothing in scoring reads them, and no internal axis identifier (`CDA-01`, `BS-1`) appears in any candidate-facing string — the guard script asserts this.

| # | Section | Core items | Adaptive slot |
|---|---|---|---|
| 1 | Hur du tar dig an situationer · *How you approach situations* | S1, S5, T1 | ✅ |
| 2 | Hur du arbetar med andra · *How you work with others* | S2, T2, T6, B3 | ✅ |
| 3 | Hur du fattar beslut · *How you make decisions* | S4, S6, T3, T7, B2 | — |
| 4 | Hur du hanterar ansvar · *How you handle responsibility* | S3, S7, T4, B1 | ✅ |
| 5 | Hur du vill utvecklas · *How you want to develop* | S8, T5, T8, B4 | ✅ |

Each item went to the section whose candidate-facing description best matches what it actually asks. **No item's scoring or axis loading was changed to make it fit**, and axis coverage is preserved exactly:

| Axis | Items | | Axis | Items |
|---|---|---|---|---|
| CDA-01 Field Presence | S1·D1, T1·D1, T5·D5 | | CDA-05 Systems & Technology | S5·D1, T1·D1, T8·D5 |
| CDA-02 People Interface | S2·D2, T2·D2, T6·D2 | | CDA-06 Investigative Depth | S6·D3, T2·D2, T7·D3 |
| CDA-03 Procedural Structure | S3·D4, T3·D3, T6·D2 | | CDA-07 Responsibility for Others | S7·D4, T4·D4, T8·D5 |
| CDA-04 Acute Tempo | S4·D3, T3·D3, T7·D3 | | CDA-08 Organisational Scope | S8·D5, T4·D4, T5·D5 |

Four transition screens sit between the five sections. They are **section properties, not items** — they have no item id and therefore cannot produce an evidence record.

---

## 4. The five adaptive paths

The path is resolved from Context Question 1 **only**, once, at session creation, and is then immutable.

| C1 answer (`context_status`) | Path | Items |
|---|---|---|
| `exploring_security` | A | `ADAPT_EXPLORE_01` … `_04` |
| `working_in_security` | B | `ADAPT_WORKING_01` … `_04` |
| `developing_current_role` | C | `ADAPT_DEVELOP_01` … `_04` |
| `changing_career_area` | D | `ADAPT_CHANGE_01` … `_04` |
| `security_leader` | E | `ADAPT_LEADER_01` … `_04` |

Four of the 20-item bank are administered per session, slotted into Discovery 1, 2, 4 and 5.

**Context Question 2 (`discovery_goal`) never affects the path.** `assembleSession()` takes one argument, so C2 has no way to reach path selection — the guard script asserts the function's arity, and the database freezes `adaptive_path` and `context_status` against any later change.

---

## 5. Scoring evidence versus contextual evidence

The single most important distinction in this implementation.

| Evidence class | Produced by | Scored | May influence |
|---|---|---|---|
| `orientation_self_report` | S1–S8, T1–T8 | ✅ | DNA axes, area ranking, confidence, coverage |
| `behavioural_signal` | B1–B4 | ✅ (signals only) | development notes, narrative framing — **never matching** |
| `contextual_self_report` | C1, C2, all adaptive | ❌ | report wording, learning, next steps, examples, guidance |

Contextual evidence **must not** influence Security Career DNA, Security Career Area ranking, report-generation inputs, the recommendation engine, candidate scoring, confidence, or coverage.

The boundary is enforced in three independent places:

1. **Types** — adaptive and context items carry no axis loadings; `isScoredItem()` derives from the evidence class.
2. **Database** — `cd_guard_evidence_scoring_boundary()` derives `is_scored` rather than trusting the caller, and rejects an adaptive or context answer submitted under a scoring class. A trigger, so it holds for `BYPASSRLS` callers.
3. **Tests** — `career-discovery:check` and the SQL suite both fail if any of it is weakened. Both were negative-tested.

**Adaptive answers are never required inputs.** A result generates from the 20 core items alone; `cd_guard_snapshot_requires_core_complete()` counts scored evidence, requires exactly 20, and does not consider adaptive answers at all.

---

## 6. Report-framing rules

Framing inputs are `context_status`, `discovery_goal` and the contextual report tags. They change **how** the result is said, never **what** it says.

| `context_status` | The report leads with |
|---|---|
| `exploring_security` | industry overview · entry routes · realistic first steps · transferable strengths · roles that need no prior security experience, where factually correct |
| `working_in_security` | recognised strengths · current-role alignment · specialisation options · adjacent areas · practical development |
| `developing_current_role` | strongest current contribution · development gaps · next-responsibility options · a 12–24 month horizon |
| `changing_career_area` | transferable strengths · adjacent and larger moves · likely skill gaps · low-risk ways to explore. **Never suggests leaving employment without proper consideration.** |
| `security_leader` | leadership orientation · organisational scope · operational vs strategic contribution · capability building. **Never presented as an objective leadership-performance evaluation.** |

**Permitted language:** *stämmer väl överens med* · *kan vara relevant att utforska* · *din profil delar flera drag med* · *ett möjligt nästa steg*.

**Forbidden language:** you are suitable · you are unsuitable · approved · failed · guaranteed match · ideal candidate · should be hired. The first result screen must never open with *"You are best suited for…"*.

Report generation itself is **Phase 3** — these rules are recorded now so the framing layer is built against them rather than retrofitted.

---

## 7. Implementation status

### Built — Phase 1

- [x] Versioned definition `security-career-discovery-v3` (`2026-scd-v3.0.0`), registered in the Assessment Catalog with `employer_visible = false`
- [x] Version lifecycle record with definition/content/scoring/taxonomy versions, status, locale availability, created date and review status
- [x] Two owner-locked context questions, bilingual, with stable values
- [x] All 20 core items, bilingual, with axis loadings
- [x] All 20 adaptive items across 5 paths, bilingual, with contextual report tags
- [x] Five Discovery sections, four transitions, preparation screen — all bilingual
- [x] Session assembly, path resolution, progress model, completion rules
- [x] Persistence: `cd_definition_versions`, `cd_sessions` (anonymous-capable), `cd_evidence`, `cd_report_snapshots`
- [x] Six database guards, all triggers so they hold for `BYPASSRLS` callers
- [x] RLS on all four tables, owner-scoped, fail-closed
- [x] 47 SQL assertions + a deterministic guard script, both negative-tested, both in CI

### Not built — deliberately out of Phase 1

- [ ] **Security Career DNA computation** — Phase 3
- [ ] **Security Career Area ranking** — Phase 3
- [ ] **Report generation** — Phase 3
- [ ] **Candidate UI**, transitions, progress display, accessibility — Phase 2
- [ ] `careerDiscovery.*` i18n chrome keys — Phase 2, deliberately deferred (see §8)
- [ ] Server functions for the anonymous session flow — Phase 2

Until Phase 3 lands, **this definition cannot produce a report**. That is a further reason it is not administrable, independent of the review gates.

---

## 8. Deviations from the directive, and why

**i18n chrome keys deferred to Phase 2.** The directive suggests a `careerDiscovery.*` namespace. Phase 1 builds no UI, so adding those keys now would create orphaned dictionary entries — the exact defect audit finding F-9 records, where ~120 of 182 `sca.*` keys are orphaned. All *instrument* content is bilingual today inside the versioned module, which is where it must live to be versioned and content-hashed; i18n dictionaries are not versioned. The guard script asserts sv/en parity on every string, and additionally fails if the two are identical, which would indicate an untranslated copy.

**Anonymous sessions have no direct table access.** `cd_sessions` supports an anonymous run via `anon_session_token`, but no policy is granted to the `anon` role — an anonymous session is reachable only through a server function holding the token, matching the existing `save_career_report` pattern. The SQL suite proves `anon` is refused outright rather than merely filtered to zero rows.

**Blueprint C1–C3 superseded.** The owner's two locked context questions replace the blueprint's three-question draft in full. Nothing is migrated; the draft was never administered. The tenure signal that is lost is recorded in the [ADR §5](../../architecture/adr-career-discovery-adaptive-experience.md).

---

## 9. Validation status

`design`. Advances to `pilot` only after gates 1–5 and a cognitive pilot; further only on documented evidence.

| # | Gate | Status |
|---|---|---|
| 0 | Content review | ☐ not started |
| 1 | SME review — ≥3 professionals from ≥2 environments | ☐ not started |
| 2 | Language review — native Swedish; English as an adaptation | ☐ not started |
| 3 | Accessibility review | ☐ not started |
| 4 | Bias review | ☐ not started |
| 5 | Privacy / legal review — GDPR, DPIA, lawful basis, consent | ☐ not started |
| 6 | Psychometric review — construct validity, ipsative design | ☐ not started |

**The adaptive items are not validated psychometric measures and are not described as such anywhere in this implementation.** They are contextual self-report used for framing.

Promoting `LIFECYCLE_STATUS` in TypeScript is not sufficient to activate the version — the database row governs, and the guard requires every gate cleared as well as an administrable status.
