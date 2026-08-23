# Assessment Foundation P0 — what changed and what it proves

Branch `feat/assessment-foundation-p0-hardening`, from `origin/main` at
`c224934625b5176e87e3beb4bc591211e7a5557a`.

## The defect

The Assessment Foundation audit reported that the preferred answer was always
key `a`. The baseline snapshot says it was worse than that. Across the **102
authored, non-fixture keyed items** in the whole product:

| | count |
|---|---|
| preferred option displayed **first** | **102 / 102** |
| preferred option **strictly the longest** | **101 / 102** |
| preferred option keyed `a` (or the first key) | 102 / 102 |
| `randomise_options` authored `true` | 105 items |
| `randomise_options` actually honoured anywhere | **0** |

A candidate who read nothing and picked the first option every time scored full
marks on every keyed scenario item in the product. Average preferred-option
length was 128 characters against 83 for the longest distractor.

## What was done

### 1. Option randomisation is real — `20260907090000`

`scp_get_attempt_items` ordered options by `display_order` and ignored
`randomise_options` entirely. It now orders by a per-attempt permutation:

* `scp_attempts.option_order_seed`, assigned by trigger at attempt creation and
  immutable thereafter — the same convention `cd_sessions.option_order_seed`
  established for Career Discovery v3.1.
* `scp_option_order_key(seed, item_version_id, option_id)` — a pure function, so
  the order is stable across refresh and resume without persisting a row per
  option, and different attempts get different orders.
* Ordered scales (`biq_frequency`, `sjt_rate_effectiveness`) are excluded
  **structurally**, not by authoring convention.

Scoring needed no change: `scp_submit_attempt` has always read
`selected_option_id`, the option's identity, never its position.

### 2. Publication quality gates — `20260907092000`

Six hard gates now block the transition of an assessment version into
`approved` / `published`:

| gate | rule |
|---|---|
| `answer_key_balance` | preferred key spread within ±1 of even, per option-count cohort |
| `answer_position_balance` | same rule for the authored display position |
| `option_length_balance` | preferred strictly longest in ≤ 40% of item-languages, **and** mean preferred length-rank ≥ 2.00 |
| `item_review_gates` | SME, bias, cognitive, language, accessibility and legal review all cleared |
| `declared_review_requirements` | every required `scp_review_requirements` row cleared or waived |
| `constructed_response_rubrics` | every constructed response has a published rubric |

`scp_assessment_version_publication_readiness(version_id)` returns the whole
report and is callable on a draft, so an author can see what is wrong before
trying. **The gates only ever refuse.** Nothing in this PR approves anything,
clears a review, or raises a validation status.

Two design points worth knowing:

* The rule applies to **three-option items too**. An earlier draft gated only
  four-option items, which would have reported "not applicable" on 97 of the
  102 defective items — every one of them a three-option item. A rule a bank can
  escape by authoring one fewer option is not a rule.
* Length rank is a **midrank**. Four options of identical length carry no
  signal at all, but under a naive "how many are strictly longer" the preferred
  option scores 1 — the worst possible value — and a perfectly balanced item
  would be reported as the most biased one there is.

Run against the untouched bank, the gates fail **every authored assessment**,
which is the correct answer.

### 3. Evidence-based immutability — `20260907091000`

`scp_guard_published_immutable` keyed on `content_status`, an editorial state a
person sets and can set back. Content is now also frozen once its assessment
version has produced evidence somebody may act on — an attempt in `recruitment`
governance, or one run against content already declared pilot or operational —
regardless of what `content_status` says. Development and closed-test attempts
freeze nothing, which is what keeps draft content iterable.

### 4. The flagship content — `20260907093000`

**No scenario was rewritten. 0 of 22 stems changed** (the no-mass-rewrite rule
allowed up to 25%). The full BEFORE → AFTER diff is in
[`assessment-foundation-p0-item-diff.md`](assessment-foundation-p0-item-diff.md).

| | before | after |
|---|---|---|
| items on the form | 50 | 56 |
| scenario (SJT) items | 22 | 28 |
| self-report items | 24 | 24 |
| constructed responses | 4 | 4 |
| options per scenario item | 3 | 4 |
| scoring levels | 3 / 1 / 0 | 3 / 2 / 1 / 0 |
| preferred key | `a` × 22 | a=7 b=7 c=7 d=7 |
| preferred position | first × 22 | 1=7 2=7 3=7 4=7 |
| preferred strictly longest (sv) | 22 / 22 | **4 / 28** |
| mean preferred length-rank (sv) | 1.00 | **2.57** (2.50 = no signal) |
| SCC-04 observed items | 2 | **5** |
| SCC-07 observed items | 2 | **5** |

