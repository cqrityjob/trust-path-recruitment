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

### Current career context (Mandate item 2) + Career Pivot refinement (item 5)

Built the minimal, optional, post-assessment step: `src/lib/career-discovery/
career-context.ts` (types + its own sessionStorage key, deliberately
separate from `v31-public-buffer.ts` — never merged into the 26-question
buffer, never read by `v31/scoring.ts`), `career-context.functions.ts`
(`listCigProfessionsForPicker`, public/anon-readable, same pattern as
`getProfessionDetails`), and `CareerContextStep.tsx` (searchable profession
picker + experience-band chips + "not listed" / "prefer not to say").
Shown as a new `"career-context"` phase in `PublicAssessmentFlow.tsx`,
inserted between the 26th question and the report, ONLY when
`shouldCollectCareerContext(contextStatus)` is true (i.e. C1 means the
candidate already works in security in some capacity — never shown to
`exploring_security`). Three new nullable `cd_sessions` columns
(`current_profession_slug`, `current_profession_status`,
`current_experience_band`) via
`20260815140000_cd_career_context_fields.sql`, applied to hosted Supabase.
`persistPublicV31Run` writes them; the anonymous client-side snapshot and
the server-persisted one both read the same `CareerContext` shape.

This is immediately consumed by `matchProfessions`'s new optional
`currentProfessionCigSlug` parameter (`professions.ts`): when the candidate's
self-reported current profession matches a profession in the catalogue,
`classifyStagesWithPivots` grounds the career-pivot "primary direction" in
that VERIFIED fact instead of guessing it from the candidate's best-fitting
distance>=0 match. Regression-proven (professions-check.ts group 6c): same
HIGH_FLIER dims, same developing-baseline context — without a reported
current profession, Skyddsvakt reads as `career_pivot` from the DNA-inferred
guess; with current profession self-reported as Skyddsvakt itself, Skyddsvakt
correctly becomes `explore_now` (it's where the candidate actually is, not a
pivot away from it), while Polis (a genuinely different area) still reads as
`career_pivot`. 46 professions-check checks green, 138 golden-persona checks
green (unaffected — none of the golden personas pass a current-profession
slug), `tsc` clean.

**Known limitation, disclosed rather than worked around**: this session's
`.env.local` deliberately points the local dev server only at a local
Supabase stack ("the live project reference is deliberately absent" — its
own header comment), and the local stack needs Docker, which is not running
in this environment (`supabase status` fails: `dial unix
/var/run/docker.sock: ... no such file or directory`). Live browser
verification of the new career-context step's actual rendered UI was
therefore not possible this pass — verification is code-level only (`tsc`,
the regression suites above, and manual trace of the phase-routing logic
against the already-shipped, browser-verified 26-question flow's identical
pattern). Did not override the `.env.local` boundary to point at the live
project for this. Flagging for next session: either get Docker running here,
or have the owner click through `/security-career-assessment` as a
"working_in_security" persona and confirm the new step renders and behaves
as designed.

