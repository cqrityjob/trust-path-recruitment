# E4 · Employer final report — browser evidence

**STATUS: BLOCKED — no captures exist yet.** #216 is not complete until the
thirteen captures below have been taken from the real routed application,
signed in as the fixture accounts, against a LOCAL Supabase stack, and
committed to this directory with the provenance table filled in.

The environment this branch was built in has no container runtime, so the
local Supabase stack (`supabase start`) cannot run there. The CI "CV browser"
job signs in against the **hosted** project through the checked-in `.env`,
and no browser walk that writes recruitment records, finalises reports or
creates sign-in credentials may be run against that. The captures therefore
have to be produced on a machine with the local stack — a laptop, or a CI
job that starts `supabase` in a service container — and this file updated
with the HEAD they were taken at.

Everything the walk shows is synthetic. No real candidate, name, address, CV,
Passport or production record appears in any capture, no filename contains a
person's name, and every identifier visible in a URL is an opaque
server-issued uuid.

The screenshots SUPPORT the assertions; they do not replace them. The
behavioural proof is `scripts/employer-final-report-check.tsx` (366 assertions,
wired into the CI `verify` job, with 65 negative controls in
`scripts/negative-controls/final-report-controls.ts`) and the SQL suite
`supabase/tests/scp_iv_report_basis_integrity_test.sql` (run by
`scripts/db-test.sh`, which also applies the rollback for real and re-applies
the migration).

## Provenance

| | |
|---|---|
| **Captured at HEAD** | _pending_ |
| Branch | `claude/interview-report-sharing-e4` |
| Base | `claude/interview-governance-e3` |
| Backend | local Supabase only (`http://127.0.0.1:54321`, Postgres on `54322`) via `.env.local` |
| Browser | Chromium, Playwright |
| Viewports | 1440×1000 (captures 01–09), 375×812 (captures 10–13) |

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
     -f scripts/fixtures/employer-final-report-fixture.sql

# 3. The application, pointed at the local stack.
bun run dev -- --port 3117 --strictPort

# 4. The captures. The spec moves the basis twice through psql against
#    127.0.0.1:54322 (see its header); it refuses any other host.
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 \
  bun run e2e:employer-final-report-evidence
```

The fixture walks two cases to ASSESSED through the governed RPCs — one for
the Swedish desktop captures, one for the English mobile captures, because a
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
