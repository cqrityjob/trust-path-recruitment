# ADR — One canonical Professional Profile, and a Career Journey that may change

Status: accepted. Delivered as an expand/contract sequence -- see "Release
sequence" below.
Date: 2026-08-30
Supersedes: nothing. Extends the Security Career Profile "Phase 1" note in
`src/lib/security-career-profile/types.ts`.

## Context

Four products answer four different questions about one person:

| Product                       | Question                                                   |
| ----------------------------- | ---------------------------------------------------------- |
| Career DNA (Career Discovery) | What kinds of security work fit how I think and work?      |
| Professional Profile          | Where am I in my career today?                             |
| Security Passport             | What parts of my background have evidence or verification? |
| Career Intelligence Graph     | What realistic paths connect professions?                  |

They knew too little about each other, and in two places they knew the same
thing twice.

### The duplication, as found

| Fact                            | Career Profile (canonical candidate)                                                                                                  | Security Passport                                                                                                                                                                   | Career Discovery run                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Current profession (controlled) | `security_career_profiles.current_profession_slug` — editable in "Din karriärprofil" (/my-career) and the pre-assessment profile step | `sp_passport_profiles.cig_profession_slug` — editable in "Mina uppgifter" and in onboarding, **plus** a third copy in that row's `onboarding_answers['profession.profession']` JSON | `cd_sessions.current_profession_slug` — the career-context step                     |
| Current profession (free text)  | `current_profession_other`                                                                                                            | —                                                                                                                                                                                   | `cd_sessions.current_profession_other`                                              |
| Experience                      | `years_of_experience` (`<1`,`1-3`,`3-5`,`5-10`,`10+`)                                                                                 | `sp_experience_periods` — dated, evidence-bearing, verifiable rows; a **different construct**                                                                                       | `cd_sessions.current_experience_band` (`under_1y`,`1_3y`,`4_7y`,`8_plus_y`)         |
| Current status                  | `current_status` (6 values)                                                                                                           | —                                                                                                                                                                                   | `cd_sessions.context_status` (C1, 5 values, owner-locked, drives the adaptive path) |
| Work country                    | —                                                                                                                                     | `jurisdiction_code` / `sub_jurisdiction_code` + `work_location_confirmed_at`                                                                                                        | —                                                                                   |

Only **one** row of that table was a genuine defect: current profession had
two _editable_ homes with nothing keeping them in step. A candidate who
corrected it in one surface found the old answer waiting in the other, and no
surface could say which one the product believed.

The Career Discovery columns are **not** duplicates. A `cd_sessions` row is an
immutable record of one run; freezing what a candidate said at the moment they
said it is the whole basis on which a historical report stays honest.

### The second defect

Readiness language ("explore now", "possible next step") was computed inside
`buildSnapshot` and frozen alongside the affinity ranking. Two consequences:

- a report could say "we do not know your current situation" in one panel and
  "your possible next step" in the next;
- telling the product where you actually stood, six months later, changed
  nothing. Retaking the whole assessment was the only lever.

## Decision

### 1. `security_career_profiles` is the canonical Professional Profile

No new table. It already existed, is owner-scoped, RLS'd, editable and
snapshot-able, and is explicitly not evidence. Three surfaces now edit that
one row — /my-career, the pre-assessment profile step, and the Career
Discovery career-context step — and none of them keeps a copy.

`sp_passport_profiles.cig_profession_slug` becomes a **one-way mirror**,
maintained by `career_profile_mirror_profession_to_passport()`
(`20261007090000`). The column stays populated because four disclosure
functions read it into the package an employer receives; stopping the writer
without replacing it would empty a recipient-facing field.

Reconciliation of the existing rows never overwrites a user's own answer:

| Before                        | After                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| canonical set, Passport empty | canonical stands                                                                                                                                |
| canonical empty, Passport set | the Passport answer is **adopted** into the canonical row                                                                                       |
| both set, equal               | nothing to do                                                                                                                                   |
| both set, **different**       | canonical stands, both values are recorded in `security_career_profile_reconciliations`, and the user is asked to confirm in the profile editor |

