# Career Discovery v3.1 — release-state decision pack

**For owner decision. Prepared 18 August 2026 (Phase 0C).**

**Nothing in this pack changes scoring, content, calibration or a review gate.**
No version string is renamed. No gate is approved. This is a description of the
current state and the one decision it requires.

---

## 1. The active versions

| Version axis | Value | What it governs |
|---|---|---|
| `DEFINITION_ID` | `security-career-discovery-v3` | Catalogue identity, shared with v3.0 |
| `DEFINITION_VERSION` | `2026-scd-v3.1.0` | The instrument as a product-level whole |
| `CONTENT_VERSION` | **`v3.1-draft-3`** | Item wording and options |
| `SCORING_VERSION` | **`v3.1-draft-3`** | Role weights, loadings, aggregation, confidence |
| `OPTION_MATRIX_VERSION` | **`v3.1-draft-2`** | Which option loadings the matrix table holds |
| `PATTERN_DEFINITION_VERSION` | **`v3.1-draft-3`** | Central/supporting sets and resolution thresholds |
| `TAXONOMY_VERSION` | `cig-areas-v1` | The Security Career Area taxonomy |
| Session structure | **28 questions — 2 context + 22 scored + 4 adaptive** | Asserted at import |
| `lifecycle_status` | `active` since `20260731100000` | Whether a session may be created |

The whole tuple is frozen into every report snapshot, so any historical report
remains reproducible against the exact versions that produced it.

---

## 2. Why `draft-1`, `draft-2` and `draft-3` exist

They are **not** three competing drafts. They are three successive, documented
corrections, and the axes move independently by design — which is why the four
granular versions are not all on the same number.

| Step | What changed | Which axes moved |
|---|---|---|
| `draft-1` | The original v3.1 instrument seed (`20260730100000_career_discovery_v3_1_instrument.sql`) | all |
| `draft-2` | **Owner Approval Gate item 2.** CID02 Leadership had a single primary source (CQ13) while materially driving two profession centrals. Two existing direct-observed-behaviour tertiary loadings on CQ06 and CQ09 were promoted to secondary. **No wording, option text, dimension span or option value changed** — only the role, and therefore weight, of two existing loadings | `OPTION_MATRIX_VERSION` → `draft-2` |
| `draft-3` | **Final Autonomous Matching Engine Completion Mandate.** CQ21 and CQ22 were added so CID17 (Regulatory & Compliance Orientation) had a real evidence source and could clear the 0.60 dominance cap. CID17 became a 17th matchable dimension; CID06 and CID11 evidence weights shifted accordingly. CP06 "Compliance Guardian" swapped CID09 — a work-style proxy that never described compliance work — for CID17 | `CONTENT_VERSION`, `SCORING_VERSION`, `PATTERN_DEFINITION_VERSION` → `draft-3` |

`SCORING_VERSION` skipped `draft-2` for a mechanical reason worth recording:
`STORY_TEMPLATE_VERSION` already held that string, and `story.ts` has a guard
requiring the two to differ. That is a naming constraint, not a missing step.

**`OPTION_MATRIX_VERSION` remains at `draft-2` deliberately** — the loading matrix
did not change in `draft-3`, and bumping it would falsely imply a re-seed.

---

## 3. Why live scoring points at `draft-3`

Because `draft-3` is the most recent correction, and each was a fix to a defect
the previous state genuinely had: a dimension with no real evidence source, and a
career pattern defined by a proxy trait instead of its actual defining one. The
alternative — running on `draft-1` or `draft-2` — would mean knowingly scoring
against a model already established as wrong.

The exact weight deltas are pinned in `EXPECTED_WEIGHTS` in
`scripts/career-discovery-v31-check.ts`, so a silent drift fails CI.

---

## 4. The seven review gates

**None is approved. None was approved automatically. None is approved here.**

| Gate | Status |
|---|---|
| SME review — ≥3 independent security professionals, ≥2 environments | ☐ not started |
| Language review — native-speaker review of all Swedish; English as an approved adaptation | ☐ not started |
| Accessibility review — reading level, no colour-only or sensory dependence | ☐ not started |
| Bias review — cultural neutrality, no protected-characteristic proxies, balanced option desirability | ☐ not started |
| Privacy / legal review — GDPR, DPIA, lawful basis | ☐ not started |
| Psychometric review — construct validity, ipsative trade-off design, item statistics after pilot | ☐ not started |
| Consent step — **the experience presents none at all** (Phase 0C §8.3) | ☐ does not exist |

The seventh is not a gate that is pending. It is a gate with nothing behind it:
`cd_sessions.consent` exists and nothing writes it, because there is no consent
control in the product to record.

