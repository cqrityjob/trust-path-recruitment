# Security Career DNA — model v3.0

**Status:** design. No content authored, no implementation.
**Validation status:** `design` — nothing in this model may be described as validated.

> **How this document relates to the others**
> This defines the **constructs**. [Evidence Architecture](./evidence-architecture-v3.0.md) defines how evidence reaches them; [Question Blueprint](./question-blueprint-v3.0.md) defines the items that produce it; [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) defines what is done with the result. The decision to create a new construct set rather than reuse an existing one is recorded in the [ADR](../../architecture/adr-career-discovery-construct-model.md).

---

## 1. What the Career DNA is

A **living, evidence-backed description of how a person tends to orient toward work in the security profession** — maintained over time, owned by the person, and used to explain where they are likely to thrive.

It is the platform's core asset. Not because it is clever, but because it compounds: every honest answer makes it more useful, and it is the only thing on the platform that gets better the longer someone stays.

### What it is not

| Not | Because |
|---|---|
| A personality type | Types are identity claims. This describes tendencies in specific situations, and says so every time it speaks. |
| A competence score | Competence is the employer product (SCC-01…12). Orientation and capability are different questions. |
| A prediction of performance | It reduces uncertainty about fit. It does not forecast outcomes, and must never imply it does. |
| A permanent record | It evolves. A two-year-old profile is described as two years old, not as current truth. |
| Something an employer can see | Structurally impossible. See §11. |

### The one-sentence test

Every element must survive: *"Does this help this person understand where they would thrive, in a way they could check against their own experience?"* If it fails, it does not belong in the DNA.

---

## 2. Structure

Two layers, deliberately separated, because conflating them is what broke the previous model.

```
Career DNA
├── Orientation Axes  (CDA-01 … CDA-08)   → drive matching
└── Behavioural Signals (BS-1 … BS-4)     → drive language, never matching
```

**Orientation axes** answer *what kind of work fits*. Self-report is legitimate evidence here — people genuinely know what they are drawn to, and Assessment DNA Doc 04 says so explicitly.

**Behavioural signals** answer *what tends to happen when*. Scenario and frequency evidence only. They shape how the report talks about development and readiness. They **never** enter the matching computation, never gate, never rank, never exclude.

---

## 3. The eight Orientation Axes

Each axis is **bipolar** — both ends are legitimate professional orientations, and neither is better. This is not a scale from worse to better. It is a scale from one kind of security work to another.

The axes were derived by asking what actually differentiates a person's fit across the 14 canonical Security Career Areas already in the Career Intelligence Graph. An axis that does not separate at least three areas from at least three others was cut.

---

### CDA-01 · Field Presence
**`Fältnärvaro`**

| | |
|---|---|
| **Low end** | Works with information *about* situations — remote, after the fact, or in advance |
| **High end** | Works where the situation is — physically present, in the environment, as it happens |
| **Why it exists** | The most fundamental division in security work. It separates protective operations from analysis, intelligence and governance more cleanly than any other single question. |
| **Differentiates** | `protective_operations`, `public_safety_justice`, `corrections_secure_transport` ↔ `risk_management`, `cyber_information_security`, `financial_crime_compliance` |
| **Evidence** | 3 items minimum. Mixed: preference + trade-off. |
| **Never means** | That one end is more "real" security work. The report must never imply a hierarchy. |

### CDA-02 · People Interface
**`Människokontakt`**

| | |
|---|---|
| **Low end** | Prefers work where human interaction is incidental to the task |
| **High end** | Prefers work where meeting people — including difficult encounters — is the substance of the job |
| **Why it exists** | Separates roles that look similar on paper but feel completely different in practice. Ordningsvakt and SOC analyst can share a risk orientation and share almost nothing else. |
| **Differentiates** | `public_safety_justice`, `protective_operations` ↔ `cyber_information_security`, `security_technology` |
| **Evidence** | 3 items. Must include at least one scenario item — stated comfort with conflict is unreliable in the abstract. |
| **Never means** | Sociability. A person can be highly people-oriented at work and private otherwise; the axis is about the work. |

