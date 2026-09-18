# BESKT — the report readers now obey the independence rule

**Status:** schema fix authored, proved over a replayed schema, **not yet
applied to production**.

**Migration:** `supabase/migrations/20261127090000_bcp_conduct_report_independence_boundary.sql`
**Rollback:** `supabase/rollback/20261127090000_bcp_conduct_report_independence_boundary_rollback.sql`
**Suite:** `supabase/tests/bcp_conduct_report_independence_test.sql`
**Guard / controls:** `scripts/beskt-report-independence-check.ts`,
`scripts/negative-controls/beskt-report-independence-controls.ts`

## The two defects

Both were shipped by `20261117090000` (BESKT PR 6, merged as #254) and both
are live on `wrygicdfxwjnrugduxnt` today.

### 1. `bcp_conduct_preview_report` — content

It applied three guards: authentication, the session exists, and
`scp_iv_can_read_case`. It then called `bcp_conduct_build_report_basis`,
which is `SECURITY DEFINER` and therefore reads past
`bcp_conduct_positions_own_or_revealed`,
`bcp_conduct_entries_own_or_revealed` and
`bcp_conduct_verifications_own_or_revealed`.

It never called `bcp_conduct_may_see_others`.

So it returned **every assessor's entries, correction chains and
verification trails** to any caller who could read the case — including an
assessor whose own position was still open. The blocker list came back
_alongside_ the payload, not instead of it, so it withheld nothing.

An assessor could read a colleague's locked record before taking their own
position and anchor on it. Independent positions are the reason the conduct
layer exists.

### 2. `bcp_conduct_report_blockers` — metadata

It had **no authorisation of any kind** — not authentication, not the case
authority — while being `SECURITY DEFINER` and granted to `authenticated`.

Any signed-in user holding a session id learned how many assessors a
stranger's interview had, how many were still open, whether anything was
documented, whether a panel existed and had revealed, and how many themes two
assessors disagreed about. That is metadata about a named candidate's
process.

## The fix

Two checks, in two functions, and nothing else changes — no table, no
policy, no grant, no signature, no other function and no row.

```sql
-- bcp_conduct_preview_report, after the case authority:
IF NOT public.bcp_conduct_may_see_others(_session_id) THEN
  RAISE EXCEPTION 'BCP_CONDUCT_NOT_VISIBLE_YET: ...'
    USING ERRCODE = 'insufficient_privilege';
END IF;

-- bcp_conduct_report_blockers, at the top and after the session lookup:
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: ...'; END IF;
IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
  RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: ...'; END IF;
```

`BCP_CONDUCT_NOT_VISIBLE_YET` already existed in the conduct migration and is
already translated (`beskt.error.conductNotVisibleYet`), so no new code and no
new copy was needed.

### Why the predicate is reused rather than re-derived

`bcp_conduct_may_see_others` is the canonical answer to "may this caller see
another assessor's material yet": their own position is locked AND either the
panel has revealed or nobody is still open. `bcp_conduct_workspace` answers
`others_visible` from it and the three row policies enforce the same shape.
Writing the condition out again would create a second answer to one question.

### Order of the checks

Authentication → session → **case authority** → **independence**. A stranger
learns "you may not read this case" rather than the lifecycle state of a case
that is none of their business.

## What deliberately did not change

| Object                           | Why                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bcp_conduct_build_report_basis` | Already revoked from `authenticated` and `anon` — not a reachable oracle. The postflight and the suite both keep it that way.                                     |
| `bcp_conduct_final_report`       | A finalised report cannot exist until the blocker sweep passed, which requires every position locked. Reading the finished document is the decision-maker's path. |
| `bcp_conduct_report_versions`    | Version numbers, hashes, who and when. No position content.                                                                                                       |
| `bcp_conduct_basis_hash`         | Not `SECURITY DEFINER`; hashes a payload the caller already holds.                                                                                                |

`bcp_conduct_report_blockers` stays reachable for a caller who _may_ read the
case. That is deliberate: it is how a screen says what is still missing
without disclosing anybody's record, and it is what the preview is no longer
a substitute for.

## Behaviour change, stated plainly

A participant whose own position is open can no longer preview the report.
**That is the point.** What they still have is the blocker reader and their
own workspace.

Two assertions in the PR 6 suite asserted the old behaviour by reading a
blocker _through_ the preview as a caller whose position was open — i.e. they
asserted the hole. Both now read the blocker from
`bcp_conduct_report_blockers`, which is the reader designed for that question,
and one additionally asserts the refusal. Both original facts are still
proven.

## Proof

`supabase/tests/bcp_conduct_report_independence_test.sql`, over a replayed
schema, through real `authenticated` sessions with the caller's identity set
the way PostgREST sets it:

- an assessor with an open position is refused **by name**;
- the colleague's own recorded sentences appear **nowhere** in anything that
  caller can still reach — searched against the whole answer rendered to
  text, not against the field they are supposed to be in;
- another employer, the candidate, and a roleless authenticated user are each
  refused, from **both** readers;
- calling `bcp_conduct_build_report_basis` directly is refused at the
  privilege;
- after locking, the document is returned **whole, carrying both assessors** —
  the fix is a boundary, not a wall;
- reopening a position closes it again, so the boundary is a live predicate
  rather than a one-way latch.

The harness runs the rollback for real and re-applies the migration, proving
the hole measurably open in between — a rollback that quietly left the
boundary in place would otherwise pass.

## The application side

The Report tab already withholds the preview until the workspace reports
`others_visible`. That was a mitigation, not a boundary, and it stays as
defence in depth once this migration is applied.

## The second fix in this PR: `scp_iv_create_case` and the candidate account

**Migration:** `supabase/migrations/20261128090000_scp_iv_case_candidate_binding.sql`
**Rollback:** `supabase/rollback/20261128090000_scp_iv_case_candidate_binding_rollback.sql`
**Suite:** `supabase/tests/scp_iv_case_candidate_binding_test.sql` (18 assertions)

Found while wiring the BESKT preparation to Intervjuer. The latest effective
definition of `scp_iv_create_case` is `20261108090000` (not `20260926090000`),
byte-identical on `main`, on this branch and on `wrygicdfxwjnrugduxnt`
(md5 of `prosrc` `24cfc8e7…`). It is `SECURITY DEFINER`, granted to
`authenticated`, and checks membership, an active employer, the pack and that a
job or application belongs to the employer — but never `_candidate_user_id`.

Proved by calling it as a real employer member: a case bound to a stranger's
account was created on the member's own application, and with no application
at all. That stranger then counts as the case's candidate for
`scp_iv_is_case_candidate`, the candidate's own interview status, and the BESKT
preparation bridge.

The fix re-creates exactly that function with one rule after the existing
employer check: a non-NULL `_candidate_user_id` requires an application of the
same employer whose `applicant_user_id` is that account. A candidate identified
by an external reference is unchanged. The migration refuses to run over any
body but the verified `20261108090000` one, so it can never undo a newer
improvement.

The suite proves, through real authenticated sessions: the applicant is
accepted; a stranger on the employer's own application, another employer's
applicant, another employer's application, an employer the caller does not
belong to, and a user id with no application are each refused and write
nothing; external references still work with and without an application.
`db:test` runs the rollback for real with the hole proved open in between, and
re-applies the rule after BESKT PR 2's own rollback/re-apply, which would
otherwise leave the unguarded body in place.
