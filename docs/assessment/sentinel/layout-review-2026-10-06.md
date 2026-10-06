# Sentinel presentation review — 6 October 2026

## Delivery state

- GitHub main observed before and after: `24b68b69356fb978773ca9a018f8f646e4a69bc6` (#442); verified as ancestor of the working version.
- Tested presentation commit: `ecef14d4f861fe2b01771ffcda35aa558cbab48d`.
- Working branch: `edit/edt-3b058eed-3c3b-46a9-b3fc-b7a24174aea6`. `git ls-remote` does not advertise this branch. This is a platform-local save, NOT verified remote GitHub delivery; no PR created.
- Client/server environment hostname and config: `wrygicdfxwjnrugduxnt.supabase.co`; unchanged. No hosted writes, schema/RLS/migration changes or publication.

## Presentation changes

| Surface | Change | Verification |
| --- | --- | --- |
| Sentinel candidate view | Explicit time label; mobile timer below title; larger question buttons in stable grid; more visible save status; shared design-system buttons | Synthetic component browser, SV/EN, 1280/390px; keyboard answer and Next; no horizontal overflow |
| Completion | Larger status-specific icon; readable text width; clear return button; separate completed/timeout/stopped copy retained | Synthetic component browser for each status, SV/EN, 1280/390px |
| Sentinel candidate/employer report | Unframed report; clearer summary, metadata separators, single-column mobile details; wrapped sharing action | Synthetic component browser, SV/EN, 1280/390px; sharing permissions NOT exercised |
| Employer TestBank | No changes to delivered grouping/cards | Source inspection only; authenticated browser verification outstanding |
| Other assessment reports | No changes | Authenticated review outstanding; not declared verified |

## Evidence and tests

- Temporary fixture uses actual presentation components with synthetic data and mocked server calls/router. It is NOT a logged-in test, does NOT verify navigation blockers or persistence and does NOT expose private test content.
- Screenshots: `/tmp/browser/test-layout/{before,after}-{sv,en}-{info,practice,running,completed,timed_out,abandoned,report,employer-report}-{1280,390}.png`. Same asset copies and fixture used for final before/after pairs.
- `bun run scripts/sentinel-session-state-check.ts`: 27 assertions passed.
- `bun run scripts/sentinel-check.ts`: 21,600 generated-item checks passed.
- `bun run scripts/assessment-language-contract-check.tsx`: 40 assertions passed.
- `bun run scripts/assessment-panels-render-check.tsx`: 44 checks passed.
- `bun run scripts/nullable-rpc-contract-check.ts`: passed including current and regenerated argument checks; Astra's overlay and client imports unchanged.
- `bunx eslint src/components/sentinel/Runner.tsx src/components/sentinel/Report.tsx`: passed after formatting.
- Automatic preview build log: `build OK` at 18:37:56 UTC. No manual full production build or full app typecheck was run.
- Real preview smoke: home and `/academy` opened with no page errors; this does not prove a suitable synthetic session or a completed assigned assessment.
- `bash scripts/sentinel-recovery-stack.sh`: exits before startup because Docker is unavailable. `e2e/sentinel-recovery.spec.ts`, `e2e/sentinel.spec.ts`, and TestBank dispatch flows were NOT executed. No hosted environment was substituted.

## Frozen safeguards and outstanding gates

Runner session application, retries, state acceptance, navigation guards, scoring, answers, timing and server functions were not edited. Existing generated `types.ts` drift already in base `69d8c22f` differs from main in exactly `_agreed_statement`, `_divergent_statement`, `_draft_run_id` (bare string vs main's string|null); no generated types were edited here, and `database.ts` preserves the required null contract.

Astra must verify remote branch delivery, full CI and the disposable authenticated browser regressions before merge. Owner approval is still required before publication. Catalogue security observations remain open. Rollback: revert only the presentation commits through the existing reviewed GitHub workflow; no database rollback is needed.
