# User Journey v3.0

**Status:** design.

> **How this document relates to the others**
> This is the narrative walkthrough — what it feels like, in order. [Information Architecture](./information-architecture-v3.0.md) is the same journey as a screen specification. [Experience](./security-career-discovery-experience.md) explains the emotional intent behind these choices. Stages 8–11 present what the [DNA Model](./security-career-dna-model-v3.0.md) and [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md) produce, from items in the [Question Blueprint](./question-blueprint-v3.0.md).

---

## The shape of it

```
1 Landing → 2 Welcome → 3 Expectations → 4 Career Context
                                              ↓
        7 Reflection ← 6 Adaptive Discovery ← 5 Discovery
              ↓
8 Career DNA → 9 Career Narrative → 10 Career Intelligence → 11 Recommendations
                                                                    ↓
                                  14 Jobs ← 13 Learning ← 12 Action Plan
                                     ↓
                            15 Save → 16 Return → 17 Reassessment ──┐
                                                          ▲         │
                                                          └─────────┘
```

Stages 1–15 are one sitting of 12–17 minutes. Stages 16–17 are the rest of the relationship, and they are where the product's value actually accrues.

**Total to first value: under 18 minutes, no account required.**

---

## Stage 1 · Landing `[MVP]`

**Sees.** One sentence about what this is, an honest time estimate, and what they get. Four trust points: takes about 15 minutes · free · no account needed · your answers stay yours. A single primary action.

**Feels.** *"This is for me, and it won't waste my time."*

**Platform does.** Nothing yet. No session, no tracking beyond what the site already does.

**Why.** The current landing promises "about 5 minutes" for an instrument that cannot deliver on it. Honest time estimates raise completion, because the people who start are the people who meant to.

---

## Stage 2 · Welcome `[MVP]`

**Sees.** A short frame: *this is not a test, there are no right answers, and nothing here decides whether you can work in security.* Names what the product will produce — a profile, an explanation, and directions worth looking at.

**Feels.** Relief. Most people arriving at anything assessment-shaped are braced for judgement.

**Platform does.** Creates the session and its Evidence Store. Nothing is scored yet.

**Why.** Lowering evaluative threat measurably improves honesty. A person defending against judgement answers as they think they should, which corrupts exactly the evidence the product needs.

---

## Stage 3 · Expectation setting `[MVP]`

**Sees.** Three plain statements — how long it takes, what happens to the answers, and what the result can and cannot tell them. A single **"How we use your answers"** link opening a plain-language panel: answers stay on the device until saved · nothing is shared with any employer · you can delete everything at any time.

**Feels.** *"They told me before I asked."*

**Platform does.** Records that expectation setting was shown, with its version.

**Why.** Audit F-12 found the current product tells users their data is "Not stored" while storing it. Trust is not built by disclaimers at the end; it is built by being accurate before anything is collected. This is the cheapest trust-building screen in the product and the current build does not have it.

---

## Stage 4 · Career Context `[MVP]`

**Sees.** Two or three light questions — where they are now, how long in security if at all, what brought them here today. Explicitly optional and explicitly not scored.

**Feels.** *"This is about me specifically."*

**Platform does.** Sets report voice and action-plan horizon. **Does not select which items are administered** — every candidate gets the same 20 core items.

**Why.** The current build uses this to pick which 8 of 16 questions someone receives, so two people get structurally different instruments with incomparable results. That is removed. Context tailors voice, never measurement.

---

## Stage 5 · Discovery `[MVP]`

**Sees.** Twenty items, one per screen, ~30–40 seconds each. A progress indicator that is honest about position. Every item carries a **"Why are we asking this?"** affordance revealing, in one sentence, what it helps establish.

At two points — after item 7 and item 14 — a brief interstitial reflects something back:

> So far you're leaning toward work where you're present rather than at a distance. Six more.

**Feels.** Momentum, then curiosity. The interstitial is the first moment the platform stops taking and starts giving.

