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
| 1 | a stable idempotency key exists before the first attempt | the client mints `operationId` on screen 3 and autosaves it into the draft |
| 2 | a retry returns the same merit id | the creation event carries `operation_id`; the function reads it and returns early |
| 3 | parallel identical requests cannot duplicate | `sp_events_one_per_operation`; the loser's subtransaction rolls its own merit row back |
| 4 | Passport creation is idempotent | `INSERT … ON CONFLICT (holder_user_id) DO NOTHING`, both in the function and in `ensureMyPassport` |
| 5 | merit + creation event + onboarding transition are atomic | one function, one transaction |
| 6 | one creation event and one completion event per operation | the same partial unique index |
| 7 | required values validated on the server | eight named refusals before any write |
| 8 | the declaration is validated before `declared_accurate_at` | `SP_DECLARATION_REQUIRED`, the first refusal in the body |
| 9 | *Save and exit* saves a draft and stays `in_progress` | it writes only `onboarding_answers` / `onboarding_step` |
| 10 | single-flight completion | a ref-guarded in-flight promise in the route |
| 11 | pending debounced saves flushed and awaited | the completion flushes the draft timer, then sends the **current** field values as arguments |
| 12 | "Saved" only after confirmed server success | screen 4 is reached only from a confirmed readback |
| 13 | the client reads the exact subject back and checks it | `readBackFirstMerit`, compared field by field in the browser |
| 14 | an unknown readback is neither success nor failure | a third outcome, with its own copy and its own link |
| 15 | audit-event errors are never ignored | an event insert failure aborts the whole transaction |

The idempotency record is the audit log itself rather than a side table. The
creation event already names the subject, the holder and the moment; carrying
the operation id in its `detail` means there is exactly one place that can
answer "has this operation happened, and what did it produce".

---

## 4. Trust semantics of a first merit

A merit created here is:

- `assertion_level = 'self_declared'`
- `lifecycle_state = 'active'`
- no verifying organisation, no verification method, no verification date

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
