# Career Discovery — profession ranking guard is global, not per-match

**Status:** open, CD owner's to decide
**Found:** 2026-08-18, while clearing pre-existing CD test debt for the employer track
**Severity:** governance / correctness. Not exploitable by an anonymous caller;
reachable by any code path that composes a completion payload.

## The guard as it actually is

`public.cd_v31_complete_session`:

```sql
IF jsonb_array_length(COALESCE(_payload->'professions'->'matches', '[]'::jsonb)) > 0
   AND NOT EXISTS (SELECT 1 FROM public.cd_professions WHERE approved_for_ranking) THEN
  RAISE EXCEPTION 'CD_UNAPPROVED_PROFESSION_RANKING: no profession is approved for ranking'
    USING ERRCODE = 'check_violation';
END IF;
```

It asks *"is anything approved for ranking?"* — a single global switch. It does
not ask whether **the professions in this payload** are approved.

## Why that matters

All 14 professions currently carry `approved_for_ranking = true`, so the guard
can never fire. More importantly, once **one** profession is approved, a
completion payload may contain a match on a profession that is:

- `approved_for_ranking = false`, or
- `derived_from_area = true`

and it will be accepted and written into an immutable report snapshot.

The second case contradicts a recorded owner decision. `career_discovery_v31_schema_test.sql`
states it directly: *"Owner decision: a mechanically derived profile may never be
ranked."* The schema suite enforces that at approval time — a derived profile
cannot be approved. Nothing enforces it at **ranking** time, which is where the
consequence actually lands, in a report a candidate reads.

## How it surfaced

`C8.5` asserted *"a profession match is refused while no profession is approved
for ranking"*. It passed for years because the seed had nothing approved. The
Layer-4 professions work approved all 14, the premise vanished, and the
assertion started failing — correctly, and for the right reason.

Setting one profession unapproved does **not** restore the refusal, which is how
the coarseness was found: the guard is indifferent to which professions are in
the payload.

## What was done here

Nothing to production. `C8.5` now creates the condition it asserts (all
professions unapproved) and restores it afterwards, so it tests **the behaviour
that exists**. The test is honest rather than aspirational, and deliberately
does not pretend the per-match rule is enforced.

## The fix, when the CD owner wants it

Replace the global existence check with a per-match one, along the lines of:

```sql
WITH claimed AS (
  SELECT jsonb_array_elements(COALESCE(_payload->'professions'->'matches','[]'::jsonb))->>'id' AS profession_id
)
SELECT string_agg(c.profession_id, ', ')
  FROM claimed c
  LEFT JOIN public.cd_professions p USING (profession_id)
 WHERE p.profession_id IS NULL
    OR NOT p.approved_for_ranking
    OR COALESCE(p.derived_from_area, false);
```

Raise `CD_UNAPPROVED_PROFESSION_RANKING` naming the offending ids when that is
non-empty. Strictly stronger than today, and it makes the existing owner
decision enforceable where it is consumed.

Add the matching assertions: a match on an unapproved profession is refused; a
match on a `derived_from_area` profession is refused; a match on an unknown id is
refused; and a payload of approved, non-derived professions still succeeds.

This is a production change to Career Discovery scoring/validation and so was
explicitly out of scope for the employer track.
