# ADR — VU1 + VU2 is labelled as training, and stays in the competence tier

**Status:** accepted · Phase A, 2026-08-23
**Owner decision:** 1 (final, not to be reopened)

## Context

`sp_professional_titles.SE_VAKTARE_COMPETENCE` rendered as `Väktare` /
`Security Guard · Sweden`.

Completing Väktarutbildning 1 and 2 is **grundutbildning**. It is not a
personnel approval, not an appointment, and not a statement that anyone may
currently work. A reader shown the bare word `Väktare` can reasonably conclude
otherwise, and an employer reading it in a disclosure certainly might.

The derivation engine was already correct: no active title may rest on a
qualification, and `20260907091000` asserts exactly that. Only the **wording**
lagged behind the rule.

## Decision

Two parts.

**1. The label says what the evidence is.**

|              | Before                    | After                                 |
| ------------ | ------------------------- | ------------------------------------- |
| `name_local` | `Väktare`                 | `Väktarutbildning (VU1 + VU2)`        |
| `name_en`    | `Security Guard · Sweden` | `Security Guard Training (VU1 + VU2)` |

VU1 alone and VU2 alone continue to render their own training rows
independently. No combination of the two renders the bare word `Väktare` —
asserted by mutation in `scripts/passport-identity-engine-check.ts`.

`Ordningsvakt` and `Skyddsvakt` are unaffected: each still derives from its own
independently reviewed, currently valid appointment.

**2. The row stays in `professional_competence`. The tier does not move.**

## Why the tier does not move

An education-sounding label now sits in the competence tier. That looks untidy,
and it is deliberate.

`output_kind` is not a label — it is what `headlineTitles()` ranks. The four
tiers are ordered, and the headline shows the strongest tier a holder has.
Demoting this row to `education_completed` would change **which surfaces show
it and in what order**, for every Swedish holder, as a side effect of a wording
fix. That is a product change wearing a tidy-up's clothes.

The conservative direction is to make the _words_ weaker while leaving the
_structure_ alone:

- a reader is told less than before, which is the point;
- the engine derives exactly what it derived before;
- nothing about ranking, disclosure or the public card moves.

Had we moved the tier instead, we would have changed behaviour to fix a string.

## Consequences

- Anyone reading the table will see a training-shaped label in a competence
  tier and may want to "correct" it. **This ADR is the answer: do not.**
- If the tier is ever genuinely wrong, that is a separate, reviewable product
  decision with its own evidence — not a rename.
- `scripts/passport-title-derivation-check.ts` compares the mirror in
  `identity/market-rules.ts` against the migrations, applying later renames, so
  the label cannot drift in one place only.

## Related

- `supabase/migrations/20260908091000_sp_title_country_and_training_label.sql`
- `docs/passport/sweden-market-pack.md`
- Owner decision 2 (scope) and 3 (UK/UAE activation) are recorded in the
  Phase A work order, not here.
