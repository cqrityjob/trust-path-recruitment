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
| `09-page-1-of-2.png` | Server paging: "Visar 1–25 av 30", page 1 of 2. Page 2 holds the remaining 5; the union of both pages is 30 distinct ids; `?page=9` clamps to page 2. |
| `10-three-selected.png` | Three rows selected: "3 markerade", "Visa ansökan" disabled (it needs exactly one), every other action live. |
| `11-booking-dialog-three-candidates.png` | "Intervju" with three selected: the dialog says "3 separata bokningar, en per kandidat"; one start per candidate, prefilled back to back (10:00, 10:45, 11:30) so no two get the same slot; place / video link / phone; interviewer; the note that title and contact go in the invitation, which is a separate step. There is no send button here. |
| `12-booking-saved-per-candidate.png` | After "Spara 3 tider": a per-candidate result list, and the table's "Nästa aktivitet" column shows each booking as "Planerad – inte skickad" without a reload. |
| `13-batch-partial-result.png` | "Ändra status → Flytta till granskning" on one new and one already-reviewed candidate: "1 flyttade. 1 hoppades över…", each named with its outcome; the skipped one stays selected so it can be acted on again. |
| `14-assign-test-result.png` | "Tilldela test" on two candidates: "2 av 2 kandidater har nu testet". Run twice on the same two: the same result, and the database holds exactly one assignment each. |
| `15-candidate-review-prev-next.png` | Opening a candidate from the list: "Tillbaka till listan", Föregående / Nästa with "2 av 30" walking the server's full filtered order across page boundaries, then the existing candidate view unchanged. Back restores `?step=applications&sort=name&page=2`. |
| `16-step-5-beslut-avslut.png` | Step 5: close applications, then complete the recruitment once every candidate has a decision; the history stays. Hiring is one candidate at a time on the candidate page; there is no batch hire. |
| `17-case-en.png` | The same case in English. |
| `18-case-1280.png`, `19-dashboard-1280.png` | At 1280 px the page is 1280 wide; the table scrolls inside its own frame (1040 px minimum), the page never does. |
| `20-case-375.png`, `21-dashboard-375.png` | At 375 px: "Steg 4 av 5 · Ansökningar", the step row scrolls sideways, the rows become cards with the same checkbox and the same action bar, `scrollWidth` equals the viewport. |
| `22-booking-dialog-375.png` | The booking dialog at 375 px, one candidate: date, start, end with the derived duration, timezone, kind, place, interviewer. |
| `23-candidate-review-375.png` | The candidate view at 375 px with "1 av 30" and prev / next. |
| `24-step-5-375.png` | Step 5 at 375 px. |

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

- `bun run recruitment-workspace:check` — 608 static assertions, section H
  covers the step model, page slicing, answer filters, select-all-on-page,
  per-item batch results, the ordered-ids handoff, and the booking dialog's
  "sends nothing" contract.
- `bun run negative-controls:recruitment-workspace` — 25 planted defects,
  six new (a step done by visit, a page past the end shown empty, select-all
  reaching other pages, "no" matching the unanswered, a booking that sends,
  the case loading the whole list); each is caught and each file is restored
  byte for byte.
- `e2e/recruitment-workspace.spec.ts` — the walk above, in a browser, against
  a local stack: page order, no row twice across pages, count / filter / rows
  agreement, list context across a candidate visit, select-all is this page,
  per-candidate batch result, two separate bookings with no send, another
  organisation's owner sees no table, a candidate's page never carries an
  internal note.

Run it:

```bash
E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:8093 \
E2E_SUPABASE_URL=http://127.0.0.1:56321 \
E2E_SUPABASE_SERVICE_ROLE_KEY=<local service-role key> \
E2E_SUPABASE_ANON_KEY=<local publishable key> \
E2E_REC_JOB_ID=44444444-dddd-4000-8000-000000000004 \
bunx playwright test e2e/recruitment-workspace.spec.ts --project=chromium
```

Result on this branch: 7 passed on chromium, 14 skipped on the two phone
projects by design (the table is read as a table).