**Platform does.** Writes an Evidence Object per answer. Computes provisional axis positions. Detects context-dependence. Never scores anything the user sees yet, beyond the interstitial's directional read.

**Why.** *"Why are we asking this?"* is the single strongest trust mechanism available and costs one sentence per item. The interstitials exist because a 20-item block with no feedback is where people leave — and because they demonstrate, before the report, that the system is reasoning rather than collecting.

**Edge paths.** Back is always available and never destroys an answer. Skip is available and recorded distinctly from *unanswered*. Progress persists across reload and across navigation away — the current build destroys an in-flight run when a user clicks any site-wide assessment link (audit F-9), and that is fixed by making resume the default rather than a fallback.

---

## Stage 6 · Adaptive Discovery `[V1]`

**Sees.** Zero to eight further items, framed as the platform being interested rather than unsatisfied:

> One more — your answers point two ways here, and this decides which.

**Feels.** Attended to. Not interrogated.

**Platform does.** Fires only when an uncertain axis is *consequential* — it appears in the top-3 candidate families and resolving it would change the ranking — or when a near-tie exists that evidence could break. Hard cap of eight. Stops early when confidence stops moving.

**Why.** Adaptive here means *the platform noticed what it doesn't know that matters*, not difficulty targeting. A clear profile earns a shorter session and is told so — which is a reward, not a shortcut.

**`[MVP]`** ships with zero adaptive items enabled; the trigger model and sequence recording are built so the bank can switch on without redesign.

---

## Stage 7 · Reflection `[MVP]`

**Sees.** One optional, unscored prompt:

> Before we show you anything — is there a kind of work you already suspect would suit you?

Free text, skippable, explicitly *"this doesn't affect your result."*

**Feels.** Ownership. And a small held breath.

**Platform does.** Stores it verbatim, uses it nowhere in scoring. Shows it back in the report next to what the evidence found.

**Why.** Two reasons, both strong. It creates a genuine moment of anticipation at the point of maximum curiosity. And when the report later confirms or gently contradicts what someone already suspected, that comparison is the most memorable single element in the entire experience — *"you thought X; the evidence points to X, and here's why"* is far more powerful than either statement alone.

Never scored, because scoring self-prediction is exactly the "who do you think you are" question the product refuses to ask.

---

## Stage 8 · Security Career DNA `[MVP]`

**Sees.** Eight axes, each as a position between two named ends, each with its confidence shown as prominently as its position. Context-dependent axes are shown as such rather than resolved to a midpoint. Uncertain axes say so.

**Feels.** *"That's… actually me."* Or productively: *"I'm not sure I agree with that one"* — which is a good outcome, because it is checkable.

**Platform does.** Renders the computed DNA. Snapshots it immutably.

**Why.** The DNA is shown **before** any recommendation. Being explained to yourself before being told what to do is the difference between a product that understands you and a product that sorts you.

---

## Stage 9 · Career Narrative `[MVP]`

**Sees.** Four to six paragraphs of plain language describing how they tend to approach work, decide, respond to pressure, which environments may suit and which may challenge. Every paragraph carries a *"why do you say that?"* affordance revealing the specific answers behind it `[V1]`.

**Feels.** This is the moment. If the product works, it happens here.

**Platform does.** Assembles deterministic templates from licensed statements. A statement without sufficient evidence is **not emitted** — never softened, never hedged.

**Why.** The strongest possible answer to *"this platform understands me"*. And the strongest possible defence against overclaiming: silence where evidence is thin is more trustworthy than a hedge.

---

## Stage 10 · Career Intelligence `[MVP]`

**Sees.** How their DNA maps onto the shape of the profession — which families fit, which are adjacent, which are further away and why. Includes what the platform does **not** know and what would resolve it.

**Feels.** Oriented. The profession stops being a fog.

