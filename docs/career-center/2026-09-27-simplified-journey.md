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

## A saved report's confidence word

A saved v3.1 snapshot is JSON read back from the database. A ranked profession
whose `confidence` was not `strong`, `moderate` or `indicative` — `"high"`,
`null`, or no value — crashed the Career Center hub and the report view ("This
page didn't load"): every surface indexed `RECOMMENDATION_CONFIDENCE_LABEL`
with it and read `[locale]` off `undefined`. It surfaced through the pilot
spec, whose fixture used `"high"`.

- One check, `isRecommendationConfidence`, accepts exactly the label map's own
  keys. `deriveCareerDirection` reads an unknown value as `null` and keeps the
  entry; the Career Center's personal section, the report's recommendation and
  the Career Card print through `recommendationConfidenceLabel`, so a raw saved
  value cannot crash them either.
- An unknown value prints "Bedömningsstyrka saknas" / "Assessment confidence
  unavailable". The profession, its rank and its rationale are the report's;
  rank 1 stays the recommendation. An unknown value is never read as a real
  word, and the entry is never dropped.
- `strong`, `moderate` and `indicative` print exactly what they printed before.
- Saved reports, matching, ranking and the production of new results are
  unchanged.

Screenshots: `screenshots/simplified-2026-09-27/after-1280-11-*` (the hub, sv
and en) and `after-1280-12-*` (the saved report view).

## A saved report's stage

The same defect, one field over. A saved profession whose `match.stage` was not
`explore_now`, `possible_next_step`, `longer_term` or `career_pivot` also took
the page down ("This page didn't load"):

- the hub, for an unknown word such as `"future"`: `deriveCareerDirection`
  passed any string through and the personal section indexed `STAGE_LABEL` with
  it (`null` or no stage hid the badge instead);
- the report view and its staged tier cards, for `"future"`, `null` or no stage:
  the badges indexed `STAGE_LABEL`, and `explainMatch` indexed `STAGE_SENTENCE`;
- the Career Card builder, the same way (the card is not in the pilot; the admin
  preview still renders it).

What changed:

- One check, `isProfessionStage`, accepts exactly `STAGE_LABEL`'s own keys.
  `deriveCareerDirection` reads an unknown stage as `null` and keeps the role
  and its rank; the personal section, the report's recommendation, the tier
  cards, `explainMatch` and the Career Card print through `professionStageLabel`
  or the neutral sentence, so a raw saved value cannot crash them either.
- An unknown stage prints "Tidsperspektiv saknas" / "Timing unavailable"; an
  opened tier card says "Rapporten anger inte när det här yrket är realistiskt
  utifrån var du är i dag." / "The report does not say when this profession is
  realistic from where you are today." An unknown stage is never read as a
  known one — least of all "Utforska nu", which would present a distant
  profession as something to start today — and the entry is never dropped:
  rank 1 stays the recommendation.
- The four known stages print exactly what they printed before.
- **One visible change on the hub**: a saved recommendation with `null` or no
  stage used to show no stage badge; it now shows "Tidsperspektiv saknas", as
  the report view does for the same entry.
- Saved reports, matching, ranking, how stage is computed and the production of
  new results are unchanged.

Verified by `career-report-stage:check` (402 assertions: `"future"`, a missing
stage and `null` beside the four valid stages, at rank 1 and at every rank;
the check, `deriveCareerDirection`, the hub, the report view, the tier cards and
the Career Card; Swedish and English), nine new negative controls (below), and
the saved-report e2e tests for the hub and the report view, which render the
error page without the guard.

Screenshots: `after-1280-13-*` (the hub, sv and en), `after-1280-14-*` (the
report's recommendation) and `after-1280-15-*` (an opened tier card; it says
"Hämtar mer information…" because the harness answered the profession-details
request for Polis only).

## What did not change

Matching, ranking, how confidence and stage are computed; the report's rationale texts; Supabase
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
  `career-report-confidence:check` (324 assertions: `"high"`, a missing value
  and `null` beside the three valid words, four read paths, Swedish and
  English), `career-report-stage:check` (402 assertions, see _A saved report's
  stage_), `career-center:negative-controls` (32 reintroduced defects, all
  detected — twenty-one new: a way on into a filtered catalogue, a search box in
  the list, an old filter narrowing the list, the three-card cap with a hop, a
  next-profession card without a destination; for the confidence word, the
  guard removed from each of the four read paths, the check loosened to any
  string, an unknown value read as `indicative`, and an entry dropped; for the
  stage, the guard removed from each of its six read paths — the derivation,
  the stage sentence, the hub, the report's badge, the tier cards and the Career
  Card — the check loosened to any string, an unknown stage read as
  `explore_now`, and an entry dropped),
  `career-discovery-explore-link:check`, and `negative-controls:all`.
- Every `bun run …` check in `ci.yml` before the build passes: 154 steps, in a
  clean checkout so that the negative controls can run.
- Playwright, `chromium` and `mobile-375`: `e2e/career-center-journey.spec.ts`
  (26/26), `e2e/career-discovery-explore-link.spec.ts` (12/12),
  `e2e/career-center-pilot.spec.ts` (54/54). The new saved-report tests (hub
  and report view, Swedish and English; unknown confidence words and unknown
  stages) render the error page without the guard. Before this work, four of
  the pilot tests failed on `main` too (it is not in CI): a fixture confidence
  `"high"` that the v3.1 contract does not have, an outdated English heading,
  the 375 px hub at 7,070 px against a 7,000 px budget, and a 19 px inline
  sign-in link. The fixture and heading were corrected, the sign-in link is now
  a 44 px target, and the budget is 11,000 px because the list of professions
  is now shown (the rejected flat hub was ~11,700 px; the explorer opened,
  ~12,000 px).
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