The database never picks a winner in the last case. A conflict record is evidence, so the grants are least-privilege and the
`REVOKE` comes first (Supabase default privileges would otherwise hand
`authenticated` everything, `TRUNCATE` included, which RLS does not cover):

- `SELECT` on the table — the holder must see both values to answer the
  question;
- `UPDATE (resolved_at)` — **column-level**, because RLS decides which _rows_
  a statement may touch and has nothing to say about which _columns_. A
  table-wide `GRANT UPDATE` let a holder rewrite `canonical_value`,
  `passport_value`, `resolution`, `field` or `created_at` on their own row —
  editing the evidence about their own case. The policy looked like the
  control and was not;
- no `INSERT`, no `DELETE`: nobody may manufacture or destroy a record;
- `service_role` keeps full administrative access — the rollback reads these
  values back.

### 2. Work country and employment history stay Passport-only

Not duplicates. `jurisdiction_code` carries a confirmation timestamp and
governs which regulated credentials a holder may claim; `sp_experience_periods`
are dated, reviewable rows with an assertion level. Copying either into a
self-reported profile would create the second writer this decision removes.

### 3. Career Readiness is a deterministic rule set, computed at read time

`src/lib/career-journey/readiness.ts` is pure — no client, no clock, no
randomness — and takes four inputs:

1. **career-level distance** — the profession's catalogued level minus the
   candidate's baseline;
2. **adjacency** — a _published_ `cig_career_transitions` edge, the same
   career area, or an entry role for somebody with no security profession;
3. **regulation** — `cd_professions.regulated`;
4. **Passport evidence** — counts only.

Categories, never percentages: `explore_now`, `possible_next_step`,
`development_needed`, `longer_term_direction`, `formal_pathway_required`,
`not_enough_information`.

Keeping distance and adjacency **independent** is what makes the worked
example come out right without a line of code mentioning police officers. An
officer with eight years sits at the senior baseline, so an entry-level
technical profession is at or below their level — distance alone would call
that "explore now". Adjacency catches it: no published transition, different
career area, therefore "development needed". Their risk-and-crisis matches,
which the graph _does_ connect to policing, come out as a step they can take.

### 4. The unknown case is the first rule, not a fallback

One branch, covering every profession, placed before any rule that can produce
path language. That is what makes "we do not know your situation" and "your
possible next step" structurally unable to appear on the same page.

### 5. Passport evidence sets provenance; it never raises a category

Its only load-bearing use is in the direction of caution: a regulated
profession with no verified credential reads `formal_pathway_required`.
Verified evidence lifts that _headline_ claim — we can no longer assert the
pathway is unaddressed — but never asserts the reverse, because matching a
specific credential to a specific profession's requirements is Passport and
market-pack governance, not readiness. The `regulated` flag stays on the
result either way.

### 6. Nothing about the journey is stored

A report is immutable; a professional profile is the one thing about a
candidate that is _supposed_ to change. Freezing the journey would mean either
a report that goes stale the day somebody changes jobs, or a profile edit that
rewrites history. Computing it on every view is what lets the same frozen
Career DNA produce a different, honest journey six months later without a
single stored byte changing.

## Boundaries this creates

`scripts/passport-separation-check.ts` fails the build if anything under
`src/lib/career-discovery` or `src/components/career-discovery` imports a
Passport module. `src/lib/career-journey/career-journey.functions.ts` is
therefore the **seam**: the only module that reads the canonical profile, the
Layer 4 catalogue, the Career Intelligence Graph and the Passport's evidence
counts together. It hands the pure engine four plain values; the report
component receives a finished `CareerJourney` and has no idea any of those
systems exist.

## Consequences

- The Passport's "Mina uppgifter" now **shows** the current profession and
  delegates editing to /my-career, joining work country and current role as a
  fact it displays but does not own. `BASICS_EDIT_MODE.profession` moved from
  `"inline"` to `"delegated"`, and `DelegatedAction` gained a second shape for
  a destination that is a route rather than an in-page anchor.
- `professionSlug` is gone from `profileBasicsInput` and `onboardingInput` —
  removed from the _schema_, not only the UI, so a stale tab is rejected
  rather than quietly reopening the second writer.
