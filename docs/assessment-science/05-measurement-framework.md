# Document 05 — Measurement Framework

**Derives from:** [Document 04 — Evidence Framework](./04-evidence-framework.md).
**Scope note:** governs response-scale selection for every future Question Version across every CQrityjob assessment product.

## 1. Governing principle: no universal scale

A single global response scale is a measurement-science error, not a
simplification. Different measurement goals have different
statistically and psychometrically preferred formats, and forcing
everything onto one scale (a common shortcut, including in some
commercial instruments, for authoring convenience rather than
measurement quality) degrades precision exactly where it matters most.
This document is written explicitly around the fact that the locked
architecture already stores `scale_min`/`scale_max` **per Question
Version**, not as a platform-wide constant (Phase 1 schema; confirmed
compatible with mixed scales and full historical reproducibility in
the Phase 1 report) — the schema was already built to support this
principle; this document is the reasoning that should govern how
content authors actually use that flexibility.

**This is also the explicit answer to the standing scale question**
between the production public assessment's 1–5 scale and the earlier
draft proposal of 1–10: the correct resolution is neither globally —
scale should be chosen per Question Version against the criteria
below, and the *production* public assessment's existing 1–5 scale and
its rating-type items remain untouched by this document, per the
locked architecture's explicit decision to keep that product
operationally frozen (Document 03 §5c).

## 2. Scale/format catalogue and when each is scientifically strongest

### Binary (Yes/No, True/False)

**Strongest for:** unambiguous factual or presence/absence content —
"has this training been completed," "did you observe X." Also useful
as a fast, low-burden gate before a more detailed follow-up.
**Weak for:** anything with genuine gradation (frequency, intensity,
quality) — collapses real variance and reduces measurement precision.
**Typical use in this framework:** knowledge/factual checks, gating
questions ahead of a scenario, never for D1–D12 dimension estimation
directly.

### Multiple Choice (single-select, unordered options)

**Strongest for:** SJT "most/least effective" response selection
(Document 04) where options represent qualitatively distinct
approaches, not points on a single continuum.
**Weak for:** anything that is genuinely continuous (don't force a
continuous construct into discrete unordered buckets).
**Typical use:** the primary format for Situational Judgement items.

### Ranking

**Strongest for:** forced relative prioritization (Document 04) —
threat severity ordering, priority-setting exercises. Statistically
preferred over multiple independent ratings when the actual decision
being modeled is inherently comparative (you cannot attend to five
threats "equally," you must prioritize).
**Weak for:** long lists (cognitive burden rises sharply past ~5–7
items — a well-established working-memory constraint, not specific to
this platform) and for constructs that aren't naturally comparative.
**Typical use:** D7/D9 priority and severity-ordering exercises,
short lists only.

### Forced Choice (ipsative pairs/tetrads)

**Strongest for:** reducing social-desirability distortion and
acquiescence bias (Document 04's self-rating weakness) by requiring a
choice between two similarly-desirable-sounding options rather than
independently rating each — a well-documented technique for improving
measurement of exactly the dimensions (D3, D9) where straight
self-rating is weakest.
**Weak for:** producing scores that are directly comparable in
absolute terms across people if used naively (classic ipsative scoring
produces relative-within-person, not absolute-between-person, scores)
— must be paired with appropriate scoring methodology (a Phase 2B/
scoring-design concern, not resolved in this document) if used for
between-candidate comparison.
**Typical use:** targeted use for D3/D9 self-report items specifically
because of the bias-reduction property, not a default format.

### Likert (agreement/frequency scales)

**Strongest for:** self-rating and attitude/preference measurement
where genuine gradation exists and comparability across people (not
just within one person) is required — the standard, well-validated
format for this purpose across decades of survey-methodology research.
**Weak for:** the exact dimensions where self-rating itself is weak
(D3, D9 — Document 03 §4); a well-formatted Likert item does not fix
an underlying self-report validity problem.
**Point-count choice within Likert:**
- **1–5** — the better default for most self-rating and frequency
  items. Response-scale research consistently finds respondent
  discrimination ability drops off past roughly 5–7 points for
  most people on most constructs (a well-replicated finding, e.g. in
  Miller's classic "seven plus or minus two" tradition and later
  scale-optimization research), and shorter scales complete faster
  with equal or better reliability for many item types.
- **1–7** — appropriate where finer discrimination genuinely adds
  value and the construct supports it (some attitude/preference
  measurement, some confidence-rating use) — a reasonable middle
  ground, not the default.
- **1–10** — appropriate specifically where the *number itself* is a
  meaningful, familiar communication convention to the respondent or
  the eventual report reader (e.g. a self-assessed confidence-level
  communicated back to a candidate in a career-guidance narrative,
  where "7 out of 10" is intuitively legible in a way "a 6 out of 7
  Likert response" is not) — i.e. chosen for *communication fidelity*
  to a human reader, not assumed as a generically "more precise"
  default. Using 1–10 as a default because it "sounds more granular"
  is explicitly rejected here: added scale points beyond respondent
  discrimination ability add noise, not precision.
**Typical use:** self-rating (Domain J self-direction items,
preference/career-guidance content), confidence ratings (paired with
SJT per Document 04).

### Frequency Scales

**Strongest for:** behavioral-questions content where the actual
measurement target is "how often," not "how much I agree" — a
different construct than attitude agreement, and should use frequency-
anchored labels ("Never / Rarely / Sometimes / Often / Always" or a
quantified equivalent), not a generic agreement scale relabeled.
**Weak for:** attitude, preference, or hypothetical-judgement content
where a true frequency doesn't exist to report.
**Typical use:** behavioral-question items (Document 04) for D3, D4,
D11.

### Confidence Scales

**Strongest for:** confidence-rating items paired with SJT (Document
04) — typically a percentage or 1–5/1–10 scale depending on the
communication-fidelity reasoning above; the calibration signal comes
from comparing stated confidence to actual response effectiveness, not
from the raw number.
**Weak for:** standalone use without a pairable substantive judgement
to calibrate against.
**Typical use:** paired items targeting D2, D9.

## 3. Positioning against commercial-vendor practice

Several well-known commercial instruments default to a single scale
family across their entire item bank for operational simplicity (fixed
Likert throughout, or a fixed forced-choice format throughout). That
is a legitimate commercial trade-off for a general-purpose,
industry-agnostic product where authoring cost and cross-product
consistency dominate. CQrityjob is neither general-purpose nor
optimizing for authoring convenience over measurement precision: the
architecture already stores scale per Question Version at no marginal
schema cost, so there is no engineering reason to default to a single
scale, and Document 04 has already established that different
dimensions have meaningfully different evidence-quality profiles. The
position here is not "1–10 is better than 1–5" or vice versa — it is
that **asking which single scale is best is the wrong question**, and
answering it correctly requires knowing what is being measured first
(§2 above), which is exactly the discipline this framework and
Document 03's Dimension model exist to enforce.

## 4. Practical decision procedure for Phase 2B content authors

1. Identify the Dimension(s) the item targets (Document 03).
2. Identify the Evidence method being used (Document 04).
3. Select the format/scale from §2 whose "strongest for" column
   matches both — not the format that is fastest to author.
4. If the item is a self-rating on D3 or D9, actively consider forced-
   choice or behavioral-frequency framing instead, per Document 04's
   explicit caution about self-report weakness on these dimensions.
5. Record the choice and rationale at Question Version authoring time
   so a later reviewer (human or, per Document 08, AI-assisted) can
   verify format-to-construct fit — this is a Blueprint Principle,
   formalized in Document 06.
