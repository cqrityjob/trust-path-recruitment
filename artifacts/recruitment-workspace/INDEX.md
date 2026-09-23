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
| `final-01-overview.png` | Overview: company name, "Skapa rekrytering", three counts (ongoing recruitments, new applications, upcoming interviews), the active-recruitments table (role, status, applications, new, responsible, next activity), today's tasks and the confirmed interview. |
| `final-02-recruitments.png` | Recruitments list: search, phase and responsible filters, drafts / active / completed in one list. |
| `final-03-workspace-candidates.png` | Workspace: breadcrumb Arbetsgivare / Rekryteringar / Väktare, Solna; status, responsible, primary action; tabs with Candidates as default; filter, sort and counts above the table; "Oöppnad" marker. |
| `final-04-candidate-view.png` | Candidate view: back to the list, previous / next with position ("1 av 2"), stage badge, responsible, first-opened stamp, section navigation, the five separate process rows. |
| `final-05-new-applications.png` | Where the overview's "Nya ansökningar" count lands: exactly the two rows it counted. |

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
