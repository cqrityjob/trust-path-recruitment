# Career Center journey completion — 2026-09-26

Assessment → one clearly identified recommended profession → correct profession
information → realistic next steps → relevant jobs, in both the public and the
signed-in experience; and a Career Center that works on its own for someone who
already knows their profession.

## Starting point

- Fresh `main` at `84b9a1b` (PR #299 merged). No open pull requests overlapped.
- The historical branch `codex/career-discovery-concrete-profession` / commit
  `a7a16cb` does not exist on the remote and is not in `main`'s history. Nothing
  from it was used, and the 60/25/15 ranking formula was **not** introduced.
  No scoring or assessment-engine code was changed.
- PR #299's fixes are preserved and extended: the report's "Utforska nu" still
  links to the published guide; where there is none it now links to the same
  catalogue page every other surface uses (it previously opened an in-card
  panel of the same catalogue content).

## Root causes

| # | Defect | Root cause |
|---|--------|-----------|
| D1 | 5 of the 14 recommendable professions dead-ended in the Career Center ("Vi har ingen publicerad yrkesguide") | `personal-direction.ts` resolved recommendations only to published guides; the report used a different rule (`exploreDestinationFor` → in-card panel). |
| D2 | "Vilket yrke arbetar du i i dag?" did not open the profession | The selector only rewrote `?from=`. The only link to the profession rendered when `totalDirections > 3`; zero transitions printed "no directions", which reads as "nowhere to go". |
| D2b | Clearing the selection was impossible when signed in | Clearing deleted `from`, and an absent `from` means "use the profile", so the saved profession came straight back. |
| D3 | A saved profession without a guide (e.g. `larmoperator`) showed as a raw slug | `careerOrigin` fell back to the slug as the label. |
| D4 | Cross-account and stale personal data risk | `useMyCareerDirection` keyed reads on a signed-in **boolean**. The root clears the cache on an account change, but clearing a cache does not re-render a mounted observer, which kept showing the removed query. No writer (new assessment, profile edit, Passport onboarding) invalidated the Career Center's reads. |
| D5 | Catalogue links did not always open the catalogue | The router parses a hand-typed `?all=1` as the number `1`, which the validator ignored. "Utforska alla yrken i stället" was a bare `#utforska-yrken` onto a collapsed panel. A direct link was scrolled before the client-side personal sections changed the page height. |
| D6 | `/career-center/vaktare` reached "inte publicerad" although Väktare is published | The guide route only resolved Career Center slugs. |
| D7 | Guides linked to `/jobs` regardless of whether the job board is open | `NextStepPanel` ignored `jobsEnabled()`. |

## What is implemented

**One destination rule** — `professionInfoDestination` in
`src/lib/career-center/profession-links.ts` (built on the existing bridge and
resolver; no second mapping table):
published guide → else the reviewed catalogue page for exactly that CIG
profession (`/career-center/yrke/$cigSlug`, new) → else plain text. Used by the
report chip, the Career Center recommendation, the current-profession section,
catalogue transitions and My Career's assessment tile.

**Catalogue profession page** (`src/routes/career-center.yrke.$cigSlug.tsx`):
the existing `getProfessionDetails` read, extended additively with title,
review date, jurisdiction, disclaimer and sources, and now throwing on a failed
read so "could not load" (retry) is distinct from "not published". Only
`content_status = 'published'` rows are readable (existing RLS). Redirects to the
guide when one exists; `noindex`; section index; honest empty sections.

**Current profession** — saved (profile), temporary (`?from=<slug>`, labelled,
never written to the profile), cleared (`?from=none`) and reset (back to the
saved one) are separate states. "Läs om {yrke}" is always present; "Se möjliga
nästa steg" is its own labelled block with an honest empty state. Unsupported
roles are kept: a catalogue role gets its own page; free text gets the analysis
and the catalogue as next actions.

**Synchronisation** — personal reads keyed on the account id
(`src/lib/career-center/personal-cache.ts`); one shared list of keys that
a new assessment result and a profile-profession write invalidate; wired into
`PublicAssessmentFlow`, `SecurityCareerProfileCard` and Passport onboarding.
The existing root-level cache clear on sign-out/account switch is unchanged.
Loading, no result, unreadable/failed and area-only (older) results keep their
own states; no area-only report is turned into a profession.

**Primary recommendation** — the result contract has no explicit "primary"
field; the stored rank 1 is labelled "Högst rankat i din analys" and shown
prominently with the report's own frozen rationale, confidence and stage.
Ranks 2–3 are visibly secondary. Nothing is recomputed.

**Layout** — hub: hero with doors ("Jag vet vilket yrke jag har", "Hjälp mig
välja yrke" / "Ditt rekommenderade yrke"); the reader's own result first when
it exists; current profession; catalogue before the career routes; the
analysis offer after the catalogue when there is no result. Guides and
catalogue pages: a named way back to where the reader came from (filters
included), a sticky section index, and the next step as the primary action.
`#karriarsteg` and `#utbildning` are unchanged.

## Coverage table

Every profession that can currently be recommended (the 14 approved rows of the
Career Discovery catalogue, SP001–SP014; SP015–SP018 are drafted and not
approved for ranking). Catalogue counts are from a full local replay of the
migration history; review dates of catalogue rows reflect that replay.

| Identifier (CIG) | Recommendation source | Information destination | Content available | Job destination |
|---|---|---|---|---|
| vaktare | CD v3.1 `professions.ranked` | `/career-center/security-officer` (guide) | guide, reviewed 2026-07-16, 2 sources, 4 onward steps | `/jobs/profession/vaktare` |
| ordningsvakt | ″ | `/career-center/ordningsvakt` (guide) | guide, 2026-09-08, 3 sources, 1 step | `/jobs/profession/ordningsvakt` |
| skyddsvakt | ″ | `/career-center/skyddsvakt` (guide) | guide, 2026-09-08, 2 sources, 2 steps | `/jobs/profession/skyddsvakt` |
| personskyddsvakt | ″ | `/career-center/yrke/personskyddsvakt` (catalogue) | summary, 1 formal requirement (sourced), 0 education, 0 steps | `/jobs/profession/personskyddsvakt` |
| polis | ″ | `/career-center/yrke/polis` (catalogue) | summary, disclaimer, 1 requirement, 1 education, 2 steps, 2 sources | `/jobs/profession/polis` |
| sakerhetssamordnare | ″ | `/career-center/security-coordinator` (guide) | guide, 2026-09-08, 2 sources, 1 step | `/jobs/profession/sakerhetssamordnare` |
| sakerhetschef | ″ | `/career-center/security-manager` (guide) | guide, 2026-07-16, 1 source, **0 onward steps** (honest empty state) | `/jobs/profession/sakerhetschef` |
| soc-analytiker | ″ | `/career-center/yrke/soc-analytiker` (catalogue) | summary only; 0 requirements, 0 education, 2 steps | `/jobs/profession/soc-analytiker` |
| cybersakerhetsanalytiker | ″ | `/career-center/yrke/cybersakerhetsanalytiker` (catalogue) | summary, 1 education, 2 certifications, 1 step | `/jobs/profession/cybersakerhetsanalytiker` |
| sakerhetsutredare | ″ | `/career-center/yrke/sakerhetsutredare` (catalogue) | summary only; 0 requirements, 0 education, 1 step | `/jobs/profession/sakerhetsutredare` |
| risk-manager | ″ | `/career-center/risk-manager` (guide) | guide, 2026-07-16, 1 source, 1 step | `/jobs/profession/risk-manager` |
| krisberedskapssamordnare | ″ | `/career-center/crisis-continuity-manager` (guide) | guide, 2026-07-16, 2 sources, 1 step | `/jobs/profession/krisberedskapssamordnare` |
| aml-specialist | ″ | `/career-center/aml-specialist` (guide) | guide, 2026-07-16, 2 sources, **0 onward steps** | `/jobs/profession/aml-specialist` |
| sakerhetstekniker | ″ | `/career-center/security-technician` (guide) | guide, 2026-07-16, 1 source, 2 steps | `/jobs/profession/sakerhetstekniker` |

Jobs links render only while `VITE_JOBS_ENABLED=true`; otherwise the page says
the job board is not open. The local replay contains no job rows, so the
zero-jobs state is what a local run shows.

### Remaining content gaps (visible, not filled)

- No published guide for Personskyddsvakt, Polis, SOC-analytiker,
  Cybersäkerhetsanalytiker, Säkerhetsutredare. Their catalogue pages say so.
  Writing guides needs sourced, reviewed content and was not invented here.
- SOC-analytiker and Säkerhetsutredare have only a one-sentence catalogue
  summary: no requirements, education or sources are registered. The page says
  "inga formella krav är registrerade" and explicitly that this does not mean
  employers have none.
- No catalogue row has an `overview`; "Om yrket" says there is no longer
  description rather than repeating the summary.
- Säkerhetschef and AML-specialist record no onward transitions.
- Career Discovery maps SP004 to `personskyddsvakt`; the reviewed bridge maps the
  Close Protection guide to `livvakt`. They are **not** merged here (that would
  be a neighbouring-profession match); the disagreement stays documented in
  `slug-map.ts` for consolidation.

## Verification

| Check | Result |
|---|---|
| `career-center-journey:check` (new, 229 assertions, real components rendered sv/en) | pass |
| — five re-introduced defects (clear→profile, `?all=1`, no-guide dead end, account-less key, no "Läs om") | each makes the check fail |
| `career-center-persistence:local` (new; real Postgres 16 + PostgREST 12.2.3 + real RLS, synthetic accounts) | 16/16 pass |
| `career-center:check` (order guard updated to the new, deliberate order) | pass |
| `career-discovery-explore-link:check` (updated to the one destination rule) | pass |
| `career-profession-bridge:check`, `career-journey:check`, `my-career-premium-overview:check`, `candidate-destination-composition:check` | pass |
| `tsc --noEmit` | 300 errors, **identical set to untouched main**; all from packages that could not be installed |
| ESLint on changed files | no new findings (dictionary file's pre-existing Prettier findings unchanged in count) |
| Browser specs (`e2e/career-center-journey.spec.ts` new; pilot and explore-link specs updated) | **not run** — see blockers |

## Blockers in this environment

- The environment's network policy blocks the npm cache host that `bun.lock`
  pins ~96 packages to (including `@supabase/supabase-js` and
  `@lovable.dev/vite-tanstack-config`). The app could therefore not be built or
  served here, so `bun run build`, the Playwright specs and screenshots of the
  hydrated app could not run. Guards that import the Supabase client
  transitively were run with a test-only module stub that throws if used.
- Screenshots in `screenshots/journey-2026-09-26/` are server renders of the
  real routes (memory router) and real components with the real compiled
  Tailwind stylesheet; signed-in states use fixture data. They are not
  screenshots of the hydrated app.

## How to test (Mostafa)

1. Public: open `/career-center?all=true#utforska-yrken` — the catalogue is open
   and in view. Filter to "Ingångsnivå", open a profession, use
   "Tillbaka till yrkeskatalogen" — the filter is still set. Browser Back does
   the same.
2. Public: in "Vilket yrke arbetar du i i dag?" choose Ordningsvakt — the card
   names it; "Läs om Ordningsvakt" opens that guide; "Se möjliga nästa steg"
   jumps to the steps. Choose Säkerhetschef — the steps say none are documented
   yet, with a way on.
3. Open `/career-center/vaktare` — you land on the Väktare guide.
4. Signed in with Väktare saved in the profile and a completed analysis: the
   recommended profession is first, with "Därför:" from your report and
   "Läs om …"; alternatives below; "Vägar från ditt nuvarande yrke" still shows
   Väktare. Choose Skyddsvakt → "Tillfälligt val"; "Rensa val" → nothing
   selected (profile untouched); "Återgå till mitt sparade yrke" → Väktare.
5. Recommendation Polis (or any profession without a guide): "Läs om Polis"
   opens `/career-center/yrke/polis` with requirements, education, next steps,
   jobs and sources, and a way back.
6. Change the profession in Min profil, return to the Career Center — the new
   profession is the default. Complete a new analysis — Min karriär and the
   Career Center both show the new result.
7. Sign out — personal sections disappear. Sign in as another account in the
   same tab — none of the first account's content appears.
8. Repeat in English and at phone width.

## Rollback

Revert the merge commit (or the branch's commits). There is no migration and
no stored data change; the new route and keys disappear with the code. Stored
reports and profiles are read exactly as before.
