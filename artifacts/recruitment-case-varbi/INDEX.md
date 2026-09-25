# The recruitment case, Varbi-shaped — browser evidence

Captured 2026-09-24 by walking the product in a real browser (Playwright,
Chromium; 1440×900 unless the file name says 1280 or 375) against the
**isolated local Supabase stack** `rec-uat` (API 56321, DB 56322) with every
migration on `main` applied, and the app served by `vite dev --mode recuat`.
Nothing here touched the hosted project. Every person, organisation and
application is synthetic:

| Who | Role |
| --- | --- |
| `anna.agare@nordvakt.test` | owner, Nordvakt Säkerhet AB |
| `mats.medlem@nordvakt.test`, `rita.rekryterare@nordvakt.test` | members of Nordvakt |
| `olle.agare@vaktbolaget.test` | owner of a *different* organisation (cross-tenant probe) |
| `kim.kandidat@test.local` and 31 seeded applicants | candidates |

The case walked is *Väktare, Uppsala* (reference `uatjob0004`), seeded with
32 applications so that the list has two pages. E-mail ran with no
`RESEND_*` variables, so every message reads "e-post är inte konfigurerad";
that is the truthful state, not a stand-in for delivery.

## The walk

| File | What it is evidence of |
| --- | --- |
| `01-dashboard-1440.png` | Overview: three counts (ongoing 3, new applications 20, upcoming interviews 6), the active recruitments as a table with per-case "Nya" (17 + 1 + 2 = 20), today's tasks and upcoming interviews as compact rows. No decorative cards. |
| `02-dashboard-new-applications-link.png` | Where "Nya ansökningar 20" lands: the organisation-wide list filtered to `status=submitted`, the same 20 rows the count was made from. |
| `03-case-applications-selected-1440.png` | The case page, top-down: title with "Visa annons", the facts line (reference, applications, status, responsible, last day), Team / Aktiviteter / primary action, the five-step nav with 1–3 ✓ and step 4 current "(32)", pipeline chips, compact filters (search, stage with counts, responsible, two yes/no selection questions, sort), the persistent action bar with "2 markerade", the dense table (#, Kandidat with "Oöppnad" and "Svarade nej på 1 krav", Steg, Ansökte, Ansvarig, the two question answers, Dokument & anteckningar, Test, Nästa aktivitet). |
| `04-visa-annons-menu.png` | "Visa annons" beside the title: preview, or open the published advert in a new tab. |
| `05-annons-preview.png` | The preview dialog renders the advert as the candidate sees it, from the saved text and requirements. |
| `06-step-1-kravprofil.png` | Step 1: the structured requirements and selection questions the case holds, with the edit link into the editor's requirements step, or the lock note once a decision exists. |
| `07-step-2-annons.png` | Step 2: the advert's facts and description, and the same preview. |
| `08-step-3-publiceringslage.png` | Step 3: real status and dates, the actions that apply to this phase (publish / close / restore / duplicate / delete), and a readiness checklist that names what is missing. Publishing from here flipped steps 1–3 to ✓ without a reload. |
| `09-page-1-of-2.png` | Paging: "Visar 1–25 av 30", page 1 of 2. Page 2 holds the remaining 5; the union of both pages is 30 distinct ids; `?page=9` clamps to page 2. (Since the second review the page comes from `rec_candidate_view`; see 26.) |
| `10-three-selected.png` | Three rows selected: "3 markerade", "Visa ansökan" disabled (it needs exactly one), every other action live. |
| `11-booking-dialog-three-candidates.png` | "Intervju" with three selected: the dialog says "3 separata bokningar, en per kandidat"; one start per candidate, prefilled back to back (10:00, 10:45, 11:30) so no two get the same slot; place / video link / phone; interviewer; the note that title and contact go in the invitation, which is a separate step. There is no send button here. |
| `12-booking-saved-per-candidate.png` | After "Spara 3 tider": a per-candidate result list, and the table's "Nästa aktivitet" column shows each booking as "Planerad – inte skickad" without a reload. |
| `13-batch-partial-result.png` | "Ändra status → Flytta till granskning" on one new and one already-reviewed candidate: "1 flyttade. 1 hoppades över…", each named with its outcome; the skipped one stays selected so it can be acted on again. |
| `14-assign-test-result.png` | "Tilldela test" on two candidates: "2 av 2 kandidater har nu testet". Run twice on the same two: the same result, and the database holds exactly one assignment each. |
| `15-candidate-review-prev-next.png` | Opening a candidate from the list: "Tillbaka till listan", Föregående / Nästa with "2 av 30" walking the server's filtered order across page boundaries (the position and the neighbours are asked of the server; the browser holds the list's definition, never its ids), then the existing candidate view unchanged. Back restores `?step=applications&sort=name&page=2`. |
| `16-step-5-beslut-avslut.png` | Step 5: close applications, then complete the recruitment once every candidate has a decision; the history stays. Hiring is one candidate at a time on the candidate page; there is no batch hire. |
| `17-case-en.png` | The same case in English. |
| `18-case-1280.png`, `19-dashboard-1280.png` | At 1280 px the page is 1280 wide; the table scrolls inside its own frame (1040 px minimum), the page never does. |
| `20-case-375.png`, `21-dashboard-375.png` | At 375 px: "Steg 4 av 5 · Ansökningar", the step row scrolls sideways, the rows become cards with the same checkbox and the same action bar, `scrollWidth` equals the viewport. |
| `22-booking-dialog-375.png` | The booking dialog at 375 px, one candidate: date, start, end with the derived duration, timezone, kind, place, interviewer. |
| `23-candidate-review-375.png` | The candidate view at 375 px with "1 av 30" and prev / next. |
| `24-step-5-375.png` | Step 5 at 375 px. |

