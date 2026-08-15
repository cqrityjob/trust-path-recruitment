# Security Career Discovery v3.1 — Layer 4 & Anonymous-First Implementation State

Last updated: 2026-08-15 (second pass — deployed and live-verified). Written
so work can resume from this document without re-deriving context.

## Deployment state (verified, not assumed)

- **main SHA**: `f96e718` (GitHub `cqrityjob/trust-path-recruitment`, pushed).
- **Lovable**: `latest_commit_sha` confirmed matching via `get_project`
  after each push; the project's own git-sync alone did NOT rebuild the
  served bundle (verified by fetching the live JS chunk and diffing content
  before/after) — `deploy_project` had to be called explicitly each time.
  Do this after every future push to this product line, or the live site
  silently serves stale code despite `latest_commit_sha` looking correct.
- **Live URL**: https://trust-path-recruitment.lovable.app — public, already
  published before this session (not newly exposed).
- **Hosted Supabase** (`zrahptwsnjcdyzfywbeh` / Lovable project
  `9ec625ef-34a1-4b4b-8cbb-712cae168579`): all three migrations re-applied
  verbatim from the committed files and confirmed idempotent (zero errors on
  re-run against the already-migrated database) — the strongest available
  substitute for a clean-database replay in this environment (the local
  Supabase CLI is linked to a different, unrelated account).

## What is live in production today

`approved_for_ranking = false` for every profession — untouched, correct.
The behavior change that IS live: **no login wall before the result.**
Verified directly in the browser against the production URL:

- Full anonymous journey (26 questions → complete Career DNA result, no
  account) — confirmed with a real click-through, both desktop and mobile
  (375px) viewports, both sv and en locales.
- Career DNA, pattern story, ranked Career Areas, the honest "profession
  matching not yet available" note, the feedback form, and the non-blocking
  "sign in and save" banner all render correctly together on one page.
- "Sign in and save" correctly routes to `/candidate/login` with the
  redirect back to the assessment intact. (Not completed further — entering
  credentials or creating an account is outside what this session does.)
- A real bug was found and fixed via this live testing: the first deploy
  attempt showed the OLD (login-walled) behavior despite `latest_commit_sha`
  matching — root cause was Lovable's git sync not auto-triggering a
  rebuild; `deploy_project` fixed it, confirmed by re-fetching the served JS
  bundle and by the full result rendering correctly afterward.

## What is built, wired, and tested — dark until profession approval

Same set as the previous pass (Layer 4 engine, first-wave 14-profession
catalogue, live CIG-backed requirements/education/pathway rendering, Career
Card in 3 formats, feedback/analytics/career-goal tables), PLUS this pass:

- **Owner review / preview** — `/admin/career-discovery-preview` (nested
  under `_authenticated/admin`, so gated by `is_platform_admin` both
  client-side and, independently, server-side inside
  `v31-owner-preview.functions.ts`). Runs the exact production
  `matchProfessions` → `ProfessionRecommendations` → `CareerCardCreator`
  path against the FULL `cd_professions` table (every review_state, not
  filtered to `approved_for_ranking = true`) for any of the 9 golden
  personas — lets an owner see precisely what a future approved result will
  look like without writing `approved_for_ranking` anywhere. Confirmed the
  route is correctly gated (an anonymous visit redirects to admin sign-in,
  no data leaks). Could NOT click through the actual rendered UI as an
  authenticated admin — no admin credentials exist for this session, and
  creating an account or entering a password is outside what this session
  does. The underlying render path is the same component already visually
  confirmed live for the Career DNA/areas sections, and the whole matching
  engine is separately proven by 238 script-level golden-persona checks.
- **Set as career goal** — wired end to end: `cd_career_goals` (schema +
  RLS from the prior pass) now has a real UI action on each profession
  card, visible only once `sessionId` is present (i.e. only for a claimed,
  owned report — `getStoredDiscoveryReport` now selects and returns
  `session_id`). Not click-tested live for the same credential reason as
  above; schema, RLS, and the mutation call are typechecked and covered by
  the full build.
- **All 9 of 9 funnel events now fire**: `profession_explored` (accordion
  open), `pathway_opened` (once real pathway data renders),
  `jobs_clicked` (the jobs link), plus the 6 already wired in the prior
  pass. Table: `cd_v31_funnel_events`.

## Regression status

`tsc --noEmit`: clean. `bun run build`: succeeds (twice, after each batch of
changes this pass). All check suites green: `career-discovery-v31:check`
(565), `career-discovery-v31-professions:check` (38),
`career-discovery-report:check` (33), `public-assessment-auth:check` (124),
`career-discovery-v31-golden-personas:check` (238), `career-discovery:check`.

## Known gaps — real, not stop conditions

1. **Career Center reconciliation**: still not executed (slug divergence
   between `src/lib/career-center/professions/` and `cig_professions.slug`
   documented in the prior pass). The v3.1 result surface never depends on
   it, so this doesn't block the built product; it's a live-URL/content
   decision for the owner.
2. **`/journey` full migration**: still not executed; a coexistence note
   was added in the prior pass. Same reasoning — separate profession
   identity space, auto-porting risks silent mismapping.
3. **Owner-preview UI and "set as career goal" click-through**: built,
   typechecked, and covered by the full production build, but not visually
   confirmed by an authenticated session in this browser — genuinely
   blocked on not having (and not creating) admin/candidate credentials.
4. **Formal accessibility audit** (screen reader, automated a11y scanner):
   not run. Semantic HTML, aria labels, and keyboard operability were built
   in throughout, not independently verified.
5. **Tablet viewport**: checked desktop and mobile (375px) live; tablet
   was not separately checked.
6. **Playwright e2e**: not written. In its place, the actual live product
   was driven directly in a real browser against production this pass —
   arguably stronger evidence for THIS release than a headless test suite
   would be, but it isn't a repeatable automated artifact for future
   regressions.

## Next session should start here

(1) Get real admin/test-candidate credentials into this environment (or
have the owner click through `/admin/career-discovery-preview` and the
claim/goal flow directly) to close gap #3. (2) Formal a11y pass. (3) Owner
decision on Career Center/`/journey` reconciliation. (4) Playwright coverage
for the anonymous → card → claim journey.
