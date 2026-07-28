# Career Intelligence Mapping v3.0

**Status:** design.

> **How this document relates to the others**
> This is the recommendation engine. It consumes what [DNA Model](./security-career-dna-model-v3.0.md) produces, via the Signals defined in [Evidence Architecture](./evidence-architecture-v3.0.md) §4, and outputs what [User Journey](./user-journey-v3.0.md) stages 10–12 present.

---

## 1. The chain

```
Career DNA          8 axis positions, each with a confidence level
     ↓
Signals             per axis, per profession: position vs tolerance band
     ↓
Security Career Area       14 canonical Security Career Areas, already in the CIG
     ↓
Career Category     groupings within an area (entry · specialist · leadership)
     ↓
Individual Role     a named profession with real requirements
     ↓
Recommendation      the role, plus why, plus what is uncertain
```

Each arrow is deterministic and inspectable. No step consults a model, a heuristic nobody wrote down, or population data about "people like you".

---

## 2. Security Career Areas

The 14 canonical Security Career Areas already exist in the Career Intelligence Graph, with alias discipline, regulatory grounding and mandatory authority disclaimers for police and defence. **This is a genuine asset and v3.0 reuses it unchanged.**

`protective_operations` · `public_safety_justice` · `corrections_secure_transport` · `defence_national_security` · `corporate_security` · `critical_infrastructure_security` · `risk_management` · `crisis_management` · `business_continuity_resilience` · `cyber_information_security` · `financial_crime_compliance` · `security_technology` · `security_leadership_governance` · `investigations_intelligence`

The eight axes were derived by asking what actually separates these Security Career Areas. Every axis differentiates at least three from at least three; an axis that did not was cut.

---

## 3. Profession requirement profiles

Each profession declares, per axis, a **tolerance band** rather than a point target:

```
ProfessionProfile {
  profession_ref
  career_area_id
  bands: [ { axis, low, high, importance } ]
  validation_status
  authored_by, reviewed_by, reviewed_at
}
```

Four changes from the current model, each fixing a specific audit finding:

**Bands, not points (F-2, F-5).** A profession works across a *range*. The current model uses a point target and symmetric distance, so a maximally learning-oriented candidate is penalised for exceeding a target of 45. Under bands, being inside is a fit; being outside is a distance, and being *further* toward an end is only a mismatch if the band says so.

**Versioned data, not TypeScript literals (F-6).** The current 16 profiles are hand-authored constants — 10 `provisional`, 6 `placeholder`, **0 reviewed**. Profiles move into the versioned layer with the same review gates as item content: authored, reviewed by a named person, dated, and carrying a validation status the report can display.

**Importance, not gates (F-1).** No hard gate anywhere. The current `gateThreshold = 55` produces the worst defect in the system — three of five gates are decided by which boxes a candidate ticks on one question. Gates are replaced by importance weighting: an axis can matter a great deal without being a wall.

**No profile ships unreviewed `[V1]`.** A profession with an unreviewed profile is not recommended at all. It appears in exploration, never in results. Recommending from a `placeholder` is the failure the audit found and the reason this rule exists.

---

## 4. Computing fit

For each profession with a reviewed profile:

```
for each axis in profile.bands:
    if person.axis.confidence == emerging:  skip entirely
    if person.position within [low, high]:  contribution = importance × 1.0
    else:                                    distance = gap to nearest edge
                                             contribution = importance × (1 − distance)
    if person.axis is context_dependent:    treat as compatible with both ends

fit = Σ contribution / Σ importance   over axes actually evaluated
```

Three properties that matter:

**Rank on fit alone (F-5).** The current engine sorts on `min(raw, displayCap[confidence])` with caps of 65/82/100, so a strong match with thin evidence loses to a weaker one with fuller coverage — the ordering is partly an ordering of coverage. Here, fit determines order and **confidence is reported alongside, never folded in**.

**Emerging axes contribute nothing** — not a reduced weight. An axis the platform is unsure about must not quietly move a ranking the user cannot inspect.

**Context-dependence widens rather than narrows.** Someone genuinely flexible on an axis fits more roles, and the model should say so rather than resolving them to a midpoint that fits nothing.

### Recommendation confidence

Reported separately, from three inputs: how many of the profile's important axes were evaluated · their confidence levels · whether the profile itself is reviewed.