### CDA-03 · Procedural Structure
**`Struktur och rutin`**

| | |
|---|---|
| **Low end** | Prefers to define the method — ambiguity is workable, procedure is a starting point |
| **High end** | Prefers defined procedure, clear standards and a knowable right answer |
| **Why it exists** | Security has both extremes, and misplacing someone on this axis produces reliable unhappiness. Skyddsvakt work rewards procedural fidelity; risk consulting rewards constructing method where none exists. |
| **Differentiates** | `corrections_secure_transport`, `critical_infrastructure_security` ↔ `risk_management`, `security_leadership_governance` |
| **Evidence** | 3 items. |
| **Never means** | Rigidity or creativity. Both ends include excellent professionals. Report language must not moralise. |

### CDA-04 · Acute Tempo
**`Tempo och akut press`**

| | |
|---|---|
| **Low end** | Prefers sustained, planned, deliberate work with long time horizons |
| **High end** | Prefers acute, unpredictable, time-critical work |
| **Why it exists** | Distinguishes crisis management from continuity planning, and incident response from architecture — areas that share subject matter and differ entirely in rhythm. |
| **Differentiates** | `crisis_management`, `public_safety_justice` ↔ `business_continuity_resilience`, `risk_management` |
| **Evidence** | 3 items. |
| **Never means** | Stress tolerance. Preferring calm work is not a weakness, and this axis must never be read as resilience. |

### CDA-05 · Systems & Technology
**`Teknik och system`**

| | |
|---|---|
| **Low end** | Technology is a tool used in the work |
| **High end** | Technology and systems are the object of the work |
| **Why it exists** | The fastest-growing part of the profession, and the one candidates most often do not know is open to them. |
| **Differentiates** | `security_technology`, `cyber_information_security` ↔ `protective_operations`, `public_safety_justice` |
| **Evidence** | 3 items. **Must not assume prior technical exposure** — the item set has to be answerable by someone who has never worked in tech, or it measures background instead of orientation. |
| **Never means** | Technical skill. This measures pull, not capability. |

### CDA-06 · Investigative Depth
**`Utredning och mönster`**

| | |
|---|---|
| **Low end** | Prefers to resolve the situation in front of them and move on |
| **High end** | Drawn to reconstructing what happened, following threads, finding the pattern |
| **Why it exists** | Investigative work is a genuine vocation that the current product cannot detect at all — `investigation_orientation` has one item, and it is a checkbox. |
| **Differentiates** | `investigations_intelligence`, `financial_crime_compliance` ↔ `protective_operations`, `security_technology` |
| **Evidence** | 3 items, at least one scenario. |
| **Never means** | Curiosity or intelligence. |

### CDA-07 · Responsibility for Others
**`Ansvar för andra`**

| | |
|---|---|
| **Low end** | Prefers ownership of their own work and outcomes |
| **High end** | Drawn to accountability for other people's work, decisions and development |
| **Why it exists** | Being responsible for others is a *different job*, not a promotion. Many excellent practitioners do not want it, and a career product that treats leadership as the default upward path fails them. |
| **Differentiates** | `security_leadership_governance` ↔ every individual-contributor area |
| **Evidence** | 3 items. Must distinguish wanting *influence* from wanting *accountability* — they are commonly conflated and lead to different roles. |
| **Never means** | Ambition. Declining responsibility for others is a legitimate, permanent, respectable choice. |

### CDA-08 · Organisational Scope
**`Organisatorisk räckvidd`**

| | |
|---|---|
| **Low end** | The incident, the shift, the site — concrete and immediate |
| **High end** | The organisation, the system, the policy — abstract and long-range |
| **Why it exists** | Separates väktare from säkerhetschef, and SOC analyst from CISO. Distinct from CDA-07: one can want organisation-wide scope without wanting to manage anyone, and vice versa. |
| **Differentiates** | `security_leadership_governance`, `risk_management` ↔ `protective_operations`, `corrections_secure_transport` |
| **Evidence** | 3 items. |
| **Never means** | Seniority or sophistication. |

