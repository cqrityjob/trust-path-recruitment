# Security Career Discovery v3.1 — Layer 4 & Anonymous-First Implementation State

Last updated: 2026-08-15. Written so work can resume from this document without
re-deriving context — see the Execution Mandate's §37 instruction to keep a
concise state doc rather than stop for context length.

## What is live in production today

Unchanged. `approved_for_ranking = false` for every profession, so every real
candidate still sees `professions.available = false` — exactly as before this
session, and correctly so until an owner approves a profession. The one
production behavior change is real and active: **the login wall before the
result is gone.** An anonymous visitor now sees their full Career DNA result
immediately on completion.

## What is built, wired, and tested — dark until approval

- **Layer 4 matching engine** — `src/lib/career-discovery/v31/professions.ts`.
  Distance-based, asymmetric, coverage-gated (mirrors `career-areas.ts`).
  Stage (`explore_now`/`possible_next_step`/`longer_term`) driven by C1
  (`ContextStatus`), never by fit. Sort quality fix mid-session: fit tier
  bucket first, then actual fit magnitude (kept internal), so "strongest
  directions" is genuinely best-fit-first, not alphabetical among ties.
- **First-wave catalogue**: 14 professions × 16 CID bands (224 rows), applied
  to the hosted DB (`20260814171100_...sql`, `20260814180000_...sql`).
  `review_state='ai_researched'`, `approved_for_ranking=false` throughout.
- **Explanation layer** — `profession-explanations.ts`: per-match "why"
  (authored rationale + stage sentence + aligned dimension names), never a
  score or percentage.
- **Live CIG content** — `profession-detail.functions.ts`: requirements
  (classified formally-required / employer-requirement /
  recommended-development / optional-differentiating, from
  `legal_blocker`/`criticality`/`importance` — not invented), education,
  certifications, pathway edges from `cig_career_transitions`. No auth
  required (same public-client pattern as `getV31Availability`); query shapes
  verified directly against the hosted project.
- **Result UI** — `ProfessionRecommendations.tsx` wired into
  `V31ReportView.tsx`: three tiers, expandable detail, "current jobs in this
  direction" linking through `/jobs/profession/$slug` (the real
  `jobs.profession_slug` FK path, not the separate Career Center slug space
  — see Known Gaps).
- **Anonymous, no-login result** — `PublicAssessmentFlow.tsx`: on completion,
  builds the full `ReportSnapshot` client-side via the same pure
  `buildValidatedSnapshot` the server calls, renders it immediately, no
  database write. "Save my Career Journey" is a CTA banner, not a gate;
  claiming replays the buffered answers through the existing authenticated
  `persistPublicV31Run` pipeline — one persistence event, no duplicate
  results, `completedAt` carried through so the preview and the saved report
  agree.
- **Career Card** — `career-card.ts` (data shaping from a real
  `ProfessionMatch`, never a new calculation) + `CareerCard.tsx` (SVG render,
  Story/Square/LinkedIn from one layout table) + `CareerCardCreator.tsx`
  (pick-a-real-recommendation, optional first name, indicator toggle, format
  tabs, preview, Share/Save) + `career-card-export.ts` (canvas rasterisation,
  Web Share API with file, download fallback, QR to `/security-career-
  assessment` only, LinkedIn share link). No percentages, ever — indicators
  are bars driven by the candidate's own [0,1] dimension score.
- **Feedback + funnel analytics + career goals** —
  `20260815090000_cd_v31_feedback_analytics_goals.sql` (applied): three
  additive, RLS-scoped tables. `v31-feedback.functions.ts`:
  `trackV31FunnelEvent` (anon-insert, admin-read, closed event-name enum, no
  PII/fingerprinting), `submitV31Feedback` (the 5 light questions from the
  mandate), `setCareerGoal` (authenticated-owner-only). `FeedbackForm.tsx`
  wired into the result view. Funnel events wired for
  `assessment_started/completed`, `result_viewed`, `save_journey_clicked`,
  `result_claimed`, and the Career Card creator's own events.
- **Golden personas** — `scripts/career-discovery-v31-golden-personas.ts`,
  all 9 required personas, against `scripts/fixtures/first-wave-profession-
  catalog.ts` (generated once from the exact applied-migration values, not a
  hand-typed second copy). 238 checks, all passing. Report:
  `docs/career-discovery/v31-golden-persona-report.md`.

## Regression status

`tsc --noEmit`: clean. `bun run build`: succeeds (confirms the `qrcode`
dependency and all new modules bundle correctly, including SSR). All checks
green: `career-discovery-v31:check` (558), `career-discovery-v31-professions:
check` (38), `career-discovery-report:check` (33), `public-assessment-auth:
check` (124), `career-discovery-v31-golden-personas:check` (238),
`career-discovery:check`. One pre-existing false positive fixed along the way
(a guard-script regex tripped by the word "updated" in an unrelated comment).

## Known gaps — not stop conditions, not yet executed

1. **Career Center reconciliation (§15)**: `src/lib/career-center/professions/`
   uses English-style slugs (`security-manager`, `police-officer`) that
   diverge from `cig_professions.slug` (`sakerhetschef`, `polis`). The NEW
   v3.1 result surface never depends on this static content — it renders
   structured CIG data directly — so this divergence does not affect the
   product just built. Full reconciliation (rename 20 SEO-indexed public
   pages, or build an alias layer) touches live public URLs and is a content/
   SEO decision, not something to improvise; flagged for the owner.
2. **`/journey` full migration (§16)**: left untouched (its own `knowledge-
   graph` profession identity space, separate from CIG — auto-porting risks
   silently mismapping a candidate's chosen target). Added a small,
   non-destructive coexistence note pointing to the new assessment instead.
3. **"Set as my career goal" UI**: the table and server function
   (`cd_career_goals`, `setCareerGoal`) exist and are schema-tested; no button
   wired into the report UI yet. Small remaining task.
4. **Playwright e2e** for the new anonymous/Career-Card flows: not written.
   Existing plain-script regression suite (991 checks total) covers the
   domain logic; the interactive click-through paths are unverified by an
   automated browser test.
5. **Browser E2E of the live anonymous flow**: blocked by a sandbox-only SSR
   networking limitation already documented earlier this session (the
   browser reaches the hosted DB fine; the dev server process's own outbound
   call hangs). Verified instead via: production build success, a
   standalone script exercising the exact buffer→snapshot code path (9/9
   checks), and direct REST/RPC queries confirming the live data.
6. **Full a11y device-matrix and sv/en visual verification**: dictionary
   parity is checked by the existing suite; a real screen-reader pass, mobile
   Safari/Chrome rendering check, and side-by-side sv/en visual review have
   not been done.
7. **Analytics event coverage**: `profession_explored`, `pathway_opened`,
   `jobs_clicked` are defined in the schema but not yet fired from the UI
   (only the events listed above are wired).

## Next session should start here

Priority order if continuing: (1) wire `setCareerGoal` into a "set as my
goal" button, (2) Playwright coverage for anonymous-result → Career Card →
share, (3) a11y/responsive pass across the new screens, (4) owner decision on
Career Center/`/journey` reconciliation, (5) fire the three remaining funnel
events.
