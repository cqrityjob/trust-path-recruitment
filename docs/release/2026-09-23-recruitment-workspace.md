# 20261207090000 + 20261208090000 — the recruitment workspace

Three pull requests, merged in this order. Nothing goes to production without
Mostafa's approval at each step.

| # | Branch | Contains | Class | Merge when |
| --- | --- | --- | --- | --- |
| 1 | `claude/recruitment-workspace-schema` | **EXPAND** migration `20261207090000`, its rollback, `recruitment_workspace_test.sql`, `recruitment_workspace_transition_test.sql`, db-test registration, pending ledger entry, generated types, this document | SCHEMA RELEASE | first |
| 2 | `claude/cqrityjob-employer-recruitment-896896` | all application code, guards, negative controls, CI registration, browser evidence | APP RELEASE | after 1 is applied hosted and recorded |
| 3 | `claude/recruitment-workspace-backstops` | **CONTRACT** migration `20261208090000` (two triggers on `job_applications`), its rollback, `recruitment_workspace_backstops_test.sql` | SCHEMA RELEASE | after 2 is **published** in Lovable |

## Why three, and why in this order

The database rule this work introduces — *only an owner, an admin or the
recruitment's responsible person records hired / rejected* — must also hold for
someone who calls `set_application_status()` by hand. That backstop is a
trigger on `job_applications`. So is the rule that every required application
question is answered.

Both triggers refuse something **today's application** does as a matter of
course:

| Today's application (main before this work) | What the trigger would do to it |
| --- | --- |
| Shows hire / reject to every member and calls `set_application_status()` | Refuses a plain member. The old page can only say *"Kunde inte uppdatera ansökans status."* |
| Its apply dialog sends no answers | Refuses every application to a vacancy that has required questions |

The Supabase GitHub integration applies a migration **when it merges**; Lovable
serves new code only **when Mostafa publishes**. A trigger that merged with the
application would therefore go live while the old application is still being
served. So the two triggers are their own, last PR, merged once the new
application is published — the repository's expand/contract rule.

Nothing is weaker in the meantime. The new application's only ways to record a
decision and to submit an application — `rec_set_application_stage()` and
`rec_submit_application()` — enforce both rules themselves (EXPAND). Between
PR 2 and PR 3 the only unguarded paths are the ones unguarded on `main` today:
a plain member hand-calling `set_application_status()`, or a candidate
hand-calling the old apply RPC for a vacancy with required questions. PR 3
closes them.

## What each state does — proved, not described