### Why eight

Six could not separate the 14 areas — investigative and technical orientations collapse into "analytical", losing two distinct career directions. Twelve produced axes that no item could cleanly distinguish, and Assessment DNA Doc 11 §4 already flags for its own twelve the risk that they are *"overlapping restatements of a smaller true factor structure."* Eight is the smallest set where every axis separates at least three areas from at least three others and can be evidenced by three items inside the session budget. `[MVP]`

---

## 4. The four Behavioural Signals

These produce **development notes and narrative texture**. They never touch matching.

| | Signal | What it observes | Report use |
|---|---|---|---|
| **BS-1** | Procedural follow-through | What tends to happen when a defined task is unobserved and inconvenient | Frames how a structured environment might feel |
| **BS-2** | Escalation judgement | When someone involves another person versus resolving alone | Frames autonomy and lone-working discussion |
| **BS-3** | Composure under provocation | Behaviour when an interaction turns difficult | Frames public-facing role discussion |
| **BS-4** | Learning response | What happens after feedback or a mistake | Frames the development plan's realism |

**Constraints.** Scenario or behaviour-frequency evidence only — never self-rating. Reported only as *"in the situations we showed you, you tended to…"*, never as a trait. Never scored 0–100 and never displayed as a bar. **Structurally excluded from matching** — a signal cannot gate, rank, boost or exclude a recommendation. `[MVP]`

---

## 5. The scale, and why it is comparable

Finding F-2 in the audit: the previous model's dimensions had theoretical spans from 2 to 21, all normalised to 0–100 and then compared directly. A "70" meant something different on every axis.

**v3.0 fixes this by design symmetry rather than by statistics.**

Every axis is evidenced by exactly **three items**, each contributing exactly the same possible range. Spans are therefore **identical by construction**, and no normalisation is needed. This matters because the honest alternative — standardising against a reference sample — requires a reference sample that does not exist and will not exist until after pilot.

```
axis_position = Σ(item_contribution) / Σ(max_possible_contribution)   → 0.0 … 1.0
```

Displayed as a **position between two named ends**, never as a score out of 100:

> Field Presence — closer to *works where the situation is*

Not:

> Field Presence: 78/100

The second invites comparison against other people and implies precision the model does not have. `[MVP]`

**Post-pilot `[V1]`:** empirical item difficulty and discrimination replace the equal-weight assumption. The scale stays comparable because the *design* keeps it comparable, not because the numbers happen to line up.

---

## 6. Evidence accumulation

The DNA is computed from the **Evidence Store** — the append-only record of every Evidence Object the person has produced. See [Evidence Architecture](./evidence-architecture-v3.0.md) §2.

```
Evidence Objects  ──►  per-axis aggregation  ──►  axis position + confidence
       │
       └── never overwritten, never deleted on reassessment
```

Three rules:

1. **Append, never replace.** A reassessment adds evidence; it does not erase the first run. A person who answers differently a year later has *two* observations, and the change is itself information.
2. **Recency weighting `[V1]`.** Evidence older than 24 months carries reduced weight, because Assessment DNA Doc 01 §5 is right that results decay. Weight decays; the evidence is never discarded.
3. **Provenance is preserved.** Every Evidence Object knows which run, which item version, which context and under which consent it was produced. Without this, enrichment (§10) and consent revocation are impossible.

---

## 7. Confidence and uncertainty

**Every axis carries a confidence level, and confidence is displayed as prominently as position.** An axis the platform is unsure about must look unsure.

Confidence is computed from two things, both available without pilot data:

| Input | Meaning |
|---|---|
| **Coverage** | How many of the axis's items have been answered |
| **Agreement** | How consistently those items point the same direction |

