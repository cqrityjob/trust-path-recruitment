# Phase 2 — Saved Career Intelligence Report (completion report)

## Root cause of the pre-existing failures

### Final end-to-end root cause (2026-07-18)

The signed-in browser flow was reproduced through all 16 questions. The
`saveMyCareerReport` server function was called successfully, authentication
was attached correctly, and the server reached `save_career_report`. The RPC
then rolled the transaction back with:

`column reference "run_id" is ambiguous`

The ambiguity was inside the PL/pgSQL function: its `RETURNS TABLE(run_id
uuid, ...)` output variable shared a name with `assessment_run_reports.run_id`,
and the unqualified `RETURNING run_id` could resolve to either. The function
now uses `RETURNING assessment_run_reports.run_id`; the assessment-run insert
and cleanup delete are qualified as well. No table, RLS, grant, or trust-boundary
change was required.

The client saver now also invalidates the My Career run/report query keys after
a successful save. This prevents the dashboard's 30-second stale cache from
hiding a newly completed report when the user had already visited My Career.
Transient save failures receive two retries; a final failure releases the
component's in-memory guard so a remount can try again. Database idempotency
remains authoritative.

1. **"Missing SUPABASE_SERVICE_ROLE_KEY"** — surfaced only when running the app
   locally with a `.env` that lacks the service-role key. The Lovable-hosted
   preview and production environments *do* have `SUPABASE_SERVICE_ROLE_KEY`
   injected (confirmed via the project's secret manifest). No code change is
   required for the hosted environment; the local error is expected until a
   developer adds the key to their own `.env`. The service-role key is loaded
   lazily inside the handler via `await import("@/integrations/supabase/client.server")`,
   never at module scope, so it is never bundled into the client.

2. **"Invalid server function ID"** — caused by `report.functions.ts` declaring
   sibling helpers (`ASSESSMENT_ID`, `buildCompareEnrichment`) alongside the
   `createServerFn` handlers. TanStack Start's `?tss-serverfn-split` transform
   hoists handler bodies into separate chunks; module-scope helpers referenced
   from inside a handler can become `undefined` after the split, which the
   runtime reports as "Invalid server function ID" / `ReferenceError`. The
   canonical fix (see the project's `tanstack-serverfn-splitting` guidance) is
   to keep a `.functions.ts` file to `createServerFn` declarations + imports
   only, and move helpers to a companion `.server.ts` module.

## Files changed on this branch (on top of PR #2)

- `src/lib/career-intelligence-engine/report.server.ts` — **new**. Houses
  `ASSESSMENT_ID` and `buildCompareEnrichment`.
- `src/lib/career-intelligence-engine/report.functions.ts` — helpers removed;
  now imports them from `./report.server`.
- All other PR #2 files brought into the Lovable workspace unchanged:
  `report-types.ts`, `compute.functions.ts` (only added `export` on
  `loadEnrichmentForSlugs`), `_authenticated.my-career.tsx` (layout with
  `<Outlet />`), `_authenticated.my-career.index.tsx`,
  `_authenticated.my-career.reports.$runId.tsx`, `security-career-assessment.tsx`
  (adds `completionId` idempotency key), `CareerProfileForJobsSaver.tsx` (calls
  `saveMyCareerReport`), `engine-view.tsx` (`mode="saved"` + compareEnrichment),
  `SiteHeader.tsx`, `SiteFooter.tsx`, `i18n/dictionaries.ts`, `styles.css`
  (print styles).

## Database / permission changes

One function-only corrective migration was applied on top of
`20260718170443_assessment_run_reports.sql`. It qualifies the ambiguous
`run_id` references in `public.save_career_report`; it does not change schema,
permissions, or policies:

- `public.assessment_run_reports` — RLS on; `authenticated` gets `SELECT` only
  (owner-scoped policy `auth.uid() = user_id`); no INSERT/UPDATE/DELETE grant
  to `authenticated` exists, so authenticated code cannot write directly.
- `public.save_career_report` — `SECURITY DEFINER`; `EXECUTE` granted to
  `service_role` only, revoked from PUBLIC / anon / authenticated. The only
  code path that can reach it is `saveMyCareerReport` (server-only,
  `requireSupabaseAuth`, computes the payload with the trusted, unmodified
  scoring engine, then calls the RPC through the service-role client loaded
  lazily inside the handler).

Existing RLS was inspected before touching anything: `assessment_runs` has 4
policies (owner-scoped), `assessment_run_reports` has the single owner-scoped
SELECT policy above. No policy widening is required — writes flow through the
`SECURITY DEFINER` RPC, which is the safe, standard pattern.

## Security review

- Service-role key is never exposed to the client bundle: `client.server.ts`
  is loaded via `await import(...)` inside `saveMyCareerReport.handler`, which
  runs only on the server.
- The RPC verifies `p_user_id` exists in `auth.users` and cannot be spoofed
  because it is sourced from `context.userId` (populated by
  `requireSupabaseAuth` after validating the caller's bearer token), never
  from raw client input.
- Report content is recomputed server-side from the caller's answers using the
  unmodified scoring engine — a malicious client cannot inject arbitrary
  report JSON.
- Idempotency: `(user_id, completion_id)` unique index + `ON CONFLICT DO
  NOTHING` in the RPC; a lost insert race deletes the orphan `assessment_runs`
  row and returns the winning `run_id`. Duplicate retries return the existing
  row with `created_new = false`.
- Reads go through the caller's own RLS-scoped client (`context.supabase`),
  never the service-role client.

## Tests performed

- `bunx tsgo --noEmit` — clean.
- `bun scripts/cie-check.ts` — all 11 personas PASS; scoring/ordering
  unchanged (scoring engine is untouched by this phase).
- DB state verified: `assessment_versions` has a `career-guidance` row (RPC
  no-version short-circuit will not fire).
- Signed-in browser E2E completed all 16 questions and captured the
  `saveMyCareerReport` request reaching the backend.
- Before the function fix, the response contained the exact ambiguous-column
  error and the atomic rollback left 0 reports / no orphan run.
- After the fix, the same signed-in flow created one new `assessment_runs` row
  and its matching `assessment_run_reports` row at the same transaction time.

## Remaining risks

- Local development still requires `SUPABASE_SERVICE_ROLE_KEY` in the
  developer's own `.env` to save reports. This is unchanged and expected.

## Recommendation on PR #2

Not safe to merge PR #2 as-is: it will hit the "Invalid server function ID"
error at runtime whenever the splitter emits report handlers, because
`report.functions.ts` mixes helpers with `createServerFn` declarations.

**Safe to merge only after cherry-picking the splitter fix**: add
`src/lib/career-intelligence-engine/report.server.ts` and remove the two
helpers from `report.functions.ts` (as done on this Lovable branch). With
that fix applied, PR #2 is safe to merge to `main`.
