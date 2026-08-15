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

## 2026-08-15, third pass — Master Completion Mandate

### SP-ID reconciliation — resolved, no migration

The owner's §20 concern (that the historical LOCKED profession catalogue
reused SP002/SP010/SP011/SP012 for professions different from this project's
first-wave rows) was investigated against the **full** git history (all
commits, not just the current tree) by a dedicated background agent. Finding:
`cd_professions` was empty before this project's own migration
(`20260814180000_cd_layer4_first_wave_professions.sql`); the `-- SP001..SP037`
comment in the original schema migration was only ever a format-placeholder
regex description, never a populated, conflicting catalogue. The referenced
`CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx` workbook is real and
referenced in code comments, but only for Career Areas (SCA) and Dimensions
(CID) — never for professions — and the file itself was never checked into
this repository.

**Owner decision (accepted 2026-08-15): no persisted SP-ID collision exists.
No reconciliation migration will be built.** The old LOCKED workbook's SP
identifiers, if they exist at all outside this repo, are treated as
workbook/research identifiers only. For the production platform, **the CIG
profession slug (`cig_professions.slug`, carried on every `cd_professions`
row as `cig_profession_slug`) remains the single canonical cross-product
profession identity** — `cd_professions.profession_id` (`SP00N`) is a
first-wave-catalogue-local key, never assumed stable or meaningful outside
this table. If new evidence of a real, persisted collision surfaces, revisit
then; do not pre-build a migration for a defect that does not reproduce.

### Central-dominant fit hardened + CAREER PIVOT shipped

See commit `f361231`. Summary: added `CENTRAL_DIMENSION_MAX_MISS` (a hard
per-dimension floor alongside the existing weighted-average central-fit
gate — a candidate who badly misses one central dimension can no longer have
that miss diluted away by comfortably meeting the others); added the fourth
`career_pivot` stage classification (real affinity, different direction from
the candidate's own baseline+area, not a natural next step); softened two
overclaiming profession descriptions (SP006, SP010). Golden-persona matches
per persona dropped from 10-14 to 6-9; Technical/Investigation personas no
longer match any frontline guard profession via badly-missed central
dimensions.

### Residual finding → profession calibration root cause identified

After the hardening above, one nuance remained: for the Investigation
persona, Skyddsvakt (SP003) still narrowly outranked SOC-analytiker (SP008)
in raw central fit. Root cause, confirmed by reviewing all 14 professions'
authored `central` dimension sets side by side: **CID11 (Structure &
Documentation) is central in 7 of 14 professions** — too generic a trait to
discriminate between a protective guard and an analyst, since both
professions plausibly score decently on "structure and documentation." More
specifically, **SP003 Skyddsvakt and SP004 Personskyddsvakt had no CID01
(Operational Orientation) signal in their central set at all**, despite both
being fundamentally hands-on, field-presence roles — the one dimension that
should most obviously separate a protective guard from a desk-based analyst
was simply missing from the calibration. This is a profession-content
authoring gap, not a scoring-formula defect; see the calibration section
below for the fix.

### Calibration fix applied — all 14 professions reviewed

**Changed** (band data regenerated via the scratchpad codegen script into
`scripts/fixtures/first-wave-profession-catalog.ts`; hand-authored fixtures
in `scripts/career-discovery-v31-professions-check.ts` updated in lockstep;
a new additive migration applies the same UPDATE to hosted Supabase):

- **SP003 Skyddsvakt**: added CID01 (Operational Orientation, band 0.55-0.9,
  weight 0.7) as central; demoted CID11 (Structure & Documentation) from
  central to supporting. Rationale: protective guarding is field-presence
  work: an operational-orientation floor is the one signal that should most
  obviously separate it from a desk-based analytical profile, and it had
  none. CID11 was central in 7 of 14 professions — too generic to
  discriminate this profession specifically.
- **SP004 Personskyddsvakt**: added CID01 (band 0.6-0.9, weight 0.6) as a
  fifth central dimension (pure addition, no demotion — its existing four
  central dims: conflict handling, decisiveness, composure, risk, were
  already close-protection-specific, none of them generic). Close protection
  is, if anything, more operationally intensive than static guarding.

**Reviewed, left unchanged** (all central sets already genuinely
distinguish the profession from its neighbors — no evidence of overmatching
in the golden-persona regression, no unjustified generic dimension leading
the set):

- **SP001 Väktare**: CID01 already dominant (weight 0.9) — this is
  intentionally the broadest, most generalist frontline profession in the
  catalogue, so a slightly wider central set (risk + structure + composure
  alongside operational) is appropriate, not a defect.
- **SP002 Ordningsvakt**: CID09 (Conflict Management, weight 0.95) dominant
  plus CID01 already central — correctly distinct from Väktare (which lacks
  CID09 as central) via its conflict-handling signature.
- **SP005 Polis**: deliberately broad central set (service, conflict,
  decisiveness, composure) reflecting policing's genuine breadth; no CID01.
  Already correctly excluded from Technical/Investigation personas via its
  existing central dims — no observed overmatching, left as-is.
- **SP006 Säkerhetssamordnare / SP007 Säkerhetschef**: leadership +
  communication + collaboration (Coordinator) vs. leadership + strategic +
  communication (Head of Security) — already distinct signatures between
  the two seniority tiers in the same family.
- **SP008 SOC-analytiker / SP009 Cybersäkerhetsanalytiker / SP010
  Säkerhetsutredare / SP013 AML-specialist**: each already led by its own
  distinguishing central dimension (technical+investigative for SOC,
  technical+learning for Cyber, investigative-dominant for Investigator,
  analytical+investigative for AML) with no operational dimension needed —
  correctly excluded from operational personas already.
- **SP011 Riskchef / SP012 Krisberedskapssamordnare**: risk+strategic+
  analytical vs. risk+strategic+collaboration — distinct enough, both
  senior/developing risk-family roles with different central emphasis.
- **SP014 Säkerhetstekniker**: CID04 (Technical) dominant with CID01 already
  present as a minor central signal (weight 0.4) — correctly reflects that
  installation/maintenance work is technical-first but still hands-on.

**Verified**: golden-persona regression re-run after the SP003/SP004 change
— Technical and Investigation personas now show **zero** frontline guard
professions anywhere in their results (previously Skyddsvakt led or
co-led both). Säkerhetsutredare (the actual investigator) now surfaces
correctly under "Also worth exploring" for the Investigation persona
(developing-tier, correctly stage-gated below "explore now" for a
working_in_security/entry baseline — not omitted, just honestly staged).
Väktare/Ordningsvakt/Skyddsvakt/Polis still correctly lead the Väktare
persona's own results, unaffected. 138 golden-persona checks green (down
from 144 — fewer, more honest matches per persona is the expected effect,
not a regression), 42 professions-check checks green, `tsc` clean.
