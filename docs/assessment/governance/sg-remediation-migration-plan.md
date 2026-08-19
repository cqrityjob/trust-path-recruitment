# SG closed-test remediation — migration plan

**Status: proposed, NOT applied.** No SQL in this document has been executed
against any database. No file has been created in `supabase/migrations/`. No row
has been written to any migration ledger. `supabase db push` has not been run.

Seven migrations, in dependency order. **M1 and M2 both rewrite
`scp_complete_human_review` and must be authored as one file or strictly
sequenced M2 → M1.** M3 is blocked on SME confirmation (Decision 3); M8 is
blocked on the wider SME decision (Decision 4) and is described only in outline.

Every one of these is forward-only and additive. None rewrites an applied
migration. None deletes a row that any report depends on.

---

## M1 — Human-review contribution derives from governed scoring

**Owner decision 1.**

### 1. Purpose

Remove the constant `0.5` that is currently written as the evidence contribution
for every human-reviewed response, and replace it with the item's own governed
scoring — the same formula the deterministic path already uses. The reviewer
validates whether that reading stands; the reviewer does not invent a number.

The constant lives in three places today and all three must go:
`ReviewQueue.tsx:265` (literal), `academy-employer.functions.ts` (`z.number()
.default(0.5)`), and `scp_complete_human_review`'s `_contribution numeric
DEFAULT 0.5`.

### 2. Exact objects affected

- `public.scp_complete_human_review(uuid, text, text, numeric, text)` — replaced.
  The `_contribution` parameter is **dropped**, changing the signature, so the
  old overload must be explicitly dropped rather than left callable.
- `public.scp_competency_evidence` — new nullable column
  `derivation_basis jsonb`.
- `public.scp_guard_evidence_immutable` (the trigger function at
  `20260802090000` line ~562) — extended to make `derivation_basis` immutable
  alongside `contribution`.
- No RLS policy, no constraint on any other table.

### 3. Canonical SQL approach

Contribution is derived **inside** the function, per format, from the same
sources the deterministic path reads:

- `sjt_best_response` → `score_value(selected) / max(score_value over item)`
- `sjt_best_worst` → `(is_best_key(best_chosen) + is_worst_key(worst_chosen)) / 2`
- `constructed_response` → **not derivable today.** See M1b; until it lands,
  `scp_complete_human_review` must `RAISE EXCEPTION` for this format rather than
  invent a value.

`derivation_basis` records how the number was produced, e.g.
`{"method":"governed_item_score","format":"sjt_best_response","selected_score":3,"item_max":3}`
so the append-only row explains itself without a join to a scoring key the
reader may not be allowed to see. The existing `provenance_type`,
`provenance_ref` (the review id), `assessor_actor_id` and the review's own
`outcome` already carry provenance, review reference and outcome.

**The reviewer outcome deliberately does not scale the contribution.** An SJT
response is a single option choice; there is nothing for a reviewer to
re-measure. `upheld` means the governed reading stands. `adjusted` /
`overturned` means the reviewer is disputing the _item_, not re-scoring the
person — that already routes the competency to `follow_up` through
`scp_display_evidence_state`, and should additionally be surfaced as a content
defect rather than absorbed into a number.

### 4. Backward compatibility

**Breaking at the call site**, deliberately. Dropping `_contribution` makes any
caller that still passes it fail loudly instead of silently supplying a constant.
`completeReview` in `academy-employer.functions.ts` and the `ReviewQueue`
mutation must be updated in the same change set.

The four existing evidence rows are not touched. One of them carries
`contribution = 0.500` from the current constant; it is fixture data, it stays,
and its `derivation_basis` stays NULL — which is honest, because nothing recorded
how that number was produced.

### 5. RLS / security implications

None. The function is already `SECURITY DEFINER` with `search_path` pinned and
already gates on `scp_can_author`. Deriving the contribution server-side is
**strictly better** for the trust boundary than the alternative: it means
`score_value`, `is_preferred`, `is_best_key` and `is_worst_key` never have to be
projected into the reviewer's payload. `scp_review_queue` keeps returning no
scoring data at all.

### 6. Data already present

4 evidence rows, 1 completed human review, 2 attempts — all fixture. No real
pilot evidence exists. Nothing needs back-filling and nothing may be rewritten:
`scp_guard_evidence_immutable` forbids changing `contribution` after write, and
that guard is correct.

### 7. Rollback-forward

Restore the previous function body from `20260819120000` (which is the current
definition) and drop `derivation_basis`. No data loss: the column is additive
and nullable. Rollback is a new forward migration, never an edit to this one.

### 8. Clean replay tests

`bash scripts/db-test.sh` full-history replay. The Vaktare journey suite
(`employer_vaktare_journey_test.sql`) already drives a complete 18-item run and
asserts `reviews_opened = 13`; it must be extended to assert the contributions
written, not just the count.

### 9. Targeted assertions

- No evidence row from a `human_review` provenance has `derivation_basis IS NULL`
  after this migration.
- For a run where the participant selects every preferred option, the
  human-reviewed SJT rows carry `contribution = 1.000`, not `0.500`.
- For a run selecting the worst option throughout, they carry `0.000`.
- Two reviews with different `outcome` values on identical responses produce
  identical `contribution` — the outcome does not move the number.
- `pg_get_functiondef` for `scp_complete_human_review` contains no numeric
  literal `0.5`.
- A source-level check (`scripts/`) asserting no `contribution` literal remains
  under `src/lib/security-competency/` or `src/components/academy/`.

### 10. Lovable tracked-migration implications

Author the canonical file in `supabase/migrations/` and run
`bun run migrations:check` before and after. Do **not** let Lovable re-issue it:
the `appliedThroughLovable` policy list exists because a Lovable-generated
duplicate previously diverged from the canonical file by three `GRANT` lines
(`20260822090000`). If Lovable does re-issue, the generated file must be removed
and the canonical one registered in `supabase/migrations-policy.json`.

---

## M1b — Constructed-response rubric capture (**blocked**)

**Owner decision 1, constructed-response branch. This subtask is stopped, as
instructed.**

### The finding

There is **no governed numeric source for a constructed response today.** The
only governed source is the rubric: `scp_rubric_dimensions` (4 per item) with
`scp_rubric_levels` 0–4, and `assesses_writing_quality` marking the one
dimension that must not affect the score.

The reviewer UI captures **outcome, rationale and severity only.** It captures no
dimension levels. So no truthful contribution can be derived from what a reviewer
currently supplies, and any number produced would be invented precision.

### Smallest required change

1. `scp_review_queue` returns the rubric for a constructed-response row:
   dimension key, name SV/EN, `observable_criteria`, the five level descriptors
   and `assesses_writing_quality`. No new table.
2. `ReviewQueue` renders one 0–4 control per dimension for
   `item_format = 'constructed_response'`, with no default selected — the same
   rule already applied to severity.
3. `scp_complete_human_review` accepts `_rubric_levels jsonb`
   (`{dimension_key: level}`), validates that every non-style dimension of the
   item's rubric is present and in range, and derives
   `contribution = mean(level) / 4` over dimensions where
   `assesses_writing_quality = false`.
4. A new `scp_review_rubric_scores` row per dimension, so the reviewer's actual
   judgement survives and the mean can be re-derived later.

This is a larger change than the other six migrations combined and is the honest
reason the closed test cannot ship on constructed-response evidence today.

**Interim option for the owner, if M1b is deferred:** route the three
constructed responses to human review as now, record the reviewer's outcome and
rationale, and write **no competency evidence** for them. The report then shows
those competencies as `not_yet_shown` rather than carrying a fabricated number.
That loses SCC-11 entirely (items 16 and 17 are its only source) — which is
itself an argument for resolving Decision 4 first.

---

## M2 — Safety-critical item ≠ safety concern

**Owner decision 2.**

### 1. Purpose

Separate the item's classification (audit/governance) from the reviewer's
finding about the actual response, so that a correct answer to a safety-critical
item stops producing a permanent safety flag, a mandatory severity, and a
participant-facing statement that they triggered safety-critical review.

### 2. Exact objects affected

- `public.scp_competency_evidence` — new column `safety_finding text`, and the
  existing `CONSTRAINT scp_evidence_safety_is_specified` replaced.
  `is_safety_critical` is **kept, unchanged in meaning**: it remains the record
  that the ITEM was classified safety-critical. The two are not collapsed.
- `public.scp_guard_evidence_immutable` — `safety_finding` added to the
  immutable set.
- `public.scp_complete_human_review` — accepts `no_concern`.
- `public.scp_compute_maturity` and `public.scp_attempt_maturity` — the safety
  cap changes from `bool_or(is_safety_critical)` to a cap on a real finding.
- `public.scp_display_evidence_state` — `critical_follow_up` keys on
  `safety_finding IN ('high','critical')`, plus a still-open review.
- `public.scp_rm_competency_profile` — `has_safety_flag` keys on the finding.
- `public.scp_release_attempt_report` — the employer payload's safety section.
- `public.scp_review_queue` — `severity_required` stays `true` (a conclusion is
  still mandatory); the UI gains a "no concern" choice.

### 3. Canonical SQL approach

```
ALTER TABLE public.scp_competency_evidence
  ADD COLUMN IF NOT EXISTS safety_finding text
    CHECK (safety_finding IS NULL OR safety_finding IN
      ('no_concern','low','medium','high','critical'));