Not yet done from item 5's fuller ask: using CIG transition-graph edges
(`cig_career_transitions`) and the experience-band value itself to further
refine pivot/stage classification. The current-profession-area grounding
above is the single highest-value, best-evidenced piece (directly fixes the
mandate's own worked examples); layering in transition-graph edges as a
further refinement is a reasonable next increment, deliberately not done
now to avoid the mandate's own "reduced not increased complexity" /
over-engineering warning without a concrete worked example that needs it.

### Profession Affinity vs Recommendation Priority — explicit separation (item 3/§14)

The two concepts were already computed separately internally (central-
dominant fit = Affinity; stage/pivot classification = Priority) but never
named or exposed as such. Made this explicit and inspectable:

- `professions.ts` gains `matchProfessionsDiagnostics` — a SEPARATE exported
  function from the production `matchProfessions` (which is completely
  unchanged), returning the same `ProfessionMatchResult` plus a parallel
  `ProfessionAffinityDiagnostic[]` array: `fitScore` /`centralFitScore` /
  `supportingFitScore` / `centralCoverage` (Profession Affinity — Career DNA
  only) alongside `stageBeforePivotCheck` / `finalStage` /
  `priorityChangedByPivot` (Recommendation Priority — context-aware). This
  keeps the "no percentages, ever" rule airtight on the candidate-facing
  path by construction (that function never sees these numbers), while
  giving the ADMIN tool real diagnostics — internal numeric diagnostics are
  explicitly acceptable there per the mandate.
- `/admin/career-discovery-preview` now shows: a current-career-context
  selector (self-report profession, feeds `runOwnerPreviewMatch`'s new
  `currentProfessionCigSlug` input so an owner can compare the SAME Career
  DNA with vs. without a reported current role), a "context signals" panel
  (C1 + which source grounded the pivot primary direction), and a full
  Profession Affinity / Recommendation Priority table — one row per
  profession, both concepts side by side, never combined into one score.

`tsc` clean, `bun run build` succeeds, 46 professions-check + 138
golden-persona checks green (unaffected — `matchProfessions` itself did not
change).

### Using the six context signals (item 6)

The four Discovery Path answers already produced structured "report tags"
(`../adaptive-items.ts`, `reportTagsFor` in `personal-layer.ts`) and were
already persisted to `cd_evidence.answer_tags` on save — but nothing
downstream ever read them. Wired them in, conservatively:

- `professions.ts` gains a curated, deterministic
  `CORROBORATING_TAGS_BY_AREA` map (career area -> report tags that
  corroborate genuine interest in it, e.g. SCA06/Investigation ->
  `investigative_interest`, `trusted_analyst`, `advanced_analysis`; SCA04/
  Leadership & Coordination -> `leadership_path`, `trusted_coordinator`,
  `people_leadership`; first-pass curated set per area, not exhaustive over
  the ~80-tag vocabulary, extensible without touching scoring). `ProfessionMatch`
  gains `contextCorroborated: boolean`, set purely from this lookup — no
  effect whatsoever on fitScore, coverage, fitTier or stage.
- `explainMatch` (`profession-explanations.ts`) turns `contextCorroborated`
  into ONE additional, deliberately generic explanatory sentence ("What you
  said you're hoping to work toward also points toward this kind of
  direction") when true — rendered in `ProfessionRecommendations.tsx`
  directly under the stage sentence.
- `discoveryTags` threaded end to end: `matchProfessions` /
  `matchProfessionsDiagnostics` (new optional parameter) ->
  `BuildSnapshotInput.discoveryTags` -> computed from the candidate's real
  4 adaptive answers in both `persistPublicV31Run` (server, from the
  already-parsed `personal` map) and `PublicAssessmentFlow.tsx`'s client
  snapshot (from the buffer, via the same `reportTagsFor`) — one code path,
  same tags either way. `/admin/career-discovery-preview`'s
  `runOwnerPreviewMatch` accepts the same optional field for calibration
  testing.

Deliberately the most conservative reading of "use in Recommendation
Priority": explanation enrichment only, never reordering or reclassifying a
recommendation. Chosen over letting tags shift stage/priority directly
because the mandate repeatedly emphasizes Career DNA as the dominant,
non-negotiable evidence and explicitly warns against Career Context
fabricating or diluting affinity — a tag nudging rank order would risk
exactly that, for a feature whose highest-confidence, lowest-risk value is
telling the candidate "here's other evidence pointing the same way," which
this now does. Regression-proven (professions-check.ts group 8b):
`leadership_path` corroborates Säkerhetssamordnare (SCA04) but not
Skyddsvakt (SCA01) for the identical dims, and fitTier/stage are provably
unchanged by tag presence. 50 professions-check checks green, 138
golden-persona checks green (unaffected — no golden persona passes discovery
tags), `tsc` clean, `bun run build` succeeds.

### The real Swedish-locale defect, found and fixed (item 11)

The earlier pass's fix (hardcoded `locale="en"` in the admin owner-preview
route) was real but almost certainly NOT what the owner saw — profession
content isn't live for real candidates (`approved_for_ranking=false`
everywhere), so a real Swedish candidate could only have hit that route by
coincidence. Live browser verification against the deployed product wasn't
possible this pass either (see the "known limitation" note above — same
Docker/`.env.local` constraint), so instead did a full source-level audit of
every locale-sensitive call site in the report-rendering path, and found the
real defect:

