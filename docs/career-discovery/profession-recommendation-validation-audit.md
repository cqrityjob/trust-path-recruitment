# Career Discovery — profession recommendation validation

Audit of the live v3.1 profession matching engine against the Career
Discovery product intent, the defects it found, and what changed.

Baseline: `main` at `c80de38`. All figures below were produced by replaying
raw answer vectors through the real engine and the real approved catalogue —
not by reading the specification.

---

## 1. What was audited

The complete live chain, answer to recommendation:

```
22 core answers ─▶ scoreDimensions() ─▶ 17 dimension scores
                                     ─▶ scoreProfession() per catalogue row
                                        ├─ central / supporting split (DOMAIN_ONLY_CENTRAL_RULE)
                                        ├─ fitOver()  = floor-only closeness, 0-100
                                        ├─ centralZ   = neutral-baseline shortfall z
                                        └─ gates: coverage, central coverage, central fit,
                                                  max single-dimension miss, centralZ > 0
                                     ─▶ Recommendation Priority (+ context / CIG bonus)
                                     ─▶ career-stage classification
                                     ─▶ candidate-facing top 3
```

The audit fixture is eight **answer-level** personas
(`scripts/fixtures/career-dna-personas.ts`). This matters: every pre-existing
Layer 4 guard starts from a hand-written dimension vector, so the entire
instrument above the matcher — items, option matrix, role weights,
aggregation — had never been exercised by any test.

---

## 2. What was already correct

These were verified, not assumed, and none of them were changed.

| Principle                                                | Evidence                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Matching is deterministic                                | Pure functions; no clock, I/O or randomness. Identical answers give identical rankings.                |
| No question directly selects a profession                | One item maxed moved Security Technician only to `moderate` (z 0.72), nowhere near rank 1.             |
| Technical answers raise technical affinity               | Säkerhetstekniker moves from excluded to included as CID04 evidence rises, and back out when reversed. |
| Investigative / operational / strategic answers likewise | Each persona's recommendation lands in its own evidence-supported career areas.                        |
| No `if beginner then Väktare` rule                       | No such branch exists. Beginner personas receive four materially different clusters.                   |
| Career DNA is uncontaminated by context                  | Identical Career DNA under four career stages produces **byte-identical** Profession Affinity.         |
| Generic security traits cannot match everything          | `DOMAIN_ONLY_CENTRAL_RULE` holds; a style-only profile does not clear "strong" broadly.                |
| AI is explanation-only                                   | No LLM touches ranking; `ai-explanation.ts` is read-only over a computed result.                       |

**Technical-entry differentiation already worked.** The Beginner Technical
persona ranked technical professions above guarding on Career DNA alone,
before any change. What was broken was the ordering layer above affinity.

---

## 3. Defects found

### D1 — Ranking ran on the metric the code documents as non-discriminating

`centralZ` set a binary tier; the actual order came from `fitScore`, which is
floor-only, never reads `bandHigh`, and saturates once `centralZ` gating
admits only candidates who already cleared every floor.

- Delivered order differed from affinity order in **8 of 8 personas**.
- Strong-tier `fitScore` spread: **0.7–3.9 points** on a 0–100 scale.
- An experienced Security Technician's #1 was _Security Investigator_, decided
  by 99.6 vs 99.4.
- A Head of Security with 8+ years was recommended _Police Officer_ at #2 —
  the same false-progression presentation the fit layer had already been fixed
  to prevent, arriving one layer higher.

### D2 — Context could overwhelm affinity

The context/CIG bonus was **+6 each on the saturated 0–100 scale**, i.e. up to
8× the entire observable affinity spread. Demonstrated: Beginner Technical,
identical Career DNA, one Discovery Path tag changed —

| Tag                             | #1 recommendation                              |
| ------------------------------- | ---------------------------------------------- |
| none                            | Säkerhetstekniker                              |
| SCA03 (`technical_development`) | Säkerhetstekniker                              |
| SCA09 (`advanced_analysis`)     | **SOC-analytiker**, despite a _lower_ fitScore |

A single unscored contextual self-report answer moved the headline
recommendation.

### D3 — The two candidate-facing surfaces disagreed about career stage

`ranked` was built from the ungated pass and never ran through
`classifyStagesWithPivots`, so `ranked[].stage` carried the raw stage-distance
value while `matches[].stage` carried the pivot-corrected one. **Five
mismatches across eight personas** — e.g. a Head of Security's own report
called Police Officer "explore now" in the recommendation and "career pivot"
in the tier list, from one run.

### D4 — The recommendation rendered no career stage at all

