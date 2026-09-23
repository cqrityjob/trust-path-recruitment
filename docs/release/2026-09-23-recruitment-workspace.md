# 20261207090000 — the recruitment workspace

Two pull requests, in this order. Neither is released without the Product Owner's
approval.

| # | Branch | Contains | Class |
| --- | --- | --- | --- |
| 1 | `claude/recruitment-workspace-schema` | the migration, its rollback, `supabase/tests/recruitment_workspace_test.sql`, its registration in `scripts/db-test.sh`, the pending `release-state.json` entry, the generated types, this document | SCHEMA RELEASE |
| 2 | `claude/cqrityjob-employer-recruitment-896896` | everything in `src/`, the guards, the negative controls, CI registration, the browser evidence in `artifacts/recruitment-workspace/` | APP RELEASE |

PR 2 is stacked on PR 1. Its `schema-first-release:check` is **red by design** until
the migration is applied hosted and recorded: the application code calls
`rec_submit_application`, `rec_set_application_stage`, `rec_claim_message_send` and
thirteen other functions that do not exist on the live database until then. Lovable
rebuilds the site from `main` the moment code merges; the migration runs only when the
Supabase GitHub integration applies it. Merging PR 2 first would break submitting an
application on every published vacancy.

## What the migration adds

Eight tables, all tied to the existing `jobs` / `job_applications` rows. There is no
second candidate database: an application is still one `job_applications` row, and
everything below hangs off it by foreign key.

| Table | Holds |
| --- | --- |
| `recruitment_settings` | per job: responsible person, `open / completed / cancelled`, version |
| `recruitment_requirements` | mandatory / desirable requirements, SV + EN labels |
| `recruitment_questions` | application questions (text or yes/no), optionally linked to a requirement |
| `job_application_answers` | the candidate's answers, with the prompt snapshotted |
| `recruitment_application_meta` | per application: responsible person, first opened |
| `recruitment_comments` | internal notes — never visible to the candidate |
| `recruitment_interview_bookings` | time, duration, **time zone**, onsite / video / phone, status |
| `recruitment_messages` | drafts and sent messages, with e-mail status reported separately |

### Access

- Every table: `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`, then `SELECT` only,
  behind RLS. Hosted default privileges would otherwise hand `anon` INSERT, UPDATE,
  DELETE and TRUNCATE on each new table.
- `anon` may read requirements and questions of a *published* vacancy only (through the
  existing `jobs` policy), so the public page can show them.
- A candidate may INSERT answer columns for their own application, nothing else.
- Every write an employer makes goes through a `SECURITY DEFINER` `rec_*` function that
  checks active membership of an active organisation. Decisions (`hired`, `rejected`)
  additionally require owner/admin or the recruitment's responsible person; the
  database refuses anyone else with `42501 RECRUITMENT_DECISION_NOT_PERMITTED`,
  whichever client sends it.

### Rules the database enforces, not the interface

| Rule | Where |
| --- | --- |
| No application after the deadline, after expiry, or once completed (`VACANCY_CLOSED`) | `job_applications_window_guard` |
| Required questions answered, checked at COMMIT (`APPLICATION_ANSWERS_MISSING`) | deferred constraint trigger |
| A stage change states what it expects to replace (`STALE_APPLICATION_STAGE`), so two recruiters never overwrite each other silently | `rec_set_application_stage` |
| Nothing is decided in a completed recruitment (`RECRUITMENT_COMPLETED`) | `job_applications_decision_guard` |
| Requirements and questions freeze once applications exist | `rec_save_vacancy_structure` |
| Submitting twice with the same attempt id returns the same application | `rec_submit_application` |
| Sending twice (double-click, retry) sends one message; a stuck send can be retried after two minutes | `rec_claim_message_send` / `rec_settle_message_send` |
| A stage change sends nothing | no trigger writes a message; the old automatic status e-mail is removed from `updateApplicationStatusAsEmployer` |

Existing report tables, report immutability, Passport sharing and assessment
assignment are **not touched**.

## Proof before merge

- `supabase/tests/recruitment_workspace_test.sql` — 74 assertions (groups V, S, A, T,
  B, M, C, Z), run by `scripts/db-test.sh` as step 5l-ter: applied, stood down with the
  rollback, a negative control that proves the "refused" cases really depended on
  this migration, then reapplied and run again.
