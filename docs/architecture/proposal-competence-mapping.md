# Proposal — "Min kompetenskartläggning" (competence mapping)

**Status: proposal only. Nothing in this document is implemented, and PR C2
contains no migration, no table, no RLS policy and no generated type.**

Sketch 5 (Tester & utveckling) draws a left column that does not exist in the
product:

- a completion ring — *68 % Klar*
- a progress statement — *"Din kartläggning pågår · Du har slutfört 4 av 6 delar"*
- a primary action — *"Fortsätt kartläggning"*
- six named parts, each with one of three states:

  | Part | State drawn |
  | --- | --- |
  | Grundläggande profil — bakgrund, erfarenhet och intresseområden | Klar |
  | Teknisk kompetens — verktyg, metoder och teknikområden | Klar |
  | Personliga styrkor — arbetssätt och samarbetsförmåga | Klar |
  | Säkerhetsroller och ansvar — erfarenhet av roller och ansvarsområden | Pågår |
  | Utvecklingsområden — områden att stärka framåt | Ej påbörjad |
  | Sammanfattning — din profil och rekommendationer | Ej påbörjad |

## Why it was not built in PR C2

`kompetenskartläggning` returns **zero** hits across `src/` and
`supabase/migrations/`. There is no table, no server function, no type and no
existing UI for it. None of the four things the sketch shows — the six parts,
their per-part state, the ordering, or the completion percentage — can be
derived from anything that exists today:

- It is **not** `AcademyWorkItem`. That is assessment/training work assigned by
  an employer, with `progressDone`/`progressTotal` inside a single item. The
  mapping is the candidate's own, spans six fixed parts, and nobody assigns it.
- It is **not** the profile completeness model. That has ten sections
  (`situation`, `identity`, `profession`, `experience`, `location`, `employment`,
  `education`, `skills`, `languages`, `careerDirection`), owned by the profile,
  and it already has its own presentation.
- It is **not** Career Discovery. That is a run producing a report, reached
  through Karriär, and sketch 5 draws it as a *separate* card on the same page.

Building it would have meant inventing a schema inside a presentation PR, or
faking the ring with a hard-coded percentage. The standing rule is explicit that
a genuine schema change stops and gets proposed separately, and a fabricated
completion figure would be a false statement to the candidate about their own
record — the same class of defect as reporting "nothing waiting" from an
unreadable verification state.

## What a schema-only PR would need to settle first

These are product questions, not implementation details, and they change the
table shape:

1. **Is the mapping an instrument or a container?** If the six parts are
   answered like an assessment, this belongs in the security-competency domain
   and reuses attempts/items. If they are curated summaries of facts the
   candidate has already given elsewhere, it is a *derived view* and may need
   no new writable table at all — which would be the better answer, and is the
   first thing to check.
2. **Is any part derivable from existing rows?** "Grundläggande profil" looks
   like it may already be answerable from the profile and `sp_claims`. A part
   that can be derived must not become a second writer for a fact that already
   has one — the rule migration `20261007090000` exists to enforce.
3. **What does the percentage count?** Parts completed (4/6 → 67 %, not the 68 %
   drawn), or weighted items within parts? The sketch shows 68 % beside "4 av 6",
   which those two readings do not both produce.
4. **Who may read it?** Holder-only, or visible to an employer in a process? That
   decides the RLS policy and whether it can ever reach a Passport share.
5. **What is "Sammanfattning · din profil och rekommendationer"?** If it produces
   recommendations, it overlaps Career Discovery, and the boundary between the
   two products has to be stated before either writes.

## Deployment order, if it proceeds

1. Schema-only PR: table(s) + RLS + rollback + RLS tests + generated types.
   No UI.
2. Verify on a preview branch; replay the migration and the rollback.
3. A separate UI PR builds sketch 5's left column against the shipped model.

Splitting it this way keeps the rule that has held across PRs A–C1: no candidate
fact gains a second writer, and no presentation PR carries a migration.