**Platform does.** Computes family-level fit from Signals, with tolerance bands rather than point targets.

**Why.** Most people cannot name five security professions. Showing the map before the recommendation makes the recommendation legible instead of arbitrary.

---

## Stage 11 · Career Recommendations `[MVP]`

**Sees.** Three to five named professions. Each with why it fits, what it involves, real formal requirements including Swedish regulatory context, and honest signal about what the platform is unsure of.

**Feels.** *"I could actually look into that."*

**Platform does.** Ranks on fit, never on confidence-capped values. Shows confidence separately from fit. Suppresses any recommendation it cannot explain.

**Why.** Audit F-5: the current engine sorts on capped values, so display caps reorder results and a strong match with thin evidence loses to a weaker one with fuller coverage. Fit and certainty are different things and are now shown as different things.

---

## Stage 12 · Action Plan `[MVP]`

**Sees.** Three horizons — this week, three months, longer — tailored by the context block. Concrete and small enough to start.

**Feels.** *"I know what to do on Monday."*

**Why.** A report that ends at insight has failed. The current action plan is buried at section 11 of 17, after a background selector the user could have set at the beginning.

---

## Stage 13 · Learning `[V1]`

**Sees.** Specific education and certification routes tied to a named gap, with honest coverage — *"we have good information for this profession; we're still building it for that one."*

**Platform does.** Reads the Career Intelligence Graph, which currently holds certifications for 1 of 14 matchable professions (audit F-8).

**Why.** Naming the gap honestly beats an empty section labelled "being expanded", which is what ships today.

---

## Stage 14 · Jobs `[V1]`

**Sees.** Live openings matching the recommended directions, or an honest empty state naming what would be shown.

**Why.** Closes the loop from self-understanding to opportunity. Gated behind real inventory — an empty jobs section that apologises for itself, as today's does, costs more trust than it earns.

---

## Stage 15 · Save Progress `[MVP]`

**Sees.** An offer to save, made **after** the full report has been given, not before. States plainly what saving enables: keeping this, seeing what changes when they return, adding to it over time.

**Feels.** A fair trade, offered at the moment of peak value.

**Platform does.** Migrates the anonymous session's Evidence Store to the account. **Preserves the report across authentication** — the current build's save link has no return URL, so signing in destroys the report (audit F-14).

**Why.** Registration asked before value is a paywall. Asked after, with a concrete reason, it converts far better and costs no trust.

---

## Stage 16 · Return Journey `[V1]`

**Sees.** On returning: what has changed since last time — new jobs in their directions, new learning routes, and any axis where confidence has grown.

**Feels.** *"It kept working while I was away."*

**Why.** This is where a one-time assessment becomes a career companion. The single highest-leverage stage for long-term value, and the one most assessment products never build.

---

## Stage 17 · Reassessment `[V1]`

**Sees.** An invitation after a meaningful interval or a life change. Shorter than the first time — only what has become uncertain or stale. Afterwards, an explicit comparison:

> Last March we weren't sure about your orientation to acute work. We are now — and it moved. Here's what changed.

**Platform does.** Appends evidence; never overwrites. Recency-weights the old. Recomputes the DNA and issues a new snapshot, leaving the previous one intact.

**Why.** Assessment DNA Doc 01 §5 is right that results decay. Making change visible turns decay from a weakness into the product's most compelling recurring moment — and it is only possible because evidence accumulates rather than being replaced.

---

## What the journey deliberately refuses

| Refused | Why |
|---|---|
| Registration before the report | Value first. Always. |
| Any unbuilt feature shown as "coming soon" | Audit F-11 — the current report ships a vaporware sharing section to every candidate |
| A score out of 100 | Invites comparison and implies precision the model does not have |
| A type or label | The product describes tendencies, never identity |
| Streaks, urgency, artificial scarcity | Would trade evidence quality for engagement metrics |
| Any claim without evidence behind it | Silence is the correct output for an unsupported claim |
