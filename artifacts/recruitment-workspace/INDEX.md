# Recruitment workspace — browser evidence

Captured 2026-09-23 by walking the product in a real browser (Playwright,
Chromium, 1440×900 unless noted) against an **isolated local Supabase stack**
with every migration up to `20261207090000_recruitment_workspace.sql` applied.
Nothing here touched the hosted project. Every person, organisation and
application is synthetic:

| Who | Role |
| --- | --- |
| `anna.agare@nordvakt.test` | owner, Nordvakt Säkerhet AB |
| `mats.medlem@nordvakt.test` | member without a recruitment responsibility |
| `rita.rekryterare@nordvakt.test` | member, made responsible for a recruitment |
| `olle.agare@vaktbolaget.test` | owner of a *different* organisation (cross-tenant probes) |
| `kim.kandidat@`, `lars.kandidat@`, `nora.kandidat@test.local` | candidates |

E-mail ran with no `RESEND_*` variables, so every message reads "e-post är inte
konfigurerad" — that is the truthful state, not a stand-in for delivery. The AI
provider ran in synthetic mode, so every AI action returned the labelled
template fallback.

## The finished state (`final-*`)

| File | What it is evidence of |
| --- | --- |
| `final-01-overview.png` / `final-01b-overview-full.png` | Overview: company name, "Skapa rekrytering", three counts (ongoing recruitments 2, new applications 3, upcoming interviews 1), each linking to exactly the rows it counted; the active-recruitments table; today's tasks; the one upcoming interview in a live process; "Andra delar av arbetsplatsen" without a second recruitment card. |
| `final-02-recruitments.png` | Recruitments list: search, phase and responsible filters, drafts / active / completed in one list. |
| `final-03-workspace-candidates.png` | Workspace: breadcrumb, status, responsible, primary action; tabs with Candidates as default; filters, sort and counts above the table. |
| `final-04-candidate-view.png` | Candidate view opened from that list: back to the list, previous / next ("1 av 2"), stage badge, responsible, first opened, section navigation, the process rows (assessment "Slutförd"). |
| `final-05-new-applications.png` | Where "Nya ansökningar 3" lands: the three applications it counted. |
| `final-06..08-*-en.png` | The same three views in English. |
| `final-09..11-*-mobile.png` | The same three views at 375 px; `scrollWidth` equals the viewport on each. |

## The assessment journey (`j2-*`), 2026-09-23

Lars applied to *Väktare, Solna* and also has a rejected application to *Ordningsvakt, Kista*.

| File | Step |
| --- | --- |
| `j2-01` | Employer opens Lars's Solna application from the workspace; "Skicka bedömning · Väktare – Recruitment Assessment". |
| `j2-02` | Sent: "Tilldelad 0/50", and the send button is gone (a second click can no longer send the same test twice). |
| `j2-03` | Candidate answered all 50 items under /academy ("Gäller ansökan: Väktare, Solna") and submitted. |
| `j2-04` | Employer: "Väntar på granskning 50/50" with the reason no review is possible yet and where to grant it. |
| `j2-05` | Owner grants a colleague (not the assigner) a review seat in Team & behörigheter; the colleague completed the 7 human reviews. |
| `j2-06` | "Underlag klart"; released through the existing "Dela kandidatunderlaget" confirmation (immutable snapshots, two audiences). |
| `j2-07`, `j2-08` | "Slutförd" and "Öppna kandidatunderlag" on the same application; the report page offers "Tillbaka till kandidaten", and the list context is recalled ("Tillbaka till listan" returns to the workspace with its sorting). |
| `j2-09` | Lars's Kista application: "Ingen bedömning har skickats för den här ansökan". Nothing crossed over. |

## The interview and report journey (`j3-*`), 2026-09-23

Nora applied to a vacancy with two required questions.

| File | Step |
| --- | --- |
| `j3-01` | The apply dialog with the two questions answered (yes/no and text). |
| `j3-02` | "Förbered intervju" on the application; setup chosen (no test sent). |
| `j3-03` | The interview context: Nora's answers under "Det här vet vi redan" (attributed to the application), the vacancy's requirements under "Krav i annonsen". |
| `j3-04` | Plan saved and approved (manual path, AI off). |
| `j3-05` | Interview paused after four questions and the page reloaded: four notes persisted, "Återuppta" offered. Resumed, eight questions noted, interview finished. |
| `j3-06`, `j3-07` | Evidence confirmed for all eight questions; eight human assessments; "Klar med bedömningen". |
| `j3-08`, `j3-09` | Preview required before "Slutför rapporten"; finalised as version 1, "Slutlig och oföränderlig", sha256 content sum. Verified outside the UI: the hash recomputes; an UPDATE as the database owner is refused (`SCP_IV_REPORT_IMMUTABLE`); a PATCH as the owner over PostgREST gets `42501`; `scp_iv_final_report` returns `hash_verified: true`. |
| `j3-10` | "Tillbaka till ansökan" from the report straight to Nora's application ("Rapport fastställd"). Her other application is untouched. |

## The journey (`01`–`32`)

| Files | Step |
| --- | --- |
| `01` | First use: the overview with nothing yet, and one way forward. |
| `02`–`06` | Vacancy creation: requirements (mandatory / desirable, from the profession template), the AI text step falling back to a labelled template, application questions linked to requirements, review, published. |
| `07`–`11` | Candidate side: the public vacancy with its requirements, required-answer validation, confirmation only after the application was persisted, the page afterwards, and the dialog reopened later showing the stored application rather than a fresh form. (A second submission is refused by the database's unique rule; that was proven over the API, not captured.) |
| `12`–`15` | Dashboard → new applications → candidate → answers. The mandatory "no" answer is flagged, never auto-rejected. |
| `16`–`18` | Workspace, Team and settings (responsible person), batch selection with the selected count. |
| `19`–`22` | Interview invitation: booking with time, zone and place; composer; recipient review before sending; the candidate confirming it under Mina ansökningar; the overview showing it. |
| `23`–`25` | Interview Intelligence started from the application, carrying the vacancy's requirements, returning to the same application. |
| `26` | A member without responsibility: no decision and no messaging controls (the server refuses them too — see the PR). |
| `27`–`29` | Rejection behind a confirmation (no message sent by it), ready-to-complete listing, the completed recruitment. |
| `30`–`31` | 375 px: overview and workspace, no horizontal scroll. |
| `32` | English: the activity tab. |
