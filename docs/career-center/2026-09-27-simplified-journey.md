# Career Center — the simplified journey — 2026-09-27

A reader who chooses their current profession should, on the spot, understand
what the profession involves, which professions can come next, what those
require, and where the jobs are — and reach any of them in one click, without
passing through a list of filters.

## Starting point

- `main` at `f785dd5` (PR #306 merged); rebased onto `df7a74a` (PR #307, which
  touched only the jobs pages and the site header — no Career Center file).
  The Lovable project's latest commit was `f785dd5` when the journey was
  reproduced.
- The published app could not be opened from the verification environment
  (the host answered 403), so the journey was reproduced on that commit in a
  local browser harness: the app's own source, served by Vite, with every
  server function answered from a stub table (see _How it was verified_).

## What the reader hit

Signed out, choosing **Väktare** under "Vilket yrke arbetar du i i dag?":

| #   | What happened                                                                                                                                                                                                                                                                                                                 | Why                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R1  | The answer was a card with "Läs om Väktare" and "Se möjliga nästa steg" — which only scrolled a few hundred pixels.                                                                                                                                                                                                           | The section was built as navigation to an answer rather than the answer. |
| R2  | Three transition cards, whose only link was the profession's name in the heading. What looked like the action was "Vad steget innebär ▾", a disclosure, beside "Se lediga jobb". The fourth move was behind "Se alla 4 nästa steg i yrkesguiden" — another hop.                                                               | `MAX_PATH_DIRECTIONS = 3`; `TransitionCard` linked only its heading.     |
| R3  | Säkerhetschef and AML-specialist (no recorded onward move) printed one sentence and "Utforska yrkeskatalogen".                                                                                                                                                                                                                | The empty state had nothing to offer but the catalogue.                  |
| R4  | Every "explore" link — the empty state, the analysis offer, an unknown saved role, the catalogue profession page — led to `/career-center?all=true#utforska-yrken`: a search box, a family filter under four headings, a level filter, "Fler filter" with four more and three quick-choice links. 29 controls over 11 guides. | The list of professions existed only inside the explorer.                |
| R5  | On a guide, the jobs link sat in "Ditt nästa steg" together with the Passport, followed by the career analysis; "Kompetenser som efterfrågas" came before the requirements.                                                                                                                                                   | Section order predated the reading order the owner asked for.            |
| R6  | In the test report, a staged card's "Läs om yrket" unfolded an in-card summary instead of opening the profession.                                                                                                                                                                                                             | The button toggled the card's panel.                                     |

Screenshots: `screenshots/simplified-2026-09-27/before-*`.

## What changed

**The list of professions is shown, not searched.** The explorer
(`ProfessionExplorer`, `explorer-state.ts`) is gone. The hub lists every
published guide as a card — "Alla yrken (11)" — ordered by the level one can
start at, then by title (`hubProfessions`, `hub-search.ts`). Level and family
are still printed on each card as information; the underlying classifications
are untouched. Every "see all professions" link is an in-page link to that list.

**Old links still work and narrow nothing.** `?all=`, `?q=`, `?family=`,
`?level=`, `?regulated=`, `?sector=`, `?orientation=`, `?country=` and `?more=`
are accepted by `parseHubSearch`, ignored, and removed from the address on
arrival; `from` (the chosen profession) survives. A filter the reader can
neither see nor remove would hide professions for no visible reason.

**Choosing a profession produces the answer** (`PathFromSection`):

- the profession itself — name, description, level, regulation, its first three
  tasks, "Läs om {yrke}" and (when the job board is open) "Se jobb som {yrke}";
- **every** recorded next profession as a card (`NextProfessionCard`): its name,
  its kind ("Närliggande steg", "Kräver utbildning eller myndighetsbeslut",
  "Långsiktigt mål") and "Under granskning" when the move has no reviewed
  source, its description, one sentence on how it relates to the chosen
  profession, its first formal requirement, and "Läs om {yrke}". The whole card
  opens the profession.
- The connection sentence is **derived**, never authored: level difference
  (`levelDelta`), a separately regulated profession (`kind`), more leadership
  (`leadershipRaised`) — all read from the two guides, so it can be stated for a
  move still under review without claiming anything about the move itself
  (`connection-text.ts`).
