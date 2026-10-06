# Sentinel presentation review — 6 October 2026

## Delivery state — GitHub verified by Astra

- Remote `main` is verified at `0aeca505f8d8902cc405fbaf3c5d89b8d98b4fa2`. Lovable's `ee45ab5` is an ancestor and the layout changes are already delivered to GitHub main. No layout PR needs merging. The owner reports the same Lovable version; this pass independently verifies GitHub, not Lovable API state.
- Recovery PR [#442](https://github.com/cqrityjob/trust-path-recruitment/pull/442) is **merged**, merge commit `24b68b69356fb978773ca9a018f8f646e4a69bc6`. Its implementation and the nullable-RPC overlay are present in current main.
- Separate correction branch: `codex/test-module-final-verification`. One reproduced product defect: role progress used the whole test's answer count against a section's question count (Väktare showed `10 av 6` at the next section). The correction changes only the caller's section answer count; the shared QuestionCard and Lovable layout remain intact.
- Full assigned-role fixtures now use the actual `security-officer-recruitment` and `security-manager-recruitment` definitions, distinct synthetic applications/accounts, SV/EN, governed saving/review/release and populated report reads. No role is relabelled to manufacture coverage.
- No merge, publication, production writes, real candidate notifications, schema/RLS/scoring/content/timing changes, type regeneration or archival work. Production project remains `wrygicdfxwjnrugduxnt`.
- Correction PR and final commit/check status are recorded below after verification; the historical Lovable results that follow are **not** Astra's current-version test results.

## Lovable's historical delivery notes

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

## Lovable’s earlier evidence and tests

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

Layout delivery is now verified on main. Astra’s current-code verification and the separate correction PR are recorded below; earlier #442 runs are not reused as current-code evidence. Owner approval is still required before publication. Catalogue security observations remain open. Rollback: revert only the presentation commits through the existing reviewed GitHub workflow; no database rollback is needed.

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

## Astra’s authenticated isolated verification — current code

Baseline: `0aeca505f8d8902cc405fbaf3c5d89b8d98b4fa2`; a fresh remote-main check after desktop role verification still returned that SHA. These are **newly executed** checks, separate from the Lovable/component and earlier #442 evidence above.

- Frozen dependency install: passed. App and configured script typechecks passed using the repository-pinned `tsc` (`tsconfig.json`, `tsconfig.scripts.json`), and standalone production build passed. The document's `bunx tsgo` was unavailable in this checkout; no unpinned replacement compiler was installed.
- `scripts/sentinel-recovery-stack.sh`: **44/44** passed, Chromium desktop + 390px mobile, SV/EN; **27** session-state assertions passed. Practice and save recovery, active-answer blockers, all three server closure statuses, accepted-only timeout scoring, late replies, unconfirmed-submission retry, focus, persistent closure, `/academy`, reload/back are covered.
- Existing full Sentinel journey (`e2e/sentinel.spec.ts`): **1/1** passed on the documented original journey gateway/app, with actual local assignment, practice, 20 accepted responses, save retry, reload/deadline persistence, server-confirmed completion and employer-controlled candidate report sharing, both locales and its explicit mobile context.
- New actual assigned-role desktop journeys: **4/4** passed (officer/manager × SV/EN). Both candidate/employer report documents are populated from server-derived evidence after permitted human review/release. Before release no candidate report is returned. Other candidate and employer-audience refusals are checked, including own candidate denied the employer document. Keyboard return to `/academy` and report reload work.
- Shared-component callers audited: learning and training pass answers and total from the same item list; public Career Discovery uses its frozen 28-question buffer. The role caller alone mixed scopes. Shared accessible progress now has render checks for question position independent of answer count and an empty new section; candidate primitives retain layout and translations.
- Current deterministic checks: language **40**, panels **47**, reliability **129**, recruitment report render and regeneration-safe nullable RPC contract passed. Changed-file ESLint and new typed browser spec passed. The existing interview journey's submit selector was updated to the current product label `Lämna in testet`; product copy was preserved.

### Reproduction and isolation

The negative browser run on unmodified main failed with `aria-valuenow="10"`, `aria-valuemax="6"`, `aria-valuetext="10 av 6"`; after the caller correction it walks every section and asserts its own answer count, limits and SV/EN accessible text before and after every answer.

Reproduce new role/TestBank coverage with `bash scripts/role-assessment-browser-check.sh`. It uses `scripts/local-stack/test-env.sh`, replays migrations into disposable `beskt_e2e`, reseeds before each mutating suite/project, adds `scripts/fixtures/role-assessment-journey-fixture.sql`, and runs Chromium + mobile-390. Its JSON gate refuses skipped new role cases; the existing TestBank spec's one intentional mobile batch-mutation skip is explicitly counted. App/script checks use `bunx tsc --noEmit -p tsconfig.json`, `bunx tsc --noEmit -p tsconfig.scripts.json`; the new RPC-typed browser spec also has `tsconfig.assessment-e2e.json`.

Local stack: PostgreSQL 16; pinned PostgREST 14.15; real JWT, Postgres policies/RPCs and routed application, with the documented local GoTrue substitute. All API/app/database addresses are loopback. No external email provider. This proves authenticated synthetic local browser flows, **not hosted Auth, production preview or real email delivery**. Other parallel containers/worktrees were not archived or removed.

### Final GitHub status and remaining runs

Separate correction PR: [#443](https://github.com/cqrityjob/trust-path-recruitment/pull/443), open draft; source/test commit `bdb2f6a0c2c60a42c0f6643069b0837ed8cc8c04`. Mobile role journeys, TestBank, test→interview and canonical employer final-report matrix, final-commit build/typechecks and CI are in progress. No green status is inferred from pending or earlier runs.
