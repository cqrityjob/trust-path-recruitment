# E4 · Employer final report — browser evidence

**STATUS: BLOCKED — no captures exist yet in this directory.** The routed
walk now runs in CI and its artifact carries all seventeen, but none of them
is committed here and no human has looked at one. #216 is not complete until
both are true.

## Why it is blocked, as of 2026-09-10

The reason CHANGED, and the old one is no longer true, so it is recorded here
rather than left to mislead.

**The old blocker is solved.** This environment has no Docker daemon and no
Supabase CLI, so the walk could not be run here at all. Route 1 from the list
below — a CI job that starts a real local Supabase stack — was built as
`.github/workflows/e4-evidence.yml`, and it works: six routed tests green
against a loopback-only stack, both languages at both widths, the artifact
scanned clean and uploaded.

**What remains.** Two things, and neither is a matter of running the walk
again:

|                                        |                                                                                                                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The captures are not in this directory | The evidence job runs pull-request code with `contents: read` and no credentials, so it cannot push them, and giving it write access to make this easier would be a worse trade than the inconvenience                                                      |
| Nobody has looked at them              | The session that built this pipeline cannot download the artifact: GitHub serves an artifact zip by redirecting to `productionresultssa1.blob.core.windows.net`, and that container's egress policy denies the host — `CONNECT tunnel failed, response 403` |

So the last acceptance step is a human one: download the artifact, look at the
seventeen captures and the traces, and then commit them here with the
provenance table filled in. Until that happens this file says BLOCKED, and it
says so because that is what is true — not as a formality.

**Where the artifact is.** Every run prints its own full inventory to the job
log — every file with its SHA-256, every capture with what it shows, every
phase duration and the per-test results — so a reviewer can check a downloaded
copy against that listing rather than taking it on trust.

What is **not** acceptable: pointing the walk at production, weakening the
`E2E_LOCAL_STACK` gate, relaxing the spec's loopback-only refusal, or
renaming or removing this BLOCKED requirement to make a guard green.

Everything the walk shows is synthetic. No real candidate, name, address, CV,
Passport or production record appears in any capture, no filename contains a
person's name, and every identifier visible in a URL is an opaque
server-issued uuid.

The screenshots SUPPORT the assertions; they do not replace them. The
behavioural proof is `scripts/employer-final-report-check.tsx` (534 assertions,
wired into the CI `verify` job, with 141 negative controls in
`scripts/negative-controls/final-report-controls.ts`) and the SQL suite
`supabase/tests/scp_iv_report_basis_integrity_test.sql` (run by
`scripts/db-test.sh`, which also applies the rollback for real and re-applies
the migration).

## Provenance

|                      |                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Captured at HEAD** | _pending_ — nothing is committed here yet                                            |
| Branch               | `claude/interview-report-sharing-e4`                                                 |
| Base                 | `main`                                                                               |
| Backend              | local Supabase only (`http://127.0.0.1:54321`, Postgres on `54322`) via `.env.local` |
| Browser              | Chromium, Playwright                                                                 |
| Viewports            | 1440×1000 (captures 01–09, 14–15), 375×812 (captures 10–13, 16–17)                   |

The dev server must run with `.env.local` present. Without it the worktree's
`.env` points at the **live hosted project**, and no browser walk may be run
against that.

## Reproduce

```bash
# 1. The local stack, and the URL everything else uses. Nothing below
#    types out a host, a port or a password: one validated URL, or nothing.
supabase start
DB_URL=$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')

# 2. Fixtures, in this order. Both are idempotent, and both refuse to run
#    against anything but the local development database.
psql "$DB_URL" -f scripts/fixtures/interview-journey-fixture.sql
psql "$DB_URL" -f scripts/fixtures/employer-final-report-fixture.sql

# 3. The application, pointed at the local stack.
bun run dev -- --port 3117 --strictPort

# 4. The captures. The spec moves the basis twice through psql against
#    127.0.0.1:54322 (see its header); it refuses any other host.
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 \
  E4_DATABASE_URL="$DB_URL" E4_FORBIDDEN_PROJECT_REF=<the owner project ref> \
  bunx playwright test e2e/employer-final-report-evidence.spec.ts \
    --project=chromium --workers=1 --trace on
```

