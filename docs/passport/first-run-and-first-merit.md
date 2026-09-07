# Security Passport — the first run, and the first merit

PR #192. This note is the written half of two releases: the schema release
(`20261031090000_sp_passport_first_merit.sql`) and the application release
that follows it.

---

## 1. What a new person is asked to do

PR #191 pointed the public homepage at the Passport and sends every new
account through `/signup?redirect=/passport`. The promise made on that page is
one sentence, and the authenticated product has to keep it:

> Create your private Security Passport and add your first merit.

Not "complete your professional profile". Not "take the career analysis". One
task, finished in a few minutes, that leaves a real record behind.

The long-term model is **Add → Strengthen → Share → Create CV**. This is the
first trustworthy *Add*.

---

## 2. The state machine, derived from persisted rows

There is no front-end "has onboarded" flag, and there is no second reading of
the merit lifecycle. The journey's screen is a function of what the database
holds, decided in one place (`src/lib/security-passport/first-run.ts`) and
using the shared predicates `isCurrentMerit` / `isUnfinishedMerit` /
`isArchivedMerit` from `src/lib/security-passport/types.ts`.

| Persisted state                                | Screen                            |
| ---------------------------------------------- | --------------------------------- |
| no `sp_passport_profiles` row                  | 1 · Create your Security Passport |
| profile, no current merit, no saved draft      | 2 · Start with your first merit   |
| profile, no current merit, a saved draft       | 3 · Continue where you left off   |
| `onboarding_state = 'completed'`, no merit     | 2 or 3 — never "you are finished" |
| only `draft` or archived merits                | 2 or 3 — those are not content    |
| at least one **current** merit                 | the ordinary Passport overview    |

A `completed` profile with nothing in it is a real shape in hosted data: the
old wizard could close onboarding without creating anything. The journey
treats it as somebody who has not added a merit yet, because that is what it
is.

The draft is the holder's answers in `sp_passport_profiles.onboarding_answers`
plus `onboarding_step`. It is deliberately **not** a `draft` merit row: *Save
and exit* must create no merit and no declaration, and the cleanest way to
guarantee that is to have nothing to create.

---

## 3. Why the completion is one database function

The old completion did four independent writes from the browser and held
nothing together:

1. `INSERT sp_experience_periods` — skipped if the holder already had a period
2. `UPDATE sp_passport_profiles` — state, and `declared_accurate_at`
3. `INSERT sp_passport_events` ×2 — the declaration and the completion

Each seam is a state somebody reached:

- **1 then a failure at 2.** A merit exists, onboarding says *in progress*, and
  the next attempt skips the insert *because a period now exists*. The person
  is told nothing was saved and can never finish.
- **2 then a failure at 3.** The event insert's error was never read
  (`await db.from(...).insert(...)`, no `error` check), so a Passport could be
  declared accurate with no record that anybody declared anything.
- **The whole thing twice.** Two declarations and two completions in an
  append-only log, and — inside the window before the first commit — two
  employment periods for one job.

And the declaration was never checked. `declared_accurate_at` was written
whenever completion was called; the tick-box lived only in React state.

`public.sp_passport_complete_first_merit(...)` replaces all of it with one
transaction. Its guarantees, in the order the brief asks for them:

| # | Property | Where it lives |
| - | -------- | -------------- |
| 1 | a stable idempotency key exists before the first attempt | the client mints `operationId` on screen 3, **persists it and waits for the confirmation** before any completion is attempted |
| 2 | a retry returns the same merit id | `sp_passport_operations`, checked and re-proved before it is answered |
| 3 | parallel identical requests cannot duplicate | the receipt's primary key; the loser blocks, then replays |
| 4 | Passport creation is idempotent **and atomic** | `sp_passport_ensure` — profile, receipt and event in one transaction |
| 5 | merit + creation event + onboarding transition are atomic | one function, one transaction |
| 6 | one creation event and one completion event per operation | `sp_events_one_per_operation`, plus the receipt |
| 7 | required values validated on the server | eight named refusals before any write |
| 8 | the declaration is validated before `declared_accurate_at` | `SP_DECLARATION_REQUIRED`, the first refusal in the body |
| 9 | *Save and exit* saves a draft and stays `in_progress` | it writes only `onboarding_answers` / `onboarding_step` / `onboarding_draft_revision`, and **navigates only after the server confirms** |
| 10 | single-flight completion | a ref-guarded in-flight promise in the route |
| 11 | pending debounced saves flushed and awaited | the completion flushes the draft chain, then sends the **current** field values as arguments |
| 12 | "Saved" only after confirmed server success | screen 4 is reached only from a confirmed readback |
| 13 | the client reads the exact subject back and checks it | `readBackFirstMerit`, compared **field by field including dates and country** |
| 14 | an unknown readback is neither success nor failure | a third outcome, with its own copy and its own link |
| 15 | audit-event errors are never ignored | an event insert failure aborts the whole transaction |

### Why the idempotency record is a private table

The first draft of this used `sp_passport_events.detail->>'operation_id'` as
the record, and independent review found the hole. `sp_passport_events` is
directly insertable by `authenticated`, and its RLS only checks holder and
actor — so a signed-in holder could mint an `experience_created` event
carrying any operation id, and the function would answer a replay without ever
proving the subject existed, belonged to them, matched the facts they had just
submitted, or that onboarding and the declaration had happened.

An idempotency key is a security boundary. `sp_passport_operations`:

- has **no grant of any kind** for `anon` or `authenticated` — TRUNCATE
  included, which RLS does not cover — and RLS enabled *and forced* with **no
  policies**, so the Data API cannot reach it;