---

## 5. The decision

> **Should current external usage remain closed-test / internal until release
> governance is complete?**

### It already does — and that should not be relaxed.

`v31-public.functions.ts` gates **persistence**, not answering: a signed-out
visitor may answer every question, but nothing is written and no report exists
until they sign in, and a real run persists only for a platform admin or a named
member of `cd_internal_testers`. That table starts empty and is populated one
person at a time through `cd_grant_internal_tester()`.

So `lifecycle_status = 'active'` answers "is the content ready to administer",
while the internal-tester gate answers "who may actually use it". Two independent
questions, correctly separated.

**Recommendation: keep it closed-test.** Six review gates are not started, the
seventh does not exist, the validation status is `design`, and the product has no
consent step. Opening it broadly would mean administering an unreviewed
instrument to the public without a consent record — which no version string
change can fix.

**What opening it would require, in order:** a consent step and its lawful basis
(owner + legal) → language, accessibility and bias review → SME review →
pilot-scale data → psychometric review. Each is an explicit, logged decision.

### Two things that must not happen meanwhile

- **Do not rename `v3.1-draft-3`.** The string is frozen into every report snapshot already issued. Renaming it to something that sounds releasable would break reproducibility and would claim a review status that does not exist.
- **Do not recalibrate.** No weight, loading, threshold or pattern definition changes as part of release governance. If pilot evidence later justifies recalibration, that is a new version with its own gates.

---

## 6. What Phase 0C changed here

Nothing in Career Discovery's scoring, content or calibration.

One privilege change touching CD data: `cd_option_loadings` is no longer readable
by any authenticated account (it has no application reader — the engine scores
from the TypeScript matrix). `cd_profession_profiles` remains readable and could
not be closed without altering a frozen CD object; two prepared options await an
owner decision in the [Phase 0C report](../technical/phase-0c-canonical-baseline-repair.md) §8.2.

One documentation correction: the instrument serves **28 questions with 22
scored**, not 26 and 20. The code has asserted 28 at import since v3.1; the stale
figure survives in older prose.

---

## 7. Owner decision recommendation — what must be approved to leave internal test

Recorded as a recommendation. **Nothing here is approved by engineering, and no
gate is marked cleared.**

### Required, in order — each is an explicit, logged owner decision

| # | Approval | Why it must come first |
|---|---|---|
| 1 | **Lawful basis and consent/acknowledgement design** | Career Discovery has *no* configured processing basis and *no* consent control. Administering it externally without one processes personal data with nothing recorded. See the [consent/GDPR owner pack](../technical/career-discovery-consent-gdpr-owner-pack.md) |
| 2 | **Language review** — native-speaker review of all Swedish; English as an approved adaptation | Wording is the instrument. An unreviewed item measures something nobody chose |
| 3 | **Accessibility review** — reading level, no colour-only or sensory dependence | Cheap to run, and a failure here invalidates results for the people it excludes |
| 4 | **Bias review** — cultural neutrality, no protected-characteristic proxies, balanced option desirability | Must precede real candidates, not follow them |
| 5 | **SME review** — ≥3 independent security professionals from ≥2 environments | Content validity for the 17 dimensions and the profession profiles |
| 6 | **Pilot-scale data collection** under 1–5 | The only way to obtain item statistics |
| 7 | **Psychometric review** — construct validity, the ipsative trade-off design, item statistics | The last gate, and the only one that can be evidenced rather than judged |

### The minimum to move from *internal test* to *closed pilot*

**Items 1–4.** With a lawful basis, reviewed language, accessibility and bias
clearance, the instrument may be administered to a **named, consenting pilot
group** — with results labelled `design` validation status and used for
development conversation only, never for selection.

### The minimum to move to *public use*

**All seven.** Public use additionally requires that the result stops being
described as provisional, which needs item statistics that do not exist yet.

### What must NOT happen at any of these steps

- **Do not rename `v3.1-draft-3`.** It is frozen into every snapshot already issued; renaming it to something that sounds releasable breaks reproducibility and claims a review status that does not exist.
- **Do not recalibrate.** No weight, loading, threshold, pattern definition or profession changes as part of release governance. Recalibration is a new version with its own gates.
- **Do not raise `lifecycle_status` as a shortcut.** It answers "is the content ready to administer", not "who may use it". Access is the `cd_internal_testers` gate, and widening access is decision 1 above, not a status flip.

### Engineering's position

The current state is honest and safe: an unreviewed instrument, frozen, reachable
only by named internal testers, with calibration data now closed to ordinary
accounts. **The blocker is decision 1** — it is not a code problem, and the code
change once it is decided is small.