- Career Discovery's experience band is deliberately **not** written back to
  the canonical profile. The two vocabularies have no honest mapping — 4–7
  years is neither "3-5" nor "5-10" — and inventing one would silently change
  what a candidate said about themselves. Both fields are retained, with
  different consumers: the CD band feeds the frozen snapshot's approved stage
  classification; the profile band feeds the live journey.
- The Passport UI would stop writing the column with nothing yet replacing it
  if the code shipped first, emptying the profession in new disclosure
  packages. The delivery is therefore sequenced -- see below.

## Release sequence

Lovable rebuilds the application from `origin/main` the moment a PR merges;
canonical migrations run when somebody applies them. A change that needs both
to move at once has no safe ordering, which is what
`scripts/schema-first-release-check.ts` exists to refuse. So this ships as
three phases, none of which needs a later one to have happened first.

| Phase                               | Contents                                                                                                                           | Safe because                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — EXPAND** (`20261007090000`)   | comments, reconciliation log, mirror + seed triggers, the one-time reconciliation, and a temporary **compatibility** trigger       | Drops no column, adds no constraint an existing client could violate. The current application keeps writing `cig_profession_slug` exactly as it does today, and the compatibility trigger carries that write through to the canonical row so the two cannot diverge during the window. |
| **B — APPLICATION**                 | Passport stops writing the profession; delegation; Career Journey; profile-aware pre-assessment UX; live journey on stored reports | By the time it merges, phase A is applied. It references no object phase A introduces, so it is merge-eligible independently.                                                                                                                                                          |
| **C — CONTRACT** (`20261008090000`) | drops the compatibility trigger                                                                                                    | Ships in the same PR as B and is applied **after** B is live. Since the deploy happens at merge, B's code is running before anyone can apply C, so the trigger is removed only once nothing writes the Passport column any more.                                                       |

### Why the compatibility trigger exists at all

Phase A has two options for the window between "migration applied" and
"application deployed": refuse the old client's writes, which invalidates a
contract a running client depends on and breaks the Passport for every holder
until the code catches up; or make those writes _correct_ by carrying them
through. It takes the second. During the window the product is strictly better
off than it is today — today the two writers diverge silently, and during the
window they cannot.

It never overwrites a free-text profession: `current_profession_other` is the
answer of somebody whose job the catalogue does not contain, and a catalogue
slug arriving from the old Passport UI is not grounds to discard it.

Neither direction can loop: both guard on `IS DISTINCT FROM`, in the trigger
condition _and_ in the statement's own `WHERE`, so the chain is two hops and
terminates on the third.

### The one-way claim is a phase C property

While the compatibility trigger is installed the sync is deliberately
bidirectional, and the expand suite asserts exactly that. "Nothing writes the
canonical row from the Passport side" becomes true when phase C lands, and is
asserted there rather than claimed early.

## Deferred

The reconciliation log has RLS and grants for a future "two places disagreed —
which is right?" prompt, but no application surface ships with it. Two reasons:
the reconciliation may find **zero** conflicts on the hosted database, and
shipping a UI for a state nobody has yet observed is speculative; and reading
that table from application code is precisely what would make phase B depend on
phase A's schema, which is the dependency this sequence exists to remove. The
prompt becomes a small, independently green follow-up once phase A is applied
and the log has been looked at.

## Verified by

- `scripts/career-journey-check.ts` — 77 assertions (readiness behaviour for
  every scenario in the brief, purity, the no-Career-DNA-in-readiness ban, the
  single-writer shape, both locales).
- `supabase/tests/canonical_professional_profile_test.sql` — 69 assertions
  (mirror in both orderings, grants, reconciliation over rows that actually
  disagree, cross-user isolation, the documented rollback, and Group F:
  current main's Passport statements replayed verbatim against the expanded
  schema; and Group G, which becomes a signed-in holder and _executes_ every
  permitted and forbidden statement against their own audit record rather
  than inspecting grants).
- `supabase/tests/canonical_professional_profile_contract_test.sql` — 16
  assertions (the compatibility window closes, the mirror is one-way
  afterwards, the contract is re-runnable and reversible, and no path exists
  from a profile write to a frozen report).
- `scripts/passport-profile-basics-check.tsx`, updated to the new contract.
