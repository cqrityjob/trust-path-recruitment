# Outstanding review gates are operator-only

**Migration:** `supabase/migrations/20261116090000_cd_outstanding_reviews_operator_only.sql`
**Rollback:** `supabase/rollback/20261116090000_cd_outstanding_reviews_operator_only_rollback.sql`
**Baseline:** `origin/main` `fce235a12d04875d9f863dbc4897989bfd7979ec` (PR #251 merge)
**Hosted state:** `pending` — nothing was applied to `wrygicdfxwjnrugduxnt` by the authoring session.

## 1. The finding

`public.cd_outstanding_reviews` ran with **definer** semantics, so every signed-in
user read the outstanding governance gates of **every** definition version —
including `internal_test`, `design` and `retired` instruments that RLS on
`cd_definition_versions` otherwise hides from them.

## 2. How it arrived

Two migrations, three months apart:

| Migration | Statement | Effect on `reloptions` |
| --- | --- | --- |
| `20260731054834` | `CREATE VIEW … WITH (security_invoker = true)` | `{security_invoker=true}` |
| `20260731100000` | `CREATE OR REPLACE VIEW … AS` (no `WITH`) | **reset to NULL** |

`CREATE OR REPLACE VIEW` with no `WITH` clause does not preserve reloptions — it
resets them. Proved directly on the replayed schema:

```
after create:  {security_invoker=true}
after replace: (null)
```

The second migration was re-stating the body so the launch script could re-run;
nothing in it says the access model was meant to change, and its own comment
describes the view as how operators see "which reviews are still open on a live
instrument". This was drift, not a decision.

**The contrast is the evidence.** `public.scp_scoring_version_lineage` is
*deliberately* a definer view and carries
`{security_invoker=false,security_barrier=true}` explicitly, set by
`20260801100000` which reverted a linter-driven flip that had caused a real
outage. One view states its intent; the other lost it silently.

## 3. Why `security_invoker = true` alone is **not** the fix

This is the part a generic linter remediation gets wrong.

RLS permissive policies are **OR-ed**. `cd_definition_versions` carries two:

```
cd definition versions admin or tester readable
    (is_platform_admin(auth.uid()) OR cd_is_internal_tester(auth.uid()))
cd definition versions live readable
    (lifecycle_status = ANY (ARRAY['pilot','active']))          <- anon too
```

Under invoker semantics an ordinary candidate still satisfies the **second**
policy. Measured on a full replay with the flag flipped and nothing else:

```
live (pilot/active) versions with uncleared gates: 1
ordinary candidate STILL reads 7 row(s) through the invoker-only view
```

Seven rows, not zero. The owner's decision is that ordinary candidates,
employers and other authenticated users must not read these gates **at all**, so
the flag alone does not implement it.

## 4. The fix

Two independent gates, in one statement:

1. `security_invoker = true`, stated **in the same statement that declares the
   body**, so a later bare `CREATE OR REPLACE VIEW` cannot reset it the way
   `20260731100000` did.
2. `AND public.cd_is_internal_tester(auth.uid())` in the body. That function
   already encodes exactly the set the owner named — true for a platform admin
   (via `is_platform_admin`, covering `admin` and `superadmin`) **or** for a row
   in `cd_internal_testers`. Reused rather than reimplemented: a second
   definition of "who is an operator" is a second thing to keep in step.
3. `security_barrier = true`, because the view now carries a qual.

Either gate alone would close the finding; both mean a future change to one is
not silently a breach.

## 5. Actor matrix (full replay, real RLS, real principals)

| Principal | Rows through the view |
| --- | --- |
| Anonymous | **refused** — `permission denied` |
| Ordinary candidate | **0** |
| Ordinary employer (tenant A) | **0** |
| Cross-tenant employer (tenant B) | **0** |
| Internal tester | **14** (all gates, `internal_test` included) |
| Platform administrator (`admin`) | **14** |
| Platform administrator (`superadmin`) | **14** |
| Owner session, no JWT subject | **0** (the body predicate refuses) |

Fixtures are the **canonical** definition versions the migration history already
ships (`2026-scd-v3.0.0` in `internal_test`, `2026-scd-v3.1.0` in `active`), not
invented rows. The `active` one is the trap: `CDO13` proves a candidate can still
read it on the **base table**, and `CDO14` proves none of it reaches them through
the view.

## 6. Negative controls

- **Database level** (`scripts/db-test.sh`): the original definer view is planted
  back into the replayed schema and the suite must **fail on an assertion**.
  Then the rollback runs over that planted state, the migration re-applies with
  its postflight proof, and the suite passes again — so the run leaves nothing
  behind.
- **Source level** (`scripts/negative-controls/cd-outstanding-reviews-controls.ts`):
  15 planted mutations, each changing exactly one thing, each required to be
  caught by `cd-outstanding-reviews:check` with a named diagnostic. They cover
  both halves of the fix removed separately, the gate replaced by a constant,
  the gate trusting a client-supplied JWT claim instead of `auth.uid()`, a later
  `ALTER VIEW` undoing it, the postflight weakened, the anon revoke removed, each
  actor dropped from the matrix, and — deliberately — `scp_scoring_version_lineage`
  being "fixed" too.

## 7. What is not changed

No table, column, RLS policy, function, trigger, row, or grant to
`authenticated`. The view's column list and types are byte-for-byte unchanged,
so nothing that selects from it needs to change. `anon` held nothing before and
holds nothing now. `scp_scoring_version_lineage` is untouched, and the guard
asserts it stays that way.

The broad `TRUNCATE`-grant cleanup found during the same review is **explicitly
out of scope** here and is recorded as a separate follow-up security PR, to be
opened after this correction merges.

## 8. Hosted apply plan

1. Owner review; merge. Schema-only — no application code reads this view
   (`src/` has no runtime reference; only `src/integrations/supabase/types.ts`
   names it).
2. The Supabase GitHub integration applies the migration on merge. It must raise
   `CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_PROOF ok`.
3. Verify read-only with the queries in `supabase/release-state.json`
   (`verify` field for this entry).
4. Then, in one change: `hostedState: applied` with evidence, remove the file
   from `expectedPending` in `scripts/release-frontier-check.ts`, and refresh the
   hosted ledger from that evidence.
5. No Lovable publish, no Lovable migration mechanism, no hosted Auth change.

## 9. Stated consequence

Any operator dashboard or query that relied on reading this view as an ordinary
user stops returning rows. That is the intent. Operators — platform
administrators and members of `cd_internal_testers` — are unaffected and
continue to see every gate, `internal_test` instruments included.
