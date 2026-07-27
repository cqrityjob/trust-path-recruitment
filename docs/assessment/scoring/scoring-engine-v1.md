# Scoring engine v1 — specification

**Status: specified, not implemented.** Implementation is PR-D. This document fixes the contract now so PR-A's schema and PR-E's report contract agree with it.

Spec chapter 8.

## Non-negotiables

- Deterministic, version-locked, reproducible. The same valid response payload + form version + scoring version always produces the same score.
- Server-side only. **No scoring key ever reaches the browser.** Enforced structurally in PR-A: `scp_item_options` (the key) is a different table from `scp_item_option_texts` (the label), and RLS denies both to every non-authoring account.
- Generative AI may not compute, adjust or influence a score.
- Core and Profession Module scores are calculated and stored **separately**, and displayed side by side.
- No pass/fail, no suitability classification, no automatic ranking, no hiring recommendation.

## Formulas

```
SJT_normalised = 100 × (obtained_SJT − min_SJT) / (max_SJT − min_SJT)
BIQ_normalised = 100 × (obtained_BIQ − min_BIQ) / (max_BIQ − min_BIQ)

competency_score = 0.70 × SJT_normalised + 0.30 × BIQ_normalised

Core_Summary    = Σ(competency_score × approved_role_weight) / Σ(approved_role_weight)
```

Raw scores and the scoring version are persisted alongside the 0–100 presentation scale.

**The 70/30 split is a pilot start model, not a scientific fact.** It changes by issuing a new scoring version, which never alters historical results.

The Core Summary Index is *indicative only*. It may never be displayed without the full competency profile and uncertainty information beside it. There is deliberately no single hidden overall suitability score.

Role weights come from a `scp_role_weight_profiles` row and are only usable in production once that profile reaches an approved validation status — the indicative 1–12 table in spec 5.2 is explicitly not a validated weighting model.

## Preliminary description bands

Labelled *preliminär utvecklingsprofil* wherever shown. No percentiles, no "top N %", no industry comparison until approved norm data exists.

| Range | Display name | Permitted interpretation |
|---|---|---|
| 0–39 | Behöver verifieras | Limited support for the competency in the tested situations. Structured follow-up required. |
| 40–59 | Varierande stöd | Both stronger and weaker strategies appear. Context and interview matter. |
| 60–79 | Tydligt stöd | The response pattern supports the competency in many tested situations. |
| 80–100 | Mycket tydligt stöd | Consistently strong strategies in the test. Still not a guarantee of actual behaviour. |

## Quality flags

Observation flags, never a "lie score". A flag lowers interpretation strength or requires manual review; it never invalidates an attempt automatically and never implies dishonesty.

| Flag | Trigger | Consequence |
|---|---|---|
| `completion_quality` | Many unanswered items or an abandoned session | Report marked incomplete; no score if minimum coverage is missing |
| `rapid_response` | Extremely short time on several items vs the pilot distribution | Reduced interpretation strength |
| `straightlining` | Identical response pattern across long BIQ blocks | Manual review, cautious interpretation |
| `inconsistency` | Large differences between similarly worded items | Shown as *varying responses*, never as deception |
| `technical_anomaly` | Network error, double submit, missing events | Attempt locked for technical review |
| `language_support` | Completed with a documented language or accessibility adaptation | Stated without evaluation |

Technical anomalies stay distinguishable from response-quality indicators.

## Interpretation strength

| Level | Criteria | Display |
|---|---|---|
| Limited | Insufficient item coverage, technical anomaly, low preliminary reliability, or several response flags | Not to be used for selection before re-administration |
| Sufficient | Approved coverage and administration, no serious flags | May be one of several information sources |
| Strong | Good administration, stable reliability, validated version for the current use | Still decision support; human judgement required |

## Integrity requirements

Idempotent submission (a duplicate submit produces exactly one final scoring run), immutable scoring runs, scoring-version locking, a server-controlled and hashed scoring payload, audit logs, golden fixtures, reproducibility tests, safe retry handling. A content-hash mismatch stops scoring and raises an incident (spec T-018).
