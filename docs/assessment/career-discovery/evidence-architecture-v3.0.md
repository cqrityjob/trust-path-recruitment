# Evidence Architecture v3.0

**Status:** design. No implementation.

> **How this document relates to the others**
> This is the reasoning pipeline: how an answer becomes a recommendation, and how every recommendation walks back to the answer. [DNA Model](./security-career-dna-model-v3.0.md) defines the constructs this feeds; [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) defines what happens after; [Question Blueprint](./question-blueprint-v3.0.md) defines what goes in.

---

## 1. The pipeline

```
Question
   ↓                      one item, one screen, one interaction
Answer
   ↓                      what the person actually chose
Evidence Object           ◄── the atomic, persisted unit
   ↓
Career DNA Axis           CDA-01 … CDA-08  (+ Behavioural Signals, separate track)
   ↓
Career Intelligence Signal
   ↓
Security Career Area
   ↓
Career Category
   ↓
Career Recommendation
   ↓
Learning Recommendation  ·  Action Plan
```

**The contract:** every element to the right of "Evidence Object" can name the Evidence Objects that produced it. There is no step in this chain where reasoning becomes opaque.

That is not a nice-to-have. It is the mechanism behind the product's central claim — that a recommendation can be explained — and behind three of its WOW moments. If any stage cannot cite its inputs, the claim is marketing.

---

## 2. The Evidence Object — the keystone

Everything else in this document set depends on this one decision.

```
EvidenceObject
├── identity
│   ├── id
│   ├── person_ref            (account, or anonymous session token)
│   └── run_ref               which session produced it
├── provenance
│   ├── item_version_id       exact published item, content-hashed
│   ├── form_id               which form it was administered in
│   ├── context               self_serve | employer_assigned | reassessment
│   ├── language              the adaptation actually shown
│   ├── observed_at
│   └── consent_ref           which consent permits its use  [Future]
├── observation
│   ├── response              what was chosen, verbatim
│   ├── response_time_ms      quality signal, never a score
│   └── state                 answered | declined | timed_out
└── interpretation
    ├── loadings[]            { axis, direction, magnitude }
    └── scoring_version_id    which key was applied
```

### Why it must be persisted and append-only

Three requirements that look unrelated are the same requirement:

| Requirement | Needs |
|---|---|
| **Traceability** — "why did you recommend this?" | Walk back from recommendation to specific objects |
| **Living DNA** — a profile that grows | Accumulate across sessions instead of recomputing and discarding |
| **Consent-gated enrichment** `[Future]` | Item-level provenance and revocability |

Without an Evidence Object, all three are impossible and each would need its own mechanism. With it, all three fall out of one design. **`[MVP]` — the store exists from day one even if only one session ever writes to it.**

### Separation of observation from interpretation

`response` is what the person did. `loadings` is what the current scoring version makes of it. They are stored separately and versioned separately.

This means a scoring model can be corrected without touching what anyone actually answered — the failure mode the previous engine could not recover from, where scoring assumptions were baked into the only record that existed.

---

## 3. From Evidence to Axis

```
for each axis:
    relevant = Evidence Objects with a loading on this axis
    if count(relevant) < 3          → confidence = emerging, excluded from matching
    position = Σ(magnitude × direction × recency_weight) / Σ(max_magnitude × recency_weight)
    agreement = 1 − normalised spread of directions
    confidence = f(coverage, agreement)
    if agreement < threshold        → mark context_dependent, do not average away
```

Three properties worth stating explicitly, because each fixes a specific audit finding:

- **Equal spans by construction** (F-2). Three items per axis, identical possible ranges. No cross-axis normalisation, because none is needed.
- **Neutral is an observation** (F-3). A mid-range answer produces an Evidence Object with a real position. Only *absence* is absence.
- **One penalty, not four** (F-4). Low coverage lowers confidence. That is the whole mechanism.

`recency_weight` is `1.0` in `[MVP]` (single session) and decays over 24 months in `[V1]`.

---