| Level | Condition | How it is shown |
|---|---|---|
| **Emerging** | Fewer than 3 items, or strong disagreement | *"We have an early read on this — not enough to lean on yet."* Excluded from matching. |
| **Established** | All 3 items, broad agreement | Position shown normally, used in matching. |
| **Strong** | ≥5 items across ≥2 sessions, consistent | *"Consistent across two occasions."* Slightly higher matching weight. |

**Emerging axes are excluded from matching rather than included at low weight.** A weak signal that shifts a recommendation is worse than an absent one, because the user cannot tell it happened. `[MVP]`

### Uncertainty is a feature, not an apology

The report says what it does not know, names the axis, and offers the shortest path to resolving it:

> We don't yet have a clear read on how you feel about responsibility for other people's work. Three more questions would tell us — and it changes which of these two directions fits better.

This is a **WOW moment**, not a limitation. See [Experience](./security-career-discovery-experience.md) §1.

---

## 8. Conflicting evidence

When items on one axis disagree, the previous model averaged them into a meaningless midpoint. That destroys the most interesting thing the data contains.

**v3.0 treats a genuine conflict as a finding.** If a person's items on one axis point in opposite directions with sufficient separation, the axis is marked **context-dependent** rather than resolved to a middle value.

> Your answers suggest this depends on the situation for you — you leaned toward defined procedure when the stakes were high, and toward your own judgement when they were routine. That is a real pattern, and it matters for which environments suit you.

Handling:

- Marked `context_dependent`, not averaged
- The report **names the conflict** and describes both conditions
- Matching treats it as *compatible with both ends*, not as a midpoint — a genuinely flexible person fits more roles, not fewer
- Adaptive discovery may target it `[V1]`: one well-chosen follow-up often resolves whether it is context-dependence or measurement noise

A conflict appearing in the *same pattern across many people* is a construction defect in the item, not a finding about them — routed to content review, per Question Library Doc 02. `[V1]`

---

## 9. Missing evidence

Three distinct states, never conflated. This is the direct fix for audit findings F-3 and F-4.

| State | Meaning | Treatment |
|---|---|---|
| **Unobserved** | Never asked | Axis has no position. Excluded from matching. Named in the report as not yet explored. |
| **Declined** | Asked, skipped | Same as unobserved for scoring — but recorded distinctly, because a pattern of declines is a UX signal about the item. |
| **Neutral** | Asked, answered mid-range | A **real observation**. The person sits between the ends. This is a position, not an absence. |

The previous engine collapsed neutral into unobserved (`matching-engine.ts:174`), so "I considered this and I'm genuinely in the middle" and "you never asked" produced the same result. They are opposite states and now behave that way.

**Missing evidence is penalised once, not four times.** Coverage lowers confidence. That is the entire mechanism. It does not additionally lower position, trigger a separate penalty, or cap the display. `[MVP]`

---

## 10. A living profile — with immutable snapshots

The tension: the DNA must keep growing, and a report issued last March must still say exactly what it said last March.

**Resolution:** the DNA state is computed; every report snapshots it.

```
Evidence Store  ──►  DNA state (computed, evolving)
                          │
                          └──►  Report snapshot (immutable, versioned)
                                 - DNA state at that moment
                                 - the exact evidence set used
                                 - model + scoring + narrative version
                                 - content hash
```

A snapshot is never recomputed. The living state is never frozen. Both are true at once, which is what lets the product show change over time honestly:

> When you last did this in March, we weren't sure about your orientation to acute work. We are now — and it moved. Here's what changed and why.

`[MVP]` snapshot mechanism + single-session DNA. `[V1]` accumulation across sessions, reassessment, change-over-time views.

---

## 11. Enrichment from employer assessments `[Future]`

The most valuable long-term property of the platform: a candidate who takes an employer's assessment can have that evidence **strengthen their own career profile**. The ecosystem pays the candidate back for work they already did.

It is also the most dangerous, so the constraints are absolute.

