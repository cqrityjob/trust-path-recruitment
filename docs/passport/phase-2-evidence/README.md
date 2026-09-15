# Phase 2 evidence

Tested implementation: `1d60f45906465c4f7aafd99896868167521b7159`.
Included main / PR #255: `5e37060a35415880935c8525bcfb32d2d0f38bc3`.

- `results.json`: final exact counts and gate outcome.
- `delivery-manifest.json`: preserved commits, phase changes and complete Passport file inventory.
- `browser-results.json` / `browser-failures.md`: every final matrix outcome and actionable failure locations.
- `live-api-results.json`: the 34 actual Auth, Storage and selective-disclosure assertions.
- `check-scripts.json` / `check-scripts-full.log.gz`: 150 named check-script outcomes and complete outputs.
- `lint-comparison.json`: original owner baseline versus final; `lint-vs-phase-1-delivery.json`: prior delivery versus final. Original full baseline and prior delivery logs remain in `../finalization-evidence/`.
- `post-apply-verification.sql` / `local-post-apply.log`: read-only catalogue, RLS, grant, private-bucket and synthetic row-count checks. These were run locally, not hosted.
- `log-index.json`: uncompressed log hashes. Logs are gzip-compressed for size; `gzip -cd FILE.log.gz` reads them.
- `main-baseline-browser.log.gz`: three narrow desktop career-home checks against exact PR #255 main, reproducing the height and unlabelled-section failures. This is diagnostic evidence, not additional combined-head passes.

`live-beskt-preparation.log.gz` comes from a command that also attempted employer tests before their required exclusion environment variable was configured. Count only its eight BESKT passes. `live-employer-report.log.gz` is the final configured employer run: four passes, two failures. Earlier partial or interrupted diagnostic browser runs are not aggregated into final totals.

## Reproducing real Passport tests

The repository has local replay and synthetic fixture scripts. Its generic stack startup can rewrite `.env.local`; **do not use that behavior for this owner-approved environment**. This run used a separate local project, `cqrityjob-passport-phase2`, with API `http://127.0.0.1:55421` and PostgreSQL `127.0.0.1:55422`. Leave the existing 54321 stack and `.env.local` unchanged.

1. Use temporary Supabase CLI 2.117.0 in the isolated project's working directory. Do not link it to production. Start Auth, Storage, API gateway, PostgreSQL and the Passport Edge function; Studio/analytics/Realtime are optional for these tests.
2. Match the repository harness’s explicit-function-grant baseline on the disposable database: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated, service_role;`. Then apply all canonical migrations using `scripts/local-staging-apply.sh` with `DB_URL` explicitly bound to the disposable database. The full SQL runner separately supplies its Auth/bootstrap schema; do not substitute that bootstrap for real GoTrue.
3. Seed the existing local-only `scripts/fixtures/interview-journey-fixture.sql`, which supplies the employer tenant used by the API harness. Preserve SQL error stops; never bypass a fixture's guard.
4. Write the isolated CLI's `status -o env` output to `/private/tmp/passport-phase2-status.env` with mode 0600. Never commit or print it. The API harness refuses a different API/DB host or port. `PASSPORT_LOCAL_ENV_FILE` can select the status file; the browser spec intentionally reads the fixed Phase 2 file location.
5. Run `scripts/passport-live-local-check.mjs` with `psql` available in PATH. It creates disposable real identities and stores its session/state files privately under `/private/tmp`. Only its assertion result file is included here.
6. Start the application with process-only Supabase URL/key overrides from that local status file. Enable `VITE_PASSPORT_LOCAL_INTEGRATION=1` for the real Passport app, and serve it at local port 3118. This development-only flag permits loopback gateway links; production builds cannot take that branch.
7. Serve a local HTTPS proxy at `https://127.0.0.1:3120` to the app and set the local Edge function's `PUBLIC_SITE_URL` to that HTTPS origin. The test accepts the ephemeral self-signed certificate; this setup exercises secure-cookie handoff without a hosted domain.
8. Run `PASSPORT_LIVE_LOCAL=1 E2E_BASE_URL=https://127.0.0.1:3120 E2E_SUPABASE_REF=127 node node_modules/.bin/playwright test e2e/passport-live-local.spec.ts --workers=1`. Sequential projects are required because the real fixture owner is shared. The test explicitly rejects external requests and substitutes no responses.
9. Stop only the named task stack and task-owned app/proxy processes. Do not use `supabase stop --all`, broad Docker cleanup, or production deletion. Private local state files and Docker volumes are not public evidence.

The fixture-based complete matrix used a separate local app on port 3119 with `E2E_SUPABASE_REF=127`, six workers and all three configured projects. Live opt-in specs skip in that command and are reported separately. Mutation-based negative controls ran in an isolated clean checkout of the tested head, so they could not change the source served to browser tests.
