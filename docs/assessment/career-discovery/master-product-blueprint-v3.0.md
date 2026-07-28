# Security Career Discovery v3.0 — Master Product Blueprint

**Status:** design. No implementation. **Validation status: `design`** — nothing here may be described as validated.
**Supersedes for this product area:** `Public_Assessment_MVP_v2.1.md`, `public-career-assessment-v1-spec.md`.

> ## ⚠ The architecture is approved. The authored content is NOT approved for production.
>
> **Approved in principle:** architecture, construct model, the eight axes, the evidence pipeline, the experience design, the roadmap.
>
> **NOT approved:** every question, option, scale and narrative statement. All authored draft; all Swedish an AI-authored first draft; nothing reviewed by anyone.
>
> **No question may be administered to any real candidate until all six gates are cleared:** SME review · language review · accessibility review · bias review · privacy/legal review · psychometric review.
>
> Validation status is `design`. Nothing here may be described to a candidate, employer, partner or investor as validated.

> **How this document relates to the others**
> The technical spine. Peer to [the Experience blueprint](./security-career-discovery-experience.md), which carries the emotional and commercial case. Detail lives in the seven companion documents indexed in the [README](./README.md).

---

## Chapter 1 · Product Philosophy

### Why this product exists

Someone considering a career in Swedish security cannot currently find out where they would fit. The profession contains at least fourteen distinct Security Career Areas — from protective operations to financial-crime compliance to security technology — and almost none of them are visible from outside. People enter through whichever door they happened to find, and discover the mismatch years later.

The platform's job is to make the profession legible to one person at a time, using evidence about how they actually work rather than assertions about who they are.

### How this differs from a career test

| Traditional career test | This |
|---|---|
| Asks *who are you?* | Asks *where would you thrive, and why?* |
| Produces a type or label | Produces positions on axes, with confidence, with evidence |
| The report is the product | The report is stage 9 of 17 |
| Confident about everything | Explicit about what it does not know |
| Measures the person for someone else | Reduces the person's own uncertainty |
| A one-time verdict | A profile that grows |

### Why it must feel like discovery, not testing

Evaluative threat corrupts the evidence. A person who believes they are being judged answers as they think they *should*, which destroys exactly the honesty the instrument depends on. Removing that threat is not a kindness — it is a measurement requirement.

So: no right answers, no score, no pass, no comparison to others, and the words are chosen accordingly throughout.

### Design principles

1. **Evidence before conclusion.** Nothing is claimed that cannot be traced to something the person did.
2. **Explain before recommend.** The narrative precedes the recommendation. Being understood earns the right to advise.
3. **Uncertainty is information.** Named specifically, with what would resolve it.
4. **Silence over hedging.** An unsupported statement is not emitted. It is not softened.
5. **Preference is not competence.** Two different questions, two different construct sets, never conflated.
6. **The person owns it.** Portable, exportable, deletable, never visible to an employer.
7. **Nothing unbuilt is shown.** Every claim must be true at render time.
8. **Motivation from value, never manipulation.** A mechanic that trades evidence quality for engagement is rejected.

### User psychology

Four things are true of almost everyone arriving here, and the design answers each:

- **They are braced for judgement.** → The welcome screen removes it before item one.
- **They cannot name five security professions.** → The profession map precedes the recommendation.
- **They half-suspect an answer already.** → The Reflection prompt captures it, unscored, and compares it later.
- **They will not finish if nothing comes back.** → Interstitials deliver value mid-flow.

### Trust and explainability

Trust is mechanism, not tone. Six questions are answered where they arise — *why are you asking · what happens to my answer · how sure are you · what do you know · what don't you know · why did you say that* — and each has a specified affordance. Full treatment in [Experience §2](./security-career-discovery-experience.md).

Explainability is a **hard architectural contract**, not a feature: every claim resolves to Evidence Objects within three hops, and a claim that cannot is withheld. See [Evidence Architecture §7](./evidence-architecture-v3.0.md).

---

## Chapter 2 · Product Experience Architecture

Seventeen stages. Stages 1–15 are one sitting of 12–17 minutes; 16–17 are the rest of the relationship, and are where value accrues.

