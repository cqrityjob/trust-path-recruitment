# Karriäranalysen (Career Discovery v3.1): availability in every state

**Date:** 2026-10-03. **Route:** `/security-career-assessment`. **Control:**
`public.cd_access_policy` (migration `20261222090000`, unchanged by this work).
**Migration in this change:** none. Every cell below is answered by the existing
functions (`cd_access_state`, `cd_v31_may_start`, `cd_is_internal_tester`,
`cd_set_access_state`, the claim and save path).

This note is the owner's runbook for opening the analysis publicly, and the
evidence that the product behaves coherently in all three states. It is
read-only reference; nothing here changes a state.

## What the owner decides by opening

Production today (read-only query, 2026-10-03): state `internal_test`, 0
internal testers, 48 sessions (4 with `is_internal_test`), seeded 2026-09-29.
For `2026-scd-v3.1.0`: `lifecycle_status = active`, labels `content_version =
v3.1-draft-5`, `scoring_version = v3.1-draft-4`, and **all seven review gates in
`cd_definition_versions.review_status` are `false`** (SME, bias, content,
language, psychometric, accessibility, privacy/legal).

Opening with `cd_set_access_state('public', …)` is a **technical** switch. It
does not clear a gate, does not rename a version, does not change the lifecycle.
By opening, the owner decides that a signed-in person who is not an internal
tester may start, save and keep a result from an instrument that **no specialist
has reviewed yet**. The product says so on every result ("under development …
not yet reviewed by specialists", `careerDiscovery.dashboard.internalTestNote`),
and the anonymous entrance has said it since launch. That decision is the
owner's; this work only makes the product correct and coherent around it.

## The truth table

Legend: **open** = the action works and the surface offers it; **closed** = the
action is refused and the surface does not offer it (it says so, with a way
forward); **kept** = the finished run is not lost.

"UI" is what `/security-career-assessment` and the surfaces that link to it do.
"DB" is what the database functions answer on their own.

### Who can do what, per state

| Actor | `internal_test` (today) | `public` | `paused` |
| --- | --- | --- | --- |
| **Anonymous** | **open**: entrance, start, answer, finish (result built server-side, nothing stored), download. Save only by creating an account (claim). CTAs offered everywhere. | same as `internal_test` | **closed** at once: entrance shows "not open"; a result still being built is refused (`not_available`); CTAs withdrawn. |
| **Signed in, not a tester** | **closed** for start and for saving a run begun while signed in; every CTA withdrawn; the route says "not open for your account" with career centre, jobs and passport as the way on. **Claim of an anonymous run: open** (see below). Can read own saved reports and history. | **open**: start, answer, finish, save (automatic), read, history, retake link, career home summary, profile prefill. | **closed** for start, save and claim; CTAs withdrawn; saved reports and history stay readable. |
| **Internal tester** (`cd_internal_testers` row) | **open** | **open** (the allowlist is not consulted) | **closed** (UI and `cd_v31_may_start`) |
| **Platform admin** | **open** (an admin counts as a tester) | **open** | `cd_v31_may_start` says yes, but the UI is closed to everyone: availability is false and `previewPublicV31Run` refuses whoever asks. Verify as admin under `internal_test`, before `public`. |

### The claim at signup (anonymous run, then account)

The person answers 28 questions signed out, reads the full result, presses
"Create account and save", signs up, confirms by e-mail (a different tab), and
returns through a link carrying `?claim=<token>`. The run is staged in
`localStorage` for seven days (`stageClaim`), and is cleared only after a
confirmed write (`clearPendingClaim` after `persistPublicV31Run` returns).

| State | What the claim does | What the person is told |
| --- | --- | --- |
| `internal_test`, any signed-in person (tester or not) | **Saved.** `resolveSaveGate` answers `allow_claim` for a non-tester, `allow_test_group` for a tester/admin. The claim is resolved before the tester check in the boot effect, so a non-tester is never turned away from their own finished run. Lands on `/my-career?savedReport=…`. | "Your result is saved in My Career." |
| `public` | **Saved** (`allow_public`). | same |
| `paused` | **Not saved, not lost.** `resolveSaveGate` denies every non-admin; the route never calls it (availability is false first). The staged run stays in this browser until its seven days end. | **[fixed]** was the generic "not open for new participants", which said nothing about the result. Now: the finished result is kept in this browser for seven days, it is saved when the analysis opens, open the same link again; no retry button, because retrying cannot succeed. |
| the state changes **between** opening the link and saving | the save is refused with `not_available`. | **[fixed]** was "the report could not be saved, try again", a retry loop that cannot succeed. Now the same truthful "kept, saved when it opens" state, with no retry. |
| a token that cannot be honoured (expired, mismatch, stale, other browser) | unchanged: its own explanation. | **[fixed]** "Take the assessment again" is offered only where the door is actually open for this reader. |

### Every entrance derives from one source

`resolveAnalysisAccess` (`src/lib/career-discovery/analysis-access.ts`) is the
only place that turns the three server answers (`cd_access_state` through
`getV31Availability`, `cd_v31_may_start` through `getV31TesterStatus`, signed in
or not) into **open / closed / unknown**. `useCareerAnalysisOpen` is its only
client reader. The route itself, My Career, the retake link and every CTA read
it. `unknown` (still loading, or the read failed) keeps the action: the route
asks again and shows its own honest state, so a failed read is not a closed
analysis.

| Surface | Before | Now |
| --- | --- | --- |
| Career centre hub: personal section (`PersonalDirection`) | gated | gated (unchanged) |
| Career centre hub: second entry card, "Gör karriäranalysen" (`CareerEntryCards`) | **never withdrawn** | **[fixed]** withdrawn when closed |
| Career centre guide (`ProfessionTemplate`, `cc.test.cta`) | **never withdrawn** | **[fixed]** replaced by the closed sentence |
| Career centre "from my profession", unsupported origin (`PathFromSection`) | **never withdrawn** | **[fixed]** |
| `/assessment` landing | gated | gated, same source |
| My Career: hub tile, direction section, next best action | private copy of the query | **[fixed]** same hook |
| My Career: retake link on the saved report | private copy of the query | **[fixed]** same hook |
| History, empty state (start button) | **never withdrawn** | **[fixed]** |
| Academy home pointer | **never withdrawn** | **[fixed]** |
| Legacy v2.1 report: "retake" | **never withdrawn** | **[fixed]** |
| Jobs invitation card (`AssessmentInvite`, currently mounted nowhere) | **never withdrawn** | **[fixed]** so it cannot become a dead end when mounted |
| Homepage, header, footer | no direct entry (by design) | unchanged |
| `/discovery`, `/discovery/*` | redirect to the canonical route | unchanged |

### Reading, history, print

| Action | Any state | Evidence |
| --- | --- | --- |
| Read a saved report | yes, for its owner, in every state including `paused` | RLS `cd own snapshots select`; no state or tester term anywhere in the read path |
| History, "earlier analyses", career home summary | yes, same reason | `cd_my_report_history` is `security_invoker`; `getActiveCareerReport` reads under the caller's RLS |
| Download (print to PDF) of the anonymous result | yes | `onDownloadResult`, `window.print()` |
| Download (print to PDF) of the **saved** report | **[fixed]** was absent; now the same control, `no-print`, in the report's action bar | `V31ReportView` |

### Where each cell comes from (evidence)

| Cell | Evidence |
| --- | --- |
| Anonymous entrance open under `internal_test` / `public`, closed under `paused` | `cd_access_state()` callable by `anon` (`20261222090000`); `getV31Availability` folds it into `available`; `PublicAssessmentFlow` boot; SQL group M2; e2e "paused" route test |
| Signed-in start: plain account refused under `internal_test`, admitted under `public`, refused under `paused` | `cd_v31_may_start` (SQL M1, nine cells, parsed by the guard); `getV31TesterStatus`; `resolveAnalysisAccess` (guard group 1) |
| Tester admitted under `internal_test` and `public`, refused under `paused`; admin admitted everywhere at the database | SQL M1.2 and M1.4; `cd_is_internal_tester` includes admins (`20260729090000`) |
| Result build refused under `paused` for everyone | `previewPublicV31Run` re-reads the control per call; guard 3.7; e2e "signed-out visitor mid-run" |
| Save of an own run: plain `deny` under `internal_test`/`paused`, `allow_public` under `public` | `resolveSaveGate` (guard 1.2, with the conversion check's existing table) |
| Claim of an anonymous run: plain `allow_claim` under `internal_test`, `allow_public` under `public`, `deny` under `paused` | `resolveSaveGate`; the claim is resolved before the allowlist in the boot effect (guard 4.1); e2e "a plain account's finished run is saved, never turned away" |
| The database itself saves a plain account's claimed run in all three states, idempotently, and another account can neither see nor complete it | SQL group M3 (live v3.1 instrument, the six evidence columns the app sends) |
| Saved report, history, career summary readable in every state | RLS `cd own snapshots select`, `cd_my_report_history` (security_invoker); SQL M3.10-M3.11; e2e "the saved report stays readable" under `paused` |
| Every CTA derives from one source | guard group 2 (a walk of every file in `src/`), render matrix (236 assertions) |
| Opening and rollback with the exact calls | SQL group M4; readiness script run by M6 |

### Indexing

| State | `/security-career-assessment` robots | In `sitemap.xml` |
| --- | --- | --- |
| `public` | indexable (canonical link) | listed |
| `internal_test`, `paused`, unreadable | `noindex, nofollow` | absent |

It followed a hard-coded `noindex` before. It now follows `cd_access_state`,
read per request in the route's server-side head, failing closed to `noindex`.
The sitemap's cache is ten minutes.

## Deliberately not changed

* **No migration.** The database already answers every question. Its one
  limit is stated, not hidden: the database does **not** refuse a signed-in
  person's own `cd_sessions` insert when the state is `paused` or when they are
  not a tester. The gate is the application's (`resolveSaveGate`). A person
  calling PostgREST directly with their own JWT could create a report for
  themselves while paused. It touches only their own rows, so it is recorded
  and not widened into a migration here.
* **Admin under `paused`.** The UI stays closed to everyone. Verify as admin
  under `internal_test` instead.
* The review gates, version labels and lifecycle are untouched.

## Opening sequence (owner)

1. Read the **before** checklist (`supabase/readiness/career-analysis-availability.sql`,
   read-only) as a platform admin or in the SQL editor. Expect `state =
   internal_test`, lifecycle `active`, the gates listed, and the session counts.
2. Decide that the analysis may be opened with the seven gates still `false`.
3. As a signed-in platform admin:

   ```sql
   SELECT public.cd_set_access_state('public', 'Public launch 2026-10-…');
   ```

   or from the SQL editor as the database owner:

   ```sql
   UPDATE public.cd_access_policy
      SET state = 'public', note = 'Public launch 2026-10-…', changed_at = now();
   ```

4. Read the **after** checklist. Expect `state = public`, `changed_at` now, and
   `cd_v31_may_start` true for an account that is not a tester.
5. In a browser, as a plain account (not a tester): see the browser list below.

## What to look at in the browser (after opening)

* Signed out: the analysis starts, all 28 questions, the result appears, the
  save button offers an account. Download works.
* Signed in as a plain account: `/career-center` offers the analysis in the
  hero card, on a profession guide, and in the personal section; `/my-career`
  shows the start link; the route opens on the profile gate or intro, not on
  "not open"; the run saves by itself; the report opens; History lists it;
  "Gör om karriäranalysen" appears on the report; "Ladda ner resultat" prints.
* `/sitemap.xml` lists `/security-career-assessment` (within ten minutes);
  `view-source:` of the route has no `noindex`.

## Rollback

Back to the test group, or closed for everyone:

```sql
SELECT public.cd_set_access_state('internal_test', 'Back to the test group');
SELECT public.cd_set_access_state('paused', 'Paused');
```

`paused` closes the anonymous entrance, the result build, every save and every
claim at once; staged results stay in each visitor's browser for their seven
days and are saved when the analysis opens again. `internal_test` keeps the
anonymous entrance open and returns signed-in starts to the allowlist; claims
keep working.

The **rollback artifact** for the control
(`supabase/rollback/20261222090000_cd_access_policy_rollback.sql`) refuses while
the state is `public`: close first with `cd_set_access_state`, then roll back.
Dropping the control is never the way to close the analysis.

## Found in surrounding code, deliberately not changed

* **Legacy v2.1 result link.** `src/hooks/useMyCareerDirection.ts` builds the
  "view report" link for a person whose only result is a legacy v2.1 run as
  `/security-career-assessment/report/<runId>`, a v3 report route that answers
  "not found" for a run id (`home-presentation.ts` builds the right one,
  `/my-career/reports/<runId>`). The career centre's "no roles named" state
  inherits it. One line, unrelated to availability, so only reported.
* **`getActiveCareerReport`** defaults `isInternalTest` to `true` when the
  session row cannot be read. It only drives a history tag, but it is a
  tester-shaped default; `false` would be the honest one under `public`.
* **v3.0 session route.** `/security-career-assessment/session` (authenticated)
  and `getDiscoveryAccess` / `startDiscoverySession` still gate on
  `cd_is_internal_tester()` regardless of the release control. Nothing links to
  it; it is the retired v3.0 internal-test flow and stays tester-only.
* **`AssessmentInvite`** (jobs) is mounted nowhere. It is gated now so mounting
  it cannot create a dead end.
* **Database enforcement.** See "Deliberately not changed": the state is an
  application gate, not a database one.
* **`my-career-gate:check`** existed but was not wired into CI; it is now.

## What the readiness checks prove

`bun run career-analysis-availability:check` asserts, without a database, that
no surface keeps a private copy of the rule, that every link into the analysis
is behind the one source, and runs the state matrix over the resolver and the
save gate. `supabase/tests/cd_availability_matrix_test.sql` runs the database
half (all three states × admin, tester, plain candidate, anonymous) with a
planted control. `e2e/career-analysis-availability.spec.ts` walks the three
states for a signed-in non-tester in a real browser, in both languages, at
desktop and 375 px.
