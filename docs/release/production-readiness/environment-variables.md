# Environment variables — authoritative inventory

Source of truth for every variable the application, its build, the edge function, the tests and the workflows read. Derived from `grep` of `process.env`, `import.meta.env`, `Deno.env` and workflow files on `main` `b7ed12f` (2026-09-28). **No values here; secrets never go in this file.** "Browser" = embedded in the public bundle at build time (only `VITE_*` are; a secret must never carry that prefix — none does today).

Columns: Dev = local `vite dev`; Stg = Hostinger staging; Prod = Hostinger production. R = required, O = optional, – = not used.

## SUPABASE

| Variable | Purpose | Dev | Stg | Prod | Where | Browser |
|---|---|---|---|---|---|---|
| `SUPABASE_URL` | server-side Supabase client URL (SSR/server functions) | R | R | R | host env | no |
| `SUPABASE_PUBLISHABLE_KEY` | anon/publishable key for the server-side caller-JWT client | R | R | R | host env | no (same value as the public one) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role client (`client.server.ts`), only in the few server paths that need it | R | R | R | host env **SECRET** | never |
| `VITE_SUPABASE_URL` | browser client URL | R | R | R | build env | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser anon key (public by design) | R | R | R | build env | yes |
| `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_ID` | present in `.env`; informational (tooling) | O | O | O | — | yes/no |

## AUTH
No application variable: Auth is configured in the Supabase dashboard (SMTP, Site URL, Redirect URLs, providers, HIBP). See `auth-and-email.md`.

## PUBLIC ORIGIN

| Variable | Purpose | Dev | Stg | Prod | Where | Browser |
|---|---|---|---|---|---|---|
| `PUBLIC_SITE_URL` | public https origin for links in mail and the receipts sweep; falls back to the hard-coded Lovable origin | O | R | R | host env | no |
| `VITE_PUBLIC_SITE_URL` | same origin for share links and QR codes built in the browser | O | R | R | build env | yes |
| `PUBLIC_SITE_URL` (edge function `passport-share`) | where gateway-form share links are redirected | – | R | R | Supabase function secret | no |
| `PASSPORT_SHARE_ENTRY_PUBLISHED` | `1` once `/p` answers on the public origin; otherwise the function answers 503 | – | R (after publish) | R (after publish) | Supabase function secret | no |

## EMAIL (Resend)

| Variable | Purpose | Dev | Stg | Prod | Where | Browser |
|---|---|---|---|---|---|---|
| `RESEND_API_KEY` | product mail transport | O | R | R | host env **SECRET** | never |
| `RESEND_FROM_EMAIL` | sender address on the verified domain | O | R | R | host env | no |
| `ADMIN_NOTIFICATION_EMAIL` | employer-registration notices | O | R | R | host env | no |

## RECRUITMENT

| Variable | Purpose | Dev | Stg | Prod | Where | Browser |
|---|---|---|---|---|---|---|
| `RECRUITMENT_SWEEP_TOKEN` | bearer for `POST /api/recruitment/receipts-sweep`; the route is closed without it | O | R | R | host env **SECRET**; the same value as the GitHub secret | never |
| `RECRUITMENT_SWEEP_URL`, `RECRUITMENT_SWEEP_TOKEN` (GitHub repository secrets) | the cron workflow's target and token | – | R | R | GitHub → Settings → Secrets | never |

## RELEASE-CONTROL FLAGS (public; not security boundaries)

| Variable | Purpose | Dev | Stg | Prod | Browser |
|---|---|---|---|---|---|
| `VITE_JOBS_ENABLED` | `"true"` renders the Jobs experience; otherwise "coming soon" | R | R | R | yes |
| `VITE_EMPLOYER_PORTAL_ENABLED` | `"true"` renders the employer portal | R | R | R | yes |
| `VITE_CIG_LIFECYCLE_ENFORCED` | mirror of `cig_governance_settings.lifecycle_enforced`; keep `"false"` unless the DB setting flips | R | R | R | yes |

## PASSPORT

| Variable | Purpose | Dev | Stg | Prod | Browser |
|---|---|---|---|---|---|
| `VITE_PASSPORT_LOCAL_INTEGRATION` | `"1"` only on a loopback stack; must be unset elsewhere | O | – | – | yes |

## AI (all unset until the owner activates; see `ai-readiness.md`)

| Variable | Purpose | Where |
|---|---|---|
| `INTERVIEW_AI_PROVIDER` | `anthropic` to enable the interview/recruitment/CV layer | host env |
| `INTERVIEW_AI_ENVIRONMENT` | `production` / lab | host env |
| `ANTHROPIC_API_KEY` | provider key | host env **SECRET** |
| `SW_AI_ENABLED`, `SW_AI_PROVIDER`, `SW_AI_MODEL`, `SW_AI_ENVIRONMENT`, `SW_ANTHROPIC_API_KEY` | Security Work AI | host env (+ worker) **SECRET** where a key |
| `SW_WORKER_KEY_ID`, `SW_WORKER_SECRET`, `SW_PROCESSOR_URL`, `SW_PROCESSOR_AUTH_TOKEN`, `SW_PROCESSOR_EXPECTED_ORIGIN`, `SW_PROCESSOR_DATA_PROCESSING_APPROVAL` | Security Work processor (separate service, `deploy/security-work-processor`) | worker env **SECRET** |

## OPTIONAL / TOOLING

| Variable | Purpose | Where |
|---|---|---|
| `CQRITYJOB_MCP_ENABLED`, `CQRITYJOB_MCP_TOKEN` | opens `/mcp` (deterministic career tools) behind a bearer; default closed | host env **SECRET** |
| `NITRO_PRESET` | `node-server` for Hostinger builds (Lovable defaults to Cloudflare) | build env |
| `PORT`, `HOST` | Node server listen address | host env |
| `E2E_BASE_URL`, `E2E_LOCAL_STACK`, `PW_CHROMIUM_PATH`, `EVIDENCE_CAPTURE_DIR` | Playwright/evidence runs | CI/local only |
| `LOCAL_*` (`LOCAL_DB_URL`, `LOCAL_JWT_SECRET`, …), `PGHOST`/`PGUSER`/`PGPASSWORD`/`TEST_DB` | local stack and `scripts/db-test.sh` | local/CI only; must never point at a managed host (the scripts refuse) |
| `SW_STATE`, `SW_LOG_DIR`, `SW_BROWSER_*`, `SW_APP_*`, `SW_DB_PORT`, `SW_REPO` | Security Work evidence scripts | local/CI only |

## DEPRECATED / STALE

| Item | Note |
|---|---|
| `SITE_ORIGIN` constant (`src/lib/job-intelligence/seo.ts`, `supabase/functions/passport-share/index.ts`) | hard-coded `https://trust-path-recruitment.lovable.app`; fallback only. Change to the production domain before launch (code). |
| `docs/release/auth-email-branding.md` project reference `zrah…` | stale; the project is `wrygicdfxwjnrugduxnt` |

## Checks
- **Browser exposure:** the only `VITE_*` values are the Supabase URL/anon key, the public origin, three release flags and the local-integration switch. No credential. Keep any new secret out of `VITE_*`.
- `.env` in the repository holds only the Supabase URL/anon key and flags (safe to commit as it is).
- The service-role key is imported lazily inside server handlers (`client.server.ts`) and never reaches a client bundle (`scripts/backend-target-lock-check.ts`, `auth-provider-target-check.ts` guard the target).