The fixture walks two cases to ASSESSED through the governed RPCs — one for
the Swedish captures, one for the English captures, because a
finalised case offers no preview. Each carries two assessors on the same
question at different levels (the second written physically first), a
Passport disclosure holding one self-declared and one genuinely verified
claim, a released employer assessment document beside an unreleased attempt,
and one unresolved difference. It writes no report row: the walk finalises for
real.

## What each capture must show

### 01 · `01-sv-1440-preview-first.png` — Swedish desktop 1440

The report screen before any preview. The finalise control is present and
disabled; the page says the report must be previewed first. No document.

### 02 · `02-sv-1440-exact-preview-two-assessors.png`

**The exact preview.** The server's own basis, rendered by the same component
that renders a finalised report, marked "Förhandsgranskning — inte
färdigställd". Section 2 shows the released assessment result bound to its
snapshot with its finding ("Fördröjd eskalering i scenario 2") and the second
attempt as not released. Section 3 shows the confirmed evidence with its
classification badges — the two Passport lines as "Passport-delning (ej
verifierad här)", the note-backed line as an interviewer observation. Section
4 shows **both** assessors' levels and rationales, each labelled a human
interpretation, with "Bedömarna är inte överens". Section 5 carries the
unresolved difference. The decision boundary states that no decision is
recorded. The finalise control is now enabled.

### 03 · `03-sv-1440-stale-preview-refused.png`

One more open finding was written between the preview and the click. The
server refused with `SCP_IV_STALE_PREVIEW`; the page shows the announced
stale state ("Underlaget har ändrats sedan förhandsgranskningen"), the
finalise control is withdrawn, and **no report exists** — nothing was written.

### 04 · `04-sv-1440-finalise-focused.png`

After a fresh preview, the finalise control reached by **keyboard** (Tab, not
`.focus()`), focus ring visible. The next keypress is the one explicit human
act.

### 05 · `05-sv-1440-immutable-final-v1.png`

**The immutable report**, rendered from the governed readback: "Färdigställd
och oföränderlig", version 1, the finalising person named ("Färdigställd av
Journey Testare") and dated, the readback saying the digest was recomputed
and matches. The preview control is gone. Same body as capture 02 plus the
finding added in 03.

### 06 · `06-sv-1440-two-versions.png`

After a governed correction (more evidence, a re-assessment, preview,
finalise — all through the RPCs), the version list shows version 2 as current
and version 1 as superseded, each with who finalised it, and offers "Öppna
version 1".

### 07 · `07-sv-1440-historical-version-opened.png`

Version 1 opened: the earlier immutable document, marked "Tidigare version —
ersatt", with its own finaliser and date, and "Visar version 1" in the list.

### 08 · `08-sv-1440-member-not-offered-finalisation.png`

Signed in as the ordinary member: the whole report screen, the sequence
naming finalisation as "Görs av ägare eller administratör", and **no**
finalise control.

### 09 · `09-sv-1440-candidate-denied.png`

Signed in as the candidate the report is about: no document in any mode, no
finalise control, none of the report's text. The report is never shared with
the candidate, and nothing on the page says one exists.

### 10 · `10-en-375-preview-first.png` — English mobile 375

Capture 01 in English on a phone, with no horizontal overflow (asserted).

### 11 · `11-en-375-exact-preview.png`

Capture 02 in English on a phone: "The assessors do not agree", "Passport
disclosure (not verified here)", the advertised role in English ("Guard
East"), no horizontal overflow.

### 12 · `12-en-375-finalise-focused.png`

The finalise control reached by keyboard at 375, ring visible.

### 13 · `13-en-375-immutable-final.png`

"Finalised and immutable", the finaliser named, on a phone, no horizontal
overflow.
