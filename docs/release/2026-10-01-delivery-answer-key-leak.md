# Release-blocking: the delivery payload must not carry the answer key

**Status: PENDING.** This is an isolated schema-only PR from `origin/main`
`2bbc64a`. It is not merged, and nothing was written to the hosted database.

| Part | File |
|---|---|
| Migration | `supabase/migrations/20261229090000_scp_delivery_answer_key_leak.sql` |
| Rollback | `supabase/rollback/20261229090000_scp_delivery_answer_key_leak_rollback.sql` |
| Suite | `supabase/tests/scp_delivery_answer_key_test.sql` (22 assertions) |
| Contract tightened | `scp_option_order_integrity_test.sql` (T5.4 and its `served_keys` helper); `employer_vaktare_journey_test.sql` (VJ4.3e) |

## 1. Root cause

`scp_get_attempt_items()` is the only path that delivers assessment items to a
participant. It returned each option as `{option_id, option_key, label}`.

**The authored content keys the preferred option `a`/`A`.** A read-only check of
hosted production found:

| Format | Items where the top-scoring option is keyed `a` |
|---|---|
| `sjt_best_response` | 200 of 200 |
| `sjt_best_worst` (best key) | 8 of 8 |

**The shuffle didn't help.** The per-attempt shuffle (`20260905053344`) moves an
option's position on screen, but `option_key` travelled with it. Anyone reading
their own network response could pick the full-credit answer on every scenario
item. No UI uses `option_key`: the Academy delivery maps it into `optionKey` and
never reads it.

**Why the guard missed it.** `20260905053344` already meant to forbid this. Its
postflight names `option_key` explicitly, but it inspected only the column names
of the function's `RETURN TABLE`. The key sat one level down, inside the
`options` jsonb.

**A second, narrower gap.** An attempt created before `20260905053344` has no
`option_order_seed`. Compatibility rule A serves such an attempt in authored
order, which is key-first. Hosted production has exactly one such attempt still
open on a form that asks for randomisation: `security-officer-recruitment-form-a`,
started 2026-08-25, with no saved answer.

## 2. Fix

1. **The served option is `{option_id, label}` and nothing else.** The function
   is otherwise byte-for-byte the `20260905053344` body:
   - same ownership check;
   - same per-attempt permutation;
   - same ordered-scale exemption;
   - same resume columns.

   The postflight now inspects the payload the function builds, not only its
   result columns.
2. **`scp_seed_unanswered_legacy_attempts()` closes the seedless gap.** It is
   owner-only and runs once in the migration. It seeds every `in_progress`
   attempt that meets all of these conditions:
   - it has no seed;
   - it has **no saved response**;
   - its form randomises an item whose format has no meaningful order.

   Such a participant has answered nothing, so moving them onto the shuffled
   contract reorders nobody mid-run. AC14 and rule A for *answered* attempts
   hold.

   It is the only path that may set a seed after INSERT. It suspends the
   immutability guard for its single UPDATE inside the migration transaction and
   re-enables it. The postflight proves the guard is back on.

**Not changed:**
- scoring;
- any stored response;
- any seed already set;
- any answered attempt;
- `randomise_options` on any form item (T6.5 is honoured in both directions);
- ordered scales (T6);
- learning feedback;
- grants;
- application code.

## 3. Reported separately, not changed here

Forms authored with `randomise_options = false` on unordered formats still serve
the authored, key-first order: the `sg-*` drafts, `internal-dev-*` and the
fixtures. Hosted production has **0 attempts** on any of them. Fixing them is a
content decision: set `randomise_options` on those items, or rebalance the key
position in the content, before any of them is assigned. Overriding the owner's
T6.5 contract in a security patch is not the way to make it.

## 4. Tests

`scp_delivery_answer_key_test.sql` runs on the real seeded recruitment form,
through the real RPCs, as the participant:

| Group | Proves |
|---|---|
| DK0 | **Reproduction** on the pre-fix body, restored with the real rollback inside a savepoint. Every option carries `option_key`. "Pick the option keyed a" is full credit on 22 of 22 scenario items, even though the shuffle moved the top option. A seedless attempt is served key-first on 22 of 22. |
| DK1 | Every served option has exactly `option_id` and `label`, in Swedish and English, on all 50 items. No option text mentions a key, score, preference, rationale or feedback. Every option is still served. The participant cannot read `scp_item_options`. |
| DK2 | The per-attempt order is unchanged: stable on re-read, different from authored order, and ordered scales keep their authored order. |
| DK3 | The helper seeds the unanswered seedless attempt, which is then no longer key-first. It leaves the answered seedless attempt seedless and served exactly as before. The immutability guard is back on, and a seed still cannot be changed outside the helper. |
| DK4 | The helper is owner-only. Delivery is authenticated-only. |

**Negative controls in `scripts/db-test.sh`.** Each control must make the suite
fail on an assertion:

| Control | Planted defect | Suite fails at |
|---|---|---|
| NC1 | The real rollback | DK1.2 |
| NC2 | The seeding helper reduced to a no-op | DK3.1 |

After the controls, the migration is re-applied (postflight proven) and the
suite passes again.