| Level | Shown as |
|---|---|
| **Strong** | "This is well supported by what you told us" |
| **Moderate** | "This looks like a fit — a few more answers would confirm it" |
| **Exploratory** | "Worth looking at, but we don't have enough yet to be confident" |

---

## 5. Categories within an area

Once an area fits, position within it is determined mostly by two axes:

| Category | Signal |
|---|---|
| **Entry** | Any position; no prior tenure required |
| **Specialist** | High CDA-05 or CDA-06, low-to-mid CDA-07 |
| **Coordination** | Mid-to-high CDA-07, mid CDA-08 |
| **Leadership** | High CDA-07 **and** high CDA-08 |

CDA-07 and CDA-08 are separate on purpose. A specialist can want organisation-wide scope without wanting to manage anyone; a frontline supervisor can want a team without wanting strategy. Collapsing them into one "seniority" score — which nearly every career product does — sends people into the wrong senior track.

Tenure from context item C2 gates only what is *presented as immediately available*. It never affects fit. Someone with no security experience whose profile fits leadership is shown leadership as a direction with an honest route to it, not told they are unqualified.

---

## 6. Explanation

Every recommendation carries, in the user's own terms:

1. **Why this fits** — the top three contributing axes, in plain language, with what the person said
2. **What it involves** — from the Career Intelligence Graph
3. **What's formally required** — legal versus employer requirements, distinguished, with Swedish regulatory context and the authority disclaimer where applicable
4. **What we're unsure about** — named axis, and what would resolve it

Two rules with no exceptions:

**No unexplainable recommendation is shown.** Not softened, not caveated — withheld. If the chain cannot be produced, neither can the recommendation.

**No jargon reaches the user.** The current report regex-launders engine vocabulary into plain language at render time (`engine-view.tsx:588-611`), which is a fragile symptom of internal terms leaking into user-facing output. v3.0 generates user-facing language directly from templates that never contained jargon.

---

## 7. Expressing what is not known

The current product has three "under construction" sections and an empty state offering only "retake". v3.0 handles absence honestly and specifically:

| Situation | Response |
|---|---|
| An axis is emerging | Name it. Say what it would change. Offer the shortest route to resolving it. |
| Two areas tie | Show both. Name the axis that separates them. Offer the question that decides. `[V1]` |
| Enrichment is thin | *"We have good information about formal requirements here; we're still building it for that one."* Never an empty section. |
| No profession clears the threshold | **Cannot be a dead end.** DNA and narrative still render in full, with an explicit invitation to answer more. |

Certifications currently exist for 1 of 14 matchable professions (audit F-8). Naming that honestly costs less trust than a section headed "Certifications" containing "Being expanded".

---

## 8. Diversity and dominance

Two safeguards worth keeping from the current engine, and one to add:

- **Area diversity.** If the top results all sit in one area, the last slot goes to the best-fitting alternative area within a small margin. Someone whose profile fits one area strongly should still see that the profession is bigger than that.
- **No single-profession dominance.** No result is presented as *the* answer. Language is always plural directions.
- **New: no ladder framing.** Roles are not ranked by seniority or pay, and the report never implies one is an upgrade. Audit found the current compare section states *"We do not compare salary or employment outcomes"* — correct, and v3.0 keeps it explicit.

---

## 9. What this engine will never do

1. **Never gate on a preference item.** The origin of the worst defect in the current system.
2. **Never rank on capped values.** Fit orders; confidence informs.
3. **Never recommend from an unreviewed profile** `[V1]`.
4. **Never produce pass/fail, suitability, or a readiness percentage.**
5. **Never compare a person to other people** until approved norm data exists.
6. **Never let a behavioural signal enter matching.**
7. **Never use AI in the chain.** Deterministic end to end.
8. **Never silently exclude a profession.** If something is filtered, the reason is inspectable.

---

## 10. Phase summary

| | `[MVP]` | `[V1]` | `[V2]` / `[Future]` |
|---|---|---|---|
| Areas | ✓ 14, from CIG | — | international variants |
| Profession profiles | authored, ~15 professions | ✓ reviewed, gate unreviewed out | full 41 published |
| Fit computation | ✓ bands + importance | empirical band widths | — |
| Confidence | ✓ reported separately | — | — |
| Explanation | ✓ top-3 axes, plain language | ✓ "why do you say that?" to evidence | AI-assisted phrasing |
| Tie handling | shown honestly | ✓ adaptive resolution | — |
| Categories | ✓ four | tenure-aware routes | — |
| Diversity safeguards | ✓ | — | — |