**`V31ReportView.tsx`** — the component whose own header explicitly states
"Only the surrounding chrome ... is translated live, because that is app
furniture and not report content" — was itself violating that rule. Three
call sites passed the LIVE site-wide language toggle (`lang` from
`useT()`) into `ProfessionRecommendations`, `FeedbackForm` and
`CareerCardCreator` as their `locale` prop, instead of the frozen
snapshot's own `snapshot.locale`. Concretely: a candidate who takes the
assessment in Swedish gets a snapshot with `locale: "sv"` — its DNA
narrative, pattern story and area names (pre-resolved into Swedish at
snapshot-build time) always render correctly regardless of the toggle — but
if their site-wide toggle is (or later becomes) English, the profession
recommendations, feedback form and Career Card would render in English
anyway, because they read the toggle, not the snapshot. That is an exact
match for "parts of final recommendation/report appeared in English."

Fixed: all three call sites now pass `snapshot.locale`; the date-format
locale (`Intl.DateTimeFormat`) was the same bug in miniature and got the
same fix; the now-unused `lang` was removed from the component's `useT()`
destructure (with a comment explaining why, so it cannot silently come back).

That fix alone was incomplete on its own, though: `ProfessionRecommendations`,
`FeedbackForm` and `CareerCardCreator` each ALSO called `useT()` internally
for their own UI microcopy (button labels, section headings inside the
Career Card panel, etc.) — meaning even with the correct `locale` PROP now
flowing in for content, their own chrome text would still silently follow
the live toggle. Added `translateFor(locale)` to `src/i18n/context.tsx` — a
translator bound to an explicit locale rather than the live context,
same fallback chain as `t()` itself — and switched all three components
(plus their nested `ProfessionDetailBody`/`ProfessionCard`) from
`useT()`'s `t` to `translateFor(locale)`. Verified this is correctly
SCOPED, not over-applied: `PublicAssessmentFlow.tsx` (the live
question-answering flow, including the new `CareerContextStep`) still
legitimately uses the live toggle — that content is not frozen yet, and
`buffer.locale` is captured FROM the live toggle at the moment the run
starts, so they agree by construction there.

`tsc` clean, `bun run build` succeeds, 50 professions-check + 138
golden-persona checks green (unaffected — none of this touches scoring or
matching). Live browser re-verification against a fresh Swedish anonymous
run remains blocked by the same Docker/`.env.local` constraint as the
career-context step; this fix is code-level verified (full grep audit of
every `useT()`/`lang` call site under `src/components/career-discovery/v31/`
and `src/lib/career-discovery`, confirming no remaining locale/toggle
mismatch in the frozen-report path) rather than pixel-verified. Flagging
for next session's live check, same as the career-context step.

### Report UX reordered toward the §26 hierarchy (item 7)

`V31ReportView.tsx`'s section order previously led with the full DNA
narrative (pattern name + all seven "how you work" Q&A answers + supporting
patterns + ranked career areas — three full sections of prose) BEFORE the
professions section — directly the "do not begin with long profile prose"
problem §26 calls out, and it buried the actual career intelligence at the
bottom. Reordered:

1. **Short DNA hero** — profile name + the one-line "balanced profile" note
   only. The full narrative moved out entirely.