| # | Stage | Sees | Feels | Platform does | Why | Phase |
|---|---|---|---|---|---|---|
| 1 | Landing | Proposition, honest time, four trust points | *"Worth 15 minutes"* | Nothing | Honest cost raises completion | `[MVP]` |
| 2 | Welcome | Not a test, no right answers | Relief | Opens session + Evidence Store | Evaluative threat corrupts evidence | `[MVP]` |
| 3 | Expectations | Data handling, in plain language | *"They told me before I asked"* | Records notice version | Trust is built before collection, not after | `[MVP]` |
| 4 | Career Context | 2–3 light questions | *"This is about me"* | Sets voice and horizon | Tailors language, **never measurement** | `[MVP]` |
| 5 | Discovery | 20 items, one per screen | Momentum, then curiosity | Writes Evidence Objects | The evidence base | `[MVP]` |
| 6 | Adaptive Discovery | 0–8 further items | Attended to | Resolves consequential uncertainty | Only asks what matters | `[V1]` |
| 7 | Reflection | One optional unscored prompt | Anticipation | Stores verbatim, scores nothing | Enables the comparison in stage 9 | `[MVP]` |
| 8 | Career DNA | 8 axes with confidence | *"That's me"* | Computes and snapshots | Explain before recommend | `[MVP]` |
| 9 | Career Narrative | 4–6 paragraphs | **The moment** | Assembles licensed statements | The product's central claim | `[MVP]` |
| 10 | Career Intelligence | The profession, mapped | Oriented | Area-level fit | Makes recommendations legible | `[MVP]` |
| 11 | Recommendations | 3–5 named professions | *"I could look into that"* | Ranks on fit, reports confidence separately | The practical payload | `[MVP]` |
| 12 | Action Plan | Three horizons | *"I know what to do Monday"* | Tailors by context | Insight without action fails | `[MVP]` |
| 13 | Learning | Routes tied to gaps | Direction becomes route | Reads CIG, states coverage honestly | Closes the development loop | `[V1]` |
| 14 | Jobs | Openings, pre-explained | Route becomes opportunity | Matches on Security Career Area and profession | Closes the commercial loop | `[V1]` |
| 15 | Save | Offer **after** full value | A fair trade | Migrates evidence to account | Value first, always | `[MVP]` |
| 16 | Return | What changed since last time | *"It kept working"* | Recomputes, diffs | One-time test → companion | `[V1]` |
| 17 | Reassessment | Shorter; then before/after | Growth made visible | Appends, recency-weights, re-snapshots | Results decay; visible change beats silent staleness | `[V1]` |

Full narrative in [User Journey](./user-journey-v3.0.md); screen-level specification in [Information Architecture](./information-architecture-v3.0.md).

---

## Chapter 3 · Discovery Psychology

The emotional journey is designed, not incidental.

| Stage | Should feel | Trust from | Curiosity from | Fatigue reduced by |
|---|---|---|---|---|
| 1–3 | Safe, informed | Honest time; data handling stated first | "What will it find?" | Knowing the cost up front |
| 4 | Seen | Optional and unscored, and says so | "It's adapting to me" | Three light questions |
| 5 early | Competent | Items are recognisably about the work | Items feel non-obvious | One per screen |
| 5 mid | **Rewarded** | The interstitial is derived, not flattery | A real observation about them | Value delivered before the end |
| 5 late | Nearly there | Progress never misrepresents position | Anticipation of the result | Honest remaining count |
| 6 | Attended to | *"This decides which"* — a reason given | The platform noticed something | Hard cap of 8; early stop |
| 7 | Anticipatory | Explicitly not scored | Their own guess, about to be tested | One optional screen |
| 8 | **Recognised** | Confidence shown beside every position | Axes they hadn't named | Scannable, expandable |
| 9 | **Understood** | Nothing overclaimed | Their prediction vs the evidence | Prose, not dashboards |
| 10–11 | Oriented, then decided | Uncertainty named specifically | Professions they'd never heard of | 3–5 options, not 20 |
| 12 | Capable | Steps small enough to be real | *"What if I did that?"* | Three horizons only |
| 15 | Fairly traded | Asked after value, never before | *"What changes if I come back?"* | One screen, skippable |
| 16–17 | Accompanied | It remembered, and was honest about change | *"What's different now?"* | Reassessment shorter than the first |