`RecommendedProfessions.tsx` showed rank, confidence and traits only. The
Beginner Investigative persona therefore saw **Riskchef, a senior role, as
headline recommendation #2 with nothing indicating it was years away.**

### D5 — Central fit had no gradation above the floor

`centralZ` is built on a _clipped_ shortfall, so everyone who clears a
profession's floors receives that profession's maximum possible z — a constant
of the calibration, not a fact about the candidate. Measured across the locked
catalogue, that ceiling is essentially the central band count:

| Central bands | Ceiling `centralZ` |
| ------------- | ------------------ |
| 3             | 1.46 – 1.65        |
| 2             | 1.17 – 1.33        |
| 1             | 0.84               |

Ranking on it therefore ranks by _how many bands the calibration author wrote_.

### D8 — A profession that could never be a strong match for anyone

Falls directly out of D5. **Security Coordinator (SP006)** has one central band
(CID02, floor 0.55, weight 0.7) and a maximum attainable `centralZ` of **0.84**
against a `FIT_TIER_STRONG_Z` of **1.0**. Because the comparator sorts by tier
first, it was permanently suppressed beneath every "strong" profession — even
for the Beginner Service/Coordination persona, whose single highest
Recommendation Priority in the whole catalogue _was_ Security Coordinator, and
whose delivered recommendation was front-line policing and guarding instead.

### D6 — No regression test exercised the instrument

All 16 golden personas inject dimension scores directly.

### D7 — Catalogue had no entry-level roles in several directions

