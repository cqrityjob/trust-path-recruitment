# Employer lifecycle, phases 2 and 3 — routed browser evidence

Regenerated, not hand-made. Everything below reproduces these captures against
the same tree.

## What each one shows, and why a diff cannot show it

| File | What it is evidence of |
| --- | --- |
| `job-pipeline-desktop.png` / `-mobile.png` / `-en.png` | The vacancy summarises its own pipeline: five counts about THIS job (5 total, 2 awaiting review, 0 in assessment, 1 at interview, 1 hired), and one sentence saying what to do. The rejected application is in the total and in no stage. |
| `applications-filtered-desktop.png` / `-mobile.png` | Where the "2 awaiting review" card lands: the applications list filtered to this job and this status. A count that does not open the rows it counted is a reading-comprehension exercise. |
| `candidate-decision-pending-desktop.png` / `-mobile.png` / `-en.png` | Phase 1's hinge. The fifth row reads "Väntar på beslut av en människa" / "Pending human decision", and the next step leads to the decision controls — where it used to say nothing was outstanding. |
| `candidate-decision-hired-desktop.png` / `-mobile.png` | The same row after a human recorded a hire: "Beslut registrerat: anställd", and the door into the employment record it produced. |
| `employee-360-desktop.png` / `-mobile.png` / `-en.png` | Employee 360: who and where, the door back to the application the hire came out of, an honest empty state naming what is missing rather than a heading over nothing, this person's own development, and an assign action that carries them. |
| `overview-desktop.png` / `-mobile.png` | The work list, with the interview rows now carrying a stage. |

## HEAD

Captured at the tip of `feature/employer-lifecycle-phases-1-3`; the commit is in
the pull request that carries this directory.

## Prerequisites

A local Supabase stack on 54321/54322, and the two phase-3 migrations applied to
it — they are not yet applied hosted, which is why the application PR waits for
the schema PR:

```
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f supabase/migrations/20261205090000_employer_workforce_active_only.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f supabase/migrations/20261206090000_scp_training_assignment_person_context.sql
```

Then the fixtures, in this order (both idempotent, both local-only, both refuse
to run against anything but the development database):

```
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f scripts/fixtures/interview-journey-fixture.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f scripts/fixtures/employer-lifecycle-fixture.sql
```

## The walk

```
bun run dev -- --port 3119 --strictPort
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3119 bun run e2e:employer-lifecycle
```

12 assertions pass across `chromium` and `mobile-375`.

## What these captures do NOT show

A pending organisation being refused an employment record. The portal redirects
every non-active organisation to the waiting page — `/employer/$employerSlug`
has done so since before this work, and its own comment says there is no tier of
"not quite active but close enough". So that refusal cannot be observed in a
browser at all, and it is proven where it is enforced:
`supabase/tests/employer_lifecycle_phase1_3_test.sql` refuses it through the
portal's own role AND through `service_role`, and permits a job draft for the
same organisation in the same transaction.