ALTER TABLE public.scp_competency_evidence
  DROP CONSTRAINT IF EXISTS scp_evidence_safety_is_specified;
ALTER TABLE public.scp_competency_evidence
  ADD CONSTRAINT scp_evidence_safety_is_specified CHECK (
    NOT is_safety_critical OR safety_finding IS NOT NULL);
```

`safety_severity` is **retained and narrowed**: it keeps its
`('low','medium','high','critical')` domain and is populated only when
`safety_finding <> 'no_concern'`. That keeps every existing reader of
`safety_severity` correct rather than silently changing what it means — the new
column carries the new concept, which is the point of not collapsing them.

### 4. Backward compatibility

The new column is nullable, so existing rows remain valid. The replaced CHECK is
**weaker** than the original (it accepts `no_concern` where the original demanded
a severity), so no existing row can violate it. Every function above must be
updated in the same migration; leaving any one reading `is_safety_critical`
would re-introduce the defect on a different surface.

### 5. RLS / security implications

None. No policy changes. No column becomes readable by a role that could not
already read the row. The participant payload must **not** gain
`safety_finding`; the employer payload gains only the fact that a concern exists,
as today.

### 6. Data already present

4 evidence rows, none with `is_safety_critical = true`, none with a
`safety_severity`. **No back-fill is needed and none should be attempted** — the
one completed review predates the concept and inventing a finding for it would
be exactly the fabrication this migration exists to stop.

### 7. Rollback-forward

Restore the six function bodies from their current definitions, restore the
original CHECK, drop `safety_finding`. Safe only while no row has
`safety_finding = 'no_concern'` — after the pilot starts, rollback means
accepting that those rows would violate the restored constraint, so rollback has
a real deadline. Say so before approving.

### 8. Clean replay tests

Full `scripts/db-test.sh`. The pilot security-gate suite and the Vaktare journey
suite both exercise safety routing and will need updating together.

### 9. Targeted assertions

- A safety-critical item reviewed as `no_concern` writes evidence with
  `is_safety_critical = true` (the item was classified) and
  `safety_finding = 'no_concern'` and `safety_severity IS NULL`.
- That row does **not** cap maturity and does **not** set `has_safety_flag`.
- `scp_display_evidence_state` returns `critical_follow_up` for a `high` finding
  and does not for a `no_concern` one.
- A participant with all-correct answers produces an employer payload whose
  safety section is empty, and a participant report that does not render
  `academy.report.humanReviewOccurred`.
- `scp_complete_human_review` still refuses NULL for a safety-critical item — a
  conclusion is mandatory; only its vocabulary widened.

### 10. Lovable tracked-migration implications

Same as M1. This migration rewrites six functions; a Lovable re-issue that
diverges on any one of them is the highest-consequence drift in the set.

---

## M3 — `de_escalation` → SCC-07 (**blocked on SME confirmation**)

**Owner decision 3.** The canonical definition has been verified against
production: SCC-07 is `Respektfull service och gränshållning` / Service
Orientation — _"The ability to provide respectful, solution-oriented and
professional treatment while upholding security requirements, mandate and equal
treatment."_ That matches de-escalation technique directed at another person.
SCC-05 is `Emotionell självreglering` — the guard's own impulse control, which
the programme's `does_not_measure` array explicitly excludes.

**Verification of downstream effects, completed:**

| Downstream                    | Effect                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow-up prompt pairing      | **Improves.** SCC-07's prompts are _"Be personen beskriva hur hen säger nej till en besökare utan att situationen eskalerar"_ / _"Hur säger du nej till någon utan att läget trappas upp?"_ — a direct fit for items 09, 10, 14. SCC-05's prompt would no longer be reachable from this programme. All 12 competencies have prompts, so no dead end is created. |
| Employer / Participant report | The competency line renames from "Emotionell självreglering" to "Respektfull service och gränshållning". Removes the contradiction with `does_not_measure`. No payload shape change.                                                                                                                                                                            |
| Behaviour version lineage     | `de_escalation` behaviour version 1 is `content_status = 'draft'`. `scp_behaviour_competency_map` has **no immutability trigger** and a `UNIQUE (behaviour_version_id, competency_version_id)`, so the row can be repointed by a forward migration.                                                                                                             |
| Evidence derivation           | Unchanged. Evidence binds to `behaviour_version_id`; the competency is resolved through the map at read time.                                                                                                                                                                                                                                                   |
| Historical fixture evidence   | **Untouched.** All 4 evidence rows are on `proportional_decision_making`. **No evidence exists on `de_escalation`.** Confirmed by query against production.                                                                                                                                                                                                     |
| Clean replay                  | A forward `UPDATE` on the map row replays deterministically because it is keyed on behaviour slug and competency code, not uuid.                                                                                                                                                                                                                                |

**Also required in the same migration:** `scp_role_competency_map` for role
`security-guard-se` currently lists SCC-01, 03, 04, 05, 06, 08, 09, 11 as `core`.
SCC-05 must be replaced by SCC-07 or the role claims a core competency with no
behaviour behind it.

Rollback: repoint the map row back. Assertion: no behaviour version maps to
SCC-05 for this programme, and `de_escalation` resolves to SCC-07.

---

## M4 — Best/worst positional artefact

**Owner decision 5. Migration required, and the reason is not the one expected.**

`scp_form_items.randomise_options` exists as a column and **is read by nothing.**
Not by `scp_get_attempt_items`, not by any TypeScript. Options are always
returned `ORDER BY o.display_order`. Setting the flag alone would change nothing.

So the platform capability the decision asks to use is **not implemented**, and
fixing this properly is a data change _and_ a function change:

1. `UPDATE scp_form_items SET randomise_options = true` for the three best/worst
   item versions on `sg-baseline-form-a`.
2. `scp_get_attempt_items` orders options deterministically per attempt when the
   flag is set — e.g. `ORDER BY md5(_attempt_id::text || o.id::text)` — so the
   same participant sees the same order on every load and a replay can reproduce
   it, while BEST is no longer always first.

This preserves everything the decision requires: stored response identity is
`option_id` (unchanged), best/worst keys are unchanged, the reviewer resolves
labels by `option_id`, SV/EN parity is unaffected, ordering is deterministic per
attempt rather than random per render, and no label is shuffled client-side.

**Non-migration alternative, for the owner to weigh:** shuffle in the client
using the stable `option_id` already returned by the RPC, seeded from
`attempt_id + item_version_id`. No migration, same participant-visible outcome —
but the presentation order then lives only in client code, the dead
`randomise_options` column stays dead, and a later audit cannot reproduce what
the participant saw from the database alone. **Recommendation: do the migration.**

Assertion: for a fixed attempt, two calls to `scp_get_attempt_items` return the
same option order; across attempts, the best key is not always first.

---

## M5 — `sg-b-03` option A label

**Owner decision 6.** One row pair in `scp_item_option_texts`. Exact copy in the
remediation report. The internal rationale is **not** changed — the visible
option is brought up to what the rationale already rewards, not the reverse.

Must re-satisfy `F6.1` (a label may never equal its scoring rationale — the new
label is imperative and differently worded, so it does not) and `F6.2` (no label
may leak scoring or error-type language — it does not).

Rollback: restore the two previous labels. Assertion: F6.1 and F6.2 still hold
bank-wide; the label contains the care-assessment element.

---

## M6 — `language_scope`

**Owner decision 7.** One row.

```
UPDATE public.scp_assessment_versions av SET language_scope = ARRAY['sv-SE','en-GB']
  FROM public.scp_assessment_definitions d
 WHERE d.id = av.definition_id AND d.slug = 'sg-operational-baseline'
   AND av.version_number = 1;
