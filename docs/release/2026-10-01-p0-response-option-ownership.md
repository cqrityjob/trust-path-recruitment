# P0: an answer's option must belong to the item it answers

**Status: PENDING. Isolated schema-only PR from `origin/main` `076714e`. Not
merged. No hosted write was issued.** When the PR merges, the official Supabase
GitHub integration applies the migration to `wrygicdfxwjnrugduxnt`. After that,
read-only hosted evidence is recorded in `release-state.json` and
`hosted-ledger.json`, and the name comes off `expectedPending` in
`scripts/release-frontier-check.ts`.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20261228090000_scp_response_option_ownership.sql` |
| Rollback | `supabase/rollback/20261228090000_scp_response_option_ownership_rollback.sql` |
| Suite | `supabase/tests/scp_response_option_ownership_test.sql` (47 assertions) |
| Harness | `scripts/db-test.sh` (suite, three planted-defect negative controls, rollback and re-apply) |

## 1. Root cause

`scp_save_response()` is the only writer of `scp_candidate_responses`; clients
hold SELECT only on the table. It checked three things:

- the attempt is the caller's;
- the attempt is `in_progress`;
- the item is on the attempt's form.

It **never checked that the option ids belong to the item**:

- **Foreign keys:** the three single-column FKs only require the option to exist
  somewhere in `scp_item_options`.
- **Shape trigger:** `scp_guard_response_matches_format` checks that an option is
  present, not whose it is.
- **Scoring:** `scp_submit_attempt()` scores by option id alone. A single-choice
  answer scores `score_value(named option) / max(score_value of the answered item)`.
  A best/worst answer scores `is_best_key` / `is_worst_key` of whichever ids were
  named.

**Why it was exploitable:** every hosted option-bearing item (310) shares a
0..3 scale. Learning Mode feedback, through `scp_get_learning_feedback`, hands
any participant a preferred option id, and the preferred option scores 3.

**The attack:** name that id, or any other item's best/worst keys, as the answer
to every closed assessment item. Every item then scores full credit (1.000).
`scp_submit_attempt` writes that as deterministic, employer-facing evidence.

## 2. Fix: two independent layers

1. **Save path.** `scp_save_response` refuses any non-null selected, best or
   worst option id that is not an option of `_item_version_id`.
   - Foreign, cross-assessment and fabricated ids all get the same
     `SCP_OPTION_NOT_ON_ITEM` (23514), so the refusal is not an existence oracle.
   - The rest of the function is unchanged.
2. **Table invariant.** Three composite foreign keys,
   `(item_version_id, selected_option_id | best_option_id | worst_option_id)` →
   `scp_item_options (item_version_id, id)`, back it with a new
   `UNIQUE (item_version_id, id)`. Because `id` is already the PK, the unique
   constraint cannot reject a row.
   - A mismatched row cannot exist, whoever writes it.
   - So `scp_submit_attempt`, left untouched, can never score one.
   - NULL option columns are not checked (MATCH SIMPLE). That is the
     constructed-response shape and the half-answered best/worst shape.

**Not changed:**

- `scp_submit_attempt`, `scp_get_attempt_items` and `scp_get_learning_feedback`;
- any grant (EXECUTE on `scp_save_response` is restated, unchanged);
- any stored row;
- application code. The UI already sends only options of the served item.

**Fail-closed precondition:** the migration refuses to apply if any stored
response is already mismatched.

## 3. Response formats mapped before the fix

| Format | Hosted item versions | Stored as |
|---|---|---|
| `sjt_best_response` | 254 | `selected_option_id` |
| `sjt_rate_effectiveness` | 2 | `selected_option_id` |
| `biq_frequency` (self-report) | 64 | `selected_option_id` |
| `sjt_best_worst` | 14 | `best_option_id` and/or `worst_option_id`, saved one side at a time |
| `constructed_response` | 31 | `response_text` only; an option is refused |

Every legitimate answer names options of its own item, so no supported format
changes behaviour. The suite proves this for all five formats, including BIQ on
a recruitment form, and proves retries are idempotent.

## 4. Production historical check (read-only, 2026-10-01)

| Measure | Value |
|---|---|
| Stored responses | 682 |
| Responses naming an option | 635 |
| **Mismatched (option of another item)** | **0** |
| Affected assessment versions | **none** |
| Evidence rows derived from a mismatched response | 0 |
| Option references to a non-existent option | 0 |

**Hosted function body:** `md5(prosrc)` of `scp_save_response` is
`bc723ef05f2bf91527f0dc6d1049ee07`. That equals the rollback's restored body
measured on a replay, so the fix replaces exactly what production runs.

## 5. Tests

`scp_response_option_ownership_test.sql`:

- **OO0 reproduction.** Inside a savepoint, the real rollback file restores the
  pre-fix state. The participant goes through the real RPCs:
  1. starts Learning Mode;
  2. reads the preferred option id;
  3. saves it, a cross-assessment top option and another item's best/worst
     keys as answers;
  4. submits.

  All saves are accepted, and three closed items score **1.000** from options
  they do not own. Rolled back afterwards.
- **OO1 to OO11 on the fix:**

  | Case | Group |
  |---|---|
  | Valid option for the correct item is accepted (all formats) | OO1, OO9 |
  | Another item's option is rejected (selected, best, worst) | OO2 |
  | Another assessment version's option is rejected | OO3 |
  | Fabricated UUID is rejected, with the same error | OO4 |
  | The learning-revealed option on an assessment item is rejected | OO5 |
  | A refused save leaves the stored answer untouched | OO6 |
  | Another candidate's attempt is refused; an item not on the form is refused; anon cannot execute; no direct table write | OO7 |
  | Scoring cannot consume a foreign option: the owner cannot store one, and evidence equals the participant's own options' score | OO8 |
  | Retries are idempotent (one row, same id) | OO1 |
  | Every stored response is valid; the keys are VALIDATED | OO10 |
  | Each layer alone still refuses the exploit | OO11 |

## 6. Negative controls (`scripts/db-test.sh`)

Each control **must** make the suite fail on an assertion, or CI fails.

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback: both layers gone | OO2.1, a foreign option is accepted |
| NC2 | Only the save-path ownership check removed (keys kept) | OO2.1 |
| NC3 | Only the composite item-option keys removed (check kept) | OO8.1, the owner can store a mismatched row |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