| Rule | |
|---|---|
| **Consent is explicit, purpose-specific and revocable** | Never bundled into terms. Asked at the moment the evidence exists, in plain language, with the benefit stated. |
| **One-directional** | Employer evidence → candidate DNA. **Candidate DNA never flows to an employer.** Not aggregated, not derived, not inferred, not "anonymised". |
| **Evidence-level, never score-level** | An SCC competency score is never imported as a career axis. Only an *item* that has been reviewed and tagged as loading on a career axis contributes, and only its own evidence. |
| **Revocation is real** | Withdrawing consent removes the enriched Evidence Objects and recomputes the DNA. Snapshots already issued are unaffected — they are historical records, and rewriting history is not privacy. |
| **Visible provenance** | The person can always see which evidence came from where, and remove it. |

The construct separation in the [ADR](../../architecture/adr-career-discovery-construct-model.md) is what makes this safe: because career axes and competence constructs are different vocabularies, enrichment cannot silently turn an employer's competence measurement into a career claim.

---

## 11b. Export, deletion and withdrawal

The DNA belongs to the person, which has three concrete consequences — all `[MVP]`, all before public release. Full lifecycle in [Master Blueprint ch 10](./master-product-blueprint-v3.0.md).

**Export.** Everything: axis positions, confidence, every contributing Evidence Object with its provenance, every report snapshot, reflection text, consent history. Machine-readable, self-service, no request process.

**Deletion.** One action removes all of it, snapshots included. **Immutability protects a snapshot from modification, never from erasure by the person whose data it is.** Confusing those two would turn an integrity guarantee into a data-protection failure.

**Withdrawal and recomputation.** Withdrawing a consent removes the Evidence Objects it permitted and recomputes the DNA from what remains. An axis may drop to lower confidence; a recommendation may move. The person is told plainly rather than shielded from it. Snapshots issued earlier are not retroactively rewritten — they record what someone was actually shown — but they remain deletable like everything else.

---

## 12. What the DNA must never do

Binding on every consumer — report, recommendation engine, AI layer, employer product, future agent.

1. **Never assign a type, label or category to a person.** No "you are an Operator". Positions on axes, always.
2. **Never present an axis position as a capability.**
3. **Never show a number without its confidence.**
4. **Never imply an end of an axis is better.**
5. **Never let a behavioural signal affect matching.**
6. **Never expose a candidate's DNA to an employer.**
7. **Never claim stability the evidence does not support** — one session is one session, and the report says so.
8. **Never compare a person to other people** until approved norm data exists, which it does not.
9. **Never make the DNA the reason to refuse someone anything.** It is a discovery instrument, not a filter.

---

## 13. Data model sketch

Not an implementation, but the shape must be settled so the [Evidence Architecture](./evidence-architecture-v3.0.md) and the [Roadmap](./implementation-roadmap-v3.0.md) agree.

| Concept | Home | Notes |
|---|---|---|
| Axis definitions | `scp_competencies`-equivalent, own SCP assessment family | Versioned, per the ADR's separate-content rule. *"Assessment family" here is the internal SCP governance concept, not the candidate-facing Security Career Area* |
| Items, options, scoring keys | `scp_items` / `scp_item_versions` / `scp_item_options` / `scp_item_texts` | Reuses PR-A machinery unchanged |
| Evidence Objects | **new**, append-only | The keystone. See Evidence Architecture §2 |
| DNA state | Computed, cached | Never the source of truth |
| Report snapshots | **new**, immutable | Content-hashed like every other published artefact |
| Consent records | Existing `consent_records`, extended | Purpose-specific, revocable |

**Prerequisite.** Placing Career Discovery on the `scp_*` machinery requires narrowing `scp_guard_family_product_separation` (migration A1 §12) from "separate tables" to "separate content, constructs, scoring and reports" — which the foreign-key structure and CI separation guard already enforce independently. Flagged in the [Roadmap](./implementation-roadmap-v3.0.md) as an owner decision, not assumed here.