## 4. From Axis to Career Intelligence Signal

A **Signal** is a single comparable statement: *this person's position on this axis, at this confidence, versus what this profession typically calls for.*

```
Signal { axis, person_position, profession_target, tolerance, confidence, contribution }
```

Two departures from the previous engine:

**Tolerance bands, not point targets.** A profession specifies a *range* it works well across, not a single value. Being further toward an end than typical is not penalised the way falling short is — the old symmetric `1 − |user − target|` punished a maximally learning-oriented candidate for exceeding a target of 45.

**Emerging axes contribute nothing.** Not a reduced weight — nothing. An axis the platform is unsure about does not quietly move a recommendation.

---

## 5. From Signal to Recommendation

Detailed in [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md). The contract this document imposes:

1. Every recommendation carries the Signals that produced it, ranked by contribution.
2. Every Signal carries the Evidence Objects behind it.
3. A recommendation that cannot produce this chain **is not shown**. There is no fallback to a generic suggestion.

---

## 6. Adaptive Discovery

Not computer-adaptive testing. No ability estimation, no item response theory, no difficulty targeting. Those need a calibrated bank that does not exist, and they break reproducibility in a way the prior documentation flags three separate times.

**This is evidence-driven exploration**: the platform notices what it does not yet know that *matters*, and asks about that.

### 6.1 When an adaptive question appears

Only two triggers, and both must be *consequential*.

**Trigger A — a decision-relevant axis is uncertain.**

```
axis.confidence == emerging
  AND axis appears in the top-3 candidate areas' Signals
  AND resolving it would change the ranking
```

The third clause matters. Uncertainty on an axis that does not affect this person's outcome is not worth a question.

**Trigger B — a near-tie that evidence could break.**

```
|area[1].fit − area[2].fit| < tie_threshold
  AND an axis exists that separates them
  AND that axis has capacity for more evidence
```

### 6.2 How many

| | |
|---|---|
| **Minimum** | 0 — a clear profile earns a shorter session, and is told why |
| **Typical** | 3–5 |
| **Maximum** | **8, hard** |

The cap is absolute. If uncertainty remains after eight, the honest answer is to say so in the report and offer resolution later — not to keep asking. A person who feels interrogated will not return, and return is where the value is.

### 6.3 Stopping rules

Stop when **any** holds:

1. No trigger fires — nothing uncertain is consequential.
2. Eight adaptive items administered.
3. Two consecutive items fail to move confidence (diminishing return — likely genuine context-dependence, not missing data).
4. Elapsed session time exceeds 18 minutes.
5. The person asks to stop. **Always available, never penalised**, and the report is still produced with honest confidence levels.

### 6.4 Item selection

From the candidates that would resolve the active trigger, choose the one with the highest **expected information gain** — an authored estimate `[MVP]`, replaced by empirical values after pilot `[V1]`. Ties break toward the item that has been administered least (exposure control) and away from the format just used (fatigue).

### 6.5 Keeping it enjoyable

Adaptive questions are framed as **the platform being interested**, not as remediation:

> One more thing — your answers point two different directions here, and this question decides which.

Never *"we need more data"*, never *"your previous answers were unclear."* The user did nothing wrong; the platform is being thorough on their behalf. This framing is a WOW moment rather than a chore, and it is the difference between adaptive feeling smart and adaptive feeling like a test that will not end.

### 6.6 Reproducibility

Every adaptive run records the **exact sequence and set of items administered**, in order, with the trigger that caused each. A run is replayable item-for-item.

This closes the objection raised in Assessment DNA Doc 04, Doc 10 Stage 6 and Question Library Doc 08 §5 — that adaptive delivery breaks the reproducibility guarantee. It does not, if the administered set is recorded rather than inferred from the form.

`[V1]` — the MVP ships with the trigger model designed and the sequence recording built, but zero adaptive items enabled. Adaptive switches on when the item bank has depth to support it.

---

## 7. Traceability contract

Every claim the product makes must resolve to evidence within three hops.