## The second review's two defects, fixed (2026-09-24)

The review found that the case page read at most 5 000 applications into
memory (PostgREST's row cap made it 1 000 in practice) and paged them
there, and that the booking dialog clamped a slot past midnight to 23:59.
Both are gone; the captures below are the proof, taken against the same
local stack after `scripts/fixtures/recruitment-workspace-fixture.sql`
added *Väktare, Norrköping* with 5 050 applications.

| File | What it is evidence of |
| --- | --- |
| `25-dashboard-5050-applications.png` | Overview after the 5 050-application vacancy: "Nya ansökningar 5015", the per-case "Nya" column (5000 + 12 + 1 + 2), and "5015 nya ansökningar" under Att göra idag -- every one of them the database's own count (`rec_job_counts`), not a sample. |
| `26-norrkoping-page-202-of-202.png` | The case page on the last page: "Visar 5026–5050 av 5050 · Sida 202 av 202", ranks 5026.. in the # column, the oldest applicant (Sökande 0001) last -- rows the old read could never have shown. One page from `rec_candidate_view`; no id of any other page reaches the browser. |
| `27-booking-25-candidates-refused.png` | The reproduction: 25 candidates, 45 minutes from 10:00. Slots 20–25 are empty and flagged "ryms inte inom dagen" -- never 23:59 -- and "Spara 25 tider" is refused as a whole: "18 av 25 tider får plats från 10:00 … Inget har sparats." The booking count in the database is unchanged; the input stays. |
| `28-booking-overlap-refused.png` | A slot typed by hand into another's time (10:00, 10:45, 10:20 with 45 minutes): "Sökande 5050 och Sökande 5048 har tider som överlappar varandra … Inget har sparats." |
| `29-booking-dst-refused.png` | 02:30 on 25 October 2026 in Europe/Stockholm: "inträffar två gånger … sommartiden slutar då". 02:30 on 29 March is refused as a time that does not exist. Neither is guessed at. |
| `30-applications-list-capped.png` | The organisation-wide list (the H1 page the overview's count links to) reads the newest rows in one go and now says so: "visar de 1000 senaste ansökningarna av 5088" with a pointer to the paged case pages. |

## Autosvar vid mottagen ansökan (2026-09-25)

The automatic receipt, walked end to end on the same local stack with no
`RESEND_*` variables -- so every e-mail copy reads "e-post är inte
konfigurerad", which is the truthful state, while the receipt itself is in
the candidate's CQrityjob inbox.

| File | What it is evidence of |
| --- | --- |
| `31-receipt-settings-on.png` | Team och inställningar → "Kommunikation och autosvar": the switch (På), subject and body with the four placeholders, the live preview with sample data (Kim, Väktare, Uppsala, Nordvakt Säkerhet AB, the link), Spara and Återställ standardtext, the two channels in words, "Sparat. Nya ansökningar får en mottagningsbekräftelse." |
| `32-receipt-settings-full.png` | The whole Team view with the section, before it was switched on (Av). |
| `33-receipt-settings-en.png` | The same section in English. |
| `34-receipt-settings-375.png` | The section at 375 px; `scrollWidth` equals the viewport. |
| `35-publishing-receipt-summary.png` | Publiceringsläge: "Mottagningsbekräftelse: På · Ändra". |
| `36-candidate-receipt.png` | The candidate's Mina ansökningar, landed on `?application=<id>`: the card is highlighted, the receipt is labelled "Automatisk mottagningsbekräftelse", and reads "Hej Kim! Tack för din ansökan till tjänsten Väktare, Uppsala hos Nordvakt Säkerhet AB…" with the link to this application. |
| `37-candidate-receipt-375.png` | The same at 375 px. |
| `38-employer-receipt-status.png` | The employer's application page: the receipt in the message history, "Automatisk mottagningsbekräftelse · skickad automatiskt", delivery "Levererat i CQrityjob · e-post är inte konfigurerad", and "Skicka e-posten igen" for a person's retry. |
| `39-case-filter-note-next-step.png` | The case page after the review's picture: "33 ansökningar" without a label, "Nästa steg i rekryteringen", the note that the assessment/interview indicators overlap the stages, and the pager "Visar 1–25 av 31 – filter: Aktiva (ej avgjorda) · Visa alla (33)". |

What the database proved (`supabase/tests/recruitment_application_receipts_test.sql`,
44 assertions, in `scripts/db-test.sh` before and after a rollback cycle):
a failed submission leaves no receipt; a replay writes no second one; a
second receipt is impossible whatever writes it; the text is rendered in
the candidate's language and kept as sent; a later template change leaves
old receipts alone; switching on writes nothing retroactively; a member
who is not responsible, another organisation and anon cannot change the
setting; the applicant's own request may send the e-mail but only a
manager may retry; an unsettled claim is `unknown` and is never resent by
itself; a candidate reads only their own receipt.

## Beside Varbi

The three reference screenshots were Varbi's applications view for *KBR-utbildning*,
its "Nytt intervjutillfälle" dialog and its "Intervju" dropdown. Read against
`03`, `11` and the action bar:

- **Same order on the page.** Title and "Visa annons" beside it; the facts line;
  the process nav; filters; one action bar; the table; the pager with the
  hit count. Varbi puts the process nav above the applications; so does `03`.
- **Same action bar, only working actions.** Varbi's bar carries view, message,
  interview, test, status and more. Ours carries Visa ansökan, Skriv meddelande,
  Intervju, Tilldela test (only with the permission), Ändra status and Fler
  åtgärder (assign responsible, deselect). Varbi's score / matching / external
  integrations are not reproduced as empty columns.
- **Interview dialog.** Varbi's dialog has title, start, end, timezone,
  interviewer, place and contact. Ours has date, start, end (duration derived
  and bounded), timezone, kind, place or link, interviewer. Title and contact
  on absence go in the invitation text, which is where the candidate reads
  them; that keeps the booking table as it is (no migration) and keeps
  "save a time" apart from "send an invitation". With several candidates
  selected Varbi books one slot; ours books one slot each, consecutively, and
  says so.
- **Pasted link ≠ integration.** A Teams link in the video field is stored and
  shown as a link, nothing more; the dialog says so.
- **Where we differ on purpose.** No group interviews, no batch hire, no
  automatic rejection or ranking; a "done" step is decided by the data, never
  by a visit.

## Automated checks that back this

- `supabase/tests/recruitment_candidate_view_test.sql` — the database
  read, EXECUTED with 5 200 applications on one vacancy as the roles that
  really call it: 47 assertions over counts, pages (no row twice, none lost,
  a page past the end is the last), stable sorting (ties on the id, Swedish
  order, unnamed and unplanned last), filters ("no" is answered-no), the
  neighbours read, isolation (another organisation, a candidate, a stranger
  and anon), and malformed input. Runs in `scripts/db-test.sh` before and
  after a rollback/reapply cycle, with a negative control that the suite
  fails without the migration. Migration: `20261212090000_recruitment_candidate_view.sql`.
- `bun run recruitment-workspace:check` — 635 assertions. It executes the
  booking arithmetic (25 candidates, 45 minutes from 10:00 → 18 fit, the
  20th slot and later are null and never 23:59; overlaps in any entry
  order; the 2026 Stockholm gap and repeat) and reads the migration for the
  list's rules, the server for "one page, no limit, no ids", the table for
  "remember the definition, never the ids", and the candidate page for
  "previous/next from the server".
- `bun run negative-controls:recruitment-workspace` — 34 planted defects,
  each caught and each file restored byte for byte, among them: the read
  paging in memory again, the overview sampling applications, the chips
  counting the page, previous/next from browser ids, midnight clamped, the
  series saved despite a problem, an overlap unchecked, a DST gap or repeat
  booked silently.
- `e2e/recruitment-workspace.spec.ts` — the walk above, in a browser,
  against a local stack: 13 tests, including the receipt end to end (the
  owner switches it on with a preview, a candidate applies, the receipt is
  read on both sides at the application the link names, nothing
  retroactive, a later edit leaves it as sent) and the permission walk, the 5 050-application vacancy
  (total, last page, search for the oldest applicant, a filter over the
  whole list), previous/next across a page edge with the session holding no
  ids, the 25-candidate refusal with a database count that nothing was
  saved, the overlap and the two DST refusals, another organisation's owner
  seeing no table, a candidate's page never carrying an internal note.
- `.github/workflows/recruitment-evidence.yml` — runs that spec in GitHub
  CI on an isolated local Supabase stack (history replayed as postgres,
  fixture seeded twice to prove it is a no-op the second time, loopback
  proven), and `scripts/recruitment-evidence-verify.ts` then refuses the
  report unless every desktop test ran and passed: a green job where the
  tests skipped is not evidence.

Run it locally against the rec-uat stack:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:56322/postgres" \
  -v ON_ERROR_STOP=1 -f scripts/fixtures/recruitment-workspace-fixture.sql
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:8093 \
E2E_SUPABASE_URL=http://127.0.0.1:56321 \
E2E_SUPABASE_SERVICE_ROLE_KEY=<local service-role key> \
E2E_SUPABASE_ANON_KEY=<local publishable key> \
E2E_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres" \
bunx playwright test e2e/recruitment-workspace.spec.ts --project=chromium --workers=1
```

Result on this branch: 13 passed on chromium (45 s); the two phone
projects skip by design (the table is read as a table).