```

English delivery is intentional and is **not** removed.
`adaptation_status` stays `adaptation_pending` on all 36 item texts — declaring
the languages in scope is not the same as declaring the adaptation reviewed, and
this migration must not touch it. Nothing currently reads `language_scope`, so
there is no behavioural risk; the point is that the catalogue record stops
contradicting the runtime.

Assertion: `language_scope = {sv-SE,en-GB}` **and** all 36 texts still
`adaptation_pending` — asserted together, so a future migration cannot quietly
use this one as cover for clearing the language gate.

---

## M7 — Legal register reconciliation

**Owner decision 8.** `scp_review_requirements` lists `swedish_legal` as
outstanding for six items; `legal_review_status` says `pending` on three
(`sg-b-04`, `05`, `06`) and `not_required` on three (`sg-b-02`, `15`, `18`).

The coherent statement is the **register's**: six items depend on a legal or
mandate proposition. So set `legal_basis_required = true` and
`legal_review_status = 'pending'` on `sg-b-02`, `sg-b-15`, `sg-b-18`.

This moves a gate **towards** more review, never towards less. **No gate is
cleared, no legal conclusion is recorded.** The existing constraint
`scp_item_legal_basis_consistent` (`legal_basis_required = false OR
legal_review_status <> 'not_required'`) is satisfied by the new state.

Assertion: for every item, `swedish_legal` in the register implies
`legal_review_status = 'pending'`; and **zero** items in the programme have any
review gate in state `approved`.

---

## M8 — Remaining competency mappings (**outline only**)

**Owner decision 4.** Not specified in detail because the mapping is an SME
decision, not an engineering one. If the SME moves `factual_reporting` to SCC-06
and/or `proportional_decision_making` to SCC-11, the shape is identical to M3:
repoint `scp_behaviour_competency_map`, update `scp_role_competency_map`, assert
no orphan competency remains in the role map, and confirm no evidence exists on
the affected behaviours before applying.

**Sequencing note:** M8 must land **before** any pilot evidence, for the same
append-only reason as M3. If the SME decision is slow, that is a reason to delay
the pilot, not a reason to pilot on a mapping under active dispute.