- No recorded next profession: one sentence that says so and names the
  profession, then what the guide _does_ record — its related professions,
  labelled "inte dokumenterade karriärsteg" — and "Se alla yrken". The
  information about the chosen profession is never a dead end.
- A saved profession with a catalogue page but no guide (e.g. Polis) shows the
  catalogue's own next professions directly.

**Profession guide reading order**: Om yrket (incl. arbetsuppgifter) → Formella
krav / Så kommer du in → Utbildning och behörighet → Möjliga nästa yrken →
Relevanta jobb → Mer om yrket (fit, competencies, Passport, analysis, related) →
Källor. The hero offers "Se möjliga nästa yrken" and "Se jobb som {yrke}".

**Back keeps the context.** Return links are stored per page (up to 12), so the
named way back is right after any number of hops: "Tillbaka till alla yrken",
"Tillbaka till ditt nuvarande yrke", "Tillbaka till din rekommendation",
"Tillbaka till {yrke}". The earlier stored format is still read.

**Test report**: the "Utforska nu" chip on the recommendation is unchanged (the
owner's approved fix). On the staged cards, "Läs om yrket" now opens the
profession through the same destination rule; "Hur kommer jag dit?" unfolds the
card; all three actions are 44 px.

## What did not change

Matching, ranking, confidence and stage; the report's rationale texts; Supabase
(no migration, no RPC, no policy); permissions; deploy settings; profile sync,
account-keyed personal reads, saved results; the difference between a temporary
choice (`?from=`, never written to the profile) and the saved profession.
`career_filter_used` left the Career Center's event vocabulary with the filters
it measured; the wire name stays in the funnel allowlist and the database
constraint, so no schema change.

## How it was verified

`@lovable.dev/vite-tanstack-config`, `@supabase/supabase-js`,
`@lovable.dev/cloud-auth-js` and the MCP packages are pinned to a package cache
the verification environment cannot reach. The local harness served the app's
unchanged source with the same Vite plugins and local test doubles for those
packages; auth read the same `sb-*-auth-token` key the e2e suites plant.

- `career-center:check`, `career-center-journey:check` (281 assertions),
  `career-center:negative-controls` (16 reintroduced defects, all detected — five
  new: a way on into a filtered catalogue, a search box in the list, an old
  filter narrowing the list, the three-card cap with a hop, a next-profession
  card without a destination), `career-discovery-explore-link:check`.
- Every `bun run …` check in `ci.yml` before the build: same result on this
  branch as on `main`.
- Playwright, `chromium` and `mobile-375`: `e2e/career-center-journey.spec.ts`
  (18/18), `e2e/career-discovery-explore-link.spec.ts` (4/4),
  `e2e/career-center-pilot.spec.ts` (54/54). Four of the pilot tests fail on
  `main` too (it is not in CI): a fixture confidence `"high"` that the v3.1
  contract does not have, an outdated English heading, the 375 px hub at
  7,070 px against a 7,000 px budget, and a 19 px inline sign-in link. The
  fixture and heading are corrected, the sign-in link is now a 44 px target,
  and the budget is 11,000 px because the list of professions is now shown
  (the rejected flat hub was ~11,700 px; the explorer opened, ~12,000 px).
- `e2e/career-center-persistence.spec.ts` needs a real local stack; its
  selectors are unchanged and its own workflow runs it on this pull request.

## Content gaps

- 12 of the 14 recorded onward moves have no reviewed source ("Under
  granskning"); only Väktare → Ordningsvakt and Väktare → Skyddsvakt are
  reviewed.
- Säkerhetschef and AML-specialist have no recorded onward move; the hub shows
  their related professions instead. Säkerhetstekniker has no related
  professions recorded.
- Seven of the eleven guides record no personal formal requirement; their cards
  say "Inga formella krav registrerade".
- Nine professions have no guide yet ("Kommer"). Five of the fourteen
  professions the test can recommend (Personskyddsvakt, Polis, SOC-analytiker,
  Cybersäkerhetsanalytiker, Säkerhetsutredare) open their catalogue page, whose
  content comes from the published catalogue rows.
