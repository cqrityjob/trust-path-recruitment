# BESKT — the report preview and the independence rule

**Status:** fixed in the database by
`supabase/migrations/20261127090000_bcp_conduct_report_independence_boundary.sql`
(PR #266, schema-first). Until that migration is merged, applied on
`wrygicdfxwjnrugduxnt` and recorded in `supabase/release-state.json`, the
application mitigation below is the only thing between the Report tab and the
hole. It stays afterwards as defence in depth.

**Found:** 2026-09-18, building the report surface on top of PR #254.

**Affected object:** `public.bcp_conduct_preview_report(uuid)`, introduced by
`supabase/migrations/20261117090000_bcp_conduct_prompts_and_report.sql`
(hosted `20261117090000`, applied on `wrygicdfxwjnrugduxnt`).

## What the independence rule is

The conduct layer exists so that two assessors form a view of the same
conversation without anchoring on one another. Everywhere in that layer the
rule is enforced by one predicate:

```sql
public.bcp_conduct_may_see_others(_session_id)
  -- true when the caller's OWN position is locked
  -- AND (the panel has revealed OR no position is still open)
```

`bcp_conduct_workspace` calls it and returns `others_visible`; the row
policies `bcp_conduct_positions_own_or_revealed`,
`bcp_conduct_entries_own_or_revealed` and
`bcp_conduct_verifications_own_or_revealed` enforce the same thing at the
table.

## What `bcp_conduct_preview_report` does instead

It applies exactly three guards:

1. `auth.uid() IS NOT NULL`
2. the session exists
3. `public.scp_iv_can_read_case(_s.case_id)`

It then calls `public.bcp_conduct_build_report_basis(_session_id)`, which is
`SECURITY DEFINER` and therefore reads past the row policies. That helper
returns **every position in the session**, each with its entries, its
correction chain and its verification trail.

`bcp_conduct_may_see_others` is never called.

## The consequence

Any principal who may read the interview case — including an assessor whose
own position is still `open` — can obtain every other assessor's complete
record by calling `bcp_conduct_preview_report`. The blocker list
(`BCP_CONDUCT_POSITION_OPEN`) is returned *alongside* the payload, not
instead of it, so it does not withhold anything.

Nothing called this function before the report surface was built, so the gap
was latent rather than exploited. A Report tab that called it unconditionally
is what would make it reachable.

## What is NOT affected

- `bcp_conduct_final_report` — a finalised report can only exist once the
  blocker sweep passed, which requires every position locked. A participant
  reading it has already been entitled to see those positions.
- `bcp_conduct_report_versions` — returns version numbers, hashes, who and
  when. No position content.
- `bcp_conduct_report_blockers` — returns counts and codes, no content.

## The mitigation shipped in this PR

`_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx`
does not fetch the preview unless the workspace reports `others_visible`,
which is the database's own answer from `bcp_conduct_may_see_others`. The
Report tab renders an explanation instead.

**This is a mitigation, not a boundary.** A crafted request that skips the
client reaches the same RPC and gets the same payload. It is here so the
product does not ship a reachable route to the hole, and the guard
`beskt-product-completion:check` asserts it with a planted negative control
so it cannot be removed silently.

## The fix: 20261127090000, PR #266

It adds the missing check to `bcp_conduct_preview_report`, after the case
authority and before the payload is built:

```sql
  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```

`BCP_CONDUCT_NOT_VISIBLE_YET` already exists in the conduct migration and is
already translated (`beskt.error.conductNotVisibleYet`), so no new code and no
new copy is required.

It also gives `bcp_conduct_report_blockers` the authentication and case
authority it lacked. `supabase/tests/bcp_conduct_report_independence_test.sql`
proves both over a replayed schema through two real assessor sessions. The
routed walk `e2e/beskt-interview-tool.spec.ts` (steps 16 and 24) additionally
calls both readers straight at PostgREST as the open assessor, another
employer, the candidate, an unrelated user and anon, against a local stack
carrying the migration, and asserts every refusal and that no recorded word
leaves. The mitigation above is harmless to keep.