See [the entry-gap professions](#5-catalogue-gaps).

---

## 4. What changed

| Defect | Change                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1, D5 | New `centralExpressionZ` statistic drives Recommendation Priority: weighted expression of a profession's central dimensions, standardised under the same maximum-entropy H0. Full gradation above the floor. `fitScore` keeps its meaning and becomes a tie-break. |
| D8     | `fitTier` moves onto the same statistic. Its ceiling is `0.5·Σw / √(Σw²/12)` — never below 1.73 even for a single band — so no profession can be structurally locked out of "strong" again.                                                                        |
| D2     | Bonuses re-expressed in z units, **0.1 SD each**. Observed near-peer gaps are 0.004–0.18 SD and real separations 0.26–1.43 SD, so context reorders genuine near-peers and cannot bridge a real gap.                                                                |
| D3     | The ranking pass runs through the identical career-pivot classification the tier buckets use.                                                                                                                                                                      |
| D4     | Stage badge added to the recommendation cards, reusing the existing `STAGE_LABEL` so both surfaces say the same word.                                                                                                                                              |
| D6     | `scripts/career-discovery-profession-differentiation-check.ts` — 128 answer-level assertions, wired into CI.                                                                                                                                                       |

**Unchanged:** every eligibility gate, the clipped `centralZ` that powers them,
the answer→dimension arithmetic, canonical result architecture,
anonymous/authenticated consistency, immutable historical reports, and the
"no candidate-facing percentages" rule.

`SCORING_VERSION` moves `v3.1-draft-3 → v3.1-draft-4`. The dimension
arithmetic is byte-identical — proven by holding the version string at draft-3
with every code change in place and watching all 601 existing checks pass on
the _previous_ frozen hashes.

---

## 5. Persona results, before and after

| Persona                    | Before                                   | After                                           |
| -------------------------- | ---------------------------------------- | ----------------------------------------------- |
| P1 Beginner Operational    | Ordningsvakt · Polis · Personskyddsvakt  | Polis · Ordningsvakt · Personskyddsvakt         |
| P2 Beginner Technical      | Säkerhetstekniker · SOC · Cyber          | SOC · Cyber · Säkerhetstekniker                 |
| P3 Beginner Investigative  | Utredare · **Riskchef** · Krisberedskap  | Utredare · AML · Riskchef                       |
| P4 Beginner Service/Coord. | Polis · Ordningsvakt · **Säkerhetschef** | **Säkerhetssamordnare** · Polis · Säkerhetschef |
| P5 Experienced Operational | Personskyddsvakt · Ordningsvakt · Polis  | Polis · Ordningsvakt · Personskyddsvakt         |
| P6 Experienced Technical   | **Säkerhetsutredare** · SOC · Cyber      | SOC · Cyber · Säkerhetsutredare                 |
| P7 Strategic/Leadership    | Krisberedskap · **Polis** · Riskchef     | Säkerhetssamordnare · Krisberedskap · Riskchef  |
| P8 Risk/Crisis             | AML · Riskchef · Krisberedskap           | Riskchef · Krisberedskap · AML                  |

The two headline corrections: a technical persona's #1 is now a technical
profession, and the coordination persona finally receives the coordination
direction its answers pointed at. Police Officer no longer appears anywhere in
a Head of Security's top 3.

Every result above carries its career stage on the card, so "Riskchef" for a
beginner now reads _Longer-term direction_ rather than as an unqualified
recommendation.

---

## 5b. Side effect: `fitTier` became honest about flat profiles

Moving `fitTier` onto `centralExpressionZ` (D8) also gave the tier real
meaning, because the statistic it now reads can vary. Across the 16 golden
personas, roughly half the previously-"strong" rows became "moderate":

| Persona                                                                    | "strong" matches after |
| -------------------------------------------------------------------------- | ---------------------- |
| Student · New to security · Career changer · Sparse/ambiguous              | **0**                  |
| Väktare (1–3y) · Experienced Säkerhetssamordnare                           | 1                      |
| Technical · AML/compliance · Risk/crisis · Broad (junior) · Broad (senior) | 2                      |
| Säkerhetschef · Cyber · Investigation                                      | 3                      |
| Experienced Väktare · Operational guarding                                 | 4–5                    |

Under the clipped statistic, a flat and unremarkable profile that merely
cleared several professions' floors was told it was a **strong** match for all
of them. It now gets the same professions, in the same order, described as
"worth exploring" instead — and a pronounced profile still gets "strong".

This changes no eligibility and removes no recommendation: every persona still
receives a full top 3. Only the strength of the claim around it moved, which is
the same restraint `RecommendationConfidence` already applies to `indicative`.

---

## 6. Catalogue gaps

Four entry-level professions are drafted in
`supabase/migrations/20261006090000_cd_layer4_entry_gap_professions.sql`, all
**`approved_for_ranking = false`** and absent from the TypeScript catalogue
mirror — they do not reach candidates in this branch.

Every one is a real, already-catalogued Swedish role from `cig_professions`.
No title was invented.

| ID    | Profession                                    | Area  | Central dimensions                                              | Solves                                                             |
| ----- | --------------------------------------------- | ----- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| SP015 | Butikskontrollant (Loss Prevention Officer)   | SCA06 | CID10 Investigative `0.55` w0.8 · CID01 Operational `0.50` w0.6 | Beginner Investigative had no entry role — only `developing` ones  |
| SP016 | Larmoperatör (Alarm Centre Operator)          | SCA01 | CID03 Analytical `0.55` w0.7 · CID01 Operational `0.50` w0.6    | Operational-analytical entry; a common genuine first security job  |
| SP017 | Säkerhetsreceptionist (Security Receptionist) | SCA01 | CID08 Service `0.60` w0.8 · CID01 Operational `0.45` w0.5       | Service/coordination direction had no entry expression             |
| SP018 | Larminstallatör (Alarm Installer)             | SCA03 | CID04 Technical `0.60` w0.85 · CID01 Operational `0.45` w0.45   | Technical entry _breadth_ — the alarm/systems role alongside SP014 |

Supporting dimensions, requirements and per-profession stage rationale are
documented inline in the migration header.

**Deliberately not added: an entry-level risk/crisis profession.** That gap is
real, and risk management and crisis preparedness are genuinely not
entry-level occupations in the Swedish market. No profession in
`cig_professions` fills the slot, and inventing one would be exactly the
artificial title this catalogue must not contain. The honest product answer is
the "Possible next step" / "Longer-term direction" label the report now renders.

### Open questions for owner / SME review

1. **SP018 vs SP014.** CIG records them as `lateral` — adjacent, not distinct.
   Their central sets differ only in the CID04 floor (0.60 vs 0.65). SP018 may
   be redundant.
2. **SP015's career area.** CIG files it under the operational-security
   _family_ (who employs it); this row assigns SCA06 Investigations (what the
   work _is_). The taxonomies genuinely disagree; the owner should confirm.
3. All bands are `evidence_basis = 'derived'`, `confidence = 'low'` — authored
   from role descriptions, not official occupational data. Practitioner review
   is required before `approved_for_ranking` can be set.

---

## 7. Known limitations, not fixed here

- **`bandHigh` is still never read.** It is persisted and round-tripped but has
  no calibrated semantics (a mechanical `bandLow + 0.3..0.4` offset, 58% of
  rows at ≥ 0.9). Giving it scoring authority is a calibration decision.
- **Residual band-count effect.** For a uniformly strong candidate,
  `centralExpressionZ` grows as `√n` in the number of central bands. This is
  statistically defensible — more independent confirmations _are_ more
  evidence — and far weaker than the degenerate behaviour it replaces, but it
  is a real property worth knowing.
- **`centralZ` still saturates** where it is used for eligibility. That is
  appropriate for a gate and inappropriate for an ordering, which is why the
  two are now separate statistics.