2. **Your career directions** — the professions section, immediately after
   the hero (previously last).
3. **Create your Career Card** — new standalone CTA (not previously
   present as a top-level section; the per-card "create for this direction"
   button inside each profession card still exists unchanged) offering the
   candidate's single strongest match, placed right after they've seen it —
   "feels like a reward," not a buried modal trigger.
7. **Your working style** — the full narrative (all seven Q&A answers,
   supporting patterns, ranked career areas) that used to open the report,
   now under its own heading, later.
9. **Save your career journey** — the authenticated "My career" / "All
   reports" links, now positioned after value has been delivered rather
   than immediately after methodology.
10. **Feedback, then methodology** — order swapped (feedback used to come
    after the version table; now first) and the version/definition table
    wrapped in a native `<details>` disclosure (§27 progressive disclosure)
    instead of always-visible.

**Explicitly not done this pass** (disclosed, not silently dropped):
Section 4 "Your possible path" (a visual YOU ARE HERE → NEXT → DEVELOP →
FUTURE pathway driven by the CIG graph) is a genuinely new, bespoke visual
component — the underlying data already exists (`ProfessionDetailBody`'s
pathway edges, from/to `cig_career_transitions`) and is shown per-profession
inside each accordion, but not yet promoted to its own dedicated top-level
section with the "you are here" framing. Section 5 "What could help you
move forward" is similarly present today only nested inside each
profession's detail accordion (already correctly split into formal
requirements / employer requirements / education / recommended development
via `RequirementLevel`), not restructured into its own top-level page
section. Both are real, scoped follow-up work, not abandoned — attempting a
new bespoke pathway visualization in the time remaining this pass risked
shipping something half-built rather than something correct.

Live browser verification blocked by the same Docker constraint as the two
notes above — this redesign is `tsc`-clean, regression-green (50 + 138
checks) and build-green, but not yet pixel-verified in a browser this pass.

### Career Card data-integrity audit (items 8-10) — no violations found

Read `career-card.ts`, `CareerCard.tsx`, `CareerCardCreator.tsx` and
`career-card-export.ts` end to end against the mandate's explicit
prohibited-fields list. Result: already compliant, no changes needed.

- **Source**: `buildCareerCardData` takes a `ProfessionMatch` that must
  already exist in the frozen snapshot's `professions.matches` — never a
  new calculation, never an arbitrary profession. The picker in
  `CareerCardCreator` only ever offers `matches` from the snapshot.
- **No raw answers, email, account id, employer, private report
  identifiers**: none of these fields exist anywhere in `CareerCardData` or
  the SVG renderer. `firstName` is explicit-opt-in only (never defaulted
  from an account name), truncated to 40 chars, no surname field exists at
  all.
- **No fit/qualification percentage, no overall rating**: `fitTier` is
  carried in the data shape but the SVG renderer (`CareerCard.tsx`) never
  actually prints it — only the qualitative `stageLabel` ("POSSIBLE NEXT
  STEP" etc.) is rendered. Dimension indicators are bar widths from `[0,1]`
  normalized scores, never printed as numbers or percentages.
- **Sharing**: `generateDiscoverQrDataUrl` points the QR at
  `${origin}/security-career-assessment` (the public assessment) always —
  never a private report URL. `shareCardImage` uses the real Web Share API
  and returns `"unsupported"` for a caller to handle gracefully rather than
  silently failing or falsely claiming a direct-publish capability.
  `onEvent` payloads for `share_initiated`/`image_saved` carry only
  `{format, reason}` — no PII.
- **Formats**: `CARD_DIMENSIONS` = Story 1080×1920 (9:16), Square
  1080×1080 (1:1), LinkedIn 1200×627 (standard landscape link-preview
  ratio) — matches the spec exactly.

No code change was needed here; this section exists to record that the
audit happened and found the architecture already correct, per the
mandate's own instruction to verify rather than assume.