**When to reassure** — before the first item; whenever a person skips several in a row; whenever confidence is low. **When to challenge** — the trade-off items, which are deliberately hard because forced choices produce better evidence than comfortable ones. **When to make them feel understood** — stages 8 and 9, which the entire preceding structure exists to earn.

**Completion is a psychology problem, not a UX problem.** Levers, in order of effect: honest cost up front · value delivered mid-flow · adaptive shortening for clear profiles · never punishing an early exit. Someone who leaves at item 14 receives a real report with honest confidence, which is why they return to finish.

---

## Chapter 4 · Assessment Architecture

### The six stages

| Stage | Content | Output | Specified in |
|---|---|---|---|
| 1 · Career Context | 3 unscored items | Report voice, action-plan horizon | [Question Blueprint §2](./question-blueprint-v3.0.md) |
| 2 · Core Assessment | 20 scored items | 24 axis loadings + 4 behavioural observations | [Question Blueprint §3–5](./question-blueprint-v3.0.md) |
| 3 · Adaptive Discovery | 0–8 items `[V1]` | Resolution of consequential uncertainty | [Evidence Architecture §6](./evidence-architecture-v3.0.md) |
| 4 · Security Career DNA | — | 8 axis positions + confidence + behavioural signals | [DNA Model §3–4](./security-career-dna-model-v3.0.md) |
| 5 · Career Intelligence Mapping | — | Ranked Security Career Areas, categories, professions | [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) |
| 6 · Personal Career Report | — | Narrative, recommendations, action plan, immutable snapshot | [DNA Model §10](./security-career-dna-model-v3.0.md) |

The eight axes — CDA-01 Field Presence, CDA-02 People Interface, CDA-03 Procedural Structure, CDA-04 Acute Tempo, CDA-05 Systems & Technology, CDA-06 Investigative Depth, CDA-07 Responsibility for Others, CDA-08 Organisational Scope — are defined in full, with their evidence rules and the reasoning behind each, in the [Career DNA Model](./security-career-dna-model-v3.0.md).

### The item count: 20, not 16

Eight axes × three independent items = **24 loadings**. Twenty items carry them because the eight trade-off items load two axes each:

```
8 single-axis  × 1 =  8
8 trade-off    × 2 = 16
                     ──
                     24  = exactly 3 per axis
```

**Why three per axis.** Assessment DNA Doc 06 §1 sets ≥2 items from ≥2 evidence classes as the floor for any foundational construct. Three provides redundancy and allows an item to be retired after pilot without losing the axis.

**Why 16 fails.** It yields at best two loadings per axis — the floor with no margin. Sixteen is also precisely what produced the current build's four single-item dimensions, where one checkbox question drives four dimensions and three hard gates (audit F-1).

**Why not 24.** Four loadings per axis is better measurement, but the fourth item adds least and pushes past 15 minutes before adaptive. At 12–18 minutes total, 20 is the largest core that leaves room for adaptive discovery.

**Twenty is the smallest number that clears the evidence floor with margin.** Full derivation and allocation in [Question Blueprint §1](./question-blueprint-v3.0.md).

### Session budget

| Block | Items | Time |
|---|---|---|
| Context | 3 | 0.8 min |
| Single-axis | 8 | 3.7 min |
| Trade-off | 8 | 5.1 min |
| Behavioural | 4 | 2.9 min |
| Reflection | 1 | 0.5 min |
| **Core** | **24 screens** | **≈13 min** |
| Adaptive `[V1]` | 0–8 | 0–4.7 min |
| **Total** | **24–32** | **13–17.7 min** |

---

## Chapter 5 · Question Strategy

Nine types, each with a specified role. Reconciled against the fourteen-category taxonomy already established in Question Library Doc 01 — this is a *usage* strategy layered on that classification, not a replacement.