| Surface | Resolves to |
|---|---|
| Narrative statement | The Evidence Objects that licensed it |
| Axis position | Its contributing Evidence Objects |
| Career recommendation | Its Signals → their axes → their Evidence Objects |
| Learning recommendation | The gap that motivated it → the Signal → the evidence |
| Action-plan step | The recommendation it serves |

**Enforcement:** a narrative statement with no licensing evidence is not emitted — not softened, not hedged, not qualified. Silence is the correct output for an unsupported claim. `[MVP]`

**Surfaced to the user** `[V1]`: every claim in the report carries a *"why do you say that?"* affordance revealing the specific answers behind it. This is the single most differentiating feature in the product and the strongest trust mechanism available, because it is checkable.

---

## 8. Quality signals

Observations about the *administration*, never about the person's honesty. There is no lie score, and there will not be one.

| Signal | Observation | Consequence |
|---|---|---|
| `rapid_response` | Item answered far faster than plausible reading time | Lowers confidence on that item's axes |
| `straightlining` | Long identical runs in a block | Flags for review; never invalidates |
| `session_interrupted` | Long gap mid-run | Recorded; may prompt a resume check |
| `declined_pattern` | Several consecutive skips | UX signal about the items, not the person |

None invalidates a run. None appears in the candidate report as an accusation. `straightlining` recurring across many people is an item-construction defect and is routed to content review. `[V1]`

---

## 8b. Export, deletion and consent in the Evidence Store

Append-only is a rule about *the platform*, not about the person. It prevents the system quietly rewriting what someone answered; it does not entitle the system to keep it.

| Operation | Behaviour | Phase |
|---|---|---|
| **Export** | Every Evidence Object with full provenance — item version, response, timing, loadings, context, consent — in machine-readable form | `[MVP]` |
| **Deletion** | All Evidence Objects, derived DNA state and report snapshots removed. Not a soft flag | `[MVP]` |
| **Consent withdrawal** | Objects permitted by that consent are removed; the DNA is recomputed from what remains | `[MVP]` for platform consents · `[Future]` for employer enrichment |
| **Recomputation** | Deterministic from the remaining store. The result may legitimately change, and the person is told | `[MVP]` |

Provenance on every Evidence Object is what makes selective withdrawal possible at all — without `consent_ref`, the only options would be keeping everything or deleting everything. Full lifecycle in [Master Blueprint ch 10](./master-product-blueprint-v3.0.md).

---

## 9. What this architecture forbids

1. **No recommendation without a traceable chain.**
2. **No hidden inputs.** If something moves a recommendation, it appears in that recommendation's explanation.
3. **No AI in the chain.** Every step from answer to recommendation is deterministic. AI operates on completed output — see [Master Blueprint](./master-product-blueprint-v3.0.md) ch 7.
4. **No overwriting evidence.** Reassessment appends.
5. **No inferred evidence.** The platform never manufactures an observation the person did not produce — no imputation, no "people like you", no filling gaps with population averages.
6. **No retention against the person's wishes.** Append-only constrains the platform, not the data subject.
7. **No cross-product leakage.** Career evidence and competence evidence live in separate construct spaces and meet only through the consented, one-directional, item-level path in [DNA Model](./security-career-dna-model-v3.0.md) §11.

---

## 10. Phase summary

| | `[MVP]` | `[V1]` | `[V2]` / `[Future]` |
|---|---|---|---|
| Evidence Object store | ✓ append-only | recency weighting | consented enrichment |
| Axis aggregation | ✓ equal weights | empirical weights | — |
| Confidence | ✓ coverage + agreement | cross-session | — |
| Context-dependence | ✓ detected and reported | adaptive resolution | — |
| Adaptive | model + sequence recording, **0 items live** | ✓ 3–8 items | — |
| Traceability | ✓ internal, enforced | ✓ user-facing "why do you say that?" | — |
| Quality signals | response time captured | ✓ full set | — |
| Report snapshots | ✓ immutable, hashed | — | — |