Every item gained the second-best (score 2) strategy the original 3/1/0 key had
no room for. No cell of the 4×4 key × position grid holds more than two items,
so neither predicts the other.

Six new observed items were added — three primarily SCC-07, three primarily
SCC-04 — with no jurisdiction-specific use-of-force content, no police role and
no statutory-power question.

### 5. Self-report metadata

All 24 items of block C carried `primary_construct = 'situational_judgement'`.
They are behavioural self-report. The vocabulary gained
`self_reported_work_behaviour`, and a trigger now requires
`evidence_source_type = 'self_report'` and that construct to agree in both
directions.

**`so-rj-c07` and `so-rj-c19`: deliberate ideal-point scoring, keys unchanged.**
The evidence is in the authored data — on both items the author wrote a
rationale explaining why the extreme is not the good answer. What was defective
is that only two of four options carried one, which is exactly why an
ideal-point key reads as drift. The shoulders are filled in, and a regression
test fails if either profile is flattened.

### 6. Pilot instrumentation — `20260907094000`

Most of what a pilot needs was already recorded. Two things were missing:

* **`scp_candidate_responses.display_order`** existed since Phase 1b and was
  never written by anything. Now that each attempt has its own permutation, the
  displayed position is the one measurement that shows whether randomisation
  actually removed the position bias. It is computed server-side from the
  attempt seed, never accepted from the client.
* **`first_responded_at`** — `responded_at` is overwritten on every re-save, so
  time-per-item had no start point.

## Verification

* **Full DB suite green**, fail-fast: every pre-existing assertion count
  unchanged, plus **45 new assessment-foundation assertions**.
* **Mutation-tested gates**: an all-first-key form, a preferred-always-first
  form and a preferred-always-longest form each turn a gate red; one
  legitimately long option does **not** fail the form.
* **Live browser run** against local Supabase, real employer-assign path:
  56 items in 16/6/24/6/4 blocks, four options per scenario item, preferred
  option rendered **third**, byte-identical option order across a page reload
  **and** a genuine logout/login, screen position recorded correctly (authored
  position 1, displayed position 3, recorded 3), no console errors.
* **Full local journey**: 56 answers → submit → 49 evidence rows and 7 human
  reviews → reviews completed by a separate reviewer seat → report released,
  containing no pass, fail, hire, suitability or ranking language.
* `typecheck`, `build`, `migrations:check` and 16 guard scripts all pass.

## Findings for the owner — not fixed here

1. **Everything displays as `follow_up`.** `scp_compute_maturity` requires
   `min_contexts = 2` for `consistent_evidence`, and `scp_submit_attempt` stamps
   every response from one form with the same context
   (`assessment_form:<form_id>`). So a single assessment can never exceed
   `developing_evidence`, and `scp_display_evidence_state` maps both
   `developing_evidence` and `limited_evidence` to `follow_up`. The report
   therefore cannot currently distinguish five observations from one. Raising
   SCC-04 and SCC-07 to five items removes the *fragility* — with two
   observations a single weak answer drops the weighted mean under 0.55 and
   collapses the competency — but the display ceiling is a separate decision
   about the maturity model, which this PR deliberately did not touch.
2. **SCC-08 has one observed item** and sits at `limited_evidence`. Not in the
   P0 scope, but it is the same class of defect as SCC-04 and SCC-07 were.
3. **The six competence assessments still fail every balance gate.** That is by
   design: Phase 10 said not to restructure them. They cannot be published until
   they are repaired, which is the gate doing its job.
4. **`reverse_scored` is read by nothing.** `scp_submit_attempt` scores from
   `score_value` alone. On an ideal-point item it cannot mean anything. Left as
   authored rather than cleared, since clearing it would imply a scoring change.
5. **`so-rj-b01` retains apparent sex in a signalement.** Kept because a
   description of a person is operationally relevant in security reporting, and
   the item's whole point is to teach the difference between that and
   "looked suspicious". Flagged for bias review rather than decided here.

## Status, stated plainly

The assessment remains **draft / design**, AI-authored, `sme_reviewer_count = 0`
on all 56 items, with all five review requirements outstanding on every one.
Nothing here is a review. No psychometric claim is made or implied: no
reliability coefficient, no norm group, no percentile, no predictive validity.

The SME review pack is at
[`assessment-foundation-p0-sme-review-pack.md`](assessment-foundation-p0-sme-review-pack.md).