| Type | Purpose | Advantages | Limitations | Used |
|---|---|---|---|---|
| **Behaviour preference** | Orientation on one axis | Fast, honest for genuinely self-known preference, no experience required | Social desirability; weak for anything the person cannot observe in themselves | S1–S8, one per axis |
| **Trade-off / forced choice** | Relative pull when both are attractive | Defeats uniform-high answering; high information; surfaces real priorities | Partly ipsative — relative, not absolute | T1–T8, two axes each |
| **Situational judgement** | Behaviour in a concrete situation | Best-validated selection method; harder to game; smaller subgroup differences | Expensive to author; needs SME keys; coachable if leaked | B1–B3 |
| **Behaviour frequency** | Typical past conduct | Concrete; harder to guess than self-rating | Selective recall; needs a real time frame | B4 |
| **Scenario** | Wrapper for the above | Realism, engagement, ambiguity that reveals priority | Length; reading burden | Carrier for B1–B3 |
| **Reflection** | The person's own view | Creates anticipation; enables the prediction comparison | **Unscoreable** — inter-rater reliability unresolved (Assessment DNA Doc 09 §3) | One, unscored |
| **Ranking** | Relative priority across 5–7 | Removes acquiescence | Slow; needs UI that does not exist | **Not used** — reconsider `[V2]` |
| **Confidence rating** | Calibration | Reveals self-knowledge accuracy | Must be paired, roughly doubling count | **Not used** `[Future]` |
| **Knowledge** | Factual recall | Objective | Measures exposure, not orientation | **Not used** — belongs to the employer product |

**The mix, and why.** Orientation axes are carried by preference and trade-off items, because Assessment DNA Doc 04 is explicit that self-report is legitimate for interest and preference — the previous failure was never *using* preference, it was one preference item driving four dimensions and three gates. Behavioural signals are carried by situational judgement and frequency only, never self-rating, because self-report is weakest exactly where stakes are highest.

Four types are deliberately excluded. Reasons in [Question Blueprint §7](./question-blueprint-v3.0.md).

---

## Chapter 6 · Adaptive Discovery

Summarised here; specified in full in [Evidence Architecture §6](./evidence-architecture-v3.0.md).

**Not** computer-adaptive testing — no ability estimation, no IRT, no difficulty targeting. Those require a calibrated bank that does not exist and break reproducibility in ways the prior documentation flags three separate times.

**Evidence-driven exploration instead:** the platform notices what it does not know *that matters*, and asks about that.

Two triggers, both requiring consequence: a decision-relevant axis is uncertain **and** resolving it would change the ranking; or a near-tie exists **and** an axis could break it. Minimum 0, typical 3–5, **hard maximum 8**. Stops on no-trigger, cap, diminishing return, time, or user request — always available, never penalised.

The exact administered sequence is recorded per run, which preserves reproducibility. `[V1]`; `[MVP]` ships the model and recording with zero items enabled.

---

## Chapter 7 · AI Integration

### The boundary, inherited verbatim

> **AI explains. Deterministic rules calculate. Humans decide.**

Consistent across Assessment DNA Doc 01, Doc 08, Question Library Doc 09 and the Security Competency Platform's own governance. Not re-litigated here.

### Where AI creates value

| Use | What it may do | Phase |
|---|---|---|
| **Narrative phrasing** | Improve *how* a licensed statement reads. Never change *which* statements are licensed | `[V2]` |
| **Learning recommendations** | Match a named gap to appropriate content, from an approved library | `[V2]` |
| **Career pathway explanation** | Explain how one role leads to another, from graph data | `[V2]` |
| **Reflection prompts** | Suggest what a person might usefully consider next | `[V2]` |
| **Development coaching** | Suggest activities, respecting the trainable/fixed distinction as a hard input | `[Future]` |
| **Reassessment framing** | Explain what changed and why it might have | `[Future]` |
| **Longitudinal insight** | Notice patterns across a career and surface them for the person | `[Future]` |
| **Conversation** | Answer *"what would it take to move toward X?"* from their own evidence | `[Future]` |

### Where deterministic logic is mandatory

Every step from answer to recommendation: evidence interpretation · axis computation · confidence · signal generation · fit computation · ranking · which narrative statements are licensed. **No AI anywhere in this chain, at any phase.**

### Where explainability is mandatory

Every user-facing claim. AI-assisted phrasing must preserve the traceability chain — if a sentence cannot resolve to Evidence Objects, it is not emitted regardless of who wrote it.

### Where human review is required

Before any AI-assisted output ships: the approved statement library · the phrasing rules · prohibited-language guards · a sampled review of live outputs against their evidence. An AI explanation that cannot be traced to specific evidence is not an explanation but a hallucination risk, and must not ship.

