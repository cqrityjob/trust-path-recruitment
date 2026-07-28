# Validation statuses

Spec chapter 14. A validation status is a **claim about evidence**, not a workflow state. It must be displayed on every report (acceptance criterion 18) and must never be raised without the corresponding release gate being met.

## Assessment / bundle / role-weight-profile statuses

| Status | Minimum work done | Permitted use |
|---|---|---|
| `design` | Construct catalogue, item blueprint, SME plan, legal/privacy design | Internal development only |
| `pilot` | ≥15 independent SMEs from ≥5 security environments; 20–30 cognitive-pilot candidates in both languages | Limited unpaid pilot. **No selection decisions.** |
| `operational-development` | 200–300 field-pilot participants; item analysis, reliability, timing, fairness, technical stability; accessibility and DPIA approved | Development and structured interview. Cautious use. |
| `operational-selection` | 500+ total, criterion studies (ideally ≥200 with qualitative job outcomes), fairness and utility review, specialist approval | May be **one of several** selection sources |
| `retired` | Superseded or withdrawn | Historical reproduction only; no new assignments |

Normed / role-calibrated use (percentiles, benchmarks) is a further gate beyond `operational-selection` and is not represented as a status — it requires stable role, language and market data plus invariance/DIF analysis.

## Item statuses

`design` → `sme_reviewed` → `pilot` → `operational` → `retired`

An item authored as an AI first draft carries `authored_by_ai = true` and starts at `design`. It cannot become assignable until content review, SME review, bias/accessibility review, legal review (where `legal_basis_required`) and language adaptation approval are all complete.

## Content status vs validation status

These are deliberately separate columns.

- **`content_status`** — where the content sits in the authoring pipeline: `draft` → `in_review` → `approved` → `published` → `retired`. Immutability begins at `approved`.
- **`validation_status`** — how much evidence backs it.

A version can be `published` and still be `design`. That combination is normal and correct during a pilot: the content is frozen and reproducible, but the evidence claim is minimal. Conflating the two would let "we finished writing it" read as "it is validated".

## Hard rules

- No percentile, "top N %", or industry comparison may be shown before approved norm data exists (spec 8.3). The preliminary bands are labelled *preliminär utvecklingsprofil*.
- No status is raised automatically. Each step is an explicit, logged decision.
- Stop-the-line (spec 14.2): a scoring or lineage error that makes historical results irreproducible, automatic pass/fail or ranking going live, unexplained DIF, insufficient reliability, item or key leakage, missing DPIA, or AI producing forbidden person-statements — any of these halts release regardless of status.