- binds the operation to `auth.uid()`, so replaying somebody else's id is
  refused (`SP_OPERATION_ID_CONFLICT`);
- binds it to a sha256 **fingerprint of the submitted facts**, so the same id
  over different facts is refused (`SP_OPERATION_FACTS_CHANGED`) rather than
  answered with an earlier submission;
- records the subject, which is **re-checked** — it must still exist and still
  belong to the holder — before any replay is answered
  (`SP_OPERATION_SUBJECT_MISSING`).

`sp_passport_events` is hardened in the same migration: its INSERT policy now
refuses a client-written event whose `detail` carries `operation_id` or
`first_merit`, so the forgeable shape cannot be written at all.

### It is not a general merit API

A **new** first-merit operation is refused once the holder holds a current
merit (`SP_FIRST_MERIT_ALREADY_EXISTS`), because a second one would mint a
second declaration and a second `onboarding_completed` into an append-only
log. The **original** operation still replays, so a holder whose response was
lost can still learn what happened. The confirmation screen's "add another
merit" action leaves first-run and opens the ordinary editor.

### …and that decision is serialised per holder

Two requests carrying the **same** operation id serialise on the receipt's
primary key. Two requests carrying **different** ids — two tabs, or a retry
that minted a fresh key — do not: each would insert its own receipt, reach
the current-merit check, see nothing committed, and create a merit.

So the decision is taken under `pg_advisory_xact_lock(hashtextextended(
'sp_passport_first_merit:' || auth.uid(), 0))`, acquired before the receipt is
claimed and before anything is read. An advisory lock rather than a row lock
because there is not always a row — the Passport may be created inside the
operation. It is transaction-scoped, so it is not a permanent constraint: a
holder whose only merit is later archived returns to the first run, exactly as
the persisted-state rule says. A legitimate replay of the original id waits
behind an in-flight attempt and then answers with its merit.

Proven two ways in `scripts/db-test.sh`: two psql processes with different
ids (the second waited the full 3 s and was refused; one merit, one receipt,
one event set, no half-written loser), and a **permanent negative control**
that derives an unlocked copy of the live function from `pg_proc`, runs the
same race, watches two first merits appear, and re-applies the migration.

### Ordered drafts

`sp_passport_profiles.onboarding_draft_revision` makes each save a single
conditional UPDATE: `revision < :revision AND onboarding_state <> 'completed'`.
Two saves in flight therefore land in order whatever the network does, and a
save that was in flight when the completion committed cannot put a finished
Passport back into progress. Two tabs are two Reacts, so the rule lives where
the row is.

---

## 4. Trust semantics of a first merit

A merit created here is:

- `assertion_level = 'self_declared'`
- `lifecycle_state = 'active'`
- no verifying organisation, no verification method, no verification date

The declaration is stamped with the time it was **made**. The first draft wrote
`coalesce(declared_accurate_at, now())`, which for the supported legacy shape —
a profile marked `completed` in the past, carrying an old declaration, holding
no merit — gave a merit created today an affirmation dated before it existed. A
replay never reaches that write, so a re-submission still preserves the
original time.

The function does not *set* those values — it never names the columns at all,
so the row takes the table defaults. The migration's own postflight and
assertion 8.4 of the database suite both fail if any of
`assertion_level`, `lifecycle_state`, `verified_by_user_id` or `verified_at`
ever appears in the body.

The confirmation screen says **"Information provided by you" / "Uppgift från
dig"** and nothing stronger. It does not say verified, confirmed or
documented. Every trust word rendered anywhere in the journey comes from
`describeTrust` in `src/lib/security-passport/trust-presentation.ts`, so PR
#189's rules hold unchanged: a CQrityjob document review is *Documented*, a
structurally unsupported `issuer_confirmation` fails closed, employer-confirmed
employment stays distinct from credential verification, and no surface may
contradict another. No trust score is introduced.

---

## 5. Country

`sp_experience_periods.jurisdiction_code` is `NOT NULL DEFAULT 'SE'`, which is
how a holder who never named a country ended up asserting Sweden. The
employment form therefore asks for the country explicitly, with no
preselection, and the function refuses an employment with none
(`SP_WORK_COUNTRY_REQUIRED`) rather than letting the column default speak.

The four non-employment kinds are written with `jurisdiction_code` left NULL —
a course certificate is provenance, not an authorisation filed in a market —
and a country supplied for one of those kinds is ignored rather than stored.

The list offered is `sp_jurisdictions`: SE, GB, AE. That is a real limit of the
product today and the form says so, rather than implying the world is three
countries. Where the *holder* works stays a separate question, answered on
`/passport/information`, and is untouched here.

---

## 6. Deploy order

Two releases, in this order:

1. **Schema.** `20261031090000_sp_passport_first_merit.sql` + its rollback,
   test suites and this note. Safe alone: nothing existing calls the function,
   and the new index is invisible to every row written so far.
   → apply hosted → verify → record `applied` in `supabase/release-state.json`.
2. **Application.** The rebuilt first-run journey.

`scripts/schema-first-release-check.ts` enforces that order on the pull
request. Reversing it is the 2026-08-25 outage: Lovable rebuilds from `main`
the moment a PR merges, while migrations run only when somebody applies them.

Rollback for (1) drops the function and the index and **touches no holder
data**; `scripts/db-test.sh` asserts exactly that against a database that
already holds merits created through the function, then re-applies the
migration over events that already carry an `operation_id`.