### Prohibited outright

Computing or adjusting any score · generating a recommendation independently of the deterministic engine · inferring protected characteristics, health, honesty or criminality · producing pass/fail, suitability or ranking language · using name, photo or background as an interpretive signal · hiding uncertainty or validation status.

---

## Chapter 8 · Future Scalability

The architecture must absorb twelve further domains without redesign.

### What makes it extensible

**The eight axes are domain-general.** Field presence, people interface, procedural structure, acute tempo, systems affinity, investigative depth, responsibility, organisational scope — every one applies to cyber, AML, emergency management and military work as directly as to protective operations. **No new axis is needed for a new domain.** This was the primary design criterion for the axis set.

**Extension is content, not code.** A new domain needs a Security Career Area (or reuses one), profession requirement profiles expressed in the same eight axes, and Career Intelligence Graph enrichment. It needs no new construct, no new item type, no engine change.

| Domain | Area | New axis needed? | Adds |
|---|---|---|---|
| Cyber Security | `cyber_information_security` ✓ exists | No | Profiles, enrichment |
| Corporate Security | `corporate_security` ✓ | No | Profiles |
| Protective Intelligence | `investigations_intelligence` ✓ | No | Profiles |
| Fraud / AML | `financial_crime_compliance` ✓ | No | Profiles, certifications |
| Risk Management | `risk_management` ✓ | No | Profiles |
| Crisis Management | `crisis_management` ✓ | No | Profiles |
| Security Leadership | `security_leadership_governance` ✓ | No | Profiles |
| Law Enforcement | `public_safety_justice` ✓ | No | Authority disclaimers (pattern exists) |
| Military | `defence_national_security` ✓ | No | Authority disclaimers |
| Emergency Management | `crisis_management` or new | No | Profiles |
| Safety | New area | No | Area + profiles |
| Corrections | `corrections_secure_transport` ✓ | No | Profiles |

**Ten of twelve already have a canonical Security Career Area.** The taxonomy was built for this.

### International expansion

Market-scoped from the start: professions carry a market, regulatory content carries a jurisdiction, and language is an adaptation object with its own approval status — never a translated column. A new market adds professions, requirements and an approved language adaptation. **The axes do not change**; how a person orients toward work is not Swedish. What is regulated, and by whom, is.

Assessment DNA Doc 09 §7 is right that statistical properties need re-validation per market. That is a validation obligation, not an architectural one.

---

## Chapter 9 · UX Principles

| Area | Principle |
|---|---|
| **Progress** | Honest position, never rescaled to look further along. "7 of 20" plus a bar |
| **Motivation** | From delivered value only. No streaks, urgency, scarcity or nagging |
| **Animation** | Functional only — state changes and transitions. `prefers-reduced-motion` respected everywhere |
| **Microcopy** | Plain, specific, never coy. *"Six more"*, not *"almost there!"* |
| **Empty states** | Name what is missing and what would fill it. Never "coming soon" |
| **Loading** | Named steps with real progress. `role="status"`. If it exceeds 5 s, say so |
| **Trust signals** | Verifiable only. No unverifiable social proof |
| **Accessibility** | WCAG 2.2 AA. Real radio groups, live regions, focus management, full keyboard path |
| **Completion** | Honest cost · mid-flow value · adaptive shortening · exit never punished |
| **Mobile** | 375 px first. One item per screen, thumb-reachable primary, single-column report |

**Never rendered:** engine or model version identifiers · raw numbers without confidence · unbuilt features · any claim untrue at render time · comparison to other people.

---

## Chapter 10 · Data Protection and the Data Lifecycle

> **Not a legal opinion.** This chapter describes what the system stores, why, and what a person can do about it. Whether that satisfies any particular legal obligation is for the DPIA and the legal/DPO review, both of which remain **mandatory before any real recruitment use**. Nothing here should be read as a compliance claim.

### 10.1 The correction this chapter records

An earlier draft of this document set deferred data export and deletion to `[V1]`, while the [Information Architecture](./information-architecture-v3.0.md) specified an expectation-setting screen telling users *"you can delete everything at any time"*.

That combination is not acceptable. A promise made in the product must be true when the product is public.

