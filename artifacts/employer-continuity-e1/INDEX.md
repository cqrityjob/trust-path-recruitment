# E1 · Employer process continuity — browser evidence

Eleven captures from the real routed application, against the LOCAL Supabase
stack, signed in as real fixture accounts.

Everything shown is synthetic. No real candidate, name, address, CV or
production record appears in any capture, no filename contains a person's name,
and every identifier visible in a URL is an opaque server-issued uuid.

The screenshots SUPPORT the assertions; they do not replace them. The
behavioural proof is `e2e/employer-process-continuity.spec.ts` (22 tests across
chromium and mobile-375) and `scripts/employer-process-continuity-check.tsx`
(390 assertions, wired into the CI `verify` job).

## Provenance

| | |
|---|---|
| **Captured at HEAD** | `573fa19ac345c531dc862f46d6a7392180a6ec28` |
| Branch | `claude/employer-process-continuity-e1` |
| Base | `origin/main` `e435705722d06446cb8755ca532c3062df070a94` |
| Backend | local Supabase only (`http://127.0.0.1:54321`, Postgres on `54322`) via `.env.local` |
| Browser | Chromium, Playwright |
| Viewports | 1440×1000 (captures 01–09), 375×812 (captures 10–11) |

The dev server must run with `.env.local` present. Without it the worktree's
`.env` points at the **live hosted project**, and no browser walk may be run
against that.

## Reproduce

```bash
# 1. The local stack. `colima start` first if the containers are down.
supabase status

# 2. Fixtures, in this order. Both are idempotent, and both refuse to run
#    against anything but the local development database.
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -f scripts/fixtures/interview-journey-fixture.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -f scripts/fixtures/employer-process-continuity-fixture.sql

# 3. The application, pointed at the local stack.
bun run dev -- --port 3117 --strictPort

# 4. The captures.
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 \
  bunx playwright test e2e/employer-process-continuity-evidence.spec.ts \
  --project=chromium

# And the assertions the captures stand beside.
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 \
  bunx playwright test e2e/employer-process-continuity.spec.ts \
  --project=chromium --project=mobile-375
```

## What each capture verifies

### 01 · `01-sv-1440-candidate-360-linked.png` — Swedish desktop 1440
The recruitment-linked Candidate 360. **Four tracks, four separate states**
(`Ansökan` · `Bedömning` · `Intervju` · `Rapport`), the lede stating that
assessment and interview are optional and *never change the application's stage
automatically*, and **one** next step. Candidate, advertised role, applied date
and application status are all above the assessment, CV, Passport and
governance sections further down.

### 02 · `02-sv-1440-interview-linked-context.png` — same candidate, job, application
The linked interview, reached from the strip's action. Verifies that context
survived the hop: the **same candidate** (`E1 Kandidat A`), the **advertised
role** (`Vaktare, stationar bevakning`, read from the application's own job),
`Kopplad till ansökan`, and — the correction this phase turns on — the
interview guide labelled `Intervjuguide` and the case's own heading labelled
`Intern rubrik`, neither of them printed as the role.

### 03 · `03-sv-1440-returned-to-application.png` — return to exactly the same application
Reached by clicking the interview's own `Tillbaka till ansökan`. Compare it
with 01 line for line: the same candidate, the same advertised role, the same
application id in the URL, the same four track states and the same next step —
the recruiter is back on the **same** application, not on a list, not on a
different record, and not on a page that has to be re-navigated to. The only
difference from 01 is the hover state the click left on the action.

(The assertion behind it is in the spec: after the click, the URL is
`…/applications/e1000000-…-aa01` and the strip is visible again. Browser Back
and Forward across the same hop are asserted there too.)

### 04 · `04-sv-1440-report-material-ready.png` — report material
A case at `assessed`. The interview row reads `Rapportunderlag redo` and the
report row `Rapportunderlag redo för granskning`. **No finalised report is
claimed**, and the chip further down the page uses the same words as the strip.

### 05 · `05-sv-1440-report-finalised.png` — finalised report
A case with a real `scp_interview_reports` row at `final`: `Fastställd rapport
finns`, and the action opens it. Read together, 04 and 05 are the distinction
between report *material* and a report.

### 06 · `06-sv-1440-standalone-interview.png` — standalone process
An intentionally standalone interview: `Fristående intervju`, `Ingen annonserad
roll`, a sentence saying it is not connected to a CQrityjob application, and
**no return link**, because there is nothing to return to. Nothing is inferred
from the candidate's name.

### 07 · `07-sv-1440-member-permission-state.png` — member / permission state
The same application as 09, signed in as a **member** rather than an owner. No
assign control is drawn, because `scp_assign_from_application` requires
owner/admin — the page does not offer work the database would refuse, and does
not present the absence as the process being blocked.

### 08 · `08-sv-1440-partial-read-failure.png` — failed read, no false zeros
The interview read forced to HTTP 500 at the network boundary. The interview and
report rows read `Kunde inte hämtas` with a warning glyph (not colour alone);
the application and assessment rows **still show their real state**; **no next
step is proposed** from a partial picture; and a retry is offered that keeps the
route. The section below says the same thing rather than `Ingen intervju
planerad` under a button offering to plan one.

### 09 · `09-sv-1440-nothing-started.png` — no assessment or interview flow started
An application with neither process. `Ingen bedömning skickad`, `Ingen intervju
planerad`, `Ingen rapport`, and the message that **neither is required** — the
application can be decided without both. The strip draws **no call to action**
in this state: it is not a funnel.

### 10 · `10-en-375-candidate-360.png` — English mobile 375
The same page in English at 375×812, reached through the product's own language
switch. Context and the primary action come before the methodology; there is no
horizontal overflow.

### 11 · `11-en-375-primary-action-focus.png` — keyboard focus on the primary action
The strip's one primary action with a **visible focus ring**, reached by tabbing
from the top of the document rather than by `locator.focus()` — Chromium does
not apply `:focus-visible` to programmatic focus, so tabbing is both the honest
capture and the stronger property: the action is reachable in the focus order.

## Fixture identifiers

Opaque ids only. These appear in URLs; nothing else does.

| Scenario | Application | Interview case | Captures |
|----------|-------------|----------------|----------|
| Linked, interview `prep_approved` | `e1000000-…-aa01` | `e1000000-…-cc01` | 01, 02, 03, 08, 10, 11 |
| Linked, interview `assessed` — material, no report | `e1000000-…-aa02` | `e1000000-…-cc02` | 04 |
| Linked, nothing started | `e1000000-…-aa03` | — | 07, 09 |
| Standalone — `application_id` NULL | — | `e1000000-…-cc03` | 06 |
| Linked, real finalised report (journey fixture) | `9e000000-…-e001` | `d4a40c8c-…-6d04` | 05 |

Accounts: `journey@local.test` (owner) and `interviewer@local.test` (member),
both synthetic, both local-only, both created by the journey fixture.
