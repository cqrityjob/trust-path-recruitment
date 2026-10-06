# Sentinel presentation review — 6 October 2026

## Delivery state

- At the start of this completion pass, GitHub main and local HEAD both matched `8c6876d7280c94d22b1b7e268ad14161b08033ab`. The owner reports Lovable API at the same SHA; no independent API version read was available. #442 remains an ancestor.
- Latest tested code commit: `ed63d80910ec95ce553d81431686077c8e3a0b27` (completion pass). Subsequent commit updates only this report and roadmap; final save SHA is reported in chat.
- Working branch: `edit/edt-79258370-eae5-40fe-8728-3a4560872cab`. `git ls-remote` does not advertise this branch. The previous layout is now verified on remote main; these new additions remain a platform-local save, NOT verified remote GitHub delivery. No PR created.
- Client/server environment hostname and config: `wrygicdfxwjnrugduxnt.supabase.co`; unchanged. No hosted writes, schema/RLS/migration changes or publication.

## Presentation changes

| Surface | Change | Verification |
| --- | --- | --- |
| Sentinel candidate view | Explicit time label; mobile timer below title; larger question buttons in stable grid; more visible save status; shared design-system buttons | Synthetic component browser, SV/EN, 1280/390px; keyboard answer and Next; no horizontal overflow |
| Completion | Larger status-specific icon; readable text width; clear return button; separate completed/timeout/stopped copy retained | Synthetic component browser for each status, SV/EN, 1280/390px |
| Sentinel candidate/employer report | Unframed report; clearer summary, metadata separators, single-column mobile details; wrapped sharing action | Synthetic component browser, SV/EN, 1280/390px; sharing permissions NOT exercised |
| Employer TestBank | Sentinel time/language/question details aligned with role-card metadata; grouping and pilot notes retained | Synthetic actual TestBank component, SV/EN desktop/mobile; assignment flow outstanding |
| Väktare/Säkerhetschef candidates and reports | No speculative restyling; shared progress announces answer count rather than question position | Synthetic shared candidate primitives and participant report with empty evidence, both role labels and locales; full assigned flows and populated role-specific reports outstanding |

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

## Approved-layout completion pass (18:44 UTC request)

- Normal: “Dina svar sparas automatiskt.” / “Your responses are saved automatically.”
- In flight: “Sparar…” / “Saving…”; failure: “Svar ej sparat” / “Response not saved”, with existing retry action and explanation. These follow existing pending/busy state; no save logic changed.
- Current question: thick border + underlined number. Answered: check. Unanswered: open circle. Visible legend and assistive descriptions; existing accessible button names retained for regressions.
- Progress: explicitly saved answers out of 20, semantic themed bar; shared role progress accessible value now follows answered count.
- Existing Sentinel browser text assertions updated to the new normal copy; no weakened state assertions.

### Fresh evidence

`/tmp/browser/test-layout/module-final-{sv,en}-{testbank,running,completed,report}-{1280,390}.png`

`/tmp/browser/test-layout/final-{sv,en}-{officer,manager}-{role-candidate,role-report}-{1280,390}.png`

`/tmp/browser/test-layout/final-{sv,en}-{saving,failed,saved}-{1280,390}.png`

These are SYNTHETIC COMPONENT images, not authenticated production-preview proof. Role candidates render the actual shared controls, not the full assigned route. Role reports exercise participant empty-evidence state; employer role report structure additionally passes the existing render guard. No populated Säkerhetschef report was read.

Fresh Python Playwright checks: both locales/widths, no horizontal overflow or page errors; keyboard radio selection; current/answered/unanswered and progress attributes; held save → failed save → retry display, navigation disabled while pending, re-enabled after simulated acknowledgement. Router/server calls are mocked, so real blockers, persistence, permissions and release are NOT verified.

Fresh guards: Sentinel state 27, generated items 21,600, language contract 40, panel render 44, recruitment UX 144, pilot truth 67, release 285, reliability 129; academy parity, recruitment report render, nullable RPC contract all passed. Changed-file ESLint passed.

Full app typecheck and standalone production build were NOT manually executed: this environment delegates them to the platform. Latest available automatic signal: `build OK` at 18:48:31 UTC; this is not represented as a separate production build/typecheck result. Both gates remain explicitly required in Astra CI.

### Astra: current-version gates (not #442's earlier green runs)

Use the final SHA from this delivery; confirm `git rev-parse HEAD` before recording results. Run in a separate disposable checkout, not the production-connected sandbox:

```bash
bunx tsgo --noEmit -p tsconfig.json
bunx tsgo --noEmit -p tsconfig.scripts.json
bun run build
bash scripts/sentinel-recovery-stack.sh
```

The recovery script sets loopback credentials, creates disposable `sentinel_e2e`, runs the real app and `e2e/sentinel-recovery.spec.ts` for Chromium + mobile-390, then cleans up. Here it exits before startup because Docker is absent; external unmanaged auth provides no isolated synthetic session. Do NOT substitute hosted credentials or run hosted migrations.

Full Sentinel assignment/report journey: run `e2e/sentinel.spec.ts` against the existing journey fixture (`127.0.0.1:3127`, gateway `127.0.0.1:59231`, `E2E_LOCAL_STACK=1`), including candidate/employer report sharing. This spec hardcodes the gateway; it must not be run against the recovery script's different ports.

Väktare/Säkerhetschef/TestBank: use `scripts/local-stack/test-env.sh` and its fresh/reseeded `beskt_e2e` fixture, following `scripts/local-stack/README.md` and `.github/workflows/e4-evidence.yml`. Run `e2e/test-bank-dispatch.spec.ts`, `e2e/test-interview-report-journey.spec.ts`, `e2e/employer-final-report-evidence.spec.ts` with `--project=chromium --project=mobile-390 --workers=1`. Supply the loopback variables documented at the top of each spec; reseed separately before non-idempotent journeys. Verify populated reports for both roles, candidate release access, denial cases, all completion statuses and saved-answer persistence. Record any unsupported role fixture rather than relabel a Väktare run as Säkerhetschef coverage.

No database/RPC/RLS/scoring changes, type regeneration, auth changes, archive/delete work, merge or publication. The nullable override and all client imports remain byte-identical to the approved base. Await owner publication approval.