**Resolution: export and deletion move to `[MVP]`.** They ship before public release, or the promises do not ship either. The design principle stated in Chapter 1 — *nothing unbuilt is shown; every claim must be true at render time* — applies to data-handling claims exactly as it applies to feature claims. The platform already carries this exposure independently of Career Discovery: `dictionaries.ts:2243` promises export and deletion today with no implementation behind it.

### 10.2 What is stored

| Data | When | Why | Phase |
|---|---|---|---|
| **Context answers** (C1–C3) | Stage 4 | Tailor report voice and action-plan horizon. Never scored | `[MVP]` |
| **Evidence Objects** — one per answer | Stage 5–6 | The evidence base. Item version, response, response time, loadings, provenance | `[MVP]` |
| **Reflection text** | Stage 7 | Shown back beside the result. **Never scored, never processed** | `[MVP]` |
| **DNA state** | Computed | Axis positions and confidence. Derived — never a separate source of truth | `[MVP]` |
| **Report snapshots** | On report generation | Immutable record of what the person was shown, and what produced it | `[MVP]` |
| **Account identity** | Only if they save | Email and authentication, via existing platform auth | `[MVP]` |
| **Consent records** | On each consent event | Which purpose, which version, when granted, when withdrawn | `[MVP]` |
| **Quality signals** | During the run | Response timing and pattern flags. Administration quality only — **never a judgement about the person** | `[V1]` |

**Not stored:** no special-category data · no inferences about health, beliefs, politics or protected characteristics · no biometrics · no device fingerprinting · no third-party tracking inside the discovery flow.

Anonymous sessions hold Evidence Objects in local storage and are not associated with an identity until the person chooses to save.

### 10.3 Processing purposes

Each purpose is separate, and consent to one is never consent to another.

| Purpose | Lawful-basis question for legal review | Consent |
|---|---|---|
| Produce the person's own career result | The core service they asked for | Implicit in starting |
| Save and revisit the result | Requires an account | Explicit, at save |
| Improve the instrument (aggregate, deidentified) | Pilot statistics and item quality | Explicit, opt-in, separable `[V1]` |
| Enrich the profile from employer assessment evidence | Cross-product flow | Explicit, purpose-specific, revocable `[Future]` |

**Never a purpose:** sharing a candidate's Career DNA with an employer · advertising · sale or transfer to any third party · automated decision-making about the person.

### 10.4 Retention

| Data | Retained | Then |
|---|---|---|
| Anonymous session (local) | 30 days from last activity | Prompted before reuse; discarded |
| Evidence Objects (account) | While the account exists | Deleted with the account |
| Report snapshots | While the account exists | Deleted with the account |
| Consent records | While the account exists, plus a retention period for audit | Per the schedule legal review sets |
| Deidentified aggregate statistics | Indefinite | Carries no identifier and cannot be re-associated `[V1]` |

**Exact durations are a legal/DPO decision, not an engineering one.** This is a standing open question in the repository's prior documentation and is still unresolved. The architecture must support any schedule chosen; it does not choose one.

### 10.5 Deletion

**`[MVP]` — before public release.**

One action deletes everything: Evidence Objects, DNA state, report snapshots, reflection text, context answers, consent records other than the minimal record that a deletion occurred.

**Immutability does not survive a deletion request.** Snapshots are immutable against *modification* — nobody may quietly rewrite what a person was shown. They are not immune to *erasure by the person whose data they are*. Confusing the two would turn a integrity guarantee into a data-protection failure, and the distinction is stated here because it is easy to get wrong.

Deletion is complete, not a soft flag. It is confirmed to the person. It cannot be triggered by an employer, an admin acting alone without a logged reason, or any automated process.

### 10.6 Export

**`[MVP]` — before public release.**

A person can export everything the platform holds about them, in a machine-readable format, without asking anyone: their answers, every Evidence Object with its provenance, their DNA state and confidence, every report snapshot, their reflection text, and their consent history.

The export is the same data the platform reasons over — not a summary of it. If the platform used something to produce a recommendation, it appears in the export.

### 10.7 Immutable snapshots, and how they coexist with a living profile

| | Living DNA state | Report snapshot |
|---|---|---|
| Changes over time | Yes, as evidence accumulates | **Never** |
| Purpose | The current best understanding | An exact record of what was shown, and why |
| Modification | Recomputed from evidence | Impossible |
| Deletion | On request | **On request** |