- `bun run recruitment-workspace:check` — 473 static assertions over the application
  code (shared count/list definitions, no automatic sending, no match percentage,
  status labels carry text, every read error is rendered as an error and never as an
  empty list).
- `bun run negative-controls:recruitment-workspace` — 14 mutations, each of which must
  turn the guard red.

## Release order

1. **Review and merge PR 1** (Product Owner).
2. **The Supabase GitHub integration applies** `20261207090000` to the hosted project.
   Nobody applies it by hand, and nobody applies it through Lovable's
   `query_database`.
3. **Verify hosted** with the anon publishable key (the only read path to hosted):
   - `GET /rest/v1/recruitment_messages?select=id&limit=1` as anon → a permission error (`42501`), not an empty array;
   - `POST /rest/v1/rpc/rec_complete_recruitment` as anon → `42501`;
   - `GET /rest/v1/recruitment_requirements?select=id&limit=1` as anon → `200` (requirements and questions are the only two tables anon may read, and only
     for published vacancies).
4. **Record it**: move the `release-state.json` entry from `pending` to `applied` with
   the hosted ledger version, refresh the hosted-ledger snapshot, and empty
   `expectedPending` in `scripts/release-frontier-check.ts`. `deploy-plan` fails if
   the snapshot is not refreshed with it.
5. **Merge `main` into PR 2's branch** (a merge, not a rebase: its commits are already
   pushed). `schema-first-release:check` turns green once step 4 is on `main`. CI must be green on the new head.
6. **Review and merge PR 2** (Product Owner). Lovable rebuilds from `main`; publishing
   is the Product Owner's action in Lovable.

### Between steps 2 and 6: today's code on the new schema

The migration changes no grant or policy on `job_applications`; it adds three
triggers. Today's code on `main` keeps working against them, with two tightenings:

| Today's behaviour | With the migration applied |
| --- | --- |
| Candidates apply by direct INSERT | Unchanged. No vacancy has required questions yet (only the new editor creates them), so the answers trigger has nothing to require. **Applying to a still-`published` vacancy whose deadline or expiry has passed is now refused** (today's code checks only `status = 'published'`); the old dialog shows its generic failure for it. |
| Any active member records hired / rejected through `set_application_status` | Owner, admin and a recruitment's responsible person: unchanged. **A plain member is now refused** and sees today's generic "status update failed". This is the intended rule, arriving before its explanation does. |
| The automatic status e-mail on interview / rejected / hired | Unchanged until PR 2 removes it. |

Keep steps 2 → 6 short for that reason.

### Configuration the Product Owner sets in Lovable (not code)

| Variable | Without it |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Messages are delivered inside CQrityjob (Mina ansökningar) and the e-mail status reads "e-post är inte konfigurerad". Nothing claims an e-mail was sent. |
| `INTERVIEW_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and the kill switch `scp_iv_ai_real_model_permitted` set by service role | Every AI button returns an editable template, labelled as a template. The manual workflow is complete without AI. |

## Rollback

In the reverse order of release:

1. **Revert PR 2** on `main` (a revert commit — never a force-push). The site returns
   to the previous employer pages; the new tables stay and are simply unused. Two
   effects of the schema remain: a vacancy created with **required** questions refuses
   applications from the old apply dialog (`APPLICATION_ANSWERS_MISSING`, because it
   sends no answers) — unpublish such vacancies or clear their questions with
   `rec_save_vacancy_structure` while they have no applications — and plain members
   still cannot record hired / rejected (see the table above).
2. **Only if the schema itself must go**: run
   `supabase/rollback/20261207090000_recruitment_workspace_rollback.sql` as a new,
   reviewed migration. It drops the eight tables, their triggers and the `rec_*`
   functions, and removes the three triggers it added to `job_applications`. **This deletes
   requirements, questions, answers, internal notes, bookings and messages** written
   since release; `job_applications` rows themselves are untouched. Export those
   tables first if anything in them must be kept.

Step 1 alone is safe at any time. Step 2 is never run while PR 2's code is live: the
code calls the functions it drops.