| State | Application served | Proof |
| --- | --- | --- |
| PR 1 applied, PR 2 not yet published | today's | `recruitment_workspace_transition_test.sql`: the old apply RPC still applies to a vacancy with a required question (X1); a plain member still records a decision through the old buttons (X3); an application past its deadline is refused with **23514**, which today's dialog already shows as *"Den här tjänsten går inte längre att söka via CQrityjob."* (X2) — the one behaviour change, and a true sentence |
| PR 2 published, PR 3 not yet merged | new | the same suite's group N: the new paths refuse a missing required answer (N1) and a plain member's decision (N4) on their own; `recruitment_workspace_test.sql` (73 assertions) holds in this state |
| PR 3 applied | new | `recruitment_workspace_backstops_test.sql`: the hand-made paths are refused (K1 required answer at COMMIT, K5 plain member's decision, `42501`) |
| Application rolled back, PR 3's rollback run | today's | identical to the first row: `db-test.sh` stands PR 3 down alone and runs the transition suite against exactly that database |

`scripts/db-test.sh` step 5l-ter runs the suites around a full
stand-down/reapply of the migrations on a clean postgres:16 replay.

## The deployment path accepts this history

- `bun run deploy-plan:check` against the hosted-ledger snapshot (read
  2026-09-23): *WOULD APPLY* `20261207090000_recruitment_workspace.sql` and
  nothing else; on PR 3's branch, `20261208090000` as well. Nothing already
  applied is replayed; production is never re-bootstrapped.
- The integration applied `20261205090000` and `20261206090000` on 2026-09-23
  (PR #280) against this same history, under their canonical versions.
- The one migration-history error seen in local testing is **not** in this
  path: `supabase start` on an empty project stops at `20261028090000` because
  the earlier ledger repair `20260907071826_…` writes that version's alias row
  itself (its purpose on hosted). It affects only a from-scratch CLI bootstrap
  of a new local stack, is pre-existing on `main`, and is why the local UAT
  stack was built by replaying the files with psql. Both new versions are
  unique and above every hosted version.

## Types

`src/integrations/supabase/types.ts` carries the 8 new tables and 19 `rec_*`
functions exactly as `supabase gen types typescript` emits them against a
database with the EXPAND migration applied — the generator Lovable runs after a
hosted apply. A fresh generation was compared object by object: 27 of 27
identical, none missing, so a regeneration changes nothing here. PR 3 adds no
type (trigger functions are not exposed).

## Release order

1. **PR 1** — review and merge (Mostafa). The GitHub integration applies
   `20261207090000`. Verify hosted with the anon publishable key:
   - `GET /rest/v1/recruitment_messages?select=id&limit=1` → permission error
     (`42501`), not an empty array;
   - `POST /rest/v1/rpc/rec_complete_recruitment` → `42501`;
   - `GET /rest/v1/recruitment_requirements?select=id&limit=1` → `200`
     (requirements and questions are the only two tables anon may read, and
     only for published vacancies).

   Record it: the `release-state.json` entry to `applied` with evidence, the
   hosted-ledger snapshot refreshed, `expectedPending` in
   `scripts/release-frontier-check.ts` emptied. `deploy-plan` fails until the
   snapshot is refreshed.
2. **PR 2** — merge `main` into its branch (a merge: its commits are pushed),
   CI green on the new head, review and merge (Mostafa). **Publish in Lovable**
   (Mostafa). Smoke test: create a draft recruitment, open an application.
3. **PR 3** — merge `main` into its branch, CI green, review and merge
   (Mostafa). The integration applies `20261208090000`; verify
   `SELECT count(*) FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND tgname IN ('job_applications_required_answers','job_applications_decision_guard')`
   = 2, and record it as in step 1.

### Configuration Mostafa sets in Lovable (not code)

| Setting | Without it |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a sender on a domain verified in Resend) | Messages arrive in the candidate's CQrityjob inbox (Mina ansökningar); the e-mail status reads "e-post är inte konfigurerad". Nothing claims an e-mail was sent. |
| `INTERVIEW_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and `scp_interview_ai_config.ai_enabled = true` (the platform kill switch, set by a platform admin) | Every AI button returns an editable template, labelled as a template. The manual workflow is complete without AI. |

## Rollback

**Application rollback, keeping the data** (the normal case):

1. Stand the backstops down: a new, reviewed migration carrying
   `supabase/rollback/20261208090000_recruitment_workspace_backstops_rollback.sql`
   (two triggers, two functions; no table, no row). Merge it first.
2. Revert PR 2 on `main` (a revert commit — never a force-push) and publish.

The database is then exactly the "PR 1 applied" state above: today's
application works as it does now, and every requirement, question, answer,
note, booking and message is kept for when the application returns. If step 2
is published before step 1 is applied, plain members see "Kunde inte uppdatera
ansökans status." on a decision until step 1 lands — so do step 1 first.

If PR 3 was never merged, step 1 is skipped.

**Removing the schema** (only if the tables themselves must go): after the
application rollback, a reviewed migration carrying
`supabase/rollback/20261207090000_recruitment_workspace_rollback.sql`. **This
deletes** requirements, questions, answers, internal notes, bookings and
messages; `job_applications` rows are untouched. Export first if anything must
be kept. Never run it while PR 2's code is live: the code calls the functions
it drops.