A snapshot pins the DNA state, the exact evidence set, the model, scoring and narrative versions, and a content hash. This is what makes *"here is what we told you in March, and here is what changed"* honest rather than reconstructed. It is not a mechanism for retaining data against someone's wishes.

### 10.8 Consent, withdrawal and recomputation

Consent is **explicit, purpose-specific, revocable, and asked at the moment the data exists** — never bundled into terms, never pre-ticked, never inferred from continued use.

Withdrawal is symmetrical with granting: same place, same effort, no retention conversation, no dark pattern.

**Withdrawal triggers recomputation.** Removing a consent removes the Evidence Objects it permitted, and the DNA is recomputed from what remains. The result may legitimately change — an axis may drop to a lower confidence, or a recommendation may move — and the person is told that plainly rather than shielded from it.

Report snapshots issued before a withdrawal are **not** retroactively altered. They are historical records of what the person was actually shown at the time, and rewriting them would be dishonest rather than protective. They remain deletable on request like everything else.

### 10.9 Employer enrichment stays `[Future]`

Unchanged by this chapter, and constrained absolutely: explicit purpose-specific revocable consent · one-directional, employer evidence into the candidate's profile and **never** the reverse · evidence-level, never score-level · withdrawal removes and recomputes · provenance always visible. Full treatment in [DNA Model §11](./security-career-dna-model-v3.0.md).

### 10.10 What still requires legal review

Mandatory before any real recruitment use, and none of it is an engineering decision:

- **DPIA** for the discovery flow and for enrichment separately
- **Lawful basis** per processing purpose
- **Retention durations** per data class
- **Cross-border** handling if a second market is added
- **Wording** of every consent and data-handling statement in both languages

---

## Chapter 11 · Final Recommendations

### What I would change

**Rank on fit, report confidence separately.** The single highest-impact correction. The current engine sorts on confidence-capped values, so display caps silently reorder results and users see a ranking partly determined by evidence coverage rather than fit.

**Explain before recommending.** Moving the narrative ahead of the recommendation costs nothing and is the difference between a product that understands someone and one that sorts them.

**Make evidence accumulate.** Computing and discarding is why the current product cannot grow. This is an architectural decision that must be made at the start or never.

### What I would remove

**The "Share preview · Upcoming" section**, and every other unbuilt feature shown to candidates. Four sections of the current report carry "under construction" copy.

**The Career Journey stepper**, until every step can complete. Two of its five are hardcoded `false`.

**The engine version string.** Candidates should never see `cie-v1.0`.

**The regex copy-launderer.** Rewriting engine jargon into plain language at render time is a symptom; generate user-facing language directly.

**The three-way question-pool split.** Two candidates currently receive structurally different instruments with incomparable results.

### What I would simplify

**Seventeen report sections to nine.** The current report presents the same archetype array three times, repeats a disclaimer ten times, and has two next-step cards pointing at the same URL.

**Fourteen dimensions to eight axes** — but eight that are properly evidenced, rather than fourteen where four rest on a single checkbox.

**Two questionnaire runners to one.** The public route and the employer-invite route duplicate the entire controller and must be kept in sync by hand.

### What I would improve

**Honesty as a feature.** The current build hides fit percentages in one section as insufficiently evidenced and prints the same numbers raw two sections later. Being uncertain is fine; being inconsistently uncertain is not.

**The moment of arrival.** Reflection → DNA → Narrative → prediction comparison is a genuinely memorable sequence, and it costs one extra optional screen.

**Internationalisation.** 1857 lines of report with zero translatable copy is a launch blocker for any second market.

### What makes this genuinely different

Not the questions, the interface, or the report structure — all copyable within a quarter.

**It is that the product reduces uncertainty *for the person*, and everything else follows from that inversion.** It refuses to type people. It shows what it does not know. It never lets an employer see the private profile. It accumulates rather than recomputes. It pays the candidate back for work they did for someone else.

Each of those is a **refusal**, which means a competitor must give something up to match it — and most cannot, because their positioning depends on appearing authoritative and their business depends on the employer being the customer.

That is what makes *"Where trust comes first"* an architectural description rather than a tagline.
